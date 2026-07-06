/**
 * style_config.ts — Centralised Tailwind class-string constants
 *
 * Purpose: every theme-aware Tailwind class string used in the frontend
 * is defined ONCE here. Components import from this file instead of
 * writing class strings inline. Benefits:
 *
 *  1. Modularity: rename a class here, update the whole UI.
 *  2. Consistency: same role always uses the same class.
 *  3. Theme-awareness: every constant here uses semantic tokens
 *     (bg-accent, text-ink, border-border, ...) that resolve to the
 *     CSS variables in src/styles/index.css. The whole UI re-skins
 *     automatically when theme tokens change.
 *  4. Discoverability: one grep here finds every variant of a role
 *     (card padding, modal surface, danger state, etc.).
 *
 * Conventions:
 *  - Class strings only — no JSX, no logic, no runtime values.
 *  - Semantic naming by ROLE not APPEARANCE (`buttonPrimary` not
 *    `brownButton`). A role's appearance may change with theme.
 *  - Tailwind utility names not opaque aliases.
 *  - String concatenation at the call site for variants (e.g.
 *    `${buttonPrimary} ${disabled && 'opacity-40 cursor-not-allowed'}`).
 *
 * Adding new constants:
 *  - Pick the right section (typography, layout, surfaces, controls,
 *    status, feedback). Don't dump everything in one bag.
 *  - Use semantic tokens (bg-accent, text-ink, ...), never raw hex
 *    or hardcoded tailwind colours (no bg-red-500 etc.).
 *  - If a class string is only used once, it doesn't belong here yet
 *    — wait until a second caller appears.
 */

/* ── 1. Typography ────────────────────────────────────────────────
 * Body text, labels, headers, and numeric/mono. All use the
 * text-ink / text-ink-soft / text-ink-faint token chain. */

export const textBody        = 'text-sm text-ink';
export const textBodySoft    = 'text-sm text-ink-soft';
export const textBodyFaint   = 'text-sm text-ink-faint';
export const textBodyMuted   = 'text-sm text-ink-soft -mt-2';

export const textLabel       = 'text-sm font-medium text-ink';
export const textLabelBold   = 'text-sm font-semibold text-ink';
export const textLabelStrong = 'text-sm font-semibold text-ink mb-1.5';
export const textLabelFaint  = 'text-xs text-ink-faint mt-0.5';
export const textLabelFaintLg = 'text-sm text-ink-faint -mt-2';

export const textXs          = 'text-xs text-ink-soft';
export const textXsFaint     = 'text-xs text-ink-faint';
export const textXsFaintTop  = 'text-xs text-ink-faint mt-1';
export const textXsFaintTop0 = 'text-xs text-ink-faint mt-0.5';
export const textXsMuted     = 'text-xs text-ink-faint';
export const textXsLabel     = 'text-xs font-medium text-ink-soft mb-1.5';
export const textXsUpper     = 'text-[11px] font-semibold text-ink-faint uppercase tracking-wider mb-1';
export const textMicro      = 'text-[10px] text-ink-faint';

export const textHeaderSm    = 'text-base font-semibold text-ink';
export const textHeaderMd    = 'text-lg font-semibold text-ink';
export const textHeaderLg    = 'text-xl font-semibold text-ink';
export const textHeaderXl    = 'text-2xl font-semibold text-ink';

export const textLabelXsBold = 'text-xs font-semibold text-ink-faint uppercase tracking-wider mb-1';
export const textLabelXs     = 'text-[11px] text-ink-faint';
export const textLabelXsMb1  = 'text-[11px] font-semibold text-ink-faint uppercase tracking-wide';
export const textLabelXsTop  = 'text-[11px] font-semibold text-ink-faint uppercase tracking-wide mt-1';

export const textMono        = 'font-mono';
export const textNumeric     = 'tabular-nums';

/* ── 2. Layout primitives ─────────────────────────────────────────
 * Flex / grid containers. No color tokens here — pure shape. */

export const flexRow        = 'flex items-center gap-2';
export const flexRowSm      = 'flex items-center gap-1';
export const flexRowLg      = 'flex items-center gap-3';
export const flexRowXl      = 'flex items-center gap-4';
export const flexRowWrap    = 'flex items-center gap-2 flex-wrap';
export const flexRowBetween = 'flex items-center justify-between';
export const flexCol        = 'flex flex-col gap-2';
export const flexColSm      = 'flex flex-col gap-1';
export const flexColMd      = 'flex flex-col gap-3';

export const flexRowStart    = 'flex items-start gap-3';
export const flexColStart   = 'flex flex-col gap-0.5';

export const flexGrow       = 'flex-1 min-w-0';
export const flexShrink     = 'flex-shrink-0';
export const flexNoShrink   = 'flex-shrink-0';

export const stackSm        = 'space-y-2';
export const stackMd        = 'space-y-3';
export const stackLg        = 'space-y-4';
export const stackXs        = 'space-y-1';

/* ── 3. Surfaces ──────────────────────────────────────────────────
 * Background, card, modal, and surface treatments. All use the
 * bg-card / bg-bg / border-border token chain. */

export const surfaceCard        = 'bg-card border border-border rounded-xl';
export const surfaceCardFlat   = 'bg-card';
export const surfaceCardHover  = 'bg-card hover:bg-card-hover border border-border rounded-xl';
export const surfaceCardPadded = 'bg-card border border-border rounded-xl p-5';
export const surfaceCardInline = 'bg-card border border-border rounded-2xl p-4';

export const surfaceMuted      = 'bg-mist border border-border rounded-xl';
export const surfaceMutedFlat  = 'bg-mist';

export const surfacePage       = 'bg-bg text-ink';
export const surfaceOverlay    = 'bg-ink/40 backdrop-blur-sm';

/* Modal/dialog panel — used by DialogShell/DialogPanel. */
export const surfaceModal      = 'bg-card border border-border rounded-2xl shadow-float';

/* ── 4. Controls ───────────────────────────────────────────────────
 * Buttons, inputs, selects. All buttons and inputs use theme
 * variables for the fill / border / text — the previously-hardcoded
 * colour classes were the main source of theme inconsistency. */

export const buttonPrimary    = 'inline-flex items-center justify-center gap-2 rounded-lg bg-accent text-accent-text font-medium px-4 py-2 transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonSecondary  = 'inline-flex items-center justify-center gap-2 rounded-lg bg-card border border-border text-ink font-medium px-4 py-2 transition-all duration-200 hover:bg-mist disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonGhost      = 'inline-flex items-center justify-center gap-2 rounded-lg bg-transparent text-ink-soft font-medium px-4 py-2 transition-all duration-200 hover:bg-mist hover:text-ink disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonDanger     = 'inline-flex items-center justify-center gap-2 rounded-lg bg-danger text-white font-medium px-4 py-2 transition-all duration-200 hover:bg-danger/80 disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonSm         = 'inline-flex items-center justify-center gap-1.5 rounded-md bg-accent text-accent-text text-xs font-medium px-2.5 py-1 transition-all duration-200 hover:bg-accent-hover disabled:opacity-50 disabled:cursor-not-allowed';
export const buttonIcon       = 'inline-flex items-center justify-center w-8 h-8 rounded-md text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const buttonIconSm     = 'inline-flex items-center justify-center w-6 h-6 rounded text-ink-soft hover:bg-mist hover:text-ink transition-colors';

export const inputBase        = 'w-full px-3 py-2 rounded-md text-sm text-ink bg-card border border-border outline-none focus:border-accent focus:ring-2 focus:ring-accent/10 transition-all placeholder-ink-faint disabled:opacity-50 disabled:cursor-not-allowed';
export const inputError       = 'w-full px-3 py-2 rounded-md text-sm text-ink bg-card border border-danger outline-none focus:border-danger focus:ring-2 focus:ring-danger/20 transition-all placeholder-ink-faint';
export const inputSearch      = 'w-full pl-10 pr-3 py-2 rounded-lg text-sm text-ink bg-card border border-border outline-none focus:border-accent focus:ring-2 focus:ring-accent/15 transition-all placeholder-ink-faint';

/* ── 5. Status / semantic ──────────────────────────────────────────
 * Success / warning / danger / info. Pulls from the new
 * --success-rgb / --warning-rgb / --danger-rgb / --info-rgb
 * tokens so the four-status palette re-skins with the theme. */

export const statusSuccess   = 'text-success bg-success-light border border-success/20';
export const statusWarning   = 'text-warning bg-warning-light border border-warning/20';
export const statusDanger    = 'text-danger bg-danger-light border border-danger/20';
export const statusInfo      = 'text-info bg-info-light border border-info/20';

export const badgeSuccess    = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-success/10 text-success border border-success/20';
export const badgeWarning    = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-warning/10 text-warning border border-warning/20';
export const badgeDanger     = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-danger/10 text-danger border border-danger/20';
export const badgeInfo       = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-info/10 text-info border border-info/20';
export const badgeNeutral    = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-xs font-medium bg-mist text-ink-soft border border-border';


/* ── 6. Feedback ──────────────────────────────────────────────────
 * Banners, toasts, alerts. */

export const bannerInfo      = 'flex items-start gap-3 px-4 py-3 rounded-xl border border-info/20 bg-info/10 text-info';
export const bannerSuccess   = 'flex items-start gap-3 px-4 py-3 rounded-xl border border-success/20 bg-success/10 text-success';
export const bannerWarning   = 'flex items-start gap-3 px-4 py-3 rounded-xl border border-warning/20 bg-warning/10 text-warning';
export const bannerDanger    = 'flex items-start gap-3 px-4 py-3 rounded-xl border border-danger/20 bg-danger/10 text-danger';

/* ── 7. Loading / empty states ──────────────────────────────────── */

export const skeletonBlock   = 'animate-pulse rounded-xl bg-card-hover';
export const skeletonLine    = 'animate-pulse rounded bg-card-hover';
export const skeletonCircle  = 'animate-pulse rounded-full bg-card-hover';

export const emptyState      = 'flex flex-col items-center justify-center py-12 text-sm text-ink-faint';

/* ── 8. Common icon button patterns ───────────────────────────────
 * Small circular icon buttons used throughout the UI. */

export const iconBtn         = 'inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const iconBtnSm       = 'inline-flex items-center justify-center w-6 h-6 rounded text-ink-soft hover:bg-mist hover:text-ink transition-colors';
export const iconBtnAccent   = 'inline-flex items-center justify-center w-8 h-8 rounded-full text-ink-soft hover:text-accent hover:bg-accent-light transition-colors';
export const iconBtnPrimary  = 'inline-flex items-center justify-center w-8 h-8 rounded-full bg-mist text-ink-soft hover:bg-mist hover:text-ink transition-colors';

/* ── 9. Avatar patterns ──────────────────────────────────────────── */

export const avatarSm         = 'w-6 h-6 rounded-full object-cover';
export const avatarMd         = 'w-8 h-8 rounded-full object-cover';
export const avatarLg         = 'w-10 h-10 rounded-full object-cover';
export const avatarPlaceholder = 'w-8 h-8 rounded-full bg-mist flex items-center justify-center text-xs font-semibold text-ink-soft';

/* ── 10. Card / section patterns ──────────────────────────────────
 * Higher-level reusable compositions. */

export const cardSection     = 'bg-card border border-border rounded-xl overflow-hidden';
export const cardSectionPad  = 'bg-card border border-border rounded-xl overflow-hidden p-5';
export const cardHeader      = 'px-4 py-3 border-b border-border';
export const cardBody        = 'px-4 py-3';
export const cardFooter      = 'px-4 py-3 border-t border-border';

/* ── 11. Navbar / pill patterns ─────────────────────────────────── */

export const navPill         = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-medium text-ink-soft transition-colors hover:text-ink hover:bg-mist';
export const navPillActive   = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold text-white bg-ink transition-colors';
export const navPillActiveAccent = 'inline-flex items-center gap-1.5 px-3.5 py-1.5 rounded-full text-sm font-semibold text-accent-text bg-accent transition-colors';

/* ── 12. Table patterns ─────────────────────────────────────────── */

export const tableBase       = 'w-full';
export const tableTh         = 'px-3 py-2.5 text-left text-[10px] font-semibold text-ink-faint uppercase tracking-widest whitespace-nowrap';
export const tableTd         = 'px-3 py-3 text-sm text-ink';
export const tableTr         = 'border-b border-border/50 last:border-0 hover:bg-mist transition-colors';
export const tableTrLast     = 'hover:bg-mist transition-colors';

/* ── 13. Result / answer surfaces ─────────────────────────────────
 * Used by FAQ result cards, search result cards, answer panels. */

export const resultCardCollapsed = 'border border-border/70 bg-card/80 hover:bg-cream rounded-2xl transition-all duration-300 overflow-hidden';
export const resultCardExpanded  = 'border border-accent/30 bg-cream rounded-2xl transition-all duration-300 overflow-hidden';

export const resultMetaSource    = 'inline-flex items-center px-2.5 py-0.5 rounded-full bg-mist text-ink-soft font-semibold uppercase tracking-wider';
export const resultMetaCategory  = 'inline-flex items-center px-2.5 py-0.5 rounded-full bg-accent-light text-accent font-semibold uppercase tracking-wider';

export const resultBody          = 'mt-1.5 text-xs text-ink-soft leading-relaxed line-clamp-2';
export const resultTitle         = 'text-sm font-semibold text-ink leading-snug';

export const resultHeaderFaq     = 'rounded-xl bg-accent-light border border-accent/15 p-4';
export const resultHeaderCommunity = 'rounded-xl bg-success-light border border-success/15 p-4';

export const resultFaqLabel      = 'text-[11px] font-semibold text-accent mb-2 uppercase tracking-wide';
export const resultCommunityLabel = 'text-[11px] font-semibold text-success mb-2 uppercase tracking-wide';

export const resultBodyFaq       = 'text-sm text-ink/75 leading-relaxed whitespace-pre-wrap';
export const resultBodyFaqShort  = 'text-sm text-ink/75 leading-relaxed';
export const resultBodyCommunity = 'text-sm text-ink/70 leading-relaxed';

/* ── 14. Vote / feedback pills ────────────────────────────────────
 * Round pill buttons for "Was this helpful?" style votes. */

export const votePillBase       = 'inline-flex items-center gap-1.5 text-xs px-3.5 py-1.5 rounded-full border transition-all duration-200 disabled:cursor-default';
export const voteUp             = 'border-accent/40 bg-accent-light text-accent';
export const voteDown           = 'border-danger/40 bg-danger-light text-danger';
export const voteUpIdle         = 'border-border text-ink-faint hover:border-accent/40 hover:text-accent';
export const voteDownIdle       = 'border-border text-ink-faint hover:border-danger/40 hover:text-danger';

/* ── 15. Suggestion / inline form ────────────────────────────────
 * Used inside ResultItem for "Suggest better answer" forms. */

export const suggestForm         = 'mt-3 bg-mist/60 border border-border/70 rounded-2xl p-4 space-y-3 animate-fade-in';
export const suggestLabel        = 'text-xs font-semibold text-ink';
export const suggestTextarea     = 'w-full text-xs p-3 rounded-xl border border-border bg-card focus:outline-none focus:border-accent focus:ring-1 focus:ring-accent resize-y';
export const suggestError        = 'text-[11px] text-danger';
export const suggestSuccess      = 'text-[11px] text-success';

export const suggestBtnCancel    = 'px-3 py-1.5 rounded-full border border-border bg-card text-[11px] font-semibold text-ink-soft hover:bg-cream transition-colors';
export const suggestBtnSubmit    = 'px-4 py-1.5 rounded-full bg-accent text-accent-text text-[11px] font-semibold hover:bg-accent-dark transition-colors disabled:opacity-50';

/* ── 16. Suggestion CTA (link-style) ───────────────────────────── */

export const suggestCta         = 'inline-flex items-center gap-1 text-xs font-semibold text-ink-soft hover:text-accent transition-colors';
export const suggestCtaAccent    = 'inline-flex items-center gap-1 text-xs font-semibold text-accent hover:text-accent-dark hover:underline transition-colors';
export const suggestCtaFaint     = 'inline-flex items-center gap-1 text-xs text-ink-faint hover:text-ink-soft transition-colors';

/* ── 17. Confidence tag (search results) ─────────────────────────
 * The "High/Medium/Low Confidence" pill on each search result. */

export const confidencePill       = 'inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-semibold';
export const confidenceHigh       = 'bg-success-light text-success';
export const confidenceMedium     = 'bg-warning-light text-warning';
export const confidenceLow        = 'bg-mist text-ink-faint';

/* ── 18. Search bar input variants ─────────────────────────────────
 * The two input styles used inside SearchBar.tsx — the "default"
 * large hero search and the "compact" navbar search. Both kept
 * theme-token-driven so they re-skin with the rest of the UI. */

export const searchInputDefault = 'w-full pl-12 pr-32 py-5 sm:py-[22px] rounded-[26px] border border-border bg-card text-sm sm:text-base text-ink placeholder-ink-faint focus:outline-none focus:border-accent focus:bg-card transition-all duration-300 shadow-[0_14px_34px_rgba(31,41,51,0.07)]';
export const searchInputCompact = 'w-full bg-mist border border-border/60 text-ink text-sm rounded-[14px] pl-10 pr-3 py-1.5 outline-none focus:bg-card focus:border-accent/40 focus:ring-2 focus:ring-accent/10 transition-all placeholder-ink-faint';

/* ── 19. Search bar suggestion list item ────────────────────────── */

export const searchSuggestionItem = 'w-full text-left px-5 py-3.5 text-sm text-ink hover:bg-cream/60 transition-colors duration-150 border-b border-border/30 last:border-0 flex items-center gap-3';

/* ── 19b. Search-dropdown panel chrome (SearchDropdown.tsx) ────────
 * The sub-panel that opens below a search input on the FAQ page —
 * shows matching questions on the left, categories on the right. */

export const searchPanel             = 'search-panel';             /* CSS class — already theme-driven */
export const searchPanelHeader       = 'flex items-center justify-between px-4 pt-4 pb-2';
export const searchPanelLoadingSkeleton = 'h-[72px] rounded-2xl search-skeleton animate-pulse';
export const searchPanelListEmpty    = 'rounded-2xl border border-dashed border-border bg-transparent p-4';
export const searchListItemDefault   = 'w-full text-left rounded-2xl border border-border/60 px-3 py-2 search-list-item';
export const searchListItemCompact   = 'w-full flex items-center gap-2 px-3 py-2 rounded-2xl border border-border/60 text-left search-list-item';
export const searchListItemQuestionRow = 'text-sm font-semibold text-ink line-clamp-2';
export const searchListItemResultBody = 'text-xs text-ink-soft line-clamp-3 mt-1 leading-relaxed';

/* ── 20. Explore-page compact search bar ──────────────────────────
 * The Explore-page sticky search pill (different visual identity
 * from the home-page hero search). */

export const exploreSearchBar   = 'w-full pl-12 pr-24 py-3.5 rounded-full border border-border/70 bg-card text-sm text-ink placeholder-ink-faint focus:outline-none focus:border-accent/50 focus:bg-card transition-all duration-200 shadow-subtle';
export const exploreSearchIcon  = 'absolute left-4 top-1/2 -translate-y-1/2 text-ink-faint pointer-events-none';
export const exploreSearchClear = 'absolute right-3 top-1/2 -translate-y-1/2 text-[11px] text-ink-faint hover:text-ink px-2 py-1 rounded-full hover:bg-mist transition-colors';

/* ── 21. Topbar / navbar chrome ───────────────────────────────────
 * The pill button + dropdown panel that hold the program-switcher,
 * user-menu, etc. on the public-site navbar. */

export const topbarPill         = 'inline-flex items-center gap-2 h-9 px-3 rounded-full bg-card border border-border/70 text-xs text-ink font-medium hover:border-accent/60 transition-colors shadow-sm';
export const topbarPillCompact  = 'inline-flex items-center gap-2 px-2.5 py-1 text-[11px] rounded-full bg-card border border-border/70 text-xs text-ink font-medium hover:border-accent/60 transition-colors shadow-sm';
export const topbarPillIdle     = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/70 text-xs text-ink-soft';
export const topbarPillLoading  = 'inline-flex items-center gap-2 px-3 py-1.5 rounded-full bg-card border border-border/70 text-xs text-ink-soft';
export const topbarPillDot      = 'w-3 h-3 rounded-full bg-mist animate-pulse';

export const topbarDropdown     = 'absolute right-0 top-full mt-2 z-40 w-72 max-w-[calc(100vw-2rem)] bg-card border border-border rounded-2xl shadow-float overflow-hidden animate-fade-in';
export const topbarDropdownHeader = 'px-4 py-3 border-b border-border/60';
export const topbarDropdownFooter = 'border-t border-border/60 p-1.5';

export const topbarDropdownItem       = 'w-full text-left px-4 py-2.5 hover:bg-mist transition-colors flex items-start gap-3';
export const topbarDropdownItemSelected = 'w-full text-left px-4 py-2.5 hover:bg-mist transition-colors flex items-start gap-3 bg-mist/60';
export const topbarDropdownItemIcon       = 'shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-mist text-ink-soft group-hover:text-accent';
export const topbarDropdownItemIconAccent = 'shrink-0 mt-0.5 w-7 h-7 rounded-lg flex items-center justify-center bg-accent text-accent-text';

export const topbarCreateButton   = 'w-full text-left px-3 py-2 rounded-xl hover:bg-mist text-xs font-medium text-accent flex items-center gap-2';

export const topbarFooter         = 'w-full border-t border-border bg-bg/50 backdrop-blur-[10px] mt-16';

export const topbarUserAvatar     = 'w-9 h-9 rounded-full object-cover ring-2 ring-card transition-transform duration-200 group-hover:scale-105';
export const topbarUserAvatarInit = 'w-9 h-9 rounded-full flex items-center justify-center text-accent-text text-sm font-semibold ring-2 ring-card transition-transform duration-200 group-hover:scale-105';

/* ── 22. Accent-tinted chip / pill ─────────────────────────────────
 * The reusable "highlighted in accent" chip used in the navbar for
 * Spurti Points, user-active-program indicator, etc. */

export const accentChip         = 'inline-flex items-center gap-1.5 h-9 px-3 rounded-full bg-accent/10 border border-accent/20 text-accent text-xs font-semibold shadow-sm';
export const accentChipCompact  = 'inline-flex items-center gap-2 text-[11px] font-medium text-ink-faint bg-card/70 border border-border/60 rounded-full px-3 py-1';
export const accentDot          = 'w-1.5 h-1.5 rounded-full bg-accent';
export const accentTextMuted    = 'text-accent/70 font-medium';

/* ── 23. Vote / feedback vote-pill base for faq review ────────────
 * Two-button row (Accurate / Needs Update). Reusable. */

export const votePillSingle      = 'flex-1 flex items-center justify-center gap-1.5 py-2 px-3 rounded-xl border text-xs font-medium transition-all';
export const votePillAccent      = 'border-accent/40 bg-accent/10 text-accent';
export const votePillAccentIdle  = 'border-border text-ink-soft hover:border-accent/30 hover:text-accent';
export const votePillDanger      = 'border-danger/40 bg-danger-light text-danger';
export const votePillDangerIdle  = 'border-border text-ink-soft hover:border-danger/30 hover:text-danger';

/* ── 24. Tier selector pill (evergreen / seasonal / volatile) ─────
 * The 3-button row in FreshnessTierSelector. */

export const tierPillBase        = 'flex-1 py-2 px-3 rounded-xl border text-xs font-medium transition-all';
export const tierPillAccent      = 'border-accent/40 bg-accent/10 text-accent';
export const tierPillDanger      = 'border-danger/40 bg-danger-light text-danger';
export const tierPillIdle        = 'border-border text-ink-soft hover:bg-mist';

/* ── 25. Submit / danger action button (small variant) ──────────── */

export const submitBtnDanger     = 'flex-1 py-1.5 text-xs rounded-lg bg-danger text-accent-text hover:bg-danger/85 transition-colors disabled:opacity-50';
export const submitBtnGhost      = 'flex-1 py-1.5 text-xs rounded-lg border border-border text-ink-soft hover:bg-mist transition-colors';

/* ── 26. Freshness / review badge ─────────────────────────────────
 * Tiny inline pills used by FreshnessBadge. */

export const badgePendingReview    = 'inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning-light px-1.5 py-0.5 rounded';
export const badgeUpdateRequested  = 'inline-flex items-center gap-1 text-xs font-medium text-warning bg-warning-light px-1.5 py-0.5 rounded';
export const badgeVerified         = 'inline-flex items-center gap-1 text-xs text-accent';
export const badgeVerifiedBold     = 'inline-flex items-center gap-1 text-xs text-accent font-medium';
export const badgeVerifiedWarn     = 'inline-flex items-center gap-1 text-xs text-warning font-medium';
export const badgeCompact          = 'text-[10px]';

/* ── 27. Number input (review interval days) ────────────────────── */

export const numberInput          = 'w-20 rounded-lg border border-border bg-mist px-2 py-1.5 text-xs text-ink text-center focus:outline-none focus:ring-2 focus:ring-accent/25';

/* ── 28. Textarea with focus ring + tall variant ─────────────────
 * Used by search feedback, suggest-answer, similar inline forms. */

export const textAreaBase         = 'w-full rounded-xl border border-border bg-mist px-3 py-2 text-xs text-ink placeholder-ink-faint focus:outline-none focus:ring-2 focus:ring-accent/25 resize-none';

/* ── 29. Empty-state padded text ────────────────────────────────── */

export const emptyPaddedCenter    = 'text-xs text-ink-faint text-center py-8';

/* ── 30. Account-page card / section ─────────────────────────────
 * AccountPage sections — Password, Email, Connected Accounts, etc.
 * Each section is a self-contained card with a header + body. */

export const accountCard        = 'bg-card rounded-2xl border border-border p-6';
export const accountCardStack   = 'bg-card rounded-2xl border border-border p-6 space-y-4';
export const accountCardHeader  = 'flex items-center justify-between';
export const accountSectionTitle = 'text-sm font-semibold text-ink uppercase tracking-wide';

export const accountActionLink    = 'text-xs font-semibold text-accent hover:text-accent-hover transition-colors';
export const accountActionLinkDisabled = 'text-xs font-semibold text-accent hover:text-accent-hover transition-colors disabled:opacity-50';
export const accountCancelLink    = 'text-xs font-semibold text-ink-faint hover:text-ink transition-colors';

export const accountLastUpdated   = 'text-sm text-ink-faint mt-2';

export const inlineSuccessBanner = 'text-xs text-success bg-success-light border border-success/15 rounded-xl px-3 py-2';
export const inlineDangerBanner  = 'text-xs text-danger bg-danger-light border border-danger/15 rounded-xl px-3 py-2';

/* ── 31. Warning / amber banners ─────────────────────────────────
 * Used in registration-status banners and similar "needs attention"
 * surfaces. Replaces the old raw bg-amber-50/border-amber-200/text-amber-900
 * pattern that bypassed the theme. */

export const warningBorder        = 'rounded-md px-3 py-2 text-[11px] border bg-warning-light border-warning/30 text-warning';

/* ── 31b. Danger-closed banner (registration closed, etc.) ─────── */

export const dangerBorder         = 'rounded-md px-3 py-2 text-[11px] border bg-danger-light border-danger/30 text-danger';
export const accentBorderMuted    = 'rounded-md px-3 py-2 text-[11px] border bg-accent/10 border-accent/30 text-accent';

/* ── 32. Modal shell / panel ─────────────────────────────────────
 * Generic modal container pattern. Used by AuthModal and any
 * other overlay dialog. */

export const modalShell          = 'fixed inset-0 z-[60] flex items-center justify-center px-4 animate-fade-in';
export const modalTitleRow       = 'flex items-start justify-between mb-5';
export const modalTitle          = 'text-sm font-bold text-ink';
export const cardHeaderTitle     = 'text-base font-serif text-ink';

/* ── 33. Auth-modal chrome ───────────────────────────────────────
 * The close button, modal panel, tab row, input-icon button, and
 * prompt/hint text used by AuthModal.tsx. */

export const authModalPanel      = 'w-full max-w-sm bg-card rounded-2xl border border-border shadow-card p-6 animate-fade-in';
export const authCloseButton     = 'w-7 h-7 flex items-center justify-center rounded-full text-ink-faint hover:text-ink hover:bg-mist transition-colors -mt-1 -mr-1';
export const authTabRow          = 'flex items-center gap-1 p-1 rounded-full bg-mist mb-5';
export const authTabBase         = 'flex-1 py-1.5 text-xs font-semibold rounded-full transition-colors';
export const authTabActive       = 'bg-card text-ink shadow-subtle';
export const authTabIdle         = 'text-ink-soft hover:text-ink';
export const authInputIcon       = 'pointer-events-auto p-1 hover:text-ink transition-colors flex items-center justify-center rounded-full outline-none focus-visible:ring-2 focus-visible:ring-accent/25';
export const authInfoBox         = 'mt-3 rounded-xl border border-border bg-mist px-3 py-2.5 text-center text-[11px] text-ink-soft';
export const authTitle           = 'text-base font-serif text-ink';
export const authHintSoft        = 'text-[11px] text-ink-soft mt-1';
export const authHintFaint       = 'text-[10px] text-ink-faint -mt-2';

/* ── 34. Trust / Source badges (TrustBadge / SourceBadge) ─────────
 * Small inline pills on FAQ list items showing how the answer was
 * verified. Replaces the old raw purple-50 / amber-200 / emerald-300
 * colours that bypassed the theme tokens. All variants use the
 * --accent-rgb / --success-rgb / --warning-rgb / --border-rgb tokens
 * so they re-skin with the theme. */

export const trustBadgeBase      = 'ml-1.5 text-[11px] px-2 py-0.5 rounded-md border font-medium';
export const trustBadgeHigh      = 'bg-mist text-ink-soft border-border';                           /* Official */
export const trustBadgeExpert    = 'bg-accent/10 text-accent border-accent/30';                     /* Admin Approved */
export const trustBadgeMedium    = 'bg-success-light text-success border-success/30';                /* Community Approved */
export const trustBadgeLow       = 'bg-warning-light text-warning border-warning/30';                /* Community (low trust) */

export const sourceBadgeBase     = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold uppercase tracking-wider';
export const sourceBadgeCommunity = 'bg-info-light text-info border border-info/30';                 /* From Community */
export const sourceBadgeZoom     = 'bg-[#2D8CFF]/10 text-[#2D8CFF] border border-[#2D8CFF]/25';         /* From Meetings — BRAND ASSET for Zoom third-party colour */
export const sourceBadgeZoomCircle = 'bg-[#2D8CFF]/10 text-[#2D8CFF]';                                 /* Numbered circle variant of sourceBadgeZoom */
export const sourceBadgeExpert   = 'bg-accent/10 text-accent border border-accent/30';               /* Expert Verified */

/* The Zoom brand-blue tones (#2D8CFF) live in the brand guideline as
   a third-party brand asset and intentionally do NOT respond to theme
   switches. Centralised here so the colour lives in one place. */
export const zoomBrandBlue       = '#2D8CFF';                   /* Zoom brand — fixed colour */

/* ── 35. Flag-outdated (warning-action) button + modal ──────────
 * Used by FlagOutdatedButton.tsx. The button itself is semantic
 * warning (orange) — "this answer needs updating". The error
 * banner underneath the form uses danger (red). */

export const flagButtonIdle        = 'text-xs px-2 py-1 rounded border transition-colors border-border text-ink-soft hover:border-warning/40 hover:text-warning';
export const flagButtonDisabled    = 'text-xs px-2 py-1 rounded border transition-colors border-border text-ink-faint cursor-not-allowed';

export const flagSubmitButton       = 'px-4 py-2 text-xs rounded-xl bg-warning text-accent-text hover:bg-warning/85 transition-colors disabled:opacity-50';
export const flagCancelButton      = 'px-4 py-2 text-xs rounded-xl border border-border text-ink-soft hover:bg-mist transition-colors';
export const flagErrorBanner        = 'text-xs text-danger bg-danger-light rounded-lg px-3 py-2';

/* ── 36. Modal dialog shell ──────────────────────────────────────
 * Used by native <dialog> elements opened via .showModal(). */

export const dialogShell           = 'm-auto rounded-2xl border border-border shadow-2xl bg-card p-0 backdrop:bg-ink/30 backdrop:backdrop-blur-sm';
export const dialogBody            = 'p-6 space-y-4 min-w-72';
export const dialogTitleSm         = 'text-sm font-semibold text-ink';
export const dialogLabel           = 'text-xs text-ink-soft';
export const dialogLabelFaint      = 'block mt-1 text-ink-faint';

/* ── 37. Community-surface chrome ────────────────────────────────
 * Status pills, badges, and inline surfaces used across the
 * Community board (CommentNode, ThreadDetail, SpillTheTea,
 * CommunityPostCard, CreatePostDialog). Replaces raw Tailwind
 * orange/red/yellow/purple/indigo colours that bypassed the theme. */

export const communityUpvoteActive     = 'text-accent';
export const communityUpvoteIdle       = 'text-ink-faint hover:text-accent';
export const communityUpvotePillActive = 'text-accent bg-accent/10';
export const communityUpvotePillIdle   = 'text-ink-faint hover:text-accent hover:bg-accent/10';

export const communityFirstResponder   = 'inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded-full bg-warning/10 border border-warning/30 text-warning text-[10px] font-bold';
export const communityDifficultyEasy   = 'bg-success/10 text-success border border-success/30';
export const communityDifficultyModerate = 'bg-warning/10 text-warning border border-warning/30';
export const communityDifficultyHard   = 'bg-danger/10 text-danger border border-danger/30';

export const communityStatusReported   = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-danger/10 border border-danger/30 text-danger text-xs font-semibold';
export const communityStatusOpen       = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-warning/10 border border-warning/30 text-warning text-xs font-semibold';

export const communityPostSourceCommunity = 'bg-warning/10 text-warning border border-warning/30';

export const communityAiValidated       = 'bg-info/10 text-info border border-info/30';
export const communityAdminApproved     = 'bg-accent/10 text-accent border border-accent/30';
export const communityPillBase           = 'inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-semibold';

export const communityActivityNew       = 'text-accent bg-accent/10';                       /* activity log — accent for new content (warm theme) */
export const communityActivityRemoved   = 'text-danger bg-danger/10';
export const communityActivityAnswer    = 'text-warning bg-warning/10';

export const communityReportButton      = 'w-8 h-8 rounded-xl bg-mist text-ink-soft hover:bg-danger/10 hover:text-danger flex items-center justify-center transition-all';
export const communityReportHover        = 'flex items-center gap-1 text-xs text-ink-faint hover:text-danger px-2 py-1.5 rounded-full hover:bg-danger/10 transition-all';
export const communityDangerText        = 'text-[11px] text-danger hover:text-danger transition-colors';
export const communityDangerTextHover   = 'ml-auto inline-flex items-center gap-1 px-2 py-1.5 rounded-xl text-xs text-danger/70 hover:text-danger transition-colors';

export const communityCloseButton       = 'relative flex items-center justify-center w-9 h-9 rounded-full hover:bg-black/5 transition-colors';
export const communityHoverRing         = 'absolute inset-0 rounded-full pointer-events-none';

export const communityTemplateCard      = 'w-full text-left flex items-start gap-2 px-2.5 py-1.5 rounded-lg bg-card/70 hover:bg-card border border-warning/30 hover:border-warning/50 hover:shadow-sm transition-all group cursor-pointer';
export const communityTemplateLabel     = 'text-[10px] font-semibold uppercase tracking-wide text-warning';
export const communityTemplateIcon       = 'shrink-0 mt-1 w-3 h-3 text-ink-faint group-hover:text-warning group-hover:translate-x-0.5 transition-all';

export const communityToastWarn         = 'bg-warning/10 border-warning/30 text-warning';

export const warningDot          = 'w-1.5 h-1.5 rounded-full bg-warning';

export const dangerBannerExtended   = 'rounded-2xl border border-danger/30 bg-danger-light p-6 text-sm text-danger';
export const dangerPillLight        = 'px-4 py-2.5 rounded-lg text-xs font-medium border bg-danger-light text-danger border-danger/30';
export const dangerHoverChipSubtle  = 'text-[10px] font-medium uppercase tracking-wider text-ink-soft bg-mist border border-border/60 rounded-md px-2 py-1 hover:bg-danger-light hover:text-danger hover:border-danger/30 disabled:opacity-40 transition-colors';

/* ── 38. Admin chart palette ───────────────────────────────────
 * Admin charts (Recharts) used raw hex (#8b5cf6 — Tailwind violet-500)
 * for line/bar/fill colors, which didn't follow the warm-sand
 * theme and read as a foreign colour against the new Yaksha FAQ
 * palette. Re-mapped to the accent/warning tokens + dark-mode
 * neutral text colours that respect the active theme. */

export const adminChartStroke      = 'rgb(var(--accent-rgb))';                 /* line/area/bar stroke */
export const adminChartFill        = 'rgb(var(--accent-rgb) / 0.35)';          /* area gradient stop */
export const adminChartFillFade    = 'rgb(var(--accent-rgb) / 0)';             /* area gradient fade */
export const adminChartGrid        = 'rgb(var(--text-primary-rgb) / 0.04)';    /* gridline */
export const adminChartAxis        = 'rgb(var(--text-primary-rgb) / 0.25)';    /* axis tick text */
export const adminChartTooltipBg   = 'rgb(var(--bg-card-rgb) / 0.97)';         /* tooltip background */
export const adminChartTooltipBord = 'rgb(var(--accent-rgb) / 0.30)';          /* tooltip border */
export const adminChartTooltipText = 'rgb(var(--accent-rgb))';                 /* tooltip value text */
export const adminChartCursor      = 'rgb(var(--accent-rgb) / 0.30)';          /* chart cursor (hover line) */
export const adminChartBg          = 'rgb(var(--text-primary-rgb) / 0.05)';    /* radial background */
export const adminChartActiveDotFill   = 'rgb(var(--accent-rgb))';
export const adminChartActiveDotStroke = 'rgb(var(--bg-primary-rgb))';
export const adminChartProgressFill = 'rgb(var(--accent-rgb))';                /* radial bar fill */
export const adminLegendApprovedDot = 'rgb(var(--success-rgb))';                /* approved legend dot */
export const adminLegendPendingDot  = 'rgb(var(--warning-rgb))';                /* pending legend dot */
export const adminLegendRejectedDot = 'rgb(var(--danger-rgb))';                 /* rejected legend dot */
export const adminChartPercentText = 'rgb(var(--text-primary-rgb))';            /* big % number */
export const adminChartSubtleText  = 'rgb(var(--text-primary-rgb) / 0.30)';    /* "resolved" label */

/* ── 39. Navbar chrome ─────────────────────────────────────────
 * Mobile hamburger, mobile dropdown link (active + idle), and
 * desktop secondary-nav link (active + idle). Replaces two
 * 'bg-accent-light' instances (broken — silently stripped by
 * the build) and three 'hover:bg-black/[0.04]' / 'hover:bg-black/[0.03]'
 * instances (raw black arbitrary values). */

export const navHamburger         = 'lg:hidden flex w-9 h-9 items-center justify-center rounded-[10px] hover:bg-black/5 transition-colors';
export const navMobileLinkActive  = 'bg-accent/10 text-accent';
export const navMobileLinkIdle    = 'text-ink-soft hover:text-ink hover:bg-black/[0.03]';
export const navMobileLinkBase    = 'block px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200';
export const navSecondaryLinkBase = 'block px-4 py-2.5 rounded-xl text-sm font-medium transition-all duration-200';

/* ── 40. Avatar palette (hash → stable user-identity colour) ───
 * The user-avatar "tag colour" was a 6-colour array of arbitrary
 * hex values hand-picked for visual distinction across users.
 * These are NOT theme tokens — they're user-identity colours
 * (a single user always has the same one regardless of theme),
 * but the palette needs to live in style_config.ts so it can
 * be evolved in one place. Returns hex strings because the
 * consumer is a CSS background-color inline style. */

export const avatarColor1   = '#6b92e0';   /* sky blue */
export const avatarColor2   = '#5a9a6b';   /* sage green */
export const avatarColor3   = '#c4943a';   /* amber */
export const avatarColor4   = '#e07c6b';   /* coral */
export const avatarColor5   = '#7c6be0';   /* violet */
export const avatarColor6   = '#e06ba8';   /* pink */
export const avatarColorDefault = '#6b92e0';

/** Array form for index-based hash lookup. Order must match
 * the colours[] array used by the avatar fallback logic. */
export const avatarColorPalette: readonly string[] = [
  avatarColor1,
  avatarColor2,
  avatarColor3,
  avatarColor4,
  avatarColor5,
  avatarColor6,
];
