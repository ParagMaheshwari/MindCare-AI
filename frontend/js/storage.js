/**
 * storage.js — Unified Data Architecture for MindCare AI.
 * Handles:
 *  - User Profiles (name, age, country, academic level, etc.)
 *  - Assessment History & Predictions
 *  - Daily Mood Check-ins & Mood Analytics
 *  - Private Journal Entries & AI Reflections
 *  - Wellness Goals & Progress
 *  - Streaks (Mood, Journal, Goals)
 *  - Wellness Reminders
 *  - Privacy & Data Management Controls
 */

const MindCareStore = (() => {
  const PREFIX = "mindcare_";
  const KEYS = {
    PROFILES: `${PREFIX}profiles`,
    ASSESSMENTS: `${PREFIX}assessments`,
    LATEST_RESULT: `${PREFIX}latest_result`,
    LAST_ASSESSMENT_INPUT: `${PREFIX}last_assessment_input`,
    MOODS: `${PREFIX}moods`,
    JOURNALS: `${PREFIX}journals`,
    GOALS: `${PREFIX}goals`,
    REMINDERS: `${PREFIX}reminders`,
    CHAT_HISTORY: `${PREFIX}chat_history`,
  };

  function _read(key, defaultVal = {}) {
    try {
      const data = localStorage.getItem(key);
      return data ? JSON.parse(data) : defaultVal;
    } catch {
      return defaultVal;
    }
  }

  function _write(key, val) {
    try {
      localStorage.setItem(key, JSON.stringify(val));
    } catch (e) {
      console.error(`MindCareStore write failed for ${key}:`, e);
    }
  }

  function _todayStr() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  // ---------------------------------------------------------------------------
  // Profile Management
  // ---------------------------------------------------------------------------
  function getProfile(email) {
    if (!email) return null;
    const all = _read(KEYS.PROFILES);
    const key = email.trim().toLowerCase();
    return all[key] || null;
  }

  function saveProfile(email, profileData) {
    if (!email) return null;
    const all = _read(KEYS.PROFILES);
    const key = email.trim().toLowerCase();
    const existing = all[key] || {};
    const updated = {
      ...existing,
      ...profileData,
      email: key,
      updatedAt: new Date().toISOString(),
    };
    all[key] = updated;
    _write(KEYS.PROFILES, all);

    // Also sync to MindCareAuth users if name or email changed
    try {
      const users = _read("mindcare_users", {});
      if (users[key]) {
        users[key] = { ...users[key], ...profileData };
        _write("mindcare_users", users);
      }
    } catch {}

    return updated;
  }

  // ---------------------------------------------------------------------------
  // Assessment History
  // ---------------------------------------------------------------------------
  function saveLastAssessmentInput(email, formData) {
    if (!email || !formData) return;
    const all = _read(KEYS.LAST_ASSESSMENT_INPUT, {});
    const key = email.trim().toLowerCase();
    all[key] = { ...(all[key] || {}), ...formData };
    _write(KEYS.LAST_ASSESSMENT_INPUT, all);
  }

  function getLastAssessmentInput(email) {
    if (!email) return null;
    const key = email.trim().toLowerCase();
    const all = _read(KEYS.LAST_ASSESSMENT_INPUT, {});
    let saved = all[key] ? { ...all[key] } : null;

    // Fallback: extract formData from latest completed assessment if present
    if (!saved) {
      const latest = getLatestAssessment(email);
      if (latest && latest.formData) {
        saved = { ...latest.formData };
      }
    }

    // Merge with demographic fields from Profile if any field is missing
    const prof = getProfile(email);
    if (prof) {
      saved = saved ? { ...saved } : {};
      if (saved.age === undefined || saved.age === null || saved.age === "") {
        if (prof.age) saved.age = prof.age;
      }
      if (!saved.gender && prof.gender) saved.gender = prof.gender;
      if (!saved.country && prof.country) saved.country = prof.country;
      if (!saved.academic_level && prof.academic_level) saved.academic_level = prof.academic_level;
      if (!saved.most_used_platform && prof.most_used_platform) saved.most_used_platform = prof.most_used_platform;
    }

    return saved;
  }

  function clearLastAssessmentInput(email) {
    if (!email) return;
    const all = _read(KEYS.LAST_ASSESSMENT_INPUT, {});
    const key = email.trim().toLowerCase();
    delete all[key];
    _write(KEYS.LAST_ASSESSMENT_INPUT, all);
  }

  function saveAssessment(email, formData, score, meta = {}) {
    if (!email) return null;
    const all = _read(KEYS.ASSESSMENTS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];

    const numScore = Number(score);
    const score_100 = meta.score_100 !== undefined ? Number(meta.score_100) : Math.round(numScore * 10);
    const prediction = meta.prediction || (numScore >= 7.0 ? "Higher range" : (numScore >= 4.0 ? "Moderate range" : "Lower range"));
    const category = meta.category || (numScore >= 7.0 ? "High" : (numScore >= 4.0 ? "Moderate" : "Low"));

    const record = {
      id: meta.id || `a_${Date.now()}`,
      date: meta.date || new Date().toISOString(),
      formData,
      score: numScore,
      score_100,
      prediction,
      category,
      recommendations: meta.recommendations || [],
    };

    // Remove any previous record with the same ID if re-saving
    const targetId = String(record.id);
    const filteredList = list.filter((r) => String(r.id) !== targetId);
    filteredList.unshift(record);
    all[key] = filteredList;
    _write(KEYS.ASSESSMENTS, all);
    _write(KEYS.LATEST_RESULT, record);
    try {
      sessionStorage.setItem(KEYS.LATEST_RESULT, JSON.stringify(record));
    } catch {}

    // Permanently preserve the entered input data
    saveLastAssessmentInput(email, formData);

    // Sync demographics to user profile so other sections stay in sync
    try {
      const prof = getProfile(email) || {};
      const profUpdate = {};
      if (formData.age) profUpdate.age = Number(formData.age);
      if (formData.gender) profUpdate.gender = formData.gender;
      if (formData.country) profUpdate.country = formData.country;
      if (formData.academic_level) profUpdate.academic_level = formData.academic_level;
      if (formData.most_used_platform) profUpdate.most_used_platform = formData.most_used_platform;
      if (Object.keys(profUpdate).length > 0) {
        saveProfile(email, { ...prof, ...profUpdate });
      }
    } catch {}

    return record;
  }

  function syncAssessments(email, assessments) {
    if (!email || !Array.isArray(assessments)) return;
    const all = _read(KEYS.ASSESSMENTS);
    const key = email.trim().toLowerCase();
    all[key] = assessments;
    _write(KEYS.ASSESSMENTS, all);
    if (assessments.length > 0) {
      _write(KEYS.LATEST_RESULT, assessments[0]);
      try {
        sessionStorage.setItem(KEYS.LATEST_RESULT, JSON.stringify(assessments[0]));
      } catch {}
    }
  }

  function getAssessments(email) {
    if (!email) return [];
    const all = _read(KEYS.ASSESSMENTS);
    return all[email.trim().toLowerCase()] || [];
  }

  function getLatestAssessment(email) {
    const list = getAssessments(email);
    if (list.length > 0) return list[0];
    const latest = _read(KEYS.LATEST_RESULT, null);
    if (latest) return latest;
    try {
      const sessionLatest = JSON.parse(sessionStorage.getItem(KEYS.LATEST_RESULT));
      if (sessionLatest) return sessionLatest;
    } catch {}
    return null;
  }

  function getAssessmentById(email, id) {
    if (!id) return null;
    const targetId = String(id);
    if (email) {
      const list = getAssessments(email);
      const found = list.find((r) => String(r.id) === targetId);
      if (found) return found;
    }
    // Search across all entries
    const all = _read(KEYS.ASSESSMENTS);
    for (const k of Object.keys(all)) {
      const found = (all[k] || []).find((r) => String(r.id) === targetId);
      if (found) return found;
    }
    const latest = _read(KEYS.LATEST_RESULT, null);
    if (latest && String(latest.id) === targetId) return latest;
    try {
      const sessionLatest = JSON.parse(sessionStorage.getItem(KEYS.LATEST_RESULT));
      if (sessionLatest && String(sessionLatest.id) === targetId) return sessionLatest;
    } catch {}
    return null;
  }

  function deleteAssessments(email) {
    if (!email) return;
    const all = _read(KEYS.ASSESSMENTS);
    delete all[email.trim().toLowerCase()];
    _write(KEYS.ASSESSMENTS, all);
    clearLastAssessmentInput(email);
    localStorage.removeItem(KEYS.LATEST_RESULT);
    sessionStorage.removeItem(KEYS.LATEST_RESULT);
  }

  // ---------------------------------------------------------------------------
  // Daily Mood Check-In & Analytics
  // ---------------------------------------------------------------------------
  const MOOD_META = {
    5: { label: "Great", emoji: "😄", color: "#3F7D5C" },
    4: { label: "Good", emoji: "🙂", color: "#6E7FB3" },
    3: { label: "Okay", emoji: "😐", color: "#C68A3B" },
    2: { label: "Low", emoji: "😟", color: "#D47B5A" },
    1: { label: "Very Low", emoji: "😔", color: "#B4644F" },
  };

  function saveMood(email, {
    mood,
    note = "",
    isVoiceEntry = false,
    transcript = null,
    textSentimentScore = null,
    vocalToneScore = null,
    blendedMoodScore = null,
    vocalMetrics = null,
  }) {
    if (!email) return null;
    const all = _read(KEYS.MOODS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];

    const today = _todayStr();
    const meta = MOOD_META[mood] || MOOD_META[3];

    const existingIdx = list.findIndex((m) => m.date === today);
    const entry = {
      id: existingIdx >= 0 ? list[existingIdx].id : `m_${Date.now()}`,
      date: today,
      timestamp: new Date().toISOString(),
      mood: Number(mood),
      label: meta.label,
      emoji: meta.emoji,
      note: (note || "").trim(),
      isVoiceEntry: Boolean(isVoiceEntry),
      transcript: transcript || null,
      textSentimentScore: textSentimentScore !== null ? Number(textSentimentScore) : null,
      vocalToneScore: vocalToneScore !== null ? Number(vocalToneScore) : null,
      blendedMoodScore: blendedMoodScore !== null ? Number(blendedMoodScore) : null,
      vocalMetrics: vocalMetrics || null,
    };

    if (existingIdx >= 0) {
      list[existingIdx] = entry;
    } else {
      list.unshift(entry);
    }

    all[key] = list;
    _write(KEYS.MOODS, all);

    // Asynchronously sync to backend if API client is available
    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.createMood && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        MindCareAPI.createMood({
          mood: entry.mood,
          note: entry.note,
          is_voice_entry: entry.isVoiceEntry,
          transcript: entry.transcript,
          text_sentiment_score: entry.textSentimentScore,
          vocal_tone_score: entry.vocalToneScore,
          blended_mood_score: entry.blendedMoodScore,
          vocal_metrics: entry.vocalMetrics,
        }).catch((err) => console.warn("Background mood sync failed:", err));
      }
    } catch {}

    return entry;
  }

  function getTodayMood(email) {
    if (!email) return null;
    const list = getMoodHistory(email);
    const today = _todayStr();
    return list.find((m) => m.date === today) || null;
  }

  function getMoodHistory(email) {
    if (!email) return [];
    const all = _read(KEYS.MOODS);
    return all[email.trim().toLowerCase()] || [];
  }

  function deleteMoodHistory(email) {
    if (!email) return;
    const all = _read(KEYS.MOODS);
    delete all[email.trim().toLowerCase()];
    _write(KEYS.MOODS, all);
  }

  function getMoodAnalytics(email) {
    const list = getMoodHistory(email);
    const counts = { 5: 0, 4: 0, 3: 0, 2: 0, 1: 0 };
    list.forEach((m) => {
      if (counts[m.mood] !== undefined) counts[m.mood]++;
    });

    // Last 7 days trend
    const past7Days = [];
    const now = new Date();
    for (let i = 6; i >= 0; i--) {
      const d = new Date(now);
      d.setDate(d.getDate() - i);
      const str = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
      const dayName = d.toLocaleDateString(undefined, { weekday: "short" });
      const found = list.find((m) => m.date === str);
      past7Days.push({
        date: str,
        day: dayName,
        mood: found ? found.mood : null,
        emoji: found ? found.emoji : null,
        label: found ? found.label : "No entry",
      });
    }

    return {
      totalCheckins: list.length,
      distribution: counts,
      last7Days: past7Days,
      streak: calculateStreak(list.map((m) => m.date)),
    };
  }

  // ---------------------------------------------------------------------------
  // Private Journal
  // ---------------------------------------------------------------------------
  function saveJournalEntry(email, { id, title, content, aiReflection = null }) {
    if (!email || !content) return null;
    const all = _read(KEYS.JOURNALS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];

    const entryId = id || `j_${Date.now()}`;
    const existingIdx = list.findIndex((e) => e.id === entryId);

    const entry = {
      id: entryId,
      date: new Date().toISOString(),
      dateStr: _todayStr(),
      title: (title || "Untitled Reflection").trim(),
      content: content.trim(),
      aiReflection,
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      entry.date = list[existingIdx].date;
      if (!aiReflection && list[existingIdx].aiReflection) {
        entry.aiReflection = list[existingIdx].aiReflection;
      }
      list[existingIdx] = entry;
    } else {
      list.unshift(entry);
    }

    all[key] = list;
    _write(KEYS.JOURNALS, all);

    // Asynchronously sync to backend
    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.createJournal && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        MindCareAPI.createJournal({
          id: entry.id,
          title: entry.title,
          content: entry.content,
          ai_reflection: entry.aiReflection,
        }).catch((err) => console.warn("Background journal sync failed:", err));
      }
    } catch {}

    return entry;
  }

  function getJournalEntries(email) {
    if (!email) return [];
    const all = _read(KEYS.JOURNALS);
    return all[email.trim().toLowerCase()] || [];
  }

  function getJournalEntryById(email, id) {
    const list = getJournalEntries(email);
    return list.find((e) => e.id === id) || null;
  }

  function deleteJournalEntry(email, id) {
    if (!email) return;
    const all = _read(KEYS.JOURNALS);
    const key = email.trim().toLowerCase();
    let list = all[key] || [];
    list = list.filter((e) => e.id !== id);
    all[key] = list;
    _write(KEYS.JOURNALS, all);

    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.deleteJournal && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        MindCareAPI.deleteJournal(id).catch((err) => console.warn("Background journal delete failed:", err));
      }
    } catch {}
  }

  function deleteJournalEntries(email) {
    if (!email) return;
    const all = _read(KEYS.JOURNALS);
    delete all[email.trim().toLowerCase()];
    _write(KEYS.JOURNALS, all);
  }

  function searchJournalEntries(email, query) {
    const list = getJournalEntries(email);
    if (!query) return list;
    const q = query.toLowerCase();
    return list.filter(
      (e) => e.title.toLowerCase().includes(q) || e.content.toLowerCase().includes(q)
    );
  }

  // ---------------------------------------------------------------------------
  // Wellness Goals
  // ---------------------------------------------------------------------------
  const DEFAULT_GOALS = [
    { title: "Sleep before 11:30 PM", category: "Sleep" },
    { title: "Walk or stretch for 20 minutes", category: "Movement" },
    { title: "Take 3 screen-free study breaks", category: "Study" },
    { title: "Complete today's mood check-in", category: "Mindfulness" },
  ];

  function getGoals(email) {
    if (!email) return [];
    const all = _read(KEYS.GOALS);
    const key = email.trim().toLowerCase();
    if (!all[key]) {
      const seeded = DEFAULT_GOALS.map((g, i) => ({
        id: `g_seed_${i + 1}`,
        title: g.title,
        category: g.category,
        status: "in_progress",
        createdAt: new Date().toISOString(),
      }));
      all[key] = seeded;
      _write(KEYS.GOALS, all);
    }
    return all[key] || [];
  }

  function saveGoal(email, { id, title, category = "General", status = "in_progress" }) {
    if (!email || !title) return null;
    const all = _read(KEYS.GOALS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];

    const goalId = id || `g_${Date.now()}`;
    const existingIdx = list.findIndex((g) => g.id === goalId);

    const goal = {
      id: goalId,
      title: title.trim(),
      category: category.trim(),
      status,
      createdAt: existingIdx >= 0 ? list[existingIdx].createdAt : new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };

    if (existingIdx >= 0) {
      list[existingIdx] = goal;
    } else {
      list.unshift(goal);
    }

    all[key] = list;
    _write(KEYS.GOALS, all);

    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.createGoal && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        MindCareAPI.createGoal({
          id: goal.id,
          title: goal.title,
          category: goal.category,
          status: goal.status,
        }).catch((err) => console.warn("Background goal sync failed:", err));
      }
    } catch {}

    return goal;
  }

  function updateGoalStatus(email, id, status) {
    if (!email) return null;
    const all = _read(KEYS.GOALS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];
    const goal = list.find((g) => g.id === id);
    if (goal) {
      goal.status = status;
      goal.updatedAt = new Date().toISOString();
      _write(KEYS.GOALS, all);

      try {
        if (typeof MindCareAPI !== "undefined" && MindCareAPI.updateGoalStatus && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
          MindCareAPI.updateGoalStatus(id, status).catch((err) => console.warn("Background goal status sync failed:", err));
        }
      } catch {}
    }
    return goal;
  }

  function deleteGoal(email, id) {
    if (!email) return;
    const all = _read(KEYS.GOALS);
    const key = email.trim().toLowerCase();
    let list = all[key] || [];
    list = list.filter((g) => g.id !== id);
    all[key] = list;
    _write(KEYS.GOALS, all);

    try {
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.deleteGoal && MindCareAPI.hasToken && MindCareAPI.hasToken()) {
        MindCareAPI.deleteGoal(id).catch((err) => console.warn("Background goal delete failed:", err));
      }
    } catch {}
  }

  function getGoalCompletionRate(email) {
    const list = getGoals(email);
    if (list.length === 0) return 0;
    const completed = list.filter((g) => g.status === "completed").length;
    return Math.round((completed / list.length) * 100);
  }

  // ---------------------------------------------------------------------------
  // Streaks Calculation
  // ---------------------------------------------------------------------------
  function calculateStreak(dateStrings) {
    if (!dateStrings || dateStrings.length === 0) return 0;
    const uniqueDates = Array.from(
      new Set(dateStrings.map((d) => (typeof d === "string" ? d.slice(0, 10) : "")))
    ).filter(Boolean).sort().reverse();

    if (uniqueDates.length === 0) return 0;

    const today = _todayStr();
    const yesterdayDate = new Date();
    yesterdayDate.setDate(yesterdayDate.getDate() - 1);
    const yesterday = `${yesterdayDate.getFullYear()}-${String(yesterdayDate.getMonth() + 1).padStart(2, "0")}-${String(yesterdayDate.getDate()).padStart(2, "0")}`;

    if (uniqueDates[0] !== today && uniqueDates[0] !== yesterday) {
      return 0;
    }

    let streak = 0;
    let expected = new Date(uniqueDates[0] === today ? today : yesterday);

    for (const dStr of uniqueDates) {
      const curDate = new Date(dStr);
      const diffDays = Math.round((expected - curDate) / (1000 * 60 * 60 * 24));
      if (diffDays === 0) {
        streak++;
        expected.setDate(expected.getDate() - 1);
      } else {
        break;
      }
    }

    return streak;
  }

  function getStreaks(email) {
    const moods = getMoodHistory(email);
    const journals = getJournalEntries(email);
    const goals = getGoals(email);

    const moodStreak = calculateStreak(moods.map((m) => m.date));
    const journalStreak = calculateStreak(journals.map((j) => j.dateStr || j.date));
    const completedGoalsCount = goals.filter((g) => g.status === "completed").length;

    return {
      moodStreak,
      journalStreak,
      goalStreak: completedGoalsCount,
    };
  }

  // ---------------------------------------------------------------------------
  // Wellness Reminders
  // ---------------------------------------------------------------------------
  const DEFAULT_REMINDERS = [
    { id: "rem_1", title: "Take a 10-minute study break", time: "14:00", enabled: true },
    { id: "rem_2", title: "Complete today's mood check-in", time: "18:00", enabled: true },
    { id: "rem_3", title: "Practice 3-minute breathing exercise", time: "20:00", enabled: false },
    { id: "rem_4", title: "Begin screen-free bedtime routine", time: "22:30", enabled: true },
  ];

  function getReminders(email) {
    if (!email) return [];
    const all = _read(KEYS.REMINDERS);
    const key = email.trim().toLowerCase();
    if (!all[key]) {
      all[key] = [...DEFAULT_REMINDERS];
      _write(KEYS.REMINDERS, all);
    }
    return all[key] || [];
  }

  function saveReminder(email, { id, title, time, enabled = true }) {
    if (!email || !title) return null;
    const all = _read(KEYS.REMINDERS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];

    const reminderId = id || `rem_${Date.now()}`;
    const existingIdx = list.findIndex((r) => r.id === reminderId);
    const item = {
      id: reminderId,
      title: title.trim(),
      time: time || "12:00",
      enabled: Boolean(enabled),
    };

    if (existingIdx >= 0) {
      list[existingIdx] = item;
    } else {
      list.push(item);
    }

    all[key] = list;
    _write(KEYS.REMINDERS, all);
    return item;
  }

  function toggleReminder(email, id) {
    if (!email) return null;
    const all = _read(KEYS.REMINDERS);
    const key = email.trim().toLowerCase();
    const list = all[key] || [];
    const item = list.find((r) => r.id === id);
    if (item) {
      item.enabled = !item.enabled;
      _write(KEYS.REMINDERS, all);
    }
    return item;
  }

  function deleteReminder(email, id) {
    if (!email) return;
    const all = _read(KEYS.REMINDERS);
    const key = email.trim().toLowerCase();
    let list = all[key] || [];
    list = list.filter((r) => r.id !== id);
    all[key] = list;
    _write(KEYS.REMINDERS, all);
  }

  // ---------------------------------------------------------------------------
  // Privacy & Data Destruction
  // ---------------------------------------------------------------------------
  function clearChatbotHistory() {
    sessionStorage.removeItem("mindcare_chat_history");
    localStorage.removeItem(KEYS.CHAT_HISTORY);
  }

  function deleteAccountData(email) {
    if (!email) return;
    const key = email.trim().toLowerCase();
    const removeKey = (k) => {
      const all = _read(k);
      delete all[key];
      _write(k, all);
    };

    removeKey(KEYS.ASSESSMENTS);
    removeKey(KEYS.LAST_ASSESSMENT_INPUT);
    removeKey(KEYS.MOODS);
    removeKey(KEYS.JOURNALS);
    removeKey(KEYS.GOALS);
    removeKey(KEYS.REMINDERS);
    removeKey(KEYS.PROFILES);
    clearChatbotHistory();
  }

  function syncFromBackend(email, cloudData) {
    if (!email || !cloudData) return;
    const key = email.trim().toLowerCase();

    // 1. Profile
    if (cloudData.profile) {
      const allProfiles = _read(KEYS.PROFILES);
      allProfiles[key] = {
        ...allProfiles[key],
        ...cloudData.profile,
        email: key,
      };
      _write(KEYS.PROFILES, allProfiles);
    }

    // 2. Assessments
    if (Array.isArray(cloudData.assessments)) {
      const allAssessments = _read(KEYS.ASSESSMENTS);
      allAssessments[key] = cloudData.assessments;
      _write(KEYS.ASSESSMENTS, allAssessments);
      if (cloudData.assessments.length > 0) {
        _write(KEYS.LATEST_RESULT, cloudData.assessments[0]);
        try {
          sessionStorage.setItem(KEYS.LATEST_RESULT, JSON.stringify(cloudData.assessments[0]));
        } catch {}
        if (cloudData.assessments[0].formData) {
          saveLastAssessmentInput(key, cloudData.assessments[0].formData);
        }
      }
    }

    // 3. Moods
    if (Array.isArray(cloudData.moods)) {
      const allMoods = _read(KEYS.MOODS);
      allMoods[key] = cloudData.moods;
      _write(KEYS.MOODS, allMoods);
    }

    // 4. Journals
    if (Array.isArray(cloudData.journals)) {
      const allJournals = _read(KEYS.JOURNALS);
      allJournals[key] = cloudData.journals;
      _write(KEYS.JOURNALS, allJournals);
    }

    // 5. Goals
    if (Array.isArray(cloudData.goals)) {
      const allGoals = _read(KEYS.GOALS);
      allGoals[key] = cloudData.goals;
      _write(KEYS.GOALS, allGoals);
    }
  }

  return {
    getProfile,
    saveProfile,
    saveAssessment,
    getLastAssessmentInput,
    saveLastAssessmentInput,
    clearLastAssessmentInput,
    getAssessments,
    syncAssessments,
    getLatestAssessment,
    getAssessmentById,
    deleteAssessments,
    saveMood,
    getTodayMood,
    getMoodHistory,
    deleteMoodHistory,
    getMoodAnalytics,
    saveJournalEntry,
    getJournalEntries,
    getJournalEntryById,
    deleteJournalEntry,
    deleteJournalEntries,
    searchJournalEntries,
    getGoals,
    saveGoal,
    updateGoalStatus,
    deleteGoal,
    getGoalCompletionRate,
    getStreaks,
    getReminders,
    saveReminder,
    toggleReminder,
    deleteReminder,
    clearChatbotHistory,
    deleteAccountData,
    syncFromBackend,
    MOOD_META,
  };
})();

// Backward compatibility bridge for MindCareResults
window.MindCareStore = MindCareStore;
window.MindCareResults = {
  saveAssessment: (email, formData, score, meta) => MindCareStore.saveAssessment(email, formData, score, meta),
  getHistory: (email) => MindCareStore.getAssessments(email),
  getLatest: (email) => MindCareStore.getLatestAssessment(email),
  getById: (email, id) => MindCareStore.getAssessmentById(email, id),
  setActiveResult: (rec) => localStorage.setItem("mindcare_latest_result", JSON.stringify(rec)),
  getActiveResult: () => {
    try {
      return JSON.parse(localStorage.getItem("mindcare_latest_result"));
    } catch {
      return null;
    }
  },
  formatDate: (isoString) => {
    if (!isoString) return "—";
    const d = new Date(isoString);
    return d.toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" });
  },
};
