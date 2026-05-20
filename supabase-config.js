window.XIQI_CONFIG = {
  url: "https://qndwtogovmkuexudtnua.supabase.co",
  key: "sb_publishable_ArOnpIB_-fM3HVgshxbZ7w_SAjcSpRl",
  productsTable: "products",
  storageBucket: "product-images"
};

window.XIQI_SUPABASE = window.XIQI_CONFIG;
window.XIQI_SUPABASE_CLIENT = window.XIQI_SUPABASE_CLIENT || null;

window.XIQI_GET_SUPABASE_CLIENT = function () {
  const config = window.XIQI_SUPABASE || window.XIQI_CONFIG;

  if (!config || !isValidSupabaseUrl(config.url) || !isUsableSupabaseKey(config.key)) {
    throw new Error("Invalid Supabase config. Check supabase-config.js URL and publishable key.");
  }

  if (!window.supabase || typeof window.supabase.createClient !== "function") {
    throw new Error("Supabase client library failed to load.");
  }

  if (!window.XIQI_SUPABASE_CLIENT) {
    window.XIQI_SUPABASE_CLIENT = window.supabase.createClient(config.url, config.key);
  }

  return window.XIQI_SUPABASE_CLIENT;
};

function isValidSupabaseUrl(url) {
  return /^https:\/\/[a-z0-9-]+\.supabase\.co\/?$/i.test(String(url || "").trim());
}

function isUsableSupabaseKey(key) {
  const value = String(key || "").trim();
  return value.length > 24 && !/YOUR_|REPLACE|placeholder/i.test(value);
}