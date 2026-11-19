const nodemailer = require("nodemailer");

module.exports = async function handler(req, res) {
  console.log("POST /api/send-inquiry received");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
  }

  if (process.env.VERCEL_ENV === "preview") {
    return require('../server/acceptance-inquiry').handle(req,res,{getClient(){
      const {createClient}=require('@supabase/supabase-js');
      const key=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY;
      if(!key)throw Error('PUBLIC_DATABASE_CONFIG_REQUIRED');
      return createClient(process.env.SUPABASE_URL,key,{global:{headers:{Authorization:req.headers?.authorization||''}},auth:{persistSession:false,autoRefreshToken:false}});
    }});
  }

  const smtpUser = process.env.SMTP_USER;
  const smtpPass = process.env.SMTP_PASS;
  const notifyTo = process.env.SMTP_TO || smtpUser;

  if (!smtpUser || !smtpPass) {
    console.error("SMTP environment variables missing.");
    res.status(500).json({ error: "SMTP environment variables are not configured." });
    return;
  }

  const inquiry = req.body || {};
  let cartItems = [];
  if (Object.prototype.hasOwnProperty.call(inquiry, "cart_items")) {
    try {
      cartItems = await validateCartItems(inquiry.cart_items);
    } catch (error) {
      res.status(error.statusCode || 400).json({ error: error.message || "Invalid inquiry cart." });
      return;
    }
  }
  if (cartItems.length) {
    try {
      await saveValidatedCartInquiry(inquiry, cartItems);
    } catch (error) {
      res.status(error.statusCode || 503).json({ error: error.message || "Inquiry could not be saved." });
      return;
    }
  }
  const submittedAt = inquiry.submitted_at || new Date().toLocaleString("en-US", {
    timeZone: "Asia/Shanghai"
  });

  // Preserve non-cart email fallback while moving the former browser INSERT server-side.
  let savedToDatabase=cartItems.length>0;
  if(!cartItems.length){try{
    const base=process.env.SUPABASE_URL||process.env.XIQI_SUPABASE_URL;
    const key=process.env.SUPABASE_ANON_KEY||process.env.SUPABASE_PUBLISHABLE_KEY||process.env.SUPABASE_SERVICE_ROLE_KEY;
    if(base&&key){const saved=await fetch(new URL('/rest/v1/inquiries',base),{method:'POST',headers:{apikey:key,Authorization:`Bearer ${key}`,'Content-Type':'application/json',Prefer:'return=minimal'},body:JSON.stringify([{name:safeText(inquiry.name),email:safeText(inquiry.email),whatsapp:safeText(inquiry.whatsapp),product:safeText(inquiry.product),message:safeText(inquiry.message)}]),signal:AbortSignal.timeout(8000)});savedToDatabase=saved.ok;}
  }catch{/* Email fallback remains available if persistence is unavailable. */}}

  try {
    const transporter = nodemailer.createTransport({
      host: process.env.SMTP_HOST || "smtp.163.com",
      port: Number(process.env.SMTP_PORT || 465),
      secure: true,
      connectionTimeout: 8000,
      greetingTimeout: 8000,
      socketTimeout: 10000,
      auth: {
        user: smtpUser,
        pass: smtpPass
      }
    });

    await transporter.sendMail({
      from: `"XiQi Website" <${smtpUser}>`,
      to: notifyTo,
      subject: `New Inquiry - ${safeText(inquiry.product) || "XiQi Website"}`,
      text: buildTextEmail(inquiry, submittedAt, cartItems),
      html: buildHtmlEmail(inquiry, submittedAt, cartItems)
    });

    await recordAnalyticsInquiry(inquiry);

    console.log("Inquiry email sent.");
    res.status(200).json({ ok: true, savedToDatabase });
  } catch (error) {
    console.error("Inquiry email failed:", error);
    res.status(500).json({ error: error.message || "Failed to send inquiry email." });
  }
};

async function recordAnalyticsInquiry(inquiry) {
  const context = inquiry?.analytics;
  if (!context || !context.session_id) return;
  const baseUrl = process.env.SUPABASE_URL || process.env.XIQI_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) return;
  const row = { event_type: "inquiry_submit", session_id: String(context.session_id).slice(0, 128), campaign: safeText(context.campaign).slice(0, 200) || null, source: safeText(context.source).slice(0, 100) || null, medium: safeText(context.medium).slice(0, 100) || null, product_id: null };
  if (!/^[a-zA-Z0-9_-]{16,128}$/.test(row.session_id)) return;
  try { await fetch(new URL("/rest/v1/analytics_events", baseUrl), { method: "POST", headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" }, body: JSON.stringify([row]) }); } catch { /* analytics must never block inquiry success */ }
}

function buildTextEmail(inquiry, submittedAt, cartItems) {
  return [
    "New inquiry from XiQi website",
    "",
    `Name: ${safeText(inquiry.name)}`,
    `Email: ${safeText(inquiry.email)}`,
    `WhatsApp: ${safeText(inquiry.whatsapp)}`,
    `Product: ${safeText(inquiry.product)}`,
    `Time: ${submittedAt}`,
    "",
    ...(cartItems.length ? ["", "Requested products:", ...cartItems.map((item) => `- ${item.product_name} x ${item.quantity} (ID: ${item.product_id})${item.category ? `, Category: ${item.category}` : ""}${item.note ? `, Note: ${item.note}` : ""}`)] : []),
    "",
    "Message:",
    safeText(inquiry.message)
  ].join("\n");
}

function buildHtmlEmail(inquiry, submittedAt, cartItems) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2>New inquiry from XiQi website</h2>
      <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(inquiry.whatsapp)}</p>
      <p><strong>Product:</strong> ${escapeHtml(inquiry.product)}</p>
      <p><strong>Time:</strong> ${escapeHtml(submittedAt)}</p>
      ${cartItems.length ? `<p><strong>Requested products:</strong></p><div>${cartItems.map((item) => { const image = safeImageUrl(item.product_image); return `<div style="display:flex;gap:12px;align-items:flex-start;margin:0 0 14px;padding:10px;border:1px solid #dbeafe;border-radius:8px">${image ? `<img src="${escapeHtml(image)}" alt="${escapeHtml(item.product_name)}" width="88" style="width:88px;max-width:88px;height:auto;object-fit:contain;border-radius:6px">` : ""}<div><strong>${escapeHtml(item.product_name)}</strong><br><span>Product ID: ${escapeHtml(item.product_id)}</span>${item.category ? `<br><span>Category: ${escapeHtml(item.category)}</span>` : ""}<br><span>Quantity: ${item.quantity}</span>${item.note ? `<br><span>Note: ${escapeHtml(item.note)}</span>` : ""}</div></div>`; }).join("")}</div>` : ""}
      <p><strong>Message:</strong></p>
      <div style="padding:12px 14px;background:#f8fbff;border:1px solid #dbeafe;border-radius:8px">
        ${escapeHtml(inquiry.message).replace(/\n/g, "<br>")}
      </div>
    </div>
  `;
}

function normalizeCartItems(value) {
  if (!Array.isArray(value)) throw new ValidationError("Inquiry cart must be an array.");
  if (value.length > 100) throw new ValidationError("Inquiry cart contains too many products.");
  return value.slice(0, 100).map((item) => ({
    product_id: safeText(item?.product_id).slice(0, 200),
    quantity: Number(item?.quantity),
    note: safeText(item?.note).slice(0, 1000)
  })).map((item) => {
    if (!item.product_id || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 9999) {
      throw new ValidationError("Inquiry cart contains an invalid product or quantity.");
    }
    return item;
  });
}

function safeImageUrl(value) {
  const image = safeText(value);
  try { const url = new URL(image); return /^https?:$/.test(url.protocol) ? url.href : ""; } catch { return ""; }
}

async function validateCartItems(value) {
  const submittedItems = normalizeCartItems(value);
  if (!submittedItems.length) throw new ValidationError("Inquiry cart cannot be empty.");

  const ids = [...new Set(submittedItems.map((item) => item.product_id))];
  const baseUrl = process.env.SUPABASE_URL || process.env.XIQI_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!baseUrl || !key) throw new ValidationError("Inquiry cart verification is temporarily unavailable.", 503);

  const url = new URL("/rest/v1/products", baseUrl);
  url.searchParams.set("select", "id,name,image_url,category,status");
  url.searchParams.set("id", `in.(${ids.map(encodeURIComponent).join(",")})`);
  url.searchParams.set("status", "eq.published");
  const response = await fetch(url, { headers: { apikey: key, Authorization: `Bearer ${key}` } });
  if (!response.ok) throw new ValidationError("Inquiry cart verification is temporarily unavailable.", 503);
  const products = await response.json();
  const productMap = new Map((Array.isArray(products) ? products : []).map((product) => [String(product.id), product]));
  if (productMap.size !== ids.length) throw new ValidationError("One or more products are no longer available.");

  return submittedItems.map((item) => {
    const product = productMap.get(item.product_id);
    return {
      product_id: String(product.id), product_name: safeText(product.name).slice(0, 300),
      product_image: safeText(product.image_url).slice(0, 1000),
      category: safeText(product.category).slice(0, 200), quantity: item.quantity, note: item.note
    };
  });
}

async function saveValidatedCartInquiry(inquiry, cartItems) {
  const baseUrl = process.env.SUPABASE_URL || process.env.XIQI_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const table = process.env.SUPABASE_INQUIRIES_TABLE || "inquiries";
  if (!baseUrl || !key) throw new ValidationError("Inquiry database is temporarily unavailable.", 503);
  const response = await fetch(new URL(`/rest/v1/${table}`, baseUrl), {
    method: "POST",
    headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json", Prefer: "return=minimal" },
    body: JSON.stringify([{ name: safeText(inquiry.name), email: safeText(inquiry.email), whatsapp: safeText(inquiry.whatsapp), product: safeText(inquiry.product), message: safeText(inquiry.message), cart_items: cartItems }])
  });
  if (!response.ok) throw new ValidationError("Inquiry could not be saved.", 503);
}

class ValidationError extends Error {
  constructor(message, statusCode = 400) { super(message); this.statusCode = statusCode; }
}

function safeText(value) {
  return typeof value === "string" ? value.trim() : "";
}

function escapeHtml(value) {
  return safeText(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}
