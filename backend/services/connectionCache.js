/**
 * =====================================================
 * CONNECTION CACHE SERVICE
 * =====================================================
 * 
 * Caches computed connection routes in MongoDB to avoid
 * recalculating connections for the same route.
 * 
 * Cache Structure:
 * - Each entry stores connections for a specific origin-destination pair
 * - Entries expire after a configurable TTL (default 7 days)
 * - Amtrak route metadata is cached separately (longer TTL since it's static)
 */

import { MongoClient } from 'mongodb';

// MongoDB connection string (same as main server)
const MONGO_URI = "mongodb+srv://johnsylvester_db_user:3bsbf7i6zrTFivhe@streamlinetravel.amyqwim.mongodb.net/?appName=StreamlineTravel";
const DB_NAME = "TravelData";
const CONNECTION_CACHE_COLLECTION = "ConnectionCache";
const AMTRAK_ROUTE_CACHE_COLLECTION = "AmtrakRouteCache";

// Cache TTL in milliseconds
const CONNECTION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days for connections
const AMTRAK_ROUTE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days for Amtrak routes (static data)

// In-memory cache for hot routes (very fast lookup)
const memoryCache = new Map();
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes in-memory

/**
 * Generate cache key for a route
 */
function generateCacheKey(origin, destination, tripType = 'oneway') {
  return `${origin.toUpperCase()}-${destination.toUpperCase()}-${tripType}`;
}

/**
 * Get cached connections from memory first, then MongoDB
 * @param {string} origin - Origin code
 * @param {string} destination - Destination code
 * @param {string} tripType - 'oneway' or 'roundtrip'
 * @returns {Promise<Object|null>} Cached data or null
 */
export async function getCachedConnections(origin, destination, tripType = 'oneway') {
  const cacheKey = generateCacheKey(origin, destination, tripType);
  
  // Check memory cache first (fastest)
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < MEMORY_CACHE_TTL_MS) {
    console.log(`⚡ [CACHE] Memory cache hit: ${cacheKey}`);
    return memoryCached.data;
  }
  
  // Check MongoDB cache
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(CONNECTION_CACHE_COLLECTION);
    
    const cached = await collection.findOne({
      cacheKey: cacheKey,
      expiresAt: { $gt: new Date() } // Only get non-expired entries
    });
    
    if (cached) {
      console.log(`✅ [CACHE] MongoDB cache hit: ${cacheKey}`);
      
      // Store in memory cache for faster subsequent access
      memoryCache.set(cacheKey, {
        data: cached,
        timestamp: Date.now()
      });
      
      return cached;
    }
    
    console.log(`❌ [CACHE] Cache miss: ${cacheKey}`);
    return null;
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Error reading cache: ${error.message}`);
    return null;
  } finally {
    await client.close();
  }
}

/**
 * Store connections in cache
 * @param {string} origin - Origin code
 * @param {string} destination - Destination code
 * @param {Array} connections - Connection itineraries to cache
 * @param {Object} hubsInfo - Information about hubs used
 * @param {string} tripType - 'oneway' or 'roundtrip'
 */
export async function cacheConnections(origin, destination, connections, hubsInfo, tripType = 'oneway') {
  const cacheKey = generateCacheKey(origin, destination, tripType);
  
  const cacheEntry = {
    cacheKey: cacheKey,
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    tripType: tripType,
    connections: connections,
    hubsInfo: hubsInfo,
    connectionCount: connections.length,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + CONNECTION_CACHE_TTL_MS)
  };
  
  // Store in memory cache immediately
  memoryCache.set(cacheKey, {
    data: cacheEntry,
    timestamp: Date.now()
  });
  
  // Store in MongoDB (async, don't wait)
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(CONNECTION_CACHE_COLLECTION);
    
    // Upsert the cache entry
    await collection.updateOne(
      { cacheKey: cacheKey },
      { $set: cacheEntry },
      { upsert: true }
    );
    
    console.log(`💾 [CACHE] Stored ${connections.length} connections for ${cacheKey}`);
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Error storing cache: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Get cached Amtrak route metadata
 * This includes which hubs can serve which destinations
 */
export async function getCachedAmtrakRoutes(origin, destination) {
  const cacheKey = `amtrak-routes-${origin.toUpperCase()}-${destination.toUpperCase()}`;
  
  // Check memory cache
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < MEMORY_CACHE_TTL_MS) {
    return memoryCached.data;
  }
  
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(AMTRAK_ROUTE_CACHE_COLLECTION);
    
    const cached = await collection.findOne({
      cacheKey: cacheKey,
      expiresAt: { $gt: new Date() }
    });
    
    if (cached) {
      memoryCache.set(cacheKey, { data: cached, timestamp: Date.now() });
      return cached;
    }
    
    return null;
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Error reading Amtrak route cache: ${error.message}`);
    return null;
  } finally {
    await client.close();
  }
}

/**
 * Store Amtrak route metadata in cache
 */
export async function cacheAmtrakRoutes(origin, destination, hubsToDestination, hubsFromOrigin) {
  const cacheKey = `amtrak-routes-${origin.toUpperCase()}-${destination.toUpperCase()}`;
  
  const cacheEntry = {
    cacheKey: cacheKey,
    origin: origin.toUpperCase(),
    destination: destination.toUpperCase(),
    hubsToDestination: hubsToDestination,
    hubsFromOrigin: hubsFromOrigin,
    createdAt: new Date(),
    expiresAt: new Date(Date.now() + AMTRAK_ROUTE_CACHE_TTL_MS)
  };
  
  memoryCache.set(cacheKey, { data: cacheEntry, timestamp: Date.now() });
  
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    const collection = db.collection(AMTRAK_ROUTE_CACHE_COLLECTION);
    
    await collection.updateOne(
      { cacheKey: cacheKey },
      { $set: cacheEntry },
      { upsert: true }
    );
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Error storing Amtrak route cache: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Clear expired cache entries (maintenance task)
 */
export async function cleanupExpiredCache() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    // Clean connection cache
    const connResult = await db.collection(CONNECTION_CACHE_COLLECTION).deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    // Clean Amtrak route cache
    const amtrakResult = await db.collection(AMTRAK_ROUTE_CACHE_COLLECTION).deleteMany({
      expiresAt: { $lt: new Date() }
    });
    
    console.log(`🧹 [CACHE] Cleaned up ${connResult.deletedCount} connection entries, ${amtrakResult.deletedCount} Amtrak route entries`);
    
    // Clean memory cache
    const now = Date.now();
    for (const [key, value] of memoryCache.entries()) {
      if (now - value.timestamp > MEMORY_CACHE_TTL_MS) {
        memoryCache.delete(key);
      }
    }
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Cleanup error: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Create indexes for cache collections (call once on startup)
 */
export async function initializeCacheIndexes() {
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    // Create indexes for connection cache
    await db.collection(CONNECTION_CACHE_COLLECTION).createIndex(
      { cacheKey: 1 },
      { unique: true }
    );
    await db.collection(CONNECTION_CACHE_COLLECTION).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 } // TTL index - MongoDB will auto-delete expired docs
    );
    
    // Create indexes for Amtrak route cache
    await db.collection(AMTRAK_ROUTE_CACHE_COLLECTION).createIndex(
      { cacheKey: 1 },
      { unique: true }
    );
    await db.collection(AMTRAK_ROUTE_CACHE_COLLECTION).createIndex(
      { expiresAt: 1 },
      { expireAfterSeconds: 0 }
    );
    
    console.log('✅ [CACHE] Cache indexes initialized');
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Index initialization error: ${error.message}`);
  } finally {
    await client.close();
  }
}

/**
 * Get cache statistics
 */
export function getCacheStats() {
  return {
    memoryCacheSize: memoryCache.size,
    memoryCacheTTL: MEMORY_CACHE_TTL_MS,
    connectionCacheTTL: CONNECTION_CACHE_TTL_MS,
    amtrakRouteCacheTTL: AMTRAK_ROUTE_CACHE_TTL_MS
  };
}

/**
 * Clear all caches (for testing/debugging)
 */
export async function clearAllCaches() {
  memoryCache.clear();
  
  const client = new MongoClient(MONGO_URI);
  
  try {
    await client.connect();
    const db = client.db(DB_NAME);
    
    await db.collection(CONNECTION_CACHE_COLLECTION).deleteMany({});
    await db.collection(AMTRAK_ROUTE_CACHE_COLLECTION).deleteMany({});
    
    console.log('🗑️ [CACHE] All caches cleared');
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Clear cache error: ${error.message}`);
  } finally {
    await client.close();
  }
}
