# Want Extract Worker

This Cloudflare Worker provides robust metadata extraction for product pages from major retailers like H&M, Amazon, Zara, and others.

## Features

- **Robust parsing**: JSON-LD → OpenGraph → Site-specific fallbacks
- **Anti-bot protection**: Uses realistic browser headers
- **Image optimization**: Proxies images through weserv.nl for CORS-free loading
- **Caching**: 24-hour KV cache for performance
- **Site-specific support**: Specialized parsers for H&M, Amazon, Zara

## Deployment

1. **Install Wrangler CLI**:
   ```bash
   npm install -g wrangler
   ```

2. **Login to Cloudflare**:
   ```bash
   wrangler login
   ```

3. **Create KV namespace**:
   ```bash
   wrangler kv:namespace create "WANT_KV"
   wrangler kv:namespace create "WANT_KV" --preview
   ```

4. **Update wrangler.toml**:
   Replace the placeholder IDs with your actual KV namespace IDs:
   ```toml
   [[kv_namespaces]]
   binding = "WANT_KV"
   id = "your-actual-kv-namespace-id"
   preview_id = "your-actual-preview-kv-namespace-id"
   ```

5. **Deploy the Worker**:
   ```bash
   wrangler deploy
   ```

6. **Update your domain**:
   In `wrangler.toml`, update the route to match your worker domain:
   ```toml
   [env.production]
   name = "want-extract"
   route = "your-worker-domain.com/extract"
   ```

## Usage

The Worker exposes a single endpoint:

```
GET /extract?url=https://example.com/product
```

Returns normalized JSON:
```json
{
  "title": "Product Name",
  "image": "https://images.weserv.nl/?url=...",
  "price": "£29.99",
  "domain": "example.com",
  "url": "https://example.com/product"
}
```

## Supported Sites

- **H&M**: Parses `__NEXT_DATA__` JSON blobs
- **Amazon**: JSON-LD + meta tags, upgrades thumbnail images
- **Zara**: JSON-LD + `product-state` script
- **Generic**: JSON-LD → OpenGraph → Twitter Cards

## Error Handling

- Returns 400 for missing URL parameter
- Returns cached data if available
- Falls back gracefully to basic metadata
- Handles network errors and parsing failures
