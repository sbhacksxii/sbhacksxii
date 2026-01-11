/**
 * Greyhound Bus Scraper Module
 * Scrapes bus data from Greyhound website and saves to JSON files
 * 
 * Note: This is a template scraper. Greyhound's website structure may change,
 * so you may need to update selectors and extraction logic.
 */

import puppeteer from 'puppeteer';
import { writeFile, readFile } from 'fs/promises';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Build Greyhound search URL
 * Note: Greyhound's actual URL structure may vary - adjust as needed
 */
function buildGreyhoundUrl(from, to, departDate) {
  // Greyhound uses a search interface - this is a placeholder structure
  // You may need to adjust this based on Greyhound's actual website structure
  const baseUrl = 'https://www.greyhound.com/en';
  // Format: /booking/trip/search/from/{from}/to/{to}/depart/{date}
  return `${baseUrl}/booking/trip/search?origin=${encodeURIComponent(from)}&destination=${encodeURIComponent(to)}&departDate=${departDate}`;
}

/**
 * Extract bus data from page
 * Note: Selectors will need to be updated based on Greyhound's actual website structure
 */
async function extractBusData(page) {
  return await page.evaluate(() => {
    const results = [];
    
    // These selectors are placeholders - you'll need to inspect Greyhound's website
    // and update them to match their actual DOM structure
    const busCards = document.querySelectorAll('.trip-option, .schedule-item, [data-testid="trip-card"]');
    
    busCards.forEach((card, index) => {
      try {
        let bus = {
          departureTime: null,
          arrivalTime: null,
          duration: null,
          price: null,
          transfers: 0
        };
        
        // Extract departure time
        const depEl = card.querySelector('.departure-time, [data-testid="departure-time"]');
        if (depEl) {
          bus.departureTime = depEl.innerText?.trim();
        }
        
        // Extract arrival time
        const arrEl = card.querySelector('.arrival-time, [data-testid="arrival-time"]');
        if (arrEl) {
          bus.arrivalTime = arrEl.innerText?.trim();
        }
        
        // Extract duration
        const durEl = card.querySelector('.duration, .travel-time, [data-testid="duration"]');
        if (durEl) {
          bus.duration = durEl.innerText?.trim();
        }
        
        // Extract price
        const priceEl = card.querySelector('.price, .fare, [data-testid="price"]');
        if (priceEl) {
          bus.price = priceEl.innerText?.trim();
        }
        
        // Extract transfers
        const transfersEl = card.querySelector('.transfers, .stops, [data-testid="transfers"]');
        if (transfersEl) {
          const transfersText = transfersEl.innerText?.trim().toLowerCase();
          if (transfersText.includes('direct') || transfersText.includes('nonstop')) {
            bus.transfers = 0;
          } else {
            const transfersMatch = transfersText.match(/(\d+)/);
            if (transfersMatch) {
              bus.transfers = parseInt(transfersMatch[1], 10);
            }
          }
        }
        
        // Only add if we have meaningful data
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
 * Normalize time format
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
    browser = await puppeteer.launch({
      headless: 'new',
      executablePath: executablePath,
      defaultViewport: { width: 1280, height: 800 },
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-gpu',
        '--disable-software-rasterizer'
      ]
    });
    console.log('✅ Browser launched successfully');
    
    const page = await browser.newPage();
    await page.setUserAgent('Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36');
    
    // Navigate to Greyhound search page
    const url = buildGreyhoundUrl(from, to, departDate);
    console.log(`\n🔗 Navigating to: ${url}\n`);
    
    await page.goto(url, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Wait for bus results to load (adjust selector based on actual site)
    console.log('⏳ Waiting for bus results to load...');
    await page.waitForTimeout(3000); // Give time for dynamic content
    
    // Extract bus data
    const rawBuses = await extractBusData(page);
    console.log(`\n📊 Found ${rawBuses.length} bus results\n`);
    
    // Load existing fares data
    let existingFares = [];
    try {
      const existingData = await readFile(faresPath, 'utf-8');
      existingFares = JSON.parse(existingData);
    } catch (error) {
      // File doesn't exist or is empty, start fresh
      console.log('📝 Creating new fares file');
    }
    
    // Normalize and structure the data
    const normalizedBuses = rawBuses.map(bus => {
      const priceMatch = bus.price?.match(/[\d.]+/);
      const priceUSD = priceMatch ? parseFloat(priceMatch[0]) : null;
      
      return {
        origin: from.toUpperCase(),
        dest: to.toUpperCase(),
        date: departDate,
        departureTime: normalizeTime(bus.departureTime),
        priceUSD: priceUSD,
        durationMin: parseDurationToMinutes(bus.duration),
        transfers: bus.transfers || 0
      };
    }).filter(bus => bus.priceUSD !== null); // Only include buses with valid prices
    
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
    throw error;
  } finally {
    if (browser) {
      await browser.close();
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
