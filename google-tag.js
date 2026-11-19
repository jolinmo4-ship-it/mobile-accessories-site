(function () {
/* Google Ads base tag. Conversion events are intentionally configured elsewhere. */
(function installGoogleAdsTag() {
  if (window.__XIQI_GOOGLE_ADS_TAG__) return;
  window.__XIQI_GOOGLE_ADS_TAG__ = true;
  window.dataLayer = window.dataLayer || [];
  window.gtag = window.gtag || function () { window.dataLayer.push(arguments); };
  window.gtag("js", new Date());
  window.gtag("config", "AW-18441837188");
  if (!document.querySelector('script[src*="googletagmanager.com/gtag/js?id=AW-18441837188"]')) {
    const script = document.createElement("script");
    script.async = true;
    script.src = "https://www.googletagmanager.com/gtag/js?id=AW-18441837188";
    document.head.appendChild(script);
  }
})();

const XIQI_GOOGLE_ADS_CONVERSION_TOKENS = window.__XIQI_ADS_REPORTED_TOKENS__ || (window.__XIQI_ADS_REPORTED_TOKENS__ = new WeakSet());
window.XIQI_REPORT_GOOGLE_ADS_CONVERSION = function (token) {
  if (token && XIQI_GOOGLE_ADS_CONVERSION_TOKENS.has(token)) return;
  if (typeof window.gtag !== "function") return;
  if (token) XIQI_GOOGLE_ADS_CONVERSION_TOKENS.add(token);
  try { window.gtag("event", "conversion", {
    send_to: "AW-18441837188/1BHGCPCw3_ocEIS14NlE",
    value: 1.0,
    currency: "CNY",
    transaction_id: window.crypto?.randomUUID?.() || (Date.now().toString(36) + Math.random().toString(36).slice(2))
  }); } catch { /* Tracking must never change inquiry success. */ }
};

const pending = window.XIQI_PENDING_ADS_CONVERSIONS || [];
window.XIQI_PENDING_ADS_CONVERSIONS = [];
pending.forEach(token => window.XIQI_REPORT_GOOGLE_ADS_CONVERSION(token));
})();
