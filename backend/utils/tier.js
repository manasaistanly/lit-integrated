//game
exports.getTier = (user, top5PercentScore = null) => {
  // If dynamic 5%, calculate before and send as param.
  if (top5PercentScore && user.points >= top5PercentScore) return 'Connoisseur';
  const winRate = (user.gamesPlayed || 0) > 0 ? (user.gamesWon || 0) / user.gamesPlayed : 0;
  if (winRate < 0.5) return 'Beginner';
  if (winRate < 0.95) return 'Amateur';
  return 'Amateur';
};


// Basic tier logic (you can customize thresholds later)
exports.calculateTier = (count) => {
  if (count >= 20) return 'Platinum';
  if (count >= 10) return 'Gold';
  if (count >= 5) return 'Silver';
  return 'Bronze';
};
