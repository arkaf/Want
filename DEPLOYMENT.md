# Cloudflare Worker Deployment Guide

## Deploy the Meta Scraper Worker

The Want PWA uses a Cloudflare Worker for server-side metadata scraping to avoid CORS issues and provide better extraction capabilities.

### Step 1: Create Cloudflare Account
1. Go to [cloudflare.com](https://cloudflare.com) and create a free account
2. Navigate to the Workers & Pages section

### Step 2: Create New Worker
1. Click "Create application"
2. Choose "Create Worker"
3. Give it a name (e.g., `want-meta-scraper`)
4. Click "Deploy"

### Step 3: Replace Worker Code
1. In the Worker editor, replace the default code with the contents of `workers/meta-scraper.js`
2. Click "Save and deploy"

### Step 4: Get Your Worker URL
Your worker will be available at: `https://want-meta-scraper.your-subdomain.workers.dev`

### Step 5: Update the App
1. Open `app.js` and `add.js`
2. Update the `META_ENDPOINT` constant:
   ```javascript
   this.META_ENDPOINT = 'https://want-meta-scraper.your-subdomain.workers.dev';
   ```

### Step 6: Test
1. Deploy your updated app
2. Try pasting a product URL (e.g., from Amazon, eBay, etc.)
3. The form should auto-fill with title, price, and image

## Features

The worker extracts:
- **Title**: From og:title meta tag or page title
- **Image**: From og:image, twitter:image, or schema.org product images
- **Price**: From schema.org product offers or regex pattern matching

## Fallback Behavior

If the worker is unavailable or fails:
- Title defaults to domain name
- Image defaults to Google favicon
- Price defaults to empty string
- App continues to work normally

## CORS and Security

The worker includes:
- CORS headers for cross-origin requests
- 5-minute cache for performance
- Error handling for failed requests
- User-Agent spoofing for compatibility
