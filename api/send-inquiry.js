const nodemailer = require("nodemailer");

module.exports = async function handler(req, res) {
  console.log("POST /api/send-inquiry received");

  if (req.method !== "POST") {
    res.setHeader("Allow", "POST");
    res.status(405).json({ error: "Method not allowed" });
    return;
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
  const submittedAt = inquiry.submitted_at || new Date().toLocaleString("en-US", {
    timeZone: "Asia/Shanghai"
  });

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
      text: buildTextEmail(inquiry, submittedAt),
      html: buildHtmlEmail(inquiry, submittedAt)
    });

    console.log("Inquiry email sent.");
    res.status(200).json({ ok: true });
  } catch (error) {
    console.error("Inquiry email failed:", error);
    res.status(500).json({ error: error.message || "Failed to send inquiry email." });
  }
};

function buildTextEmail(inquiry, submittedAt) {
  return [
    "New inquiry from XiQi website",
    "",
    `Name: ${safeText(inquiry.name)}`,
    `Email: ${safeText(inquiry.email)}`,
    `WhatsApp: ${safeText(inquiry.whatsapp)}`,
    `Product: ${safeText(inquiry.product)}`,
    `Time: ${submittedAt}`,
    "",
    "Message:",
    safeText(inquiry.message)
  ].join("\n");
}

function buildHtmlEmail(inquiry, submittedAt) {
  return `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#0f172a">
      <h2>New inquiry from XiQi website</h2>
      <p><strong>Name:</strong> ${escapeHtml(inquiry.name)}</p>
      <p><strong>Email:</strong> ${escapeHtml(inquiry.email)}</p>
      <p><strong>WhatsApp:</strong> ${escapeHtml(inquiry.whatsapp)}</p>
      <p><strong>Product:</strong> ${escapeHtml(inquiry.product)}</p>
      <p><strong>Time:</strong> ${escapeHtml(submittedAt)}</p>
      <p><strong>Message:</strong></p>
      <div style="padding:12px 14px;background:#f8fbff;border:1px solid #dbeafe;border-radius:8px">
        ${escapeHtml(inquiry.message).replace(/\n/g, "<br>")}
      </div>
    </div>
  `;
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
