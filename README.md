# Streamline - Multi-Modal Travel Comparison Platform

A unified travel search platform that compares flights and Amtrak train options, intelligently combining them into multi-modal itineraries. Features an AI-powered chatbot with voice support to help users find the best travel options.

## 🌟 Features

- ✈️ **Flight Search** - Real-time flight data scraped from Google Flights
- 🚂 **Amtrak Train Search** - Comprehensive Amtrak fare and schedule data
- 🔗 **Multi-Modal Connections** - Intelligent route combinations:
  - Flight → Amtrak (fly to a hub, then train to destination)
  - Amtrak → Flight (train to a hub, then fly to destination)
  - Flight → Flight (connecting flights via major hub airports)
- 🤖 **AI Chatbot** - Natural language travel queries powered by Groq (Llama 3.3)
- 🎤 **Voice Input** - Speak your travel requests using Deepgram speech-to-text
- 📍 **Smart Location Search** - Autocomplete dropdown for 40+ airports and Amtrak stations
- 💰 **Price & Time Sorting** - Compare options by cost or duration
- 📱 **Responsive Design** - Works on desktop and mobile

## 🛠️ Tech Stack

### Frontend
- **React 18** - UI framework
- **Vite** - Build tool and dev server
- **TailwindCSS** - Utility-first styling
- **Deepgram SDK** - Real-time voice transcription

### Backend
- **Node.js 18+** - Runtime
- **Express** - API framework
- **MongoDB** - Database for caching flight data
- **Puppeteer** - Web scraping for Google Flights
- **Groq SDK** - AI chatbot (Llama 3.3 70B model)

### Deployment
- **Frontend:** Netlify
- **Backend:** Railway

## 📁 Project Structure

```
sbhacksxii/
├── frontend/                   # React frontend application
│   ├── src/
│   │   ├── components/
│   │   │   ├── SearchForm.jsx    # Location autocomplete & search form
│   │   │   ├── ResultsDisplay.jsx # Travel results display
│   │   │   └── Chatbot.jsx       # AI chatbot with voice support
│   │   ├── App.jsx               # Main application component
│   │   └── App.css               # Global styles
│   └── package.json
│
├── backend/                    # Express API server
│   ├── server.js                 # Main API server
│   ├── services/
│   │   ├── amtrakService.js      # Amtrak fare lookups
│   │   └── connectionService.js  # Multi-modal route builder
│   ├── scrapers/
│   │   └── flightScraper.js      # Google Flights scraper
│   ├── data/
│   │   ├── amtrak_fares.json     # Amtrak pricing data
│   │   └── amtrak_stations.json  # Amtrak station codes
│   └── package.json
│
└── scrapers/                   # Standalone scraper utilities
    └── flights/
        └── google-flights.js
```

## 🚀 Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- MongoDB Atlas account (for flight caching)
- API Keys:
  - `GROQ_API_KEY` - For AI chatbot
  - `VITE_DEEPGRAM_API_KEY` - For voice input (optional)

### Installation

1. **Clone the repository**
```bash
git clone <repo-url>
cd sbhacksxii
```

2. **Install backend dependencies**
```bash
cd backend
npm install
```

3. **Install frontend dependencies**
```bash
cd ../frontend
npm install
```

4. **Set up environment variables**

Backend (`backend/.env`):
```env
PORT=3001
GROQ_API_KEY=your_groq_api_key
FRONTEND_URL=http://localhost:5173
```

Frontend (`frontend/.env`):
```env
VITE_API_URL=http://localhost:3001
VITE_DEEPGRAM_API_KEY=your_deepgram_api_key
```

5. **Run the development servers**

Backend:
```bash
cd backend
npm run dev
```

Frontend (in a new terminal):
```bash
cd frontend
npm run dev
```

6. **Open the app**
Navigate to `http://localhost:5173`

## 📡 API Endpoints

### Search
- `POST /api/search` - Search for travel options
  ```json
  {
    "from": "LAX",
    "to": "JFK",
    "departDate": "2026-02-15",
    "returnDate": null,
    "tripType": "oneway",
    "sortBy": "price"
  }
  ```

### Chatbot
- `POST /api/chat` - AI travel assistant
  ```json
  {
    "message": "Find flights from LA to New York on January 20th",
    "messages": []
  }
  ```

### Amtrak
- `GET /api/amtrak/fare?origin=SBA&dest=LAX&date=2026-02-15` - Look up Amtrak fare
- `GET /api/amtrak/stations` - List all Amtrak stations
- `GET /api/amtrak/stations/:code` - Get station by code
- `GET /api/amtrak/routes` - List available routes

### Locations
- `GET /api/locations` - Get all airports and Amtrak stations

### Health
- `GET /api/health` - Health check

## 🗺️ Supported Locations

### Airports (29)
LAX, SFO, OAK, SJC, SAN, DEN, SLC, SEA, PDX, ORD, DFW, AUS, IAH, MSY, ATL, JFK, LGA, EWR, BOS, DCA, IAD, PHX, LAS, MIA, MCO, MSP, DTW, CLT, PHL

### Amtrak Stations (19)
LAX, SBA, SAN, SAC, CHI, NYP, BOS, WAS, PHL, SEA, PDX, DEN, ABQ, NOL, SFC, OMA, SLC, KYC, SPK

## 🔗 Multi-Modal Connections

Streamline intelligently combines different transportation modes:

1. **Flight → Amtrak**: Fly to a hub city (e.g., LAX), then take Amtrak to your final destination (e.g., Santa Barbara)

2. **Amtrak → Flight**: Take Amtrak from a smaller city to a major hub, then fly to your destination

3. **Flight → Flight**: Connect through major hub airports when direct flights aren't available

The connection service validates timing (30 min - 4 hour layovers) and calculates total price and duration.

## 🧪 Testing

```bash
cd backend
npm test
```

## 📦 Deployment

### Backend (Railway)
The backend is configured for Railway deployment with `railway.toml` and `Dockerfile`.

### Frontend (Netlify)
The frontend is configured for Netlify deployment with `netlify.toml`.

See `DEPLOYMENT.md` for detailed deployment instructions.

## 👥 Team - SBHacks XII

Built with ❤️ at SBHacks XII

## 📄 License

MIT
