# Reset Local Website

Steps to reset and restart your local website from scratch.

## Step 1: Stop Running Servers

Close any terminal windows running:
- `npm run dev`
- Backend server (`npm run dev` in backend/)
- Frontend server (`npm run dev` in frontend/)

Or press `Ctrl+C` in those terminals to stop them.

## Step 2: Clear Build Files and Caches

Run these commands to clean up:

```powershell
# Clear frontend build/dist folder
cd frontend
if (Test-Path dist) { Remove-Item -Recurse -Force dist }
if (Test-Path node_modules/.vite) { Remove-Item -Recurse -Force node_modules/.vite }

# Go back to root
cd ..

# Clear backend caches (if any)
cd backend
# Backend doesn't typically have build folders, but you can clear npm cache if needed
cd ..
```

## Step 3: (Optional) Reinstall Dependencies

If you want a completely fresh start:

```powershell
# Remove node_modules and reinstall
cd frontend
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
cd ..

cd backend
Remove-Item -Recurse -Force node_modules -ErrorAction SilentlyContinue
npm install
cd ..
```

**Note:** This step is optional - only do it if you're having dependency issues.

## Step 4: Restart Servers

Start fresh:

```powershell
# From root directory
npm run dev
```

Or manually:

**Terminal 1:**
```powershell
cd backend
npm run dev
```

**Terminal 2:**
```powershell
cd frontend
npm run dev
```

Then open: **http://localhost:3000**
