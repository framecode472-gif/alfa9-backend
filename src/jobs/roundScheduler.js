const GameRound = require('../models/GameRound');
const { settleRound } = require('../utils/gameEngine');
const { ALL_STREAMS, getCurrentRound } = require('../utils/gameEngine');

/**
 * Runs roughly every second, but waits for each full pass to finish before
 * scheduling the next one (setInterval does NOT wait — if a pass takes longer
 * than 1s under load, the next tick would start while the previous one is
 * still mid-settlement, which was the real cause of rounds being settled
 * twice and balances being credited twice). For each of the 10 game+duration
 * streams (WinGo 30s/1m/3m/5m, K3 1m/3m/5m, 5D 1m/3m/5m):
 *   1. Makes sure the current period's round exists (getCurrentRound
 *      creates it on first access — this just guarantees it exists even
 *      if no user has requested it yet).
 *   2. Settles any round whose endTime has passed and is still open
 *      (settleRound atomically claims the round itself, so this is safe
 *      even if called more than once for the same round).
 *
 * Started from server.js:
 *   const { startRoundScheduler } = require('./src/jobs/roundScheduler');
 *   startRoundScheduler();
 */
function startRoundScheduler(io) {
  let running = false;

  const tick = async () => {
    if (running) return; // previous tick still working — skip this one instead of overlapping
    running = true;
    try {
      for (const stream of ALL_STREAMS) {
        try {
          await getCurrentRound(stream.game, stream.duration); // ensures it exists

          const now = new Date();
          const dueRounds = await GameRound.find({
            game: stream.game, duration: stream.duration,
            status: 'open',
            endTime: { $lte: now }
          });
          for (const round of dueRounds) {
            await settleRound(round, io);
          }
        } catch (err) {
          console.error(`Round scheduler error (${stream.game}/${stream.duration}):`, err.message);
        }
      }
    } finally {
      running = false;
    }
  };

  setInterval(tick, 500);

  console.log('🎰 Round scheduler started — 10 streams (WinGo x4, K3 x3, 5D x3)');
}

module.exports = { startRoundScheduler };