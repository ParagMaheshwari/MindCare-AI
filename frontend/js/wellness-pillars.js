/**
 * wellness-pillars.js — Fully Functional Interactive Controls for
 * Foundational Student Wellness Pillars:
 * 1. Better Sleep: Wind-Down Checklist, Target Bedtime, Time-to-Wind-down calculation, Reset Tonight
 * 2. Digital Wellbeing: Screen Time Check-in, 7-Day History & Average, Screen-Free Break Timer
 * 3. Stress Management: Direct launch to breathing.html?from=resources with working box-breathing
 * 4. Study-Life Balance: 25/5 Pomodoro Focus & Break timer with 4-session cycle
 * 5. Physical Activity: 2-Minute Guided Movement break with 4 automatic 30s transitions
 * 6. Social Connection: Connection check-in logger, real 7-day weekly counter, and history manager
 */

(function () {
  'use strict';

  // ---------------------------------------------------------------------------
  // Utility: Local Date & Formatting Helpers
  // ---------------------------------------------------------------------------
  function getTodayKey(d = new Date()) {
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  function formatTime12(timeStr) {
    if (!timeStr) return '';
    const parts = timeStr.split(':');
    let hours = parseInt(parts[0], 10);
    const mins = parts[1] || '00';
    if (isNaN(hours)) return timeStr;
    const ampm = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12;
    if (hours === 0) hours = 12;
    return `${hours}:${mins} ${ampm}`;
  }

  function formatMMSS(totalSeconds) {
    const s = Math.max(0, Math.floor(totalSeconds));
    const mins = String(Math.floor(s / 60)).padStart(2, '0');
    const secs = String(s % 60).padStart(2, '0');
    return `${mins}:${secs}`;
  }

  function safeGetJSON(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      if (!raw) return fallback;
      return JSON.parse(raw);
    } catch (e) {
      console.warn(`[Wellness] Error reading localStorage key "${key}":`, e);
      return fallback;
    }
  }

  function safeSetJSON(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.warn(`[Wellness] Error writing localStorage key "${key}":`, e);
    }
  }

  // Common card expand/collapse binder
  function bindCardDrawer(cardId, drawerId) {
    const card = document.getElementById(cardId);
    const drawer = document.getElementById(drawerId);
    if (!card) return;

    function toggleCard(e) {
      if (e && e.target && e.target.closest('#' + drawerId + ', input, label, button, a, select, textarea')) {
        return;
      }
      const isExpanded = card.classList.contains('expanded');
      const next = !isExpanded;
      card.classList.toggle('expanded', next);
      card.setAttribute('aria-expanded', String(next));
    }

    card.addEventListener('click', toggleCard);
    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        if (!e.target.closest('#' + drawerId + ', input, label, button, a, select, textarea')) {
          e.preventDefault();
          toggleCard(e);
        }
      }
    });

    if (drawer) {
      drawer.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }
  }


  /* ==========================================================================
     CARD 1: BETTER SLEEP — WIND-DOWN CHECKLIST & BEDTIME
     ========================================================================== */
  const SLEEP_STORAGE_KEY = 'mindcare_sleep';
  const SLEEP_ITEMS_COUNT = 4;

  function initSleepCard() {
    const card = document.getElementById('pillar-sleep');
    if (!card) return;
    bindCardDrawer('pillar-sleep', 'sleep-drawer');

    const progressPill = document.getElementById('sleep-progress-pill');
    const checkboxes = card.querySelectorAll('#sleep-checklist input[type="checkbox"]');
    const statusText = document.getElementById('sleep-checklist-status');
    const resetBtn = document.getElementById('sleep-reset-btn');
    const dateLabel = document.getElementById('sleep-checklist-date');
    const bedtimeInput = document.getElementById('sleep-bedtime-input');
    const bedtimeDisplay = document.getElementById('sleep-bedtime-display');
    const winddownStatus = document.getElementById('sleep-winddown-status');

    const today = getTodayKey();
    if (dateLabel) {
      dateLabel.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Load state with automatic fresh day reset
    function loadSleepState() {
      const data = safeGetJSON(SLEEP_STORAGE_KEY, null);
      if (data && typeof data === 'object') {
        const isToday = data.date === today;
        return {
          date: today,
          items: (isToday && Array.isArray(data.items)) ? data.items : [false, false, false, false],
          targetBedtime: data.targetBedtime || '22:30'
        };
      }
      return {
        date: today,
        items: [false, false, false, false],
        targetBedtime: '22:30'
      };
    }

    let sleepState = loadSleepState();
    safeSetJSON(SLEEP_STORAGE_KEY, sleepState);

    function calculateWinddown() {
      if (!bedtimeInput || !bedtimeDisplay || !winddownStatus) return;
      const targetTimeStr = sleepState.targetBedtime || '22:30';
      bedtimeInput.value = targetTimeStr;
      bedtimeDisplay.textContent = `Target bedtime: ${formatTime12(targetTimeStr)}`;

      const [bHour, bMin] = targetTimeStr.split(':').map(Number);
      const now = new Date();
      const bedtimeDate = new Date();
      bedtimeDate.setHours(bHour, bMin, 0, 0);

      // Wind-down starts 30 minutes before bedtime
      const winddownDate = new Date(bedtimeDate.getTime() - 30 * 60 * 1000);

      const diffMs = winddownDate.getTime() - now.getTime();
      const diffMins = Math.round(diffMs / 60000);

      if (diffMins > 0) {
        if (diffMins < 60) {
          winddownStatus.textContent = `Wind-down starts in ${diffMins} minute${diffMins === 1 ? '' : 's'}`;
        } else {
          const h = Math.floor(diffMins / 60);
          const m = diffMins % 60;
          winddownStatus.textContent = `Wind-down starts in ${h}h ${m}m`;
        }
      } else if (now.getTime() < bedtimeDate.getTime()) {
        winddownStatus.textContent = '🌙 Wind-down time! Dim lights and power off screens.';
      } else {
        winddownStatus.textContent = '✨ Past target bedtime — rest up for tomorrow.';
      }
    }

    function updateSleepUI() {
      let completedCount = 0;
      checkboxes.forEach((cb, idx) => {
        const isChecked = !!sleepState.items[idx];
        cb.checked = isChecked;
        const parentLabel = cb.closest('.checklist-item');
        if (parentLabel) parentLabel.classList.toggle('checked', isChecked);
        if (isChecked) completedCount++;
      });

      if (progressPill) {
        if (completedCount === SLEEP_ITEMS_COUNT) {
          progressPill.textContent = '4/4 done tonight ✓';
          progressPill.classList.add('all-done');
        } else {
          progressPill.textContent = `${completedCount}/${SLEEP_ITEMS_COUNT} done tonight`;
          progressPill.classList.remove('all-done');
        }
      }

      if (statusText) {
        if (completedCount === SLEEP_ITEMS_COUNT) {
          statusText.textContent = '🎉 All 4 habits completed! Rest well.';
        } else if (completedCount > 0) {
          statusText.textContent = `${completedCount} of ${SLEEP_ITEMS_COUNT} completed tonight`;
        } else {
          statusText.textContent = 'Select items as you complete them';
        }
      }

      calculateWinddown();
    }

    // Checkbox toggles
    checkboxes.forEach((cb) => {
      cb.addEventListener('change', (e) => {
        e.stopPropagation();
        const idx = parseInt(cb.dataset.index, 10);
        if (!isNaN(idx) && idx >= 0 && idx < SLEEP_ITEMS_COUNT) {
          sleepState.items[idx] = cb.checked;
          safeSetJSON(SLEEP_STORAGE_KEY, sleepState);
          updateSleepUI();
        }
      });
    });

    // Bedtime change
    if (bedtimeInput) {
      bedtimeInput.addEventListener('change', (e) => {
        e.stopPropagation();
        if (bedtimeInput.value) {
          sleepState.targetBedtime = bedtimeInput.value;
          safeSetJSON(SLEEP_STORAGE_KEY, sleepState);
          calculateWinddown();
        }
      });
    }

    // Reset button
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        sleepState.items = [false, false, false, false];
        safeSetJSON(SLEEP_STORAGE_KEY, sleepState);
        updateSleepUI();
      });
    }

    // Interval to refresh live wind-down calculation every minute
    setInterval(calculateWinddown, 60000);
    updateSleepUI();
  }


  /* ==========================================================================
     CARD 2: DIGITAL WELLBEING — SCREEN TIME & BREAK TIMER
     ========================================================================== */
  const DIGITAL_STORAGE_KEY = 'mindcare_screen_time';

  function initDigitalCard() {
    const card = document.getElementById('pillar-digital');
    if (!card) return;
    bindCardDrawer('pillar-digital', 'digital-drawer');

    const progressPill = document.getElementById('digital-progress-pill');
    const hoursInput = document.getElementById('digital-hours-input');
    const hoursSlider = document.getElementById('digital-hours-slider');
    const goalInput = document.getElementById('digital-goal-input');
    const progressBar = document.getElementById('digital-progress-bar');
    const previewHours = document.getElementById('digital-preview-hours');
    const previewGoal = document.getElementById('digital-preview-goal');
    const progressPct = document.getElementById('digital-progress-pct');
    const saveBtn = document.getElementById('digital-save-btn');
    const historyBarsContainer = document.getElementById('digital-history-bars');
    const averageText = document.getElementById('digital-average-text');
    const trendMessage = document.getElementById('digital-trend-message');

    // Timer controls
    const breakPillBtns = card.querySelectorAll('.btn-pill-choice[data-duration]');
    const breakTimerDisplay = document.getElementById('digital-timer-display');
    const breakStartBtn = document.getElementById('digital-break-start');
    const breakPauseBtn = document.getElementById('digital-break-pause');
    const breakResumeBtn = document.getElementById('digital-break-resume');
    const breakCancelBtn = document.getElementById('digital-break-cancel');
    const breakCompleteMsg = document.getElementById('digital-break-complete');

    const today = getTodayKey();

    function loadDigitalState() {
      const data = safeGetJSON(DIGITAL_STORAGE_KEY, null);
      if (data && typeof data === 'object') {
        return {
          dailyGoal: typeof data.dailyGoal === 'number' ? data.dailyGoal : 5.0,
          today: (data.today && data.today.date === today) ? data.today : { date: today, hours: 4.5 },
          history: Array.isArray(data.history) ? data.history : []
        };
      }
      return {
        dailyGoal: 5.0,
        today: { date: today, hours: 4.5 },
        history: []
      };
    }

    let digitalState = loadDigitalState();

    function updateDigitalPreview() {
      const curHours = parseFloat(hoursInput.value) || 0;
      const curGoal = parseFloat(goalInput.value) || 5.0;

      hoursSlider.value = curHours;
      previewHours.textContent = `${curHours.toFixed(1)} hrs`;
      previewGoal.textContent = `${curGoal.toFixed(1)} hrs`;

      const pct = Math.min(100, Math.round((curHours / Math.max(0.1, curGoal)) * 100));
      progressBar.style.width = `${pct}%`;
      progressPct.textContent = `${pct}%`;

      if (curHours > curGoal) {
        progressBar.style.background = '#ef4444'; // over limit
        progressPct.style.color = '#ef4444';
      } else {
        progressBar.style.background = 'var(--moss)';
        progressPct.style.color = 'var(--moss)';
      }
    }

    function renderHistory() {
      const hist = digitalState.history || [];
      historyBarsContainer.innerHTML = '';

      if (hist.length === 0) {
        historyBarsContainer.innerHTML = `<div style="display:flex; align-items:center; justify-content:center; width:100%; height:100%; font-size:0.75rem; color:var(--ink-faint);">No screen time entries logged yet.</div>`;
        averageText.textContent = 'Average: None logged yet';
        trendMessage.textContent = 'Keep logging your screen time to see your weekly trend.';
        progressPill.textContent = 'Log today';
        return;
      }

      // Calculate true average from actual saved values
      const sum = hist.reduce((acc, h) => acc + (parseFloat(h.hours) || 0), 0);
      const avg = sum / hist.length;
      averageText.textContent = `7-Day Average: ${avg.toFixed(1)} hrs/day (${hist.length} day${hist.length === 1 ? '' : 's'} recorded)`;

      // Render actual saved bars
      const maxVal = Math.max(10, ...hist.map(h => parseFloat(h.hours) || 0));
      hist.slice(-7).forEach((entry) => {
        const val = parseFloat(entry.hours) || 0;
        const col = document.createElement('div');
        col.className = 'history-bar-col';

        // Day of week label
        let dayName = 'Day';
        try {
          const parts = entry.date.split('-');
          const d = new Date(parts[0], parts[1] - 1, parts[2]);
          dayName = d.toLocaleDateString('en-US', { weekday: 'short' });
        } catch (e) {}

        const heightPct = Math.max(6, Math.round((val / maxVal) * 100));
        col.innerHTML = `
          <div class="history-bar-pillar" style="height:${heightPct}%;" title="${entry.date}: ${val.toFixed(1)} hrs"></div>
          <span class="history-bar-day">${dayName}</span>
        `;
        historyBarsContainer.appendChild(col);
      });

      // Update badge
      const todayEntry = hist.find(h => h.date === today);
      if (todayEntry) {
        progressPill.textContent = `${todayEntry.hours}h logged today`;
      } else {
        progressPill.textContent = `${hist.length} days logged`;
      }

      // Dynamic Trend message
      const latestVal = todayEntry ? todayEntry.hours : (parseFloat(hoursInput.value) || 0);
      if (hist.length >= 2) {
        if (latestVal > avg + 0.2) {
          trendMessage.textContent = `Your screen time is above your recent average (${avg.toFixed(1)} hrs).`;
          trendMessage.style.color = '#f59e0b';
        } else if (latestVal < avg - 0.2) {
          trendMessage.textContent = `Your screen time is below your recent average (${avg.toFixed(1)} hrs). Great job!`;
          trendMessage.style.color = 'var(--moss)';
        } else {
          trendMessage.textContent = `Your screen time is on par with your recent average (${avg.toFixed(1)} hrs).`;
          trendMessage.style.color = 'var(--ink-soft)';
        }
      } else {
        trendMessage.textContent = 'Keep logging your screen time to see your weekly trend.';
        trendMessage.style.color = 'var(--ink-soft)';
      }
    }

    // Input & Slider sync
    hoursInput.value = digitalState.today.hours;
    hoursSlider.value = digitalState.today.hours;
    goalInput.value = digitalState.dailyGoal;

    hoursInput.addEventListener('input', (e) => {
      e.stopPropagation();
      let v = parseFloat(hoursInput.value);
      if (isNaN(v)) v = 0;
      if (v < 0) v = 0;
      if (v > 24) v = 24;
      hoursSlider.value = v;
      updateDigitalPreview();
    });

    hoursSlider.addEventListener('input', (e) => {
      e.stopPropagation();
      hoursInput.value = parseFloat(hoursSlider.value).toFixed(1);
      updateDigitalPreview();
    });

    goalInput.addEventListener('input', (e) => {
      e.stopPropagation();
      let g = parseFloat(goalInput.value);
      if (isNaN(g) || g < 1) g = 1;
      if (g > 24) g = 24;
      digitalState.dailyGoal = g;
      updateDigitalPreview();
    });

    // Save button
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      let hVal = parseFloat(hoursInput.value);
      if (isNaN(hVal) || hVal < 0 || hVal > 24) {
        alert('Please enter a valid screen time value between 0 and 24 hours.');
        return;
      }
      hVal = Math.round(hVal * 10) / 10;
      const gVal = parseFloat(goalInput.value) || 5.0;

      digitalState.dailyGoal = gVal;
      digitalState.today = { date: today, hours: hVal };

      // Upsert into history
      if (!Array.isArray(digitalState.history)) digitalState.history = [];
      const idx = digitalState.history.findIndex(h => h.date === today);
      if (idx >= 0) {
        digitalState.history[idx].hours = hVal;
      } else {
        digitalState.history.push({ date: today, hours: hVal });
      }

      // Sort and keep last 7 days
      digitalState.history.sort((a, b) => a.date.localeCompare(b.date));
      if (digitalState.history.length > 7) {
        digitalState.history = digitalState.history.slice(-7);
      }

      safeSetJSON(DIGITAL_STORAGE_KEY, digitalState);
      renderHistory();
      saveBtn.textContent = 'Saved Today ✓';
      setTimeout(() => { saveBtn.textContent = "Save Today's Screen Time"; }, 1500);
    });

    // -------------------------------------------------------------------------
    // Screen-Free Break Timer
    // -------------------------------------------------------------------------
    let breakDurationMinutes = 15;
    let breakRemainingSeconds = breakDurationMinutes * 60;
    let breakTimerInterval = null;
    let breakIsRunning = false;

    breakPillBtns.forEach((btn) => {
      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        if (breakIsRunning) return;
        breakPillBtns.forEach(b => b.classList.remove('active'));
        btn.classList.add('active');
        breakDurationMinutes = parseInt(btn.dataset.duration, 10) || 15;
        breakRemainingSeconds = breakDurationMinutes * 60;
        breakTimerDisplay.textContent = `Screen-free break: ${formatMMSS(breakRemainingSeconds)} remaining`;
        breakCompleteMsg.style.display = 'none';
      });
    });

    function tickBreakTimer() {
      if (breakRemainingSeconds > 0) {
        breakRemainingSeconds--;
        breakTimerDisplay.textContent = `Screen-free break: ${formatMMSS(breakRemainingSeconds)} remaining`;
      } else {
        clearInterval(breakTimerInterval);
        breakTimerInterval = null;
        breakIsRunning = false;
        breakTimerDisplay.textContent = 'Screen-free break: 00:00 remaining';
        breakCompleteMsg.style.display = 'block';
        breakStartBtn.style.display = 'inline-flex';
        breakStartBtn.textContent = 'Start';
        breakPauseBtn.style.display = 'none';
        breakResumeBtn.style.display = 'none';
        breakCancelBtn.style.display = 'none';
      }
    }

    breakStartBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (breakTimerInterval) clearInterval(breakTimerInterval);
      breakRemainingSeconds = breakDurationMinutes * 60;
      breakIsRunning = true;
      breakCompleteMsg.style.display = 'none';
      breakStartBtn.style.display = 'none';
      breakPauseBtn.style.display = 'inline-flex';
      breakResumeBtn.style.display = 'none';
      breakCancelBtn.style.display = 'inline-flex';
      breakTimerInterval = setInterval(tickBreakTimer, 1000);
    });

    breakPauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      breakIsRunning = false;
      if (breakTimerInterval) clearInterval(breakTimerInterval);
      breakTimerInterval = null;
      breakPauseBtn.style.display = 'none';
      breakResumeBtn.style.display = 'inline-flex';
    });

    breakResumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (breakTimerInterval) clearInterval(breakTimerInterval);
      breakIsRunning = true;
      breakResumeBtn.style.display = 'none';
      breakPauseBtn.style.display = 'inline-flex';
      breakTimerInterval = setInterval(tickBreakTimer, 1000);
    });

    breakCancelBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      breakIsRunning = false;
      if (breakTimerInterval) clearInterval(breakTimerInterval);
      breakTimerInterval = null;
      breakRemainingSeconds = breakDurationMinutes * 60;
      breakTimerDisplay.textContent = `Screen-free break: ${formatMMSS(breakRemainingSeconds)} remaining`;
      breakStartBtn.style.display = 'inline-flex';
      breakStartBtn.textContent = 'Start';
      breakPauseBtn.style.display = 'none';
      breakResumeBtn.style.display = 'none';
      breakCancelBtn.style.display = 'none';
      breakCompleteMsg.style.display = 'none';
    });

    updateDigitalPreview();
    renderHistory();
  }


  /* ==========================================================================
     CARD 3: STRESS MANAGEMENT — GUIDED BREATHING LAUNCHER
     ========================================================================== */
  function initStressCard() {
    const card = document.getElementById('pillar-stress');
    if (!card) return;

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        e.preventDefault();
        window.location.href = 'breathing.html?from=resources';
      }
    });
  }


  /* ==========================================================================
     CARD 4: STUDY-LIFE BALANCE — POMODORO FOCUS TIMER
     ========================================================================== */
  function initStudyCard() {
    const card = document.getElementById('pillar-study');
    if (!card) return;
    bindCardDrawer('pillar-study', 'study-drawer');

    const progressPill = document.getElementById('study-progress-pill');
    const phaseBadge = document.getElementById('study-phase-badge');
    const timerDisplay = document.getElementById('study-timer-display');
    const sessionCount = document.getElementById('study-session-count');
    const startBtn = document.getElementById('study-start-btn');
    const pauseBtn = document.getElementById('study-pause-btn');
    const resumeBtn = document.getElementById('study-resume-btn');
    const resetBtn = document.getElementById('study-reset-btn');
    const completeMsg = document.getElementById('study-complete-msg');

    const FOCUS_SECONDS = 25 * 60;
    const BREAK_SECONDS = 5 * 60;
    const MAX_SESSIONS = 4;

    let currentPhase = 'focus'; // 'focus' | 'break'
    let currentSession = 1;
    let remainingSeconds = FOCUS_SECONDS;
    let timerInterval = null;
    let isRunning = false;

    function updatePomodoroUI() {
      timerDisplay.textContent = formatMMSS(remainingSeconds);
      sessionCount.textContent = `Session ${currentSession} of ${MAX_SESSIONS}`;
      progressPill.textContent = `Session ${currentSession} of ${MAX_SESSIONS}`;

      if (currentPhase === 'focus') {
        phaseBadge.textContent = 'FOCUS';
        phaseBadge.className = 'pillar-phase-badge focus';
      } else {
        phaseBadge.textContent = 'BREAK';
        phaseBadge.className = 'pillar-phase-badge break';
      }
    }

    function tickPomodoro() {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        timerDisplay.textContent = formatMMSS(remainingSeconds);
      } else {
        // Transition phases
        if (currentPhase === 'focus') {
          // Switch to break
          currentPhase = 'break';
          remainingSeconds = BREAK_SECONDS;
          updatePomodoroUI();
        } else {
          // Finished break, advance session or complete
          if (currentSession < MAX_SESSIONS) {
            currentSession++;
            currentPhase = 'focus';
            remainingSeconds = FOCUS_SECONDS;
            updatePomodoroUI();
          } else {
            // All 4 completed!
            clearInterval(timerInterval);
            timerInterval = null;
            isRunning = false;
            completeMsg.style.display = 'block';
            startBtn.style.display = 'inline-flex';
            startBtn.textContent = 'Start New Cycle';
            pauseBtn.style.display = 'none';
            resumeBtn.style.display = 'none';
            progressPill.textContent = '4 sessions done ✓';
          }
        }
      }
    }

    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (timerInterval) clearInterval(timerInterval);
      if (currentSession > MAX_SESSIONS || completeMsg.style.display === 'block') {
        currentSession = 1;
        currentPhase = 'focus';
        remainingSeconds = FOCUS_SECONDS;
      }
      completeMsg.style.display = 'none';
      isRunning = true;
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-flex';
      resumeBtn.style.display = 'none';
      timerInterval = setInterval(tickPomodoro, 1000);
      updatePomodoroUI();
    });

    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isRunning = false;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-flex';
    });

    resumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (timerInterval) clearInterval(timerInterval);
      isRunning = true;
      resumeBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-flex';
      timerInterval = setInterval(tickPomodoro, 1000);
    });

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isRunning = false;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      remainingSeconds = currentPhase === 'focus' ? FOCUS_SECONDS : BREAK_SECONDS;
      startBtn.style.display = 'inline-flex';
      startBtn.textContent = 'Start';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      completeMsg.style.display = 'none';
      updatePomodoroUI();
    });

    updatePomodoroUI();
  }


  /* ==========================================================================
     CARD 5: PHYSICAL ACTIVITY — 2-MINUTE GUIDED MOVEMENT TIMER
     ========================================================================== */
  function initActivityCard() {
    const card = document.getElementById('pillar-activity');
    if (!card) return;
    bindCardDrawer('pillar-activity', 'activity-drawer');

    const progressPill = document.getElementById('activity-progress-pill');
    const stepLabel = document.getElementById('activity-step-label');
    const activityName = document.getElementById('activity-name');
    const activityDesc = document.getElementById('activity-desc');
    const timerDisplay = document.getElementById('activity-timer-display');
    const startBtn = document.getElementById('activity-start-btn');
    const pauseBtn = document.getElementById('activity-pause-btn');
    const resumeBtn = document.getElementById('activity-resume-btn');
    const resetBtn = document.getElementById('activity-reset-btn');
    const completeMsg = document.getElementById('activity-complete-msg');

    const EXERCISES = [
      {
        title: 'Neck Rolls',
        seconds: 30,
        desc: 'Roll your head gently in slow, wide circles to release cervical spine tension.'
      },
      {
        title: 'Shoulder Shrugs',
        seconds: 30,
        desc: 'Lift your shoulders up to your ears, hold 2 seconds, and roll them backwards and down.'
      },
      {
        title: 'Standing Stretch',
        seconds: 30,
        desc: 'Stand tall, interlace your fingers overhead, and stretch upwards and gently to each side.'
      },
      {
        title: 'Short Walk',
        seconds: 30,
        desc: 'Step away from your desk, march in place or walk around your room to restore leg circulation.'
      }
    ];

    let currentExerciseIdx = 0;
    let remainingSeconds = EXERCISES[0].seconds;
    let timerInterval = null;
    let isRunning = false;

    function updateActivityUI() {
      const ex = EXERCISES[currentExerciseIdx];
      stepLabel.textContent = `Exercise ${currentExerciseIdx + 1} of ${EXERCISES.length}`;
      activityName.textContent = ex.title;
      activityDesc.textContent = ex.desc;
      timerDisplay.textContent = formatMMSS(remainingSeconds);
      progressPill.textContent = `Exercise ${currentExerciseIdx + 1} of ${EXERCISES.length}`;
    }

    function tickActivity() {
      if (remainingSeconds > 0) {
        remainingSeconds--;
        timerDisplay.textContent = formatMMSS(remainingSeconds);
      } else {
        // Next exercise
        if (currentExerciseIdx < EXERCISES.length - 1) {
          currentExerciseIdx++;
          remainingSeconds = EXERCISES[currentExerciseIdx].seconds;
          updateActivityUI();
        } else {
          // Completed all 4!
          clearInterval(timerInterval);
          timerInterval = null;
          isRunning = false;
          completeMsg.style.display = 'block';
          startBtn.style.display = 'inline-flex';
          startBtn.textContent = 'Restart';
          pauseBtn.style.display = 'none';
          resumeBtn.style.display = 'none';
          progressPill.textContent = 'Movement complete ✓';
        }
      }
    }

    startBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (timerInterval) clearInterval(timerInterval);
      if (completeMsg.style.display === 'block') {
        currentExerciseIdx = 0;
        remainingSeconds = EXERCISES[0].seconds;
      }
      completeMsg.style.display = 'none';
      isRunning = true;
      startBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-flex';
      resumeBtn.style.display = 'none';
      timerInterval = setInterval(tickActivity, 1000);
      updateActivityUI();
    });

    pauseBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isRunning = false;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'inline-flex';
    });

    resumeBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      if (timerInterval) clearInterval(timerInterval);
      isRunning = true;
      resumeBtn.style.display = 'none';
      pauseBtn.style.display = 'inline-flex';
      timerInterval = setInterval(tickActivity, 1000);
    });

    resetBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      isRunning = false;
      if (timerInterval) clearInterval(timerInterval);
      timerInterval = null;
      currentExerciseIdx = 0;
      remainingSeconds = EXERCISES[0].seconds;
      startBtn.style.display = 'inline-flex';
      startBtn.textContent = 'Start';
      pauseBtn.style.display = 'none';
      resumeBtn.style.display = 'none';
      completeMsg.style.display = 'none';
      updateActivityUI();
    });

    updateActivityUI();
  }


  /* ==========================================================================
     CARD 6: SOCIAL CONNECTION — CONNECTION CHECK-IN & HISTORY
     ========================================================================== */
  const SOCIAL_STORAGE_KEY = 'mindcare_social';

  function initSocialCard() {
    const card = document.getElementById('pillar-social');
    if (!card) return;
    bindCardDrawer('pillar-social', 'social-drawer');

    const weekPill = document.getElementById('social-week-pill');
    const personGroup = document.getElementById('social-person-group');
    const methodGroup = document.getElementById('social-method-group');
    const feelingGroup = document.getElementById('social-feeling-group');
    const saveBtn = document.getElementById('social-save-btn');
    const feedbackToast = document.getElementById('social-feedback');
    const weeklySummary = document.getElementById('social-weekly-summary');
    const toggleHistoryBtn = document.getElementById('social-toggle-history-btn');
    const historyList = document.getElementById('social-history-list');

    let selectedPerson = 'Friend';
    let selectedMethod = 'Call';
    let selectedFeeling = 'Connected';

    function bindPillGroup(groupEl, onSelect) {
      if (!groupEl) return;
      const buttons = groupEl.querySelectorAll('.pill-option');
      buttons.forEach(btn => {
        btn.addEventListener('click', (e) => {
          e.stopPropagation();
          buttons.forEach(b => b.classList.remove('active'));
          btn.classList.add('active');
          onSelect(btn.dataset.val);
        });
      });
    }

    bindPillGroup(personGroup, val => { selectedPerson = val; });
    bindPillGroup(methodGroup, val => { selectedMethod = val; });
    bindPillGroup(feelingGroup, val => { selectedFeeling = val; });

    function loadSocialCheckins() {
      const data = safeGetJSON(SOCIAL_STORAGE_KEY, []);
      return Array.isArray(data) ? data : [];
    }

    function saveSocialCheckins(list) {
      safeSetJSON(SOCIAL_STORAGE_KEY, list);
    }

    function getThisWeekCheckins(allCheckins) {
      const sevenDaysAgo = new Date();
      sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 7);
      const threshold = getTodayKey(sevenDaysAgo);

      return allCheckins.filter(item => {
        return item && item.date && item.date >= threshold;
      });
    }

    function updateSocialUI() {
      const all = loadSocialCheckins();
      const thisWeek = getThisWeekCheckins(all);
      const count = thisWeek.length;

      const countStr = `This week: ${count} connection${count === 1 ? '' : 's'}`;
      weekPill.textContent = `This week: ${count}`;
      weeklySummary.textContent = countStr;

      renderHistoryList(thisWeek);
    }

    function renderHistoryList(items) {
      historyList.innerHTML = '';
      if (!items || items.length === 0) {
        historyList.innerHTML = `<div style="font-size:0.75rem; color:var(--ink-faint); padding:6px; text-align:center;">No check-ins logged this week yet.</div>`;
        return;
      }

      // Sort newest first
      const sorted = [...items].sort((a, b) => (b.id || '').localeCompare(a.id || ''));

      sorted.forEach(item => {
        const row = document.createElement('div');
        row.className = 'social-history-item';
        row.innerHTML = `
          <div>
            <strong>${escapeHtml(item.personType || 'Friend')}</strong> • 
            <span style="color:var(--ink-soft);">${escapeHtml(item.method || 'Call')}</span>
            <span style="font-size:0.72rem; color:var(--moss); margin-left:4px;">(${escapeHtml(item.feeling || 'Good')})</span>
          </div>
          <div style="display:flex; align-items:center; gap:8px;">
            <span style="font-size:0.7rem; color:var(--ink-faint);">${item.date || ''}</span>
            <button type="button" class="social-history-delete" title="Delete check-in" aria-label="Delete check-in" data-id="${item.id}">🗑️</button>
          </div>
        `;

        const deleteBtn = row.querySelector('.social-history-delete');
        deleteBtn.addEventListener('click', (e) => {
          e.stopPropagation();
          const targetId = deleteBtn.dataset.id;
          let currentList = loadSocialCheckins();
          currentList = currentList.filter(c => c.id !== targetId);
          saveSocialCheckins(currentList);
          updateSocialUI();
        });

        historyList.appendChild(row);
      });
    }

    function escapeHtml(str) {
      return String(str).replace(/[&<>"']/g, m => ({
        '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
      }[m]));
    }

    // Save check-in
    saveBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const newEntry = {
        id: `conn_${Date.now()}_${Math.random().toString(36).substr(2, 6)}`,
        date: getTodayKey(),
        personType: selectedPerson,
        method: selectedMethod,
        feeling: selectedFeeling
      };

      const all = loadSocialCheckins();
      all.push(newEntry);
      saveSocialCheckins(all);

      updateSocialUI();

      feedbackToast.style.display = 'block';
      setTimeout(() => {
        feedbackToast.style.display = 'none';
      }, 2500);
    });

    // Toggle history view
    toggleHistoryBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isVisible = historyList.style.display === 'flex';
      historyList.style.display = isVisible ? 'none' : 'flex';
      toggleHistoryBtn.textContent = isVisible ? 'View This Week' : 'Hide This Week';
    });

    updateSocialUI();
  }


  /* ==========================================================================
     INITIALIZATION DISPATCHER
     ========================================================================== */
  function initWellnessPillars() {
    initSleepCard();
    initDigitalCard();
    initStressCard();
    initStudyCard();
    initActivityCard();
    initSocialCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWellnessPillars);
  } else {
    initWellnessPillars();
  }

  window.initWellnessPillars = initWellnessPillars;
})();
