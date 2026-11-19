(function () {
  const states = new WeakMap();
  const queue = new Set();
  const cache = new Map();
  let timer;
  function current(node) {
    const direct = node.getAttribute('src');
    if (direct || node.tagName !== 'VIDEO') return direct;
    const sources = node.querySelectorAll('source');
    return sources.length === 1 ? sources[0].getAttribute('src') : null;
  }
  function enqueue(node) {
    if (node.tagName === 'SOURCE') node = node.closest('video');
    if (!node) return;
    const legacy = current(node);
    if (!legacy || !legacy.includes('/storage/v1/object/public/')) return;
    let state = states.get(node);
    if (!state) { state = { originalError: node.onerror, failed: new Set(), queued: null }; states.set(node, state); }
    if (state.failed.has(legacy) || state.queued === legacy) return;
    state.queued = legacy;
    queue.add(node);
    clearTimeout(timer);
    timer = setTimeout(resolve, 50);
  }
  function apply(node, legacy, primary) {
    const state = states.get(node);
    if (!primary || current(node) !== legacy || state.failed.has(legacy)) return;
    if (node.tagName !== 'VIDEO' && (node.srcset || node.closest?.('picture'))) return;
    const video = node.tagName === 'VIDEO';
    const originalSrc = node.getAttribute('src');
    const position = video ? node.currentTime || 0 : 0;
    const wasPlaying = video && !node.paused;
    node.onerror = function (event) {
      if (node.getAttribute('src') !== primary) {
        if (state.originalError) state.originalError.call(node, event);
        return;
      }
      state.failed.add(legacy);
      node.onerror = state.originalError;
      if (video && originalSrc == null) node.removeAttribute('src');
      else node.src = legacy;
      if (video) {
        node.addEventListener('loadedmetadata', () => {
          if (current(node) === legacy && position) { try { node.currentTime = position; } catch {} }
        }, { once: true });
        node.load();
        if (wasPlaying) node.play().catch(() => {});
      }
    };
    node.src = primary;
    if (video) {
      node.addEventListener('loadedmetadata', () => {
        if (node.getAttribute('src') === primary && position) { try { node.currentTime = position; } catch {} }
      }, { once: true });
      node.load();
      if (wasPlaying) node.play().catch(() => {});
    }
  }
  async function resolve() {
    const nodes = [...queue]; queue.clear();
    for (let offset = 0; offset < nodes.length; offset += 50) {
      const batch = nodes.slice(offset, offset + 50).map(node => ({ node, legacy: current(node) }));
      try {
        const missing = [...new Set(batch.map(item => item.legacy).filter(url => !cache.has(url)))];
        if (missing.length) {
          const response = await fetch('/api/media-resolve', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ urls: missing }) });
          if (!response.ok) continue;
          const result = await response.json();
          for (const url of missing) cache.set(url, result.mappings?.[url] || null);
        }
        for (const { node, legacy } of batch) apply(node, legacy, cache.get(legacy));
      } catch {}
    }
  }
  const observer = new MutationObserver(changes => {
    for (const change of changes) {
      if (change.type === 'attributes') enqueue(change.target);
      for (const node of change.addedNodes || []) if (node.nodeType === 1) {
        if (node.matches('img,video,source')) enqueue(node);
        node.querySelectorAll('img,video,source').forEach(enqueue);
      }
    }
  });
  observer.observe(document.documentElement, { childList: true, subtree: true, attributes: true, attributeFilter: ['src'] });
  document.querySelectorAll('img,video').forEach(enqueue);
})();
