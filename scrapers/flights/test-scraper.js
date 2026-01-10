import { scrapeGoogleFlights } from './google-flights.js';
import { MongoClient } from 'mongodb';

/**
 * Test script for Google Flights scraper
 * Run with: node flights/test-scraper.js
 */

async function main() {
// Connect to MongoDB
const uri = "mongodb+srv://johnsylvester_db_user:3bsbf7i6zrTFivhe@streamlinetravel.amyqwim.mongodb.net/?appName=StreamlineTravel";

if (!uri) {
  console.error('❌ Error: MONGODB_URI environment variable is not set!');
  console.error('   Please set it with: export MONGODB_URI="mongodb://your-server-ip:27017/..."');
  console.error('   Or on Windows: set MONGODB_URI="mongodb://your-server-ip:27017/..."');
  process.exit(1);
}

// Check if URI contains localhost (will fail on remote computers)
if (uri.includes('localhost') || uri.includes('127.0.0.1')) {
  console.warn('⚠️  Warning: MONGODB_URI contains localhost or 127.0.0.1');
  console.warn('   This will only work on the same machine as MongoDB.');
  console.warn('   For remote connections, use the actual server IP or hostname.');
  console.warn('   Example: mongodb://your-server-ip:27017/your-database');
  console.warn('');
}

const client = new MongoClient(uri);
const dbName = "TravelData";
const collectionName = 'PlaneData';

// Test parameters - search for flights from LAX to JFK
const testParams = {
  from: 'LAX',
  to: 'JFK',
  departDate: '2026-02-15',  // Future date
  returnDate: null           // One-way trip
};

console.log('🧪 Running Google Flights Scraper Test\n');
console.log('Test Parameters:');
console.log(`  From: ${testParams.from}`);
console.log(`  To: ${testParams.to}`);
console.log(`  Date: ${testParams.departDate}`);
console.log(`  Trip Type: One-way\n`);

try {
  const results = await scrapeGoogleFlights(
    testParams.from,
    testParams.to,
    testParams.departDate,
    testParams.returnDate
  );
 
  console.log('🔌 Connecting to MongoDB...');
  await client.connect();
  console.log('✅ Connected to MongoDB successfully');
 
  const db = client.db(dbName);
  const collection = db.collection(collectionName);
  console.log(`💾 Inserting ${results.length} flight(s) into ${dbName}.${collectionName}...`);
  await collection.insertMany(results);
  await client.close();
  console.log('✅ MongoDB connection closed');

  console.log('\n📋 Final JSON Output:');
  console.log(JSON.stringify(results, null, 2));
 
  console.log(`\n✅ Test complete! Found ${results.length} flight(s).`);
} catch (error) {
  console.error('\n❌ Test failed:', error.message);
 
  // Provide helpful error messages for common connection issues
  if (error.message.includes('ECONNREFUSED') || error.message.includes('connection')) {
    console.error('\n🔧 Connection Error Troubleshooting:');
    console.error('   1. Verify your MONGODB_URI does NOT contain "localhost" or "127.0.0.1"');
    console.error('   2. Use the actual MongoDB server IP address or hostname');
    console.error('   3. Example: mongodb://YOUR_SERVER_IP:27017/TravelData');
    console.error('   4. If using MongoDB Atlas, use the connection string from the Atlas dashboard');
    console.error('   5. Ensure MongoDB allows connections from all IPs (0.0.0.0/0)');
    console.error('   6. Check firewall settings on the MongoDB server');
  }
 
  process.exit(1);
}
}

// Run the main function
main();