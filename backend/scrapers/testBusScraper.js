/**
 * Test script for Greyhound Bus Scraper
 * 
 * Run with: npm run scrape:buses:test
 * Or directly: node scrapers/testBusScraper.js
 */

import { scrapeGreyhoundBuses, scrapeMultipleRoutes } from './busScraper.js';

async function testSingleRoute() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Single Route Scrape');
  console.log('='.repeat(60));
  
  try {
    const results = await scrapeGreyhoundBuses(
      'Los Angeles',
      'San Francisco',
      '2026-02-15'
    );
    
    console.log('\n📊 Results:');
    if (results.length > 0) {
      results.forEach((bus, i) => {
        console.log(`  ${i + 1}. ${bus.departureTime || 'N/A'} - $${bus.priceUSD || 'N/A'} (${bus.durationMin || 'N/A'} min)`);
      });
    } else {
      console.log('  No results found');
    }
    
    return results;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return [];
  }
}

async function testMultipleRoutes() {
  console.log('\n' + '='.repeat(60));
  console.log('🧪 Testing Multiple Routes Scrape');
  console.log('='.repeat(60));
  
  const routes = [
    { from: 'New York', to: 'Boston', date: '2026-02-15' },
    { from: 'Los Angeles', to: 'Las Vegas', date: '2026-02-15' },
    { from: 'Chicago', to: 'Detroit', date: '2026-02-15' }
  ];
  
  try {
    const results = await scrapeMultipleRoutes(routes);
    
    console.log('\n📊 Total Results:', results.length);
    return results;
  } catch (error) {
    console.error('❌ Test failed:', error.message);
    return [];
  }
}

// Run tests
async function main() {
  console.log('🚌 Greyhound Bus Scraper Test Suite');
  console.log('====================================\n');
  
  // Test single route first
  await testSingleRoute();
  
  // Optionally test multiple routes (uncomment to run)
  // await testMultipleRoutes();
  
  console.log('\n✅ Tests complete!');
}

main().catch(console.error);
