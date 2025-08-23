# Cloudflare Worker Deployment Instructions

## **Current Issue**
The worker at `https://want.fiorearcangelodesign.workers.dev` is returning 500 errors and CORS issues.

## **Solution Steps**

### **1. Deploy the Simplified Worker**

1. **Go to Cloudflare Dashboard**: https://dash.cloudflare.com/
2. **Navigate to Workers & Pages**
3. **Click "Create application"**
4. **Choose "Create Worker"**
5. **Name it**: `want-meta-scraper-v2`
6. **Replace the code** with the contents of `workers/meta-scraper-simple.js`
7. **Click "Save and deploy"**

### **2. Test the Worker**

Test the worker directly:
```bash
curl "https://your-worker-name.your-subdomain.workers.dev/meta?url=https://www.amazon.com/dp/B08N5WRWNW"
```

Expected response:
```json
{
  "title": "Product Title",
  "image": "https://image-url.jpg",
  "price": "$99.99"
}
```

### **3. Update the App**

Once the worker is working, update the META_ENDPOINT in both files:

**In `app.js`:**
```javascript
this.META_ENDPOINT = 'https://your-worker-name.your-subdomain.workers.dev';
```

**In `add.js`:**
```javascript
this.META_ENDPOINT = 'https://your-worker-name.your-subdomain.workers.dev';
```

### **4. Alternative: Use Fallback Only**

If you want to test without the worker, keep the current setting:
```javascript
this.META_ENDPOINT = ''; // Uses client-side fallback only
```

## **Current Status**

- ✅ **App works with fallback** - No CORS errors
- ✅ **Form submission works** - Items can be added
- ✅ **Image display works** - Uses favicon fallback
- ❌ **Worker needs redeployment** - CORS/500 errors

## **Testing**

1. **Current setup**: App uses client-side fallback (favicon + domain name)
2. **After worker deployment**: App will use server-side metadata extraction
3. **Both work**: The app gracefully falls back when worker is unavailable

## **Worker Features**

The simplified worker includes:
- ✅ **CORS handling** - Proper preflight requests
- ✅ **Error handling** - Better error messages
- ✅ **URL validation** - Checks for valid protocols
- ✅ **Metadata extraction** - Title, image, price
- ✅ **Fallback logic** - Graceful degradation
