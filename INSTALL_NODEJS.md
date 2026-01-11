# Installing Node.js on Windows

## Quick Installation Steps

### Method 1: Official Installer (Recommended)
1. Go to https://nodejs.org/
2. Download the **LTS (Long Term Support)** version for Windows
3. Run the installer (.msi file)
4. Follow the installation wizard (accept defaults)
5. **Important**: Make sure "Add to PATH" is checked during installation
6. Restart your terminal/PowerShell after installation

### Method 2: Using winget (Windows Package Manager)
If you have Windows 10/11 with winget:
```powershell
winget install OpenJS.NodeJS.LTS
```

### Method 3: Using Chocolatey
If you have Chocolatey installed:
```powershell
choco install nodejs-lts
```

## Verify Installation

After installation, open a **new** PowerShell window and run:
```powershell
node -v
npm -v
```

You should see version numbers for both commands.

## Troubleshooting

### If commands still don't work after installation:
1. Close and reopen your terminal/PowerShell
2. Check if Node.js is in your PATH:
   ```powershell
   $env:PATH -split ';' | Select-String node
   ```
3. If not found, you may need to manually add Node.js to PATH:
   - Usually installed at: `C:\Program Files\nodejs\`
   - Add this to your System Environment Variables PATH

### Restart Required
After installation, you MUST:
- Close all terminal/PowerShell windows
- Open a new terminal window
- Node.js commands will then work

## Next Steps

Once Node.js is installed, you can:
- Run `npm install` in your project directories
- Run `npm run dev` to start development servers
- Use all Node.js and npm commands
