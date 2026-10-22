// Motion layer for the BetterPitch theme (colours live in theme.css), built on
// GSAP and Motion (Framer Motion's DOM engine), both vendored in ./vendor and
// loaded from here once the page has loaded. Injected into every HTML page.
//
// Ground rules, so the recorded site keeps its exact structure and flow:
// - nothing recorded is moved, removed or re-ordered, and no text changes;
// - effects use opacity / transform / translate / clip-path / filter /
//   backgrounds only, so layout never reflows;
// - elements the page already animates itself are left alone;
// - added DOM is purely decorative and aria-hidden (curtain, progress bar,
//   confetti layer, one floating-shapes layer per section);
// - headings split into letters for their reveal get their original text
//   nodes back as soon as the animation ends, so React's nodes are untouched.
// Like content.js it waits for React to hydrate before touching the page.
(function () {
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  const fine = matchMedia('(hover: hover) and (pointer: fine)').matches;
  let gsap, M, motion = false; // set once the libraries are in (start)
  const COLORS = ['#ff6b5e', '#ff9a3d', '#c4f042', '#2f5bff', '#b69cff'];

  function style(css) {
    const s = document.createElement('style');
    s.textContent = css;
    document.head.appendChild(s);
    return s;
  }
  // Keep the page under wraps until the entrance curtain is in place.
  // Arriving from an in-site link that did a full page load: the exit curtain
  // was closing over the old page, so keep the colour bands up (as a pseudo-
  // element, which React's hydration can't see) until the entrance lifts them.
  const NAV_KEY = 'bp-curtain';
  const store = (k, v) => { try { v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v); } catch {} };
  let fromNav = false;
  try { fromNav = Date.now() - (+sessionStorage.getItem(NAV_KEY) || 0) < 6000; } catch {}
  store(NAV_KEY, null);
  const hold = reduce ? null : style('#page-scroller{opacity:0!important}' + (fromNav
    ? 'html::after{content:"";position:fixed;inset:0;z-index:10000;pointer-events:none;background:linear-gradient(90deg,#ff6b5e 0 20%,#ff9a3d 0 40%,#c4f042 0 60%,#2f5bff 0 80%,#b69cff 0)}' : ''));

  // Added after the load event rather than as page scripts, and queued behind
  // the idle callbacks Next uses for its lazyOnload scripts (the chat widget),
  // so the page's own start-up is unchanged.
  const idle = window.requestIdleCallback || (f => setTimeout(f, 1));
  let libs = null;
  function loadLibs() {
    if (reduce) return Promise.resolve();
    return libs ||= Promise.all(['gsap.min.js', 'motion.js'].map(f => new Promise(done => {
      const s = document.createElement('script');
      s.src = '/__bp/vendor/' + f;
      s.onload = s.onerror = done;
      document.head.appendChild(s);
    })));
  }

  const scroller = () => document.getElementById('page-scroller') || document.scrollingElement;

  // Like Motion's inView, but every element with the same options shares one
  // IntersectionObserver (inView makes one per call, and this page watches ~100
  // elements). enter() may return a function, called when the element leaves,
  // and is then called again on the next entry; otherwise it runs once.
  const observers = new Map();
  function watch(el, enter, { margin = '0px', amount = 0 } = {}) {
    const key = margin + '|' + amount;
    let o = observers.get(key);
    if (!o) {
      const handlers = new Map(), leaves = new Map();
      const io = new IntersectionObserver(entries => {
        for (const e of entries) {
          const t = e.target;
          if (e.isIntersecting) {
            if (leaves.has(t) || !handlers.has(t)) continue;
            const keep = [], ls = [];
            for (const f of handlers.get(t)) {
              const leave = f(e);
              if (typeof leave === 'function') { keep.push(f); ls.push(leave); }
            }
            if (keep.length) { handlers.set(t, keep); leaves.set(t, ls); }
            else { io.unobserve(t); handlers.delete(t); }
          } else if (leaves.has(t)) {
            leaves.get(t).forEach(f => f(e));
            leaves.delete(t);
          }
        }
      }, { rootMargin: margin, threshold: amount });
      observers.set(key, o = { io, handlers });
    }
    const list = o.handlers.get(el);
    if (list) list.push(enter);
    else { o.handlers.set(el, [enter]); o.io.observe(el); }
  }
  const visible = el => el.getBoundingClientRect().top < innerHeight;

  // Elements already animated by the page's own scripts (inline opacity /
  // transform) or positioned with transform utilities are left alone.
  function animatedByPage(el, allowAbsolute) {
    const st = el.getAttribute('style') || '';
    if (/opacity|transform|translate/.test(st)) return true;
    const cs = getComputedStyle(el);
    if (cs.translate !== 'none' || cs.transform !== 'none' || cs.scale !== 'none' || cs.rotate !== 'none') return true;
    return !allowAbsolute && (cs.position === 'absolute' || cs.position === 'fixed' || cs.position === 'sticky');
  }
  const inSticky = el => !!el.closest('[class*="sticky"]');
  // A transform, translate or filter turns an element into the containing block
  // for its absolute and fixed descendants, and position: relative does so for
  // absolute ones. Returns true if any descendant would be re-anchored that way
  // (none of its ancestors inside el already anchors it), in which case el only
  // gets opacity / colour effects.
  function anchorsDescendants(el, forPosition) {
    const positioned = getComputedStyle(el).position !== 'static';
    for (const d of el.querySelectorAll('*')) {
      const pos = getComputedStyle(d).position;
      if (pos !== 'absolute' && (pos !== 'fixed' || forPosition)) continue;
      if (pos === 'absolute' && positioned) continue;
      let a = d.parentElement, held = false;
      for (; a && a !== el; a = a.parentElement) {
        const cs = getComputedStyle(a);
        if ((pos === 'absolute' && cs.position !== 'static') || cs.transform !== 'none' || cs.translate !== 'none' || cs.scale !== 'none' ||
          cs.rotate !== 'none' || cs.filter !== 'none' || cs.perspective !== 'none' || /transform|filter/.test(cs.willChange) || /paint|layout|strict|content/.test(cs.contain)) { held = true; break; }
      }
      if (!held) return true;
    }
    return false;
  }
  // true if content of a neighbouring block reaches into el's box, so giving el
  // a position (and with it a later paint order) could cover that content
  function overlapsNeighbours(el) {
    const r = el.getBoundingClientRect();
    for (const sib of [el.previousElementSibling, el.nextElementSibling]) {
      if (!sib) continue;
      for (const d of [sib, ...sib.querySelectorAll('*')]) {
        const b = d.getBoundingClientRect();
        if (b.width && b.height && b.bottom > r.top + 1 && b.top < r.bottom - 1 && b.right > r.left + 1 && b.left < r.right - 1) return true;
      }
    }
    return false;
  }

  // ---------- page entrance / exit curtain ----------
  let curtainEl = null;
  function curtain() {
    if (!curtainEl) {
      curtainEl = document.createElement('div');
      curtainEl.id = 'bp-curtain';
      curtainEl.setAttribute('aria-hidden', 'true');
      curtainEl.innerHTML = '<i></i>'.repeat(5);
    }
    if (!curtainEl.isConnected) document.body.appendChild(curtainEl);
    return curtainEl;
  }
  let closing = null;
  function curtainOut(delay) {
    const c = curtain(), bands = c.children;
    // let a closing curtain finish covering first
    const wait = closing && closing.isActive() ? closing.totalDuration() - closing.totalTime() : 0;
    gsap.killTweensOf(bands);
    gsap.set(bands, { scaleY: 1, transformOrigin: '50% 0%' });
    return gsap.to(bands, { scaleY: 0, duration: 0.75, ease: 'expo.inOut', stagger: 0.06, delay: Math.max(delay || 0, wait), onComplete: () => c.remove() });
  }
  function curtainIn() {
    const bands = curtain().children;
    gsap.killTweensOf(bands);
    closing = gsap.fromTo(bands, { scaleY: 0, transformOrigin: '50% 100%' }, { scaleY: 1, duration: 0.4, ease: 'power3.out', stagger: 0.035 });
  }

  // ---------- scroll progress bar ----------
  function progress() {
    const bar = document.createElement('div');
    bar.id = 'bp-progress';
    bar.setAttribute('aria-hidden', 'true');
    document.body.appendChild(bar);
    let raf = 0;
    const update = () => {
      raf = 0;
      // React can re-render <body> after a hydration mismatch, dropping the bar
      // and replacing #page-scroller, so look both up again every time
      if (!bar.isConnected) document.body.appendChild(bar);
      const sc = scroller();
      const max = sc.scrollHeight - sc.clientHeight;
      bar.style.transform = 'scaleX(' + (max > 0 ? sc.scrollTop / max : 0).toFixed(4) + ')';
    };
    // scroll doesn't bubble, but capturing on document sees every scroller
    document.addEventListener('scroll', () => { raf ||= requestAnimationFrame(update); }, { passive: true, capture: true });
    update();
  }

  // ---------- sections ----------
  // outermost sections, plus top-level panels that aren't wrapped in a <section>
  function sections() {
    const main = document.querySelector('main');
    if (!main) return [];
    const out = [...main.querySelectorAll('section')].filter(s => s.id !== 'bp-hero' && !s.parentElement.closest('section'));
    for (const d of main.querySelectorAll(':scope > div > div')) if (!d.querySelector('section') && !d.closest('section') && !d.classList.contains('bp-float')) out.push(d);
    return out;
  }

  // Content blocks to reveal inside one section: the children of its main
  // content column, and the cards inside row/grid containers among them.
  function targets(section) {
    const col = section.querySelector('[class*="max-w-7xl"], [class*="max-w-[1320px]"]') || section.firstElementChild;
    if (!col || col.classList.contains('bp-float')) return [];
    if (/(^|\s)grid(\s|$)/.test(col.getAttribute('class') || '')) return [...col.children].map((c, i) => [c, i]);
    const out = [];
    for (const child of col.children) {
      if (child.classList.contains('bp-float') || child.querySelector('[class*="sticky"]')) continue; // scroll-driven: leave intact
      const cls = child.getAttribute('class') || '';
      const isRow = /(^|\s)(grid|lg:flex-row|md:grid)/.test(cls) && child.children.length > 1;
      if (isRow) out.push(...[...child.children].map((c, i) => [c, i]));
      else out.push([child, 0]);
    }
    return out;
  }

  // ---------- scroll reveal with exit (Motion springs) ----------
  // "out" rises, unblurs and settles; "fade" (elements that must not take a
  // transform, see anchorsDescendants) only fades
  function clearInline(el, props) { for (const p of props) el.style.removeProperty(p); }
  function revealIn(el, delay, mode) {
    el.setAttribute('data-bp-reveal', 'anim');
    const frames = mode === 'fade' ? { opacity: [0, 1] }
      : { opacity: [0, 1], y: [38, 0], scale: [0.98, 1], filter: ['blur(6px)', 'blur(0px)'] };
    M.animate(el, frames, { type: 'spring', bounce: 0.28, duration: 0.95, delay })
      .then(() => {
        if (el.getAttribute('data-bp-reveal') !== 'anim') return;
        clearInline(el, ['opacity', 'transform', 'filter']);
        el.setAttribute('data-bp-reveal', 'in');
      });
  }
  // leaving through the bottom (scrolling back up): fold away so it replays next time
  function revealOut(el, mode) {
    if (el.getBoundingClientRect().top < innerHeight * 0.92) return;
    el.setAttribute('data-bp-reveal', 'anim-out');
    const frames = mode === 'fade' ? { opacity: 0 } : { opacity: 0, y: 38, scale: 0.98, filter: 'blur(6px)' };
    M.animate(el, frames, { duration: 0.3, ease: 'easeIn' })
      .then(() => { if (el.getAttribute('data-bp-reveal') === 'anim-out') { clearInline(el, ['opacity', 'transform', 'filter']); el.setAttribute('data-bp-reveal', mode); } });
  }
  function setupReveals() {
    sections().forEach(sec => {
      let n = 0;
      for (const [el, i] of targets(sec)) {
        if (el.hasAttribute('data-bp-reveal') || animatedByPage(el)) continue;
        // anything already on screen stays put, so nothing visible blinks out
        if (visible(el)) { el.setAttribute('data-bp-reveal', 'in'); continue; }
        const delay = Math.min(i, 5) * 0.08 + Math.min(n, 2) * 0.05;
        const mode = anchorsDescendants(el) ? 'fade' : 'out';
        el.setAttribute('data-bp-reveal', mode);
        watch(el, () => { revealIn(el, delay, mode); return () => revealOut(el, mode); }, { amount: 0.12, margin: '0px 0px -6% 0px' });
        n++;
      }
    });
  }

  // ---------- headings: per-letter reveal ----------
  const splits = new Set();
  const onlyText = n => [...n.childNodes].every(c => c.nodeType === 3);
  function splittable(el) {
    const t = el.textContent.trim();
    if (t.length < 2 || t.length > 140 || inSticky(el)) return false;
    if (/text/.test(getComputedStyle(el).backgroundClip + getComputedStyle(el).webkitBackgroundClip)) return false;
    if (el.querySelector('.animated-gradient-text, img, svg, a, button')) return false;
    return [...el.childNodes].every(n => n.nodeType === 3 || (n.nodeType === 1 && (n.tagName === 'BR' || onlyText(n))));
  }
  // Swap the heading's children for letter spans (clones; the originals are kept)
  // and return the letters, or null if splitting would change the layout.
  function split(el) {
    const saved = [...el.childNodes];
    const box = [el.offsetWidth, el.offsetHeight];
    const letters = [];
    const addText = (text, parent) => {
      for (const part of text.split(/(\s+)/)) {
        if (!part) continue;
        if (/^\s+$/.test(part)) { parent.appendChild(document.createTextNode(part)); continue; }
        const w = document.createElement('span');
        w.className = 'bp-w';
        w.setAttribute('aria-hidden', 'true');
        for (const ch of part) {
          const c = document.createElement('span');
          c.className = 'bp-c';
          c.textContent = ch;
          w.appendChild(c);
          letters.push(c);
        }
        parent.appendChild(w);
      }
    };
    const frag = document.createDocumentFragment();
    for (const n of saved) {
      if (n.nodeType === 3) addText(n.nodeValue, frag);
      else if (n.tagName === 'BR') frag.appendChild(n.cloneNode(false));
      else { const shell = n.cloneNode(false); addText(n.textContent, shell); frag.appendChild(shell); }
    }
    const hadLabel = el.hasAttribute('aria-label');
    if (!hadLabel) el.setAttribute('aria-label', el.textContent.replace(/\s+/g, ' ').trim());
    el.setAttribute('data-bp-split', '');
    el.replaceChildren(frag);
    const restore = () => {
      if (!splits.delete(restore)) return;
      el.replaceChildren(...saved);
      el.removeAttribute('data-bp-split');
      if (!hadLabel) el.removeAttribute('aria-label');
    };
    splits.add(restore);
    if (el.offsetWidth !== box[0] || el.offsetHeight !== box[1]) { restore(); return null; }
    return { letters, restore };
  }
  const restoreAll = () => [...splits].forEach(r => r());
  function lettersIn(el, delay) {
    const s = split(el);
    if (!s) { // fall back to a mask wipe of the whole heading
      M.animate(el, { clipPath: ['inset(0 100% 0 0)', 'inset(0 0% 0 0)'] }, { duration: 0.9, delay, ease: [0.2, 0.75, 0.2, 1] })
        .then(() => el.style.removeProperty('clip-path'));
      return;
    }
    const fs = parseFloat(getComputedStyle(el).fontSize) || 32;
    const anim = M.animate(s.letters,
      { opacity: [0, 1], y: [fs * 0.55, 0], rotate: [12, 0], scale: [0.4, 1] },
      { type: 'spring', bounce: 0.5, duration: 0.8, delay: M.stagger(Math.min(0.03, 0.9 / s.letters.length), { startDelay: delay }) });
    const done = setTimeout(s.restore, 4000);
    anim.then(() => { clearTimeout(done); s.restore(); });
  }
  function setupHeadings(startDelay) {
    for (const el of document.querySelectorAll('main h1, main h2')) {
      if (el.hasAttribute('data-bp-letters')) continue;
      el.setAttribute('data-bp-letters', '');
      if (animatedByPage(el, true) || !splittable(el)) continue;
      // on-screen headings play with the entrance; the rest as they scroll in
      if (visible(el)) lettersIn(el, startDelay);
      else watch(el, () => lettersIn(el, 0.05), { amount: 0.35 });
    }
  }

  // ---------- images: mask reveal ----------
  function setupMasks() {
    let k = 0;
    for (const img of document.querySelectorAll('main img')) {
      if (img.hasAttribute('data-bp-mask-done') || img.closest('#bp-hero') || inSticky(img)) continue;
      img.setAttribute('data-bp-mask-done', '');
      const r = img.getBoundingClientRect();
      if (r.width < 220 || r.height < 140 || r.top < innerHeight || animatedByPage(img, true)) continue;
      const circle = k++ % 3 === 2;
      const radius = getComputedStyle(img).borderTopLeftRadius || '0px';
      // Hidden only once loaded: a fully clipped image has no visible area, so
      // the browser's lazy loading (and any observer on it) would never fire.
      // Lazy images load well before they scroll into view, so nothing flashes.
      const hide = () => {
        if (img.getBoundingClientRect().top <= innerHeight) return;
        img.setAttribute('data-bp-mask', circle ? 'circle' : 'out');
        // the trigger watches the (unclipped) container for the same reason, and
        // is only set up now, so an image that loads late is still revealed
        watch(img.parentElement, reveal, { margin: '0px 0px -12% 0px' });
      };
      if (img.complete && img.naturalWidth) hide();
      else img.addEventListener('load', hide, { once: true });
      function reveal() {
        const clip = circle ? ['circle(0% at 50% 55%)', 'circle(75% at 50% 50%)']
          : [`inset(0% 0% 100% 0% round ${radius})`, `inset(0% 0% 0% 0% round ${radius})`];
        img.style.clipPath = clip[0];
        img.removeAttribute('data-bp-mask');
        M.animate(img, { clipPath: clip, scale: [1.12, 1] }, { duration: 1.1, delay: 0.15, ease: [0.65, 0, 0.2, 1] })
          .then(() => clearInline(img, ['clip-path', 'transform']));
      }
    }
  }

  // ---------- floating decorative shapes ----------
  // [class, style, inner markup] for colour c and size s
  const SHAPES = [
    (c, s) => ['bp-dot', `width:${s}px;height:${s}px;background:${c}`, ''],
    (c, s) => ['bp-ring', `width:${s}px;height:${s}px;color:${c}`, ''],
    (c, s) => ['bp-pill', `width:${s * 1.8}px;height:${s * 0.6}px;background:${c}`, ''],
    (c, s) => ['bp-blob', `width:${s * 1.2}px;height:${s * 1.2}px;background:${c}`, ''],
    (c, s) => ['', `width:${s * 1.6}px;height:${s * 0.6}px`, `<svg viewBox="0 0 80 24"><path d="M2 12q9-12 19 0t19 0 19 0 19 0" fill="none" stroke="${c}" stroke-width="5" stroke-linecap="round"/></svg>`],
    (c, s) => ['', `width:${s}px;height:${s}px`, `<svg viewBox="0 0 40 40"><path d="M20 2l4.5 13.5L38 20l-13.5 4.5L20 38l-4.5-13.5L2 20l13.5-4.5z" fill="${c}"/></svg>`],
    (c, s) => ['', `width:${s}px;height:${s}px`, `<svg viewBox="0 0 40 40"><path d="M20 4l17 30H3z" fill="none" stroke="${c}" stroke-width="4" stroke-linejoin="round"/></svg>`],
  ];
  function rng(seed) { return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646; }
  function floatLayer(host, seed, count, dark) {
    const rand = rng(seed * 7919 + 13);
    const layer = document.createElement('div');
    layer.className = 'bp-float';
    layer.setAttribute('aria-hidden', 'true');
    layer.setAttribute('data-bp-deco', '');
    const small = innerWidth < 768;
    let html = '';
    for (let i = 0; i < count; i++) {
      const left = i % 2 === 0;
      const x = left ? 1 + rand() * (small ? 4 : 8) : 88 + rand() * (small ? 7 : 8);
      const y = 8 + (i / count) * 70 + rand() * 12;
      const size = Math.round((small ? 14 : 22) + rand() * (small ? 16 : 40));
      const c = COLORS[Math.floor(rand() * COLORS.length)];
      const [cls, css, inner] = SHAPES[Math.floor(rand() * SHAPES.length)](c, size);
      // drift path, speed and phase for the CSS float animation (theme.css)
      const drift = `--fx:${(rand() * 36 - 18).toFixed(0)}px;--fy:${(rand() * 52 - 26).toFixed(0)}px;--fr:${(rand() * 70 - 35).toFixed(0)}deg;` +
        `animation-duration:${(3.5 + rand() * 3.5).toFixed(1)}s;animation-delay:-${(rand() * 6).toFixed(1)}s;`;
      html += `<span class="${cls}" data-depth="${(0.4 + rand() * 1.2).toFixed(2)}" style="left:${x.toFixed(1)}%;top:${y.toFixed(1)}%;opacity:${dark ? 0.5 : 0.75};${drift}${css}">${inner}</span>`;
    }
    layer.innerHTML = html;
    host.setAttribute('data-bp-host', '');
    host.appendChild(layer);
    return layer;
  }
  function animateLayer(host, layer) {
    if (!motion) return;
    // the float itself is a transform-only CSS animation (runs off the main
    // thread); it only plays while the section is on screen
    watch(host, () => { layer.setAttribute('data-bp-live', ''); return () => layer.removeAttribute('data-bp-live'); }, { margin: '120px 0px' });
    // parallax depth while the section scrolls past (Motion scroll timeline)
    if (M.scroll) M.scroll(p => {
      for (const sh of layer.children) sh.style.translate = `0 ${((0.5 - p) * 120 * sh.dataset.depth).toFixed(1)}px`;
    }, { container: scroller(), target: host });
  }
  function setupFloats() {
    sections().forEach((sec, i) => {
      if (sec.hasAttribute('data-bp-host') || sec.hasAttribute('data-bp-nohost')) return;
      // The layer needs a host that is already a containing block (making one
      // could move absolute children or change paint order), so a static section
      // lends a large positioned wrapper inside it instead. Sections holding
      // sticky/fixed content are skipped: a new stacking context would trap it.
      // Failing both, a static section is made relative itself, but only when
      // that provably changes nothing: no descendant re-anchors and no
      // neighbouring content overlaps it.
      const big = d => d.offsetHeight >= sec.offsetHeight * 0.6 && d.offsetWidth >= sec.offsetWidth * 0.6;
      let host = getComputedStyle(sec).position !== 'static' ? sec
        : [...sec.querySelectorAll(':scope > *, :scope > * > *')].find(d => getComputedStyle(d).position === 'relative' && big(d));
      const blocked = sec.offsetHeight < 280 || sec.querySelector('[class*="sticky"], [class*="fixed"]');
      if (!host && !blocked && !anchorsDescendants(sec, true) && !overlapsNeighbours(sec)) { host = sec; sec.setAttribute('data-bp-pos', ''); }
      sec.setAttribute('data-bp-nohost', ''); // handled (the layer may live in a wrapper)
      if (!host || blocked || host.hasAttribute('data-bp-host')) return;
      const dark = /bg-primary-8|bg-primary-9|bg-gradient-deep|bg-gradient-purple/.test(sec.className);
      animateLayer(host, floatLayer(host, i + 1, innerWidth < 768 ? 2 : 4, dark));
    });
    const box = document.querySelector('#bp-hero .bph-box');
    if (box && !box.hasAttribute('data-bp-host')) {
      const layer = floatLayer(box, 99, innerWidth < 768 ? 3 : 6, true);
      layer.style.zIndex = '0';
      animateLayer(box, layer);
    }
  }

  // ---------- pointer-reactive gradients ----------
  function setupGradients() {
    // spotlights that follow the pointer inside the hero and dark sections
    for (const el of document.querySelectorAll('section.bg-primary-800, #bp-hero .bph-box')) {
      if (el.hasAttribute('data-bp-spot')) continue;
      el.setAttribute('data-bp-spot', '');
      el.addEventListener('pointermove', e => {
        const r = el.getBoundingClientRect();
        el.style.setProperty('--bp-px', (e.clientX - r.left).toFixed(0) + 'px');
        el.style.setProperty('--bp-py', (e.clientY - r.top).toFixed(0) + 'px');
      }, { passive: true });
      el.addEventListener('pointerenter', () => el.style.setProperty('--bp-glow', '1'));
      el.addEventListener('pointerleave', () => el.style.setProperty('--bp-glow', '0'));
    }
  }
  // mesh blobs in the pale sections lean towards the pointer
  let meshRaf = 0, mx = 0, my = 0;
  function onMeshMove(e) {
    mx = e.clientX / innerWidth * 2 - 1;
    my = e.clientY / innerHeight * 2 - 1;
    meshRaf ||= requestAnimationFrame(() => {
      meshRaf = 0;
      for (const el of document.querySelectorAll('.bg-gradient-hero, .bg-gradient-lavender-ivory, .bg-gradient-ivory-lavender')) {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > innerHeight) continue;
        el.style.setProperty('--bp-mx', mx.toFixed(3));
        el.style.setProperty('--bp-my', my.toFixed(3));
      }
    });
  }

  // drifting backgrounds only animate while their section is on screen
  const LIVE_SEL = '.bg-gradient-hero, .bg-gradient-lavender-ivory, .bg-gradient-ivory-lavender, section.bg-primary-800, .bg-gradient-deep-gradient, .bg-gradient-purple-vertical';
  let liveOn = false;
  function setupLive() {
    if (!liveOn) return;
    for (const el of document.querySelectorAll(LIVE_SEL)) {
      if (el.hasAttribute('data-bp-live-watch')) continue;
      el.setAttribute('data-bp-live-watch', '');
      watch(el, () => { el.setAttribute('data-bp-live', ''); return () => el.removeAttribute('data-bp-live'); }, { margin: '80px 0px' });
    }
  }

  // ---------- cards: tilt, glow, animated ring ----------
  const CARD_SEL = 'main .rounded-2xl:is(.bg-white,.bg-primary-50,.bg-secondary-light-ivory):not([class*="py-16"]):not([class*="py-30"]),' +
    'main .rounded-xl:is(.bg-white,.bg-primary-50):not([class*="py-3.5"]), #bp-hero .bph-feature, #bp-hero .bph-proof > div';
  function setupCards() {
    const all = [...document.querySelectorAll(CARD_SEL)];
    for (const el of all) {
      if (el.hasAttribute('data-bp-card') || el.hasAttribute('data-bp-nocard')) continue;
      const r = el.getBoundingClientRect();
      const ours = !!el.closest('#bp-hero');
      if ((!ours && animatedByPage(el, true)) || inSticky(el) || r.width < 120 || r.height < 40 || r.width > 900 || all.some(o => o !== el && el.contains(o))) {
        el.setAttribute('data-bp-nocard', '');
        continue;
      }
      el.setAttribute('data-bp-card', '');
      const cs = getComputedStyle(el);
      const tilt = ours || !anchorsDescendants(el);
      if (!ours) {
        if (parseFloat(cs.borderTopWidth) >= 1) { el.setAttribute('data-bp-ring', 'border'); el.style.setProperty('--bp-card-bg', cs.backgroundColor); }
        else if (cs.position !== 'static' && getComputedStyle(el, '::after').content === 'none') el.setAttribute('data-bp-ring', 'after');
      }
      el.addEventListener('pointermove', e => {
        const b = el.getBoundingClientRect();
        const px = (e.clientX - b.left) / b.width, py = (e.clientY - b.top) / b.height;
        el.style.setProperty('--bp-px', (px * 100).toFixed(1) + '%');
        el.style.setProperty('--bp-py', (py * 100).toFixed(1) + '%');
        if (!motion || !fine || !tilt || /anim/.test(el.getAttribute('data-bp-reveal') || '')) return;
        const k = Math.min(1, 260 / b.width); // big panels tilt less
        gsap.to(el, { rotationX: (0.5 - py) * 9 * k, rotationY: (px - 0.5) * 11 * k, y: -6, transformPerspective: 900, duration: 0.5, ease: 'power3.out', overwrite: 'auto' });
      }, { passive: true });
      el.addEventListener('pointerleave', () => {
        if (!motion || !fine || !tilt) return;
        gsap.to(el, { rotationX: 0, rotationY: 0, y: 0, duration: 1.2, ease: 'elastic.out(1, 0.45)', overwrite: 'auto', clearProps: 'transform' });
      });
    }
  }

  // ---------- magnetic buttons ----------
  const MAGNET_SEL = 'main a[class*="rounded"][class*="py-3"], main button[class*="rounded"][class*="py-3"], nav a[class*="rounded-xl"], nav button[class*="rounded-xl"], #bp-hero .bph-btn, #bp-hero .bph-orb, #bp-hero .bph-pb';
  function setupMagnets() {
    if (!motion || !fine) return;
    for (const el of document.querySelectorAll(MAGNET_SEL)) {
      if (el.hasAttribute('data-bp-magnet') || el.hasAttribute('data-bp-nomagnet')) continue;
      const r = el.getBoundingClientRect();
      if (getComputedStyle(el).translate !== 'none' || r.width > 420 || r.height > 140 || inSticky(el) || anchorsDescendants(el)) { el.setAttribute('data-bp-nomagnet', ''); continue; }
      el.setAttribute('data-bp-magnet', '');
      el.addEventListener('pointermove', e => {
        const b = el.getBoundingClientRect();
        const dx = (e.clientX - (b.left + b.width / 2)) * 0.32, dy = (e.clientY - (b.top + b.height / 2)) * 0.4;
        el.setAttribute('data-bp-pull', ''); // `translate` is only applied while pulled
        gsap.to(el, { '--bp-mx-px': gsap.utils.clamp(-14, 14, dx) + 'px', '--bp-my-px': gsap.utils.clamp(-10, 10, dy) + 'px', duration: 0.4, ease: 'power3.out', overwrite: 'auto' });
      }, { passive: true });
      el.addEventListener('pointerleave', () => gsap.to(el, { '--bp-mx-px': '0px', '--bp-my-px': '0px', duration: 1.1, ease: 'elastic.out(1.1, 0.35)', overwrite: 'auto',
        onComplete: () => el.removeAttribute('data-bp-pull') }));
    }
  }

  // ---------- click confetti ----------
  let fx = null;
  function burst(x, y) {
    if (!fx) { fx = document.createElement('div'); fx.id = 'bp-fx'; fx.setAttribute('aria-hidden', 'true'); }
    if (!fx.isConnected) document.body.appendChild(fx);
    for (let i = 0; i < 12; i++) {
      const p = document.createElement('i');
      p.style.background = COLORS[i % COLORS.length];
      if (i % 3 === 0) p.style.borderRadius = '50%';
      fx.appendChild(p);
      const a = (i / 12) * Math.PI * 2 + Math.random() * 0.5, d = 34 + Math.random() * 42;
      gsap.fromTo(p, { x: x - 4, y: y - 4, scale: 1, rotation: 0, opacity: 1 },
        { x: x - 4 + Math.cos(a) * d, y: y - 4 + Math.sin(a) * d + 18, rotation: gsap.utils.random(-220, 220), scale: 0.2, opacity: 0, duration: gsap.utils.random(0.6, 0.95), ease: 'power3.out', onComplete: () => p.remove() });
    }
  }

  // ---------- hero (our own section on "/") ----------
  function heroEntrance(delay) {
    const hero = document.getElementById('bp-hero');
    if (!hero) return;
    // replay the hero's CSS entrance so it lands just after the curtain lifts
    for (const el of hero.querySelectorAll('.bph-enter, .bph-enter-side, .bph-sample')) for (const a of el.getAnimations()) {
      const t = a.effect.getTiming();
      a.effect.updateTiming({ delay: (t.delay || 0) + delay * 1000 });
      a.currentTime = 0;
    }
    const h1 = hero.querySelector('h1');
    if (h1 && !h1.hasAttribute('data-bp-letters')) {
      h1.setAttribute('data-bp-letters', '');
      h1.style.animation = 'none';
      h1.style.opacity = '1';
      h1.style.transform = 'none';
      lettersIn(h1, delay + 0.1);
    }
  }

  // ---------- wiring ----------
  function scan(entranceDelay) {
    setupGradients();
    setupCards();
    setupFloats();
    if (!motion) return;
    setupHeadings(entranceDelay || 0);
    setupReveals();
    setupMasks();
    setupMagnets();
    setupLive();
  }

  function onRoute() {
    store(NAV_KEY, null); // a client-side route change, not a page load
    if (curtainEl && curtainEl.isConnected) curtainOut(0.15);
    setTimeout(() => scan(0.3), 350);
    setTimeout(() => scan(0), 1400);
  }

  let started = false;
  async function start() {
    if (started) return;
    started = true;
    await loadLibs();
    gsap = window.gsap;
    M = window.Motion;
    motion = !reduce && !!(gsap && M && M.animate && M.stagger);
    progress();
    if (!motion) { if (hold) hold.remove(); scan(0); return; }

    curtain();
    hold.remove();
    curtainOut(0.05);
    const ENTER = 0.45;
    // nav drops in with a little bounce
    const navItems = [...document.querySelectorAll('#page-scroller nav a, #page-scroller nav button')]
      .filter(el => { const r = el.getBoundingClientRect(); return r.width && r.top < 120 && !animatedByPage(el, true); });
    gsap.from(navItems, { y: -22, opacity: 0, duration: 0.9, ease: 'back.out(2.2)', stagger: 0.05, delay: ENTER, clearProps: 'transform,opacity' });
    heroEntrance(ENTER);
    scan(ENTER);
    // queued after Next's own idle callbacks (its lazyOnload scripts), which a
    // page that is busy repainting every frame would otherwise starve
    idle(() => { liveOn = true; setupLive(); });

    document.addEventListener('pointermove', onMeshMove, { passive: true });
    document.addEventListener('pointerdown', e => {
      if (e.button !== 0) return;
      const t = e.target.closest && e.target.closest('a, button, [role="button"], [role="switch"]');
      if (t && t.closest('main, nav, footer')) burst(e.clientX, e.clientY);
    }, { passive: true });

    // exit transition: bands close over the page on in-site navigation, and
    // lift again once the new route has rendered (or on a full page load)
    let fallback = 0;
    document.addEventListener('click', e => {
      if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const a = e.target.closest && e.target.closest('a[href]');
      if (!a || (a.target && a.target !== '_self') || a.hasAttribute('download')) return;
      const url = new URL(a.href, location.href);
      if (url.origin !== location.origin || url.pathname === location.pathname) return;
      restoreAll();
      curtainIn();
      store(NAV_KEY, Date.now()); // read by the next page if this becomes a full load
      clearTimeout(fallback);
      fallback = setTimeout(() => curtainOut(0), 2600);
    }, true);
    let path = location.pathname;
    const check = () => { if (location.pathname !== path) { path = location.pathname; clearTimeout(fallback); onRoute(); } };
    for (const m of ['pushState', 'replaceState']) {
      const orig = history[m];
      history[m] = function () { const r = orig.apply(this, arguments); setTimeout(check, 60); return r; };
    }
    addEventListener('popstate', () => setTimeout(check, 60));
    addEventListener('pageshow', e => { if (e.persisted && curtainEl && curtainEl.isConnected) curtainOut(0); });

    // late-rendered content (lazy sections, client renders): pick it up too
    let t = 0;
    const main = document.querySelector('main');
    if (main) new MutationObserver(muts => {
      const ours = muts.every(m => m.target.closest && (m.target.closest('[data-bp-split], .bp-float') || [...m.addedNodes, ...m.removedNodes].every(n => n.nodeType === 1 && (n.classList.contains('bp-float') || n.classList.contains('bp-w')))));
      if (ours) return;
      clearTimeout(t);
      t = setTimeout(() => scan(0), 700);
    }).observe(main, { childList: true, subtree: true });
  }
  // after content.js and hero.js (both at load + 300ms), so text and hero are in place
  function onLoad() {
    // a tick later, so Next's own load listener has queued its idle callbacks first
    setTimeout(() => idle(loadLibs, { timeout: 250 }), 0);
    setTimeout(start, 330);
  }
  if (document.readyState === 'complete') onLoad();
  else window.addEventListener('load', onLoad);
  // A slow load never leaves the page hidden, but the motion layer itself still
  // waits for the load event: touching the DOM before React hydrates breaks it.
  setTimeout(() => { if (!started && hold) hold.remove(); }, 4300);
})();
