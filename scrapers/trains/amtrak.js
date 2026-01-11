import puppeteer from 'puppeteer-extra';
import StealthPlugin from 'puppeteer-extra-plugin-stealth';

// Use stealth plugin to avoid bot detection
puppeteer.use(StealthPlugin());

/**
 * Amtrak Scraper Module (Standalone CLI version)
 * 
 * Run with: node trains/amtrak.js
 * Or: node trains/test-scraper.js
 */

/**
 * Common Amtrak station codes for major hubs
 */
export const AMTRAK_STATION_CODES = {
  'Los Angeles': 'LAX',
  'Santa Barbara': 'SBA',
  'SBA': 'SBA',
  'San Francisco': 'SFC',
  'Oakland': 'OKJ',
  'San Jose': 'SJC',
  'San Diego': 'SAN',
  'Denver': 'DEN',
  'Salt Lake City': 'SLC',
  'Seattle': 'SEA',
  'Portland': 'PDX',
  'Chicago': 'CHI',
  'Dallas': 'DAL',
  'Austin': 'AUS',
  'Houston': 'HOS',
  'New Orleans': 'NOL',
  'Atlanta': 'ATL',
  'New York': 'NYP',
  'NYC': 'NYP',
  'Boston': 'BOS',
  'Washington DC': 'WAS',
  'DC': 'WAS'
};

/**
 * Format date from YYYY-MM-DD to MM/DD/YYYY
 */
function formatDateForAmtrak(dateStr) {
  if (dateStr.includes('-')) {
    const [year, month, day] = dateStr.split('-');
    return `${month}/${day}/${year}`;
  }
  return dateStr;
}

/**
 * Fill out Amtrak search form and submit
 * This is more reliable than direct URL navigation which gets blocked
 */
async function fillAndSubmitSearchForm(page, from, to, departDate, returnDate = null) {
  console.log('📝 Filling out Amtrak search form...');
  
  // Wait for the page to fully load
  await page.waitForSelector('input, [data-test]', { timeout: 15000 }).catch(() => {});
  await new Promise(resolve => setTimeout(resolve, 2000));
  
  // Try to find and fill origin field
  const originSelectors = [
    '#mat-input-0',
    'input[aria-label*="From"]',
    'input[placeholder*="From"]',
    'input[name="origin"]',
    '[data-test="origin-input"]',
    '#from-station',
    '.origin-input input'
  ];
  
  let originFilled = false;
  for (const selector of originSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click({ clickCount: 3 }); // Select all
        await el.type(from, { delay: 50 });
        await new Promise(resolve => setTimeout(resolve, 500));
        // Press down and enter to select from autocomplete
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        originFilled = true;
        console.log(`  ✅ Origin filled using: ${selector}`);
        break;
      }
    } catch (e) {}
  }
  
  if (!originFilled) {
    console.log('  ⚠️ Could not find origin input, trying alternative approach...');
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Try to find and fill destination field  
  const destSelectors = [
    '#mat-input-1',
    'input[aria-label*="To"]',
    'input[placeholder*="To"]',
    'input[name="destination"]',
    '[data-test="destination-input"]',
    '#to-station',
    '.destination-input input'
  ];
  
  let destFilled = false;
  for (const selector of destSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click({ clickCount: 3 });
        await el.type(to, { delay: 50 });
        await new Promise(resolve => setTimeout(resolve, 500));
        await page.keyboard.press('ArrowDown');
        await page.keyboard.press('Enter');
        destFilled = true;
        console.log(`  ✅ Destination filled using: ${selector}`);
        break;
      }
    } catch (e) {}
  }
  
  await new Promise(resolve => setTimeout(resolve, 500));
  
  // Try to fill departure date
  const dateSelectors = [
    '#mat-input-2',
    'input[aria-label*="Depart"]',
    'input[placeholder*="Depart"]',
    'input[name="departDate"]',
    '[data-test="depart-date"]',
    '#depart-date',
    '.depart-date input'
  ];
  
  const formattedDate = formatDateForAmtrak(departDate);
  for (const selector of dateSelectors) {
    try {
      const el = await page.$(selector);
      if (el) {
        await el.click({ clickCount: 3 });
        await el.type(formattedDate, { delay: 50 });
        console.log(`  ✅ Date filled using: ${selector}`);
        // Click elsewhere to close any date picker and let Angular process
        await page.keyboard.press('Escape');
        await page.keyboard.press('Tab');
        break;
      }
    } catch (e) {}
  }
  
  // Wait for Angular to process all the form inputs
  console.log('  ⏳ Waiting for form to process...');
  await new Promise(resolve => setTimeout(resolve, 2500));
  
  // Click search/find trains button
  console.log('  🔍 Looking for Find Trains button...');
  
  // The button selector - using the stable amt-auto-test-id attribute
  const buttonSelector = 'button[amt-auto-test-id="fare-finder-findtrains-button"]';
  
  try {
    // Wait for button to be present and visible
    await page.waitForSelector(buttonSelector, { visible: true, timeout: 5000 });
    console.log('  ✅ Button found and visible');
    
    // Get button bounding box for real mouse click
    const button = await page.$(buttonSelector);
    const box = await button.boundingBox();
    
    if (box) {
      // Move mouse to button center and click (most realistic)
      const x = box.x + box.width / 2;
      const y = box.y + box.height / 2;
      
      console.log(`  🖱️ Moving mouse to button at (${x.toFixed(0)}, ${y.toFixed(0)})`);
      await page.mouse.move(x, y);
      await new Promise(resolve => setTimeout(resolve, 200));
      
      console.log('  🖱️ Clicking...');
      await page.mouse.click(x, y);
      
      console.log('  ✅ Button clicked with real mouse!');
      return true;
    }
  } catch (e) {
    console.log(`  ⚠️ Primary method failed: ${e.message}`);
  }
  
  // Fallback methods
  const fallbackSelectors = [
    'button[data-julie="findtrains"]',
    'button[aria-label="FIND TRAINS"]',
    'button.search-btn'
  ];
  
  for (const selector of fallbackSelectors) {
    try {
      const btn = await page.$(selector);
      if (btn) {
        const box = await btn.boundingBox();
        if (box) {
          await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
          console.log(`  ✅ Clicked via fallback: ${selector}`);
          return true;
        }
      }
    } catch (e) {}
  }
  
  // JavaScript click as last resort
  const clicked = await page.evaluate(() => {
    const btn = document.querySelector('button[amt-auto-test-id="fare-finder-findtrains-button"]') ||
                document.querySelector('button[data-julie="findtrains"]');
    if (btn) {
      btn.click();
      return true;
    }
    return false;
  });
  
  if (clicked) {
    console.log('  ✅ Clicked via JavaScript evaluate');
    return true;
  }
  
  console.log('  ❌ Could not click button');
  return false;
}

function parseDurationToMinutes(durationStr) {
  if (!durationStr) return 0;
  const hourMatch = durationStr.match(/(\d+)\s*h/i);
  const minMatch = durationStr.match(/(\d+)\s*m/i);
  const hours = hourMatch ? parseInt(hourMatch[1], 10) : 0;
  const minutes = minMatch ? parseInt(minMatch[1], 10) : 0;
  return hours * 60 + minutes;
}

function toISODateTime(dateStr, timeStr) {
  if (!dateStr || !timeStr) return null;
  
  try {
    let date;
    if (dateStr.includes('/')) {
      const [month, day, year] = dateStr.split('/');
      date = new Date(year, month - 1, day);
    } else if (dateStr.includes('-')) {
      date = new Date(dateStr);
    } else {
      date = new Date(dateStr);
    }
    
    let hours, minutes;
    if (timeStr.includes('AM') || timeStr.includes('PM')) {
      const match = timeStr.match(/(\d{1,2}):(\d{2})\s*(AM|PM)/i);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
        const isPM = match[3].toUpperCase() === 'PM';
        if (isPM && hours !== 12) hours += 12;
        if (!isPM && hours === 12) hours = 0;
      }
    } else {
      const match = timeStr.match(/(\d{1,2}):(\d{2})/);
      if (match) {
        hours = parseInt(match[1], 10);
        minutes = parseInt(match[2], 10);
      }
    }
    
    if (hours !== undefined && minutes !== undefined) {
      date.setHours(hours, minutes, 0, 0);
      return date.toISOString();
    }
  } catch (e) {
    console.error('Error parsing datetime:', e);
  }
  return null;
}

function parsePrice(priceValue) {
  if (typeof priceValue === 'number') return priceValue;
  if (!priceValue) return null;
  const cleaned = String(priceValue).replace(/[$,]/g, '');
  const parsed = parseFloat(cleaned);
  return isNaN(parsed) ? null : parsed;
}

function parseJourneyData(jsonData, leg, origin, destination, dateStr) {
  const results = [];
  
  try {
    let journeys = [];
    
    if (jsonData.journeys && Array.isArray(jsonData.journeys)) {
      journeys = jsonData.journeys;
    } else if (jsonData.schedules && Array.isArray(jsonData.schedules)) {
      journeys = jsonData.schedules;
    } else if (jsonData.data?.journeys && Array.isArray(jsonData.data.journeys)) {
      journeys = jsonData.data.journeys;
    } else if (jsonData.trainOptions && Array.isArray(jsonData.trainOptions)) {
      journeys = jsonData.trainOptions;
    } else if (jsonData.serviceListResponse?.serviceList) {
      journeys = jsonData.serviceListResponse.serviceList;
    } else if (Array.isArray(jsonData)) {
      journeys = jsonData;
    }
    
    for (const journey of journeys) {
      try {
        const trainOption = {
          leg,
          origin: journey.origin || journey.originStationCode || journey.from || origin,
          destination: journey.destination || journey.destinationStationCode || journey.to || destination,
          departureTime: toISODateTime(
            journey.departureDate || dateStr,
            journey.departureTime || journey.departTime || journey.scheduledDeparture
          ),
          arrivalTime: toISODateTime(
            journey.arrivalDate || journey.departureDate || dateStr,
            journey.arrivalTime || journey.arriveTime || journey.scheduledArrival
          ),
          durationMinutes: journey.travelTimeMinutes || 
                          journey.durationMinutes || 
                          parseDurationToMinutes(journey.duration || journey.travelTime),
          transfers: journey.segments?.length - 1 || 
                    journey.transfers || 
                    journey.numberOfTransfers || 
                    (journey.isDirect === false ? 1 : 0) || 0,
          priceUSD: parsePrice(
            journey.lowPrice || journey.price || journey.lowestFare?.price || 
            journey.fare?.amount || journey.lowestPrice
          ),
          trainNumber: journey.trainNumber || journey.serviceNumber,
          trainName: journey.trainName || journey.serviceName,
          fareClass: journey.fareClass || journey.accommodationType
        };
        
        if (trainOption.departureTime || trainOption.priceUSD) {
          results.push(trainOption);
        }
      } catch (parseError) {
        console.warn(`  ⚠️ Failed to parse journey:`, parseError.message);
      }
    }
  } catch (error) {
    console.error(`❌ Error parsing journey data:`, error.message);
  }
  
  return results;
}

function isJourneyApiUrl(url) {
  const keywords = ['journey', 'availability', 'search', 'schedule', 'service', 'fare', 'itinerary', 'train', 'booking/api'];
  const lowercaseUrl = url.toLowerCase();
  return keywords.some(keyword => lowercaseUrl.includes(keyword));
}

async function extractTrainsFromDOM(page, leg, origin, destination, dateStr) {
  console.log(`  🔍 DOM fallback for ${leg} trains...`);
  
  return await page.evaluate((leg, origin, destination, dateStr) => {
    const results = [];
    const containerSelectors = [
      '.journey-result', '.train-option', '.service-item', 
      '.itinerary-row', '[data-test="journey-result"]', '.search-result-item'
    ];
    
    let containers = [];
    for (const selector of containerSelectors) {
      const found = document.querySelectorAll(selector);
      if (found.length > 0) {
        containers = found;
        break;
      }
    }
    
    containers.forEach((container) => {
      try {
        const text = container.innerText || '';
        const priceMatch = text.match(/\$\s*(\d+(?:,\d{3})*(?:\.\d{2})?)/);
        const priceUSD = priceMatch ? parseFloat(priceMatch[1].replace(',', '')) : null;
        const timeMatches = text.match(/\d{1,2}:\d{2}\s*(?:AM|PM)/gi) || [];
        const departureTime = timeMatches[0] || null;
        const arrivalTime = timeMatches[1] || null;
        const durationMatch = text.match(/(\d+)\s*h(?:r|our)?s?\s*(\d+)?\s*m(?:in)?/i);
        let durationMinutes = 0;
        if (durationMatch) {
          durationMinutes = parseInt(durationMatch[1]) * 60 + (parseInt(durationMatch[2]) || 0);
        }
        const transferMatch = text.match(/(\d+)\s*(?:transfer|stop|connection)/i);
        const directMatch = text.match(/direct|nonstop/i);
        const transfers = directMatch ? 0 : (transferMatch ? parseInt(transferMatch[1]) : 0);
        
        if (priceUSD || departureTime) {
          results.push({ leg, origin, destination, departureTime, arrivalTime, durationMinutes, transfers, priceUSD });
        }
      } catch (e) {}
    });
    
    return results;
  }, leg, origin, destination, dateStr);
}

/**
 * Main Amtrak scraper function
 */
export async function scrapeAmtrak(from, to, departDate, returnDate = null, options = {}) {
  const { headless = true, skipMongo = true } = options;
  
  console.log('\n🚂 Starting Amtrak scraper...');
  console.log(`📍 From: ${from}`);
  console.log(`📍 To: ${to}`);
  console.log(`📅 Departure: ${departDate}`);
  if (returnDate) console.log(`📅 Return: ${returnDate}`);
  
  const capturedResponses = { departure: [], return: [] };
  let currentPhase = 'departure';
  let browser;
  
  try {
    browser = await puppeteer.launch({
      headless: headless ? 'new' : false,
      defaultViewport: null,  // Use window size instead of fixed viewport
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox', 
        '--disable-dev-shm-usage',
        '--window-size=1400,900',
        '--start-maximized'
      ]
    });
    console.log('✅ Browser launched successfully (with stealth mode)');
    
    const page = await browser.newPage();
    
    await page.setUserAgent(
      'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36'
    );
    
    await page.setExtraHTTPHeaders({
      'Accept-Language': 'en-US,en;q=0.9',
      'Accept': 'text/html,application/xhtml+xml,application/xml;q=0.9,image/avif,image/webp,*/*;q=0.8'
    });
    
    // Response interceptor
    page.on('response', async (response) => {
      const url = response.url();
      if (isJourneyApiUrl(url)) {
        try {
          const contentType = response.headers()['content-type'] || '';
          if (contentType.includes('application/json')) {
            const jsonData = await response.json();
            console.log(`📡 Captured API response from: ${url.substring(0, 80)}...`);
            const parsedTrains = parseJourneyData(jsonData, currentPhase, from, to, currentPhase === 'departure' ? departDate : returnDate);
            if (parsedTrains.length > 0) {
              capturedResponses[currentPhase].push(...parsedTrains);
              console.log(`  ✅ Parsed ${parsedTrains.length} ${currentPhase} train options`);
            }
          }
        } catch (e) {}
      }
    });
    
    // Navigate to Amtrak departure page directly
    const amtrakUrl = 'https://www.amtrak.com/tickets/departure.html';
    console.log(`\n🔗 Navigating to: ${amtrakUrl}\n`);
    
    await page.goto(amtrakUrl, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // Add random mouse movements to seem more human
    console.log('🖱️ Adding human-like mouse movements...');
    await page.mouse.move(100 + Math.random() * 200, 100 + Math.random() * 200);
    await new Promise(resolve => setTimeout(resolve, 300 + Math.random() * 500));
    await page.mouse.move(400 + Math.random() * 200, 300 + Math.random() * 200);
    await new Promise(resolve => setTimeout(resolve, 200 + Math.random() * 300));
    
    // Handle cookie consent banner
    console.log('🍪 Checking for cookie consent banner...');
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    const cookieButtonSelectors = [
      '#onetrust-accept-btn-handler',
      'button[id*="accept"]',
      'button[id*="cookie"]',
      'button[class*="accept"]',
      'button[aria-label*="Accept"]',
      '#accept-cookies'
    ];
    
    for (const selector of cookieButtonSelectors) {
      try {
        const btn = await page.$(selector);
        if (btn) {
          const box = await btn.boundingBox();
          if (box) {
            console.log(`  🍪 Found cookie button: ${selector}`);
            await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
            console.log('  ✅ Cookie consent accepted!');
            await new Promise(resolve => setTimeout(resolve, 1000));
            break;
          }
        }
      } catch (e) {}
    }
    
    // Also try clicking by text content
    await page.evaluate(() => {
      const buttons = document.querySelectorAll('button');
      for (const btn of buttons) {
        const text = (btn.innerText || '').toLowerCase();
        if (text.includes('accept all') || text.includes('accept cookies') || text === 'accept') {
          btn.click();
          return true;
        }
      }
      return false;
    });
    
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Click the "Revise Search" button to open the form
    console.log('🔄 Looking for Revise Search button...');
    
    const reviseSearchSelectors = [
      '#cdk-accordion-child-0 > div > div > div > div:nth-child(6)',
      'button[aria-label*="Revise"]',
      'button[aria-label*="revise"]',
      '.revise-search',
      'button:contains("Revise")',
      '[data-test*="revise"]'
    ];
    
    let reviseClicked = false;
    
    // First try by text content
    reviseClicked = await page.evaluate(() => {
      const elements = document.querySelectorAll('button, div, span, a');
      for (const el of elements) {
        const text = (el.innerText || el.textContent || '').toLowerCase();
        if (text.includes('revise search') || text.includes('revise trip') || text === 'revise') {
          el.click();
          return true;
        }
      }
      return false;
    });
    
    if (reviseClicked) {
      console.log('  ✅ Revise Search clicked via text match');
    } else {
      // Try selectors
      for (const selector of reviseSearchSelectors) {
        try {
          const el = await page.$(selector);
          if (el) {
            const box = await el.boundingBox();
            if (box) {
              await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
              console.log(`  ✅ Revise Search clicked: ${selector}`);
              reviseClicked = true;
              break;
            }
          }
        } catch (e) {}
      }
    }
    
    if (!reviseClicked) {
      console.log('  ⚠️ Could not find Revise Search, continuing anyway...');
    }
    
    // Wait for form to appear
    await new Promise(resolve => setTimeout(resolve, 2000));
    
    // Take a screenshot for debugging if not headless
    if (!headless) {
      console.log('📸 Page loaded, you can see the browser window');
    }
    
    // Fill and submit the search form
    const formSubmitted = await fillAndSubmitSearchForm(page, from, to, departDate, returnDate);
    
    if (!formSubmitted) {
      console.log('⚠️ Form submission may have failed, waiting anyway...');
    }
    
    // Wait for navigation after form submit
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
      console.log('⚠️ Navigation timeout, continuing...');
    });
    
    console.log('⏳ Waiting for departure train results...');
    
    // Take debug screenshot
    const screenshotPath = './amtrak-debug.png';
    await page.screenshot({ path: screenshotPath, fullPage: true });
    console.log(`📸 Debug screenshot saved: ${screenshotPath}`);
    
    // Log current URL
    console.log(`📍 Current URL: ${page.url()}`);
    
    // Log page title
    const title = await page.title();
    console.log(`📄 Page title: ${title}`);
    
    try {
      await page.waitForSelector(
        '[data-test="journey-result"], .journey-result, .train-option, .service-list-item, .itinerary-row, .search-results, .trip-results',
        { timeout: 20000 }
      );
    } catch (e) {
      console.log('⚠️ No standard result selectors found, waiting for page to settle...');
      // Take another screenshot
      await page.screenshot({ path: './amtrak-debug-after-wait.png', fullPage: true });
      console.log('📸 Second debug screenshot saved: ./amtrak-debug-after-wait.png');
    }
    
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Log what we can see on the page
    const pageText = await page.evaluate(() => document.body.innerText.substring(0, 500));
    console.log('📝 Page text preview:', pageText.substring(0, 200) + '...');
    
    console.log(`\n📊 Departure phase complete. Captured ${capturedResponses.departure.length} trains from API`);
    
    if (capturedResponses.departure.length === 0) {
      console.log('🔄 No API data captured, attempting DOM fallback...');
      const domResults = await extractTrainsFromDOM(page, 'departure', from, to, departDate);
      capturedResponses.departure.push(...domResults);
    }
    
    // Handle return trains
    if (returnDate && capturedResponses.departure.length > 0) {
      console.log('\n🔄 Selecting first departure to load return trains...');
      currentPhase = 'return';
      
      const clickSelectors = [
        '[data-test="journey-result"]:first-child',
        '.journey-result:first-child',
        '.train-option:first-child button',
        '.service-list-item:first-child',
        '.itinerary-row:first-child',
        'button[data-test="select-journey"]',
        '.select-train-button'
      ];
      
      let clicked = false;
      for (const selector of clickSelectors) {
        try {
          const element = await page.$(selector);
          if (element) {
            await element.click();
            clicked = true;
            console.log(`  ✅ Clicked departure using selector: ${selector}`);
            break;
          }
        } catch (e) {}
      }
      
      if (clicked) {
        console.log('⏳ Waiting for return train results...');
        await new Promise(resolve => setTimeout(resolve, 4000));
        
        try {
          await page.waitForFunction(
            () => document.body.innerText.includes('Return') || document.body.innerText.includes('return'),
            { timeout: 10000 }
          );
        } catch (e) {
          console.log('⚠️ Return section indicator not found, continuing...');
        }
        
        await new Promise(resolve => setTimeout(resolve, 2000));
        console.log(`\n📊 Return phase complete. Captured ${capturedResponses.return.length} trains from API`);
        
        if (capturedResponses.return.length === 0) {
          console.log('🔄 No return API data captured, attempting DOM fallback...');
          const domReturnResults = await extractTrainsFromDOM(page, 'return', to, from, returnDate);
          capturedResponses.return.push(...domReturnResults);
        }
      } else {
        console.log('⚠️ Could not click departure option, return trains not loaded');
      }
    }
    
    // Combine and deduplicate
    const allTrains = [...capturedResponses.departure, ...capturedResponses.return];
    const seen = new Set();
    const uniqueTrains = allTrains.filter(train => {
      const key = `${train.leg}|${train.departureTime}|${train.arrivalTime}|${train.priceUSD}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
    
    console.log(`\n✅ Total: ${uniqueTrains.length} unique train options`);
    console.log(`   Departures: ${uniqueTrains.filter(t => t.leg === 'departure').length}`);
    console.log(`   Returns: ${uniqueTrains.filter(t => t.leg === 'return').length}`);
    
    return uniqueTrains;
    
  } catch (error) {
    console.error('❌ Error scraping Amtrak:', error.message);
    const partialResults = [...capturedResponses.departure, ...capturedResponses.return];
    if (partialResults.length > 0) {
      console.log(`⚠️ Returning ${partialResults.length} partial results despite error`);
      return partialResults;
    }
    return [];
  } finally {
    if (browser) {
      await browser.close();
      console.log('🔒 Browser closed');
    }
  }
}

export function getStationCode(cityName) {
  if (AMTRAK_STATION_CODES[cityName]) return AMTRAK_STATION_CODES[cityName];
  const lowerCity = cityName.toLowerCase();
  for (const [city, code] of Object.entries(AMTRAK_STATION_CODES)) {
    if (city.toLowerCase() === lowerCity) return code;
  }
  if (cityName.length === 3 && cityName === cityName.toUpperCase()) return cityName;
  return cityName.substring(0, 3).toUpperCase();
}

// buildAmtrakUrl was removed - now using form-based approach
