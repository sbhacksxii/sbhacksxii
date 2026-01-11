import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import { scrapeGoogleFlights } from './scrapers/flightScraper.js';
import { MongoClient } from 'mongodb';
import Groq from 'groq-sdk';
import { 
  getAmtrakFare, 
  getStations, 
  getStationByCode,
  getAvailableRoutes,
  getGroupedTrainResults
} from './services/amtrakService.js';
import { buildConnections } from './services/connectionService.js';

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3001;

// Initialize Groq client
const groq = new Groq({
  apiKey: process.env.GROQ_API_KEY || ''
});

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

    // Step 4: Build connections (flight + train combinations)
    let connectionResults = [];
    if (flightResults && flightResults.length > 0 && trainResults && trainResults.length > 0) {
      try {
        console.log('🔗 [CONNECTIONS] Building train + flight connections...');
        connectionResults = await buildConnections(flightResults, trainResults, from, to, departDate, returnDate);
        console.log(`✅ [CONNECTIONS] Found ${connectionResults.length} connection options`);
      } catch (connectionError) {
        console.error('⚠️ [CONNECTIONS] Error building connections:', connectionError.message);
        // Continue without connections - don't fail the entire request
      }
    }

    // Step 5: Combine flight, train, and connection results
    const allResults = [];
    if (flightResults && flightResults.length > 0) {
      allResults.push(...flightResults);
    }
    if (trainResults && trainResults.length > 0) {
      allResults.push(...trainResults);
    }
    if (connectionResults && connectionResults.length > 0) {
      allResults.push(...connectionResults);
    }

    // Step 6: Sort all results together
    if (allResults.length > 0) {
      if (sortBy === 'price') {
        allResults.sort((a, b) => (a.price || Infinity) - (b.price || Infinity));
      } else if (sortBy === 'time') {
        allResults.sort((a, b) => (a.durationMinutes || Infinity) - (b.durationMinutes || Infinity));
      }
    }

    console.log(`\n✅ Returning ${allResults.length} total results (${flightResults?.length || 0} flights, ${trainResults.length} trains, ${connectionResults.length} connections)\n`);
    
    res.json(allResults || []);
    
  } catch (error) {
    console.error('❌ Search error:', error);
    res.status(500).json({
      error: 'Failed to search for travel options',
      message: error.message
    });
  }
});

// Chat endpoint with Groq AI integration
app.post('/api/chat', async (req, res) => {
  try {
    const { message, messages } = req.body;
    
    if (!message || !message.trim()) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const userMessage = message.trim();

    // Check if Groq API key is configured
    if (!process.env.GROQ_API_KEY) {
      console.warn('⚠️ GROQ_API_KEY not configured, using fallback response');
      return res.json({
        response: 'I\'m here to help you plan your trip! 🎒\n\nPlease configure the GROQ_API_KEY environment variable to enable AI-powered responses.\n\nTry asking me:\n• "Find flights from [city] to [city]"\n• "What\'s the cheapest way to get from New York to Los Angeles?"\n• "Show me travel options to Paris"\n\nYou can also use the search form on the left for detailed searches with specific dates. ✈️'
      });
    }

    // System prompt for the travel assistant
    const systemPrompt = `You are a helpful and friendly travel assistant chatbot for a multi-transport travel comparison platform. Your role is to:

1. Help users find travel options (flights, trains, buses) between cities
2. Provide helpful information about travel planning
3. Guide users on how to use the search form on the website
4. Be conversational, friendly, and use emojis appropriately (but not excessively)
5. When users ask about specific routes, ALWAYS ask for missing information before filling the form

IMPORTANT INFORMATION COLLECTION RULES:
- When a user asks to search for flights/travel, you MUST collect ALL required information before filling the form
- REQUIRED information: origin city, destination city, departure date, and trip type (oneway vs roundtrip)
- ALWAYS ask: "What date would you like to depart?" if departure date is not provided
- ALWAYS ask: "Is this a one-way or round-trip?" if trip type is not clear
- If it's a round trip, ask: "What date would you like to return?" if return date is not provided
- Only fill in the search form (return searchParams) when you have: origin, destination, departure date, and trip type confirmed

When a user asks to search for travel but information is missing, respond conversationally asking for the missing details:
{"response": "I'd be happy to help you find flights! To get started, I need a few details:\n\n• What date would you like to depart?\n• Is this a one-way or round-trip?", "searchParams": null}

When you have ALL required information (origin, destination, departure date, trip type), respond in JSON format with this structure:
{
  "response": "your conversational response confirming the search",
  "searchParams": {
    "from": "origin city or airport code",
    "to": "destination city or airport code",
    "departDate": "YYYY-MM-DD format (e.g., 2026-01-15). IMPORTANT: Always use YYYY-MM-DD format, NOT MM/DD/YYYY. Default year is 2026 if user doesn't specify",
    "returnDate": "YYYY-MM-DD format or null (only if roundtrip). IMPORTANT: Always use YYYY-MM-DD format, NOT MM/DD/YYYY. Default year is 2026 if user doesn't specify",
    "tripType": "oneway" or "roundtrip",
    "sortBy": "price" or "time"
  }
}

If the user is NOT asking to search (just having a conversation), respond normally with just: {"response": "your response", "searchParams": null}

CRITICAL: 
- Dates MUST be in YYYY-MM-DD format (year-month-day). If a user says "1/15" or "January 15" without a year, use 2026 as the default year (e.g., "2026-01-15")
- If a user says "1/15/2025" or "10/01/2026", convert it to "2025-01-15" or "2026-10-01" respectively
- Default year is 2026 when user doesn't specify a year
- Never use MM/DD/YYYY format in the JSON response
- Always ask for missing information - don't guess or assume

Always respond in valid JSON format.`;

    // Build conversation history for context
    let conversationMessages = [
      {
        role: 'system',
        content: systemPrompt
      }
    ];

    // Add conversation history if provided (for context)
    if (messages && Array.isArray(messages)) {
      // Add previous messages (limit to last 10 for context)
      const recentMessages = messages.slice(-10);
      for (const msg of recentMessages) {
        if (msg.role && msg.content) {
          conversationMessages.push({
            role: msg.role === 'assistant' ? 'assistant' : 'user',
            content: msg.content
          });
        }
      }
    }

    // Add current user message
    conversationMessages.push({
      role: 'user',
      content: userMessage
    });

    // Call Groq API
    const completion = await groq.chat.completions.create({
      messages: conversationMessages,
      model: 'llama-3.3-70b-versatile', // Using Llama 3.3 70B model - fast and capable
      temperature: 0.7,
      max_tokens: 800, // Increased to accommodate JSON responses
      top_p: 1,
      stream: false,
      response_format: { type: 'json_object' } // Request JSON format
    });

    const rawResponse = completion.choices[0]?.message?.content || '{"response": "Sorry, I couldn\'t generate a response. Please try again.", "searchParams": null}';

    // Try to parse the JSON response
    let parsedResponse;
    try {
      parsedResponse = JSON.parse(rawResponse);
    } catch (parseError) {
      // If parsing fails, treat as plain text response
      console.warn('Failed to parse JSON response, using as plain text:', parseError);
      parsedResponse = {
        response: rawResponse,
        searchParams: null
      };
    }

    // Validate and clean search parameters if present
    let searchParams = null;
    if (parsedResponse.searchParams) {
      const params = parsedResponse.searchParams;
      console.log('[CHAT] Raw searchParams from LLM:', JSON.stringify(params));
      
      // Only include searchParams if we have at least origin and destination
      if (params.from && params.to) {
        // Convert dates to YYYY-MM-DD format if provided
        const formatDate = (dateStr) => {
          if (!dateStr || dateStr === 'null' || dateStr === null) return null;
          
          try {
            const trimmed = dateStr.trim();
            const DEFAULT_YEAR = 2026; // Default year when not specified
            
            // Handle MM/DD/YYYY or M/D/YYYY format explicitly (US format)
            const slashFormat = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/;
            const match = trimmed.match(slashFormat);
            
            if (match) {
              // Parse as MM/DD/YYYY (US format) - the prompt instructs the LLM to use this format
              const month = parseInt(match[1], 10);
              const day = parseInt(match[2], 10);
              const year = parseInt(match[3], 10);
              
              // Log for debugging
              console.log(`[DATE PARSING] Input: "${trimmed}" -> Month: ${month}, Day: ${day}, Year: ${year}`);
              
              // Validate month and day ranges
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const date = new Date(year, month - 1, day); // month is 0-indexed in Date
                if (!isNaN(date.getTime())) {
                  const yearStr = date.getFullYear().toString();
                  const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
                  const dayStr = date.getDate().toString().padStart(2, '0');
                  const result = `${yearStr}-${monthStr}-${dayStr}`;
                  console.log(`[DATE PARSING] Result: "${result}"`);
                  return result;
                }
              }
            }
            
            // Handle MM/DD format (without year) - default to 2026
            const slashFormatNoYear = /^(\d{1,2})\/(\d{1,2})$/;
            const matchNoYear = trimmed.match(slashFormatNoYear);
            if (matchNoYear) {
              const month = parseInt(matchNoYear[1], 10);
              const day = parseInt(matchNoYear[2], 10);
              console.log(`[DATE PARSING] Input: "${trimmed}" -> Month: ${month}, Day: ${day}, Year: ${DEFAULT_YEAR} (default)`);
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const date = new Date(DEFAULT_YEAR, month - 1, day);
                if (!isNaN(date.getTime())) {
                  const yearStr = date.getFullYear().toString();
                  const monthStr = (date.getMonth() + 1).toString().padStart(2, '0');
                  const dayStr = date.getDate().toString().padStart(2, '0');
                  const result = `${yearStr}-${monthStr}-${dayStr}`;
                  console.log(`[DATE PARSING] Result: "${result}"`);
                  return result;
                }
              }
            }
            
            // Try parsing as ISO format (YYYY-MM-DD) first - most reliable
            const isoFormat = /^(\d{4})-(\d{2})-(\d{2})$/;
            const isoMatch = trimmed.match(isoFormat);
            if (isoMatch) {
              const year = parseInt(isoMatch[1], 10);
              const month = parseInt(isoMatch[2], 10);
              const day = parseInt(isoMatch[3], 10);
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                return trimmed; // Already in correct format
              }
            }
            
            // Handle MM-DD format (without year) - default to 2026
            const isoFormatNoYear = /^(\d{2})-(\d{2})$/;
            const isoMatchNoYear = trimmed.match(isoFormatNoYear);
            if (isoMatchNoYear) {
              const month = parseInt(isoMatchNoYear[1], 10);
              const day = parseInt(isoMatchNoYear[2], 10);
              if (month >= 1 && month <= 12 && day >= 1 && day <= 31) {
                const result = `${DEFAULT_YEAR}-${trimmed}`;
                console.log(`[DATE PARSING] Input: "${trimmed}" -> Result: "${result}" (default year ${DEFAULT_YEAR})`);
                return result;
              }
            }
            
            // Last resort: Try parsing with Date constructor (unreliable, but better than nothing)
            const date = new Date(trimmed);
            if (!isNaN(date.getTime())) {
              // If the year is less than 2026, assume it should be 2026
              const parsedYear = date.getFullYear();
              if (parsedYear < 2026) {
                date.setFullYear(2026);
              }
              return date.toISOString().split('T')[0];
            }
            
            return null;
          } catch {
            return null;
          }
        };

        searchParams = {
          from: params.from.trim(),
          to: params.to.trim(),
          departDate: formatDate(params.departDate) || null,
          returnDate: formatDate(params.returnDate) || null,
          tripType: (params.tripType === 'roundtrip' || params.returnDate) ? 'roundtrip' : 'oneway',
          sortBy: (params.sortBy === 'time') ? 'time' : 'price'
        };

        // If it's a round trip but no return date, set tripType to oneway
        if (searchParams.tripType === 'roundtrip' && !searchParams.returnDate) {
          searchParams.tripType = 'oneway';
        }
      }
    }

    return res.json({
      response: parsedResponse.response || rawResponse,
      searchParams: searchParams
    });

  } catch (error) {
    console.error('Chat error:', error);
    
    // Provide a helpful fallback response on error
    const errorMessage = error.message || 'Unknown error';
    return res.status(500).json({ 
      error: 'Failed to get chatbot response',
      message: errorMessage,
      response: 'Sorry, I encountered an error processing your request. Please try again later, or use the search form on the left to find travel options directly. ✈️'
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
