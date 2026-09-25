/**
 * result-page.js — renders a single assessment result (result.html).
 * Displays:
 *  - Prominent Mental Health Score (0-10 and 0-100 scales)
 *  - Machine Learning Prediction & Category
 *  - Formatted Assessment Date and Time
 *  - Visual Score & Animated Progress Bar Indicator
 *  - Model Explanation & Demographics Chips
 *  - "Download Complete Report" PDF generation button with live UX state transitions
 *  - Personalized 7-Pillar Wellness Plan & Targeted Lifestyle Factors
 */

async function mcRunResultPage() {
  try {
    let user = typeof MindCareAuth !== "undefined" ? MindCareAuth.getCurrentUser() : null;
    let isGuest = false;

    if (user) {
      if (typeof mcInitAppShell === "function") {
        try { mcInitAppShell(); } catch (e) { console.warn("App shell init warning:", e); }
      }
      if (typeof mcInitChatbot === "function") {
        try { mcInitChatbot(user); } catch (e) { console.warn("Chatbot init warning:", e); }
      }
    } else {
      isGuest = true;
      user = { name: "Guest User", email: "guest@mindcare.ai", isGuest: true };

      // If unauthenticated, render a clean, branded guest header in #app-shell-mount
      const mount = document.getElementById("app-shell-mount");
      if (mount && (!mount.children || mount.children.length === 0)) {
        mount.innerHTML = `
          <header class="top-nav" style="max-width:1180px; margin:0 auto; padding:20px 24px 10px; display:flex; justify-content:space-between; align-items:center;">
            <a href="index.html" class="brand" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--ink); font-family:var(--font-display); font-size:1.2rem; font-weight:700;">
              <span class="mark" style="width:32px; height:32px; border-radius:50%; background:var(--moss); display:flex; align-items:center; justify-content:center;">
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c9 0 14-5 14-14 0 0-13-2-14 9-.4 3 0 5 0 5Z"/><path d="M5 20c0-6 3-9 8-11"/></svg>
              </span>
              <span>MindCare AI</span>
            </a>
            <div style="display:flex; align-items:center; gap:12px;">
              <button type="button" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme" style="width:36px; height:36px; border-radius:50%; border:1px solid var(--border); background:var(--surface); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--ink);">
                ${typeof MindCareTheme !== "undefined" && MindCareTheme.get() === "dark" ? MindCareTheme.ICONS.sun : (typeof MindCareTheme !== "undefined" ? MindCareTheme.ICONS.moon : "🌓")}
              </button>
              <a href="assessment.html" class="btn btn-secondary btn-sm">Take Assessment</a>
              <a href="login.html" class="btn btn-primary btn-sm">Log In</a>
            </div>
          </header>
        `;
        if (typeof MindCareTheme !== "undefined") {
          MindCareTheme.updateButtons();
        }
      }
    }

    console.log("[WellnessPlan] Page mounted");

    const params = new URLSearchParams(window.location.search);
    const id = params.get("id");
    console.log("[WellnessPlan] Navigation state query ID:", id || "(none)");

    let content = document.getElementById("mc-result-content");
    if (!content) {
      const target = document.getElementById("page-body-target") || document.getElementById("page-content") || document.body;
      content = document.createElement("div");
      content.id = "mc-result-content";
      target.appendChild(content);
    }

    // Render immediate loading state
    content.innerHTML = `
      <div class="card-elevated section-gap" style="padding:48px 24px; text-align:center; max-width:640px; margin:40px auto;">
        <div class="spinner-sm" style="width:36px; height:36px; border:3px solid var(--border); border-top-color:var(--moss-dark); border-radius:50%; animation:spin 0.8s linear infinite; margin:0 auto 16px;"></div>
        <h3 style="font-size:1.15rem; color:var(--ink); margin-bottom:6px;">Loading your wellness report...</h3>
        <p style="color:var(--ink-soft); font-size:0.88rem;">Retrieving your personalized mental health assessment and machine-learning predictions.</p>
      </div>
    `;

    // Tiered Record Lookup
    let record = null;

    // -------------------------------------------------------------------------
    // Priority 1: Application State & Local Store (Instant Synchronous Cache)
    // -------------------------------------------------------------------------
    if (id && typeof window !== "undefined" && window.MindCareStore && typeof window.MindCareStore.getAssessmentById === "function") {
      record = window.MindCareStore.getAssessmentById(user ? user.email : null, id);
    }
    if (!record && typeof window !== "undefined" && window.MindCareResults && typeof window.MindCareResults.getActiveResult === "function") {
      const active = window.MindCareResults.getActiveResult();
      if (active && (!id || String(active.id) === String(id))) {
        record = active;
      }
    }
    if (!record && typeof window !== "undefined" && window.MindCareStore && typeof window.MindCareStore.getLatestAssessment === "function") {
      const latest = window.MindCareStore.getLatestAssessment(user ? user.email : null);
      if (latest && (!id || String(latest.id) === String(id))) {
        record = latest;
      }
    }

    // -------------------------------------------------------------------------
    // Priority 2: Direct LocalStorage & SessionStorage Assessment Caches
    // -------------------------------------------------------------------------
    if (!record) {
      try {
        const rawLatest = localStorage.getItem("mindcare_latest_result") || sessionStorage.getItem("mindcare_latest_result");
        if (rawLatest) {
          const parsed = JSON.parse(rawLatest);
          if (parsed && (!id || String(parsed.id) === String(id))) {
            record = parsed;
          }
        }
      } catch {}
    }

    if (!record && id) {
      try {
        const rawAll = JSON.parse(localStorage.getItem("mindcare_assessments") || "{}");
        for (const k of Object.keys(rawAll)) {
          const list = rawAll[k] || [];
          const found = list.find((r) => String(r.id) === String(id));
          if (found) {
            record = found;
            break;
          }
        }
      } catch {}
    }

    if (record) {
      console.log("[WellnessPlan] Persisted assessment data found locally:", record);
    }

    // -------------------------------------------------------------------------
    // Priority 3: Backend MySQL API Data (when token is available)
    // -------------------------------------------------------------------------
    if (typeof window !== "undefined" && window.MindCareAPI && typeof window.MindCareAPI.getToken === "function" && window.MindCareAPI.getToken()) {
      if (id && !String(id).startsWith("a_") && !record) {
        try {
          console.log("[WellnessPlan] Fetching latest assessment by ID from API:", id);
          record = await window.MindCareAPI.getAssessmentById(id);
          console.log("[WellnessPlan] API response:", record);
        } catch (err) {
          console.warn("[WellnessPlan] API getAssessmentById warning:", err);
        }
      }

      if (!record) {
        try {
          console.log("[WellnessPlan] Fetching latest assessment history from API...");
          const history = await window.MindCareAPI.getAssessments();
          console.log("[WellnessPlan] API response:", history);
          if (history && history.length > 0) {
            if (id) {
              record = history.find((r) => String(r.id) === String(id)) || history[0];
            } else {
              record = history[0];
            }
            if (window.MindCareStore && typeof window.MindCareStore.syncAssessments === "function") {
              window.MindCareStore.syncAssessments(user ? user.email : null, history);
            }
          }
        } catch (err) {
          console.warn("[WellnessPlan] API getAssessments warning:", err);
        }
      }
    }

    // -------------------------------------------------------------------------
    // Priority 4: Fallback to Any Recent Local Record
    // -------------------------------------------------------------------------
    if (!record) {
      try {
        const rawAll = JSON.parse(localStorage.getItem("mindcare_assessments") || "{}");
        for (const k of Object.keys(rawAll)) {
          const list = rawAll[k] || [];
          if (list.length > 0) {
            record = list[0];
            break;
          }
        }
      } catch {}
    }

    const icons = typeof MC_ICONS !== "undefined" ? MC_ICONS : {};

    if (!record) {
      console.log("[WellnessPlan] No assessment record found across all sources.");
      content.innerHTML = `
        <div class="empty-state card-elevated" style="padding:48px 24px; text-align:center; max-width:640px; margin:40px auto;">
          <div class="icon-wrap" style="width:64px; height:64px; font-size:1.8rem; margin:0 auto 18px; border-radius:50%; background:rgba(52,211,153,0.15); display:flex; align-items:center; justify-content:center;">📊</div>
          <h2 style="font-size:1.4rem; margin-bottom:8px; color:var(--ink);">No wellness assessment found. Please complete an assessment first.</h2>
          <p style="color:var(--ink-soft); max-width:460px; margin:0 auto 24px; font-size:0.95rem; line-height:1.5;">
            We couldn't find an assessment submission for this session. Complete our 2-minute lifestyle assessment to calculate your personalized score and recommendations.
          </p>
          <div style="display:flex; justify-content:center; gap:12px; flex-wrap:wrap;">
            <a href="assessment.html" class="btn btn-primary">Take Mental Health Assessment</a>
            <a href="login.html" class="btn btn-secondary">Log In to View Saved History</a>
            <a href="index.html" class="btn btn-ghost">Back to Home</a>
          </div>
        </div>`;
      return;
    }

    console.log("[WellnessPlan] Report data loaded successfully", record);

    // Persist active result across storage caches
    try {
      localStorage.setItem("mindcare_latest_result", JSON.stringify(record));
      sessionStorage.setItem("mindcare_latest_result", JSON.stringify(record));
      if (typeof window !== "undefined" && window.MindCareResults && typeof window.MindCareResults.setActiveResult === "function") {
        window.MindCareResults.setActiveResult(record);
      }
    } catch {}

    // Normalize numeric score defensively
    const rawScore = record.score !== undefined ? Number(record.score) : 7.0;
    const score = Math.max(0, Math.min(10, isNaN(rawScore) ? 7.0 : rawScore));
    const score100 = record.score_100 !== undefined && !isNaN(Number(record.score_100))
      ? Number(record.score_100)
      : Math.round(score * 10);

    // Prediction and category directly from model or consistent default
    const category = record.category || (score >= 7.0 ? "High" : (score >= 4.0 ? "Moderate" : "Low"));
    const prediction = record.prediction || (score >= 7.0 ? "Higher range" : (score >= 4.0 ? "Moderate range" : "Lower range"));

    const catKey = score < 4.0 ? "low" : (score < 7.0 ? "moderate" : "higher");
    
    // Self-contained score interpretations fallback
    const fallbackInterpretations = {
      low: {
        label: "Lower range",
        badgeClass: "badge-low",
        text: "Your score falls in a lower range according to the machine-learning model. Consider prioritizing healthy sleep and daily routines, and reach out for support if needed.",
      },
      moderate: {
        label: "Moderate range",
        badgeClass: "badge-moderate",
        text: "Your score falls in a moderate range. Maintaining consistent daily routines, sleep habits, and active breaks will support your mental wellbeing.",
      },
      higher: {
        label: "Higher range",
        badgeClass: "badge-higher",
        text: "Your score falls in a higher, healthy range according to this model. Continue sustaining your positive habits, balance, and routines.",
      },
    };

    const interpMap = (typeof scoreInterpretations !== "undefined") ? scoreInterpretations : fallbackInterpretations;
    const interp = interpMap[catKey] || {
      label: prediction,
      badgeClass: catKey === "higher" ? "badge-higher" : (catKey === "moderate" ? "badge-moderate" : "badge-low"),
      text: "Your score reflects your self-reported daily habits and stress levels as analyzed by the machine-learning model.",
    };

    const formData = record.formData || {};
    const assessmentDate = record.date ? new Date(record.date) : new Date();
    const formattedDate = assessmentDate.toLocaleDateString("en-US", {
      year: "numeric",
      month: "long",
      day: "numeric",
    });
    const formattedTime = assessmentDate.toLocaleTimeString("en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
    const formattedDateTime = `${formattedDate} at ${formattedTime}`;

    // Self-contained recommendations & DB stored recommendations
    let suggestions = [];
    if (record.recommendations && Array.isArray(record.recommendations) && record.recommendations.length > 0) {
      suggestions = record.recommendations.map((r) => ({
        tag: r.title || r.tag || "Wellness Recommendation",
        badge: r.badge || "Focus",
        text: r.desc || r.text || ""
      }));
    }
    if (suggestions.length === 0) {
      try {
        if (typeof generateWellnessSuggestions === "function") {
          suggestions = generateWellnessSuggestions(formData, score);
        }
      } catch {}
    }
    if (!suggestions || suggestions.length === 0) {
      suggestions = [
        { tag: "Healthy Routine & Balance", badge: "Habits", text: "Continue maintaining balanced study, sleep, and physical activity routines." },
        { tag: "Sleep Routine & Recovery", badge: "Rest", text: `Aim for 7–9 hours of nightly sleep with screen wind-down 30 minutes before bed.` },
        { tag: "Screen Time & Digital Balance", badge: "Focus", text: `Set clear boundaries around device notifications during focused study blocks.` }
      ];
    }

    // Self-contained 7-pillar plan fallback
    let plan = null;
    try {
      if (typeof generatePersonalizedWellnessPlan === "function") {
        plan = generatePersonalizedWellnessPlan(formData, score);
      }
    } catch {}
    if (!plan) {
      const sleep = Number(formData.sleep_hours_per_night || 7);
      const activity = Number(formData.physical_activity_hours || 1);
      const usage = Number(formData.avg_daily_usage_hours || 3);
      const study = Number(formData.study_hours || 4);
      plan = {
        sleep: { title: "Sleep Routine", text: `You reported ${sleep}h of sleep. Aim for 7.5–8.5 hours with a calming wind-down routine.`, icon: "moon" },
        activity: { title: "Physical Activity", text: `Your ${activity}h of daily movement supports mental stamina. Incorporate light walking breaks.`, icon: "activity" },
        screenTime: { title: "Digital Wellness", text: `With ${usage}h daily on screens, set 45-minute focus intervals without notification interruptions.`, icon: "phone" },
        studyWork: { title: "Study Breaks & Pacing", text: `For ${study}h of daily study, adopt the 50/10 Pomodoro rule to sustain cognitive focus.`, icon: "book" },
        relaxation: { title: "Relaxation & Breathwork", text: "Practice slow box breathing for 3–5 minutes when feeling academic or exam stress.", icon: "breathing" },
        social: { title: "Social Connection", text: "Dedicate weekly time for in-person conversations or shared activities with friends.", icon: "user" },
        dailyGoal: { title: "Today's Actionable Goal", text: "Take 3 intentional screen-free study breaks today", category: "Focus" },
      };
    }

    // Demographic / habit chips
    const chips = [];
    if (formData.age) chips.push(`Age ${formData.age}`);
    if (formData.gender) chips.push(`${formData.gender}`);
    if (formData.academic_level) chips.push(`${formData.academic_level}`);
    if (formData.study_hours !== undefined) chips.push(`${formData.study_hours}h study/day`);
    if (formData.sleep_hours_per_night !== undefined) chips.push(`${formData.sleep_hours_per_night}h sleep/night`);
    if (formData.physical_activity_hours !== undefined) chips.push(`${formData.physical_activity_hours}h activity/day`);
    if (formData.avg_daily_usage_hours !== undefined) chips.push(`${formData.avg_daily_usage_hours}h ${formData.most_used_platform || "device"}/day`);
    if (formData.daily_unlocks !== undefined) chips.push(`${formData.daily_unlocks} unlocks/day`);
    if (formData.stress_level) chips.push(`${formData.stress_level} stress`);

    // Safe gauge rendering
    const gaugeSVG = (typeof mcGaugeSVG === "function") 
      ? mcGaugeSVG(score, 220) 
      : `<svg viewBox="0 0 220 220"><circle cx="110" cy="110" r="96" fill="none" stroke="var(--border)" stroke-width="12"/><circle cx="110" cy="110" r="96" fill="none" stroke="var(--moss-dark)" stroke-width="12" stroke-dasharray="603" stroke-dashoffset="${603 * (1 - score / 10)}" stroke-linecap="round"/></svg>`;

    const esc = (typeof mcEscape === "function") ? mcEscape : (s) => String(s || "").replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

    content.innerHTML = `
      ${isGuest ? `
        <div class="guest-banner card" style="background:rgba(52, 211, 153, 0.08); border:1.5px solid rgba(52, 211, 153, 0.3); padding:16px 20px; border-radius:var(--radius-md); margin-bottom:24px; display:flex; align-items:center; justify-content:space-between; flex-wrap:wrap; gap:14px;">
          <div style="display:flex; align-items:center; gap:12px;">
            <span style="font-size:1.4rem;">👋</span>
            <div>
              <strong style="color:var(--ink); font-size:0.98rem;">Viewing result as Guest</strong>
              <div style="font-size:0.86rem; color:var(--ink-soft); margin-top:2px;">Log in or create a free account to permanently save this result and track wellness trends.</div>
            </div>
          </div>
          <div style="display:flex; gap:10px; align-items:center;">
            <a href="login.html" class="btn btn-secondary btn-sm">Log In</a>
            <a href="register.html" class="btn btn-primary btn-sm">Create Account</a>
          </div>
        </div>
      ` : ""}

      <!-- Main Result Hero Card -->
      <div class="card-elevated result-hero section-gap">
        <div class="gauge-wrap">
          ${gaugeSVG}
          <div class="gauge-center">
            <div class="score-num">${score.toFixed(2)}</div>
            <div class="score-max">out of 10.0</div>
          </div>
        </div>
        <div class="result-summary" style="flex:1;">
          <div style="display:flex; align-items:center; gap:8px; flex-wrap:wrap; margin-bottom:8px;">
            <span class="badge ${interp.badgeClass}">Prediction: ${esc(prediction)}</span>
            <span class="badge badge-subtle">Category: ${esc(category)}</span>
          </div>
          <h2 style="font-size:1.85rem; margin:0 0 6px; color:var(--ink);">
            Mental Health Score: <span style="color:var(--moss-dark);">${score100} / 100</span>
          </h2>
          <p style="color:var(--ink-soft); font-size:0.9rem; margin-bottom:14px;">
            Assessed on <strong>${formattedDateTime}</strong>
          </p>

          <!-- Visual Progress Bar Indicator -->
          <div class="score-progress-card">
            <div class="score-progress-header">
              <span class="label">Overall Mental Health Index</span>
              <span class="val">${score100}%</span>
            </div>
            <div class="score-progress-track">
              <div class="score-progress-fill ${catKey}" id="mc-score-bar" style="width: 0%;"></div>
            </div>
            <div class="score-progress-ticks">
              <span>0% (Low)</span>
              <span>25%</span>
              <span>50% (Moderate)</span>
              <span>75%</span>
              <span>100% (Optimal)</span>
            </div>
          </div>

          <div class="summary-chip-row" style="margin-top:14px;">
            ${chips.map((c) => `<span class="summary-chip">${esc(String(c))}</span>`).join("")}
          </div>
          <div class="interpretation-box ${catKey}" style="margin-top:14px;">${interp.text}</div>
        </div>
      </div>

      <!-- Prominent Report Action Bar -->
      <div class="report-action-bar">
        <div class="meta-info">
          <div class="meta-title">📄 Comprehensive Mental Wellness Report</div>
          <div class="meta-sub">Official multi-page PDF report with full assessment record, ML prediction, and personalized habit guidance.</div>
        </div>
        <button type="button" class="btn-download-report" id="mc-download-report-btn">
          📄 Download Complete Report
        </button>
      </div>
      <div id="mc-report-notification" class="report-notification"></div>

      <!-- Personalized Wellness Plan (7 Core Pillars) -->
      <div class="section-gap" style="margin-top:28px;">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2 style="font-size:1.35rem; margin:0;">Personalized Wellness Plan</h2>
          <span style="font-size:0.85rem; color:var(--moss-dark); font-weight:700;">Tailored to your specific responses</span>
        </div>

        <!-- Daily Goal Highlight Card -->
        <div class="card section-gap" style="background:#F4F8F5; border-color:#D0E6D9;">
          <div style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:12px;">
            <div>
              <span class="badge badge-higher" style="margin-bottom:6px;">RECOMMENDED ACTIONABLE GOAL</span>
              <h3 style="font-size:1.15rem; margin:0 0 4px; color:var(--moss-dark);">${esc(plan.dailyGoal.text)}</h3>
              <span style="font-size:0.8rem; color:var(--ink-faint);">Habit Category: ${esc(plan.dailyGoal.category)}</span>
            </div>
            <button type="button" class="btn btn-primary btn-sm" id="mc-add-plan-goal-btn">
              + Add to My Goals
            </button>
          </div>
        </div>

        <!-- 6 Pillars Grid -->
        <div class="tips-grid">
          <div class="tip-card">
            <div class="icon-wrap" style="color:var(--moss-dark);">${icons[plan.sleep.icon] || icons.moon || "🌙"}</div>
            <h3>${plan.sleep.title}</h3>
            <p>${esc(plan.sleep.text)}</p>
          </div>
          <div class="tip-card">
            <div class="icon-wrap" style="color:var(--moss-dark);">${icons[plan.activity.icon] || icons.activity || "🏃"}</div>
            <h3>${plan.activity.title}</h3>
            <p>${esc(plan.activity.text)}</p>
          </div>
          <div class="tip-card">
            <div class="icon-wrap" style="color:var(--moss-dark);">${icons[plan.screenTime.icon] || icons.phone || "📱"}</div>
            <h3>${plan.screenTime.title}</h3>
            <p>${esc(plan.screenTime.text)}</p>
          </div>
          <div class="tip-card">
            <div class="icon-wrap" style="color:var(--moss-dark);">${icons[plan.studyWork.icon] || icons.book || "📖"}</div>
            <h3>${plan.studyWork.title}</h3>
            <p>${esc(plan.studyWork.text)}</p>
          </div>
          <div class="tip-card">
            <div class="icon-wrap" style="color:var(--moss-dark);">${icons[plan.relaxation.icon] || icons.breathing || "🌬️"}</div>
            <h3>${plan.relaxation.title}</h3>
            <p>${esc(plan.relaxation.text)}</p>
            <a href="breathing.html" style="font-size:0.84rem; font-weight:700; color:var(--moss-dark); display:inline-block; margin-top:8px;">Start Guided Breathing →</a>
          </div>
          <div class="tip-card">
            <div class="icon-wrap" style="color:var(--moss-dark);">${icons[plan.social.icon] || icons.user || "👥"}</div>
            <h3>${plan.social.title}</h3>
            <p>${esc(plan.social.text)}</p>
          </div>
        </div>
      </div>

      <!-- Targeted Suggestions -->
      <div class="section-gap">
        <h2 style="font-size:1.25rem; margin-bottom:16px;">Targeted Lifestyle Factors & Insights</h2>
        <div class="suggestion-list">
          ${suggestions
            .map(
              (s) => `
            <div class="suggestion-card">
              <div class="tag">${icons.spark || "✨"} ${esc(s.tag)}</div>
              <p>${esc(s.text)}</p>
            </div>`
            )
            .join("")}
        </div>
      </div>

      <div class="disclaimer-box">
        ${icons.book || "ℹ️"}
        <span>This wellness score was evaluated by a Random Forest machine-learning regressor for educational and lifestyle guidance. It is not a clinical or psychiatric diagnosis. Always consult a healthcare professional for clinical concerns.</span>
      </div>

      <div style="margin-top:28px; display:flex; gap:12px; flex-wrap:wrap; align-items:center;">
        <a href="assessment.html" class="btn btn-primary">Take New Assessment</a>
        <button type="button" class="btn btn-secondary" id="mc-bottom-download-btn">
          📄 Download PDF Report
        </button>
        <button type="button" class="btn btn-secondary" id="mc-result-talk-ai">
          ${icons.chat || "💬"}
          <span>Chat with AI</span>
        </button>
        <a href="dashboard.html" class="btn btn-ghost">Go to Dashboard</a>
        <a href="my-results.html" class="btn btn-ghost">View History</a>
      </div>
    `;

    // Animate progress bar fill smoothly
    setTimeout(() => {
      const bar = document.getElementById("mc-score-bar");
      if (bar) {
        bar.style.width = `${score100}%`;
      }
    }, 120);

    // Add goal listener
    document.getElementById("mc-add-plan-goal-btn")?.addEventListener("click", function() {
      if (window.MindCareStore && typeof MindCareStore.saveGoal === "function") {
        MindCareStore.saveGoal(user.email, {
          title: plan.dailyGoal.text,
          category: plan.dailyGoal.category,
          status: "in_progress",
        });
      }
      this.disabled = true;
      this.textContent = "✓ Added to Goals!";
    });

    // Talk to AI Chatbot listener
    document.getElementById("mc-result-talk-ai")?.addEventListener("click", () => {
      const fab = document.getElementById("mc-chat-fab");
      const panel = document.getElementById("mc-chat-panel");
      if (panel && !panel.classList.contains("open")) {
        fab?.click();
      } else if (panel) {
        document.getElementById("mc-chat-input")?.focus();
      }
    });

    // Setup PDF download buttons
    function setupDownloadReport(btnId) {
      const btn = document.getElementById(btnId);
      if (!btn) return;

      const notifEl = document.getElementById("mc-report-notification");

      function showNotification(msg, type = "success") {
        if (!notifEl) return;
        notifEl.textContent = msg;
        notifEl.className = `report-notification ${type}`;
        setTimeout(() => {
          notifEl.className = "report-notification";
        }, 5000);
      }

      btn.addEventListener("click", async () => {
        const originalContent = btn.innerHTML;
        btn.disabled = true;
        btn.innerHTML = `<span class="spinner-sm"></span> Generating your report...`;

        try {
          let blob = null;

          // If this assessment is stored in the database, fetch official DB-generated report
          if (record.id && window.MindCareAPI && MindCareAPI.getToken() && !String(record.id).startsWith("a_")) {
            try {
              blob = await MindCareAPI.downloadAssessmentReport(record.id);
            } catch (apiErr) {
              console.warn("DB report generation failed, falling back to payload generation:", apiErr);
            }
          }

          if (!blob) {
            const reportPayload = {
              user_name: user.name || "Student",
              user_email: user.email,
              assessment_id: record.id,
              assessment_date: record.date || new Date().toISOString(),
              score: score,
              score_100: score100,
              prediction: prediction,
              category: category,
              form_data: formData,
              recommendations: suggestions.map((s) => ({ tag: s.tag, text: s.text })),
              additional_data: {
                today_mood: window.MindCareStore && MindCareStore.getTodayMood ? MindCareStore.getTodayMood(user.email) : null,
                streaks: window.MindCareStore && MindCareStore.getStreaks ? MindCareStore.getStreaks(user.email) : null,
                goals_count: (window.MindCareStore && MindCareStore.getGoals ? MindCareStore.getGoals(user.email) : []).length,
              },
            };
            blob = await MindCareAPI.downloadReportPDF(reportPayload);
          }

          // Trigger native browser download
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `MindCare_Mental_Wellness_Report_${record.id || "assessment"}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);

          btn.innerHTML = "✓ Report generated successfully";
          btn.classList.add("success");
          showNotification("✓ Report generated successfully! Your PDF download should start immediately.", "success");

          setTimeout(() => {
            btn.disabled = false;
            btn.classList.remove("success");
            btn.innerHTML = originalContent;
          }, 3500);
        } catch (err) {
          console.error("Report download failed:", err);
          btn.disabled = false;
          btn.classList.add("error");
          btn.innerHTML = "⚠️ Unable to generate the report. Please try again.";
          showNotification(err.friendlyMessage || "Unable to generate the report. Please try again.", "error");

          setTimeout(() => {
            btn.classList.remove("error");
            btn.innerHTML = originalContent;
          }, 4000);
        }
      });
    }

    setupDownloadReport("mc-download-report-btn");
    setupDownloadReport("mc-bottom-download-btn");

    console.log("[MindCare] Result page successfully rendered score:", score100);
  } catch (err) {
    console.error("[MindCare] Unexpected error in mcRunResultPage:", err);
    const content = document.getElementById("mc-result-content");
    if (content) {
      content.innerHTML = `
        <div class="card-elevated section-gap" style="padding:32px; text-align:center;">
          <h2 style="color:var(--moss-dark); margin-bottom:12px;">Your Mental Wellness Result</h2>
          <p style="color:var(--ink-soft); margin-bottom:20px;">We recovered your latest assessment submission.</p>
          <div style="display:flex; justify-content:center; gap:12px; margin-top:20px;">
            <a href="assessment.html" class="btn btn-primary">Retake Assessment</a>
            <a href="dashboard.html" class="btn btn-secondary">Go to Dashboard</a>
            <button type="button" class="btn btn-ghost" onclick="location.reload()">Reload Result</button>
          </div>
        </div>
      `;
    }
  }
}

// Support both DOMContentLoaded and immediate readyState
if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", mcRunResultPage);
} else {
  mcRunResultPage();
}

