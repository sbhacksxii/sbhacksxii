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
      '[class*="trip-card"]',
      '[class*="ride-item"]',
      '.search-result-card',
      '[data-testid="trip-card"]',
      '[data-testid*="trip"]',
      'li[class*="result"]',
      'article',
      '[role="article"]',
      '[class*="journey"]',
      '[class*="route"]'
    ];
    
    let busCards = [];
    for (const selector of selectors) {
      try {
        const cards = Array.from(document.querySelectorAll(selector));
        // Filter out cards that don't contain trip-like information
        const filteredCards = cards.filter(card => {
          const text = (card.innerText || '').toLowerCase();
          // Should have a time pattern or price
          return (text.match(/\d{1,2}:\d{2}/) || text.match(/\$\d+/)) && 
                 text.length > 20 && text.length < 500; // Reasonable text length
        });
        
        if (filteredCards.length > 0) {
          busCards = filteredCards;
          console.log(`Found ${filteredCards.length} valid cards with selector: ${selector}`);
          break;
        }
      } catch (e) {
        // Continue to next selector
      }
    }
    
    // If still no cards, try finding any element that contains both time and price
    if (busCards.length === 0) {
      console.log('Trying fallback: searching for elements with time and price...');
      const allElements = Array.from(document.querySelectorAll('div, li, article, section'));
      busCards = allElements.filter(el => {
        const text = (el.innerText || '').trim();
        const hasTime = text.match(/\d{1,2}:\d{2}\s*(AM|PM)?/i);
        const hasPrice = text.match(/\$\d+/);
        const reasonableLength = text.length > 30 && text.length < 1000;
        return hasTime && hasPrice && reasonableLength;
      });
      
      if (busCards.length > 0) {
        console.log(`Found ${busCards.length} potential cards using fallback method`);
      }
    }
    
    console.log(`Processing ${busCards.length} potential bus cards...`);
    
    busCards.forEach((card, index) => {
      try {
        let bus = {
          departureTime: null,
          arrivalTime: null,
          duration: null,
          price: null,
          transfers: 0
        };
        
        // Get all text content from card (including nested elements)
        const cardText = (card.innerText || card.textContent || '').trim();
        
        // Skip if card is too small (likely not a result card)
        if (cardText.length < 20) {
          return;
        }
        
        // Debug: log first few cards
        if (index < 3) {
          console.log(`Card ${index + 1} preview: ${cardText.substring(0, 150)}...`);
        }
        
        // Try to extract times using regex from card text
        // Look for times in format HH:MM AM/PM or HH:MM
        const timePattern = /(\d{1,2}:\d{2})\s*(AM|PM|am|pm)?/gi;
        const timeMatches = Array.from(cardText.matchAll(timePattern));
        
        if (timeMatches && timeMatches.length >= 2) {
          bus.departureTime = timeMatches[0][0].trim();
          bus.arrivalTime = timeMatches[1][0].trim();
        } else if (timeMatches && timeMatches.length === 1) {
          // Only one time found - might be departure only
          bus.departureTime = timeMatches[0][0].trim();
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
        
        // Fallback: extract price from text - try multiple patterns
        if (!bus.price) {
          // Try different price patterns
          const pricePatterns = [
            /\$\s*(\d+(?:\.\d{2})?)/,           // $99 or $99.99
            /price[:\s]*\$?\s*(\d+)/i,          // price: $99
            /from[:\s]*\$?\s*(\d+)/i,           // from $99
            /\$\s*(\d+)\s*USD/i,                // $99 USD
            /(\d+)\s*USD/i                      // 99 USD
          ];
          
          for (const pattern of pricePatterns) {
            const priceMatch = cardText.match(pattern);
            if (priceMatch) {
              bus.price = '$' + priceMatch[1];
              break;
            }
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
          console.log(`  ✅ Extracted bus ${results.length}: ${bus.departureTime || 'N/A'} → ${bus.arrivalTime || 'N/A'} | ${bus.price || 'N/A'} | ${bus.duration || 'N/A'}`);
        } else {
          // Debug why this card wasn't added
          if (index < 5) {
            console.log(`  ⚠️  Skipped card ${index + 1}: No time or price found`);
          }
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
    
    // Navigate directly to Greyhound homepage and interact with form
    // Greyhound's website appears to require form interaction rather than URL parameters
    console.log('🔗 Navigating to Greyhound homepage...');
    try {
      await page.goto('https://www.greyhound.com', { 
        waitUntil: 'networkidle2', 
        timeout: 30000 
      });
      console.log('✅ Loaded homepage');
    } catch (e) {
      console.log('⚠️ Could not load homepage:', e.message);
      // Fallback to search URL
      const url = buildGreyhoundUrl(from, to, departDate);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }
    
    // Wait for page to load
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Try to interact with the search form
    console.log('🔍 Attempting to fill search form...');
    let formFilled = false;
    
    try {
      // Helper function to fill input with autocomplete selection
      async function fillInputWithAutocomplete(selectors, value, fieldName) {
        for (const selector of selectors) {
          try {
            const input = await page.$(selector);
            if (input) {
              console.log(`📍 Found ${fieldName} field: ${selector}`);
              
              // Clear and focus the input
              await input.click({ delay: 200 });
              await new Promise(resolve => setTimeout(resolve, 300));
              
              // Select all and delete existing content
              await page.keyboard.down('Control');
              await page.keyboard.press('a');
              await page.keyboard.up('Control');
              await page.keyboard.press('Backspace');
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Type the city name character by character
              await input.type(value, { delay: 120 });
              console.log(`   Typed: ${value}`);
              
              // Wait for autocomplete dropdown to appear
              await new Promise(resolve => setTimeout(resolve, 3000));
              
              // Try to find and click the first autocomplete suggestion
              // Common autocomplete selectors - try more generic ones first
              const autocompleteSelectors = [
                '[role="listbox"] [role="option"]:first-child',
                'ul[role="listbox"] li:first-child',
                '[role="option"]:first-child',
                '[class*="autocomplete"] [role="option"]:first-child',
                '[class*="suggestion"]:first-child',
                '[class*="option"]:first-child',
                'li[class*="result"]:first-child',
                '[data-testid*="option"]:first-child',
                '.dropdown-item:first-child',
                '[class*="autocomplete"] li:first-child',
                '[class*="dropdown"] li:first-child',
                '[id*="autocomplete"] li:first-child'
              ];
              
              let suggestionSelected = false;
              
              // First, check if any autocomplete list exists
              const listboxExists = await page.$('[role="listbox"], [class*="autocomplete"], [class*="dropdown"]');
              if (listboxExists) {
                console.log('   📋 Autocomplete dropdown detected');
              }
              
              for (const autoSelector of autocompleteSelectors) {
                try {
                  // Wait for the autocomplete to appear (longer timeout)
                  await page.waitForSelector(autoSelector, { timeout: 4000, visible: true });
                  const firstOption = await page.$(autoSelector);
                  if (firstOption) {
                    // Get option text before clicking
                    const optionText = await firstOption.evaluate(el => el.innerText || el.textContent || el.getAttribute('aria-label') || '');
                    console.log(`   📋 Found autocomplete option: "${optionText.trim()}"`);
                    
                    // Scroll into view if needed
                    await firstOption.evaluate(el => el.scrollIntoView({ block: 'center', behavior: 'smooth' }));
                    await new Promise(resolve => setTimeout(resolve, 500));
                    
                    // Try clicking with different methods
                    try {
                      await firstOption.click({ delay: 200 });
                    } catch (clickErr) {
                      // If click fails, try using mouse move and click
                      const box = await firstOption.boundingBox();
                      if (box) {
                        await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                        await new Promise(resolve => setTimeout(resolve, 300));
                        await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                      } else {
                        throw clickErr;
                      }
                    }
                    
                    console.log(`   ✅ Selected autocomplete: "${optionText.trim()}" using: ${autoSelector}`);
                    suggestionSelected = true;
                    await new Promise(resolve => setTimeout(resolve, 2000));
                    break;
                  }
                } catch (e) {
                  // Try next selector
                }
              }
              
              // If no autocomplete found, try keyboard navigation
              if (!suggestionSelected) {
                console.log(`   ⚠️ No autocomplete dropdown found, trying alternative methods...`);
                // Wait a bit more in case it's still loading
                await new Promise(resolve => setTimeout(resolve, 2000));
                
                // Try to find any autocomplete options without :first-child
                const allOptions = await page.$$('[role="option"], [class*="suggestion"], [class*="option"], li[class*="result"], [class*="autocomplete"] li');
                if (allOptions.length > 0) {
                  console.log(`   📋 Found ${allOptions.length} autocomplete options`);
                  const firstOption = allOptions[0];
                  
                  // Get text before clicking
                  const optionText = await firstOption.evaluate(el => el.innerText || el.textContent || el.getAttribute('aria-label') || '');
                  console.log(`   📋 First option text: "${optionText.trim()}"`);
                  
                  await firstOption.evaluate(el => el.scrollIntoView({ block: 'center' }));
                  await new Promise(resolve => setTimeout(resolve, 500));
                  
                  // Try multiple click methods
                  try {
                    await firstOption.click({ delay: 200 });
                  } catch (clickErr) {
                    const box = await firstOption.boundingBox();
                    if (box) {
                      await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
                      await new Promise(resolve => setTimeout(resolve, 300));
                      await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2);
                    } else {
                      // Try JavaScript click
                      await firstOption.evaluate(el => el.click());
                    }
                  }
                  
                  console.log(`   ✅ Selected autocomplete option: "${optionText.trim()}"`);
                  suggestionSelected = true;
                  await new Promise(resolve => setTimeout(resolve, 2000));
                } else {
                  // Last resort: keyboard navigation
                  console.log('   ⌨️ Using keyboard navigation (Arrow Down + Enter)');
                  await page.keyboard.press('ArrowDown');
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  await page.keyboard.press('Enter');
                  await new Promise(resolve => setTimeout(resolve, 2000));
                }
              }
              
              return true;
            }
          } catch (e) {
            // Continue to next selector
          }
        }
        return false;
      }
      
      // Fill "From" field with autocomplete
      const fromSelectors = [
        'input[placeholder*="From" i]',
        'input[placeholder*="Origin" i]',
        'input[aria-label*="From" i]',
        'input[aria-label*="Origin" i]',
        'input[name*="from" i]',
        'input[name*="origin" i]',
        'input[id*="from" i]',
        'input[id*="origin" i]',
        'input[data-testid*="from" i]'
      ];
      
      const fromFilled = await fillInputWithAutocomplete(fromSelectors, from, 'From');
      if (fromFilled) {
        formFilled = true;
        // Verify the value was set correctly
        const fromValue = await page.evaluate((sel) => {
          for (const s of sel) {
            const el = document.querySelector(s);
            if (el) return el.value || el.textContent;
          }
          return null;
        }, fromSelectors);
        console.log(`✅ Filled "From" field. Current value: "${fromValue}"`);
      }
      
      // Wait a bit before filling next field
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Fill "To" field with autocomplete
      const toSelectors = [
        'input[placeholder*="To" i]',
        'input[placeholder*="Destination" i]',
        'input[aria-label*="To" i]',
        'input[aria-label*="Destination" i]',
        'input[name*="to" i]',
        'input[name*="dest" i]',
        'input[name*="destination" i]',
        'input[id*="to" i]',
        'input[id*="dest" i]',
        'input[data-testid*="to" i]'
      ];
      
      const toFilled = await fillInputWithAutocomplete(toSelectors, to, 'To');
      if (toFilled) {
        // Verify the value was set correctly
        const toValue = await page.evaluate((sel) => {
          for (const s of sel) {
            const el = document.querySelector(s);
            if (el) return el.value || el.textContent;
          }
          return null;
        }, toSelectors);
        console.log(`✅ Filled "To" field. Current value: "${toValue}"`);
      }
      
      // Wait before filling date
      await new Promise(resolve => setTimeout(resolve, 1500));
      
      // Fill date field - handle date picker
      const dateSelectors = [
        'input[type="date"]',
        'input[placeholder*="Date" i]',
        'input[name*="date" i]',
        'input[id*="date" i]',
        'input[data-testid*="date" i]',
        'button[aria-label*="date" i]',
        '[class*="date-picker"]',
        '[class*="date-input"]',
        'input[type="text"][placeholder*="Date" i]'
      ];
      
      let dateFilled = false;
      for (const selector of dateSelectors) {
        try {
          const dateElement = await page.$(selector);
          if (dateElement) {
            console.log(`📍 Found date field: ${selector}`);
            
            // Get element type
            const tagName = await dateElement.evaluate(el => el.tagName);
            const inputType = await dateElement.evaluate(el => el.type || '');
            
            await dateElement.click({ delay: 200 });
            await new Promise(resolve => setTimeout(resolve, 1500));
            
            if (tagName === 'INPUT' && inputType === 'date') {
              // HTML5 date input - format: YYYY-MM-DD
              await dateElement.click({ clickCount: 3 });
              await page.keyboard.press('Backspace');
              await new Promise(resolve => setTimeout(resolve, 300));
              await dateElement.type(departDate, { delay: 100 });
              await new Promise(resolve => setTimeout(resolve, 500));
              
              // Verify the date was set
              const dateValue = await dateElement.evaluate(el => el.value);
              console.log(`   ✅ Typed date: ${departDate}, input value: ${dateValue}`);
              dateFilled = true;
              await new Promise(resolve => setTimeout(resolve, 1000));
            } else if (tagName === 'INPUT' && (inputType === 'text' || !inputType)) {
              // Text input that might open a calendar
              await dateElement.click({ clickCount: 3 });
              await page.keyboard.press('Backspace');
              
              // Try different date formats
              const dateParts = departDate.split('-');
              const formats = [
                `${dateParts[1]}/${dateParts[2]}/${dateParts[0]}`, // MM/DD/YYYY
                `${dateParts[0]}-${dateParts[1]}-${dateParts[2]}`, // YYYY-MM-DD
                `${dateParts[1]}-${dateParts[2]}-${dateParts[0]}`  // MM-DD-YYYY
              ];
              
              for (const format of formats) {
                try {
                  await dateElement.type(format, { delay: 100 });
                  await new Promise(resolve => setTimeout(resolve, 1000));
                  
                  // Check if calendar opened
                  const calendarVisible = await page.$('[class*="calendar"], [class*="datepicker"], [role="dialog"]');
                  if (calendarVisible) {
                    // Calendar opened, now select the date
                    const day = parseInt(dateParts[2]);
                    const dayButton = await page.$(`button:has-text("${day}"), [aria-label*="${departDate}"], [data-date="${departDate}"], [data-day="${day}"]`);
                    if (dayButton) {
                      await dayButton.click({ delay: 200 });
                      console.log(`   ✅ Selected date in calendar`);
                      dateFilled = true;
                      break;
                    }
                  } else {
                    // No calendar, date might be accepted as-is
                    dateFilled = true;
                    break;
                  }
                } catch (e) {
                  // Try next format
                }
              }
            } else {
              // Button or div that opens calendar
              await new Promise(resolve => setTimeout(resolve, 2000));
              
              // Wait for calendar to appear
              try {
                await page.waitForSelector('[class*="calendar"], [class*="datepicker"], [role="dialog"], [class*="picker"]', { timeout: 3000 });
                
                const dateParts = departDate.split('-');
                const year = dateParts[0];
                const month = parseInt(dateParts[1]);
                const day = parseInt(dateParts[2]);
                
                // Navigate to correct month/year if needed
                // Try to find month/year navigation
                const monthYearButton = await page.$('button[aria-label*="month"], button[aria-label*="year"], [class*="month"], [class*="year"]');
                if (monthYearButton) {
                  // Might need to navigate months - for now just try to click the day
                }
                
                // Try to find and click the day
                const calendarSelectors = [
                  `button[aria-label*="${month}/${day}/${year}"]`,
                  `button[aria-label*="${year}-${dateParts[1]}-${dateParts[2]}"]`,
                  `[data-date="${departDate}"]`,
                  `[data-day="${day}"][data-month="${month - 1}"]`, // months are 0-indexed
                  `button:has-text("${day}")`,
                  `[class*="day"]:has-text("${day}")`
                ];
                
                for (const calSelector of calendarSelectors) {
                  try {
                    const dateButton = await page.$(calSelector);
                    if (dateButton) {
                      await dateButton.evaluate(el => el.scrollIntoView({ block: 'center' }));
                      await new Promise(resolve => setTimeout(resolve, 300));
                      await dateButton.click({ delay: 200 });
                      console.log(`   ✅ Selected date in calendar using: ${calSelector}`);
                      dateFilled = true;
                      break;
                    }
                  } catch (e) {
                    // Continue
                  }
                }
              } catch (e) {
                console.log(`   ⚠️ Calendar did not appear: ${e.message}`);
              }
            }
            
            if (dateFilled) {
              console.log('✅ Filled date field');
              break;
            }
          }
        } catch (e) {
          // Continue to next selector
        }
      }
      
      // Verify form is filled before searching
      await new Promise(resolve => setTimeout(resolve, 2000));
      
      // Double-check we're still on Greyhound before clicking search
      const currentUrlBeforeSearch = page.url();
      if (!currentUrlBeforeSearch.includes('greyhound.com')) {
        console.log(`⚠️ Warning: Not on Greyhound (${currentUrlBeforeSearch}), navigating back...`);
        await page.goto('https://www.greyhound.com', { waitUntil: 'networkidle2', timeout: 30000 });
        await new Promise(resolve => setTimeout(resolve, 3000));
        // Would need to re-fill form, but for now just skip
        console.log('⚠️ Form needs to be re-filled, skipping search button click');
        formFilled = false;
      }
      
      if (formFilled) {
        // Click search/submit button - be very specific to avoid clicking wrong buttons
        // First, find all buttons and filter out hotel/booking ones
        const allButtons = await page.$$('button, [role="button"], a[class*="button"]');
        let searchButton = null;
        
        for (const btn of allButtons) {
          try {
            const buttonText = await btn.evaluate(el => {
              return (el.innerText || el.textContent || el.getAttribute('aria-label') || '').toLowerCase();
            });
            
            const buttonId = await btn.evaluate(el => el.id || '');
            const buttonClass = await btn.evaluate(el => el.className || '');
            
            // Skip hotel/booking buttons
            if (buttonText.includes('hotel') || buttonText.includes('booking') || 
                buttonClass.includes('hotel') || buttonClass.includes('booking')) {
              continue;
            }
            
            // Look for bus/travel search buttons
            if ((buttonText.includes('search') || buttonText.includes('find') || buttonText.includes('go')) &&
                !buttonText.includes('hotel') && !buttonText.includes('booking')) {
              // Verify it's in a form or search container
              const isInSearchForm = await btn.evaluate(el => {
                let parent = el.parentElement;
                let depth = 0;
                while (parent && depth < 10) {
                  const parentClass = parent.className || '';
                  const parentId = parent.id || '';
                  if (parent.tagName === 'FORM' || 
                      parentClass.includes('search') || parentId.includes('search') ||
                      parentClass.includes('form') || parentId.includes('form')) {
                    return true;
                  }
                  parent = parent.parentElement;
                  depth++;
                }
                return false;
              });
              
              if (isInSearchForm) {
                searchButton = btn;
                console.log(`✅ Found search button: "${buttonText}"`);
                break;
              }
            }
          } catch (e) {
            // Continue
          }
        }
        
        // If we found a button, click it
        if (searchButton) {
          try {
            await searchButton.evaluate(el => el.scrollIntoView({ block: 'center' }));
            await new Promise(resolve => setTimeout(resolve, 500));
            await searchButton.click({ delay: 200 });
            console.log('✅ Clicked search button');
            
            // Wait for navigation, but check URL to make sure we're going to Greyhound
            await new Promise(resolve => setTimeout(resolve, 3000));
            const urlAfterClick = page.url();
            if (urlAfterClick.includes('booking.com') || urlAfterClick.includes('hotel')) {
              console.log(`⚠️ Redirected to wrong site: ${urlAfterClick}`);
              console.log('   Trying direct URL navigation instead...');
              const url = buildGreyhoundUrl(from, to, departDate);
              await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
            } else {
              await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 30000 }).catch(() => {
                console.log('   ⚠️ Navigation timeout, continuing...');
              });
            }
          } catch (e) {
            console.log(`⚠️ Error clicking search button: ${e.message}`);
            // Fallback to direct URL
            const url = buildGreyhoundUrl(from, to, departDate);
            console.log(`🔗 Using direct URL: ${url}`);
            await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
          }
        } else {
          console.log('⚠️ Could not find search button, using direct URL...');
          const url = buildGreyhoundUrl(from, to, departDate);
          await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
        }
      } else {
        // Form wasn't filled, use direct URL
        console.log('⚠️ Form not filled, using direct URL...');
        const url = buildGreyhoundUrl(from, to, departDate);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      }
      
      if (!formFilled) {
        // If form interaction failed, try direct URL as fallback
        console.log('⚠️ Form interaction failed, trying direct URL...');
        const url = buildGreyhoundUrl(from, to, departDate);
        await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
      }
    } catch (formError) {
      console.log('⚠️ Form interaction error:', formError.message);
      // Fallback to direct URL
      const url = buildGreyhoundUrl(from, to, departDate);
      console.log(`🔗 Trying direct URL: ${url}`);
      await page.goto(url, { waitUntil: 'networkidle2', timeout: 30000 });
    }
    
    // Wait for page to load and any dynamic content
    console.log('⏳ Waiting for page content to load...');
    console.log('   (Watch the browser window to see what happens)');
    
    // Wait for search results to appear - try multiple selectors
    console.log('⏳ Waiting for search results to load...');
    try {
      await page.waitForSelector('[class*="SearchResult"], [class*="TripCard"], [class*="result"], [data-testid*="trip"], .trip-card, article, [role="article"], [class*="journey"]', { 
        timeout: 20000 
      }).catch(() => {
        console.log('   No specific results selector found, continuing...');
      });
    } catch (e) {
      console.log('   Still waiting for results...');
    }
    
    // Give extra time for dynamic content to render
    await new Promise(resolve => setTimeout(resolve, 10000));
    
    // Scroll down to trigger lazy loading
    await page.evaluate(() => {
      window.scrollTo(0, document.body.scrollHeight / 2);
    });
    await new Promise(resolve => setTimeout(resolve, 3000));
    
    // Scroll back up
    await page.evaluate(() => {
      window.scrollTo(0, 0);
    });
    await new Promise(resolve => setTimeout(resolve, 2000));
    
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
        'article': document.querySelectorAll('article').length,
        '[role="article"]': document.querySelectorAll('[role="article"]').length,
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
