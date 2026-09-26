/**
 * feature-cards.js — Interactive Expandable Feature Cards for MindCare AI
 * Centralized logic for the "Engineered for Clarity and Everyday Wellbeing" section.
 * - Independent multi-card toggle (multiple cards can remain open concurrently)
 * - Accessible keyboard interaction (Enter / Space)
 * - aria-expanded state synchronization
 * - Click propagation isolation for inner CTA buttons and links
 */

function initFeatureCards() {
  const cards = document.querySelectorAll(".features-grid .feature-card");
  if (!cards.length) return;

  cards.forEach((card) => {
    // Avoid double-binding if called repeatedly
    if (card._hasFeatureCardListener) return;
    card._hasFeatureCardListener = true;

    const pill = card.querySelector(".feature-toggle-pill .pill-symbol");
    const affordanceLabel = card.querySelector(".affordance-label");

    function toggleCard(e) {
      // Do not collapse/toggle if clicking an inner link or button (e.g. CTA button)
      if (e.target && e.target.closest(".feature-cta-btn, a, button:not(.feature-card)")) {
        return;
      }

      const isExpanded = card.classList.contains("expanded");
      const nextState = !isExpanded;

      card.classList.toggle("expanded", nextState);
      card.setAttribute("aria-expanded", String(nextState));

      if (pill) {
        pill.textContent = nextState ? "−" : "+";
      }
      if (affordanceLabel) {
        affordanceLabel.textContent = nextState ? "Click to collapse" : "Click to explore";
      }
    }

    card.addEventListener("click", toggleCard);

    card.addEventListener("keydown", (e) => {
      // Only toggle on Enter or Space when focused on the card itself, not inner links
      if (e.key === "Enter" || e.key === " " || e.code === "Space") {
        if (!e.target.closest(".feature-cta-btn, a")) {
          e.preventDefault();
          toggleCard(e);
        }
      }
    });
  });
}

if (document.readyState === "loading") {
  document.addEventListener("DOMContentLoaded", initFeatureCards);
} else {
  initFeatureCards();
}

if (typeof window !== "undefined") {
  window.initFeatureCards = initFeatureCards;
}
