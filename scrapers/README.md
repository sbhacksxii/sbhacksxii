# Travel Hub Scrapers

Web scrapers for aggregating travel data from various sources.

## Setup

```bash
cd scrapers
npm install
```

## Google Flights Scraper

Scrapes flight data from Google Flights based on user input.

### Usage

```bash
npm run flights
```

You will be prompted to enter:
- **Departure city/airport** (e.g., LAX, Los Angeles, SFO)
- **Destination city/airport** (e.g., JFK, New York, ORD)
- **Departure date** (YYYY-MM-DD format)
- **Round trip?** (y/n)
- **Return date** (if round trip)

### Example

```
Enter departure city/airport: LAX
Enter destination city/airport: JFK
Enter departure date: 2026-02-15
Round trip? (y/n): n
```

### Output Format

The scraper outputs normalized flight data in JSON format:

```json
{
  "type": "flight",
  "departure": {
    "location": "LAX",
    "time": "6:00 AM"
  },
  "arrival": {
    "location": "JFK",
    "time": "2:30 PM"
  },
  "duration": "5h 30m",
  "price": 299,
  "priceFormatted": "$299",
  "currency": "USD",
  "provider": "Delta",
  "stops": 0,
  "source": "Google Flights"
}
```

### Notes

- The scraper uses Puppeteer with a visible browser by default for debugging
- Set `headless: true` in the code for production use
- Google may occasionally block automated requests; the scraper includes anti-bot measures
- Screenshots are saved on errors for debugging

## Future Scrapers

- `trains/` - Amtrak and other train services
- `buses/` - Greyhound, Megabus, FlixBus
