/**
 * Connection Service
 * Builds combined itineraries for multi-leg journeys
 * 
 * Three scenarios:
 * 1. FLIGHT → AMTRAK: Fly to a hub city, then take Amtrak to final destination
 * 2. AMTRAK → FLIGHT: Take Amtrak from origin to a hub city, then fly to destination
 * 3. FLIGHT → FLIGHT: Fly to a major hub airport, then connect to another flight
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module for resolving data paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Minimum connection time in minutes (30 minutes)
const MIN_CONNECTION_MINUTES = 30;

// Maximum wait time for a connection (4 hours)
const MAX_WAIT_MINUTES = 240;

// Cache for loaded data
let faresData = null;
let stationsData = null;

// =====================================================
// MAJOR HUB AIRPORTS FOR FLIGHT CONNECTIONS
// Based on hubs.md - major airports for connecting flights
// =====================================================
const MAJOR_HUB_AIRPORTS = [
  { code: 'LAX', city: 'Los Angeles', state: 'CA' },
  { code: 'SFO', city: 'San Francisco', state: 'CA' },
  { code: 'OAK', city: 'Oakland', state: 'CA' },
  { code: 'SJC', city: 'San Jose', state: 'CA' },
  { code: 'SAN', city: 'San Diego', state: 'CA' },
  { code: 'DEN', city: 'Denver', state: 'CO' },
  { code: 'SLC', city: 'Salt Lake City', state: 'UT' },
  { code: 'SEA', city: 'Seattle', state: 'WA' },
  { code: 'PDX', city: 'Portland', state: 'OR' },
  { code: 'ORD', city: 'Chicago', state: 'IL' },
  { code: 'DFW', city: 'Dallas', state: 'TX' },
  { code: 'AUS', city: 'Austin', state: 'TX' },
  { code: 'IAH', city: 'Houston', state: 'TX' },
  { code: 'MSY', city: 'New Orleans', state: 'LA' },
  { code: 'ATL', city: 'Atlanta', state: 'GA' },
  { code: 'JFK', city: 'New York', state: 'NY' },
  { code: 'LGA', city: 'New York', state: 'NY' },
  { code: 'EWR', city: 'Newark', state: 'NJ' },
  { code: 'BOS', city: 'Boston', state: 'MA' },
  { code: 'DCA', city: 'Washington DC', state: 'DC' },
  { code: 'IAD', city: 'Washington DC', state: 'VA' },
  { code: 'PHX', city: 'Phoenix', state: 'AZ' },
  { code: 'LAS', city: 'Las Vegas', state: 'NV' },
  { code: 'MIA', city: 'Miami', state: 'FL' },
  { code: 'MCO', city: 'Orlando', state: 'FL' },
  { code: 'MSP', city: 'Minneapolis', state: 'MN' },
  { code: 'DTW', city: 'Detroit', state: 'MI' },
  { code: 'CLT', city: 'Charlotte', state: 'NC' },
  { code: 'PHL', city: 'Philadelphia', state: 'PA' }
];

// =====================================================
// AIRPORT CODE TO AMTRAK STATION CODE MAPPING
// Maps airport codes to corresponding Amtrak station codes
// where they differ (e.g., ORD airport -> CHI Amtrak)
// =====================================================
const AIRPORT_TO_AMTRAK_MAP = {
  // Chicago: O'Hare (ORD) / Midway (MDW) -> Chicago Union Station (CHI)
  'ORD': 'CHI',
  'MDW': 'CHI',
  
  // New York: JFK, LaGuardia, Newark -> Penn Station (NYP)
  'JFK': 'NYP',
  'LGA': 'NYP',
  'EWR': 'NYP',
  
  // Washington DC: Reagan (DCA), Dulles (IAD), BWI -> Union Station (WAS)
  'DCA': 'WAS',
  'IAD': 'WAS',
  'BWI': 'WAS',
  
  // New Orleans: MSY -> NOL
  'MSY': 'NOL',
  
  // Kansas City: MCI -> KYC
  'MCI': 'KYC',
  
  // Spokane: GEG -> SPK
  'GEG': 'SPK',
  
  // Sacramento: SMF -> SAC
  'SMF': 'SAC',
  
  // San Francisco area: OAK, SJC can connect to Emeryville (SFO in Amtrak data)
  'OAK': 'SFO',  // Emeryville is close to Oakland
  'SJC': 'SFO',  // Can take bus connection to Emeryville
};

// Reverse mapping: Amtrak station code -> array of airport codes
const AMTRAK_TO_AIRPORTS_MAP = {
  'CHI': ['ORD', 'MDW'],
  'NYP': ['JFK', 'LGA', 'EWR'],
  'WAS': ['DCA', 'IAD', 'BWI'],
  'NOL': ['MSY'],
  'KYC': ['MCI'],
  'SPK': ['GEG'],
  'SAC': ['SMF'],
  'SFO': ['SFO', 'OAK', 'SJC'],  // SFO maps to itself plus nearby airports
};

/**
 * Convert an airport code to its corresponding Amtrak station code
 * Returns the original code if no mapping exists (e.g., LAX -> LAX)
 * @param {string} airportCode - The airport code
 * @returns {string} The Amtrak station code
 */
function airportToAmtrak(airportCode) {
  const code = airportCode.toUpperCase();
  return AIRPORT_TO_AMTRAK_MAP[code] || code;
}

/**
 * Get all airport codes that correspond to an Amtrak station
 * Returns the original code in an array if no mapping exists
 * @param {string} amtrakCode - The Amtrak station code
 * @returns {string[]} Array of airport codes
 */
function amtrakToAirports(amtrakCode) {
  const code = amtrakCode.toUpperCase();
  return AMTRAK_TO_AIRPORTS_MAP[code] || [code];
}

/**
 * Check if two location codes refer to the same city
 * Accounts for airport/Amtrak code differences
 * @param {string} code1 - First location code
 * @param {string} code2 - Second location code
 * @returns {boolean} True if they're the same city
 */
function isSameCity(code1, code2) {
  const c1 = code1.toUpperCase();
  const c2 = code2.toUpperCase();
  
  // Direct match
  if (c1 === c2) return true;
  
  // Check if both map to the same Amtrak code
  const amtrak1 = airportToAmtrak(c1);
  const amtrak2 = airportToAmtrak(c2);
  if (amtrak1 === amtrak2) return true;
  
  // Check if one is in the other's airport list
  const airports1 = amtrakToAirports(amtrak1);
  const airports2 = amtrakToAirports(amtrak2);
  if (airports1.includes(c2) || airports2.includes(c1)) return true;
  
  return false;
}

/**
 * Get list of major hub airport codes
 * @returns {string[]} Array of airport codes
 */
function getMajorHubCodes() {
  return MAJOR_HUB_AIRPORTS.map(h => h.code);
}

/**
 * Get hub info by code
 * @param {string} code - Airport code
 * @returns {Object|null} Hub info or null
 */
function getHubInfo(code) {
  return MAJOR_HUB_AIRPORTS.find(h => h.code.toUpperCase() === code.toUpperCase()) || null;
}

// =====================================================
// DATA LOADING
// =====================================================

/**
 * Load Amtrak fares data
 * @returns {Promise<Array>} Array of fare objects
 */
async function loadFaresData() {
  if (faresData !== null) {
    return faresData;
  }

  try {
    const faresPath = join(__dirname, '..', 'data', 'amtrak_fares.json');
    const rawData = await readFile(faresPath, 'utf-8');
    faresData = JSON.parse(rawData);
    return faresData;
  } catch (error) {
    console.error('❌ [CONNECTIONS] Failed to load fares data:', error.message);
    faresData = [];
    return faresData;
  }
}

/**
 * Load stations data
 * @returns {Promise<Array>} Array of station objects
 */
async function loadStationsData() {
  if (stationsData !== null) {
    return stationsData;
  }

  try {
    const stationsPath = join(__dirname, '..', 'data', 'amtrak_stations.json');
    const rawData = await readFile(stationsPath, 'utf-8');
    stationsData = JSON.parse(rawData);
    return stationsData;
  } catch (error) {
    console.error('❌ [CONNECTIONS] Failed to load stations data:', error.message);
    stationsData = [];
    return stationsData;
  }
}

/**
 * Get set of all hub codes (stations that can serve as connection points)
 * @returns {Promise<Set<string>>}
 */
async function getHubCodes() {
  const stations = await loadStationsData();
  return new Set(stations.map(s => s.code.toUpperCase()));
}

// =====================================================
// TIME UTILITIES
// =====================================================

/**
 * Parse time string (e.g., "6:53 AM", "12:40 PM") to minutes since midnight
 * @param {string} timeStr - Time string
 * @returns {number|null} Minutes since midnight
 */
function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  
  if (period === 'PM' && hours !== 12) {
    hours += 12;
  } else if (period === 'AM' && hours === 12) {
    hours = 0;
  }
  
  return hours * 60 + minutes;
}

/**
 * Convert minutes since midnight to time string
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string (e.g., "6:53 AM")
 */
function minutesToTimeString(minutes) {
  if (minutes === null || minutes === undefined) return null;
  
  let totalMinutes = minutes % (24 * 60);
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
 * Format duration in minutes to readable string
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration
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
 * Check if a connection time is valid
 * @param {number} arrivalMinutes - First leg arrival time
 * @param {number} departureMinutes - Second leg departure time
 * @returns {boolean}
 */
function isValidConnectionTime(arrivalMinutes, departureMinutes) {
  if (arrivalMinutes === null || departureMinutes === null) return false;
  
  let waitTime = departureMinutes - arrivalMinutes;
  
  // Handle overnight connections (second leg next day)
  if (waitTime < 0) {
    waitTime += 24 * 60; // Add 24 hours
  }
  
  return waitTime >= MIN_CONNECTION_MINUTES && waitTime <= MAX_WAIT_MINUTES;
}

/**
 * Calculate wait time between connections
 * @param {number} arrivalMinutes - First leg arrival
 * @param {number} departureMinutes - Second leg departure
 * @returns {number} Wait time in minutes
 */
function calculateWaitTime(arrivalMinutes, departureMinutes) {
  let waitTime = departureMinutes - arrivalMinutes;
  if (waitTime < 0) {
    waitTime += 24 * 60;
  }
  return waitTime;
}

// =====================================================
// AMTRAK DATA HELPERS
// =====================================================

/**
 * Find all Amtrak routes arriving at a destination
 * Handles airport-to-Amtrak code mapping (e.g., JFK -> NYP)
 * @param {string} destCode - Destination airport/station code
 * @returns {Promise<Array>} Array of Amtrak fares ending at this destination
 */
async function findAmtrakRoutesToDest(destCode) {
  const fares = await loadFaresData();
  const normalizedDest = destCode.toUpperCase().trim();
  
  // Get the Amtrak station code (may differ from airport code)
  const amtrakDest = airportToAmtrak(normalizedDest);
  
  // Filter fares that match either the original code or the mapped Amtrak code
  return fares.filter(fare => {
    const fareDest = fare.dest.toUpperCase();
    return fareDest === normalizedDest || fareDest === amtrakDest;
  });
}

/**
 * Find all Amtrak routes departing from an origin
 * Handles airport-to-Amtrak code mapping (e.g., ORD -> CHI)
 * @param {string} originCode - Origin airport/station code
 * @returns {Promise<Array>} Array of Amtrak fares starting from this origin
 */
async function findAmtrakRoutesFromOrigin(originCode) {
  const fares = await loadFaresData();
  const normalizedOrigin = originCode.toUpperCase().trim();
  
  // Get the Amtrak station code (may differ from airport code)
  const amtrakOrigin = airportToAmtrak(normalizedOrigin);
  
  // Filter fares that match either the original code or the mapped Amtrak code
  return fares.filter(fare => {
    const fareOrigin = fare.origin.toUpperCase();
    return fareOrigin === normalizedOrigin || fareOrigin === amtrakOrigin;
  });
}

/**
 * Group Amtrak fares by route and get average/representative fare
 * @param {Array} fares - Array of fare objects
 * @returns {Array} Grouped and averaged fares
 */
function groupAmtrakFares(fares) {
  if (!fares || fares.length === 0) return [];
  
  // Group by origin-dest-transfers combination
  const groups = new Map();
  
  for (const fare of fares) {
    // Use a key that groups similar routes
    const key = `${fare.origin}-${fare.dest}-${fare.transfers}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        origin: fare.origin,
        dest: fare.dest,
        transfers: fare.transfers,
        fares: []
      });
    }
    
    groups.get(key).fares.push(fare);
  }
  
  // Convert to array with averaged values
  return Array.from(groups.values()).map(group => {
    const avgPrice = group.fares.reduce((sum, f) => sum + f.priceUSD, 0) / group.fares.length;
    const avgDuration = group.fares.reduce((sum, f) => sum + f.durationMin, 0) / group.fares.length;
    
    // Get all departure times
    const departureTimes = group.fares
      .map(f => f.departureTime)
      .filter(t => t);
    
    return {
      origin: group.origin,
      dest: group.dest,
      transfers: group.transfers,
      priceUSD: Math.round(avgPrice),
      durationMin: Math.round(avgDuration),
      departureTimes: departureTimes,
      sampleCount: group.fares.length
    };
  });
}

// =====================================================
// CONNECTION BUILDING
// =====================================================

/**
 * Build a connection itinerary object
 * @param {Object} leg1 - First leg (flight or train)
 * @param {Object} leg2 - Second leg (train or flight)
 * @param {string} hubCity - Connection hub city code
 * @param {string} connectionType - 'flight-amtrak' or 'amtrak-flight'
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date
 * @returns {Object} Connection itinerary
 */
function buildConnectionItinerary(leg1, leg2, hubCity, connectionType, departDate, returnDate = null) {
  const leg1ArrivalMinutes = leg1.arrivalMinutes;
  const leg2DepartureMinutes = leg2.departureMinutes;
  
  const waitTime = calculateWaitTime(leg1ArrivalMinutes, leg2DepartureMinutes);
  
  // Calculate total duration
  const totalDurationMin = leg1.durationMin + waitTime + leg2.durationMin;
  
  // Calculate total price
  const totalPrice = (leg1.price || 0) + (leg2.price || 0);
  
  // Determine leg types
  const leg1Type = connectionType === 'flight-amtrak' ? 'flight' : 'train';
  const leg2Type = connectionType === 'flight-amtrak' ? 'train' : 'flight';
  
  return {
    type: 'connection',
    connectionType: connectionType,
    legs: [
      {
        legType: leg1Type,
        departure: {
          location: leg1.origin,
          time: leg1.departureTime
        },
        arrival: {
          location: leg1.dest,
          time: leg1.arrivalTime
        },
        duration: formatDuration(leg1.durationMin),
        durationMinutes: leg1.durationMin,
        price: leg1.price,
        priceFormatted: leg1.price ? `$${leg1.price.toFixed(2)}` : null,
        provider: leg1.provider,
        stops: leg1.stops,
        source: leg1.source
      },
      {
        legType: leg2Type,
        departure: {
          location: leg2.origin,
          time: leg2.departureTime
        },
        arrival: {
          location: leg2.dest,
          time: leg2.arrivalTime
        },
        duration: formatDuration(leg2.durationMin),
        durationMinutes: leg2.durationMin,
        price: leg2.price,
        priceFormatted: leg2.price ? `$${leg2.price.toFixed(2)}` : null,
        provider: leg2.provider,
        stops: leg2.stops,
        source: leg2.source
      }
    ],
    transfer: {
      city: hubCity,
      arrivalTime: leg1.arrivalTime,
      departureTime: leg2.departureTime,
      waitTimeMinutes: waitTime,
      waitTimeFormatted: formatDuration(waitTime)
    },
    departure: {
      location: leg1.origin,
      time: leg1.departureTime
    },
    arrival: {
      location: leg2.dest,
      time: leg2.arrivalTime
    },
    duration: formatDuration(totalDurationMin),
    durationMinutes: totalDurationMin,
    departDate: departDate,
    returnDate: returnDate,
    price: totalPrice,
    priceFormatted: `$${totalPrice.toFixed(2)}`,
    currency: 'USD',
    source: 'Connection',
    provider: `${leg1.provider || leg1.source} + ${leg2.provider || leg2.source}`,
    stops: `1 connection at ${hubCity}`,
    bags: null
  };
}

/**
 * Find flight + Amtrak connections
 * User flies to a hub, then takes Amtrak to destination
 * 
 * @param {Array} flightResults - Available flight results from scraper/database
 * @param {string} userOrigin - User's origin city
 * @param {string} userDest - User's destination city
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<Array>} Array of connection itineraries
 */
async function findFlightToAmtrakConnections(flightResults, userOrigin, userDest, departDate, returnDate = null, verbose = false) {
  const connections = [];
  
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCHING: Flight → Amtrak Connections');
    console.log('='.repeat(60));
    console.log(`   User Origin: ${userOrigin}`);
    console.log(`   User Destination: ${userDest}`);
  }
  
  // Step 1: Find Amtrak routes that end at user's destination
  const amtrakToDest = await findAmtrakRoutesToDest(userDest);
  
  if (verbose) {
    console.log(`\n📍 Found ${amtrakToDest.length} Amtrak routes ending at ${userDest}`);
  }
  
  if (amtrakToDest.length === 0) {
    if (verbose) console.log('   ❌ No Amtrak routes to this destination');
    return connections;
  }
  
  // Step 2: Group Amtrak fares and get unique hub cities
  const groupedAmtrak = groupAmtrakFares(amtrakToDest);
  const hubCities = [...new Set(groupedAmtrak.map(f => f.origin))];
  
  if (verbose) {
    console.log(`   Hub cities serving ${userDest}: ${hubCities.join(', ')}`);
  }
  
  // Step 3: For each hub city, find flights from user's origin to that hub
  for (const hubCity of hubCities) {
    if (verbose) {
      console.log(`\n🛫 Checking flights: ${userOrigin} → ${hubCity}`);
    }
    
    // Find flights to this hub (checking all airports that serve this Amtrak station)
    const hubCityUpper = hubCity.toUpperCase();
    const airportsServingHub = amtrakToAirports(hubCityUpper);
    
    const flightsToHub = (flightResults || []).filter(flight => {
      const flightDest = flight.arrival?.location?.toUpperCase().trim();
      // Check if flight arrives at the hub city or any airport serving the same Amtrak station
      return flightDest === hubCityUpper || 
             airportsServingHub.includes(flightDest) ||
             isSameCity(flightDest, hubCityUpper);
    });
    
    if (verbose) {
      console.log(`   Found ${flightsToHub.length} flights to ${hubCity}`);
    }
    
    if (flightsToHub.length === 0) continue;
    
    // Get Amtrak options from this hub to destination
    const amtrakFromHub = groupedAmtrak.filter(f => f.origin.toUpperCase() === hubCity.toUpperCase());
    
    if (verbose) {
      console.log(`   Found ${amtrakFromHub.length} Amtrak options from ${hubCity} to ${userDest}`);
    }
    
    // Step 4: Match flights with Amtrak connections
    for (const flight of flightsToHub) {
      const flightArrivalMinutes = parseTimeToMinutes(flight.arrival?.time);
      
      if (flightArrivalMinutes === null) continue;
      
      for (const amtrak of amtrakFromHub) {
        // Check each departure time for valid connections
        for (const depTime of amtrak.departureTimes) {
          const amtrakDepartureMinutes = parseTimeToMinutes(depTime);
          
          if (amtrakDepartureMinutes === null) continue;
          
          // Check if this is a valid connection
          if (isValidConnectionTime(flightArrivalMinutes, amtrakDepartureMinutes)) {
            const waitTime = calculateWaitTime(flightArrivalMinutes, amtrakDepartureMinutes);
            
            if (verbose) {
              console.log(`   ✅ Valid connection found!`);
              console.log(`      Flight arrives: ${flight.arrival?.time}`);
              console.log(`      Amtrak departs: ${depTime}`);
              console.log(`      Wait time: ${formatDuration(waitTime)}`);
            }
            
            // Calculate Amtrak arrival time
            const amtrakArrivalMinutes = amtrakDepartureMinutes + amtrak.durationMin;
            const amtrakArrivalTime = minutesToTimeString(amtrakArrivalMinutes);
            
            // Build the connection
            const leg1 = {
              origin: userOrigin,
              dest: hubCity,
              departureTime: flight.departure?.time,
              arrivalTime: flight.arrival?.time,
              arrivalMinutes: flightArrivalMinutes,
              durationMin: flight.durationMinutes || 0,
              price: flight.price || 0,
              provider: flight.provider,
              stops: flight.stops,
              source: 'Google Flights'
            };
            
            const leg2 = {
              origin: hubCity,
              dest: userDest,
              departureTime: depTime,
              departureMinutes: amtrakDepartureMinutes,
              arrivalTime: amtrakArrivalTime,
              durationMin: amtrak.durationMin,
              price: amtrak.priceUSD,
              provider: 'Amtrak',
              stops: amtrak.transfers === 0 ? 'Nonstop' : `${amtrak.transfers} transfer${amtrak.transfers > 1 ? 's' : ''}`,
              source: 'Amtrak'
            };
            
            const connection = buildConnectionItinerary(
              leg1, leg2, hubCity, 'flight-amtrak', departDate, returnDate
            );
            
            connections.push(connection);
            
            // Only take the first valid connection per Amtrak route to avoid duplicates
            break;
          }
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`\n📊 Total Flight → Amtrak connections found: ${connections.length}`);
  }
  
  return connections;
}

/**
 * Find Amtrak + Flight connections
 * User takes Amtrak from origin to a hub, then flies to destination
 * 
 * @param {Array} flightResults - Available flight results from scraper/database
 * @param {string} userOrigin - User's origin city
 * @param {string} userDest - User's destination city
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<Array>} Array of connection itineraries
 */
async function findAmtrakToFlightConnections(flightResults, userOrigin, userDest, departDate, returnDate = null, verbose = false) {
  const connections = [];
  
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCHING: Amtrak → Flight Connections');
    console.log('='.repeat(60));
    console.log(`   User Origin: ${userOrigin}`);
    console.log(`   User Destination: ${userDest}`);
  }
  
  // Step 1: Find Amtrak routes that start from user's origin
  const amtrakFromOrigin = await findAmtrakRoutesFromOrigin(userOrigin);
  
  if (verbose) {
    console.log(`\n📍 Found ${amtrakFromOrigin.length} Amtrak routes from ${userOrigin}`);
  }
  
  if (amtrakFromOrigin.length === 0) {
    if (verbose) console.log('   ❌ No Amtrak routes from this origin');
    return connections;
  }
  
  // Step 2: Group Amtrak fares and get unique hub cities
  const groupedAmtrak = groupAmtrakFares(amtrakFromOrigin);
  const hubCities = [...new Set(groupedAmtrak.map(f => f.dest))];
  
  if (verbose) {
    console.log(`   Hub cities reachable from ${userOrigin}: ${hubCities.join(', ')}`);
  }
  
  // Step 3: For each hub city, find flights from that hub to user's destination
  for (const hubCity of hubCities) {
    if (verbose) {
      console.log(`\n🚂 Checking Amtrak: ${userOrigin} → ${hubCity}`);
    }
    
    // Get Amtrak options to this hub
    const amtrakToHub = groupedAmtrak.filter(f => f.dest.toUpperCase() === hubCity.toUpperCase());
    
    // Find flights from this hub to destination (checking all airports that serve this Amtrak station)
    const hubCityUpper = hubCity.toUpperCase();
    const airportsServingHub = amtrakToAirports(hubCityUpper);
    
    const flightsFromHub = (flightResults || []).filter(flight => {
      const flightOrigin = flight.departure?.location?.toUpperCase().trim();
      // Check if flight departs from the hub city or any airport serving the same Amtrak station
      return flightOrigin === hubCityUpper || 
             airportsServingHub.includes(flightOrigin) ||
             isSameCity(flightOrigin, hubCityUpper);
    });
    
    if (verbose) {
      console.log(`   Found ${amtrakToHub.length} Amtrak options to ${hubCity}`);
      console.log(`   Found ${flightsFromHub.length} flights from ${hubCity} to ${userDest}`);
    }
    
    if (flightsFromHub.length === 0) continue;
    
    // Step 4: Match Amtrak with flight connections
    for (const amtrak of amtrakToHub) {
      for (const depTime of amtrak.departureTimes) {
        const amtrakDepartureMinutes = parseTimeToMinutes(depTime);
        if (amtrakDepartureMinutes === null) continue;
        
        // Calculate Amtrak arrival time
        const amtrakArrivalMinutes = amtrakDepartureMinutes + amtrak.durationMin;
        
        for (const flight of flightsFromHub) {
          const flightDepartureMinutes = parseTimeToMinutes(flight.departure?.time);
          
          if (flightDepartureMinutes === null) continue;
          
          // Check if this is a valid connection
          // Need to account for wrap-around (train arrives late, flight next morning)
          let effectiveArrival = amtrakArrivalMinutes % (24 * 60);
          
          if (isValidConnectionTime(effectiveArrival, flightDepartureMinutes)) {
            const waitTime = calculateWaitTime(effectiveArrival, flightDepartureMinutes);
            
            if (verbose) {
              console.log(`   ✅ Valid connection found!`);
              console.log(`      Amtrak departs: ${depTime}`);
              console.log(`      Amtrak arrives: ${minutesToTimeString(effectiveArrival)}`);
              console.log(`      Flight departs: ${flight.departure?.time}`);
              console.log(`      Wait time: ${formatDuration(waitTime)}`);
            }
            
            // Build the connection
            const leg1 = {
              origin: userOrigin,
              dest: hubCity,
              departureTime: depTime,
              arrivalTime: minutesToTimeString(effectiveArrival),
              arrivalMinutes: effectiveArrival,
              durationMin: amtrak.durationMin,
              price: amtrak.priceUSD,
              provider: 'Amtrak',
              stops: amtrak.transfers === 0 ? 'Nonstop' : `${amtrak.transfers} transfer${amtrak.transfers > 1 ? 's' : ''}`,
              source: 'Amtrak'
            };
            
            const leg2 = {
              origin: hubCity,
              dest: userDest,
              departureTime: flight.departure?.time,
              departureMinutes: flightDepartureMinutes,
              arrivalTime: flight.arrival?.time,
              durationMin: flight.durationMinutes || 0,
              price: flight.price || 0,
              provider: flight.provider,
              stops: flight.stops,
              source: 'Google Flights'
            };
            
            const connection = buildConnectionItinerary(
              leg1, leg2, hubCity, 'amtrak-flight', departDate, returnDate
            );
            
            connections.push(connection);
            
            // Only take the first valid connection per flight to avoid duplicates
            break;
          }
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`\n📊 Total Amtrak → Flight connections found: ${connections.length}`);
  }
  
  return connections;
}

/**
 * Build a flight connection itinerary object
 * @param {Object} leg1 - First flight leg
 * @param {Object} leg2 - Second flight leg
 * @param {string} hubCity - Connection hub airport code
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date
 * @returns {Object} Connection itinerary
 */
function buildFlightConnectionItinerary(leg1, leg2, hubCity, departDate, returnDate = null) {
  const leg1ArrivalMinutes = parseTimeToMinutes(leg1.arrival?.time);
  const leg2DepartureMinutes = parseTimeToMinutes(leg2.departure?.time);
  
  const waitTime = calculateWaitTime(leg1ArrivalMinutes, leg2DepartureMinutes);
  
  // Calculate total duration
  const leg1Duration = leg1.durationMinutes || 0;
  const leg2Duration = leg2.durationMinutes || 0;
  const totalDurationMin = leg1Duration + waitTime + leg2Duration;
  
  // Calculate total price
  const totalPrice = (leg1.price || 0) + (leg2.price || 0);
  
  // Get hub info for display
  const hubInfo = getHubInfo(hubCity);
  const hubDisplay = hubInfo ? `${hubInfo.city} (${hubCity})` : hubCity;
  
  return {
    type: 'connection',
    connectionType: 'flight-flight',
    legs: [
      {
        legType: 'flight',
        departure: {
          location: leg1.departure?.location,
          time: leg1.departure?.time
        },
        arrival: {
          location: leg1.arrival?.location,
          time: leg1.arrival?.time
        },
        duration: leg1.duration,
        durationMinutes: leg1Duration,
        price: leg1.price,
        priceFormatted: leg1.price ? `$${leg1.price.toFixed(2)}` : null,
        provider: leg1.provider,
        stops: leg1.stops,
        source: leg1.source || 'Google Flights'
      },
      {
        legType: 'flight',
        departure: {
          location: leg2.departure?.location,
          time: leg2.departure?.time
        },
        arrival: {
          location: leg2.arrival?.location,
          time: leg2.arrival?.time
        },
        duration: leg2.duration,
        durationMinutes: leg2Duration,
        price: leg2.price,
        priceFormatted: leg2.price ? `$${leg2.price.toFixed(2)}` : null,
        provider: leg2.provider,
        stops: leg2.stops,
        source: leg2.source || 'Google Flights'
      }
    ],
    transfer: {
      city: hubCity,
      cityDisplay: hubDisplay,
      arrivalTime: leg1.arrival?.time,
      departureTime: leg2.departure?.time,
      waitTimeMinutes: waitTime,
      waitTimeFormatted: formatDuration(waitTime)
    },
    departure: {
      location: leg1.departure?.location,
      time: leg1.departure?.time
    },
    arrival: {
      location: leg2.arrival?.location,
      time: leg2.arrival?.time
    },
    duration: formatDuration(totalDurationMin),
    durationMinutes: totalDurationMin,
    departDate: departDate,
    returnDate: returnDate,
    price: totalPrice,
    priceFormatted: `$${totalPrice.toFixed(2)}`,
    currency: 'USD',
    source: 'Connection',
    provider: `${leg1.provider || 'Flight'} + ${leg2.provider || 'Flight'}`,
    stops: `1 connection at ${hubDisplay}`,
    bags: null
  };
}

/**
 * Find flight → flight connections via major hub airports
 * User flies to a major hub, then connects to another flight to reach destination
 * 
 * @param {Array} flightResults - Available flight results from scraper/database
 * @param {string} userOrigin - User's origin city/airport
 * @param {string} userDest - User's destination city/airport
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Array} Array of flight connection itineraries
 */
function findFlightToFlightConnections(flightResults, userOrigin, userDest, departDate, returnDate = null, verbose = false) {
  const connections = [];
  
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCHING: Flight → Flight Connections (via Hub Airport)');
    console.log('='.repeat(60));
    console.log(`   User Origin: ${userOrigin}`);
    console.log(`   User Destination: ${userDest}`);
  }
  
  if (!flightResults || flightResults.length === 0) {
    if (verbose) console.log('   ❌ No flight results available');
    return connections;
  }
  
  const hubCodes = getMajorHubCodes();
  const normalizedOrigin = userOrigin.toUpperCase().trim();
  const normalizedDest = userDest.toUpperCase().trim();
  
  if (verbose) {
    console.log(`\n📍 Major hub airports available: ${hubCodes.length}`);
  }
  
  // Group flights by their departure and arrival locations for faster lookup
  const flightsByDeparture = new Map();
  const flightsByArrival = new Map();
  
  for (const flight of flightResults) {
    const depLoc = flight.departure?.location?.toUpperCase().trim();
    const arrLoc = flight.arrival?.location?.toUpperCase().trim();
    
    if (depLoc) {
      if (!flightsByDeparture.has(depLoc)) {
        flightsByDeparture.set(depLoc, []);
      }
      flightsByDeparture.get(depLoc).push(flight);
    }
    
    if (arrLoc) {
      if (!flightsByArrival.has(arrLoc)) {
        flightsByArrival.set(arrLoc, []);
      }
      flightsByArrival.get(arrLoc).push(flight);
    }
  }
  
  // For each hub, check if we can connect through it
  for (const hubCode of hubCodes) {
    // Skip if hub is origin or destination
    if (hubCode === normalizedOrigin || hubCode === normalizedDest) {
      continue;
    }
    
    // Find flights FROM origin TO hub
    const flightsToHub = (flightsByArrival.get(hubCode) || []).filter(f => 
      f.departure?.location?.toUpperCase().trim() === normalizedOrigin
    );
    
    // Find flights FROM hub TO destination
    const flightsFromHub = (flightsByDeparture.get(hubCode) || []).filter(f =>
      f.arrival?.location?.toUpperCase().trim() === normalizedDest
    );
    
    if (flightsToHub.length === 0 || flightsFromHub.length === 0) {
      continue;
    }
    
    if (verbose) {
      const hubInfo = getHubInfo(hubCode);
      console.log(`\n✈️  Checking hub: ${hubCode} (${hubInfo?.city || 'Unknown'})`);
      console.log(`   Flights to hub: ${flightsToHub.length}`);
      console.log(`   Flights from hub: ${flightsFromHub.length}`);
    }
    
    // Try to find valid connections
    let foundConnection = false;
    
    for (const flight1 of flightsToHub) {
      if (foundConnection) break; // Only find one connection per hub
      
      const flight1ArrivalMinutes = parseTimeToMinutes(flight1.arrival?.time);
      if (flight1ArrivalMinutes === null) continue;
      
      for (const flight2 of flightsFromHub) {
        const flight2DepartureMinutes = parseTimeToMinutes(flight2.departure?.time);
        if (flight2DepartureMinutes === null) continue;
        
        // Check if this is a valid connection
        if (isValidConnectionTime(flight1ArrivalMinutes, flight2DepartureMinutes)) {
          const waitTime = calculateWaitTime(flight1ArrivalMinutes, flight2DepartureMinutes);
          
          if (verbose) {
            console.log(`   ✅ Valid connection found!`);
            console.log(`      Flight 1: ${flight1.departure?.time} → ${flight1.arrival?.time} (${flight1.provider})`);
            console.log(`      Flight 2: ${flight2.departure?.time} → ${flight2.arrival?.time} (${flight2.provider})`);
            console.log(`      Wait time: ${formatDuration(waitTime)}`);
          }
          
          // Build the connection itinerary
          const connection = buildFlightConnectionItinerary(
            flight1, flight2, hubCode, departDate, returnDate
          );
          
          connections.push(connection);
          foundConnection = true;
          break; // Only take first valid connection per hub
        }
      }
    }
  }
  
  if (verbose) {
    console.log(`\n📊 Total Flight → Flight connections found: ${connections.length}`);
  }
  
  return connections;
}

/**
 * Main function to build all connections
 * 
 * @param {Array} flightResults - Flight results from scraper/database
 * @param {Array} trainResults - Train results (not used directly, but kept for API compatibility)
 * @param {string} origin - User's origin
 * @param {string} destination - User's destination
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<Array>} All connection itineraries
 */
export async function buildConnections(flightResults, trainResults, origin, destination, departDate, returnDate = null, verbose = false) {
  if (verbose) {
    console.log('\n' + '═'.repeat(70));
    console.log('🔗 CONNECTION SERVICE - Building Combined Itineraries');
    console.log('═'.repeat(70));
    console.log(`📍 Origin: ${origin}`);
    console.log(`📍 Destination: ${destination}`);
    console.log(`📅 Date: ${departDate}`);
    console.log(`🔄 Round trip: ${returnDate ? 'Yes (' + returnDate + ')' : 'No'}`);
    console.log(`✈️  Available flights: ${flightResults?.length || 0}`);
  }
  
  const allConnections = [];
  
  // Scenario 1: Flight → Amtrak
  const flightToAmtrak = await findFlightToAmtrakConnections(
    flightResults, origin, destination, departDate, returnDate, verbose
  );
  allConnections.push(...flightToAmtrak);
  
  // Scenario 2: Amtrak → Flight
  const amtrakToFlight = await findAmtrakToFlightConnections(
    flightResults, origin, destination, departDate, returnDate, verbose
  );
  allConnections.push(...amtrakToFlight);
  
  // Scenario 3: Flight → Flight (via major hub airport)
  const flightToFlight = findFlightToFlightConnections(
    flightResults, origin, destination, departDate, returnDate, verbose
  );
  allConnections.push(...flightToFlight);
  
  // Sort by total price
  allConnections.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  
  if (verbose) {
    console.log('\n' + '═'.repeat(70));
    console.log(`📊 TOTAL CONNECTIONS FOUND: ${allConnections.length}`);
    console.log('═'.repeat(70));
    
    if (allConnections.length > 0) {
      console.log('\n🏆 Top 5 connections by price:');
      allConnections.slice(0, 5).forEach((conn, i) => {
        console.log(`\n   ${i + 1}. ${conn.priceFormatted} - ${conn.duration}`);
        console.log(`      ${conn.legs[0].departure.location} → ${conn.transfer.city} → ${conn.legs[1].arrival.location}`);
        console.log(`      ${conn.legs[0].legType}: ${conn.legs[0].departure.time} → ${conn.legs[0].arrival.time} (${conn.legs[0].provider})`);
        console.log(`      Wait: ${conn.transfer.waitTimeFormatted} at ${conn.transfer.city}`);
        console.log(`      ${conn.legs[1].legType}: ${conn.legs[1].departure.time} → ${conn.legs[1].arrival.time} (${conn.legs[1].provider})`);
      });
    }
  }
  
  return allConnections;
}

/**
 * Find all potential hub connections for a route
 * This function can be called independently to see what hubs connect two cities
 * 
 * @param {string} origin - Origin city code
 * @param {string} destination - Destination city code
 * @param {boolean} verbose - Whether to log verbose output
 * @returns {Promise<Object>} Object with potential hubs for each direction
 */
export async function findPotentialHubs(origin, destination, verbose = false) {
  const normalizedOrigin = origin.toUpperCase().trim();
  const normalizedDest = destination.toUpperCase().trim();
  
  // Find Amtrak routes ending at destination (for Flight → Amtrak)
  const amtrakToDest = await findAmtrakRoutesToDest(normalizedDest);
  const hubsForFlightAmtrak = [...new Set(amtrakToDest.map(f => f.origin))];
  
  // Get airport codes for each Amtrak hub (for searching flights)
  // This handles cases like CHI (Amtrak) -> ORD (airport)
  const airportCodesForFlightAmtrak = [];
  for (const hub of hubsForFlightAmtrak) {
    const airports = amtrakToAirports(hub);
    airportCodesForFlightAmtrak.push(...airports);
  }
  const uniqueAirportsFlightAmtrak = [...new Set(airportCodesForFlightAmtrak)];
  
  // Find Amtrak routes starting from origin (for Amtrak → Flight)
  const amtrakFromOrigin = await findAmtrakRoutesFromOrigin(normalizedOrigin);
  const hubsForAmtrakFlight = [...new Set(amtrakFromOrigin.map(f => f.dest))];
  
  // Get airport codes for each Amtrak hub
  const airportCodesForAmtrakFlight = [];
  for (const hub of hubsForAmtrakFlight) {
    const airports = amtrakToAirports(hub);
    airportCodesForAmtrakFlight.push(...airports);
  }
  const uniqueAirportsAmtrakFlight = [...new Set(airportCodesForAmtrakFlight)];
  
  // Get all major hub airports for flight connections (excluding origin/dest)
  // Also exclude codes that are the same city as origin/dest
  const flightHubs = getMajorHubCodes().filter(
    h => h !== normalizedOrigin && 
         h !== normalizedDest &&
         !isSameCity(h, normalizedOrigin) &&
         !isSameCity(h, normalizedDest)
  );
  
  const result = {
    origin: normalizedOrigin,
    destination: normalizedDest,
    flightToAmtrak: {
      description: `Fly to hub, then Amtrak to ${normalizedDest}`,
      hubs: hubsForFlightAmtrak,           // Amtrak station codes
      airportCodes: uniqueAirportsFlightAmtrak,  // Corresponding airport codes for flight search
      routeCount: amtrakToDest.length
    },
    amtrakToFlight: {
      description: `Amtrak from ${normalizedOrigin} to hub, then fly`,
      hubs: hubsForAmtrakFlight,           // Amtrak station codes
      airportCodes: uniqueAirportsAmtrakFlight,  // Corresponding airport codes for flight search
      routeCount: amtrakFromOrigin.length
    },
    flightToFlight: {
      description: `Fly to major hub, then connect to ${normalizedDest}`,
      hubs: flightHubs,
      hubCount: flightHubs.length
    }
  };
  
  if (verbose) {
    console.log('\n' + '═'.repeat(60));
    console.log('🔍 POTENTIAL HUBS ANALYSIS');
    console.log('═'.repeat(60));
    console.log(`Origin: ${normalizedOrigin}`);
    console.log(`Destination: ${normalizedDest}`);
    console.log('\n📍 Flight → Amtrak hubs:');
    console.log(`   Amtrak stations: ${hubsForFlightAmtrak.length > 0 ? hubsForFlightAmtrak.join(', ') : 'None found'}`);
    console.log(`   Airport codes:   ${uniqueAirportsFlightAmtrak.length > 0 ? uniqueAirportsFlightAmtrak.join(', ') : 'Same as above'}`);
    console.log('\n📍 Amtrak → Flight hubs:');
    console.log(`   Amtrak stations: ${hubsForAmtrakFlight.length > 0 ? hubsForAmtrakFlight.join(', ') : 'None found'}`);
    console.log(`   Airport codes:   ${uniqueAirportsAmtrakFlight.length > 0 ? uniqueAirportsAmtrakFlight.join(', ') : 'Same as above'}`);
    console.log('\n✈️  Flight → Flight hubs (major airports):');
    console.log(`   ${flightHubs.slice(0, 10).join(', ')}${flightHubs.length > 10 ? ` ... and ${flightHubs.length - 10} more` : ''}`);
  }
  
  return result;
}

// Export for testing
export {
  loadFaresData,
  loadStationsData,
  parseTimeToMinutes,
  minutesToTimeString,
  isValidConnectionTime,
  findAmtrakRoutesToDest,
  findAmtrakRoutesFromOrigin,
  getMajorHubCodes,
  getHubInfo,
  findFlightToFlightConnections,
  MAJOR_HUB_AIRPORTS,
  // Airport/Amtrak code mapping helpers
  AIRPORT_TO_AMTRAK_MAP,
  AMTRAK_TO_AIRPORTS_MAP,
  airportToAmtrak,
  amtrakToAirports,
  isSameCity
};
