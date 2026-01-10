# Travel Hub Project Plan

## Project Overview
A single hub where users can input start and end locations to get travel recommendations from multiple sources (bus, train, flight) with price and time comparisons, plus an integrated chatbot.

## Team Structure (4 People)

### Person 1: Backend API & Data Aggregation
**Responsibilities:**
- Build REST API endpoints for location input and travel queries
- Implement data aggregation logic to combine results from multiple sources
- Create recommendation engine (price vs time optimization)
- Set up database/storage for caching and user queries
- API integration with travel data sources

**Tech Stack:** Node.js/Express or Python/Flask, Database (PostgreSQL/MongoDB)

### Person 2: Travel Data Scrapers/APIs
**Responsibilities:**
- Research and integrate APIs for flights (e.g., Amadeus, Skyscanner)
- Research and integrate APIs for trains (e.g., Amtrak, Rail APIs)
- Research and integrate APIs for buses (e.g., Greyhound, Megabus APIs)
- Build web scrapers if APIs are unavailable (with rate limiting)
- Normalize data from different sources into common format

**Tech Stack:** Python (requests, BeautifulSoup, Selenium) or Node.js (axios, cheerio)

### Person 3: Frontend & UI/UX
**Responsibilities:**
- Design and build user interface for location input
- Display travel options in a comparison view (price vs time)
- Implement filtering and sorting options
- Create responsive, modern UI
- Integrate with backend API

**Tech Stack:** React/Vue.js, HTML/CSS, TailwindCSS or Material-UI

### Person 4: Chatbot Integration
**Responsibilities:**
- Design chatbot conversation flow for travel queries
- Integrate chatbot (OpenAI API, or custom NLP)
- Connect chatbot to travel data backend
- Handle natural language queries (e.g., "Find cheapest way to get from NYC to LA")
- UI for chatbot interface

**Tech Stack:** OpenAI API or custom NLP, WebSocket for real-time chat

## Technical Architecture

```
┌─────────────────┐
│   Frontend UI   │
│  (React/Vue)    │
└────────┬────────┘
         │
         ├─────────────────┐
         │                 │
┌────────▼────────┐  ┌─────▼──────┐
│  Chatbot UI     │  │  Main API  │
│  (WebSocket)    │  │  (Express) │
└────────┬────────┘  └─────┬──────┘
         │                 │
         └────────┬────────┘
                  │
         ┌────────▼────────┐
         │  Recommendation │
         │     Engine      │
         └────────┬────────┘
                  │
    ┌─────────────┼─────────────┐
    │             │             │
┌───▼───┐   ┌─────▼─────┐  ┌───▼───┐
│Flight │   │   Train   │  │  Bus  │
│ APIs  │   │   APIs    │  │ APIs  │
└───────┘   └───────────┘  └───────┘
```

## Implementation Steps

### Phase 1: Setup & Foundation (Day 1)
1. **Project Setup**
   - Initialize repository (Git)
   - Set up project structure
   - Choose tech stack and install dependencies
   - Set up development environment

2. **API Research**
   - Research available APIs for flights, trains, buses
   - Identify free vs paid options
   - Document API keys needed

### Phase 2: Core Backend (Day 1-2)
1. **Backend API**
   - Create Express/Flask server
   - Set up route structure
   - Implement location input endpoint
   - Create data models for travel options

2. **Travel Data Integration**
   - Integrate at least one API per transport type (start with one, expand)
   - Create unified data format
   - Implement error handling

### Phase 3: Frontend (Day 2)
1. **UI Development**
   - Create location input form
   - Build results display component
   - Implement price/time comparison view
   - Add filtering and sorting

2. **API Integration**
   - Connect frontend to backend
   - Handle loading states
   - Error handling UI

### Phase 4: Recommendation Engine (Day 2-3)
1. **Algorithm Development**
   - Implement price-based sorting
   - Implement time-based sorting
   - Create hybrid recommendation (best value)
   - Add filters (direct routes, stops, etc.)

### Phase 5: Chatbot (Day 3)
1. **Chatbot Setup**
   - Integrate OpenAI API or custom NLP
   - Design conversation flow
   - Connect to travel data backend
   - Build chat UI component

### Phase 6: Integration & Testing (Day 3-4)
1. **End-to-End Testing**
   - Test all integrations
   - Handle edge cases
   - Performance optimization
   - UI/UX polish

2. **Deployment**
   - Deploy backend (Heroku, Railway, AWS)
   - Deploy frontend (Vercel, Netlify)
   - Set up environment variables
   - Test production environment

## Key Technical Decisions

### APIs to Consider:
- **Flights:** Amadeus API (free tier), Skyscanner API, Google Flights (scraping)
- **Trains:** Amtrak API, Rail Europe API, or web scraping
- **Buses:** Greyhound API, Megabus API, or web scraping

### Data Normalization Format:
```json
{
  "type": "flight|train|bus",
  "departure": {
    "location": "NYC",
    "time": "2024-01-15T10:00:00Z"
  },
  "arrival": {
    "location": "LAX",
    "time": "2024-01-15T15:30:00Z"
  },
  "duration": "5h 30m",
  "price": 299.99,
  "currency": "USD",
  "provider": "Delta Airlines",
  "stops": 0
}
```

### Recommendation Algorithm:
- **Price Priority:** Sort by price, show cheapest options
- **Time Priority:** Sort by duration, show fastest options
- **Best Value:** Score = (normalized_price * weight) + (normalized_time * weight)

## Dependencies Needed

### Backend:
- Express.js (Node) or Flask (Python)
- Axios/Fetch for API calls
- Database (PostgreSQL, MongoDB, or SQLite for MVP)
- CORS middleware
- Environment variable management (dotenv)

### Frontend:
- React or Vue.js
- Axios for API calls
- UI library (TailwindCSS, Material-UI, or Chakra UI)
- Date/time formatting library

### Chatbot:
- OpenAI API client or custom NLP library
- WebSocket library (Socket.io) for real-time chat

## Next Steps
1. Team meeting to assign roles
2. Set up shared repository
3. Create initial project structure
4. Start with MVP (one transport type, basic UI)
5. Iterate and add features

