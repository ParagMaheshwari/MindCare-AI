/**
 * chatbot.js — MindCare AI Assistant (Single Source of Truth)
 * Centralized singleton module: MindCareChat
 * - Complete professional UI/UX redesign: clean, calm, modern, accessible.
 * - Multi-turn conversational history with backend /chat API.
 * - Integrated, auto-resizing composer (no search-box look, no nested borders).
 * - Full Voice Mode state machine (IDLE, LISTENING, PROCESSING, AI_SPEAKING, ERROR).
 * - Speech-to-Text (STT) dictation + Text-to-Speech (TTS) response playback.
 * - In-app clear conversation modal with confirmation.
 * - Responsive floating desktop panel + full-height mobile experience.
 */

const SUGGESTED_PROMPTS = [
  "How can I reduce stress?",
  "How can I improve my sleep?",
  "I feel overwhelmed with my studies.",
  "How can I manage screen time?",
];

const CHAT_ICONS = {
  chat: `<svg viewBox="0 0 24 24" width="22" height="22" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>`,
  spark: `<svg viewBox="0 0 24 24" width="16" height="16" fill="currentColor"><path d="M12 2l2.4 6.6L21 11l-6.6 2.4L12 20l-2.4-6.6L3 11l6.6-2.4z"/></svg>`,
  trash: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  send: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" width="17" height="17" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" width="13" height="13" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  copy: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="9" y="9" width="13" height="13" rx="2" ry="2"/><path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1"/></svg>`,
  check: `<svg viewBox="0 0 24 24" width="13" height="13" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"><polyline points="20 6 9 17 4 12"/></svg>`,
  waveform: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2v20M17 5v14M7 8v8M22 10v4M2 10v4"/></svg>`,
};

function mcSafeEscape(str) {
  if (typeof mcEscape === "function") return mcEscape(str);
  return String(str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function mcFormatMarkdown(rawText) {
  if (!rawText) return "";
  let safe = rawText
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");

  safe = safe.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");

  const lines = safe.split("\n");
  let inList = false;
  let listType = "";
  const out = [];

  for (let line of lines) {
    const trimmed = line.trim();
    const isUl = /^[-*]\s+(.+)/.test(trimmed);
    const isOl = /^\d+\.\s+(.+)/.test(trimmed);

    if (isUl) {
      const match = trimmed.match(/^[-*]\s+(.+)/);
      if (!inList || listType !== "ul") {
        if (inList) out.push(`</${listType}>`);
        out.push("<ul>");
        inList = true;
        listType = "ul";
      }
      out.push(`<li>${match[1]}</li>`);
    } else if (isOl) {
      const match = trimmed.match(/^\d+\.\s+(.+)/);
      if (!inList || listType !== "ol") {
        if (inList) out.push(`</${listType}>`);
        out.push("<ol>");
        inList = true;
        listType = "ol";
      }
      out.push(`<li>${match[1]}</li>`);
    } else {
      if (inList) {
        out.push(`</${listType}>`);
        inList = false;
      }
      if (trimmed) {
        out.push(`<p>${trimmed}</p>`);
      }
    }
  }
  if (inList) {
    out.push(`</${listType}>`);
  }

  return out.join("");
}

function mcStripMarkdownForSpeech(md) {
  if (!md) return "";
  return md
    .replace(/\*\*(.*?)\*\*/g, "$1")
    .replace(/\*(.*?)\*/g, "$1")
    .replace(/__(.*?)__/g, "$1")
    .replace(/~~(.*?)~~/g, "$1")
    .replace(/^#+\s+/gm, "")
    .replace(/^\s*[-*+]\s+/gm, "")
    .replace(/^\s*\d+\.\s+/gm, "")
    .replace(/\[([^\]]+)\]\([^)]+\)/g, "$1")
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .replace(/[^\w\s.,?!'"\-:;]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function mcFormatTime(isoString) {
  try {
    const d = isoString ? new Date(isoString) : new Date();
    return d.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  } catch {
    return "";
  }
}

function mcBuildChatContext(user) {
  if (!user || !user.email) return null;
  const latest = typeof MindCareResults !== "undefined" && MindCareResults.getLatest ? MindCareResults.getLatest(user.email) : null;
  if (!latest) return null;
  const fd = latest.formData || {};
  return {
    score: typeof latest.score === "number" ? latest.score : (parseFloat(latest.score) || null),
    age: fd.age != null && fd.age !== "" ? parseInt(fd.age, 10) : null,
    academic_level: fd.academic_level || null,
    avg_daily_usage_hours: fd.avg_daily_usage_hours != null && fd.avg_daily_usage_hours !== "" ? parseFloat(fd.avg_daily_usage_hours) : null,
    study_hours: fd.study_hours != null && fd.study_hours !== "" ? parseFloat(fd.study_hours) : null,
    physical_activity_hours: fd.physical_activity_hours != null && fd.physical_activity_hours !== "" ? parseFloat(fd.physical_activity_hours) : null,
    sleep_hours_per_night: fd.sleep_hours_per_night != null && fd.sleep_hours_per_night !== "" ? parseFloat(fd.sleep_hours_per_night) : null,
    stress_level: fd.stress_level || null,
  };
}

const MindCareChat = (() => {
  let isMounted = false;
  let currentUser = null;
  let fab = null;
  let panel = null;
  let body = null;
  let flow = null;
  let suggestionsWrap = null;
  let textarea = null;
  let sendBtn = null;
  let micBtn = null;
  let voiceHeaderBtn = null;
  let clearBtn = null;
  let closeBtn = null;
  let messages = [];
  let historyPushed = false;
  let savedScrollY = 0;

  // Voice Interaction State Machine: IDLE | LISTENING | PROCESSING | AI_SPEAKING | ERROR
  let voiceState = "IDLE";
  let voiceAutoSpeak = false;
  try {
    voiceAutoSpeak = localStorage.getItem("mindcare_voice_auto_speak") === "true";
  } catch {}

  let isListening = false;
  let recognition = null;
  let currentlySpeakingIdx = null;

  // Elements for Voice Mode Overlay & Confirm Dialog
  let voiceOverlay = null;
  let voiceVisualZone = null;
  let voiceTranscriptPreview = null;
  let voiceCardActions = null;
  let voiceAutoSpeakToggle = null;
  let voiceOverlayCloseBtn = null;

  let confirmOverlay = null;
  let confirmCancelBtn = null;
  let confirmClearBtn = null;

  let isSending = false;
  let currentAbortController = null;

  function getStorageKey() {
    const emailKey = currentUser && currentUser.email ? currentUser.email : "guest";
    return `mindcare_chat_${emailKey}`;
  }

  function loadMessages() {
    try {
      return JSON.parse(sessionStorage.getItem(getStorageKey())) || [];
    } catch {
      return [];
    }
  }

  function saveMessages(msgs) {
    try {
      sessionStorage.setItem(getStorageKey(), JSON.stringify(msgs));
    } catch {}
  }

  /* --------------------------------------------------------------------------
     Web Speech API: SpeechRecognition (STT)
     -------------------------------------------------------------------------- */
  function getSpeechRecognition() {
    if (typeof window === "undefined") return null;
    return window.SpeechRecognition || window.webkitSpeechRecognition || null;
  }

  function initSpeechRecognition() {
    const SR = getSpeechRecognition();
    if (!SR) return null;
    try {
      const rec = new SR();
      rec.continuous = false;
      rec.interimResults = true;
      rec.lang = "en-US";

      rec.onstart = () => {
        isListening = true;
        if (micBtn) {
          micBtn.classList.add("listening");
          micBtn.setAttribute("aria-label", "Listening… tap to stop");
          micBtn.title = "Listening… tap to stop";
        }
        if (voiceOverlay && voiceOverlay.style.display !== "none") {
          setVoiceState("LISTENING");
        }
      };

      rec.onresult = (event) => {
        let interim = "";
        let final = "";
        for (let i = event.resultIndex; i < event.results.length; ++i) {
          if (event.results[i].isFinal) {
            final += event.results[i][0].transcript;
          } else {
            interim += event.results[i][0].transcript;
          }
        }
        const text = final || interim;
        if (textarea) {
          textarea.value = text;
          adjustTextareaHeight();
          updateSendButtonState();
        }
        if (voiceTranscriptPreview) {
          voiceTranscriptPreview.textContent = text ? `"${text}"` : "I'm listening...";
        }
      };

      rec.onerror = (event) => {
        console.warn("SpeechRecognition error:", event.error);
        stopListening();
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          if (voiceOverlay && voiceOverlay.style.display !== "none") {
            setVoiceState("ERROR", "Microphone access is required for voice input. Please enable permissions in browser settings.");
          } else {
            alert("Microphone access was denied. Please allow microphone permissions in your browser.");
          }
        } else if (event.error !== "no-speech") {
          if (voiceOverlay && voiceOverlay.style.display !== "none") {
            setVoiceState("ERROR", `Voice recognition notice: ${event.error}`);
          }
        }
      };

      rec.onend = () => {
        isListening = false;
        if (micBtn) {
          micBtn.classList.remove("listening");
          micBtn.setAttribute("aria-label", "Voice dictation");
          micBtn.title = "Voice dictation";
        }
        if (voiceOverlay && voiceOverlay.style.display !== "none") {
          if (voiceState === "LISTENING") {
            // If user was in voice overlay and spoke something, prompt them or auto-send
            const spoken = textarea ? textarea.value.trim() : "";
            if (spoken) {
              setVoiceState("IDLE", "Finished listening. Tap Send to continue or Cancel.");
            } else {
              setVoiceState("IDLE");
            }
          }
        }
      };

      return rec;
    } catch (e) {
      console.warn("SpeechRecognition setup failed:", e);
      return null;
    }
  }

  function startListening() {
    stopSpeaking();
    if (!getSpeechRecognition()) {
      if (voiceOverlay && voiceOverlay.style.display !== "none") {
        setVoiceState("ERROR", "Voice input is not supported in this browser. Please try Chrome, Edge, or Safari.");
      } else {
        alert("Voice recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
      }
      return;
    }
    if (!recognition) {
      recognition = initSpeechRecognition();
    }
    if (!recognition) {
      if (voiceOverlay && voiceOverlay.style.display !== "none") {
        setVoiceState("ERROR", "Unable to initialize microphone input.");
      }
      return;
    }
    try {
      recognition.start();
    } catch (err) {
      try {
        recognition.stop();
        setTimeout(() => {
          try { recognition.start(); } catch {}
        }, 120);
      } catch {}
    }
  }

  function stopListening() {
    if (recognition && isListening) {
      try {
        recognition.stop();
      } catch {}
    }
    isListening = false;
    if (micBtn) {
      micBtn.classList.remove("listening");
      micBtn.setAttribute("aria-label", "Voice dictation");
      micBtn.title = "Voice dictation";
    }
  }

  function toggleListening() {
    if (isListening) {
      stopListening();
    } else {
      startListening();
    }
  }

  /* --------------------------------------------------------------------------
     Web Speech API: SpeechSynthesis (TTS)
     -------------------------------------------------------------------------- */
  function stopSpeaking() {
    if (typeof window !== "undefined" && "speechSynthesis" in window) {
      try {
        window.speechSynthesis.cancel();
      } catch {}
    }
    currentlySpeakingIdx = null;
    updateSpeakButtonsUI();
    if (voiceState === "AI_SPEAKING") {
      setVoiceState("IDLE");
    }
  }

  function speakText(rawText, messageIdx) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      alert("Voice playback is not supported on this browser.");
      return;
    }

    if (currentlySpeakingIdx === messageIdx) {
      stopSpeaking();
      return;
    }

    stopSpeaking();

    const plain = mcStripMarkdownForSpeech(rawText);
    if (!plain) return;

    try {
      const utterance = new SpeechSynthesisUtterance(plain);
      utterance.rate = 1.0;
      utterance.pitch = 1.0;
      utterance.lang = "en-US";

      const voices = window.speechSynthesis.getVoices();
      if (voices && voices.length > 0) {
        const preferred = voices.find(
          (v) => (v.lang.startsWith("en") || v.lang === "en_US") &&
                 (v.name.includes("Natural") || v.name.includes("Google") || v.name.includes("Samantha"))
        ) || voices.find((v) => v.lang.startsWith("en"));
        if (preferred) utterance.voice = preferred;
      }

      utterance.onstart = () => {
        currentlySpeakingIdx = messageIdx;
        updateSpeakButtonsUI();
        if (voiceOverlay && voiceOverlay.style.display !== "none") {
          setVoiceState("AI_SPEAKING", plain.slice(0, 80) + "…");
        }
      };

      utterance.onend = () => {
        currentlySpeakingIdx = null;
        updateSpeakButtonsUI();
        if (voiceState === "AI_SPEAKING") {
          setVoiceState("IDLE");
        }
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("SpeechSynthesis error:", e);
        }
        currentlySpeakingIdx = null;
        updateSpeakButtonsUI();
        if (voiceState === "AI_SPEAKING") {
          setVoiceState("IDLE");
        }
      };

      window.speechSynthesis.speak(utterance);
    } catch (err) {
      console.warn("speakText failed:", err);
      currentlySpeakingIdx = null;
      updateSpeakButtonsUI();
    }
  }

  function updateSpeakButtonsUI() {
    if (!flow) return;
    flow.querySelectorAll(".chat-action-speak").forEach((btn) => {
      const idx = btn.dataset.idx === "welcome" ? "welcome" : parseInt(btn.dataset.idx, 10);
      const isSpeakingThis = currentlySpeakingIdx === idx;
      if (isSpeakingThis) {
        btn.classList.add("speaking");
        btn.setAttribute("title", "Stop playback");
        btn.setAttribute("aria-label", "Stop playback");
        btn.innerHTML = `${CHAT_ICONS.stop}<span>Stop</span>`;
      } else {
        btn.classList.remove("speaking");
        btn.setAttribute("title", "Listen to response");
        btn.setAttribute("aria-label", "Listen to response");
        btn.innerHTML = `${CHAT_ICONS.speaker}<span>Listen</span>`;
      }
    });
  }

  /* --------------------------------------------------------------------------
     Voice Mode Overlay State Machine
     -------------------------------------------------------------------------- */
  function openVoiceOverlay() {
    if (!voiceOverlay) return;
    voiceOverlay.style.display = "flex";
    voiceOverlay.setAttribute("aria-hidden", "false");
    if (voiceAutoSpeakToggle) {
      voiceAutoSpeakToggle.checked = voiceAutoSpeak;
    }
    setVoiceState("LISTENING");
    startListening();
  }

  function closeVoiceOverlay() {
    if (!voiceOverlay) return;
    stopListening();
    stopSpeaking();
    voiceOverlay.style.display = "none";
    voiceOverlay.setAttribute("aria-hidden", "true");
    setVoiceState("IDLE");
  }

  function setVoiceState(state, message = "") {
    voiceState = state;
    if (!voiceVisualZone || !voiceTranscriptPreview || !voiceCardActions) return;

    if (state === "LISTENING") {
      voiceVisualZone.innerHTML = `
        <div class="voice-pulse-ring">
          <svg viewBox="0 0 24 24" width="32" height="32" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
      `;
      voiceTranscriptPreview.textContent = textarea && textarea.value.trim() ? `"${textarea.value}"` : "Listening... speak freely";
      voiceCardActions.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="mc-voice-cancel-btn">Cancel</button>
        <button type="button" class="btn btn-primary btn-sm" id="mc-voice-done-btn">Done & Send</button>
      `;
      const cancelBtn = document.getElementById("mc-voice-cancel-btn");
      if (cancelBtn) cancelBtn.addEventListener("click", () => {
        stopListening();
        closeVoiceOverlay();
      });
      const doneBtn = document.getElementById("mc-voice-done-btn");
      if (doneBtn) doneBtn.addEventListener("click", () => {
        stopListening();
        closeVoiceOverlay();
        if (textarea && textarea.value.trim()) {
          sendMessage();
        }
      });
    } else if (state === "PROCESSING") {
      voiceVisualZone.innerHTML = `
        <div class="voice-pulse-ring" style="animation-duration: 1s;">
          <svg class="spin-icon" viewBox="0 0 24 24" width="30" height="30" fill="none" stroke="currentColor" stroke-width="2.5">
            <circle cx="12" cy="12" r="10" stroke-opacity="0.25"/>
            <path d="M12 2a10 10 0 0 1 10 10" stroke="currentColor"/>
          </svg>
        </div>
      `;
      voiceTranscriptPreview.textContent = "MindCare AI is thinking...";
      voiceCardActions.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="mc-voice-cancel-btn">Cancel</button>
      `;
      const cancelBtn = document.getElementById("mc-voice-cancel-btn");
      if (cancelBtn) cancelBtn.addEventListener("click", closeVoiceOverlay);
    } else if (state === "AI_SPEAKING") {
      voiceVisualZone.innerHTML = `
        <div class="voice-wave-bars">
          <span></span><span></span><span></span><span></span>
        </div>
      `;
      voiceTranscriptPreview.textContent = message || "Speaking response...";
      voiceCardActions.innerHTML = `
        <button type="button" class="btn btn-secondary btn-sm" id="mc-voice-stop-speech-btn">Stop Playback</button>
        <button type="button" class="btn btn-ghost btn-sm" id="mc-voice-close-btn">Close</button>
      `;
      const stopBtn = document.getElementById("mc-voice-stop-speech-btn");
      if (stopBtn) stopBtn.addEventListener("click", stopSpeaking);
      const closeBtn = document.getElementById("mc-voice-close-btn");
      if (closeBtn) closeBtn.addEventListener("click", closeVoiceOverlay);
    } else if (state === "ERROR") {
      voiceVisualZone.innerHTML = `
        <div style="width:54px; height:54px; border-radius:50%; background:rgba(239,68,68,0.15); color:#EF4444; display:flex; align-items:center; justify-content:center;">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="10"/><line x1="12" y1="8" x2="12" y2="12"/><line x1="12" y1="16" x2="12.01" y2="16"/></svg>
        </div>
      `;
      voiceTranscriptPreview.textContent = message || "Voice input error. Please try again.";
      voiceCardActions.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="mc-voice-close-btn">Dismiss</button>
        <button type="button" class="btn btn-primary btn-sm" id="mc-voice-retry-btn">Try Again</button>
      `;
      const closeBtn = document.getElementById("mc-voice-close-btn");
      if (closeBtn) closeBtn.addEventListener("click", closeVoiceOverlay);
      const retryBtn = document.getElementById("mc-voice-retry-btn");
      if (retryBtn) retryBtn.addEventListener("click", () => {
        setVoiceState("LISTENING");
        startListening();
      });
    } else {
      // IDLE
      voiceVisualZone.innerHTML = `
        <div class="voice-pulse-ring" style="animation:none; background:var(--canvas-dim);">
          <svg viewBox="0 0 24 24" width="28" height="28" fill="none" stroke="currentColor" stroke-width="2">
            <path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/>
            <path d="M19 10v2a7 7 0 0 1-14 0v-2"/>
            <line x1="12" y1="19" x2="12" y2="23"/>
            <line x1="8" y1="23" x2="16" y2="23"/>
          </svg>
        </div>
      `;
      voiceTranscriptPreview.textContent = message || "Tap to speak with MindCare AI";
      voiceCardActions.innerHTML = `
        <button type="button" class="btn btn-ghost btn-sm" id="mc-voice-close-btn">Close</button>
        <button type="button" class="btn btn-primary btn-sm" id="mc-voice-start-btn">Start Speaking</button>
      `;
      const closeBtn = document.getElementById("mc-voice-close-btn");
      if (closeBtn) closeBtn.addEventListener("click", closeVoiceOverlay);
      const startBtn = document.getElementById("mc-voice-start-btn");
      if (startBtn) startBtn.addEventListener("click", () => {
        setVoiceState("LISTENING");
        startListening();
      });
    }
  }

  /* --------------------------------------------------------------------------
     Confirmation Modal: Clear Conversation
     -------------------------------------------------------------------------- */
  function openClearConfirm() {
    if (!confirmOverlay) return;
    confirmOverlay.style.display = "flex";
    confirmOverlay.setAttribute("aria-hidden", "false");
  }

  function closeClearConfirm() {
    if (!confirmOverlay) return;
    confirmOverlay.style.display = "none";
    confirmOverlay.setAttribute("aria-hidden", "true");
  }

  function executeClearChat() {
    if (currentAbortController) {
      try { currentAbortController.abort(); } catch {}
    }
    isSending = false;
    stopSpeaking();
    stopListening();
    messages = [];
    saveMessages(messages);
    closeClearConfirm();
    renderMessages();
  }

  /* --------------------------------------------------------------------------
     UI Rendering
     -------------------------------------------------------------------------- */
  function renderSuggestions() {
    if (!suggestionsWrap) return;
    // Only show suggestions when conversation is empty
    if (messages.length > 0) {
      suggestionsWrap.style.display = "none";
      suggestionsWrap.classList.add("is-hidden");
      suggestionsWrap.innerHTML = "";
      return;
    }
    suggestionsWrap.style.display = "flex";
    suggestionsWrap.classList.remove("is-hidden");
    suggestionsWrap.innerHTML = `
      <div class="chat-suggestions-title">Quick Topics to Explore</div>
      <div class="chat-chips-grid">
        ${SUGGESTED_PROMPTS.map(
          (p) => `<button type="button" class="chat-chip" data-prompt="${mcSafeEscape(p)}">${mcSafeEscape(p)}</button>`
        ).join("")}
      </div>
    `;
    suggestionsWrap.querySelectorAll(".chat-chip").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!textarea) return;
        textarea.value = btn.dataset.prompt;
        adjustTextareaHeight();
        updateSendButtonState();
        sendMessage();
      });
    });
  }

  function renderMessages() {
    if (!flow) return;
    flow.innerHTML = "";

    if (messages.length === 0) {
      const welcomeWrap = document.createElement("div");
      welcomeWrap.className = "chat-msg-row bot";
      const userName = (currentUser?.name || "").split(" ")[0] || "there";
      const welcomeText = `Hi ${userName}! 👋 I'm your MindCare AI wellness companion. I can help with study stress, relaxation routines, sleep habits, and digital wellbeing.`;
      
      welcomeWrap.innerHTML = `
        <div class="chat-avatar-sm" aria-hidden="true">${CHAT_ICONS.spark}</div>
        <div class="chat-bubble-wrap">
          <div class="chat-bubble bot">
            <p><strong>Hi ${mcSafeEscape(userName)}! 👋</strong></p>
            <p>I'm your MindCare AI wellness companion. I'm here to support your daily student life with personalized, evidence-grounded coping strategies.</p>
            <p style="font-size:0.78rem; color:var(--ink-faint); margin-top:6px;"><em>Note: MindCare AI is educational and non-diagnostic; it does not replace licensed medical care.</em></p>
          </div>
          <div class="chat-meta-row">
            <span class="chat-time">${mcFormatTime()}</span>
            <button type="button" class="chat-action-btn chat-action-speak" data-idx="welcome" title="Listen to welcome" aria-label="Listen to welcome">
              ${CHAT_ICONS.speaker}<span>Listen</span>
            </button>
          </div>
        </div>
      `;
      flow.appendChild(welcomeWrap);

      const welcomeBtn = welcomeWrap.querySelector(".chat-action-speak");
      if (welcomeBtn) {
        welcomeBtn.addEventListener("click", () => {
          speakText(welcomeText, "welcome");
        });
      }
    } else {
      messages.forEach((m, idx) => {
        const row = document.createElement("div");
        row.className = `chat-msg-row ${m.role === "user" ? "user" : "bot"}`;

        const isUser = m.role === "user";
        const isError = m.role === "error";

        const userInitial = typeof MindCareAuth !== "undefined" ? MindCareAuth.initials(currentUser?.name || "You") : "U";
        const avatarHtml = isUser
          ? `<div class="chat-avatar-sm user-av" aria-hidden="true">${mcSafeEscape(userInitial)}</div>`
          : `<div class="chat-avatar-sm" aria-hidden="true">${CHAT_ICONS.spark}</div>`;

        const bubbleContent = isUser
          ? `<div class="chat-bubble user"><p>${mcSafeEscape(m.text)}</p></div>`
          : isError
          ? `<div class="chat-bubble error"><p>${mcSafeEscape(m.text)}</p></div>`
          : `<div class="chat-bubble bot">${mcFormatMarkdown(m.text)}</div>`;

        const isSpeakingThis = currentlySpeakingIdx === idx;
        const metaHtml = isUser
          ? `<div class="chat-meta-row user-meta"><span class="chat-time">${mcFormatTime(m.timestamp)}</span></div>`
          : `<div class="chat-meta-row">
              <span class="chat-time">${mcFormatTime(m.timestamp)}</span>
              ${!isError ? `
              <button type="button" class="chat-action-btn chat-action-speak ${isSpeakingThis ? 'speaking' : ''}" data-idx="${idx}" title="${isSpeakingThis ? 'Stop listening' : 'Listen'}" aria-label="${isSpeakingThis ? 'Stop listening' : 'Listen'}">
                ${isSpeakingThis ? CHAT_ICONS.stop : CHAT_ICONS.speaker}
                <span>${isSpeakingThis ? 'Stop' : 'Listen'}</span>
              </button>
              <button type="button" class="chat-action-btn chat-action-copy" data-idx="${idx}" title="Copy message" aria-label="Copy message">
                ${CHAT_ICONS.copy}<span>Copy</span>
              </button>` : ''}
            </div>`;

        row.innerHTML = `
          ${avatarHtml}
          <div class="chat-bubble-wrap">
            ${bubbleContent}
            ${metaHtml}
          </div>
        `;
        flow.appendChild(row);

        const speakBtn = row.querySelector(".chat-action-speak");
        if (speakBtn) {
          speakBtn.addEventListener("click", () => {
            speakText(m.text, idx);
          });
        }

        const copyBtn = row.querySelector(".chat-action-copy");
        if (copyBtn) {
          copyBtn.addEventListener("click", async () => {
            try {
              await navigator.clipboard.writeText(m.text);
              copyBtn.classList.add("copied");
              copyBtn.innerHTML = `${CHAT_ICONS.check}<span>Copied ✓</span>`;
              setTimeout(() => {
                copyBtn.classList.remove("copied");
                copyBtn.innerHTML = `${CHAT_ICONS.copy}<span>Copy</span>`;
              }, 2000);
            } catch (err) {
              console.warn("Copy to clipboard failed:", err);
            }
          });
        }
      });
    }

    if (body) {
      body.scrollTop = body.scrollHeight;
    }
    renderSuggestions();
  }

  function showTyping() {
    if (!flow) return;
    hideTyping();
    const el = document.createElement("div");
    el.className = "chat-msg-row bot";
    el.id = "mc-typing-row";
    el.innerHTML = `
      <div class="chat-avatar-sm" aria-hidden="true">${CHAT_ICONS.spark}</div>
      <div class="chat-bubble-wrap">
        <div class="chat-typing-bubble" aria-label="MindCare AI is thinking">
          <span></span><span></span><span></span>
        </div>
      </div>
    `;
    flow.appendChild(el);
    if (body) body.scrollTop = body.scrollHeight;
  }

  function hideTyping() {
    const el = document.getElementById("mc-typing-row");
    if (el) el.remove();
  }

  function adjustTextareaHeight() {
    if (!textarea) return;
    textarea.style.height = "auto";
    textarea.style.height = Math.min(120, textarea.scrollHeight) + "px";
  }

  function updateSendButtonState() {
    if (!sendBtn || !textarea) return;
    const hasText = textarea.value.trim().length > 0;
    sendBtn.classList.toggle("active", hasText);
    sendBtn.disabled = !hasText;
  }

  async function sendMessage() {
    if (!textarea || isSending) return;
    const text = textarea.value.trim();
    if (!text) return;

    isSending = true;
    currentAbortController = new AbortController();

    stopListening();

    const now = new Date().toISOString();
    messages.push({ role: "user", text, timestamp: now });
    saveMessages(messages);
    renderMessages();

    textarea.value = "";
    textarea.style.height = "36px";
    updateSendButtonState();
    textarea.disabled = true;
    if (micBtn) micBtn.disabled = true;
    showTyping();

    // Send only recent conversation turns (max 6) to keep prompt concise & fast
    const history = messages.slice(0, -1)
      .filter((m) => m.role === "user" || m.role === "bot")
      .slice(-6)
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        content: m.text,
      }));

    let botMsgIdx = -1;
    let botRowEl = null;
    let botBubbleEl = null;

    try {
      const context = mcBuildChatContext(currentUser);

      await MindCareAPI.chatStream(text, history, context, {
        signal: currentAbortController.signal,
        onChunk: (chunk, accumulated) => {
          hideTyping();
          if (botMsgIdx === -1) {
            // First chunk received!
            messages.push({
              role: "bot",
              text: accumulated,
              timestamp: new Date().toISOString(),
            });
            botMsgIdx = messages.length - 1;

            botRowEl = document.createElement("div");
            botRowEl.className = "chat-msg-row bot";
            botRowEl.innerHTML = `
              <div class="chat-avatar-sm" aria-hidden="true">${CHAT_ICONS.spark}</div>
              <div class="chat-bubble-wrap">
                <div class="chat-bubble bot streaming">
                  ${mcRenderMarkdown(accumulated)}
                </div>
              </div>
            `;
            if (flow) {
              flow.appendChild(botRowEl);
              botBubbleEl = botRowEl.querySelector(".chat-bubble.bot");
            }
          } else {
            messages[botMsgIdx].text = accumulated;
            if (botBubbleEl) {
              botBubbleEl.innerHTML = mcRenderMarkdown(accumulated);
            }
          }
          if (body) {
            body.scrollTop = body.scrollHeight;
          }
        },
        onDone: (fullText) => {
          hideTyping();
          if (botMsgIdx !== -1) {
            messages[botMsgIdx].text = fullText;
          } else if (fullText) {
            messages.push({
              role: "bot",
              text: fullText,
              timestamp: new Date().toISOString(),
            });
            botMsgIdx = messages.length - 1;
          }
          saveMessages(messages);
          renderMessages();

          if (voiceAutoSpeak && fullText) {
            speakText(fullText, botMsgIdx >= 0 ? botMsgIdx : messages.length - 1);
          }
        },
        onError: (err) => {
          hideTyping();
          if (currentAbortController && currentAbortController.signal.aborted) {
            return;
          }
          messages.push({
            role: "error",
            text: err.friendlyMessage || "Something went wrong. Please check your connection and try again.",
            timestamp: new Date().toISOString(),
          });
          saveMessages(messages);
          renderMessages();
        }
      });
    } catch (err) {
      hideTyping();
      if (!currentAbortController || !currentAbortController.signal.aborted) {
        if (botMsgIdx === -1) {
          messages.push({
            role: "error",
            text: err.friendlyMessage || "Something went wrong. Please try again in a moment.",
            timestamp: new Date().toISOString(),
          });
          saveMessages(messages);
          renderMessages();
        }
      }
    } finally {
      isSending = false;
      currentAbortController = null;
      textarea.disabled = false;
      if (micBtn) micBtn.disabled = false;
      updateSendButtonState();
      textarea.focus();
    }
  }

  function lockScroll() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      document.body.style.overflow = "hidden";
      document.documentElement.style.overflow = "hidden";
    }
    document.body.classList.add("chat-open");
  }

  function unlockScroll() {
    document.body.classList.remove("chat-open");
    document.body.style.overflow = "";
    document.documentElement.style.overflow = "";
  }

  function open() {
    if (!isMounted || !panel) {
      init();
    }
    if (!panel) return;
    if (panel.classList.contains("open")) return;

    panel.classList.add("open");
    if (fab) fab.setAttribute("aria-expanded", "true");
    lockScroll();

    try {
      if (window.history && window.history.pushState && !historyPushed) {
        history.pushState({ mcChatOpen: true }, "");
        historyPushed = true;
      }
    } catch {}

    renderMessages();
    setTimeout(() => {
      textarea?.focus();
      if (body) body.scrollTop = body.scrollHeight;
    }, 150);
  }

  function close(fromPopState = false) {
    if (!panel) return;
    if (!panel.classList.contains("open")) return;

    if (currentAbortController) {
      try { currentAbortController.abort(); } catch {}
    }
    isSending = false;
    stopSpeaking();
    stopListening();
    closeVoiceOverlay();
    closeClearConfirm();

    panel.classList.remove("open");
    if (fab) fab.setAttribute("aria-expanded", "false");
    unlockScroll();

    panel.style.height = "";
    panel.style.top = "";

    if (!fromPopState && historyPushed) {
      historyPushed = false;
      try {
        if (window.history && window.history.state && window.history.state.mcChatOpen) {
          window.history.back();
        }
      } catch {}
    } else {
      historyPushed = false;
    }
  }

  function toggle() {
    if (isOpen()) {
      close();
    } else {
      open();
    }
  }

  function isOpen() {
    return panel && panel.classList.contains("open");
  }

  function init(user) {
    if (user) currentUser = user;
    if (!currentUser && typeof MindCareAuth !== "undefined") {
      currentUser = MindCareAuth.getCurrentUser();
    }

    if (isMounted || document.getElementById("mc-chat-fab")) {
      messages = loadMessages();
      renderMessages();
      return;
    }

    const wrap = document.createElement("div");
    wrap.id = "mc-global-chat-root";
    wrap.innerHTML = `
      <!-- Floating Action Button -->
      <button class="chat-fab" id="mc-chat-fab" aria-label="Open MindCare AI Assistant" aria-expanded="false" title="Chat with AI">
        ${CHAT_ICONS.chat}
      </button>

      <!-- Main Assistant Panel -->
      <div class="chat-panel" id="mc-chat-panel" role="dialog" aria-modal="true" aria-label="MindCare AI Assistant">
        
        <!-- Header -->
        <header class="chat-header">
          <div class="chat-header-brand">
            <div class="chat-avatar-badge" aria-hidden="true">
              ${CHAT_ICONS.spark}
            </div>
            <div class="chat-header-titles">
              <h3 class="chat-title">MindCare AI Assistant</h3>
              <div class="chat-status">
                <span class="chat-status-dot" aria-hidden="true"></span>
                <span>Online · Supportive AI</span>
              </div>
            </div>
          </div>
          
          <div class="chat-header-actions">
            <!-- Voice Interaction Mode -->
            <button type="button" class="chat-icon-btn" id="mc-chat-voice-btn" title="Voice Mode" aria-label="Voice Mode">
              ${CHAT_ICONS.mic}
            </button>
            
            <!-- Clear Conversation -->
            <button type="button" class="chat-icon-btn" id="mc-chat-clear" title="Clear conversation" aria-label="Clear conversation">
              ${CHAT_ICONS.trash}
            </button>
            
            <!-- Close Assistant -->
            <button type="button" class="chat-icon-btn chat-close-btn" id="mc-chat-close" title="Close chat" aria-label="Close chat">
              ${CHAT_ICONS.close}
            </button>
          </div>
        </header>

        <!-- Scrollable Messages Stream -->
        <main class="chat-body" id="mc-chat-body">
          <div class="chat-flow" id="mc-chat-flow"></div>
          <div class="chat-suggestions-area" id="mc-chat-suggestions"></div>
        </main>

        <!-- Clean, Single-Row Modern Composer -->
        <footer class="chat-composer-wrap">
          <div class="chat-composer-box" id="mc-composer-box">
            <textarea id="mc-chat-input" rows="1" placeholder="Ask about stress, sleep, focus, or study balance..." aria-label="Type your message"></textarea>
            
            <div class="chat-composer-actions">
              <!-- Speech Dictation -->
              <button type="button" class="chat-composer-action-btn chat-mic-btn" id="mc-chat-mic" title="Voice dictation" aria-label="Voice dictation">
                ${CHAT_ICONS.mic}
              </button>
              
              <!-- Send Message -->
              <button type="button" class="chat-composer-action-btn chat-send-btn" id="mc-chat-send" title="Send message" aria-label="Send message" disabled>
                ${CHAT_ICONS.send}
              </button>
            </div>
          </div>
        </footer>

        <!-- Voice Mode Overlay Interface -->
        <div class="chat-voice-overlay" id="mc-voice-overlay" style="display:none;" aria-hidden="true">
          <div class="voice-overlay-card">
            <div class="voice-card-header">
              <span class="voice-card-title">Voice Interaction</span>
              <button type="button" class="chat-icon-btn" id="mc-voice-overlay-close" title="Close Voice Mode" aria-label="Close Voice Mode">
                ${CHAT_ICONS.close}
              </button>
            </div>

            <div class="voice-visual-zone" id="mc-voice-visual-zone"></div>
            <div class="voice-transcript-preview" id="mc-voice-transcript-preview">"I'm listening..."</div>
            <div class="voice-card-actions" id="mc-voice-card-actions"></div>

            <div class="voice-preference-row">
              <label class="voice-pref-toggle">
                <input type="checkbox" id="mc-voice-auto-speak-toggle" />
                <span>🔊 Voice responses (read replies aloud)</span>
              </label>
            </div>
          </div>
        </div>

        <!-- In-App Clear Chat Confirmation Modal -->
        <div class="chat-confirm-overlay" id="mc-chat-confirm-overlay" style="display:none;" aria-hidden="true">
          <div class="chat-confirm-modal">
            <div class="confirm-icon-wrap" aria-hidden="true">
              ${CHAT_ICONS.trash}
            </div>
            <h4>Clear conversation?</h4>
            <p>This will erase your chat history for this session. You can start fresh anytime.</p>
            <div class="confirm-modal-buttons">
              <button type="button" class="btn btn-ghost btn-sm" id="mc-confirm-cancel">Cancel</button>
              <button type="button" class="btn btn-danger btn-sm" id="mc-confirm-clear">Clear Chat</button>
            </div>
          </div>
        </div>

      </div>
    `;
    document.body.appendChild(wrap);
    isMounted = true;

    // Cache elements
    fab = document.getElementById("mc-chat-fab");
    panel = document.getElementById("mc-chat-panel");
    body = document.getElementById("mc-chat-body");
    flow = document.getElementById("mc-chat-flow");
    suggestionsWrap = document.getElementById("mc-chat-suggestions");
    textarea = document.getElementById("mc-chat-input");
    sendBtn = document.getElementById("mc-chat-send");
    micBtn = document.getElementById("mc-chat-mic");
    voiceHeaderBtn = document.getElementById("mc-chat-voice-btn");
    clearBtn = document.getElementById("mc-chat-clear");
    closeBtn = document.getElementById("mc-chat-close");

    // Voice Overlay Elements
    voiceOverlay = document.getElementById("mc-voice-overlay");
    voiceVisualZone = document.getElementById("mc-voice-visual-zone");
    voiceTranscriptPreview = document.getElementById("mc-voice-transcript-preview");
    voiceCardActions = document.getElementById("mc-voice-card-actions");
    voiceAutoSpeakToggle = document.getElementById("mc-voice-auto-speak-toggle");
    voiceOverlayCloseBtn = document.getElementById("mc-voice-overlay-close");

    // Clear Confirm Elements
    confirmOverlay = document.getElementById("mc-chat-confirm-overlay");
    confirmCancelBtn = document.getElementById("mc-confirm-cancel");
    confirmClearBtn = document.getElementById("mc-confirm-clear");

    messages = loadMessages();

    // Event Bindings
    fab.addEventListener("click", (e) => {
      e.preventDefault();
      toggle();
    });

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });

    voiceHeaderBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openVoiceOverlay();
    });

    if (voiceOverlayCloseBtn) {
      voiceOverlayCloseBtn.addEventListener("click", (e) => {
        e.preventDefault();
        closeVoiceOverlay();
      });
    }

    if (voiceAutoSpeakToggle) {
      voiceAutoSpeakToggle.addEventListener("change", () => {
        voiceAutoSpeak = voiceAutoSpeakToggle.checked;
        try {
          localStorage.setItem("mindcare_voice_auto_speak", voiceAutoSpeak ? "true" : "false");
        } catch {}
      });
    }

    clearBtn.addEventListener("click", (e) => {
      e.preventDefault();
      openClearConfirm();
    });

    if (confirmCancelBtn) {
      confirmCancelBtn.addEventListener("click", closeClearConfirm);
    }

    if (confirmClearBtn) {
      confirmClearBtn.addEventListener("click", executeClearChat);
    }

    micBtn.addEventListener("click", (e) => {
      e.preventDefault();
      toggleListening();
    });

    sendBtn.addEventListener("click", (e) => {
      e.preventDefault();
      sendMessage();
    });

    textarea.addEventListener("input", () => {
      adjustTextareaHeight();
      updateSendButtonState();
    });

    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    renderMessages();
    updateSendButtonState();
  }

  // Delegated global trigger listener
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('[data-action="openChat"], #mc-mobile-chat, #mc-talk-to-ai, #mc-hero-chat-btn');
    if (trigger) {
      e.preventDefault();
      open();
    }
  });

  // Browser back button / hardware back navigation
  window.addEventListener("popstate", (e) => {
    if (isOpen() && (!e.state || !e.state.mcChatOpen)) {
      close(true);
    }
  });

  // Escape key closes modals or panel
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape") {
      if (confirmOverlay && confirmOverlay.style.display !== "none") {
        closeClearConfirm();
        return;
      }
      if (voiceOverlay && voiceOverlay.style.display !== "none") {
        closeVoiceOverlay();
        return;
      }
      if (isOpen()) {
        close();
      }
    }
  });

  // Responsive visualViewport resize listener for virtual keyboard on mobile
  if (typeof window !== "undefined" && window.visualViewport) {
    const handleViewport = () => {
      if (panel && panel.classList.contains("open") && window.matchMedia("(max-width: 768px)").matches) {
        panel.style.height = `${window.visualViewport.height}px`;
        panel.style.top = `${window.visualViewport.offsetTop}px`;
        if (body) body.scrollTop = body.scrollHeight;
      } else if (panel) {
        panel.style.height = "";
        panel.style.top = "";
      }
    };
    window.visualViewport.addEventListener("resize", handleViewport);
    window.visualViewport.addEventListener("scroll", handleViewport);
  }

  return {
    init,
    open,
    close,
    toggle,
    isOpen,
    sendMessage,
    startListening,
    stopListening,
    speakText,
    stopSpeaking,
    openVoiceOverlay,
    closeVoiceOverlay,
  };
})();

if (typeof window !== "undefined") {
  window.MindCareChat = MindCareChat;
  window.mcInitChatbot = (user) => MindCareChat.init(user);
  window.mcOpenChat = () => MindCareChat.open();
  window.mcCloseChat = () => MindCareChat.close();
  window.mcToggleChat = () => MindCareChat.toggle();

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
      MindCareChat.init();
    });
  } else {
    MindCareChat.init();
  }
}
