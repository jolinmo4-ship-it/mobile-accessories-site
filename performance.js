document.addEventListener("DOMContentLoaded", () => {
  document.querySelectorAll("img").forEach((image) => {
    if (!image.hasAttribute("loading")) image.setAttribute("loading", "lazy");
    if (!image.hasAttribute("decoding")) image.setAttribute("decoding", "async");
  });

  document.querySelectorAll("video").forEach((video) => {
    if (!video.hasAttribute("preload")) video.setAttribute("preload", "metadata");
  });
});
