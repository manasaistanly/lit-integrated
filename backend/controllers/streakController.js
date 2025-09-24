
const Streak = require('../models/Streak');
if (!streak) {
streak = new Streak({ userId, currentStreak: 1, lastActiveAt: now });
await streak.save();
return res.json({ userId, currentStreak: 1, lastActiveAt: now });
}


const last = streak.lastActiveAt ? new Date(streak.lastActiveAt) : null;
if (last) {
const diff = (startOfUTCDay(now).getTime() - startOfUTCDay(last).getTime()) / (1000*60*60*24);
if (diff === 0) return res.json({ userId, currentStreak: streak.currentStreak, lastActiveAt: streak.lastActiveAt, message: 'already recorded today' });
if (diff === 1) {
streak.currentStreak += 1;
} else {
streak.currentStreak = 1;
}
} else {
streak.currentStreak = 1;
}


streak.lastActiveAt = now;
streak.updatedAt = new Date();
try {
await streak.save();
res.json({ userId, currentStreak: streak.currentStreak, lastActiveAt: streak.lastActiveAt });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}



exports.getStreak = async (req, res) => {
try {
const { userId } = req.params;
const s = await Streak.findOne({ userId });
if (!s) return res.json({ userId, currentStreak: 0 });
res.json({ userId, currentStreak: s.currentStreak, lastActiveAt: s.lastActiveAt });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}
};


exports.resetStreak = async (req, res) => {
try {
const { userId } = req.params;
const to = req.body.to === 0 ? 0 : 1;
const s = await Streak.findOneAndUpdate(
{ userId },
{ currentStreak: to, lastActiveAt: to === 0 ? null : new Date(), updatedAt: new Date() },
{ upsert: true, new: true }
);
res.json({ userId, currentStreak: s.currentStreak });
} catch (err) {
console.error(err);
res.status(500).json({ error: 'server error' });
}
};