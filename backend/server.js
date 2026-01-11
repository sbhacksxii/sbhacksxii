import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { scrapeGoogleFlights } from './scrapers/flightScraper.js';
import { MongoClient } from 'mongodb';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// CORS configuration - allow requests from your Netlify frontend
const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:5173',
  process.env.FRONTEND_URL, // Set this in Railway to your Netlify URL
].filter(Boolean);

app.use(cors({
  origin: function(origin, callback) {
    // Allow requests with no origin (mobile apps, curl, etc.)
    if (!origin) return callback(null, true);
    
    if (allowedOrigins.includes(origin) || origin.endsWith('.netlify.app')) {
      callback(null, true);
    } else {
      console.log('Blocked by CORS:', origin);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true
}));

app.use(express.json());

/**
 * =====================================================
 * DATABASE PLACEHOLDER
 * =====================================================
 * This function should check the database for cached/stored flight data
 * before falling back to the web scraper.
 * 
 * TODO: Implement database lookup
 * - Check if we have recent data for this route
 * - Return cached results if fresh (e.g., < 1 hour old)
 * - Return null to trigger scraper if no data or stale
 */
async function checkDatabase(searchParams) {
  const {from, to, departDate, tripType } = searchParams;
  
  console.log('📊 [DATABASE] Checking for cached results...');
  console.log(`   Route: ${from} → ${to}`);
  console.log(`   Date: ${departDate}${returnDate ? ` - ${returnDate}` : ''}`);
  
  const uri = "mongodb+srv://johnsylvester_db_user:3bsbf7i6zrTFivhe@streamlinetravel.amyqwim.mongodb.net/?appName=StreamlineTravel";
  const client = new MongoClient(uri); 
  const dbName = "TravelData"; 
  const collectionName = 'PlaneData';

  try {
    await client.connect(); 
    const db = client.db(dbName); 
    const collection = db.collection(collectionName); 
    const query = {departure: {location: from}, arrival: {location: to}, date: departDate, tripType};
    const cachedResults = await collection.find(query).toArray();
    if (cachedResults && cachedResults.length > 0) {
     console.log(`✅ [DATABASE] Found ${cachedResults.length} cached results`);
     return cachedResults;
    }

    console.log('❌ [DATABASE] No cached results found, will use scraper');
    return null;

  } catch (error) {
     console.error('❌ Database check error:', error);
     return null;
  } finally {
     await client.close();
  }
}

/**
 * Search API endpoint
 * POST /api/search
 */
app.post('/api/search', async (req, res) => {
  try {
    const { from, to, departDate, returnDate, tripType, sortBy } = req.body;
    
    console.log('\n' + '='.repeat(50));
    console.log('🔍 New Search Request');
    console.log('='.repeat(50));
    console.log(`From: ${from}`);
    console.log(`To: ${to}`);
    console.log(`Departure: ${departDate}`);
    console.log(`Trip Type: ${tripType}`);
    if (returnDate) console.log(`Return: ${returnDate}`);
    console.log(`Sort By: ${sortBy}`);
    console.log('='.repeat(50) + '\n');

    // Validate required fields
    if (!from || !to || !departDate) {
      return res.status(400).json({
        error: 'Missing required fields',
        required: ['from', 'to', 'departDate']
      });
    }

    // Step 1: Check database first (placeholder)
    let results = await checkDatabase({ from, to, departDate, tripType});

    // Step 2: If no database results, use web scraper
    if (!results) {
      console.log('🌐 [SCRAPER] Starting web scraper...');
      results = await scrapeGoogleFlights(
        from,
        to,
        departDate,
        tripType === 'roundtrip' ? returnDate : null
      );
      
      // TODO: Save results to database for caching
      // await db.flights.insertMany(results.map(r => ({ ...r, scrapedAt: new Date() })));
    }

    // Step 3: Sort results
    if (results && results.length > 0) {
      if (sortBy === 'price') {
        results.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
      } else if (sortBy === 'time') {
        results.sort((a, b) => (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity));
      }
    }

    console.log(`\n✅ Returning ${results?.length || 0} results\n`);
    
    res.json(results || []);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Failed to search for flights',
      message: error.message
    });
  }
});

// Chat endpoint (placeholder for future chatbot integration)
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    // TODO: Implement chatbot logic
    // For now, return a simple response
    res.json({
      response: 'I understand you want to search for travel options. Please use the search form to find flights, trains, and buses.'
    });
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Recommendations endpoint (placeholder)
app.get('/api/recommendations', async (req, res) => {
  try {
    // TODO: Implement recommendations logic
    res.json({ message: 'Recommendations endpoint - coming soon' });
  } catch (error) {
    console.error('Recommendations error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Health check endpoint
app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({ 
    name: 'Travel Hub API',
    version: '1.0.0',
    endpoints: {
      search: 'POST /api/search',
      health: 'GET /api/health',
      chat: 'POST /api/chat',
      recommendations: 'GET /api/recommendations'
    }
  });
});

// Start server
app.listen(PORT, () => {
  console.log('\n╔════════════════════════════════════════╗');
  console.log('║     Travel Hub Backend API Server      ║');
  console.log('╚════════════════════════════════════════╝');
  console.log(`\n🚀 Server running on port ${PORT}`);
  console.log('📡 API endpoints:');
  console.log('   POST /api/search - Search for travel options');
  console.log('   GET  /api/health - Health check');
  console.log('   POST /api/chat - Chatbot endpoint');
  console.log('   GET  /api/recommendations - Recommendations');
  console.log('\n🌐 Allowed origins:', allowedOrigins.join(', ') || 'all .netlify.app domains');
});
