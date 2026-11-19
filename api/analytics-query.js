module.exports = async function handler(req, res) {
  if(req.query?.xiqi_module==='ads-csv')return require('../server/ads-data-handler')(req,res);
  if (req.method !== "GET") { res.setHeader("Allow", "GET"); return res.status(405).json({ error: "Method not allowed" }); }
  const token = String(req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  const baseUrl = process.env.SUPABASE_URL || process.env.XIQI_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const publishableKey = process.env.SUPABASE_ANON_KEY || process.env.SUPABASE_PUBLISHABLE_KEY || serviceKey;
  if (!token || !baseUrl || !serviceKey || !publishableKey) return res.status(401).json({ error: "Admin authentication required." });
  try {
    const userResponse = await fetch(new URL("/auth/v1/user", baseUrl), { headers: { apikey: publishableKey, Authorization: `Bearer ${token}` } });
    if (!userResponse.ok) return res.status(401).json({ error: "Admin authentication required." });
    const identity = await userResponse.json();
    if (identity?.app_metadata?.role !== "admin") return res.status(403).json({ error: "Admin role required." });
    const days = String(req.query.range || "all");
    const since = days === "today" ? new Date(new Date().setHours(0, 0, 0, 0)).toISOString() : days === "7" ? new Date(Date.now() - 7 * 86400000).toISOString() : days === "30" ? new Date(Date.now() - 30 * 86400000).toISOString() : null;
    const url = new URL("/rest/v1/analytics_events", baseUrl); url.searchParams.set("select", "event_type,campaign,product_id,created_at"); url.searchParams.set("order", "created_at.desc"); url.searchParams.set("limit", "10000"); if (since) url.searchParams.set("created_at", `gte.${since}`);
    const response = await fetch(url, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
    if (!response.ok) return res.status(503).json({ error: "Analytics query failed." });
    const events = await response.json();
    const ids = [...new Set(events.map((event) => event.product_id).filter(Boolean))];
    let productNames = {};
    if (ids.length) {
      const productsUrl = new URL("/rest/v1/products", baseUrl); productsUrl.searchParams.set("select", "id,name"); productsUrl.searchParams.set("id", `in.(${ids.map(encodeURIComponent).join(",")})`);
      const productsResponse = await fetch(productsUrl, { headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` } });
      if (productsResponse.ok) { const products = await productsResponse.json(); productNames = Object.fromEntries(products.map((product) => [String(product.id), product.name])); }
    }
    return res.status(200).json({ events, productNames });
  } catch { return res.status(503).json({ error: "Analytics query failed." }); }
};

module.exports.config={maxDuration:300};
