module.exports = async function handler(req, res) {
  if (req.method !== "POST") { res.setHeader("Allow", "POST"); return res.status(405).json({ error: "Method not allowed" }); }
  if (process.env.VERCEL_ENV === "preview") return res.status(503).json({ error: "Preview analytics writes are disabled." });
  const body = req.body || {};
  const allowed = new Set(["ad_visit", "product_view", "add_to_inquiry"]);
  const eventType = String(body.event_type || "");
  const sessionId = String(body.session_id || "");
  if (!allowed.has(eventType) || !/^[a-zA-Z0-9_-]{16,128}$/.test(sessionId)) return res.status(400).json({ error: "Invalid analytics event." });
  const baseUrl = process.env.SUPABASE_URL || process.env.XIQI_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) return res.status(503).json({ error: "Analytics is temporarily unavailable." });
  const productId = body.product_id ? String(body.product_id).slice(0, 100) : null;
  if (productId && !/^[0-9a-f-]{36}$/i.test(productId)) return res.status(400).json({ error: "Invalid analytics product." });
  if (productId) {
    const productUrl = new URL("/rest/v1/products", baseUrl); productUrl.searchParams.set("select", "id"); productUrl.searchParams.set("id", `eq.${encodeURIComponent(productId)}`); productUrl.searchParams.set("status", "eq.published");
    try { const productResponse = await fetch(productUrl, { headers: { apikey: key, Authorization: `Bearer ${key}` } }); const products = productResponse.ok ? await productResponse.json() : []; if (!Array.isArray(products) || products.length !== 1) return res.status(400).json({ error: "Invalid analytics product." }); } catch { return res.status(503).json({ error: "Analytics is temporarily unavailable." }); }
  }
  const row = { event_type: eventType, session_id: sessionId, campaign: clean(body.campaign, 200), source: clean(body.source, 100), medium: clean(body.medium, 100), product_id: productId };
  try {
    const response = await fetch(new URL("/rest/v1/analytics_events", baseUrl), { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify([row]) });
    if (!response.ok) return res.status(503).json({ error: "Analytics is temporarily unavailable." });
    return res.status(202).json({ ok: true });
  } catch { return res.status(503).json({ error: "Analytics is temporarily unavailable." }); }
};
function clean(value, max) { const text = typeof value === "string" ? value.trim() : ""; return text ? text.slice(0, max) : null; }
