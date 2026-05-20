(function () {
  const languages = {
    en: { label: "EN", google: "en", htmlLang: "en", dir: "ltr" },
    fr: { label: "FR", google: "fr", htmlLang: "fr", dir: "ltr" },
    es: { label: "ES", google: "es", htmlLang: "es", dir: "ltr" },
    mx: { label: "MX", google: "es", htmlLang: "es-MX", dir: "ltr" },
    ar: { label: "AR", google: "ar", htmlLang: "ar", dir: "rtl" }
  };

  const storageKey = "xiqi-language";
  let pendingLanguage = null;
  let translateRetryCount = 0;
  const maxTranslateRetries = 12;

  window.googleTranslateElementInit = function () {
    if (!window.google || !window.google.translate) return;

    try {
      new window.google.translate.TranslateElement({
        pageLanguage: "en",
        includedLanguages: "en,fr,es,ar",
        autoDisplay: false
      }, "google_translate_element");

      window.setTimeout(() => applyStoredLanguage(), 400);
    } catch (error) {
      console.warn("Google Translate initialization failed.", error);
    }
  };

  document.addEventListener("DOMContentLoaded", () => {
    buildLanguageSwitcher();
    syncMenuButton();
    applyLanguageShell(getStoredLanguage());
    loadGoogleTranslate();
  });

  function buildLanguageSwitcher() {
    const navs = document.querySelectorAll(".nav");
    navs.forEach((nav) => {
      if (nav.querySelector(".language-switcher")) return;

      const switcher = document.createElement("div");
      switcher.className = "language-switcher notranslate";
      switcher.setAttribute("translate", "no");
      switcher.setAttribute("aria-label", "Language selector");

      Object.entries(languages).forEach(([code, language]) => {
        const button = document.createElement("button");
        button.type = "button";
        button.className = "language-option";
        button.dataset.lang = code;
        button.textContent = language.label;
        button.setAttribute("aria-label", getLanguageName(code));
        button.addEventListener("click", () => selectLanguage(code));
        switcher.appendChild(button);
      });

      nav.appendChild(switcher);
    });

    let translateRoot = document.getElementById("google_translate_element");
    if (!translateRoot) {
      translateRoot = document.createElement("div");
      translateRoot.id = "google_translate_element";
      translateRoot.className = "google-translate-shell notranslate";
      translateRoot.setAttribute("translate", "no");
      document.body.appendChild(translateRoot);
    }

    updateActiveButton(getStoredLanguage());
  }

  function syncMenuButton() {
    const header = document.querySelector(".header");
    const nav = document.querySelector(".nav");
    if (!header || !nav) return;

    if (!nav.id) nav.id = "nav";

    let button = header.querySelector(".menu-btn");
    if (!button) {
      button = document.createElement("button");
      button.type = "button";
      button.className = "menu-btn";
      button.setAttribute("aria-label", "Open menu");
      button.innerHTML = "<span></span><span></span><span></span>";
      header.appendChild(button);
    }

    if (button.dataset.menuReady) return;
    button.dataset.menuReady = "true";

    button.addEventListener("click", () => nav.classList.toggle("active"));
    button.addEventListener("keydown", (event) => {
      if (event.key === "Enter" || event.key === " ") {
        event.preventDefault();
        nav.classList.toggle("active");
      }
    });
  }

  function selectLanguage(code) {
    if (!languages[code]) return;

    setStoredLanguage(code);
    applyLanguageShell(code);
    updateActiveButton(code);
    applyGoogleLanguage(code);
    document.documentElement.classList.add("language-is-changing");
    window.setTimeout(() => document.documentElement.classList.remove("language-is-changing"), 650);
  }

  function applyStoredLanguage() {
    applyGoogleLanguage(getStoredLanguage());
  }

  function applyGoogleLanguage(code) {
    const language = languages[code] || languages.en;
    pendingLanguage = language.google;
    setTranslateCookie(language.google);

    const combo = document.querySelector(".goog-te-combo");
    if (!combo) {
      if (translateRetryCount >= maxTranslateRetries) return;
      translateRetryCount += 1;
      window.setTimeout(() => {
        if (pendingLanguage === language.google) applyGoogleLanguage(code);
      }, 500);
      return;
    }

    translateRetryCount = 0;

    if (combo.value !== language.google) {
      combo.value = language.google;
      combo.dispatchEvent(new Event("change"));
    }
  }

  function setTranslateCookie(languageCode) {
    const value = languageCode === "en" ? "/en/en" : `/en/${languageCode}`;
    const maxAge = 60 * 60 * 24 * 365;

    try {
      document.cookie = `googtrans=${value}; path=/; max-age=${maxAge}`;
      if (location.hostname && location.hostname.includes(".")) {
        document.cookie = `googtrans=${value}; path=/; domain=${location.hostname}; max-age=${maxAge}`;
      }
    } catch (error) {
      console.warn("Unable to set Google Translate cookie.", error);
    }
  }

  function applyLanguageShell(code) {
    const language = languages[code] || languages.en;
    document.documentElement.lang = language.htmlLang;
    document.documentElement.dir = language.dir;
    if (document.body) document.body.classList.toggle("is-rtl", language.dir === "rtl");
  }

  function updateActiveButton(code) {
    document.querySelectorAll(".language-option").forEach((button) => {
      const isActive = button.dataset.lang === code;
      button.classList.toggle("is-active", isActive);
      button.setAttribute("aria-pressed", String(isActive));
    });
  }

  function getStoredLanguage() {
    try {
      const value = localStorage.getItem(storageKey);
      return languages[value] ? value : "en";
    } catch {
      return "en";
    }
  }

  function setStoredLanguage(code) {
    try {
      localStorage.setItem(storageKey, code);
    } catch {
      // Storage can be unavailable in strict privacy modes; the visible switch still works for this page.
    }
  }

  function getLanguageName(code) {
    return {
      en: "English",
      fr: "Francais",
      es: "Espanol",
      mx: "Espanol Mexico",
      ar: "Arabic"
    }[code] || "English";
  }

  function loadGoogleTranslate() {
    if (document.querySelector('script[data-google-translate="true"]')) return;

    const script = document.createElement("script");
    script.src = "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    script.defer = true;
    script.dataset.googleTranslate = "true";
    script.onerror = () => console.warn("Google Translate script failed to load.");
    document.body.appendChild(script);
  }
})();