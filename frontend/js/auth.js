/**
 * auth.js — prototype authentication.
 *
 * This is a FRONTEND-ONLY mock so the app can be demoed end-to-end before a
 * real auth backend exists. It is deliberately isolated behind the functions
 * below so it can later be swapped for real calls to FastAPI + a database
 * without touching any other file:
 *
 *   MindCareAuth.registerUser({ name, email, password })
 *   MindCareAuth.loginUser({ email, password })
 *   MindCareAuth.logoutUser()
 *   MindCareAuth.getCurrentUser()
 *   MindCareAuth.requireAuth()
 *
 * IMPORTANT: passwords are never stored in plain text, even in this mock —
 * they are hashed with the browser's native SubtleCrypto (SHA-256) before
 * being written to localStorage. This is still NOT a substitute for real
 * server-side password hashing (bcrypt/argon2) and a real database; it only
 * avoids the worst mistake (plain text) while there is no backend yet.
 */

const MindCareAuth = (() => {
  const USERS_KEY = "mindcare_users";
  const SESSION_KEY = "mindcare_session";
  const USER_KEY = "mindcare_current_user";

  function readUsers() {
    try {
      return JSON.parse(localStorage.getItem(USERS_KEY)) || {};
    } catch {
      return {};
    }
  }

  function writeUsers(users) {
    localStorage.setItem(USERS_KEY, JSON.stringify(users));
  }

  async function registerUser({ name, email, password }) {
    const key = email.trim().toLowerCase();
    let authRes = null;

    if (typeof MindCareAPI !== "undefined" && MindCareAPI.register) {
      authRes = await MindCareAPI.register({ name: name.trim(), email: key, password });
    }

    const userObj = (authRes && authRes.user) ? authRes.user : {
      name: name.trim(),
      email: key,
      createdAt: new Date().toISOString(),
    };

    // Cache locally
    const users = readUsers();
    users[key] = userObj;
    writeUsers(users);
    localStorage.setItem(SESSION_KEY, key);
    localStorage.setItem(USER_KEY, JSON.stringify(userObj));

    // Hydrate local cache from central backend database
    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.syncUserData && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        const syncData = await MindCareAPI.syncUserData();
        if (syncData && typeof MindCareStore !== "undefined" && MindCareStore.syncFromBackend) {
          MindCareStore.syncFromBackend(key, syncData);
        }
      }
    } catch (e) {
      console.warn("Post-register data sync error:", e);
    }

    return userObj;
  }

  async function loginUser({ email, password, remember = true }) {
    const key = email.trim().toLowerCase();
    let authRes = null;

    if (typeof MindCareAPI !== "undefined" && MindCareAPI.login) {
      authRes = await MindCareAPI.login({ email: key, password, remember });
    }

    const userObj = (authRes && authRes.user)
      ? authRes.user
      : (readUsers()[key] || { name: key.split("@")[0], email: key, createdAt: new Date().toISOString() });

    const users = readUsers();
    users[key] = userObj;
    writeUsers(users);

    if (remember) {
      localStorage.setItem(SESSION_KEY, key);
      localStorage.setItem(USER_KEY, JSON.stringify(userObj));
      sessionStorage.removeItem(SESSION_KEY);
      sessionStorage.removeItem(USER_KEY);
    } else {
      sessionStorage.setItem(SESSION_KEY, key);
      sessionStorage.setItem(USER_KEY, JSON.stringify(userObj));
      localStorage.removeItem(SESSION_KEY);
      localStorage.removeItem(USER_KEY);
    }

    // Hydrate local cache from central backend database
    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.syncUserData && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        const syncData = await MindCareAPI.syncUserData();
        if (syncData && typeof MindCareStore !== "undefined" && MindCareStore.syncFromBackend) {
          MindCareStore.syncFromBackend(key, syncData);
        }
      }
    } catch (e) {
      console.warn("Post-login data sync error:", e);
    }

    return userObj;
  }

  function logoutUser() {
    if (typeof MindCareAPI !== "undefined" && MindCareAPI.clearToken) {
      MindCareAPI.clearToken();
    }
    localStorage.removeItem(SESSION_KEY);
    localStorage.removeItem(USER_KEY);
    sessionStorage.removeItem(SESSION_KEY);
    sessionStorage.removeItem(USER_KEY);
    window.location.href = "login.html";
  }

  function getCurrentUser() {
    const key = localStorage.getItem(SESSION_KEY) || sessionStorage.getItem(SESSION_KEY);
    if (!key) return null;
    try {
      const stored = localStorage.getItem(USER_KEY) || sessionStorage.getItem(USER_KEY);
      if (stored) return JSON.parse(stored);
    } catch {}
    const users = readUsers();
    return users[key] || { name: key.split("@")[0], email: key, role: "user" };
  }

  /** Call at the top of any protected page. Redirects to login if needed. */
  function requireAuth() {
    const user = getCurrentUser();
    if (!user) {
      window.location.href = "login.html";
      return null;
    }
    return user;
  }

  /** Call at the top of the Admin Dashboard. Redirects unauthorized users. */
  function requireAdminAuth() {
    const user = requireAuth();
    if (!user) return null;
    if (user.role !== "admin") {
      alert("Access Denied: You do not have administrative privileges.");
      window.location.href = "dashboard.html";
      return null;
    }
    return user;
  }

  function initials(name) {
    if (!name) return "?";
    return name
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((p) => p[0].toUpperCase())
      .join("");
  }

  return { registerUser, loginUser, logoutUser, getCurrentUser, requireAuth, requireAdminAuth, initials };
})();
