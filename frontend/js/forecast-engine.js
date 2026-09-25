/**
 * forecast-engine.js — Predictive Early-Warning & Wellness Forecasting Engine.
 *
 * Implements:
 *  - Multi-signal daily time-series aggregation (Mood, Journal Sentiment, ML Assessment, Frequency)
 *  - Explicit missing-day handling (bounded linear interpolation + exponential decay baseline)
 *  - Tier 1 Trend-Slope Detector (Rolling WMA + OLS linear regression + R² confidence)
 *  - Horizon Projection (3-7 days) with statistical confidence bounds
 *  - Explainability Layer (identifies top 1-2 relative change drivers)
 *  - Proactive Gentle Nudges (pre-emptive coping suggestions tailored to drivers)
 *  - Safety Guardrails & Non-diagnostic clinical framing
 *  - Clean architectural plug-in point for Tier 2 time-series forecasting
 */

const FORECAST_CONFIG = {
  // Time horizons & gating
  TREND_WINDOW_DAYS: 14,            // Total historical days analyzed in the regression window
  WINDOW_DAYS: 14,                  // Backwards-compatible alias
  MIN_DATA_POINTS: 5,               // Minimum observed active check-in days required before forecasting
  MIN_ACTIVE_DAYS: 5,               // Backwards-compatible alias
  ROLLING_AVG_DAYS: 7,              // Rolling average smoothing window (7 days)
  PROJECTION_DAYS: 5,               // Forecast projection horizon (3-7 days)

  // Signal weighting towards unified daily wellness score (0 - 100 scale)
  WEIGHTS: {
    MOOD: 0.40,                     // Self-reported mood (1-5 scaled to 20-100)
    JOURNAL_SENTIMENT: 0.35,        // Journal text sentiment (1-5 scaled to 20-100)
    ASSESSMENT: 0.25,               // ML Assessment score (0-100)
  },

  // Trend-slope classification thresholds (daily points on 0-100 scale)
  DECLINE_THRESHOLD: -0.35,         // Below -0.35 pts/day indicates downward trend
  DECLINE_SLOPE_THRESHOLD: -0.35,   // Backwards-compatible alias
  IMPROVE_THRESHOLD: 0.35,          // Above +0.35 pts/day indicates upward momentum
  IMPROVE_SLOPE_THRESHOLD: 0.35,    // Backwards-compatible alias
  NUDGE_TRIGGER_SLOPE: -0.45,       // Slope triggering proactive supportive intervention

  // Missing day handling parameters
  MAX_GAP_INTERPOLATE_DAYS: 3,      // Max consecutive missing days to linearly interpolate
  DECAY_HALF_LIFE_DAYS: 7,          // Half-life in days for reverting to baseline during long gaps
  DEFAULT_BASELINE_WELLNESS: 70.0,  // Neutral healthy default if no user baseline exists

  // Tier 2 plug-in configuration
  TIER2_ENABLED: false,             // Flag for Tier 2 time-series upgrade
  TIER2_MIN_DAYS: 14,               // Minimum historical days required for Tier 2
  BACKTEST_HOLD_DAYS: 3,            // Holdout days for silent backtest validation
  BACKTEST_MAE_THRESHOLD: 8.5,      // Max acceptable Mean Absolute Error to surface Tier 2
};

class ForecastEngine {
  constructor(config = FORECAST_CONFIG) {
    this.config = config;
  }

  /**
   * Helper: Formats Date object to 'YYYY-MM-DD' in local time.
   */
  formatDateKey(date) {
    const d = new Date(date);
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, "0");
    const day = String(d.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
  }

  /**
   * 1. Data Aggregation Layer
   * Collapses multi-signal user data into a continuous daily time-series array over the window.
   * Handles missing days explicitly without zero-filling to prevent false drops.
   *
   * @param {Object} rawData - { moods: [], journals: [], assessments: [] }
   * @returns {Object} { dailyPoints: [], observedCount, totalDays, dataDensity, baselineScore }
   */
  aggregateDailyTimeSeries(rawData = {}) {
    const { moods = [], journals = [], assessments = [] } = rawData;
    const windowDays = this.config.TREND_WINDOW_DAYS || this.config.WINDOW_DAYS || 14;

    // Index observations by 'YYYY-MM-DD'
    const moodMap = new Map();
    moods.forEach((m) => {
      if (m && m.date) {
        const k = m.date.slice(0, 10);
        const score = Number(m.mood || 3) * 20; // 1-5 -> 20-100
        moodMap.set(k, {
          score,
          rawMood: m.mood,
          isVoice: Boolean(m.isVoiceEntry),
          vocalScore: m.vocalToneScore ? m.vocalToneScore * 20 : null,
          textSentimentScore: m.textSentimentScore ? m.textSentimentScore * 20 : null
        });
      }
    });

    const journalMap = new Map();
    journals.forEach((j) => {
      const dateKey = j.dateStr || (j.date ? j.date.slice(0, 10) : null);
      if (dateKey && j.content) {
        let sentScore = 60; // neutral default (3.0 * 20)
        if (typeof MindCareSentiment !== "undefined" && MindCareSentiment.analyze) {
          const sent = MindCareSentiment.analyze(j.content);
          sentScore = sent.normalizedScore * 20;
        }
        journalMap.set(dateKey, {
          score: sentScore,
          title: j.title || "Reflection"
        });
      }
    });

    const assessMap = new Map();
    assessments.forEach((a) => {
      const dateKey = a.date ? a.date.slice(0, 10) : (a.created_at ? a.created_at.slice(0, 10) : null);
      if (dateKey) {
        const score100 = a.score_100 !== undefined ? Number(a.score_100) : Number(a.score || 7) * 10;
        assessMap.set(dateKey, { score: score100 });
      }
    });

    // Build day-by-day sequence for the last N days
    const today = new Date();
    const rawDays = [];
    let observedSum = 0;
    let observedCount = 0;

    for (let i = windowDays - 1; i >= 0; i--) {
      const d = new Date(today);
      d.setDate(d.getDate() - i);
      const dateKey = this.formatDateKey(d);

      const moodItem = moodMap.get(dateKey);
      const journalItem = journalMap.get(dateKey);
      const assessItem = assessMap.get(dateKey);

      const isObserved = Boolean(moodItem || journalItem || assessItem);

      let compositeScore = null;
      if (isObserved) {
        let totalWeight = 0;
        let weightedSum = 0;

        if (moodItem) {
          weightedSum += moodItem.score * this.config.WEIGHTS.MOOD;
          totalWeight += this.config.WEIGHTS.MOOD;
        }
        if (journalItem) {
          weightedSum += journalItem.score * this.config.WEIGHTS.JOURNAL_SENTIMENT;
          totalWeight += this.config.WEIGHTS.JOURNAL_SENTIMENT;
        }
        if (assessItem) {
          weightedSum += assessItem.score * this.config.WEIGHTS.ASSESSMENT;
          totalWeight += this.config.WEIGHTS.ASSESSMENT;
        }

        compositeScore = totalWeight > 0 ? Number((weightedSum / totalWeight).toFixed(1)) : 70;
        observedSum += compositeScore;
        observedCount++;
      }

      rawDays.push({
        date: dateKey,
        dayIndex: windowDays - 1 - i,
        dayLabel: d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }),
        isObserved,
        rawScore: compositeScore,
        moodItem,
        journalItem,
        assessItem,
      });
    }

    const baselineScore = observedCount > 0
      ? Number((observedSum / observedCount).toFixed(1))
      : this.config.DEFAULT_BASELINE_WELLNESS;

    // -------------------------------------------------------------------------
    // Handle Missing Days Explicitly (Bounded Interpolation + Baseline Decay)
    // -------------------------------------------------------------------------
    const dailyPoints = [];
    let lastKnownScore = null;
    let lastKnownIdx = -1;

    for (let i = 0; i < rawDays.length; i++) {
      const cur = rawDays[i];

      if (cur.isObserved) {
        // If there were missing days preceding this observed day, interpolate
        if (lastKnownIdx !== -1 && i - lastKnownIdx > 1) {
          const gapSize = i - lastKnownIdx - 1;
          const startVal = lastKnownScore;
          const endVal = cur.rawScore;

          for (let g = 1; g <= gapSize; g++) {
            const gapIdx = lastKnownIdx + g;
            let filledVal;

            if (gapSize <= this.config.MAX_GAP_INTERPOLATE_DAYS) {
              // Bounded linear interpolation for short gaps
              const factor = g / (gapSize + 1);
              filledVal = startVal + factor * (endVal - startVal);
            } else {
              // Decay gently towards baseline for longer gaps
              const decayFactor = Math.exp(-g / this.config.DECAY_HALF_LIFE_DAYS);
              filledVal = baselineScore + (startVal - baselineScore) * decayFactor;
            }

            dailyPoints[gapIdx] = {
              ...rawDays[gapIdx],
              wellnessScore: Number(filledVal.toFixed(1)),
              isInterpolated: true,
            };
          }
        }

        dailyPoints[i] = {
          ...cur,
          wellnessScore: cur.rawScore,
          isInterpolated: false,
        };

        lastKnownScore = cur.rawScore;
        lastKnownIdx = i;
      }
    }

    // Handle any missing days at the beginning (before first observation)
    const firstObsIdx = dailyPoints.findIndex((p) => p && !p.isInterpolated);
    if (firstObsIdx > 0) {
      const firstVal = dailyPoints[firstObsIdx].wellnessScore;
      for (let i = 0; i < firstObsIdx; i++) {
        dailyPoints[i] = {
          ...rawDays[i],
          wellnessScore: Number(firstVal.toFixed(1)),
          isInterpolated: true,
        };
      }
    }

    // Handle any trailing missing days at the end (after last observation)
    if (lastKnownIdx !== -1 && lastKnownIdx < rawDays.length - 1) {
      for (let i = lastKnownIdx + 1; i < rawDays.length; i++) {
        const gapDays = i - lastKnownIdx;
        const decayFactor = Math.exp(-gapDays / this.config.DECAY_HALF_LIFE_DAYS);
        const filledVal = baselineScore + (lastKnownScore - baselineScore) * decayFactor;

        dailyPoints[i] = {
          ...rawDays[i],
          wellnessScore: Number(filledVal.toFixed(1)),
          isInterpolated: true,
        };
      }
    }

    // If completely empty, fill with baseline
    if (observedCount === 0) {
      for (let i = 0; i < rawDays.length; i++) {
        dailyPoints[i] = {
          ...rawDays[i],
          wellnessScore: baselineScore,
          isInterpolated: true,
        };
      }
    }

    const dataDensity = Number((observedCount / windowDays).toFixed(2));

    return {
      dailyPoints,
      observedCount,
      totalDays: windowDays,
      dataDensity,
      baselineScore,
    };
  }

  /**
   * 2. Tier 1 Trend-Slope Detector (OLS Regression over Rolling Average)
   *
   * @param {Array} dailyPoints - Continuous daily time-series array.
   * @param {number} dataDensity - Ratio of observed days to total days.
   * @returns {Object} Regression parameters: slope, intercept, rSquared, confidence, stdErr
   */
  calculateTrendSlope(dailyPoints, dataDensity) {
    const N = dailyPoints.length;
    if (N < 2) {
      return { slope: 0, intercept: 70, rSquared: 0, confidence: 0, stdErr: 0, smoothedScores: [] };
    }

    // Rolling Average (default 7 days) to smooth daily jitter
    const windowSize = this.config.ROLLING_AVG_DAYS || 7;
    const smoothed = [];
    for (let i = 0; i < N; i++) {
      const startIdx = Math.max(0, i - windowSize + 1);
      const windowSlice = dailyPoints.slice(startIdx, i + 1);
      const sum = windowSlice.reduce((acc, p) => acc + (p.wellnessScore !== undefined ? p.wellnessScore : 70), 0);
      const avg = sum / windowSlice.length;
      smoothed.push(Number(avg.toFixed(2)));
    }

    // Ordinary Least Squares (OLS) Regression on smoothed scores
    let sumX = 0;
    let sumY = 0;
    let sumXY = 0;
    let sumXX = 0;

    for (let i = 0; i < N; i++) {
      const x = i;
      const y = smoothed[i];
      sumX += x;
      sumY += y;
      sumXY += x * y;
      sumXX += x * x;
    }

    const meanX = sumX / N;
    const meanY = sumY / N;

    const denominator = sumXX - N * meanX * meanX;
    const slope = denominator !== 0 ? (sumXY - N * meanX * meanY) / denominator : 0;
    const intercept = meanY - slope * meanX;

    // Compute R² (Coefficient of Determination) & Standard Error
    let ssTot = 0;
    let ssRes = 0;

    for (let i = 0; i < N; i++) {
      const y = smoothed[i];
      const yPred = intercept + slope * i;
      ssTot += Math.pow(y - meanY, 2);
      ssRes += Math.pow(y - yPred, 2);
    }

    const rSquared = ssTot > 0 ? Math.max(0, Math.min(1.0, 1.0 - ssRes / ssTot)) : 0;
    const stdErr = N > 2 ? Math.sqrt(ssRes / (N - 2)) : 1.0;

    // Confidence composite (0 - 1) computed from R² and user data density
    const confidence = Number(Math.max(0, Math.min(1.0, rSquared * dataDensity)).toFixed(2));

    return {
      slope: Number(slope.toFixed(3)),
      intercept: Number(intercept.toFixed(2)),
      rSquared: Number(rSquared.toFixed(2)),
      confidence,
      stdErr: Number(stdErr.toFixed(2)),
      smoothedScores: smoothed,
      meanX,
      sumXX,
    };
  }

  /**
   * 3. Horizon Projection (3-7 Days) with Confidence Intervals
   *
   * @param {Object} regression - Result from calculateTrendSlope
   * @param {Array} dailyPoints - Historical daily points
   * @returns {Array} Projected daily points with upper and lower bounds
   */
  projectHorizon(regression, dailyPoints) {
    const { slope, intercept, stdErr, meanX, sumXX, smoothedScores } = regression;
    const N = dailyPoints.length;
    const projectionDays = this.config.PROJECTION_DAYS;
    const projected = [];

    const lastDateStr = dailyPoints[dailyPoints.length - 1].date;
    const baseDate = new Date(lastDateStr);

    // Anchor projection to the latest smoothed value
    const lastSmoothedVal = smoothedScores[smoothedScores.length - 1];

    for (let k = 1; k <= projectionDays; k++) {
      const d = new Date(baseDate);
      d.setDate(d.getDate() + k);
      const dateKey = this.formatDateKey(d);

      // Expected predicted score clamped between [10, 100]
      const expectedScore = Math.max(10, Math.min(100, Number((lastSmoothedVal + slope * k).toFixed(1))));

      // Prediction interval standard error expansion: SE * sqrt(1 + 1/N + (x - x_bar)^2 / Sxx)
      const xFuture = N - 1 + k;
      const leverage = (sumXX - N * meanX * meanX) > 0 ? Math.pow(xFuture - meanX, 2) / (sumXX - N * meanX * meanX) : 0;
      const forecastStdErr = stdErr * Math.sqrt(1 + 1 / N + leverage);
      const margin = 1.645 * forecastStdErr; // 90% confidence interval

      projected.push({
        date: dateKey,
        dayLabel: d.toLocaleDateString("en-US", { weekday: "short", month: "numeric", day: "numeric" }),
        projectedScore: expectedScore,
        upperBound: Math.min(100, Number((expectedScore + margin).toFixed(1))),
        lowerBound: Math.max(10, Number((expectedScore - margin).toFixed(1))),
        dayOffset: k,
      });
    }

    return projected;
  }

  /**
   * 4. Explainability Layer
   * Computes relative % change per input feature between the first half and second half of the window.
   * Identifies concrete driving factors behind a forecasted slope.
   *
   * @param {Array} dailyPoints - Historical daily points
   * @returns {Object} { topFactor, factors }
   */
  computeExplainabilityFactors(dailyPoints) {
    const N = dailyPoints.length;
    const half = Math.floor(N / 2);
    const priorHalf = dailyPoints.slice(0, half);
    const recentHalf = dailyPoints.slice(half);

    // A. Check-in Consistency / Frequency
    const priorObsCount = priorHalf.filter((p) => p.isObserved).length;
    const recentObsCount = recentHalf.filter((p) => p.isObserved).length;
    let freqPctChange = 0;
    if (priorObsCount > 0) {
      freqPctChange = ((recentObsCount - priorObsCount) / priorObsCount) * 100;
    } else if (recentObsCount > 0) {
      freqPctChange = 100;
    }

    // B. Mood Ratings Delta
    const priorMoods = priorHalf.map((p) => p.moodItem?.rawMood).filter((v) => typeof v === "number");
    const recentMoods = recentHalf.map((p) => p.moodItem?.rawMood).filter((v) => typeof v === "number");
    const priorMoodAvg = priorMoods.length ? priorMoods.reduce((a, b) => a + b, 0) / priorMoods.length : null;
    const recentMoodAvg = recentMoods.length ? recentMoods.reduce((a, b) => a + b, 0) / recentMoods.length : null;
    let moodPctChange = 0;
    if (priorMoodAvg !== null && recentMoodAvg !== null && priorMoodAvg > 0) {
      moodPctChange = ((recentMoodAvg - priorMoodAvg) / priorMoodAvg) * 100;
    }

    // C. Journal Sentiment Delta
    const priorSents = priorHalf.map((p) => p.journalItem?.score).filter((v) => typeof v === "number");
    const recentSents = recentHalf.map((p) => p.journalItem?.score).filter((v) => typeof v === "number");
    const priorSentAvg = priorSents.length ? priorSents.reduce((a, b) => a + b, 0) / priorSents.length : null;
    const recentSentAvg = recentSents.length ? recentSents.reduce((a, b) => a + b, 0) / recentSents.length : null;
    let sentPctChange = 0;
    if (priorSentAvg !== null && recentSentAvg !== null && priorSentAvg > 0) {
      sentPctChange = ((recentSentAvg - priorSentAvg) / priorSentAvg) * 100;
    }

    // D. Voice Vitality Delta (if voice entries exist)
    const priorVoices = priorHalf.map((p) => p.moodItem?.vocalScore).filter((v) => typeof v === "number");
    const recentVoices = recentHalf.map((p) => p.moodItem?.vocalScore).filter((v) => typeof v === "number");
    const priorVoiceAvg = priorVoices.length ? priorVoices.reduce((a, b) => a + b, 0) / priorVoices.length : null;
    const recentVoiceAvg = recentVoices.length ? recentVoices.reduce((a, b) => a + b, 0) / recentVoices.length : null;
    let voicePctChange = 0;
    if (priorVoiceAvg !== null && recentVoiceAvg !== null && priorVoiceAvg > 0) {
      voicePctChange = ((recentVoiceAvg - priorVoiceAvg) / priorVoiceAvg) * 100;
    }

    const candidateList = [];

    // Frequency candidate
    if (priorObsCount > 0 || recentObsCount > 0) {
      const absVal = Math.abs(freqPctChange);
      const dir = freqPctChange >= 0 ? "up" : "down";
      const rounded = Math.round(absVal);
      candidateList.push({
        factor: "frequency",
        absPct: absVal,
        impact: freqPctChange >= 0 ? "positive" : "negative",
        humanString: `check-in frequency ${dir} ${rounded}% this week`,
        title: "Check-in Consistency",
        description: `Daily check-in regularity shifted ${dir} ${rounded}% (${recentObsCount} of ${half} recent days logged vs ${priorObsCount} prior).`,
      });
    }

    // Mood candidate
    if (priorMoodAvg !== null && recentMoodAvg !== null) {
      const absVal = Math.abs(moodPctChange);
      const dir = moodPctChange >= 0 ? "up" : "down";
      const rounded = Math.round(absVal);
      candidateList.push({
        factor: "mood",
        absPct: absVal,
        impact: moodPctChange >= 0 ? "positive" : "negative",
        humanString: `mood average ${dir} ${rounded}% this week`,
        title: "Self-Reported Mood Ratings",
        description: `Daily check-in ratings have averaged ${dir} ${rounded}% (${recentMoodAvg.toFixed(1)}/5 vs ${priorMoodAvg.toFixed(1)}/5).`,
      });
    }

    // Sentiment candidate
    if (priorSentAvg !== null && recentSentAvg !== null) {
      const absVal = Math.abs(sentPctChange);
      const dir = sentPctChange >= 0 ? "up" : "down";
      const rounded = Math.round(absVal);
      candidateList.push({
        factor: "sentiment",
        absPct: absVal,
        impact: sentPctChange >= 0 ? "positive" : "negative",
        humanString: `journal sentiment ${dir} ${rounded}% this week`,
        title: "Journal Reflection Sentiment",
        description: `Journal reflection sentiment shifted ${dir} ${rounded}% compared to prior entries.`,
      });
    }

    // Voice candidate (secondary)
    if (priorVoiceAvg !== null && recentVoiceAvg !== null && Math.abs(voicePctChange) > 5) {
      const absVal = Math.abs(voicePctChange);
      const dir = voicePctChange >= 0 ? "up" : "down";
      const rounded = Math.round(absVal);
      candidateList.push({
        factor: "voice",
        absPct: absVal,
        impact: voicePctChange >= 0 ? "positive" : "negative",
        humanString: `vocal tone vitality ${dir} ${rounded}% this week`,
        title: "Vocal Energy & Vitality",
        description: `Voice check-in acoustic patterns indicate vocal vitality shifted ${dir} ${rounded}%.`,
      });
    }

    candidateList.sort((a, b) => b.absPct - a.absPct);

    let topFactor = null;
    if (candidateList.length > 0 && candidateList[0].absPct > 0) {
      topFactor = candidateList[0].humanString;
    } else {
      topFactor = "stable check-in and mood patterns";
    }

    const factors = candidateList.length > 0 ? candidateList.slice(0, 2) : [
      {
        factor: "balance",
        impact: "neutral",
        title: "Balanced Daily Routine",
        description: "Your check-in ratings and journal expressions have remained steady and balanced across this period.",
      },
    ];

    return { topFactor, factors };
  }

  /**
   * 5. Proactive Nudge Generator
   * Maps slope trend and explainability factor to a gentle, non-alarmist intervention.
   *
   * @param {string} trendType - 'declining' | 'steady' | 'improving'
   * @param {Array} factors - Top explainability factors
   * @returns {Object|null} Gentle nudge object { title, message, actionLabel, actionUrl, icon }
   */
  generateProactiveNudge(trendType, factors = []) {
    if (trendType !== "declining") return null;

    const primary = factors[0] || {};

    if (primary.factor === "sentiment") {
      return {
        title: "Gentle Pause: Guided Reflection",
        message: "Your recent journal entries reflect noticeable pressure. Taking 3 minutes for a mindful breathing pause can help de-escalate tension.",
        actionLabel: "Start 3-Min Breathing Pause",
        actionUrl: "breathing.html",
        icon: "🌬️",
      };
    }

    if (primary.factor === "frequency") {
      return {
        title: "Keep It Light: Quick 10-Second Check-in",
        message: "Life gets busy, and check-ins have slowed down this week. Remember, even a single emoji check-in helps you stay attuned to your patterns.",
        actionLabel: "Do a 10-Sec Check-in",
        actionUrl: "mood.html",
        icon: "✨",
      };
    }

    if (primary.factor === "mood") {
      return {
        title: "Supportive Check-in with AI",
        message: "Patterns suggest emotional energy has been a bit softer lately. Our empathetic companion is here anytime if you'd like to talk through your thoughts.",
        actionLabel: "Chat with AI Companion",
        actionUrl: "dashboard.html#chat",
        icon: "💬",
      };
    }

    // General supportive nudge
    return {
      title: "Proactive Self-Care Recommendation",
      message: "Your wellness trajectory shows a slight downward bend. Prioritize sleep wind-down and a 15-minute screen-free break today to restore balance.",
      actionLabel: "View Restorative Tips",
      actionUrl: "resources.html",
      icon: "🌱",
    };
  }

  /**
   * [TIER 2 PLUG-IN INTERFACE]
   * Reserved architectural hook for Exponential Smoothing / Prophet time-series models.
   * Silently validates forecast with backtest holdout before surfacing.
   */
  fitTimeSeriesForecast(timeSeries) {
    if (!this.config.TIER2_ENABLED || timeSeries.observedCount < this.config.TIER2_MIN_DAYS) {
      return null; // Gracefully fall back to Tier 1
    }

    // Silent backtest validation holdout
    const holdoutDays = this.config.BACKTEST_HOLD_DAYS;
    // ... Tier 2 model fitting (e.g. Holt-Winters Double Exponential Smoothing) ...
    const backtestMAE = 999; // Mock placeholder

    if (backtestMAE > this.config.BACKTEST_MAE_THRESHOLD) {
      return null; // Fall back to Tier 1 if backtest error exceeds threshold
    }

    return null;
  }

  /**
   * Main Orchestrator
   * Executes the full pipeline and returns the complete forecast bundle.
   *
   * @param {Object} rawData - { moods, journals, assessments }
   * @returns {Object} Forecast bundle adhering to Tier 1 Output Contract
   */
  generateForecast(rawData = {}) {
    // 1. Data Aggregation
    const timeSeries = this.aggregateDailyTimeSeries(rawData);

    // 2. Minimum Data Requirement / Cold-Start Gate
    const minPoints = this.config.MIN_DATA_POINTS || this.config.MIN_ACTIVE_DAYS || 5;
    if (timeSeries.observedCount < minPoints) {
      const nextUnlockIn = Math.max(0, minPoints - timeSeries.observedCount);
      return {
        status: "insufficient_data",
        slope: 0,
        confidence: 0,
        dataPointsUsed: timeSeries.observedCount,
        topFactor: null,
        nextUnlockIn,
        // UI helper properties
        observedCount: timeSeries.observedCount,
        requiredCount: minPoints,
        message: `Log ${nextUnlockIn} more daily check-in${nextUnlockIn === 1 ? "" : "s"} to unlock your personalized early-warning forecast.`,
        dataDensity: timeSeries.dataDensity,
      };
    }

    // 3. Tier 1 Regression over Rolling Average
    const regression = this.calculateTrendSlope(timeSeries.dailyPoints, timeSeries.dataDensity);

    // 4. Horizon Projection (3-7 days)
    const projections = this.projectHorizon(regression, timeSeries.dailyPoints);

    // 5. Trend Classification
    const declineThresh = this.config.DECLINE_THRESHOLD !== undefined ? this.config.DECLINE_THRESHOLD : (this.config.DECLINE_SLOPE_THRESHOLD || -0.35);
    const improveThresh = this.config.IMPROVE_THRESHOLD !== undefined ? this.config.IMPROVE_THRESHOLD : (this.config.IMPROVE_SLOPE_THRESHOLD || 0.35);

    let status = "stable";
    let trendLabel = "Balanced & Steady";
    let trendBadgeClass = "badge-moderate";

    if (regression.slope <= declineThresh) {
      status = "declining";
      trendLabel = "Softening Trend (Potential Dip)";
      trendBadgeClass = "badge-low";
    } else if (regression.slope >= improveThresh) {
      status = "improving";
      trendLabel = "Upward Momentum";
      trendBadgeClass = "badge-higher";
    }

    // 6. Explainability Layer (Relative % Change Drivers)
    const { topFactor, factors } = this.computeExplainabilityFactors(timeSeries.dailyPoints);

    // 7. Proactive Nudge
    const nudge = this.generateProactiveNudge(status === "stable" ? "steady" : status, factors);

    // 8. Safety Boundary
    const safetyDisclaimer =
      "Pattern Observation: This forecast is a behavioral wellness indicator based on your self-reported check-ins, not a medical diagnosis or crisis tool. If you feel persistently overwhelmed, please connect with trusted friends, campus counselors, or emergency resources.";

    return {
      status,
      slope: regression.slope,
      confidence: regression.confidence,
      dataPointsUsed: timeSeries.observedCount,
      topFactor,
      nextUnlockIn: null,

      // UI rendering & rich display fields
      trendType: status === "stable" ? "steady" : status,
      trendLabel,
      trendBadgeClass,
      rSquared: regression.rSquared,
      historicalPoints: timeSeries.dailyPoints,
      projectedPoints: projections,
      smoothedScores: regression.smoothedScores,
      factors,
      nudge,
      safetyDisclaimer,
      meta: {
        observedDays: timeSeries.observedCount,
        totalWindowDays: this.config.TREND_WINDOW_DAYS || this.config.WINDOW_DAYS || 14,
        dataDensity: timeSeries.dataDensity,
        baselineScore: timeSeries.baselineScore,
      },
    };
  }
}

// Global and CommonJS export
if (typeof window !== "undefined") {
  window.ForecastEngine = ForecastEngine;
  window.FORECAST_CONFIG = FORECAST_CONFIG;
  window.MindCareForecast = new ForecastEngine();
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { ForecastEngine, FORECAST_CONFIG };
}
