# Greyhound Bus Integration

This document describes the Greyhound bus integration into the Travel Hub system, following the same pattern as Amtrak trains.

## Files Created

1. **`services/greyhoundService.js`** - Service module for Greyhound bus data lookup
   - Similar structure to `amtrakService.js`
   - Provides fare lookup, station management, and grouped results
   - Loads data from JSON files in `data/` directory

2. **`data/greyhound_stations.json`** - Station/city data for Greyhound buses
   - Contains station codes, names, cities, and states
   - Format matches `amtrak_stations.json`

3. **`data/greyhound_fares.json`** - Fare data for Greyhound bus routes
   - Contains origin, destination, date, departure time, price, duration, and transfers
   - Format matches `amtrak_fares.json`

4. **`scrapers/busScraper.js`** - Web scraper for Greyhound bus data
   - Template scraper that can be used to collect bus data from Greyhound website
   - Saves data to JSON files (similar to how Amtrak data is stored)
   - Note: Selectors need to be updated based on Greyhound's actual website structure

## Integration into Server

The Greyhound service has been integrated into `server.js`:

- **Search Endpoint**: Bus data is now included in `/api/search` results
- **API Endpoints**: Added Greyhound-specific endpoints:
  - `GET /api/greyhound/fare?origin=LAX&dest=SFO&date=2026-02-15`
  - `GET /api/greyhound/stations`
  - `GET /api/greyhound/stations/:code`
  - `GET /api/greyhound/routes`

## Data Structure

### Fare Format
```json
{
  "origin": "LAX",
  "dest": "SFO",
  "date": "2026-02-15",
  "departureTime": "8:00 AM",
  "priceUSD": 35,
  "durationMin": 480,
  "transfers": 0
}
```

### Station Format
```json
{
  "code": "LAX",
  "name": "Los Angeles Union Station Bus Terminal",
  "city": "Los Angeles",
  "state": "CA"
}
```

## Usage

### Populating Data

You can populate the Greyhound data in two ways:

1. **Manual Entry**: Add fare and station data directly to the JSON files
2. **Web Scraping**: Use the `busScraper.js` script (update selectors as needed)

### Using the Scraper

```javascript
import { scrapeGreyhoundBuses } from './scrapers/busScraper.js';

// Scrape a single route
await scrapeGreyhoundBuses('Los Angeles', 'San Francisco', '2026-02-15');

// Or scrape multiple routes
import { scrapeMultipleRoutes } from './scrapers/busScraper.js';
await scrapeMultipleRoutes([
  { from: 'LAX', to: 'SFO', date: '2026-02-15' },
  { from: 'NYC', to: 'BOS', date: '2026-02-15' }
]);
```

## Notes

- The scraper (`busScraper.js`) is a template - you'll need to update the CSS selectors based on Greyhound's actual website structure
- Data is stored in JSON files (similar to Amtrak), not MongoDB (unlike flights)
- The service supports both exact date matches and estimated fares (from nearby dates)
- Bus results are automatically included in the main search endpoint alongside flights and trains
