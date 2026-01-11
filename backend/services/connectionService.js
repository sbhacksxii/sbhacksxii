/**
 * Connection Service
 * Builds combined train + flight itineraries by connecting existing results
 * Uses graph-based path finding to support multi-hub connections
 */

import { readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

// Get the directory of the current module for resolving data paths
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Cache for stations data (hub cities)
let stationsData = null;

/**
 * Load stations data to identify valid hub cities
 * @returns {Promise<Array>} Array of station objects with code and city
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
    console.error('⚠️ [CONNECTIONS] Failed to load stations data:', error.message);
    stationsData = [];
    return stationsData;
  }
}

/**
 * Get set of valid hub city codes (normalized to uppercase)
 * @returns {Promise<Set<string>>} Set of hub city codes
 */
async function getValidHubCodes() {
  const stations = await loadStationsData();
  return new Set(stations.map(s => s.code.toUpperCase()));
}

/**
 * Parse time string (e.g., "6:00 AM", "2:30 PM") to minutes since midnight
 * @param {string} timeStr - Time string in format "HH:MM AM/PM"
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
 * Check if two city names match (case-insensitive)
 * @param {string} city1 - First city name
 * @param {string} city2 - Second city name
 * @returns {boolean} True if cities match
 */
function citiesMatch(city1, city2) {
  if (!city1 || !city2) return false;
  return city1.trim().toUpperCase() === city2.trim().toUpperCase();
}

/**
 * Check if a connection is valid (meets minimum transfer time and maximum waiting time)
 * @param {number} arrivalMinutes - Arrival time in minutes since midnight
 * @param {number} departureMinutes - Departure time in minutes since midnight
 * @param {number} minTransferMinutes - Minimum transfer time (default: 45)
 * @param {number} maxWaitMinutes - Maximum waiting time (default: 240 = 4 hours)
 * @returns {boolean} True if connection is valid
 */
function isValidConnection(arrivalMinutes, departureMinutes, minTransferMinutes = 45, maxWaitMinutes = 240) {
  if (arrivalMinutes === null || departureMinutes === null) return false;
  
  const waitTime = departureMinutes - arrivalMinutes;
  
  // Must have minimum transfer time
  if (waitTime < minTransferMinutes) return false;
  
  // Must not exceed maximum waiting time
  if (waitTime > maxWaitMinutes) return false;
  
  // Departure must be after arrival (chronological validity)
  if (departureMinutes <= arrivalMinutes) return false;
  
  return true;
}

/**
 * Build a graph adjacency list from flight and train results
 * @param {Array} allResults - Combined array of flight and train results
 * @returns {Object} Graph as adjacency list: { cityCode: [{ journey, toCity, ... }] }
 */
function buildGraph(allResults) {
  const graph = {};
  
  for (const journey of allResults) {
    const fromCity = journey.departure?.location;
    const toCity = journey.arrival?.location;
    const depTime = journey.departure?.time;
    const arrTime = journey.arrival?.time;
    
    if (!fromCity || !toCity || !depTime || !arrTime) continue;
    
    const fromCityUpper = fromCity.toUpperCase();
    const toCityUpper = toCity.toUpperCase();
    
    if (!graph[fromCityUpper]) {
      graph[fromCityUpper] = [];
    }
    
    graph[fromCityUpper].push({
      journey,
      toCity: toCityUpper,
      departureMinutes: parseTimeToMinutes(depTime),
      arrivalMinutes: parseTimeToMinutes(arrTime)
    });
  }
  
  return graph;
}

/**
 * Find all valid paths from origin to destination using BFS
 * @param {Object} graph - Graph adjacency list
 * @param {string} origin - Origin city code
 * @param {string} destination - Destination city code
 * @param {Set<string>} validHubs - Set of valid hub city codes
 * @param {number} maxDepth - Maximum path length (default: 4)
 * @returns {Array} Array of paths, where each path is an array of journey objects
 */
function findPaths(graph, origin, destination, validHubs, maxDepth = 4) {
  const originUpper = origin.toUpperCase();
  const destUpper = destination.toUpperCase();
  const paths = [];
  
  // Queue: [currentCity, path, lastArrivalMinutes]
  const queue = [[originUpper, [], null]];
  
  while (queue.length > 0) {
    const [currentCity, path, lastArrivalMinutes] = queue.shift();
    
    // If we've reached destination, save this path
    if (citiesMatch(currentCity, destUpper)) {
      if (path.length > 0) {
        paths.push([...path]);
      }
      continue;
    }
    
    // Skip if path is too long
    if (path.length >= maxDepth) continue;
    
    // Get outgoing edges from current city
    const edges = graph[currentCity] || [];
    
    for (const edge of edges) {
      const { journey, toCity, departureMinutes, arrivalMinutes } = edge;
      
      // Skip if invalid times
      if (departureMinutes === null || arrivalMinutes === null) continue;
      
      // For first leg, any departure time is valid
      // For subsequent legs, validate connection time
      if (lastArrivalMinutes !== null) {
        if (!isValidConnection(lastArrivalMinutes, departureMinutes)) {
          continue;
        }
      }
      
      // If going to an intermediate city (hub), it must be in validHubs or be the destination
      // Allow destination even if not in hubs list
      if (!citiesMatch(toCity, destUpper) && !validHubs.has(toCity)) {
        continue;
      }
      
      // Avoid cycles: don't revisit cities (except destination)
      if (!citiesMatch(toCity, destUpper) && path.some(leg => 
        citiesMatch(leg.arrival?.location, toCity)
      )) {
        continue;
      }
      
      // Add to queue
      queue.push([toCity, [...path, journey], arrivalMinutes]);
    }
  }
  
  return paths;
}

/**
 * Build unified itinerary from a path of journeys
 * @param {Array} path - Array of journey result objects
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date (if roundtrip)
 * @returns {Object} Unified itinerary object
 */
function buildItineraryFromPath(path, departDate, returnDate = null) {
  if (path.length === 0) return null;
  
  const firstLeg = path[0];
  const lastLeg = path[path.length - 1];
  
  // Identify hub cities (intermediate cities)
  const hubs = [];
  for (let i = 0; i < path.length - 1; i++) {
    const hubCity = path[i].arrival?.location;
    if (hubCity) {
      hubs.push({
        city: hubCity,
        arrivalTime: path[i].arrival?.time,
        departureTime: path[i + 1].departure?.time,
        waitTimeMinutes: (() => {
          const arr = parseTimeToMinutes(path[i].arrival?.time);
          const dep = parseTimeToMinutes(path[i + 1].departure?.time);
          return (arr !== null && dep !== null) ? dep - arr : null;
        })()
      });
    }
  }
  
  // Calculate total duration
  let totalDurationMinutes = 0;
  for (let i = 0; i < path.length; i++) {
    totalDurationMinutes += path[i].durationMinutes || 0;
    if (i < path.length - 1) {
      const arr = parseTimeToMinutes(path[i].arrival?.time);
      const dep = parseTimeToMinutes(path[i + 1].departure?.time);
      if (arr !== null && dep !== null) {
        totalDurationMinutes += dep - arr; // Add wait time
      }
    }
  }
  
  // Format total duration
  const hours = Math.floor(totalDurationMinutes / 60);
  const minutes = totalDurationMinutes % 60;
  let totalDuration = '';
  if (hours > 0) totalDuration += `${hours} hr${hours > 1 ? 's' : ''}`;
  if (minutes > 0) totalDuration += `${totalDuration ? ' ' : ''}${minutes} min`;
  if (!totalDuration) totalDuration = 'N/A';
  
  // Calculate total price
  let totalPrice = null;
  let totalPriceFormatted = null;
  const prices = path.map(leg => leg.price).filter(p => p !== null && p !== undefined);
  if (prices.length > 0) {
    totalPrice = prices.reduce((sum, p) => sum + p, 0);
    totalPriceFormatted = `$${totalPrice.toFixed(2)}`;
  }
  
  // Build provider string
  const providers = path.map(leg => leg.provider || leg.source).filter(Boolean);
  const providerStr = providers.join(' + ');
  
  return {
    type: 'connection',
    legs: path.map(leg => ({
      ...leg,
      legType: leg.source === 'Google Flights' ? 'flight' : 'train'
    })),
    hubs: hubs.length > 0 ? hubs : null,
    transfer: hubs.length > 0 ? hubs[0] : null, // For backward compatibility
    departure: {
      location: firstLeg.departure?.location,
      time: firstLeg.departure?.time
    },
    arrival: {
      location: lastLeg.arrival?.location,
      time: lastLeg.arrival?.time
    },
    duration: totalDuration,
    durationMinutes: totalDurationMinutes,
    departDate: departDate,
    returnDate: returnDate || null,
    price: totalPrice,
    priceFormatted: totalPriceFormatted,
    currency: 'USD',
    source: 'Connection',
    provider: providerStr,
    stops: null,
    bags: null
  };
}

/**
 * Build all possible connections using graph-based path finding
 * @param {Array} flightResults - Array of flight results
 * @param {Array} trainResults - Array of train results
 * @param {string} origin - Origin city
 * @param {string} destination - Destination city
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date (if roundtrip)
 * @returns {Promise<Array>} Array of all connection itineraries
 */
async function buildConnectionsGraph(flightResults, trainResults, origin, destination, departDate, returnDate = null) {
  // Combine all results
  const allResults = [];
  if (flightResults && flightResults.length > 0) {
    allResults.push(...flightResults);
  }
  if (trainResults && trainResults.length > 0) {
    allResults.push(...trainResults);
  }
  
  if (allResults.length === 0) return [];
  
  // Get valid hub cities
  const validHubs = await getValidHubCodes();
  
  // Build graph
  const graph = buildGraph(allResults);
  
  // Find all valid paths
  const paths = findPaths(graph, origin, destination, validHubs, 4);
  
  // Build itineraries from paths
  const connections = [];
  for (const path of paths) {
    const itinerary = buildItineraryFromPath(path, departDate, returnDate);
    if (itinerary) {
      connections.push(itinerary);
    }
  }
  
  return connections;
}

/**
 * Build all possible connections from flight and train results
 * Uses graph-based path finding to support multi-hub connections
 * @param {Array} flightResults - Array of flight results
 * @param {Array} trainResults - Array of train results
 * @param {string} origin - Origin city
 * @param {string} destination - Destination city
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date (if roundtrip)
 * @returns {Promise<Array>} Array of all connection itineraries
 */
export async function buildConnections(flightResults, trainResults, origin, destination, departDate, returnDate = null) {
  return await buildConnectionsGraph(flightResults, trainResults, origin, destination, departDate, returnDate);
}
