function toggleMenu() {
  const nav = document.getElementById("nav") || document.querySelector(".nav");
  if (nav) nav.classList.toggle("active");
}

(function () {
  const revealItems = () => {
    const reveals = document.querySelectorAll(".reveal");
    const windowHeight = window.innerHeight;

    reveals.forEach((item) => {
      const revealTop = item.getBoundingClientRect().top;
      if (revealTop < windowHeight - 100) item.classList.add("active");
    });
  };

  let ticking = false;
  window.addEventListener("scroll", () => {
    if (ticking) return;
    ticking = true;
    window.requestAnimationFrame(() => {
      revealItems();
      ticking = false;
    });
  }, { passive: true });

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", revealItems);
  } else {
    revealItems();
  }
})();