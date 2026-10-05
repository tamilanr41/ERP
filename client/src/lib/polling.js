/**
 * Shared polling intervals.
 *
 * The IPD module is updated in real time by socket events, so background
 * polling only needs to be a safety net. Short intervals used to saturate the
 * API rate limit on a busy ward; these values keep the console fresh while
 * leaving headroom, and React Query pauses them automatically when the browser
 * tab is not focused.
 */
export const POLL = {
  /** The admission currently open on screen — fastest safety net. */
  ACTIVE: 45_000,
  /** Command centre, bed board, admission register. */
  STANDARD: 60_000,
  /** Background panels: turnover queue, discharge watchlist, workstations. */
  SLOW: 120_000,
  /** Reports, notifications and other rarely-changing data. */
  IDLE: 300_000,
};

export default POLL;
