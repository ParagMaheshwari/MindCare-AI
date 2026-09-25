/**
 * journal-page.js — Private Journal management & Gemini AI reflection.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  mcInitChatbot(user);

  let activeEntryId = null;
  const titleInput = document.getElementById("mc-journal-title");
  const contentInput = document.getElementById("mc-journal-content");
  const timestampEl = document.getElementById("mc-entry-timestamp");
  const saveBtn = document.getElementById("mc-save-entry-btn");
  const deleteBtn = document.getElementById("mc-delete-entry-btn");
  const newBtn = document.getElementById("mc-new-entry-btn");
  const reflectBtn = document.getElementById("mc-ai-reflect-btn");
  const searchInput = document.getElementById("mc-journal-search");
  const listEl = document.getElementById("mc-journal-list");

  // AI Reflection Elements
  const reflectionBox = document.getElementById("mc-ai-reflection-box");
  const reflectEmotion = document.getElementById("mc-reflect-emotion");
  const reflectObs = document.getElementById("mc-reflect-obs");
  const reflectCoping = document.getElementById("mc-reflect-coping");
  const reflectSteps = document.getElementById("mc-reflect-steps");

  function resetEditor() {
    activeEntryId = null;
    titleInput.value = "";
    contentInput.value = "";
    timestampEl.textContent = "New Entry";
    deleteBtn.style.display = "none";
    reflectionBox.style.display = "none";
    renderEntries();
  }

  function loadEntry(id) {
    const entry = MindCareStore.getJournalEntryById(user.email, id);
    if (!entry) return;

    activeEntryId = entry.id;
    titleInput.value = entry.title || "";
    contentInput.value = entry.content || "";
    timestampEl.textContent = `Saved on ${new Date(entry.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
    deleteBtn.style.display = "inline-flex";

    if (entry.aiReflection) {
      renderReflection(entry.aiReflection);
    } else {
      reflectionBox.style.display = "none";
    }

    renderEntries();
  }

  function renderReflection(ref) {
    if (!ref) {
      reflectionBox.style.display = "none";
      return;
    }
    reflectEmotion.textContent = ref.emotional_reflection || "—";
    reflectObs.textContent = ref.observations || "—";
    reflectCoping.innerHTML = (ref.coping_suggestions || []).map((s) => `<li>${mcEscape(s)}</li>`).join("");
    reflectSteps.innerHTML = (ref.next_steps || []).map((s) => `<li>${mcEscape(s)}</li>`).join("");
    reflectionBox.style.display = "block";
  }

  function renderEntries(query = "") {
    const entries = MindCareStore.searchJournalEntries(user.email, query);
    if (entries.length === 0) {
      listEl.innerHTML = `
        <div style="text-align:center; padding:24px 12px; color:var(--ink-faint); font-size:0.85rem;">
          ${query ? "No entries match your search." : "No journal entries yet. Write your first thought!"}
        </div>`;
      return;
    }

    listEl.innerHTML = entries
      .map(
        (e) => `
      <div class="journal-entry-card ${e.id === activeEntryId ? "active" : ""}" data-id="${e.id}">
        <h4>${mcEscape(e.title || "Untitled")}</h4>
        <p class="preview">${mcEscape(e.content)}</p>
        <div class="date">${new Date(e.date).toLocaleDateString([], { month: "short", day: "numeric" })}</div>
      </div>`
      )
      .join("");

    listEl.querySelectorAll(".journal-entry-card").forEach((card) => {
      card.addEventListener("click", () => {
        loadEntry(card.dataset.id);
      });
    });
  }

  saveBtn.addEventListener("click", () => {
    const content = contentInput.value.trim();
    if (!content) {
      alert("Please write something in your journal before saving.");
      return;
    }

    const title = titleInput.value.trim() || "Untitled Reflection";
    const saved = MindCareStore.saveJournalEntry(user.email, {
      id: activeEntryId,
      title,
      content,
    });

    activeEntryId = saved.id;
    deleteBtn.style.display = "inline-flex";
    timestampEl.textContent = `Saved on ${new Date(saved.date).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}`;
    renderEntries(searchInput.value);
  });

  deleteBtn.addEventListener("click", () => {
    if (!activeEntryId) return;
    if (confirm("Are you sure you want to delete this journal entry? This cannot be undone.")) {
      MindCareStore.deleteJournalEntry(user.email, activeEntryId);
      resetEditor();
    }
  });

  newBtn.addEventListener("click", resetEditor);

  searchInput.addEventListener("input", () => {
    renderEntries(searchInput.value.trim());
  });

  reflectBtn.addEventListener("click", async () => {
    const content = contentInput.value.trim();
    if (!content) {
      alert("Please write a few sentences in your journal before requesting an AI reflection.");
      return;
    }

    reflectBtn.disabled = true;
    reflectBtn.textContent = "Reflecting with AI…";

    try {
      const reflection = await MindCareAPI.reflectJournal(titleInput.value.trim(), content);
      renderReflection(reflection);

      // Save reflection with the active entry
      MindCareStore.saveJournalEntry(user.email, {
        id: activeEntryId,
        title: titleInput.value.trim(),
        content,
        aiReflection: reflection,
      });

      renderEntries(searchInput.value);
    } catch (err) {
      alert("Unable to generate reflection right now. Please check that the backend is active.");
    } finally {
      reflectBtn.disabled = false;
      reflectBtn.innerHTML = `
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 3v3M12 18v3M4.2 4.2l2.1 2.1M17.7 17.7l2.1 2.1M3 12h3M18 12h3M4.2 19.8l2.1-2.1M17.7 6.3l2.1-2.1"/></svg>
        Get AI Reflection
      `;
    }
  });

  // Initial load
  renderEntries();
  const existingEntries = MindCareStore.getJournalEntries(user.email);
  if (existingEntries.length > 0) {
    loadEntry(existingEntries[0].id);
  }
});
