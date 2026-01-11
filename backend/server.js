import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { scrapeGoogleFlights } from './scrapers/flightScraper.js';
import Groq from 'groq-sdk';
import { 
  getAmtrakFare, 
  getStations, 
  getStationByCode,
  getAvailableRoutes,
  getGroupedTrainResults,
  ensureIndexes,
  getCacheStats
} from './services/amtrakService.js';
import { 
  buildConnections, 
  findPotentialHubs, 
  getMajorHubCodes,
  getHubsInCorridor,
  DEFAULT_CORRIDOR_WIDTH_MILES,
  MAJOR_HUB_AIRPORTS
} from './services/connectionService.js';
import {
  getCachedConnections,
  cacheConnections,
  initializeCacheIndexes,
  getCacheStats as getConnectionCacheStats
} from './services/connectionCache.js';
import {
  getDatabase,
  queryFlights,
  batchQueryFlights,
  initializeIndexes as initializeDbIndexes,
  closeDatabase,
  isDatabaseHealthy
} from './services/database.js';

dotenv.config();

// Get the directory of the current module
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load commercial airports from file
let COMMERCIAL_AIRPORTS = [];
try {
  const airportsFilePath = join(__dirname, 'commericalAirports.txt');
  const airportsContent = readFileSync(airportsFilePath, 'utf-8');
  COMMERCIAL_AIRPORTS = airportsContent
    .split('\n')
    .map(code => code.trim())
    .filter(code => code.length > 0 && code.length <= 4);
  console.log(`✅ Loaded ${COMMERCIAL_AIRPORTS.length} commercial airports`);
} catch (error) {
  console.error('⚠️ Could not load commercial airports file:', error.message);
  // Fallback to major hub airports
  COMMERCIAL_AIRPORTS = MAJOR_HUB_AIRPORTS.map(a => a.code);
}

/**
 * Check if an airport code is a valid commercial airport
 * @param {string} code - Airport code to check
 * @returns {boolean} True if valid commercial airport
 */
function isValidAirport(code) {
  if (!code) return false;
  return COMMERCIAL_AIRPORTS.includes(code.toUpperCase().trim());
}

/**
 * Check if a location code is ONLY an Amtrak station (not an airport)
 * This helps skip unnecessary flight searches for pure train stations
 * @param {string} code - Location code to check
 * @returns {Promise<boolean>} True if it's only a station (not an airport)
 */
async function isOnlyAmtrakStation(code) {
  if (!code) return false;
  const normalizedCode = code.toUpperCase().trim();
  
  // If it's a commercial airport, it's not "only" a station
  if (isValidAirport(normalizedCode)) {
    return false;
  }
  
  // Check if it's an Amtrak station
  try {
    const station = await getStationByCode(normalizedCode);
    return station !== null;
  } catch (error) {
    // If we can't check, assume it might be an airport (safer to try scraping)
    return false;
  }
}

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

// CORS configuration - allow requests from your Netlify frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL, // Set this in Railway to your Netlify URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

/**
 * =====================================================
 * DATABASE CHECK (OPTIMIZED with connection pool)
 * =====================================================
 * Checks for cached flight data using the global connection pool.
 * No more creating new connections for each request!
 * Also checks for "no flights found" entries to skip scraping.
 */
async function checkDatabase(searchParams) {
  const {from, to, departDate, returnDate, tripType} = searchParams;
  
  console.log('📊 [DATABASE] Checking for cached results...');
  console.log(`   Route: ${from} → ${to}`);
  console.log(`   Date: ${departDate}${returnDate ? ` - ${returnDate}` : ''}`);
  console.log(`   Trip Type: ${tripType || 'oneway'}`);
  
  try {
    const type = tripType === 'roundtrip' ? 'roundtrip' : 'oneway';
    
    // First, check for actual flight results
    const cachedResults = await queryFlights(from, to, type, departDate, returnDate);
    
    if (cachedResults && cachedResults.length > 0) {
      // Filter out any "no flights found" entries (shouldn't happen, but just in case)
      const actualFlights = cachedResults.filter(f => !f.noFlightsFound);
      if (actualFlights.length > 0) {
        console.log(`✅ [DATABASE] Found ${actualFlights.length} cached ${tripType} results`);
        return actualFlights;
      }
    }

    // Check for "no flights found" entries
    const { db } = await getDatabase();
    const collection = db.collection('PlaneData');
    
    const noFlightsQuery = {
      'departure.location': { $regex: new RegExp(`^${from}$`, 'i') },
      'arrival.location': { $regex: new RegExp(`^${to}$`, 'i') },
      type: type,
      noFlightsFound: true
    };
    
    if (departDate) {
      noFlightsQuery.departDate = departDate;
    }
    
    if (type === 'roundtrip' && returnDate) {
      noFlightsQuery.returnDate = returnDate;
    }
    
    const noFlightsEntry = await collection.findOne(noFlightsQuery);
    
    if (noFlightsEntry) {
      console.log(`🚫 [DATABASE] Found "no flights found" entry for this route - skipping scraper`);
      console.log(`   Reason: ${noFlightsEntry.reason || 'unknown'}`);
      // Return empty array to indicate no flights, but don't trigger scraper
      return [];
    }

    console.log(`❌ [DATABASE] No cached ${tripType} results found, will use scraper`);
    return null;

  } catch(error) {
    console.error('❌ Database check error:', error);
    return null;
  }
}

/**
 * Fetch hub flights for connections (OPTIMIZED)
 * 
 * OPTIMIZATIONS:
 * - Uses global connection pool instead of new connections
 * - Single batch query for all routes instead of sequential queries
 * - Only scrapes missing routes if needed
 * 
 * @param {string} from - Origin airport code
 * @param {string} to - Destination airport code
 * @param {string} departDate - Departure date
 * @param {number} corridorWidthMiles - Width of corridor for flight-flight (default 200)
 */
async function fetchHubFlights(from, to, departDate, corridorWidthMiles = DEFAULT_CORRIDOR_WIDTH_MILES) {
  console.log('\n🔗 [HUBS] Fetching flight data for connection hubs...');
  const startTime = Date.now();
  
  try {
    // Get relevant hubs for this route (uses pre-computed indexes)
    const hubs = await findPotentialHubs(from, to, false, corridorWidthMiles);
    
    const amtrakHubsTo = hubs.flightToAmtrak?.hubs || [];
    const amtrakHubsFrom = hubs.amtrakToFlight?.hubs || [];
    const flightHubsInCorridor = hubs.flightToFlight?.hubs || [];
    
    console.log(`   Amtrak hubs (to dest): ${amtrakHubsTo.join(', ') || 'none'}`);
    console.log(`   Amtrak hubs (from origin): ${amtrakHubsFrom.join(', ') || 'none'}`);
    console.log(`   Flight hubs in corridor: ${flightHubsInCorridor.join(', ') || 'none'}`);
    
    // Build list of routes we need
    const routesToCheck = [];
    
    // Routes for Flight → Amtrak connections
    // Only add if hub is an airport (not only a station)
    for (const hub of amtrakHubsTo) {
      if (hub.toUpperCase() !== from.toUpperCase()) {
        const hubIsOnlyStation = await isOnlyAmtrakStation(hub);
        if (!hubIsOnlyStation) {
          routesToCheck.push({ from, to: hub });
        }
      }
    }
    
    // Routes for Amtrak → Flight connections
    // Only add if destination is an airport (not only a station)
    const toIsOnlyStation = await isOnlyAmtrakStation(to);
    if (!toIsOnlyStation) {
      for (const hub of amtrakHubsFrom) {
        if (hub.toUpperCase() !== to.toUpperCase()) {
          routesToCheck.push({ from: hub, to });
        }
      }
    }
    
    // Routes for Flight → Flight connections
    // Only add routes where both endpoints are airports
    const fromIsOnlyStation = await isOnlyAmtrakStation(from);
    if (!fromIsOnlyStation && !toIsOnlyStation) {
      for (const hub of flightHubsInCorridor) {
        const hubIsOnlyStation = await isOnlyAmtrakStation(hub);
        if (!hubIsOnlyStation) {
          routesToCheck.push({ from, to: hub });
          routesToCheck.push({ from: hub, to });
        }
      }
    }
    
    if (routesToCheck.length === 0) {
      console.log(`   ℹ️ No hub routes to check`);
      return [];
    }
    
    // OPTIMIZED: Single batch query for all routes at once!
    console.log(`   ⚡ Batch querying ${routesToCheck.length} hub routes...`);
    const allHubFlights = await batchQueryFlights(routesToCheck, 'oneway');
    
    // Find which routes are missing (no results in DB)
    const routesWithFlights = new Set();
    for (const flight of allHubFlights) {
      const depLoc = flight.departure?.location?.toUpperCase();
      const arrLoc = flight.arrival?.location?.toUpperCase();
      if (depLoc && arrLoc && !flight.noFlightsFound) {
        routesWithFlights.add(`${depLoc}-${arrLoc}`);
      }
    }
    
    // Also check for "no flights found" entries to skip those routes
    const { db } = await getDatabase();
    const collection = db.collection('PlaneData');
    const routesWithNoFlights = new Set();
    
    for (const route of routesToCheck) {
      const key = `${route.from.toUpperCase()}-${route.to.toUpperCase()}`;
      if (!routesWithFlights.has(key)) {
        // Check if there's a "no flights found" entry for this route
        const noFlightsQuery = {
          'departure.location': { $regex: new RegExp(`^${route.from}$`, 'i') },
          'arrival.location': { $regex: new RegExp(`^${route.to}$`, 'i') },
          type: 'oneway',
          noFlightsFound: true
        };
        
        if (departDate) {
          noFlightsQuery.departDate = departDate;
        }
        
        const noFlightsEntry = await collection.findOne(noFlightsQuery);
        if (noFlightsEntry) {
          routesWithNoFlights.add(key);
          console.log(`   🚫 Route ${route.from}→${route.to} has "no flights found" entry - skipping`);
        }
      }
    }
    
    const routesToScrape = routesToCheck.filter(route => {
      const key = `${route.from.toUpperCase()}-${route.to.toUpperCase()}`;
      return !routesWithFlights.has(key) && !routesWithNoFlights.has(key);
    });
    
    // Scrape missing routes (limit to avoid timeout)
    const MAX_SCRAPES = 2; // Reduced since batch query is faster
    const scrapesToRun = routesToScrape.slice(0, MAX_SCRAPES);
    
    if (scrapesToRun.length > 0) {
      console.log(`   🌐 Scraping ${scrapesToRun.length} missing routes...`);
      
      for (const route of scrapesToRun) {
        try {
          const scrapedFlights = await scrapeGoogleFlights(route.from, route.to, departDate, null);
          if (scrapedFlights && scrapedFlights.length > 0) {
            console.log(`   ✅ Scraped ${route.from}→${route.to}: ${scrapedFlights.length} flights`);
            allHubFlights.push(...scrapedFlights);
          } else {
            console.log(`   ℹ️ No flights found for ${route.from}→${route.to} (entry saved to DB)`);
          }
        } catch (scrapeError) {
          console.error(`   ❌ Scrape failed ${route.from}→${route.to}: ${scrapeError.message}`);
        }
      }
    }
    
    // Deduplicate by _id
    const uniqueFlights = [];
    const seenIds = new Set();
    for (const flight of allHubFlights) {
      const id = flight._id?.toString() || JSON.stringify(flight);
      if (!seenIds.has(id)) {
        seenIds.add(id);
        uniqueFlights.push(flight);
      }
    }
    
    const elapsed = Date.now() - startTime;
    console.log(`   📊 Hub flights: ${uniqueFlights.length} in ${elapsed}ms`);
    return uniqueFlights;
    
  } catch (error) {
    console.error('❌ [HUBS] Error fetching hub flights:', error.message);
    return [];
  }
}

/**
 * Helper function to format minutes to readable duration string
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "2 hr 30 min")
 */
function formatDuration(minutes) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

/**
 * Convert minutes since midnight to time string (e.g., 413 -> "06:53 AM")
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string in format "HH:MM AM/PM"
 */
function minutesToTimeString(minutes) {
  if (minutes === null || minutes === undefined) return null;
  
  let totalMinutes = minutes % (24 * 60); // Handle overflow
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  let displayHours = hours;
  let period = 'AM';
  
  if (hours === 0) {
    displayHours = 12;
  } else if (hours === 12) {
    period = 'PM';
  } else if (hours > 12) {
    displayHours = hours - 12;
    period = 'PM';
  }
  
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format train results to match flight result structure
 * @param {Array} trainResults - Array of grouped train results
 * @param {string} from - Origin city name
 * @param {string} to - Destination city name
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date (if roundtrip)
 * @returns {Array} Formatted train results
 */
function formatTrainResults(trainResults, from, to, departDate, returnDate) {
  return trainResults.map(train => {
    const stopsText = train.transfers === 0 ? 'Nonstop' : `${train.transfers} transfer${train.transfers > 1 ? 's' : ''}`;
    const priceFormatted = `$${train.priceUSD.toFixed(2)}`;
    
    // Calculate arrival time from departure time and duration
    let departureTime = train.departureTime || null;
    let arrivalTime = null;
    
    if (train.departureTimeMinutes !== null && train.departureTimeMinutes !== undefined && train.durationMin) {
      const arrivalMinutes = train.departureTimeMinutes + train.durationMin;
      arrivalTime = minutesToTimeString(arrivalMinutes);
    }
    
    return {
      type: returnDate ? 'roundtrip' : 'oneway',
      departure: {
        location: from,
        time: departureTime
      },
      arrival: {
        location: to,
        time: arrivalTime
      },
      duration: formatDuration(train.durationMin),
      departDate: departDate,
      returnDate: returnDate || null,
      durationMinutes: train.durationMin,
      price: train.priceUSD,
      priceFormatted: priceFormatted,
      currency: 'USD',
      provider: 'Amtrak',
      stops: stopsText,
      bags: null,
      source: 'Amtrak',
      rawSummary: `Amtrak train from ${train.origin} to ${train.dest}, ${stopsText}, average price: ${priceFormatted}`,
      // Additional train-specific fields
      trainData: {
        origin: train.origin,
        dest: train.dest,
        transfers: train.transfers,
        sampleCount: train.sampleCount,
        priceRange: {
          min: train.minPriceUSD,
          max: train.maxPriceUSD
        }
      }
    };
  });
}

/**
 * Build mixed roundtrip itineraries combining one-way options
 * Creates combinations like: Amtrak outbound + Flight return, Flight outbound + Amtrak return
 * 
 * Only includes mixed options that are BETTER than alternatives:
 * - Better outbound duration (less time to destination), OR
 * - Better total price (cheaper overall)
 * 
 * @param {Array} outboundFlights - One-way flights from origin to destination
 * @param {Array} returnFlights - One-way flights from destination to origin
 * @param {Array} outboundTrains - One-way Amtrak from origin to destination
 * @param {Array} returnTrains - One-way Amtrak from destination to origin
 * @param {Array} roundtripFlights - Roundtrip flight options for price comparison
 * @param {string} from - Origin location
 * @param {string} to - Destination location
 * @param {string} departDate - Departure date
 * @param {string} returnDate - Return date
 * @returns {Array} Array of filtered mixed roundtrip itineraries
 */
function buildMixedRoundtripOptions(outboundFlights, returnFlights, outboundTrains, returnTrains, roundtripFlights, from, to, departDate, returnDate) {
  const mixedOptions = [];
  
  console.log('\n🔀 [MIXED ROUNDTRIP] Building mixed roundtrip options...');
  console.log(`   Outbound flights: ${outboundFlights?.length || 0}`);
  console.log(`   Return flights: ${returnFlights?.length || 0}`);
  console.log(`   Outbound trains: ${outboundTrains?.length || 0}`);
  console.log(`   Return trains: ${returnTrains?.length || 0}`);
  console.log(`   Roundtrip flights (for comparison): ${roundtripFlights?.length || 0}`);
  
  // Get benchmark values from roundtrip flights for comparison
  const cheapestRoundtripPrice = roundtripFlights && roundtripFlights.length > 0
    ? Math.min(...roundtripFlights.map(f => f.price || Infinity))
    : Infinity;
  
  // Get fastest outbound flight duration for comparison
  const fastestOutboundFlightDuration = outboundFlights && outboundFlights.length > 0
    ? Math.min(...outboundFlights.map(f => f.durationMinutes || Infinity))
    : Infinity;
  
  console.log(`   Benchmark: Cheapest roundtrip = $${cheapestRoundtripPrice}, Fastest outbound flight = ${fastestOutboundFlightDuration} min`);
  
  // Option 1: Amtrak outbound + Flight return
  if (outboundTrains && outboundTrains.length > 0 && returnFlights && returnFlights.length > 0) {
    console.log('   Building: Amtrak outbound + Flight return combinations');
    
    // Use top 3 trains and top 3 flights to avoid explosion of combinations
    const topOutboundTrains = outboundTrains.slice(0, 3);
    const topReturnFlights = returnFlights.slice(0, 3);
    
    for (const train of topOutboundTrains) {
      for (const flight of topReturnFlights) {
        const totalPrice = (train.price || 0) + (flight.price || 0);
        const totalDuration = (train.durationMinutes || 0) + (flight.durationMinutes || 0);
        const outboundDuration = train.durationMinutes || Infinity;
        
        // Only include if cheaper than roundtrip flights OR faster outbound than flights
        const isCheaper = totalPrice < cheapestRoundtripPrice;
        const isFasterOutbound = outboundDuration < fastestOutboundFlightDuration;
        
        if (isCheaper || isFasterOutbound) {
          mixedOptions.push({
            type: 'mixed-roundtrip',
            mixedType: 'amtrak-outbound-flight-return',
            outbound: {
              legType: 'train',
              departure: train.departure,
              arrival: train.arrival,
              duration: train.duration,
              durationMinutes: train.durationMinutes,
              price: train.price,
              priceFormatted: train.priceFormatted,
              provider: train.provider || 'Amtrak',
              stops: train.stops,
              date: departDate,
              source: 'Amtrak',
              fullUrl: null // Amtrak doesn't have direct booking URLs
            },
            return: {
              legType: 'flight',
              departure: flight.departure,
              arrival: flight.arrival,
              duration: flight.duration,
              durationMinutes: flight.durationMinutes,
              price: flight.price,
              priceFormatted: flight.priceFormatted,
              provider: flight.provider,
              stops: flight.stops,
              date: returnDate,
              source: 'Google Flights',
              fullUrl: flight.fullUrl || null
            },
            departure: {
              location: from,
              time: train.departure?.time
            },
            arrival: {
              location: to,
              time: train.arrival?.time
            },
            departDate: departDate,
            returnDate: returnDate,
            duration: `${formatDuration(totalDuration)} total`,
            durationMinutes: totalDuration,
            outboundDurationMinutes: outboundDuration,
            price: totalPrice,
            priceFormatted: `$${totalPrice.toFixed(2)}`,
            currency: 'USD',
            source: 'Mixed Roundtrip',
            provider: `${train.provider || 'Amtrak'} + ${flight.provider || 'Flight'}`,
            stops: `Amtrak outbound, Flight return`,
            bags: flight.bags,
            isCheaper: isCheaper,
            isFasterOutbound: isFasterOutbound
          });
        }
      }
    }
  }
  
  // Option 2: Flight outbound + Amtrak return
  if (outboundFlights && outboundFlights.length > 0 && returnTrains && returnTrains.length > 0) {
    console.log('   Building: Flight outbound + Amtrak return combinations');
    
    // Use top 3 flights and top 3 trains to avoid explosion of combinations
    const topOutboundFlights = outboundFlights.slice(0, 3);
    const topReturnTrains = returnTrains.slice(0, 3);
    
    for (const flight of topOutboundFlights) {
      for (const train of topReturnTrains) {
        const totalPrice = (flight.price || 0) + (train.price || 0);
        const totalDuration = (flight.durationMinutes || 0) + (train.durationMinutes || 0);
        const outboundDuration = flight.durationMinutes || Infinity;
        
        // Only include if cheaper than roundtrip flights OR faster outbound than other options
        // For flight outbound, compare against other outbound options (trains)
        const fastestOutboundTrainDuration = outboundTrains && outboundTrains.length > 0
          ? Math.min(...outboundTrains.map(t => t.durationMinutes || Infinity))
          : Infinity;
        
        const isCheaper = totalPrice < cheapestRoundtripPrice;
        const isFasterOutbound = outboundDuration < fastestOutboundTrainDuration;
        
        if (isCheaper || isFasterOutbound) {
          mixedOptions.push({
            type: 'mixed-roundtrip',
            mixedType: 'flight-outbound-amtrak-return',
            outbound: {
              legType: 'flight',
              departure: flight.departure,
              arrival: flight.arrival,
              duration: flight.duration,
              durationMinutes: flight.durationMinutes,
              price: flight.price,
              priceFormatted: flight.priceFormatted,
              provider: flight.provider,
              stops: flight.stops,
              date: departDate,
              source: 'Google Flights',
              fullUrl: flight.fullUrl || null
            },
            return: {
              legType: 'train',
              departure: train.departure,
              arrival: train.arrival,
              duration: train.duration,
              durationMinutes: train.durationMinutes,
              price: train.price,
              priceFormatted: train.priceFormatted,
              provider: train.provider || 'Amtrak',
              stops: train.stops,
              date: returnDate,
              source: 'Amtrak',
              fullUrl: null // Amtrak doesn't have direct booking URLs
            },
            departure: {
              location: from,
              time: flight.departure?.time
            },
            arrival: {
              location: to,
              time: flight.arrival?.time
            },
            departDate: departDate,
            returnDate: returnDate,
            duration: `${formatDuration(totalDuration)} total`,
            durationMinutes: totalDuration,
            outboundDurationMinutes: outboundDuration,
            price: totalPrice,
            priceFormatted: `$${totalPrice.toFixed(2)}`,
            currency: 'USD',
            source: 'Mixed Roundtrip',
            provider: `${flight.provider || 'Flight'} + ${train.provider || 'Amtrak'}`,
            stops: `Flight outbound, Amtrak return`,
            bags: flight.bags,
            isCheaper: isCheaper,
            isFasterOutbound: isFasterOutbound
          });
        }
      }
    }
  }
  
  console.log(`   ✅ Built ${mixedOptions.length} mixed roundtrip options (filtered for better price/duration)`);
  
  // Sort by price
  mixedOptions.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  
  return mixedOptions;
}

/**
 * Search API endpoint
 * POST /api/search
 * 
 * For ONE-WAY trips:
 *   - Gets direct flights and trains
 *   - Builds multi-modal connections (flight+amtrak, amtrak+flight, flight+flight via hub)
 * 
 * For ROUNDTRIP trips:
 *   - Gets roundtrip flights from Google Flights
 *   - Builds mixed roundtrip options:
 *     - Amtrak outbound + Flight return
 *     - Flight outbound + Amtrak return
 *   - Does NOT build connections (too much data complexity for roundtrip)
 */
app.post('/api/search', async (req, res) => {
  try {
    const { from, to, departDate, returnDate, tripType, sortBy } = req.body;
    
    console.log('\n' + '='.repeat(50));
    console.log('🔍 New Search Request');
    console.log('='.repeat(50));
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Departure: ${departDate}`);
    console.log(`Trip Type: ${tripType}`);
    if (returnDate) console.log(`Return: ${returnDate}`);
    console.log(`Sort By: ${sortBy}`);
    console.log('='.repeat(50) + '\n');

    // Validate required fields
    if (!from || !to || !departDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['from', 'to', 'departDate']
      });
    }

    // Validate roundtrip has return date
    if (tripType === 'roundtrip' && !returnDate) {
      return res.status(400).json({
        error: 'Return date required for roundtrip',
        required: ['returnDate']
      });
    }

    const isRoundtrip = tripType === 'roundtrip' && returnDate;
    
    // =====================================================
    // ROUNDTRIP SEARCH LOGIC
    // =====================================================
    if (isRoundtrip) {
      console.log('\n🔄 [ROUNDTRIP] Processing roundtrip search...');
      console.log('   Note: Connections are skipped for roundtrip (too much data)');
      
      const allResults = [];
      
      // Check if locations are only stations (reused throughout roundtrip logic)
      const toIsOnlyStation = await isOnlyAmtrakStation(to);
      const fromIsOnlyStation = await isOnlyAmtrakStation(from);
      
      // Step 1: Get roundtrip flights from Google Flights
      console.log('\n✈️ [ROUNDTRIP FLIGHTS] Fetching roundtrip flights...');
      
      let roundtripFlights = null;
      if (toIsOnlyStation || fromIsOnlyStation) {
        console.log(`🚂 [SKIP FLIGHTS] ${toIsOnlyStation ? 'Destination' : 'Origin'} is only an Amtrak station - skipping roundtrip flight search`);
        roundtripFlights = [];
      } else {
        roundtripFlights = await checkDatabase({ from, to, departDate, returnDate, tripType: 'roundtrip' });
        
        if (!roundtripFlights) {
          console.log('🌐 [SCRAPER] Scraping roundtrip flights...');
          roundtripFlights = await scrapeGoogleFlights(from, to, departDate, returnDate);
        }
      }
      
      if (roundtripFlights && roundtripFlights.length > 0) {
        console.log(`✅ Found ${roundtripFlights.length} roundtrip flight options`);
        allResults.push(...roundtripFlights);
      }
      
      // Step 2: Get one-way Amtrak options (outbound: from→to)
      console.log('\n🚂 [AMTRAK OUTBOUND] Fetching Amtrak from→to...');
      let outboundTrains = [];
      try {
        const rawOutboundTrains = await getGroupedTrainResults(from, to, 5);
        if (rawOutboundTrains && rawOutboundTrains.length > 0) {
          outboundTrains = formatTrainResults(rawOutboundTrains, from, to, departDate, null);
          console.log(`✅ Found ${outboundTrains.length} outbound Amtrak options`);
        }
      } catch (error) {
        console.error('⚠️ Error fetching outbound trains:', error.message);
      }
      
      // Step 3: Get one-way Amtrak options (return: to→from)
      console.log('\n🚂 [AMTRAK RETURN] Fetching Amtrak to→from...');
      let returnTrains = [];
      try {
        const rawReturnTrains = await getGroupedTrainResults(to, from, 5);
        if (rawReturnTrains && rawReturnTrains.length > 0) {
          returnTrains = formatTrainResults(rawReturnTrains, to, from, returnDate, null);
          console.log(`✅ Found ${returnTrains.length} return Amtrak options`);
        }
      } catch (error) {
        console.error('⚠️ Error fetching return trains:', error.message);
      }
      
      // Step 4: Get one-way flights for outbound (from→to) if not already included
      console.log('\n✈️ [OUTBOUND FLIGHTS] Checking for one-way outbound flights...');
      
      let outboundFlights = null;
      if (toIsOnlyStation || fromIsOnlyStation) {
        console.log(`🚂 [SKIP FLIGHTS] ${toIsOnlyStation ? 'Destination' : 'Origin'} is only an Amtrak station - skipping outbound flight search`);
        outboundFlights = [];
      } else {
        outboundFlights = await checkDatabase({ from, to, departDate, returnDate: null, tripType: 'oneway' });
        
        if (!outboundFlights) {
          console.log('🌐 [SCRAPER] Scraping one-way outbound flights...');
          outboundFlights = await scrapeGoogleFlights(from, to, departDate, null);
        }
      }
      console.log(`✅ Found ${outboundFlights?.length || 0} one-way outbound flights`);
      
      // Step 5: Get one-way flights for return (to→from)
      console.log('\n✈️ [RETURN FLIGHTS] Fetching one-way return flights...');
      let returnFlights = null;
      if (toIsOnlyStation || fromIsOnlyStation) {
        console.log(`🚂 [SKIP FLIGHTS] ${toIsOnlyStation ? 'Origin' : 'Destination'} is only an Amtrak station - skipping return flight search`);
        returnFlights = [];
      } else {
        returnFlights = await checkDatabase({ from: to, to: from, departDate: returnDate, returnDate: null, tripType: 'oneway' });
        
        if (!returnFlights) {
          console.log('🌐 [SCRAPER] Scraping one-way return flights...');
          returnFlights = await scrapeGoogleFlights(to, from, returnDate, null);
        }
      }
      console.log(`✅ Found ${returnFlights?.length || 0} one-way return flights`);
      
      // Step 6: Build mixed roundtrip options (filtered by price/duration comparison)
      const mixedOptions = buildMixedRoundtripOptions(
        outboundFlights,
        returnFlights,
        outboundTrains,
        returnTrains,
        roundtripFlights, // Pass roundtrip flights for price comparison
        from,
        to,
        departDate,
        returnDate
      );
      
      if (mixedOptions && mixedOptions.length > 0) {
        allResults.push(...mixedOptions);
      }
      
      // Step 7: Sort all results
      if (allResults.length > 0) {
        if (sortBy === 'price') {
          allResults.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
        } else if (sortBy === 'time') {
          allResults.sort((a, b) => (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity));
        }
      }
      
      console.log(`\n✅ [ROUNDTRIP] Returning ${allResults.length} total results`);
      console.log(`   - Roundtrip flights: ${roundtripFlights?.length || 0}`);
      console.log(`   - Mixed roundtrip options: ${mixedOptions?.length || 0}`);
      
      return res.json(allResults || []);
    }
    
    // =====================================================
    // ONE-WAY SEARCH LOGIC (existing behavior)
    // =====================================================
    console.log('\n➡️ [ONE-WAY] Processing one-way search...');
    
    // Step 1: Check if destination is ONLY an Amtrak station (not an airport)
    // Skip flight scraping for pure train stations to save time
    const toIsOnlyStation = await isOnlyAmtrakStation(to);
    const fromIsOnlyStation = await isOnlyAmtrakStation(from);
    
    let flightResults = null;
    
    if (toIsOnlyStation || fromIsOnlyStation) {
      console.log(`🚂 [SKIP FLIGHTS] ${toIsOnlyStation ? 'Destination' : 'Origin'} is only an Amtrak station (not an airport) - skipping flight search`);
      flightResults = []; // Empty array to indicate no flights (but don't trigger scraper)
    } else {
      // Step 2: Check database first
      flightResults = await checkDatabase({ from, to, departDate, returnDate, tripType});

      // Step 3: If no database results, use web scraper
      // Note: The scraper (flightScraper.js) automatically saves results to MongoDB
      if (!flightResults) {
        console.log('🌐 [SCRAPER] Starting web scraper...');
        flightResults = await scrapeGoogleFlights(
          from,
          to,
          departDate,
          null // Always one-way for one-way searches
        );
      }
    }

    // Step 3: Fetch train data in parallel
    let trainResults = [];
    try {
      console.log('🚂 [TRAINS] Fetching train data...');
      const rawTrainResults = await getGroupedTrainResults(from, to, 5); // Get top 5 grouped trains
      
      if (rawTrainResults && rawTrainResults.length > 0) {
        trainResults = formatTrainResults(rawTrainResults, from, to, departDate, null);
        console.log(`✅ [TRAINS] Found ${trainResults.length} train options`);
      } else {
        console.log('ℹ️ [TRAINS] No train routes found for this route');
      }
    } catch (trainError) {
      console.error('⚠️ [TRAINS] Error fetching train data:', trainError.message);
      // Continue without train data - don't fail the entire request
    }

    // Step 4: Check connection cache FIRST (before fetching hub flights!)
    // This is the key optimization - skip hub flights entirely if we have cached connections
    let connectionResults = [];
    const cachedConnections = await getCachedConnections(from, to, 'oneway');
    
    if (cachedConnections && cachedConnections.connections && cachedConnections.connections.length > 0) {
      // ⚡ CACHE HIT - Use cached connections, skip hub flight fetching entirely!
      connectionResults = cachedConnections.connections;
      console.log(`⚡ [CONNECTIONS] Cache hit! Using ${connectionResults.length} cached connections (skipping hub flights)`);
    } else {
      // ❌ CACHE MISS - Need to fetch hub flights and build connections
      console.log('🔗 [CONNECTIONS] Cache miss, building connections...');
      
      // Step 4a: Fetch hub flights (only if cache miss)
      let hubFlights = [];
      try {
        hubFlights = await fetchHubFlights(from, to, departDate);
      } catch (hubError) {
        console.error('⚠️ [HUBS] Error fetching hub flights:', hubError.message);
      }
      
      // Step 4b: Build connections
      const allFlightsForConnections = [...(flightResults || []), ...hubFlights];
      
      // Deduplicate flights
      const seenFlightIds = new Set();
      const uniqueFlightsForConnections = allFlightsForConnections.filter(flight => {
        const id = flight._id?.toString() || JSON.stringify(flight);
        if (seenFlightIds.has(id)) return false;
        seenFlightIds.add(id);
        return true;
      });
      
      if (uniqueFlightsForConnections.length > 0) {
        try {
          console.log(`   Building connections from ${uniqueFlightsForConnections.length} flights...`);
          
          connectionResults = await buildConnections(
            uniqueFlightsForConnections, 
            trainResults, 
            from, 
            to, 
            departDate, 
            null, // Always null for one-way
            false // verbose off for production
          );
          console.log(`✅ [CONNECTIONS] Found ${connectionResults.length} connection options`);
          
          // Log breakdown by type
          const flightAmtrak = connectionResults.filter(c => c.connectionType === 'flight-amtrak').length;
          const amtrakFlight = connectionResults.filter(c => c.connectionType === 'amtrak-flight').length;
          const flightFlight = connectionResults.filter(c => c.connectionType === 'flight-flight').length;
          if (connectionResults.length > 0) {
            console.log(`   Breakdown: ${flightAmtrak} flight→amtrak, ${amtrakFlight} amtrak→flight, ${flightFlight} flight→flight`);
          }
          
          // Cache the connections for future requests (async, don't block)
          if (connectionResults.length > 0) {
            findPotentialHubs(from, to, false).then(hubsInfo => {
              cacheConnections(from, to, connectionResults, hubsInfo, 'oneway')
                .catch(err => console.error('⚠️ [CACHE] Background cache error:', err.message));
            });
          }
        } catch (connectionError) {
          console.error('⚠️ [CONNECTIONS] Error building connections:', connectionError.message);
        }
      }
    }

    // Step 6: Combine flight, train, and connection results
    const allResults = [];
    if (flightResults && flightResults.length > 0) {
      allResults.push(...flightResults);
    }
    if (trainResults && trainResults.length > 0) {
      allResults.push(...trainResults);
    }
    if (connectionResults && connectionResults.length > 0) {
      allResults.push(...connectionResults);
    }

    // Step 7: Sort all results together
    if (allResults.length > 0) {
      if (sortBy === 'price') {
        allResults.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
      } else if (sortBy === 'time') {
        allResults.sort((a, b) => (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity));
      }
    }

    console.log(`\n✅ Returning ${allResults.length} total results (${flightResults?.length || 0} flights, ${trainResults.length} trains, ${connectionResults.length} connections)\n`);
    
    res.json(allResults || []);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Failed to search for travel options',
      message: error.message
    });
  }
});

// Chat endpoint with Groq AI integration
app.post('/api/chat', async (req, res) => {
  try {
    const { message, messages } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userMessage = message.trim();

    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      console.warn('⚠️ GROQ_API_KEY not configured, using fallback response');
      return res.json({
        response: 'I\'m here to help you plan your trip! 🎒\n\nPlease configure the GROQ_API_KEY environment variable to enable AI-powered responses.\n\nTry asking me:\n• "Find flights from [city] to [city]"\n• "What\'s the cheapest way to get from New York to Los Angeles?"\n• "Show me travel options to Paris"\n\nYou can also use the search form on the left for detailed searches with specific dates. ✈️'
      });
    }

    // System prompt for the travel assistant
    const systemPrompt = `You are a helpful and friendly travel assistant chatbot for a multi-transport travel comparison platform. Your role is to:

1. Help users find travel options (flights, trains, buses) between cities
2. Provide helpful information about travel planning
3. Guide users on how to use the search form on the website
4. Be conversational, friendly, and use emojis appropriately (but not excessively)
5. When users ask about specific routes, ALWAYS ask for missing information before filling the form

AVAILABLE AIRPORTS:
We support ALL US commercial airports! Use standard 3-letter IATA airport codes.
Common examples: LAX (Los Angeles), SFO (San Francisco), JFK/LGA/EWR (New York area), 
ORD/MDW (Chicago), DFW/DAL (Dallas), ATL (Atlanta), MIA/FLL (Miami area), SEA (Seattle), 
DEN (Denver), BOS (Boston), DCA/IAD/BWI (Washington DC area), PHX (Phoenix), LAS (Las Vegas),
MCO (Orlando), MSP (Minneapolis), DTW (Detroit), CLT (Charlotte), PHL (Philadelphia),
SAN (San Diego), PDX (Portland), AUS (Austin), IAH/HOU (Houston), MSY (New Orleans),
SLC (Salt Lake City), BNA (Nashville), RDU (Raleigh), SJC (San Jose), OAK (Oakland), etc.
Users can use any valid US airport code - we support over 500 commercial airports

AVAILABLE AMTRAK STATIONS (use these codes):
LAX (Los Angeles Union Station), SBA (Santa Barbara), SAN (San Diego Santa Fe Depot), 
SAC (Sacramento Valley Station), CHI (Chicago Union Station), NYP (New York Penn Station), 
BOS (Boston South Station), WAS (Washington Union Station), PHL (Philadelphia 30th Street), 
SEA (Seattle King Street), PDX (Portland Union Station), DEN (Denver Union Station), 
ABQ (Albuquerque), NOL (New Orleans), SFC (San Francisco/Emeryville), OMA (Omaha), 
SLC (Salt Lake City), KYC (Kansas City), SPK (Spokane)

IMPORTANT LOCATION RULES:
- When a user mentions a city, help them identify the correct airport code (use standard IATA codes)
- If a user says "New York", ask if they want JFK, LGA, EWR (airports) or NYP (Penn Station for trains)
- If a user says "Los Angeles", use LAX for both airport and Amtrak station
- If a user says "San Francisco", ask if they want SFO airport or SFC (Emeryville Amtrak station)
- If a user says "Chicago", ask if they want ORD (O'Hare), MDW (Midway) or CHI (Union Station for trains)
- Always use the 3-letter codes (e.g., LAX, SFO, NYP) in searchParams, NOT city names
- We support ALL US commercial airports - if you know the airport code, use it!
- For Amtrak stations, use the station codes listed above

IMPORTANT INFORMATION COLLECTION RULES:
- When a user asks to search for flights/travel, you MUST collect ALL required information before filling the form
- REQUIRED information: origin airport/station code, destination airport/station code, departure date, and trip type (oneway vs roundtrip)
- ALWAYS ask: "What date would you like to depart?" if departure date is not provided
- ALWAYS ask: "Is this a one-way or round-trip?" if trip type is not clear
- If it's a round trip, ask: "What date would you like to return?" if return date is not provided
- Only fill in the search form (return searchParams) when you have: origin, destination, departure date, and trip type confirmed

When a user asks to search for travel but information is missing, respond conversationally asking for the missing details:
{"response": "I'd be happy to help you find flights! To get started, I need a few details:\n\n• What date would you like to depart?\n• Is this a one-way or round-trip?", "searchParams": null}

When you have ALL required information (origin, destination, departure date, trip type), respond in JSON format with this structure:
{
  "response": "your conversational response confirming the search",
  "searchParams": {
    "from": "3-letter airport or station code (e.g., LAX, JFK, NYP)",
    "to": "3-letter airport or station code (e.g., SFO, BOS, CHI)",
    "departDate": "YYYY-MM-DD format (e.g., 2026-01-15). IMPORTANT: Always use YYYY-MM-DD format, NOT MM/DD/YYYY. Default year is 2026 if user doesn't specify",
    "returnDate": "YYYY-MM-DD format or null (only if roundtrip). IMPORTANT: Always use YYYY-MM-DD format, NOT MM/DD/YYYY. Default year is 2026 if user doesn't specify",
    "tripType": "oneway" or "roundtrip",
    "sortBy": "price" or "time"
  }
}

If the user is NOT asking to search (just having a conversation), respond normally with just: {"response": "your response", "searchParams": null}

CRITICAL: 
- Dates MUST be in YYYY-MM-DD format (year-month-day). If a user says "1/15" or "January 15" without a year, use 2026 as the default year (e.g., "2026-01-15")
- If a user says "1/15/2025" or "10/01/2026", convert it to "2025-01-15" or "2026-10-01" respectively
- Default year is 2026 when user doesn't specify a year
- Never use MM/DD/YYYY format in the JSON response
- Always ask for missing information - don't guess or assume
- ALWAYS use 3-letter codes (LAX, JFK, etc.) in searchParams, not city names

Always respond in valid JSON format.`;

    // Build conversation history for context
    let conversationMessages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history if provided (for context)
    if (messages && Array.isArray(messages)) {
      // Add previous messages (limit to last 10 for context)
      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
        if (msg.role && msg.content) {
          conversationMessages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
          });
        }
      }
    }

    // Add current user message
    conversationMessages.push({
      role: 'user',
      content: userMessage
    });

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: conversationMessages,
      model: 'llama-3.3-70b-versatile', // Using Llama 3.3 70B model - fast and capable
      temperature: 0.7,
      max_tokens: 800, // Increased to accommodate JSON responses
      top_p: 1,
      stream: false,
      response_format: { type: 'json_object' } // Request JSON format
    });

    const rawResponse = completion.choices[0]?.message?.content || '{"response": "Sorry, I couldn\'t generate a response. Please try again.", "searchParams": null}';

    // Try to parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (parseError) {
      // If parsing fails, treat as plain text response
      console.warn('Failed to parse JSON response, using as plain text:', parseError);
      parsedResponse = {
        response: rawResponse,
        searchParams: null
      };
    }

    // Validate and clean search parameters if present
    let searchParams = null;
    if (parsedResponse.searchParams) {
      const params = parsedResponse.searchParams;
      console.log('[CHAT] Raw searchParams from LLM:', JSON.stringify(params));
      
      // Only include searchParams if we have at least origin and destination
      if (params.from && params.to) {
        // Convert dates to YYYY-MM-DD format if provided
        const formatDate = (dateStr) => {
          if (!dateStr || dateStr === 'null' || dateStr === null) return null;
          
          try {
            const trimmed = dateStr.trim();
            const DEFAULT_YEAR = 2026; // Default year when not specified
            
            // Handle MM/DD/YYYY or M/D/YYYY format explicitly (US format)
            const slashFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
            const match = trimmed.match(slashFormat);
            
            if (match) {
              // Parse as MM/DD/YYYY (US format) - the prompt instructs the LLM to use this format
              const month = parseInt(match[1], 10);
              const day = parseInt(match[2], 10);
              const year = parseInt(match[3], 10);
              
              // Log for debugging
              console.log(`[DATE PARSING] Input: "${trimmed}" -> Month: ${month}, Day: ${day}, Year: ${year}`);
              
              // Validate month and day ranges
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const date = new Date(year, month - 1, day); // month is 0-indexed in Date
                if (!isNaN(date.getTime())) {
                  const yearStr = date.getFullYear().toString();
                  const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
                  const dayStr = date.getDate().toString().padStart(2, '0');
                  const result = `${yearStr}-${monthStr}-${dayStr}`;
                  console.log(`[DATE PARSING] Result: "${result}"`);
                  return result;
                }
              }
            }
            
            // Handle MM/DD format (without year) - default to 2026
            const slashFormatNoYear = /^(\d{1,2})\/(\d{1,2})$/;
            const matchNoYear = trimmed.match(slashFormatNoYear);
            if (matchNoYear) {
              const month = parseInt(matchNoYear[1], 10);
              const day = parseInt(matchNoYear[2], 10);
              console.log(`[DATE PARSING] Input: "${trimmed}" -> Month: ${month}, Day: ${day}, Year: ${DEFAULT_YEAR} (default)`);
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const date = new Date(DEFAULT_YEAR, month - 1, day);
                if (!isNaN(date.getTime())) {
                  const yearStr = date.getFullYear().toString();
                  const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
                  const dayStr = date.getDate().toString().padStart(2, '0');
                  const result = `${yearStr}-${monthStr}-${dayStr}`;
                  console.log(`[DATE PARSING] Result: "${result}"`);
                  return result;
                }
              }
            }
            
            // Try parsing as ISO format (YYYY-MM-DD) first - most reliable
            const isoFormat = /^(\d{4})-(\d{2})-(\d{2})$/;
            const isoMatch = trimmed.match(isoFormat);
            if (isoMatch) {
              const year = parseInt(isoMatch[1], 10);
              const month = parseInt(isoMatch[2], 10);
              const day = parseInt(isoMatch[3], 10);
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return trimmed; // Already in correct format
              }
            }
            
            // Handle MM-DD format (without year) - default to 2026
            const isoFormatNoYear = /^(\d{2})-(\d{2})$/;
            const isoMatchNoYear = trimmed.match(isoFormatNoYear);
            if (isoMatchNoYear) {
              const month = parseInt(isoMatchNoYear[1], 10);
              const day = parseInt(isoMatchNoYear[2], 10);
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const result = `${DEFAULT_YEAR}-${trimmed}`;
                console.log(`[DATE PARSING] Input: "${trimmed}" -> Result: "${result}" (default year ${DEFAULT_YEAR})`);
                return result;
              }
            }
            
            // Last resort: Try parsing with Date constructor (unreliable, but better than nothing)
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) {
              // If the year is less than 2026, assume it should be 2026
              const parsedYear = date.getFullYear();
              if (parsedYear < 2026) {
                date.setFullYear(2026);
              }
              return date.toISOString().split('T')[0];
            }
            
            return null;
          } catch {
            return null;
          }
        };

        searchParams = {
          from: params.from.trim(),
          to: params.to.trim(),
          departDate: formatDate(params.departDate) || null,
          returnDate: formatDate(params.returnDate) || null,
          tripType: (params.tripType === 'roundtrip' || params.returnDate) ? 'roundtrip' : 'oneway',
          sortBy: (params.sortBy === 'time') ? 'time' : 'price'
        };

        // If it's a round trip but no return date, set tripType to oneway
        if (searchParams.tripType === 'roundtrip' && !searchParams.returnDate) {
          searchParams.tripType = 'oneway';
        }
      }
    }

    return res.json({
      response: parsedResponse.response || rawResponse,
      searchParams: searchParams
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    // Provide a helpful fallback response on error
    const errorMessage = error.message || 'Unknown error';
    return res.status(500).json({ 
      error: 'Failed to get chatbot response',
      message: errorMessage,
      response: 'Sorry, I encountered an error processing your request. Please try again later, or use the search form on the left to find travel options directly. ✈️'
    });
  }
});

// Recommendations endpoint (placeholder)
app.get('/api/recommendations', async (req, res) => {
  try {
    // TODO: Implement recommendations logic
    res.json({ message: 'Recommendations endpoint - coming soon' });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// =====================================================
// AMTRAK FARE ENDPOINTS
// =====================================================

/**
 * Get Amtrak fare for a route and date
 * GET /api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15
 */
app.get('/api/amtrak/fare', async (req, res) => {
  try {
    const { origin, dest, date } = req.query;

    // Validate required parameters
    if (!origin || !dest || !date) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'dest', 'date'],
        example: '/api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15'
      });
    }

    console.log(`\n🚂 [AMTRAK] Fare lookup: ${origin} → ${dest} on ${date}`);

    const fare = await getAmtrakFare(origin, dest, date);

    if (!fare) {
      return res.status(404).json({
        error: 'No fare found for this route',
        origin,
        dest,
        date,
        message: 'This route may not exist in our dataset'
      });
    }

    console.log(`✅ [AMTRAK] Found fare: $${fare.priceUSD} (${fare.isEstimated ? 'estimated' : 'exact'})`);
    res.json(fare);

  } catch (error) {
    console.error('❌ Amtrak fare lookup error:', error);
    res.status(500).json({ error: 'Failed to look up Amtrak fare' });
  }
});

/**
 * Get all Amtrak stations
 * GET /api/amtrak/stations
 */
app.get('/api/amtrak/stations', async (req, res) => {
  try {
    const stations = await getStations();
    res.json(stations);
  } catch (error) {
    console.error('❌ Amtrak stations error:', error);
    res.status(500).json({ error: 'Failed to load stations' });
  }
});

/**
 * Get a specific station by code
 * GET /api/amtrak/stations/:code
 */
app.get('/api/amtrak/stations/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const station = await getStationByCode(code);

    if (!station) {
      return res.status(404).json({
        error: 'Station not found',
        code,
        message: 'This station code does not exist in our dataset'
      });
    }

    res.json(station);
  } catch (error) {
    console.error('❌ Amtrak station lookup error:', error);
    res.status(500).json({ error: 'Failed to look up station' });
  }
});

/**
 * Get all available routes
 * GET /api/amtrak/routes
 */
app.get('/api/amtrak/routes', async (req, res) => {
  try {
    const routes = await getAvailableRoutes();
    res.json(routes);
  } catch (error) {
    console.error('❌ Amtrak routes error:', error);
    res.status(500).json({ error: 'Failed to load routes' });
  }
});

/**
 * Get all available locations (airports + Amtrak stations)
 * GET /api/locations
 */
app.get('/api/locations', async (req, res) => {
  try {
    const stations = await getStations();
    
    // Format all commercial airports
    const airports = COMMERCIAL_AIRPORTS.map(code => {
      // Check if this airport is in MAJOR_HUB_AIRPORTS for additional info
      const hubInfo = MAJOR_HUB_AIRPORTS.find(h => h.code === code);
      return {
        code: code,
        name: hubInfo ? `${hubInfo.city} Airport` : `${code} Airport`,
        city: hubInfo?.city || code,
        state: hubInfo?.state || '',
        type: 'airport'
      };
    });
    
    // Format Amtrak stations
    const amtrakStations = stations.map(station => ({
      code: station.code,
      name: station.name,
      city: station.city,
      state: station.state,
      type: 'station'
    }));
    
    // Combine and sort by code
    const allLocations = [...airports, ...amtrakStations].sort((a, b) => 
      a.code.localeCompare(b.code)
    );
    
    res.json(allLocations);
  } catch (error) {
    console.error('❌ Locations error:', error);
    res.status(500).json({ error: 'Failed to load locations' });
  }
});

/**
 * Get all available commercial airports
 * GET /api/airports
 */
app.get('/api/airports', (req, res) => {
  res.json({
    count: COMMERCIAL_AIRPORTS.length,
    airports: COMMERCIAL_AIRPORTS
  });
});

/**
 * Validate if an airport code is valid
 * GET /api/airports/validate/:code
 */
app.get('/api/airports/validate/:code', (req, res) => {
  const code = req.params.code?.toUpperCase().trim();
  const isValid = isValidAirport(code);
  res.json({
    code: code,
    valid: isValid
  });
});

// Health check endpoint
app.get('/api/health', async (req, res) => {
  const dbHealthy = await isDatabaseHealthy();
  res.json({ 
    status: dbHealthy ? 'ok' : 'degraded',
    database: dbHealthy ? 'connected' : 'disconnected',
    timestamp: new Date().toISOString() 
  });
});

// Cache stats endpoint (for monitoring)
app.get('/api/cache/stats', async (req, res) => {
  try {
    const amtrakStats = getCacheStats();
    const connectionCacheStats = getConnectionCacheStats();
    res.json({
      amtrak: amtrakStats,
      connectionCache: connectionCacheStats,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    res.status(500).json({ error: 'Failed to get cache stats' });
  }
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    name: 'Travel Hub API',
    version: '1.0.0',
    endpoints: {
      search: 'POST /api/search',
      health: 'GET /api/health',
      chat: 'POST /api/chat',
      recommendations: 'GET /api/recommendations',
      locations: 'GET /api/locations',
      airports: {
        list: 'GET /api/airports',
        validate: 'GET /api/airports/validate/:code'
      },
      amtrak: {
        fare: 'GET /api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15',
        stations: 'GET /api/amtrak/stations',
        station: 'GET /api/amtrak/stations/:code',
        routes: 'GET /api/amtrak/routes'
      }
    }
  });
});

// Initialize indexes and caches on startup
async function initializeServer() {
  console.log('\n🔧 [INIT] Initializing server...');
  const startTime = Date.now();
  
  try {
    // Initialize MongoDB connection pool FIRST (most important)
    console.log('🔌 [INIT] Establishing database connection pool...');
    await getDatabase();
    
    // Initialize database indexes
    console.log('📊 [INIT] Initializing database indexes...');
    await initializeDbIndexes();
    
    // Initialize Amtrak indexed lookups (builds O(1) lookup maps)
    console.log('🚂 [INIT] Building Amtrak indexes...');
    await ensureIndexes();
    const amtrakStats = getCacheStats();
    console.log(`   ✅ Amtrak indexes ready: ${amtrakStats.uniqueRoutes} routes, ${amtrakStats.preComputedGroups} pre-computed groups`);
    
    // Initialize connection cache indexes
    console.log('💾 [INIT] Initializing connection cache indexes...');
    await initializeCacheIndexes();
    
    const elapsed = Date.now() - startTime;
    console.log(`\n✅ [INIT] Server initialized in ${elapsed}ms`);
    
  } catch (error) {
    console.error('⚠️ [INIT] Initialization error:', error.message);
    // Continue anyway - server can still function, just slower
  }
}

// Graceful shutdown handling
process.on('SIGINT', async () => {
  console.log('\n🛑 Shutting down gracefully...');
  await closeDatabase();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('\n🛑 Received SIGTERM, shutting down...');
  await closeDatabase();
  process.exit(0);
});

// Start server
app.listen(PORT, async () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Travel Hub Backend API Server      ║');
  console.log('║         (OPTIMIZED VERSION)            ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🚀 Server running on port ${PORT}`);
  
  // Initialize indexes and caches in background
  await initializeServer();
  
  console.log('\n📡 API endpoints:');
  console.log('   POST /api/search - Search for travel options');
  console.log('   GET  /api/health - Health check');
  console.log('   POST /api/chat - Chatbot endpoint');
  console.log('   GET  /api/recommendations - Recommendations');
  console.log('   🚂 Amtrak endpoints:');
  console.log('   GET  /api/amtrak/fare - Look up Amtrak fare');
  console.log('   GET  /api/amtrak/stations - List all stations');
  console.log('   GET  /api/amtrak/stations/:code - Get station by code');
  console.log('   GET  /api/amtrak/routes - List available routes');
  console.log('\n🌐 Allowed origins:', allowedOrigins.join(', ') || 'all .netlify.app domains');
  console.log('\n✨ Server ready with optimized indexes and caching!');
});
