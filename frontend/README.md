# Travel Hub Frontend

React-based frontend for the Travel Hub application.

## Features
- 🎨 Modern UI with TailwindCSS
- 🔍 Travel search form with location input
- 📊 Results display with price and time comparison
- 💬 Integrated chatbot for natural language queries
- ⚡ Fast development with Vite

## Getting Started

### Prerequisites
- Node.js 18+
- npm or yarn

### Installation

1. Install dependencies:
```bash
npm install
```

2. Start development server:
```bash
npm run dev
```

The app will be available at `http://localhost:3000`

### Build for Production

```bash
npm run build
```

The built files will be in the `dist/` directory.

## Project Structure

```
frontend/
├── src/
│   ├── components/
│   │   ├── SearchForm.jsx      # Location input form
│   │   ├── ResultsDisplay.jsx  # Travel options display
│   │   └── Chatbot.jsx         # Chatbot interface
│   ├── App.jsx                 # Main app component
│   ├── main.jsx                # Entry point
│   └── index.css               # Global styles
├── index.html                  # HTML template
├── vite.config.js              # Vite configuration
└── package.json                # Dependencies
```

## API Integration

The frontend expects the following API endpoints:

- `POST /api/search` - Search for travel options
  ```json
  {
    "start": "New York, NY",
    "end": "Los Angeles, CA",
    "sortBy": "price"
  }
  ```

- `POST /api/chat` - Chatbot endpoint
  ```json
  {
    "message": "Find cheapest way to get from NYC to LA"
  }
  ```

## Development Notes

- The frontend uses Vite for fast development
- TailwindCSS is configured for styling
- API calls are proxied to `http://localhost:3001` during development
- Components are ready for backend integration (TODO comments mark integration points)

