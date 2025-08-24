# Cloudflare Worker Deployment Guide

## 1. Create KV Namespace

First, create a KV namespace for storing items:

```bash
# Create the KV namespace
wrangler kv:namespace create "WANT_KV"

# This will output something like:
# Add the following to your wrangler.toml:
# kv_namespaces = [
#   { binding = "WANT_KV", id = "your-namespace-id" }
# ]
```

## 2. Create wrangler.toml

Create a `wrangler.toml` file in the `workers` directory:

```toml
name = "want-items"
main = "items.js"
compatibility_date = "2024-01-01"

kv_namespaces = [
  { binding = "WANT_KV", id = "your-namespace-id-from-step-1" }
]

[triggers]
crons = []
```

## 3. Deploy the Worker

```bash
cd workers
wrangler deploy
```

## 4. Update CORS (Optional)

The Worker is configured with `Access-Control-Allow-Origin: *` for development. For production, you may want to restrict this to specific domains:

```javascript
// In workers/items.js, update the cors function:
function cors(origin) {
  const allowedOrigins = [
    "https://arkaf.github.io",
    "http://localhost:8030",
    "http://localhost:8031", 
    "http://localhost:8032",
    "http://localhost:8033",
    // Add your production domain here
  ];
  
  const isAllowed = allowedOrigins.includes(origin) || origin === "null";
  
  return {
    "Access-Control-Allow-Origin": isAllowed ? origin : "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}
```

## 5. Test the Worker

Test the endpoints:

```bash
# Get items
curl "https://your-worker.your-subdomain.workers.dev/items?listId=want-main"

# Add an item
curl -X POST "https://your-worker.your-subdomain.workers.dev/items" \
  -H "Content-Type: application/json" \
  -d '{"listId":"want-main","item":{"url":"https://example.com","title":"Test Item","price":"$99.99","image":"https://example.com/image.jpg"}}'

# Delete an item
curl -X DELETE "https://your-worker.your-subdomain.workers.dev/items?id=item-id&listId=want-main"
```

Expected responses:

**GET /items:**
```json
{
  "items": [
    {
      "id": "uuid-here",
      "url": "https://example.com",
      "title": "Test Item",
      "price": "$99.99",
      "image": "https://example.com/image.jpg",
      "createdAt": "2024-01-01T00:00:00.000Z"
    }
  ]
}
```

**POST /items:**
```json
{
  "ok": true,
  "id": "uuid-here"
}
```

**DELETE /items:**
```json
{
  "ok": true
}
```

## 6. Update Frontend

Update the `API` constant in `app.js` and `add.js` to point to your deployed Worker:

```javascript
const API = "https://your-worker.your-subdomain.workers.dev";
```

## Notes

- The Worker stores items with a 1-year TTL (expiration)
- Each item is stored as an individual KV entry with key format: `item:listId:id`
- The `listId` parameter allows for multiple lists (defaults to "want-main")
- Items are automatically sorted by creation date (newest first)
- CORS is configured for development with `*` origin
- The Worker handles preflight OPTIONS requests automatically
- KV operations are atomic and efficient for individual item operations
