/**
 * wellness-pillars.js — Interactive controls for Foundational Student Wellness Pillars
 * - Independent functionality per card
 * - Local-first privacy: state stored exclusively in localStorage
 * - Fully accessible: role="button", tabindex="0", Enter/Space keyboard toggles
 */

(function () {
  'use strict';

  function getTodayKey() {
    const d = new Date();
    const year = d.getFullYear();
    const month = String(d.getMonth() + 1).padStart(2, '0');
    const day = String(d.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
  }

  /* ==========================================================================
     CARD 1: Better Sleep Wind-Down Checklist
     ========================================================================== */
  const SLEEP_STORAGE_KEY = 'mindcare_sleep_checklist';
  const SLEEP_ITEMS_COUNT = 4;

  function initSleepCard() {
    const card = document.getElementById('pillar-sleep');
    if (!card) return;

    const progressPill = document.getElementById('sleep-progress-pill');
    const drawer = document.getElementById('sleep-drawer');
    const checkboxes = card.querySelectorAll('#sleep-checklist input[type="checkbox"]');
    const statusText = document.getElementById('sleep-checklist-status');
    const resetBtn = document.getElementById('sleep-reset-btn');
    const dateLabel = document.getElementById('sleep-checklist-date');

    const today = getTodayKey();
    if (dateLabel) {
      dateLabel.textContent = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
    }

    // Load saved checklist state
    function loadState() {
      try {
        const raw = localStorage.getItem(SLEEP_STORAGE_KEY);
        if (raw) {
          const data = JSON.parse(raw);
          // Auto-reset if stored date is not today
          if (data && data.date === today && Array.isArray(data.items)) {
            return data.items;
          }
        }
      } catch (e) {
        console.warn('Could not read sleep checklist from localStorage:', e);
      }
      return [false, false, false, false];
    }

    function saveState(items) {
      try {
        localStorage.setItem(
          SLEEP_STORAGE_KEY,
          JSON.stringify({
            date: today,
            items: items
          })
        );
      } catch (e) {
        console.warn('Could not save sleep checklist to localStorage:', e);
      }
    }

    let state = loadState();

    function updateUI() {
      let completedCount = 0;
      checkboxes.forEach((cb, idx) => {
        const isChecked = !!state[idx];
        cb.checked = isChecked;
        const parentLabel = cb.closest('.checklist-item');
        if (parentLabel) {
          parentLabel.classList.toggle('checked', isChecked);
        }
        if (isChecked) completedCount++;
      });

      if (progressPill) {
        if (completedCount === SLEEP_ITEMS_COUNT) {
          progressPill.textContent = '4/4 done tonight ✓';
          progressPill.classList.add('all-done');
        } else {
          progressPill.textContent = `${completedCount}/${SLEEP_ITEMS_COUNT} done tonight`;
          progressPill.classList.remove('all-done');
        }
      }

      if (statusText) {
        if (completedCount === SLEEP_ITEMS_COUNT) {
          statusText.textContent = '🎉 All 4 habits completed! Rest well.';
        } else if (completedCount > 0) {
          statusText.textContent = `${completedCount} of ${SLEEP_ITEMS_COUNT} completed for tonight`;
        } else {
          statusText.textContent = 'Select items as you complete them';
        }
      }
    }

    // Toggle card expansion
    function toggleCard(e) {
      // If clicking inside drawer on interactive elements, don't collapse card
      if (e && e.target && e.target.closest('#sleep-drawer, input, label, button')) {
        return;
      }
      const isExpanded = card.classList.contains('expanded');
      const next = !isExpanded;
      card.classList.toggle('expanded', next);
      card.setAttribute('aria-expanded', String(next));
    }

    card.addEventListener('click', toggleCard);

    card.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ' || e.code === 'Space') {
        if (!e.target.closest('#sleep-drawer, input, label, button')) {
          e.preventDefault();
          toggleCard(e);
        }
      }
    });

    // Prevent clicks inside drawer from bubbling to card toggle
    if (drawer) {
      drawer.addEventListener('click', (e) => {
        e.stopPropagation();
      });
    }

    // Checkbox change handlers
    checkboxes.forEach((cb) => {
      cb.addEventListener('change', () => {
        const idx = parseInt(cb.dataset.index, 10);
        if (!isNaN(idx) && idx >= 0 && idx < SLEEP_ITEMS_COUNT) {
          state[idx] = cb.checked;
          saveState(state);
          updateUI();
        }
      });
    });

    // Reset button handler
    if (resetBtn) {
      resetBtn.addEventListener('click', (e) => {
        e.stopPropagation();
        state = [false, false, false, false];
        saveState(state);
        updateUI();
      });
    }

    // Initialize UI on load
    updateUI();
  }

  /* ==========================================================================
     Global Initialization
     ========================================================================== */
  function initWellnessPillars() {
    initSleepCard();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initWellnessPillars);
  } else {
    initWellnessPillars();
  }

  window.initWellnessPillars = initWellnessPillars;
})();
