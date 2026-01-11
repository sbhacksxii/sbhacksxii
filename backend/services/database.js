/**
 * =====================================================
 * DATABASE CONNECTION POOL
 * =====================================================
 * 
 * Global MongoDB connection pool for efficient database access.
 * Reuses connections instead of creating new ones for each request.
 * 
 * PERFORMANCE IMPACT:
 * - Before: ~100-200ms per connection establishment
 * - After: ~1-5ms for cached connection reuse
 */

import { MongoClient } from 'mongodb';

// MongoDB connection string
const MONGO_URI = "mongodb+srv://johnsylvester_db_user:3bsbf7i6zrTFivhe@streamlinetravel.amyqwim.mongodb.net/?appName=StreamlineTravel";
const DB_NAME = "TravelData";

// Connection pool settings
const POOL_OPTIONS = {
  maxPoolSize: 10,           // Maximum connections in pool
  minPoolSize: 2,            // Keep at least 2 connections ready
  maxIdleTimeMS: 60000,      // Close idle connections after 1 minute
  waitQueueTimeoutMS: 10000, // Wait up to 10s for available connection
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000,
};

// Global client instance (singleton)
let client = null;
let db = null;
let isConnecting = false;
let connectionPromise = null;

/**
 * Get the database connection (creates pool if needed)
 * @returns {Promise<{client: MongoClient, db: Db}>}
 */
export async function getDatabase() {
  // If already connected, return immediately
  if (client && db) {
    return { client, db };
  }
  
  // If connection is in progress, wait for it
  if (isConnecting && connectionPromise) {
    await connectionPromise;
    return { client, db };
  }
  
  // Start new connection
  isConnecting = true;
  connectionPromise = connectToDatabase();
  
  try {
    await connectionPromise;
    return { client, db };
  } finally {
    isConnecting = false;
    connectionPromise = null;
  }
}

/**
 * Internal function to establish database connection
 */
async function connectToDatabase() {
  console.log('🔌 [DB] Establishing MongoDB connection pool...');
  const startTime = Date.now();
  
  try {
    client = new MongoClient(MONGO_URI, POOL_OPTIONS);
    await client.connect();
    db = client.db(DB_NAME);
    
    // Verify connection with a ping
    await db.command({ ping: 1 });
    
    const elapsed = Date.now() - startTime;
    console.log(`✅ [DB] Connection pool ready in ${elapsed}ms`);
    console.log(`   Pool size: min=${POOL_OPTIONS.minPoolSize}, max=${POOL_OPTIONS.maxPoolSize}`);
    
    // Handle connection errors
    client.on('error', (error) => {
      console.error('❌ [DB] Connection error:', error.message);
    });
    
    client.on('close', () => {
      console.log('🔌 [DB] Connection closed');
      client = null;
      db = null;
    });
    
  } catch (error) {
    console.error('❌ [DB] Failed to connect:', error.message);
    client = null;
    db = null;
    throw error;
  }
}

/**
 * Get a specific collection
 * @param {string} collectionName 
 * @returns {Promise<Collection>}
 */
export async function getCollection(collectionName) {
  const { db } = await getDatabase();
  return db.collection(collectionName);
}

// =====================================================
// COLLECTION NAMES (centralized)
// =====================================================
export const COLLECTIONS = {
  FLIGHTS: 'PlaneData',
  CONNECTION_CACHE: 'ConnectionCache',
  AMTRAK_ROUTE_CACHE: 'AmtrakRouteCache'
};

// =====================================================
// OPTIMIZED QUERY HELPERS
// =====================================================

/**
 * Batch query for multiple flight routes at once
 * Uses $or to combine queries instead of sequential lookups
 * 
 * @param {Array<{from: string, to: string}>} routes - Array of routes to query
 * @param {string} type - 'oneway' or 'roundtrip'
 * @returns {Promise<Array>} All matching flights
 */
export async function batchQueryFlights(routes, type = 'oneway') {
  if (!routes || routes.length === 0) return [];
  
  const collection = await getCollection(COLLECTIONS.FLIGHTS);
  
  // Build $or query for all routes at once
  const orConditions = routes.map(route => ({
    'departure.location': { $regex: new RegExp(`^${route.from}$`, 'i') },
    'arrival.location': { $regex: new RegExp(`^${route.to}$`, 'i') },
    type: type
  }));
  
  const startTime = Date.now();
  const flights = await collection.find({ $or: orConditions }).toArray();
  const elapsed = Date.now() - startTime;
  
  console.log(`   ⚡ [DB] Batch query: ${routes.length} routes, ${flights.length} results in ${elapsed}ms`);
  
  return flights;
}

/**
 * Query flights for a single route
 * @param {string} from - Origin
 * @param {string} to - Destination
 * @param {string} type - 'oneway' or 'roundtrip'
 * @param {string} departDate - Optional departure date
 * @param {string} returnDate - Optional return date (for roundtrip)
 * @returns {Promise<Array>}
 */
export async function queryFlights(from, to, type = 'oneway', departDate = null, returnDate = null) {
  const collection = await getCollection(COLLECTIONS.FLIGHTS);
  
  const query = {
    'departure.location': { $regex: new RegExp(`^${from}$`, 'i') },
    'arrival.location': { $regex: new RegExp(`^${to}$`, 'i') },
    type: type
  };
  
  if (departDate) {
    query.departDate = departDate;
  }
  
  if (type === 'roundtrip' && returnDate) {
    query.returnDate = returnDate;
  }
  
  return await collection.find(query).toArray();
}

/**
 * Save flights to database
 * @param {Array} flights - Flight documents to save
 * @returns {Promise<number>} Number of documents inserted
 */
export async function saveFlights(flights) {
  if (!flights || flights.length === 0) return 0;
  
  const collection = await getCollection(COLLECTIONS.FLIGHTS);
  const result = await collection.insertMany(flights, { ordered: false }).catch(err => {
    // Ignore duplicate key errors
    if (err.code === 11000) {
      return { insertedCount: 0 };
    }
    throw err;
  });
  
  return result.insertedCount || 0;
}

// =====================================================
// CONNECTION CACHE HELPERS
// =====================================================

/**
 * Get cached connections
 * @param {string} cacheKey 
 * @returns {Promise<Object|null>}
 */
export async function getCachedConnection(cacheKey) {
  const collection = await getCollection(COLLECTIONS.CONNECTION_CACHE);
  return await collection.findOne({
    cacheKey: cacheKey,
    expiresAt: { $gt: new Date() }
  });
}

/**
 * Save connection to cache
 * @param {Object} cacheEntry 
 */
export async function saveCachedConnection(cacheEntry) {
  const collection = await getCollection(COLLECTIONS.CONNECTION_CACHE);
  await collection.updateOne(
    { cacheKey: cacheEntry.cacheKey },
    { $set: cacheEntry },
    { upsert: true }
  );
}

/**
 * Initialize database indexes
 */
export async function initializeIndexes() {
  console.log('📊 [DB] Initializing indexes...');
  
  try {
    const { db } = await getDatabase();
    
    // Flight collection indexes
    const flightCollection = db.collection(COLLECTIONS.FLIGHTS);
    await flightCollection.createIndex(
      { 'departure.location': 1, 'arrival.location': 1, type: 1 },
      { background: true }
    );
    await flightCollection.createIndex(
      { 'departure.location': 1, 'arrival.location': 1, type: 1, departDate: 1 },
      { background: true }
    );
    
    // Connection cache indexes
    const cacheCollection = db.collection(COLLECTIONS.CONNECTION_CACHE);
    await cacheCollection.createIndex({ cacheKey: 1 }, { unique: true });
    await cacheCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    
    // Amtrak route cache indexes
    const amtrakCacheCollection = db.collection(COLLECTIONS.AMTRAK_ROUTE_CACHE);
    await amtrakCacheCollection.createIndex({ cacheKey: 1 }, { unique: true });
    await amtrakCacheCollection.createIndex({ expiresAt: 1 }, { expireAfterSeconds: 0 });
    
    console.log('✅ [DB] Indexes initialized');
    
  } catch (error) {
    console.error('⚠️ [DB] Index initialization error:', error.message);
  }
}

/**
 * Close database connection (for graceful shutdown)
 */
export async function closeDatabase() {
  if (client) {
    console.log('🔌 [DB] Closing connection pool...');
    await client.close();
    client = null;
    db = null;
  }
}

/**
 * Health check
 */
export async function isDatabaseHealthy() {
  try {
    const { db } = await getDatabase();
    await db.command({ ping: 1 });
    return true;
  } catch {
    return false;
  }
}
