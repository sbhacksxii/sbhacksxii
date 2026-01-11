# Testing the Website Locally

This guide explains how to run the Travel Hub application locally on your machine.

## Quick Start (Both Servers at Once)

From the root directory, you can run both servers simultaneously:

```powershell
# Make sure Node.js is in PATH (or restart terminal)
npm run dev
```

This will start:
- Backend API server on `http://localhost:3001`
- Frontend development server on `http://localhost:3000`

Then open your browser to: **http://localhost:3000**

## Manual Setup (Step by Step)

### Step 1: Install Dependencies

If you haven't already, install dependencies for all parts:

```powershell
# From the root directory
npm run install:all
```

Or install individually:

```powershell
# Backend dependencies
cd backend
npm install

# Frontend dependencies
cd ../frontend
npm install
```

### Step 2: Start the Backend Server

Open a terminal window and run:

```powershell
cd backend
npm run dev
```

You should see:
```
🚀 Server running on port 3001
📡 API endpoints:
   POST /api/search - Search for travel options
   ...
```

The backend API will be available at: **http://localhost:3001**

### Step 3: Start the Frontend Server

Open a **second terminal window** and run:

```powershell
cd frontend
npm run dev
```

You should see:
```
  VITE v5.x.x  ready in xxx ms

  ➜  Local:   http://localhost:3000/
  ➜  Network: use --host to expose
```

The frontend will be available at: **http://localhost:3000**

### Step 4: Open in Browser

Open your browser and navigate to:
```
http://localhost:3000
```

## Testing Connections Feature

To test the connections feature:

1. **Make sure both servers are running** (backend on 3001, frontend on 3000)

2. **Open the frontend** in your browser: `http://localhost:3000`

3. **Try a search** that should create connections:
   - **Origin:** NYC (or NYP, New York)
   - **Destination:** SBA (or Santa Barbara)
   - **Date:** Any future date (e.g., 2026-01-15)
   - Click "Search"

4. **Look for connection results:**
   - Connections will appear with a purple border
   - They show multiple legs (train → flight or flight → train)
   - Transfer cities are displayed between legs
   - Total duration and price are shown

5. **Check the backend console** for connection logs:
   ```
   🔗 [CONNECTIONS] Building train + flight connections...
   ✅ [CONNECTIONS] Found X connection options
   ```

## Ports Used

- **Backend API:** `http://localhost:3001`
- **Frontend:** `http://localhost:3000`
- Frontend proxies `/api/*` requests to the backend automatically

## Troubleshooting

### Port Already in Use

If port 3000 or 3001 is already in use:

**Backend:**
- Set `PORT` environment variable: `$env:PORT=3002; npm run dev`
- Or modify `backend/server.js` (line 19)

**Frontend:**
- Modify `frontend/vite.config.js` to change the port
- Update backend CORS settings if you change the frontend port

### CORS Errors

If you see CORS errors:
- Make sure the backend is running on port 3001
- The frontend expects the backend at `http://localhost:3001`
- Backend CORS is configured to allow `http://localhost:3000`

### Backend Won't Start

- Make sure Node.js 18+ is installed
- Check that dependencies are installed: `cd backend && npm install`
- Check for any error messages in the console

### Frontend Won't Start

- Make sure Node.js 18+ is installed
- Check that dependencies are installed: `cd frontend && npm install`
- Check for any error messages in the console

### No Connection Results

- Make sure both flight and train results exist for your search
- Check backend console for connection building logs
- Try different origin/destination cities (NYC, LAX, SBA, CHI work well)
- Connections require valid hub cities from `backend/data/amtrak_stations.json`

## Environment Variables (Optional)

The backend supports optional environment variables via a `.env` file:

**backend/.env:**
```
PORT=3001
GROQ_API_KEY=your_key_here  # Optional, for chatbot features
NODE_ENV=development
```

The application will work without these (uses defaults).

## Testing Different Scenarios

### Test Direct Flights/Trains
- Search for routes with direct options (e.g., NYC → LAX)
- Should see regular flight/train results

### Test Connections
- Search for routes that require connections (e.g., NYC → SBA)
- Should see connection results with multiple legs

### Test Multi-Hub Connections
- Search for longer routes (e.g., NYC → Seattle)
- May find paths like: NYC → CHI → DEN → SEA (if data exists)

## Development Commands

**Root directory:**
```powershell
npm run dev              # Run both servers
npm run dev:backend      # Run only backend
npm run dev:frontend     # Run only frontend
npm run install:all      # Install all dependencies
```

**Backend:**
```powershell
cd backend
npm run dev              # Development server with auto-reload
npm start                # Production server
npm test                 # Run tests
```

**Frontend:**
```powershell
cd frontend
npm run dev              # Development server
npm run build            # Build for production
npm run preview          # Preview production build
```

## Next Steps

Once everything is running:
1. Try searching for different routes
2. Test the connections feature with various city pairs
3. Check the browser console for any errors
4. Check the backend console for API logs
5. Test the chatbot feature (if GROQ_API_KEY is configured)
