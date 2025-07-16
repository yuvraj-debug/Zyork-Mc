const mongoose = require('mongoose');
require('dotenv').config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost:27017/discordBot', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => {
  console.log('Connected to MongoDB');
}).catch(err => {
  console.error('MongoDB connection error:', err);
});

// User Economy Schema
const userEconomySchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  wallet: { type: Number, default: 100 },
  bank: { type: Number, default: 0 },
  bio: { type: String, default: '' },
  items: { type: [String], default: [] },
  job: { type: String, default: null },
  level: { type: Number, default: 1 },
  xp: { type: Number, default: 0 },
  badges: { type: [String], default: [] },
  lastBeg: { type: Number, default: 0 },
  lastWork: { type: Number, default: 0 },
  lastRob: { type: Number, default: 0 },
  lastLottery: { type: Number, default: 0 },
  lastDaily: { type: Number, default: 0 },
  lastWeekly: { type: Number, default: 0 },
  lastMonthly: { type: Number, default: 0 },
  bankInterestDate: { type: Number, default: 0 }
}, { timestamps: true });

// Warning Schema
const warningSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  moderator: { type: String, required: true },
  reason: { type: String, required: true }
}, { timestamps: true });

// Guild Settings Schema
const guildSettingsSchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  premiumRoles: { type: [String], default: [] },
  warnLimit: { type: Number, default: 3 },
  ticketSettings: {
    message: { type: String, default: '' },
    options: { type: [{
      name: String,
      emoji: String
    }], default: [] },
    viewerRole: { type: String, default: null },
    categoryId: { type: String, default: null }
  },
  applicationSettings: {
    message: { type: String, default: '' },
    options: { type: [{
      name: String,
      emoji: String,
      cleanName: String
    }], default: [] },
    channelId: { type: String, default: null },
    questions: { type: [String], default: [] }
  }
}, { timestamps: true });

// Jailed User Schema
const jailedUserSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  guildId: { type: String, required: true },
  jailedBy: { type: String, required: true }
}, { timestamps: true });

// Lottery Schema
const lotterySchema = new mongoose.Schema({
  guildId: { type: String, required: true, unique: true },
  pot: { type: Number, default: 0 },
  participants: { type: [String], default: [] },
  lastDraw: { type: Date, default: Date.now },
  nextDraw: { type: Date, default: () => new Date(Date.now() + 86400000) } // 24 hours from now
}, { timestamps: true });

// Active Game Schema
const activeGameSchema = new mongoose.Schema({
  gameId: { type: String, required: true, unique: true },
  gameType: { type: String, required: true },
  data: { type: mongoose.Schema.Types.Mixed, required: true },
  expiresAt: { type: Date, required: true }
}, { timestamps: true });

// Create indexes
userEconomySchema.index({ userId: 1, guildId: 1 }, { unique: true });
warningSchema.index({ userId: 1, guildId: 1 });
jailedUserSchema.index({ userId: 1, guildId: 1 }, { unique: true });
activeGameSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

// Create models
const UserEconomy = mongoose.model('UserEconomy', userEconomySchema);
const Warning = mongoose.model('Warning', warningSchema);
const GuildSettings = mongoose.model('GuildSettings', guildSettingsSchema);
const JailedUser = mongoose.model('JailedUser', jailedUserSchema);
const Lottery = mongoose.model('Lottery', lotterySchema);
const ActiveGame = mongoose.model('ActiveGame', activeGameSchema);

// Database helper functions

// Get or create guild settings
async function getGuildSettings(guildId) {
  let settings = await GuildSettings.findOne({ guildId });
  if (!settings) {
    settings = new GuildSettings({ guildId });
    await settings.save();
  }
  return settings;
}

// Get or create user economy
async function getUserEconomy(userId, guildId) {
  let economy = await UserEconomy.findOne({ userId, guildId });
  if (!economy) {
    economy = new UserEconomy({ userId, guildId });
    await economy.save();
  }
  return economy;
}

// Get user warnings
async function getWarnings(userId, guildId) {
  return await Warning.find({ userId, guildId }).sort({ createdAt: -1 });
}

// Add warning
async function addWarning(userId, guildId, moderatorId, reason) {
  const warning = new Warning({
    userId,
    guildId,
    moderator: moderatorId,
    reason
  });
  await warning.save();
  return warning;
}

// Get jailed users
async function getJailedUsers(guildId) {
  return await JailedUser.find({ guildId });
}

// Jail user
async function jailUser(userId, guildId, jailedBy = 'system') {
  let jailedUser = await JailedUser.findOne({ userId, guildId });
  if (!jailedUser) {
    jailedUser = new JailedUser({
      userId,
      guildId,
      jailedBy
    });
    await jailedUser.save();
  }
  return jailedUser;
}

// Free user
async function freeUser(userId, guildId) {
  return await JailedUser.deleteOne({ userId, guildId });
}

// Get or create lottery
async function getLottery(guildId) {
  let lottery = await Lottery.findOne({ guildId });
  if (!lottery) {
    lottery = new Lottery({ guildId });
    await lottery.save();
  }
  return lottery;
}

// Get active game
async function getActiveGame(gameId) {
  return await ActiveGame.findOne({ gameId });
}

// Create active game
async function createActiveGame(gameId, gameType, data, timeoutMs) {
  const expiresAt = new Date(Date.now() + timeoutMs);
  const game = new ActiveGame({
    gameId,
    gameType,
    data,
    expiresAt
  });
  await game.save();
  return game;
}

// Delete active game
async function deleteActiveGame(gameId) {
  return await ActiveGame.deleteOne({ gameId });
}

// Export models and functions
module.exports = {
  UserEconomy,
  Warning,
  GuildSettings,
  JailedUser,
  Lottery,
  ActiveGame,
  getGuildSettings,
  getUserEconomy,
  getWarnings,
  addWarning,
  getJailedUsers,
  jailUser,
  freeUser,
  getLottery,
  getActiveGame,
  createActiveGame,
  deleteActiveGame
};