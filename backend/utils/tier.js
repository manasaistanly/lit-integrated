exports.getTier = (user, top5PercentScore = null) => {
  // If dynamic 5%, calculate before and send as param.
  if (top5PercentScore && user.points >= top5PercentScore) return 'Connoisseur';
  const winRate = (user.gamesPlayed || 0) > 0 ? (user.gamesWon || 0) / user.gamesPlayed : 0;
  if (winRate < 0.5) return 'Beginner';
  if (winRate < 0.95) return 'Amateur';
  return 'Amateur';
};
