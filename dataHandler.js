const fs = require('fs');
const path = require('path');

const dataPath = path.join(__dirname, 'botData.json');

// Initialize data structure
let botData = {
  ticketSettings: {},
  applicationSettings: {},
  warnings: {},
  warnLimits: {},
  games: {},
  premiumRoles: {},
  jailed: {},
  economy: {},
  userSettings: {},
  lottery: {
    participants: [],
    pot: 0,
    active: false,
    lastDraw: 0,
    nextDraw: 0
  }
};

// Load data from file if it exists
if (fs.existsSync(dataPath)) {
  try {
    const rawData = fs.readFileSync(dataPath, 'utf8');
    botData = JSON.parse(rawData);
  } catch (err) {
    console.error('Error loading data file:', err);
  }
}

// Save data to file
function saveData() {
  try {
    fs.writeFileSync(dataPath, JSON.stringify(botData, null, 2));
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

// Economy data handling
function getEconomyData(userId) {
  if (!botData.economy[userId]) {
    botData.economy[userId] = {
      wallet: 100,
      bank: 0,
      bio: '',
      items: [],
      job: null,
      level: 1,
      xp: 0,
      badges: [],
      lastBeg: 0,
      lastWork: 0,
      lastRob: 0,
      lastLottery: 0,
      lastDaily: 0,
      lastWeekly: 0,
      lastMonthly: 0,
      lastVote: 0,
      bankInterestDate: 0
    };
    saveData();
  }
  return botData.economy[userId];
}

function updateEconomyData(userId, data) {
  botData.economy[userId] = { ...botData.economy[userId], ...data };
  saveData();
}

// Handle votes
function handleVote(userId) {
  const eco = getEconomyData(userId);
  const now = Date.now();
  const cooldown = 12 * 60 * 60 * 1000; // 12 hours cooldown
  
  if (now - eco.lastVote < cooldown) {
    return false;
  }

  eco.lastVote = now;
  eco.wallet += 5000;
  
  // Add voter badge if not already present
  if (!eco.badges.includes('Voter')) {
    eco.badges.push('Voter');
  }
  
  updateEconomyData(userId, eco);
  
  // Try to notify user
  const user = client.users.cache.get(userId);
  if (user) {
    user.send({
      embeds: [
        new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('🎉 Thanks for Voting!')
          .setDescription('You received 5,000 coins and the Voter badge!')
          .addFields(
            { name: '💰 Reward', value: '5,000 coins', inline: true },
            { name: '🎖️ Badge', value: 'Voter', inline: true },
            { name: '⏳ Next Vote', value: `<t:${Math.floor((now + cooldown) / 1000)}:R>`, inline: false }
          )
      ]
    }).catch(() => console.log(`Could not send DM to ${userId}`));
  }
  
  return true;
}

module.exports = {
  botData,
  getEconomyData,
  updateEconomyData,
  handleVote,
  saveData
};