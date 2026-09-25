/**
 * breathing-page.js — Interactive box breathing timer and animation.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  mcInitChatbot(user);

  let totalDuration = 60; // seconds
  let remainingTime = 60;
  let timerInterval = null;
  let cycleInterval = null;
  let isRunning = false;

  const visual = document.getElementById("mc-breathing-visual");
  const instructionEl = document.getElementById("mc-instruction-text");
  const timerDisplay = document.getElementById("mc-timer-display");
  const secondsCount = document.getElementById("mc-seconds-count");
  const cycleCountEl = document.getElementById("mc-cycle-count");
  const startBtn = document.getElementById("mc-start-btn");
  const pauseBtn = document.getElementById("mc-pause-btn");
  const resetBtn = document.getElementById("mc-reset-btn");
  const durationBtns = document.querySelectorAll(".duration-btn");

  // Duration selection
  durationBtns.forEach((btn) => {
    btn.addEventListener("click", () => {
      if (isRunning) return;
      durationBtns.forEach((b) => b.classList.remove("active"));
      btn.classList.add("active");
      totalDuration = Number(btn.dataset.duration);
      remainingTime = totalDuration;
      updateTimerDisplay();
    });
  });

  function updateTimerDisplay() {
    const mins = String(Math.floor(remainingTime / 60)).padStart(2, "0");
    const secs = String(remainingTime % 60).padStart(2, "0");
    timerDisplay.textContent = `${mins}:${secs} remaining`;
  }

  // Stages: Inhale 4s -> Hold 4s -> Exhale 4s -> Hold 2s
  const STAGES = [
    { name: "Inhale slowly...", class: "inhale", seconds: 4 },
    { name: "Hold gently...", class: "hold", seconds: 4 },
    { name: "Exhale completely...", class: "exhale", seconds: 4 },
    { name: "Rest...", class: "rest", seconds: 2 },
  ];

  let currentStageIdx = 0;
  let stageSecondsLeft = STAGES[0].seconds;
  let cyclesCompleted = 0;

  function setStage(idx) {
    currentStageIdx = idx;
    const stage = STAGES[currentStageIdx];
    stageSecondsLeft = stage.seconds;
    instructionEl.textContent = stage.name;
    visual.className = `breathing-visual ${stage.class}`;
    secondsCount.textContent = stageSecondsLeft;
  }

  function startBreathing() {
    if (isRunning) return;
    isRunning = true;
    startBtn.style.display = "none";
    pauseBtn.style.display = "inline-flex";

    setStage(currentStageIdx);

    cycleInterval = setInterval(() => {
      stageSecondsLeft--;
      if (stageSecondsLeft > 0) {
        secondsCount.textContent = stageSecondsLeft;
      } else {
        currentStageIdx = (currentStageIdx + 1) % STAGES.length;
        if (currentStageIdx === 0) {
          cyclesCompleted++;
          cycleCountEl.textContent = `Completed ${cyclesCompleted} ${cyclesCompleted === 1 ? "cycle" : "cycles"}`;
        }
        setStage(currentStageIdx);
      }
    }, 1000);

    timerInterval = setInterval(() => {
      if (remainingTime > 0) {
        remainingTime--;
        updateTimerDisplay();
      } else {
        finishSession();
      }
    }, 1000);
  }

  function pauseBreathing() {
    if (!isRunning) return;
    isRunning = false;
    clearInterval(timerInterval);
    clearInterval(cycleInterval);
    startBtn.style.display = "inline-flex";
    startBtn.textContent = "Resume";
    pauseBtn.style.display = "none";
    instructionEl.textContent = "Paused";
  }

  function resetBreathing() {
    isRunning = false;
    clearInterval(timerInterval);
    clearInterval(cycleInterval);
    remainingTime = totalDuration;
    currentStageIdx = 0;
    cyclesCompleted = 0;
    updateTimerDisplay();
    instructionEl.textContent = "Ready to begin";
    cycleCountEl.textContent = "Session ready";
    secondsCount.textContent = "4";
    visual.className = "breathing-visual";
    startBtn.style.display = "inline-flex";
    startBtn.textContent = "Start";
    pauseBtn.style.display = "none";
  }

  function finishSession() {
    resetBreathing();
    instructionEl.textContent = "Well done! Take this calm with you.";
    cycleCountEl.textContent = `Completed ${cyclesCompleted} full breathing cycles.`;
  }

  startBtn.addEventListener("click", startBreathing);
  pauseBtn.addEventListener("click", pauseBreathing);
  resetBtn.addEventListener("click", resetBreathing);

  updateTimerDisplay();
});
