/**
 * dashboard.js — Comprehensive Mental Wellness Dashboard
 * Zero-latency immediate local state render with background API synchronization
 * and isolated component error boundaries.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  if (typeof mcInitChatbot === "function") {
    try { mcInitChatbot(user); } catch (e) {}
  }

  // Personalized Welcome Name Resolution
  const welcomeEl = document.getElementById("mc-welcome-name");
  if (welcomeEl) {
    let displayName = "";
    if (user.name && user.name.trim()) {
      displayName = user.name.trim().split(" ")[0];
    } else if (typeof MindCareStore !== "undefined" && MindCareStore.getProfile) {
      const prof = MindCareStore.getProfile(user.email);
      if (prof && prof.name && prof.name.trim()) {
        displayName = prof.name.trim().split(" ")[0];
      }
    }
    if (!displayName && user.email) {
      displayName = user.email.split("@")[0];
    }
    if (displayName) {
      welcomeEl.textContent = displayName;
    }
  }

  // ---------------------------------------------------------------------------
  // Component Error Boundary Helper
  // ---------------------------------------------------------------------------
  function safeRender(name, elementId, renderFn) {
    try {
      renderFn();
    } catch (err) {
      console.error(`[MindCare Dashboard] Error rendering ${name}:`, err);
      if (elementId) {
        const el = document.getElementById(elementId);
        if (el) {
          el.innerHTML = `
            <div class="empty-state" style="padding: 24px 16px;">
              <p style="font-size:0.9rem; color:var(--ink-soft); margin-bottom:12px;">Unable to display ${name}.</p>
              <button type="button" class="btn btn-secondary btn-sm" onclick="location.reload()">↻ Retry</button>
            </div>
          `;
        }
      }
    }
  }

  // ---------------------------------------------------------------------------
  // Synchronous Immediate Render + Background API Sync
  // ---------------------------------------------------------------------------
  let localHistory = [];
  if (typeof MindCareStore !== "undefined" && MindCareStore.getAssessments) {
    localHistory = MindCareStore.getAssessments(user.email) || [];
  }

  function renderAssessmentSections(hist) {
    const latest = hist && hist.length > 0 ? hist[0] : null;
    const previous = hist && hist.length > 1 ? hist[1] : null;

    if (latest && typeof MindCareResults !== "undefined" && MindCareResults.setActiveResult) {
      MindCareResults.setActiveResult(latest);
    }

    safeRender("Score Hero", "mc-score-section", () => renderScoreHero(latest, previous));
    safeRender("Forecast Engine", "mc-forecast-section", () => renderForecastCard(user, hist));
    safeRender("Progress Section", "mc-progress-section", () => renderProgressSection(hist));
    safeRender("Behavioral Indicators", "mc-overview-section", () => renderIndicatorsAndSuggestions(latest));
  }

  // Step 1: Immediate instant render from local store (0ms latency, eliminates dark blank boxes)
  safeRender("Streaks", "mc-dash-streaks", renderStreaks);
  safeRender("Mood Widget", "mc-dash-mood", renderMoodWidget);
  safeRender("Goals Widget", "mc-dash-goals", renderGoalsWidget);
  renderAssessmentSections(localHistory);

  // Step 2: Non-blocking asynchronous sync from backend MySQL API
  if (window.MindCareAPI && typeof MindCareAPI.getToken === "function" && MindCareAPI.getToken()) {
    MindCareAPI.getAssessments()
      .then((remoteHistory) => {
        if (remoteHistory && Array.isArray(remoteHistory)) {
          if (typeof MindCareStore !== "undefined" && MindCareStore.syncAssessments) {
            MindCareStore.syncAssessments(user.email, remoteHistory);
          }
          renderAssessmentSections(remoteHistory);
        }
      })
      .catch((e) => {
        console.warn("[MindCare] Failed to load assessments from API, continuing with local store:", e);
      });
  }

  // ---------------------------------------------------------------------------
  // Streaks Row
  // ---------------------------------------------------------------------------
  function renderStreaks() {
    const streaks = (typeof MindCareStore !== "undefined" && MindCareStore.getStreaks)
      ? MindCareStore.getStreaks(user.email)
      : { moodStreak: 0, journalStreak: 0, goalStreak: 0 };
    const container = document.getElementById("mc-dash-streaks");
    if (!container) return;

    container.innerHTML = `
      <div class="streak-card">
        <div class="streak-icon">${MC_ICONS.flame}</div>
        <div>
          <div class="streak-val">${streaks.moodStreak} ${streaks.moodStreak === 1 ? "Day" : "Days"}</div>
          <div class="streak-label">Daily Mood Check-in Streak</div>
        </div>
      </div>
      <div class="streak-card">
        <div class="streak-icon" style="background:#EEF5F1; color:var(--moss-dark);">${MC_ICONS.journal}</div>
        <div>
          <div class="streak-val">${streaks.journalStreak} ${streaks.journalStreak === 1 ? "Day" : "Days"}</div>
          <div class="streak-label">Private Journal Streak</div>
        </div>
      </div>
      <div class="streak-card">
        <div class="streak-icon" style="background:#EFF3FB; color:var(--horizon-dark);">${MC_ICONS.target}</div>
        <div>
          <div class="streak-val">${streaks.goalStreak} Completed</div>
          <div class="streak-label">Wellness Goals Accomplished</div>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Score Hero
  // ---------------------------------------------------------------------------
  function renderScoreHero(current, prev) {
    const scoreSection = document.getElementById("mc-score-section");
    if (!scoreSection) return;

    if (!current) {
      scoreSection.innerHTML = `
        <div class="empty-state">
          <div class="icon-wrap">${MC_ICONS.clipboard}</div>
          <h3>No assessments taken yet</h3>
          <p>Complete your first mental wellness assessment to generate your personalized machine-learning wellness score.</p>
          <a href="assessment.html" class="btn btn-primary">Take Assessment</a>
        </div>`;
      return;
    }

    const numScore = Number(current.score || 0);
    const score100 = current.score_100 !== undefined ? current.score_100 : Math.round(numScore * 10);
    const prediction = current.prediction || (numScore >= 7.0 ? "Higher range" : (numScore >= 4.0 ? "Moderate range" : "Lower range"));
    const catKey = numScore < 4.0 ? "low" : (numScore < 7.0 ? "moderate" : "higher");
    const interp = (typeof scoreInterpretations !== "undefined" && scoreInterpretations[catKey]) || {
      label: prediction,
      badgeClass: "badge-moderate",
      text: "Your score reflects your self-reported daily habits and stress levels as analyzed by the machine-learning model."
    };

    let deltaBadge = "";
    if (prev) {
      const diff = numScore - Number(prev.score || 0);
      const sign = diff >= 0 ? "+" : "";
      const deltaClass = diff >= 0 ? "badge-higher" : "badge-low";
      deltaBadge = `<span class="badge ${deltaClass}" style="margin-left:10px;">${sign}${diff.toFixed(2)} vs last assessment</span>`;
    }

    const assessDate = (typeof MindCareResults !== "undefined" && MindCareResults.formatDate)
      ? MindCareResults.formatDate(current.date)
      : (current.date ? current.date.slice(0, 10) : "Recent");

    scoreSection.innerHTML = `
      <div class="score-hero">
        <div class="gauge-wrap" style="width:160px;height:160px;">
          ${typeof mcGaugeSVG === "function" ? mcGaugeSVG(numScore, 160) : ""}
          <div class="gauge-center">
            <div class="score-num" style="font-size:2rem;">${numScore.toFixed(2)}</div>
            <div class="score-max">out of 10.0</div>
          </div>
        </div>
        <div class="meta">
          <div class="eyebrow">LATEST MACHINE LEARNING PREDICTION</div>
          <h2>Mental Wellness Score: <span style="color:var(--moss-dark);">${score100} / 100</span> <span style="font-size:0.95rem; font-weight:500; color:var(--ink-faint);">(${numScore.toFixed(2)}/10)</span> ${deltaBadge}</h2>
          <p style="color:var(--ink-faint); margin-bottom:8px;">Assessed on ${assessDate}</p>
          <span class="badge ${interp.badgeClass}">${mcEscape(current.prediction || interp.label)}</span>
          <p style="margin-top:12px; font-size:0.92rem; color:var(--ink); line-height:1.5;">${interp.text}</p>
          <div style="margin-top:16px; display:flex; gap:10px; flex-wrap:wrap;">
            <a href="assessment.html" class="btn btn-primary btn-sm">Retake Assessment</a>
            <button type="button" class="btn btn-secondary btn-sm" id="mc-dash-chat-btn">
              ${MC_ICONS.chat}
              <span>Chat with AI</span>
            </button>
            <a href="result.html?id=${encodeURIComponent(current.id || '')}" class="btn btn-ghost btn-sm">Full Report & Wellness Plan →</a>
          </div>
        </div>
      </div>`;

    document.getElementById("mc-dash-chat-btn")?.addEventListener("click", () => {
      document.getElementById("mc-chat-fab")?.click();
    });
  }

  // ---------------------------------------------------------------------------
  // Predictive Early-Warning & Wellness Forecast
  // ---------------------------------------------------------------------------
  function renderForecastCard(currentUser, assessHist) {
    const forecastEl = document.getElementById("mc-forecast-section");
    if (!forecastEl) return;

    if (typeof MindCareForecast === "undefined" || !MindCareForecast.generateForecast) {
      forecastEl.style.display = "none";
      return;
    }

    const moods = (typeof MindCareStore !== "undefined" && MindCareStore.getMoodHistory) ? MindCareStore.getMoodHistory(currentUser.email) : [];
    const journals = (typeof MindCareStore !== "undefined" && MindCareStore.getJournalEntries) ? MindCareStore.getJournalEntries(currentUser.email) : [];
    const assessments = assessHist || ((typeof MindCareStore !== "undefined" && MindCareStore.getAssessments) ? MindCareStore.getAssessments(currentUser.email) : []);

    let forecast = null;
    try {
      forecast = MindCareForecast.generateForecast({ moods, journals, assessments });
    } catch (err) {
      console.warn("[MindCare Forecast Engine] Evaluation error:", err);
    }

    // Helper for rendering the Progressive Baseline Onboarding state
    function renderOnboardingBaseline(observed = 0, required = 5) {
      const unlockIn = Math.max(0, required - observed);
      const pct = Math.min(100, Math.round((observed / Math.max(1, required)) * 100));

      forecastEl.innerHTML = `
        <div class="forecast-empty-state">
          <div style="font-size:2.2rem; margin-bottom:10px;">🌱</div>
          <h3 style="font-size:1.2rem; margin:0 0 6px;">Building Your Predictive Baseline</h3>
          <p style="font-size:0.88rem; color:var(--ink-soft); max-width:480px; margin:0 auto 16px;">
            MindCare AI uses your historical check-in patterns to forecast wellness trends 3–5 days ahead. 
            Log <strong>${unlockIn} more daily check-in${unlockIn === 1 ? "" : "s"}</strong> to unlock early-warning insights.
          </p>
          <div class="forecast-progress-track">
            <div class="forecast-progress-fill" style="width:${pct}%;"></div>
          </div>
          <div style="font-size:0.8rem; font-weight:700; color:var(--moss-dark); margin-bottom:18px;">
            ${observed} of ${required} Check-ins Logged (${pct}%)
          </div>
          <div style="display:flex; justify-content:center; gap:10px; flex-wrap:wrap;">
            <a href="mood.html" class="btn btn-primary btn-sm">🎙️ Log Today's Mood</a>
            <a href="journal.html" class="btn btn-secondary btn-sm">Write Journal Reflection</a>
          </div>
          <div class="forecast-disclaimer" style="margin-top:24px; text-align:left;">
            <span>ℹ️</span>
            <span>Early pattern detection: All forecasts are modeled exclusively on your device from your self-reported check-ins, without diagnostic or clinical claims.</span>
          </div>
        </div>
      `;
    }

    // 1. Progressive Baseline State (< 5 data points)
    if (!forecast || forecast.status === "insufficient_data") {
      const observed = forecast && (forecast.dataPointsUsed !== undefined ? forecast.dataPointsUsed : forecast.observedCount) || 0;
      const required = (typeof FORECAST_CONFIG !== "undefined" && FORECAST_CONFIG.MIN_DATA_POINTS) || (forecast && forecast.requiredCount) || 5;
      renderOnboardingBaseline(observed, required);
      return;
    }

    // 2. Ready State with Full Forecast & Projections
    const {
      trendType = "stable",
      trendLabel = "Steady & Balanced",
      historicalPoints = [],
      projectedPoints = [],
      smoothedScores = [],
      factors = [],
      topFactor = "",
      confidence = 0.8,
      nudge = null,
      safetyDisclaimer = "Early pattern detection: All forecasts are modeled exclusively on your device from your self-reported check-ins, without diagnostic or clinical claims."
    } = forecast;

    if (!historicalPoints || historicalPoints.length === 0 || !smoothedScores || smoothedScores.length === 0) {
      renderOnboardingBaseline(0, 5);
      return;
    }

    const width = 720;
    const height = 220;
    const pad = { top: 25, right: 30, bottom: 35, left: 44 };
    const innerW = width - pad.left - pad.right;
    const innerH = height - pad.top - pad.bottom;

    const totalPointsCount = historicalPoints.length + (projectedPoints ? projectedPoints.length : 0);
    const xStep = innerW / Math.max(1, totalPointsCount - 1);

    // Map historical points
    const histCoords = historicalPoints.map((p, i) => {
      const x = pad.left + i * xStep;
      const scoreVal = smoothedScores[i] !== undefined ? smoothedScores[i] : (p.wellnessScore || 50);
      const y = pad.top + innerH - (Math.max(0, Math.min(100, scoreVal)) / 100) * innerH;
      return { x, y, score: scoreVal, raw: p.wellnessScore, date: p.dayLabel || `Day ${i + 1}`, isObserved: p.isObserved };
    });

    if (histCoords.length === 0) {
      renderOnboardingBaseline(0, 5);
      return;
    }

    const lastHistCoord = histCoords[histCoords.length - 1];

    // Map projected points (anchored at last historical point)
    const projCoords = [
      { x: lastHistCoord.x, y: lastHistCoord.y, score: lastHistCoord.score, upper: lastHistCoord.score, lower: lastHistCoord.score, date: "Today" },
      ...(projectedPoints || []).map((p, j) => {
        const x = pad.left + (historicalPoints.length + j) * xStep;
        const scoreVal = p.projectedScore !== undefined ? p.projectedScore : 50;
        const y = pad.top + innerH - (Math.max(0, Math.min(100, scoreVal)) / 100) * innerH;
        const yUpper = pad.top + innerH - (Math.max(0, Math.min(100, p.upperBound !== undefined ? p.upperBound : scoreVal)) / 100) * innerH;
        const yLower = pad.top + innerH - (Math.max(0, Math.min(100, p.lowerBound !== undefined ? p.lowerBound : scoreVal)) / 100) * innerH;
        return { x, y, yUpper, yLower, score: scoreVal, upper: p.upperBound, lower: p.lowerBound, date: p.dayLabel || `+${j + 1}d` };
      })
    ];

    // SVG paths
    const histPathD = histCoords.reduce((acc, c, idx) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`), "");
    const proPathD = projCoords.reduce((acc, c, idx) => (idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`), "");

    // Confidence corridor polygon
    const upperPoints = projCoords.map(c => `${c.x} ${c.yUpper !== undefined ? c.yUpper : c.y}`).join(" L ");
    const lowerPoints = [...projCoords].reverse().map(c => `${c.x} ${c.yLower !== undefined ? c.yLower : c.y}`).join(" L ");
    const confidencePolygonD = `M ${upperPoints} L ${lowerPoints} Z`;

    const splitX = lastHistCoord.x;
    const startDayLabel = historicalPoints[0]?.dayLabel || "14d ago";
    const endDayLabel = projCoords[projCoords.length - 1]?.date || "+5 Days";

    const svgMarkup = `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; overflow:visible;">
        <defs>
          <linearGradient id="forecastAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3F7D5C" stop-opacity="0.20" />
            <stop offset="100%" stop-color="#3F7D5C" stop-opacity="0.0" />
          </linearGradient>
          <linearGradient id="forecastConfidenceGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#6E7FB3" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#6E7FB3" stop-opacity="0.08" />
          </linearGradient>
        </defs>

        <!-- Horizontal Grid Lines -->
        <line x1="${pad.left}" y1="${pad.top}" x2="${width - pad.right}" y2="${pad.top}" stroke="var(--border)" stroke-dasharray="3,3" />
        <line x1="${pad.left}" y1="${pad.top + innerH / 2}" x2="${width - pad.right}" y2="${pad.top + innerH / 2}" stroke="var(--border)" stroke-dasharray="3,3" />
        <line x1="${pad.left}" y1="${pad.top + innerH}" x2="${width - pad.right}" y2="${pad.top + innerH}" stroke="var(--border)" />

        <!-- Y Axis Labels -->
        <text x="${pad.left - 8}" y="${pad.top + 4}" font-size="10" fill="var(--ink-faint)" text-anchor="end">100</text>
        <text x="${pad.left - 8}" y="${pad.top + innerH / 2 + 3}" font-size="10" fill="var(--ink-faint)" text-anchor="end">50</text>
        <text x="${pad.left - 8}" y="${pad.top + innerH + 3}" font-size="10" fill="var(--ink-faint)" text-anchor="end">0</text>

        <!-- Forecast Split Dividing Line -->
        <line x1="${splitX}" y1="${pad.top}" x2="${splitX}" y2="${pad.top + innerH}" stroke="var(--border-strong)" stroke-dasharray="4,4" />
        <text x="${splitX - 6}" y="${pad.top - 8}" font-size="9" font-weight="700" fill="var(--ink-faint)" text-anchor="end">Historical (14d)</text>
        <text x="${splitX + 6}" y="${pad.top - 8}" font-size="9" font-weight="700" fill="var(--horizon)" text-anchor="start">Forecast (Next 5d)</text>

        <!-- Confidence Corridor -->
        <path d="${confidencePolygonD}" fill="url(#forecastConfidenceGrad)" />

        <!-- Historical Solid Line -->
        <path d="${histPathD}" fill="none" stroke="var(--moss)" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Projected Dotted Line -->
        <path d="${proPathD}" fill="none" stroke="var(--horizon)" stroke-width="2.5" stroke-dasharray="4,4" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Historical Points -->
        ${histCoords.filter((c, idx) => idx % 2 === 0 || idx === histCoords.length - 1).map(c => `
          <circle cx="${c.x}" cy="${c.y}" r="3.5" fill="#fff" stroke="var(--moss)" stroke-width="2" />
        `).join("")}

        <!-- Projected Points & Confidence Corridor Markers -->
        ${projCoords.slice(1).map(c => `
          <g>
            <circle cx="${c.x}" cy="${c.y}" r="4" fill="var(--surface)" stroke="var(--horizon)" stroke-width="2" />
            <text x="${c.x}" y="${c.y - 8}" font-size="10" font-weight="700" fill="var(--horizon-dark)" text-anchor="middle">${Math.round(c.score)}</text>
          </g>
        `).join("")}

        <!-- X Axis Date Labels (Sampled) -->
        <text x="${histCoords[0].x}" y="${pad.top + innerH + 18}" font-size="9" fill="var(--ink-faint)" text-anchor="start">${startDayLabel}</text>
        <text x="${splitX}" y="${pad.top + innerH + 18}" font-size="9" font-weight="600" fill="var(--ink)" text-anchor="middle">Today</text>
        <text x="${projCoords[projCoords.length - 1].x}" y="${pad.top + innerH + 18}" font-size="9" font-weight="600" fill="var(--horizon-dark)" text-anchor="end">${endDayLabel}</text>
      </svg>
    `;

    forecastEl.innerHTML = `
      <div class="forecast-card">
        <div class="forecast-head">
          <div>
            <div style="font-size:0.75rem; font-weight:700; color:var(--moss-dark); text-transform:uppercase; letter-spacing:0.05em; margin-bottom:2px;">
              PREDICTIVE EARLY-WARNING ENGINE
            </div>
            <h3>Your 3–5 Day Wellness Trajectory</h3>
            <p>Anticipates potential emotional momentum and dips using your self-reported signals.</p>
          </div>
          <span class="forecast-status-pill ${trendType}">
            ${trendType === "declining" ? "⚠️" : (trendType === "improving" ? "📈" : "🟢")} ${trendLabel}
          </span>
        </div>

        <!-- SVG Chart -->
        <div class="forecast-chart-wrap">
          ${svgMarkup}
          <div class="forecast-legend">
            <span class="forecast-legend-item"><span class="legend-line history"></span> Historical 14-Day Pattern</span>
            <span class="forecast-legend-item"><span class="legend-line projected"></span> 5-Day Trajectory Projection</span>
            <span class="forecast-legend-item"><span class="legend-area confidence"></span> 90% Confidence Interval</span>
          </div>
        </div>

        <!-- Explainability Factors Box -->
        <div class="forecast-explain-box">
          <div class="explain-title" style="display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:6px;">
            <div style="display:flex; align-items:center; gap:6px;">
              <span>🔍</span>
              <span>Key Factors Driving This Forecast</span>
            </div>
            ${confidence !== undefined && confidence !== null ? `<span style="font-size:0.8rem; font-weight:600; color:var(--ink-faint);">Model Confidence: ${Math.round(confidence * 100)}%</span>` : ""}
          </div>
          ${topFactor ? `
            <div style="font-size:0.86rem; font-weight:600; color:var(--ink); margin:8px 0 10px; padding:6px 12px; background:rgba(0,0,0,0.03); border-radius:6px; display:flex; align-items:center; gap:6px;">
              <span style="color:var(--moss-dark);">Primary Driver:</span>
              <span style="font-style:italic; font-weight:500;">${mcEscape(topFactor)}</span>
            </div>
          ` : ""}
          <div class="forecast-factors-list">
            ${(factors || []).map(f => `
              <div class="forecast-factor-item">
                <span class="factor-icon">${f.impact === "negative" ? "📉" : (f.impact === "positive" ? "📈" : "⚖️")}</span>
                <div>
                  <strong>${mcEscape(f.title || '')}:</strong> ${mcEscape(f.description || '')}
                </div>
              </div>
            `).join("")}
          </div>
        </div>

        <!-- Proactive Gentle Nudge (if declining) -->
        ${nudge ? `
          <div class="forecast-nudge-card">
            <div class="forecast-nudge-left">
              <span class="forecast-nudge-icon">${nudge.icon || "💡"}</span>
              <div>
                <div class="forecast-nudge-title">${mcEscape(nudge.title || '')}</div>
                <p class="forecast-nudge-desc">${mcEscape(nudge.message || '')}</p>
              </div>
            </div>
            <a href="${nudge.actionUrl || 'mood.html'}" class="btn btn-primary btn-sm" style="white-space:nowrap;">${mcEscape(nudge.actionLabel || 'Check In')} →</a>
          </div>
        ` : ""}

        <!-- Permanent Safety Disclaimer -->
        <div class="forecast-disclaimer">
          <span style="font-size:1rem; flex-shrink:0;">ℹ️</span>
          <span>${mcEscape(safetyDisclaimer)}</span>
        </div>
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Score Trend & Progress Tracking (SVG Line Chart)
  // ---------------------------------------------------------------------------
  function renderProgressSection(hist) {
    const progressEl = document.getElementById("mc-progress-section");
    if (!progressEl) return;

    if (!hist || hist.length < 2) {
      progressEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center;">
          <div>
            <h3 style="font-size:1.15rem; margin:0 0 4px;">Mental Wellness Progress & Trends</h3>
            <p style="font-size:0.86rem; color:var(--ink-soft); margin:0;">Track score improvements across multiple assessments.</p>
          </div>
          <a href="assessment.html" class="btn btn-ghost btn-sm">Take 2nd Assessment →</a>
        </div>
        <div style="text-align:center; padding:32px 16px; color:var(--ink-faint); font-size:0.9rem;">
          Take at least 2 assessments to view your score trend progression chart.
        </div>`;
      return;
    }

    // Sort ascending by date for chronological chart
    const points = [...hist].reverse();
    const width = 680;
    const height = 180;
    const padding = { top: 20, right: 30, bottom: 35, left: 40 };

    const minScore = 0;
    const maxScore = 10;
    const innerW = width - padding.left - padding.right;
    const innerH = height - padding.top - padding.bottom;

    const xStep = innerW / Math.max(1, points.length - 1);
    const coords = points.map((p, idx) => {
      const scoreVal = Number(p.score || 0);
      const x = padding.left + idx * xStep;
      const y = padding.top + innerH - (scoreVal / maxScore) * innerH;
      const fmtDate = (typeof MindCareResults !== "undefined" && MindCareResults.formatDate)
        ? MindCareResults.formatDate(p.date)
        : (p.date ? p.date.slice(0, 10) : "");
      return { x, y, score: scoreVal, date: fmtDate };
    });

    const pathD = coords.reduce((acc, c, idx) => {
      return idx === 0 ? `M ${c.x} ${c.y}` : `${acc} L ${c.x} ${c.y}`;
    }, "");

    const areaD = `${pathD} L ${coords[coords.length - 1].x} ${padding.top + innerH} L ${coords[0].x} ${padding.top + innerH} Z`;

    const svgMarkup = `
      <svg viewBox="0 0 ${width} ${height}" style="width:100%; height:auto; overflow:visible;">
        <defs>
          <linearGradient id="scoreAreaGrad" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stop-color="#3F7D5C" stop-opacity="0.25" />
            <stop offset="100%" stop-color="#3F7D5C" stop-opacity="0.0" />
          </linearGradient>
        </defs>
        <!-- Horizontal Grid Lines -->
        <line x1="${padding.left}" y1="${padding.top}" x2="${width - padding.right}" y2="${padding.top}" stroke="var(--border)" stroke-dasharray="3,3" />
        <line x1="${padding.left}" y1="${padding.top + innerH / 2}" x2="${width - padding.right}" y2="${padding.top + innerH / 2}" stroke="var(--border)" stroke-dasharray="3,3" />
        <line x1="${padding.left}" y1="${padding.top + innerH}" x2="${width - padding.right}" y2="${padding.top + innerH}" stroke="var(--border)" />
        
        <!-- Y Axis Labels -->
        <text x="${padding.left - 10}" y="${padding.top + 4}" font-size="10" fill="var(--ink-faint)" text-anchor="end">10</text>
        <text x="${padding.left - 10}" y="${padding.top + innerH / 2 + 3}" font-size="10" fill="var(--ink-faint)" text-anchor="end">5</text>
        <text x="${padding.left - 10}" y="${padding.top + innerH + 3}" font-size="10" fill="var(--ink-faint)" text-anchor="end">0</text>

        <!-- Shaded Area & Line -->
        <path d="${areaD}" fill="url(#scoreAreaGrad)" />
        <path d="${pathD}" fill="none" stroke="var(--moss)" stroke-width="3" stroke-linecap="round" stroke-linejoin="round" />

        <!-- Data Points & Labels -->
        ${coords
          .map(
            (c) => `
          <g>
            <circle cx="${c.x}" cy="${c.y}" r="5" fill="#fff" stroke="var(--moss)" stroke-width="2.5" />
            <text x="${c.x}" y="${c.y - 10}" font-size="11" font-weight="700" fill="var(--moss-dark)" text-anchor="middle">${c.score.toFixed(1)}</text>
            <text x="${c.x}" y="${padding.top + innerH + 20}" font-size="10" fill="var(--ink-faint)" text-anchor="middle">${c.date}</text>
          </g>`
          )
          .join("")}
      </svg>
    `;

    progressEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:18px;">
        <div>
          <h3 style="font-size:1.15rem; margin:0 0 4px;">Mental Wellness Score Progression</h3>
          <p style="font-size:0.86rem; color:var(--ink-soft); margin:0;">Chronological performance across ${hist.length} assessments.</p>
        </div>
        <a href="my-results.html" class="btn btn-ghost btn-sm">Full History Table →</a>
      </div>
      <div style="background:var(--surface); border-radius:var(--radius-md); padding:10px 0;">
        ${svgMarkup}
      </div>
    `;
  }

  // ---------------------------------------------------------------------------
  // Today's Mood Widget
  // ---------------------------------------------------------------------------
  function renderMoodWidget() {
    const moodEl = document.getElementById("mc-dash-mood");
    if (!moodEl) return;

    const todayMood = (typeof MindCareStore !== "undefined" && MindCareStore.getTodayMood)
      ? MindCareStore.getTodayMood(user.email)
      : null;

    moodEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px; flex-wrap:wrap; gap:6px;">
        <h3 style="font-size:1.1rem; margin:0;">Daily Mood Status</h3>
        <a href="mood.html" style="font-size:0.84rem; font-weight:600;">View Analytics →</a>
      </div>
      ${
        todayMood
          ? `
        <div style="background:var(--moss-light); border-radius:var(--radius-md); padding:16px; display:flex; align-items:center; gap:16px; flex-wrap:wrap;">
          <span style="font-size:2.8rem; line-height:1;">${todayMood.emoji || "🙂"}</span>
          <div>
            <div style="font-weight:700; font-size:1.1rem; color:var(--moss-dark);">Feeling ${todayMood.label || "Good"} Today</div>
            <p style="font-size:0.84rem; color:var(--ink); margin:4px 0 0;">${todayMood.note ? `“${mcEscape(todayMood.note)}”` : "No note added today."}</p>
            ${todayMood.isVoiceEntry ? `
              <div style="margin-top:6px; display:inline-flex; align-items:center; gap:6px; font-size:0.74rem; font-weight:700; color:var(--moss-dark); background:var(--surface); padding:3px 9px; border-radius:var(--radius-pill); border:1px solid var(--border);">
                <span>🎙️ Voice Check-in</span>
                <span style="color:var(--ink-faint); font-weight:500;">Words: ${todayMood.textSentimentScore ? todayMood.textSentimentScore.toFixed(1) : "—"}/5 • Tone: ${todayMood.vocalToneScore ? todayMood.vocalToneScore.toFixed(1) : "—"}/5</span>
              </div>
            ` : ""}
          </div>
        </div>
        <div style="margin-top:14px; text-align:right;">
          <a href="mood.html" class="btn btn-ghost btn-sm">Update Mood Check-in</a>
        </div>`
          : `
        <div class="empty-state" style="padding:24px 16px; margin-bottom:14px;">
          <p style="font-size:0.9rem; margin-bottom:12px;">You haven't checked in with your emotional state today.</p>
          <a href="mood.html" class="btn btn-primary btn-sm">🎙️ Check-in with Voice or Text</a>
        </div>
        <div style="display:flex; gap:8px; justify-content:space-between; flex-wrap:wrap;">
          <button type="button" class="btn btn-secondary btn-sm dash-quick-mood" data-mood="5" style="flex:1 1 70px;">😄 Great</button>
          <button type="button" class="btn btn-secondary btn-sm dash-quick-mood" data-mood="4" style="flex:1 1 70px;">🙂 Good</button>
          <button type="button" class="btn btn-secondary btn-sm dash-quick-mood" data-mood="3" style="flex:1 1 70px;">😐 Okay</button>
          <button type="button" class="btn btn-secondary btn-sm dash-quick-mood" data-mood="2" style="flex:1 1 70px;">😟 Low</button>
        </div>`
      }
    `;

    moodEl.querySelectorAll(".dash-quick-mood").forEach((btn) => {
      btn.addEventListener("click", () => {
        const moodVal = Number(btn.dataset.mood);
        if (typeof MindCareStore !== "undefined" && MindCareStore.saveMood) {
          MindCareStore.saveMood(user.email, { mood: moodVal });
        }
        renderStreaks();
        renderMoodWidget();
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Goals Progress Widget
  // ---------------------------------------------------------------------------
  function renderGoalsWidget() {
    const goalsEl = document.getElementById("mc-dash-goals");
    if (!goalsEl) return;

    const goals = (typeof MindCareStore !== "undefined" && MindCareStore.getGoals)
      ? MindCareStore.getGoals(user.email)
      : [];
    const rate = (typeof MindCareStore !== "undefined" && MindCareStore.getGoalCompletionRate)
      ? MindCareStore.getGoalCompletionRate(user.email)
      : 0;

    if (!goals || goals.length === 0) {
      goalsEl.innerHTML = `
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
          <h3 style="font-size:1.1rem; margin:0;">Wellness Goals</h3>
          <a href="profile.html#goals" style="font-size:0.84rem; font-weight:600;">Manage Goals →</a>
        </div>
        <div class="empty-state" style="padding: 24px 16px;">
          <p style="font-size:0.9rem; margin-bottom:12px;">No active wellness goals set yet.</p>
          <a href="profile.html#goals" class="btn btn-secondary btn-sm">+ Set Your First Goal</a>
        </div>
      `;
      return;
    }

    goalsEl.innerHTML = `
      <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:12px;">
        <div>
          <h3 style="font-size:1.1rem; margin:0 0 2px;">Wellness Goals</h3>
          <span style="font-size:0.82rem; color:var(--ink-faint);">${rate}% completed</span>
        </div>
        <a href="profile.html#goals" style="font-size:0.84rem; font-weight:600;">Manage Goals →</a>
      </div>
      <div class="stat-bar-track" style="height:8px; margin-bottom:16px;">
        <div class="stat-bar-fill" style="width:${rate}%;"></div>
      </div>
      <div class="goal-list">
        ${goals
          .slice(0, 3)
          .map(
            (g) => `
          <div class="goal-card ${g.status === "completed" ? "completed" : ""}">
            <div class="goal-left">
              <div class="goal-checkbox ${g.status === "completed" ? "checked" : ""}" data-id="${g.id}">
                ${g.status === "completed" ? `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>` : ""}
              </div>
              <span class="goal-title" style="font-size:0.88rem;">${mcEscape(g.title || '')}</span>
            </div>
            <span style="font-size:0.75rem; color:var(--ink-faint); font-weight:600;">${mcEscape(g.category || 'General')}</span>
          </div>`
          )
          .join("")}
      </div>
    `;

    goalsEl.querySelectorAll(".goal-checkbox").forEach((box) => {
      box.addEventListener("click", () => {
        const goalId = box.dataset.id;
        const currentGoal = goals.find((g) => g.id === goalId);
        if (currentGoal && typeof MindCareStore !== "undefined" && MindCareStore.updateGoalStatus) {
          const nextStatus = currentGoal.status === "completed" ? "in_progress" : "completed";
          MindCareStore.updateGoalStatus(user.email, goalId, nextStatus);
          renderStreaks();
          renderGoalsWidget();
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Behavioral Indicators & Suggestions
  // ---------------------------------------------------------------------------
  function renderIndicatorsAndSuggestions(latestRec) {
    const overviewSection = document.getElementById("mc-overview-section");
    if (!overviewSection) return;

    if (!latestRec) {
      overviewSection.style.display = "none";
      return;
    }

    overviewSection.style.display = "block";
    const f = latestRec.formData || {};
    
    // Support both direct model input format and local store format
    const sleepVal = f.sleep_hours_per_night !== undefined ? Number(f.sleep_hours_per_night) : 7.0;
    const activityVal = f.physical_activity_hours !== undefined ? Number(f.physical_activity_hours) : 1.0;
    const studyVal = f.study_hours !== undefined ? Number(f.study_hours) : 4.0;
    const mediaVal = f.avg_daily_usage_hours !== undefined ? Number(f.avg_daily_usage_hours) : 3.0;
    const stressVal = f.stress_level || "Medium";

    let suggestions = [];
    if (latestRec.recommendations && Array.isArray(latestRec.recommendations) && latestRec.recommendations.length > 0) {
      suggestions = latestRec.recommendations.map((r) => ({
        badge: r.badge || "Focus",
        tag: r.title || r.tag || "Wellness Priority",
        text: r.desc || r.text || ""
      }));
    }
    if (suggestions.length === 0 && typeof generateWellnessSuggestions === "function") {
      suggestions = generateWellnessSuggestions(f, latestRec.score);
    }

    const overviewItems = [
      { label: "Sleep Duration", value: `${sleepVal}h / night`, icon: MC_ICONS.moon, pct: Math.min(100, (sleepVal / 9) * 100) },
      { label: "Physical Activity", value: `${activityVal}h / day`, icon: MC_ICONS.activity, pct: Math.min(100, (activityVal / 3) * 100) },
      { label: "Study & Work", value: `${studyVal}h / day`, icon: MC_ICONS.book, pct: Math.min(100, (studyVal / 10) * 100) },
      { label: "Digital Usage", value: `${mediaVal}h / day`, icon: MC_ICONS.phone, pct: Math.min(100, (mediaVal / 8) * 100) },
      { label: "Reported Stress", value: stressVal, icon: MC_ICONS.gauge, pct: { Low: 25, Medium: 50, High: 75, "Very High": 100 }[stressVal] || 50 },
    ];

    overviewSection.innerHTML = `
      <div class="section-gap">
        <h2 style="font-size:1.2rem; margin-bottom:16px;">Key Behavioral Indicators</h2>
        <div class="wellness-grid">
          ${overviewItems
            .map(
              (item) => `
            <div class="stat-card">
              <div class="label"><span class="icon-dot" style="background:var(--moss-light); color:var(--moss-dark);">${item.icon}</span>${item.label}</div>
              <div class="value">${item.value}</div>
              <div class="stat-bar-track"><div class="stat-bar-fill" style="width:${item.pct}%;"></div></div>
            </div>`
            )
            .join("")}
        </div>
      </div>

      <div class="section-gap">
        <div style="display:flex; justify-content:space-between; align-items:center; margin-bottom:16px;">
          <h2 style="font-size:1.2rem; margin:0;">Personalized Wellness Recommendations</h2>
          <a href="result.html?id=${encodeURIComponent(latestRec.id || '')}" style="font-size:0.86rem; font-weight:600;">View Full Plan →</a>
        </div>
        <div class="suggestion-list">
          ${suggestions
            .slice(0, 4)
            .map(
              (s) => `
            <div class="suggestion-card">
              <div class="tag">
                <span class="badge ${s.badge === "Important" ? "badge-low" : "badge-higher"}" style="padding:3px 9px; font-size:0.75rem;">${s.badge}</span>
                <span>${s.tag}</span>
              </div>
              <p>${mcEscape(s.text)}</p>
            </div>`
            )
            .join("")}
        </div>
      </div>
    `;
  }
});


