import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { scrapeGoogleFlights } from './scrapers/flightScraper.js';
import { MongoClient } from 'mongodb';
import { 
  getAmtrakFare, 
  getStations, 
  getStationByCode,
  getAvailableRoutes,
  getGroupedTrainResults
} from './services/amtrakService.js';

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
  const {from, to, departDate, returnDate, tripType} = searchParams;
  
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
    const query = {'departure.location': from, 'arrival.location': to, departDate: departDate, returnDate: returnDate || null, type: tripType};
    const cachedResults = await collection.find(query).toArray();
    if (cachedResults && cachedResults.length > 0) {
     console.log(`✅ [DATABASE] Found ${cachedResults.length} cached results`);
     return cachedResults;
    }

    console.log('❌ [DATABASE] No cached results found, will use scraper');
    return null;

   } catch(error) {
     console.error('❌ Database check error:', error);
     return null;
  } finally {
     await client.close();
  }
}

/**
 * Helper function to format minutes to readable duration string
 * @param {number} minutes - Duration in minutes
 * @returns {string} Formatted duration (e.g., "2 hr 30 min")
 */
function formatDuration(minutes) {
  if (!minutes) return 'N/A';
  const hours = Math.floor(minutes / 60);
  const mins = minutes % 60;
  if (hours === 0) return `${mins} min`;
  if (mins === 0) return `${hours} hr`;
  return `${hours} hr ${mins} min`;
}

/**
 * Convert minutes since midnight to time string (e.g., 413 -> "06:53 AM")
 * @param {number} minutes - Minutes since midnight
 * @returns {string} Time string in format "HH:MM AM/PM"
 */
function minutesToTimeString(minutes) {
  if (minutes === null || minutes === undefined) return null;
  
  let totalMinutes = minutes % (24 * 60); // Handle overflow
  if (totalMinutes < 0) totalMinutes += 24 * 60;
  
  const hours = Math.floor(totalMinutes / 60);
  const mins = totalMinutes % 60;
  
  let displayHours = hours;
  let period = 'AM';
  
  if (hours === 0) {
    displayHours = 12;
  } else if (hours === 12) {
    period = 'PM';
  } else if (hours > 12) {
    displayHours = hours - 12;
    period = 'PM';
  }
  
  return `${displayHours}:${mins.toString().padStart(2, '0')} ${period}`;
}

/**
 * Format train results to match flight result structure
 * @param {Array} trainResults - Array of grouped train results
 * @param {string} from - Origin city name
 * @param {string} to - Destination city name
 * @param {string} departDate - Departure date
 * @param {string|null} returnDate - Return date (if roundtrip)
 * @returns {Array} Formatted train results
 */
function formatTrainResults(trainResults, from, to, departDate, returnDate) {
  return trainResults.map(train => {
    const stopsText = train.transfers === 0 ? 'Nonstop' : `${train.transfers} transfer${train.transfers > 1 ? 's' : ''}`;
    const priceFormatted = `$${train.priceUSD.toFixed(2)}`;
    
    // Calculate arrival time from departure time and duration
    let departureTime = train.departureTime || null;
    let arrivalTime = null;
    
    if (train.departureTimeMinutes !== null && train.departureTimeMinutes !== undefined && train.durationMin) {
      const arrivalMinutes = train.departureTimeMinutes + train.durationMin;
      arrivalTime = minutesToTimeString(arrivalMinutes);
    }
    
    return {
      type: returnDate ? 'roundtrip' : 'oneway',
      departure: {
        location: from,
        time: departureTime
      },
      arrival: {
        location: to,
        time: arrivalTime
      },
      duration: formatDuration(train.durationMin),
      departDate: departDate,
      returnDate: returnDate || null,
      durationMinutes: train.durationMin,
      price: train.priceUSD,
      priceFormatted: priceFormatted,
      currency: 'USD',
      provider: 'Amtrak',
      stops: stopsText,
      bags: null,
      source: 'Amtrak',
      rawSummary: `Amtrak train from ${train.origin} to ${train.dest}, ${stopsText}, average price: ${priceFormatted}`,
      // Additional train-specific fields
      trainData: {
        origin: train.origin,
        dest: train.dest,
        transfers: train.transfers,
        sampleCount: train.sampleCount,
        priceRange: {
          min: train.minPriceUSD,
          max: train.maxPriceUSD
        }
      }
    };
  });
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
    let flightResults = await checkDatabase({ from, to, departDate, returnDate, tripType});

    // Step 2: If no database results, use web scraper
    if (!flightResults) {
      console.log('🌐 [SCRAPER] Starting web scraper...');
      flightResults = await scrapeGoogleFlights(
        from,
        to,
        departDate,
        tripType === 'roundtrip' ? returnDate : null
      );
      
      // TODO: Save results to database for caching
      // await db.flights.insertMany(results.map(r => ({ ...r, scrapedAt: new Date() })));
    }

    // Step 3: Fetch train data in parallel
    let trainResults = [];
    try {
      console.log('🚂 [TRAINS] Fetching train data...');
      const rawTrainResults = await getGroupedTrainResults(from, to, 5); // Get top 5 grouped trains
      
      if (rawTrainResults && rawTrainResults.length > 0) {
        trainResults = formatTrainResults(rawTrainResults, from, to, departDate, returnDate);
        console.log(`✅ [TRAINS] Found ${trainResults.length} train options`);
      } else {
        console.log('ℹ️ [TRAINS] No train routes found for this route');
      }
    } catch (trainError) {
      console.error('⚠️ [TRAINS] Error fetching train data:', trainError.message);
      // Continue without train data - don't fail the entire request
    }

    // Step 4: Combine flight and train results
    const allResults = [];
    if (flightResults && flightResults.length > 0) {
      allResults.push(...flightResults);
    }
    if (trainResults && trainResults.length > 0) {
      allResults.push(...trainResults);
    }

    // Step 5: Sort all results together
    if (allResults.length > 0) {
      if (sortBy === 'price') {
        allResults.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
      } else if (sortBy === 'time') {
        allResults.sort((a, b) => (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity));
      }
    }

    console.log(`\n✅ Returning ${allResults.length} total results (${flightResults?.length || 0} flights, ${trainResults.length} trains)\n`);
    
    res.json(allResults || []);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Failed to search for travel options',
      message: error.message
    });
  }
});

// Chat endpoint with improved rule-based chatbot logic
app.post('/api/chat', async (req, res) => {
  try {
    const { message, messages } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userMessage = message.trim();
    const userMessageLower = userMessage.toLowerCase();
    
    // Better extraction patterns - handle more natural language
    const fromPatterns = [
      /(?:from|leaving|departing|flying\s+from|starting\s+in)\s+([a-z][a-z\s,'-]+?)(?:\s+to|\s+going|\s+destined|\s+arriving|\s+on|$)/i,
      /^([a-z][a-z\s,'-]+?)\s+to\s+[a-z]/i // "New York to Los Angeles"
    ];
    const toPatterns = [
      /(?:to|going\s+to|traveling\s+to|arriving\s+at|destination|flying\s+to)\s+([a-z][a-z\s,'-]+?)(?:\s+from|\s+on|\s+date|\s+$)/i,
      /[a-z]\s+to\s+([a-z][a-z\s,'-]+?)(?:\s+on|\s+$)/i // "New York to Los Angeles"
    ];
    const datePatterns = [
      /(?:on|date|departure|leaving|returning|depart)\s+(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i,
      /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/i, // Just a date
      /(?:on|for)\s+(\w+\s+\d{1,2})/i // "on January 15"
    ];
    
    let from = null;
    let to = null;
    let date = null;
    
    // Try to extract from/to using multiple patterns
    for (const pattern of fromPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        from = match[1].trim().replace(/[,\s]+$/, ''); // Remove trailing commas/spaces
        break;
      }
    }
    
    for (const pattern of toPatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        to = match[1].trim().replace(/[,\s]+$/, '');
        break;
      }
    }
    
    // Extract date
    for (const pattern of datePatterns) {
      const match = userMessage.match(pattern);
      if (match) {
        date = match[1].trim();
        break;
      }
    }
    
    const priceWords = userMessageLower.match(/(?:cheapest|cheap|lowest\s+price|affordable|budget|save\s+money|low\s+cost)/i);
    const timeWords = userMessageLower.match(/(?:fastest|quickest|shortest|time|duration|quick|fast)/i);
    const flightWords = userMessageLower.match(/(?:flight|fly|airplane|airline)/i);
    const trainWords = userMessageLower.match(/(?:train|railway|amtrak)/i);
    const busWords = userMessageLower.match(/(?:bus|greyhound|megabus)/i);
    
    // Handle greetings with more personality
    if (userMessageLower.match(/(?:hi|hello|hey|greetings|good\s+(morning|afternoon|evening)|what's\s+up)/i)) {
      return res.json({
        response: 'Hi there! 👋 I\'m here to help you plan your trip and find the best travel options.\n\nI can help you:\n• Compare flights, trains, and buses\n• Find the cheapest or fastest routes\n• Search by destination and dates\n\nWhat would you like to search for? For example, try: "Find flights from New York to Los Angeles" or "What\'s the cheapest way to get from Boston to Chicago?"'
      });
    }

    // Handle help requests
    if (userMessageLower.match(/(?:help|what\s+can\s+you\s+do|how\s+do\s+i|instructions|what\s+do\s+you\s+do)/i)) {
      return res.json({
        response: 'I\'m your travel assistant! ✈️ I can help you:\n\n✅ Search for flights, trains, and buses\n✅ Compare prices and travel times\n✅ Find the cheapest or fastest options\n✅ Help you plan your trip\n\n**How to use me:**\nJust tell me where you want to go! For example:\n• "I need to get from New York to Los Angeles"\n• "Find the cheapest flight to Paris"\n• "What\'s the fastest way from Boston to Chicago?"\n\nOr use the search form on the left for detailed searches with specific dates!'
      });
    }

    // Handle travel queries with both locations
    if (from && to) {
      const searchType = priceWords ? 'cheapest' : timeWords ? 'fastest' : 'best';
      const transportType = flightWords ? 'flights' : trainWords ? 'trains' : busWords ? 'buses' : 'travel options';
      const dateStr = date ? ` on ${date}` : '';
      
      // Capitalize city names properly
      const fromCap = from.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      const toCap = to.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      
      return res.json({
        response: `Great! I'd love to help you find ${searchType === 'cheapest' ? 'the most affordable' : searchType === 'fastest' ? 'the quickest' : 'the best'} ${transportType} from ${fromCap} to ${toCap}${dateStr}.\n\nTo get your results:\nUse the search form on the left side of the page:\n1. Enter "From": ${fromCap}\n2. Enter "To": ${toCap}${date ? `\n3. Select "Departure Date": ${date}` : '\n3. Select your departure date'}\n4. Click "Search"\n\nI'll show you all available options sorted by ${searchType === 'cheapest' ? 'price (lowest first)' : searchType === 'fastest' ? 'travel time (fastest first)' : 'best value'}! 🎯`
      });
    } 
    // Handle single location - ask for the other
    else if (from || to) {
      const location = from || to;
      const locationCap = location.split(' ').map(word => word.charAt(0).toUpperCase() + word.slice(1)).join(' ');
      
      if (from) {
        return res.json({
          response: `I see you're starting from ${locationCap}! 🌍 Where would you like to travel to? Just tell me your destination, for example:\n\n• "I want to go to Los Angeles"\n• "Find flights to Paris"\n• "What about Chicago?"\n\nOnce you tell me both cities, I can help you find the best travel options!`
        });
      } else {
        return res.json({
          response: `So you want to go to ${locationCap}! ✈️ That sounds great. Where are you traveling from?\n\nJust tell me your starting city, for example:\n• "I'm starting from New York"\n• "From Boston"\n• "Leaving from San Francisco"\n\nOnce I know both locations, I can help you compare all the travel options!`
        });
      }
    }

    // Handle price-related queries
    if (priceWords) {
      return res.json({
        response: 'Looking for budget-friendly options? 💰 I can definitely help with that!\n\nTo find the cheapest travel options, I need:\n• Where you\'re starting from (your origin city)\n• Where you want to go (your destination)\n• When you want to travel (optional, but helps find better deals)\n\nExample queries:\n• "Find the cheapest flight from New York to Los Angeles"\n• "What\'s the most affordable way to get from Boston to Chicago?"\n• "I need cheap flights to Paris"\n\nOr use the search form on the left - it will automatically sort by price!'
      });
    }

    // Handle time-related queries
    if (timeWords) {
      return res.json({
        response: 'Looking for the fastest route? ⚡ I can help you find the quickest travel options!\n\nTo find the fastest options, tell me:\n• Your starting location\n• Your destination\n• Travel date (optional)\n\nExample queries:\n• "What\'s the fastest way from New York to Los Angeles?"\n• "Find the quickest flight to Chicago"\n• "I need to get from Boston to San Francisco as fast as possible"\n\nYou can also use the search form and sort by "Time" to see the fastest options first!'
      });
    }

    // Handle thank you
    if (userMessageLower.match(/(?:thanks|thank\s+you|appreciate|awesome|perfect)/i)) {
      return res.json({
        response: 'You\'re very welcome! 😊 I\'m here anytime you need help planning your trip. Safe travels! ✈️🌍'
      });
    }

    // Handle questions about the service
    if (userMessageLower.match(/(?:what|how|can|does|is|are)\s+(you|this|it)/i)) {
      return res.json({
        response: 'I\'m a travel assistant that helps you compare flights, trains, and buses all in one place! 🗺️\n\nWhat I do:\n• Compare prices across different transportation options\n• Find the fastest or cheapest routes\n• Help you plan your trip\n\nHow to use me:\nJust tell me where you want to go! For example:\n• "Find flights from New York to Los Angeles"\n• "What\'s the cheapest way to get to Chicago?"\n• "I need to travel from Boston to San Francisco"\n\nTry asking me about a specific route, or use the search form for detailed searches!'
      });
    }

    // More helpful default response
    return res.json({
      response: 'I\'m here to help you plan your trip! 🎒\n\nTry asking me:\n• "Find flights from [city] to [city]"\n• "What\'s the cheapest way to get from New York to Los Angeles?"\n• "Show me travel options to Paris"\n• "I need to get from Boston to Chicago"\n\nJust tell me your origin and destination cities, and I\'ll guide you on how to search for options! You can also use the search form on the left for detailed searches with specific dates. ✈️'
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

// =====================================================
// AMTRAK FARE ENDPOINTS
// =====================================================

/**
 * Get Amtrak fare for a route and date
 * GET /api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15
 */
app.get('/api/amtrak/fare', async (req, res) => {
  try {
    const { origin, dest, date } = req.query;

    // Validate required parameters
    if (!origin || !dest || !date) {
      return res.status(400).json({
        error: 'Missing required parameters',
        required: ['origin', 'dest', 'date'],
        example: '/api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15'
      });
    }

    console.log(`\n🚂 [AMTRAK] Fare lookup: ${origin} → ${dest} on ${date}`);

    const fare = await getAmtrakFare(origin, dest, date);

    if (!fare) {
      return res.status(404).json({
        error: 'No fare found for this route',
        origin,
        dest,
        date,
        message: 'This route may not exist in our dataset'
      });
    }

    console.log(`✅ [AMTRAK] Found fare: $${fare.priceUSD} (${fare.isEstimated ? 'estimated' : 'exact'})`);
    res.json(fare);

  } catch (error) {
    console.error('❌ Amtrak fare lookup error:', error);
    res.status(500).json({ error: 'Failed to look up Amtrak fare' });
  }
});

/**
 * Get all Amtrak stations
 * GET /api/amtrak/stations
 */
app.get('/api/amtrak/stations', async (req, res) => {
  try {
    const stations = await getStations();
    res.json(stations);
  } catch (error) {
    console.error('❌ Amtrak stations error:', error);
    res.status(500).json({ error: 'Failed to load stations' });
  }
});

/**
 * Get a specific station by code
 * GET /api/amtrak/stations/:code
 */
app.get('/api/amtrak/stations/:code', async (req, res) => {
  try {
    const { code } = req.params;
    const station = await getStationByCode(code);

    if (!station) {
      return res.status(404).json({
        error: 'Station not found',
        code,
        message: 'This station code does not exist in our dataset'
      });
    }

    res.json(station);
  } catch (error) {
    console.error('❌ Amtrak station lookup error:', error);
    res.status(500).json({ error: 'Failed to look up station' });
  }
});

/**
 * Get all available routes
 * GET /api/amtrak/routes
 */
app.get('/api/amtrak/routes', async (req, res) => {
  try {
    const routes = await getAvailableRoutes();
    res.json(routes);
  } catch (error) {
    console.error('❌ Amtrak routes error:', error);
    res.status(500).json({ error: 'Failed to load routes' });
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
      recommendations: 'GET /api/recommendations',
      amtrak: {
        fare: 'GET /api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15',
        stations: 'GET /api/amtrak/stations',
        station: 'GET /api/amtrak/stations/:code',
        routes: 'GET /api/amtrak/routes'
      }
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
  console.log('   🚂 Amtrak endpoints:');
  console.log('   GET  /api/amtrak/fare - Look up Amtrak fare');
  console.log('   GET  /api/amtrak/stations - List all stations');
  console.log('   GET  /api/amtrak/stations/:code - Get station by code');
  console.log('   GET  /api/amtrak/routes - List available routes');
  console.log('\n🌐 Allowed origins:', allowedOrigins.join(', ') || 'all .netlify.app domains');
});
