/**
 * sentiment.js — Client-Side Sentiment Analysis Engine for MindCare AI.
 * Runs 100% in-browser with zero latency, zero API calls, and zero external dependencies.
 * Uses a curated valence lexicon with negation handling and intensifiers.
 */

const MindCareSentiment = (() => {
  // Curated sentiment valence lexicon (-3 to +3)
  const LEXICON = {
    // Highly positive (+3)
    great: 3, excellent: 3, fantastic: 3, wonderful: 3, amazing: 3, brilliant: 3,
    awesome: 3, overjoyed: 3, ecstatic: 3, peaceful: 3, grateful: 3, thrive: 3,
    thriving: 3, loved: 3, confident: 3, motivated: 3, refreshed: 3, joyful: 3,
    // Moderately positive (+2)
    happy: 2, good: 2, glad: 2, calm: 2, relaxed: 2, proud: 2, excited: 2,
    energized: 2, healthy: 2, content: 2, positive: 2, productive: 2, accomplished: 2,
    relief: 2, relieved: 2, hopeful: 2, inspired: 2, satisfied: 2, focused: 2,
    // Mildly positive (+1)
    fine: 1, okay: 1, ok: 1, decent: 1, stable: 1, better: 1, improving: 1,
    fair: 1, safe: 1, clear: 1, pleasant: 1, ready: 1, steady: 1, nice: 1,
    // Mildly negative (-1)
    tired: -1, busy: -1, bored: -1, sluggish: -1, distracted: -1, unsure: -1,
    restless: -1, nervous: -1, uneasy: -1, overwhelmed: -1, confused: -1,
    pressured: -1, drained: -1, rushed: -1, lonely: -1,
    // Moderately negative (-2)
    sad: -2, down: -2, stressed: -2, anxious: -2, worried: -2, upset: -2,
    frustrated: -2, annoyed: -2, exhausted: -2, burnt: -2, burnout: -2,
    helpless: -2, angry: -2, hurt: -2, discouraged: -2, isolated: -2,
    // Highly negative (-3)
    depressed: -3, hopeless: -3, miserable: -3, panic: -3, terrified: -3,
    awful: -3, terrible: -3, devastated: -3, worthless: -3, hated: -3,
    agony: -3, despair: -3, crushed: -3
  };

  // Negation words that flip polarity
  const NEGATIONS = new Set([
    "not", "no", "never", "hardly", "barely", "scarcely", "without",
    "neither", "nor", "can't", "cannot", "dont", "don't", "wont", "won't",
    "isnt", "isn't", "arent", "aren't", "wasnt", "wasn't", "couldnt", "couldn't"
  ]);

  // Intensifiers that amplify valence
  const INTENSIFIERS = {
    very: 1.5, extremely: 1.8, really: 1.4, super: 1.5, deeply: 1.6,
    so: 1.3, totally: 1.5, incredibly: 1.7, completely: 1.6, absolutely: 1.7,
    quite: 1.2, pretty: 1.2, somewhat: 0.8, slightly: 0.6, little: 0.7
  };

  /**
   * Analyzes text string and returns comprehensive sentiment metrics.
   * @param {string} text - Raw input text or speech transcript.
   * @returns {Object} { rawScore, normalizedScore, label, polarity, wordCount, matchedKeywords }
   */
  function analyze(text) {
    if (!text || typeof text !== "string") {
      return {
        rawScore: 0,
        normalizedScore: 3.0, // Neutral
        label: "Neutral",
        polarity: "neutral",
        wordCount: 0,
        matchedKeywords: []
      };
    }

    const tokens = text
      .toLowerCase()
      .replace(/[^\w\s'-]/g, " ")
      .split(/\s+/)
      .filter(Boolean);

    if (tokens.length === 0) {
      return {
        rawScore: 0,
        normalizedScore: 3.0,
        label: "Neutral",
        polarity: "neutral",
        wordCount: 0,
        matchedKeywords: []
      };
    }

    let totalScore = 0;
    let matchedCount = 0;
    const matchedKeywords = [];

    for (let i = 0; i < tokens.length; i++) {
      const token = tokens[i];
      let baseValence = LEXICON[token] || 0;

      // Handle simple stemming for common suffixes (e.g. "stressed" -> "stress")
      if (baseValence === 0 && token.endsWith("ing")) {
        const root = token.slice(0, -3);
        baseValence = LEXICON[root] || 0;
      }

      if (baseValence !== 0) {
        let modifier = 1.0;

        // Check 1-2 words preceding for intensifier
        if (i > 0 && INTENSIFIERS[tokens[i - 1]]) {
          modifier *= INTENSIFIERS[tokens[i - 1]];
        } else if (i > 1 && INTENSIFIERS[tokens[i - 2]]) {
          modifier *= INTENSIFIERS[tokens[i - 2]];
        }

        // Check 1-3 words preceding for negation
        let isNegated = false;
        for (let j = Math.max(0, i - 3); j < i; j++) {
          if (NEGATIONS.has(tokens[j])) {
            isNegated = true;
            break;
          }
        }

        let wordScore = baseValence * modifier;
        if (isNegated) {
          // Negation flips and dampens polarity
          wordScore = -wordScore * 0.75;
        }

        totalScore += wordScore;
        matchedCount++;
        matchedKeywords.push({
          word: token,
          valence: wordScore,
          isNegated
        });
      }
    }

    // Average valence per matched sentiment token, bounded [-3, +3]
    const avgValence = matchedCount > 0 ? Math.max(-3, Math.min(3, totalScore / Math.sqrt(matchedCount))) : 0;

    // Map [-3, +3] to [1.0, 5.0] mood scale
    // -3 -> 1.0, 0 -> 3.0, +3 -> 5.0
    const normalizedScore = Math.max(1.0, Math.min(5.0, Number((3.0 + (avgValence / 3.0) * 2.0).toFixed(2))));

    let label = "Neutral";
    let polarity = "neutral";
    if (normalizedScore >= 4.2) {
      label = "Very Positive";
      polarity = "positive";
    } else if (normalizedScore >= 3.4) {
      label = "Positive";
      polarity = "positive";
    } else if (normalizedScore <= 1.8) {
      label = "Very Negative";
      polarity = "negative";
    } else if (normalizedScore <= 2.6) {
      label = "Negative";
      polarity = "negative";
    }

    return {
      rawScore: Number(totalScore.toFixed(2)),
      normalizedScore, // 1.0 - 5.0
      label,
      polarity,
      wordCount: tokens.length,
      matchedCount,
      matchedKeywords
    };
  }

  return {
    analyze,
    LEXICON
  };
})();

if (typeof window !== "undefined") {
  window.MindCareSentiment = MindCareSentiment;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = MindCareSentiment;
}
