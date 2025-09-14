// Cloudflare Worker for metadata scraping
// Deploy this to Cloudflare Workers and update META_ENDPOINT in app.js
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
    if (u.pathname !== "/meta") return new Response("ok");
    const target = u.searchParams.get("url");
    if (!target) return j({ error: "missing url" }, 400);

    try {
      const resp = await fetch(target, {
        redirect: "follow",
        headers: {
          "User-Agent":"Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120 Safari/537.36",
          "Accept-Language":"en-GB,en;q=0.9",
        },
      });
      const html = await resp.text();
      const base = new URL(resp.url);

      const abs = (x)=>{ try{ return x?new URL(x, base).toString():""; }catch{ return ""; } };
      const pick = (re)=>{ const m = html.match(re); return m?m[1].trim():""; };

      const ogImg = pick(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)
                 || pick(/<meta[^>]+name=["']og:image["'][^>]+content=["']([^"']+)["']/i);
      const twImg = pick(/<meta[^>]+(?:name|property)=["']twitter:image(?::src)?["'][^>]+content=["']([^"']+)["']/i);
      const title = pick(/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i)
                 || pick(/<title[^>]*>([^<]+)<\/title>/i);

      // schema.org Product / Offer
      let price = "", schemaImg = "";
      const blocks = [...html.matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)].map(x=>x[1]);
      const arr = (x)=>Array.isArray(x)?x:[x];
      for (const b of blocks) {
        try {
          const json = JSON.parse(b);
          const nodes = arr(json["@graph"] || json).filter(Boolean);
          for (const n of nodes) {
            const t = (n["@type"] || "").toString().toLowerCase();
            if (t.includes("product")) {
              if (!schemaImg) { const imgs = arr(n.image || n.images || []); schemaImg = imgs[0] || ""; }
              const offers = arr(n.offers || []);
              if (!price && offers[0]) {
                price = `${offers[0].priceCurrency || ""} ${offers[0].price || ""}`.trim();
              }
            }
            if (!price && t.includes("offer")) price = `${n.priceCurrency || ""} ${n.price || ""}`.trim();
          }
        } catch {}
      }

      if (!price) {
        const mm = html.match(/(?:£|\$|€)\s?\d{1,5}(?:[.,]\d{1,2})?/);
        price = mm ? mm[0] : "";
      }

      const image = abs(ogImg || twImg || schemaImg);
      return j({ title: title || new URL(target).hostname, image, price: price.trim() });
    } catch (e) {
      return j({ error: String(e) }, 500);
    }
  }
};

function j(obj, status=200){
  return new Response(JSON.stringify(obj), {
    status,
    headers: {
      "Content-Type":"application/json; charset=UTF-8",
      "Access-Control-Allow-Origin":"*",
      "Cache-Control":"max-age=300"
    }
  });
}
