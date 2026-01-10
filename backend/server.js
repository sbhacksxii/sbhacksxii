import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { scrapeGoogleFlights } from './scrapers/flightScraper.js';

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
  const { from, to, departDate, returnDate, tripType } = searchParams;
  
  console.log('📊 [DATABASE] Checking for cached results...');
  console.log(`   Route: ${from} → ${to}`);
  console.log(`   Date: ${departDate}${returnDate ? ` - ${returnDate}` : ''}`);
  
  // TODO: Replace with actual database query
  // Example implementation:
  // const cachedResults = await db.flights.find({
  //   from,
  //   to,
  //   departDate,
  //   tripType,
  //   scrapedAt: { $gte: new Date(Date.now() - 60 * 60 * 1000) } // < 1 hour old
  // });
  // 
  // if (cachedResults && cachedResults.length > 0) {
  //   console.log('✅ [DATABASE] Found cached results');
  //   return cachedResults;
  // }
  
  console.log('❌ [DATABASE] No cached results found, will use scraper');
  return null;
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
    let results = await checkDatabase({ from, to, departDate, returnDate, tripType });

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

/**
 * Parse natural language query to extract travel information
 * @param {string} message - User's natural language query
 * @returns {Object} Extracted travel parameters or null
 */
function parseTravelQuery(message) {
  const lowerMessage = message.toLowerCase();
  
  // Extract sort preference
  let sortBy = 'price'; // default
  if (lowerMessage.includes('cheapest') || lowerMessage.includes('cheap') || lowerMessage.includes('lowest price')) {
    sortBy = 'price';
  } else if (lowerMessage.includes('fastest') || lowerMessage.includes('quickest') || lowerMessage.includes('shortest time')) {
    sortBy = 'time';
  }
  
  // Patterns to extract locations (from ... to ...)
  const patterns = [
    /(?:from|leave|depart|departing from)\s+([a-z\s]+?)\s+(?:to|go to|going to|arrive in|arriving at|destination)\s+([a-z\s]+?)(?:\s|$|on|for|by|cheapest|fastest)/i,
    /([a-z\s]+?)\s+to\s+([a-z\s]+?)(?:\s|$|on|for|by|cheapest|fastest)/i,
    /(?:find|search|get|book|want)\s+(?:flights?|tickets?|travel|way|route)?\s*(?:from)?\s*([a-z\s]+?)\s+(?:to|for)\s+([a-z\s]+?)(?:\s|$|on|for|by|cheapest|fastest)/i,
  ];
  
  let from = null;
  let to = null;
  
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match && match[1] && match[2]) {
      from = match[1].trim();
      to = match[2].trim();
      break;
    }
  }
  
  // Extract dates
  let departDate = null;
  let returnDate = null;
  
  // Common date patterns
  const datePatterns = [
    /(\d{4}-\d{2}-\d{2})/g, // YYYY-MM-DD
    /(\d{1,2}\/\d{1,2}\/\d{4})/g, // MM/DD/YYYY
    /(\d{1,2}-\d{1,2}-\d{4})/g, // MM-DD-YYYY
    /(?:on|for|departing|leaving)\s+(\w+\s+\d{1,2},?\s+\d{4})/i, // "on January 15, 2024"
    /(?:on|for|departing|leaving)\s+(\w+\s+\d{1,2})/i, // "on January 15"
  ];
  
  const dates = [];
  for (const pattern of datePatterns) {
    const matches = message.matchAll(pattern);
    for (const match of matches) {
      let dateStr = match[1];
      // Try to parse and convert to YYYY-MM-DD
      try {
        const parsedDate = new Date(dateStr);
        if (!isNaN(parsedDate.getTime())) {
          const year = parsedDate.getFullYear();
          const month = String(parsedDate.getMonth() + 1).padStart(2, '0');
          const day = String(parsedDate.getDate()).padStart(2, '0');
          dates.push(`${year}-${month}-${day}`);
        }
      } catch (e) {
        // Try direct match if already in YYYY-MM-DD format
        if (/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
          dates.push(dateStr);
        }
      }
    }
  }
  
  if (dates.length > 0) {
    departDate = dates[0];
    if (dates.length > 1) {
      returnDate = dates[1];
    }
  }
  
  // If no date found, try to detect relative dates
  if (!departDate) {
    const today = new Date();
    if (lowerMessage.includes('today')) {
      departDate = today.toISOString().split('T')[0];
    } else if (lowerMessage.includes('tomorrow')) {
      today.setDate(today.getDate() + 1);
      departDate = today.toISOString().split('T')[0];
    } else if (lowerMessage.includes('next week')) {
      today.setDate(today.getDate() + 7);
      departDate = today.toISOString().split('T')[0];
    }
  }
  
  // Check for round trip indicators
  const isRoundTrip = lowerMessage.includes('round trip') || 
                     lowerMessage.includes('roundtrip') || 
                     lowerMessage.includes('return') ||
                     returnDate !== null;
  
  return {
    from,
    to,
    departDate,
    returnDate,
    tripType: isRoundTrip ? 'roundtrip' : 'oneway',
    sortBy
  };
}

/**
 * Format search results into a chatbot-friendly response
 */
function formatResultsForChat(results, query) {
  if (!results || results.length === 0) {
    return `I couldn't find any flights from ${query.from} to ${query.to} for ${query.departDate}. Please try a different date or route.`;
  }
  
  let response = `I found ${results.length} flight option${results.length > 1 ? 's' : ''} from ${query.from} to ${query.to}:\n\n`;
  
  // Show top 3-5 results
  const topResults = results.slice(0, 5);
  topResults.forEach((result, index) => {
    response += `${index + 1}. `;
    if (result.price) {
      response += `**${result.price}**`;
    }
    if (result.airline) {
      response += ` - ${result.airline}`;
    }
    if (result.duration) {
      response += ` (${result.duration})`;
    }
    if (result.departureTime && result.arrivalTime) {
      response += `\n   Departure: ${result.departureTime} → Arrival: ${result.arrivalTime}`;
    }
    if (result.stops) {
      response += ` (${result.stops})`;
    }
    response += '\n\n';
  });
  
  if (results.length > topResults.length) {
    response += `...and ${results.length - topResults.length} more options. Use the search form to see all results!`;
  }
  
  return response;
}

// Chat endpoint with natural language processing
app.post('/api/chat', async (req, res) => {
  try {
    const { message } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ 
        error: 'Message is required',
        response: 'Please provide a message so I can help you!'
      });
    }
    
    console.log('\n' + '='.repeat(50));
    console.log('💬 Chat Request');
    console.log('='.repeat(50));
    console.log(`Message: ${message}`);
    console.log('='.repeat(50) + '\n');
    
    // Parse the natural language query
    const query = parseTravelQuery(message);
    
    // Check if we extracted enough information to perform a search
    if (query.from && query.to) {
      // If we have locations but no date, use tomorrow as default
      if (!query.departDate) {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        query.departDate = tomorrow.toISOString().split('T')[0];
      }
      
      console.log('📋 Extracted query:', query);
      
      // Perform the search by calling the search logic
      try {
        let results = await checkDatabase(query);
        
        if (!results) {
          console.log('🌐 [CHATBOT] Starting search via scraper...');
          results = await scrapeGoogleFlights(
            query.from,
            query.to,
            query.departDate,
            query.tripType === 'roundtrip' ? query.returnDate : null
          );
        }
        
        // Sort results
        if (results && results.length > 0) {
          if (query.sortBy === 'price') {
            results.sort((a, b) => {
              const priceA = parseFloat(String(a.price || 0).replace(/[^0-9.]/g, '')) || Infinity;
              const priceB = parseFloat(String(b.price || 0).replace(/[^0-9.]/g, '')) || Infinity;
              return priceA - priceB;
            });
          } else if (query.sortBy === 'time') {
            results.sort((a, b) => (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity));
          }
        }
        
        // Format results for chat
        const chatResponse = formatResultsForChat(results, query);
        
        res.json({
          response: chatResponse,
          searchResults: results, // Also include raw results in case frontend wants to display them
          query: query
        });
      } catch (searchError) {
        console.error('❌ Search error in chatbot:', searchError);
        res.json({
          response: `I tried to search for flights from ${query.from} to ${query.to}, but encountered an error. Please try using the search form, or check if the scraper is working.`
        });
      }
    } else {
      // Not enough information extracted - provide helpful guidance
      let response = '';
      
      if (!query.from && !query.to) {
        response = "I'd be happy to help you find travel options! Please tell me:\n";
        response += "• Where you're traveling from\n";
        response += "• Where you're traveling to\n";
        response += "• When you want to depart (e.g., 'tomorrow', '2024-01-15', or 'next week')\n\n";
        response += "Example: 'Find flights from New York to Los Angeles tomorrow' or 'Cheapest way to get from NYC to LA'";
      } else if (!query.from) {
        response = "I need to know where you're departing from. Please include the origin city, like: 'from New York to Los Angeles'";
      } else if (!query.to) {
        response = `I found that you're departing from ${query.from}, but I need to know your destination. Please include the destination city, like: 'from ${query.from} to Los Angeles'`;
      }
      
      res.json({ response });
    }
  } catch (error) {
    console.error('Chat error:', error);
    res.status(500).json({ 
      error: 'Internal server error',
      response: 'Sorry, I encountered an error processing your request. Please try again.'
    });
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
