/**
 * journal-page.js — Redesigned Private Journal management & Gemini AI reflection.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  mcInitChatbot(user);

  // State
  let activeEntryId = null;
  let selectedMood = null;
  let currentReflectionData = null;
  let currentPromptIndex = 0;

  const WELLNESS_PROMPTS = [
    "What was one thing that felt difficult today, and how did you navigate it?",
    "What made you feel genuinely good or at peace today?",
    "What is something you are quietly proud of accomplishing recently?",
    "What would you like tomorrow to feel like, and what is one small choice that could support that?",
    "What emotion is taking up the most space in your thoughts right now?",
    "What is one compassionate thought you can offer yourself in this exact moment?",
    "Where are you carrying tension in your body, and what might it be asking of you?",
    "What is one healthy boundary that could protect your energy this week?"
  ];

  // DOM Elements
  const titleInput = document.getElementById("mc-journal-title");
  const contentInput = document.getElementById("mc-journal-content");
  const wordCounterEl = document.getElementById("mc-word-counter");

  const eyebrowEl = document.getElementById("mc-workspace-eyebrow");
  const workspaceTitleEl = document.getElementById("mc-workspace-title");
  const workspaceHelperEl = document.getElementById("mc-workspace-helper");
  const timestampEl = document.getElementById("mc-entry-timestamp");

  const saveBtn = document.getElementById("mc-save-entry-btn");
  const deleteBtn = document.getElementById("mc-delete-entry-btn");
  const newBtn = document.getElementById("mc-new-entry-btn");
  const sidebarNewBtn = document.getElementById("mc-sidebar-new-btn");
  const reflectBtn = document.getElementById("mc-ai-reflect-btn");
  const reflectBtnLabel = document.getElementById("mc-reflect-btn-label");

  const deleteConfirmBox = document.getElementById("mc-delete-confirm-box");
  const deleteCancelBtn = document.getElementById("mc-delete-cancel-btn");
  const deleteConfirmBtn = document.getElementById("mc-delete-confirm-btn");
  const toastEl = document.getElementById("mc-journal-toast");

  const searchInput = document.getElementById("mc-journal-search");
  const searchClearBtn = document.getElementById("mc-journal-search-clear");
  const listEl = document.getElementById("mc-journal-list");
  const countBadgeEl = document.getElementById("mc-journal-count");

  const moodChips = document.querySelectorAll(".journal-mood-chip");

  const promptToggle = document.getElementById("mc-prompt-toggle");
  const promptBox = document.getElementById("mc-prompt-box");
  const promptText = document.getElementById("mc-prompt-text");
  const promptNextBtn = document.getElementById("mc-prompt-next-btn");
  const promptInsertBtn = document.getElementById("mc-prompt-insert-btn");

  // AI Reflection Elements
  const reflectionBox = document.getElementById("mc-ai-reflection-box");
  const reflectEmotion = document.getElementById("mc-reflect-emotion");
  const reflectObs = document.getElementById("mc-reflect-obs");
  const reflectCoping = document.getElementById("mc-reflect-coping");
  const reflectSteps = document.getElementById("mc-reflect-steps");

  // ---------------------------------------------------------------------------
  // Helper: Live Word Counter
  // ---------------------------------------------------------------------------
  function updateWordCount() {
    const text = (contentInput.value || "").trim();
    const count = text ? text.split(/\s+/).filter(Boolean).length : 0;
    if (wordCounterEl) {
      wordCounterEl.textContent = `${count} word${count === 1 ? "" : "s"}`;
    }
  }

  // ---------------------------------------------------------------------------
  // Helper: Mood Selector
  // ---------------------------------------------------------------------------
  function setMood(mood) {
    selectedMood = mood || null;
    moodChips.forEach((chip) => {
      const isMatch = chip.dataset.mood === selectedMood;
      chip.classList.toggle("active", isMatch);
      chip.setAttribute("aria-checked", isMatch ? "true" : "false");
    });
  }

  moodChips.forEach((chip) => {
    chip.addEventListener("click", () => {
      const mood = chip.dataset.mood;
      if (selectedMood === mood) {
        setMood(null); // toggle off
      } else {
        setMood(mood);
      }
    });
  });

  // ---------------------------------------------------------------------------
  // Helper: Toast Notifications
  // ---------------------------------------------------------------------------
  let toastTimer = null;
  function showToast(message, isError = false) {
    if (!toastEl) return;
    toastEl.textContent = message;
    toastEl.classList.toggle("error", isError);
    toastEl.style.display = "block";
    void toastEl.offsetWidth;
    toastEl.classList.add("visible");

    if (toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(() => {
      toastEl.classList.remove("visible");
      setTimeout(() => {
        toastEl.style.display = "none";
      }, 250);
    }, 2600);
  }

  // ---------------------------------------------------------------------------
  // Editor Management: Reset (New Entry Mode)
  // ---------------------------------------------------------------------------
  function resetEditor(focus = true) {
    activeEntryId = null;
    currentReflectionData = null;
    setMood(null);

    titleInput.value = "";
    contentInput.value = "";
    updateWordCount();

    if (eyebrowEl) eyebrowEl.textContent = "NEW ENTRY";
    if (workspaceTitleEl) workspaceTitleEl.textContent = "New Journal Entry";
    if (workspaceHelperEl) workspaceHelperEl.textContent = "Take a moment to write what is on your mind.";

    if (timestampEl) timestampEl.style.display = "none";
    if (deleteBtn) deleteBtn.style.display = "none";
    if (newBtn) newBtn.style.display = "none";
    if (deleteConfirmBox) deleteConfirmBox.style.display = "none";
    if (reflectionBox) reflectionBox.style.display = "none";

    renderEntries(searchInput.value.trim());

    if (focus && titleInput) {
      titleInput.focus();
    }
  }

  // ---------------------------------------------------------------------------
  // Editor Management: Load Saved Entry (View/Edit Mode)
  // ---------------------------------------------------------------------------
  function loadEntry(id) {
    const entry = MindCareStore.getJournalEntryById(user.email, id);
    if (!entry) return;

    activeEntryId = entry.id;
    currentReflectionData = entry.aiReflection || null;

    titleInput.value = entry.title || "";
    contentInput.value = entry.content || "";
    setMood(entry.mood || null);
    updateWordCount();

    const formattedDate = new Date(entry.date).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });

    if (eyebrowEl) eyebrowEl.textContent = "JOURNAL ENTRY";
    if (workspaceTitleEl) workspaceTitleEl.textContent = entry.title || "Untitled Reflection";
    if (workspaceHelperEl) workspaceHelperEl.textContent = `Saved on ${formattedDate}`;

    if (timestampEl) {
      timestampEl.textContent = formattedDate;
      timestampEl.style.display = "inline-flex";
    }

    if (deleteBtn) deleteBtn.style.display = "inline-flex";
    if (newBtn) newBtn.style.display = "inline-flex";
    if (deleteConfirmBox) deleteConfirmBox.style.display = "none";

    if (entry.aiReflection) {
      renderReflection(entry.aiReflection);
    } else {
      reflectionBox.style.display = "none";
    }

    renderEntries(searchInput.value.trim());
  }

  // ---------------------------------------------------------------------------
  // Render AI Reflection Card
  // ---------------------------------------------------------------------------
  function renderReflection(ref) {
    if (!ref) {
      reflectionBox.style.display = "none";
      return;
    }
    reflectEmotion.textContent = ref.emotional_reflection || "Thank you for sharing your thoughts.";
    reflectObs.textContent = ref.observations || "Reflecting on your daily experiences is an important step in self-awareness.";

    const copingList = ref.coping_suggestions || [];
    reflectCoping.innerHTML = copingList.length
      ? copingList.map((s) => `<li>${mcEscape(s)}</li>`).join("")
      : "<li>Take a moment for slow, deep breaths.</li>";

    const nextStepsList = ref.next_steps || [];
    reflectSteps.innerHTML = nextStepsList.length
      ? nextStepsList.map((s) => `<li>${mcEscape(s)}</li>`).join("")
      : "<li>Acknowledge your efforts today, however small.</li>";

    reflectionBox.style.display = "block";
  }

  // ---------------------------------------------------------------------------
  // Render Sidebar Entry List with Clean Empty States
  // ---------------------------------------------------------------------------
  function getMoodEmoji(mood) {
    switch (mood) {
      case "Calm": return "😌";
      case "Good": return "🙂";
      case "Okay": return "😐";
      case "Stressed": return "😟";
      case "Low": return "😔";
      default: return "";
    }
  }

  function renderEntries(query = "") {
    const allEntries = MindCareStore.getJournalEntries(user.email);
    if (countBadgeEl) {
      countBadgeEl.textContent = `${allEntries.length} ${allEntries.length === 1 ? "entry" : "entries"}`;
    }

    const filtered = MindCareStore.searchJournalEntries(user.email, query);

    if (filtered.length === 0) {
      if (query) {
        listEl.innerHTML = `
          <div class="journal-empty-state">
            <div class="journal-empty-icon">🔍</div>
            <h4>No matching entries</h4>
            <p>Try searching for a different keyword or mood.</p>
            <button type="button" class="btn btn-ghost btn-sm" id="mc-empty-clear-btn" style="margin-top:8px;">Clear search filter</button>
          </div>`;
        const clearBtn = document.getElementById("mc-empty-clear-btn");
        if (clearBtn) {
          clearBtn.addEventListener("click", () => {
            searchInput.value = "";
            searchClearBtn.style.display = "none";
            renderEntries("");
          });
        }
      } else {
        listEl.innerHTML = `
          <div class="journal-empty-state">
            <div class="journal-empty-icon">📖</div>
            <h4>No entries yet</h4>
            <p>Your private space for thoughts, feelings and reflections.</p>
            <button type="button" class="btn btn-secondary btn-sm" id="mc-empty-write-btn" style="margin-top:8px;">+ Write your first entry</button>
          </div>`;
        const writeBtn = document.getElementById("mc-empty-write-btn");
        if (writeBtn) {
          writeBtn.addEventListener("click", () => resetEditor(true));
        }
      }
      return;
    }

    listEl.innerHTML = filtered
      .map((e) => {
        const isActive = e.id === activeEntryId;
        const moodEmoji = getMoodEmoji(e.mood);
        const dateStr = new Date(e.date).toLocaleDateString([], { month: "short", day: "numeric" });
        const wordCount = (e.content || "").trim().split(/\s+/).filter(Boolean).length;

        return `
          <div class="journal-entry-card ${isActive ? "active" : ""}" data-id="${e.id}" role="button" tabindex="0" aria-label="Journal entry ${mcEscape(e.title || "Untitled")}">
            <div class="journal-entry-top">
              <span class="journal-entry-date">${dateStr}</span>
              ${moodEmoji ? `<span class="journal-entry-mood-pill">${moodEmoji} ${mcEscape(e.mood)}</span>` : ""}
            </div>
            <h4 class="journal-entry-title">${mcEscape(e.title || "Untitled Reflection")}</h4>
            <p class="journal-entry-preview">${mcEscape(e.content)}</p>
            <div class="journal-entry-meta">
              <span>${wordCount} ${wordCount === 1 ? "word" : "words"}</span>
              ${e.aiReflection ? `<span class="journal-entry-has-ai">✨ AI Reflected</span>` : ""}
            </div>
          </div>
        `;
      })
      .join("");

    listEl.querySelectorAll(".journal-entry-card").forEach((card) => {
      card.addEventListener("click", () => {
        loadEntry(card.dataset.id);
      });
      card.addEventListener("keydown", (ev) => {
        if (ev.key === "Enter" || ev.key === " " || ev.code === "Space") {
          ev.preventDefault();
          loadEntry(card.dataset.id);
        }
      });
    });
  }

  // ---------------------------------------------------------------------------
  // Writing Prompt Interaction
  // ---------------------------------------------------------------------------
  if (promptToggle && promptBox && promptText) {
    promptToggle.addEventListener("click", () => {
      const isHidden = promptBox.style.display === "none";
      promptBox.style.display = isHidden ? "block" : "none";
      promptToggle.classList.toggle("open", isHidden);
      promptToggle.setAttribute("aria-expanded", isHidden ? "true" : "false");
      if (isHidden) {
        promptText.textContent = `"${WELLNESS_PROMPTS[currentPromptIndex]}"`;
      }
    });

    if (promptNextBtn) {
      promptNextBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        currentPromptIndex = (currentPromptIndex + 1) % WELLNESS_PROMPTS.length;
        promptText.textContent = `"${WELLNESS_PROMPTS[currentPromptIndex]}"`;
      });
    }

    if (promptInsertBtn) {
      promptInsertBtn.addEventListener("click", (e) => {
        e.stopPropagation();
        const promptToInsert = WELLNESS_PROMPTS[currentPromptIndex];
        const existing = contentInput.value.trim();
        if (!existing) {
          contentInput.value = promptToInsert + "\n\n";
        } else {
          contentInput.value = existing + "\n\n" + promptToInsert + "\n\n";
        }
        updateWordCount();
        contentInput.focus();
        showToast("Prompt inserted into journal");
      });
    }
  }

  // ---------------------------------------------------------------------------
  // Real-Time Word Counting
  // ---------------------------------------------------------------------------
  contentInput.addEventListener("input", updateWordCount);

  // ---------------------------------------------------------------------------
  // Search Functionality
  // ---------------------------------------------------------------------------
  searchInput.addEventListener("input", () => {
    const q = searchInput.value.trim();
    if (searchClearBtn) searchClearBtn.style.display = q ? "inline-flex" : "none";
    renderEntries(q);
  });

  if (searchClearBtn) {
    searchClearBtn.addEventListener("click", () => {
      searchInput.value = "";
      searchClearBtn.style.display = "none";
      renderEntries("");
      searchInput.focus();
    });
  }

  // ---------------------------------------------------------------------------
  // Save Entry Action
  // ---------------------------------------------------------------------------
  saveBtn.addEventListener("click", () => {
    const content = contentInput.value.trim();
    if (!content) {
      contentInput.focus();
      contentInput.classList.add("shake-warn");
      setTimeout(() => contentInput.classList.remove("shake-warn"), 500);
      showToast("Please write a thought before saving.", true);
      return;
    }

    const title = titleInput.value.trim() || "Untitled Reflection";
    const saved = MindCareStore.saveJournalEntry(user.email, {
      id: activeEntryId,
      title,
      content,
      mood: selectedMood,
      aiReflection: currentReflectionData,
    });

    activeEntryId = saved.id;
    if (eyebrowEl) eyebrowEl.textContent = "JOURNAL ENTRY";
    if (workspaceTitleEl) workspaceTitleEl.textContent = saved.title;

    const formattedDate = new Date(saved.date).toLocaleString([], {
      dateStyle: "medium",
      timeStyle: "short",
    });
    if (workspaceHelperEl) workspaceHelperEl.textContent = `Saved on ${formattedDate}`;

    if (timestampEl) {
      timestampEl.textContent = formattedDate;
      timestampEl.style.display = "inline-flex";
    }

    if (deleteBtn) deleteBtn.style.display = "inline-flex";
    if (newBtn) newBtn.style.display = "inline-flex";

    renderEntries(searchInput.value.trim());
    showToast("✓ Journal entry saved");
  });

  // ---------------------------------------------------------------------------
  // Delete Entry with In-App Confirmation
  // ---------------------------------------------------------------------------
  deleteBtn.addEventListener("click", () => {
    if (!activeEntryId) return;
    deleteConfirmBox.style.display = "flex";
  });

  deleteCancelBtn.addEventListener("click", () => {
    deleteConfirmBox.style.display = "none";
  });

  deleteConfirmBtn.addEventListener("click", () => {
    if (!activeEntryId) return;
    MindCareStore.deleteJournalEntry(user.email, activeEntryId);
    deleteConfirmBox.style.display = "none";
    resetEditor(false);
    showToast("✓ Journal entry deleted");
  });

  // ---------------------------------------------------------------------------
  // New Entry Buttons
  // ---------------------------------------------------------------------------
  newBtn.addEventListener("click", () => resetEditor(true));
  if (sidebarNewBtn) {
    sidebarNewBtn.addEventListener("click", () => resetEditor(true));
  }

  // ---------------------------------------------------------------------------
  // AI Reflection Action
  // ---------------------------------------------------------------------------
  reflectBtn.addEventListener("click", async () => {
    const content = contentInput.value.trim();
    if (!content || content.length < 15) {
      contentInput.focus();
      showToast("Please write at least a few sentences before requesting an AI reflection.", true);
      return;
    }

    reflectBtn.disabled = true;
    reflectBtn.classList.add("reflecting");
    if (reflectBtnLabel) {
      reflectBtnLabel.textContent = "✨ MindCare is reflecting...";
    }

    try {
      const reflection = await MindCareAPI.reflectJournal(titleInput.value.trim(), content);
      currentReflectionData = reflection;
      renderReflection(reflection);

      // Save reflection with the active entry
      const title = titleInput.value.trim() || "Untitled Reflection";
      const saved = MindCareStore.saveJournalEntry(user.email, {
        id: activeEntryId,
        title,
        content,
        mood: selectedMood,
        aiReflection: reflection,
      });

      activeEntryId = saved.id;
      if (deleteBtn) deleteBtn.style.display = "inline-flex";
      if (newBtn) newBtn.style.display = "inline-flex";

      renderEntries(searchInput.value.trim());
      showToast("✓ AI Reflection generated and saved");

      // Smooth scroll to reflection card
      if (reflectionBox) {
        reflectionBox.scrollIntoView({ behavior: "smooth", block: "nearest" });
      }
    } catch (err) {
      console.error("[Journal] Reflection failed:", err);
      showToast("Unable to generate reflection right now. Please verify backend is active.", true);
    } finally {
      reflectBtn.disabled = false;
      reflectBtn.classList.remove("reflecting");
      if (reflectBtnLabel) {
        reflectBtnLabel.textContent = "✨ Get AI Reflection";
      }
    }
  });

  // ---------------------------------------------------------------------------
  // Initial Page Load
  // ---------------------------------------------------------------------------
  renderEntries();
  const existingEntries = MindCareStore.getJournalEntries(user.email);
  if (existingEntries.length > 0) {
    loadEntry(existingEntries[0].id);
  } else {
    resetEditor(false);
  }
});
