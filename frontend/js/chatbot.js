/**
 * chatbot.js — MindCare AI Assistant (Single Source of Truth)
 * Centralized singleton module: MindCareChat
 * Talks only to the backend's /chat endpoint with multi-turn conversation history.
 */

const SUGGESTED_PROMPTS = [
  "How can I reduce stress?",
  "How can I improve my sleep?",
  "I feel overwhelmed with my studies.",
  "How can I manage screen time?",
];

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
  let suggestionsWrap = null;
  let textarea = null;
  let sendBtn = null;
  let clearBtn = null;
  let closeBtn = null;
  let backBtn = null;
  let messages = [];

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

  function renderSuggestions() {
    if (!suggestionsWrap) return;
    if (messages.length > 0) {
      suggestionsWrap.style.display = "none";
      return;
    }
    suggestionsWrap.style.display = "flex";
    suggestionsWrap.innerHTML = SUGGESTED_PROMPTS.map(
      (p) => `<button type="button" data-prompt="${mcEscape(p)}">${mcEscape(p)}</button>`
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
    if (!body) return;
    body.innerHTML = "";
    if (messages.length === 0) {
      const welcomeWrap = document.createElement("div");
      welcomeWrap.className = "chat-msg-row bot";
      welcomeWrap.innerHTML = `
        <div class="chat-avatar-sm">${MC_ICONS.spark}</div>
        <div class="chat-bubble-wrap">
          <div class="chat-bubble bot">
            <p><strong>Hi ${mcEscape((currentUser?.name || "").split(" ")[0] || "there")}! 👋</strong></p>
            <p>I'm your MindCare AI wellness companion. I can help with study stress, relaxation routines, sleep habits, and digital wellbeing.</p>
            <p style="font-size:0.8rem; color:var(--ink-faint); margin-top:6px;"><em>Note: I provide educational, non-diagnostic support and do not replace a licensed mental health professional.</em></p>
          </div>
          <div class="chat-time">${mcFormatTime()}</div>
        </div>
      `;
      body.appendChild(welcomeWrap);
    } else {
      messages.forEach((m) => {
        const row = document.createElement("div");
        row.className = `chat-msg-row ${m.role === "user" ? "user" : "bot"}`;

        const isUser = m.role === "user";
        const isError = m.role === "error";

        const avatarHtml = isUser
          ? `<div class="chat-avatar-sm user-av">${typeof MindCareAuth !== "undefined" ? MindCareAuth.initials(currentUser?.name || "You") : "U"}</div>`
          : `<div class="chat-avatar-sm">${MC_ICONS.spark}</div>`;

        const bubbleContent = isUser
          ? `<div class="chat-bubble user"><p>${mcEscape(m.text)}</p></div>`
          : isError
          ? `<div class="chat-bubble error"><p>${mcEscape(m.text)}</p></div>`
          : `<div class="chat-bubble bot">${mcFormatMarkdown(m.text)}</div>`;

        row.innerHTML = `
          ${avatarHtml}
          <div class="chat-bubble-wrap">
            ${bubbleContent}
            <div class="chat-time">${mcFormatTime(m.timestamp)}</div>
          </div>
        `;
        body.appendChild(row);
      });
    }
    body.scrollTop = body.scrollHeight;
    renderSuggestions();
  }

  function showTyping() {
    if (!body) return;
    const el = document.createElement("div");
    el.className = "chat-msg-row bot";
    el.id = "mc-typing-row";
    el.innerHTML = `
      <div class="chat-avatar-sm">${MC_ICONS.spark}</div>
      <div class="typing-indicator">
        <span></span><span></span><span></span>
      </div>
    `;
    body.appendChild(el);
    body.scrollTop = body.scrollHeight;
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

    const now = new Date().toISOString();
    messages.push({ role: "user", text, timestamp: now });
    saveMessages(messages);
    renderMessages();

    textarea.value = "";
    textarea.style.height = "42px";
    textarea.disabled = true;
    if (sendBtn) sendBtn.disabled = true;
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
    } catch (err) {
      hideTyping();
      messages.push({
        role: "error",
        text: err.friendlyMessage || "I'm temporarily unable to respond. Please check your connection and try again.",
        timestamp: new Date().toISOString(),
      });
    }

    saveMessages(messages);
    renderMessages();
    textarea.disabled = false;
    if (sendBtn) sendBtn.disabled = false;
    textarea.focus();
  }

  function open() {
    if (!isMounted || !panel) {
      init();
    }
    if (!panel) return;
    panel.classList.add("open");
    document.body.classList.add("chat-open");
    if (fab) fab.setAttribute("aria-expanded", "true");
    renderMessages();
    setTimeout(() => {
      textarea?.focus();
    }, 100);
  }

  function close() {
    if (!panel) return;
    panel.classList.remove("open");
    document.body.classList.remove("chat-open");
    if (fab) fab.setAttribute("aria-expanded", "false");
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
      <button class="chat-fab" id="mc-chat-fab" aria-label="Open MindCare AI Assistant" aria-expanded="false" title="Chat with AI">
        ${MC_ICONS.chat}
      </button>
      <div class="chat-panel" id="mc-chat-panel" role="dialog" aria-label="MindCare AI Chat">
        <div class="chat-header">
          <div class="id">
            <button type="button" class="chat-back-btn" id="mc-chat-back" title="Back to page" aria-label="Back to page">
              <svg viewBox="0 0 24 24" width="18" height="18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M19 12H5M12 19l-7-7 7-7"/></svg>
              <span>Back</span>
            </button>
            <div class="avatar-dot">${MC_ICONS.spark}</div>
            <div>
              <h4>MindCare AI Assistant</h4>
              <div class="status">Online · Supportive AI</div>
            </div>
          </div>
          <div class="chat-header-actions">
            <button type="button" id="mc-chat-clear" title="Clear conversation" aria-label="Clear conversation">${MC_ICONS.trash}</button>
            <button type="button" id="mc-chat-close" title="Close chat" aria-label="Close chat">${MC_ICONS.close}</button>
          </div>
        </div>
        <div class="chat-body" id="mc-chat-body"></div>
        <div class="chat-suggestions" id="mc-chat-suggestions"></div>
        <div class="chat-input-row">
          <textarea id="mc-chat-input" placeholder="Ask about stress, sleep, focus, or study balance… (Enter to send)" rows="1"></textarea>
          <button class="chat-send-btn" id="mc-chat-send" title="Send message" aria-label="Send">${MC_ICONS.send}</button>
        </div>
      </div>
    `;
    document.body.appendChild(wrap);
    isMounted = true;

    fab = document.getElementById("mc-chat-fab");
    panel = document.getElementById("mc-chat-panel");
    body = document.getElementById("mc-chat-body");
    suggestionsWrap = document.getElementById("mc-chat-suggestions");
    textarea = document.getElementById("mc-chat-input");
    sendBtn = document.getElementById("mc-chat-send");
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

    clearBtn.addEventListener("click", () => {
      if (confirm("Clear this conversation history?")) {
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
  }

  // Delegated global trigger listener: any chat trigger opens this exact chatbot
  document.addEventListener("click", (e) => {
    const trigger = e.target.closest('[data-action="openChat"], #mc-mobile-chat, #mc-talk-to-ai, #mc-hero-chat-btn');
    if (trigger) {
      e.preventDefault();
      open();
    }
  });

  return { init, open, close, toggle, isOpen };
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

