/**
 * api.js — central API configuration and fetch helpers.
 * Every call to the FastAPI backend goes through here so the base URL
 * only ever needs to be changed in one place.
 */

const API_BASE_URL = (() => {
  if (typeof window !== "undefined") {
    // 1. Explicit global overrides
    if (window.__MINDCARE_API_BASE__) return window.__MINDCARE_API_BASE__.replace(/\/+$/, "");
    if (window.API_BASE_URL) return window.API_BASE_URL.replace(/\/+$/, "");
    if (window.MINDCARE_CONFIG && window.MINDCARE_CONFIG.API_BASE_URL) return window.MINDCARE_CONFIG.API_BASE_URL.replace(/\/+$/, "");

    // 2. Runtime browser override (for quick testing/verification in production console)
    try {
      const runtimeOverride = localStorage.getItem("MINDCARE_API_BASE");
      if (runtimeOverride) return runtimeOverride.replace(/\/+$/, "");
    } catch {}

    // 3. Localhost development fallback
    const host = window.location.hostname;
    if (host === "127.0.0.1" || host === "localhost" || host === "") {
      return "http://127.0.0.1:8000";
    }

    // 4. Production default: same-origin relative path (if served behind reverse proxy or co-located)
    return "";
  }
  return "http://127.0.0.1:8000";
})();

const MindCareAPI = (() => {
  const TOKEN_KEY = "mindcare_token";

  function getToken() {
    return localStorage.getItem(TOKEN_KEY) || sessionStorage.getItem(TOKEN_KEY) || null;
  }

  function setToken(token, remember = true) {
    if (token) {
      if (remember) {
        localStorage.setItem(TOKEN_KEY, token);
        sessionStorage.removeItem(TOKEN_KEY);
      } else {
        sessionStorage.setItem(TOKEN_KEY, token);
        localStorage.removeItem(TOKEN_KEY);
      }
    } else {
      localStorage.removeItem(TOKEN_KEY);
      sessionStorage.removeItem(TOKEN_KEY);
    }
  }

  function clearToken() {
    localStorage.removeItem(TOKEN_KEY);
    sessionStorage.removeItem(TOKEN_KEY);
  }

  function getAuthHeaders(includeJson = true) {
    const headers = {};
    if (includeJson) headers["Content-Type"] = "application/json";
    const token = getToken();
    if (token) {
      headers["Authorization"] = `Bearer ${token}`;
    }
    return headers;
  }

  /**
   * Generic POST helper with consistent, user-friendly error handling.
   */
  async function post(path, body) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage =
        "Unable to connect to the backend server. Please make sure FastAPI is running on port 8000.";
      throw err;
    }

    if (response.status === 400 || response.status === 401) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("auth_error");
      err.friendlyMessage = errData.detail || "Authentication failed. Please check your details.";
      throw err;
    }

    if (response.status === 403) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("forbidden");
      err.friendlyMessage = errData.detail || "Access denied. You do not have permission to view this resource.";
      throw err;
    }

    if (response.status === 422) {
      const err = new Error("validation_error");
      err.friendlyMessage = "Please check the entered information.";
      throw err;
    }

    if (response.status === 503) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("service_unavailable");
      err.friendlyMessage = errData.detail || "The service is temporarily unavailable. Please try again later.";
      throw err;
    }

    if (response.status >= 500) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("server_error");
      err.friendlyMessage = errData.detail || "Something went wrong on the server.";
      throw err;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("request_failed");
      err.friendlyMessage = errData.detail || "Something went wrong. Please try again.";
      throw err;
    }

    return response.json();
  }

  /**
   * Generic GET helper with authentication headers.
   */
  async function get(path) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "GET",
        headers: getAuthHeaders(false),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the backend server.";
      throw err;
    }

    if (response.status === 401) {
      const err = new Error("unauthorized");
      err.friendlyMessage = "Session expired or invalid. Please log in again.";
      throw err;
    }

    if (response.status === 403) {
      const err = new Error("forbidden");
      err.friendlyMessage = "Access denied.";
      throw err;
    }

    if (response.status === 404) {
      const err = new Error("not_found");
      err.friendlyMessage = "Requested record not found.";
      throw err;
    }

    if (!response.ok) {
      const err = new Error("request_failed");
      err.friendlyMessage = "Failed to load data from server.";
      throw err;
    }

    return response.json();
  }

  /**
   * Generic PATCH helper with authentication and JSON headers.
   */
  async function patch(path, body) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "PATCH",
        headers: getAuthHeaders(true),
        body: JSON.stringify(body),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the backend server.";
      throw err;
    }

    if (response.status === 401) {
      const err = new Error("unauthorized");
      err.friendlyMessage = "Session expired or invalid. Please log in again.";
      throw err;
    }

    if (response.status === 403) {
      const err = new Error("forbidden");
      err.friendlyMessage = "Access denied.";
      throw err;
    }

    if (response.status === 404) {
      const err = new Error("not_found");
      err.friendlyMessage = "Requested record not found.";
      throw err;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("request_failed");
      err.friendlyMessage = errData.detail || "Failed to update record on server.";
      throw err;
    }

    return response.json();
  }

  /**
   * Generic DELETE helper with authentication headers.
   */
  async function del(path) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}${path}`, {
        method: "DELETE",
        headers: getAuthHeaders(false),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the backend server.";
      throw err;
    }

    if (response.status === 401) {
      const err = new Error("unauthorized");
      err.friendlyMessage = "Session expired or invalid. Please log in again.";
      throw err;
    }

    if (response.status === 403) {
      const err = new Error("forbidden");
      err.friendlyMessage = "Access denied.";
      throw err;
    }

    if (response.status === 404) {
      const err = new Error("not_found");
      err.friendlyMessage = "Requested record not found.";
      throw err;
    }

    if (!response.ok) {
      const errData = await response.json().catch(() => ({}));
      const err = new Error("request_failed");
      err.friendlyMessage = errData.detail || "Failed to delete record on server.";
      throw err;
    }

    return response.json();
  }

  // ---------------------------------------------------------------------------
  // Authentication APIs
  // ---------------------------------------------------------------------------

  async function register({ name, email, password }) {
    const data = await post("/auth/register", { name, email, password });
    if (data.access_token) {
      setToken(data.access_token);
    }
    return data;
  }

  async function login({ email, password, remember = true }) {
    const data = await post("/auth/login", { email, password });
    if (data.access_token) {
      setToken(data.access_token, remember);
    }
    return data;
  }

  function getMe() {
    return get("/auth/me");
  }

  function forgotPassword(email) {
    return post("/auth/forgot-password", { email });
  }

  function testEmail(email) {
    return post("/test-email", { email });
  }

  function verifyResetToken(token) {
    return get(`/auth/verify-reset-token?token=${encodeURIComponent(token)}`);
  }

  function resetPassword({ token, new_password }) {
    return post("/auth/reset-password", { token, new_password });
  }

  // ---------------------------------------------------------------------------
  // Assessment & ML APIs (Database-backed)
  // ---------------------------------------------------------------------------

  function formatAssessmentPayload(formData) {
    return {
      age: Number(formData.age),
      gender: formData.gender,
      country: formData.country,
      academic_level: formData.academic_level,
      most_used_platform: formData.most_used_platform,
      purpose_of_use: formData.purpose_of_use,
      avg_daily_usage_hours: Number(formData.avg_daily_usage_hours),
      daily_unlocks: Number(formData.daily_unlocks),
      study_hours: Number(formData.study_hours),
      physical_activity_hours: Number(formData.physical_activity_hours),
      sleep_hours_per_night: Number(formData.sleep_hours_per_night),
      stress_level: formData.stress_level,
    };
  }

  /**
   * Evaluates ML prediction model and persists assessment in MySQL database.
   */
  function createAssessment(formData) {
    const payload = formatAssessmentPayload(formData);
    return post("/assessments", payload);
  }

  /**
   * Retrieves all previous assessments for current user from MySQL database.
   */
  function getAssessments() {
    return get("/assessments");
  }

  /**
   * Retrieves single assessment by ID from MySQL database.
   */
  function getAssessmentById(id) {
    return get(`/assessments/${id}`);
  }

  /**
   * Downloads official PDF assessment report generated from stored MySQL data.
   */
  async function downloadAssessmentReport(id) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/assessments/${id}/report`, {
        method: "GET",
        headers: getAuthHeaders(false),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the report generation server.";
      throw err;
    }

    if (!response.ok) {
      const err = new Error("report_generation_error");
      err.friendlyMessage = "Unable to generate the report from the database.";
      throw err;
    }

    return response.blob();
  }

  /**
   * Direct prediction endpoint (without requiring DB user session).
   */
  function predict(formData) {
    const payload = formatAssessmentPayload(formData);
    return post("/predict", payload);
  }

  function chat(message, history, context) {
    return post("/chat", {
      message,
      history: history || [],
      context: context || null,
    });
  }

  function reflectJournal(title, content) {
    return post("/journal/reflect", {
      title: title || "",
      content,
    });
  }

  async function downloadReportPDF(reportData) {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/report/pdf`, {
        method: "POST",
        headers: getAuthHeaders(true),
        body: JSON.stringify(reportData),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the report generation server.";
      throw err;
    }

    if (!response.ok) {
      const err = new Error("report_generation_error");
      err.friendlyMessage = "Unable to generate the report.";
      throw err;
    }

    return response.blob();
  }

  // ---------------------------------------------------------------------------
  // Central Data Sync API
  // ---------------------------------------------------------------------------

  function syncUserData() {
    return get("/user/data-sync");
  }

  // ---------------------------------------------------------------------------
  // Mood Check-In APIs
  // ---------------------------------------------------------------------------

  function createMood(moodData) {
    return post("/moods", {
      date: moodData.date || null,
      mood: Number(moodData.mood || 3),
      label: moodData.label || null,
      emoji: moodData.emoji || null,
      note: moodData.note || "",
      is_voice_entry: Boolean(moodData.isVoiceEntry),
      transcript: moodData.transcript || null,
      text_sentiment_score: moodData.textSentimentScore !== null && moodData.textSentimentScore !== undefined ? Number(moodData.textSentimentScore) : null,
      vocal_tone_score: moodData.vocalToneScore !== null && moodData.vocalToneScore !== undefined ? Number(moodData.vocalToneScore) : null,
      blended_mood_score: moodData.blendedMoodScore !== null && moodData.blendedMoodScore !== undefined ? Number(moodData.blendedMoodScore) : null,
      vocal_metrics: moodData.vocalMetrics || null,
    });
  }

  function getMoods() {
    return get("/moods");
  }

  function deleteMood(moodId) {
    const idNum = String(moodId).replace(/^m_/, "");
    return del(`/moods/${idNum}`);
  }

  // ---------------------------------------------------------------------------
  // Journal APIs
  // ---------------------------------------------------------------------------

  function createJournal(journalData) {
    return post("/journals", {
      title: journalData.title || "Untitled Reflection",
      content: journalData.content || "",
      date_str: journalData.dateStr || null,
      ai_reflection: journalData.aiReflection || null,
    });
  }

  function getJournals() {
    return get("/journals");
  }

  function getJournalById(id) {
    const idNum = String(id).replace(/^j_/, "");
    return get(`/journals/${idNum}`);
  }

  function deleteJournal(id) {
    const idNum = String(id).replace(/^j_/, "");
    return del(`/journals/${idNum}`);
  }

  // ---------------------------------------------------------------------------
  // Wellness Goals APIs
  // ---------------------------------------------------------------------------

  function createGoal(goalData) {
    return post("/goals", {
      title: goalData.title,
      category: goalData.category || "General",
      status: goalData.status || "in_progress",
    });
  }

  function getGoals() {
    return get("/goals");
  }

  function updateGoalStatus(goalId, status) {
    const idNum = String(goalId).replace(/^g_/, "");
    return patch(`/goals/${idNum}/status`, { status });
  }

  function deleteGoal(goalId) {
    const idNum = String(goalId).replace(/^g_/, "");
    return del(`/goals/${idNum}`);
  }

  // ---------------------------------------------------------------------------
  // Admin Dashboard APIs (Admin-Only)
  // ---------------------------------------------------------------------------

  function getAdminStats() {
    return get("/admin/stats");
  }

  function getAdminUsers({ q, role, status, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (role) params.set("role", role);
    if (status) params.set("status_filter", status);
    params.set("limit", limit);
    params.set("offset", offset);
    return get(`/admin/users?${params.toString()}`);
  }

  function getAdminUserDetail(userId) {
    return get(`/admin/users/${userId}`);
  }

  function getAdminAssessments({ q, category, limit = 50, offset = 0 } = {}) {
    const params = new URLSearchParams();
    if (q) params.set("q", q);
    if (category) params.set("category", category);
    params.set("limit", limit);
    params.set("offset", offset);
    return get(`/admin/assessments?${params.toString()}`);
  }

  async function downloadAdminUsersCSV() {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/admin/export/users`, {
        method: "GET",
        headers: getAuthHeaders(false),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the backend server.";
      throw err;
    }
    if (!response.ok) {
      const err = new Error("export_failed");
      err.friendlyMessage = "Failed to download users CSV export.";
      throw err;
    }
    return response.blob();
  }

  async function downloadAdminAssessmentsCSV() {
    let response;
    try {
      response = await fetch(`${API_BASE_URL}/admin/export/assessments`, {
        method: "GET",
        headers: getAuthHeaders(false),
      });
    } catch (networkError) {
      const err = new Error("network_error");
      err.friendlyMessage = "Unable to connect to the backend server.";
      throw err;
    }
    if (!response.ok) {
      const err = new Error("export_failed");
      err.friendlyMessage = "Failed to download assessments CSV export.";
      throw err;
    }
    return response.blob();
  }

  return {
    API_BASE_URL,
    getToken,
    hasToken: () => Boolean(getToken()),
    setToken,
    clearToken,
    register,
    login,
    getMe,
    forgotPassword,
    testEmail,
    verifyResetToken,
    resetPassword,
    createAssessment,
    getAssessments,
    getAssessmentById,
    downloadAssessmentReport,
    predict,
    chat,
    reflectJournal,
    downloadReportPDF,
    syncUserData,
    createMood,
    getMoods,
    deleteMood,
    createJournal,
    getJournals,
    getJournalById,
    deleteJournal,
    createGoal,
    getGoals,
    updateGoalStatus,
    deleteGoal,
    getAdminStats,
    getAdminUsers,
    getAdminUserDetail,
    getAdminAssessments,
    downloadAdminUsersCSV,
    downloadAdminAssessmentsCSV,
  };
})();

