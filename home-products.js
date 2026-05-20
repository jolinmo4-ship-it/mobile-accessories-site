document.addEventListener("DOMContentLoaded", () => {
  loadHomeCategories();
  loadFactoryVideo();
});

let homeSupabaseClient = null;

const builtInDefaultProducts = [
  {
    name: "Phone Case",
    slug: "phone-case",
    image_url: "images/phone-case.webp",
    description: "Premium protective phone cases with refined finishes for OEM and wholesale programs.",
    link: "product.html?category=phone-case"
  },
  {
    name: "Screen Protector",
    slug: "screen-protector",
    image_url: "images/screen-protector.webp",
    description: "Clear tempered glass and film protection designed for daily durability and clean display clarity.",
    link: "product.html?category=screen-protector"
  },
  {
    name: "Charger",
    slug: "charger",
    image_url: "images/charger.webp",
    description: "Compact fast-charging solutions for modern mobile accessory collections.",
    link: "product.html?category=charger"
  },
  {
    name: "Power Bank",
    slug: "power-bank",
    image_url: "images/power-bank.webp",
    description: "High-capacity portable power products with clean industrial design and reliable performance.",
    link: "product.html?category=power-bank"
  },
  {
    name: "Mobile Stand",
    slug: "mobile-stand",
    image_url: "images/mobile-stand.webp",
    description: "Elegant desktop and travel stands for hands-free viewing, retail bundles, and brand programs.",
    link: "product.html?category=mobile-stand"
  },
  {
    name: "Data Cable",
    slug: "data-cable",
    image_url: "images/data-cable.webp",
    description: "Durable charging and sync cables built for stable performance and premium packaging.",
    link: "product.html?category=data-cable"
  }
];

const defaultHomeCategories = Array.isArray(window.XIQI_DEFAULT_PRODUCTS) && window.XIQI_DEFAULT_PRODUCTS.length
  ? window.XIQI_DEFAULT_PRODUCTS
  : builtInDefaultProducts;

async function loadHomeCategories() {
  const grid = document.querySelector("#products .category-grid");

  if (!grid) return;

  renderCategories(grid, defaultHomeCategories, { isFallback: true });
  setLoadingState(grid, false);

  try {
    const client = createSupabaseClient();
    const categories = await withTimeout(fetchPublishedCategories(client), 8000, "Categories request timed out.");

    if (categories.length) {
      renderCategories(grid, ensureMinimumCategories(categories));
      return;
    }

    const categoriesFromProducts = await withTimeout(fetchCategoriesFromProducts(client), 8000, "Products request timed out.");

    if (categoriesFromProducts.length) {
      renderCategories(grid, ensureMinimumCategories(categoriesFromProducts), {
        notice: "Showing product categories generated from available products."
      });
      return;
    }

    renderCategories(grid, defaultHomeCategories, {
      isFallback: true,
      notice: "Default product categories are shown until live products are available."
    });
  } catch (error) {
    console.warn("Home product categories unavailable. Showing fallback categories.", error);
    renderCategories(grid, defaultHomeCategories, {
      isFallback: true,
      notice: "Live product data is temporarily unavailable. Showing default product categories."
    });
  } finally {
    setLoadingState(grid, false);
  }
}

function createSupabaseClient() {
  if (homeSupabaseClient) return homeSupabaseClient;
  if (window.XIQI_GET_SUPABASE_CLIENT) {
    homeSupabaseClient = window.XIQI_GET_SUPABASE_CLIENT();
    return homeSupabaseClient;
  }

  const config = window.XIQI_SUPABASE || window.XIQI_CONFIG;

  if (!config || !isValidSupabaseUrl(config.url) || !isUsableKey(config.key)) {
    throw new Error("Invalid Supabase config. Check supabase-config.js URL and publishable key.");
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library failed to load. Check CDN loading order or network access.");
  }

  homeSupabaseClient = window.supabase.createClient(config.url, config.key);
  return homeSupabaseClient;
}

function isValidSupabaseUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(cleanText(url));
}

function isUsableKey(key) {
  const value = cleanText(key);
  return value.length > 24 && !/YOUR_|REPLACE|placeholder/i.test(value);
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

async function fetchPublishedCategories(client) {
  const { data, error } = await client
    .from("categories")
    .select("id,name,slug,image_url,description,link,status,sort_order,created_at")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(6);

  if (error) throw error;

  return Array.isArray(data) ? data.filter((item) => cleanText(item.name)) : [];
}

async function fetchCategoriesFromProducts(client) {
  const config = window.XIQI_SUPABASE || window.XIQI_CONFIG || {};
  const productsTable = cleanText(config.productsTable) || "products";
  const { data, error } = await client
    .from(productsTable)
    .select("id,name,category,image_url,short_desc,description,status,sort_order,created_at")
    .eq("status", "published")
    .order("sort_order", { ascending: true })
    .order("created_at", { ascending: false })
    .limit(30);

  if (error) throw error;

  return buildCategoriesFromProducts(Array.isArray(data) ? data : []);
}

function ensureMinimumCategories(categories, minimum = 6) {
  const merged = [];
  const usedSlugs = new Set();

  [...categories, ...defaultHomeCategories].forEach((category) => {
    const name = cleanText(category.name);
    const slug = cleanText(category.slug) || slugify(name);

    if (!name || !slug || usedSlugs.has(slug)) return;

    usedSlugs.add(slug);
    merged.push(category);
  });

  return merged.slice(0, minimum);
}

function buildCategoriesFromProducts(products) {
  const bySlug = new Map();

  products.forEach((product) => {
    const categoryName = cleanText(product.category) || cleanText(product.name);
    if (!categoryName) return;

    const slug = slugify(categoryName);
    if (!slug || bySlug.has(slug)) return;

    bySlug.set(slug, {
      name: categoryName,
      slug,
      image_url: cleanText(product.image_url) || fallbackImageForIndex(bySlug.size),
      description: cleanText(product.short_desc) || cleanText(product.description) || "Explore XiQi mobile accessory products with OEM and wholesale support.",
      link: `product.html?category=${encodeURIComponent(slug)}`
    });
  });

  return Array.from(bySlug.values()).slice(0, 6);
}

function renderCategories(container, categories, options = {}) {
  try {
    const safeCategories = Array.isArray(categories) && categories.length ? categories : defaultHomeCategories;
    const cards = safeCategories
      .map((category, index) => {
        try {
          return renderCategoryCard(category, index);
        } catch (error) {
          console.warn("Skipped invalid category item.", error, category);
          return "";
        }
      })
      .filter(Boolean);

    if (!cards.length) {
      renderCategories(container, defaultHomeCategories, {
        isFallback: true,
        notice: "Default product categories are shown because live data could not be rendered."
      });
      return;
    }

    container.innerHTML = cards.join("") + renderCategoryNotice(options.notice, options.isFallback);
  } catch (error) {
    console.warn("Category render failed.", error);
    renderCategoryFallbackMessage(container);
  }
}

function renderCategoryNotice(message, isFallback) {
  if (!message) return "";

  return `
    <div class="product-empty-state product-load-note" role="status">
      <h3>${isFallback ? "Default Products Loaded" : "Products Loaded"}</h3>
      <p>${escapeHtml(message)}</p>
    </div>
  `;
}

function renderCategoryFallbackMessage(container) {
  container.innerHTML = `
    <div class="product-empty-state" role="status">
      <h3>Default Products Loaded</h3>
      <p>Live product data is temporarily unavailable, so default product categories are displayed.</p>
    </div>
  `;
}

function setLoadingState(element, isLoading) {
  element.classList.toggle("is-loading", isLoading);
  element.setAttribute("aria-busy", String(isLoading));
}

function renderCategoryCard(category, index = 0) {
  const name = cleanText(category.name) || "XiQi Category";
  const slug = cleanText(category.slug) || slugify(name);
  const imageUrl = cleanText(category.image_url) || fallbackImageForIndex(index);
  const description = cleanText(category.description) || "OEM and wholesale mobile accessories from Guangzhou XiQi Technology.";
  const link = cleanText(category.link) || `product.html?category=${encodeURIComponent(slug)}`;

  return `
    <div class="category-card">
      <img src="${escapeAttribute(imageUrl)}" alt="${escapeAttribute(name)}" width="900" height="620" loading="lazy" decoding="async" onerror="this.onerror=null;this.src='images/phone-case.png';">
      <div class="category-info">
        <h3>${escapeHtml(name)}</h3>
        <p>${escapeHtml(description)}</p>
        <a href="${escapeAttribute(link)}" class="product-link">
          View Details
        </a>
      </div>
    </div>
  `;
}

function fallbackImageForIndex(index) {
  const images = defaultHomeCategories.map((category) => cleanText(category.image_url)).filter(Boolean);
  return images[Math.abs(index) % images.length] || "images/phone-case.png";
}

async function loadFactoryVideo() {
  const video = document.querySelector(".about-left video");

  if (!video) return;

  try {
    const client = createSupabaseClient();
    const { data, error } = await withTimeout(
      client
        .from("factory_media")
        .select("title,description,video_url,status,sort_order,created_at")
        .eq("status", "published")
        .order("sort_order", { ascending: true })
        .order("created_at", { ascending: false })
        .limit(1)
        .maybeSingle(),
      8000,
      "Factory video request timed out."
    );

    if (error) throw error;
    if (!data || !data.video_url) return;

    renderFactoryVideo(video, data);
  } catch (error) {
    console.warn("Factory video unavailable, keeping static video.", error);
  }
}

function renderFactoryVideo(video, media) {
  try {
    const videoUrl = cleanText(media.video_url);

    if (!videoUrl) return;

    const source = video.querySelector("source");

    if (source) {
      source.src = videoUrl;
      source.type = "video/mp4";
    } else {
      video.src = videoUrl;
    }

    video.preload = "metadata";
    video.load();
    video.play().catch(() => {});
  } catch (error) {
    console.warn("Factory video render failed, keeping static video.", error);
  }
}

function cleanText(value) {
  return typeof value === "string" ? value.trim() : "";
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

function slugify(value) {
  return String(value || "")
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}