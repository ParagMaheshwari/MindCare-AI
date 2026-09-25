/**
 * chatbot.js — floating "MindCare AI Assistant" widget.
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
  const latest = MindCareResults.getLatest(user.email);
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

function mcInitChatbot(user) {
  if (document.getElementById("mc-chat-fab")) return;

  const wrap = document.createElement("div");
  wrap.innerHTML = `
    <button class="chat-fab" id="mc-chat-fab" aria-label="Open MindCare AI Assistant">
      ${MC_ICONS.chat}
    </button>
    <div class="chat-panel" id="mc-chat-panel" role="dialog" aria-label="MindCare AI Chat">
      <div class="chat-header">
        <div class="id">
          <div class="avatar-dot">${MC_ICONS.spark}</div>
          <div>
            <h4>MindCare AI Assistant</h4>
            <div class="status">Online · Supportive AI</div>
          </div>
        </div>
        <div class="chat-header-actions">
          <button id="mc-chat-clear" title="Clear conversation">${MC_ICONS.trash}</button>
          <button id="mc-chat-close" title="Close">${MC_ICONS.close}</button>
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

  const fab = document.getElementById("mc-chat-fab");
  const panel = document.getElementById("mc-chat-panel");
  const body = document.getElementById("mc-chat-body");
  const suggestionsWrap = document.getElementById("mc-chat-suggestions");
  const textarea = document.getElementById("mc-chat-input");
  const sendBtn = document.getElementById("mc-chat-send");
  const clearBtn = document.getElementById("mc-chat-clear");
  const closeBtn = document.getElementById("mc-chat-close");

  const emailKey = user && user.email ? user.email : "guest";
  const STORAGE_KEY = `mindcare_chat_${emailKey}`;

  function loadMessages() {
    try {
      return JSON.parse(sessionStorage.getItem(STORAGE_KEY)) || [];
    } catch {
      return [];
    }
  }

  function saveMessages(messages) {
    try {
      sessionStorage.setItem(STORAGE_KEY, JSON.stringify(messages));
    } catch {
      // Storage full or unavailable
    }
  }

  let messages = loadMessages();

  function renderSuggestions() {
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
        textarea.value = btn.dataset.prompt;
        adjustTextareaHeight();
        sendMessage();
      });
    });
  }

  function renderMessages() {
    body.innerHTML = "";
    if (messages.length === 0) {
      const welcomeWrap = document.createElement("div");
      welcomeWrap.className = "chat-msg-row bot";
      welcomeWrap.innerHTML = `
        <div class="chat-avatar-sm">${MC_ICONS.spark}</div>
        <div class="chat-bubble-wrap">
          <div class="chat-bubble bot">
            <p><strong>Hi ${mcEscape((user?.name || "").split(" ")[0] || "there")}! 👋</strong></p>
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
          ? `<div class="chat-avatar-sm user-av">${MindCareAuth.initials(user?.name || "You")}</div>`
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
    textarea.style.height = "auto";
    textarea.style.height = Math.min(120, textarea.scrollHeight) + "px";
  }

  async function sendMessage() {
    const text = textarea.value.trim();
    if (!text) return;

    // Add user message with timestamp
    const now = new Date().toISOString();
    messages.push({ role: "user", text, timestamp: now });
    saveMessages(messages);
    renderMessages();

    textarea.value = "";
    textarea.style.height = "42px";
    textarea.disabled = true;
    sendBtn.disabled = true;
    showTyping();

    // Prepare multi-turn history for backend
    // Exclude error messages and the message just added
    const history = messages.slice(0, -1)
      .filter((m) => m.role === "user" || m.role === "bot")
      .map((m) => ({
        role: m.role === "user" ? "user" : "model",
        content: m.text,
      }));

    try {
      const context = mcBuildChatContext(user);
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
    sendBtn.disabled = false;
    textarea.focus();
  }

  fab.addEventListener("click", () => {
    panel.classList.toggle("open");
    if (panel.classList.contains("open")) {
      renderMessages();
      textarea.focus();
    }
  });

  closeBtn.addEventListener("click", () => panel.classList.remove("open"));

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
