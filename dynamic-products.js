document.addEventListener("DOMContentLoaded", () => {
  loadProductGrid();
  loadProductDetail();
});

const productConfig = window.XIQI_SUPABASE || window.XIQI_CONFIG || {};
const defaultFilterCategories = [
  "Phone Cases",
  "Chargers",
  "Screen Protectors",
  "Power Banks",
  "Mobile Stands",
  "Data Cables"
];
const fallbackProducts = buildFallbackProducts();
const productGridState = {
  products: fallbackProducts,
  activeCategory: "All Products",
  searchTerm: "",
  filtersReady: false
};

async function loadProductGrid() {
  const grid = document.querySelector(".product-grid");

  if (!grid) return;

  productGridState.products = fallbackProducts;
  renderFilterCategories(buildCategoriesFromProducts(fallbackProducts));
  setupProductFilters();
  applyInitialCategoryFilter();
  renderFilteredProducts({ fallback: true });
  setLoadingState(grid, false);

  try {
    const products = await withTimeout(fetchProducts(), 9000, "Products request timed out.");
    const safeProducts = Array.isArray(products) && products.length ? products : fallbackProducts;

    productGridState.products = ensureProductMinimum(safeProducts);
    await loadFilterCategories();
    setupProductFilters();
    applyInitialCategoryFilter();
    renderFilteredProducts({ fallback: !products.length });
  } catch (error) {
    console.warn("Product API unavailable. Showing fallback products.", error);
    productGridState.products = fallbackProducts;
    renderFilterCategories(buildCategoriesFromProducts(fallbackProducts));
    setupProductFilters();
    applyInitialCategoryFilter();
    renderFilteredProducts({ fallback: true });
  } finally {
    setLoadingState(grid, false);
  }
}

async function loadFilterCategories() {
  const filterButtons = document.querySelector(".product-filter-buttons");

  if (!filterButtons) return;

  try {
    const client = createPublicSupabaseClient();
    const { data, error } = await withTimeout(
      client
        .from("categories")
        .select("name,slug,sort_order,status,created_at")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false }),
      8000,
      "Category filters request timed out."
    );

    if (error) throw error;

    renderFilterCategories(Array.isArray(data) && data.length ? data : buildCategoriesFromProducts(productGridState.products));
  } catch (error) {
    console.warn("Category filters unavailable, using fallback filters.", error);
    renderFilterCategories(buildCategoriesFromProducts(productGridState.products));
  }
}

function renderFilterCategories(categories) {
  const filterButtons = document.querySelector(".product-filter-buttons");

  if (!filterButtons) return;

  const visibleCategories = (Array.isArray(categories) && categories.length ? categories : defaultFilterCategories.map((name, index) => ({
    name,
    slug: slugify(name),
    sort_order: index
  })))
    .filter((category) => normalizeCategory(category.name || category.slug))
    .sort((a, b) => Number(a.sort_order || 0) - Number(b.sort_order || 0));

  filterButtons.innerHTML = `
    <button type="button" class="product-filter-btn is-active" data-category="All Products">All Products</button>
    ${visibleCategories.map((category) => {
      const label = category.name || category.slug;
      const value = category.slug || label;

      return `<button type="button" class="product-filter-btn" data-category="${escapeAttribute(value)}">${escapeHtml(label)}</button>`;
    }).join("")}
  `;
}

function setupProductFilters() {
  const filterButtons = document.querySelectorAll(".product-filter-btn");
  const searchInput = document.getElementById("productSearchInput");

  filterButtons.forEach((button) => {
    button.onclick = () => {
      productGridState.activeCategory = button.dataset.category || "All Products";
      updateActiveFilterButton();
      renderFilteredProducts();
    };
  });

  if (searchInput && !searchInput.dataset.filterReady) {
    searchInput.addEventListener("input", () => {
      productGridState.searchTerm = searchInput.value.trim().toLowerCase();
      renderFilteredProducts();
    });
    searchInput.dataset.filterReady = "true";
  }
}

function applyInitialCategoryFilter() {
  const params = new URLSearchParams(window.location.search);
  const category = params.get("category");

  if (!category) {
    updateActiveFilterButton();
    return;
  }

  const matchedButton = [...document.querySelectorAll(".product-filter-btn")].find((button) => {
    return normalizeCategory(button.dataset.category) === normalizeCategory(category);
  });

  productGridState.activeCategory = matchedButton ? matchedButton.dataset.category : category;
  updateActiveFilterButton();
}

function updateActiveFilterButton() {
  document.querySelectorAll(".product-filter-btn").forEach((button) => {
    const isActive = normalizeCategory(button.dataset.category) === normalizeCategory(productGridState.activeCategory);
    button.classList.toggle("is-active", isActive);
  });
}

function renderFilteredProducts(options = {}) {
  const grid = document.querySelector(".product-grid");

  if (!grid) return;

  const sourceProducts = Array.isArray(productGridState.products) && productGridState.products.length
    ? productGridState.products
    : fallbackProducts;

  const filteredProducts = sourceProducts.filter((product) => {
    const matchesCategory = productGridState.activeCategory === "All Products" ||
      normalizeCategory(product.category) === normalizeCategory(productGridState.activeCategory) ||
      normalizeCategory(product.slug) === normalizeCategory(productGridState.activeCategory);
    const matchesSearch = !productGridState.searchTerm || getProductSearchText(product).includes(productGridState.searchTerm);

    return matchesCategory && matchesSearch;
  });

  if (!filteredProducts.length) {
    grid.innerHTML = `
      <div class="product-empty-state">
        <h3>No products found</h3>
        <p>Try another category or search keyword.</p>
      </div>
    `;
    return;
  }

  grid.innerHTML = filteredProducts.map((product, index) => {
    const productName = product.name || "XiQi Product";
    const imageUrl = product.image_url || fallbackImageForIndex(index);
    const detailHref = product.isFallback
      ? `product.html?category=${encodeURIComponent(product.slug || product.category || productName)}`
      : `product-detail.html?id=${encodeURIComponent(product.id)}`;

    return `
      <div class="product-card">
        <img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(productName)}" width="900" height="620" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/phone-case.png';">
        <div class="product-info">
          <h3>${escapeHtml(productName)}</h3>
          <a href="${escapeAttribute(detailHref)}">View Details</a>
        </div>
      </div>
    `;
  }).join("") + renderProductNotice(options.fallback);
}

function renderProductNotice(isFallback) {
  if (!isFallback) return "";

  return `
    <div class="product-empty-state product-load-note" role="status">
      <h3>Default Products Loaded</h3>
      <p>Live product data is temporarily unavailable, so default product cards are displayed.</p>
    </div>
  `;
}

function getProductSearchText(product) {
  return [
    product.name,
    product.short_desc,
    product.description,
    product.category
  ].filter(Boolean).join(" ").toLowerCase();
}

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

async function loadProductDetail() {
  const detailPage = document.querySelector(".detail-page");

  if (!detailPage) return;

  const params = new URLSearchParams(window.location.search);
  const id = params.get("id");
  const fallbackProduct = fallbackProducts[0];

  if (!id) {
    renderProductDetail(fallbackProduct, { fallback: true });
    clearRelatedProducts();
    setLoadingState(detailPage, false);
    return;
  }

  try {
    setLoadingState(detailPage, true);
    const client = createPublicSupabaseClient();
    const { data, error } = await withTimeout(
      client
        .from(productConfig.productsTable || "products")
        .select("*")
        .eq("id", id)
        .single(),
      9000,
      "Product detail request timed out."
    );

    if (error) throw error;

    renderProductDetail(data || fallbackProduct, { fallback: !data });
  } catch (error) {
    console.warn("Supabase product detail unavailable. Showing fallback detail.", error);
    renderProductDetail(matchFallbackProduct(id) || fallbackProduct, { fallback: true });
    clearRelatedProducts();
  } finally {
    setLoadingState(detailPage, false);
  }
}

async function fetchProducts() {
  const client = createPublicSupabaseClient();
  const { data, error } = await client
    .from(productConfig.productsTable || "products")
    .select("*")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false });

  if (error) throw error;

  return Array.isArray(data) ? data : [];
}

function renderProductDetail(product, options = {}) {
  const detailPage = document.querySelector(".detail-page");
  const videoSection = document.querySelector(".product-video-section");
  const productVideo = document.getElementById("productVideo");
  const productName = product?.name || "XiQi Product";
  const ogTitle = `${productName} | Guangzhou XiQi Technology`;
  const ogDescription = product.short_desc || product.description || "XiQi OEM and wholesale mobile accessories product details.";
  const images = buildGalleryImages(product);
  const featuredImage = images[0] || "images/logo.png";
  const galleryImages = images.length ? images : [featuredImage];
  const featureItems = parseFeatures(product.features);
  const infoRows = [
    ["Price", product.price || "Contact for price"],
    ["MOQ", product.moq],
    ["Material", product.material],
    ["Packaging", product.packaging],
    ["Lead Time", product.lead_time]
  ].filter((row) => row[1]);

  if (!detailPage) return;

  detailPage.innerHTML = `
    <div class="detail-left">
      <div class="detail-main-image">
        <img src="${escapeAttribute(featuredImage)}" alt="${escapeAttribute(productName)}" width="900" height="620" fetchpriority="high" decoding="async" onerror="this.onerror=null;this.src='images/phone-case.png';">
      </div>
      <div class="detail-gallery">
        ${galleryImages.map((image) => `
          <img src="${escapeAttribute(image)}" alt="${escapeAttribute(productName)}" width="900" height="620" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/phone-case.png';">
        `).join("")}
      </div>
    </div>
    <div class="detail-right">
      <p class="detail-tag">${escapeHtml(product.category || "MOBILE ACCESSORIES")}</p>
      <h1>${escapeHtml(productName)}</h1>
      <div class="detail-desc">${escapeHtml(product.description || product.short_desc || "OEM / ODM mobile accessories product from Guangzhou XiQi Technology.")}</div>
      <div class="detail-badges">
        <span>OEM Support</span>
        <span>Factory Direct</span>
        <span>MOQ Support</span>
      </div>
      <div class="detail-features">
        ${(featureItems.length ? featureItems : ["OEM / ODM customization", "Wholesale supply", "Factory direct support"]).map((item) => `
          <div class="feature-item">${escapeHtml(item)}</div>
        `).join("")}
      </div>
      <div class="detail-info">
        ${infoRows.map(([label, value]) => `
          <div class="info-row">
            <span>${escapeHtml(label)}</span>
            <strong>${escapeHtml(value)}</strong>
          </div>
        `).join("")}
      </div>
      <div class="detail-buttons">
        <a href="index.html?product=${encodeURIComponent(productName)}#contact" class="btn primary">
          Send Inquiry
        </a>
        <a href="https://wa.me/8619127919802" class="btn secondary">
          WhatsApp Quick Contact
        </a>
      </div>
      ${options.fallback ? `<p class="related-products-message">Live product data is temporarily unavailable. Showing default product information.</p>` : ""}
    </div>
  `;

  setupGalleryControls(galleryImages);

  if (videoSection && productVideo && product.video_url) {
    productVideo.src = product.video_url;
    videoSection.hidden = false;
    productVideo.load();
    productVideo.play().catch(() => {});
  } else if (videoSection && productVideo) {
    productVideo.removeAttribute("src");
    videoSection.hidden = true;
  }

  if (typeof loadRelatedProducts === "function" && !options.fallback) {
    loadRelatedProducts(product);
  }

  updateMeta("property", "og:image", featuredImage);
  document.title = ogTitle;
  updateMeta("name", "description", ogDescription);
  updateMeta("property", "og:title", ogTitle);
  updateMeta("property", "og:description", ogDescription);
}

function renderProductDetailMessage(container, title, message) {
  container.innerHTML = `
    <div class="product-empty-state">
      <h3>${escapeHtml(title)}</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function clearRelatedProducts() {
  const related = document.getElementById("relatedProducts");

  if (!related) return;

  related.classList.remove("is-loading");
  related.setAttribute("aria-busy", "false");
  renderRelatedFallback(related);
}

function setLoadingState(element, isLoading) {
  element.classList.toggle("is-loading", isLoading);
  element.setAttribute("aria-busy", String(isLoading));
}

function buildGalleryImages(product) {
  const images = [product?.image_url]
    .concat(normalizeGallery(product?.gallery))
    .filter(Boolean);

  return [...new Set(images)];
}

function normalizeGallery(value) {
  if (Array.isArray(value)) return value.filter(Boolean);
  if (!value) return [];

  try {
    const parsed = JSON.parse(value);
    return Array.isArray(parsed) ? parsed.filter(Boolean) : [];
  } catch {
    return String(value)
      .split(",")
      .map((item) => item.trim())
      .filter(Boolean);
  }
}

function setupGalleryControls(images) {
  const mainImage = document.querySelector(".detail-main-image img");
  const gallery = document.querySelector(".detail-gallery");

  if (!mainImage || !gallery || !images.length) return;

  let activeIndex = 0;
  let touchStartX = 0;

  gallery.querySelectorAll("img").forEach((image, index) => {
    image.addEventListener("click", () => showGalleryImage(index));
  });

  mainImage.addEventListener("touchstart", (event) => {
    touchStartX = event.touches[0].clientX;
  }, { passive: true });

  mainImage.addEventListener("touchend", (event) => {
    const diff = event.changedTouches[0].clientX - touchStartX;

    if (Math.abs(diff) < 40) return;

    if (diff < 0) showGalleryImage(activeIndex + 1);
    if (diff > 0) showGalleryImage(activeIndex - 1);
  }, { passive: true });

  function showGalleryImage(index) {
    activeIndex = (index + images.length) % images.length;
    mainImage.classList.remove("is-swapping");
    void mainImage.offsetWidth;
    mainImage.src = images[activeIndex];
    mainImage.classList.add("is-swapping");
  }
}

function parseFeatures(value) {
  if (!value) return [];

  return String(value)
    .split(/\r?\n|,/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function updateMeta(attribute, key, content) {
  let meta = document.querySelector(`meta[${attribute}="${key}"]`);

  if (!meta) {
    meta = document.createElement("meta");
    meta.setAttribute(attribute, key);
    document.head.appendChild(meta);
  }

  meta.setAttribute("content", content);
}

function normalizeCategory(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, " ")
    .trim()
    .replace(/s\b/g, "");
}

function createPublicSupabaseClient() {
  if (window.XIQI_GET_SUPABASE_CLIENT) return window.XIQI_GET_SUPABASE_CLIENT();
  if (!window.supabase || !productConfig.url || !productConfig.key) throw new Error("Supabase client unavailable.");
  window.XIQI_SUPABASE_CLIENT = window.XIQI_SUPABASE_CLIENT || window.supabase.createClient(productConfig.url, productConfig.key);
  return window.XIQI_SUPABASE_CLIENT;
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

function buildFallbackProducts() {
  const defaults = Array.isArray(window.XIQI_DEFAULT_PRODUCTS) && window.XIQI_DEFAULT_PRODUCTS.length
    ? window.XIQI_DEFAULT_PRODUCTS
    : [
      { name: "Phone Case", slug: "phone-case", image_url: "images/phone-case.webp" },
      { name: "Screen Protector", slug: "screen-protector", image_url: "images/screen-protector.webp" },
      { name: "Charger", slug: "charger", image_url: "images/charger.webp" },
      { name: "Power Bank", slug: "power-bank", image_url: "images/power-bank.webp" },
      { name: "Mobile Stand", slug: "mobile-stand", image_url: "images/mobile-stand.webp" },
      { name: "Data Cable", slug: "data-cable", image_url: "images/data-cable.webp" }
    ];

  return defaults.map((item, index) => ({
    id: item.id || item.slug || `fallback-${index}`,
    name: item.name,
    slug: item.slug || slugify(item.name),
    category: item.name,
    image_url: item.image_url || fallbackImageForIndex(index),
    short_desc: item.short_desc || item.description || "Premium mobile accessory for OEM and wholesale programs.",
    description: item.description || item.short_desc || "Premium mobile accessory for OEM and wholesale programs.",
    status: "published",
    sort_order: index,
    isFallback: true
  }));
}

function ensureProductMinimum(products, minimum = 6) {
  const merged = [];
  const used = new Set();

  [...products, ...fallbackProducts].forEach((product, index) => {
    const key = String(product.id || product.slug || product.name || index);
    if (!key || used.has(key)) return;
    used.add(key);
    merged.push({
      ...product,
      image_url: product.image_url || fallbackImageForIndex(index),
      category: product.category || product.name || "Mobile Accessories"
    });
  });

  return merged.slice(0, Math.max(minimum, products.length));
}

function buildCategoriesFromProducts(products) {
  const categories = new Map();

  (Array.isArray(products) ? products : []).forEach((product, index) => {
    const name = product.category || product.name || defaultFilterCategories[index % defaultFilterCategories.length];
    const slug = product.slug || slugify(name);
    if (!name || categories.has(slug)) return;
    categories.set(slug, { name, slug, sort_order: product.sort_order || index });
  });

  return Array.from(categories.values());
}

function matchFallbackProduct(id) {
  const normalized = normalizeCategory(id);
  return fallbackProducts.find((product) => {
    return normalizeCategory(product.id) === normalized || normalizeCategory(product.slug) === normalized || normalizeCategory(product.name) === normalized;
  });
}

function fallbackImageForIndex(index) {
  const images = [
    "images/phone-case.webp",
    "images/screen-protector.webp",
    "images/charger.webp",
    "images/power-bank.webp",
    "images/mobile-stand.webp",
    "images/data-cable.webp"
  ];
  return images[Math.abs(index) % images.length] || "images/phone-case.png";
}

function renderRelatedFallback(container) {
  if (typeof renderRelatedProducts === "function") {
    renderRelatedProducts(container, fallbackProducts.slice(0, 4));
  } else {
    container.innerHTML = "";
  }
}

function escapeHtml(value) {
  return String(value || "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

function escapeAttribute(value) {
  return escapeHtml(value).replaceAll("`", "&#096;");
}