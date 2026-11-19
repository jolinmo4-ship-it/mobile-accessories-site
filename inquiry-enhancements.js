document.addEventListener("DOMContentLoaded", () => {
  const form = document.getElementById("inquiryForm");

  if (!form || form.dataset.inquiryBound) return;
  form.dataset.inquiryBound = "true";


  const button = form.querySelector('button[type="submit"]');
  const status = document.createElement("div");
  const productInput = form.querySelector('[name="product"]');
  const productFromUrl = new URLSearchParams(window.location.search).get("product");

  if (!button) return;

  status.className = "form-status";
  status.setAttribute("role", "status");
  status.setAttribute("aria-live", "polite");
  button.insertAdjacentElement("afterend", status);

  if (productInput && productFromUrl) {
    productInput.value = productFromUrl;
  }

  form.addEventListener("submit", async (event) => {
    event.preventDefault();

    if (button.disabled || !form.reportValidity()) return;

    setLoading(button, true);
    setStatus(status, "Sending your inquiry...", "");

    const data = {
      name: clean(form.name?.value),
      email: clean(form.email?.value),
      whatsapp: clean(form.whatsapp?.value),
      product: clean(form.product?.value),
      message: clean(form.message?.value)
    };

    try {
      const conversionToken = {};
      const result = await sendInquiryEmail(data);
      const savedToDatabase = result.savedToDatabase === true;
      if (result.emailSuppressed !== true) { try { window.XIQI_REPORT_GOOGLE_ADS_CONVERSION?.(conversionToken); } catch { /* Optional tracking. */ } }
      form.reset();

      setStatus(
        status,
        savedToDatabase
          ? "Inquiry submitted successfully. We will reply within 24 hours."
          : "Inquiry sent successfully. We will reply within 24 hours.",
        "success"
      );
    } catch (error) {
      console.warn("Inquiry submission failed.", error);

      setStatus(
        status,
        `Submission failed: ${error.message || "Please try again or contact us on WhatsApp."}`,
        "error"
      );
    } finally {
      setLoading(button, false);
    }
  });
});

function setLoading(button, isLoading) {
  button.disabled = isLoading;
  button.classList.toggle("is-loading", isLoading);
  button.textContent = isLoading ? "Sending..." : "Send Inquiry";
}

function setStatus(status, message, type) {
  status.textContent = message;
  status.className = `form-status ${type}`.trim();
}

function clean(value) {
  return typeof value === "string" ? value.trim() : "";
}

function withTimeout(promise, timeoutMs, message) {
  return Promise.race([
    promise,
    new Promise((_, reject) => {
      window.setTimeout(() => reject(new Error(message)), timeoutMs);
    })
  ]);
}

async function sendInquiryEmail(data) {
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 10000);

  try {
    const response = await fetch("/api/send-inquiry", {
      method: "POST",
      headers: {
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        ...data,
        analytics: window.XIQI_ANALYTICS?.context?.(),
        submitted_at: new Date().toLocaleString()
      }),
      signal: controller.signal
    });

    let result = {};

    try {
      result = await response.json();
    } catch {
      result = {};
    }

    if (!response.ok || result.ok !== true) {
      throw new Error(result.error || `Inquiry email API failed with status ${response.status}`);
    }

    return result;
  } catch (error) {
    if (error.name === "AbortError") {
      throw new Error("Inquiry email API timed out.");
    }
    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}
