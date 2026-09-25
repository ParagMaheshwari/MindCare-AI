/**
 * theme.js — MindCare AI Theme Manager
 * Supports 'light' and 'dark' themes with localStorage persistence,
 * system preference detection, and instant multi-element sync.
 */

const MindCareTheme = (() => {
  const STORAGE_KEY = "mindcare_theme";

  const ICONS = {
    sun: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>`,
    moon: `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>`,
  };

  function get() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved === "dark" || saved === "light") return saved;
    return "dark";
  }

  function set(theme) {
    const target = theme === "dark" ? "dark" : "light";
    localStorage.setItem(STORAGE_KEY, target);
    document.documentElement.setAttribute("data-theme", target);
    updateButtons();
    window.dispatchEvent(new CustomEvent("mc-theme-changed", { detail: { theme: target } }));
  }

  function toggle() {
    const current = get();
    const next = current === "dark" ? "light" : "dark";
    set(next);
    return next;
  }

  function updateButtons() {
    const current = get();
    const isDark = current === "dark";
    const buttons = document.querySelectorAll(".theme-toggle-btn");
    buttons.forEach((btn) => {
      if (btn.classList.contains("sidebar-action-btn")) {
        btn.innerHTML = `${isDark ? ICONS.sun : ICONS.moon}<span>${isDark ? "Light" : "Dark"}</span>`;
      } else if (btn.closest(".mobile-nav")) {
        btn.innerHTML = `${isDark ? ICONS.sun : ICONS.moon}<span>Theme</span>`;
      } else {
        btn.innerHTML = isDark ? ICONS.sun : ICONS.moon;
      }
      btn.setAttribute("aria-label", isDark ? "Switch to light theme" : "Switch to dark theme");
      btn.setAttribute("title", isDark ? "Switch to light theme" : "Switch to dark theme");
    });
  }

  function init() {
    const current = get();
    document.documentElement.setAttribute("data-theme", current);
    updateButtons();

    if (window.matchMedia) {
      window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", (e) => {
        if (!localStorage.getItem(STORAGE_KEY)) {
          set(e.matches ? "dark" : "light");
        }
      });
    }

    document.addEventListener("click", (e) => {
      const btn = e.target.closest(".theme-toggle-btn");
      if (btn) {
        e.preventDefault();
        toggle();
      }
    });
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

  return { get, set, toggle, updateButtons, ICONS };
})();
