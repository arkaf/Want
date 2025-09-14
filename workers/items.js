export default {
  async fetch(req, env) {
    const url = new URL(req.url);
    const origin = req.headers.get("Origin") || "*";

    // CORS preflight
    if (req.method === "OPTIONS") {
      return new Response(null, { status: 204, headers: cors(origin) });
    }

    const path = url.pathname;

    if (path === "/items" && req.method === "GET") {
      const listId = url.searchParams.get("listId") || "want-main";
      const prefix = `item:${listId}:`;
      
      // List all items for this listId
      const list = await env.WANT_KV.list({ prefix });
      const items = [];
      
      // Get each item individually
      for (const key of list.keys) {
        const itemData = await env.WANT_KV.get(key.name);
        if (itemData) {
          items.push(JSON.parse(itemData));
        }
      }
      
      // Sort by createdAt (newest first)
      items.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
      
      return json({ items }, origin);
    }

    if (path === "/items" && req.method === "POST") {
      const { listId = "want-main", item } = await req.json();
      if (!item || !item.url) return json({ error: "missing item.url" }, origin, 400);

      const id = crypto.randomUUID();
      const now = new Date().toISOString();
      const toSave = { id, createdAt: now, ...item };

      // Save individual item with key format: item:listId:id
      const key = `item:${listId}:${id}`;
      await env.WANT_KV.put(key, JSON.stringify(toSave), { expirationTtl: 60 * 60 * 24 * 365 }); // 1y

      return json({ ok: true, id }, origin);
    }

    if (path === "/items" && req.method === "DELETE") {
      const listId = url.searchParams.get("listId") || "want-main";
      const id = url.searchParams.get("id");
      if (!id) return json({ error: "missing id" }, origin, 400);

      // Delete individual item
      const key = `item:${listId}:${id}`;
      await env.WANT_KV.delete(key);

      return json({ ok: true }, origin);
    }

    return json({ error: "Not found" }, origin, 404);
  }
}

function cors(origin) {
  return {
    "Access-Control-Allow-Origin": origin === "null" ? "*" : origin || "*",
    "Access-Control-Allow-Methods": "GET,POST,DELETE,OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Vary": "Origin"
  };
}

function json(obj, origin, status = 200) {
  return new Response(JSON.stringify(obj), {
    status,
    headers: { "Content-Type": "application/json; charset=utf-8", ...cors(origin) }
  });
}
