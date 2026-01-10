# Deployment Guide - Netlify

## Option 1: Deploy Vite/React App (Recommended)

### Netlify Settings:

**Base directory:** `frontend`  
**Build command:** `npm install && npm run build`  
**Publish directory:** `frontend/dist`

### Steps:

1. **Connect Repository to Netlify:**
   - Go to Netlify dashboard
   - Click "Add new site" → "Import an existing project"
   - Connect your GitHub repository

2. **Configure Build Settings:**
   - **Base directory:** `frontend`
   - **Build command:** `npm install && npm run build`
   - **Publish directory:** `frontend/dist`

3. **Environment Variables (if needed):**
   - Add any API keys or environment variables in Netlify dashboard
   - Settings → Environment variables

4. **Deploy:**
   - Click "Deploy site"
   - Netlify will automatically build and deploy

### Using netlify.toml (Alternative):

If you use the `netlify.toml` file in the root, Netlify will automatically detect it. Make sure to:
- Update the backend URL in the redirects section
- The file is already configured for the frontend directory

---

## Option 2: Deploy Standalone HTML (Simpler, but limited)

If you want to deploy just the standalone HTML file:

**Base directory:** `frontend`  
**Build command:** (leave empty or use `echo "No build needed"`)  
**Publish directory:** `frontend`

Then manually copy `index-standalone.html` to `index.html` in the frontend directory.

---

## Backend API Configuration

**Important:** Update the API redirect in `netlify.toml`:

```toml
[[redirects]]
  from = "/api/*"
  to = "https://your-actual-backend-url.com/api/:splat"
  status = 200
  force = true
```

Replace `your-actual-backend-url.com` with your actual backend deployment URL (Heroku, Railway, Render, etc.)

---

## Troubleshooting

### Build Fails:
- Check Node.js version (should be 18+)
- Ensure all dependencies are in `package.json`
- Check build logs in Netlify dashboard

### API Calls Fail:
- Verify the redirect URL in `netlify.toml` is correct
- Check CORS settings on your backend
- Ensure backend is deployed and accessible

### 404 Errors on Routes:
- The SPA redirect should handle this, but verify `netlify.toml` has the catch-all redirect

---

## Quick Deploy Checklist

- [ ] Repository connected to Netlify
- [ ] Base directory set to `frontend`
- [ ] Build command: `npm install && npm run build`
- [ ] Publish directory: `frontend/dist`
- [ ] Backend URL updated in `netlify.toml`
- [ ] Environment variables added (if needed)
- [ ] Deploy!

