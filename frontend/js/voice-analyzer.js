/**
 * voice-analyzer.js — Real-Time Vocal Acoustic Signal Extraction for MindCare AI.
 *
 * Uses the native Web Audio API (AudioContext & AnalyserNode) to analyze raw audio
 * signals in-memory without saving or transmitting raw recordings.
 *
 * Extracted Signals:
 *  1. Speaking Rate (words per second)
 *  2. Pitch Variance (Autocorrelation F0 detection in 70Hz - 400Hz range)
 *  3. Pause Frequency & Duration (silence gaps > 350ms)
 *  4. Volume / Energy Variance (RMS amplitude standard deviation)
 *
 * Vocal Tone Score:
 *  Maps acoustic features to a 1.0 - 5.0 scale (Flat/Low Energy -> Animated/High Energy)
 *  with documented thresholds for easy tuning.
 */

const VOCAL_THRESHOLDS = {
  // Silence threshold for speech/pause detection (RMS energy)
  SILENCE_RMS: 0.015,
  // Minimum silence duration in seconds to count as a conscious pause
  MIN_PAUSE_DURATION_SEC: 0.35,
  // Human vocal range for autocorrelation pitch detection (Hz)
  MIN_PITCH_HZ: 70,
  MAX_PITCH_HZ: 400,
  // Autocorrelation clarity threshold for voiced speech
  PITCH_CLARITY_THRESHOLD: 0.85,

  // Pitch variance thresholds (Hz standard deviation)
  PITCH_VAR_FLAT: 20.0,       // Below 20 Hz std-dev is monotone/flat
  PITCH_VAR_MODERATE: 40.0,   // 20 - 40 Hz is typical conversational range
  PITCH_VAR_ANIMATED: 60.0,   // Above 40-60 Hz is highly expressive

  // Pause duration ratio (% of elapsed time in silence)
  PAUSE_RATIO_HIGH: 0.38,     // >38% pause indicates hesitant/lethargic pacing
  PAUSE_RATIO_LOW: 0.15,      // <15% pause indicates brisk/continuous pacing

  // Energy variance (RMS standard deviation)
  ENERGY_VAR_FLAT: 0.018,     // Flat volume dynamics
  ENERGY_VAR_DYNAMIC: 0.045,  // Dynamic, expressive volume shifts

  // Speaking rate (words per speaking second)
  SPEAKING_RATE_SLOW: 1.6,    // < 1.6 wps
  SPEAKING_RATE_NORMAL: 2.5,  // 1.6 - 2.8 wps
  SPEAKING_RATE_FAST: 3.2,    // > 3.2 wps
};

class VoiceAnalyzer {
  constructor() {
    this.audioContext = null;
    this.analyser = null;
    this.mediaStream = null;
    this.sourceNode = null;
    this.animFrameId = null;
    this.sampleIntervalId = null;

    this.isRecording = false;
    this.startTime = 0;
    this.stopTime = 0;

    // Time-series frame samples collected during recording
    this.rmsSamples = [];
    this.pitchSamples = [];
    this.pauses = [];
    this.currentPauseStart = null;

    // Visualizer canvas reference
    this.canvas = null;
    this.canvasCtx = null;
  }

  /**
   * Initializes audio context and connects microphone stream.
   * @param {MediaStream} stream - Active microphone MediaStream.
   * @param {HTMLCanvasElement} [canvas] - Optional canvas for waveform rendering.
   */
  start(stream, canvas = null) {
    const AudioContextClass = window.AudioContext || window.webkitAudioContext;
    if (!AudioContextClass) {
      throw new Error("Web Audio API is not supported in this browser.");
    }

    this.audioContext = new AudioContextClass();
    this.analyser = this.audioContext.createAnalyser();
    this.analyser.fftSize = 2048; // Higher resolution for autocorrelation
    this.analyser.smoothingTimeConstant = 0.8;

    this.mediaStream = stream;
    this.sourceNode = this.audioContext.createMediaStreamSource(stream);
    this.sourceNode.connect(this.analyser);

    this.canvas = canvas;
    if (this.canvas) {
      this.canvasCtx = this.canvas.getContext("2d");
    }

    this.isRecording = true;
    this.startTime = performance.now();
    this.rmsSamples = [];
    this.pitchSamples = [];
    this.pauses = [];
    this.currentPauseStart = null;

    // Start live visualizer
    if (this.canvas) {
      this._drawWaveform();
    }

    // Sample acoustic features every 50ms
    this.sampleIntervalId = setInterval(() => {
      this._sampleAudioFrame();
    }, 50);
  }

  /**
   * Samples current audio buffer and evaluates RMS energy, pause state, and pitch.
   * @private
   */
  _sampleAudioFrame() {
    if (!this.isRecording || !this.analyser) return;

    const buffer = new Float32Array(this.analyser.fftSize);
    this.analyser.getFloatTimeDomainData(buffer);

    // 1. Compute RMS Volume
    let sumSquares = 0;
    for (let i = 0; i < buffer.length; i++) {
      sumSquares += buffer[i] * buffer[i];
    }
    const rms = Math.sqrt(sumSquares / buffer.length);
    this.rmsSamples.push(rms);

    const nowSec = (performance.now() - this.startTime) / 1000;

    // 2. Pause Tracking (silence gaps > MIN_PAUSE_DURATION_SEC)
    if (rms < VOCAL_THRESHOLDS.SILENCE_RMS) {
      if (this.currentPauseStart === null) {
        this.currentPauseStart = nowSec;
      }
    } else {
      if (this.currentPauseStart !== null) {
        const pauseDuration = nowSec - this.currentPauseStart;
        if (pauseDuration >= VOCAL_THRESHOLDS.MIN_PAUSE_DURATION_SEC) {
          this.pauses.push({
            start: this.currentPauseStart,
            duration: pauseDuration
          });
        }
        this.currentPauseStart = null;
      }

      // 3. Pitch Detection via Autocorrelation on voiced speech
      const pitch = this._detectPitchAutocorrelation(buffer, this.audioContext.sampleRate);
      if (pitch !== null && pitch >= VOCAL_THRESHOLDS.MIN_PITCH_HZ && pitch <= VOCAL_THRESHOLDS.MAX_PITCH_HZ) {
        this.pitchSamples.push(pitch);
      }
    }
  }

  /**
   * Performs Normalized Square Difference Autocorrelation to extract Fundamental Frequency (F0).
   * @private
   */
  _detectPitchAutocorrelation(buffer, sampleRate) {
    const size = buffer.length;
    const minPeriod = Math.floor(sampleRate / VOCAL_THRESHOLDS.MAX_PITCH_HZ);
    const maxPeriod = Math.floor(sampleRate / VOCAL_THRESHOLDS.MIN_PITCH_HZ);

    let bestR = 0;
    let bestPeriod = -1;

    // Compute energy
    let energy = 0;
    for (let i = 0; i < size; i++) {
      energy += buffer[i] * buffer[i];
    }
    if (energy < 0.001) return null; // Silent frame

    for (let period = minPeriod; period <= maxPeriod; period++) {
      let r = 0;
      for (let i = 0; i < size - period; i++) {
        r += buffer[i] * buffer[i + period];
      }
      const normalizedR = r / energy;

      if (normalizedR > bestR && normalizedR > VOCAL_THRESHOLDS.PITCH_CLARITY_THRESHOLD) {
        bestR = normalizedR;
        bestPeriod = period;
      }
    }

    if (bestPeriod > 0) {
      return sampleRate / bestPeriod;
    }
    return null;
  }

  /**
   * Smooth live waveform drawing on HTML5 Canvas.
   * @private
   */
  _drawWaveform() {
    if (!this.isRecording || !this.canvas || !this.canvasCtx || !this.analyser) return;

    const ctx = this.canvasCtx;
    const width = this.canvas.width;
    const height = this.canvas.height;
    const dataArray = new Uint8Array(this.analyser.frequencyBinCount);
    this.analyser.getByteTimeDomainData(dataArray);

    ctx.clearRect(0, 0, width, height);

    // Subtle background grid line
    ctx.lineWidth = 1;
    ctx.strokeStyle = "rgba(47, 93, 80, 0.12)";
    ctx.beginPath();
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();

    // Waveform line
    ctx.lineWidth = 2.5;
    ctx.strokeStyle = "#3F7D5C";
    ctx.beginPath();

    const sliceWidth = width / dataArray.length;
    let x = 0;

    for (let i = 0; i < dataArray.length; i++) {
      const v = dataArray[i] / 128.0; // 0.0 - 2.0
      const y = (v * height) / 2;

      if (i === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
      x += sliceWidth;
    }

    ctx.stroke();

    this.animFrameId = requestAnimationFrame(() => this._drawWaveform());
  }

  /**
   * Stops recording and releases microphone/Web Audio resources safely.
   */
  stop() {
    this.isRecording = false;
    this.stopTime = performance.now();

    if (this.sampleIntervalId) {
      clearInterval(this.sampleIntervalId);
      this.sampleIntervalId = null;
    }

    if (this.animFrameId) {
      cancelAnimationFrame(this.animFrameId);
      this.animFrameId = null;
    }

    // Close any trailing pause
    if (this.currentPauseStart !== null) {
      const nowSec = (this.stopTime - this.startTime) / 1000;
      const pauseDuration = nowSec - this.currentPauseStart;
      if (pauseDuration >= VOCAL_THRESHOLDS.MIN_PAUSE_DURATION_SEC) {
        this.pauses.push({
          start: this.currentPauseStart,
          duration: pauseDuration
        });
      }
      this.currentPauseStart = null;
    }

    // Clear canvas
    if (this.canvas && this.canvasCtx) {
      this.canvasCtx.clearRect(0, 0, this.canvas.width, this.canvas.height);
    }

    // Release audio resources (In-memory privacy guarantee)
    try {
      if (this.sourceNode) {
        this.sourceNode.disconnect();
        this.sourceNode = null;
      }
      if (this.audioContext && this.audioContext.state !== "closed") {
        this.audioContext.close();
      }
      if (this.mediaStream) {
        this.mediaStream.getTracks().forEach((track) => track.stop());
        this.mediaStream = null;
      }
    } catch (e) {
      console.warn("Error releasing Web Audio resources:", e);
    }
  }

  /**
   * Computes acoustic metrics and maps to a 1.0 - 5.0 Vocal Tone Score.
   * @param {number} [wordCount=0] - Total recognized words from STT.
   * @returns {Object} Acoustic features and derived vocal tone score.
   */
  getMetrics(wordCount = 0) {
    const totalDurationSec = Math.max(1, (this.stopTime - this.startTime) / 1000);

    // Total pause duration
    const totalPauseSec = this.pauses.reduce((sum, p) => sum + p.duration, 0);
    const pauseDurationRatio = Math.min(1.0, totalPauseSec / totalDurationSec);
    const pauseCount = this.pauses.length;

    // Speaking time excluding pauses
    const activeSpeakingSec = Math.max(0.5, totalDurationSec - totalPauseSec);
    const speakingRate = Number((wordCount / activeSpeakingSec).toFixed(2));

    // Volume RMS statistics
    let meanRms = 0;
    let energyVariance = 0;
    if (this.rmsSamples.length > 0) {
      const sum = this.rmsSamples.reduce((a, b) => a + b, 0);
      meanRms = sum / this.rmsSamples.length;
      const varianceSum = this.rmsSamples.reduce((a, b) => a + Math.pow(b - meanRms, 2), 0);
      energyVariance = Math.sqrt(varianceSum / this.rmsSamples.length);
    }

    // Pitch F0 statistics
    let meanPitch = 0;
    let pitchVariance = 0;
    if (this.pitchSamples.length > 0) {
      const sum = this.pitchSamples.reduce((a, b) => a + b, 0);
      meanPitch = sum / this.pitchSamples.length;
      const varianceSum = this.pitchSamples.reduce((a, b) => a + Math.pow(b - meanPitch, 2), 0);
      pitchVariance = Math.sqrt(varianceSum / this.pitchSamples.length);
    }

    // -------------------------------------------------------------------------
    // Compute Vocal Tone Score (1.0 - 5.0 scale)
    // -------------------------------------------------------------------------
    // Dimensions:
    //  + Pitch Dynamic: +1.0 for expressive variance, -1.0 for flat monotone
    //  + Energy Variance: +1.0 for dynamic vocal inflection, -0.8 for flat volume
    //  + Pauses: -0.8 for excessive silence (>35%), +0.5 for steady pacing
    //  + Speaking Rate: +0.6 for natural lively tempo (2.0 - 3.2 wps)
    let score = 3.0; // Baseline neutral score

    // Pitch component (-1.0 to +1.0)
    if (pitchVariance > VOCAL_THRESHOLDS.PITCH_VAR_ANIMATED) {
      score += 1.0;
    } else if (pitchVariance > VOCAL_THRESHOLDS.PITCH_VAR_MODERATE) {
      score += 0.5;
    } else if (pitchVariance < VOCAL_THRESHOLDS.PITCH_VAR_FLAT && this.pitchSamples.length > 5) {
      score -= 1.0;
    }

    // Energy variance component (-0.8 to +0.8)
    if (energyVariance > VOCAL_THRESHOLDS.ENERGY_VAR_DYNAMIC) {
      score += 0.8;
    } else if (energyVariance < VOCAL_THRESHOLDS.ENERGY_VAR_FLAT) {
      score -= 0.8;
    }

    // Pause component (-0.8 to +0.4)
    if (pauseDurationRatio > VOCAL_THRESHOLDS.PAUSE_RATIO_HIGH) {
      score -= 0.8;
    } else if (pauseDurationRatio < VOCAL_THRESHOLDS.PAUSE_RATIO_LOW && totalDurationSec > 3) {
      score += 0.4;
    }

    // Speaking rate component (-0.6 to +0.6)
    if (speakingRate >= VOCAL_THRESHOLDS.SPEAKING_RATE_NORMAL && speakingRate <= VOCAL_THRESHOLDS.SPEAKING_RATE_FAST) {
      score += 0.6;
    } else if (speakingRate < VOCAL_THRESHOLDS.SPEAKING_RATE_SLOW && wordCount > 3) {
      score -= 0.6;
    }

    // Clamp score to [1.0, 5.0]
    const vocalToneScore = Math.max(1.0, Math.min(5.0, Number(score.toFixed(2))));

    let toneLabel = "Balanced";
    if (vocalToneScore >= 4.2) {
      toneLabel = "Highly Animated & Vibrant";
    } else if (vocalToneScore >= 3.5) {
      toneLabel = "Lively & Expressive";
    } else if (vocalToneScore <= 1.8) {
      toneLabel = "Very Flat & Low Energy";
    } else if (vocalToneScore <= 2.6) {
      toneLabel = "Low Energy / Monotone";
    }

    return {
      vocalToneScore,
      toneLabel,
      totalDurationSec: Number(totalDurationSec.toFixed(1)),
      speakingRate,
      pitchVariance: Number(pitchVariance.toFixed(1)),
      meanPitch: Number(meanPitch.toFixed(1)),
      pauseCount,
      pauseDurationRatio: Number(pauseDurationRatio.toFixed(2)),
      totalPauseSec: Number(totalPauseSec.toFixed(1)),
      energyVariance: Number(energyVariance.toFixed(4)),
      meanRms: Number(meanRms.toFixed(4)),
    };
  }
}

if (typeof window !== "undefined") {
  window.VoiceAnalyzer = VoiceAnalyzer;
  window.VOCAL_THRESHOLDS = VOCAL_THRESHOLDS;
}

if (typeof module !== "undefined" && module.exports) {
  module.exports = { VoiceAnalyzer, VOCAL_THRESHOLDS };
}
