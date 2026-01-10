import puppeteer from 'puppeteer';
import readline from 'readline';

/**
 * Google Flights Scraper
 * Scrapes flight data based on user input for dates and destinations
 */

// Create readline interface for user input
const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

const question = (prompt) => new Promise((resolve) => rl.question(prompt, resolve));

/**
 * Format date to Google Flights URL format (YYYY-MM-DD)
 */
function formatDate(dateStr) {
  const date = new Date(dateStr);
  return date.toISOString().split('T')[0];
}

/**
 * Build Google Flights URL with search parameters
 */
function buildGoogleFlightsUrl(from, to, departDate, returnDate = null) {
  // Google Flights URL format
  // https://www.google.com/travel/flights?q=Flights%20to%20LAX%20from%20SFO%20on%202024-01-15
  const baseUrl = 'https://www.google.com/travel/flights';
  
  let searchQuery = `Flights from ${from} to ${to} on ${departDate}`;
  if (returnDate) {
    searchQuery += ` return ${returnDate}`;
  }
  
  return `${baseUrl}?q=${encodeURIComponent(searchQuery)}&curr=USD`;
}

/**
 * Scrape flight data from Google Flights
 */
async function scrapeGoogleFlights(from, to, departDate, returnDate = null) {
  console.log('\n🛫 Starting Google Flights scraper...');
  console.log(`📍 From: ${from}`);
  console.log(`📍 To: ${to}`);
  console.log(`📅 Departure: ${departDate}`);
  if (returnDate) console.log(`📅 Return: ${returnDate}`);
  
  const browser = await puppeteer.launch({
    headless: false, // Set to true for production
    defaultViewport: { width: 1280, height: 800 },
    args: ['--no-sandbox', '--disable-setuid-sandbox']
  });

  const page = await browser.newPage();
  
  // Set user agent to avoid bot detection
  await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');

  try {
    // Navigate directly to Google Flights search
    const url = buildGoogleFlightsUrl(from, to, departDate, returnDate);
    console.log(`\n🔗 Navigating to: ${url}\n`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for the page to load flight results
    console.log('⏳ Waiting for flight results to load...');
    
    // Wait for flight results container
    await page.waitForSelector('[role="main"]', { timeout: 30000 });
    
    // Give extra time for dynamic content to load
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Try to extract flight data
    const flights = await page.evaluate(() => {
      const results = [];
      
      // Google Flights uses various selectors - try multiple approaches
      // Look for flight cards/list items
      const flightElements = document.querySelectorAll('[data-ved], .pIav2d, li[data-fp]');
      
      flightElements.forEach((element, index) => {
        if (index >= 10) return; // Limit to first 10 results
        
        const text = element.innerText;
        if (!text || text.length < 20) return;
        
        // Try to parse the text content
        const lines = text.split('\n').filter(line => line.trim());
        
        // Look for price pattern
        const priceMatch = text.match(/\$[\d,]+/);
        // Look for time pattern
        const timeMatch = text.match(/\d{1,2}:\d{2}\s*[AP]M/gi);
        // Look for duration pattern
        const durationMatch = text.match(/\d+\s*hr?\s*\d*\s*min?|\d+h\s*\d+m/i);
        // Look for airline names
        const airlines = ['United', 'Delta', 'American', 'Southwest', 'JetBlue', 'Alaska', 'Spirit', 'Frontier', 'Hawaiian', 'Sun Country'];
        const airlineMatch = airlines.find(airline => text.includes(airline));
        
        if (priceMatch || timeMatch) {
          results.push({
            price: priceMatch ? priceMatch[0] : 'Price not found',
            times: timeMatch ? timeMatch.join(' - ') : 'Times not found',
            duration: durationMatch ? durationMatch[0] : 'Duration not found',
            airline: airlineMatch || 'Airline not found',
            rawText: lines.slice(0, 5).join(' | ')
          });
        }
      });
      
      // If no structured results, try alternative approach
      if (results.length === 0) {
        // Look for any price elements
        const priceElements = document.querySelectorAll('[data-gs], .YMlIz, .BVAVmf');
        priceElements.forEach((el, i) => {
          if (i >= 5) return;
          const priceText = el.innerText;
          if (priceText.includes('$')) {
            results.push({
              price: priceText.match(/\$[\d,]+/)?.[0] || priceText,
              rawText: el.closest('[role="listitem"]')?.innerText?.slice(0, 200) || priceText
            });
          }
        });
      }
      
      return results;
    });

    // Also get the page title and any summary info
    const pageInfo = await page.evaluate(() => {
      const title = document.title;
      const summaryText = document.querySelector('[role="main"]')?.innerText?.slice(0, 500);
      return { title, summaryText };
    });

    console.log('\n📊 Page Title:', pageInfo.title);
    
    if (flights.length > 0) {
      console.log(`\n✅ Found ${flights.length} flight results:\n`);
      console.log('='.repeat(60));
      
      flights.forEach((flight, index) => {
        console.log(`\n🎫 Flight ${index + 1}:`);
        console.log(`   💰 Price: ${flight.price}`);
        if (flight.airline) console.log(`   ✈️  Airline: ${flight.airline}`);
        if (flight.times) console.log(`   🕐 Times: ${flight.times}`);
        if (flight.duration) console.log(`   ⏱️  Duration: ${flight.duration}`);
        if (flight.rawText) console.log(`   📝 Details: ${flight.rawText}`);
      });
      
      console.log('\n' + '='.repeat(60));
    } else {
      console.log('\n⚠️  No structured flight data found.');
      console.log('📄 Page content preview:');
      console.log(pageInfo.summaryText?.slice(0, 300) || 'Unable to read page content');
    }

    // Return normalized data
    return flights.map(flight => ({
      type: 'flight',
      departure: {
        location: from,
        time: flight.times?.split(' - ')[0] || null
      },
      arrival: {
        location: to,
        time: flight.times?.split(' - ')[1] || null
      },
      duration: flight.duration,
      price: parseFloat(flight.price?.replace(/[$,]/g, '')) || null,
      priceFormatted: flight.price,
      currency: 'USD',
      provider: flight.airline || 'Unknown',
      stops: 0,
      source: 'Google Flights',
      rawData: flight
    }));

  } catch (error) {
    console.error('❌ Error scraping Google Flights:', error.message);
    
    // Take a screenshot for debugging
    await page.screenshot({ path: 'scrapers/flights/error-screenshot.png' });
    console.log('📸 Screenshot saved to scrapers/flights/error-screenshot.png');
    
    return [];
  } finally {
    await browser.close();
  }
}

/**
 * Get user input and run the scraper
 */
async function main() {
  console.log('╔════════════════════════════════════════╗');
  console.log('║     Google Flights Web Scraper         ║');
  console.log('║         Travel Hub - SBHacks XII       ║');
  console.log('╚════════════════════════════════════════╝\n');

  try {
    // Get user input
    const from = await question('Enter departure city/airport (e.g., LAX, Los Angeles): ');
    const to = await question('Enter destination city/airport (e.g., JFK, New York): ');
    const departDate = await question('Enter departure date (YYYY-MM-DD): ');
    const tripType = await question('Round trip? (y/n): ');
    
    let returnDate = null;
    if (tripType.toLowerCase() === 'y') {
      returnDate = await question('Enter return date (YYYY-MM-DD): ');
    }

    // Validate inputs
    if (!from || !to || !departDate) {
      console.log('❌ Error: Please provide all required inputs.');
      rl.close();
      return;
    }

    // Validate date format
    const dateRegex = /^\d{4}-\d{2}-\d{2}$/;
    if (!dateRegex.test(departDate)) {
      console.log('❌ Error: Invalid date format. Please use YYYY-MM-DD.');
      rl.close();
      return;
    }

    // Run the scraper
    const results = await scrapeGoogleFlights(from.trim(), to.trim(), departDate.trim(), returnDate?.trim());
    
    // Output results as JSON for potential API use
    console.log('\n📋 JSON Output:');
    console.log(JSON.stringify(results, null, 2));

  } catch (error) {
    console.error('❌ Fatal error:', error.message);
  } finally {
    rl.close();
  }
}

// Export for use as module
export { scrapeGoogleFlights, buildGoogleFlightsUrl };

// Run if called directly (not when imported)
const isMainModule = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
  main();
}
