// Simplified Cloudflare Worker for metadata scraping
// This version is more robust and handles errors better
export default {
  async fetch(req) {
    // Handle CORS preflight requests
    if (req.method === 'OPTIONS') {
      return new Response(null, {
        status: 200,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
          'Access-Control-Allow-Headers': 'Content-Type, Accept',
          'Access-Control-Max-Age': '86400',
        }
      });
    }

    const u = new URL(req.url);
    if (u.pathname !== "/meta") {
      return new Response("ok", {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'text/plain'
        }
      });
    }
    
    const target = u.searchParams.get("url");
    if (!target) {
      return this.jsonResponse({ error: "missing url" }, 400);
    }

    try {
      // Validate URL
      const targetUrl = new URL(target);
      if (!['http:', 'https:'].includes(targetUrl.protocol)) {
        return this.jsonResponse({ error: "invalid protocol" }, 400);
      }

      // Fetch the page
      const resp = await fetch(target, {
        redirect: "follow",
        headers: {
          "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept": "text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
      });

      if (!resp.ok) {
        return this.jsonResponse({ error: `HTTP ${resp.status}` }, resp.status);
      }

      const html = await resp.text();
      const base = new URL(resp.url);

      // Helper functions
      const abs = (x) => {
        try {
          return x ? new URL(x, base).toString() : "";
        } catch {
          return "";
        }
      };
      
      const pick = (re) => {
        const m = html.match(re);
        return m ? m[1].trim() : "";
      };

      // Extract metadata
      const ogImg = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i) ||
                     pick(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      
      const twImg = pick(/<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
      
      const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i) ||
                    pick(/<title[^>]*>([^<]+)<\/title>/i);

      // Extract price from schema.org or regex
      let price = "";
      try {
        const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(x => x[1]);
        const arr = (x) => Array.isArray(x) ? x : [x];
        
        for (const b of blocks) {
          try {
            const json = JSON.parse(b);
            const nodes = arr(json["@graph"] || json).filter(Boolean);
            for (const n of nodes) {
              const t = (n["@type"] || "").toString().toLowerCase();
              if (t.includes("product")) {
                const offers = arr(n.offers || []);
                if (!price && offers[0]) {
                  price = `${offers[0].priceCurrency || ""} ${offers[0].price || ""}`.trim();
                }
              }
              if (!price && t.includes("offer")) {
                price = `${n.priceCurrency || ""} ${n.price || ""}`.trim();
              }
            }
          } catch {}
        }
      } catch {}

      // Fallback price extraction
      if (!price) {
        const mm = html.match(/(?:£|\$|€)\s?\d{1,5}(?:[.,]\d{1,2})?/);
        price = mm ? mm[0] : "";
      }

      const image = abs(ogImg || twImg);
      
      return this.jsonResponse({
        title: title || targetUrl.hostname,
        image: image,
        price: price.trim()
      });

    } catch (e) {
      console.error('Worker error:', e);
      return this.jsonResponse({ error: String(e) }, 500);
    }
  },

  jsonResponse(obj, status = 200) {
    return new Response(JSON.stringify(obj), {
      status,
      headers: {
        "Content-Type": "application/json; charset=UTF-8",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "max-age=300"
      }
    });
  }
};
