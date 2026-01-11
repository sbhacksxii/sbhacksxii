/**
 * =====================================================
 * AMTRAK SERVICE USAGE EXAMPLES
 * =====================================================
 * 
 * This file demonstrates how to use the Amtrak fare lookup service.
 * Run with: node examples/amtrakExamples.js
 */

import {
  getAmtrakFare,
  getStations,
  getStationByCode,
  getAvailableRoutes
} from '../services/amtrakService.js';

// Helper to pretty print results
function printResult(label, result) {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`📋 ${label}`);
  console.log('='.repeat(50));
  console.log(JSON.stringify(result, null, 2));
}

async function runExamples() {
  console.log('\n🚂 AMTRAK FARE LOOKUP SERVICE - EXAMPLES\n');

  // -------------------------------------------------
  // EXAMPLE 1: Exact date match
  // -------------------------------------------------
  const exactMatch = await getAmtrakFare('SBA', 'LAX', '2026-02-15');
  printResult('Example 1: Exact Date Match (SBA → LAX on 2026-02-15)', exactMatch);
  
  console.log('\n💡 Note: isEstimated is FALSE because we have an exact date match');

  // -------------------------------------------------
  // EXAMPLE 2: Estimated fare (no exact match)
  // -------------------------------------------------
  const estimatedFare = await getAmtrakFare('SBA', 'LAX', '2026-02-17');
  printResult('Example 2: Estimated Fare (SBA → LAX on 2026-02-17)', estimatedFare);
  
  console.log('\n💡 Note: isEstimated is TRUE because 2026-02-17 doesn\'t exist,');
  console.log('   so we returned the closest date (2026-02-15, 2 days away)');

  // -------------------------------------------------
  // EXAMPLE 3: Route doesn't exist (returns null)
  // -------------------------------------------------
  const noRoute = await getAmtrakFare('SBA', 'BOS', '2026-02-15');
  printResult('Example 3: Non-existent Route (SBA → BOS)', noRoute);
  
  console.log('\n💡 Note: Returns null because Santa Barbara to Boston doesn\'t exist');

  // -------------------------------------------------
  // EXAMPLE 4: Long distance route
  // -------------------------------------------------
  const longDistance = await getAmtrakFare('LAX', 'CHI', '2026-02-15');
  printResult('Example 4: Long Distance Route (LAX → CHI)', longDistance);
  
  console.log('\n💡 Note: Duration is 2640 minutes (44 hours!)');

  // -------------------------------------------------
  // EXAMPLE 5: Northeast Corridor (popular route)
  // -------------------------------------------------
  const northeast = await getAmtrakFare('NYP', 'WAS', '2026-02-15');
  printResult('Example 5: Northeast Corridor (NYP → WAS)', northeast);

  // -------------------------------------------------
  // EXAMPLE 6: Get all stations
  // -------------------------------------------------
  const stations = await getStations();
  console.log(`\n${'='.repeat(50)}`);
  console.log('📋 Example 6: All Available Stations');
  console.log('='.repeat(50));
  console.log(`Found ${stations.length} stations:\n`);
  stations.forEach(s => {
    console.log(`  ${s.code} - ${s.name} (${s.city}, ${s.state})`);
  });

  // -------------------------------------------------
  // EXAMPLE 7: Get station by code
  // -------------------------------------------------
  const station = await getStationByCode('LAX');
  printResult('Example 7: Station Lookup (LAX)', station);

  // -------------------------------------------------
  // EXAMPLE 8: Get available routes
  // -------------------------------------------------
  const routes = await getAvailableRoutes();
  console.log(`\n${'='.repeat(50)}`);
  console.log('📋 Example 8: Available Routes');
  console.log('='.repeat(50));
  console.log(`Found ${routes.length} routes:\n`);
  routes.forEach(r => {
    console.log(`  ${r.origin} → ${r.dest}`);
  });

  // -------------------------------------------------
  // EXAMPLE 9: Case insensitivity
  // -------------------------------------------------
  const caseInsensitive = await getAmtrakFare('sba', 'lax', '2026-02-15');
  printResult('Example 9: Case Insensitive (sba → lax)', caseInsensitive);
  
  console.log('\n💡 Note: Station codes are case-insensitive');

  console.log('\n\n✅ All examples completed!\n');
}

// Run examples
runExamples().catch(console.error);
