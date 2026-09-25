/**
 * mood-page.js — Controls Daily Mood Tracker, Voice Mood Check-In, and Mood Analytics.
 *
 * Integrates:
 *  - Web Speech API (SpeechRecognition) for client-side transcription
 *  - Web Audio API (VoiceAnalyzer) for acoustic pitch, pause, energy, and speaking rate analysis
 *  - Client-side text sentiment engine (MindCareSentiment)
 *  - Combined "What the words say" vs "How it sounded" dual signal scoring
 *  - Graceful degradation to standard text check-in
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  if (typeof mcInitChatbot === "function") {
    try { mcInitChatbot(user); } catch (e) {}
  }

  let selectedMood = null;
  const moodBtns = document.querySelectorAll(".mood-btn");
  const noteInput = document.getElementById("mc-mood-note");
  const saveBtn = document.getElementById("mc-save-mood-btn");
  const statusMsg = document.getElementById("mc-mood-status-msg");
  const todayDateEl = document.getElementById("mc-today-date");
  const checkinTitle = document.getElementById("mc-checkin-title");

  // Mode switching tabs
  const tabType = document.getElementById("mc-tab-type");
  const tabVoice = document.getElementById("mc-tab-voice");
  const typeSection = document.getElementById("mc-type-section");
  const voiceSection = document.getElementById("mc-voice-section");

  // Voice recording elements
  const voiceRecBtn = document.getElementById("mc-voice-rec-btn");
  const micIcon = document.getElementById("mc-mic-icon");
  const timerPill = document.getElementById("mc-voice-timer-pill");
  const timeDisplay = document.getElementById("mc-voice-time-display");
  const instructions = document.getElementById("mc-voice-instructions");
  const waveformCanvas = document.getElementById("mc-voice-waveform");
  const fallbackMsg = document.getElementById("mc-voice-fallback-msg");
  const transcriptCard = document.getElementById("mc-voice-transcript-card");
  const transcriptText = document.getElementById("mc-voice-transcript-text");
  const wordCountEl = document.getElementById("mc-voice-word-count");
  const breakdownCard = document.getElementById("mc-voice-breakdown-card");

  // Breakdown card score elements
  const sentimentScoreBadge = document.getElementById("mc-sentiment-score-badge");
  const sentimentLabelBadge = document.getElementById("mc-sentiment-label-badge");
  const vocalScoreBadge = document.getElementById("mc-vocal-score-badge");
  const vocalLabelBadge = document.getElementById("mc-vocal-label-badge");
  const vocalMetricsPills = document.getElementById("mc-vocal-metrics-pills");

  // Voice session state
  let isRecording = false;
  let voiceAnalyzer = null;
  let speechRecognition = null;
  let timerInterval = null;
  let recordSeconds = 0;
  const MAX_RECORD_SECONDS = 60;

  // Staged voice metadata for saving
  let currentVoiceData = {
    isVoiceEntry: false,
    transcript: "",
    textSentimentScore: null,
    vocalToneScore: null,
    blendedMoodScore: null,
    vocalMetrics: null,
  };

  // Format today's date
  const today = new Date();
  todayDateEl.textContent = today.toLocaleDateString(undefined, {
    weekday: "long",
    month: "short",
    day: "numeric",
  });

  // Check if user already checked in today
  const existingToday = MindCareStore.getTodayMood(user.email);
  if (existingToday) {
    selectedMood = existingToday.mood;
    noteInput.value = existingToday.note || "";
    checkinTitle.textContent = "Today's Mood Check-in (Logged)";
    saveBtn.textContent = "Update Today's Mood";
    highlightMoodBtn(selectedMood);

    if (existingToday.isVoiceEntry) {
      statusMsg.innerHTML = `✓ Checked in via <strong>Voice</strong> as ${existingToday.label} (${existingToday.emoji})`;
      // Populate previous voice breakdown
      renderExistingVoiceBreakdown(existingToday);
    } else {
      statusMsg.textContent = `✓ Checked in as ${existingToday.label} (${existingToday.emoji})`;
    }
  }

  // ---------------------------------------------------------------------------
  // Tab Switching (Type Note vs. Voice Check-in)
  // ---------------------------------------------------------------------------
  tabType?.addEventListener("click", () => {
    tabType.classList.add("active");
    tabVoice.classList.remove("active");
    typeSection.style.display = "block";
    voiceSection.style.display = "none";
  });

  tabVoice?.addEventListener("click", () => {
    tabVoice.classList.add("active");
    tabType.classList.remove("active");
    typeSection.style.display = "none";
    voiceSection.style.display = "flex";
  });

  // Mood button selector
  moodBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      selectedMood = Number(btn.dataset.mood);
      highlightMoodBtn(selectedMood);
    });
  });

  function highlightMoodBtn(moodVal) {
    moodBtns.forEach((btn) => {
      btn.classList.toggle("active", Number(btn.dataset.mood) === moodVal);
    });
  }

  // ---------------------------------------------------------------------------
  // Voice Recording & Acoustic Analysis Flow
  // ---------------------------------------------------------------------------
  voiceRecBtn?.addEventListener("click", async () => {
    if (isRecording) {
      stopVoiceRecording();
    } else {
      await startVoiceRecording();
    }
  });

  async function startVoiceRecording() {
    // Reset staged data & UI
    currentVoiceData = {
      isVoiceEntry: false,
      transcript: "",
      textSentimentScore: null,
      vocalToneScore: null,
      blendedMoodScore: null,
      vocalMetrics: null,
    };
    breakdownCard.style.display = "none";
    fallbackMsg.style.display = "none";
    transcriptCard.style.display = "block";
    transcriptText.innerHTML = '<span class="interim">Connecting microphone and listening...</span>';
    wordCountEl.textContent = "0 words";

    // 1. Check microphone availability
    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
      showFallback("Microphone access is not supported by this browser. Please type your journal note instead.");
      return;
    }

    let micStream;
    try {
      micStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (permErr) {
      console.warn("Microphone permission denied:", permErr);
      showFallback("Microphone access was denied. Please allow microphone permissions in your browser or type your note.");
      return;
    }

    // 2. Initialize Web Audio Acoustic Signal Analyzer
    try {
      voiceAnalyzer = new VoiceAnalyzer();
      voiceAnalyzer.start(micStream, waveformCanvas);
    } catch (audioErr) {
      console.warn("Web Audio API error:", audioErr);
    }

    // 3. Initialize Speech-to-Text Recognition
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (!SpeechRecognition) {
      showFallback("Browser speech recognition is unavailable. Acoustic analysis will continue, and you can edit your transcript manually.");
    } else {
      try {
        speechRecognition = new SpeechRecognition();
        speechRecognition.continuous = true;
        speechRecognition.interimResults = true;
        speechRecognition.lang = "en-US";

        let finalTranscript = "";

        speechRecognition.onresult = (event) => {
          let interimTranscript = "";
          for (let i = event.resultIndex; i < event.results.length; i++) {
            const transcriptChunk = event.results[i][0].transcript;
            if (event.results[i].isFinal) {
              finalTranscript += transcriptChunk + " ";
            } else {
              interimTranscript += transcriptChunk;
            }
          }

          const combined = (finalTranscript + interimTranscript).trim();
          currentVoiceData.transcript = combined;

          const words = combined.split(/\s+/).filter(Boolean);
          wordCountEl.textContent = `${words.length} ${words.length === 1 ? "word" : "words"}`;

          transcriptText.innerHTML = `
            <span>${escapeHtml(finalTranscript)}</span>
            <span class="interim">${escapeHtml(interimTranscript)}</span>
          `;
        };

        speechRecognition.onerror = (event) => {
          console.warn("Speech recognition notice:", event.error);
          if (event.error === "not-allowed") {
            showFallback("Microphone permission was blocked. Please permit microphone access.");
          }
        };

        speechRecognition.start();
      } catch (sttErr) {
        console.warn("Could not start SpeechRecognition:", sttErr);
      }
    }

    // 4. Update UI to Recording State
    isRecording = true;
    voiceRecBtn.classList.add("recording");
    voiceRecBtn.setAttribute("title", "Click to stop recording");
    micIcon.innerHTML = `
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor"/>
    `;
    instructions.textContent = "Listening... Speak openly about your thoughts, feelings, and day.";
    instructions.style.color = "#E53935";

    // 5. Start 60-Second Timer
    recordSeconds = 0;
    timerPill.style.display = "inline-flex";
    updateTimerDisplay();

    timerInterval = setInterval(() => {
      recordSeconds++;
      updateTimerDisplay();
      if (recordSeconds >= MAX_RECORD_SECONDS) {
        stopVoiceRecording();
      }
    }, 1000);
  }

  function stopVoiceRecording() {
    if (!isRecording) return;
    isRecording = false;

    // Clear timer
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }

    // Reset button UI
    voiceRecBtn.classList.remove("recording");
    voiceRecBtn.setAttribute("title", "Click to record your voice mood check-in");
    micIcon.innerHTML = `
      <path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/>
      <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
      <line x1="12" y1="19" x2="12" y2="23"/>
      <line x1="8" y1="23" x2="16" y2="23"/>
    `;
    instructions.textContent = "Analyzing speech & vocal resonance...";
    instructions.style.color = "var(--ink-soft)";
    timerPill.style.display = "none";

    // Stop Speech Recognition
    if (speechRecognition) {
      try { speechRecognition.stop(); } catch {}
      speechRecognition = null;
    }

    // Stop Web Audio Acoustic Analyzer & Extract Features
    let vocalMetrics = null;
    if (voiceAnalyzer) {
      try {
        voiceAnalyzer.stop();
        const wordCount = (currentVoiceData.transcript || "").split(/\s+/).filter(Boolean).length;
        vocalMetrics = voiceAnalyzer.getMetrics(wordCount);
      } catch (err) {
        console.warn("Vocal metrics calculation error:", err);
      }
    }

    // Process Combined Signals
    processVoiceCheckin(currentVoiceData.transcript, vocalMetrics);
  }

  /**
   * Blends text sentiment with acoustic vocal tone score and updates UI.
   */
  function processVoiceCheckin(transcript, vocalMetrics) {
    const cleanText = (transcript || "").trim();

    // 1. Text Sentiment Analysis
    const sentiment = MindCareSentiment.analyze(cleanText);
    const textScore = sentiment.normalizedScore; // 1.0 - 5.0

    // 2. Vocal Tone Analysis (from Acoustic Features)
    let toneScore = 3.0;
    let toneLabel = "Balanced";
    if (vocalMetrics) {
      toneScore = vocalMetrics.vocalToneScore; // 1.0 - 5.0
      toneLabel = vocalMetrics.toneLabel;
    }

    // 3. Combined Blended Score (60% Words Sentiment + 40% Vocal Energy)
    const blendedScore = Math.max(1, Math.min(5, Math.round(0.60 * textScore + 0.40 * toneScore)));

    // Save into state
    currentVoiceData = {
      isVoiceEntry: true,
      transcript: cleanText,
      textSentimentScore: textScore,
      vocalToneScore: toneScore,
      blendedMoodScore: blendedScore,
      vocalMetrics: vocalMetrics,
    };

    // Pre-populate note textarea so user can review/edit
    if (cleanText) {
      noteInput.value = cleanText;
    }

    // Auto-select corresponding mood button
    selectedMood = blendedScore;
    highlightMoodBtn(selectedMood);

    // Render Words vs. Tone Breakdown Card
    renderVoiceBreakdownCard(sentiment, toneScore, toneLabel, vocalMetrics);

    instructions.textContent = "✓ Voice analysis complete. You can adjust the emoji or note before saving.";
    instructions.style.color = "var(--moss-dark)";
  }

  function renderVoiceBreakdownCard(sentiment, toneScore, toneLabel, metrics) {
    breakdownCard.style.display = "flex";

    // Sentiment UI
    sentimentScoreBadge.textContent = `${sentiment.normalizedScore.toFixed(1)} / 5`;
    sentimentLabelBadge.textContent = sentiment.label;
    sentimentLabelBadge.className = `badge ${
      sentiment.normalizedScore >= 3.4
        ? "badge-higher"
        : sentiment.normalizedScore >= 2.7
        ? "badge-moderate"
        : "badge-low"
    }`;

    // Vocal Tone UI
    vocalScoreBadge.textContent = `${toneScore.toFixed(1)} / 5`;
    vocalLabelBadge.textContent = toneLabel;
    vocalLabelBadge.className = `badge ${
      toneScore >= 3.5
        ? "badge-higher"
        : toneScore >= 2.6
        ? "badge-moderate"
        : "badge-low"
    }`;

    // Acoustic Metric Pills
    if (metrics) {
      vocalMetricsPills.innerHTML = `
        <span class="voice-pill" title="Pitch variability across spoken syllables">
          🎼 Pitch StdDev: ${metrics.pitchVariance} Hz
        </span>
        <span class="voice-pill" title="Pace of active speech">
          ⚡ Cadence: ${metrics.speakingRate} words/sec
        </span>
        <span class="voice-pill" title="Pauses exceeding 350 milliseconds">
          ⏸️ Pauses: ${metrics.pauseCount} (${Math.round(metrics.pauseDurationRatio * 100)}% silence)
        </span>
        <span class="voice-pill" title="Volume standard deviation">
          🔊 Energy: ${metrics.energyVariance > 0.035 ? "Dynamic" : "Steady"}
        </span>
      `;
    } else {
      vocalMetricsPills.innerHTML = "";
    }
  }

  function renderExistingVoiceBreakdown(entry) {
    if (!entry.isVoiceEntry) return;

    tabVoice?.click();
    transcriptCard.style.display = "block";
    transcriptText.textContent = entry.transcript || entry.note || "No transcript recorded.";

    const wordCount = (entry.transcript || entry.note || "").split(/\s+/).filter(Boolean).length;
    wordCountEl.textContent = `${wordCount} words`;

    const sentiment = MindCareSentiment.analyze(entry.transcript || entry.note || "");
    const toneScore = entry.vocalToneScore || 3.0;
    const toneLabel = entry.vocalToneScore >= 3.5 ? "Lively & Animated" : (entry.vocalToneScore <= 2.5 ? "Low Energy" : "Balanced");

    renderVoiceBreakdownCard(sentiment, toneScore, toneLabel, entry.vocalMetrics);
  }

  function updateTimerDisplay() {
    const mins = String(Math.floor(recordSeconds / 60)).padStart(2, "0");
    const secs = String(recordSeconds % 60).padStart(2, "0");
    timeDisplay.textContent = `${mins}:${secs} / 01:00`;
  }

  function showFallback(message) {
    fallbackMsg.textContent = `⚠️ ${message}`;
    fallbackMsg.style.display = "flex";
  }

  function escapeHtml(str) {
    if (!str) return "";
    return String(str)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#039;");
  }

  // ---------------------------------------------------------------------------
  // Save Mood Handler
  // ---------------------------------------------------------------------------
  saveBtn.addEventListener("click", () => {
    if (!selectedMood) {
      alert("Please select how you are feeling today before saving.");
      return;
    }

    const isVoice = currentVoiceData.isVoiceEntry;
    const note = noteInput.value.trim();

    const saved = MindCareStore.saveMood(user.email, {
      mood: selectedMood,
      note: note,
      isVoiceEntry: isVoice,
      transcript: isVoice ? (currentVoiceData.transcript || note) : null,
      textSentimentScore: isVoice ? currentVoiceData.textSentimentScore : null,
      vocalToneScore: isVoice ? currentVoiceData.vocalToneScore : null,
      blendedMoodScore: isVoice ? currentVoiceData.blendedMoodScore : null,
      vocalMetrics: isVoice ? currentVoiceData.vocalMetrics : null,
    });

    if (isVoice) {
      statusMsg.innerHTML = `✓ Saved <strong>Voice Check-in</strong> as ${saved.label} (${saved.emoji}) for today!`;
    } else {
      statusMsg.textContent = `✓ Saved as ${saved.label} (${saved.emoji}) for today!`;
    }

    saveBtn.textContent = "Update Today's Mood";
    checkinTitle.textContent = "Today's Mood Check-in (Logged)";

    renderStreaks();
    renderAnalytics();
  });

  // ---------------------------------------------------------------------------
  // Streaks & Analytics Display
  // ---------------------------------------------------------------------------
  function renderStreaks() {
    const streaks = MindCareStore.getStreaks(user.email);
    const container = document.getElementById("mc-mood-streaks");
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

  function renderAnalytics() {
    const analytics = MindCareStore.getMoodAnalytics(user.email);

    // 1. Last 7 Days Track
    const weekTrack = document.getElementById("mc-week-track");
    weekTrack.innerHTML = analytics.last7Days
      .map(
        (day) => `
      <div class="mood-day-col">
        <span class="day-name">${day.day}</span>
        <div class="day-emoji">${day.emoji || "—"}</div>
        <span style="font-size:0.68rem; color:var(--ink-faint);">${day.date.slice(5)}</span>
      </div>`
      )
      .join("");

    // 2. Mood Distribution Bars
    const distContainer = document.getElementById("mc-mood-distribution");
    const total = analytics.totalCheckins || 1;
    const moodOrder = [5, 4, 3, 2, 1];

    distContainer.innerHTML = moodOrder
      .map((mVal) => {
        const meta = MindCareStore.MOOD_META[mVal];
        const count = analytics.distribution[mVal] || 0;
        const pct = Math.round((count / total) * 100);
        return `
        <div class="mood-bar-row">
          <div class="bar-label">
            <span>${meta.emoji}</span>
            <span>${meta.label}</span>
          </div>
          <div class="bar-track">
            <div class="bar-fill" style="width:${pct}%; background:${meta.color};"></div>
          </div>
          <div class="bar-count">${count}</div>
        </div>`;
      })
      .join("");
  }

  renderStreaks();
  renderAnalytics();
});
