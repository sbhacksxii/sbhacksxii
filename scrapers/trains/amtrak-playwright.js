/**
 * Amtrak Scraper - Playwright Implementation (Simplified)
 * 
 * Usage:
 *   node trains/amtrak-playwright.js
 *   node trains/amtrak-playwright.js --clear
 *   node trains/amtrak-playwright.js SBA LAX 2026-01-15
 */

import { chromium } from 'playwright';
import path from 'path';
import { fileURLToPath } from 'url';
import fs from 'fs';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Config
const USER_DATA_DIR = path.join(__dirname, '.playwright-data');
const SCREENSHOT_DIR = path.join(__dirname, '..');

// Parse args
const args = process.argv.slice(2);

// Handle --clear
if (args.includes('--clear')) {
  console.log('🧹 Clearing browser data...');
  if (fs.existsSync(USER_DATA_DIR)) {
    fs.rmSync(USER_DATA_DIR, { recursive: true, force: true });
  }
  args.splice(args.indexOf('--clear'), 1);
}

// Get params
const tomorrow = new Date();
tomorrow.setDate(tomorrow.getDate() + 1);

const from = args[0] || 'SBA';
const to = args[1] || 'LAX'; 
const departDate = args[2] || tomorrow.toISOString().split('T')[0];

console.log('\n🚂 Amtrak Playwright Scraper');
console.log('═'.repeat(50));
console.log(`From: ${from}`);
console.log(`To: ${to}`);
console.log(`Date: ${departDate}`);
console.log('═'.repeat(50));

// Helper: wait with logging
async function wait(ms, msg) {
  console.log(`⏳ ${msg} (${ms}ms)...`);
  await new Promise(r => setTimeout(r, ms));
}

// Helper: save screenshot
async function screenshot(page, name) {
  const filepath = path.join(SCREENSHOT_DIR, `pw-${name}.png`);
  await page.screenshot({ path: filepath, fullPage: true });
  console.log(`📸 Screenshot: pw-${name}.png`);
}

// Format date MM/DD/YYYY
function formatDate(dateStr) {
  const [year, month, day] = dateStr.split('-');
  return `${month}/${day}/${year}`;
}

// Main
async function main() {
  // Ensure data dir exists
  if (!fs.existsSync(USER_DATA_DIR)) {
    fs.mkdirSync(USER_DATA_DIR, { recursive: true });
  }

  console.log('\n🚀 Launching browser...');
  
  const browser = await chromium.launch({
    headless: false,
    slowMo: 100,  // Slow down all actions by 100ms
    args: ['--disable-blink-features=AutomationControlled']
  });
  
  const context = await browser.newContext({
    viewport: { width: 1366, height: 900 },
    userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
    locale: 'en-US',
    timezoneId: 'America/Los_Angeles'
  });
  
  const page = await context.newPage();
  
  // Check webdriver
  const webdriver = await page.evaluate(() => navigator.webdriver);
  console.log(`🔍 navigator.webdriver = ${webdriver}`);
  
  try {
    // ========================================
    // STEP 1: Navigate to Amtrak
    // ========================================
    console.log('\n📍 STEP 1: Navigate to Amtrak');
    await page.goto('https://www.amtrak.com/home', { 
      waitUntil: 'domcontentloaded',
      timeout: 30000 
    });
    await wait(3000, 'Waiting for page to load');
    await screenshot(page, '01-loaded');
    
    // ========================================
    // STEP 2: Handle cookie consent
    // ========================================
    console.log('\n📍 STEP 2: Handle cookie consent');
    try {
      // Look for OneTrust cookie banner
      const cookieBtn = page.locator('#onetrust-accept-btn-handler');
      if (await cookieBtn.isVisible({ timeout: 3000 })) {
        console.log('  Found cookie banner, clicking Accept...');
        await cookieBtn.click();
        await wait(1000, 'Cookie accepted');
      } else {
        console.log('  No cookie banner found');
      }
    } catch (e) {
      console.log('  Cookie banner not found or already handled');
    }
    await screenshot(page, '02-after-cookies');
    
    // ========================================
    // STEP 3: Click on Origin field
    // ========================================
    console.log('\n📍 STEP 3: Enter Origin');
    
    // Try multiple selectors for origin
    const originSelectors = [
      'input[placeholder*="From"]',
      'input[aria-label*="From"]', 
      '#mat-input-0',
      'input.origin-input'
    ];
    
    let originInput = null;
    for (const sel of originSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          originInput = el;
          console.log(`  Found origin input: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!originInput) {
      console.log('  ❌ Could not find origin input!');
      await screenshot(page, 'error-no-origin');
      throw new Error('Origin input not found');
    }
    
    await originInput.click();
    await wait(500, 'Clicked origin');
    await originInput.fill('');
    console.log(`  Typing: ${from}`);
    await originInput.type(from, { delay: 100 });
    await wait(1000, 'Waiting for autocomplete');
    await page.keyboard.press('ArrowDown');
    await wait(200, 'Arrow down');
    await page.keyboard.press('Enter');
    await wait(500, 'Selected origin');
    await screenshot(page, '03-origin-entered');
    
    // ========================================
    // STEP 4: Enter Destination
    // ========================================
    console.log('\n📍 STEP 4: Enter Destination');
    
    const destSelectors = [
      'input[placeholder*="To"]',
      'input[aria-label*="To"]',
      '#mat-input-1',
      'input.destination-input'
    ];
    
    let destInput = null;
    for (const sel of destSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          destInput = el;
          console.log(`  Found destination input: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!destInput) {
      console.log('  ❌ Could not find destination input!');
      await screenshot(page, 'error-no-dest');
      throw new Error('Destination input not found');
    }
    
    await destInput.click();
    await wait(500, 'Clicked destination');
    await destInput.fill('');
    console.log(`  Typing: ${to}`);
    await destInput.type(to, { delay: 100 });
    await wait(1000, 'Waiting for autocomplete');
    await page.keyboard.press('ArrowDown');
    await wait(200, 'Arrow down');
    await page.keyboard.press('Enter');
    await wait(500, 'Selected destination');
    await screenshot(page, '04-dest-entered');
    
    // ========================================
    // STEP 5: Enter Date
    // ========================================
    console.log('\n📍 STEP 5: Enter Date');
    
    const dateSelectors = [
      'input[placeholder*="Depart"]',
      'input[aria-label*="Depart"]',
      '#mat-input-2',
      'input.depart-date'
    ];
    
    let dateInput = null;
    for (const sel of dateSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          dateInput = el;
          console.log(`  Found date input: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (dateInput) {
      await dateInput.click({ clickCount: 3 });  // Select all
      await wait(300, 'Clicked date');
      const formattedDate = formatDate(departDate);
      console.log(`  Typing: ${formattedDate}`);
      await dateInput.type(formattedDate, { delay: 80 });
      await page.keyboard.press('Escape');  // Close date picker
      await page.keyboard.press('Tab');
      await wait(500, 'Date entered');
    } else {
      console.log('  ⚠️ Date input not found, skipping');
    }
    await screenshot(page, '05-date-entered');
    
    // ========================================
    // STEP 6: Click Find Trains
    // ========================================
    console.log('\n📍 STEP 6: Click Find Trains');
    await wait(2000, 'Waiting for form to be ready');
    
    const findTrainsSelectors = [
      'button[amt-auto-test-id="fare-finder-findtrains-button"]',
      'button[data-julie="findtrains"]',
      'button[aria-label="FIND TRAINS"]',
      'button:has-text("FIND TRAINS")',
      'button:has-text("Find Trains")',
      'button.search-btn'
    ];
    
    let findBtn = null;
    for (const sel of findTrainsSelectors) {
      try {
        const el = page.locator(sel).first();
        if (await el.isVisible({ timeout: 2000 })) {
          findBtn = el;
          console.log(`  Found Find Trains button: ${sel}`);
          break;
        }
      } catch (e) {}
    }
    
    if (!findBtn) {
      console.log('  ❌ Could not find Find Trains button!');
      await screenshot(page, 'error-no-button');
      throw new Error('Find Trains button not found');
    }
    
    // Move mouse to button then click (more human-like)
    const box = await findBtn.boundingBox();
    if (box) {
      await page.mouse.move(box.x + box.width/2, box.y + box.height/2);
      await wait(300, 'Mouse over button');
    }
    
    console.log('  Clicking Find Trains...');
    await findBtn.click();
    await screenshot(page, '06-clicked-search');
    
    // ========================================
    // STEP 7: Wait for results
    // ========================================
    console.log('\n📍 STEP 7: Wait for results');
    await wait(5000, 'Waiting for search results');
    await screenshot(page, '07-results');
    
    // Check for error message
    const pageText = await page.textContent('body');
    if (pageText.includes('experienced an') || pageText.includes('error')) {
      console.log('\n⚠️ ERROR DETECTED ON PAGE');
      console.log('  Bot detection may have triggered');
    }
    
    console.log('\n✅ Scraper completed!');
    console.log('Check the pw-*.png screenshots in the scrapers folder');
    
    // Keep browser open for inspection
    console.log('\n⏳ Browser staying open for 30 seconds for inspection...');
    await wait(30000, 'Inspect the browser');
    
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    await screenshot(page, 'error');
  } finally {
    await browser.close();
    console.log('🔒 Browser closed');
  }
}

main();
