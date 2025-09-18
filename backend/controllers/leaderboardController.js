const User = require('../models/User');

// GET /leaderboard/points?limit=10
exports.topByPoints = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const users = await User.find()
    .sort({ points: -1 })
    .limit(limit)
    .select('name points tier streak')
    .lean();

  res.json(users);
};

// GET /leaderboard/streak?limit=10
exports.topByStreak = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const users = await User.find()
    .sort({ streak: -1 })
    .limit(limit)
    .select('name points tier streak')
    .lean();
  
  res.json(users);
};

// GET /leaderboard/winrate?limit=10
exports.topByWinRate = async (req, res) => {
  const limit = parseInt(req.query.limit, 10) || 10;
  const users = await User.find({ gamesPlayed: { $gt: 0 } }).lean();

  users.forEach(u => {
    u.winRate = u.gamesPlayed > 0 ? +(u.gamesWon / u.gamesPlayed * 100).toFixed(2) : 0;
  });

  users.sort((a, b) => b.winRate - a.winRate);

  res.json(users.slice(0, limit).map(u => ({
    name: u.name,
    winRate: u.winRate,
    gamesPlayed: u.gamesPlayed,
    points: u.points,
    tier: u.tier,
    streak: u.streak
  })));
};

// Utility: Get required score for top 5% (for Connoisseur tier logic)
// GET /leaderboard/top5percent-score
exports.topFivePercentScore = async (req, res) => {
  const users = await User.find().sort({ points: -1 }).select('points').lean();
  const cutoffIndex = Math.floor(users.length * 0.05);
  const cutoffScore = users[cutoffIndex] ? users[cutoffIndex].points : 0;
  res.json({ cutoffScore });
};
