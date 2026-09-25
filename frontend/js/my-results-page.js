/**
 * my-results-page.js — renders the assessment history table (my-results.html).
 * Fetches assessment history directly from the MySQL database with local fallback.
 * Provides direct PDF report downloads and detailed result views.
 */

document.addEventListener("DOMContentLoaded", async () => {
  const user = mcInitAppShell();
  if (!user) return;
  if (typeof mcInitChatbot === "function") {
    try { mcInitChatbot(user); } catch (e) {}
  }

  const wrap = document.getElementById("mc-history-wrap");
  if (!wrap) return;

  // Render initial loading state
  wrap.innerHTML = `
    <div style="text-align:center; padding:48px 16px; color:var(--ink-soft);">
      <span class="spinner-sm" style="display:inline-block; margin-bottom:12px;"></span>
      <p>Loading your assessment history...</p>
    </div>
  `;

  let history = [];

  // 1. Fetch from database if user has an active session token
  if (window.MindCareAPI && MindCareAPI.getToken()) {
    try {
      history = await MindCareAPI.getAssessments();
      if (history && history.length > 0 && MindCareStore.syncAssessments) {
        MindCareStore.syncAssessments(user.email, history);
      }
    } catch (err) {
      console.warn("[MindCare] Could not load assessment history from API:", err);
    }
  }

  // 2. Fallback to local store
  if (!history || history.length === 0) {
    if (window.MindCareResults && typeof MindCareResults.getHistory === "function") {
      history = MindCareResults.getHistory(user.email);
    } else if (window.MindCareStore && typeof MindCareStore.getAssessments === "function") {
      history = MindCareStore.getAssessments(user.email);
    }
  }

  if (!history || history.length === 0) {
    wrap.innerHTML = `
      <div class="empty-state">
        <div class="icon-wrap">${typeof MC_ICONS !== "undefined" ? (MC_ICONS.history || "📜") : "📜"}</div>
        <h3>No assessments yet</h3>
        <p>Your past assessments and ML scores will appear here once you complete one.</p>
        <a href="assessment.html" class="btn btn-primary" style="margin-top:16px;">Take Assessment</a>
      </div>`;
    return;
  }

  const escapeHtml = (str) => {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  };

  const formatDate = (d) => {
    if (!d) return "Recently";
    try {
      return new Date(d).toLocaleDateString("en-US", {
        year: "numeric",
        month: "short",
        day: "numeric",
        hour: "2-digit",
        minute: "2-digit"
      });
    } catch {
      return String(d);
    }
  };

  wrap.innerHTML = `
    <div class="card table-responsive" style="padding:0; overflow-x:auto; -webkit-overflow-scrolling:touch; border-radius:var(--radius-lg); box-shadow:var(--shadow-sm); width:100%;">
      <table class="results-table" style="width:100%; min-width:540px; border-collapse:collapse;">
        <thead>
          <tr style="background:var(--surface-muted); border-bottom:1px solid var(--border);">
            <th style="padding:14px 18px; text-align:left; font-size:0.85rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em;">Date & Time</th>
            <th style="padding:14px 18px; text-align:left; font-size:0.85rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em;">Score</th>
            <th style="padding:14px 18px; text-align:left; font-size:0.85rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em;">ML Prediction</th>
            <th style="padding:14px 18px; text-align:right; font-size:0.85rem; font-weight:700; color:var(--ink-soft); text-transform:uppercase; letter-spacing:0.04em;">Actions</th>
          </tr>
        </thead>
        <tbody>
          ${history
            .map((r) => {
              const numScore = Number(r.score !== undefined ? r.score : 7.0);
              const score100 = r.score_100 !== undefined && !isNaN(Number(r.score_100))
                ? Number(r.score_100)
                : Math.round(numScore * 10);
              const prediction = r.prediction || (numScore >= 7.0 ? "Higher range" : (numScore >= 4.0 ? "Moderate range" : "Lower range"));
              const catKey = numScore < 4.0 ? "low" : (numScore < 7.0 ? "moderate" : "higher");
              const badgeClass = catKey === "higher" ? "badge-higher" : (catKey === "moderate" ? "badge-moderate" : "badge-low");

              return `
              <tr data-id="${r.id}" style="border-bottom:1px solid var(--border); transition:background 0.15s ease; cursor:pointer;">
                <td style="padding:16px 18px; font-size:0.92rem; color:var(--ink);">
                  <strong>${formatDate(r.date || r.created_at)}</strong>
                </td>
                <td style="padding:16px 18px;">
                  <span style="font-size:1.05rem; font-weight:700; color:var(--moss-dark);">${score100} / 100</span>
                  <span style="font-size:0.82rem; color:var(--ink-faint); margin-left:6px;">(${numScore.toFixed(2)}/10)</span>
                </td>
                <td style="padding:16px 18px;">
                  <span class="badge ${badgeClass}">${escapeHtml(prediction)}</span>
                </td>
                <td style="padding:16px 18px; text-align:right; white-space:nowrap;">
                  <a href="result.html?id=${encodeURIComponent(r.id)}" class="btn btn-ghost btn-sm" title="View Detailed Report" style="margin-right:6px;">
                    View Details →
                  </a>
                  <button type="button" class="btn btn-secondary btn-sm mc-row-dl-btn" data-id="${r.id}" title="Download Official PDF Report">
                    📄 PDF
                  </button>
                </td>
              </tr>`;
            })
            .join("")}
        </tbody>
      </table>
    </div>`;

  // Row click navigation
  wrap.querySelectorAll("tbody tr").forEach((row) => {
    row.addEventListener("click", (e) => {
      if (e.target.closest("a, button")) return;
      window.location.href = `result.html?id=${encodeURIComponent(row.dataset.id)}`;
    });
  });

  // Direct PDF Download Handler
  wrap.querySelectorAll(".mc-row-dl-btn").forEach((btn) => {
    btn.addEventListener("click", async (e) => {
      e.stopPropagation();
      const assessmentId = btn.dataset.id;
      const originalText = btn.innerHTML;
      btn.disabled = true;
      btn.innerHTML = `<span class="spinner-sm"></span>`;

      try {
        let blob = null;
        if (window.MindCareAPI && MindCareAPI.getToken() && !String(assessmentId).startsWith("a_")) {
          blob = await MindCareAPI.downloadAssessmentReport(assessmentId);
        } else {
          // Fallback via GET assessment + PDF endpoint
          const record = history.find((h) => String(h.id) === String(assessmentId));
          if (record) {
            const numScore = Number(record.score || 7.0);
            const reportPayload = {
              user_name: user.name || "Student",
              user_email: user.email,
              assessment_id: record.id,
              assessment_date: record.date || new Date().toISOString(),
              score: numScore,
              score_100: record.score_100 || Math.round(numScore * 10),
              prediction: record.prediction || "Moderate range",
              category: record.category || "Moderate",
              form_data: record.formData || {},
              recommendations: (record.recommendations || []).map((r) => ({
                tag: r.title || r.tag || "Wellness Goal",
                text: r.desc || r.text || ""
              })),
            };
            blob = await MindCareAPI.downloadReportPDF(reportPayload);
          }
        }

        if (blob) {
          const blobUrl = window.URL.createObjectURL(blob);
          const a = document.createElement("a");
          a.href = blobUrl;
          a.download = `MindCare_Mental_Wellness_Report_${assessmentId}.pdf`;
          document.body.appendChild(a);
          a.click();
          a.remove();
          setTimeout(() => window.URL.revokeObjectURL(blobUrl), 1500);

          btn.innerHTML = `✓ Saved`;
          setTimeout(() => {
            btn.disabled = false;
            btn.innerHTML = originalText;
          }, 2500);
        } else {
          throw new Error("Could not create PDF stream");
        }
      } catch (err) {
        console.error("Failed to download PDF report:", err);
        btn.disabled = false;
        btn.innerHTML = `⚠️ Failed`;
        setTimeout(() => {
          btn.innerHTML = originalText;
        }, 3000);
      }
    });
  });
});
