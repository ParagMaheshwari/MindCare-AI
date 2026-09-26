/**
 * MindCare AI - Frontend Production Configuration
 *
 * If your FastAPI backend is hosted on a separate domain (e.g. Render, Railway, AWS):
 * Set API_BASE_URL to your backend URL, for example:
 *   API_BASE_URL: 'https://your-mindcare-backend.onrender.com'
 *
 * If your frontend is served from the same domain or behind a reverse proxy:
 * Leave API_BASE_URL as empty string or null:
 *   API_BASE_URL: ''
 *
 * For local development:
 * Leave as null (automatically resolves to http://127.0.0.1:8000 on localhost).
 */
window.MINDCARE_CONFIG = {
  // Automatically route to local backend on localhost/127.0.0.1, and production Render in deployment
  API_BASE_URL: (typeof window !== "undefined" && (window.location.hostname === "localhost" || window.location.hostname === "127.0.0.1"))
    ? "http://127.0.0.1:8000"
    : "https://mindcare-ai-backend-6sxk.onrender.com"
};
