# Travel Hub - Multi-Transport Travel Comparison Platform

A unified platform that aggregates travel options from multiple sources (flights, trains, buses) and provides intelligent recommendations based on price and time, with an integrated chatbot for natural language queries.

## Features
- 🛫 Multi-source travel search (Flights, Trains, Buses)
- 💰 Price comparison
- ⏱️ Time comparison
- 🤖 AI-powered chatbot for travel queries
- 📊 Smart recommendations (best value, fastest, cheapest)

## Tech Stack
- **Frontend:** React + TailwindCSS
- **Backend:** Node.js + Express
- **Database:** PostgreSQL (or MongoDB)
- **Chatbot:** OpenAI API
- **APIs:** Amadeus (flights), Train APIs, Bus APIs

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn
- PostgreSQL (or MongoDB)
- API keys for travel services

### Installation

1. Clone the repository
```bash
git clone <repo-url>
cd sbhacksxii
```

2. Install dependencies
```bash
npm install
```

3. Set up environment variables
```bash
cp .env.example .env
# Fill in your API keys
```

4. Run the development server
```bash
npm run dev
```

## Project Structure
```
sbhacksxii/
├── frontend/          # React frontend application
├── backend/           # Express API server
├── chatbot/           # Chatbot service
├── scrapers/          # Web scrapers for travel data
└── shared/            # Shared types/utilities
```

## Team Roles
- **Person 1:** Backend API & Data Aggregation
- **Person 2:** Travel Data Scrapers/APIs
- **Person 3:** Frontend & UI/UX
- **Person 4:** Chatbot Integration

## Development Workflow
1. Create feature branch: `git checkout -b feature/your-feature`
2. Make changes and commit
3. Push and create pull request
4. Review and merge

## API Endpoints
- `POST /api/search` - Search for travel options
- `GET /api/recommendations` - Get travel recommendations
- `POST /api/chat` - Chatbot endpoint

## License
MIT
