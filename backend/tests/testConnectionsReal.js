/**
 * =====================================================
 * CONNECTION SERVICE TEST WITH REAL SCRAPER DATA
 * =====================================================
 * 
 * This script tests the connection service using REAL flight data
 * from the Google Flights scraper.
 * 
 * ⚠️  WARNING: This test is SLOW because it:
 *    - Launches a real browser (Puppeteer)
 *    - Scrapes Google Flights (30-60 seconds per search)
 *    - May hit rate limits if run too frequently
 * 
 * Run with: node tests/testConnectionsReal.js
 * 
 * You can also pass arguments:
 *   node tests/testConnectionsReal.js <origin> <destination>
 *   Example: node tests/testConnectionsReal.js LAX SBA
 */

import {
  buildConnections,
  findPotentialHubs,
  loadFaresData,
  loadStationsData,
  getMajorHubCodes
} from '../services/connectionService.js';

import { scrapeGoogleFlights } from '../scrapers/flightScraper.js';

// =====================================================
// HELPER FUNCTIONS
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
 * Format elapsed time
 */
function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  if (minutes > 0) {
    return `${minutes}m ${seconds % 60}s`;
  }
  return `${seconds}s`;
}

// =====================================================
// REAL DATA TEST FUNCTIONS
// =====================================================

/**
 * Scrape flights for a route (with timing)
 */
async function scrapeFlightsWithTiming(from, to, departDate) {
  console.log(`\n🌐 Scraping Google Flights: ${from} → ${to} on ${departDate}`);
  console.log('   ⏳ This may take 30-60 seconds...');
  
  const startTime = Date.now();
  
  try {
    const flights = await scrapeGoogleFlights(from, to, departDate);
    const elapsed = Date.now() - startTime;
    
    console.log(`   ✅ Found ${flights.length} flights in ${formatTime(elapsed)}`);
    
    if (flights.length > 0) {
      // Show sample of flights
      console.log(`   📋 Sample flights:`);
      flights.slice(0, 3).forEach((f, i) => {
        console.log(`      ${i + 1}. ${f.departure?.time || 'N/A'} → ${f.arrival?.time || 'N/A'} | ${f.provider || 'Unknown'} | ${f.priceFormatted || 'N/A'}`);
      });
    }
    
    return flights;
  } catch (error) {
    const elapsed = Date.now() - startTime;
    console.log(`   ❌ Scraping failed after ${formatTime(elapsed)}: ${error.message}`);
    return [];
  }
}

/**
 * Test with real scraped flight data
 */
async function testWithRealData(origin, destination, departDate = '2026-02-15') {
  printHeader(`REAL DATA TEST: ${origin} → ${destination}`);
  
  const totalStartTime = Date.now();
  
  // Step 1: Analyze potential hubs
  console.log('\n📊 Step 1: Analyzing potential connection hubs...');
  const hubs = await findPotentialHubs(origin, destination, true);
  
  // Collect all hubs we need to search
  const amtrakHubsToOrigin = hubs.flightToAmtrak.hubs; // Fly here, then Amtrak to dest
  const amtrakHubsFromOrigin = hubs.amtrakToFlight.hubs; // Amtrak here, then fly to dest
  const flightHubs = getMajorHubCodes().filter(h => 
    h !== origin.toUpperCase() && h !== destination.toUpperCase()
  ).slice(0, 5); // Limit to top 5 flight hubs for speed
  
  console.log(`\n📋 Hubs to search:`);
  console.log(`   Flight → Amtrak hubs: ${amtrakHubsToOrigin.length > 0 ? amtrakHubsToOrigin.join(', ') : 'None'}`);
  console.log(`   Amtrak → Flight hubs: ${amtrakHubsFromOrigin.length > 0 ? amtrakHubsFromOrigin.join(', ') : 'None'}`);
  console.log(`   Flight → Flight hubs: ${flightHubs.join(', ')}`);
  
  // Step 2: Scrape direct flights (origin → destination)
  console.log('\n📊 Step 2: Scraping direct flights...');
  const directFlights = await scrapeFlightsWithTiming(origin, destination, departDate);
  
  // Step 3: Scrape flights to hubs (for Flight → Amtrak and Flight → Flight)
  const allFlights = [...directFlights];
  const hubsNeedingFlightsTo = [...new Set([...amtrakHubsToOrigin, ...flightHubs])];
  
  if (hubsNeedingFlightsTo.length > 0) {
    console.log('\n📊 Step 3: Scraping flights from origin to hub cities...');
    
    for (const hub of hubsNeedingFlightsTo) {
      if (hub.toUpperCase() === origin.toUpperCase()) continue;
      
      const hubFlights = await scrapeFlightsWithTiming(origin, hub, departDate);
      allFlights.push(...hubFlights);
    }
  }
  
  // Step 4: Scrape flights from hubs to destination (for Amtrak → Flight and Flight → Flight)
  const hubsNeedingFlightsFrom = [...new Set([...amtrakHubsFromOrigin, ...flightHubs])];
  
  if (hubsNeedingFlightsFrom.length > 0) {
    console.log('\n📊 Step 4: Scraping flights from hub cities to destination...');
    
    for (const hub of hubsNeedingFlightsFrom) {
      if (hub.toUpperCase() === destination.toUpperCase()) continue;
      
      const hubFlights = await scrapeFlightsWithTiming(hub, destination, departDate);
      allFlights.push(...hubFlights);
    }
  }
  
  // Step 5: Build connections
  console.log('\n📊 Step 5: Building connections with real data...');
  console.log(`   Total flights collected: ${allFlights.length}`);
  
  const connections = await buildConnections(
    allFlights,
    [],
    origin,
    destination,
    departDate,
    null,
    true // verbose
  );
  
  // Step 6: Summary
  const totalElapsed = Date.now() - totalStartTime;
  
  printHeader('TEST RESULTS SUMMARY');
  console.log(`\n⏱️  Total test time: ${formatTime(totalElapsed)}`);
  console.log(`✈️  Direct flights found: ${directFlights.length}`);
  console.log(`🔗 Total flights scraped: ${allFlights.length}`);
  console.log(`🔄 Connections found: ${connections.length}`);
  
  // Categorize connections
  const flightAmtrak = connections.filter(c => c.connectionType === 'flight-amtrak');
  const amtrakFlight = connections.filter(c => c.connectionType === 'amtrak-flight');
  const flightFlight = connections.filter(c => c.connectionType === 'flight-flight');
  
  console.log(`\n📊 Connection breakdown:`);
  console.log(`   Flight → Amtrak: ${flightAmtrak.length}`);
  console.log(`   Amtrak → Flight: ${amtrakFlight.length}`);
  console.log(`   Flight → Flight: ${flightFlight.length}`);
  
  // Show best options
  if (connections.length > 0) {
    console.log('\n🏆 Top 5 connections by price:');
    connections.slice(0, 5).forEach((conn, i) => {
      console.log(`\n   ${i + 1}. ${conn.priceFormatted} - ${conn.duration} (${conn.connectionType})`);
      console.log(`      ${conn.legs[0].departure.location} → ${conn.transfer.city} → ${conn.legs[1].arrival.location}`);
      console.log(`      Leg 1: ${conn.legs[0].departure.time} → ${conn.legs[0].arrival.time} (${conn.legs[0].provider})`);
      console.log(`      Wait: ${conn.transfer.waitTimeFormatted} at ${conn.transfer.city}`);
      console.log(`      Leg 2: ${conn.legs[1].departure.time} → ${conn.legs[1].arrival.time} (${conn.legs[1].provider})`);
    });
  }
  
  // Compare with direct flights
  if (directFlights.length > 0 && connections.length > 0) {
    const cheapestDirect = directFlights.reduce((min, f) => 
      (f.price && f.price < (min?.price || Infinity)) ? f : min, null
    );
    const cheapestConnection = connections[0];
    
    if (cheapestDirect && cheapestConnection) {
      console.log('\n💰 Price comparison:');
      console.log(`   Cheapest direct flight: ${cheapestDirect.priceFormatted || 'N/A'}`);
      console.log(`   Cheapest connection: ${cheapestConnection.priceFormatted}`);
      
      if (cheapestDirect.price && cheapestConnection.price < cheapestDirect.price) {
        const savings = cheapestDirect.price - cheapestConnection.price;
        console.log(`   🎉 Connection saves $${savings.toFixed(2)}!`);
      }
    }
  }
  
  return {
    directFlights,
    allFlights,
    connections
  };
}

/**
 * Quick test with limited hub searches (faster)
 */
async function quickTestWithRealData(origin, destination, departDate = '2026-02-15') {
  printHeader(`QUICK REAL DATA TEST: ${origin} → ${destination}`);
  
  const totalStartTime = Date.now();
  
  // Only search for the most relevant routes
  console.log('\n📊 Quick test - searching only essential routes...');
  
  // Get potential hubs (but only use top 2)
  const hubs = await findPotentialHubs(origin, destination, false);
  const topAmtrakHubs = [...new Set([
    ...hubs.flightToAmtrak.hubs.slice(0, 2),
    ...hubs.amtrakToFlight.hubs.slice(0, 2)
  ])];
  
  console.log(`\n📋 Searching hubs: ${topAmtrakHubs.length > 0 ? topAmtrakHubs.join(', ') : 'None'}`);
  
  const allFlights = [];
  
  // Scrape direct flights
  const directFlights = await scrapeFlightsWithTiming(origin, destination, departDate);
  allFlights.push(...directFlights);
  
  // Scrape flights to/from top hubs only
  for (const hub of topAmtrakHubs) {
    // Flights TO hub (for Flight → Amtrak)
    if (hubs.flightToAmtrak.hubs.includes(hub)) {
      const toHubFlights = await scrapeFlightsWithTiming(origin, hub, departDate);
      allFlights.push(...toHubFlights);
    }
    
    // Flights FROM hub (for Amtrak → Flight)
    if (hubs.amtrakToFlight.hubs.includes(hub)) {
      const fromHubFlights = await scrapeFlightsWithTiming(hub, destination, departDate);
      allFlights.push(...fromHubFlights);
    }
  }
  
  // Build connections
  console.log(`\n📊 Building connections with ${allFlights.length} flights...`);
  
  const connections = await buildConnections(
    allFlights,
    [],
    origin,
    destination,
    departDate,
    null,
    true
  );
  
  const totalElapsed = Date.now() - totalStartTime;
  
  printHeader('QUICK TEST RESULTS');
  console.log(`\n⏱️  Total time: ${formatTime(totalElapsed)}`);
  console.log(`✈️  Direct flights: ${directFlights.length}`);
  console.log(`🔗 Connections: ${connections.length}`);
  
  return { directFlights, allFlights, connections };
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + '        CONNECTION SERVICE - REAL DATA TEST                         '.padEnd(68) + '║');
  console.log('║' + '     Using Google Flights Scraper for Real Flight Data              '.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  
  console.log('\n⚠️  WARNING: This test uses the real Google Flights scraper.');
  console.log('   Each flight search takes 30-60 seconds.');
  console.log('   Full test may take several minutes.\n');
  
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  if (args.length >= 2) {
    const [origin, destination] = args;
    const quick = args.includes('--quick') || args.includes('-q');
    const departDate = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || '2026-02-15';
    
    if (quick) {
      await quickTestWithRealData(origin, destination, departDate);
    } else {
      await testWithRealData(origin, destination, departDate);
    }
  } else {
    // Default: Run a quick test with a good connection route
    console.log('Running default quick test: LAX → SBA (tests Flight → Amtrak)');
    console.log('This route should find connections via direct flight + show Amtrak options.\n');
    
    await quickTestWithRealData('LAX', 'SBA');
  }
  
  printHeader('TEST COMPLETE');
  console.log('\nUsage: node tests/testConnectionsReal.js <origin> <destination> [options]');
  console.log('\nOptions:');
  console.log('  --quick, -q     Quick test (fewer hub searches, faster)');
  console.log('  YYYY-MM-DD      Specify departure date (default: 2026-02-15)');
  console.log('\nExamples:');
  console.log('  node tests/testConnectionsReal.js LAX SBA --quick');
  console.log('  node tests/testConnectionsReal.js NYC SBA 2026-03-01');
  console.log('  node tests/testConnectionsReal.js SBA BOS\n');
}

main().catch(error => {
  console.error('\n❌ Test failed with error:', error.message);
  console.error(error.stack);
  process.exit(1);
});
