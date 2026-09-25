/**
 * assessment.js — drives the 4-step Mental Health Assessment form.
 */

document.addEventListener("DOMContentLoaded", () => {
  const user = mcInitAppShell();
  if (!user) return;
  mcInitChatbot(user);

  const STEP_TITLES = [
    "Step 1 of 4: Personal Information",
    "Step 2 of 4: Social Media Usage",
    "Step 3 of 4: Lifestyle & Daily Habits",
    "Step 4 of 4: Mental Wellness & Stress",
  ];

  const totalSteps = 4;
  let currentStep = 1;

  const panels = Array.from(document.querySelectorAll(".step-panel"));
  const segs = Array.from(document.querySelectorAll(".stepper-track .seg"));
  const stepLabel = document.getElementById("mc-step-label");
  const draftNotice = document.getElementById("mc-draft-notice");
  const clearFormBtn = document.getElementById("mc-clear-form-btn");
  const backBtn = document.getElementById("mc-back-btn");
  const nextBtn = document.getElementById("mc-next-btn");
  const form = document.getElementById("assessment-form");
  const formShell = document.getElementById("mc-form-shell");
  const loadingShell = document.getElementById("mc-loading-shell");
  const errorBanner = document.getElementById("mc-assessment-error");

  const DRAFT_KEY = `mindcare_draft_${user.email}`;

  // Helper to update range input display readouts
  function updateRangeOutputs() {
    document.querySelectorAll("input[type='range']").forEach((range) => {
      const out = document.getElementById(`${range.id}-value`);
      const suffix = range.dataset.suffix || "";
      if (out) out.textContent = `${range.value}${suffix}`;
    });
  }

  // Setup live listeners for range sliders
  document.querySelectorAll("input[type='range']").forEach((range) => {
    range.addEventListener("input", () => {
      const out = document.getElementById(`${range.id}-value`);
      const suffix = range.dataset.suffix || "";
      if (out) out.textContent = `${range.value}${suffix}`;
    });
  });

  // Auto-populate previously entered information
  function populateForm() {
    let savedData = null;
    let isDraft = false;

    // 1. Check for live in-progress draft first
    try {
      const draft = JSON.parse(localStorage.getItem(DRAFT_KEY));
      if (draft && typeof draft === "object" && Object.keys(draft).length > 0) {
        savedData = draft;
        isDraft = true;
      }
    } catch {}

    // 2. If no draft or incomplete, retrieve last entered assessment input / profile
    const lastSaved = MindCareStore.getLastAssessmentInput ? MindCareStore.getLastAssessmentInput(user.email) : null;
    if (!savedData && lastSaved) {
      savedData = lastSaved;
    } else if (savedData && lastSaved) {
      // Merge missing fields from last saved
      savedData = { ...lastSaved, ...savedData };
    }

    if (!savedData) {
      updateRangeOutputs();
      return;
    }

    let populatedCount = 0;

    // Apply values to all form elements
    Object.entries(savedData).forEach(([key, val]) => {
      if (val === undefined || val === null || val === "") return;
      const element = form.elements[key];
      if (element) {
        element.value = val;
        populatedCount++;
      }
    });

    // Update range output labels to match populated slider values
    updateRangeOutputs();

    // Show restored data notice and clear option if fields were loaded
    if (populatedCount > 0) {
      if (draftNotice) {
        draftNotice.textContent = isDraft
          ? "✓ Restored in-progress draft"
          : "✓ Restored your previous information. You can review or adjust any field.";
        draftNotice.style.opacity = "1";
        setTimeout(() => {
          if (draftNotice) {
            draftNotice.style.transition = "opacity 0.6s ease";
            draftNotice.style.opacity = "0.7";
          }
        }, 5000);
      }
      if (clearFormBtn) {
        clearFormBtn.style.display = "inline-block";
      }
    }
  }

  // Clear form action
  if (clearFormBtn) {
    clearFormBtn.addEventListener("click", () => {
      if (confirm("Reset the form to blank values?")) {
        form.reset();
        localStorage.removeItem(DRAFT_KEY);
        if (MindCareStore.clearLastAssessmentInput) {
          MindCareStore.clearLastAssessmentInput(user.email);
        }
        updateRangeOutputs();
        clearFormBtn.style.display = "none";
        if (draftNotice) {
          draftNotice.textContent = "Form reset to blank";
          draftNotice.style.opacity = "1";
          setTimeout(() => {
            draftNotice.textContent = "";
          }, 3000);
        }
      }
    });
  }

  // Populate data on load
  populateForm();

  // Auto-save on every input change
  form.addEventListener("input", () => {
    const formData = Object.fromEntries(new FormData(form).entries());
    localStorage.setItem(DRAFT_KEY, JSON.stringify(formData));
    if (MindCareStore.saveLastAssessmentInput) {
      MindCareStore.saveLastAssessmentInput(user.email, formData);
    }
    if (draftNotice) {
      draftNotice.textContent = "Saved";
      draftNotice.style.opacity = "1";
    }
    if (clearFormBtn) {
      clearFormBtn.style.display = "inline-block";
    }
  });

  function updateStepper() {
    segs.forEach((seg, i) => {
      seg.classList.toggle("done", i + 1 < currentStep);
      seg.classList.toggle("current", i + 1 === currentStep);
      seg.querySelector(".seg-fill")?.remove();
      if (i + 1 <= currentStep) {
        const fill = document.createElement("div");
        fill.className = "seg-fill";
        fill.style.display = "block";
        seg.appendChild(fill);
      }
    });

    stepLabel.textContent = STEP_TITLES[currentStep - 1] || `Step ${currentStep} of ${totalSteps}`;
    panels.forEach((p) => p.classList.toggle("active", Number(p.dataset.step) === currentStep));
    backBtn.style.visibility = currentStep === 1 ? "hidden" : "visible";
    nextBtn.textContent = currentStep === totalSteps ? "Analyze My Mental Wellness" : "Continue";
  }

  function validateStep(step) {
    const panel = panels.find((p) => Number(p.dataset.step) === step);
    const inputs = panel.querySelectorAll("input[required], select[required]");
    let valid = true;
    inputs.forEach((input) => {
      const field = input.closest(".field");
      const isValid = input.checkValidity();
      if (field) field.classList.toggle("has-error", !isValid);
      if (!isValid) valid = false;
    });
    return valid;
  }

  backBtn.addEventListener("click", () => {
    if (currentStep > 1) {
      currentStep -= 1;
      updateStepper();
    }
  });

  nextBtn.addEventListener("click", () => {
    if (!validateStep(currentStep)) return;
    if (currentStep < totalSteps) {
      currentStep += 1;
      updateStepper();
    } else {
      submitAssessment();
    }
  });

  async function submitAssessment() {
    const formData = Object.fromEntries(new FormData(form).entries());

    formShell.style.display = "none";
    loadingShell.style.display = "block";
    errorBanner.classList.remove("visible");

    const loadingStepEl = document.getElementById("mc-loading-step");
    let stepIndex = 0;
    const steps = [
      "1. Normalizing inputs & encoding categories...",
      "2. Evaluating patterns through Random Forest pipeline...",
      "3. Calculating objective mental wellness score..."
    ];

    const stepInterval = setInterval(() => {
      stepIndex = (stepIndex + 1) % steps.length;
      if (loadingStepEl) loadingStepEl.textContent = steps[stepIndex];
    }, 900);

    try {
      let dbRecord = null;
      // Persist to database if authenticated session exists
      if (typeof MindCareAPI !== "undefined" && MindCareAPI.createAssessment && MindCareAPI.getToken()) {
        try {
          dbRecord = await MindCareAPI.createAssessment(formData);
        } catch (dbErr) {
          console.warn("DB assessment submission error, falling back to direct predict:", dbErr);
        }
      }

      let score, prediction, category, score_100, recordId;
      if (dbRecord && dbRecord.id) {
        score = dbRecord.score;
        prediction = dbRecord.prediction;
        category = dbRecord.category;
        score_100 = dbRecord.score_100;
        recordId = dbRecord.id;
      } else {
        const result = await MindCareAPI.predict(formData);
        score = result.predicted_mental_health_score;
        prediction = result.prediction;
        category = result.category;
        score_100 = result.score_100;
        recordId = `a_${Date.now()}`;
      }
      clearInterval(stepInterval);

      // Clear draft upon successful completion
      localStorage.removeItem(DRAFT_KEY);

      // Save/cache record in MindCareStore
      const record = MindCareStore.saveAssessment(
        user.email,
        formData,
        score,
        {
          id: recordId,
          prediction: prediction,
          category: category,
          score_100: score_100,
        }
      );

      // Explicitly set active result for smooth handoff
      if (typeof MindCareResults !== "undefined" && MindCareResults.setActiveResult) {
        MindCareResults.setActiveResult(record);
      }

      window.location.href = `result.html?id=${encodeURIComponent(record.id)}`;
    } catch (err) {
      clearInterval(stepInterval);
      loadingShell.style.display = "none";
      formShell.style.display = "block";
      errorBanner.textContent = err.friendlyMessage || "Something went wrong. Please try again.";
      errorBanner.classList.add("visible");
    }
  }

  updateStepper();
});
