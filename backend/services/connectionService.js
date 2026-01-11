/**
 * Connection Service (OPTIMIZED)
 * Builds combined itineraries for multi-leg journeys
 * 
 * OPTIMIZATIONS:
 * - Uses indexed lookups from amtrakService.js instead of duplicating data
 * - O(1) route lookups instead of O(n) filtering
 * 
 * Three scenarios:
 * 1. FLIGHT → AMTRAK: Fly to a hub city, then take Amtrak to final destination
 * 2. AMTRAK → FLIGHT: Take Amtrak from origin to a hub city, then fly to destination
 * 3. FLIGHT → FLIGHT: Fly to a major hub airport, then connect to another flight
 */

import { 
  getFaresToDest, 
  getFaresFromOrigin, 
  getOriginsTo,
  getDestinationsFrom,
  ensureIndexes,
  loadStationsData
} from './amtrakService.js';

// Minimum connection time in minutes (30 minutes)
const MIN_CONNECTION_MINUTES = 30;

// Maximum wait time for a connection (4 hours)
const MAX_WAIT_MINUTES = 240;

// =====================================================
// MAJOR HUB AIRPORTS FOR FLIGHT CONNECTIONS
// Based on hubs.md - major airports for connecting flights
// Includes lat/lon for geographic corridor filtering
// =====================================================
const MAJOR_HUB_AIRPORTS = [
  { code: 'LAX', city: 'Los Angeles', state: 'CA', lat: 33.9425, lon: -118.4081 },
  { code: 'SBA', city: 'Santa Barbara', state: 'CA', lat: 34.4262, lon: -119.8402 },
  { code: 'SFO', city: 'San Francisco', state: 'CA', lat: 37.6213, lon: -122.3790 },
  { code: 'OAK', city: 'Oakland', state: 'CA', lat: 37.7213, lon: -122.2208 },
  { code: 'SJC', city: 'San Jose', state: 'CA', lat: 37.3639, lon: -121.9289 },
  { code: 'SAN', city: 'San Diego', state: 'CA', lat: 32.7336, lon: -117.1897 },
  { code: 'DEN', city: 'Denver', state: 'CO', lat: 39.8561, lon: -104.6737 },
  { code: 'SLC', city: 'Salt Lake City', state: 'UT', lat: 40.7884, lon: -111.9778 },
  { code: 'SEA', city: 'Seattle', state: 'WA', lat: 47.4502, lon: -122.3088 },
  { code: 'PDX', city: 'Portland', state: 'OR', lat: 45.5898, lon: -122.5951 },
  { code: 'ORD', city: 'Chicago', state: 'IL', lat: 41.9742, lon: -87.9073 },
  { code: 'DFW', city: 'Dallas', state: 'TX', lat: 32.8998, lon: -97.0403 },
  { code: 'AUS', city: 'Austin', state: 'TX', lat: 30.1975, lon: -97.6664 },
  { code: 'IAH', city: 'Houston', state: 'TX', lat: 29.9902, lon: -95.3368 },
  { code: 'MSY', city: 'New Orleans', state: 'LA', lat: 29.9934, lon: -90.2580 },
  { code: 'ATL', city: 'Atlanta', state: 'GA', lat: 33.6407, lon: -84.4277 },
  { code: 'JFK', city: 'New York', state: 'NY', lat: 40.6413, lon: -73.7781 },
  { code: 'LGA', city: 'New York', state: 'NY', lat: 40.7769, lon: -73.8740 },
  { code: 'EWR', city: 'Newark', state: 'NJ', lat: 40.6895, lon: -74.1745 },
  { code: 'BOS', city: 'Boston', state: 'MA', lat: 42.3656, lon: -71.0096 },
  { code: 'DCA', city: 'Washington DC', state: 'DC', lat: 38.8512, lon: -77.0402 },
  { code: 'IAD', city: 'Washington DC', state: 'VA', lat: 38.9531, lon: -77.4565 },
  { code: 'PHX', city: 'Phoenix', state: 'AZ', lat: 33.4373, lon: -112.0078 },
  { code: 'LAS', city: 'Las Vegas', state: 'NV', lat: 36.0840, lon: -115.1537 },
  { code: 'MIA', city: 'Miami', state: 'FL', lat: 25.7959, lon: -80.2870 },
  { code: 'MCO', city: 'Orlando', state: 'FL', lat: 28.4312, lon: -81.3081 },
  { code: 'MSP', city: 'Minneapolis', state: 'MN', lat: 44.8848, lon: -93.2223 },
  { code: 'DTW', city: 'Detroit', state: 'MI', lat: 42.2124, lon: -83.3534 },
  { code: 'CLT', city: 'Charlotte', state: 'NC', lat: 35.2140, lon: -80.9431 },
  { code: 'PHL', city: 'Philadelphia', state: 'PA', lat: 39.8729, lon: -75.2437 }
];

// =====================================================
// GEOGRAPHIC CORRIDOR UTILITIES
// =====================================================

const DEFAULT_CORRIDOR_WIDTH_MILES = 100;

function toRadians(degrees) {
  return degrees * (Math.PI / 180);
}

function haversineDistance(lat1, lon1, lat2, lon2) {
  const R = 3959;
  const dLat = toRadians(lat2 - lat1);
  const dLon = toRadians(lon2 - lon1);
  const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) +
            Math.cos(toRadians(lat1)) * Math.cos(toRadians(lat2)) *
            Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

function distanceToGreatCircle(pointLat, pointLon, startLat, startLon, endLat, endLon) {
  const R = 3959;
  const lat1 = toRadians(startLat);
  const lon1 = toRadians(startLon);
  const lat2 = toRadians(endLat);
  const lon2 = toRadians(endLon);
  const lat3 = toRadians(pointLat);
  const lon3 = toRadians(pointLon);
  const d13 = haversineDistance(startLat, startLon, pointLat, pointLon) / R;
  const theta12 = Math.atan2(
    Math.sin(lon2 - lon1) * Math.cos(lat2),
    Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(lon2 - lon1)
  );
  const theta13 = Math.atan2(
    Math.sin(lon3 - lon1) * Math.cos(lat3),
    Math.cos(lat1) * Math.sin(lat3) - Math.sin(lat1) * Math.cos(lat3) * Math.cos(lon3 - lon1)
  );
  const dxt = Math.asin(Math.sin(d13) * Math.sin(theta13 - theta12));
  return Math.abs(dxt * R);
}

function isHubInCorridor(hub, originLat, originLon, destLat, destLon, corridorWidthMiles = DEFAULT_CORRIDOR_WIDTH_MILES) {
  if (!hub.lat || !hub.lon) return false;
  const perpDistance = distanceToGreatCircle(hub.lat, hub.lon, originLat, originLon, destLat, destLon);
  if (perpDistance > corridorWidthMiles) return false;
  const originToDest = haversineDistance(originLat, originLon, destLat, destLon);
  const originToHub = haversineDistance(originLat, originLon, hub.lat, hub.lon);
  const hubToDest = haversineDistance(hub.lat, hub.lon, destLat, destLon);
  const buffer = originToDest * 0.1;
  const maxDistance = originToDest + buffer;
  return (originToHub + hubToDest) <= maxDistance * 1.3;
}

function getHubsInCorridor(originCode, destCode, corridorWidthMiles = DEFAULT_CORRIDOR_WIDTH_MILES) {
  const origin = MAJOR_HUB_AIRPORTS.find(h => h.code.toUpperCase() === originCode.toUpperCase());
  const dest = MAJOR_HUB_AIRPORTS.find(h => h.code.toUpperCase() === destCode.toUpperCase());
  
  if (!origin?.lat || !dest?.lat) {
    return MAJOR_HUB_AIRPORTS.filter(h => 
      h.code.toUpperCase() !== originCode.toUpperCase() && 
      h.code.toUpperCase() !== destCode.toUpperCase()
    );
  }
  
  const hubsInCorridor = [];
  for (const hub of MAJOR_HUB_AIRPORTS) {
    if (hub.code.toUpperCase() === originCode.toUpperCase() || 
        hub.code.toUpperCase() === destCode.toUpperCase()) {
      continue;
    }
    if (isHubInCorridor(hub, origin.lat, origin.lon, dest.lat, dest.lon, corridorWidthMiles)) {
      hubsInCorridor.push(hub);
    }
  }
  return hubsInCorridor;
}

// =====================================================
// AIRPORT CODE TO AMTRAK STATION CODE MAPPING
// =====================================================
const AIRPORT_TO_AMTRAK_MAP = {
  'ORD': 'CHI', 'MDW': 'CHI',
  'JFK': 'NYP', 'LGA': 'NYP', 'EWR': 'NYP',
  'DCA': 'WAS', 'IAD': 'WAS', 'BWI': 'WAS',
  'MSY': 'NOL', 'MCI': 'KYC', 'GEG': 'SPK', 'SMF': 'SAC',
  'SFO': 'SFC', 'OAK': 'SFC', 'SJC': 'SFC',
};

const AMTRAK_TO_AIRPORTS_MAP = {
  'CHI': ['ORD', 'MDW'],
  'NYP': ['JFK', 'LGA', 'EWR'],
  'WAS': ['DCA', 'IAD', 'BWI'],
  'NOL': ['MSY'], 'KYC': ['MCI'], 'SPK': ['GEG'], 'SAC': ['SMF'],
  'SFC': ['SFO', 'OAK', 'SJC'],
};

function airportToAmtrak(airportCode) {
  const code = airportCode.toUpperCase();
  return AIRPORT_TO_AMTRAK_MAP[code] || code;
}

function amtrakToAirports(amtrakCode) {
  const code = amtrakCode.toUpperCase();
  return AMTRAK_TO_AIRPORTS_MAP[code] || [code];
}

function isSameCity(code1, code2) {
  const c1 = code1.toUpperCase();
  const c2 = code2.toUpperCase();
  if (c1 === c2) return true;
  const amtrak1 = airportToAmtrak(c1);
  const amtrak2 = airportToAmtrak(c2);
  if (amtrak1 === amtrak2) return true;
  const airports1 = amtrakToAirports(amtrak1);
  const airports2 = amtrakToAirports(amtrak2);
  if (airports1.includes(c2) || airports2.includes(c1)) return true;
  return false;
}

function getMajorHubCodes() {
  return MAJOR_HUB_AIRPORTS.map(h => h.code);
}

function getHubInfo(code) {
  return MAJOR_HUB_AIRPORTS.find(h => h.code.toUpperCase() === code.toUpperCase()) || null;
}

// =====================================================
// TIME UTILITIES
// =====================================================

function parseTimeToMinutes(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (!match) return null;
  let hours = parseInt(match[1], 10);
  const minutes = parseInt(match[2], 10);
  const period = match[3].toUpperCase();
  if (period === 'PM' && hours !== 12) hours += 12;
  else if (period === 'AM' && hours === 12) hours = 0;
  return hours * 60 + minutes;
}

function minutesToTimeString(minutes) {
  if (minutes === null || minutes === undefined) return null;
  let totalMinutes = minutes % (24 * 60);
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  let displayHours = hours;
  let period = 'AM';
  if (hours === 0) displayHours = 12;
  else if (hours === 12) period = 'PM';
  else if (hours > 12) { displayHours = hours - 12; period = 'PM'; }
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
}

function formatDuration(minutes) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

function isValidConnectionTime(arrivalMinutes, departureMinutes) {
  if (arrivalMinutes === null || departureMinutes === null) return false;
  let waitTime = departureMinutes - arrivalMinutes;
  if (waitTime < 0) waitTime += 24 * 60;
  return waitTime >= MIN_CONNECTION_MINUTES && waitTime <= MAX_WAIT_MINUTES;
}

function calculateWaitTime(arrivalMinutes, departureMinutes) {
  let waitTime = departureMinutes - arrivalMinutes;
  if (waitTime < 0) waitTime += 24 * 60;
  return waitTime;
}

// =====================================================
// OPTIMIZED AMTRAK DATA HELPERS (using indexed lookups)
// =====================================================

/**
 * Find all Amtrak routes arriving at a destination
 * OPTIMIZED: Uses indexed lookup from amtrakService
 * @param {string} destCode - Destination airport/station code
 * @returns {Promise<Array>} Array of Amtrak fares ending at this destination
 */
async function findAmtrakRoutesToDest(destCode) {
  await ensureIndexes();
  const normalizedDest = destCode.toUpperCase().trim();
  const amtrakDest = airportToAmtrak(normalizedDest);
  
  // Use O(1) indexed lookup
  const fares = await getFaresToDest(amtrakDest);
  
  // Also get fares for the original code if different
  if (normalizedDest !== amtrakDest) {
    const additionalFares = await getFaresToDest(normalizedDest);
    return [...fares, ...additionalFares];
  }
  
  return fares;
}

/**
 * Find all Amtrak routes departing from an origin
 * OPTIMIZED: Uses indexed lookup from amtrakService
 * @param {string} originCode - Origin airport/station code
 * @returns {Promise<Array>} Array of Amtrak fares starting from this origin
 */
async function findAmtrakRoutesFromOrigin(originCode) {
  await ensureIndexes();
  const normalizedOrigin = originCode.toUpperCase().trim();
  const amtrakOrigin = airportToAmtrak(normalizedOrigin);
  
  // Use O(1) indexed lookup
  const fares = await getFaresFromOrigin(amtrakOrigin);
  
  // Also get fares for the original code if different
  if (normalizedOrigin !== amtrakOrigin) {
    const additionalFares = await getFaresFromOrigin(normalizedOrigin);
    return [...fares, ...additionalFares];
  }
  
  return fares;
}

/**
 * Get hub origins that can reach a destination via Amtrak
 * OPTIMIZED: Uses pre-built reverse route graph
 */
async function getAmtrakHubsToDestination(destCode) {
  await ensureIndexes();
  const normalizedDest = destCode.toUpperCase().trim();
  const amtrakDest = airportToAmtrak(normalizedDest);
  
  // Use O(1) lookup from reverse route graph
  const origins = await getOriginsTo(amtrakDest);
  
  // Also check original code if different
  if (normalizedDest !== amtrakDest) {
    const additionalOrigins = await getOriginsTo(normalizedDest);
    return [...new Set([...origins, ...additionalOrigins])];
  }
  
  return origins;
}

/**
 * Get hub destinations reachable from an origin via Amtrak
 * OPTIMIZED: Uses pre-built route graph
 */
async function getAmtrakHubsFromOrigin(originCode) {
  await ensureIndexes();
  const normalizedOrigin = originCode.toUpperCase().trim();
  const amtrakOrigin = airportToAmtrak(normalizedOrigin);
  
  // Use O(1) lookup from route graph
  const destinations = await getDestinationsFrom(amtrakOrigin);
  
  // Also check original code if different
  if (normalizedOrigin !== amtrakOrigin) {
    const additionalDests = await getDestinationsFrom(normalizedOrigin);
    return [...new Set([...destinations, ...additionalDests])];
  }
  
  return destinations;
}

/**
 * Group Amtrak fares by route and get average/representative fare
 */
function groupAmtrakFares(fares) {
  if (!fares || fares.length === 0) return [];
  
  const groups = new Map();
  
  for (const fare of fares) {
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
  
  return Array.from(groups.values()).map(group => {
    const avgPrice = group.fares.reduce((sum, f) => sum + f.priceUSD, 0) / group.fares.length;
    const avgDuration = group.fares.reduce((sum, f) => sum + f.durationMin, 0) / group.fares.length;
    const departureTimes = group.fares.map(f => f.departureTime).filter(t => t);
    
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

function buildConnectionItinerary(leg1, leg2, hubCity, connectionType, departDate, returnDate = null) {
  const leg1ArrivalMinutes = leg1.arrivalMinutes;
  const leg2DepartureMinutes = leg2.departureMinutes;
  const waitTime = calculateWaitTime(leg1ArrivalMinutes, leg2DepartureMinutes);
  const totalDurationMin = leg1.durationMin + waitTime + leg2.durationMin;
  const totalPrice = (leg1.price || 0) + (leg2.price || 0);
  const leg1Type = connectionType === 'flight-amtrak' ? 'flight' : 'train';
  const leg2Type = connectionType === 'flight-amtrak' ? 'train' : 'flight';
  
  return {
    type: 'connection',
    connectionType: connectionType,
    legs: [
      {
        legType: leg1Type,
        departure: { location: leg1.origin, time: leg1.departureTime },
        arrival: { location: leg1.dest, time: leg1.arrivalTime },
        duration: formatDuration(leg1.durationMin),
        durationMinutes: leg1.durationMin,
        price: leg1.price,
        priceFormatted: leg1.price ? `$${leg1.price.toFixed(2)}` : null,
        provider: leg1.provider,
        stops: leg1.stops,
        source: leg1.source,
        fullUrl: leg1.fullUrl || null
      },
      {
        legType: leg2Type,
        departure: { location: leg2.origin, time: leg2.departureTime },
        arrival: { location: leg2.dest, time: leg2.arrivalTime },
        duration: formatDuration(leg2.durationMin),
        durationMinutes: leg2.durationMin,
        price: leg2.price,
        priceFormatted: leg2.price ? `$${leg2.price.toFixed(2)}` : null,
        provider: leg2.provider,
        stops: leg2.stops,
        source: leg2.source,
        fullUrl: leg2.fullUrl || null
      }
    ],
    transfer: {
      city: hubCity,
      arrivalTime: leg1.arrivalTime,
      departureTime: leg2.departureTime,
      waitTimeMinutes: waitTime,
      waitTimeFormatted: formatDuration(waitTime)
    },
    departure: { location: leg1.origin, time: leg1.departureTime },
    arrival: { location: leg2.dest, time: leg2.arrivalTime },
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

async function findFlightToAmtrakConnections(flightResults, userOrigin, userDest, departDate, returnDate = null, verbose = false) {
  const connections = [];
  
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCHING: Flight → Amtrak Connections');
    console.log('='.repeat(60));
  }
  
  const amtrakToDest = await findAmtrakRoutesToDest(userDest);
  
  if (verbose) console.log(`   📍 Found ${amtrakToDest.length} Amtrak routes to ${userDest}`);
  
  if (amtrakToDest.length === 0) return connections;
  
  const groupedAmtrak = groupAmtrakFares(amtrakToDest);
  const hubCities = [...new Set(groupedAmtrak.map(f => f.origin))];
  
  for (const hubCity of hubCities) {
    const hubCityUpper = hubCity.toUpperCase();
    const airportsServingHub = amtrakToAirports(hubCityUpper);
    
    const flightsToHub = (flightResults || []).filter(flight => {
      const flightDest = flight.arrival?.location?.toUpperCase().trim();
      return flightDest === hubCityUpper || 
             airportsServingHub.includes(flightDest) ||
             isSameCity(flightDest, hubCityUpper);
    });
    
    if (flightsToHub.length === 0) continue;
    
    const amtrakFromHub = groupedAmtrak.filter(f => f.origin.toUpperCase() === hubCityUpper);
    
    for (const flight of flightsToHub) {
      const flightArrivalMinutes = parseTimeToMinutes(flight.arrival?.time);
      if (flightArrivalMinutes === null) continue;
      
      for (const amtrak of amtrakFromHub) {
        for (const depTime of amtrak.departureTimes) {
          const amtrakDepartureMinutes = parseTimeToMinutes(depTime);
          if (amtrakDepartureMinutes === null) continue;
          
          if (isValidConnectionTime(flightArrivalMinutes, amtrakDepartureMinutes)) {
            const amtrakArrivalMinutes = amtrakDepartureMinutes + amtrak.durationMin;
            const amtrakArrivalTime = minutesToTimeString(amtrakArrivalMinutes);
            
            const leg1 = {
              origin: userOrigin, dest: hubCity,
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
              origin: hubCity, dest: userDest,
              departureTime: depTime,
              departureMinutes: amtrakDepartureMinutes,
              arrivalTime: amtrakArrivalTime,
              durationMin: amtrak.durationMin,
              price: amtrak.priceUSD,
              provider: 'Amtrak',
              stops: amtrak.transfers === 0 ? 'Nonstop' : `${amtrak.transfers} transfer${amtrak.transfers > 1 ? 's' : ''}`,
              source: 'Amtrak'
            };
            
            connections.push(buildConnectionItinerary(leg1, leg2, hubCity, 'flight-amtrak', departDate, returnDate));
            break;
          }
        }
      }
    }
  }
  
  if (verbose) console.log(`   📊 Total Flight → Amtrak connections: ${connections.length}`);
  return connections;
}

async function findAmtrakToFlightConnections(flightResults, userOrigin, userDest, departDate, returnDate = null, verbose = false) {
  const connections = [];
  
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCHING: Amtrak → Flight Connections');
    console.log('='.repeat(60));
  }
  
  const amtrakFromOrigin = await findAmtrakRoutesFromOrigin(userOrigin);
  
  if (verbose) console.log(`   📍 Found ${amtrakFromOrigin.length} Amtrak routes from ${userOrigin}`);
  
  if (amtrakFromOrigin.length === 0) return connections;
  
  const groupedAmtrak = groupAmtrakFares(amtrakFromOrigin);
  const hubCities = [...new Set(groupedAmtrak.map(f => f.dest))];
  
  for (const hubCity of hubCities) {
    const amtrakToHub = groupedAmtrak.filter(f => f.dest.toUpperCase() === hubCity.toUpperCase());
    const hubCityUpper = hubCity.toUpperCase();
    const airportsServingHub = amtrakToAirports(hubCityUpper);
    
    const flightsFromHub = (flightResults || []).filter(flight => {
      const flightOrigin = flight.departure?.location?.toUpperCase().trim();
      return flightOrigin === hubCityUpper || 
             airportsServingHub.includes(flightOrigin) ||
             isSameCity(flightOrigin, hubCityUpper);
    });
    
    if (flightsFromHub.length === 0) continue;
    
    for (const amtrak of amtrakToHub) {
      for (const depTime of amtrak.departureTimes) {
        const amtrakDepartureMinutes = parseTimeToMinutes(depTime);
        if (amtrakDepartureMinutes === null) continue;
        
        const amtrakArrivalMinutes = amtrakDepartureMinutes + amtrak.durationMin;
        
        for (const flight of flightsFromHub) {
          const flightDepartureMinutes = parseTimeToMinutes(flight.departure?.time);
          if (flightDepartureMinutes === null) continue;
          
          let effectiveArrival = amtrakArrivalMinutes % (24 * 60);
          
          if (isValidConnectionTime(effectiveArrival, flightDepartureMinutes)) {
            const leg1 = {
              origin: userOrigin, dest: hubCity,
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
              origin: hubCity, dest: userDest,
              departureTime: flight.departure?.time,
              departureMinutes: flightDepartureMinutes,
              arrivalTime: flight.arrival?.time,
              durationMin: flight.durationMinutes || 0,
              price: flight.price || 0,
              provider: flight.provider,
              stops: flight.stops,
              source: 'Google Flights'
            };
            
            connections.push(buildConnectionItinerary(leg1, leg2, hubCity, 'amtrak-flight', departDate, returnDate));
            break;
          }
        }
      }
    }
  }
  
  if (verbose) console.log(`   📊 Total Amtrak → Flight connections: ${connections.length}`);
  return connections;
}

function buildFlightConnectionItinerary(leg1, leg2, hubCity, departDate, returnDate = null) {
  const leg1ArrivalMinutes = parseTimeToMinutes(leg1.arrival?.time);
  const leg2DepartureMinutes = parseTimeToMinutes(leg2.departure?.time);
  const waitTime = calculateWaitTime(leg1ArrivalMinutes, leg2DepartureMinutes);
  const leg1Duration = leg1.durationMinutes || 0;
  const leg2Duration = leg2.durationMinutes || 0;
  const totalDurationMin = leg1Duration + waitTime + leg2Duration;
  const totalPrice = (leg1.price || 0) + (leg2.price || 0);
  const hubInfo = getHubInfo(hubCity);
  const hubDisplay = hubInfo ? `${hubInfo.city} (${hubCity})` : hubCity;
  
  return {
    type: 'connection',
    connectionType: 'flight-flight',
    legs: [
      {
        legType: 'flight',
        departure: { location: leg1.departure?.location, time: leg1.departure?.time },
        arrival: { location: leg1.arrival?.location, time: leg1.arrival?.time },
        duration: leg1.duration,
        durationMinutes: leg1Duration,
        price: leg1.price,
        priceFormatted: leg1.price ? `$${leg1.price.toFixed(2)}` : null,
        provider: leg1.provider,
        stops: leg1.stops,
        source: leg1.source || 'Google Flights',
        fullUrl: leg1.fullUrl || null
      },
      {
        legType: 'flight',
        departure: { location: leg2.departure?.location, time: leg2.departure?.time },
        arrival: { location: leg2.arrival?.location, time: leg2.arrival?.time },
        duration: leg2.duration,
        durationMinutes: leg2Duration,
        price: leg2.price,
        priceFormatted: leg2.price ? `$${leg2.price.toFixed(2)}` : null,
        provider: leg2.provider,
        stops: leg2.stops,
        source: leg2.source || 'Google Flights',
        fullUrl: leg2.fullUrl || null
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
    departure: { location: leg1.departure?.location, time: leg1.departure?.time },
    arrival: { location: leg2.arrival?.location, time: leg2.arrival?.time },
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

function findFlightToFlightConnections(flightResults, userOrigin, userDest, departDate, corridorWidthMiles = DEFAULT_CORRIDOR_WIDTH_MILES, verbose = false) {
  const connections = [];
  const normalizedOrigin = userOrigin.toUpperCase().trim();
  const normalizedDest = userDest.toUpperCase().trim();
  
  if (verbose) {
    console.log('\n' + '='.repeat(60));
    console.log('🔍 SEARCHING: Flight → Flight Connections');
    console.log('='.repeat(60));
  }
  
  if (!flightResults || flightResults.length === 0) return connections;
  
  const hubsInCorridor = getHubsInCorridor(normalizedOrigin, normalizedDest, corridorWidthMiles);
  const hubCodes = hubsInCorridor.map(h => h.code);
  
  if (hubCodes.length === 0) return connections;
  
  const onewayFlights = flightResults.filter(f => f.type === 'oneway' || !f.returnDate);
  
  const flightsByDeparture = new Map();
  const flightsByArrival = new Map();
  
  for (const flight of onewayFlights) {
    const depLoc = flight.departure?.location?.toUpperCase().trim();
    const arrLoc = flight.arrival?.location?.toUpperCase().trim();
    if (depLoc) {
      if (!flightsByDeparture.has(depLoc)) flightsByDeparture.set(depLoc, []);
      flightsByDeparture.get(depLoc).push(flight);
    }
    if (arrLoc) {
      if (!flightsByArrival.has(arrLoc)) flightsByArrival.set(arrLoc, []);
      flightsByArrival.get(arrLoc).push(flight);
    }
  }
  
  for (const hubCode of hubCodes) {
    const flightsToHub = (flightsByArrival.get(hubCode) || []).filter(f => 
      f.departure?.location?.toUpperCase().trim() === normalizedOrigin
    );
    const flightsFromHub = (flightsByDeparture.get(hubCode) || []).filter(f =>
      f.arrival?.location?.toUpperCase().trim() === normalizedDest
    );
    
    if (flightsToHub.length === 0 || flightsFromHub.length === 0) continue;
    
    let foundConnection = false;
    for (const flight1 of flightsToHub) {
      if (foundConnection) break;
      const flight1ArrivalMinutes = parseTimeToMinutes(flight1.arrival?.time);
      if (flight1ArrivalMinutes === null) continue;
      
      for (const flight2 of flightsFromHub) {
        const flight2DepartureMinutes = parseTimeToMinutes(flight2.departure?.time);
        if (flight2DepartureMinutes === null) continue;
        
        if (isValidConnectionTime(flight1ArrivalMinutes, flight2DepartureMinutes)) {
          connections.push(buildFlightConnectionItinerary(flight1, flight2, hubCode, departDate, null));
          foundConnection = true;
          break;
        }
      }
    }
  }
  
  if (verbose) console.log(`   📊 Total Flight → Flight connections: ${connections.length}`);
  return connections;
}

/**
 * Main function to build all connections
 */
export async function buildConnections(flightResults, trainResults, origin, destination, departDate, returnDate = null, verbose = false, corridorWidthMiles = DEFAULT_CORRIDOR_WIDTH_MILES) {
  // Ensure Amtrak indexes are built for fast lookups
  await ensureIndexes();
  
  if (verbose) {
    console.log('\n' + '═'.repeat(70));
    console.log('🔗 CONNECTION SERVICE - Building Combined Itineraries (OPTIMIZED)');
    console.log('═'.repeat(70));
    console.log(`📍 Origin: ${origin} → Destination: ${destination}`);
    console.log(`✈️  Available flights: ${flightResults?.length || 0}`);
  }
  
  const onewayFlights = (flightResults || []).filter(f => f.type === 'oneway' || !f.returnDate);
  
  const allConnections = [];
  
  // Scenario 1: Flight → Amtrak
  const flightToAmtrak = await findFlightToAmtrakConnections(onewayFlights, origin, destination, departDate, null, verbose);
  allConnections.push(...flightToAmtrak);
  
  // Scenario 2: Amtrak → Flight
  const amtrakToFlight = await findAmtrakToFlightConnections(onewayFlights, origin, destination, departDate, null, verbose);
  allConnections.push(...amtrakToFlight);
  
  // Scenario 3: Flight → Flight
  const flightToFlight = findFlightToFlightConnections(onewayFlights, origin, destination, departDate, corridorWidthMiles, verbose);
  allConnections.push(...flightToFlight);
  
  allConnections.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
  
  if (verbose) {
    console.log(`\n📊 TOTAL CONNECTIONS: ${allConnections.length}`);
  }
  
  return allConnections;
}

/**
 * Find potential hubs for a route (OPTIMIZED)
 */
export async function findPotentialHubs(origin, destination, verbose = false, corridorWidthMiles = DEFAULT_CORRIDOR_WIDTH_MILES) {
  await ensureIndexes();
  
  const normalizedOrigin = origin.toUpperCase().trim();
  const normalizedDest = destination.toUpperCase().trim();
  
  // Use optimized graph lookups
  const hubsForFlightAmtrak = await getAmtrakHubsToDestination(normalizedDest);
  const hubsForAmtrakFlight = await getAmtrakHubsFromOrigin(normalizedOrigin);
  
  const airportCodesForFlightAmtrak = [];
  for (const hub of hubsForFlightAmtrak) {
    airportCodesForFlightAmtrak.push(...amtrakToAirports(hub));
  }
  
  const airportCodesForAmtrakFlight = [];
  for (const hub of hubsForAmtrakFlight) {
    airportCodesForAmtrakFlight.push(...amtrakToAirports(hub));
  }
  
  const hubsInCorridor = getHubsInCorridor(normalizedOrigin, normalizedDest, corridorWidthMiles);
  const flightHubCodes = hubsInCorridor.map(h => h.code);
  
  return {
    origin: normalizedOrigin,
    destination: normalizedDest,
    corridorWidthMiles: corridorWidthMiles,
    flightToAmtrak: {
      description: `Fly to hub, then Amtrak to ${normalizedDest}`,
      hubs: hubsForFlightAmtrak,
      airportCodes: [...new Set(airportCodesForFlightAmtrak)],
      routeCount: hubsForFlightAmtrak.length
    },
    amtrakToFlight: {
      description: `Amtrak from ${normalizedOrigin} to hub, then fly`,
      hubs: hubsForAmtrakFlight,
      airportCodes: [...new Set(airportCodesForAmtrakFlight)],
      routeCount: hubsForAmtrakFlight.length
    },
    flightToFlight: {
      description: `Fly to hub in corridor, then connect to ${normalizedDest}`,
      hubs: flightHubCodes,
      hubCount: flightHubCodes.length,
      hubDetails: hubsInCorridor.map(h => ({ code: h.code, city: h.city }))
    }
  };
}

// Export for testing
export {
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
  AIRPORT_TO_AMTRAK_MAP,
  AMTRAK_TO_AIRPORTS_MAP,
  airportToAmtrak,
  amtrakToAirports,
  isSameCity,
  DEFAULT_CORRIDOR_WIDTH_MILES,
  haversineDistance,
  distanceToGreatCircle,
  isHubInCorridor,
  getHubsInCorridor
};
