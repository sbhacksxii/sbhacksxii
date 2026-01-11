/**
 * Greyhound Bus Scraper Module
 * Scrapes bus data from Greyhound/FlixBus website and saves to JSON files
 * 
 * Note: Greyhound merged with FlixBus in 2021. This scraper uses their combined platform.
 */

import puppeteer from 'puppeteer';
import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build Greyhound/FlixBus search URL
 * FlixBus uses a specific URL format for their search
 */
function buildGreyhoundUrl(from, to, departDate) {
  // Greyhound now uses FlixBus's platform
  // The URL format is: https://www.greyhound.com/en-us/bus/{from}-{to}
  // Or direct search: https://shop.greyhound.com/search
  
  // Format date as YYYY-MM-DD for the URL
  const formattedDate = departDate;
  
  // Use the main Greyhound booking URL with search parameters
  const baseUrl = 'https://www.greyhound.com/en-us/bus-from';
  
  // Construct city slugs (lowercase, hyphenated)
  const fromSlug = from.toLowerCase().replace(/\s+/g, '-');
  const toSlug = to.toLowerCase().replace(/\s+/g, '-');
  
  return `https://shop.greyhound.com/search?departureCity=${encodeURIComponent(from)}&arrivalCity=${encodeURIComponent(to)}&departureDate=${formattedDate}&adult=1&_locale=en_US`;
}

/**
 * Extract bus data from Greyhound/FlixBus page
 * Updated selectors for current website structure
 */
async function extractBusData(page) {
  return await page.evaluate(() => {
    const results = [];
    
    // FlixBus/Greyhound uses various selectors - try multiple patterns
    // Common class patterns for trip cards on FlixBus platform
    const selectors = [
      '[data-e2e="search-result-card"]',
      '[class*="SearchResult"]',
      '[class*="TripCard"]',
      '[class*="ride-item"]',
      '.search-result-card',
      '[data-testid="trip-card"]',
      'li[class*="result"]'
    ];
    
    let busCards = [];
    for (const selector of selectors) {
      const cards = document.querySelectorAll(selector);
      if (cards.length > 0) {
        busCards = cards;
        console.log(`Found ${cards.length} cards with selector: ${selector}`);
        break;
      }
    }
    
    // If no cards found with specific selectors, try to find any list items that might be results
    if (busCards.length === 0) {
      // Look for time patterns in the page content
      const allElements = document.querySelectorAll('*');
      for (const el of allElements) {
        const text = el.innerText || '';
        if (text.match(/\d{1,2}:\d{2}\s*(AM|PM)/i) && text.match(/\$\d+/)) {
          // This element might contain trip info
          console.log('Found potential trip element:', text.substring(0, 100));
        }
      }
    }
    
    busCards.forEach((card, index) => {
      try {
        let bus = {
          departureTime: null,
          arrivalTime: null,
          duration: null,
          price: null,
          transfers: 0
        };
        
        const cardText = card.innerText || '';
        
        // Try to extract times using regex from card text
        const timeMatches = cardText.match(/(\d{1,2}:\d{2}\s*(AM|PM|am|pm)?)/gi);
        if (timeMatches && timeMatches.length >= 2) {
          bus.departureTime = timeMatches[0];
          bus.arrivalTime = timeMatches[1];
        }
        
        // Try specific selectors for departure time
        const depSelectors = [
          '[data-e2e="departure-time"]',
          '[class*="departure"]',
          '[class*="depart"] time',
          '.departure-time',
          '[data-testid="departure-time"]'
        ];
        for (const sel of depSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            bus.departureTime = el.innerText?.trim();
            break;
          }
        }
        
        // Try specific selectors for arrival time
        const arrSelectors = [
          '[data-e2e="arrival-time"]',
          '[class*="arrival"]',
          '[class*="arrive"] time',
          '.arrival-time',
          '[data-testid="arrival-time"]'
        ];
        for (const sel of arrSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            bus.arrivalTime = el.innerText?.trim();
            break;
          }
        }
        
        // Try to extract duration
        const durSelectors = [
          '[data-e2e="duration"]',
          '[class*="duration"]',
          '.duration',
          '[class*="travel-time"]'
        ];
        for (const sel of durSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            bus.duration = el.innerText?.trim();
            break;
          }
        }
        
        // Fallback: extract duration from text
        if (!bus.duration) {
          const durMatch = cardText.match(/(\d+)\s*h(?:r|our)?s?\s*(\d+)?\s*m(?:in)?/i);
          if (durMatch) {
            const hours = parseInt(durMatch[1]) || 0;
            const mins = parseInt(durMatch[2]) || 0;
            bus.duration = `${hours}h ${mins}m`;
          }
        }
        
        // Extract price
        const priceSelectors = [
          '[data-e2e="price"]',
          '[class*="price"]',
          '.price',
          '[class*="fare"]',
          '[data-testid="price"]'
        ];
        for (const sel of priceSelectors) {
          const el = card.querySelector(sel);
          if (el) {
            bus.price = el.innerText?.trim();
            break;
          }
        }
        
        // Fallback: extract price from text
        if (!bus.price) {
          const priceMatch = cardText.match(/\$\s*(\d+(?:\.\d{2})?)/);
          if (priceMatch) {
            bus.price = '$' + priceMatch[1];
          }
        }
        
        // Check for transfers/stops
        const stopsText = cardText.toLowerCase();
        if (stopsText.includes('direct') || stopsText.includes('nonstop') || stopsText.includes('non-stop')) {
          bus.transfers = 0;
        } else {
          const stopsMatch = stopsText.match(/(\d+)\s*(?:stop|transfer|change)/);
          if (stopsMatch) {
            bus.transfers = parseInt(stopsMatch[1]);
          }
        }
        
        // Only add if we have meaningful data (at least price or departure time)
        if (bus.departureTime || bus.price) {
          results.push(bus);
        }
      } catch (error) {
        console.error(`Error extracting bus data from card ${index}:`, error);
      }
    });
    
    return results;
  });
}

/**
 * Parse duration string to minutes (e.g., "5h 30m" → 330)
 */
function parseDurationToMinutes(durationStr) {
  if (!durationStr) return null;
  const hrMatch = durationStr.match(/(\d+)\s*h/i);
  const minMatch = durationStr.match(/(\d+)\s*m/i);
  const hours = hrMatch ? parseInt(hrMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

/**
 * Normalize time format
 */
function normalizeTime(timeStr) {
  if (!timeStr) return null;
  const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)?/i);
  if (match) {
    const hour = match[1].padStart(2, '0');
    const period = match[3] ? ` ${match[3].toUpperCase()}` : '';
    return `${hour}:${match[2]}${period}`;
  }
  return timeStr;
}

/**
 * Take a screenshot for debugging
 */
async function takeScreenshot(page, filename) {
  try {
    const screenshotPath = join(__dirname, '..', 'data', filename);
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Screenshot saved: ${screenshotPath}`);
  } catch (error) {
    console.error('Failed to take screenshot:', error.message);
  }
}

/**
 * Scrape Greyhound bus data and append to JSON file
 */
export async function scrapeGreyhoundBuses(from, to, departDate) {
  console.log('\n🚌 Starting Greyhound bus scraper...');
  console.log(`📍 From: ${from}`);
  console.log(`📍 To: ${to}`);
  console.log(`📅 Departure: ${departDate}`);
  
  // Get Chromium path from environment
  const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
  
  const faresPath = join(__dirname, '..', 'data', 'greyhound_fares.json');
  
  let browser;
  try {
    // Set headless: false to see the browser window for debugging
    // Change to 'new' for production (headless mode)
    browser = await puppeteer.launch({
      headless: false,  // 👈 VISIBLE BROWSER FOR DEBUGGING
      executablePath: executablePath,
      defaultViewport: { width: 1280, height: 900 },
      slowMo: 100,  // 👈 Slow down actions by 100ms so you can see what's happening
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-web-security',
        '--allow-running-insecure-content',
        '--start-maximized'  // 👈 Start with maximized window
      ]
    });
    console.log('✅ Browser launched successfully');
    
    const page = await browser.newPage();
    
    // Set a realistic user agent
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Set extra HTTP headers
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,image/apng,*/*;q=0.8'
    });
    
    // Navigate to Greyhound search page
    const url = buildGreyhoundUrl(from, to, departDate);
    console.log(`\n🔗 Navigating to: ${url}\n`);
    
    try {
      await page.goto(url, { 
        waitUntil: 'networkidle2', 
        timeout: 60000 
      });
    } catch (navError) {
      console.warn('⚠️ Navigation timeout or error, continuing anyway...');
    }
    
    // Wait for page to load and any dynamic content
    console.log('⏳ Waiting for page content to load...');
    console.log('   (Watch the browser window to see what happens)');
    await new Promise(resolve => setTimeout(resolve, 5000));
    
    // Take a screenshot for debugging
    await takeScreenshot(page, 'greyhound_search.png');
    
    // Log page content for debugging
    const pageTitle = await page.title();
    console.log(`📄 Page title: ${pageTitle}`);
    
    // Check if we're on an error page or redirected
    const currentUrl = page.url();
    console.log(`📍 Current URL: ${currentUrl}`);
    
    // Log what elements we can find on the page
    console.log('\n🔍 Looking for trip cards on the page...');
    const elementCounts = await page.evaluate(() => {
      const selectors = {
        '[data-e2e="search-result-card"]': document.querySelectorAll('[data-e2e="search-result-card"]').length,
        '[class*="SearchResult"]': document.querySelectorAll('[class*="SearchResult"]').length,
        '[class*="TripCard"]': document.querySelectorAll('[class*="TripCard"]').length,
        '[class*="ride-item"]': document.querySelectorAll('[class*="ride-item"]').length,
        '.search-result-card': document.querySelectorAll('.search-result-card').length,
        'li[class*="result"]': document.querySelectorAll('li[class*="result"]').length,
        // Also check for prices and times on the page
        'elements with $ sign': document.body.innerText.match(/\$\d+/g)?.length || 0,
        'elements with time pattern': document.body.innerText.match(/\d{1,2}:\d{2}/g)?.length || 0
      };
      return selectors;
    });
    console.log('   Element counts found:');
    for (const [selector, count] of Object.entries(elementCounts)) {
      console.log(`   - ${selector}: ${count}`);
    }
    
    // Extract bus data
    console.log('\n🚌 Attempting to extract bus data...');
    const rawBuses = await extractBusData(page);
    console.log(`\n📊 Found ${rawBuses.length} bus results\n`);
    
    if (rawBuses.length === 0) {
      console.log('ℹ️ No buses found. This could be due to:');
      console.log('   - No available routes for this search');
      console.log('   - Website structure has changed');
      console.log('   - Page is being blocked or requires CAPTCHA');
      console.log('   Check the screenshot at backend/data/greyhound_search.png');
      
      // Log some page content for debugging
      const bodyText = await page.evaluate(() => document.body?.innerText?.substring(0, 500) || 'No body content');
      console.log('\n📝 Page content preview:');
      console.log(bodyText);
      
      // 👇 PAUSE FOR DEBUGGING - gives you 30 seconds to inspect the browser
      console.log('\n⏸️  PAUSING FOR 30 SECONDS - Inspect the browser window...');
      console.log('   Press Ctrl+C to stop early if needed.\n');
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
    
    // Load existing fares data
    let existingFares = [];
    try {
      const existingData = await readFile(faresPath, 'utf-8');
      existingFares = JSON.parse(existingData);
    } catch (error) {
      console.log('📝 Creating new fares file or starting fresh');
    }
    
    // Normalize and structure the data
    const normalizedBuses = rawBuses.map(bus => {
      const priceMatch = bus.price?.match(/[\d.]+/);
      const priceUSD = priceMatch ? parseFloat(priceMatch[0]) : null;
      
      return {
        origin: from.toUpperCase().replace(/\s+/g, ' ').trim(),
        dest: to.toUpperCase().replace(/\s+/g, ' ').trim(),
        date: departDate,
        departureTime: normalizeTime(bus.departureTime),
        arrivalTime: normalizeTime(bus.arrivalTime),
        priceUSD: priceUSD,
        durationMin: parseDurationToMinutes(bus.duration),
        transfers: bus.transfers || 0
      };
    }).filter(bus => bus.priceUSD !== null);
    
    // Append to existing fares (avoid duplicates)
    const newFares = normalizedBuses.filter(newFare => {
      return !existingFares.some(existing => 
        existing.origin === newFare.origin &&
        existing.dest === newFare.dest &&
        existing.date === newFare.date &&
        existing.departureTime === newFare.departureTime
      );
    });
    
    const updatedFares = [...existingFares, ...newFares];
    
    // Save to JSON file
    await writeFile(faresPath, JSON.stringify(updatedFares, null, 2));
    console.log(`✅ Saved ${newFares.length} new fares to ${faresPath}`);
    console.log(`📊 Total fares in database: ${updatedFares.length}`);
    
    return normalizedBuses;
    
  } catch (error) {
    console.error('❌ Error scraping Greyhound buses:', error.message);
    console.error('Stack:', error.stack);
    throw error;
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

/**
 * Scrape multiple routes and dates
 * Useful for bulk data collection
 */
export async function scrapeMultipleRoutes(routes) {
  const results = [];
  
  for (const route of routes) {
    try {
      console.log(`\n${'='.repeat(50)}`);
      console.log(`Scraping: ${route.from} → ${route.to} on ${route.date}`);
      console.log('='.repeat(50));
      
      const buses = await scrapeGreyhoundBuses(route.from, route.to, route.date);
      results.push(...buses);
      
      // Be respectful - add delay between requests
      await new Promise(resolve => setTimeout(resolve, 5000));
    } catch (error) {
      console.error(`❌ Error scraping route ${route.from} → ${route.to}:`, error.message);
    }
  }
  
  return results;
}

// If run directly as a script, allow command-line usage
const isMainModule = process.argv[1] && process.argv[1].includes('busScraper');
if (isMainModule) {
  const args = process.argv.slice(2);
  
  if (args.length < 3) {
    console.log('Usage: node busScraper.js <from> <to> <date>');
    console.log('Example: node busScraper.js "Los Angeles" "San Francisco" "2026-02-15"');
    process.exit(1);
  }
  
  const [from, to, date] = args;
  scrapeGreyhoundBuses(from, to, date)
    .then(results => {
      console.log('\n✅ Scraping complete!');
      console.log(`Found ${results.length} bus options`);
    })
    .catch(error => {
      console.error('❌ Scraping failed:', error.message);
      process.exit(1);
    });
}
