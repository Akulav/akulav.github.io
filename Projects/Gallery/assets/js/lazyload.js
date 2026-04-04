/*!
 * LazyLoad utilities for Prompt Vault
 * - Works without modules/bundlers
 * - Provides horizontal-strip aware IntersectionObservers
 * - Exposes PV.Lazy global with helpers
 */
(function () {
  const PV = (window.PV = window.PV || {});

  // ------- tiny helpers
  function setIntrinsicSize(img, w, h) {
    if (!img.hasAttribute('width')) img.width = w;
    if (!img.hasAttribute('height')) img.height = h;
  }

  // Build an observer for a given root (null = viewport)
  function makeObserver({ root, rootMargin, threshold }) {
    return new IntersectionObserver(
      (entries, io) => {
        for (const e of entries) {
          if (!e.isIntersecting) continue;
          const img = e.target;
          const src = img.dataset.src;
          if (src) {
            img.src = src;
            img.removeAttribute('data-src');
          }
          // Ensure async decode, but don’t block layout
          img.decoding = 'async';
          io.unobserve(img);
        }
      },
      { root, rootMargin, threshold }
    );
  }

  // Preload via <link rel="prefetch"> (safe, low priority)
  function prefetchURL(url) {
    if (!url) return;
    const link = document.createElement('link');
    link.rel = 'prefetch';
    link.href = url;
    document.head.appendChild(link);
  }

  // ------- Public API
  const Lazy = {
    /** Observer for grid/card images (vertical scroll) */
    cardObserver: null,
    /** Observer for detail horizontal strip (root = #detailThumbs) */
    thumbObserver: null,
    /** Root node cached */
    thumbRoot: null,

    /** Init or re-init the card observer */
    ensureCardObserver() {
      if (this.cardObserver) return this.cardObserver;
      this.cardObserver = makeObserver({
        root: null,
        rootMargin: '800px 0px', // prefetch well before entering viewport
        threshold: 0.01,
      });
      return this.cardObserver;
    },

    /** Init or re-init the thumb observer (root = strip) */
    ensureThumbObserver(rootEl) {
      if (rootEl && this.thumbRoot !== rootEl) {
        this.thumbObserver?.disconnect?.();
        this.thumbRoot = rootEl;
        this.thumbObserver = null;
      }
      if (!this.thumbObserver) {
        this.thumbObserver = makeObserver({
          root: this.thumbRoot,
          rootMargin: '0px 800px', // prefetch off-screen left/right
          threshold: 0.01,
        });
      }
      return this.thumbObserver;
    },

    /** Observe a card/grid <img data-src> */
    observeCardImage(img, { priority = 'low', width, height } = {}) {
      try {
        this.ensureCardObserver();
        if (width && height) setIntrinsicSize(img, width, height);
        img.loading = 'lazy';
        img.decoding = 'async';
        if (priority && 'fetchPriority' in img) {
          img.fetchPriority = priority;
        }
        this.cardObserver.observe(img);
      } catch {}
    },

    /** Observe a detail thumb <img data-src> */
    observeThumbImage(img, { stripRoot, priority = 'low', width = 110, height = 110 } = {}) {
      try {
        this.ensureThumbObserver(stripRoot);
        setIntrinsicSize(img, width, height);
        img.loading = 'lazy';
        img.decoding = 'async';
        if (priority && 'fetchPriority' in img) {
          img.fetchPriority = priority;
        }
        this.thumbObserver.observe(img);
      } catch {}
    },

    /** Promote the hero image aggressively */
    prioritizeHero(img) {
      if (!img) return;
      img.loading = 'eager';
      img.decoding = 'async';
      if ('fetchPriority' in img) img.fetchPriority = 'high';
    },

    /** Prefetch surrounding src URLs (use on selection change) */
    prefetchNeighbors(container, activeIndex, radius = 2) {
      if (!container) return;
      const imgs = Array.from(container.querySelectorAll('img'));
      for (let j = activeIndex - radius; j <= activeIndex + radius; j++) {
        if (j === activeIndex || j < 0 || j >= imgs.length) continue;
        const el = imgs[j];
        const src = el?.dataset?.src || el?.currentSrc || el?.src;
        prefetchURL(src);
      }
    },
  };

  PV.Lazy = Lazy;
})();
