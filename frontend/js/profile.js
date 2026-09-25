/**
 * profile.js — Profile editing, Goals, Reminders, and Privacy Controls.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  mcInitChatbot(user);

  // 1. Profile display
  document.getElementById("mc-profile-avatar").textContent = MindCareAuth.initials(user.name);
  document.getElementById("mc-profile-display-name").textContent = user.name;
  document.getElementById("mc-profile-display-email").textContent = user.email;

  const profile = MindCareStore.getProfile(user.email) || {};
  const lastInput = MindCareStore.getLastAssessmentInput ? MindCareStore.getLastAssessmentInput(user.email) || {} : {};
  document.getElementById("prof-name").value = profile.name || user.name || "";
  document.getElementById("prof-email").value = user.email;
  document.getElementById("prof-age").value = profile.age || lastInput.age || "";
  document.getElementById("prof-country").value = profile.country || lastInput.country || "";
  document.getElementById("prof-academic").value = profile.academic_level || lastInput.academic_level || "";
  document.getElementById("prof-platform").value = profile.most_used_platform || lastInput.most_used_platform || "";

  // Stats
  const history = MindCareStore.getAssessments(user.email);
  const latest = history[0];
  const streaks = MindCareStore.getStreaks(user.email);

  document.getElementById("mc-stat-total").textContent = history.length;
  document.getElementById("mc-stat-latest-score").textContent = latest ? `${latest.score.toFixed(2)}/10` : "—";
  document.getElementById("mc-stat-streak").textContent = `${streaks.moodStreak} ${streaks.moodStreak === 1 ? "Day" : "Days"}`;

  // 2. Profile Form Submission
  const profileForm = document.getElementById("mc-profile-form");
  const saveStatus = document.getElementById("mc-profile-save-status");

  profileForm.addEventListener("submit", (e) => {
    e.preventDefault();
    const updatedName = document.getElementById("prof-name").value.trim();
    const updatedAge = document.getElementById("prof-age").value ? Number(document.getElementById("prof-age").value) : null;
    const updatedCountry = document.getElementById("prof-country").value;
    const updatedAcademic = document.getElementById("prof-academic").value;
    const updatedPlatform = document.getElementById("prof-platform").value;

    MindCareStore.saveProfile(user.email, {
      name: updatedName,
      age: updatedAge,
      country: updatedCountry,
      academic_level: updatedAcademic,
      most_used_platform: updatedPlatform,
    });

    if (MindCareStore.saveLastAssessmentInput) {
      MindCareStore.saveLastAssessmentInput(user.email, {
        age: updatedAge,
        country: updatedCountry,
        academic_level: updatedAcademic,
        most_used_platform: updatedPlatform,
      });
    }

    document.getElementById("mc-profile-display-name").textContent = updatedName;
    document.getElementById("mc-profile-avatar").textContent = MindCareAuth.initials(updatedName);
    saveStatus.textContent = "✓ Profile successfully updated!";
    setTimeout(() => {
      saveStatus.textContent = "";
    }, 3000);
  });

  // 3. Goals Manager
  const goalsListEl = document.getElementById("mc-profile-goals-list");
  const addGoalBtn = document.getElementById("mc-add-goal-btn");
  const newGoalTitle = document.getElementById("mc-new-goal-title");
  const newGoalCat = document.getElementById("mc-new-goal-cat");
  const goalsRateEl = document.getElementById("mc-goals-rate");

  function renderGoals() {
    const goals = MindCareStore.getGoals(user.email);
    const rate = MindCareStore.getGoalCompletionRate(user.email);
    goalsRateEl.textContent = `${rate}% completion rate`;

    if (goals.length === 0) {
      goalsListEl.innerHTML = `<div style="text-align:center; padding:18px; color:var(--ink-faint); font-size:0.88rem;">No goals created yet. Add one above!</div>`;
      return;
    }

    goalsListEl.innerHTML = goals
      .map(
        (g) => `
      <div class="goal-card ${g.status === "completed" ? "completed" : ""}">
        <div class="goal-left">
          <div class="goal-checkbox ${g.status === "completed" ? "checked" : ""}" data-id="${g.id}">
            ${g.status === "completed" ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
          </div>
          <div>
            <div class="goal-title" style="font-size:0.9rem; font-weight:600;">${mcEscape(g.title)}</div>
            <span style="font-size:0.75rem; color:var(--ink-faint);">${mcEscape(g.category)}</span>
          </div>
        </div>
        <button type="button" class="btn btn-ghost btn-sm del-goal" data-id="${g.id}" style="color:var(--brick); padding:4px 8px;">✕</button>
      </div>`
      )
      .join("");

    goalsListEl.querySelectorAll(".goal-checkbox").forEach((box) => {
      box.addEventListener("click", () => {
        const id = box.dataset.id;
        const g = goals.find((item) => item.id === id);
        if (g) {
          const next = g.status === "completed" ? "in_progress" : "completed";
          MindCareStore.updateGoalStatus(user.email, id, next);
          renderGoals();
        }
      });
    });

    goalsListEl.querySelectorAll(".del-goal").forEach((btn) => {
      btn.addEventListener("click", () => {
        MindCareStore.deleteGoal(user.email, btn.dataset.id);
        renderGoals();
      });
    });
  }

  addGoalBtn.addEventListener("click", () => {
    const title = newGoalTitle.value.trim();
    if (!title) return;
    MindCareStore.saveGoal(user.email, {
      title,
      category: newGoalCat.value,
    });
    newGoalTitle.value = "";
    renderGoals();
  });

  // 4. Reminders Manager
  const remindersListEl = document.getElementById("mc-reminders-list");
  const addRemBtn = document.getElementById("mc-add-rem-btn");
  const newRemTitle = document.getElementById("mc-new-rem-title");
  const newRemTime = document.getElementById("mc-new-rem-time");

  function renderReminders() {
    const reminders = MindCareStore.getReminders(user.email);
    if (reminders.length === 0) {
      remindersListEl.innerHTML = `<div style="text-align:center; padding:18px; color:var(--ink-faint); font-size:0.88rem;">No active reminders. Add one above!</div>`;
      return;
    }

    remindersListEl.innerHTML = reminders
      .map(
        (r) => `
      <div class="reminder-card">
        <div class="reminder-left">
          <div style="font-weight:700; color:var(--moss-dark); font-size:0.95rem; min-width:55px;">${r.time}</div>
          <span style="font-size:0.9rem; color:var(--ink);">${mcEscape(r.title)}</span>
        </div>
        <div style="display:flex; align-items:center; gap:10px;">
          <button type="button" class="btn btn-sm ${r.enabled ? "btn-secondary" : "btn-ghost"} toggle-rem" data-id="${r.id}">
            ${r.enabled ? "Active" : "Paused"}
          </button>
          <button type="button" class="btn btn-ghost btn-sm del-rem" data-id="${r.id}" style="color:var(--brick); padding:4px 8px;">✕</button>
        </div>
      </div>`
      )
      .join("");

    remindersListEl.querySelectorAll(".toggle-rem").forEach((btn) => {
      btn.addEventListener("click", () => {
        MindCareStore.toggleReminder(user.email, btn.dataset.id);
        renderReminders();
      });
    });

    remindersListEl.querySelectorAll(".del-rem").forEach((btn) => {
      btn.addEventListener("click", () => {
        MindCareStore.deleteReminder(user.email, btn.dataset.id);
        renderReminders();
      });
    });
  }

  addRemBtn.addEventListener("click", () => {
    const title = newRemTitle.value.trim();
    if (!title) return;
    MindCareStore.saveReminder(user.email, {
      title,
      time: newRemTime.value,
      enabled: true,
    });
    newRemTitle.value = "";
    renderReminders();
  });

  // 5. Privacy Controls
  document.getElementById("mc-del-assessments-btn").addEventListener("click", () => {
    if (confirm("Delete all assessment history? This action cannot be undone.")) {
      MindCareStore.deleteAssessments(user.email);
      alert("Assessment history deleted.");
      location.reload();
    }
  });

  document.getElementById("mc-del-journals-btn").addEventListener("click", () => {
    if (confirm("Delete all journal entries and AI reflections? This action cannot be undone.")) {
      MindCareStore.deleteJournalEntries(user.email);
      alert("Journal entries deleted.");
    }
  });

  document.getElementById("mc-del-moods-btn").addEventListener("click", () => {
    if (confirm("Delete all mood history and reset streaks? This action cannot be undone.")) {
      MindCareStore.deleteMoodHistory(user.email);
      alert("Mood history deleted.");
      location.reload();
    }
  });

  document.getElementById("mc-del-chat-btn").addEventListener("click", () => {
    MindCareStore.clearChatbotHistory();
    alert("Chat history cleared.");
  });

  document.getElementById("mc-reset-account-btn").addEventListener("click", () => {
    if (confirm("CRITICAL WARNING: Are you sure you want to permanently delete ALL local data for this account? This cannot be undone.")) {
      if (confirm("Please confirm one more time: Wipe all data and log out?")) {
        MindCareStore.deleteAccountData(user.email);
        MindCareAuth.logoutUser();
      }
    }
  });

  // 6. Appearance & Theme Settings
  const btnThemeLight = document.getElementById("mc-btn-theme-light");
  const btnThemeDark = document.getElementById("mc-btn-theme-dark");

  function syncThemeButtons() {
    const current = typeof MindCareTheme !== "undefined" ? MindCareTheme.get() : "light";
    if (btnThemeLight && btnThemeDark) {
      if (current === "dark") {
        btnThemeDark.className = "btn btn-primary btn-sm";
        btnThemeLight.className = "btn btn-secondary btn-sm";
      } else {
        btnThemeLight.className = "btn btn-primary btn-sm";
        btnThemeDark.className = "btn btn-secondary btn-sm";
      }
    }
  }

  btnThemeLight?.addEventListener("click", () => {
    if (typeof MindCareTheme !== "undefined") {
      MindCareTheme.set("light");
      syncThemeButtons();
    }
  });

  btnThemeDark?.addEventListener("click", () => {
    if (typeof MindCareTheme !== "undefined") {
      MindCareTheme.set("dark");
      syncThemeButtons();
    }
  });

  syncThemeButtons();
  window.addEventListener("mc-theme-changed", syncThemeButtons);

  renderGoals();
  renderReminders();
});
