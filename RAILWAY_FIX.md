# Railway Deployment Fix

## Problem
Railway was auto-generating a broken Nix file with syntax errors when trying to build.

## Solution
I've created multiple configuration options to fix this:

### Option 1: Use Dockerfile (Recommended)
Railway will now use the Dockerfile in the `backend/` directory instead of auto-generating Nix files.

**Files created:**
- `backend/Dockerfile` - Docker configuration
- `backend/railway.toml` - Railway config for backend
- `railway.toml` (root) - Updated to use Dockerfile

### Option 2: Use Nixpacks with proper config
If you prefer nixpacks, use the `nixpacks.toml` file I created.

## Railway Setup Steps

1. **In Railway Dashboard:**
   - Go to your project settings
   - Under "Build & Deploy":
     - **Root Directory:** Set to `backend` (if deploying just backend)
     - OR keep root and Railway will use the Dockerfile

2. **Environment Variables:**
   - Add `PORT` (Railway will auto-assign, but you can set it)
   - Add any API keys you need

3. **Deploy:**
   - Railway should now build using the Dockerfile
   - No more Nix file errors!

## Alternative: Deploy from backend directory

If Railway is still having issues, you can:
1. Create a separate Railway service
2. Point it to the `backend/` directory
3. Railway will automatically detect the Dockerfile or package.json

## Files Created

- `backend/Dockerfile` - Docker build file
- `backend/server.js` - Basic Express server
- `backend/package.json` - Backend dependencies
- `railway.toml` - Railway configuration
- `nixpacks.toml` - Alternative Nixpacks config (if needed)

## Next Steps

1. Commit these files to your repository
2. Push to trigger Railway build
3. The build should now succeed using Dockerfile instead of broken Nix files

