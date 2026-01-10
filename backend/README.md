# Travel Hub Backend

Express.js backend API for the Travel Hub application.

## Setup

1. Install dependencies:
```bash
npm install
```

2. Create `.env` file:
```
PORT=3001
NODE_ENV=development
```

3. Run development server:
```bash
npm run dev
```

## API Endpoints

- `GET /health` - Health check
- `POST /api/search` - Search for travel options
- `POST /api/chat` - Chatbot endpoint
- `GET /api/recommendations` - Get recommendations

## Railway Deployment

The backend is configured for Railway deployment with:
- Node.js 18+
- Automatic build detection
- Port configuration via environment variable

