/**
 * chatbot.js — MindCare AI Assistant (Single Source of Truth)
 * Centralized singleton module: MindCareChat
 * - Talks to the backend's /chat endpoint with multi-turn conversation history.
 * - Dynamic, context-aware responses with zero canned generic answers.
 * - Complete Voice Mode: Speech-to-Text (STT) + Text-to-Speech (TTS).
 * - Full-screen mobile layout & desktop floating panel.
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
  trash: `<svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polyline points="3 6 5 6 21 6"/><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"/></svg>`,
  close: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/></svg>`,
  send: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><line x1="22" y1="2" x2="11" y2="13"/><polygon points="22 2 15 22 11 13 2 9 22 2"/></svg>`,
  mic: `<svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 2a3 3 0 0 0-3 3v7a3 3 0 0 0 6 0V5a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
  speaker: `<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="11 5 6 9 2 9 2 15 6 15 11 19 11 5"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/><path d="M19.07 4.93a10 10 0 0 1 0 14.14"/></svg>`,
  stop: `<svg viewBox="0 0 24 24" width="14" height="14" fill="currentColor"><rect x="6" y="6" width="12" height="12" rx="2"/></svg>`,
  voiceMode: `<svg viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 1a3 3 0 0 0-3 3v8a3 3 0 0 0 6 0V4a3 3 0 0 0-3-3z"/><path d="M19 10v2a7 7 0 0 1-14 0v-2"/><line x1="12" y1="19" x2="12" y2="23"/><line x1="8" y1="23" x2="16" y2="23"/></svg>`,
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
  let voiceToggleBtn = null;
  let clearBtn = null;
  let closeBtn = null;
  let backBtn = null;
  let messages = [];
  let historyPushed = false;
  let savedScrollY = 0;

  // Voice Mode State
  let voiceModeActive = false;
  try {
    voiceModeActive = localStorage.getItem("mindcare_voice_active") === "true";
  } catch {}
  let isListening = false;
  let recognition = null;
  let currentlySpeakingIdx = null;

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

  function showVoiceToast(msg) {
    let toast = document.getElementById("mc-chat-voice-toast");
    if (!toast && panel) {
      toast = document.createElement("div");
      toast.id = "mc-chat-voice-toast";
      toast.className = "chat-voice-toast";
      panel.appendChild(toast);
    }
    if (toast) {
      toast.textContent = msg;
      toast.classList.add("show");
      clearTimeout(toast._timeout);
      toast._timeout = setTimeout(() => {
        toast.classList.remove("show");
      }, 4000);
    }
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
          micBtn.setAttribute("aria-label", "Listening… tap to finish");
          micBtn.title = "Listening… tap to finish";
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
        if (textarea) {
          textarea.value = final || interim;
          adjustTextareaHeight();
        }
      };

      rec.onerror = (event) => {
        console.warn("SpeechRecognition error:", event.error);
        stopListening();
        if (event.error === "not-allowed" || event.error === "service-not-allowed") {
          showVoiceToast("Microphone access was denied. Please allow microphone permissions in your browser.");
        } else if (event.error !== "no-speech") {
          showVoiceToast(`Speech recognition notice: ${event.error}`);
        }
      };

      rec.onend = () => {
        const wasListening = isListening;
        isListening = false;
        if (micBtn) {
          micBtn.classList.remove("listening");
          micBtn.setAttribute("aria-label", "Voice input");
          micBtn.title = "Speak into microphone";
        }
        // If Voice Mode is ON and user spoke a message, auto-send
        if (wasListening && voiceModeActive && textarea && textarea.value.trim()) {
          sendMessage();
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
      showVoiceToast("Voice recognition is not supported in this browser. Please try Chrome, Edge, or Safari.");
      return;
    }
    if (!recognition) {
      recognition = initSpeechRecognition();
    }
    if (!recognition) {
      showVoiceToast("Unable to initialize microphone input.");
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
      micBtn.setAttribute("aria-label", "Voice input");
      micBtn.title = "Speak into microphone";
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
  }

  function speakText(rawText, messageIdx) {
    if (typeof window === "undefined" || !("speechSynthesis" in window)) {
      showVoiceToast("Voice playback is not supported on this device/browser.");
      return;
    }

    // Toggle off if already speaking this exact message
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
      };

      utterance.onend = () => {
        currentlySpeakingIdx = null;
        updateSpeakButtonsUI();
      };

      utterance.onerror = (e) => {
        if (e.error !== "canceled" && e.error !== "interrupted") {
          console.warn("SpeechSynthesis error:", e);
        }
        currentlySpeakingIdx = null;
        updateSpeakButtonsUI();
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
    flow.querySelectorAll(".chat-speak-btn").forEach((btn) => {
      const idx = parseInt(btn.dataset.idx, 10);
      const isSpeakingThis = currentlySpeakingIdx === idx;
      if (isSpeakingThis) {
        btn.classList.add("speaking");
        btn.setAttribute("title", "Stop listening");
        btn.setAttribute("aria-label", "Stop listening");
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
     Voice Mode Toggle (Header Button)
     -------------------------------------------------------------------------- */
  function setVoiceMode(enabled) {
    voiceModeActive = !!enabled;
    try {
      localStorage.setItem("mindcare_voice_active", voiceModeActive ? "true" : "false");
    } catch {}
    if (!voiceModeActive) {
      stopSpeaking();
      stopListening();
    }
    updateVoiceToggleUI();
  }

  function toggleVoiceMode() {
    setVoiceMode(!voiceModeActive);
  }

  function updateVoiceToggleUI() {
    if (!voiceToggleBtn) return;
    if (voiceModeActive) {
      voiceToggleBtn.classList.add("active");
      voiceToggleBtn.setAttribute("aria-pressed", "true");
      voiceToggleBtn.setAttribute("title", "Voice Mode ON — Speech input & automatic voice replies enabled (Tap to turn OFF)");
      voiceToggleBtn.innerHTML = `
        <span class="voice-wave-anim"><span></span><span></span><span></span></span>
        <span class="voice-badge-text">Voice ON</span>
      `;
    } else {
      voiceToggleBtn.classList.remove("active");
      voiceToggleBtn.setAttribute("aria-pressed", "false");
      voiceToggleBtn.setAttribute("title", "Voice Mode OFF — Tap to turn ON for real-time speech conversation");
      voiceToggleBtn.innerHTML = `
        ${CHAT_ICONS.voiceMode}
        <span class="voice-badge-text">Voice OFF</span>
      `;
    }
  }

  /* --------------------------------------------------------------------------
     UI Rendering
     -------------------------------------------------------------------------- */
  function renderSuggestions() {
    if (!suggestionsWrap) return;
    if (messages.length > 0) {
      suggestionsWrap.style.display = "none";
      suggestionsWrap.classList.add("is-hidden");
      suggestionsWrap.innerHTML = "";
      return;
    }
    suggestionsWrap.style.display = "flex";
    suggestionsWrap.classList.remove("is-hidden");
    suggestionsWrap.innerHTML = SUGGESTED_PROMPTS.map(
      (p) => `<button type="button" data-prompt="${mcSafeEscape(p)}">${mcSafeEscape(p)}</button>`
    ).join("");
    suggestionsWrap.querySelectorAll("button").forEach((btn) => {
      btn.addEventListener("click", () => {
        if (!textarea) return;
        textarea.value = btn.dataset.prompt;
        adjustTextareaHeight();
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
        <div class="chat-avatar-sm">${CHAT_ICONS.spark}</div>
        <div class="chat-bubble-wrap">
          <div class="chat-bubble bot">
            <p><strong>Hi ${mcSafeEscape(userName)}! 👋</strong></p>
            <p>I'm your MindCare AI wellness companion. I can help with study stress, relaxation routines, sleep habits, and digital wellbeing.</p>
            <p style="font-size:0.8rem; color:var(--ink-faint); margin-top:6px;"><em>Note: I provide educational, non-diagnostic support and do not replace a licensed mental health professional.</em></p>
          </div>
          <div class="chat-meta-row">
            <span class="chat-time">${mcFormatTime()}</span>
            <button type="button" class="chat-speak-btn" data-idx="welcome" title="Listen to welcome message" aria-label="Listen to welcome message">
              ${CHAT_ICONS.speaker}<span>Listen</span>
            </button>
          </div>
        </div>
      `;
      flow.appendChild(welcomeWrap);
      const welcomeBtn = welcomeWrap.querySelector(".chat-speak-btn");
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
          ? `<div class="chat-avatar-sm user-av">${mcSafeEscape(userInitial)}</div>`
          : `<div class="chat-avatar-sm">${CHAT_ICONS.spark}</div>`;

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
              <button type="button" class="chat-speak-btn ${isSpeakingThis ? 'speaking' : ''}" data-idx="${idx}" title="${isSpeakingThis ? 'Stop listening' : 'Listen to message'}" aria-label="${isSpeakingThis ? 'Stop listening' : 'Listen to message'}">
                ${isSpeakingThis ? CHAT_ICONS.stop : CHAT_ICONS.speaker}
                <span>${isSpeakingThis ? 'Stop' : 'Listen'}</span>
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

        const speakBtn = row.querySelector(".chat-speak-btn");
        if (speakBtn) {
          speakBtn.addEventListener("click", () => {
            speakText(m.text, idx);
          });
        }
      });
    }
    if (body) body.scrollTop = body.scrollHeight;
    renderSuggestions();
  }

  function showTyping() {
    if (!flow) return;
    hideTyping();
    const el = document.createElement("div");
    el.className = "chat-msg-row bot";
    el.id = "mc-typing-row";
    el.innerHTML = `
      <div class="chat-avatar-sm">${CHAT_ICONS.spark}</div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
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

  async function sendMessage() {
    if (!textarea) return;
    const text = textarea.value.trim();
    if (!text) return;

    // Stop listening when message is sent
    stopListening();

    const now = new Date().toISOString();
    messages.push({ role: "user", text, timestamp: now });
    saveMessages(messages);
    renderMessages();

    textarea.value = "";
    textarea.style.height = "44px";
    textarea.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
    if (micBtn) micBtn.disabled = true;
    showTyping();

    const history = messages.slice(0, -1)
      .filter((m) => m.role === "user" || m.role === "bot")
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        content: m.text,
      }));

    try {
      const context = mcBuildChatContext(currentUser);
      const result = await MindCareAPI.chat(text, history, context);
      hideTyping();
      messages.push({
        role: "bot",
        text: result.response,
        timestamp: new Date().toISOString(),
      });
      saveMessages(messages);
      renderMessages();

      // If Voice Mode is active, read the new response aloud automatically!
      if (voiceModeActive) {
        speakText(result.response, messages.length - 1);
      }
    } catch (err) {
      hideTyping();
      messages.push({
        role: "error",
        text: err.friendlyMessage || "I'm temporarily unable to respond. Please check your connection and try again.",
        timestamp: new Date().toISOString(),
      });
      saveMessages(messages);
      renderMessages();
    }

    textarea.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    if (micBtn) micBtn.disabled = false;
    textarea.focus();
  }

  function lockScroll() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    if (isMobile) {
      savedScrollY = window.scrollY || document.documentElement.scrollTop || 0;
      document.body.style.top = `-${savedScrollY}px`;
      document.body.style.position = "fixed";
      document.body.style.width = "100%";
      document.body.style.overflow = "hidden";
    }
    document.body.classList.add("chat-open");
  }

  function unlockScroll() {
    const isMobile = window.matchMedia("(max-width: 768px)").matches;
    document.body.classList.remove("chat-open");
    if (isMobile) {
      document.body.style.position = "";
      document.body.style.top = "";
      document.body.style.width = "";
      document.body.style.overflow = "";
      window.scrollTo(0, savedScrollY);
    }
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
    updateVoiceToggleUI();
    setTimeout(() => {
      textarea?.focus();
      if (body) body.scrollTop = body.scrollHeight;
    }, 150);
  }

  function close(fromPopState = false) {
    if (!panel) return;
    if (!panel.classList.contains("open")) return;

    // Stop all speech playback and speech recognition on close
    stopSpeaking();
    stopListening();

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
      updateVoiceToggleUI();
      return;
    }

    const wrap = document.createElement("div");
    wrap.id = "mc-global-chat-root";
    wrap.innerHTML = `
      <button class="chat-fab" id="mc-chat-fab" aria-label="Open MindCare AI Assistant" aria-expanded="false" title="Chat with AI">
        ${CHAT_ICONS.chat}
      </button>
      <div class="chat-panel" id="mc-chat-panel" role="dialog" aria-modal="true" aria-label="MindCare AI Chat">
        <div class="chat-header">
          <div class="chat-header-main">
            <button type="button" class="chat-back-btn" id="mc-chat-back" title="Back to page" aria-label="Back to page">
              <svg viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span>Back</span>
            </button>
            <div class="avatar-dot">${CHAT_ICONS.spark}</div>
            <div class="chat-header-info">
              <h4>MindCare AI Assistant</h4>
              <div class="status"><span class="status-indicator"></span>Online · Supportive AI</div>
            </div>
          </div>
          <div class="chat-header-actions">
            <button type="button" class="chat-voice-toggle-btn" id="mc-chat-voice-toggle" title="Toggle Voice Mode" aria-label="Toggle Voice Mode" aria-pressed="false">
              ${CHAT_ICONS.voiceMode}
              <span class="voice-badge-text">Voice OFF</span>
            </button>
            <button type="button" id="mc-chat-clear" title="Clear conversation" aria-label="Clear conversation">${CHAT_ICONS.trash}</button>
            <button type="button" class="chat-close-desktop-btn" id="mc-chat-close" title="Close chat" aria-label="Close chat">${CHAT_ICONS.close}</button>
          </div>
        </div>
        <div class="chat-body" id="mc-chat-body">
          <div class="chat-flow" id="mc-chat-flow"></div>
          <div class="chat-suggestions" id="mc-chat-suggestions"></div>
        </div>
        <div class="chat-input-row">
          <textarea id="mc-chat-input" placeholder="Ask about stress, sleep, focus, or study balance… (Enter to send)" rows="1"></textarea>
          <button type="button" class="chat-mic-btn" id="mc-chat-mic" title="Speak into microphone" aria-label="Voice input">
            ${CHAT_ICONS.mic}
          </button>
          <button class="chat-send-btn" id="mc-chat-send" title="Send message" aria-label="Send">${CHAT_ICONS.send}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    isMounted = true;

    fab = document.getElementById("mc-chat-fab");
    panel = document.getElementById("mc-chat-panel");
    body = document.getElementById("mc-chat-body");
    flow = document.getElementById("mc-chat-flow");
    suggestionsWrap = document.getElementById("mc-chat-suggestions");
    textarea = document.getElementById("mc-chat-input");
    sendBtn = document.getElementById("mc-chat-send");
    micBtn = document.getElementById("mc-chat-mic");
    voiceToggleBtn = document.getElementById("mc-chat-voice-toggle");
    clearBtn = document.getElementById("mc-chat-clear");
    closeBtn = document.getElementById("mc-chat-close");
    backBtn = document.getElementById("mc-chat-back");

    messages = loadMessages();

    fab.addEventListener("click", (e) => {
      e.preventDefault();
      toggle();
    });

    closeBtn.addEventListener("click", (e) => {
      e.preventDefault();
      close();
    });

    if (backBtn) {
      backBtn.addEventListener("click", (e) => {
        e.preventDefault();
        close();
      });
    }

    if (voiceToggleBtn) {
      voiceToggleBtn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleVoiceMode();
      });
    }

    if (micBtn) {
      micBtn.addEventListener("click", (e) => {
        e.preventDefault();
        toggleListening();
      });
    }

    clearBtn.addEventListener("click", () => {
      if (confirm("Clear this conversation history?")) {
        stopSpeaking();
        stopListening();
        messages = [];
        saveMessages(messages);
        renderMessages();
      }
    });

    sendBtn.addEventListener("click", sendMessage);
    textarea.addEventListener("input", adjustTextareaHeight);
    textarea.addEventListener("keydown", (e) => {
      if (e.key === "Enter" && !e.shiftKey) {
        e.preventDefault();
        sendMessage();
      }
    });

    renderMessages();
    updateVoiceToggleUI();
  }

  // Delegated global trigger listener: any chat trigger opens this exact chatbot
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('[data-action="openChat"], #mc-mobile-chat, #mc-talk-to-ai, #mc-hero-chat-btn');
    if (trigger) {
      e.preventDefault();
      open();
    }
  });

  // Browser back button / hardware back navigation
  window.addEventListener("popstate", () => {
    if (isOpen()) {
      close(true);
    }
  });

  // Escape key closes modal
  document.addEventListener("keydown", (e) => {
    if (e.key === "Escape" && isOpen()) {
      close();
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
    setVoiceMode,
    toggleVoiceMode,
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
