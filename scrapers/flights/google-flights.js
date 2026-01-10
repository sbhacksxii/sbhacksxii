import puppeteer from 'puppeteer';
import readline from 'readline';
import fs from 'fs';
import path from 'path';

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
 * Build Google Flights URL with search parameters
 */
function buildGoogleFlightsUrl(from, to, departDate, returnDate = null) {
  const baseUrl = 'https://www.google.com/travel/flights';
  
  let searchQuery = `Flights from ${from} to ${to} on ${departDate}`;
  if (returnDate) {
    searchQuery += ` return ${returnDate}`;
  }
  
  return `${baseUrl}?q=${encodeURIComponent(searchQuery)}&curr=USD`;
}

/**
 * Normalize time format (e.g., "7:25 AM" → "07:25 AM")
 */
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
  if (match) {
    const hour = match[1].padStart(2, '0');
    return `${hour}:${match[2]} ${match[3].toUpperCase()}`;
  }
  return timeStr;
}

/**
 * Parse duration string to minutes (e.g., "5 hr 30 min" → 330)
 */
function parseDurationToMinutes(durationStr) {
  if (!durationStr) return null;
  const hrMatch = durationStr.match(/(\d+)\s*hr/i);
  const minMatch = durationStr.match(/(\d+)\s*min/i);
  const hours = hrMatch ? parseInt(hrMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

/**
 * Create a unique key for a flight to detect duplicates
 */
function createFlightKey(flight) {
  return [
    flight.price,
    flight.airline,
    flight.departureTime,
    flight.arrivalTime,
    flight.duration
  ].join('|').toLowerCase();
}

/**
 * Deduplicate flights based on key fields
 */
function deduplicateFlights(flights) {
  const seen = new Set();
  return flights.filter(flight => {
    const key = createFlightKey(flight);
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

/**
 * Save results to JSON file
 */
function saveResultsToFile(results, from, to, departDate) {
  const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `results_${from}_${to}_${departDate}_${timestamp}.json`;
  const outputDir = path.join(process.cwd(), 'flights', 'results');
  
  // Create results directory if it doesn't exist
  if (!fs.existsSync(outputDir)) {
    fs.mkdirSync(outputDir, { recursive: true });
  }
  
  const filepath = path.join(outputDir, filename);
  
  const output = {
    metadata: {
      from,
      to,
      departDate,
      scrapedAt: new Date().toISOString(),
      totalResults: results.length
    },
    flights: results
  };
  
  fs.writeFileSync(filepath, JSON.stringify(output, null, 2));
  console.log(`\n💾 Results saved to: ${filepath}`);
  return filepath;
}

/**
 * Extract flight data from page using specified selectors
 */
async function extractFlightData(page) {
  return await page.evaluate(() => {
    const results = [];
    
    // Flight result containers - use both selectors
    const flightCards = document.querySelectorAll('li.pIav2d, div.gQ6yfe.m7VU8c');
    
    flightCards.forEach((card, index) => {
      
      // Initialize flight object with nulls
      let flight = {
        price: null,
        airline: null,
        departureTime: null,
        arrivalTime: null,
        duration: null,
        stops: null,
        bags: null,
        rawSummary: null
      };
      
      // === PRIMARY SELECTORS ===
      
      // Price: .YMlIz.FpEdX span[aria-label] or span[role="text"]
      const priceEl = card.querySelector('.YMlIz.FpEdX span[aria-label]') 
                   || card.querySelector('.YMlIz.FpEdX span[role="text"]')
                   || card.querySelector('.YMlIz.FpEdX');
      if (priceEl) {
        flight.price = priceEl.getAttribute('aria-label') || priceEl.innerText?.trim();
      }
      
      // Airline: .sSHqwe span or .Ir0Voe .sSHqwe span
      const airlineEl = card.querySelector('.Ir0Voe .sSHqwe span') 
                     || card.querySelector('.sSHqwe span')
                     || card.querySelector('.sSHqwe');
      if (airlineEl) {
        flight.airline = airlineEl.innerText?.trim();
      }
      
      // Departure time: span[aria-label^="Departure time"]
      const departureEl = card.querySelector('span[aria-label^="Departure time"]');
      if (departureEl) {
        flight.departureTime = departureEl.getAttribute('aria-label')?.replace('Departure time: ', '') 
                            || departureEl.innerText?.trim();
      }
      
      // Arrival time: span[aria-label^="Arrival time"]
      const arrivalEl = card.querySelector('span[aria-label^="Arrival time"]');
      if (arrivalEl) {
        flight.arrivalTime = arrivalEl.getAttribute('aria-label')?.replace('Arrival time: ', '') 
                          || arrivalEl.innerText?.trim();
      }
      
      // Duration: .gvkrdb.AdWm1c[aria-label] or .gvkrdb.AdWm1c
      const durationEl = card.querySelector('.gvkrdb.AdWm1c[aria-label]') 
                      || card.querySelector('.gvkrdb.AdWm1c');
      if (durationEl) {
        flight.duration = durationEl.getAttribute('aria-label') || durationEl.innerText?.trim();
      }
      
      // Stops: Look for text containing "Nonstop" or "stop"
      const cardText = card.innerText || '';
      const stopsMatch = cardText.match(/(Nonstop|\d+\s*stops?)/i);
      if (stopsMatch) {
        flight.stops = stopsMatch[0];
      }
      
      // Bags: Search for carry-on or checked bag text
      const bagsMatch = cardText.match(/(carry-on|checked bag|checked baggage)[^,\n]*/gi);
      if (bagsMatch) {
        flight.bags = bagsMatch.join(', ');
      }
      
      // === FALLBACK: div.JMc5Xc[aria-label] summary ===
      const summaryEl = card.querySelector('div.JMc5Xc[aria-label]');
      const rawSummary = summaryEl?.getAttribute('aria-label') || null;
      flight.rawSummary = rawSummary;
      
      // Parse missing fields from rawSummary
      if (rawSummary) {
        // Price fallback - look for dollar amount
        if (!flight.price) {
          const priceMatch = rawSummary.match(/\$[\d,]+/);
          if (priceMatch) flight.price = priceMatch[0];
        }
        
        // Airline fallback - typically at the start or after "Operated by"
        if (!flight.airline) {
          // Common pattern: airline name is often first or after specific phrases
          const airlineMatch = rawSummary.match(/(?:Operated by |^)([A-Z][a-zA-Z\s]+?)(?:\.|,|\d|Leaves)/);
          if (airlineMatch) flight.airline = airlineMatch[1].trim();
        }
        
        // Departure time fallback
        if (!flight.departureTime) {
          const depMatch = rawSummary.match(/(?:Leaves|Departs?|at)\s*(\d{1,2}:\d{2}\s*[AP]M)/i);
          if (depMatch) flight.departureTime = depMatch[1];
        }
        
        // Arrival time fallback
        if (!flight.arrivalTime) {
          const arrMatch = rawSummary.match(/(?:arrives?|lands?)\s*(?:at\s*)?(\d{1,2}:\d{2}\s*[AP]M)/i);
          if (arrMatch) flight.arrivalTime = arrMatch[1];
        }
        
        // Duration fallback
        if (!flight.duration) {
          const durMatch = rawSummary.match(/(\d+\s*hr(?:s)?\s*(?:\d+\s*min)?|\d+\s*hours?\s*(?:\d+\s*minutes?)?)/i);
          if (durMatch) flight.duration = durMatch[0];
        }
        
        // Stops fallback
        if (!flight.stops) {
          const stopsMatch = rawSummary.match(/(Nonstop|\d+\s*stops?)/i);
          if (stopsMatch) flight.stops = stopsMatch[0];
        }
        
        // Bags fallback
        if (!flight.bags) {
          const bagsMatch = rawSummary.match(/(carry-on|checked bag|checked baggage)[^,.]*/gi);
          if (bagsMatch) flight.bags = bagsMatch.join(', ');
        }
      }
      
      // Only add if we found at least some meaningful data
      if (flight.price || flight.airline || flight.departureTime || flight.rawSummary) {
        results.push(flight);
      }
    });
    
    return results;
  });
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
    await page.waitForSelector('li.pIav2d, div.gQ6yfe', { timeout: 30000 });
    
    // Extract flight data
    const rawFlights = await extractFlightData(page);
    
    // Deduplicate flights
    const flights = deduplicateFlights(rawFlights);
    
    console.log(`\n📊 Raw results: ${rawFlights.length} | After deduplication: ${flights.length}`);
    
    // Log sample for debugging
    if (flights.length > 0) {
      console.log('\n📋 Sample parsed flight object:');
      console.log(JSON.stringify(flights[0], null, 2));
    }

    console.log(`\n✅ Found ${flights.length} unique flight results\n`);
    
    if (flights.length > 0) {
      console.log('='.repeat(70));
      
      flights.forEach((flight, index) => {
        console.log(`\n🎫 Flight ${index + 1}:`);
        console.log(`   💰 Price:     ${flight.price || 'N/A'}`);
        console.log(`   ✈️  Airline:   ${flight.airline || 'N/A'}`);
        console.log(`   🛫 Departure: ${normalizeTime(flight.departureTime) || 'N/A'}`);
        console.log(`   🛬 Arrival:   ${normalizeTime(flight.arrivalTime) || 'N/A'}`);
        console.log(`   ⏱️  Duration:  ${flight.duration || 'N/A'}`);
        console.log(`   🔄 Stops:     ${flight.stops || 'N/A'}`);
        console.log(`   🧳 Bags:      ${flight.bags || 'N/A'}`);
      });
      
      console.log('\n' + '='.repeat(70));
    }

    // Normalize and structure the data
    const normalizedFlights = flights.map(flight => ({
      type: 'flight',
      departure: {
        location: from,
        time: normalizeTime(flight.departureTime)
      },
      arrival: {
        location: to,
        time: normalizeTime(flight.arrivalTime)
      },
      duration: flight.duration,
      durationMinutes: parseDurationToMinutes(flight.duration),
      price: flight.price ? parseFloat(flight.price.replace(/[$,]/g, '')) : null,
      priceFormatted: flight.price,
      currency: 'USD',
      provider: flight.airline,
      stops: flight.stops,
      bags: flight.bags,
      source: 'Google Flights',
      rawSummary: flight.rawSummary
    }));
    
    // Save results to file
    saveResultsToFile(normalizedFlights, from, to, departDate);
    
    return normalizedFlights;

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
export { scrapeGoogleFlights, buildGoogleFlightsUrl, deduplicateFlights, saveResultsToFile };

// Run if called directly (not when imported)
const isMainModule = import.meta.url === `file:///${process.argv[1].replace(/\\/g, '/')}`;
if (isMainModule) {
  main();
}
