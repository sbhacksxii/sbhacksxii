import puppeteer from 'puppeteer';
import { MongoClient } from 'mongodb';

/**
 * Google Flights Scraper Module
 * Adapted for use as a backend service
 */

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
        
        // Airline fallback
        if (!flight.airline) {
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
export async function scrapeGoogleFlights(from, to, departDate, returnDate = null) {
  console.log('\n🛫 Starting Google Flights scraper...');
  console.log(`📍 From: ${from}`);
  console.log(`📍 To: ${to}`);
  console.log(`📅 Departure: ${departDate}`);
  if (returnDate) console.log(`📅 Return: ${returnDate}`);
  
  // Get Chromium path from environment
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  console.log('🔧 Chromium executable path:', executablePath || 'using bundled Chromium');
  
  const uri = "mongodb+srv://johnsylvester_db_user:3bsbf7i6zrTFivhe@streamlinetravel.amyqwim.mongodb.net/?appName=StreamlineTravel";
  const client = new MongoClient(uri); 
  const dbName = "TravelData"; 
  const collectionName = 'PlaneData';

  let browser;
  try {
    browser = await puppeteer.launch({
      headless: 'new', // Use new headless mode
      executablePath: executablePath,
      defaultViewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-extensions',
        '--single-process',
        '--no-zygote'
      ]
    });
    console.log('✅ Browser launched successfully');
  } catch (launchError) {
    console.error('❌ Failed to launch browser:', launchError.message);
    throw new Error(`Browser launch failed: ${launchError.message}`);
  }

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
    
    // Give extra time for dynamic content
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Extract flight data
    const rawFlights = await extractFlightData(page);
    
    // Deduplicate flights
    const flights = deduplicateFlights(rawFlights);
    
    console.log(`\n📊 Raw results: ${rawFlights.length} | After deduplication: ${flights.length}`);
    
    console.log(`\n✅ Found ${flights.length} unique flight results\n`);

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
      departDate: departDate,
      returnDate: returnDate,
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
    
    await client.connect(); 
    const db = client.db(dbName); 
    const collection = db.collection(collectionName); 
    await collection.insertMany(normalizedFlights); 
    await client.close(); 

    return normalizedFlights; 
    

  } catch (error) {
    console.error('❌ Error scraping Google Flights:', error.message);
    return [];
  } finally {
    await browser.close();
  }
}

export { buildGoogleFlightsUrl, deduplicateFlights };
