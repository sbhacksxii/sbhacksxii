/**
 * =====================================================
 * AMTRAK FARE LOOKUP SERVICE
 * =====================================================
 * 
 * This service provides fare lookup functionality for Amtrak trains
 * using a static JSON dataset of manually collected fares.
 * 
 * HOW THE LOOKUP WORKS:
 * ---------------------
 * 1. The service loads fare data from a JSON file on startup
 * 2. When a fare is requested, it first looks for an exact match
 *    (same origin, destination, and date)
 * 3. If no exact match exists, it finds all fares for that route
 *    and returns the one with the closest date, marking it as "estimated"
 * 4. If no route exists at all, it returns null
 * 
 * The "estimated" flag helps the frontend indicate to users that
 * the displayed fare is an approximation based on nearby dates,
 * not the actual fare for their requested date.
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module for resolving data paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// =====================================================
// DATA LOADING
// =====================================================

// In-memory cache for fare data (loaded once at startup)
let faresData = null;
let stationsData = null;

/**
 * Loads the Amtrak fares JSON file into memory.
 * This is called once when the service is first used.
 * 
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
    console.log(`✅ [AMTRAK] Loaded ${faresData.length} fare records`);
    return faresData;
  } catch (error) {
    console.error('❌ [AMTRAK] Failed to load fares data:', error.message);
    faresData = [];
    return faresData;
  }
}

/**
 * Loads the Amtrak stations JSON file into memory.
 * 
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
    console.log(`✅ [AMTRAK] Loaded ${stationsData.length} station records`);
    return stationsData;
  } catch (error) {
    console.error('❌ [AMTRAK] Failed to load stations data:', error.message);
    stationsData = [];
    return stationsData;
  }
}

// =====================================================
// HELPER FUNCTIONS
// =====================================================

/**
 * Parses a date string into a Date object.
 * Handles YYYY-MM-DD format.
 * 
 * @param {string} dateStr - Date in YYYY-MM-DD format
 * @returns {Date} Parsed date object
 */
function parseDate(dateStr) {
  return new Date(dateStr + 'T00:00:00');
}

/**
 * Calculates the absolute difference in days between two dates.
 * 
 * @param {string} date1 - First date (YYYY-MM-DD)
 * @param {string} date2 - Second date (YYYY-MM-DD)
 * @returns {number} Absolute difference in days
 */
function dateDiffInDays(date1, date2) {
  const d1 = parseDate(date1);
  const d2 = parseDate(date2);
  const diffMs = Math.abs(d1.getTime() - d2.getTime());
  return Math.floor(diffMs / (1000 * 60 * 60 * 24));
}

/**
 * Normalizes a station code to uppercase.
 * 
 * @param {string} code - Station code
 * @returns {string} Normalized station code
 */
function normalizeCode(code) {
  return code?.toUpperCase()?.trim() || '';
}

// =====================================================
// MAIN LOOKUP FUNCTION
// =====================================================

/**
 * Looks up an Amtrak fare for a given route and date.
 * 
 * @param {string} origin - Origin station code (e.g., "SBA")
 * @param {string} dest - Destination station code (e.g., "LAX")
 * @param {string} date - Travel date in YYYY-MM-DD format
 * @returns {Promise<AmtrakFareResult|null>} Fare result or null if route doesn't exist
 * 
 * @typedef {Object} AmtrakFareResult
 * @property {string} origin - Origin station code
 * @property {string} dest - Destination station code
 * @property {string} queriedDate - The date that was requested
 * @property {string} matchedDate - The date of the fare that was found
 * @property {number} priceUSD - Fare price in USD
 * @property {number} durationMin - Trip duration in minutes
 * @property {number} transfers - Number of transfers
 * @property {boolean} isEstimated - True if fare is from a nearby date (not exact match)
 */
async function getAmtrakFare(origin, dest, date) {
  // Validate inputs
  if (!origin || !dest || !date) {
    console.warn('⚠️ [AMTRAK] Missing required parameters:', { origin, dest, date });
    return null;
  }

  // Normalize station codes
  const normalizedOrigin = normalizeCode(origin);
  const normalizedDest = normalizeCode(dest);

  // Load fare data
  const fares = await loadFaresData();

  // Step 1: Find all fares for this route
  const routeFares = fares.filter(
    fare => normalizeCode(fare.origin) === normalizedOrigin &&
            normalizeCode(fare.dest) === normalizedDest
  );

  // If no fares exist for this route, return null
  if (routeFares.length === 0) {
    console.log(`❌ [AMTRAK] No fares found for route: ${normalizedOrigin} → ${normalizedDest}`);
    return null;
  }

  // Step 2: Look for an exact date match
  const exactMatch = routeFares.find(fare => fare.date === date);

  if (exactMatch) {
    console.log(`✅ [AMTRAK] Exact match found for ${normalizedOrigin} → ${normalizedDest} on ${date}`);
    return {
      origin: normalizedOrigin,
      dest: normalizedDest,
      queriedDate: date,
      matchedDate: exactMatch.date,
      priceUSD: exactMatch.priceUSD,
      durationMin: exactMatch.durationMin,
      transfers: exactMatch.transfers,
      isEstimated: false
    };
  }

  // Step 3: No exact match - find the closest date
  let closestFare = null;
  let closestDiff = Infinity;

  for (const fare of routeFares) {
    const diff = dateDiffInDays(date, fare.date);
    if (diff < closestDiff) {
      closestDiff = diff;
      closestFare = fare;
    }
  }

  if (closestFare) {
    console.log(`📅 [AMTRAK] Estimated fare for ${normalizedOrigin} → ${normalizedDest}: ` +
                `queried ${date}, using ${closestFare.date} (${closestDiff} days diff)`);
    return {
      origin: normalizedOrigin,
      dest: normalizedDest,
      queriedDate: date,
      matchedDate: closestFare.date,
      priceUSD: closestFare.priceUSD,
      durationMin: closestFare.durationMin,
      transfers: closestFare.transfers,
      isEstimated: true
    };
  }

  // Should never reach here, but just in case
  return null;
}

// =====================================================
// ADDITIONAL UTILITY FUNCTIONS
// =====================================================

/**
 * Gets all available stations.
 * 
 * @returns {Promise<Array>} Array of station objects
 */
async function getStations() {
  return await loadStationsData();
}

/**
 * Gets a station by its code.
 * 
 * @param {string} code - Station code
 * @returns {Promise<Object|null>} Station object or null if not found
 */
async function getStationByCode(code) {
  const stations = await loadStationsData();
  const normalizedCode = normalizeCode(code);
  return stations.find(s => normalizeCode(s.code) === normalizedCode) || null;
}

/**
 * Gets all available routes in the fare dataset.
 * 
 * @returns {Promise<Array>} Array of unique route objects {origin, dest}
 */
async function getAvailableRoutes() {
  const fares = await loadFaresData();
  const routeSet = new Set();
  const routes = [];

  for (const fare of fares) {
    const key = `${fare.origin}-${fare.dest}`;
    if (!routeSet.has(key)) {
      routeSet.add(key);
      routes.push({ origin: fare.origin, dest: fare.dest });
    }
  }

  return routes;
}

/**
 * Gets all fares for a route (for all dates).
 * 
 * @param {string} origin - Origin station code
 * @param {string} dest - Destination station code
 * @returns {Promise<Array>} Array of all fare objects for this route
 */
async function getAllFaresForRoute(origin, dest) {
  const normalizedOrigin = normalizeCode(origin);
  const normalizedDest = normalizeCode(dest);
  const fares = await loadFaresData();
  
  return fares.filter(
    fare => normalizeCode(fare.origin) === normalizedOrigin &&
            normalizeCode(fare.dest) === normalizedDest
  );
}

/**
 * Finds a station code by city name (fuzzy matching).
 * 
 * @param {string} cityName - City name to search for
 * @returns {Promise<string|null>} Station code or null if not found
 */
async function findStationCodeByCity(cityName) {
  if (!cityName) return null;
  
  const stations = await loadStationsData();
  const searchName = cityName.toLowerCase().trim();
  
  // Try exact match first
  let station = stations.find(s => 
    s.city.toLowerCase() === searchName ||
    s.name.toLowerCase().includes(searchName)
  );
  
  if (station) return station.code;
  
  // Try partial match
  station = stations.find(s => 
    s.city.toLowerCase().includes(searchName) ||
    searchName.includes(s.city.toLowerCase())
  );
  
  if (station) return station.code;
  
  // Try matching common city name patterns
  const cityWords = searchName.split(/\s+/);
  for (const word of cityWords) {
    if (word.length < 3) continue;
    station = stations.find(s => 
      s.city.toLowerCase().includes(word) ||
      s.name.toLowerCase().includes(word)
    );
    if (station) return station.code;
  }
  
  return null;
}

/**
 * Parse time string (e.g., "6:53 AM", "12:40 PM") to minutes since midnight
 * @param {string} timeStr - Time string in format "H:MM AM/PM"
 * @returns {number|null} Minutes since midnight, or null if invalid
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
 * Convert minutes since midnight to time string (e.g., 413 -> "6:53 AM")
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string in format "H:MM AM/PM"
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
 * Groups similar trains and averages their prices and times.
 * Similar trains are those with the same origin, dest, transfers, and similar duration.
 * 
 * @param {Array} fares - Array of fare objects
 * @param {number} maxResults - Maximum number of grouped results to return (default: 5)
 * @param {number} durationTolerance - Tolerance for duration grouping in minutes (default: 30)
 * @returns {Array} Array of grouped and averaged fare objects
 */
function groupAndAverageTrains(fares, maxResults = 5, durationTolerance = 30) {
  if (!fares || fares.length === 0) return [];
  
  // Group by origin, dest, transfers, and similar duration
  const groups = new Map();
  
  for (const fare of fares) {
    // Create a key based on route and characteristics
    const durationBucket = Math.floor(fare.durationMin / durationTolerance) * durationTolerance;
    const key = `${fare.origin}-${fare.dest}-${fare.transfers}-${durationBucket}`;
    
    if (!groups.has(key)) {
      groups.set(key, {
        origin: fare.origin,
        dest: fare.dest,
        transfers: fare.transfers,
        durationMin: fare.durationMin,
        prices: [],
        dates: [],
        departureTimes: [] // Collect departure times
      });
    }
    
    const group = groups.get(key);
    group.prices.push(fare.priceUSD);
    group.dates.push(fare.date);
    // Update duration to average (or keep representative)
    group.durationMin = fare.durationMin;
    
    // Collect departure times if available
    if (fare.departureTime) {
      const timeInMinutes = parseTimeToMinutes(fare.departureTime);
      if (timeInMinutes !== null) {
        group.departureTimes.push(timeInMinutes);
      }
    }
  }
  
  // Convert groups to averaged results
  const results = Array.from(groups.values()).map(group => {
    const avgPrice = group.prices.reduce((sum, price) => sum + price, 0) / group.prices.length;
    const minPrice = Math.min(...group.prices);
    const maxPrice = Math.max(...group.prices);
    
    // Calculate average departure time
    let avgDepartureTime = null;
    let avgDepartureTimeMinutes = null;
    if (group.departureTimes.length > 0) {
      // Handle circular time (e.g., average of 11 PM and 1 AM should be midnight, not 12 PM)
      // Convert to complex plane to handle wrap-around, then average
      const timesInRadians = group.departureTimes.map(min => (min / (24 * 60)) * 2 * Math.PI);
      const avgCos = timesInRadians.reduce((sum, r) => sum + Math.cos(r), 0) / timesInRadians.length;
      const avgSin = timesInRadians.reduce((sum, r) => sum + Math.sin(r), 0) / timesInRadians.length;
      const avgAngle = Math.atan2(avgSin, avgCos);
      avgDepartureTimeMinutes = Math.round((avgAngle / (2 * Math.PI)) * 24 * 60);
      if (avgDepartureTimeMinutes < 0) avgDepartureTimeMinutes += 24 * 60;
      avgDepartureTime = minutesToTimeString(avgDepartureTimeMinutes);
    }
    
    return {
      origin: group.origin,
      dest: group.dest,
      transfers: group.transfers,
      durationMin: group.durationMin,
      priceUSD: Math.round(avgPrice * 100) / 100, // Round to 2 decimal places
      minPriceUSD: minPrice,
      maxPriceUSD: maxPrice,
      sampleCount: group.prices.length,
      dates: group.dates,
      departureTime: avgDepartureTime,
      departureTimeMinutes: avgDepartureTimeMinutes
    };
  });
  
  // Sort by average price and return top results
  results.sort((a, b) => a.priceUSD - b.priceUSD);
  return results.slice(0, maxResults);
}

/**
 * Gets grouped and averaged train results for a route.
 * 
 * @param {string} origin - Origin station code or city name
 * @param {string} dest - Destination station code or city name
 * @param {number} maxResults - Maximum number of results to return
 * @returns {Promise<Array>} Array of grouped and averaged train results
 */
async function getGroupedTrainResults(origin, dest, maxResults = 5) {
  // Normalize input first
  const normalizedOrigin = normalizeCode(origin);
  const normalizedDest = normalizeCode(dest);
  
  // Try to find station codes (handles both codes and city names)
  let originCode = normalizedOrigin;
  let destCode = normalizedDest;
  
  // If it doesn't look like a station code (more than 4 chars), try city lookup
  if (originCode.length > 4) {
    const foundCode = await findStationCodeByCity(origin);
    if (foundCode) {
      originCode = foundCode;
    } else {
      // If city lookup fails, return empty array
      return [];
    }
  }
  
  if (destCode.length > 4) {
    const foundCode = await findStationCodeByCity(dest);
    if (foundCode) {
      destCode = foundCode;
    } else {
      // If city lookup fails, return empty array
      return [];
    }
  }
  
  // Get all fares for this route
  const fares = await getAllFaresForRoute(originCode, destCode);
  
  if (fares.length === 0) {
    return [];
  }
  
  // Group and average similar trains
  return groupAndAverageTrains(fares, maxResults);
}

/**
 * Clears the in-memory cache (useful for testing or refreshing data).
 */
function clearCache() {
  faresData = null;
  stationsData = null;
  console.log('🔄 [AMTRAK] Cache cleared');
}

// =====================================================
// EXPORTS
// =====================================================

export {
  getAmtrakFare,
  getStations,
  getStationByCode,
  getAvailableRoutes,
  getAllFaresForRoute,
  findStationCodeByCity,
  getGroupedTrainResults,
  groupAndAverageTrains,
  clearCache,
  // Export for testing
  loadFaresData,
  loadStationsData,
  dateDiffInDays,
  normalizeCode
};
