/**
 * =====================================================
 * CONNECTION CACHE SERVICE (OPTIMIZED)
 * =====================================================
 * 
 * Caches computed connection routes to avoid recalculating.
 * Uses global connection pool for fast database access.
 * 
 * Cache Structure:
 * - Memory cache: 30 min TTL (fastest)
 * - MongoDB cache: 7 day TTL (persistent)
 */

import { 
  getCollection, 
  getCachedConnection, 
  saveCachedConnection,
  initializeIndexes,
  COLLECTIONS 
} from './database.js';

// Cache TTL in milliseconds
const CONNECTION_CACHE_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days
const AMTRAK_ROUTE_CACHE_TTL_MS = 30 * 24 * 60 * 60 * 1000; // 30 days

// In-memory cache for hot routes (very fast lookup)
const memoryCache = new Map();
const MEMORY_CACHE_TTL_MS = 30 * 60 * 1000; // 30 minutes

/**
 * Generate cache key for a route
 */
function generateCacheKey(origin, destination, tripType = 'oneway') {
  return `${origin.toUpperCase()}-${destination.toUpperCase()}-${tripType}`;
}

/**
 * Get cached connections from memory first, then MongoDB
 * OPTIMIZED: Uses connection pool instead of new connection each time
 * 
 * @param {string} origin - Origin code
 * @param {string} destination - Destination code
 * @param {string} tripType - 'oneway' or 'roundtrip'
 * @returns {Promise<Object|null>} Cached data or null
 */
export async function getCachedConnections(origin, destination, tripType = 'oneway') {
  const cacheKey = generateCacheKey(origin, destination, tripType);
  
  // Check memory cache first (fastest - < 1ms)
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < MEMORY_CACHE_TTL_MS) {
    console.log(`⚡ [CACHE] Memory hit: ${cacheKey}`);
    return memoryCached.data;
  }
  
  // Check MongoDB cache (uses connection pool - fast)
  try {
    const cached = await getCachedConnection(cacheKey);
    
    if (cached) {
      console.log(`✅ [CACHE] DB hit: ${cacheKey}`);
      
      // Store in memory cache for faster subsequent access
      memoryCache.set(cacheKey, {
        data: cached,
        timestamp: Date.now()
      });
      
      return cached;
    }
    
    console.log(`❌ [CACHE] Miss: ${cacheKey}`);
    return null;
    
  } catch (error) {
    console.error(`⚠️ [CACHE] Error: ${error.message}`);
    return null;
  }
}

/**
 * Store connections in cache
 * OPTIMIZED: Uses connection pool, stores in memory immediately
 * 
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
  
  // Store in memory cache immediately (sync)
  memoryCache.set(cacheKey, {
    data: cacheEntry,
    timestamp: Date.now()
  });
  
  // Store in MongoDB (uses connection pool)
  try {
    await saveCachedConnection(cacheEntry);
    console.log(`💾 [CACHE] Stored ${connections.length} connections for ${cacheKey}`);
  } catch (error) {
    console.error(`⚠️ [CACHE] Store error: ${error.message}`);
  }
}

/**
 * Get cached Amtrak route metadata
 */
export async function getCachedAmtrakRoutes(origin, destination) {
  const cacheKey = `amtrak-routes-${origin.toUpperCase()}-${destination.toUpperCase()}`;
  
  // Check memory cache
  const memoryCached = memoryCache.get(cacheKey);
  if (memoryCached && Date.now() - memoryCached.timestamp < MEMORY_CACHE_TTL_MS) {
    return memoryCached.data;
  }
  
  try {
    const collection = await getCollection(COLLECTIONS.AMTRAK_ROUTE_CACHE);
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
    console.error(`⚠️ [CACHE] Amtrak route cache error: ${error.message}`);
    return null;
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
  
  try {
    const collection = await getCollection(COLLECTIONS.AMTRAK_ROUTE_CACHE);
    await collection.updateOne(
      { cacheKey: cacheKey },
      { $set: cacheEntry },
      { upsert: true }
    );
  } catch (error) {
    console.error(`⚠️ [CACHE] Amtrak route store error: ${error.message}`);
  }
}

/**
 * Initialize cache indexes (delegates to database.js)
 */
export async function initializeCacheIndexes() {
  await initializeIndexes();
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
 * Clear memory cache (for testing)
 */
export function clearMemoryCache() {
  memoryCache.clear();
  console.log('🗑️ [CACHE] Memory cache cleared');
}

/**
 * Clear all caches
 */
export async function clearAllCaches() {
  memoryCache.clear();
  
  try {
    const connCollection = await getCollection(COLLECTIONS.CONNECTION_CACHE);
    const amtrakCollection = await getCollection(COLLECTIONS.AMTRAK_ROUTE_CACHE);
    
    await connCollection.deleteMany({});
    await amtrakCollection.deleteMany({});
    
    console.log('🗑️ [CACHE] All caches cleared');
  } catch (error) {
    console.error(`⚠️ [CACHE] Clear error: ${error.message}`);
  }
}
