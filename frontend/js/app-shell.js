/**
 * app-shell.js — injects the sidebar / topbar / mobile bottom nav into every
 * authenticated page, and enforces login via MindCareAuth.requireAuth().
 *
 * Usage: set <body data-page="dashboard"> (or assessment / results / wellness
 * / profile) and include a <div id="app-shell-mount"></div> as the only
 * direct child of <body> wrapping the page's own content inside
 * <div id="page-content">...</div>.
 */

const MC_ICONS = {
  home: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 11.5 12 4l8 7.5"/><path d="M6 10v9a1 1 0 0 0 1 1h3v-5h4v5h3a1 1 0 0 0 1-1v-9"/></svg>`,
  clipboard: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="6" y="4" width="12" height="17" rx="2"/><path d="M9 4V3a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v1"/><path d="M9 11h6M9 15h6"/></svg>`,
  chart: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3v18h18"/><path d="m19 9-5 5-4-4-3 3"/></svg>`,
  history: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7"/><path d="M3 4v5h5"/><path d="M12 8v5l3 2"/></svg>`,
  leaf: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c9 0 14-5 14-14 0 0-13-2-14 9-.4 3 0 5 0 5Z"/><path d="M5 20c0-6 3-9 8-11"/></svg>`,
  chat: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 11.5a8.5 8.5 0 0 1-8.5 8.5H4l2.4-3.6a8.5 8.5 0 1 1 14.6-4.9Z"/></svg>`,
  user: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="8" r="3.5"/><path d="M5 20c1.5-4 4.2-6 7-6s5.5 2 7 6"/></svg>`,
  logout: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9 4H6a2 2 0 0 0-2 2v12a2 2 0 0 0 2 2h3"/><path d="M15 16l4-4-4-4"/><path d="M19 12H9"/></svg>`,
  menu: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M4 12h16M4 17h16"/></svg>`,
  bell: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M18 8a6 6 0 1 0-12 0c0 7-3 9-3 9h18s-3-2-3-9"/><path d="M13.7 21a2 2 0 0 1-3.4 0"/></svg>`,
  moon: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M21 12.8A9 9 0 1 1 11.2 3a7 7 0 0 0 9.8 9.8Z"/></svg>`,
  activity: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M22 12h-4l-3 8-6-16-3 8H2"/></svg>`,
  book: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 5.5A2.5 2.5 0 0 1 6.5 3H20v15H6.5A2.5 2.5 0 0 0 4 20.5v-15Z"/><path d="M4 20.5A2.5 2.5 0 0 1 6.5 18H20"/></svg>`,
  phone: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="7" y="2" width="10" height="20" rx="2"/><path d="M11 18h2"/></svg>`,
  gauge: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 13a8 8 0 1 1 16 0"/><path d="M12 13l4-4"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>`,
  send: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 12 20 4l-6 16-3-7-7-1Z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 7h16M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2m-8 0 1 13a1 1 0 0 0 1 1h6a1 1 0 0 0 1-1l1-13"/></svg>`,
  close: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M6 6l12 12M18 6 6 18"/></svg>`,
  eye: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/></svg>`,
  eyeOff: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 3l18 18"/><path d="M10.6 5.2A10.6 10.6 0 0 1 12 5c6.5 0 10 7 10 7a15.4 15.4 0 0 1-3.2 4.1M6.2 6.2C3.6 8 2 12 2 12s3.5 7 10 7a10 10 0 0 0 4.1-.9"/><path d="M9.5 9.5a3 3 0 0 0 4.2 4.2"/></svg>`,
  mood: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><path d="M8 14s1.5 2 4 2 4-2 4-2"/><line x1="9" y1="9" x2="9.01" y2="9"/><line x1="15" y1="9" x2="15.01" y2="9"/></svg>`,
  journal: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><line x1="8" y1="7" x2="16" y2="7"/><line x1="8" y1="11" x2="14" y2="11"/></svg>`,
  resources: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>`,
  breathing: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M9.59 4.59A2 2 0 1 1 11 8H2m10.59 11.41A2 2 0 1 0 14 16H2m15.73-8.27A2.5 2.5 0 1 1 19.5 12H2"/></svg>`,
  flame: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z"/></svg>`,
  target: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="6"/><circle cx="12" cy="12" r="2"/></svg>`,
  shield: `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z"/></svg>`,
};
if (typeof window !== "undefined") window.MC_ICONS = MC_ICONS;

const NAV_ITEMS = [
  { key: "home", href: "index.html", label: "Home", icon: MC_ICONS.home },
  { key: "assessment", href: "assessment.html", label: "Assessment", icon: MC_ICONS.clipboard },
  { key: "dashboard", href: "dashboard.html", label: "Dashboard", icon: MC_ICONS.chart },
  { key: "mood", href: "mood.html", label: "Mood", icon: MC_ICONS.mood },
  { key: "journal", href: "journal.html", label: "Journal", icon: MC_ICONS.journal },
  { key: "chat", href: "#chat", label: "AI Chat", icon: MC_ICONS.chat, action: "openChat" },
  { key: "resources", href: "resources.html", label: "Resources", icon: MC_ICONS.resources },
  { key: "profile", href: "profile.html", label: "Profile", icon: MC_ICONS.user },
];

function mcShowLogoutConfirm() {
  const existing = document.getElementById("mc-logout-modal");
  if (existing) existing.remove();

  const backdrop = document.createElement("div");
  backdrop.id = "mc-logout-modal";
  backdrop.className = "mc-modal-backdrop";
  backdrop.innerHTML = `
    <div class="mc-modal" role="dialog" aria-modal="true" aria-labelledby="mc-logout-title">
      <div class="mc-modal-header">
        <div class="icon-badge">${MC_ICONS.logout}</div>
        <h3 id="mc-logout-title">Confirm Logout</h3>
      </div>
      <p>Are you sure you want to log out of your MindCare AI account?</p>
      <div class="mc-modal-actions">
        <button type="button" class="btn btn-secondary btn-sm" id="mc-modal-cancel">Cancel</button>
        <button type="button" class="btn btn-danger btn-sm" id="mc-modal-confirm">Log Out</button>
      </div>
    </div>
  `;
  document.body.appendChild(backdrop);
  requestAnimationFrame(() => backdrop.classList.add("active"));

  const close = () => {
    backdrop.classList.remove("active");
    setTimeout(() => backdrop.remove(), 200);
  };

  backdrop.querySelector("#mc-modal-cancel").addEventListener("click", close);
  backdrop.addEventListener("click", (e) => {
    if (e.target === backdrop) close();
  });
  backdrop.querySelector("#mc-modal-confirm").addEventListener("click", () => {
    MindCareAuth.logoutUser();
  });
}

function mcInitAppShell() {
  const user = MindCareAuth.requireAuth();
  if (!user) return null;

  const body = document.body;
  const activeKey = body.dataset.page || "dashboard";
  const mount = document.getElementById("app-shell-mount");
  const pageContent = document.getElementById("page-content");
  if (!mount || !pageContent) return user;

  const contentHTML = pageContent.innerHTML;

  const effectiveNav = [...NAV_ITEMS];
  if (user.role === "admin") {
    effectiveNav.push({
      key: "admin",
      href: "admin.html",
      label: "Admin Portal",
      icon: MC_ICONS.shield,
    });
  }

  mount.innerHTML = `
    <div class="app-shell">
      <aside class="sidebar">
        <a href="index.html" class="brand">
          <span class="mark">${mcBrandMarkSVG()}</span> MindCare AI
        </a>
        <ul class="nav-list">
          ${effectiveNav.map((item) => {
            const isActive = item.key === activeKey || 
              (item.key === "dashboard" && (activeKey === "dashboard" || activeKey === "results" || activeKey === "result"));
            return `
            <li>
              <a href="${item.href}" class="${isActive ? "active" : ""}" ${item.action ? `data-action="${item.action}"` : ""}>
                ${item.icon}<span>${item.label}</span>
              </a>
            </li>`;
          }).join("")}
        </ul>
        <div class="sidebar-footer">
          <div class="user-chip">
            <div class="user-avatar">${MindCareAuth.initials(user.name)}</div>
            <div class="user-info">
              <div class="name" title="${mcEscape(user.name)}">${mcEscape(user.name)}</div>
              <div class="email" title="${mcEscape(user.email)}">${mcEscape(user.email)}</div>
            </div>
          </div>
          <div class="sidebar-actions-row">
            <button type="button" class="sidebar-action-btn theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme">
              ${typeof MindCareTheme !== "undefined" && MindCareTheme.get() === "dark" ? MindCareTheme.ICONS.sun : (typeof MindCareTheme !== "undefined" ? MindCareTheme.ICONS.moon : "")}
              <span>Theme</span>
            </button>
            <button type="button" class="sidebar-action-btn logout-btn" id="mc-logout-desktop" title="Log Out">
              ${MC_ICONS.logout}
              <span>Log Out</span>
            </button>
          </div>
        </div>
      </aside>

      <div class="main-area">
        <header class="topbar">
          <a href="index.html" class="brand" style="font-size:1.05rem;">
            <span class="mark" style="width:28px;height:28px;">${mcBrandMarkSVG(16)}</span> MindCare AI
          </a>
          <div class="topbar-actions">
            <button type="button" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme" style="width:34px;height:34px;">
              ${typeof MindCareTheme !== "undefined" && MindCareTheme.get() === "dark" ? MindCareTheme.ICONS.sun : (typeof MindCareTheme !== "undefined" ? MindCareTheme.ICONS.moon : "")}
            </button>
            <button type="button" class="topbar-chat-btn" id="mc-topbar-chat" title="Open AI Chatbot">
              ${MC_ICONS.chat}
            </button>
            <a href="profile.html" class="user-avatar" style="width:32px;height:32px;font-size:0.78rem;" title="Profile">
              ${MindCareAuth.initials(user.name)}
            </a>
            <button type="button" class="logout-btn-compact" id="mc-logout-topbar" style="width:auto; margin:0; padding:6px 12px;" title="Logout">
              ${MC_ICONS.logout}
            </button>
          </div>
        </header>
        <div class="page-body" id="page-body-target"></div>
      </div>
    </div>

    <nav class="mobile-nav">
      <a href="dashboard.html" class="${activeKey === 'dashboard' ? 'active' : ''}">
        ${MC_ICONS.chart}<span>Dash</span>
      </a>
      <a href="assessment.html" class="${activeKey === 'assessment' ? 'active' : ''}">
        ${MC_ICONS.clipboard}<span>Assess</span>
      </a>
      <a href="mood.html" class="${activeKey === 'mood' ? 'active' : ''}">
        ${MC_ICONS.mood}<span>Mood</span>
      </a>
      <a href="journal.html" class="${activeKey === 'journal' ? 'active' : ''}">
        ${MC_ICONS.journal}<span>Journal</span>
      </a>
      <a href="#chat" id="mc-mobile-chat">
        ${MC_ICONS.chat}<span>Chat</span>
      </a>
      <a href="profile.html" class="${activeKey === 'profile' ? 'active' : ''}">
        ${MC_ICONS.user}<span>Profile</span>
      </a>
      <button type="button" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme" style="border:none;background:none;color:var(--ink-faint);display:flex;flex-direction:column;align-items:center;gap:3px;font-size:0.65rem;font-weight:700;padding:4px 8px;cursor:pointer;width:auto;height:auto;">
        ${typeof MindCareTheme !== "undefined" && MindCareTheme.get() === "dark" ? MindCareTheme.ICONS.sun : (typeof MindCareTheme !== "undefined" ? MindCareTheme.ICONS.moon : "")}
        <span>Theme</span>
      </button>
    </nav>
  `;

  document.getElementById("page-body-target").innerHTML = contentHTML;
  pageContent.remove();

  // Wire up logout with confirmation modal
  const logoutDesktop = document.getElementById("mc-logout-desktop");
  if (logoutDesktop) logoutDesktop.addEventListener("click", mcShowLogoutConfirm);

  const logoutTopbar = document.getElementById("mc-logout-topbar");
  if (logoutTopbar) logoutTopbar.addEventListener("click", mcShowLogoutConfirm);

  const logoutMobile = document.getElementById("mc-mobile-logout");
  if (logoutMobile) logoutMobile.addEventListener("click", mcShowLogoutConfirm);

  // Wire up chat action triggers
  const openChat = (e) => {
    if (e) e.preventDefault();
    const fab = document.getElementById("mc-chat-fab");
    const panel = document.getElementById("mc-chat-panel");
    if (panel && !panel.classList.contains("open")) {
      fab?.click();
    } else if (panel) {
      document.getElementById("mc-chat-input")?.focus();
    }
  };

  document.querySelectorAll('[data-action="openChat"], #mc-topbar-chat, #mc-mobile-chat').forEach((btn) => {
    btn.addEventListener("click", openChat);
  });

  mcRenderDataIcons();
  if (typeof MindCareTheme !== "undefined") {
    MindCareTheme.updateButtons();
  }

  return user;
}

/**
 * Fills any `<div class="icon-wrap" data-icon="name"></div>` placeholder in
 * the current page with its matching icon from MC_ICONS. Keeps icon markup
 * out of the HTML pages themselves so pages can just declare which icon they
 * want.
 */
function mcRenderDataIcons() {
  document.querySelectorAll("[data-icon]").forEach((el) => {
    const icon = MC_ICONS[el.dataset.icon];
    if (icon) el.innerHTML = icon;
  });
}

function mcBrandMarkSVG(size = 20) {
  return `<svg width="${size}" height="${size}" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c9 0 14-5 14-14 0 0-13-2-14 9-.4 3 0 5 0 5Z"/><path d="M5 20c0-6 3-9 8-11"/></svg>`;
}

function mcEscape(str) {
  const div = document.createElement("div");
  div.textContent = str == null ? "" : String(str);
  return div.innerHTML;
}

/** Shared circular gauge SVG used on the dashboard and result page. */
function mcGaugeSVG(score, size = 150) {
  const radius = size >= 200 ? 96 : 60;
  const viewSize = size >= 200 ? 220 : 150;
  const center = viewSize / 2;
  const circumference = 2 * Math.PI * radius;
  const pct = Math.max(0, Math.min(1, score / 10));
  const offset = circumference * (1 - pct);
  return `
    <svg viewBox="0 0 ${viewSize} ${viewSize}">
      <circle class="gauge-track" cx="${center}" cy="${center}" r="${radius}" />
      <circle class="gauge-fill" cx="${center}" cy="${center}" r="${radius}"
        stroke-dasharray="${circumference}" stroke-dashoffset="${offset}" />
    </svg>`;
}
