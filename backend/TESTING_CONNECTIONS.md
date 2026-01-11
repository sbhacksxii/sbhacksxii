# Testing Connections Feature

This guide explains how to test the train + flight connections feature.

## 1. Unit Tests

Run the unit tests for the connection service:

```bash
cd backend
npm test
```

To run only the connection service tests:

```bash
npm test -- connectionService.test.js
```

To run tests in watch mode (re-runs on file changes):

```bash
npm run test:watch
```

## 2. Manual API Testing

### Start the Server

First, start the backend server:

```bash
cd backend
npm run dev
```

The server should start on `http://localhost:3001` (or the PORT specified in your environment).

### Test with cURL

#### Example 1: NYC to SBA (should create flight→train connections via LAX)

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "from": "NYC",
    "to": "SBA",
    "departDate": "2026-01-15",
    "tripType": "oneway",
    "sortBy": "price"
  }'
```

This should return:
- Flight results (NYC → SBA direct)
- Train results (if available for NYC → SBA)
- **Connection results** (NYC → LAX flight + LAX → SBA train, if times align)

#### Example 2: SBA to NYC (should create train→flight connections via LAX)

```bash
curl -X POST http://localhost:3001/api/search \
  -H "Content-Type: application/json" \
  -d '{
    "from": "SBA",
    "to": "NYC",
    "departDate": "2026-01-15",
    "tripType": "oneway",
    "sortBy": "time"
  }'
```

#### Example 3: Check what connections look like

Look for results with `"type": "connection"` in the response. They should have:
- `legs`: Array with 2 items (flight and train)
- `transfer`: Object with city, arrivalTime, departureTime, waitTimeMinutes
- `totalPrice`: Sum of both leg prices
- `totalDurationMinutes`: Total time including wait

### Test with JavaScript/Node.js

Create a test file `test-connections.js`:

```javascript
const response = await fetch('http://localhost:3001/api/search', {
  method: 'POST',
  headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({
    from: 'NYC',
    to: 'SBA',
    departDate: '2026-01-15',
    tripType: 'oneway',
    sortBy: 'price'
  })
});

const results = await response.json();

// Filter for connections
const connections = results.filter(r => r.type === 'connection');
console.log(`Found ${connections.length} connections`);

connections.forEach((conn, i) => {
  console.log(`\nConnection ${i + 1}:`);
  console.log(`  Route: ${conn.departure.location} → ${conn.arrival.location}`);
  console.log(`  Transfer: ${conn.transfer.city}`);
  console.log(`  Wait time: ${conn.transfer.waitTimeMinutes} minutes`);
  console.log(`  Total duration: ${conn.duration}`);
  console.log(`  Total price: ${conn.priceFormatted || 'N/A'}`);
  console.log(`  Legs: ${conn.legs[0].source} → ${conn.legs[1].source}`);
});
```

Run it:
```bash
node test-connections.js
```

## 3. Testing via Frontend

If your frontend is running:

1. Open the frontend application
2. Search for routes that might have connections (e.g., NYC to SBA, LA to Seattle)
3. Look for results marked as "Connection" or with multiple legs
4. Verify the connection details show the transfer city and timing

## 4. What to Look For

### Valid Connections Should:
- ✅ Have `type: "connection"`
- ✅ Have exactly 2 legs in the `legs` array
- ✅ Have matching cities at transfer point
- ✅ Have wait time between 45 minutes and 4 hours
- ✅ Have chronological order (arrival before departure)
- ✅ Calculate total price as sum of leg prices
- ✅ Calculate total duration including wait time

### Connection Structure:
```json
{
  "type": "connection",
  "legs": [
    {
      "source": "Google Flights",
      "departure": { "location": "NYC", "time": "10:00 AM" },
      "arrival": { "location": "LAX", "time": "2:30 PM" },
      ...
    },
    {
      "source": "Amtrak",
      "departure": { "location": "LAX", "time": "4:00 PM" },
      "arrival": { "location": "SBA", "time": "8:00 PM" },
      ...
    }
  ],
  "transfer": {
    "city": "LAX",
    "arrivalTime": "2:30 PM",
    "departureTime": "4:00 PM",
    "waitTimeMinutes": 90
  },
  "departure": { "location": "NYC", "time": "10:00 AM" },
  "arrival": { "location": "SBA", "time": "8:00 PM" },
  "duration": "10 hr",
  "durationMinutes": 600,
  "price": 344,
  "priceFormatted": "$344.00",
  "source": "Connection"
}
```

## 5. Expected Behavior

### Should NOT create connections when:
- ❌ Transfer time < 45 minutes
- ❌ Wait time > 4 hours
- ❌ Cities don't match at transfer point
- ❌ Missing time data
- ❌ Departure time is before arrival time

### Should create connections when:
- ✅ Flight arrives at city X, train departs from city X (with valid timing)
- ✅ Train arrives at city X, flight departs from city X (with valid timing)
- ✅ Wait time is between 45 min and 4 hours
- ✅ Both flight and train results exist

## 6. Debugging

Check the server console logs. You should see:
```
🔗 [CONNECTIONS] Building train + flight connections...
✅ [CONNECTIONS] Found X connection options
```

If you see errors:
```
⚠️ [CONNECTIONS] Error building connections: <error message>
```

The connections feature is designed to fail gracefully - if there's an error, the search will still return flight and train results, just without connections.
