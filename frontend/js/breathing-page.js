/**
 * breathing-page.js — Interactive box breathing timer and animation.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = typeof MindCareAuth !== "undefined" ? MindCareAuth.getCurrentUser() : null;
  const mount = document.getElementById("app-shell-mount");

  if (user) {
    if (typeof mcInitAppShell === "function") {
      try { mcInitAppShell(); } catch (e) {}
    }
    if (typeof mcInitChatbot === "function") {
      try { mcInitChatbot(user); } catch (e) {}
    }
  } else {
    // Graceful guest header
    if (mount && (!mount.children || mount.children.length === 0)) {
      mount.innerHTML = `
        <header class="top-nav" style="max-width:1180px; margin:0 auto; padding:16px 20px; display:flex; justify-content:space-between; align-items:center;">
          <a href="index.html" class="brand" style="display:flex; align-items:center; gap:10px; text-decoration:none; color:var(--ink); font-family:var(--font-display); font-size:1.2rem; font-weight:700;">
            <span class="mark" style="width:32px; height:32px; border-radius:50%; background:var(--moss); display:flex; align-items:center; justify-content:center;">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#fff" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M5 20c9 0 14-5 14-14 0 0-13-2-14 9-.4 3 0 5 0 5Z"/><path d="M5 20c0-6 3-9 8-11"/></svg>
            </span>
            <span>MindCare AI</span>
          </a>
          <div class="top-nav-actions" style="display:flex; align-items:center; gap:12px;">
            <button type="button" class="theme-toggle-btn" title="Toggle Theme" aria-label="Toggle Theme" style="width:36px; height:36px; border-radius:50%; border:1px solid var(--border); background:var(--surface); cursor:pointer; display:flex; align-items:center; justify-content:center; color:var(--ink);">
              ${typeof MindCareTheme !== "undefined" && MindCareTheme.get() === "dark" ? MindCareTheme.ICONS.sun : "🌓"}
            </button>
            <a href="wellness.html" class="btn btn-secondary btn-sm">Wellness Hub</a>
            <a href="login.html" class="btn btn-primary btn-sm">Log In</a>
          </div>
        </header>
      `;
      if (typeof MindCareTheme !== "undefined") {
        MindCareTheme.updateButtons();
      }
    }
    if (typeof mcInitChatbot === "function") {
      mcInitChatbot({ name: "Guest", email: "guest@mindcare.local" });
    }
  }

  // Check URL params for back link
  try {
    const params = new URLSearchParams(window.location.search);
    const from = params.get("from");
    const backNav = document.getElementById("breathing-back-nav");
    const backBtn = document.getElementById("breathing-back-btn") || document.getElementById("breathing-back-link");
    const backText = document.getElementById("breathing-back-text");
    if (from && backNav && backBtn && backText) {
      backNav.style.display = "block";
      if (from.toLowerCase() === "resources") {
        backBtn.href = "wellness.html";
        backText.textContent = "Back to Wellness Pillars";
      } else {
        backBtn.href = "wellness.html";
        backText.textContent = "Back to Wellness Pillars";
      }
    }
  } catch (e) {
    console.warn("Could not parse breathing navigation parameters:", e);
  }

  let totalDuration = 60; // seconds
  let remainingTime = 60;
  let timerInterval = null;
  let cycleInterval = null;
  let isRunning = false;

  const visual = document.getElementById("mc-breathing-visual");
  const instructionEl = document.getElementById("mc-instruction-text");
  const timerDisplay = document.getElementById("mc-timer-display");
  const secondsCount = document.getElementById("mc-seconds-count");
  const cycleCountEl = document.getElementById("mc-cycle-count");
  const startBtn = document.getElementById("mc-start-btn");
  const pauseBtn = document.getElementById("mc-pause-btn");
  const resetBtn = document.getElementById("mc-reset-btn");
  const durationBtns = document.querySelectorAll(".duration-btn");

  // Duration selection
  durationBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      durationBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      totalDuration = Number(btn.dataset.duration);
      remainingTime = totalDuration;
      updateTimerDisplay();
    });
  });

  function updateTimerDisplay() {
    const mins = String(Math.floor(remainingTime / 60)).padStart(2, "0");
    const secs = String(remainingTime % 60).padStart(2, "0");
    timerDisplay.textContent = `${mins}:${secs} remaining`;
  }

  // Stages: Inhale 4s -> Hold 4s -> Exhale 4s -> Hold 2s
  const STAGES = [
    { name: "Inhale slowly...", class: "inhale", seconds: 4 },
    { name: "Hold gently...", class: "hold", seconds: 4 },
    { name: "Exhale completely...", class: "exhale", seconds: 4 },
    { name: "Rest...", class: "rest", seconds: 2 },
  ];

  let currentStageIdx = 0;
  let stageSecondsLeft = STAGES[0].seconds;
  let cyclesCompleted = 0;

  function setStage(idx) {
    currentStageIdx = idx;
    const stage = STAGES[currentStageIdx];
    stageSecondsLeft = stage.seconds;
    instructionEl.textContent = stage.name;
    visual.className = `breathing-visual ${stage.class}`;
    secondsCount.textContent = stageSecondsLeft;
  }

  function startBreathing() {
    if (isRunning) return;
    isRunning = true;
    startBtn.style.display = "none";
    pauseBtn.style.display = "inline-flex";

    setStage(currentStageIdx);

    cycleInterval = setInterval(() => {
      stageSecondsLeft--;
      if (stageSecondsLeft > 0) {
        secondsCount.textContent = stageSecondsLeft;
      } else {
        currentStageIdx = (currentStageIdx + 1) % STAGES.length;
        if (currentStageIdx === 0) {
          cyclesCompleted++;
          cycleCountEl.textContent = `Completed ${cyclesCompleted} ${cyclesCompleted === 1 ? "cycle" : "cycles"}`;
        }
        setStage(currentStageIdx);
      }
    }, 1000);

    timerInterval = setInterval(() => {
      if (remainingTime > 0) {
        remainingTime--;
        updateTimerDisplay();
      } else {
        finishSession();
      }
    }, 1000);
  }

  function pauseBreathing() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(timerInterval);
    clearInterval(cycleInterval);
    startBtn.style.display = "inline-flex";
    startBtn.textContent = "Resume";
    pauseBtn.style.display = "none";
    instructionEl.textContent = "Paused";
  }

  function resetBreathing() {
    isRunning = false;
    clearInterval(timerInterval);
    clearInterval(cycleInterval);
    remainingTime = totalDuration;
    currentStageIdx = 0;
    cyclesCompleted = 0;
    updateTimerDisplay();
    instructionEl.textContent = "Ready to begin";
    cycleCountEl.textContent = "Session ready";
    secondsCount.textContent = "4";
    visual.className = "breathing-visual";
    startBtn.style.display = "inline-flex";
    startBtn.textContent = "Start";
    pauseBtn.style.display = "none";
  }

  function finishSession() {
    resetBreathing();
    instructionEl.textContent = "Well done! Take this calm with you.";
    cycleCountEl.textContent = `Completed ${cyclesCompleted} full breathing cycles.`;
  }

  startBtn.addEventListener("click", startBreathing);
  pauseBtn.addEventListener("click", pauseBreathing);
  resetBtn.addEventListener("click", resetBreathing);

  updateTimerDisplay();
});
