async function loadRelatedProducts(currentProduct) {
  const container = document.getElementById("relatedProducts");

  if (!container || !currentProduct) return;

  container.classList.add("is-loading");
  container.setAttribute("aria-busy", "true");

  if (!currentProduct.category) {
    renderRelatedProducts(container, getFallbackRelatedProducts(currentProduct));
    container.classList.remove("is-loading");
    container.setAttribute("aria-busy", "false");
    return;
  }

  try {
    const config = window.XIQI_CONFIG || window.XIQI_SUPABASE || {};
    const client = window.XIQI_GET_SUPABASE_CLIENT
      ? window.XIQI_GET_SUPABASE_CLIENT()
      : window.supabase.createClient(config.url, config.key);
    const { data, error } = await withRelatedTimeout(
      client
        .from(config.productsTable || "products")
        .select("id,name,category,short_desc,description,image_url,status,sort_order,created_at")
        .eq("status", "published")
        .eq("category", currentProduct.category)
        .neq("id", currentProduct.id)
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(4),
      8000,
      "Related products request timed out."
    );

    if (error) throw error;

    renderRelatedProducts(container, Array.isArray(data) && data.length ? data : getFallbackRelatedProducts(currentProduct));
  } catch (error) {
    console.warn("Failed to load related products. Showing fallback related products.", error);
    renderRelatedProducts(container, getFallbackRelatedProducts(currentProduct));
  } finally {
    container.classList.remove("is-loading");
    container.setAttribute("aria-busy", "false");
  }
}

function renderRelatedProducts(container, products) {
  const safeProducts = Array.isArray(products) && products.length ? products : getFallbackRelatedProducts({});

  if (!safeProducts.length) {
    container.innerHTML = '<p class="related-products-message">No related products found.</p>';
    return;
  }

  container.innerHTML = safeProducts.map((product) => {
    const productName = product.name || "XiQi Product";
    const href = product.isFallback
      ? `product.html?category=${encodeURIComponent(product.slug || product.category || productName)}`
      : `product-detail.html?id=${encodeURIComponent(product.id)}`;

    return `
      <a href="${escapeRelatedAttribute(href)}" class="related-card">
        <img src="${escapeRelatedAttribute(product.image_url || "images/logo.png")}" alt="${escapeRelatedAttribute(productName)}" width="900" height="620" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/phone-case.png';">
        <h3>${escapeRelatedHtml(productName)}</h3>
        <p>${escapeRelatedHtml(product.short_desc || product.description || product.category || "")}</p>
      </a>
    `;
  }).join("");
}

function getFallbackRelatedProducts(currentProduct) {
  const defaults = Array.isArray(window.XIQI_DEFAULT_PRODUCTS) ? window.XIQI_DEFAULT_PRODUCTS : [];
  const currentName = normalizeRelatedValue(currentProduct?.name || currentProduct?.slug || currentProduct?.id);

  return defaults
    .filter((product) => normalizeRelatedValue(product.name || product.slug) !== currentName)
    .slice(0, 4)
    .map((product, index) => ({
      id: product.slug || `fallback-related-${index}`,
      name: product.name,
      slug: product.slug,
      category: product.name,
      image_url: product.image_url || "images/phone-case.png",
      short_desc: product.description || "Premium mobile accessory for OEM and wholesale programs.",
      description: product.description || "Premium mobile accessory for OEM and wholesale programs.",
      isFallback: true
    }));
}

function withRelatedTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function normalizeRelatedValue(value) {
  return String(value || "").toLowerCase().replace(/[^a-z0-9]+/g, "").trim();
}

function escapeRelatedHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeRelatedAttribute(value) {
  return escapeRelatedHtml(value).replaceAll("`", "&#096;");
}