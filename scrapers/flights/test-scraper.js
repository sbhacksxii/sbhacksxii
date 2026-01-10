import { scrapeGoogleFlights } from './google-flights.js';

/**
 * Test script for Google Flights scraper
 * Run with: node flights/test-scraper.js
 */

// Test parameters - search for flights from LAX to JFK
const testParams = {
  from: 'LAX',
  to: 'JFK', 
  departDate: '2026-02-15',  // Future date
  returnDate: null           // One-way trip
};

console.log('🧪 Running Google Flights Scraper Test\n');
console.log('Test Parameters:');
console.log(`  From: ${testParams.from}`);
console.log(`  To: ${testParams.to}`);
console.log(`  Date: ${testParams.departDate}`);
console.log(`  Trip Type: One-way\n`);

try {
  const results = await scrapeGoogleFlights(
    testParams.from,
    testParams.to,
    testParams.departDate,
    testParams.returnDate
  );
  
  console.log('\n📋 Final JSON Output:');
  console.log(JSON.stringify(results, null, 2));
  
  console.log(`\n✅ Test complete! Found ${results.length} flights.`);
} catch (error) {
  console.error('❌ Test failed:', error.message);
  process.exit(1);
}
