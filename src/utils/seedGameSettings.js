const mongoose = require('mongoose');
const GameSetting = require('../models/GameSetting');

/**
 * Seeds default GameSetting docs for wingo/k3/5d if they don't exist yet.
 * profitPercentage/lossPercentage is the admin win-rate control described
 * in gameEngine.js — default 70/30 means 70% of rounds are house-favorable.
 * Adjustable anytime via PUT /api/admin/game-settings/:gameName (0-100).
 *
 * Run once with: node src/utils/seedGameSettings.js
 */
async function seedGameSettings() {
  for (const gameName of ['wingo', 'k3', '5d']) {
    await GameSetting.findOneAndUpdate(
      { gameName },
      { gameName },
      { upsert: true, setDefaultsOnInsert: true }
    );
  }
  console.log('✅ Seeded GameSetting for wingo, k3, 5d');
}

if (require.main === module) {
  require('dotenv').config();
  mongoose.connect(process.env.MONGO_URI)
    .then(seedGameSettings)
    .then(() => mongoose.disconnect())
    .catch(err => { console.error('❌ Seed failed:', err.message); process.exit(1); });
}

module.exports = { seedGameSettings };
