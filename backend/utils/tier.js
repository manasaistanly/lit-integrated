const TIERS = {
  CONNOISSEUR: { name: 'Connoisseur', minWinRate: 0.95, minStreak: 30 },
  EXPERT: { name: 'Expert', minWinRate: 0.85, minStreak: 20 },
  ADVANCED: { name: 'Advanced', minWinRate: 0.70, minStreak: 10 },
  AMATEUR: { name: 'Amateur', minWinRate: 0.50, minStreak: 5 },
  BEGINNER: { name: 'Beginner', minWinRate: 0, minStreak: 0 }
};

exports.getTier = (user, top5PercentScore = null) => {
  // Calculate win rate
  const winRate = (user.gamesPlayed || 0) > 0 ? (user.gamesWon || 0) / user.gamesPlayed : 0;
  const currentStreak = user.currentStreak || 0;

  // Check for Connoisseur tier (top 5% or exceptional performance)
  if ((top5PercentScore && user.points >= top5PercentScore) || 
      (winRate >= TIERS.CONNOISSEUR.minWinRate && currentStreak >= TIERS.CONNOISSEUR.minStreak)) {
    return TIERS.CONNOISSEUR.name;
  }

  // Check other tiers based on win rate and streak
  if (winRate >= TIERS.EXPERT.minWinRate && currentStreak >= TIERS.EXPERT.minStreak) {
    return TIERS.EXPERT.name;
  }
  if (winRate >= TIERS.ADVANCED.minWinRate && currentStreak >= TIERS.ADVANCED.minStreak) {
    return TIERS.ADVANCED.name;
  }
  if (winRate >= TIERS.AMATEUR.minWinRate && currentStreak >= TIERS.AMATEUR.minStreak) {
    return TIERS.AMATEUR.name;
  }
  
  return TIERS.BEGINNER.name;
};

// Calculate tier based on streak count
exports.calculateTier = (count) => {
  if (count >= TIERS.CONNOISSEUR.minStreak) return 'Platinum';
  if (count >= TIERS.EXPERT.minStreak) return 'Gold';
  if (count >= TIERS.ADVANCED.minStreak) return 'Silver';
  if (count >= TIERS.AMATEUR.minStreak) return 'Bronze';
  return 'Starter';
};
