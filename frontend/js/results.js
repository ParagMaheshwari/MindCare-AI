/**
 * results.js
 * - configurable score ranges + neutral, non-diagnostic interpretation copy
 * - generateWellnessSuggestions(userData, score): rule-based, not random
 * - localStorage-backed assessment history (per logged-in user), structured
 *   so it can later be swapped for a real database-backed "My Results" API
 */

/**
 * Score ranges are intentionally easy to tune. They are NOT clinically
 * validated cutoffs — just neutral buckets used to phrase feedback.
 */
const scoreRanges = {
  low: { min: 0, max: 4 },
  moderate: { min: 4, max: 7 },
  higher: { min: 7, max: 10 },
};

function getScoreCategory(score) {
  if (score < scoreRanges.low.max) return "low";
  if (score < scoreRanges.moderate.max) return "moderate";
  return "higher";
}

const scoreInterpretations = {
  low: {
    label: "Lower range",
    badgeClass: "badge-low",
    text:
      "Your current model-generated score falls in a lower range. Consider focusing on healthy routines and reaching out for support if you are struggling.",
  },
  moderate: {
    label: "Moderate range",
    badgeClass: "badge-moderate",
    text:
      "Your score falls in a moderate range. Maintaining healthy routines may help support your overall wellbeing.",
  },
  higher: {
    label: "Higher range",
    badgeClass: "badge-higher",
    text:
      "Your score falls in a higher range according to this model. Continue maintaining healthy habits.",
  },
};

/**
 * Rule-based, deterministic wellness suggestions from the user's actual
 * submitted values. Nothing here is randomly generated.
 */
function generateWellnessSuggestions(userData, score) {
  const suggestions = [];
  const numScore = score !== undefined ? Number(score) : 7.0;

  // 1. Professional Help Consideration (if low score < 4.0 or Very High stress)
  if (numScore < 4.0 || userData.stress_level === "Very High") {
    suggestions.push({
      tag: "Professional Support & Care",
      badge: "Important",
      text: "Your current score falls in a lower range or reflects high stress. We strongly recommend speaking with a university counselor, therapist, or healthcare professional for individualized guidance and support.",
    });
  }

  // 2. Sleep Improvement
  const sleep = Number(userData.sleep_hours_per_night);
  if (sleep < 7) {
    suggestions.push({
      tag: "Sleep Routine & Recovery",
      badge: "Rest",
      text: `You reported ${sleep}h of nightly sleep. Aiming for 7–9h with a consistent bedtime and winding down screens 30 minutes before sleep will enhance focus and emotional resilience.`,
    });
  }

  // 3. Physical Activity
  const activity = Number(userData.physical_activity_hours);
  if (activity < 1) {
    suggestions.push({
      tag: "Daily Physical Movement",
      badge: "Energy",
      text: "Adding 20–30 minutes of daily physical movement—such as brisk walking, stretching, cycling, or sports—triggers positive endorphin release and clears academic fatigue.",
    });
  }

  // 4. Screen-Time & Digital Wellbeing
  const usage = Number(userData.avg_daily_usage_hours);
  const unlocks = Number(userData.daily_unlocks);
  if (usage > 4 || unlocks > 75) {
    suggestions.push({
      tag: "Screen Time & Digital Balance",
      badge: "Focus",
      text: `With ${usage}h daily on ${userData.most_used_platform || "social apps"} and ${unlocks} unlocks, try setting app time limits and leaving your phone in another room during deep study blocks.`,
    });
  }

  // 5. Study & Work Breaks
  const study = Number(userData.study_hours);
  if (study > 5) {
    suggestions.push({
      tag: "Study Breaks & Pacing",
      badge: "Productivity",
      text: `For ${study}h of daily study, adopt the 50/10 rule: 50 minutes of focused work followed by a strict 10-minute screen-free break to maintain memory consolidation.`,
    });
  }

  // 6. Relaxation Techniques
  if (userData.stress_level === "High" || userData.stress_level === "Very High" || numScore < 5.0) {
    suggestions.push({
      tag: "Relaxation & Breathwork",
      badge: "Stress Relief",
      text: "Practice 4-7-8 deep breathing or a 5-minute progressive muscle relaxation pause when feeling overwhelmed before lectures or exams.",
    });
  }

  // 7. Social Interaction
  if (userData.purpose_of_use !== "Networking" || userData.stress_level === "High") {
    suggestions.push({
      tag: "Social Connection",
      badge: "Connection",
      text: "Dedicate time each week for in-person conversations or shared activities with friends and family. Real human connections buffer against study-related stress.",
    });
  }

  // 8. Healthy Daily Routine
  if (suggestions.length === 0 || numScore >= 7.0) {
    suggestions.push({
      tag: "Healthy Daily Routine",
      badge: "Habits",
      text: "Your self-reported routine demonstrates good balance across academics and lifestyle. Continue sustaining your current sleep, movement, and wellness habits.",
    });
  }

  return suggestions;
}

/**
 * Structured 7-pillar Personalized Wellness Plan tailored to the user's
 * assessment responses and ML prediction.
 */
function generatePersonalizedWellnessPlan(userData, score) {
  const sleep = Number(userData.sleep_hours_per_night || 7);
  const activity = Number(userData.physical_activity_hours || 1);
  const usage = Number(userData.avg_daily_usage_hours || 3);
  const study = Number(userData.study_hours || 4);
  const stress = userData.stress_level || "Medium";

  const goalText = sleep < 7
    ? "Wind down screens 30 minutes before bed tonight"
    : activity < 1
    ? "Take a 20-minute brisk walk outside today"
    : "Take 3 intentional screen-free study breaks today";

  const goalCat = sleep < 7 ? "Sleep" : activity < 1 ? "Movement" : "Study";

  return {
    sleep: {
      title: "Sleep Routine",
      text: sleep < 7
        ? `You reported ${sleep}h of sleep. Aim for 7.5–8.5 hours with an 11:15 PM wind-down routine to restore cognitive stamina.`
        : `Your ${sleep}h of nightly sleep is healthy. Maintain consistent weekend wake times to anchor your circadian rhythm.`,
      icon: "moon",
    },
    activity: {
      title: "Physical Activity",
      text: activity < 1
        ? `Schedule a 20-minute brisk walk or light jog between study sessions to trigger endorphins and clear study fatigue.`
        : `Your ${activity}h of movement supports resilience. Incorporate brief stretches after seated lectures.`,
      icon: "activity",
    },
    screenTime: {
      title: "Digital Wellness",
      text: usage > 3
        ? `With ${usage}h daily on ${userData.most_used_platform || "social media"}, set a 45-minute app limit and keep phones off your desk during study blocks.`
        : `Your ${usage}h of screen use shows healthy balance. Continue silencing non-urgent social notifications.`,
      icon: "phone",
    },
    studyWork: {
      title: "Study Breaks & Pacing",
      text: study > 4
        ? `For ${study}h of daily study, adopt the 50/10 Pomodoro rule: 50 minutes of deep focus followed by 10 minutes strictly away from screens.`
        : `Plan your top 2 priority tasks at the start of each study block to maximize mental energy.`,
      icon: "book",
    },
    relaxation: {
      title: "Relaxation & Breathwork",
      text: stress === "High" || stress === "Very High"
        ? `Try our 3-minute guided box breathing exercise before exams or heavy study blocks to down-regulate nervous tension.`
        : `Take 5 slow breaths with a prolonged exhale when switching between tasks to stay centered.`,
      icon: "breathing",
    },
    social: {
      title: "Social Connection",
      text: `Make time for at least two shared meals or phone calls with supportive friends this week. Real connection buffers stress.`,
      icon: "user",
    },
    dailyGoal: {
      title: "Your Achievable Daily Goal",
      text: goalText,
      category: goalCat,
    },
  };
}

/* ---------------------------------------------------------------------- */
/* Assessment history storage (per user, localStorage)                    */
/* ---------------------------------------------------------------------- */

// Unified MindCareResults delegating to MindCareStore and exposed on window
if (typeof window !== "undefined") {
  window.scoreRanges = scoreRanges;
  window.getScoreCategory = getScoreCategory;
  window.scoreInterpretations = scoreInterpretations;
  window.generateWellnessSuggestions = generateWellnessSuggestions;
  window.generatePersonalizedWellnessPlan = generatePersonalizedWellnessPlan;
  window.MindCareResults = window.MindCareResults || {
    saveAssessment: (email, formData, score, meta) => (window.MindCareStore ? window.MindCareStore.saveAssessment(email, formData, score, meta) : null),
    getHistory: (email) => (window.MindCareStore ? window.MindCareStore.getAssessments(email) : []),
    getLatest: (email) => (window.MindCareStore ? window.MindCareStore.getLatestAssessment(email) : null),
    getById: (email, id) => (window.MindCareStore ? window.MindCareStore.getAssessmentById(email, id) : null),
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
}

