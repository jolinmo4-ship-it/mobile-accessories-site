const SITE_URL = "https://www.xi-qi-tech.com";

module.exports = async function handler(req, res) {
  if (req.method !== "GET") {
    res.setHeader("Allow", "GET");
    return res.status(405).send("Method Not Allowed");
  }

  const urls = [
    `${SITE_URL}/`,
    `${SITE_URL}/product.html`,
    `${SITE_URL}/product-detail.html`
  ];

  try {
    const baseUrl = process.env.SUPABASE_URL || process.env.XIQI_SUPABASE_URL;
    const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (baseUrl && serviceKey) {
      const productsUrl = new URL("/rest/v1/products", baseUrl);
      productsUrl.searchParams.set("select", "id");
      productsUrl.searchParams.set("status", "eq.published");

      const response = await fetch(productsUrl, {
        headers: { apikey: serviceKey, Authorization: `Bearer ${serviceKey}` }
      });
      if (response.ok) {
        const products = await response.json();
        if (Array.isArray(products)) {
          const productUrls = products
            .map((product) => String(product?.id || "").trim())
            .filter(Boolean)
            .map((id) => `${SITE_URL}/product-detail.html?id=${encodeURIComponent(id)}`);
          urls.push(...productUrls);
        }
      }
    }
  } catch (error) {
    console.warn("Dynamic sitemap product lookup failed; serving static URLs.", error?.message || "unknown error");
  }

  const uniqueUrls = [...new Set(urls)];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${uniqueUrls
    .map((url) => `  <url><loc>${escapeXml(url)}</loc></url>`)
    .join("\n")}\n</urlset>\n`;

  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=300, stale-while-revalidate=600");
  return res.status(200).send(xml);
};

function escapeXml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}
