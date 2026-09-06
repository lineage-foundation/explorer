/**
 * Scalar API-reference theme that matches the Lineage design system
 * (lineage.foundation) and the explorer app: a dark teal canvas, mint accent,
 * cyan links, Inter / Space Grotesk / JetBrains Mono. Colours are the Lineage
 * brand hexes so the docs page reads as part of the same site. Applied to the
 * `/api/v1/docs` route; forced to dark mode so the palette can't flip.
 */
export const SCALAR_LINEAGE_THEME = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&family=JetBrains+Mono:wght@400;500&display=swap');

:root,
.light-mode,
.dark-mode {
  /* Typography */
  --scalar-font: 'Inter', ui-sans-serif, system-ui, sans-serif;
  --scalar-font-code: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;

  /* Text */
  --scalar-color-1: #e7f1f0;
  --scalar-color-2: #9dabab;
  --scalar-color-3: #768383;
  --scalar-color-accent: #37e4aa;

  /* Surfaces */
  --scalar-background-1: #030d0e;
  --scalar-background-2: #09191a;
  --scalar-background-3: #132526;
  --scalar-background-accent: #06201a;

  --scalar-border-color: #1e2f30;

  /* Buttons */
  --scalar-button-1: #37e4aa;
  --scalar-button-1-color: #001711;
  --scalar-button-1-hover: #55f0bc;

  /* HTTP methods / status accents */
  --scalar-color-green: #37e4aa;
  --scalar-color-blue: #47caea;
  --scalar-color-red: #f3606d;
  --scalar-color-yellow: #e6c368;
  --scalar-color-orange: #f0a35a;
  --scalar-color-purple: #b79dff;

  --scalar-radius: 6px;
  --scalar-radius-lg: 8px;
}

/* Sidebar */
:root,
.light-mode,
.dark-mode {
  --scalar-sidebar-background-1: #01090a;
  --scalar-sidebar-color-1: #e7f1f0;
  --scalar-sidebar-color-2: #9dabab;
  --scalar-sidebar-border-color: #1e2f30;
  --scalar-sidebar-item-hover-background: #09191a;
  --scalar-sidebar-item-hover-color: #e7f1f0;
  --scalar-sidebar-item-active-background: #132526;
  --scalar-sidebar-color-active: #37e4aa;
  --scalar-sidebar-search-background: #09191a;
  --scalar-sidebar-search-border-color: #1e2f30;
  --scalar-sidebar-search-color: #768383;
}

/* Headings use the display face, matching the Lineage site and explorer. */
.scalar-app h1,
.scalar-app h2,
.scalar-app h3,
.scalar-api-reference h1,
.scalar-api-reference h2,
.scalar-api-reference h3 {
  font-family: 'Space Grotesk', ui-sans-serif, system-ui, sans-serif;
  letter-spacing: -0.01em;
}
`;
