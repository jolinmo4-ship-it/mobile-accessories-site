function toggleMenu() {
  const nav = document.getElementById("nav") || document.querySelector(".nav");
  if (nav) nav.classList.toggle("active");
}

(function () {
  const initHeroSlider = () => {
    const slides = Array.from(document.querySelectorAll(".hero-slide"));
    if (slides.length < 2) return;

    let activeIndex = slides.findIndex((slide) => slide.classList.contains("is-active"));
    if (activeIndex < 0) activeIndex = 0;

    window.setInterval(() => {
      slides[activeIndex].classList.remove("is-active");
      activeIndex = (activeIndex + 1) % slides.length;
      slides[activeIndex].classList.add("is-active");
    }, 5200);
  };

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
    document.addEventListener("DOMContentLoaded", () => {
      initHeroSlider();
      revealItems();
    });
  } else {
    initHeroSlider();
    revealItems();
  }
})();
