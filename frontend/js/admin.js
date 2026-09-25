/**
 * admin.js — MindCare AI Admin Dashboard Controller
 * Enforces role-based administrative authentication, loads centralized metrics,
 * powers the user directory, platform assessment explorer, user drilldown modal,
 * and handles CSV data exports.
 */

document.addEventListener("DOMContentLoaded", () => {
  // 1. Enforce admin auth
  const adminUser = MindCareAuth.requireAdminAuth();
  if (!adminUser) return;

  // 2. Initialize application shell
  mcInitAppShell();

  // 3. State management
  let state = {
    stats: null,
    users: [],
    assessments: [],
    userFilter: "",
    assessmentFilter: "",
    activeTab: "users",
  };

  // DOM elements
  const refreshBtn = document.getElementById("mc-admin-refresh-btn");
  const exportUsersBtn = document.getElementById("mc-admin-export-users-btn");
  const exportAssessmentsBtn = document.getElementById("mc-admin-export-assessments-btn");
  const userSearch = document.getElementById("mc-user-search");
  const assessmentSearch = document.getElementById("mc-assessment-search");
  const usersTableBody = document.getElementById("mc-users-table-body");
  const assessmentsTableBody = document.getElementById("mc-assessments-table-body");
  const modal = document.getElementById("mc-user-detail-modal");
  const modalCloseBtn = document.getElementById("modal-close-btn");

  // Formatters
  function formatDate(isoStr) {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit",
      });
    } catch {
      return isoStr;
    }
  }

  function formatShortDate(isoStr) {
    if (!isoStr) return "—";
    try {
      const d = new Date(isoStr);
      return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
    } catch {
      return isoStr;
    }
  }

  function escapeHTML(str) {
    const div = document.createElement("div");
    div.textContent = str == null ? "" : String(str);
    return div.innerHTML;
  }

  // 4. Load Data
  async function loadAllData() {
    try {
      if (refreshBtn) refreshBtn.disabled = true;

      const [statsRes, usersRes, assessmentsRes] = await Promise.all([
        MindCareAPI.getAdminStats().catch((e) => {
          console.error("Stats load failed:", e);
          return null;
        }),
        MindCareAPI.getAdminUsers().catch((e) => {
          console.error("Users load failed:", e);
          return { users: [] };
        }),
        MindCareAPI.getAdminAssessments().catch((e) => {
          console.error("Assessments load failed:", e);
          return { assessments: [] };
        }),
      ]);

      if (statsRes) {
        state.stats = statsRes;
        renderStats(statsRes);
      }

      state.users = (usersRes && usersRes.users) ? usersRes.users : [];
      state.assessments = (assessmentsRes && assessmentsRes.assessments) ? assessmentsRes.assessments : [];

      document.getElementById("tab-count-users").textContent = state.users.length;
      document.getElementById("tab-count-assessments").textContent = state.assessments.length;

      renderUsersTable();
      renderAssessmentsTable();
    } catch (err) {
      console.error("Admin dashboard load error:", err);
    } finally {
      if (refreshBtn) refreshBtn.disabled = false;
    }
  }

  // 5. Render KPI Cards
  function renderStats(stats) {
    document.getElementById("stat-total-users").textContent = stats.total_users ?? 0;
    document.getElementById("stat-total-assessments").textContent = stats.total_assessments ?? 0;
    document.getElementById("stat-total-moods").textContent = stats.total_moods ?? 0;
    document.getElementById("stat-total-journals").textContent = stats.total_journals ?? 0;
    document.getElementById("stat-active-users").textContent = stats.active_users_24h ?? 0;
    
    if (stats.database_engine) {
      const dbInd = document.getElementById("mc-admin-db-indicator");
      if (dbInd) {
        dbInd.textContent = `Central Engine: ${stats.database_engine.toUpperCase()}`;
      }
    }
  }

  // 6. Render Users Table
  function renderUsersTable() {
    if (!usersTableBody) return;
    const query = (state.userFilter || "").toLowerCase();

    const filtered = state.users.filter((u) => {
      const name = (u.name || "").toLowerCase();
      const email = (u.email || "").toLowerCase();
      const country = (u.country || "").toLowerCase();
      return name.includes(query) || email.includes(query) || country.includes(query);
    });

    if (filtered.length === 0) {
      usersTableBody.innerHTML = `
        <tr>
          <td colspan="9" style="text-align:center; padding:32px; color:var(--ink-faint);">
            ${state.users.length === 0 ? "No users registered yet." : "No users matched your search criteria."}
          </td>
        </tr>`;
      return;
    }

    usersTableBody.innerHTML = filtered.map((u) => {
      const isAdmin = u.role === "admin";
      const roleBadge = isAdmin
        ? `<span class="badge-pill badge-admin">ADMIN</span>`
        : `<span class="badge-pill badge-user">USER</span>`;
      
      return `
        <tr>
          <td style="font-weight:700; color:var(--ink-faint);">#${u.id}</td>
          <td>
            <div style="font-weight:600; color:var(--ink);">${escapeHTML(u.name || "Anonymous")}</div>
            <div style="font-size:0.78rem; color:var(--ink-faint);">${escapeHTML(u.email)}</div>
          </td>
          <td>${roleBadge}</td>
          <td>${escapeHTML(u.country || "—")}</td>
          <td style="font-size:0.8rem; color:var(--ink-soft);">${formatShortDate(u.created_at)}</td>
          <td><span style="font-weight:700; color:var(--horizon);">${u.assessments_count ?? 0}</span></td>
          <td><span style="font-weight:700; color:var(--amber);">${u.moods_count ?? 0}</span></td>
          <td><span style="font-weight:700; color:var(--leaf);">${u.journals_count ?? 0}</span></td>
          <td>
            <button type="button" class="btn btn-secondary btn-sm mc-view-user-btn" data-user-id="${u.id}" style="padding:4px 10px; font-size:0.78rem;">
              View Cloud Data
            </button>
          </td>
        </tr>`;
    }).join("");

    // Wire up view buttons
    usersTableBody.querySelectorAll(".mc-view-user-btn").forEach((btn) => {
      btn.addEventListener("click", () => {
        const uid = Number(btn.getAttribute("data-user-id"));
        openUserModal(uid);
      });
    });
  }

  // 7. Render Assessments Table
  function renderAssessmentsTable() {
    if (!assessmentsTableBody) return;
    const query = (state.assessmentFilter || "").toLowerCase();

    const filtered = state.assessments.filter((a) => {
      const userName = (a.user_name || "").toLowerCase();
      const userEmail = (a.user_email || "").toLowerCase();
      const pred = (a.prediction || "").toLowerCase();
      const cat = (a.category || "").toLowerCase();
      return userName.includes(query) || userEmail.includes(query) || pred.includes(query) || cat.includes(query);
    });

    if (filtered.length === 0) {
      assessmentsTableBody.innerHTML = `
        <tr>
          <td colspan="7" style="text-align:center; padding:32px; color:var(--ink-faint);">
            ${state.assessments.length === 0 ? "No assessments completed yet." : "No assessment records match your search."}
          </td>
        </tr>`;
      return;
    }

    assessmentsTableBody.innerHTML = filtered.map((a) => {
      const score = Number(a.score || 0).toFixed(1);
      const score100 = a.score_100 || Math.round(a.score * 10);
      let tierBadge = `<span class="badge-pill badge-mod">${escapeHTML(a.category || "Moderate")}</span>`;
      if (a.category === "High" || a.score >= 7.0) {
        tierBadge = `<span class="badge-pill badge-high">High Risk</span>`;
      } else if (a.category === "Low" || a.score < 4.0) {
        tierBadge = `<span class="badge-pill badge-low">Low Risk</span>`;
      }

      const fd = a.form_data || {};
      const academic = fd.academic_level || "—";
      const platform = fd.most_used_platform || "—";
      const ageGender = [fd.age ? `${fd.age}y` : null, fd.gender, fd.country].filter(Boolean).join(" • ") || "—";

      return `
        <tr>
          <td style="font-size:0.8rem; color:var(--ink-soft);">${formatShortDate(a.created_at || a.date)}</td>
          <td>
            <div style="font-weight:600; color:var(--ink);">${escapeHTML(a.user_name || "User #" + a.user_id)}</div>
            <div style="font-size:0.78rem; color:var(--ink-faint);">${escapeHTML(a.user_email || "—")}</div>
          </td>
          <td>
            <strong style="font-size:1.05rem; color:var(--ink);">${score}</strong>
            <span style="font-size:0.78rem; color:var(--ink-faint);">/10 (${score100}%)</span>
          </td>
          <td>${tierBadge}</td>
          <td style="font-size:0.82rem;">${escapeHTML(academic)}</td>
          <td style="font-size:0.82rem;">${escapeHTML(platform)}</td>
          <td style="font-size:0.82rem; color:var(--ink-soft);">${escapeHTML(ageGender)}</td>
        </tr>`;
    }).join("");
  }

  // 8. User Detail Modal View
  async function openUserModal(userId) {
    if (!modal) return;
    const modalContent = document.getElementById("modal-user-content");
    const modalUserName = document.getElementById("modal-user-name");
    const modalUserEmail = document.getElementById("modal-user-email");

    modalUserName.textContent = "Loading User Cloud Records...";
    modalUserEmail.textContent = "";
    modalContent.innerHTML = `<div style="text-align:center; padding:40px; color:var(--ink-faint);">Querying central database for User #${userId}...</div>`;
    
    modal.classList.add("active");

    try {
      const data = await MindCareAPI.getAdminUserDetail(userId);
      if (!data || !data.user) {
        modalContent.innerHTML = `<div style="color:var(--brick); padding:20px;">Unable to load user details.</div>`;
        return;
      }

      const u = data.user;
      modalUserName.textContent = u.name || "Anonymous User";
      modalUserEmail.textContent = `${u.email} • ID #${u.id} • Joined ${formatDate(u.created_at)}`;

      const assessments = data.assessments || [];
      const moods = data.moods || [];
      const journals = data.journals || [];
      const goals = data.goals || [];

      modalContent.innerHTML = `
        <!-- Profile & Demographics Card -->
        <div style="background:var(--canvas-dim); padding:16px; border-radius:var(--radius-md); border:1px solid var(--border);">
          <div style="font-weight:700; color:var(--ink); margin-bottom:8px; font-size:0.92rem;">👤 Demographic & Profile Record</div>
          <div style="display:grid; grid-template-columns:repeat(auto-fit, minmax(140px, 1fr)); gap:10px; font-size:0.82rem;">
            <div><span style="color:var(--ink-faint);">Role:</span> <strong>${escapeHTML(u.role)}</strong></div>
            <div><span style="color:var(--ink-faint);">Status:</span> <strong>${escapeHTML(u.status)}</strong></div>
            <div><span style="color:var(--ink-faint);">Age:</span> <strong>${u.age || "—"}</strong></div>
            <div><span style="color:var(--ink-faint);">Gender:</span> <strong>${escapeHTML(u.gender || "—")}</strong></div>
            <div><span style="color:var(--ink-faint);">Country:</span> <strong>${escapeHTML(u.country || "—")}</strong></div>
            <div><span style="color:var(--ink-faint);">Academic Level:</span> <strong>${escapeHTML(u.academic_level || "—")}</strong></div>
            <div><span style="color:var(--ink-faint);">Platform:</span> <strong>${escapeHTML(u.most_used_platform || "—")}</strong></div>
          </div>
        </div>

        <!-- Assessments Section -->
        <div>
          <h4 style="margin:0 0 8px; font-size:0.95rem; color:var(--ink);">ML Assessments (${assessments.length})</h4>
          ${assessments.length === 0 ? `<p style="font-size:0.82rem; color:var(--ink-faint);">No assessments submitted yet.</p>` : `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${assessments.map((a) => `
                <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:12px; display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;">
                  <div>
                    <div style="font-weight:700; font-size:0.9rem; color:var(--ink);">
                      Score: ${Number(a.score).toFixed(1)}/10 (${a.score_100 || Math.round(a.score * 10)}%) — ${escapeHTML(a.prediction || "Assessment")}
                    </div>
                    <div style="font-size:0.78rem; color:var(--ink-faint);">${formatDate(a.created_at || a.date)}</div>
                  </div>
                  <span class="badge-pill ${a.category === 'High' ? 'badge-high' : a.category === 'Low' ? 'badge-low' : 'badge-mod'}">
                    ${escapeHTML(a.category || "Moderate")}
                  </span>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- Moods Section -->
        <div>
          <h4 style="margin:0 0 8px; font-size:0.95rem; color:var(--ink);">Recent Mood Check-ins (${moods.length})</h4>
          ${moods.length === 0 ? `<p style="font-size:0.82rem; color:var(--ink-faint);">No mood check-ins recorded.</p>` : `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${moods.slice(0, 5).map((m) => `
                <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px; display:flex; justify-content:space-between; align-items:center;">
                  <div>
                    <span style="font-size:1.1rem; margin-right:6px;">${m.emoji || "😐"}</span>
                    <strong style="font-size:0.88rem; color:var(--ink);">${escapeHTML(m.label || `Mood ${m.mood}`)}</strong>
                    ${m.note ? `<div style="font-size:0.8rem; color:var(--ink-soft); margin-top:2px;">"${escapeHTML(m.note)}"</div>` : ""}
                  </div>
                  <div style="font-size:0.75rem; color:var(--ink-faint);">${formatShortDate(m.date || m.created_at)}</div>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- Journals Section -->
        <div>
          <h4 style="margin:0 0 8px; font-size:0.95rem; color:var(--ink);">Journal Reflections (${journals.length})</h4>
          ${journals.length === 0 ? `<p style="font-size:0.82rem; color:var(--ink-faint);">No private journal reflections.</p>` : `
            <div style="display:flex; flex-direction:column; gap:8px;">
              ${journals.slice(0, 5).map((j) => `
                <div style="background:var(--surface); border:1px solid var(--border); border-radius:var(--radius-sm); padding:10px 12px;">
                  <div style="display:flex; justify-content:space-between; align-items:center;">
                    <strong style="font-size:0.88rem; color:var(--ink);">${escapeHTML(j.title || "Untitled")}</strong>
                    <span style="font-size:0.75rem; color:var(--ink-faint);">${formatShortDate(j.created_at || j.date)}</span>
                  </div>
                  <p style="font-size:0.8rem; color:var(--ink-soft); margin:4px 0 0; white-space:pre-wrap; max-height:80px; overflow:hidden; text-overflow:ellipsis;">${escapeHTML(j.content || "")}</p>
                </div>
              `).join("")}
            </div>
          `}
        </div>

        <!-- Goals Section -->
        <div>
          <h4 style="margin:0 0 8px; font-size:0.95rem; color:var(--ink);">Wellness Goals (${goals.length})</h4>
          ${goals.length === 0 ? `<p style="font-size:0.82rem; color:var(--ink-faint);">No goals set.</p>` : `
            <div style="display:flex; flex-wrap:wrap; gap:8px;">
              ${goals.map((g) => `
                <div style="background:var(--canvas-dim); border:1px solid var(--border); border-radius:var(--radius-pill); padding:4px 12px; font-size:0.8rem; display:inline-flex; align-items:center; gap:6px;">
                  <span style="width:8px; height:8px; border-radius:50%; background:${g.status === 'completed' ? 'var(--leaf)' : 'var(--amber)'};"></span>
                  <strong>${escapeHTML(g.title)}</strong>
                  <span style="color:var(--ink-faint);">(${escapeHTML(g.status)})</span>
                </div>
              `).join("")}
            </div>
          `}
        </div>
      `;
    } catch (err) {
      console.error("Failed to load user detail:", err);
      modalContent.innerHTML = `<div style="color:var(--brick); padding:20px;">Error retrieving user data: ${escapeHTML(err.message)}</div>`;
    }
  }

  function closeModal() {
    if (modal) modal.classList.remove("active");
  }

  if (modalCloseBtn) modalCloseBtn.addEventListener("click", closeModal);
  if (modal) {
    modal.addEventListener("click", (e) => {
      if (e.target === modal) closeModal();
    });
  }

  // 9. Tab Switching
  document.querySelectorAll(".admin-tab-btn").forEach((btn) => {
    btn.addEventListener("click", () => {
      const targetTab = btn.getAttribute("data-tab");
      state.activeTab = targetTab;

      document.querySelectorAll(".admin-tab-btn").forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");

      document.querySelectorAll(".admin-tab-pane").forEach((pane) => {
        pane.style.display = "none";
      });

      const activePane = document.getElementById(`tab-pane-${targetTab}`);
      if (activePane) activePane.style.display = "block";
    });
  });

  // 10. Search Listeners
  if (userSearch) {
    userSearch.addEventListener("input", (e) => {
      state.userFilter = e.target.value;
      renderUsersTable();
    });
  }

  if (assessmentSearch) {
    assessmentSearch.addEventListener("input", (e) => {
      state.assessmentFilter = e.target.value;
      renderAssessmentsTable();
    });
  }

  // 11. Action Buttons
  if (refreshBtn) {
    refreshBtn.addEventListener("click", () => {
      loadAllData();
    });
  }

  if (exportUsersBtn) {
    exportUsersBtn.addEventListener("click", () => {
      MindCareAPI.downloadAdminUsersCSV();
    });
  }

  if (exportAssessmentsBtn) {
    exportAssessmentsBtn.addEventListener("click", () => {
      MindCareAPI.downloadAdminAssessmentsCSV();
    });
  }

  // Initial Data Load
  loadAllData();
});
