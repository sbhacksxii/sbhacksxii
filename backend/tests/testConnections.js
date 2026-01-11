/**
 * =====================================================
 * CONNECTION SERVICE TEST SCRIPT
 * =====================================================
 * 
 * This script tests the connection service with verbose output
 * showing how flight + Amtrak connections are built.
 * 
 * Run with: node tests/testConnections.js
 * 
 * You can also pass arguments:
 *   node tests/testConnections.js <origin> <destination>
 *   Example: node tests/testConnections.js NYC SBA
 */

import {
  buildConnections,
  findPotentialHubs,
  loadFaresData,
  loadStationsData,
  findAmtrakRoutesToDest,
  findAmtrakRoutesFromOrigin,
  getMajorHubCodes,
  MAJOR_HUB_AIRPORTS
} from '../services/connectionService.js';

// =====================================================
// MOCK FLIGHT DATA
// =====================================================

/**
 * Generate mock flight data for testing
 * In production, this comes from the Google Flights scraper or database
 */
function generateMockFlights(origin, destinations, departDate) {
  const mockFlights = [];
  
  // Common departure times for flights
  const departTimes = ['6:00 AM', '8:30 AM', '10:00 AM', '12:30 PM', '3:00 PM', '5:30 PM', '8:00 PM'];
  
  // Flight durations (in minutes) - rough estimates based on distance
  const getDuration = (from, to) => {
    const key = `${from}-${to}`;
    const durations = {
      // NYC/East Coast to West Coast
      'NYC-LAX': 330, 'JFK-LAX': 330, 'EWR-LAX': 330, 'LGA-LAX': 330,
      'NYC-SAN': 340, 'JFK-SAN': 340, 'NYC-SEA': 330, 'JFK-SEA': 330,
      'NYC-SFO': 340, 'JFK-SFO': 340, 'NYC-PDX': 320, 'JFK-PDX': 320,
      'NYC-DEN': 240, 'JFK-DEN': 240, 'NYC-ORD': 150, 'JFK-ORD': 150,
      'BOS-LAX': 340, 'BOS-SFO': 350, 'BOS-SEA': 340,
      // Hub to hub connections
      'LAX-SFO': 75, 'LAX-SEA': 150, 'LAX-DEN': 150, 'LAX-ORD': 240,
      'LAX-DFW': 180, 'LAX-ATL': 240, 'LAX-PHX': 70, 'LAX-LAS': 60,
      'SFO-SEA': 120, 'SFO-DEN': 150, 'SFO-ORD': 240, 'SFO-LAX': 75,
      'DEN-ORD': 150, 'DEN-DFW': 150, 'DEN-LAX': 150, 'DEN-SEA': 170,
      'ORD-DEN': 150, 'ORD-LAX': 240, 'ORD-ATL': 120, 'ORD-DFW': 150,
      'ATL-LAX': 270, 'ATL-DFW': 150, 'ATL-ORD': 120, 'ATL-DEN': 210,
      'DFW-LAX': 180, 'DFW-ORD': 150, 'DFW-DEN': 150, 'DFW-ATL': 150,
      // Small airport connections
      'SBA-LAX': 60, 'LAX-SBA': 60, 'SFO-SBA': 60, 'SBA-SFO': 60,
      'SEA-SBA': 150, 'PDX-SBA': 140, 'DEN-SBA': 180,
      'PHX-SBA': 90, 'LAS-SBA': 80
    };
    // Try both directions
    return durations[key] || durations[`${to}-${from}`] || 180; // Default 3 hours
  };
  
  // Flight prices - rough estimates
  const getPrice = (duration) => {
    return Math.round(50 + (duration * 0.8) + (Math.random() * 100));
  };
  
  for (const dest of destinations) {
    // Skip if origin equals destination
    if (origin.toUpperCase() === dest.toUpperCase()) continue;
    
    // Generate 2-3 flights per destination
    const numFlights = 2 + Math.floor(Math.random() * 2);
    const selectedTimes = [...departTimes].sort(() => Math.random() - 0.5).slice(0, numFlights);
    
    for (const departTime of selectedTimes) {
      const duration = getDuration(origin, dest);
      const price = getPrice(duration);
      
      // Calculate arrival time
      const [time, period] = departTime.split(' ');
      const [hours, mins] = time.split(':').map(Number);
      let totalMinutes = hours * 60 + mins;
      if (period === 'PM' && hours !== 12) totalMinutes += 12 * 60;
      if (period === 'AM' && hours === 12) totalMinutes = mins;
      
      const arrivalMinutes = totalMinutes + duration;
      const arrivalHours = Math.floor(arrivalMinutes / 60) % 24;
      const arrivalMins = arrivalMinutes % 60;
      const arrivalPeriod = arrivalHours >= 12 ? 'PM' : 'AM';
      const displayHours = arrivalHours === 0 ? 12 : (arrivalHours > 12 ? arrivalHours - 12 : arrivalHours);
      const arrivalTime = `${displayHours}:${arrivalMins.toString().padStart(2, '0')} ${arrivalPeriod}`;
      
      mockFlights.push({
        type: 'oneway',
        departure: {
          location: origin,
          time: departTime
        },
        arrival: {
          location: dest,
          time: arrivalTime
        },
        duration: `${Math.floor(duration / 60)} hr ${duration % 60} min`,
        durationMinutes: duration,
        departDate: departDate,
        price: price,
        priceFormatted: `$${price}`,
        currency: 'USD',
        provider: ['United', 'Delta', 'American', 'Southwest', 'Alaska'][Math.floor(Math.random() * 5)],
        stops: Math.random() > 0.7 ? '1 stop' : 'Nonstop',
        source: 'Google Flights (Mock)'
      });
    }
  }
  
  return mockFlights;
}

// =====================================================
// TEST FUNCTIONS
// =====================================================

/**
 * Print a section header
 */
function printHeader(title) {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║ ' + title.padEnd(67) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
}

/**
 * Test 1: Show available Amtrak stations and routes
 */
async function testShowAvailableData() {
  printHeader('TEST 1: Available Amtrak Stations & Routes');
  
  const stations = await loadStationsData();
  console.log('\n📍 Available Amtrak Stations:');
  console.log('   ' + stations.map(s => `${s.code} (${s.city})`).join(', '));
  
  const fares = await loadFaresData();
  const routes = new Set();
  fares.forEach(f => routes.add(`${f.origin} → ${f.dest}`));
  
  console.log(`\n🚂 Available Routes (${routes.size} total):`);
  const routeArray = [...routes].sort();
  // Group by origin
  const byOrigin = {};
  routeArray.forEach(r => {
    const origin = r.split(' → ')[0];
    if (!byOrigin[origin]) byOrigin[origin] = [];
    byOrigin[origin].push(r);
  });
  
  Object.keys(byOrigin).sort().forEach(origin => {
    console.log(`   From ${origin}: ${byOrigin[origin].map(r => r.split(' → ')[1]).join(', ')}`);
  });
}

/**
 * Test 2: Find potential hubs for a route
 */
async function testFindHubs(origin, destination) {
  printHeader(`TEST 2: Potential Hubs for ${origin} → ${destination}`);
  
  const hubs = await findPotentialHubs(origin, destination, true);
  
  return hubs;
}

/**
 * Test 3: Build connections with mock flight data
 */
async function testBuildConnections(origin, destination, departDate = '2026-02-15', includeFlightHubs = false) {
  printHeader(`TEST 3: Building Connections ${origin} → ${destination}`);
  
  // First, find what hubs we need flights for
  const hubs = await findPotentialHubs(origin, destination, false);
  
  // Generate mock flights to all potential hub cities (Amtrak hubs)
  const amtrakHubs = [...new Set([...hubs.flightToAmtrak.hubs, ...hubs.amtrakToFlight.hubs])];
  
  // Also include major flight hub airports for flight-to-flight connections
  const flightHubs = includeFlightHubs ? getMajorHubCodes().slice(0, 10) : []; // Limit to top 10 hubs
  const allHubs = [...new Set([...amtrakHubs, ...flightHubs])];
  
  console.log(`\n🛫 Generating mock flights from ${origin} to hubs: ${allHubs.join(', ')}`);
  const flightsFromOrigin = generateMockFlights(origin, allHubs, departDate);
  console.log(`   Generated ${flightsFromOrigin.length} mock flights`);
  
  // Also generate flights FROM hubs TO destination
  console.log(`\n🛫 Generating mock flights from hubs to ${destination}`);
  let flightsToDestination = [];
  for (const hub of allHubs) {
    const hubFlights = generateMockFlights(hub, [destination], departDate);
    flightsToDestination.push(...hubFlights);
  }
  console.log(`   Generated ${flightsToDestination.length} mock flights`);
  
  // Combine all flights
  const allFlights = [...flightsFromOrigin, ...flightsToDestination];
  
  console.log(`\n✈️  Total mock flights: ${allFlights.length}`);
  
  // Build connections with verbose output
  const connections = await buildConnections(
    allFlights,
    [], // No direct train results needed - we use Amtrak fares data
    origin,
    destination,
    departDate,
    null, // one-way
    true // verbose
  );
  
  return connections;
}

/**
 * Test: Flight to Flight connections specifically
 */
async function testFlightToFlightConnections(origin, destination, departDate = '2026-02-15') {
  printHeader(`Flight → Flight Connections: ${origin} → ${destination}`);
  
  console.log('\nScenario: Testing flight connections via major hub airports');
  console.log('Expected: Fly to hub (LAX, DEN, ORD, etc.), then connect to destination');
  
  // Get major hub airports
  const majorHubs = getMajorHubCodes();
  console.log(`\n✈️  Major hub airports available: ${majorHubs.length}`);
  console.log(`   Sample hubs: ${majorHubs.slice(0, 8).join(', ')}...`);
  
  // Generate flights from origin to several hubs
  const selectedHubs = majorHubs.filter(h => h !== origin && h !== destination).slice(0, 8);
  console.log(`\n🛫 Generating flights from ${origin} to hubs: ${selectedHubs.join(', ')}`);
  const flightsToHubs = generateMockFlights(origin, selectedHubs, departDate);
  console.log(`   Generated ${flightsToHubs.length} flights to hubs`);
  
  // Generate flights from hubs to destination
  console.log(`\n🛫 Generating flights from hubs to ${destination}`);
  let flightsFromHubs = [];
  for (const hub of selectedHubs) {
    const hubFlights = generateMockFlights(hub, [destination], departDate);
    flightsFromHubs.push(...hubFlights);
  }
  console.log(`   Generated ${flightsFromHubs.length} flights from hubs`);
  
  // Combine all flights
  const allFlights = [...flightsToHubs, ...flightsFromHubs];
  console.log(`\n✈️  Total flights for testing: ${allFlights.length}`);
  
  // Build connections
  const connections = await buildConnections(
    allFlights,
    [],
    origin,
    destination,
    departDate,
    null,
    true
  );
  
  // Filter to show only flight-flight connections
  const flightConnections = connections.filter(c => c.connectionType === 'flight-flight');
  
  if (flightConnections.length > 0) {
    console.log(`\n✅ SUCCESS: Found ${flightConnections.length} flight-to-flight connections!`);
  } else {
    console.log('\n⚠️  No flight-to-flight connections found');
  }
  
  return connections;
}

/**
 * Test 4: Specific route test - Santa Barbara to NYC
 * This is a good test because SBA has Amtrak to LAX, and we can fly from LAX
 */
async function testSBAtoNYC() {
  printHeader('TEST 4: Santa Barbara (SBA) → New York City (NYC)');
  
  console.log('\nScenario: User wants to go from Santa Barbara to NYC');
  console.log('Expected: Amtrak SBA → LAX, then Flight LAX → NYC');
  
  const connections = await testBuildConnections('SBA', 'NYC');
  
  if (connections.length > 0) {
    console.log('\n✅ SUCCESS: Found viable connections!');
  } else {
    console.log('\n⚠️  No connections found for this route');
  }
  
  return connections;
}

/**
 * Test 5: NYC to Santa Barbara
 * This tests the reverse - fly to LAX, then Amtrak to SBA
 */
async function testNYCtoSBA() {
  printHeader('TEST 5: New York City (NYC) → Santa Barbara (SBA)');
  
  console.log('\nScenario: User wants to go from NYC to Santa Barbara');
  console.log('Expected: Flight NYC → LAX, then Amtrak LAX → SBA');
  
  const connections = await testBuildConnections('NYC', 'SBA');
  
  if (connections.length > 0) {
    console.log('\n✅ SUCCESS: Found viable connections!');
  } else {
    console.log('\n⚠️  No connections found for this route');
  }
  
  return connections;
}

/**
 * Test 6: Denver to Santa Barbara via LAX
 */
async function testDENtoSBA() {
  printHeader('TEST 6: Denver (DEN) → Santa Barbara (SBA)');
  
  console.log('\nScenario: User wants to go from Denver to Santa Barbara');
  console.log('Expected: Flight DEN → LAX, then Amtrak LAX → SBA');
  
  const connections = await testBuildConnections('DEN', 'SBA');
  
  if (connections.length > 0) {
    console.log('\n✅ SUCCESS: Found viable connections!');
  } else {
    console.log('\n⚠️  No connections found for this route');
  }
  
  return connections;
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + '                CONNECTION SERVICE TEST SUITE                       '.padEnd(68) + '║');
  console.log('║' + '   Testing Flight + Amtrak + Flight-Flight Connections              '.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  if (args.length >= 2) {
    // Custom route test
    const [origin, destination] = args;
    const includeFlightHubs = args[2] === '--flights' || args[2] === '-f';
    
    printHeader(`CUSTOM TEST: ${origin} → ${destination}`);
    await testFindHubs(origin, destination);
    
    if (includeFlightHubs) {
      await testFlightToFlightConnections(origin, destination);
    } else {
      await testBuildConnections(origin, destination, '2026-02-15', false);
    }
  } else {
    // Run all tests
    
    // Test 1: Show available data
    await testShowAvailableData();
    
    // Test 2: Find hubs for SBA → NYC
    await testFindHubs('SBA', 'NYC');
    
    // Test 3: Find hubs for NYC → SBA
    await testFindHubs('NYC', 'SBA');
    
    // Test 4: Build connections SBA → NYC (including Amtrak)
    await testSBAtoNYC();
    
    // Test 5: Build connections NYC → SBA (including Amtrak)
    await testNYCtoSBA();
    
    // Test 6: Build connections DEN → SBA (including Amtrak)
    await testDENtoSBA();
    
    // Test 7: Flight-to-Flight connections (small airport to small airport via hub)
    await testFlightToFlightConnections('SBA', 'BOS');
  }
  
  printHeader('ALL TESTS COMPLETE');
  console.log('\nUsage: node tests/testConnections.js [origin] [destination] [--flights]');
  console.log('Examples:');
  console.log('  node tests/testConnections.js SEA SBA        # Test Amtrak + Flight');
  console.log('  node tests/testConnections.js SBA BOS -f     # Test Flight + Flight via hubs\n');
}

main().catch(console.error);
