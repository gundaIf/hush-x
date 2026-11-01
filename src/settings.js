// Shared by the content script and the popup.
(() => {
  const FEATURES = [
    { key: 'engagement', group: 'Numbers', title: 'Engagement counts', desc: 'Likes, reposts, replies, saves', icon: 'heart' },
    { key: 'views', group: 'Numbers', title: 'View counts', desc: 'Impressions and analytics', icon: 'chart' },
    { key: 'followers', group: 'Numbers', title: 'Follower counts', desc: 'Followers, following, posts', icon: 'users' },
    { key: 'bell', group: 'Numbers', title: 'Notification badge', desc: 'The unread count on the bell', icon: 'bell' },
    { key: 'title', group: 'Numbers', title: 'Tab title count', desc: '“(3) Home / X” → “Home / X”', icon: 'tab' },
    { key: 'newPosts', group: 'Feed', title: 'New posts pill', desc: '“Show 35 posts” up top', icon: 'arrowUp' },
    { key: 'forYou', group: 'Feed', title: 'For You → Following', desc: 'Only people you follow', icon: 'spark' },
    { key: 'mentions', group: 'Feed', title: 'Mentions only', desc: 'No likes or milestone alerts', icon: 'at' },
    { key: 'sidebar', group: 'Feed', title: 'Right sidebar', desc: 'Trends, news, who to follow', icon: 'sidebar' },
    { key: 'injections', group: 'Feed', title: 'Suggestions & ads', desc: 'Promoted, who to follow', icon: 'megaphone' },
  ];

  const MODES = ['off', 'custom', 'hardcore'];
  // Look settings change how X looks rather than what it shows, so they apply in every mode.
  // theme: null leaves X's own choice alone.
  const THEMES = [null, 'light', 'dim', 'dark'];
  const GRAYS = ['off', 'media', 'all'];
  const DEFAULTS = {
    mode: 'custom',
    features: Object.fromEntries(FEATURES.map((f) => [f.key, true])),
    look: { theme: null, gray: 'off', stopAutoplay: true },
  };

  // Outside the extension (previewing popup.html as a plain file) fall back to localStorage.
  const area = globalThis.chrome?.storage?.sync;

  function normalize(s) {
    const look = { ...DEFAULTS.look, ...(s?.look || {}) };
    if (!THEMES.includes(look.theme)) look.theme = null;
    if (!GRAYS.includes(look.gray)) look.gray = 'off';
    look.stopAutoplay = !!look.stopAutoplay;
    return {
      mode: MODES.includes(s?.mode) ? s.mode : DEFAULTS.mode,
      features: { ...DEFAULTS.features, ...(s?.features || {}) },
      look,
    };
  }

  async function load() {
    if (area) {
      const { hush } = await area.get('hush');
      return normalize(hush);
    }
    try {
      return normalize(JSON.parse(localStorage.getItem('hush:preview')));
    } catch {
      return normalize();
    }
  }

  async function save(s) {
    if (area) return area.set({ hush: s });
    try {
      localStorage.setItem('hush:preview', JSON.stringify(s));
    } catch {}
  }

  function onChange(cb) {
    globalThis.chrome?.storage?.onChanged?.addListener((changes, areaName) => {
      if (areaName === 'sync' && changes.hush) cb(normalize(changes.hush.newValue));
    });
  }

  // The set of feature keys that are actually muted right now.
  function effective(s) {
    if (s.mode === 'off') return new Set();
    if (s.mode === 'hardcore') return new Set(FEATURES.map((f) => f.key));
    return new Set(FEATURES.filter((f) => s.features[f.key]).map((f) => f.key));
  }

  globalThis.HushSettings = { FEATURES, MODES, DEFAULTS, load, save, onChange, effective };
})();
