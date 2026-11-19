(function loadGoogleAdsBaseTag() {
  window.XIQI_PENDING_ADS_CONVERSIONS = window.XIQI_PENDING_ADS_CONVERSIONS || [];
  window.XIQI_REPORT_GOOGLE_ADS_CONVERSION = window.XIQI_REPORT_GOOGLE_ADS_CONVERSION || function (token) { window.XIQI_PENDING_ADS_CONVERSIONS.push(token); };
  if (document.querySelector('script[src="google-tag.js"]')) return;
  const tagScript = document.createElement("script");
  tagScript.src = "google-tag.js";
  document.head.appendChild(tagScript);
})();

(function () {
  "use strict";
  const SESSION_KEY = "xiqi_analytics_session_v1";
  const ATTRIBUTION_KEY = "xiqi_analytics_attribution_v1";
  const EVENT_TYPES = new Set(["ad_visit", "product_view", "add_to_inquiry"]);

  function id() {
    try { return crypto.randomUUID().replace(/-/g, ""); } catch { return `${Date.now()}${Math.random().toString(36).slice(2)}`; }
  }
  function readJson(key) { try { return JSON.parse(sessionStorage.getItem(key) || "null"); } catch { return null; } }
  function getSessionId() {
    let value = sessionStorage.getItem(SESSION_KEY);
    if (!value || value.length < 16) { value = id(); sessionStorage.setItem(SESSION_KEY, value); }
    return value;
  }
  function getAttribution() {
    const params = new URLSearchParams(window.location.search);
    const current = { source: params.get("utm_source")?.trim().slice(0, 100), medium: params.get("utm_medium")?.trim().slice(0, 100), campaign: params.get("utm_campaign")?.trim().slice(0, 200) };
    const stored = readJson(ATTRIBUTION_KEY) || {};
    const next = current.source || current.medium || current.campaign ? { ...stored, ...current } : stored;
    if (next.source || next.medium || next.campaign) sessionStorage.setItem(ATTRIBUTION_KEY, JSON.stringify(next));
    return next;
  }
  const attribution = getAttribution();
  const sessionId = getSessionId();
  const isAd = String(attribution.source || "").toLowerCase() === "google" && String(attribution.medium || "").toLowerCase() === "cpc";
  function send(eventType, productId) {
    if (!isAd || !EVENT_TYPES.has(eventType)) return;
    const body = { event_type: eventType, session_id: sessionId, campaign: attribution.campaign || null, source: attribution.source || null, medium: attribution.medium || null, product_id: productId || null };
    fetch("/api/analytics-event", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body), keepalive: true }).catch(() => {});
  }
  if (isAd && !sessionStorage.getItem("xiqi_analytics_ad_visit_v1")) { sessionStorage.setItem("xiqi_analytics_ad_visit_v1", "1"); send("ad_visit"); }
  window.XIQI_ANALYTICS = { send, context: () => ({ session_id: sessionId, ...attribution }) };
})();
