const { FEATURES, load, save, effective } = HushSettings;

const ICONS = {
  heart: '<path d="M12 20s-7-4.35-7-10a4 4 0 0 1 7-2.65A4 4 0 0 1 19 10c0 5.65-7 10-7 10z"/>',
  chart: '<path d="M5 20v-8M12 20V4M19 20v-5"/>',
  users: '<circle cx="9" cy="8" r="3.5"/><path d="M2.5 20c.8-3.5 3.4-5.5 6.5-5.5s5.7 2 6.5 5.5M16 4.6a3.5 3.5 0 0 1 0 6.8M18 14.8c1.9.7 3.1 2.5 3.5 5.2"/>',
  bell: '<path d="M6 9a6 6 0 1 1 12 0c0 6 2.5 7.5 2.5 7.5h-17S6 15 6 9z"/><path d="M10 20a2 2 0 0 0 4 0"/>',
  tab: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M3 9.5h18M6.5 7.25h4"/>',
  arrowUp: '<path d="M12 19V6M6.5 11.5 12 6l5.5 5.5"/>',
  spark: '<path d="M12 3.5l1.9 5.1 5.1 1.9-5.1 1.9-1.9 5.1-1.9-5.1-5.1-1.9 5.1-1.9z"/><path d="M18.5 16.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z"/>',
  at: '<circle cx="12" cy="12" r="3.5"/><path d="M15.5 12v1.25a2.75 2.75 0 0 0 5.5 0V12a9 9 0 1 0-3.5 7.1"/>',
  sidebar: '<rect x="3" y="4" width="18" height="16" rx="2.5"/><path d="M15 4v16"/>',
  megaphone: '<path d="M4 10v4a1 1 0 0 0 1 1h2l6 4V5L7 9H5a1 1 0 0 0-1 1z"/><path d="M17 9a4 4 0 0 1 0 6"/>',
  play: '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M10 9.5v5l4.5-2.5z"/>',
  lock: '<rect x="5" y="11" width="14" height="9" rx="2"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/>',
};

const NOTES = {
  off: 'X as usual. Nothing is muted.',
  custom: 'Choose exactly what stays quiet.',
  hardcore: 'Everything muted and locked. Leaving takes a deliberate hold.',
};

const THEME_HINTS = {
  null: 'Using X’s own setting. Pick one to switch every open X tab.',
  light: 'Open X tabs reload once to switch. Click again to go back to X’s setting.',
  dim: 'Open X tabs reload once to switch. Click again to go back to X’s setting.',
  dark: 'Open X tabs reload once to switch. Click again to go back to X’s setting.',
};

const GRAY_HINTS = {
  off: 'Full color.',
  media: 'Photos, video and avatars in gray.',
  all: 'The whole page in gray.',
};

const HOLD_MS = 1600;

const app = document.getElementById('app');
const list = document.getElementById('list');
const note = document.getElementById('note');
const hold = document.getElementById('hold');
const holdBtn = document.getElementById('holdBtn');
const count = document.getElementById('count');
const ticks = document.getElementById('ticks');
const graySeg = document.getElementById('graySeg');
const autoplayRow = document.getElementById('autoplayRow');

let state;
let pendingMode = null;

const svg = (name) => `<svg viewBox="0 0 24 24" aria-hidden="true">${ICONS[name]}</svg>`;

function build() {
  document.getElementById('autoplayIco').innerHTML = svg('play');
  ticks.innerHTML = FEATURES.map(() => '<span class="tick"></span>').join('');

  const groups = [...new Set(FEATURES.map((f) => f.group))];
  list.innerHTML = groups
    .map(
      (g) => `
      <div class="group">
        <p class="group-label">${g}</p>
        <div class="card">
          ${FEATURES.filter((f) => f.group === g)
            .map(
              (f) => `
            <button type="button" class="row" role="switch" data-key="${f.key}" aria-checked="false">
              <span class="ico">${svg(f.icon)}</span>
              <span class="row-text">
                <span class="row-title">${f.title}</span>
                <span class="row-desc">${f.desc}</span>
              </span>
              <span class="sw" aria-hidden="true"></span>
              <span class="lock" aria-hidden="true">${svg('lock')}</span>
            </button>`
            )
            .join('')}
        </div>
      </div>`
    )
    .join('');
}

function render() {
  const live = effective(state);
  app.dataset.mode = state.mode;
  note.textContent = NOTES[state.mode];

  for (const b of document.querySelectorAll('.seg button')) {
    b.setAttribute('aria-checked', String(b.dataset.mode === state.mode));
  }
  // Off still shows your Custom picks (dimmed) so switching back feels familiar.
  for (const row of list.querySelectorAll('.row')) {
    const k = row.dataset.key;
    const checked = state.mode === 'hardcore' || state.features[k];
    row.setAttribute('aria-checked', String(checked));
    row.setAttribute('aria-disabled', String(state.mode === 'hardcore'));
  }

  count.textContent = live.size;
  [...ticks.children].forEach((t, i) => t.classList.toggle('on', i < live.size));

  const { theme, gray, stopAutoplay } = state.look;
  for (const b of document.querySelectorAll('.theme')) b.setAttribute('aria-checked', String(b.dataset.theme === theme));
  document.getElementById('themeHint').textContent = THEME_HINTS[theme];
  graySeg.dataset.value = gray;
  for (const b of graySeg.querySelectorAll('button')) b.setAttribute('aria-checked', String(b.dataset.gray === gray));
  document.getElementById('grayHint').textContent = GRAY_HINTS[gray];
  autoplayRow.setAttribute('aria-checked', String(stopAutoplay));
}

async function setLook(patch) {
  Object.assign(state.look, patch);
  render();
  await save(state);
}

// ---------- tabs ----------

function showTab(name) {
  for (const t of document.querySelectorAll('.tabs button')) {
    const active = t.dataset.tab === name;
    t.setAttribute('aria-selected', String(active));
    document.getElementById(t.getAttribute('aria-controls')).hidden = !active;
  }
  try {
    localStorage.setItem('hush:tab', name);
  } catch {}
}

document.querySelector('.tabs').addEventListener('click', (e) => {
  const t = e.target.closest('button[data-tab]');
  if (t) showTab(t.dataset.tab);
});

// ---------- look ----------

document.getElementById('themes').addEventListener('click', (e) => {
  const b = e.target.closest('.theme');
  // Clicking the active theme hands control back to X's own setting.
  if (b) setLook({ theme: b.dataset.theme === state.look.theme ? null : b.dataset.theme });
});

graySeg.addEventListener('click', (e) => {
  const b = e.target.closest('button[data-gray]');
  if (b) setLook({ gray: b.dataset.gray });
});

autoplayRow.addEventListener('click', () => setLook({ stopAutoplay: !state.look.stopAutoplay }));

async function setMode(mode) {
  state.mode = mode;
  closeHold();
  render();
  await save(state);
}

function requestMode(mode) {
  if (mode === state.mode) return closeHold();
  if (state.mode === 'hardcore') {
    pendingMode = mode;
    hold.hidden = false;
    holdBtn.querySelector('.hold-label').textContent = `Hold to switch to ${mode === 'off' ? 'Off' : 'Custom'}`;
    holdBtn.focus();
    return;
  }
  setMode(mode);
}

function closeHold() {
  pendingMode = null;
  hold.hidden = true;
  resetHold();
}

// ---------- hold to leave Hardcore ----------

let holdStart = 0;
let holdFrame = 0;

function startHold(e) {
  if (!pendingMode || holdStart) return;
  e.preventDefault();
  holdStart = performance.now();
  const step = (now) => {
    const p = Math.min(1, (now - holdStart) / HOLD_MS);
    holdBtn.style.setProperty('--p', p);
    if (p >= 1) {
      holdStart = 0;
      setMode(pendingMode);
      return;
    }
    holdFrame = requestAnimationFrame(step);
  };
  holdFrame = requestAnimationFrame(step);
}

function resetHold() {
  cancelAnimationFrame(holdFrame);
  holdStart = 0;
  holdBtn.style.setProperty('--p', 0);
}

holdBtn.addEventListener('pointerdown', startHold);
for (const ev of ['pointerup', 'pointerleave', 'pointercancel']) holdBtn.addEventListener(ev, resetHold);
holdBtn.addEventListener('keydown', (e) => {
  if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) startHold(e);
});
holdBtn.addEventListener('keyup', resetHold);
document.getElementById('holdStay').addEventListener('click', closeHold);

// ---------- events ----------

document.querySelector('.seg').addEventListener('click', (e) => {
  const b = e.target.closest('button[data-mode]');
  if (b) requestMode(b.dataset.mode);
});

list.addEventListener('click', async (e) => {
  const row = e.target.closest('.row');
  if (!row) return;
  if (state.mode === 'hardcore') {
    row.classList.remove('nudge');
    void row.offsetWidth; // restart the animation
    row.classList.add('nudge');
    return;
  }
  const k = row.dataset.key;
  state.features[k] = !state.features[k];
  // Touching a switch while Off means you want Hush back on.
  if (state.mode === 'off') state.mode = 'custom';
  render();
  await save(state);
});

build();
let savedTab = 'mute';
try {
  savedTab = localStorage.getItem('hush:tab') || 'mute';
} catch {}
showTab(savedTab);
load().then((s) => {
  state = s;
  render();
  // Skip the entrance transitions on first paint.
  requestAnimationFrame(() => document.body.classList.add('ready'));
});
