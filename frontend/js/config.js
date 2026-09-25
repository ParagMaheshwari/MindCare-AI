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
  // Replace with your production backend URL once assigned, or keep null for local dev
  API_BASE_URL: null
};
