# Quick Start Guide - Fixing npm "not recognized" Error

## Problem
If you see `npm is not recognized`, Node.js is installed but not in your PATH for this terminal session.

## Quick Fix (Current Terminal Session)

**Option 1: Add Node.js to PATH for this session**

In PowerShell, run:
```powershell
$env:PATH = "C:\Program Files\nodejs;" + $env:PATH
```

Then verify:
```powershell
npm --version
node --version
```

**Option 2: Use Full Path**

Instead of `npm`, use the full path:
```powershell
& "C:\Program Files\nodejs\npm.cmd" run dev
```

## Permanent Fix (Recommended)

**Close and restart your terminal/PowerShell window.**

After restarting, Node.js should be in PATH automatically. Then try:
```powershell
npm --version
node --version
```

If it still doesn't work after restart:
1. Check if Node.js is actually installed: `Test-Path "C:\Program Files\nodejs\npm.cmd"`
2. If Node.js is not installed, download it from: https://nodejs.org/
3. If installed but not in PATH, you may need to add it manually to System Environment Variables

## Running the Application (After Fixing PATH)

Once npm works, run:

```powershell
# From the root directory (sbhacksxii)
npm run dev
```

Or manually in two terminals:

**Terminal 1 - Backend:**
```powershell
cd backend
npm run dev
```

**Terminal 2 - Frontend:**
```powershell
cd frontend
npm run dev
```

Then open: **http://localhost:3000**
