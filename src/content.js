// Hush content script.
//
// Two layers do the hiding:
//   1. hush.css hides elements we can match with selectors alone.
//   2. This script tags trickier elements with data-hush="<feature>" (found by text, layout
//      or position). Tagging always runs; hush.css only hides a tag while <html> carries the
//      matching hush-<feature> class, so toggles in the popup apply instantly in both directions.
(() => {
  const { FEATURES, load, onChange, effective } = globalThis.HushSettings;
  const root = document.documentElement;
  const CACHE_KEY = 'hush:on';
  const LOOK_KEY = 'hush:look';
  let on = new Set();
  let look = { theme: null, gray: 'off', stopAutoplay: false };

  function apply(set) {
    on = set;
    for (const f of FEATURES) root.classList.toggle('hush-' + f.key, set.has(f.key));
    // chrome.storage is async; caching in the page's localStorage lets the next load apply
    // classes synchronously at document_start, so counts never flash in.
    try {
      localStorage.setItem(CACHE_KEY, [...set].join(' '));
    } catch {}
    fixTitle();
    schedule();
  }

  // ---------- Look: theme, grayscale, autoplay ----------

  // X keeps its background choice in the night_mode cookie: 0 Default, 1 Dim, 2 Lights out.
  const NIGHT_MODE = { light: '0', dim: '1', dark: '2' };

  function nightModeCookie() {
    return document.cookie.match(/(?:^|;\s*)night_mode=(\d)/)?.[1] ?? null;
  }

  function applyLook(next, live) {
    const themeChanged = next.theme !== look.theme;
    look = next;
    root.classList.toggle('hush-gray-media', next.gray === 'media');
    root.classList.toggle('hush-gray-all', next.gray === 'all');
    try {
      localStorage.setItem(LOOK_KEY, JSON.stringify(next));
    } catch {}

    const want = NIGHT_MODE[next.theme];
    if (!want || nightModeCookie() === want) return;
    const domain = location.hostname.replace(/^mobile\./, '');
    document.cookie = `night_mode=${want}; domain=.${domain}; path=/; max-age=31536000; secure; samesite=lax`;
    // X only reads the cookie at boot. Reload only when you just picked a theme in the popup,
    // never on page load, so this can't loop.
    if (live && themeChanged) location.reload();
  }

  // Videos and GIFs play only after a click or key press. Once you start one it stays allowed,
  // so X pausing and resuming it as you scroll still works.
  let lastGesture = 0;
  for (const ev of ['pointerdown', 'keydown']) addEventListener(ev, () => (lastGesture = Date.now()), true);
  document.addEventListener(
    'play',
    (e) => {
      const v = e.target;
      if (!look.stopAutoplay || !(v instanceof HTMLVideoElement) || v.dataset.hushPlay) return;
      if (Date.now() - lastGesture < 1500) v.dataset.hushPlay = '1';
      else v.pause();
    },
    true
  );

  // ---------- helpers ----------

  function tag(el, key) {
    if (!el || el === document.body || el === root) return;
    const keys = el.dataset.hush ? el.dataset.hush.split(' ') : [];
    if (!keys.includes(key)) {
      keys.push(key);
      el.dataset.hush = keys.join(' ');
    }
  }

  const text = (el) => (el.textContent || '').trim();
  const isLeaf = (el) => el.childElementCount === 0;
  const COUNT = /^[\d.,]+\s*[kmb]?$/i;

  function pageKind(path) {
    if (path === '/home') return 'home';
    if (path.startsWith('/notifications')) return 'notifications';
    if (/^\/[^/]+\/status\/\d+/.test(path)) return 'status';
    if (/^\/(i|explore|search|messages|settings|compose|jobs|lists?)(\/|$)/.test(path)) return 'other';
    if (/^\/[A-Za-z0-9_]{1,15}(\/(with_replies|media|likes|highlights|articles|superfollows))?\/?$/.test(path)) return 'profile';
    return 'other';
  }

  // The timeline entry that holds `el`: the legacy cellInnerDiv, or the nearest ancestor
  // whose siblings are other timeline entries (i.e. its parent holds 2+ article-bearing children).
  function cellOf(el) {
    const legacy = el.closest('[data-testid="cellInnerDiv"]');
    if (legacy) return legacy;
    let cur = el;
    for (let i = 0; i < 14 && cur.parentElement && cur.parentElement !== document.body; i++) {
      const parent = cur.parentElement;
      let entries = 0;
      for (const child of parent.children) if (child !== cur && child.querySelector('article')) entries++;
      if (entries >= 2) return cur;
      cur = parent;
    }
    return null;
  }

  // Walk up from a leaf while the wrapper holds nothing but that same text (badge bubbles, count chips).
  function outermostWrapper(el, stopAt) {
    const t = text(el);
    while (el.parentElement && el.parentElement !== stopAt && text(el.parentElement) === t) el = el.parentElement;
    return el;
  }

  // ---------- 2 · Tab title count + favicon dot ----------

  const TITLE_BADGE = /^\(\d+\+?\)\s*/;
  function fixTitle() {
    if (!on.has('title')) return;
    if (TITLE_BADGE.test(document.title)) document.title = document.title.replace(TITLE_BADGE, '');
    for (const link of document.querySelectorAll('link[rel~="icon"]')) {
      if (/-(pip|badge)/.test(link.href)) link.href = link.href.replace(/-(pip|badge)/, '');
    }
  }

  // ---------- 1 · Views on the expanded post ("29.6m Views") ----------

  function tagViews(kind) {
    for (const a of document.querySelectorAll('article a[href*="/status/"]')) {
      if (/^[\d.,]+\s*[kmb]?\s*views?$/i.test(text(a))) tag(a, 'views');
    }
    if (kind !== 'status') return;
    // Legacy markup: <span><span>1.2M</span> <span>Views</span></span>, not a link.
    for (const s of document.querySelectorAll('article span')) {
      if (!isLeaf(s) || !/^views?$/i.test(text(s))) continue;
      let box = s;
      while (box.parentElement && text(box.parentElement).length < 24 && box.parentElement.tagName !== 'ARTICLE') box = box.parentElement;
      tag(box, 'views');
    }
  }

  // ---------- 3 · Notification badge ----------

  function tagBell() {
    const links = document.querySelectorAll('a[href="/notifications"], [data-testid="AppTabBar_Notifications_Link"]');
    for (const a of links) {
      if (a.getAttribute('role') === 'tab') continue; // the "All" tab on the notifications page
      for (const el of a.querySelectorAll('*')) {
        if (isLeaf(el) && /^\d+\+?$/.test(text(el))) tag(outermostWrapper(el, a), 'bell');
      }
      for (const el of a.querySelectorAll('[aria-live], [aria-label*="unread" i]')) tag(el, 'bell');
    }
  }

  // ---------- 6 · "Show 35 posts" pill ----------

  const NEW_POSTS = /^(show \d[\d,.]*\s*k?\s+(new )?posts?$|\d+\s+new posts?$|new posts are available)/i;
  function tagNewPosts() {
    for (const el of document.querySelectorAll('[data-testid="pillLabel"]')) tag(el.closest('[role="button"]') || el, 'newPosts');
    for (const b of document.querySelectorAll('main button, main [role="button"]')) {
      const label = (b.getAttribute('aria-label') || text(b)).trim();
      if (label.length < 80 && NEW_POSTS.test(label)) tag(b, 'newPosts');
    }
  }

  // ---------- 9 · Follower / following / post counts ----------

  const PROFILE_TOTAL = /^[\d.,]+\s*[kmb]?\s+(posts?|tweets?|likes|photos?( & videos)?|videos?|articles?|replies|highlights)$/i;
  function tagFollowers(kind) {
    const sel = 'a[href$="/followers"], a[href$="/following"], a[href$="/verified_followers"], a[href$="/creator-subscriptions/subscribers"]';
    for (const a of document.querySelectorAll(sel)) {
      for (const el of a.querySelectorAll('span, div')) if (isLeaf(el) && COUNT.test(text(el))) tag(el, 'followers');
    }
    for (const a of document.querySelectorAll('a[href$="/followers_you_follow"]')) tag(a, 'followers');

    if (kind !== 'profile') return;
    // "111.4K posts" under the name in the profile header. Only walk the header, never the timeline.
    const scope = document.querySelector('[data-testid="primaryColumn"]') || document.querySelector('main') || document.body;
    if (!scope) return;
    const walker = document.createTreeWalker(scope, NodeFilter.SHOW_ELEMENT, {
      acceptNode: (n) => (n.tagName === 'ARTICLE' ? NodeFilter.FILTER_REJECT : NodeFilter.FILTER_ACCEPT),
    });
    for (let n = walker.nextNode(), i = 0; n && i < 4000; n = walker.nextNode(), i++) {
      if (isLeaf(n) && PROFILE_TOTAL.test(text(n))) tag(n, 'followers');
    }
  }

  // ---------- 10 · Suggestions, "Discover more", promoted posts ----------

  const INJECTED_HEADING = /^(who to follow|you might like|discover more|more posts|relevant people|topics to follow|follow suggestions|creators for you|subscribe to premium)$/i;
  const AD_LABEL = /^(ad|promoted|promoted by .+)$/i;
  function tagInjections(kind) {
    for (const h of document.querySelectorAll('main h2, main h3, main [role="heading"]')) {
      const label = text(h);
      if (!INJECTED_HEADING.test(label)) continue;
      const cell = cellOf(h);
      if (!cell) continue;
      tag(cell, 'injections');
      // On a post page everything after "Discover more" is recommendations, not replies.
      if (kind === 'status' && /^(discover more|more posts)$/i.test(label)) {
        for (let sib = cell.nextElementSibling; sib; sib = sib.nextElementSibling) tag(sib, 'injections');
      }
    }

    for (const art of document.querySelectorAll('article')) {
      let ad = !!art.querySelector('[data-testid="placementTracking"]');
      if (!ad) {
        for (const s of art.querySelectorAll('span')) {
          if (isLeaf(s) && AD_LABEL.test(text(s)) && !s.closest('[data-testid="tweetText"], [lang], div[dir="auto"]')) {
            ad = true;
            break;
          }
        }
      }
      if (ad) tag(cellOf(art) || art, 'injections');
    }
  }

  // ---------- 8 · Right sidebar ----------

  // hush.css removes the legacy [data-testid="sidebarColumn"] directly; this finds the
  // sidebar in X's newer markup, which has no test ids, by its position on the page.
  function tagSidebar() {
    if (document.querySelector('[data-testid="sidebarColumn"]')) return;
    for (const el of document.querySelectorAll('aside, [role="complementary"]')) {
      const r = el.getBoundingClientRect();
      if (r.width > 200 && r.width < 520 && r.height > 200 && r.left > innerWidth * 0.5 && getComputedStyle(el).position !== 'fixed') {
        tag(el, 'sidebar');
        return;
      }
    }
  }

  // ---------- 5 · For You → Following ----------

  let lastTabClick = 0;
  function forceFollowing() {
    const lists = document.querySelectorAll('[data-testid="primaryColumn"] [role="tablist"], main [role="tablist"]');
    for (const list of lists) {
      const tabs = [...list.querySelectorAll('[role="tab"]')];
      if (tabs.length < 2) continue;
      const forYou = tabs.find((t) => /^for you$/i.test(text(t))) || tabs[0];
      const following = tabs.find((t) => /^following$/i.test(text(t))) || tabs[1];
      tag(forYou.closest('[role="presentation"]') || forYou, 'forYou');
      if (on.has('forYou') && forYou.getAttribute('aria-selected') === 'true' && Date.now() - lastTabClick > 1500) {
        lastTabClick = Date.now();
        following.click();
      }
      return;
    }
  }

  // ---------- 7 · Notifications → Mentions ----------

  let lastMentionsHop = 0;
  function mentionsOnly() {
    for (const t of document.querySelectorAll('a[role="tab"][href="/notifications"], a[role="tab"][href="/notifications/verified"]')) {
      tag(t.closest('[role="presentation"]') || t, 'mentions');
    }
    if (!on.has('mentions') || location.pathname !== '/notifications') return;
    if (Date.now() - lastMentionsHop < 1500) return;
    lastMentionsHop = Date.now();
    const tab = document.querySelector('a[href="/notifications/mentions"]');
    if (tab) tab.click();
    else
      setTimeout(() => {
        if (on.has('mentions') && location.pathname === '/notifications') location.replace('/notifications/mentions');
      }, 1200);
  }

  // ---------- scan loop ----------

  function scan() {
    const kind = pageKind(location.pathname);
    root.dataset.hushPage = kind;
    const steps = [
      () => tagViews(kind),
      tagBell,
      tagNewPosts,
      () => tagFollowers(kind),
      () => tagInjections(kind),
      tagSidebar,
      () => kind === 'home' && forceFollowing(),
      () => kind === 'notifications' && mentionsOnly(),
    ];
    // One broken heuristic (X changed something) must not stop the others.
    for (const step of steps) {
      try {
        step();
      } catch (e) {
        console.debug('[hush]', e);
      }
    }
  }

  let queued = false;
  function schedule() {
    if (queued) return;
    queued = true;
    setTimeout(() => {
      queued = false;
      scan();
    }, 120);
  }

  new MutationObserver(() => {
    fixTitle(); // synchronous, so the "(3)" never renders
    schedule();
  }).observe(root, { childList: true, subtree: true, characterData: true });

  // ---------- start ----------

  try {
    const cached = localStorage.getItem(CACHE_KEY);
    if (cached !== null) apply(new Set(cached.split(' ').filter(Boolean)));
    const cachedLook = localStorage.getItem(LOOK_KEY);
    if (cachedLook) applyLook(JSON.parse(cachedLook), false);
  } catch {}
  load().then((s) => {
    apply(effective(s));
    applyLook(s.look, false);
  });
  onChange((s) => {
    apply(effective(s));
    applyLook(s.look, true);
  });
})();
