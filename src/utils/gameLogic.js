/**
 * Calculate game result based on profit/loss percentages
 * @param {number} profitPercentage - Profit chance (0-100)
 * @param {number} lossPercentage - Loss chance (0-100)
 * @param {number} betAmount - Amount bet by user
 * @returns {Object} { result: 'win'|'loss', winAmount: number }
 */
exports.calculateGameResult = (profitPercentage, lossPercentage, betAmount) => {
  // Random number between 0 and 100
  const random = Math.random() * 100;
  
  // Check if win (based on profit percentage)
  const isWin = random < profitPercentage;
  
  let winAmount = 0;
  if (isWin) {
    // Win: user gets profit percentage of bet
    winAmount = betAmount * (profitPercentage / 100);
  } else {
    // Loss: user loses loss percentage of bet
    winAmount = -(betAmount * (lossPercentage / 100));
  }
  
  return {
    result: isWin ? 'win' : 'loss',
    winAmount: Math.round(winAmount * 100) / 100 // Round to 2 decimals
  };
};