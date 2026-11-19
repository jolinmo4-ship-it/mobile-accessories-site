(function () {
  "use strict";

  const STORAGE_KEY = "xiqi_inquiry_cart_v1";
  const MAX_QUANTITY = 9999;

  function readCart() {
    try {
      const value = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      return Array.isArray(value) ? value.filter((item) => item && item.product_id) : [];
    } catch (error) {
      console.warn("Inquiry cart could not be read.", error);
      return [];
    }
  }

  function writeCart(items) {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(items));
    document.dispatchEvent(new CustomEvent("xiqi:inquiry-cart-updated", { detail: items }));
    return items;
  }

  function normalizeItem(product, quantity) {
    const id = String(product?.id || product?.product_id || "").trim();
    const name = String(product?.name || product?.product_name || "").trim();
    if (!id || !name) return null;
    return {
      product_id: id,
      product_name: name,
      product_image: String(product.image_url || product.product_image || "").trim(),
      sku: String(product.sku || "").trim(),
      category: String(product.category || "").trim(),
      quantity: Math.min(MAX_QUANTITY, Math.max(1, Number(quantity) || 1))
    };
  }

  function add(product, quantity = 1) {
    const item = normalizeItem(product, quantity);
    if (!item) return readCart();
    const items = readCart();
    const existing = items.find((entry) => entry.product_id === item.product_id);
    if (existing) existing.quantity = Math.min(MAX_QUANTITY, existing.quantity + item.quantity);
    else items.push(item);
    const result = writeCart(items);
    window.XIQI_ANALYTICS?.send("add_to_inquiry", item.product_id);
    return result;
  }

  function updateQuantity(id, quantity) {
    const items = readCart();
    const item = items.find((entry) => entry.product_id === String(id));
    if (!item) return items;
    item.quantity = Math.min(MAX_QUANTITY, Math.max(1, Number(quantity) || 1));
    return writeCart(items);
  }

  function remove(id) { return writeCart(readCart().filter((item) => item.product_id !== String(id))); }
  function clear() { return writeCart([]); }
  function count() { return readCart().length; }

  function updateBadges() {
    document.querySelectorAll("[data-inquiry-cart-count]").forEach((node) => {
      node.textContent = String(count());
    });
  }

  function renderCartPage() {
    const root = document.querySelector("[data-inquiry-cart-page]");
    if (!root) return;
    const items = readCart();
    const list = root.querySelector("[data-cart-items]");
    const empty = root.querySelector("[data-cart-empty]");
    const submit = root.querySelector("[data-cart-submit]");
    if (!items.length) {
      list.innerHTML = "";
      empty.hidden = false;
      submit.disabled = true;
      return;
    }
    empty.hidden = true;
    submit.disabled = false;
    list.innerHTML = items.map((item) => `
      <article class="inquiry-cart-item" data-cart-id="${escapeAttribute(item.product_id)}">
        <img src="${escapeAttribute(item.product_image || "images/phone-case.webp")}" alt="${escapeAttribute(item.product_name)}" loading="lazy" onerror="this.onerror=null;this.src='images/phone-case.webp';">
        <div class="inquiry-cart-item-main"><h2>${escapeHtml(item.product_name)}</h2><p>Product ID: ${escapeHtml(item.product_id)}</p>${item.sku ? `<p>SKU: ${escapeHtml(item.sku)}</p>` : ""}</div>
        <div class="inquiry-cart-quantity"><button type="button" data-cart-action="decrease" aria-label="Decrease quantity">−</button><input type="number" min="1" max="${MAX_QUANTITY}" value="${item.quantity}" data-cart-action="quantity"><button type="button" data-cart-action="increase" aria-label="Increase quantity">+</button></div>
        <button class="inquiry-cart-remove" type="button" data-cart-action="remove">Remove</button>
      </article>`).join("");
  }

  function bindCartPage() {
    const root = document.querySelector("[data-inquiry-cart-page]");
    if (!root) return;
    root.addEventListener("click", (event) => {
      const control = event.target.closest("[data-cart-action]");
      if (!control) return;
      const item = control.closest("[data-cart-id]");
      const id = item?.dataset.cartId;
      const current = readCart().find((entry) => entry.product_id === id)?.quantity || 1;
      if (control.dataset.cartAction === "remove") remove(id);
      if (control.dataset.cartAction === "increase") updateQuantity(id, current + 1);
      if (control.dataset.cartAction === "decrease") current > 1 ? updateQuantity(id, current - 1) : remove(id);
      if (control.dataset.cartAction === "quantity") updateQuantity(id, control.value);
      renderCartPage();
    });
    root.querySelector("[data-cart-clear]")?.addEventListener("click", () => {
      if (window.confirm("Clear all inquiry cart items?")) { clear(); renderCartPage(); }
    });
    root.querySelector("[data-cart-form]")?.addEventListener("submit", submitCartInquiry);
    renderCartPage();
  }

  async function submitCartInquiry(event) {
    event.preventDefault();
    const form = event.currentTarget;
    const items = readCart();
    if (!items.length) return;
    const button = form.querySelector("[data-cart-submit]");
    const status = form.querySelector("[data-cart-status]");
    if (button.disabled || !form.reportValidity()) return;
    button.disabled = true;
    status.textContent = "Sending inquiry...";
    const data = {
      name: form.name.value.trim(), email: form.email.value.trim(), whatsapp: form.whatsapp.value.trim(),
      product: items.map((item) => item.product_name).join(", "),
      message: form.message.value.trim(), cart_items: items, analytics: window.XIQI_ANALYTICS?.context?.()
    };
    const conversionToken = {};
    try {
      const response = await fetch("/api/send-inquiry", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(data) });
      const result = await response.json().catch(() => ({}));
      if (!response.ok || result.ok !== true) throw new Error(result.error || "Failed to send inquiry.");
      if (result.emailSuppressed !== true) { try { window.XIQI_REPORT_GOOGLE_ADS_CONVERSION?.(conversionToken); } catch { /* Optional tracking. */ } }
      clear(); form.reset(); renderCartPage(); status.textContent = "Inquiry sent successfully.";
    } catch (error) {
      status.textContent = error.message || "Failed to send inquiry.";
      button.disabled = false;
    }
  }

  function escapeHtml(value) { return String(value || "").replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#039;"); }
  function escapeAttribute(value) { return escapeHtml(window.XIQI_MEDIA_TEXT(value)); }

  window.XIQI_INQUIRY_CART = { read: readCart, add, updateQuantity, remove, clear, count, refresh: updateBadges };
  document.addEventListener("DOMContentLoaded", () => { updateBadges(); bindCartPage(); });
  document.addEventListener("xiqi:inquiry-cart-updated", () => { updateBadges(); renderCartPage(); });
})();
