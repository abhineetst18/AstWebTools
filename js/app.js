/**
 * app.js — view routing and shared UI for My Tools
 * Hash-based navigation: #phev, #home (default)
 */

const VIEWS = ['home', 'phev'];
let themeKey = 'mytools_theme';

// ── Theme ────────────────────────────────────────────────
function applyTheme(theme) {
  document.documentElement.dataset.theme = theme === 'light' ? 'light' : 'dark';
}

function toggleTheme() {
  const current = document.documentElement.dataset.theme || 'dark';
  const next = current === 'dark' ? 'light' : 'dark';
  localStorage.setItem(themeKey, next);
  applyTheme(next);
}

// ── Navigation ───────────────────────────────────────────
function showView(id) {
  if (!VIEWS.includes(id)) id = 'home';
  VIEWS.forEach(v => {
    const el = document.getElementById(`view-${v}`);
    if (el) el.classList.toggle('active', v === id);
  });
  // Update hash without triggering another hashchange
  const hash = id === 'home' ? '' : id;
  if (window.location.hash.slice(1) !== hash) {
    history.pushState(null, '', hash ? `#${hash}` : window.location.pathname);
  }
  // Scroll to top
  window.scrollTo(0, 0);
}

// ── Greeting ─────────────────────────────────────────────
function updateGreeting() {
  const el = document.getElementById('greeting-time');
  if (!el) return;
  const h = new Date().getHours();
  el.textContent = h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening';
}

// ── Init ─────────────────────────────────────────────────
function init() {
  // Restore theme
  const savedTheme = localStorage.getItem(themeKey) || 'dark';
  applyTheme(savedTheme);

  // Theme toggle buttons
  document.querySelectorAll('#theme-btn, #theme-btn-phev').forEach(btn => {
    btn.addEventListener('click', toggleTheme);
  });

  // data-view navigation buttons
  document.querySelectorAll('[data-view]').forEach(btn => {
    btn.addEventListener('click', () => showView(btn.dataset.view));
  });

  // Browser back/forward
  window.addEventListener('popstate', () => {
    const hash = window.location.hash.slice(1);
    const id = VIEWS.includes(hash) ? hash : 'home';
    VIEWS.forEach(v => {
      const el = document.getElementById(`view-${v}`);
      if (el) el.classList.toggle('active', v === id);
    });
  });

  // Initial route from hash
  const initHash = window.location.hash.slice(1);
  if (VIEWS.includes(initHash)) {
    showView(initHash);
  } else {
    showView('home');
  }

  updateGreeting();

  // Register service worker
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.register('./sw.js').catch(() => {/* non-critical */});
  }
}

document.addEventListener('DOMContentLoaded', init);
