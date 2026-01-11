import { scrapeAmtrak, getStationCode, AMTRAK_STATION_CODES } from './amtrak.js';

/**
 * CLI Test script for Amtrak scraper
 * 
 * Usage:
 *   node trains/test-scraper.js                     # Default: SBA → LAX
 *   node trains/test-scraper.js SBA LAX             # Custom origin/destination
 *   node trains/test-scraper.js SBA LAX 2026-01-20  # Custom date
 *   node trains/test-scraper.js SBA LAX 2026-01-20 2026-01-22  # Round trip
 *   node trains/test-scraper.js --visible           # Run with browser visible
 *   node trains/test-scraper.js --help              # Show help
 */

// Parse command line arguments
const args = process.argv.slice(2);

// Show help
if (args.includes('--help') || args.includes('-h')) {
  console.log(`
🚂 Amtrak Scraper Test CLI

Usage:
  node trains/test-scraper.js [from] [to] [departDate] [returnDate] [options]

Arguments:
  from        Origin station code or city name (default: SBA)
  to          Destination station code or city name (default: LAX)
  departDate  Departure date in YYYY-MM-DD format (default: tomorrow)
  returnDate  Return date in YYYY-MM-DD format (optional, for round trips)

Options:
  --visible   Run with browser visible (not headless)
  --help, -h  Show this help message

Examples:
  node trains/test-scraper.js                           # SBA → LAX, tomorrow
  node trains/test-scraper.js SBA "Los Angeles"         # SBA → LAX
  node trains/test-scraper.js NYC Boston 2026-02-01     # NYC → Boston
  node trains/test-scraper.js SBA LAX 2026-01-20 2026-01-22  # Round trip
  node trains/test-scraper.js --visible                 # See the browser

Available Station Codes:
${Object.entries(AMTRAK_STATION_CODES).map(([city, code]) => `  ${code} - ${city}`).join('\n')}
`);
  process.exit(0);
}

// Check for --visible flag
const headless = !args.includes('--visible');
const filteredArgs = args.filter(a => !a.startsWith('--'));

// Get tomorrow's date as default
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);
const defaultDate = tomorrow.toISOString().split('T')[0];

// Parse arguments
const from = filteredArgs[0] || 'SBA';
const to = filteredArgs[1] || 'LAX';
const departDate = filteredArgs[2] || defaultDate;
const returnDate = filteredArgs[3] || null;

// Convert city names to station codes
const fromStation = getStationCode(from);
const toStation = getStationCode(to);

async function main() {
  console.log('🧪 Amtrak Scraper Test\n');
  console.log('═'.repeat(50));
  console.log('Test Parameters:');
  console.log(`  From: ${from} → ${fromStation}`);
  console.log(`  To: ${to} → ${toStation}`);
  console.log(`  Departure: ${departDate}`);
  console.log(`  Return: ${returnDate || 'One-way'}`);
  console.log(`  Headless: ${headless}`);
  console.log('═'.repeat(50));
  
  try {
    const startTime = Date.now();
    
    const results = await scrapeAmtrak(fromStation, toStation, departDate, returnDate, {
      headless,
      skipMongo: true
    });
    
    const elapsed = ((Date.now() - startTime) / 1000).toFixed(1);
    
    console.log('\n' + '═'.repeat(50));
    console.log('📋 Results');
    console.log('═'.repeat(50));
    
    if (results.length === 0) {
      console.log('\n⚠️ No train options found.');
      console.log('   This could mean:');
      console.log('   - No service on this route');
      console.log('   - No availability on this date');
      console.log('   - The scraper needs adjustment for Amtrak\'s current UI');
    } else {
      // Pretty print results
      console.log(`\n✅ Found ${results.length} train option(s) in ${elapsed}s\n`);
      
      results.forEach((train, i) => {
        console.log(`--- Train ${i + 1} (${train.leg}) ---`);
        console.log(`  Route: ${train.origin} → ${train.destination}`);
        console.log(`  Departure: ${train.departureTime || 'N/A'}`);
        console.log(`  Arrival: ${train.arrivalTime || 'N/A'}`);
        console.log(`  Duration: ${train.durationMinutes ? `${Math.floor(train.durationMinutes / 60)}h ${train.durationMinutes % 60}m` : 'N/A'}`);
        console.log(`  Transfers: ${train.transfers}`);
        console.log(`  Price: ${train.priceUSD ? `$${train.priceUSD}` : 'N/A'}`);
        if (train.trainName) console.log(`  Train: ${train.trainName}`);
        if (train.trainNumber) console.log(`  Number: ${train.trainNumber}`);
        console.log('');
      });
      
      // JSON output
      console.log('\n📦 JSON Output:');
      console.log(JSON.stringify(results, null, 2));
    }
    
    console.log(`\n⏱️ Total time: ${elapsed}s`);
    
  } catch (error) {
    console.error('\n❌ Test failed:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

main();
