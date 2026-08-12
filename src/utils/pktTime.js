// Pakistan (Asia/Karachi) is a fixed UTC+5 offset year-round — no DST — so
// this is safe to hardcode rather than depend on the server's own timezone
// (Railway/most hosts run in UTC).

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000;

/**
 * Returns the UTC Date instant that corresponds to midnight (00:00) today
 * in Pakistan time. Used to reset daily counters (e.g. "3 withdrawals per
 * day per method") at midnight PKT rather than midnight server-time.
 */
function getStartOfTodayPKT() {
  const nowUTC = new Date();
  const nowAsPKTWallClock = new Date(nowUTC.getTime() + PKT_OFFSET_MS);
  const startOfDayPKTWallClock = new Date(Date.UTC(
    nowAsPKTWallClock.getUTCFullYear(),
    nowAsPKTWallClock.getUTCMonth(),
    nowAsPKTWallClock.getUTCDate(),
    0, 0, 0, 0
  ));
  return new Date(startOfDayPKTWallClock.getTime() - PKT_OFFSET_MS);
}

/** Milliseconds from now until the next midnight PKT (for "resets in Xh Ym" messaging). */
function msUntilNextResetPKT() {
  const startOfToday = getStartOfTodayPKT();
  const startOfTomorrow = new Date(startOfToday.getTime() + 24 * 60 * 60 * 1000);
  return startOfTomorrow.getTime() - Date.now();
}

module.exports = { getStartOfTodayPKT, msUntilNextResetPKT };