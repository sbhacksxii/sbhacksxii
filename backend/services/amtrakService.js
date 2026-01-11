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
  clearCache,
  // Export for testing
  loadFaresData,
  loadStationsData,
  dateDiffInDays,
  normalizeCode
};
