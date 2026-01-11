/**
 * =====================================================
 * CONNECTION SERVICE TEST WITH DATABASE DATA
 * =====================================================
 * 
 * This script tests the connection service using flight data
 * from the MongoDB database (cached scraped data).
 * 
 * If no data in DB, it will try the scraper as fallback.
 * 
 * Run with: node tests/testConnectionsDB.js <origin> <destination>
 * Example: node tests/testConnectionsDB.js NYC SBA
 */

import { MongoClient } from 'mongodb';
import {
  buildConnections,
  findPotentialHubs,
  getMajorHubCodes
} from '../services/connectionService.js';

import { scrapeGoogleFlights } from '../scrapers/flightScraper.js';

// MongoDB connection string (same as in server.js)
const MONGO_URI = "mongodb+srv://johnsylvester_db_user:3bsbf7i6zrTFivhe@streamlinetravel.amyqwim.mongodb.net/?appName=StreamlineTravel";
const DB_NAME = "TravelData";
const COLLECTION_NAME = "PlaneData";

// =====================================================
// HELPER FUNCTIONS
// =====================================================

function printHeader(title) {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║ ' + title.padEnd(67) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
}

function formatTime(ms) {
  if (ms < 1000) return `${ms}ms`;
  const seconds = Math.floor(ms / 1000);
  return `${seconds}s`;
}

// =====================================================
// DATABASE FUNCTIONS
// =====================================================

/**
 * Fetch flights from database for a route
 */
async function fetchFlightsFromDB(from, to, departDate = null) {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Build query - match origin and destination
    const query = {
      'departure.location': { $regex: new RegExp(`^${from}$`, 'i') },
      'arrival.location': { $regex: new RegExp(`^${to}$`, 'i') }
    };
    
    // Optionally filter by date
    if (departDate) {
      query.departDate = departDate;
    }
    
    const flights = await collection.find(query).toArray();
    return flights;
    
  } catch (error) {
    console.error(`   ❌ Database error: ${error.message}`);
    return [];
  } finally {
    await client.close();
  }
}

/**
 * Get all unique routes in the database
 */
async function getAvailableRoutesFromDB() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    // Aggregate to get unique routes
    const routes = await collection.aggregate([
      {
        $group: {
          _id: {
            from: '$departure.location',
            to: '$arrival.location'
          },
          count: { $sum: 1 },
          sampleDate: { $first: '$departDate' }
        }
      },
      { $sort: { count: -1 } }
    ]).toArray();
    
    return routes.map(r => ({
      from: r._id.from,
      to: r._id.to,
      count: r.count,
      sampleDate: r.sampleDate
    }));
    
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return [];
  } finally {
    await client.close();
  }
}

/**
 * Get database statistics
 */
async function getDBStats() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(COLLECTION_NAME);
    
    const totalFlights = await collection.countDocuments();
    const routes = await getAvailableRoutesFromDB();
    
    return {
      totalFlights,
      routeCount: routes.length,
      routes
    };
    
  } catch (error) {
    console.error(`Database error: ${error.message}`);
    return { totalFlights: 0, routeCount: 0, routes: [] };
  } finally {
    await client.close();
  }
}

// =====================================================
// TEST FUNCTIONS
// =====================================================

/**
 * Show what's in the database
 */
async function showDatabaseContents() {
  printHeader('DATABASE CONTENTS');
  
  console.log('\n📊 Checking MongoDB for cached flight data...');
  
  const stats = await getDBStats();
  
  console.log(`\n✈️  Total flights in database: ${stats.totalFlights}`);
  console.log(`🗺️  Unique routes: ${stats.routeCount}`);
  
  if (stats.routes.length > 0) {
    console.log('\n📋 Available routes (top 20):');
    stats.routes.slice(0, 20).forEach((r, i) => {
      console.log(`   ${i + 1}. ${r.from} → ${r.to} (${r.count} flights, sample date: ${r.sampleDate || 'N/A'})`);
    });
    
    if (stats.routes.length > 20) {
      console.log(`   ... and ${stats.routes.length - 20} more routes`);
    }
  } else {
    console.log('\n⚠️  No flight data in database. You may need to run some searches first.');
  }
  
  return stats;
}

/**
 * Test connections using database data
 */
async function testWithDatabaseData(origin, destination, departDate = null) {
  printHeader(`DATABASE TEST: ${origin} → ${destination}`);
  
  const totalStartTime = Date.now();
  
  // Step 1: Analyze hubs
  console.log('\n📊 Step 1: Analyzing potential connection hubs...');
  const hubs = await findPotentialHubs(origin, destination, true);
  
  const amtrakHubsTo = hubs.flightToAmtrak.hubs;
  const amtrakHubsFrom = hubs.amtrakToFlight.hubs;
  const flightHubs = getMajorHubCodes().filter(h => 
    h !== origin.toUpperCase() && h !== destination.toUpperCase()
  ).slice(0, 5);
  
  // Step 2: Collect all flights from database
  console.log('\n📊 Step 2: Fetching flights from database...');
  
  const allFlights = [];
  const searchedRoutes = [];
  
  // Direct flights
  console.log(`\n   Checking: ${origin} → ${destination}`);
  const directFlights = await fetchFlightsFromDB(origin, destination, departDate);
  console.log(`   ✅ Found ${directFlights.length} direct flights`);
  allFlights.push(...directFlights);
  searchedRoutes.push({ from: origin, to: destination, count: directFlights.length });
  
  // Flights to Amtrak hubs (for Flight → Amtrak)
  for (const hub of amtrakHubsTo) {
    if (hub.toUpperCase() === origin.toUpperCase()) continue;
    console.log(`   Checking: ${origin} → ${hub}`);
    const hubFlights = await fetchFlightsFromDB(origin, hub, departDate);
    console.log(`   ✅ Found ${hubFlights.length} flights`);
    allFlights.push(...hubFlights);
    searchedRoutes.push({ from: origin, to: hub, count: hubFlights.length });
  }
  
  // Flights from Amtrak hubs (for Amtrak → Flight)
  for (const hub of amtrakHubsFrom) {
    if (hub.toUpperCase() === destination.toUpperCase()) continue;
    console.log(`   Checking: ${hub} → ${destination}`);
    const hubFlights = await fetchFlightsFromDB(hub, destination, departDate);
    console.log(`   ✅ Found ${hubFlights.length} flights`);
    allFlights.push(...hubFlights);
    searchedRoutes.push({ from: hub, to: destination, count: hubFlights.length });
  }
  
  // Flights through major flight hubs (for Flight → Flight)
  for (const hub of flightHubs) {
    // Origin to hub
    console.log(`   Checking: ${origin} → ${hub}`);
    const toHubFlights = await fetchFlightsFromDB(origin, hub, departDate);
    console.log(`   ✅ Found ${toHubFlights.length} flights`);
    allFlights.push(...toHubFlights);
    
    // Hub to destination
    console.log(`   Checking: ${hub} → ${destination}`);
    const fromHubFlights = await fetchFlightsFromDB(hub, destination, departDate);
    console.log(`   ✅ Found ${fromHubFlights.length} flights`);
    allFlights.push(...fromHubFlights);
  }
  
  // Deduplicate flights by _id
  const uniqueFlights = [];
  const seenIds = new Set();
  for (const flight of allFlights) {
    const id = flight._id?.toString() || JSON.stringify(flight);
    if (!seenIds.has(id)) {
      seenIds.add(id);
      uniqueFlights.push(flight);
    }
  }
  
  console.log(`\n📊 Total unique flights collected: ${uniqueFlights.length}`);
  
  // Step 3: Build connections
  console.log('\n📊 Step 3: Building connections...');
  
  const connections = await buildConnections(
    uniqueFlights,
    [],
    origin,
    destination,
    departDate || '2026-02-15',
    null,
    true // verbose
  );
  
  // Step 4: Summary
  const totalElapsed = Date.now() - totalStartTime;
  
  printHeader('TEST RESULTS SUMMARY');
  console.log(`\n⏱️  Total test time: ${formatTime(totalElapsed)}`);
  console.log(`✈️  Direct flights found: ${directFlights.length}`);
  console.log(`🔗 Total flights from DB: ${uniqueFlights.length}`);
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
  } else if (uniqueFlights.length === 0) {
    console.log('\n⚠️  No flights found in database for these routes.');
    console.log('   Try running the server and searching for these routes first to populate the database.');
  }
  
  return { directFlights, allFlights: uniqueFlights, connections };
}

// =====================================================
// MAIN
// =====================================================

async function main() {
  console.log('\n');
  console.log('╔' + '═'.repeat(68) + '╗');
  console.log('║' + '        CONNECTION SERVICE - DATABASE TEST                          '.padEnd(68) + '║');
  console.log('║' + '     Using Cached Flight Data from MongoDB                          '.padEnd(68) + '║');
  console.log('╚' + '═'.repeat(68) + '╝');
  
  // Check for command line arguments
  const args = process.argv.slice(2);
  
  if (args.includes('--list') || args.includes('-l')) {
    // Just show database contents
    await showDatabaseContents();
  } else if (args.length >= 2) {
    const [origin, destination] = args;
    const departDate = args.find(a => /^\d{4}-\d{2}-\d{2}$/.test(a)) || null;
    
    // Show what's in the DB first
    await showDatabaseContents();
    
    // Then run the test
    await testWithDatabaseData(origin, destination, departDate);
  } else {
    // Default: show database contents
    await showDatabaseContents();
    
    console.log('\n💡 To test connections, run:');
    console.log('   node tests/testConnectionsDB.js <origin> <destination>');
    console.log('   Example: node tests/testConnectionsDB.js NYC SBA');
  }
  
  printHeader('TEST COMPLETE');
  console.log('\nUsage: node tests/testConnectionsDB.js [options] <origin> <destination>');
  console.log('\nOptions:');
  console.log('  --list, -l      Show database contents only');
  console.log('  YYYY-MM-DD      Filter by departure date');
  console.log('\nExamples:');
  console.log('  node tests/testConnectionsDB.js --list');
  console.log('  node tests/testConnectionsDB.js NYC SBA');
  console.log('  node tests/testConnectionsDB.js LAX SBA 2026-02-15\n');
}

main().catch(error => {
  console.error('\n❌ Test failed with error:', error.message);
  process.exit(1);
});
