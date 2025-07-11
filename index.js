require('dotenv').config();
require('./keep_alive.js');
const { 
  Client, 
  GatewayIntentBits, 
  Collection, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle,
  PermissionsBitField
} = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const ms = require('ms');

// Initialize client with necessary intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildModeration,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.GuildPresences
  ]
});

// Constants
const BOT_ID = process.env.BOT_ID || '1383659368276430949';
const PREFIX = '!';
const COLORS = {
  DEFAULT: '#5865F2',
  SUCCESS: '#57F287',
  ERROR: '#ED4245',
  WARNING: '#FEE75C',
  INFO: '#EB459E',
  ECONOMY: '#F1C40F',
  MODERATION: '#E74C3C',
  TICKET: '#3498DB',
  APPLICATION: '#9B59B6',
  GAMES: '#2ECC71'
};

// In-memory database
const db = {
  tickets: {},
  applications: {},
  warnings: {},
  economy: {},
  games: {},
  settings: {
    ticket: {
      message: "📌 Need help? Click the button below to create a ticket!",
      category: null,
      viewerRole: null,
      options: []
    },
    application: {
      message: "📋 Interested in joining our team? Click below to apply!",
      channel: null,
      questions: [],
      roles: []
    },
    adminRoles: [],
    economy: {
      shop: [
        { name: "Common Lootbox", price: 100, description: "Contains common items" },
        { name: "Rare Lootbox", price: 500, description: "Contains rare items" },
        { name: "Legendary Lootbox", price: 2500, description: "Contains legendary items" }
      ],
      cooldowns: {
        daily: 86400,
        weekly: 604800,
        beg: 3600,
        hunt: 1800,
        work: 7200
      }
    }
  },
  wordFilter: [],
  roleLocks: [],
  tempRoles: [],
  cooldowns: {},
  userHistory: {}
};

// Helper functions
function createEmbed(title, description, color = COLORS.DEFAULT, fields = [], footer = null, thumbnail = null) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();

  if (fields.length > 0) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

function isAdmin(member) {
  return member.permissions.has(PermissionsBitField.Flags.Administrator) || 
         db.settings.adminRoles.some(roleId => member.roles.cache.has(roleId));
}

function addCooldown(userId, command, seconds) {
  const now = Date.now();
  const expirationTime = now + seconds * 1000;

  if (!db.cooldowns[userId]) db.cooldowns[userId] = {};
  db.cooldowns[userId][command] = expirationTime;

  setTimeout(() => {
    if (db.cooldowns[userId] && db.cooldowns[userId][command]) {
      delete db.cooldowns[userId][command];
      if (Object.keys(db.cooldowns[userId]).length === 0) {
        delete db.cooldowns[userId];
      }
    }
  }, seconds * 1000);
}

function checkCooldown(userId, command) {
  if (!db.cooldowns[userId] || !db.cooldowns[userId][command]) return 0;
  const remaining = Math.ceil((db.cooldowns[userId][command] - Date.now()) / 1000);
  return remaining > 0 ? remaining : 0;
}

function getEconomy(userId) {
  if (!db.economy[userId]) {
    db.economy[userId] = {
      wallet: 100,
      bank: 0,
      inventory: [],
      lastDaily: 0,
      lastWeekly: 0,
      lastBeg: 0,
      lastHunt: 0,
      lastWork: 0
    };
  }
  return db.economy[userId];
}

function formatMoney(amount) {
  return `${amount} <:coin:1140121399149912124>`;
}

function parseDuration(duration) {
  try {
    return ms(duration);
  } catch {
    return null;
  }
}

function formatDuration(ms) {
  const days = Math.floor(ms / (24 * 60 * 60 * 1000));
  const daysms = ms % (24 * 60 * 60 * 1000);
  const hours = Math.floor(daysms / (60 * 60 * 1000));
  const hoursms = ms % (60 * 60 * 1000);
  const minutes = Math.floor(hoursms / (60 * 1000));
  const minutesms = ms % (60 * 1000);
  const sec = Math.floor(minutesms / 1000);

  let str = "";
  if (days) str += `${days}d `;
  if (hours) str += `${hours}h `;
  if (minutes) str += `${minutes}m `;
  if (sec) str += `${sec}s`;

  return str.trim() || "0s";
}

// Command definitions
const commandDefinitions = [
  // Help Command
  {
    name: 'help',
    description: 'Display the help menu',
    options: []
  },

  // Ticket System
  {
    name: 'ticket',
    description: 'Ticket system commands',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'msg', value: 'msg' },
          { name: 'setoptions', value: 'setoptions' },
          { name: 'setviewer', value: 'setviewer' },
          { name: 'setticketcategory', value: 'setticketcategory' },
          { name: 'deployticketpanel', value: 'deployticketpanel' }
        ]
      },
      {
        name: 'value',
        description: 'The value for the action',
        type: 3,
        required: false
      }
    ]
  },

  // Application System
  {
    name: 'app',
    description: 'Application system commands',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'msg', value: 'msg' },
          { name: 'addoptions', value: 'addoptions' },
          { name: 'setappchannel', value: 'setappchannel' },
          { name: 'deployapp', value: 'deployapp' },
          { name: 'setquestions', value: 'setquestions' }
        ]
      },
      {
        name: 'value',
        description: 'The value for the action',
        type: 3,
        required: false
      }
    ]
  },

  // Moderation Commands
  {
    name: 'warn',
    description: 'Warn a user',
    options: [
      {
        name: 'user',
        description: 'The user to warn',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'The reason for the warning',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'warnings',
    description: 'View warnings for a user',
    options: [
      {
        name: 'user',
        description: 'The user to check',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'clearwarns',
    description: 'Clear all warnings for a user',
    options: [
      {
        name: 'user',
        description: 'The user to clear warnings for',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'ban',
    description: 'Ban a user',
    options: [
      {
        name: 'user',
        description: 'The user to ban',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'The reason for the ban',
        type: 3,
        required: false
      },
      {
        name: 'days',
        description: 'Number of days of messages to delete',
        type: 4,
        required: false,
        min_value: 0,
        max_value: 7
      }
    ]
  },
  {
    name: 'unban',
    description: 'Unban a user',
    options: [
      {
        name: 'user',
        description: 'The user ID to unban',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'kick',
    description: 'Kick a user',
    options: [
      {
        name: 'user',
        description: 'The user to kick',
        type: 6,
        required: true
      },
      {
        name: 'reason',
        description: 'The reason for the kick',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'mute',
    description: 'Mute a user',
    options: [
      {
        name: 'user',
        description: 'The user to mute',
        type: 6,
        required: true
      },
      {
        name: 'duration',
        description: 'Duration of the mute (e.g., 1h, 30m)',
        type: 3,
        required: true
      },
      {
        name: 'reason',
        description: 'The reason for the mute',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'unmute',
    description: 'Unmute a user',
    options: [
      {
        name: 'user',
        description: 'The user to unmute',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'jail',
    description: 'Jail a user',
    options: [
      {
        name: 'user',
        description: 'The user to jail',
        type: 6,
        required: true
      },
      {
        name: 'duration',
        description: 'Duration of the jail (e.g., 1h, 30m)',
        type: 3,
        required: true
      },
      {
        name: 'reason',
        description: 'The reason for the jail',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'unjail',
    description: 'Unjail a user',
    options: [
      {
        name: 'user',
        description: 'The user to unjail',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'role',
    description: 'Role management commands',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'lock', value: 'lock' },
          { name: 'unlock', value: 'unlock' },
          { name: 'strip', value: 'strip' },
          { name: 'locked', value: 'locked' },
          { name: 'massroles', value: 'massroles' }
        ]
      },
      {
        name: 'user',
        description: 'The user to target',
        type: 6,
        required: false
      },
      {
        name: 'role',
        description: 'The role to target',
        type: 8,
        required: false
      }
    ]
  },
  {
    name: 'temprole',
    description: 'Temporary role commands',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'add', value: 'add' },
          { name: 'remove', value: 'remove' },
          { name: 'list', value: 'list' }
        ]
      },
      {
        name: 'user',
        description: 'The user to target',
        type: 6,
        required: false
      },
      {
        name: 'role',
        description: 'The role to target',
        type: 8,
        required: false
      },
      {
        name: 'duration',
        description: 'Duration for the role',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'history',
    description: 'View user history',
    options: [
      {
        name: 'type',
        description: 'The type of history to view',
        type: 3,
        required: true,
        choices: [
          { name: 'bans', value: 'bans' },
          { name: 'unbans', value: 'unbans' },
          { name: 'names', value: 'names' }
        ]
      },
      {
        name: 'user',
        description: 'The user to check',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'word',
    description: 'Word filter commands',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'blacklist', value: 'blacklist' },
          { name: 'unblacklist', value: 'unblacklist' },
          { name: 'blacklisted', value: 'blacklisted' }
        ]
      },
      {
        name: 'word',
        description: 'The word to target',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'user',
    description: 'User information commands',
    options: [
      {
        name: 'type',
        description: 'The type of info to get',
        type: 3,
        required: true,
        choices: [
          { name: 'avatar', value: 'avatar' },
          { name: 'banner', value: 'banner' },
          { name: 'info', value: 'info' },
          { name: 'link', value: 'link' },
          { name: 'perms', value: 'perms' },
          { name: 'profile', value: 'profile' },
          { name: 'roles', value: 'roles' },
          { name: 'inviter', value: 'inviter' }
        ]
      },
      {
        name: 'user',
        description: 'The user to target',
        type: 6,
        required: false
      }
    ]
  },

  // Economy Commands
  {
    name: 'cash',
    description: 'Check your balance',
    options: []
  },
  {
    name: 'cf',
    description: 'Coin flip game',
    options: [
      {
        name: 'amount',
        description: 'Amount to bet',
        type: 4,
        required: true,
        min_value: 1
      },
      {
        name: 'choice',
        description: 'Heads or tails',
        type: 3,
        required: true,
        choices: [
          { name: 'heads', value: 'heads' },
          { name: 'tails', value: 'tails' }
        ]
      }
    ]
  },
  {
    name: 'daily',
    description: 'Claim your daily reward',
    options: []
  },
  {
    name: 'weekly',
    description: 'Claim your weekly reward',
    options: []
  },
  {
    name: 'beg',
    description: 'Beg for money',
    options: []
  },
  {
    name: 'give',
    description: 'Give money to another user',
    options: [
      {
        name: 'user',
        description: 'The user to give to',
        type: 6,
        required: true
      },
      {
        name: 'amount',
        description: 'Amount to give',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },
  {
    name: 'deposit',
    description: 'Deposit money into your bank',
    options: [
      {
        name: 'amount',
        description: 'Amount to deposit',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },
  {
    name: 'withdraw',
    description: 'Withdraw money from your bank',
    options: [
      {
        name: 'amount',
        description: 'Amount to withdraw',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },
  {
    name: 'hunt',
    description: 'Go hunting for rewards',
    options: []
  },
  {
    name: 'battle',
    description: 'Battle another user',
    options: [
      {
        name: 'user',
        description: 'The user to battle',
        type: 6,
        required: true
      },
      {
        name: 'amount',
        description: 'Amount to bet',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },
  {
    name: 'inventory',
    description: 'View your inventory',
    options: []
  },
  {
    name: 'shop',
    description: 'View the shop',
    options: []
  },
  {
    name: 'buy',
    description: 'Buy an item from the shop',
    options: [
      {
        name: 'item',
        description: 'The item to buy',
        type: 3,
        required: true
      },
      {
        name: 'quantity',
        description: 'Quantity to buy',
        type: 4,
        required: false,
        min_value: 1,
        default: 1
      }
    ]
  },
  {
    name: 'sell',
    description: 'Sell an item from your inventory',
    options: [
      {
        name: 'item',
        description: 'The item to sell',
        type: 3,
        required: true
      },
      {
        name: 'quantity',
        description: 'Quantity to sell',
        type: 4,
        required: false,
        min_value: 1,
        default: 1
      }
    ]
  },

  // Mini-Games
  {
    name: 'rps',
    description: 'Play Rock Paper Scissors',
    options: [
      {
        name: 'choice',
        description: 'Your choice',
        type: 3,
        required: true,
        choices: [
          { name: 'rock', value: 'rock' },
          { name: 'paper', value: 'paper' },
          { name: 'scissors', value: 'scissors' }
        ]
      }
    ]
  },
  {
    name: 'guess',
    description: 'Guess the number game',
    options: [
      {
        name: 'number',
        description: 'Your guess (1-100)',
        type: 4,
        required: true,
        min_value: 1,
        max_value: 100
      }
    ]
  },
  {
    name: 'math',
    description: 'Solve a math problem',
    options: []
  },
  {
    name: 'type',
    description: 'Typing speed test',
    options: []
  },
  {
    name: 'trivia',
    description: 'Trivia quiz game',
    options: []
  },
  {
    name: 'snake',
    description: 'Play snake game',
    options: []
  },
  {
    name: 'slots',
    description: 'Play slot machine',
    options: [
      {
        name: 'amount',
        description: 'Amount to bet',
        type: 4,
        required: true,
        min_value: 1
      }
    ]
  },
  {
    name: '2048',
    description: 'Play 2048 game',
    options: []
  },
  {
    name: 'tictactoe',
    description: 'Play Tic Tac Toe',
    options: [
      {
        name: 'user',
        description: 'User to play against',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'colorclick',
    description: 'Color click game',
    options: []
  },
  {
    name: 'fastclick',
    description: 'Fast click game',
    options: []
  },
  {
    name: 'wordguess',
    description: 'Word guessing game',
    options: []
  },

  // DM & Embed Tools
  {
    name: 'dm',
    description: 'DM role members',
    options: [
      {
        name: 'role',
        description: 'The role to DM',
        type: 8,
        required: true
      },
      {
        name: 'message',
        description: 'The message to send',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'embed',
    description: 'Create an embed',
    options: [
      {
        name: 'color',
        description: 'The embed color (hex)',
        type: 3,
        required: true
      },
      {
        name: 'message',
        description: 'The embed content',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'msg',
    description: 'Send a message to a channel',
    options: [
      {
        name: 'channel',
        description: 'The channel to send to',
        type: 7,
        required: true
      },
      {
        name: 'message',
        description: 'The message to send',
        type: 3,
        required: true
      }
    ]
  },

  // Utility
  {
    name: 'userinfo',
    description: 'Get user information',
    options: [
      {
        name: 'user',
        description: 'The user to get info for',
        type: 6,
        required: false
      }
    ]
  },
  {
    name: 'serverinfo',
    description: 'Get server information',
    options: []
  },
  {
    name: 'ping',
    description: 'Check bot latency',
    options: []
  },
  {
    name: 'uptime',
    description: 'Check bot uptime',
    options: []
  },
  {
    name: 'botstats',
    description: 'View bot statistics',
    options: []
  },
  {
    name: 'prems',
    description: 'Give config access to a role',
    options: [
      {
        name: 'role',
        description: 'The role to give access to',
        type: 8,
        required: true
      }
    ]
  }
];

// Command handling
client.commands = new Collection();
const commands = [];

commandDefinitions.forEach(cmd => {
  client.commands.set(cmd.name, cmd);
  commands.push(cmd);
});

// Client ready event
client.once('ready', async () => {
  console.log(`🔥 ${client.user.tag} is online!`);
  
  // Register slash commands
  try {
    const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);
    await rest.put(
      Routes.applicationCommands(BOT_ID),
      { body: commands }
    );
    console.log('🔥 Slash commands registered successfully!');
  } catch (error) {
    console.error('❌ Error registering slash commands:', error);
  }
});

// Interaction handling
client.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const command = client.commands.get(interaction.commandName);
    if (!command) return;

    try {
      // Handle each command
      switch (command.name) {
        case 'help':
          await handleHelp(interaction);
          break;
        case 'ticket':
          await handleTicket(interaction, interaction.options.getString('action'), interaction.options.getString('value'));
          break;
        case 'app':
          await handleApp(interaction, interaction.options.getString('action'), interaction.options.getString('value'));
          break;
        case 'warn':
          await handleWarn(interaction, interaction.options.getUser('user'), interaction.options.getString('reason'));
          break;
        case 'warnings':
          await handleWarnings(interaction, interaction.options.getUser('user'));
          break;
        case 'clearwarns':
          await handleClearWarns(interaction, interaction.options.getUser('user'));
          break;
        case 'ban':
          await handleBan(interaction, interaction.options.getUser('user'), interaction.options.getString('reason'), interaction.options.getInteger('days'));
          break;
        case 'unban':
          await handleUnban(interaction, interaction.options.getString('user'));
          break;
        case 'kick':
          await handleKick(interaction, interaction.options.getUser('user'), interaction.options.getString('reason'));
          break;
        case 'mute':
          await handleMute(interaction, interaction.options.getUser('user'), interaction.options.getString('duration'), interaction.options.getString('reason'));
          break;
        case 'unmute':
          await handleUnmute(interaction, interaction.options.getUser('user'));
          break;
        case 'jail':
          await handleJail(interaction, interaction.options.getUser('user'), interaction.options.getString('duration'), interaction.options.getString('reason'));
          break;
        case 'unjail':
          await handleUnjail(interaction, interaction.options.getUser('user'));
          break;
        case 'role':
          await handleRole(interaction, interaction.options.getString('action'), interaction.options.getUser('user'), interaction.options.getRole('role'));
          break;
        case 'temprole':
          await handleTempRole(interaction, interaction.options.getString('action'), interaction.options.getUser('user'), interaction.options.getRole('role'), interaction.options.getString('duration'));
          break;
        case 'history':
          await handleHistory(interaction, interaction.options.getString('type'), interaction.options.getUser('user'));
          break;
        case 'word':
          await handleWordFilter(interaction, interaction.options.getString('action'), interaction.options.getString('word'));
          break;
        case 'user':
          await handleUserInfo(interaction, interaction.options.getString('type'), interaction.options.getUser('user'));
          break;
        case 'cash':
          await handleCash(interaction);
          break;
        case 'cf':
          await handleCoinFlip(interaction, interaction.options.getInteger('amount'), interaction.options.getString('choice'));
          break;
        case 'daily':
          await handleDaily(interaction);
          break;
        case 'weekly':
          await handleWeekly(interaction);
          break;
        case 'beg':
          await handleBeg(interaction);
          break;
        case 'give':
          await handleGive(interaction, interaction.options.getUser('user'), interaction.options.getInteger('amount'));
          break;
        case 'deposit':
          await handleDeposit(interaction, interaction.options.getInteger('amount'));
          break;
        case 'withdraw':
          await handleWithdraw(interaction, interaction.options.getInteger('amount'));
          break;
        case 'hunt':
          await handleHunt(interaction);
          break;
        case 'battle':
          await handleBattle(interaction, interaction.options.getUser('user'), interaction.options.getInteger('amount'));
          break;
        case 'inventory':
          await handleInventory(interaction);
          break;
        case 'shop':
          await handleShop(interaction);
          break;
        case 'buy':
          await handleBuy(interaction, interaction.options.getString('item'), interaction.options.getInteger('quantity') || 1);
          break;
        case 'sell':
          await handleSell(interaction, interaction.options.getString('item'), interaction.options.getInteger('quantity') || 1);
          break;
        case 'rps':
          await handleRPS(interaction, interaction.options.getString('choice'));
          break;
        case 'guess':
          await handleGuess(interaction, interaction.options.getInteger('number'));
          break;
        case 'math':
          await handleMath(interaction);
          break;
        case 'type':
          await handleType(interaction);
          break;
        case 'trivia':
          await handleTrivia(interaction);
          break;
        case 'snake':
          await handleSnake(interaction);
          break;
        case 'slots':
          await handleSlots(interaction, interaction.options.getInteger('amount'));
          break;
        case '2048':
          await handle2048(interaction);
          break;
        case 'tictactoe':
          await handleTicTacToe(interaction, interaction.options.getUser('user'));
          break;
        case 'colorclick':
          await handleColorClick(interaction);
          break;
        case 'fastclick':
          await handleFastClick(interaction);
          break;
        case 'wordguess':
          await handleWordGuess(interaction);
          break;
        case 'dm':
          await handleDM(interaction, interaction.options.getRole('role'), interaction.options.getString('message'));
          break;
        case 'embed':
          await handleEmbed(interaction, interaction.options.getString('color'), interaction.options.getString('message'));
          break;
        case 'msg':
          await handleMsg(interaction, interaction.options.getChannel('channel'), interaction.options.getString('message'));
          break;
        case 'userinfo':
          await handleUserInfoCommand(interaction, interaction.options.getUser('user'));
          break;
        case 'serverinfo':
          await handleServerInfo(interaction);
          break;
        case 'ping':
          await handlePing(interaction);
          break;
        case 'uptime':
          await handleUptime(interaction);
          break;
        case 'botstats':
          await handleBotStats(interaction);
          break;
        case 'prems':
          await handlePrems(interaction, interaction.options.getRole('role'));
          break;
        default:
          await interaction.reply({ 
            embeds: [createEmbed('❌ Unknown Command', 'This command is not implemented yet.', COLORS.ERROR)],
            ephemeral: true 
          });
      }
    } catch (error) {
      console.error(error);
      await interaction.reply({ 
        embeds: [createEmbed('❌ Error', 'There was an error executing that command!', COLORS.ERROR)],
        ephemeral: true 
      });
    }
  } else if (interaction.isButton()) {
    handleButton(interaction);
  } else if (interaction.isStringSelectMenu()) {
    handleSelectMenu(interaction);
  } else if (interaction.isModalSubmit()) {
    handleModalSubmit(interaction);
  }
});

// Message handling for prefix commands
client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith(PREFIX)) return;

  const args = message.content.slice(PREFIX.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();
  const command = client.commands.get(commandName);

  if (!command) {
    return message.reply({ 
      embeds: [createEmbed('❌ Unknown Command', `Try \`${PREFIX}help\` or \`/help\` to view available commands.`, COLORS.ERROR)]
    });
  }

  try {
    // Handle prefix commands similarly to slash commands
    switch (commandName) {
      case 'help':
        await handleHelp(message);
        break;
      case 'ticket':
        await handleTicket(message, args[0], args.slice(1).join(' '));
        break;
      case 'app':
        await handleApp(message, args[0], args.slice(1).join(' '));
        break;
      case 'warn':
        await handleWarn(message, message.mentions.users.first(), args.slice(1).join(' '));
        break;
      case 'warnings':
        await handleWarnings(message, message.mentions.users.first());
        break;
      case 'clearwarns':
        await handleClearWarns(message, message.mentions.users.first());
        break;
      case 'ban':
        await handleBan(message, message.mentions.users.first(), args.slice(1).join(' '));
        break;
      case 'unban':
        await handleUnban(message, args[0]);
        break;
      case 'kick':
        await handleKick(message, message.mentions.users.first(), args.slice(1).join(' '));
        break;
      case 'mute':
        await handleMute(message, message.mentions.users.first(), args[1], args.slice(2).join(' '));
        break;
      case 'unmute':
        await handleUnmute(message, message.mentions.users.first());
        break;
      case 'jail':
        await handleJail(message, message.mentions.users.first(), args[1], args.slice(2).join(' '));
        break;
      case 'unjail':
        await handleUnjail(message, message.mentions.users.first());
        break;
      case 'role':
        await handleRole(message, args[0], message.mentions.users.first(), message.mentions.roles.first());
        break;
      case 'temprole':
        await handleTempRole(message, args[0], message.mentions.users.first(), message.mentions.roles.first(), args[args.length - 1]);
        break;
      case 'history':
        await handleHistory(message, args[0], message.mentions.users.first());
        break;
      case 'word':
        await handleWordFilter(message, args[0], args[1]);
        break;
      case 'user':
        await handleUserInfo(message, args[0], message.mentions.users.first() || message.author);
        break;
      case 'cash':
        await handleCash(message);
        break;
      case 'cf':
        await handleCoinFlip(message, parseInt(args[0]), args[1]);
        break;
      case 'daily':
        await handleDaily(message);
        break;
      case 'weekly':
        await handleWeekly(message);
        break;
      case 'beg':
        await handleBeg(message);
        break;
      case 'give':
        await handleGive(message, message.mentions.users.first(), parseInt(args[1]));
        break;
      case 'deposit':
        await handleDeposit(message, parseInt(args[0]));
        break;
      case 'withdraw':
        await handleWithdraw(message, parseInt(args[0]));
        break;
      case 'hunt':
        await handleHunt(message);
        break;
      case 'battle':
        await handleBattle(message, message.mentions.users.first(), parseInt(args[1]));
        break;
      case 'inventory':
        await handleInventory(message);
        break;
      case 'shop':
        await handleShop(message);
        break;
      case 'buy':
        await handleBuy(message, args[0], parseInt(args[1]) || 1);
        break;
      case 'sell':
        await handleSell(message, args[0], parseInt(args[1]) || 1);
        break;
      case 'rps':
        await handleRPS(message, args[0]);
        break;
      case 'guess':
        await handleGuess(message, parseInt(args[0]));
        break;
      case 'math':
        await handleMath(message);
        break;
      case 'type':
        await handleType(message);
        break;
      case 'trivia':
        await handleTrivia(message);
        break;
      case 'snake':
        await handleSnake(message);
        break;
      case 'slots':
        await handleSlots(message, parseInt(args[0]));
        break;
      case '2048':
        await handle2048(message);
        break;
      case 'tictactoe':
        await handleTicTacToe(message, message.mentions.users.first());
        break;
      case 'colorclick':
        await handleColorClick(message);
        break;
      case 'fastclick':
        await handleFastClick(message);
        break;
      case 'wordguess':
        await handleWordGuess(message);
        break;
      case 'dm':
        await handleDM(message, message.mentions.roles.first(), args.slice(1).join(' '));
        break;
      case 'embed':
        await handleEmbed(message, args[0], args.slice(1).join(' '));
        break;
      case 'msg':
        await handleMsg(message, message.mentions.channels.first(), args.slice(1).join(' '));
        break;
      case 'userinfo':
        await handleUserInfoCommand(message, message.mentions.users.first() || message.author);
        break;
      case 'serverinfo':
        await handleServerInfo(message);
        break;
      case 'ping':
        await handlePing(message);
        break;
      case 'uptime':
        await handleUptime(message);
        break;
      case 'botstats':
        await handleBotStats(message);
        break;
      case 'prems':
        await handlePrems(message, message.mentions.roles.first());
        break;
      default:
        await message.reply({ 
          embeds: [createEmbed('❌ Unknown Command', 'This command is not implemented yet.', COLORS.ERROR)]
        });
    }
  } catch (error) {
    console.error(error);
    message.reply({ 
      embeds: [createEmbed('❌ Error', 'There was an error executing that command!', COLORS.ERROR)]
    });
  }
});

// ======================
// COMMAND HANDLERS
// ======================

// Help command
async function handleHelp(interaction) {
  const categories = [
    { emoji: '🎟️', name: 'Ticket System', value: 'ticket' },
    { emoji: '📋', name: 'Application System', value: 'app' },
    { emoji: '⚠️', name: 'Moderation', value: 'mod' },
    { emoji: '💰', name: 'Economy', value: 'economy' },
    { emoji: '🎮', name: 'Mini-Games', value: 'games' },
    { emoji: '📩', name: 'DM & Embed Tools', value: 'dm' },
    { emoji: 'ℹ️', name: 'Utility Commands', value: 'utility' },
    { emoji: '🛠️', name: 'Admin Config', value: 'admin' }
  ];

  const selectMenu = new StringSelectMenuBuilder()
    .setCustomId('help_category')
    .setPlaceholder('Select a category')
    .addOptions(categories.map(cat => ({
      label: cat.name,
      value: cat.value,
      emoji: cat.emoji
    })));

  const row = new ActionRowBuilder().addComponents(selectMenu);

  await interaction.reply({
    embeds: [createEmbed('📬 ZyroBot Help Menu', 'Select a category from the dropdown below to view commands.', COLORS.DEFAULT)],
    components: [row]
  });
}

// Ticket system
async function handleTicket(interaction, action, value) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need administrator permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  switch (action) {
    case 'msg':
      db.settings.ticket.message = value;
      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', 'Ticket panel message has been set.', COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    case 'setoptions':
      // Show modal to add options
      const modal = new ModalBuilder()
        .setCustomId('ticket_options_modal')
        .setTitle('Add Ticket Options');

      const optionsInput = new TextInputBuilder()
        .setCustomId('ticket_options_input')
        .setLabel('Options (one per line)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(optionsInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
      break;
    case 'setviewer':
      const role = interaction.mentions?.roles?.first() || interaction.options?.getRole('role');
      if (!role) {
        return interaction.reply({ 
          embeds: [createEmbed('❌ Error', 'Please mention a role or provide a role ID.', COLORS.ERROR)],
          ephemeral: true 
        });
      }
      db.settings.ticket.viewerRole = role.id;
      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', `Ticket viewer role set to ${role.name}.`, COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    case 'setticketcategory':
      const category = interaction.mentions?.channels?.first() || interaction.options?.getChannel('channel');
      if (!category || category.type !== 4) {
        return interaction.reply({ 
          embeds: [createEmbed('❌ Error', 'Please mention a category channel.', COLORS.ERROR)],
          ephemeral: true 
        });
      }
      db.settings.ticket.category = category.id;
      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', `Ticket category set to ${category.name}.`, COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    case 'deployticketpanel':
      if (!db.settings.ticket.message || !db.settings.ticket.options.length) {
        return interaction.reply({ 
          embeds: [createEmbed('❌ Error', 'Please set the ticket message and options first.', COLORS.ERROR)],
          ephemeral: true 
        });
      }

      const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder('Select a ticket type')
        .addOptions(db.settings.ticket.options.map((opt, i) => ({
          label: opt,
          value: `ticket_${i}`,
          description: `Create a ${opt} ticket`
        })));

      const row = new ActionRowBuilder().addComponents(selectMenu);

      await interaction.channel.send({
        embeds: [createEmbed('🎟️ Ticket System', db.settings.ticket.message, COLORS.TICKET)],
        components: [row]
      });

      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', 'Ticket panel has been deployed!', COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    default:
      await interaction.reply({ 
        embeds: [createEmbed('❌ Invalid Action', 'Please specify a valid ticket action.', COLORS.ERROR)],
        ephemeral: true 
      });
  }
}

// Application system
async function handleApp(interaction, action, value) {
  if (!isAdmin(interaction.member)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need administrator permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  switch (action) {
    case 'msg':
      db.settings.application.message = value;
      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', 'Application panel message has been set.', COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    case 'addoptions':
      // Show modal to add role options
      const modal = new ModalBuilder()
        .setCustomId('app_roles_modal')
        .setTitle('Add Application Roles');

      const rolesInput = new TextInputBuilder()
        .setCustomId('app_roles_input')
        .setLabel('Role IDs (one per line)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const firstActionRow = new ActionRowBuilder().addComponents(rolesInput);
      modal.addComponents(firstActionRow);

      await interaction.showModal(modal);
      break;
    case 'setappchannel':
      const channel = interaction.mentions?.channels?.first() || interaction.options?.getChannel('channel');
      if (!channel) {
        return interaction.reply({ 
          embeds: [createEmbed('❌ Error', 'Please mention a channel.', COLORS.ERROR)],
          ephemeral: true 
        });
      }
      db.settings.application.channel = channel.id;
      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', `Application channel set to ${channel.name}.`, COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    case 'setquestions':
      // Show modal to set questions
      const questionsModal = new ModalBuilder()
        .setCustomId('app_questions_modal')
        .setTitle('Set Application Questions');

      const questionsInput = new TextInputBuilder()
        .setCustomId('app_questions_input')
        .setLabel('Questions (one per line, max 10)')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const questionsRow = new ActionRowBuilder().addComponents(questionsInput);
      questionsModal.addComponents(questionsRow);

      await interaction.showModal(questionsModal);
      break;
    case 'deployapp':
      if (!db.settings.application.message || !db.settings.application.roles.length) {
        return interaction.reply({ 
          embeds: [createEmbed('❌ Error', 'Please set the application message and roles first.', COLORS.ERROR)],
          ephemeral: true 
        });
      }

      const buttons = db.settings.application.roles.map(roleId => {
        const role = interaction.guild.roles.cache.get(roleId);
        return new ButtonBuilder()
          .setCustomId(`app_${roleId}`)
          .setLabel(role?.name || 'Unknown Role')
          .setStyle(ButtonStyle.Primary);
      });

      const rows = [];
      for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
      }

      await interaction.channel.send({
        embeds: [createEmbed('📋 Application System', db.settings.application.message, COLORS.APPLICATION)],
        components: rows
      });

      await interaction.reply({ 
        embeds: [createEmbed('✅ Success', 'Application panel has been deployed!', COLORS.SUCCESS)],
        ephemeral: true 
      });
      break;
    default:
      await interaction.reply({ 
        embeds: [createEmbed('❌ Invalid Action', 'Please specify a valid application action.', COLORS.ERROR)],
        ephemeral: true 
      });
  }
}

// Moderation commands
async function handleWarn(interaction, user, reason = 'No reason provided') {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need moderation permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  const warnedUser = user.user || user;
  const moderator = interaction.user;

  if (!db.warnings[warnedUser.id]) db.warnings[warnedUser.id] = [];
  db.warnings[warnedUser.id].push({
    moderator: moderator.id,
    reason,
    timestamp: Date.now()
  });

  await interaction.reply({ 
    embeds: [createEmbed('⚠️ User Warned', `${warnedUser.tag} has been warned for: ${reason}`, COLORS.WARNING)]
  });

  try {
    await warnedUser.send({ 
      embeds: [createEmbed('⚠️ You have been warned', `You were warned in ${interaction.guild.name} for: ${reason}`, COLORS.WARNING)]
    });
  } catch (err) {
    console.log(`Could not DM user ${warnedUser.tag}`);
  }
}

async function handleWarnings(interaction, user) {
  const targetUser = user.user || user;
  
  if (!db.warnings[targetUser.id] || db.warnings[targetUser.id].length === 0) {
    return interaction.reply({ 
      embeds: [createEmbed('⚠️ Warnings', `${targetUser.tag} has no warnings.`, COLORS.INFO)]
    });
  }

  const warnings = db.warnings[targetUser.id].map((warn, i) => ({
    name: `Warning #${i + 1}`,
    value: `**Moderator:** <@${warn.moderator}>\n**Reason:** ${warn.reason}\n**Date:** <t:${Math.floor(warn.timestamp / 1000)}:f>`
  }));

  await interaction.reply({
    embeds: [createEmbed(
      `⚠️ Warnings for ${targetUser.tag}`,
      `Total warnings: ${warnings.length}`,
      COLORS.WARNING,
      warnings
    )]
  });
}

async function handleClearWarns(interaction, user) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need moderation permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  const targetUser = user.user || user;
  
  if (!db.warnings[targetUser.id] || db.warnings[targetUser.id].length === 0) {
    return interaction.reply({ 
      embeds: [createEmbed('⚠️ Warnings', `${targetUser.tag} has no warnings to clear.`, COLORS.INFO)]
    });
  }

  const count = db.warnings[targetUser.id].length;
  delete db.warnings[targetUser.id];

  await interaction.reply({
    embeds: [createEmbed(
      '✅ Warnings Cleared',
      `Successfully cleared ${count} warnings for ${targetUser.tag}.`,
      COLORS.SUCCESS
    )]
  });
}

async function handleBan(interaction, user, reason = 'No reason provided', days = 0) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need ban permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await interaction.guild.members.ban(user, { reason, deleteMessageDays: days });
    await interaction.reply({ 
      embeds: [createEmbed('🔨 User Banned', `${user.tag} has been banned for: ${reason}`, COLORS.ERROR)]
    });

    // Log ban
    if (!db.userHistory[user.id]) db.userHistory[user.id] = { bans: [], unbans: [], nameChanges: [] };
    if (!db.userHistory[user.id].bans) db.userHistory[user.id].bans = [];
    db.userHistory[user.id].bans.push({
      moderator: interaction.user.id,
      reason,
      timestamp: Date.now()
    });
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to ban ${user.tag}: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

async function handleUnban(interaction, userId) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.BanMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need ban permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await interaction.guild.members.unban(userId);
    await interaction.reply({ 
      embeds: [createEmbed('✅ User Unbanned', `User with ID ${userId} has been unbanned.`, COLORS.SUCCESS)]
    });

    // Log unban
    if (!db.userHistory[userId]) db.userHistory[userId] = { bans: [], unbans: [], nameChanges: [] };
    if (!db.userHistory[userId].unbans) db.userHistory[userId].unbans = [];
    db.userHistory[userId].unbans.push({
      moderator: interaction.user.id,
      timestamp: Date.now()
    });
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to unban user: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

async function handleKick(interaction, user, reason = 'No reason provided') {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.KickMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need kick permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await interaction.guild.members.kick(user, reason);
    await interaction.reply({ 
      embeds: [createEmbed('👢 User Kicked', `${user.tag} has been kicked for: ${reason}`, COLORS.WARNING)]
    });
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to kick ${user.tag}: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

async function handleMute(interaction, user, duration, reason = 'No reason provided') {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need timeout permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  const durationMs = parseDuration(duration);
  if (!durationMs) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Error', 'Invalid duration format. Use something like "1h", "30m", etc.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await user.timeout(durationMs, reason);
    await interaction.reply({ 
      embeds: [createEmbed(
        '🔇 User Muted',
        `${user.tag} has been muted for ${formatDuration(durationMs)}.\n**Reason:** ${reason}`,
        COLORS.WARNING
      )]
    });
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to mute ${user.tag}: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

async function handleUnmute(interaction, user) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need timeout permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await user.timeout(null);
    await interaction.reply({ 
      embeds: [createEmbed('🔊 User Unmuted', `${user.tag} has been unmuted.`, COLORS.SUCCESS)]
    });
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to unmute ${user.tag}: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

async function handleJail(interaction, user, duration, reason = 'No reason provided') {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need moderation permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  // Jail is similar to mute but with a jail role
  const jailRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'jail');
  if (!jailRole) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Error', 'Could not find a "Jail" role. Please create one.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  const durationMs = parseDuration(duration);
  if (!durationMs) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Error', 'Invalid duration format. Use something like "1h", "30m", etc.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await user.roles.add(jailRole, reason);
    
    // Store original roles
    if (!db.tempRoles[user.id]) db.tempRoles[user.id] = [];
    db.tempRoles[user.id].push({
      roleId: jailRole.id,
      addedAt: Date.now(),
      duration: durationMs,
      reason
    });

    // Remove other roles
    const rolesToRemove = user.roles.cache.filter(r => r.id !== interaction.guild.id && r.id !== jailRole.id);
    if (rolesToRemove.size > 0) {
      await user.roles.remove(rolesToRemove, 'Jail - removing other roles');
    }

    await interaction.reply({ 
      embeds: [createEmbed(
        '⛓️ User Jailed',
        `${user.tag} has been jailed for ${formatDuration(durationMs)}.\n**Reason:** ${reason}`,
        COLORS.WARNING
      )]
    });

    // Set timeout to remove jail role
    setTimeout(async () => {
      if (user.roles.cache.has(jailRole.id)) {
        await user.roles.remove(jailRole, 'Jail time expired');
      }
    }, durationMs);
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to jail ${user.tag}: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

async function handleUnjail(interaction, user) {
  if (!interaction.member.permissions.has(PermissionsBitField.Flags.ModerateMembers)) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Permission Denied', 'You need moderation permissions to use this command.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  const jailRole = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === 'jail');
  if (!jailRole) {
    return interaction.reply({ 
      embeds: [createEmbed('❌ Error', 'Could not find a "Jail" role. Please create one.', COLORS.ERROR)],
      ephemeral: true 
    });
  }

  try {
    await user.roles.remove(jailRole, 'Unjail command');
    await interaction.reply({ 
      embeds: [createEmbed('🔓 User Unjailed', `${user.tag} has been released from jail.`, COLORS.SUCCESS)]
    });
  } catch (error) {
    await interaction.reply({ 
      embeds: [createEmbed('❌ Error', `Failed to unjail ${user.tag}: ${error.message}`, COLORS.ERROR)],
      ephemeral: true 
    });
  }
}

// Economy commands
async function handleCash(interaction) {
  const user = interaction.user;
  const economy = getEconomy(user.id);

  await interaction.reply({
    embeds: [createEmbed(
      '💰 Your Balance',
      `**Wallet:** ${formatMoney(economy.wallet)}\n**Bank:** ${formatMoney(economy.bank)}`,
      COLORS.ECONOMY
    )]
  });
}

async function handleCoinFlip(interaction, amount, choice) {
  const user = interaction.user;
  const economy = getEconomy(user.id);

  if (economy.wallet < amount) {
    return interaction.reply({
      embeds: [createEmbed('❌ Error', `You don't have enough money! You need ${formatMoney(amount)} but only have ${formatMoney(economy.wallet)}.`, COLORS.ERROR)],
      ephemeral: true
    });
  }

  const result = Math.random() < 0.5 ? 'heads' : 'tails';
  const win = result === choice.toLowerCase();

  if (win) {
    economy.wallet += amount;
    await interaction.reply({
      embeds: [createEmbed(
        '🎉 You Won!',
        `The coin landed on ${result}!\nYou won ${formatMoney(amount * 2)}!`,
        COLORS.SUCCESS
      )]
    });
  } else {
    economy.wallet -= amount;
    await interaction.reply({
      embeds: [createEmbed(
        '❌ You Lost',
        `The coin landed on ${result}.\nYou lost ${formatMoney(amount)}.`,
        COLORS.ERROR
      )]
    });
  }
}

async function handleDaily(interaction) {
  const user = interaction.user;
  const economy = getEconomy(user.id);
  const cooldown = checkCooldown(user.id, 'daily');

  if (cooldown > 0) {
    return interaction.reply({
      embeds: [createEmbed(
        '⏳ Cooldown',
        `You can claim your daily again in ${formatDuration(cooldown * 1000)}.`,
        COLORS.WARNING
      )],
      ephemeral: true
    });
  }

  const amount = 100 + Math.floor(Math.random() * 400);
  economy.wallet += amount;
  economy.lastDaily = Date.now();
  addCooldown(user.id, 'daily', db.settings.economy.cooldowns.daily);

  await interaction.reply({
    embeds: [createEmbed(
      '💰 Daily Reward',
      `You claimed your daily reward of ${formatMoney(amount)}!`,
      COLORS.ECONOMY
    )]
  });
}

async function handleWeekly(interaction) {
  const user = interaction.user;
  const economy = getEconomy(user.id);
  const cooldown = checkCooldown(user.id, 'weekly');

  if (cooldown > 0) {
    return interaction.reply({
      embeds: [createEmbed(
        '⏳ Cooldown',
        `You can claim your weekly again in ${formatDuration(cooldown * 1000)}.`,
        COLORS.WARNING
      )],
      ephemeral: true
    });
  }

  const amount = 1000 + Math.floor(Math.random() * 2000);
  economy.wallet += amount;
  economy.lastWeekly = Date.now();
  addCooldown(user.id, 'weekly', db.settings.economy.cooldowns.weekly);

  await interaction.reply({
    embeds: [createEmbed(
      '💰 Weekly Reward',
      `You claimed your weekly reward of ${formatMoney(amount)}!`,
      COLORS.ECONOMY
    )]
  });
}

async function handleBeg(interaction) {
  const user = interaction.user;
  const economy = getEconomy(user.id);
  const cooldown = checkCooldown(user.id, 'beg');

  if (cooldown > 0) {
    return interaction.reply({
      embeds: [createEmbed(
        '⏳ Cooldown',
        `You can beg again in ${formatDuration(cooldown * 1000)}.`,
        COLORS.WARNING
      )],
      ephemeral: true
    });
  }

  const success = Math.random() < 0.6;
  if (success) {
    const amount = 5 + Math.floor(Math.random() * 45);
    economy.wallet += amount;
    economy.lastBeg = Date.now();
    addCooldown(user.id, 'beg', db.settings.economy.cooldowns.beg);

    await interaction.reply({
      embeds: [createEmbed(
        '🙏 Begging',
        `Someone gave you ${formatMoney(amount)}!`,
        COLORS.ECONOMY
      )]
    });
  } else {
    economy.lastBeg = Date.now();
    addCooldown(user.id, 'beg', db.settings.economy.cooldowns.beg);

    await interaction.reply({
      embeds: [createEmbed(
        '🙏 Begging',
        'No one gave you anything this time...',
        COLORS.WARNING
      )]
    });
  }
}

// Game commands
async function handleRPS(interaction, choice) {
  const choices = ['rock', 'paper', 'scissors'];
  const botChoice = choices[Math.floor(Math.random() * choices.length)];
  
  let result;
  if (choice === botChoice) {
    result = "It's a tie!";
  } else if (
    (choice === 'rock' && botChoice === 'scissors') ||
    (choice === 'paper' && botChoice === 'rock') ||
    (choice === 'scissors' && botChoice === 'paper')
  ) {
    result = 'You win!';
  } else {
    result = 'I win!';
  }

  await interaction.reply({
    embeds: [createEmbed(
      '🎮 Rock Paper Scissors',
      `You chose: ${choice}\nI chose: ${botChoice}\n\n**${result}**`,
      COLORS.INFO
    )]
  });
}

async function handleGuess(interaction, number) {
  const target = Math.floor(Math.random() * 100) + 1;
  const difference = Math.abs(number - target);

  let result, color;
  if (number === target) {
    result = '🎉 You guessed it exactly right!';
    color = COLORS.SUCCESS;
  } else if (difference <= 5) {
    result = '🔥 You were very close!';
    color = COLORS.SUCCESS;
  } else if (difference <= 15) {
    result = '👍 You were close!';
    color = COLORS.INFO;
  } else if (number < target) {
    result = '📈 The number is higher!';
    color = COLORS.WARNING;
  } else {
    result = '📉 The number is lower!';
    color = COLORS.WARNING;
  }

  await interaction.reply({
    embeds: [createEmbed(
      '🔢 Number Guessing Game',
      `Your guess: ${number}\nThe number was: ${target}\n\n**${result}**`,
      color
    )]
  });
}

// Utility commands
async function handlePing(interaction) {
  const sent = await interaction.reply({ 
    embeds: [createEmbed('🏓 Pinging...', 'Calculating latency...', COLORS.INFO)],
    fetchReply: true 
  });
  
  const latency = sent.createdTimestamp - interaction.createdTimestamp;
  const apiLatency = Math.round(client.ws.ping);
  
  await interaction.editReply({
    embeds: [createEmbed(
      '🏓 Pong!',
      `**Bot Latency:** ${latency}ms\n**API Latency:** ${apiLatency}ms`,
      COLORS.SUCCESS
    )]
  });
}

async function handleUptime(interaction) {
  const uptime = process.uptime();
  const days = Math.floor(uptime / 86400);
  const hours = Math.floor(uptime % 86400 / 3600);
  const minutes = Math.floor(uptime % 3600 / 60);
  const seconds = Math.floor(uptime % 60);

  await interaction.reply({
    embeds: [createEmbed(
      '⏱️ Bot Uptime',
      `The bot has been online for:\n${days}d ${hours}h ${minutes}m ${seconds}s`,
      COLORS.INFO
    )]
  });
}

// Button handlers
async function handleButton(interaction) {
  const customId = interaction.customId;
  
  if (customId.startsWith('ticket_')) {
    // Handle ticket creation
    const optionIndex = parseInt(customId.split('_')[1]);
    const option = db.settings.ticket.options[optionIndex];
    
    if (!option) {
      return interaction.reply({ 
        embeds: [createEmbed('❌ Error', 'Invalid ticket option.', COLORS.ERROR)],
        ephemeral: true 
      });
    }

    const ticketName = `ticket-${interaction.user.username.toLowerCase()}-${Date.now().toString().slice(-4)}`;
    const category = interaction.guild.channels.cache.get(db.settings.ticket.category);
    
    if (!category) {
      return interaction.reply({ 
        embeds: [createEmbed('❌ Error', 'Ticket category is not set up.', COLORS.ERROR)],
        ephemeral: true 
      });
    }

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: 0,
        parent: category.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages]
          }
        ]
      });

      if (db.settings.ticket.viewerRole) {
        await ticketChannel.permissionOverwrites.create(db.settings.ticket.viewerRole, {
          ViewChannel: true,
          SendMessages: true
        });
      }

      db.tickets[ticketChannel.id] = {
        creator: interaction.user.id,
        type: option,
        createdAt: Date.now(),
        claimed: false
      };

      await ticketChannel.send({
        embeds: [createEmbed(
          '🎟️ Ticket Created',
          `${interaction.user}, your ${option} ticket has been created!\n\nPlease describe your issue in detail.`,
          COLORS.TICKET
        )],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('ticket_close')
              .setLabel('Close Ticket')
              .setStyle(ButtonStyle.Danger)
              .setEmoji('🔒'),
            new ButtonBuilder()
              .setCustomId('ticket_claim')
              .setLabel('Claim Ticket')
              .setStyle(ButtonStyle.Primary)
              .setEmoji('🧑')
          )
        ]
      });

      await interaction.reply({ 
        embeds: [createEmbed('✅ Ticket Created', `Your ticket has been created: ${ticketChannel}`, COLORS.SUCCESS)],
        ephemeral: true 
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({ 
        embeds: [createEmbed('❌ Error', 'Failed to create ticket channel.', COLORS.ERROR)],
        ephemeral: true 
      });
    }
  } else if (customId === 'ticket_close') {
    // Handle ticket closing
    const ticket = db.tickets[interaction.channel.id];
    if (!ticket) return;

    if (interaction.user.id !== ticket.creator && !isAdmin(interaction.member)) {
      return interaction.reply({ 
        embeds: [createEmbed('❌ Permission Denied', 'Only the ticket creator or staff can close this ticket.', COLORS.ERROR)],
        ephemeral: true 
      });
    }

    await interaction.reply({ 
      embeds: [createEmbed('🔒 Closing Ticket', 'This ticket will be closed in 10 seconds...', COLORS.WARNING)]
    });

    setTimeout(async () => {
      try {
        await interaction.channel.delete('Ticket closed');
        delete db.tickets[interaction.channel.id];
      } catch (error) {
        console.error('Error deleting ticket channel:', error);
      }
    }, 10000);
  } else if (customId === 'ticket_claim') {
    // Handle ticket claiming
    const ticket = db.tickets[interaction.channel.id];
    if (!ticket) return;

    if (ticket.claimed) {
      return interaction.reply({ 
        embeds: [createEmbed('ℹ️ Ticket Already Claimed', `This ticket is already claimed by <@${ticket.claimedBy}>.`, COLORS.INFO)],
        ephemeral: true 
      });
    }

    ticket.claimed = true;
    ticket.claimedBy = interaction.user.id;

    await interaction.channel.permissionOverwrites.create(interaction.user.id, {
      ViewChannel: true,
      SendMessages: true
    });

    await interaction.reply({ 
      embeds: [createEmbed('🧑 Ticket Claimed', `${interaction.user} has claimed this ticket.`, COLORS.SUCCESS)]
    });
  } else if (customId.startsWith('app_')) {
    // Handle application button clicks
    const roleId = customId.split('_')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    
    if (!role) {
      return interaction.reply({ 
        embeds: [createEmbed('❌ Error', 'This application role is no longer available.', COLORS.ERROR)],
        ephemeral: true 
      });
    }

    if (!db.settings.application.questions.length) {
      return interaction.reply({ 
        embeds: [createEmbed('❌ Error', 'Application questions are not set up.', COLORS.ERROR)],
        ephemeral: true 
      });
    }

    // Store application info temporarily
    db.applications[interaction.user.id] = {
      roleId,
      answers: [],
      currentQuestion: 0
    };

    // Ask first question
    await interaction.reply({ 
      embeds: [createEmbed(
        '📋 Application Started',
        `You're applying for: ${role.name}\n\n**Question 1:** ${db.settings.application.questions[0]}`,
        COLORS.APPLICATION
      )],
      ephemeral: true 
    });
  }
}

// Select menu handlers
async function handleSelectMenu(interaction) {
  if (interaction.customId === 'help_category') {
    const category = interaction.values[0];
    let commands = [];
    let description = '';
    
    switch (category) {
      case 'ticket':
        commands = [
          { name: 'ticket msg', description: 'Set ticket panel message' },
          { name: 'setoptions', description: 'Add dropdown categories' },
          { name: 'setviewer', description: 'Set ticket viewer role' },
          { name: 'setticketcategory', description: 'Parent category' },
          { name: 'deployticketpanel', description: 'Sends ticket panel' }
        ];
        description = '🎟️ Ticket System Commands';
        break;
      case 'app':
        commands = [
          { name: 'app msg', description: 'Set application panel' },
          { name: 'addoptions', description: 'Add role buttons' },
          { name: 'setappchannel', description: 'Channel for applications' },
          { name: 'deployapp', description: 'Deploy application panel' },
          { name: 'setquestions', description: 'Set application questions' }
        ];
        description = '📋 Application System Commands';
        break;
      case 'mod':
        commands = [
          { name: 'warn', description: 'Warn a user' },
          { name: 'warnings', description: 'View warnings' },
          { name: 'clearwarns', description: 'Clear all warnings' },
          { name: 'ban/unban', description: 'Ban or unban a user' },
          { name: 'kick', description: 'Kick a user' },
          { name: 'mute/unmute', description: 'Mute or unmute a user' },
          { name: 'jail/unjail', description: 'Jail or unjail a user' }
        ];
        description = '⚠️ Moderation Commands';
        break;
      case 'economy':
        commands = [
          { name: 'cash', description: 'Check your balance' },
          { name: 'cf', description: 'Coin flip game' },
          { name: 'daily', description: 'Claim daily reward' },
          { name: 'weekly', description: 'Claim weekly reward' },
          { name: 'beg', description: 'Beg for money' },
          { name: 'give', description: 'Give money to another user' },
          { name: 'deposit/withdraw', description: 'Manage your bank' },
          { name: 'hunt/battle', description: 'Earn money' },
          { name: 'inventory/shop', description: 'Manage items' }
        ];
        description = '💰 Economy Commands';
        break;
      case 'games':
        commands = [
          { name: 'rps', description: 'Rock Paper Scissors' },
          { name: 'guess', description: 'Guess the number' },
          { name: 'math', description: 'Math problem' },
          { name: 'type', description: 'Typing speed test' },
          { name: 'trivia', description: 'Quiz game' },
          { name: 'snake', description: 'Snake game' },
          { name: 'slots', description: 'Slot machine' },
          { name: '2048', description: '2048 game' },
          { name: 'tictactoe', description: 'Tic Tac Toe' }
        ];
        description = '🎮 Mini-Game Commands';
        break;
      case 'dm':
        commands = [
          { name: 'dm', description: 'DM role members' },
          { name: 'embed', description: 'Create an embed' },
          { name: 'msg', description: 'Relay to channel' }
        ];
        description = '📩 DM & Embed Tools';
        break;
      case 'utility':
        commands = [
          { name: 'userinfo', description: 'Full user info' },
          { name: 'serverinfo', description: 'Server stats' },
          { name: 'ping', description: 'Check latency' },
          { name: 'uptime', description: 'Check uptime' },
          { name: 'botstats', description: 'Bot statistics' }
        ];
        description = 'ℹ️ Utility Commands';
        break;
      case 'admin':
        commands = [
          { name: 'prems', description: 'Give config access' },
          { name: 'config', description: 'Configure bot settings' }
        ];
        description = '🛠️ Admin Config Commands';
        break;
    }
    
    const fields = commands.map(cmd => ({
      name: `\`/${cmd.name}\` or \`${PREFIX}${cmd.name}\``,
      value: cmd.description,
      inline: true
    }));
    
   await interaction.update({
  embeds: [createEmbed(description, 'Select a command to view details', COLORS.DEFAULT, fields)],
  components: interaction.message.components
});

  }
}

// Modal submit handlers
async function handleModalSubmit(interaction) {
  if (interaction.customId === 'ticket_options_modal') {
    const options = interaction.fields.getTextInputValue('ticket_options_input').split('\n').filter(o => o.trim());
    db.settings.ticket.options = options.slice(0, 25); // Limit to 25 options
    
    await interaction.reply({ 
      embeds: [createEmbed('✅ Success', `Set ${options.length} ticket options.`, COLORS.SUCCESS)],
      ephemeral: true 
    });
  } else if (interaction.customId === 'app_roles_modal') {
    const roles = interaction.fields.getTextInputValue('app_roles_input').split('\n').filter(r => r.trim());
    db.settings.application.roles = roles.slice(0, 25); // Limit to 25 roles
    
    await interaction.reply({ 
      embeds: [createEmbed('✅ Success', `Set ${roles.length} application roles.`, COLORS.SUCCESS)],
      ephemeral: true 
    });
  } else if (interaction.customId === 'app_questions_modal') {
    const questions = interaction.fields.getTextInputValue('app_questions_input').split('\n').filter(q => q.trim());
    db.settings.application.questions = questions.slice(0, 10); // Limit to 10 questions
    
    await interaction.reply({ 
      embeds: [createEmbed('✅ Success', `Set ${questions.length} application questions.`, COLORS.SUCCESS)],
      ephemeral: true 
    });
  }
}

// Message collectors for applications
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  
  const application = db.applications[message.author.id];
  if (!application) return;

  // Check if message is in DMs
  if (message.channel.type !== 1) return;

  // Store answer
  application.answers.push(message.content);
  application.currentQuestion++;

  // Check if all questions answered
  if (application.currentQuestion >= db.settings.application.questions.length) {
    // Submit application
    const appChannel = message.client.channels.cache.get(db.settings.application.channel);
    if (!appChannel) {
      return message.reply({ 
        embeds: [createEmbed('❌ Error', 'Application channel is not set up.', COLORS.ERROR)]
      });
    }

    const role = message.client.guilds.cache.first().roles.cache.get(application.roleId);
    if (!role) {
      return message.reply({ 
        embeds: [createEmbed('❌ Error', 'The role you applied for no longer exists.', COLORS.ERROR)]
      });
    }

    const embed = createEmbed(
      `📋 New Application - ${role.name}`,
      `**Applicant:** ${message.author.tag} (${message.author.id})`,
      COLORS.APPLICATION
    );

    // Add questions and answers as fields
    db.settings.application.questions.forEach((question, i) => {
      embed.addFields({
        name: `Question ${i + 1}`,
        value: question,
        inline: false
      }, {
        name: `Answer ${i + 1}`,
        value: application.answers[i] || 'No answer provided',
        inline: false
      });
    });

    // Add action buttons
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`app_accept_${message.author.id}_${role.id}`)
        .setLabel('Accept')
        .setStyle(ButtonStyle.Success)
        .setEmoji('✅'),
      new ButtonBuilder()
        .setCustomId(`app_reject_${message.author.id}_${role.id}`)
        .setLabel('Reject')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('❌'),
      new ButtonBuilder()
        .setCustomId(`app_dm_${message.author.id}`)
        .setLabel('DM Applicant')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('💬')
    );

    await appChannel.send({
      embeds: [embed],
      components: [row]
    });

    await message.reply({ 
      embeds: [createEmbed('✅ Application Submitted', 'Your application has been submitted for review!', COLORS.SUCCESS)]
    });

    delete db.applications[message.author.id];
  } else {
    // Ask next question
    await message.reply({ 
      embeds: [createEmbed(
        '📋 Application',
        `**Question ${application.currentQuestion + 1}:** ${db.settings.application.questions[application.currentQuestion]}`,
        COLORS.APPLICATION
      )]
    });
  }
});

// Login
const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);