require('dotenv').config();
const { keepAlive } = require('./keep_alive'); // For hosting services

const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, Collection, Events, ChannelType, ActivityType } = require('discord.js');
const { REST } = require('@discordjs/rest');
const { Routes } = require('discord-api-types/v10');
const { Player } = require('discord-player');
const SpotifyExtractor = require('@discord-player/extractor').SpotifyExtractor;
const Enmap = require('enmap');
const EnmapLevel = require('enmap-level'); // Using enmap-level instead of @enmap/sqlite
const fetch = require('node-fetch');
const { v4: uuidv4 } = require('uuid');
const { createTranscript } = require('discord-html-transcripts');

// Initialize database with persistent storage
const db = new Enmap({
  provider: new EnmapLevel({ 
    name: 'mydatabase',
    dataDir: './database' // Creates a dedicated folder for database files
  })
});

// Ensure database directory exists
if (!fs.existsSync('./database')) {
  fs.mkdirSync('./database');
}

// Initialize client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  presence: {
    activities: [{
      name: 'with your data',
      type: ActivityType.Playing
    }]
  }
});

// Initialize Discord Player
const player = new Player(client, {
  ytdlOptions: {
    quality: 'highestaudio',
    highWaterMark: 1 << 25
  }
});

// Add extractors
player.extractors.register(SpotifyExtractor, {});

// Database ready check
db.defer.then(() => {
  console.log('[Database] Ready!');
}).catch(err => {
  console.error('[Database] Error:', err);
});

// Spotify credentials
const spotifyCredentials = {
  clientId: process.env.SPOTIFY_CLIENT_ID,
  clientSecret: process.env.SPOTIFY_CLIENT_SECRET
};

// Global variables
const PREFIX = '!';
const COLORS = {
  DEFAULT: '#0099ff',
  SUCCESS: '#00ff00',
  ERROR: '#ff0000',
  WARNING: '#ffff00',
  INFO: '#00ffff'
};
const EMOJIS = {
  SUCCESS: '✅',
  ERROR: '❌',
  WARNING: '⚠️',
  INFO: 'ℹ️'
};

// Command storage
const commands = [];
const prefixCommands = new Collection();

// Initialize data storage
if (!fs.existsSync('data')) fs.mkdirSync('data');
if (!fs.existsSync('data/tickets.json')) fs.writeFileSync('data/tickets.json', '{}');
if (!fs.existsSync('data/applications.json')) fs.writeFileSync('data/applications.json', '{}');
if (!fs.existsSync('data/warnings.json')) fs.writeFileSync('data/warnings.json', '{}');
if (!fs.existsSync('data/economy.json')) fs.writeFileSync('data/economy.json', '{}');
if (!fs.existsSync('data/games.json')) fs.writeFileSync('data/games.json', '{}');

// Helper functions
function getData(file) {
  return JSON.parse(fs.readFileSync(`data/${file}.json`));
}

function saveData(file, data) {
  fs.writeFileSync(`data/${file}.json`, JSON.stringify(data, null, 2));
}

function createEmbed(title, description, color = COLORS.DEFAULT, fields = [], footer = null, thumbnail = null) {
  const embed = new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color);

  if (fields.length > 0) embed.addFields(fields);
  if (footer) embed.setFooter(footer);
  if (thumbnail) embed.setThumbnail(thumbnail);

  return embed;
}

function errorEmbed(description) {
  return createEmbed(`${EMOJIS.ERROR} Error`, description, COLORS.ERROR);
}

function successEmbed(description) {
  return createEmbed(`${EMOJIS.SUCCESS} Success`, description, COLORS.SUCCESS);
}

function warningEmbed(description) {
  return createEmbed(`${EMOJIS.WARNING} Warning`, description, COLORS.WARNING);
}

function infoEmbed(description) {
  return createEmbed(`${EMOJIS.INFO} Info`, description, COLORS.INFO);
}

function formatTime(ms) {
  const seconds = Math.floor(ms / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);

  return `${days}d ${hours % 24}h ${minutes % 60}m ${seconds % 60}s`;
}

async function registerSlashCommands() {
  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

  try {
    console.log('Started refreshing application (/) commands.');
    await rest.put(
      Routes.applicationCommands(client.user.id),
      { body: commands }
    );
    console.log('Successfully reloaded application (/) commands.');
  } catch (error) {
    console.error(error);
  }
}

// Command: Help
const helpCommand = {
  name: 'help',
  description: 'Get help with the bot commands',
  options: []
};

commands.push(helpCommand);
prefixCommands.set('help', {
  description: 'Get help with the bot commands',
  execute: async (message) => {
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('help_category')
      .setPlaceholder('📋 Select a command category to view commands')
      .addOptions(
        new StringSelectMenuOptionBuilder()
          .setLabel('Ticket System')
          .setValue('ticket')
          .setEmoji('🎟️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Application System')
          .setValue('application')
          .setEmoji('📋'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Moderation')
          .setValue('moderation')
          .setEmoji('⚠️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Mini-Games')
          .setValue('games')
          .setEmoji('🎮'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Economy')
          .setValue('economy')
          .setEmoji('💰'),
        new StringSelectMenuOptionBuilder()
          .setLabel('DM & Embeds')
          .setValue('dm')
          .setEmoji('📩'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Utilities')
          .setValue('utilities')
          .setEmoji('ℹ️'),
        new StringSelectMenuOptionBuilder()
          .setLabel('Music')
          .setValue('music')
          .setEmoji('🎵')
      );

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = createEmbed(
      '📚 Bot Help',
      'Select a category from the dropdown below to view available commands.',
      COLORS.DEFAULT,
      [],
      { text: message.guild.name, iconURL: message.guild.iconURL() }
    );

    await message.reply({ embeds: [embed], components: [row] });
  }
});

// Command: Ticket System
const ticketCommands = [
  {
    name: 'ticket',
    description: 'Manage the ticket system',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'Set message', value: 'msg' },
          { name: 'Set options', value: 'options' },
          { name: 'Set viewer role', value: 'viewer' },
          { name: 'Set category', value: 'category' },
          { name: 'Deploy panel', value: 'deploy' }
        ]
      },
      {
        name: 'value',
        description: 'The value for the action',
        type: 3,
        required: false
      }
    ]
  }
];

commands.push(...ticketCommands);
prefixCommands.set('ticket', {
  description: 'Manage the ticket system',
  usage: 'ticket <action> <value>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({ embeds: [errorEmbed('You need the `Manage Server` permission to use this command.')] });
    }

    const action = args[0];
    const value = args.slice(1).join(' ');

    const ticketsData = getData('tickets');
    if (!ticketsData[message.guild.id]) ticketsData[message.guild.id] = {};

    switch (action) {
      case 'msg':
        ticketsData[message.guild.id].message = value;
        saveData('tickets', ticketsData);
        message.reply({ embeds: [successEmbed('Ticket message set successfully!')] });
        break;

      case 'options':
        const options = value.split(',').map(opt => {
          const [label, emoji] = opt.trim().split(':');
          return { label, emoji: emoji.trim() };
        });
        ticketsData[message.guild.id].options = options;
        saveData('tickets', ticketsData);
        message.reply({ embeds: [successEmbed('Ticket options set successfully!')] });
        break;

      case 'viewer':
        const role = message.mentions.roles.first() || message.guild.roles.cache.get(value);
        if (!role) return message.reply({ embeds: [errorEmbed('Please mention a valid role.')] });
        ticketsData[message.guild.id].viewerRole = role.id;
        saveData('tickets', ticketsData);
        message.reply({ embeds: [successEmbed(`Viewer role set to ${role.name}!`)] });
        break;

      case 'category':
        const category = message.guild.channels.cache.get(value);
        if (!category || category.type !== ChannelType.GuildCategory) {
          return message.reply({ embeds: [errorEmbed('Please provide a valid category ID.')] });
        }
        ticketsData[message.guild.id].category = value;
        saveData('tickets', ticketsData);
        message.reply({ embeds: [successEmbed(`Ticket category set to ${category.name}!`)] });
        break;

      case 'deploy':
        if (!ticketsData[message.guild.id]?.message || !ticketsData[message.guild.id]?.options) {
          return message.reply({ embeds: [errorEmbed('Please set the ticket message and options first.')] });
        }

        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('create_ticket')
          .setPlaceholder('Select a ticket type...')
          .addOptions(
            ticketsData[message.guild.id].options.map(opt => 
              new StringSelectMenuOptionBuilder()
                .setLabel(opt.label)
                .setValue(opt.label.toLowerCase())
                .setEmoji(opt.emoji)
            )
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);
        const embed = createEmbed(
          '🎟️ Support Tickets',
          ticketsData[message.guild.id].message,
          COLORS.DEFAULT,
          [],
          { text: 'Click the dropdown below to create a ticket' }
        );

        message.channel.send({ embeds: [embed], components: [row] });
        message.reply({ embeds: [successEmbed('Ticket panel deployed successfully!')] });
        break;

      default:
        message.reply({ embeds: [errorEmbed('Invalid action. Use `msg`, `options`, `viewer`, `category`, or `deploy`.')] });
    }
  }
});

// Command: Application System
const applicationCommands = [
  {
    name: 'app',
    description: 'Manage the application system',
    options: [
      {
        name: 'action',
        description: 'The action to perform',
        type: 3,
        required: true,
        choices: [
          { name: 'Set message', value: 'msg' },
          { name: 'Add role option', value: 'addoption' },
          { name: 'Set channel', value: 'channel' },
          { name: 'Deploy panel', value: 'deploy' },
          { name: 'Set question', value: 'question' }
        ]
      },
      {
        name: 'value',
        description: 'The value for the action',
        type: 3,
        required: false
      },
      {
        name: 'number',
        description: 'Question number (for question action)',
        type: 4,
        required: false
      }
    ]
  }
];

commands.push(...applicationCommands);
prefixCommands.set('app', {
  description: 'Manage the application system',
  usage: 'app <action> <value> [number]',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
      return message.reply({ embeds: [errorEmbed('You need the `Manage Server` permission to use this command.')] });
    }

    const action = args[0];
    const value = args.slice(1).join(' ');

    const appsData = getData('applications');
    if (!appsData[message.guild.id]) appsData[message.guild.id] = { questions: [] };

    switch (action) {
      case 'msg':
        appsData[message.guild.id].message = value;
        saveData('applications', appsData);
        message.reply({ embeds: [successEmbed('Application message set successfully!')] });
        break;

      case 'addoption':
        const [roleName, emoji] = value.split(':');
        if (!roleName || !emoji) {
          return message.reply({ embeds: [errorEmbed('Format: `!app addoption RoleName:🛡️`')] });
        }

        if (!appsData[message.guild.id].options) appsData[message.guild.id].options = [];
        appsData[message.guild.id].options.push({ roleName: roleName.trim(), emoji: emoji.trim() });
        saveData('applications', appsData);
        message.reply({ embeds: [successEmbed('Application role option added successfully!')] });
        break;

      case 'channel':
        const channel = message.mentions.channels.first() || message.guild.channels.cache.get(value);
        if (!channel) return message.reply({ embeds: [errorEmbed('Please mention a valid channel.')] });
        appsData[message.guild.id].channel = channel.id;
        saveData('applications', appsData);
        message.reply({ embeds: [successEmbed(`Application channel set to ${channel.name}!`)] });
        break;

      case 'deploy':
        if (!appsData[message.guild.id]?.message || !appsData[message.guild.id]?.options) {
          return message.reply({ embeds: [errorEmbed('Please set the application message and options first.')] });
        }

        const buttons = appsData[message.guild.id].options.map(opt => 
          new ButtonBuilder()
            .setCustomId(`app_${opt.roleName.toLowerCase().replace(/\s+/g, '_')}`)
            .setLabel(opt.roleName)
            .setEmoji(opt.emoji)
            .setStyle(ButtonStyle.Primary)
        );

        const rows = [];
        while (buttons.length > 0) {
          rows.push(new ActionRowBuilder().addComponents(buttons.splice(0, 5)));
        }

        const embed = createEmbed(
          '📋 Application System',
          appsData[message.guild.id].message,
          COLORS.DEFAULT,
          [],
          { text: 'Click a button below to start your application' }
        );

        message.channel.send({ embeds: [embed], components: rows });
        message.reply({ embeds: [successEmbed('Application panel deployed successfully!')] });
        break;

      case 'question':
        const questionNumber = parseInt(args[1]);
        const questionText = args.slice(2).join(' ');
        
        if (isNaN(questionNumber)) {
          return message.reply({ embeds: [errorEmbed('Please provide a valid question number.')] });
        }

        if (!questionText) {
          return message.reply({ embeds: [errorEmbed('Please provide the question text.')] });
        }

        appsData[message.guild.id].questions[questionNumber - 1] = questionText;
        saveData('applications', appsData);
        message.reply({ embeds: [successEmbed(`Question ${questionNumber} set successfully!`)] });
        break;

      default:
        message.reply({ embeds: [errorEmbed('Invalid action. Use `msg`, `addoption`, `channel`, `deploy`, or `question`.')] });
    }
  }
});

// Command: Moderation
const moderationCommands = [
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
    description: 'View a user\'s warnings',
    options: [
      {
        name: 'user',
        description: 'The user to view warnings for',
        type: 6,
        required: true
      }
    ]
  },
  {
    name: 'warnlimit',
    description: 'Set the auto-kick warning limit',
    options: [
      {
        name: 'number',
        description: 'The number of warnings before auto-kick',
        type: 4,
        required: true
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
        description: 'The duration of the mute (e.g., 1h, 30m)',
        type: 3,
        required: false
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
  }
];

commands.push(...moderationCommands);
prefixCommands.set('warn', {
  description: 'Warn a user',
  usage: 'warn <@user> [reason]',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({ embeds: [errorEmbed('You need the `Kick Members` permission to use this command.')] });
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply({ embeds: [errorEmbed('Please mention a user to warn.')] });

    const reason = args.slice(1).join(' ') || 'No reason provided';

    const warningsData = getData('warnings');
    if (!warningsData[message.guild.id]) warningsData[message.guild.id] = {};
    if (!warningsData[message.guild.id][user.id]) warningsData[message.guild.id][user.id] = [];

    const caseId = uuidv4();
    warningsData[message.guild.id][user.id].push({
      id: caseId,
      reason,
      moderator: message.author.id,
      timestamp: Date.now()
    });

    saveData('warnings', warningsData);

    // Check warn limit
    const warnLimit = await db.get(`warnlimit_${message.guild.id}`) || 3;
    if (warningsData[message.guild.id][user.id].length >= warnLimit) {
      try {
        await message.guild.members.cache.get(user.id).kick(`Reached warning limit (${warnLimit})`);
        message.reply({ 
          embeds: [
            createEmbed(
              '🔴 User Kicked',
              `${user.tag} has been kicked for reaching the warning limit (${warnLimit} warnings).`,
              COLORS.ERROR,
              [
                { name: 'Case ID', value: caseId },
                { name: 'Reason', value: reason }
              ],
              { text: `Moderator: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() }
            )
          ]
        });
      } catch (err) {
        message.reply({ embeds: [errorEmbed(`Failed to kick ${user.tag}. I might not have the required permissions.`)] });
      }
      return;
    }

    message.reply({ 
      embeds: [
        createEmbed(
          '🟡 User Warned',
          `${user.tag} has been warned. They now have ${warningsData[message.guild.id][user.id].length} warning(s).`,
          COLORS.WARNING,
          [
            { name: 'Case ID', value: caseId },
            { name: 'Reason', value: reason }
          ],
          { text: `Moderator: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() }
        )
      ]
    });

    try {
      await user.send({
        embeds: [
          createEmbed(
            '⚠️ You have been warned',
            `You received a warning in **${message.guild.name}**.`,
            COLORS.WARNING,
            [
              { name: 'Reason', value: reason },
              { name: 'Total Warnings', value: warningsData[message.guild.id][user.id].length.toString() }
            ],
            { text: `Server: ${message.guild.name}`, iconURL: message.guild.iconURL() }
          )
        ]
      });
    } catch (err) {
      console.log(`Could not send DM to ${user.tag}`);
    }
  }
});

prefixCommands.set('warnings', {
  description: 'View a user\'s warnings',
  usage: 'warnings <@user>',
  execute: async (message, args) => {
    const user = message.mentions.users.first();
    if (!user) return message.reply({ embeds: [errorEmbed('Please mention a user to view warnings.')] });

    const warningsData = getData('warnings');
    if (!warningsData[message.guild.id]?.[user.id] || warningsData[message.guild.id][user.id].length === 0) {
      return message.reply({ embeds: [infoEmbed(`${user.tag} has no warnings.`)] });
    }

    const fields = warningsData[message.guild.id][user.id].map(warn => ({
      name: `Case ${warn.id}`,
      value: `**Reason:** ${warn.reason}\n**Date:** <t:${Math.floor(warn.timestamp / 1000)}:f>\n**Moderator:** <@${warn.moderator}>`,
      inline: false
    }));

    message.reply({
      embeds: [
        createEmbed(
          `⚠️ Warnings for ${user.tag}`,
          `Total warnings: ${fields.length}`,
          COLORS.WARNING,
          fields,
          { text: message.guild.name, iconURL: message.guild.iconURL() }
        )
      ]
    });
  }
});

prefixCommands.set('warnlimit', {
  description: 'Set the auto-kick warning limit',
  usage: 'warnlimit <number>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
      return message.reply({ embeds: [errorEmbed('You need the `Kick Members` permission to use this command.')] });
    }

    const limit = parseInt(args[0]);
    if (isNaN(limit)) return message.reply({ embeds: [errorEmbed('Please provide a valid number.')] });

    await db.set(`warnlimit_${message.guild.id}`, limit);
    message.reply({ embeds: [successEmbed(`Auto-kick warning limit set to ${limit}.`)] });
  }
});

prefixCommands.set('mute', {
  description: 'Mute a user',
  usage: 'mute <@user> [duration] [reason]',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [errorEmbed('You need the `Moderate Members` permission to use this command.')] });
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply({ embeds: [errorEmbed('Please mention a user to mute.')] });

    const member = await message.guild.members.fetch(user.id);
    if (!member) return message.reply({ embeds: [errorEmbed('User not found in this server.')] });

    // Parse duration (default: 1 hour)
    let duration = 3600000; // 1 hour in ms
    let reason = 'No reason provided';
    
    if (args.length > 1) {
      const durationArg = args[1];
      const timeMatch = durationArg.match(/^(\d+)([smhd])$/);
      
      if (timeMatch) {
        const num = parseInt(timeMatch[1]);
        const unit = timeMatch[2];
        
        switch (unit) {
          case 's': duration = num * 1000; break;
          case 'm': duration = num * 60000; break;
          case 'h': duration = num * 3600000; break;
          case 'd': duration = num * 86400000; break;
        }
        
        reason = args.slice(2).join(' ') || 'No reason provided';
      } else {
        reason = args.slice(1).join(' ') || 'No reason provided';
      }
    }

    try {
      await member.timeout(duration, reason);
      
      const caseId = uuidv4();
      message.reply({ 
        embeds: [
          createEmbed(
            '🟠 User Muted',
            `${user.tag} has been muted for ${formatTime(duration)}.`,
            COLORS.WARNING,
            [
              { name: 'Case ID', value: caseId },
              { name: 'Reason', value: reason },
              { name: 'Duration', value: formatTime(duration) }
            ],
            { text: `Moderator: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() }
          )
        ]
      });

      try {
        await user.send({
          embeds: [
            createEmbed(
              '🔇 You have been muted',
              `You have been muted in **${message.guild.name}** for ${formatTime(duration)}.`,
              COLORS.WARNING,
              [
                { name: 'Reason', value: reason },
                { name: 'Duration', value: formatTime(duration) }
              ],
              { text: `Server: ${message.guild.name}`, iconURL: message.guild.iconURL() }
            )
          ]
        });
      } catch (err) {
        console.log(`Could not send DM to ${user.tag}`);
      }
    } catch (err) {
      message.reply({ embeds: [errorEmbed(`Failed to mute ${user.tag}. I might not have the required permissions.`)] });
    }
  }
});

prefixCommands.set('unmute', {
  description: 'Unmute a user',
  usage: 'unmute <@user>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      return message.reply({ embeds: [errorEmbed('You need the `Moderate Members` permission to use this command.')] });
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply({ embeds: [errorEmbed('Please mention a user to unmute.')] });

    const member = await message.guild.members.fetch(user.id);
    if (!member) return message.reply({ embeds: [errorEmbed('User not found in this server.')] });

    if (!member.isCommunicationDisabled()) {
      return message.reply({ embeds: [errorEmbed(`${user.tag} is not muted.`)] });
    }

    try {
      await member.timeout(null);
      message.reply({ embeds: [successEmbed(`${user.tag} has been unmuted.`)] });
    } catch (err) {
      message.reply({ embeds: [errorEmbed(`Failed to unmute ${user.tag}. I might not have the required permissions.`)] });
    }
  }
});

// Command: Mini-Games
const gameCommands = [
  {
    name: 'rps',
    description: 'Play Rock Paper Scissors',
    options: [
      {
        name: 'user',
        description: 'The user to play against',
        type: 6,
        required: false
      }
    ]
  },
  {
    name: 'guess',
    description: 'Play Guess the Number'
  },
  {
    name: 'math',
    description: 'Solve a math problem'
  },
  {
    name: 'type',
    description: 'Type the shown sentence'
  },
  {
    name: 'trivia',
    description: 'Answer a trivia question'
  },
  {
    name: 'top',
    description: 'View game leaderboard',
    options: [
      {
        name: 'game',
        description: 'The game to view leaderboard for',
        type: 3,
        required: false,
        choices: [
          { name: 'Rock Paper Scissors', value: 'rps' },
          { name: 'Guess the Number', value: 'guess' },
          { name: 'Math Challenge', value: 'math' },
          { name: 'Typing Test', value: 'type' },
          { name: 'Trivia', value: 'trivia' }
        ]
      }
    ]
  }
];

commands.push(...gameCommands);
prefixCommands.set('rps', {
  description: 'Play Rock Paper Scissors',
  usage: 'rps [@user]',
  execute: async (message, args) => {
    const targetUser = message.mentions.users.first();
    
    if (targetUser) {
      // Multiplayer RPS
      const embed = createEmbed(
        '🎮 Rock Paper Scissors Challenge',
        `${targetUser}, ${message.author} has challenged you to a game of Rock Paper Scissors!`,
        COLORS.DEFAULT,
        [],
        { text: 'You have 30 seconds to accept' }
      );

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('rps_accept')
          .setLabel('Accept Challenge')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('rps_decline')
          .setLabel('Decline')
          .setStyle(ButtonStyle.Danger)
      );

      const challengeMsg = await message.reply({ embeds: [embed], components: [buttons] });

      const filter = i => (i.user.id === targetUser.id) && (i.customId === 'rps_accept' || i.customId === 'rps_decline');
      const collector = challengeMsg.createMessageComponentCollector({ filter, time: 30000 });

      collector.on('collect', async i => {
        if (i.customId === 'rps_decline') {
          await i.update({ 
            embeds: [createEmbed('❌ Challenge Declined', `${targetUser} declined the Rock Paper Scissors challenge.`, COLORS.ERROR)],
            components: [] 
          });
          collector.stop();
          return;
        }

        // Accepted - start the game
        await i.update({ 
          embeds: [createEmbed('✅ Challenge Accepted', 'Select your move:', COLORS.SUCCESS)],
          components: [] 
        });

        const rpsButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rps_rock')
            .setLabel('Rock')
            .setEmoji('🪨')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('rps_paper')
            .setLabel('Paper')
            .setEmoji('📄')
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('rps_scissors')
            .setLabel('Scissors')
            .setEmoji('✂️')
            .setStyle(ButtonStyle.Primary)
        );

        const gameMsg = await message.channel.send({
          content: `${message.author} vs ${targetUser}`,
          embeds: [createEmbed('🎮 Rock Paper Scissors', 'Select your move:', COLORS.DEFAULT)],
          components: [rpsButtons]
        });

        const choices = {};
        const gameFilter = i => (i.user.id === message.author.id || i.user.id === targetUser.id) && 
                              (i.customId === 'rps_rock' || i.customId === 'rps_paper' || i.customId === 'rps_scissors');

        const gameCollector = gameMsg.createMessageComponentCollector({ filter: gameFilter, time: 30000 });

        gameCollector.on('collect', async i => {
          choices[i.user.id] = i.customId.split('_')[1];
          
          await i.reply({ 
            content: `${i.user} chose ${i.customId.split('_')[1]}`,
            ephemeral: true 
          });

          if (Object.keys(choices).length === 2) {
            gameCollector.stop();
          }
        });

        gameCollector.on('end', async () => {
          if (Object.keys(choices).length < 2) {
            await gameMsg.edit({ 
              embeds: [createEmbed('❌ Game Cancelled', 'One or both players did not make a move in time.', COLORS.ERROR)],
              components: [] 
            });
            return;
          }

          const p1Choice = choices[message.author.id];
          const p2Choice = choices[targetUser.id];
          let result;

          if (p1Choice === p2Choice) {
            result = 'It\'s a tie!';
          } else if (
            (p1Choice === 'rock' && p2Choice === 'scissors') ||
            (p1Choice === 'paper' && p2Choice === 'rock') ||
            (p1Choice === 'scissors' && p2Choice === 'paper')
          ) {
            result = `${message.author} wins!`;
            updateGameStats(message.author.id, 'rps', true);
            updateGameStats(targetUser.id, 'rps', false);
          } else {
            result = `${targetUser} wins!`;
            updateGameStats(targetUser.id, 'rps', true);
            updateGameStats(message.author.id, 'rps', false);
          }

          await gameMsg.edit({ 
            embeds: [
              createEmbed(
                '🎮 Rock Paper Scissors - Results',
                `${message.author} chose ${p1Choice}\n${targetUser} chose ${p2Choice}\n\n**${result}**`,
                COLORS.DEFAULT
              )
            ],
            components: [] 
          });
        });
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await challengeMsg.edit({ 
            embeds: [createEmbed('⌛ Challenge Expired', `${targetUser} did not respond in time.`, COLORS.WARNING)],
            components: [] 
          });
        }
      });
    } else {
      // Single-player RPS
      const rpsButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('rps_rock')
          .setLabel('Rock')
          .setEmoji('🪨')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('rps_paper')
          .setLabel('Paper')
          .setEmoji('📄')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('rps_scissors')
          .setLabel('Scissors')
          .setEmoji('✂️')
          .setStyle(ButtonStyle.Primary)
      );

      const gameMsg = await message.reply({
        embeds: [createEmbed('🎮 Rock Paper Scissors', 'Select your move:', COLORS.DEFAULT)],
        components: [rpsButtons]
      });

      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = choices[Math.floor(Math.random() * choices.length)];

      const filter = i => i.user.id === message.author.id && 
                         (i.customId === 'rps_rock' || i.customId === 'rps_paper' || i.customId === 'rps_scissors');

      const collector = gameMsg.createMessageComponentCollector({ filter, time: 30000 });

      collector.on('collect', async i => {
        const userChoice = i.customId.split('_')[1];
        let result;

        if (userChoice === botChoice) {
          result = 'It\'s a tie!';
        } else if (
          (userChoice === 'rock' && botChoice === 'scissors') ||
          (userChoice === 'paper' && botChoice === 'rock') ||
          (userChoice === 'scissors' && botChoice === 'paper')
        ) {
          result = 'You win!';
          updateGameStats(message.author.id, 'rps', true);
        } else {
          result = 'I win!';
          updateGameStats(message.author.id, 'rps', false);
        }

        await i.update({
          embeds: [
            createEmbed(
              '🎮 Rock Paper Scissors - Results',
              `You chose ${userChoice}\nI chose ${botChoice}\n\n**${result}**`,
              COLORS.DEFAULT
            )
          ],
          components: []
        });
      });

      collector.on('end', async collected => {
        if (collected.size === 0) {
          await gameMsg.edit({
            embeds: [createEmbed('⌛ Game Expired', 'You did not make a move in time.', COLORS.WARNING)],
            components: []
          });
        }
      });
    }
  }
});

prefixCommands.set('guess', {
  description: 'Play Guess the Number',
  execute: async (message) => {
    const number = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;
    const maxAttempts = 5;

    const embed = createEmbed(
      '🔢 Guess the Number',
      `I'm thinking of a number between 1 and 100. You have ${maxAttempts} attempts to guess it!`,
      COLORS.DEFAULT,
      [],
      { text: 'Type your guess in chat' }
    );

    const gameMsg = await message.reply({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 60000 });

    collector.on('collect', async m => {
      attempts++;
      const guess = parseInt(m.content);

      if (guess === number) {
        updateGameStats(message.author.id, 'guess', true);
        await gameMsg.edit({
          embeds: [
            createEmbed(
              '🎉 You Win!',
              `You guessed the correct number (${number}) in ${attempts} attempts!`,
              COLORS.SUCCESS
            )
          ]
        });
        collector.stop();
        return;
      }

      if (attempts >= maxAttempts) {
        updateGameStats(message.author.id, 'guess', false);
        await gameMsg.edit({
          embeds: [
            createEmbed(
              '❌ Game Over',
              `You've used all ${maxAttempts} attempts. The number was ${number}.`,
              COLORS.ERROR
            )
          ]
        });
        collector.stop();
        return;
      }

      const hint = guess < number ? 'higher' : 'lower';
      await gameMsg.edit({
        embeds: [
          createEmbed(
            '🔢 Guess the Number',
            `Your guess (${guess}) is too ${hint}. You have ${maxAttempts - attempts} attempts left.`,
            COLORS.DEFAULT
          )
        ]
      });
    });

    collector.on('end', async () => {
      await gameMsg.edit({
        embeds: [
          createEmbed(
            '⌛ Game Ended',
            'The game has ended.',
            COLORS.WARNING
          )
        ]
      });
    });
  }
});

prefixCommands.set('math', {
  description: 'Solve a math problem',
  execute: async (message) => {
    const operations = ['+', '-', '*', '/'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    let num1, num2, answer;

    switch (operation) {
      case '+':
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * 50) + 1;
        answer = num1 + num2;
        break;
      case '-':
        num1 = Math.floor(Math.random() * 50) + 1;
        num2 = Math.floor(Math.random() * num1) + 1;
        answer = num1 - num2;
        break;
      case '*':
        num1 = Math.floor(Math.random() * 12) + 1;
        num2 = Math.floor(Math.random() * 12) + 1;
        answer = num1 * num2;
        break;
      case '/':
        num2 = Math.floor(Math.random() * 10) + 1;
        answer = Math.floor(Math.random() * 10) + 1;
        num1 = num2 * answer;
        break;
    }

    const embed = createEmbed(
      '🧮 Math Challenge',
      `Solve the following problem:\n\n**${num1} ${operation} ${num2} = ?**`,
      COLORS.DEFAULT,
      [],
      { text: 'You have 15 seconds to answer' }
    );

    const gameMsg = await message.reply({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 15000 });

    collector.on('collect', async m => {
      const guess = parseInt(m.content);

      if (guess === answer) {
        updateGameStats(message.author.id, 'math', true);
        await gameMsg.edit({
          embeds: [
            createEmbed(
              '✅ Correct!',
              `You solved the problem: ${num1} ${operation} ${num2} = ${answer}`,
              COLORS.SUCCESS
            )
          ]
        });
      } else {
        updateGameStats(message.author.id, 'math', false);
        await gameMsg.edit({
          embeds: [
            createEmbed(
              '❌ Incorrect',
              `The correct answer was: ${num1} ${operation} ${num2} = ${answer}`,
              COLORS.ERROR
            )
          ]
        });
      }
      collector.stop();
    });

    collector.on('end', async () => {
      await gameMsg.edit({
        embeds: [
          createEmbed(
            '⌛ Time\'s Up',
            `The correct answer was: ${num1} ${operation} ${num2} = ${answer}`,
            COLORS.WARNING
          )
        ]
      });
    });
  }
});

prefixCommands.set('type', {
  description: 'Type the shown sentence',
  execute: async (message) => {
    const sentences = [
      "The quick brown fox jumps over the lazy dog.",
      "Pack my box with five dozen liquor jugs.",
      "How vexingly quick daft zebras jump!",
      "Bright vixens jump; dozy fowl quack.",
      "Sphinx of black quartz, judge my vow."
    ];

    const sentence = sentences[Math.floor(Math.random() * sentences.length)];
    const startTime = Date.now();

    const embed = createEmbed(
      '⌨️ Typing Test',
      `Type the following sentence as fast as you can:\n\n\`\`\`${sentence}\`\`\``,
      COLORS.DEFAULT,
      [],
      { text: 'You have 30 seconds to complete' }
    );

    const gameMsg = await message.reply({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 30000 });

    collector.on('collect', async m => {
      if (m.content === sentence) {
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000;
        const wpm = Math.round((sentence.split(' ').length / timeTaken) * 60);

        updateGameStats(message.author.id, 'type', true, timeTaken);
        await gameMsg.edit({
          embeds: [
            createEmbed(
              '✅ Perfect!',
              `You typed the sentence correctly in ${timeTaken.toFixed(2)} seconds (${wpm} WPM).`,
              COLORS.SUCCESS
            )
          ]
        });
      } else {
        updateGameStats(message.author.id, 'type', false);
        await gameMsg.edit({
          embeds: [
            createEmbed(
              '❌ Incorrect',
              'That wasn\'t quite right. Try again!',
              COLORS.ERROR
            )
          ]
        });
      }
      collector.stop();
    });

    collector.on('end', async () => {
      await gameMsg.edit({
        embeds: [
          createEmbed(
            '⌛ Time\'s Up',
            'The typing test has ended.',
            COLORS.WARNING
          )
        ]
      });
    });
  }
});

prefixCommands.set('trivia', {
  description: 'Answer a trivia question',
  execute: async (message) => {
    // Sample trivia questions
    const questions = [
      {
        question: "What is the capital of France?",
        options: ["London", "Paris", "Berlin", "Madrid"],
        answer: 1
      },
      {
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        answer: 1
      },
      {
        question: "Who painted the Mona Lisa?",
        options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
        answer: 2
      },
      {
        question: "What is the largest mammal?",
        options: ["Elephant", "Blue Whale", "Giraffe", "Polar Bear"],
        answer: 1
      },
      {
        question: "Which language has the most native speakers?",
        options: ["English", "Spanish", "Hindi", "Mandarin Chinese"],
        answer: 3
      }
    ];

    const question = questions[Math.floor(Math.random() * questions.length)];
    const letters = ['A', 'B', 'C', 'D'];

    const embed = createEmbed(
      '❓ Trivia Question',
      question.question,
      COLORS.DEFAULT,
      question.options.map((opt, i) => ({
        name: `${letters[i]}`,
        value: opt,
        inline: true
      })),
      { text: 'You have 15 seconds to answer' }
    );

    const buttons = new ActionRowBuilder().addComponents(
      ...question.options.map((_, i) => 
        new ButtonBuilder()
          .setCustomId(`trivia_${i}`)
          .setLabel(letters[i])
          .setStyle(ButtonStyle.Primary)
      )
    );

    const gameMsg = await message.reply({ embeds: [embed], components: [buttons] });

    const filter = i => i.user.id === message.author.id && i.customId.startsWith('trivia_');
    const collector = gameMsg.createMessageComponentCollector({ filter, time: 15000 });

    collector.on('collect', async i => {
      const selected = parseInt(i.customId.split('_')[1]);
      
      if (selected === question.answer) {
        updateGameStats(message.author.id, 'trivia', true);
        await i.update({
          embeds: [
            createEmbed(
              '✅ Correct!',
              `You answered: **${letters[selected]} - ${question.options[selected]}**\n\nThat's the right answer!`,
              COLORS.SUCCESS
            )
          ],
          components: []
        });
      } else {
        updateGameStats(message.author.id, 'trivia', false);
        await i.update({
          embeds: [
            createEmbed(
              '❌ Incorrect',
              `You answered: **${letters[selected]} - ${question.options[selected]}**\n\nThe correct answer was: **${letters[question.answer]} - ${question.options[question.answer]}**`,
              COLORS.ERROR
            )
          ],
          components: []
        });
      }
    });

    collector.on('end', async () => {
      await gameMsg.edit({
        components: []
      });
    });
  }
});

prefixCommands.set('top', {
  description: 'View game leaderboard',
  usage: 'top [game]',
  execute: async (message, args) => {
    const game = args[0]?.toLowerCase();
    const validGames = ['rps', 'guess', 'math', 'type', 'trivia'];
    
    if (game && !validGames.includes(game)) {
      return message.reply({ 
        embeds: [errorEmbed(`Invalid game. Valid games: ${validGames.join(', ')}`)] 
      });
    }

    const gamesData = getData('games');
    if (!gamesData[message.guild.id]) {
      return message.reply({ 
        embeds: [infoEmbed('No game stats available yet. Play some games first!')] 
      });
    }

    if (game) {
      // Leaderboard for specific game
      if (!gamesData[message.guild.id][game]) {
        return message.reply({ 
          embeds: [infoEmbed(`No stats available for ${game} yet. Play some games first!`)] 
        });
      }

      const players = Object.entries(gamesData[message.guild.id][game])
        .map(([id, stats]) => ({
          id,
          wins: stats.wins || 0,
          losses: stats.losses || 0,
          ratio: stats.wins / (stats.wins + stats.losses) || 0
        }))
        .sort((a, b) => b.wins - a.wins || b.ratio - a.ratio)
        .slice(0, 10);

      const fields = await Promise.all(players.map(async (player, i) => {
        const user = await client.users.fetch(player.id).catch(() => null);
        return {
          name: `${i + 1}. ${user?.tag || 'Unknown User'}`,
          value: `Wins: ${player.wins} | Losses: ${player.losses} | Ratio: ${(player.ratio * 100).toFixed(1)}%`,
          inline: false
        };
      }));

      message.reply({
        embeds: [
          createEmbed(
            `🏆 ${game.toUpperCase()} Leaderboard`,
            `Top players for ${game}`,
            COLORS.DEFAULT,
            fields,
            { text: message.guild.name, iconURL: message.guild.iconURL() }
          )
        ]
      });
    } else {
      // General leaderboard
      const gameFields = validGames.map(game => {
        if (!gamesData[message.guild.id][game]) {
          return {
            name: game.toUpperCase(),
            value: 'No data yet',
            inline: true
          };
        }

        const topPlayer = Object.entries(gamesData[message.guild.id][game])
          .map(([id, stats]) => ({
            id,
            wins: stats.wins || 0
          }))
          .sort((a, b) => b.wins - a.wins)[0];

        return {
          name: game.toUpperCase(),
          value: topPlayer ? `Top: <@${topPlayer.id}> (${topPlayer.wins} wins)` : 'No data yet',
          inline: true
        };
      });

      message.reply({
        embeds: [
          createEmbed(
            '🏆 Game Leaderboards',
            'Top players for each game',
            COLORS.DEFAULT,
            gameFields,
            { text: message.guild.name, iconURL: message.guild.iconURL() }
          )
        ]
      });
    }
  }
});

function updateGameStats(userId, game, isWin, timeTaken = null) {
  const gamesData = getData('games');
  if (!gamesData[userId]) gamesData[userId] = {};
  if (!gamesData[userId][game]) gamesData[userId][game] = { wins: 0, losses: 0 };

  if (isWin) {
    gamesData[userId][game].wins = (gamesData[userId][game].wins || 0) + 1;
  } else {
    gamesData[userId][game].losses = (gamesData[userId][game].losses || 0) + 1;
  }

  if (timeTaken !== null) {
    if (!gamesData[userId][game].times) gamesData[userId][game].times = [];
    gamesData[userId][game].times.push(timeTaken);
  }

  saveData('games', gamesData);
}

// Command: Economy System
const economyCommands = [
  {
    name: 'cf',
    description: 'Flip a coin',
    options: [
      {
        name: 'side',
        description: 'The side to bet on',
        type: 3,
        required: true,
        choices: [
          { name: 'Heads', value: 'heads' },
          { name: 'Tails', value: 'tails' }
        ]
      },
      {
        name: 'amount',
        description: 'The amount to bet',
        type: 4,
        required: true
      }
    ]
  },
  {
    name: 'cash',
    description: 'Check your balance'
  },
  {
    name: 'daily',
    description: 'Claim your daily reward'
  },
  {
    name: 'weekly',
    description: 'Claim your weekly reward'
  },
  {
    name: 'hunt',
    description: 'Go hunting for rewards'
  },
  {
    name: 'battle',
    description: 'Battle for rewards'
  },
  {
    name: 'loot',
    description: 'Find random loot'
  },
  {
    name: 'deposit',
    description: 'Deposit money to your bank',
    options: [
      {
        name: 'amount',
        description: 'The amount to deposit',
        type: 4,
        required: true
      }
    ]
  },
  {
    name: 'withdraw',
    description: 'Withdraw money from your bank',
    options: [
      {
        name: 'amount',
        description: 'The amount to withdraw',
        type: 4,
        required: true
      }
    ]
  },
  {
    name: 'beg',
    description: 'Beg for money'
  },
  {
    name: 'give',
    description: 'Give money to another user',
    options: [
      {
        name: 'user',
        description: 'The user to give money to',
        type: 6,
        required: true
      },
      {
        name: 'amount',
        description: 'The amount to give',
        type: 4,
        required: true
      }
    ]
  },
  {
    name: 'inventory',
    description: 'View your inventory'
  },
  {
    name: 'shop',
    description: 'View the shop'
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
      }
    ]
  }
];

commands.push(...economyCommands);
prefixCommands.set('cf', {
  description: 'Flip a coin',
  usage: 'cf <heads|tails> <amount>',
  execute: async (message, args) => {
    const side = args[0]?.toLowerCase();
    const amount = parseInt(args[1]);

    if (!side || (side !== 'heads' && side !== 'tails')) {
      return message.reply({ embeds: [errorEmbed('Please specify `heads` or `tails`.')] });
    }

    if (isNaN(amount)) {
      return message.reply({ embeds: [errorEmbed('Please specify a valid amount to bet.')] });
    }

    if (amount <= 0) {
      return message.reply({ embeds: [errorEmbed('You must bet a positive amount.')] });
    }

    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    if (economyData[message.author.id].wallet < amount) {
      return message.reply({ embeds: [errorEmbed('You don\'t have enough money in your wallet.')] });
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    const win = side === result;

    if (win) {
      economyData[message.author.id].wallet += amount;
      message.reply({
        embeds: [
          createEmbed(
            '🎉 You Won!',
            `The coin landed on **${result}**! You won ${amount} coins.`,
            COLORS.SUCCESS,
            [
              { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins` }
            ]
          )
        ]
      });
    } else {
      economyData[message.author.id].wallet -= amount;
      message.reply({
        embeds: [
          createEmbed(
            '❌ You Lost',
            `The coin landed on **${result}**. You lost ${amount} coins.`,
            COLORS.ERROR,
            [
              { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins` }
            ]
          )
        ]
      });
    }

    saveData('economy', economyData);
  }
});

prefixCommands.set('cash', {
  description: 'Check your balance',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
      saveData('economy', economyData);
    }

    message.reply({
      embeds: [
        createEmbed(
          '💰 Your Balance',
          `Here are your current finances:`,
          COLORS.DEFAULT,
          [
            { name: 'Wallet', value: `${economyData[message.author.id].wallet} coins`, inline: true },
            { name: 'Bank', value: `${economyData[message.author.id].bank} coins`, inline: true },
            { name: 'Total', value: `${economyData[message.author.id].wallet + economyData[message.author.id].bank} coins`, inline: true }
          ],
          { text: message.author.tag, iconURL: message.author.displayAvatarURL() }
        )
      ]
    });
  }
});

prefixCommands.set('daily', {
  description: 'Claim your daily reward',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    const lastDaily = await db.get(`daily_${message.author.id}`);
    const now = Date.now();
    const cooldown = 24 * 60 * 60 * 1000; // 24 hours

    if (lastDaily && now - lastDaily < cooldown) {
      const remaining = formatTime(cooldown - (now - lastDaily));
      return message.reply({ 
        embeds: [errorEmbed(`You've already claimed your daily reward. Come back in ${remaining}.`)] 
      });
    }

    const reward = 500 + Math.floor(Math.random() * 500);
    economyData[message.author.id].wallet += reward;
    await db.set(`daily_${message.author.id}`, now);
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '🎁 Daily Reward',
          `You claimed your daily reward of ${reward} coins!`,
          COLORS.SUCCESS,
          [
            { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins` }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('weekly', {
  description: 'Claim your weekly reward',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    const lastWeekly = await db.get(`weekly_${message.author.id}`);
    const now = Date.now();
    const cooldown = 7 * 24 * 60 * 60 * 1000; // 7 days

    if (lastWeekly && now - lastWeekly < cooldown) {
      const remaining = formatTime(cooldown - (now - lastWeekly));
      return message.reply({ 
        embeds: [errorEmbed(`You've already claimed your weekly reward. Come back in ${remaining}.`)] 
      });
    }

    const reward = 3000 + Math.floor(Math.random() * 2000);
    economyData[message.author.id].wallet += reward;
    await db.set(`weekly_${message.author.id}`, now);
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '🎁 Weekly Reward',
          `You claimed your weekly reward of ${reward} coins!`,
          COLORS.SUCCESS,
          [
            { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins` }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('hunt', {
  description: 'Go hunting for rewards',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    const lastHunt = await db.get(`hunt_${message.author.id}`);
    const now = Date.now();
    const cooldown = 5 * 60 * 1000; // 5 minutes

    if (lastHunt && now - lastHunt < cooldown) {
      const remaining = formatTime(cooldown - (now - lastHunt));
      return message.reply({ 
        embeds: [errorEmbed(`You're too tired to hunt right now. Try again in ${remaining}.`)] 
      });
    }

    await db.set(`hunt_${message.author.id}`, now);

    const outcomes = [
      { text: 'You found a rare item!', reward: 1000, item: 'Rare Trophy' },
      { text: 'You caught a big fish!', reward: 500, item: 'Big Fish' },
      { text: 'You found some coins in the bushes.', reward: 200, item: null },
      { text: 'You scared away all the animals and found nothing.', reward: 0, item: null },
      { text: 'You tripped and lost some coins.', reward: -100, item: null }
    ];

    const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
    economyData[message.author.id].wallet += outcome.reward;

    if (outcome.item) {
      if (!economyData[message.author.id].inventory) economyData[message.author.id].inventory = [];
      economyData[message.author.id].inventory.push(outcome.item);
    }

    saveData('economy', economyData);

    const embed = createEmbed(
      '🏹 Hunting Results',
      outcome.text,
      outcome.reward > 0 ? COLORS.SUCCESS : outcome.reward < 0 ? COLORS.ERROR : COLORS.DEFAULT
    );

    if (outcome.reward !== 0) {
      embed.addFields({ name: 'Coins', value: `${outcome.reward > 0 ? '+' : ''}${outcome.reward}`, inline: true });
    }

    if (outcome.item) {
      embed.addFields({ name: 'Item Found', value: outcome.item, inline: true });
    }

    message.reply({ embeds: [embed] });
  }
});

prefixCommands.set('battle', {
  description: 'Battle for rewards',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    const lastBattle = await db.get(`battle_${message.author.id}`);
    const now = Date.now();
    const cooldown = 10 * 60 * 1000; // 10 minutes

    if (lastBattle && now - lastBattle < cooldown) {
      const remaining = formatTime(cooldown - (now - lastBattle));
      return message.reply({ 
        embeds: [errorEmbed(`You need to recover from your last battle. Try again in ${remaining}.`)] 
      });
    }

    await db.set(`battle_${message.author.id}`, now);

    const win = Math.random() < 0.6; // 60% chance to win
    const reward = win ? 800 + Math.floor(Math.random() * 700) : -200;

    economyData[message.author.id].wallet += reward;
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          win ? '⚔️ Battle Victory' : '💀 Battle Defeat',
          win 
            ? `You defeated your opponent and won ${reward} coins!` 
            : `You were defeated in battle and lost ${Math.abs(reward)} coins.`,
          win ? COLORS.SUCCESS : COLORS.ERROR,
          [
            { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins` }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('loot', {
  description: 'Find random loot',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    const lastLoot = await db.get(`loot_${message.author.id}`);
    const now = Date.now();
    const cooldown = 2 * 60 * 1000; // 2 minutes

    if (lastLoot && now - lastLoot < cooldown) {
      const remaining = formatTime(cooldown - (now - lastLoot));
      return message.reply({ 
        embeds: [errorEmbed(`You need to wait before searching for more loot. Try again in ${remaining}.`)] 
      });
    }

    await db.set(`loot_${message.author.id}`, now);

    const items = [
      { name: 'Common Gem', value: 100, rarity: 'Common' },
      { name: 'Uncommon Jewel', value: 250, rarity: 'Uncommon' },
      { name: 'Rare Artifact', value: 500, rarity: 'Rare' },
      { name: 'Epic Treasure', value: 1000, rarity: 'Epic' },
      { name: 'Legendary Relic', value: 2500, rarity: 'Legendary' }
    ];

    // Weighted random based on rarity
    const weights = [0.5, 0.3, 0.15, 0.04, 0.01];
    let random = Math.random();
    let selectedIndex = 0;

    for (let i = 0; i < weights.length; i++) {
      random -= weights[i];
      if (random <= 0) {
        selectedIndex = i;
        break;
      }
    }

    const loot = items[selectedIndex];
    if (!economyData[message.author.id].inventory) economyData[message.author.id].inventory = [];
    economyData[message.author.id].inventory.push(loot.name);
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '💎 Loot Found',
          `You found a **${loot.rarity} ${loot.name}** worth ${loot.value} coins!`,
          COLORS.SUCCESS,
          [
            { name: 'Rarity', value: loot.rarity, inline: true },
            { name: 'Value', value: `${loot.value} coins`, inline: true }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('deposit', {
  description: 'Deposit money to your bank',
  usage: 'deposit <amount>',
  execute: async (message, args) => {
    const amount = parseInt(args[0]);
    if (isNaN(amount)) {
      return message.reply({ embeds: [errorEmbed('Please specify a valid amount to deposit.')] });
    }

    if (amount <= 0) {
      return message.reply({ embeds: [errorEmbed('You must deposit a positive amount.')] });
    }

    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    if (economyData[message.author.id].wallet < amount) {
      return message.reply({ embeds: [errorEmbed('You don\'t have enough money in your wallet.')] });
    }

    economyData[message.author.id].wallet -= amount;
    economyData[message.author.id].bank += amount;
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '🏦 Deposit Successful',
          `You deposited ${amount} coins to your bank.`,
          COLORS.SUCCESS,
          [
            { name: 'Wallet', value: `${economyData[message.author.id].wallet} coins`, inline: true },
            { name: 'Bank', value: `${economyData[message.author.id].bank} coins`, inline: true }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('withdraw', {
  description: 'Withdraw money from your bank',
  usage: 'withdraw <amount>',
  execute: async (message, args) => {
    const amount = parseInt(args[0]);
    if (isNaN(amount)) {
      return message.reply({ embeds: [errorEmbed('Please specify a valid amount to withdraw.')] });
    }

    if (amount <= 0) {
      return message.reply({ embeds: [errorEmbed('You must withdraw a positive amount.')] });
    }

    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    if (economyData[message.author.id].bank < amount) {
      return message.reply({ embeds: [errorEmbed('You don\'t have enough money in your bank.')] });
    }

    economyData[message.author.id].bank -= amount;
    economyData[message.author.id].wallet += amount;
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '🏦 Withdrawal Successful',
          `You withdrew ${amount} coins from your bank.`,
          COLORS.SUCCESS,
          [
            { name: 'Wallet', value: `${economyData[message.author.id].wallet} coins`, inline: true },
            { name: 'Bank', value: `${economyData[message.author.id].bank} coins`, inline: true }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('beg', {
  description: 'Beg for money',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    const lastBeg = await db.get(`beg_${message.author.id}`);
    const now = Date.now();
    const cooldown = 60 * 1000; // 1 minute

    if (lastBeg && now - lastBeg < cooldown) {
      const remaining = formatTime(cooldown - (now - lastBeg));
      return message.reply({ 
        embeds: [errorEmbed(`You've begged too much recently. Try again in ${remaining}.`)] 
      });
    }

    await db.set(`beg_${message.author.id}`, now);

    const reward = Math.floor(Math.random() * 50) + 1;
    economyData[message.author.id].wallet += reward;
    saveData('economy', economyData);

    const responses = [
      `A kind stranger gave you ${reward} coins.`,
      `You begged on the street and earned ${reward} coins.`,
      `Someone took pity on you and gave you ${reward} coins.`,
      `You found ${reward} coins while begging.`
    ];

    message.reply({
      embeds: [
        createEmbed(
          '🙏 Begging Results',
          responses[Math.floor(Math.random() * responses.length)],
          COLORS.SUCCESS,
          [
            { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins` }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('give', {
  description: 'Give money to another user',
  usage: 'give <@user> <amount>',
  execute: async (message, args) => {
    const user = message.mentions.users.first();
    if (!user) {
      return message.reply({ embeds: [errorEmbed('Please mention a user to give money to.')] });
    }

    if (user.id === message.author.id) {
      return message.reply({ embeds: [errorEmbed('You can\'t give money to yourself.')] });
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount)) {
      return message.reply({ embeds: [errorEmbed('Please specify a valid amount to give.')] });
    }

    if (amount <= 0) {
      return message.reply({ embeds: [errorEmbed('You must give a positive amount.')] });
    }

    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    if (!economyData[user.id]) {
      economyData[user.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    if (economyData[message.author.id].wallet < amount) {
      return message.reply({ embeds: [errorEmbed('You don\'t have enough money in your wallet.')] });
    }

    economyData[message.author.id].wallet -= amount;
    economyData[user.id].wallet += amount;
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '💰 Gift Sent',
          `You gave ${amount} coins to ${user.tag}.`,
          COLORS.SUCCESS,
          [
            { name: 'Your Wallet', value: `${economyData[message.author.id].wallet} coins`, inline: true },
            { name: `${user.username}'s Wallet`, value: `${economyData[user.id].wallet} coins`, inline: true }
          ]
        )
      ]
    });

    try {
      await user.send({
        embeds: [
          createEmbed(
            '🎁 You Received a Gift',
            `${message.author.tag} gave you ${amount} coins in ${message.guild.name}.`,
            COLORS.SUCCESS,
            [
              { name: 'New Balance', value: `${economyData[user.id].wallet} coins` }
            ]
          )
        ]
      });
    } catch (err) {
      console.log(`Could not send DM to ${user.tag}`);
    }
  }
});

prefixCommands.set('inventory', {
  description: 'View your inventory',
  execute: async (message) => {
    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
      saveData('economy', economyData);
    }

    if (!economyData[message.author.id].inventory || economyData[message.author.id].inventory.length === 0) {
      return message.reply({ embeds: [infoEmbed('Your inventory is empty.')] });
    }

    // Count items
    const itemCounts = {};
    economyData[message.author.id].inventory.forEach(item => {
      itemCounts[item] = (itemCounts[item] || 0) + 1;
    });

    const fields = Object.entries(itemCounts).map(([item, count]) => ({
      name: item,
      value: `Quantity: ${count}`,
      inline: true
    }));

    message.reply({
      embeds: [
        createEmbed(
          '🎒 Your Inventory',
          `You have ${economyData[message.author.id].inventory.length} item(s) in total.`,
          COLORS.DEFAULT,
          fields,
          { text: message.author.tag, iconURL: message.author.displayAvatarURL() }
        )
      ]
    });
  }
});

prefixCommands.set('shop', {
  description: 'View the shop',
  execute: async (message) => {
    const shopItems = [
      { name: 'Fishing Rod', price: 500, description: 'Increases hunting rewards' },
      { name: 'Lucky Charm', price: 1000, description: 'Increases chance of rare loot' },
      { name: 'Treasure Map', price: 2000, description: 'Guarantees rare loot next time' },
      { name: 'Golden Ticket', price: 5000, description: 'Special item with unknown effects' }
    ];

    const fields = shopItems.map(item => ({
      name: `${item.name} - ${item.price} coins`,
      value: item.description,
      inline: false
    }));

    message.reply({
      embeds: [
        createEmbed(
          '🛒 Shop',
          'Available items to purchase:',
          COLORS.DEFAULT,
          fields,
          { text: 'Use !buy <item> to purchase' }
        )
      ]
    });
  }
});

prefixCommands.set('buy', {
  description: 'Buy an item from the shop',
  usage: 'buy <item>',
  execute: async (message, args) => {
    const itemName = args.join(' ');
    if (!itemName) {
      return message.reply({ embeds: [errorEmbed('Please specify an item to buy.')] });
    }

    const shopItems = [
      { name: 'Fishing Rod', price: 500 },
      { name: 'Lucky Charm', price: 1000 },
      { name: 'Treasure Map', price: 2000 },
      { name: 'Golden Ticket', price: 5000 }
    ];

    const item = shopItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
    if (!item) {
      return message.reply({ embeds: [errorEmbed('That item is not available in the shop.')] });
    }

    const economyData = getData('economy');
    if (!economyData[message.author.id]) {
      economyData[message.author.id] = { wallet: 100, bank: 0, inventory: [] };
    }

    if (economyData[message.author.id].wallet < item.price) {
      return message.reply({ embeds: [errorEmbed(`You don't have enough coins to buy ${item.name}.`)] });
    }

    economyData[message.author.id].wallet -= item.price;
    if (!economyData[message.author.id].inventory) economyData[message.author.id].inventory = [];
    economyData[message.author.id].inventory.push(item.name);
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '🛒 Purchase Successful',
          `You bought a ${item.name} for ${item.price} coins.`,
          COLORS.SUCCESS,
          [
            { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins`, inline: true },
            { name: 'Items Owned', value: economyData[message.author.id].inventory.length.toString(), inline: true }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('sell', {
  description: 'Sell an item from your inventory',
  usage: 'sell <item>',
  execute: async (message, args) => {
    const itemName = args.join(' ');
    if (!itemName) {
      return message.reply({ embeds: [errorEmbed('Please specify an item to sell.')] });
    }

    const economyData = getData('economy');
    if (!economyData[message.author.id] || !economyData[message.author.id].inventory || economyData[message.author.id].inventory.length === 0) {
      return message.reply({ embeds: [errorEmbed('Your inventory is empty.')] });
    }

    const itemIndex = economyData[message.author.id].inventory.findIndex(
      item => item.toLowerCase() === itemName.toLowerCase()
    );

    if (itemIndex === -1) {
      return message.reply({ embeds: [errorEmbed('You don\'t have that item in your inventory.')] });
    }

    const item = economyData[message.author.id].inventory[itemIndex];
    const sellPrices = {
      'Fishing Rod': 250,
      'Lucky Charm': 500,
      'Treasure Map': 1000,
      'Golden Ticket': 2500
    };

    const sellPrice = sellPrices[item] || 100;
    economyData[message.author.id].wallet += sellPrice;
    economyData[message.author.id].inventory.splice(itemIndex, 1);
    saveData('economy', economyData);

    message.reply({
      embeds: [
        createEmbed(
          '💰 Item Sold',
          `You sold ${item} for ${sellPrice} coins.`,
          COLORS.SUCCESS,
          [
            { name: 'New Balance', value: `${economyData[message.author.id].wallet} coins`, inline: true },
            { name: 'Items Remaining', value: economyData[message.author.id].inventory.length.toString(), inline: true }
          ]
        )
      ]
    });
  }
});

// Command: DM & Embeds
const dmCommands = [
  {
    name: 'dm',
    description: 'DM a role',
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
    description: 'Send an embed',
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
  }
];

commands.push(...dmCommands);
prefixCommands.set('dm', {
  description: 'DM a role',
  usage: 'dm <@role> <message>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [errorEmbed('You need administrator permissions to use this command.')] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [errorEmbed('Please mention a role to DM.')] });
    }

    const dmMessage = args.slice(1).join(' ');
    if (!dmMessage) {
      return message.reply({ embeds: [errorEmbed('Please provide a message to send.')] });
    }

    const members = await message.guild.members.fetch();
    const roleMembers = members.filter(m => m.roles.cache.has(role.id));

    if (roleMembers.size === 0) {
      return message.reply({ embeds: [errorEmbed('That role has no members.')] });
    }

    const sentTo = [];
    const failedToSend = [];

    for (const member of roleMembers.values()) {
      try {
        await member.send({
          embeds: [
            createEmbed(
              `Message from ${message.guild.name}`,
              dmMessage,
              COLORS.DEFAULT,
              [],
              { text: message.guild.name, iconURL: message.guild.iconURL() }
            )
          ]
        });
        sentTo.push(member.user.tag);
      } catch (err) {
        failedToSend.push(member.user.tag);
      }
    }

    message.reply({
      embeds: [
        createEmbed(
          '📩 DM Results',
          `Successfully sent to ${sentTo.length} members. ${failedToSend.length} members couldn't be DMed.`,
          sentTo.length > 0 ? COLORS.SUCCESS : COLORS.ERROR,
          [
            { name: 'Success', value: sentTo.length > 0 ? sentTo.join('\n') : 'None', inline: true },
            { name: 'Failed', value: failedToSend.length > 0 ? failedToSend.join('\n') : 'None', inline: true }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('embed', {
  description: 'Send an embed',
  usage: 'embed <color> <message>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [errorEmbed('You need the `Manage Messages` permission to use this command.')] });
    }

    const color = args[0];
    if (!color.match(/^#([0-9A-F]{3}){1,2}$/i)) {
      return message.reply({ embeds: [errorEmbed('Please provide a valid hex color (e.g., #FF0000).')] });
    }

    const embedMessage = args.slice(1).join(' ');
    if (!embedMessage) {
      return message.reply({ embeds: [errorEmbed('Please provide a message for the embed.')] });
    }

    message.channel.send({
      embeds: [
        createEmbed(
          '',
          embedMessage,
          color,
          [],
          { text: message.author.tag, iconURL: message.author.displayAvatarURL() }
        )
      ]
    });
    message.delete().catch(() => {});
  }
});

prefixCommands.set('msg', {
  description: 'Send a message to a channel',
  usage: 'msg <#channel> <message>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
      return message.reply({ embeds: [errorEmbed('You need the `Manage Messages` permission to use this command.')] });
    }

    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [errorEmbed('Please mention a channel to send the message to.')] });
    }

    const msgContent = args.slice(1).join(' ');
    if (!msgContent) {
      return message.reply({ embeds: [errorEmbed('Please provide a message to send.')] });
    }

    try {
      await channel.send(msgContent);
      message.reply({ embeds: [successEmbed(`Message sent to ${channel}.`)] });
    } catch (err) {
      message.reply({ embeds: [errorEmbed(`Failed to send message to ${channel}. I might not have permissions.`)] });
    }
  }
});

// Command: Utilities
const utilityCommands = [
  {
    name: 'userinfo',
    description: 'Get information about a user',
    options: [
      {
        name: 'user',
        description: 'The user to get info about',
        type: 6,
        required: false
      }
    ]
  },
  {
    name: 'serverinfo',
    description: 'Get information about the server'
  },
  {
    name: 'ping',
    description: 'Check the bot\'s latency'
  },
  {
    name: 'prems',
    description: 'Give a role premium command access',
    options: [
      {
        name: 'role',
        description: 'The role to give premium access',
        type: 8,
        required: true
      }
    ]
  },
  {
    name: 'uptime',
    description: 'Check the bot\'s uptime'
  },
  {
    name: 'botstats',
    description: 'View bot statistics'
  }
];

commands.push(...utilityCommands);
prefixCommands.set('userinfo', {
  description: 'Get information about a user',
  usage: 'userinfo [@user]',
  execute: async (message, args) => {
    const user = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(user.id).catch(() => null);

    if (!member) {
      return message.reply({ embeds: [errorEmbed('User not found in this server.')] });
    }

    const roles = member.roles.cache
      .filter(role => role.id !== message.guild.id)
      .sort((a, b) => b.position - a.position)
      .map(role => role.toString());

    const fields = [
      { name: 'ID', value: user.id, inline: true },
      { name: 'Username', value: user.tag, inline: true },
      { name: 'Nickname', value: member.nickname || 'None', inline: true },
      { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
      { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>`, inline: true },
      { name: 'Joined Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:f>`, inline: true },
      { name: `Roles (${roles.length})`, value: roles.length > 0 ? roles.join(' ') : 'None', inline: false }
    ];

    message.reply({
      embeds: [
        createEmbed(
          '👤 User Information',
          '',
          COLORS.DEFAULT,
          fields,
          { text: message.guild.name, iconURL: message.guild.iconURL() }
        ).setThumbnail(user.displayAvatarURL({ size: 512 }))
      ]
    });
  }
});

prefixCommands.set('serverinfo', {
  description: 'Get information about the server',
  execute: async (message) => {
    const { guild } = message;
    const owner = await guild.fetchOwner();

    const fields = [
      { name: 'Owner', value: owner.user.tag, inline: true },
      { name: 'ID', value: guild.id, inline: true },
      { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:f>`, inline: true },
      { name: 'Members', value: guild.memberCount.toString(), inline: true },
      { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
      { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
      { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
      { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true },
      { name: 'Verification Level', value: guild.verificationLevel, inline: true }
    ];

    message.reply({
      embeds: [
        createEmbed(
          '🖥️ Server Information',
          '',
          COLORS.DEFAULT,
          fields,
          { text: guild.name, iconURL: guild.iconURL() }
        ).setThumbnail(guild.iconURL({ size: 512 }))
      ]
    });
  }
});

prefixCommands.set('ping', {
  description: 'Check the bot\'s latency',
  execute: async (message) => {
    const msg = await message.reply({ embeds: [infoEmbed('Pinging...')] });
    const latency = msg.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    msg.edit({
      embeds: [
        createEmbed(
          '🏓 Pong!',
          `Here are the latency stats:`,
          COLORS.DEFAULT,
          [
            { name: 'Bot Latency', value: `${latency}ms`, inline: true },
            { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
          ]
        )
      ]
    });
  }
});

prefixCommands.set('prems', {
  description: 'Give a role premium command access',
  usage: 'prems <@role>',
  execute: async (message, args) => {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ embeds: [errorEmbed('You need administrator permissions to use this command.')] });
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [errorEmbed('Please mention a role to give premium access.')] });
    }

    await db.set(`premium_role_${message.guild.id}`, role.id);
    message.reply({ embeds: [successEmbed(`${role.name} now has access to premium commands.`)] });
  }
});

prefixCommands.set('uptime', {
  description: 'Check the bot\'s uptime',
  execute: async (message) => {
    const uptime = formatTime(client.uptime);
    message.reply({ embeds: [infoEmbed(`The bot has been online for ${uptime}.`)] });
  }
});

prefixCommands.set('botstats', {
  description: 'View bot statistics',
  execute: async (message) => {
    const { heapUsed, heapTotal } = process.memoryUsage();
    const memoryUsage = `${(heapUsed / 1024 / 1024).toFixed(2)} MB / ${(heapTotal / 1024 / 1024).toFixed(2)} MB`;
    const cpuUsage = `${(process.cpuUsage().user / 1024 / 1024).toFixed(2)}%`;

    const fields = [
      { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
      { name: 'Users', value: client.users.cache.size.toString(), inline: true },
      { name: 'Channels', value: client.channels.cache.size.toString(), inline: true },
      { name: 'Memory Usage', value: memoryUsage, inline: true },
      { name: 'CPU Usage', value: cpuUsage, inline: true },
      { name: 'Discord.js Version', value: require('discord.js').version, inline: true },
      { name: 'Node.js Version', value: process.version, inline: true },
      { name: 'Uptime', value: formatTime(client.uptime), inline: true }
    ];

    message.reply({
      embeds: [
        createEmbed(
          '🤖 Bot Statistics',
          '',
          COLORS.DEFAULT,
          fields,
          { text: client.user.tag, iconURL: client.user.displayAvatarURL() }
        )
      ]
    });
  }
});

// Command: Music Player
const musicCommands = [
  {
    name: 'play',
    description: 'Play a song',
    options: [
      {
        name: 'query',
        description: 'The song to play',
        type: 3,
        required: true
      }
    ]
  },
  {
    name: 'pause',
    description: 'Pause the current song'
  },
  {
    name: 'resume',
    description: 'Resume the current song'
  },
  {
    name: 'stop',
    description: 'Stop the music'
  },
  {
    name: 'skip',
    description: 'Skip the current song'
  },
  {
    name: 'queue',
    description: 'View the queue'
  },
  {
    name: 'np',
    description: 'View the currently playing song'
  },
  {
    name: 'volume',
    description: 'Set the volume',
    options: [
      {
        name: 'level',
        description: 'The volume level (1-100)',
        type: 4,
        required: true
      }
    ]
  },
  {
    name: 'lyrics',
    description: 'Get lyrics for a song',
    options: [
      {
        name: 'song',
        description: 'The song to get lyrics for',
        type: 3,
        required: false
      }
    ]
  },
  {
    name: 'loop',
    description: 'Toggle loop mode'
  },
  {
    name: 'shuffle',
    description: 'Shuffle the queue'
  },
  {
    name: 'phonk',
    description: 'Play phonk music'
  },
  {
    name: 'english',
    description: 'Play English music'
  },
  {
    name: 'hind',
    description: 'Play Hindi music'
  },
  {
    name: 'randomsong',
    description: 'Play a random song'
  }
];

commands.push(...musicCommands);
prefixCommands.set('play', {
  description: 'Play a song',
  usage: 'play <song name | URL>',
  execute: async (message, args) => {
    const query = args.join(' ');
    if (!query) return message.reply({ embeds: [errorEmbed('Please provide a song name or URL.')] });

    if (!message.member.voice.channel) {
      return message.reply({ embeds: [errorEmbed('You need to be in a voice channel to play music.')] });
    }

    const queue = player.nodes.create(message.guild, {
      metadata: {
        channel: message.channel
      },
      leaveOnEmpty: true,
      leaveOnEmptyCooldown: 30000,
      leaveOnEnd: true,
      leaveOnEndCooldown: 30000,
      selfDeaf: true
    });

    try {
      if (!queue.connection) await queue.connect(message.member.voice.channel);
    } catch {
      queue.delete();
      return message.reply({ embeds: [errorEmbed('Could not join your voice channel.')] });
    }

    const searchResult = await player.search(query, {
      requestedBy: message.author
    });

    if (!searchResult || !searchResult.tracks.length) {
      return message.reply({ embeds: [errorEmbed('No results found.')] });
    }

    const embed = createEmbed(
      '🎵 Adding to Queue',
      searchResult.playlist 
        ? `Added **${searchResult.tracks.length}** tracks from ${searchResult.playlist.title} to the queue.`
        : `Added **${searchResult.tracks[0].title}** to the queue.`,
      COLORS.SUCCESS
    ).setThumbnail(searchResult.tracks[0].thumbnail);

    message.reply({ embeds: [embed] });

    searchResult.playlist ? queue.addTrack(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);

    if (!queue.isPlaying()) await queue.node.play();
  }
});

prefixCommands.set('pause', {
  description: 'Pause the current song',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply({ embeds: [errorEmbed('No music is currently playing.')] });
    }

    queue.node.pause();
    message.reply({ embeds: [successEmbed('Paused the current song.')] });
  }
});

prefixCommands.set('resume', {
  description: 'Resume the current song',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.node.isPaused()) {
      return message.reply({ embeds: [errorEmbed('No music is currently paused.')] });
    }

    queue.node.resume();
    message.reply({ embeds: [successEmbed('Resumed the current song.')] });
  }
});

prefixCommands.set('stop', {
  description: 'Stop the music',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply({ embeds: [errorEmbed('No music is currently playing.')] });
    }

    queue.delete();
    message.reply({ embeds: [successEmbed('Stopped the music and cleared the queue.')] });
  }
});

prefixCommands.set('skip', {
  description: 'Skip the current song',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply({ embeds: [errorEmbed('No music is currently playing.')] });
    }

    const currentTrack = queue.currentTrack;
    queue.node.skip();
    message.reply({ embeds: [successEmbed(`Skipped **${currentTrack.title}**.`)] });
  }
});

prefixCommands.set('queue', {
  description: 'View the queue',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.tracks.length) {
      return message.reply({ embeds: [errorEmbed('The queue is empty.')] });
    }

    const tracks = queue.tracks.map((track, i) => `**${i + 1}.** ${track.title} (${track.duration})`);
    const currentTrack = queue.currentTrack;

    message.reply({
      embeds: [
        createEmbed(
          '🎶 Queue',
          `**Now Playing:** ${currentTrack.title} (${currentTrack.duration})\n\n**Up Next:**\n${tracks.slice(0, 10).join('\n')}`,
          COLORS.DEFAULT
        ).setThumbnail(currentTrack.thumbnail)
      ]
    });
  }
});

prefixCommands.set('np', {
  description: 'View the currently playing song',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply({ embeds: [errorEmbed('No music is currently playing.')] });
    }

    const track = queue.currentTrack;

    message.reply({
      embeds: [
        createEmbed(
          '🎵 Now Playing',
          `**Title:** ${track.title}\n**Duration:** ${track.duration}\n**Requested By:** ${track.requestedBy}`,
          COLORS.DEFAULT
        ).setThumbnail(track.thumbnail)
      ]
    });
  }
});

prefixCommands.set('volume', {
  description: 'Set the volume',
  usage: 'volume <1-100>',
  execute: async (message, args) => {
    const volume = parseInt(args[0]);
    if (isNaN(volume) || volume < 1 || volume > 100) {
      return message.reply({ embeds: [errorEmbed('Please provide a volume level between 1 and 100.')] });
    }

    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply({ embeds: [errorEmbed('No music is currently playing.')] });
    }

    queue.node.setVolume(volume);
    message.reply({ embeds: [successEmbed(`Volume set to ${volume}%.`)] });
  }
});

prefixCommands.set('lyrics', {
  description: 'Get lyrics for a song',
  usage: 'lyrics [song]',
  execute: async (message, args) => {
    const query = args.join(' ') || (player.nodes.get(message.guild.id)?.currentTrack?.title);
    if (!query) return message.reply({ embeds: [errorEmbed('Please provide a song name or play a song first.')] });

    try {
      const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(query)}`);
      const data = await response.json();

      if (data.error || !data.lyrics) {
        return message.reply({ embeds: [errorEmbed('No lyrics found for this song.')] });
      }

      const lyrics = data.lyrics.length > 2000 
        ? `${data.lyrics.substring(0, 2000)}...` 
        : data.lyrics;

      message.reply({
        embeds: [
          createEmbed(
            `🎶 Lyrics for ${query}`,
            lyrics,
            COLORS.DEFAULT
          )
        ]
      });
    } catch (err) {
      message.reply({ embeds: [errorEmbed('Failed to fetch lyrics.')] });
    }
  }
});

prefixCommands.set('loop', {
  description: 'Toggle loop mode',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.isPlaying()) {
      return message.reply({ embeds: [errorEmbed('No music is currently playing.')] });
    }

    queue.setRepeatMode(queue.repeatMode === 2 ? 0 : 2);
    message.reply({ 
      embeds: [successEmbed(`Loop mode ${queue.repeatMode === 2 ? 'enabled' : 'disabled'}.`)] 
    });
  }
});

prefixCommands.set('shuffle', {
  description: 'Shuffle the queue',
  execute: async (message) => {
    const queue = player.nodes.get(message.guild.id);
    if (!queue || !queue.tracks.length) {
      return message.reply({ embeds: [errorEmbed('The queue is empty.')] });
    }

    queue.tracks.shuffle();
    message.reply({ embeds: [successEmbed('Shuffled the queue.')] });
  }
});

prefixCommands.set('phonk', {
  description: 'Play phonk music',
  execute: async (message) => {
    const phonkPlaylists = [
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmsW46rJyudVFlY6IYjFBIK',
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgkQ5i5U0QFGV1P6rkZq0YJv',
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmQpW9V2J7hQ7JX1YJ7Z0Yk'
    ];

    const query = phonkPlaylists[Math.floor(Math.random() * phonkPlaylists.length)];
    prefixCommands.get('play').execute(message, [query]);
  }
});

prefixCommands.set('english', {
  description: 'Play English music',
  execute: async (message) => {
    const englishPlaylists = [
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgkQ5i5U0QFGV1P6rkZq0YJv',
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmsW46rJyudVFlY6IYjFBIK',
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmQpW9V2J7hQ7JX1YJ7Z0Yk'
    ];

    const query = englishPlaylists[Math.floor(Math.random() * englishPlaylists.length)];
    prefixCommands.get('play').execute(message, [query]);
  }
});

prefixCommands.set('hind', {
  description: 'Play Hindi music',
  execute: async (message) => {
    const hindiPlaylists = [
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgkQ5i5U0QFGV1P6rkZq0YJv',
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmsW46rJyudVFlY6IYjFBIK',
      'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmQpW9V2J7hQ7JX1YJ7Z0Yk'
    ];

    const query = hindiPlaylists[Math.floor(Math.random() * hindiPlaylists.length)];
    prefixCommands.get('play').execute(message, [query]);
  }
});

prefixCommands.set('randomsong', {
  description: 'Play a random song',
  execute: async (message) => {
    const randomSongs = [
      'Never Gonna Give You Up',
      'Bohemian Rhapsody',
      'Shape of You',
      'Blinding Lights',
      'Dance Monkey',
      'Uptown Funk',
      'Despacito',
      'Old Town Road',
      'Bad Guy',
      'Levitating'
    ];

    const query = randomSongs[Math.floor(Math.random() * randomSongs.length)];
    prefixCommands.get('play').execute(message, [query]);
  }
});

// Event: Ready
client.once('ready', async () => {
  console.log(`Logged in as ${client.user.tag}`);
  await registerSlashCommands();
  
  // Initialize player
  await player.extractors.register(SpotifyExtractor, spotifyCredentials);
  await player.extractors.loadDefault();

  // Set status
  client.user.setActivity({
    name: `${PREFIX}help | /help`,
    type: ActivityType.Listening
  });
});

// Event: Interaction Create
client.on('interactionCreate', async interaction => {
  if (interaction.isCommand()) {
    const command = commands.find(cmd => cmd.name === interaction.commandName);
    if (!command) return;

    try {
      // Handle slash commands
      if (interaction.commandName === 'help') {
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('help_category')
          .setPlaceholder('📋 Select a command category to view commands')
          .addOptions(
            new StringSelectMenuOptionBuilder()
              .setLabel('Ticket System')
              .setValue('ticket')
              .setEmoji('🎟️'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Application System')
              .setValue('application')
              .setEmoji('📋'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Moderation')
              .setValue('moderation')
              .setEmoji('⚠️'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Mini-Games')
              .setValue('games')
              .setEmoji('🎮'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Economy')
              .setValue('economy')
              .setEmoji('💰'),
            new StringSelectMenuOptionBuilder()
              .setLabel('DM & Embeds')
              .setValue('dm')
              .setEmoji('📩'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Utilities')
              .setValue('utilities')
              .setEmoji('ℹ️'),
            new StringSelectMenuOptionBuilder()
              .setLabel('Music')
              .setValue('music')
              .setEmoji('🎵')
          );

        const row = new ActionRowBuilder().addComponents(selectMenu);

        const embed = createEmbed(
          '📚 Bot Help',
          'Select a category from the dropdown below to view available commands.',
          COLORS.DEFAULT,
          [],
          { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
        );

        await interaction.reply({ embeds: [embed], components: [row] });
      } else if (interaction.commandName === 'ticket') {
        const action = interaction.options.getString('action');
        const value = interaction.options.getString('value');

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Manage Server` permission to use this command.')], ephemeral: true });
        }

        const ticketsData = getData('tickets');
        if (!ticketsData[interaction.guild.id]) ticketsData[interaction.guild.id] = {};

        switch (action) {
          case 'msg':
            ticketsData[interaction.guild.id].message = value;
            saveData('tickets', ticketsData);
            interaction.reply({ embeds: [successEmbed('Ticket message set successfully!')], ephemeral: true });
            break;

          case 'options':
            const options = value.split(',').map(opt => {
              const [label, emoji] = opt.trim().split(':');
              return { label, emoji: emoji.trim() };
            });
            ticketsData[interaction.guild.id].options = options;
            saveData('tickets', ticketsData);
            interaction.reply({ embeds: [successEmbed('Ticket options set successfully!')], ephemeral: true });
            break;

          case 'viewer':
            const role = interaction.options.getRole('value');
            if (!role) return interaction.reply({ embeds: [errorEmbed('Please mention a valid role.')], ephemeral: true });
            ticketsData[interaction.guild.id].viewerRole = role.id;
            saveData('tickets', ticketsData);
            interaction.reply({ embeds: [successEmbed(`Viewer role set to ${role.name}!`)], ephemeral: true });
            break;

          case 'category':
            const category = interaction.guild.channels.cache.get(value);
            if (!category || category.type !== ChannelType.GuildCategory) {
              return interaction.reply({ embeds: [errorEmbed('Please provide a valid category ID.')], ephemeral: true });
            }
            ticketsData[interaction.guild.id].category = value;
            saveData('tickets', ticketsData);
            interaction.reply({ embeds: [successEmbed(`Ticket category set to ${category.name}!`)], ephemeral: true });
            break;

          case 'deploy':
            if (!ticketsData[interaction.guild.id]?.message || !ticketsData[interaction.guild.id]?.options) {
              return interaction.reply({ embeds: [errorEmbed('Please set the ticket message and options first.')], ephemeral: true });
            }

            const selectMenu = new StringSelectMenuBuilder()
              .setCustomId('create_ticket')
              .setPlaceholder('Select a ticket type...')
              .addOptions(
                ticketsData[interaction.guild.id].options.map(opt => 
                  new StringSelectMenuOptionBuilder()
                    .setLabel(opt.label)
                    .setValue(opt.label.toLowerCase())
                    .setEmoji(opt.emoji)
                )
              );

            const row = new ActionRowBuilder().addComponents(selectMenu);
            const embed = createEmbed(
              '🎟️ Support Tickets',
              ticketsData[interaction.guild.id].message,
              COLORS.DEFAULT,
              [],
              { text: 'Click the dropdown below to create a ticket' }
            );

            interaction.channel.send({ embeds: [embed], components: [row] });
            interaction.reply({ embeds: [successEmbed('Ticket panel deployed successfully!')], ephemeral: true });
            break;
        }
      } else if (interaction.commandName === 'app') {
        const action = interaction.options.getString('action');
        const value = interaction.options.getString('value');
        const number = interaction.options.getInteger('number');

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Manage Server` permission to use this command.')], ephemeral: true });
        }

        const appsData = getData('applications');
        if (!appsData[interaction.guild.id]) appsData[interaction.guild.id] = { questions: [] };

        switch (action) {
          case 'msg':
            appsData[interaction.guild.id].message = value;
            saveData('applications', appsData);
            interaction.reply({ embeds: [successEmbed('Application message set successfully!')], ephemeral: true });
            break;

          case 'addoption':
            const [roleName, emoji] = value.split(':');
            if (!roleName || !emoji) {
              return interaction.reply({ embeds: [errorEmbed('Format: `!app addoption RoleName:🛡️`')], ephemeral: true });
            }

            if (!appsData[interaction.guild.id].options) appsData[interaction.guild.id].options = [];
            appsData[interaction.guild.id].options.push({ roleName: roleName.trim(), emoji: emoji.trim() });
            saveData('applications', appsData);
            interaction.reply({ embeds: [successEmbed('Application role option added successfully!')], ephemeral: true });
            break;

          case 'channel':
            const channel = interaction.options.getChannel('value');
            if (!channel) return interaction.reply({ embeds: [errorEmbed('Please mention a valid channel.')], ephemeral: true });
            appsData[interaction.guild.id].channel = channel.id;
            saveData('applications', appsData);
            interaction.reply({ embeds: [successEmbed(`Application channel set to ${channel.name}!`)], ephemeral: true });
            break;

          case 'deploy':
            if (!appsData[interaction.guild.id]?.message || !appsData[interaction.guild.id]?.options) {
              return interaction.reply({ embeds: [errorEmbed('Please set the application message and options first.')], ephemeral: true });
            }

            const buttons = appsData[interaction.guild.id].options.map(opt => 
              new ButtonBuilder()
                .setCustomId(`app_${opt.roleName.toLowerCase().replace(/\s+/g, '_')}`)
                .setLabel(opt.roleName)
                .setEmoji(opt.emoji)
                .setStyle(ButtonStyle.Primary)
            );

            const rows = [];
            while (buttons.length > 0) {
              rows.push(new ActionRowBuilder().addComponents(buttons.splice(0, 5)));
            }

            const embed = createEmbed(
              '📋 Application System',
              appsData[interaction.guild.id].message,
              COLORS.DEFAULT,
              [],
              { text: 'Click a button below to start your application' }
            );

            interaction.channel.send({ embeds: [embed], components: rows });
            interaction.reply({ embeds: [successEmbed('Application panel deployed successfully!')], ephemeral: true });
            break;

          case 'question':
            const questionText = value;
            
            if (!number) {
              return interaction.reply({ embeds: [errorEmbed('Please provide a valid question number.')], ephemeral: true });
            }

            if (!questionText) {
              return interaction.reply({ embeds: [errorEmbed('Please provide the question text.')], ephemeral: true });
            }

            appsData[interaction.guild.id].questions[number - 1] = questionText;
            saveData('applications', appsData);
            interaction.reply({ embeds: [successEmbed(`Question ${number} set successfully!`)], ephemeral: true });
            break;
        }
      } else if (interaction.commandName === 'warn') {
        const user = interaction.options.getUser('user');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Kick Members` permission to use this command.')], ephemeral: true });
        }

        const warningsData = getData('warnings');
        if (!warningsData[interaction.guild.id]) warningsData[interaction.guild.id] = {};
        if (!warningsData[interaction.guild.id][user.id]) warningsData[interaction.guild.id][user.id] = [];

        const caseId = uuidv4();
        warningsData[interaction.guild.id][user.id].push({
          id: caseId,
          reason,
          moderator: interaction.user.id,
          timestamp: Date.now()
        });

        saveData('warnings', warningsData);

        // Check warn limit
        const warnLimit = await db.get(`warnlimit_${interaction.guild.id}`) || 3;
        if (warningsData[interaction.guild.id][user.id].length >= warnLimit) {
          try {
            await interaction.guild.members.cache.get(user.id).kick(`Reached warning limit (${warnLimit})`);
            interaction.reply({ 
              embeds: [
                createEmbed(
                  '🔴 User Kicked',
                  `${user.tag} has been kicked for reaching the warning limit (${warnLimit} warnings).`,
                  COLORS.ERROR,
                  [
                    { name: 'Case ID', value: caseId },
                    { name: 'Reason', value: reason }
                  ],
                  { text: `Moderator: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }
                )
              ]
            });
          } catch (err) {
            interaction.reply({ embeds: [errorEmbed(`Failed to kick ${user.tag}. I might not have the required permissions.`)] });
          }
          return;
        }

        interaction.reply({ 
          embeds: [
            createEmbed(
              '🟡 User Warned',
              `${user.tag} has been warned. They now have ${warningsData[interaction.guild.id][user.id].length} warning(s).`,
              COLORS.WARNING,
              [
                { name: 'Case ID', value: caseId },
                { name: 'Reason', value: reason }
              ],
              { text: `Moderator: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }
            )
          ]
        });

        try {
          await user.send({
            embeds: [
              createEmbed(
                '⚠️ You have been warned',
                `You received a warning in **${interaction.guild.name}**.`,
                COLORS.WARNING,
                [
                  { name: 'Reason', value: reason },
                  { name: 'Total Warnings', value: warningsData[interaction.guild.id][user.id].length.toString() }
                ],
                { text: `Server: ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() }
              )
            ]
          });
        } catch (err) {
          console.log(`Could not send DM to ${user.tag}`);
        }
      } else if (interaction.commandName === 'warnings') {
        const user = interaction.options.getUser('user');

        const warningsData = getData('warnings');
        if (!warningsData[interaction.guild.id]?.[user.id] || warningsData[interaction.guild.id][user.id].length === 0) {
          return interaction.reply({ embeds: [infoEmbed(`${user.tag} has no warnings.`)] });
        }

        const fields = warningsData[interaction.guild.id][user.id].map(warn => ({
          name: `Case ${warn.id}`,
          value: `**Reason:** ${warn.reason}\n**Date:** <t:${Math.floor(warn.timestamp / 1000)}:f>\n**Moderator:** <@${warn.moderator}>`,
          inline: false
        }));

        interaction.reply({
          embeds: [
            createEmbed(
              `⚠️ Warnings for ${user.tag}`,
              `Total warnings: ${fields.length}`,
              COLORS.WARNING,
              fields,
              { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
            )
          ]
        });
      } else if (interaction.commandName === 'warnlimit') {
        const limit = interaction.options.getInteger('number');

        if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Kick Members` permission to use this command.')], ephemeral: true });
        }

        await db.set(`warnlimit_${interaction.guild.id}`, limit);
        interaction.reply({ embeds: [successEmbed(`Auto-kick warning limit set to ${limit}.`)] });
      } else if (interaction.commandName === 'mute') {
        const user = interaction.options.getUser('user');
        const duration = interaction.options.getString('duration');
        const reason = interaction.options.getString('reason') || 'No reason provided';

        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Moderate Members` permission to use this command.')], ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(user.id);
        if (!member) return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], ephemeral: true });

        // Parse duration (default: 1 hour)
        let muteDuration = 3600000; // 1 hour in ms
        
        if (duration) {
          const timeMatch = duration.match(/^(\d+)([smhd])$/);
          
          if (timeMatch) {
            const num = parseInt(timeMatch[1]);
            const unit = timeMatch[2];
            
            switch (unit) {
              case 's': muteDuration = num * 1000; break;
              case 'm': muteDuration = num * 60000; break;
              case 'h': muteDuration = num * 3600000; break;
              case 'd': muteDuration = num * 86400000; break;
            }
          }
        }

        try {
          await member.timeout(muteDuration, reason);
          
          const caseId = uuidv4();
          interaction.reply({ 
            embeds: [
              createEmbed(
                '🟠 User Muted',
                `${user.tag} has been muted for ${formatTime(muteDuration)}.`,
                COLORS.WARNING,
                [
                  { name: 'Case ID', value: caseId },
                  { name: 'Reason', value: reason },
                  { name: 'Duration', value: formatTime(muteDuration) }
                ],
                { text: `Moderator: ${interaction.user.tag}`, iconURL: interaction.user.displayAvatarURL() }
              )
            ]
          });

          try {
            await user.send({
              embeds: [
                createEmbed(
                  '🔇 You have been muted',
                  `You have been muted in **${interaction.guild.name}** for ${formatTime(muteDuration)}.`,
                  COLORS.WARNING,
                  [
                    { name: 'Reason', value: reason },
                    { name: 'Duration', value: formatTime(muteDuration) }
                  ],
                  { text: `Server: ${interaction.guild.name}`, iconURL: interaction.guild.iconURL() }
                )
              ]
            });
          } catch (err) {
            console.log(`Could not send DM to ${user.tag}`);
          }
        } catch (err) {
          interaction.reply({ embeds: [errorEmbed(`Failed to mute ${user.tag}. I might not have the required permissions.`)] });
        }
      } else if (interaction.commandName === 'unmute') {
        const user = interaction.options.getUser('user');

        if (!interaction.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Moderate Members` permission to use this command.')], ephemeral: true });
        }

        const member = await interaction.guild.members.fetch(user.id);
        if (!member) return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], ephemeral: true });

        if (!member.isCommunicationDisabled()) {
          return interaction.reply({ embeds: [errorEmbed(`${user.tag} is not muted.`)] });
        }

        try {
          await member.timeout(null);
          interaction.reply({ embeds: [successEmbed(`${user.tag} has been unmuted.`)] });
        } catch (err) {
          interaction.reply({ embeds: [errorEmbed(`Failed to unmute ${user.tag}. I might not have the required permissions.`)] });
        }
      } else if (interaction.commandName === 'rps') {
        const targetUser = interaction.options.getUser('user');
        
        if (targetUser) {
          // Multiplayer RPS
          const embed = createEmbed(
            '🎮 Rock Paper Scissors Challenge',
            `${targetUser}, ${interaction.user} has challenged you to a game of Rock Paper Scissors!`,
            COLORS.DEFAULT,
            [],
            { text: 'You have 30 seconds to accept' }
          );

          const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rps_accept')
              .setLabel('Accept Challenge')
              .setStyle(ButtonStyle.Success),
            new ButtonBuilder()
              .setCustomId('rps_decline')
              .setLabel('Decline')
              .setStyle(ButtonStyle.Danger)
          );

          const challengeMsg = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });

          const filter = i => (i.user.id === targetUser.id) && (i.customId === 'rps_accept' || i.customId === 'rps_decline');
          const collector = challengeMsg.createMessageComponentCollector({ filter, time: 30000 });

          collector.on('collect', async i => {
            if (i.customId === 'rps_decline') {
              await i.update({ 
                embeds: [createEmbed('❌ Challenge Declined', `${targetUser} declined the Rock Paper Scissors challenge.`, COLORS.ERROR)],
                components: [] 
              });
              collector.stop();
              return;
            }

            // Accepted - start the game
            await i.update({ 
              embeds: [createEmbed('✅ Challenge Accepted', 'Select your move:', COLORS.SUCCESS)],
              components: [] 
            });

            const rpsButtons = new ActionRowBuilder().addComponents(
              new ButtonBuilder()
                .setCustomId('rps_rock')
                .setLabel('Rock')
                .setEmoji('🪨')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('rps_paper')
                .setLabel('Paper')
                .setEmoji('📄')
                .setStyle(ButtonStyle.Primary),
              new ButtonBuilder()
                .setCustomId('rps_scissors')
                .setLabel('Scissors')
                .setEmoji('✂️')
                .setStyle(ButtonStyle.Primary)
            );

            const gameMsg = await interaction.channel.send({
              content: `${interaction.user} vs ${targetUser}`,
              embeds: [createEmbed('🎮 Rock Paper Scissors', 'Select your move:', COLORS.DEFAULT)],
              components: [rpsButtons]
            });

            const choices = {};
            const gameFilter = i => (i.user.id === interaction.user.id || i.user.id === targetUser.id) && 
                                  (i.customId === 'rps_rock' || i.customId === 'rps_paper' || i.customId === 'rps_scissors');

            const gameCollector = gameMsg.createMessageComponentCollector({ filter: gameFilter, time: 30000 });

            gameCollector.on('collect', async i => {
              choices[i.user.id] = i.customId.split('_')[1];
              
              await i.reply({ 
                content: `${i.user} chose ${i.customId.split('_')[1]}`,
                ephemeral: true 
              });

              if (Object.keys(choices).length === 2) {
                gameCollector.stop();
              }
            });

            gameCollector.on('end', async () => {
              if (Object.keys(choices).length < 2) {
                await gameMsg.edit({ 
                  embeds: [createEmbed('❌ Game Cancelled', 'One or both players did not make a move in time.', COLORS.ERROR)],
                  components: [] 
                });
                return;
              }

              const p1Choice = choices[interaction.user.id];
              const p2Choice = choices[targetUser.id];
              let result;

              if (p1Choice === p2Choice) {
                result = 'It\'s a tie!';
              } else if (
                (p1Choice === 'rock' && p2Choice === 'scissors') ||
                (p1Choice === 'paper' && p2Choice === 'rock') ||
                (p1Choice === 'scissors' && p2Choice === 'paper')
              ) {
                result = `${interaction.user} wins!`;
                updateGameStats(interaction.user.id, 'rps', true);
                updateGameStats(targetUser.id, 'rps', false);
              } else {
                result = `${targetUser} wins!`;
                updateGameStats(targetUser.id, 'rps', true);
                updateGameStats(interaction.user.id, 'rps', false);
              }

              await gameMsg.edit({ 
                embeds: [
                  createEmbed(
                    '🎮 Rock Paper Scissors - Results',
                    `${interaction.user} chose ${p1Choice}\n${targetUser} chose ${p2Choice}\n\n**${result}**`,
                    COLORS.DEFAULT
                  )
                ],
                components: [] 
              });
            });
          });

          collector.on('end', async collected => {
            if (collected.size === 0) {
              await challengeMsg.edit({ 
                embeds: [createEmbed('⌛ Challenge Expired', `${targetUser} did not respond in time.`, COLORS.WARNING)],
                components: [] 
              });
            }
          });
        } else {
          // Single-player RPS
          const rpsButtons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('rps_rock')
              .setLabel('Rock')
              .setEmoji('🪨')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('rps_paper')
              .setLabel('Paper')
              .setEmoji('📄')
              .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
              .setCustomId('rps_scissors')
              .setLabel('Scissors')
              .setEmoji('✂️')
              .setStyle(ButtonStyle.Primary)
          );

          const gameMsg = await interaction.reply({
            embeds: [createEmbed('🎮 Rock Paper Scissors', 'Select your move:', COLORS.DEFAULT)],
            components: [rpsButtons],
            fetchReply: true
          });

          const choices = ['rock', 'paper', 'scissors'];
          const botChoice = choices[Math.floor(Math.random() * choices.length)];

          const filter = i => i.user.id === interaction.user.id && 
                             (i.customId === 'rps_rock' || i.customId === 'rps_paper' || i.customId === 'rps_scissors');

          const collector = gameMsg.createMessageComponentCollector({ filter, time: 30000 });

          collector.on('collect', async i => {
            const userChoice = i.customId.split('_')[1];
            let result;

            if (userChoice === botChoice) {
              result = 'It\'s a tie!';
            } else if (
              (userChoice === 'rock' && botChoice === 'scissors') ||
              (userChoice === 'paper' && botChoice === 'rock') ||
              (userChoice === 'scissors' && botChoice === 'paper')
            ) {
              result = 'You win!';
              updateGameStats(interaction.user.id, 'rps', true);
            } else {
              result = 'I win!';
              updateGameStats(interaction.user.id, 'rps', false);
            }

            await i.update({
              embeds: [
                createEmbed(
                  '🎮 Rock Paper Scissors - Results',
                  `You chose ${userChoice}\nI chose ${botChoice}\n\n**${result}**`,
                  COLORS.DEFAULT
                )
              ],
              components: []
            });
          });

          collector.on('end', async collected => {
            if (collected.size === 0) {
              await gameMsg.edit({
                embeds: [createEmbed('⌛ Game Expired', 'You did not make a move in time.', COLORS.WARNING)],
                components: []
              });
            }
          });
        }
      } else if (interaction.commandName === 'guess') {
        const number = Math.floor(Math.random() * 100) + 1;
        let attempts = 0;
        const maxAttempts = 5;

        const embed = createEmbed(
          '🔢 Guess the Number',
          `I'm thinking of a number between 1 and 100. You have ${maxAttempts} attempts to guess it!`,
          COLORS.DEFAULT,
          [],
          { text: 'Type your guess in chat' }
        );

        const gameMsg = await interaction.reply({ embeds: [embed], fetchReply: true });

        const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
        const collector = interaction.channel.createMessageCollector({ filter, time: 60000 });

        collector.on('collect', async m => {
          attempts++;
          const guess = parseInt(m.content);

          if (guess === number) {
            updateGameStats(interaction.user.id, 'guess', true);
            await gameMsg.edit({
              embeds: [
                createEmbed(
                  '🎉 You Win!',
                  `You guessed the correct number (${number}) in ${attempts} attempts!`,
                  COLORS.SUCCESS
                )
              ]
            });
            collector.stop();
            return;
          }

          if (attempts >= maxAttempts) {
            updateGameStats(interaction.user.id, 'guess', false);
            await gameMsg.edit({
              embeds: [
                createEmbed(
                  '❌ Game Over',
                  `You've used all ${maxAttempts} attempts. The number was ${number}.`,
                  COLORS.ERROR
                )
              ]
            });
            collector.stop();
            return;
          }

          const hint = guess < number ? 'higher' : 'lower';
          await gameMsg.edit({
            embeds: [
              createEmbed(
                '🔢 Guess the Number',
                `Your guess (${guess}) is too ${hint}. You have ${maxAttempts - attempts} attempts left.`,
                COLORS.DEFAULT
              )
            ]
          });
        });

        collector.on('end', async () => {
          await gameMsg.edit({
            embeds: [
              createEmbed(
                '⌛ Game Ended',
                'The game has ended.',
                COLORS.WARNING
              )
            ]
          });
        });
      } else if (interaction.commandName === 'math') {
        const operations = ['+', '-', '*', '/'];
        const operation = operations[Math.floor(Math.random() * operations.length)];
        let num1, num2, answer;

        switch (operation) {
          case '+':
            num1 = Math.floor(Math.random() * 50) + 1;
            num2 = Math.floor(Math.random() * 50) + 1;
            answer = num1 + num2;
            break;
          case '-':
            num1 = Math.floor(Math.random() * 50) + 1;
            num2 = Math.floor(Math.random() * num1) + 1;
            answer = num1 - num2;
            break;
          case '*':
            num1 = Math.floor(Math.random() * 12) + 1;
            num2 = Math.floor(Math.random() * 12) + 1;
            answer = num1 * num2;
            break;
          case '/':
            num2 = Math.floor(Math.random() * 10) + 1;
            answer = Math.floor(Math.random() * 10) + 1;
            num1 = num2 * answer;
            break;
        }

        const embed = createEmbed(
          '🧮 Math Challenge',
          `Solve the following problem:\n\n**${num1} ${operation} ${num2} = ?**`,
          COLORS.DEFAULT,
          [],
          { text: 'You have 15 seconds to answer' }
        );

        const gameMsg = await interaction.reply({ embeds: [embed], fetchReply: true });

        const filter = m => m.author.id === interaction.user.id && !isNaN(m.content);
        const collector = interaction.channel.createMessageCollector({ filter, time: 15000 });

        collector.on('collect', async m => {
          const guess = parseInt(m.content);

          if (guess === answer) {
            updateGameStats(interaction.user.id, 'math', true);
            await gameMsg.edit({
              embeds: [
                createEmbed(
                  '✅ Correct!',
                  `You solved the problem: ${num1} ${operation} ${num2} = ${answer}`,
                  COLORS.SUCCESS
                )
              ]
            });
          } else {
            updateGameStats(interaction.user.id, 'math', false);
            await gameMsg.edit({
              embeds: [
                createEmbed(
                  '❌ Incorrect',
                  `The correct answer was: ${num1} ${operation} ${num2} = ${answer}`,
                  COLORS.ERROR
                )
              ]
            });
          }
          collector.stop();
        });

        collector.on('end', async () => {
          await gameMsg.edit({
            embeds: [
              createEmbed(
                '⌛ Time\'s Up',
                `The correct answer was: ${num1} ${operation} ${num2} = ${answer}`,
                COLORS.WARNING
              )
            ]
          });
        });
      } else if (interaction.commandName === 'type') {
        const sentences = [
          "The quick brown fox jumps over the lazy dog.",
          "Pack my box with five dozen liquor jugs.",
          "How vexingly quick daft zebras jump!",
          "Bright vixens jump; dozy fowl quack.",
          "Sphinx of black quartz, judge my vow."
        ];

        const sentence = sentences[Math.floor(Math.random() * sentences.length)];
        const startTime = Date.now();

        const embed = createEmbed(
          '⌨️ Typing Test',
          `Type the following sentence as fast as you can:\n\n\`\`\`${sentence}\`\`\``,
          COLORS.DEFAULT,
          [],
          { text: 'You have 30 seconds to complete' }
        );

        const gameMsg = await interaction.reply({ embeds: [embed], fetchReply: true });

        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, time: 30000 });

        collector.on('collect', async m => {
          if (m.content === sentence) {
            const endTime = Date.now();
            const timeTaken = (endTime - startTime) / 1000;
            const wpm = Math.round((sentence.split(' ').length / timeTaken) * 60);

            updateGameStats(interaction.user.id, 'type', true, timeTaken);
            await gameMsg.edit({
              embeds: [
                createEmbed(
                  '✅ Perfect!',
                  `You typed the sentence correctly in ${timeTaken.toFixed(2)} seconds (${wpm} WPM).`,
                  COLORS.SUCCESS
                )
              ]
            });
          } else {
            updateGameStats(interaction.user.id, 'type', false);
            await gameMsg.edit({
              embeds: [
                createEmbed(
                  '❌ Incorrect',
                  'That wasn\'t quite right. Try again!',
                  COLORS.ERROR
                )
              ]
            });
          }
          collector.stop();
        });

        collector.on('end', async () => {
          await gameMsg.edit({
            embeds: [
              createEmbed(
                '⌛ Time\'s Up',
                'The typing test has ended.',
                COLORS.WARNING
              )
            ]
          });
        });
      } else if (interaction.commandName === 'trivia') {
        // Sample trivia questions
        const questions = [
          {
            question: "What is the capital of France?",
            options: ["London", "Paris", "Berlin", "Madrid"],
            answer: 1
          },
          {
            question: "Which planet is known as the Red Planet?",
            options: ["Venus", "Mars", "Jupiter", "Saturn"],
            answer: 1
          },
          {
            question: "Who painted the Mona Lisa?",
            options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
            answer: 2
          },
          {
            question: "What is the largest mammal?",
            options: ["Elephant", "Blue Whale", "Giraffe", "Polar Bear"],
            answer: 1
          },
          {
            question: "Which language has the most native speakers?",
            options: ["English", "Spanish", "Hindi", "Mandarin Chinese"],
            answer: 3
          }
        ];

        const question = questions[Math.floor(Math.random() * questions.length)];
        const letters = ['A', 'B', 'C', 'D'];

        const embed = createEmbed(
          '❓ Trivia Question',
          question.question,
          COLORS.DEFAULT,
          question.options.map((opt, i) => ({
            name: `${letters[i]}`,
            value: opt,
            inline: true
          })),
          { text: 'You have 15 seconds to answer' }
        );

        const buttons = new ActionRowBuilder().addComponents(
          ...question.options.map((_, i) => 
            new ButtonBuilder()
              .setCustomId(`trivia_${i}`)
              .setLabel(letters[i])
              .setStyle(ButtonStyle.Primary)
          )
        );

        const gameMsg = await interaction.reply({ embeds: [embed], components: [buttons], fetchReply: true });

        const filter = i => i.user.id === interaction.user.id && i.customId.startsWith('trivia_');
        const collector = gameMsg.createMessageComponentCollector({ filter, time: 15000 });

        collector.on('collect', async i => {
          const selected = parseInt(i.customId.split('_')[1]);
          
          if (selected === question.answer) {
            updateGameStats(interaction.user.id, 'trivia', true);
            await i.update({
              embeds: [
                createEmbed(
                  '✅ Correct!',
                  `You answered: **${letters[selected]} - ${question.options[selected]}**\n\nThat's the right answer!`,
                  COLORS.SUCCESS
                )
              ],
              components: []
            });
          } else {
            updateGameStats(interaction.user.id, 'trivia', false);
            await i.update({
              embeds: [
                createEmbed(
                  '❌ Incorrect',
                  `You answered: **${letters[selected]} - ${question.options[selected]}**\n\nThe correct answer was: **${letters[question.answer]} - ${question.options[question.answer]}**`,
                  COLORS.ERROR
                )
              ],
              components: []
            });
          }
        });

        collector.on('end', async () => {
          await gameMsg.edit({
            components: []
          });
        });
      } else if (interaction.commandName === 'top') {
        const game = interaction.options.getString('game')?.toLowerCase();
        const validGames = ['rps', 'guess', 'math', 'type', 'trivia'];
        
        if (game && !validGames.includes(game)) {
          return interaction.reply({ 
            embeds: [errorEmbed(`Invalid game. Valid games: ${validGames.join(', ')}`)],
            ephemeral: true
          });
        }

        const gamesData = getData('games');
        if (!gamesData[interaction.guild.id]) {
          return interaction.reply({ 
            embeds: [infoEmbed('No game stats available yet. Play some games first!')],
            ephemeral: true
          });
        }

        if (game) {
          // Leaderboard for specific game
          if (!gamesData[interaction.guild.id][game]) {
            return interaction.reply({ 
              embeds: [infoEmbed(`No stats available for ${game} yet. Play some games first!`)],
              ephemeral: true
            });
          }

          const players = Object.entries(gamesData[interaction.guild.id][game])
            .map(([id, stats]) => ({
              id,
              wins: stats.wins || 0,
              losses: stats.losses || 0,
              ratio: stats.wins / (stats.wins + stats.losses) || 0
            }))
            .sort((a, b) => b.wins - a.wins || b.ratio - a.ratio)
            .slice(0, 10);

          const fields = await Promise.all(players.map(async (player, i) => {
            const user = await client.users.fetch(player.id).catch(() => null);
            return {
              name: `${i + 1}. ${user?.tag || 'Unknown User'}`,
              value: `Wins: ${player.wins} | Losses: ${player.losses} | Ratio: ${(player.ratio * 100).toFixed(1)}%`,
              inline: false
            };
          }));

          interaction.reply({
            embeds: [
              createEmbed(
                `🏆 ${game.toUpperCase()} Leaderboard`,
                `Top players for ${game}`,
                COLORS.DEFAULT,
                fields,
                { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
              )
            ]
          });
        } else {
          // General leaderboard
          const gameFields = validGames.map(game => {
            if (!gamesData[interaction.guild.id][game]) {
              return {
                name: game.toUpperCase(),
                value: 'No data yet',
                inline: true
              };
            }

            const topPlayer = Object.entries(gamesData[interaction.guild.id][game])
              .map(([id, stats]) => ({
                id,
                wins: stats.wins || 0
              }))
              .sort((a, b) => b.wins - a.wins)[0];

            return {
              name: game.toUpperCase(),
              value: topPlayer ? `Top: <@${topPlayer.id}> (${topPlayer.wins} wins)` : 'No data yet',
              inline: true
            };
          });

          interaction.reply({
            embeds: [
              createEmbed(
                '🏆 Game Leaderboards',
                'Top players for each game',
                COLORS.DEFAULT,
                gameFields,
                { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
              )
            ]
          });
        }
      } else if (interaction.commandName === 'cf') {
        const side = interaction.options.getString('side');
        const amount = interaction.options.getInteger('amount');

        if (amount <= 0) {
          return interaction.reply({ embeds: [errorEmbed('You must bet a positive amount.')], ephemeral: true });
        }

        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        if (economyData[interaction.user.id].wallet < amount) {
          return interaction.reply({ embeds: [errorEmbed('You don\'t have enough money in your wallet.')], ephemeral: true });
        }

        const result = Math.random() < 0.5 ? 'heads' : 'tails';
        const win = side === result;

        if (win) {
          economyData[interaction.user.id].wallet += amount;
          interaction.reply({
            embeds: [
              createEmbed(
                '🎉 You Won!',
                `The coin landed on **${result}**! You won ${amount} coins.`,
                COLORS.SUCCESS,
                [
                  { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins` }
                ]
              )
            ]
          });
        } else {
          economyData[interaction.user.id].wallet -= amount;
          interaction.reply({
            embeds: [
              createEmbed(
                '❌ You Lost',
                `The coin landed on **${result}**. You lost ${amount} coins.`,
                COLORS.ERROR,
                [
                  { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins` }
                ]
              )
            ]
          });
        }

        saveData('economy', economyData);
      } else if (interaction.commandName === 'cash') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
          saveData('economy', economyData);
        }

        interaction.reply({
          embeds: [
            createEmbed(
              '💰 Your Balance',
              `Here are your current finances:`,
              COLORS.DEFAULT,
              [
                { name: 'Wallet', value: `${economyData[interaction.user.id].wallet} coins`, inline: true },
                { name: 'Bank', value: `${economyData[interaction.user.id].bank} coins`, inline: true },
                { name: 'Total', value: `${economyData[interaction.user.id].wallet + economyData[interaction.user.id].bank} coins`, inline: true }
              ],
              { text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }
            )
          ]
        });
      } else if (interaction.commandName === 'daily') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        const lastDaily = await db.get(`daily_${interaction.user.id}`);
        const now = Date.now();
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours

        if (lastDaily && now - lastDaily < cooldown) {
          const remaining = formatTime(cooldown - (now - lastDaily));
          return interaction.reply({ 
            embeds: [errorEmbed(`You've already claimed your daily reward. Come back in ${remaining}.`)],
            ephemeral: true
          });
        }

        const reward = 500 + Math.floor(Math.random() * 500);
        economyData[interaction.user.id].wallet += reward;
        await db.set(`daily_${interaction.user.id}`, now);
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '🎁 Daily Reward',
              `You claimed your daily reward of ${reward} coins!`,
              COLORS.SUCCESS,
              [
                { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins` }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'weekly') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        const lastWeekly = await db.get(`weekly_${interaction.user.id}`);
        const now = Date.now();
        const cooldown = 7 * 24 * 60 * 60 * 1000; // 7 days

        if (lastWeekly && now - lastWeekly < cooldown) {
          const remaining = formatTime(cooldown - (now - lastWeekly));
          return interaction.reply({ 
            embeds: [errorEmbed(`You've already claimed your weekly reward. Come back in ${remaining}.`)],
            ephemeral: true
          });
        }

        const reward = 3000 + Math.floor(Math.random() * 2000);
        economyData[interaction.user.id].wallet += reward;
        await db.set(`weekly_${interaction.user.id}`, now);
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '🎁 Weekly Reward',
              `You claimed your weekly reward of ${reward} coins!`,
              COLORS.SUCCESS,
              [
                { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins` }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'hunt') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        const lastHunt = await db.get(`hunt_${interaction.user.id}`);
        const now = Date.now();
        const cooldown = 5 * 60 * 1000; // 5 minutes

        if (lastHunt && now - lastHunt < cooldown) {
          const remaining = formatTime(cooldown - (now - lastHunt));
          return interaction.reply({ 
            embeds: [errorEmbed(`You're too tired to hunt right now. Try again in ${remaining}.`)],
            ephemeral: true
          });
        }

        await db.set(`hunt_${interaction.user.id}`, now);

        const outcomes = [
          { text: 'You found a rare item!', reward: 1000, item: 'Rare Trophy' },
          { text: 'You caught a big fish!', reward: 500, item: 'Big Fish' },
          { text: 'You found some coins in the bushes.', reward: 200, item: null },
          { text: 'You scared away all the animals and found nothing.', reward: 0, item: null },
          { text: 'You tripped and lost some coins.', reward: -100, item: null }
        ];

        const outcome = outcomes[Math.floor(Math.random() * outcomes.length)];
        economyData[interaction.user.id].wallet += outcome.reward;

        if (outcome.item) {
          if (!economyData[interaction.user.id].inventory) economyData[interaction.user.id].inventory = [];
          economyData[interaction.user.id].inventory.push(outcome.item);
        }

        saveData('economy', economyData);

        const embed = createEmbed(
          '🏹 Hunting Results',
          outcome.text,
          outcome.reward > 0 ? COLORS.SUCCESS : outcome.reward < 0 ? COLORS.ERROR : COLORS.DEFAULT
        );

        if (outcome.reward !== 0) {
          embed.addFields({ name: 'Coins', value: `${outcome.reward > 0 ? '+' : ''}${outcome.reward}`, inline: true });
        }

        if (outcome.item) {
          embed.addFields({ name: 'Item Found', value: outcome.item, inline: true });
        }

        interaction.reply({ embeds: [embed] });
      } else if (interaction.commandName === 'battle') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        const lastBattle = await db.get(`battle_${interaction.user.id}`);
        const now = Date.now();
        const cooldown = 10 * 60 * 1000; // 10 minutes

        if (lastBattle && now - lastBattle < cooldown) {
          const remaining = formatTime(cooldown - (now - lastBattle));
          return interaction.reply({ 
            embeds: [errorEmbed(`You need to recover from your last battle. Try again in ${remaining}.`)],
            ephemeral: true
          });
        }

        await db.set(`battle_${interaction.user.id}`, now);

        const win = Math.random() < 0.6; // 60% chance to win
        const reward = win ? 800 + Math.floor(Math.random() * 700) : -200;

        economyData[interaction.user.id].wallet += reward;
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              win ? '⚔️ Battle Victory' : '💀 Battle Defeat',
              win 
                ? `You defeated your opponent and won ${reward} coins!` 
                : `You were defeated in battle and lost ${Math.abs(reward)} coins.`,
              win ? COLORS.SUCCESS : COLORS.ERROR,
              [
                { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins` }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'loot') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        const lastLoot = await db.get(`loot_${interaction.user.id}`);
        const now = Date.now();
        const cooldown = 2 * 60 * 1000; // 2 minutes

        if (lastLoot && now - lastLoot < cooldown) {
          const remaining = formatTime(cooldown - (now - lastLoot));
          return interaction.reply({ 
            embeds: [errorEmbed(`You need to wait before searching for more loot. Try again in ${remaining}.`)],
            ephemeral: true
          });
        }

        await db.set(`loot_${interaction.user.id}`, now);

        const items = [
          { name: 'Common Gem', value: 100, rarity: 'Common' },
          { name: 'Uncommon Jewel', value: 250, rarity: 'Uncommon' },
          { name: 'Rare Artifact', value: 500, rarity: 'Rare' },
          { name: 'Epic Treasure', value: 1000, rarity: 'Epic' },
          { name: 'Legendary Relic', value: 2500, rarity: 'Legendary' }
        ];

        // Weighted random based on rarity
        const weights = [0.5, 0.3, 0.15, 0.04, 0.01];
        let random = Math.random();
        let selectedIndex = 0;

        for (let i = 0; i < weights.length; i++) {
          random -= weights[i];
          if (random <= 0) {
            selectedIndex = i;
            break;
          }
        }

        const loot = items[selectedIndex];
        if (!economyData[interaction.user.id].inventory) economyData[interaction.user.id].inventory = [];
        economyData[interaction.user.id].inventory.push(loot.name);
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '💎 Loot Found',
              `You found a **${loot.rarity} ${loot.name}** worth ${loot.value} coins!`,
              COLORS.SUCCESS,
              [
                { name: 'Rarity', value: loot.rarity, inline: true },
                { name: 'Value', value: `${loot.value} coins`, inline: true }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'deposit') {
        const amount = interaction.options.getInteger('amount');
        if (amount <= 0) {
          return interaction.reply({ embeds: [errorEmbed('You must deposit a positive amount.')], ephemeral: true });
        }

        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        if (economyData[interaction.user.id].wallet < amount) {
          return interaction.reply({ embeds: [errorEmbed('You don\'t have enough money in your wallet.')], ephemeral: true });
        }

        economyData[interaction.user.id].wallet -= amount;
        economyData[interaction.user.id].bank += amount;
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '🏦 Deposit Successful',
              `You deposited ${amount} coins to your bank.`,
              COLORS.SUCCESS,
              [
                { name: 'Wallet', value: `${economyData[interaction.user.id].wallet} coins`, inline: true },
                { name: 'Bank', value: `${economyData[interaction.user.id].bank} coins`, inline: true }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'withdraw') {
        const amount = interaction.options.getInteger('amount');
        if (amount <= 0) {
          return interaction.reply({ embeds: [errorEmbed('You must withdraw a positive amount.')], ephemeral: true });
        }

        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        if (economyData[interaction.user.id].bank < amount) {
          return interaction.reply({ embeds: [errorEmbed('You don\'t have enough money in your bank.')], ephemeral: true });
        }

        economyData[interaction.user.id].bank -= amount;
        economyData[interaction.user.id].wallet += amount;
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '🏦 Withdrawal Successful',
              `You withdrew ${amount} coins from your bank.`,
              COLORS.SUCCESS,
              [
                { name: 'Wallet', value: `${economyData[interaction.user.id].wallet} coins`, inline: true },
                { name: 'Bank', value: `${economyData[interaction.user.id].bank} coins`, inline: true }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'beg') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        const lastBeg = await db.get(`beg_${interaction.user.id}`);
        const now = Date.now();
        const cooldown = 60 * 1000; // 1 minute

        if (lastBeg && now - lastBeg < cooldown) {
          const remaining = formatTime(cooldown - (now - lastBeg));
          return interaction.reply({ 
            embeds: [errorEmbed(`You've begged too much recently. Try again in ${remaining}.`)],
            ephemeral: true
          });
        }

        await db.set(`beg_${interaction.user.id}`, now);

        const reward = Math.floor(Math.random() * 50) + 1;
        economyData[interaction.user.id].wallet += reward;
        saveData('economy', economyData);

        const responses = [
          `A kind stranger gave you ${reward} coins.`,
          `You begged on the street and earned ${reward} coins.`,
          `Someone took pity on you and gave you ${reward} coins.`,
          `You found ${reward} coins while begging.`
        ];

        interaction.reply({
          embeds: [
            createEmbed(
              '🙏 Begging Results',
              responses[Math.floor(Math.random() * responses.length)],
              COLORS.SUCCESS,
              [
                { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins` }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'give') {
        const user = interaction.options.getUser('user');
        const amount = interaction.options.getInteger('amount');

        if (user.id === interaction.user.id) {
          return interaction.reply({ embeds: [errorEmbed('You can\'t give money to yourself.')], ephemeral: true });
        }

        if (amount <= 0) {
          return interaction.reply({ embeds: [errorEmbed('You must give a positive amount.')], ephemeral: true });
        }

        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        if (!economyData[user.id]) {
          economyData[user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        if (economyData[interaction.user.id].wallet < amount) {
          return interaction.reply({ embeds: [errorEmbed('You don\'t have enough money in your wallet.')], ephemeral: true });
        }

        economyData[interaction.user.id].wallet -= amount;
        economyData[user.id].wallet += amount;
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '💰 Gift Sent',
              `You gave ${amount} coins to ${user.tag}.`,
              COLORS.SUCCESS,
              [
                { name: 'Your Wallet', value: `${economyData[interaction.user.id].wallet} coins`, inline: true },
                { name: `${user.username}'s Wallet`, value: `${economyData[user.id].wallet} coins`, inline: true }
              ]
            )
          ]
        });

        try {
          await user.send({
            embeds: [
              createEmbed(
                '🎁 You Received a Gift',
                `${interaction.user.tag} gave you ${amount} coins in ${interaction.guild.name}.`,
                COLORS.SUCCESS,
                [
                  { name: 'New Balance', value: `${economyData[user.id].wallet} coins` }
                ]
              )
            ]
          });
        } catch (err) {
          console.log(`Could not send DM to ${user.tag}`);
        }
      } else if (interaction.commandName === 'inventory') {
        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
          saveData('economy', economyData);
        }

        if (!economyData[interaction.user.id].inventory || economyData[interaction.user.id].inventory.length === 0) {
          return interaction.reply({ embeds: [infoEmbed('Your inventory is empty.')] });
        }

        // Count items
        const itemCounts = {};
        economyData[interaction.user.id].inventory.forEach(item => {
          itemCounts[item] = (itemCounts[item] || 0) + 1;
        });

        const fields = Object.entries(itemCounts).map(([item, count]) => ({
          name: item,
          value: `Quantity: ${count}`,
          inline: true
        }));

        interaction.reply({
          embeds: [
            createEmbed(
              '🎒 Your Inventory',
              `You have ${economyData[interaction.user.id].inventory.length} item(s) in total.`,
              COLORS.DEFAULT,
              fields,
              { text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }
            )
          ]
        });
      } else if (interaction.commandName === 'shop') {
        const shopItems = [
          { name: 'Fishing Rod', price: 500, description: 'Increases hunting rewards' },
          { name: 'Lucky Charm', price: 1000, description: 'Increases chance of rare loot' },
          { name: 'Treasure Map', price: 2000, description: 'Guarantees rare loot next time' },
          { name: 'Golden Ticket', price: 5000, description: 'Special item with unknown effects' }
        ];

        const fields = shopItems.map(item => ({
          name: `${item.name} - ${item.price} coins`,
          value: item.description,
          inline: false
        }));

        interaction.reply({
          embeds: [
            createEmbed(
              '🛒 Shop',
              'Available items to purchase:',
              COLORS.DEFAULT,
              fields,
              { text: 'Use !buy <item> to purchase' }
            )
          ]
        });
      } else if (interaction.commandName === 'buy') {
        const itemName = interaction.options.getString('item');

        const shopItems = [
          { name: 'Fishing Rod', price: 500 },
          { name: 'Lucky Charm', price: 1000 },
          { name: 'Treasure Map', price: 2000 },
          { name: 'Golden Ticket', price: 5000 }
        ];

        const item = shopItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
        if (!item) {
          return interaction.reply({ embeds: [errorEmbed('That item is not available in the shop.')], ephemeral: true });
        }

        const economyData = getData('economy');
        if (!economyData[interaction.user.id]) {
          economyData[interaction.user.id] = { wallet: 100, bank: 0, inventory: [] };
        }

        if (economyData[interaction.user.id].wallet < item.price) {
          return interaction.reply({ embeds: [errorEmbed(`You don't have enough coins to buy ${item.name}.`)], ephemeral: true });
        }

        economyData[interaction.user.id].wallet -= item.price;
        if (!economyData[interaction.user.id].inventory) economyData[interaction.user.id].inventory = [];
        economyData[interaction.user.id].inventory.push(item.name);
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '🛒 Purchase Successful',
              `You bought a ${item.name} for ${item.price} coins.`,
              COLORS.SUCCESS,
              [
                { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins`, inline: true },
                { name: 'Items Owned', value: economyData[interaction.user.id].inventory.length.toString(), inline: true }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'sell') {
        const itemName = interaction.options.getString('item');

        const economyData = getData('economy');
        if (!economyData[interaction.user.id] || !economyData[interaction.user.id].inventory || economyData[interaction.user.id].inventory.length === 0) {
          return interaction.reply({ embeds: [errorEmbed('Your inventory is empty.')], ephemeral: true });
        }

        const itemIndex = economyData[interaction.user.id].inventory.findIndex(
          item => item.toLowerCase() === itemName.toLowerCase()
        );

        if (itemIndex === -1) {
          return interaction.reply({ embeds: [errorEmbed('You don\'t have that item in your inventory.')], ephemeral: true });
        }

        const item = economyData[interaction.user.id].inventory[itemIndex];
        const sellPrices = {
          'Fishing Rod': 250,
          'Lucky Charm': 500,
          'Treasure Map': 1000,
          'Golden Ticket': 2500
        };

        const sellPrice = sellPrices[item] || 100;
        economyData[interaction.user.id].wallet += sellPrice;
        economyData[interaction.user.id].inventory.splice(itemIndex, 1);
        saveData('economy', economyData);

        interaction.reply({
          embeds: [
            createEmbed(
              '💰 Item Sold',
              `You sold ${item} for ${sellPrice} coins.`,
              COLORS.SUCCESS,
              [
                { name: 'New Balance', value: `${economyData[interaction.user.id].wallet} coins`, inline: true },
                { name: 'Items Remaining', value: economyData[interaction.user.id].inventory.length.toString(), inline: true }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'dm') {
        const role = interaction.options.getRole('role');
        const dmMessage = interaction.options.getString('message');

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ embeds: [errorEmbed('You need administrator permissions to use this command.')], ephemeral: true });
        }

        const members = await interaction.guild.members.fetch();
        const roleMembers = members.filter(m => m.roles.cache.has(role.id));

        if (roleMembers.size === 0) {
          return interaction.reply({ embeds: [errorEmbed('That role has no members.')], ephemeral: true });
        }

        const sentTo = [];
        const failedToSend = [];

        for (const member of roleMembers.values()) {
          try {
            await member.send({
              embeds: [
                createEmbed(
                  `Message from ${interaction.guild.name}`,
                  dmMessage,
                  COLORS.DEFAULT,
                  [],
                  { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
                )
              ]
            });
            sentTo.push(member.user.tag);
          } catch (err) {
            failedToSend.push(member.user.tag);
          }
        }

        interaction.reply({
          embeds: [
            createEmbed(
              '📩 DM Results',
              `Successfully sent to ${sentTo.length} members. ${failedToSend.length} members couldn't be DMed.`,
              sentTo.length > 0 ? COLORS.SUCCESS : COLORS.ERROR,
              [
                { name: 'Success', value: sentTo.length > 0 ? sentTo.join('\n') : 'None', inline: true },
                { name: 'Failed', value: failedToSend.length > 0 ? failedToSend.join('\n') : 'None', inline: true }
              ]
            )
          ],
          ephemeral: true
        });
      } else if (interaction.commandName === 'embed') {
        const color = interaction.options.getString('color');
        const embedMessage = interaction.options.getString('message');

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Manage Messages` permission to use this command.')], ephemeral: true });
        }

        if (!color.match(/^#([0-9A-F]{3}){1,2}$/i)) {
          return interaction.reply({ embeds: [errorEmbed('Please provide a valid hex color (e.g., #FF0000).')], ephemeral: true });
        }

        interaction.channel.send({
          embeds: [
            createEmbed(
              '',
              embedMessage,
              color,
              [],
              { text: interaction.user.tag, iconURL: interaction.user.displayAvatarURL() }
            )
          ]
        });
        interaction.reply({ embeds: [successEmbed('Embed sent successfully!')], ephemeral: true });
      } else if (interaction.commandName === 'msg') {
        const channel = interaction.options.getChannel('channel');
        const msgContent = interaction.options.getString('message');

        if (!interaction.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
          return interaction.reply({ embeds: [errorEmbed('You need the `Manage Messages` permission to use this command.')], ephemeral: true });
        }

        try {
          await channel.send(msgContent);
          interaction.reply({ embeds: [successEmbed(`Message sent to ${channel}.`)], ephemeral: true });
        } catch (err) {
          interaction.reply({ embeds: [errorEmbed(`Failed to send message to ${channel}. I might not have permissions.`)], ephemeral: true });
        }
      } else if (interaction.commandName === 'userinfo') {
        const user = interaction.options.getUser('user') || interaction.user;
        const member = await interaction.guild.members.fetch(user.id).catch(() => null);

        if (!member) {
          return interaction.reply({ embeds: [errorEmbed('User not found in this server.')], ephemeral: true });
        }

        const roles = member.roles.cache
          .filter(role => role.id !== interaction.guild.id)
          .sort((a, b) => b.position - a.position)
          .map(role => role.toString());

        const fields = [
          { name: 'ID', value: user.id, inline: true },
          { name: 'Username', value: user.tag, inline: true },
          { name: 'Nickname', value: member.nickname || 'None', inline: true },
          { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
          { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>`, inline: true },
          { name: 'Joined Discord', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:f>`, inline: true },
          { name: `Roles (${roles.length})`, value: roles.length > 0 ? roles.join(' ') : 'None', inline: false }
        ];

        interaction.reply({
          embeds: [
            createEmbed(
              '👤 User Information',
              '',
              COLORS.DEFAULT,
              fields,
              { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
            ).setThumbnail(user.displayAvatarURL({ size: 512 }))
          ]
        });
      } else if (interaction.commandName === 'serverinfo') {
        const { guild } = interaction;
        const owner = await guild.fetchOwner();

        const fields = [
          { name: 'Owner', value: owner.user.tag, inline: true },
          { name: 'ID', value: guild.id, inline: true },
          { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:f>`, inline: true },
          { name: 'Members', value: guild.memberCount.toString(), inline: true },
          { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
          { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
          { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
          { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true },
          { name: 'Verification Level', value: guild.verificationLevel, inline: true }
        ];

        interaction.reply({
          embeds: [
            createEmbed(
              '🖥️ Server Information',
              '',
              COLORS.DEFAULT,
              fields,
              { text: guild.name, iconURL: guild.iconURL() }
            ).setThumbnail(guild.iconURL({ size: 512 }))
          ]
        });
      } else if (interaction.commandName === 'ping') {
        const msg = await interaction.reply({ embeds: [infoEmbed('Pinging...')], fetchReply: true });
        const latency = msg.createdTimestamp - interaction.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        interaction.editReply({
          embeds: [
            createEmbed(
              '🏓 Pong!',
              `Here are the latency stats:`,
              COLORS.DEFAULT,
              [
                { name: 'Bot Latency', value: `${latency}ms`, inline: true },
                { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
              ]
            )
          ]
        });
      } else if (interaction.commandName === 'prems') {
        const role = interaction.options.getRole('role');

        if (!interaction.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return interaction.reply({ embeds: [errorEmbed('You need administrator permissions to use this command.')], ephemeral: true });
        }

        await db.set(`premium_role_${interaction.guild.id}`, role.id);
        interaction.reply({ embeds: [successEmbed(`${role.name} now has access to premium commands.`)] });
      } else if (interaction.commandName === 'uptime') {
        const uptime = formatTime(client.uptime);
        interaction.reply({ embeds: [infoEmbed(`The bot has been online for ${uptime}.`)] });
      } else if (interaction.commandName === 'botstats') {
        const { heapUsed, heapTotal } = process.memoryUsage();
        const memoryUsage = `${(heapUsed / 1024 / 1024).toFixed(2)} MB / ${(heapTotal / 1024 / 1024).toFixed(2)} MB`;
        const cpuUsage = `${(process.cpuUsage().user / 1024 / 1024).toFixed(2)}%`;

        const fields = [
          { name: 'Servers', value: client.guilds.cache.size.toString(), inline: true },
          { name: 'Users', value: client.users.cache.size.toString(), inline: true },
          { name: 'Channels', value: client.channels.cache.size.toString(), inline: true },
          { name: 'Memory Usage', value: memoryUsage, inline: true },
          { name: 'CPU Usage', value: cpuUsage, inline: true },
          { name: 'Discord.js Version', value: require('discord.js').version, inline: true },
          { name: 'Node.js Version', value: process.version, inline: true },
          { name: 'Uptime', value: formatTime(client.uptime), inline: true }
        ];

        interaction.reply({
          embeds: [
            createEmbed(
              '🤖 Bot Statistics',
              '',
              COLORS.DEFAULT,
              fields,
              { text: client.user.tag, iconURL: client.user.displayAvatarURL() }
            )
          ]
        });
      } else if (interaction.commandName === 'play') {
        const query = interaction.options.getString('query');

        if (!interaction.member.voice.channel) {
          return interaction.reply({ embeds: [errorEmbed('You need to be in a voice channel to play music.')], ephemeral: true });
        }

        const queue = player.nodes.create(interaction.guild, {
          metadata: {
            channel: interaction.channel
          },
          leaveOnEmpty: true,
          leaveOnEmptyCooldown: 30000,
          leaveOnEnd: true,
          leaveOnEndCooldown: 30000,
          selfDeaf: true
        });

        try {
          if (!queue.connection) await queue.connect(interaction.member.voice.channel);
        } catch {
          queue.delete();
          return interaction.reply({ embeds: [errorEmbed('Could not join your voice channel.')], ephemeral: true });
        }

        const searchResult = await player.search(query, {
          requestedBy: interaction.user
        });

        if (!searchResult || !searchResult.tracks.length) {
          return interaction.reply({ embeds: [errorEmbed('No results found.')], ephemeral: true });
        }

        const embed = createEmbed(
          '🎵 Adding to Queue',
          searchResult.playlist 
            ? `Added **${searchResult.tracks.length}** tracks from ${searchResult.playlist.title} to the queue.`
            : `Added **${searchResult.tracks[0].title}** to the queue.`,
          COLORS.SUCCESS
        ).setThumbnail(searchResult.tracks[0].thumbnail);

        interaction.reply({ embeds: [embed] });

        searchResult.playlist ? queue.addTrack(searchResult.tracks) : queue.addTrack(searchResult.tracks[0]);

        if (!queue.isPlaying()) await queue.node.play();
      } else if (interaction.commandName === 'pause') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently playing.')], ephemeral: true });
        }

        queue.node.pause();
        interaction.reply({ embeds: [successEmbed('Paused the current song.')] });
      } else if (interaction.commandName === 'resume') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.node.isPaused()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently paused.')], ephemeral: true });
        }

        queue.node.resume();
        interaction.reply({ embeds: [successEmbed('Resumed the current song.')] });
      } else if (interaction.commandName === 'stop') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently playing.')], ephemeral: true });
        }

        queue.delete();
        interaction.reply({ embeds: [successEmbed('Stopped the music and cleared the queue.')] });
      } else if (interaction.commandName === 'skip') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently playing.')], ephemeral: true });
        }

        const currentTrack = queue.currentTrack;
        queue.node.skip();
        interaction.reply({ embeds: [successEmbed(`Skipped **${currentTrack.title}**.`)] });
      } else if (interaction.commandName === 'queue') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.tracks.length) {
          return interaction.reply({ embeds: [errorEmbed('The queue is empty.')], ephemeral: true });
        }

        const tracks = queue.tracks.map((track, i) => `**${i + 1}.** ${track.title} (${track.duration})`);
        const currentTrack = queue.currentTrack;

        interaction.reply({
          embeds: [
            createEmbed(
              '🎶 Queue',
              `**Now Playing:** ${currentTrack.title} (${currentTrack.duration})\n\n**Up Next:**\n${tracks.slice(0, 10).join('\n')}`,
              COLORS.DEFAULT
            ).setThumbnail(currentTrack.thumbnail)
          ]
        });
      } else if (interaction.commandName === 'np') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently playing.')], ephemeral: true });
        }

        const track = queue.currentTrack;

        interaction.reply({
          embeds: [
            createEmbed(
              '🎵 Now Playing',
              `**Title:** ${track.title}\n**Duration:** ${track.duration}\n**Requested By:** ${track.requestedBy}`,
              COLORS.DEFAULT
            ).setThumbnail(track.thumbnail)
          ]
        });
      } else if (interaction.commandName === 'volume') {
        const level = interaction.options.getInteger('level');
        if (level < 1 || level > 100) {
          return interaction.reply({ embeds: [errorEmbed('Please provide a volume level between 1 and 100.')], ephemeral: true });
        }

        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently playing.')], ephemeral: true });
        }

        queue.node.setVolume(level);
        interaction.reply({ embeds: [successEmbed(`Volume set to ${level}%.`)] });
      } else if (interaction.commandName === 'lyrics') {
        const song = interaction.options.getString('song') || (player.nodes.get(interaction.guild.id)?.currentTrack?.title);
        if (!song) return interaction.reply({ embeds: [errorEmbed('Please provide a song name or play a song first.')], ephemeral: true });

        try {
          const response = await fetch(`https://api.lyrics.ovh/v1/${encodeURIComponent(song)}`);
          const data = await response.json();

          if (data.error || !data.lyrics) {
            return interaction.reply({ embeds: [errorEmbed('No lyrics found for this song.')], ephemeral: true });
          }

          const lyrics = data.lyrics.length > 2000 
            ? `${data.lyrics.substring(0, 2000)}...` 
            : data.lyrics;

          interaction.reply({
            embeds: [
              createEmbed(
                `🎶 Lyrics for ${song}`,
                lyrics,
                COLORS.DEFAULT
              )
            ]
          });
        } catch (err) {
          interaction.reply({ embeds: [errorEmbed('Failed to fetch lyrics.')], ephemeral: true });
        }
      } else if (interaction.commandName === 'loop') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.isPlaying()) {
          return interaction.reply({ embeds: [errorEmbed('No music is currently playing.')], ephemeral: true });
        }

        queue.setRepeatMode(queue.repeatMode === 2 ? 0 : 2);
        interaction.reply({ 
          embeds: [successEmbed(`Loop mode ${queue.repeatMode === 2 ? 'enabled' : 'disabled'}.`)] 
        });
      } else if (interaction.commandName === 'shuffle') {
        const queue = player.nodes.get(interaction.guild.id);
        if (!queue || !queue.tracks.length) {
          return interaction.reply({ embeds: [errorEmbed('The queue is empty.')], ephemeral: true });
        }

        queue.tracks.shuffle();
        interaction.reply({ embeds: [successEmbed('Shuffled the queue.')] });
      } else if (interaction.commandName === 'phonk') {
        const phonkPlaylists = [
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmsW46rJyudVFlY6IYjFBIK',
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgkQ5i5U0QFGV1P6rkZq0YJv',
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmQpW9V2J7hQ7JX1YJ7Z0Yk'
        ];

        const query = phonkPlaylists[Math.floor(Math.random() * phonkPlaylists.length)];
        prefixCommands.get('play').execute(interaction, [query]);
      } else if (interaction.commandName === 'english') {
        const englishPlaylists = [
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgkQ5i5U0QFGV1P6rkZq0YJv',
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmsW46rJyudVFlY6IYjFBIK',
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmQpW9V2J7hQ7JX1YJ7Z0Yk'
        ];

        const query = englishPlaylists[Math.floor(Math.random() * englishPlaylists.length)];
        prefixCommands.get('play').execute(interaction, [query]);
      } else if (interaction.commandName === 'hind') {
        const hindiPlaylists = [
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgkQ5i5U0QFGV1P6rkZq0YJv',
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmsW46rJyudVFlY6IYjFBIK',
          'https://www.youtube.com/playlist?list=PLRBp0Fe2GpgmQpW9V2J7hQ7JX1YJ7Z0Yk'
        ];

        const query = hindiPlaylists[Math.floor(Math.random() * hindiPlaylists.length)];
        prefixCommands.get('play').execute(interaction, [query]);
      } else if (interaction.commandName === 'randomsong') {
        const randomSongs = [
          'Never Gonna Give You Up',
          'Bohemian Rhapsody',
          'Shape of You',
          'Blinding Lights',
          'Dance Monkey',
          'Uptown Funk',
          'Despacito',
          'Old Town Road',
          'Bad Guy',
          'Levitating'
        ];

        const query = randomSongs[Math.floor(Math.random() * randomSongs.length)];
        prefixCommands.get('play').execute(interaction, [query]);
      }
    } catch (error) {
      console.error(error);
      interaction.reply({ embeds: [errorEmbed('An error occurred while executing this command.')], ephemeral: true });
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'help_category') {
      const category = interaction.values[0];
      let fields = [];
      let title = '';
      let description = '';

      switch (category) {
        case 'ticket':
          title = '🎟️ Ticket System Commands';
          description = 'Manage support tickets with these commands.';
          fields = [
            { name: '`!ticket msg <message>`', value: 'Set the embed message for the ticket panel', inline: false },
            { name: '`!setoptions general:💬, support:🛠️`', value: 'Set dropdown options (label:emoji)', inline: false },
            { name: '`!setviewer @role`', value: 'Role that can view all open tickets', inline: false },
            { name: '`!setticketcategory <category_id>`', value: 'Set ticket\'s parent category', inline: false },
            { name: '`!deployticketpanel`', value: 'Deploy panel with dropdown + emoji options', inline: false }
          ];
          break;
        case 'application':
          title = '📋 Application System Commands';
          description = 'Manage role applications with these commands.';
          fields = [
            { name: '`!app msg <message>`', value: 'Set the embed message for application panel', inline: false },
            { name: '`!addoptions RoleName:🛡️`', value: 'Add role buttons with emoji for applicants', inline: false },
            { name: '`!setappchannel <channel_id>`', value: 'Set the application submission channel', inline: false },
            { name: '`!deployapp`', value: 'Deploy application panel with role buttons', inline: false },
            { name: '`!ques1`, `!ques2`, ..., `!ques10`', value: 'Set question flow for applicant DMs', inline: false }
          ];
          break;
        case 'moderation':
          title = '⚠️ Moderation Commands';
          description = 'Moderate your server with these commands.';
          fields = [
            { name: '`!warn @user [reason]`', value: 'Warn a user', inline: false },
            { name: '`!warnings @user`', value: 'View warning history with reason + timestamp', inline: false },
            { name: '`!warnlimit <number>`', value: 'Auto-kick when warning count hits this', inline: false },
            { name: '`!mute @user [duration] [reason]`', value: 'Mute user temporarily', inline: false },
            { name: '`!unmute @user`', value: 'Unmute', inline: false }
          ];
          break;
        case 'games':
          title = '🎮 Mini-Games Commands';
          description = 'Play fun mini-games with these commands.';
          fields = [
            { name: '`!rps @user`', value: 'Rock Paper Scissors with multiplayer buttons', inline: false },
            { name: '`!guess`', value: 'Guess the number (range-based, 1–100)', inline: false },
            { name: '`!math`', value: 'Random math challenge', inline: false },
            { name: '`!type`', value: 'Type the shown sentence (speed test)', inline: false },
            { name: '`!trivia`', value: 'General trivia questions with 4 buttons: A/B/C/D', inline: false },
            { name: '`!snake`, `!2048`, `!connect4`, `!tictactoe`', value: 'Optional extras (if UI supports)', inline: false },
            { name: '`!top <game>`', value: 'View top players', inline: false }
          ];
          break;
        case 'economy':
          title = '💰 Economy Commands';
          description = 'Manage your virtual economy with these commands.';
          fields = [
            { name: '`!cf head 100` or `/cf tail 100`', value: 'Coin flip game', inline: false },
            { name: '`!cash` or `/cash`', value: 'Show wallet balance', inline: false },
            { name: '`!daily`', value: 'Claim daily bonus', inline: false },
            { name: '`!weekly`', value: 'Claim weekly reward', inline: false },
            { name: '`!hunt`, `!battle`, `!loot`', value: 'Random reward commands', inline: false },
            { name: '`!deposit <amount>`', value: 'Move coins to bank', inline: false },
            { name: '`!withdraw <amount>`', value: 'Withdraw from bank', inline: false },
            { name: '`!beg`, `!give @user amount`', value: 'Beg for money or give to others', inline: false },
            { name: '`!inventory`', value: 'Show user items', inline: false },
            { name: '`!shop`', value: 'List all items to buy', inline: false },
            { name: '`!buy <item>`', value: 'Purchase from shop', inline: false },
            { name: '`!sell <item>`', value: 'Sell item', inline: false }
          ];
          break;
        case 'dm':
          title = '📩 DM & Embeds Commands';
          description = 'Send messages and embeds with these commands.';
          fields = [
            { name: '`!dm @role <message>`', value: 'DM message to every user in the role', inline: false },
            { name: '`!embed <color> <message>`', value: 'Send colored embed to current channel', inline: false },
            { name: '`!msg #channel <message>`', value: 'Send message to a specific channel', inline: false }
          ];
          break;
        case 'utilities':
          title = 'ℹ️ Utility Commands';
          description = 'Various utility commands.';
          fields = [
            { name: '`!userinfo @user`', value: 'View user info: roles, avatar, join date', inline: false },
            { name: '`!serverinfo`', value: 'View server stats, icon, owner, region', inline: false },
            { name: '`!ping`', value: 'Show latency', inline: false },
            { name: '`!prems @role`', value: 'Give role permission to access full bot commands', inline: false },
            { name: '`!uptime`', value: 'Show bot uptime', inline: false },
            { name: '`!botstats`', value: 'Show RAM, CPU, version, servers, users', inline: false }
          ];
          break;
        case 'music':
          title = '🎵 Music Commands';
          description = 'Play music with these commands.';
          fields = [
            { name: '`!play <song name | URL>`', value: 'Play from Spotify or YouTube', inline: false },
            { name: '`!pause`, `!resume`, `!stop`', value: 'Control playback', inline: false },
            { name: '`!skip`, `!queue`, `!np`, `!volume`', value: 'Manage queue and playback', inline: false },
            { name: '`!lyrics <song>`', value: 'Show lyrics', inline: false },
            { name: '`!loop`, `!shuffle`', value: 'Manage playback options', inline: false },
            { name: '`!phonk`, `!english`, `!hind`, `!randomsong`', value: 'Genre shortcuts with auto-play next', inline: false }
          ];
          break;
      }

      const embed = createEmbed(
        title,
        description,
        COLORS.DEFAULT,
        fields,
        { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
      );

      await interaction.update({ embeds: [embed], components: [] });
    }
  } else if (interaction.isButton()) {
    // Ticket system buttons
    if (interaction.customId === 'create_ticket') {
      const ticketsData = getData('tickets');
      const ticketType = interaction.values[0];
      
      if (!ticketsData[interaction.guild.id]) {
        return interaction.reply({ embeds: [errorEmbed('Ticket system not configured.')], ephemeral: true });
      }

      // Check if user already has an open ticket
      const existingTicket = interaction.guild.channels.cache.find(
        c => c.name === `ticket-${interaction.user.username.toLowerCase()}` && 
             c.type === ChannelType.GuildText
      );

      if (existingTicket) {
        return interaction.reply({ 
          embeds: [errorEmbed(`You already have an open ticket: ${existingTicket}`)],
          ephemeral: true 
        });
      }

      // Create ticket channel
      const category = ticketsData[interaction.guild.id].category 
        ? interaction.guild.channels.cache.get(ticketsData[interaction.guild.id].category)
        : null;

      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username}`,
        type: ChannelType.GuildText,
        parent: category?.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          ...(ticketsData[interaction.guild.id].viewerRole 
            ? [{
                id: ticketsData[interaction.guild.id].viewerRole,
                allow: [PermissionFlagsBits.ViewChannel]
              }]
            : [])
        ]
      });

      // Send ticket message with buttons
      const ticketButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_lock')
          .setLabel('Lock')
          .setEmoji('🔒')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_transcript')
          .setLabel('Transcript')
          .setEmoji('🧾')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket_close_reason')
          .setLabel('Close w/ Reason')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claim')
          .setEmoji('🧑')
          .setStyle(ButtonStyle.Primary)
      );

      const ticketEmbed = createEmbed(
        `🎟️ Ticket: ${ticketType}`,
        `**User:** ${interaction.user}\n**Type:** ${ticketType}\n\nPlease describe your issue below. Staff will be with you shortly.`,
        COLORS.DEFAULT,
        [],
        { text: 'Use the buttons below to manage this ticket' }
      );

      await ticketChannel.send({ 
        content: `${interaction.user} ${ticketsData[interaction.guild.id].viewerRole ? `<@&${ticketsData[interaction.guild.id].viewerRole}>` : ''}`,
        embeds: [ticketEmbed], 
        components: [ticketButtons] 
      });

      interaction.reply({ 
        embeds: [successEmbed(`Your ticket has been created: ${ticketChannel}`)],
        ephemeral: true 
      });
    } else if (interaction.customId === 'ticket_lock') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
      }

      const isLocked = interaction.channel.permissionOverwrites.cache.get(interaction.guild.id)?.deny.has(PermissionFlagsBits.SendMessages);

      if (isLocked) {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: null
        });
        interaction.reply({ embeds: [successEmbed('Ticket unlocked.')] });
      } else {
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: false
        });
        interaction.reply({ embeds: [successEmbed('Ticket locked.')] });
      }
    } else if (interaction.customId === 'ticket_transcript') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
      }

      await interaction.deferReply();

      try {
        const transcript = await createTranscript(interaction.channel, {
          limit: -1,
          returnType: 'string',
          saveImages: true
        });

        const transcriptFile = Buffer.from(transcript);
        await interaction.followUp({
          files: [{
            attachment: transcriptFile,
            name: `transcript-${interaction.channel.name}.html`
          }]
        });
      } catch (err) {
        console.error(err);
        interaction.followUp({ embeds: [errorEmbed('Failed to generate transcript.')] });
      }
    } else if (interaction.customId === 'ticket_close') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
      }

      const user = interaction.channel.name.replace('ticket-', '');
      const member = await interaction.guild.members.fetch({ query: user, limit: 1 }).then(members => members.first());

      if (member) {
        try {
          await member.send({
            embeds: [
              createEmbed(
                '✅ Ticket Closed',
                `Your ticket in **${interaction.guild.name}** has been closed.`,
                COLORS.SUCCESS,
                [
                  { name: 'Ticket ID', value: interaction.channel.id },
                  { name: 'Opened By', value: member.user.tag },
                  { name: 'Closed By', value: interaction.user.tag },
                  { name: 'Status', value: 'Closed' },
                  { name: 'Reason', value: 'No reason provided' }
                ],
                { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
              )
            ]
          });
        } catch (err) {
          console.log(`Could not send DM to ${member.user.tag}`);
        }
      }

      await interaction.channel.delete();
    } else if (interaction.customId === 'ticket_close_reason') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
      }

      const modal = new ModalBuilder()
        .setCustomId('ticket_close_reason_modal')
        .setTitle('Close Ticket with Reason');

      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel('Reason for closing')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);

      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);

      await interaction.showModal(modal);
    } else if (interaction.customId === 'ticket_claim') {
      if (!interaction.channel.name.startsWith('ticket-')) {
        return interaction.reply({ embeds: [errorEmbed('This is not a ticket channel.')], ephemeral: true });
      }

      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        SendMessages: true
      });

      interaction.reply({ 
        embeds: [successEmbed(`${interaction.user} has claimed this ticket.`)] 
      });
    } else if (interaction.customId.startsWith('app_')) {
      const roleName = interaction.customId.replace('app_', '').replace(/_/g, ' ');
      const appsData = getData('applications');
      
      if (!appsData[interaction.guild.id]?.questions || appsData[interaction.guild.id].questions.length === 0) {
        return interaction.reply({ 
          embeds: [errorEmbed('Application questions not configured.')],
          ephemeral: true 
        });
      }

      // Start application process
      const applicationId = uuidv4();
      await db.set(`application_${applicationId}`, {
        userId: interaction.user.id,
        guildId: interaction.guild.id,
        roleName,
        answers: [],
        currentQuestion: 0
      });

      // Send first question
      const question = appsData[interaction.guild.id].questions[0];
      try {
        await interaction.user.send({
          embeds: [
            createEmbed(
              '📋 Application Question',
              question,
              COLORS.DEFAULT,
              [],
              { text: `Question 1 of ${appsData[interaction.guild.id].questions.length}` }
            )
          ]
        });

        interaction.reply({ 
          embeds: [successEmbed('Check your DMs to continue the application.')],
          ephemeral: true 
        });
      } catch (err) {
        interaction.reply({ 
          embeds: [errorEmbed('Could not send you a DM. Please enable DMs and try again.')],
          ephemeral: true 
        });
      }
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId === 'ticket_close_reason_modal') {
      const reason = interaction.fields.getTextInputValue('reason');
      const user = interaction.channel.name.replace('ticket-', '');
      const member = await interaction.guild.members.fetch({ query: user, limit: 1 }).then(members => members.first());

      if (member) {
        try {
          await member.send({
            embeds: [
              createEmbed(
                '✅ Ticket Closed',
                `Your ticket in **${interaction.guild.name}** has been closed.`,
                COLORS.SUCCESS,
                [
                  { name: 'Ticket ID', value: interaction.channel.id },
                  { name: 'Opened By', value: member.user.tag },
                  { name: 'Closed By', value: interaction.user.tag },
                  { name: 'Status', value: 'Closed' },
                  { name: 'Reason', value: reason }
                ],
                { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
              )
            ]
          });
        } catch (err) {
          console.log(`Could not send DM to ${member.user.tag}`);
        }
      }

      await interaction.channel.delete();
    }
  }
});

// Event: Modal Submit
client.on('modalSubmit', async interaction => {
  if (interaction.customId === 'ticket_close_reason_modal') {
    const reason = interaction.fields.getTextInputValue('reason');
    const user = interaction.channel.name.replace('ticket-', '');
    const member = await interaction.guild.members.fetch({ query: user, limit: 1 }).then(members => members.first());

    if (member) {
      try {
        await member.send({
          embeds: [
            createEmbed(
              '✅ Ticket Closed',
              `Your ticket in **${interaction.guild.name}** has been closed.`,
              COLORS.SUCCESS,
              [
                { name: 'Ticket ID', value: interaction.channel.id },
                { name: 'Opened By', value: member.user.tag },
                { name: 'Closed By', value: interaction.user.tag },
                { name: 'Status', value: 'Closed' },
                { name: 'Reason', value: reason }
              ],
              { text: interaction.guild.name, iconURL: interaction.guild.iconURL() }
            )
          ]
        });
      } catch (err) {
        console.log(`Could not send DM to ${member.user.tag}`);
      }
    }

    await interaction.channel.delete();
  }
});

// Event: Message Create (for prefix commands and application answers)
client.on('messageCreate', async message => {
  // Ignore bots and DMs
  if (message.author.bot || !message.guild) return;

  // Handle prefix commands
  if (message.content.startsWith(PREFIX)) {
    const args = message.content.slice(PREFIX.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    const command = prefixCommands.get(commandName);

    if (!command) return;

    try {
      await command.execute(message, args);
    } catch (error) {
      console.error(error);
      message.reply({ embeds: [errorEmbed('An error occurred while executing this command.')] });
    }
    return;
  }

  // Handle application answers in DMs
  if (message.channel.isDMBased()) {
    const activeApplications = await db.all().then(data => 
      data.filter(item => item.ID.startsWith('application_') && item.data.userId === message.author.id)
    );

    if (activeApplications.length === 0) return;

    const application = activeApplications[0].data;
    const appsData = getData('applications');
    const questions = appsData[application.guildId]?.questions || [];

    // Save answer
    application.answers.push(message.content);
    await db.set(`application_${activeApplications[0].ID.split('_')[1]}`, application);

    // Check if there are more questions
    if (application.currentQuestion < questions.length - 1) {
      application.currentQuestion++;
      await db.set(`application_${activeApplications[0].ID.split('_')[1]}`, application);

      // Send next question
      message.author.send({
        embeds: [
          createEmbed(
            '📋 Application Question',
            questions[application.currentQuestion],
            COLORS.DEFAULT,
            [],
            { text: `Question ${application.currentQuestion + 1} of ${questions.length}` }
          )
        ]
      });
    } else {
      // Application complete
      const guild = client.guilds.cache.get(application.guildId);
      if (!guild) return;

      const appChannel = appsData[application.guildId]?.channel 
        ? guild.channels.cache.get(appsData[application.guildId].channel)
        : null;

      if (!appChannel) {
        return message.author.send({
          embeds: [errorEmbed('Application submission channel not found. Contact server staff.')]
        });
      }

      // Send application summary
      const fields = questions.map((q, i) => ({
        name: `Question ${i + 1}`,
        value: q,
        inline: false
      }));

      fields.push({
        name: 'Answers',
        value: application.answers.map((a, i) => `**${i + 1}.** ${a}`).join('\n'),
        inline: false
      });

      const appButtons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`app_accept_${activeApplications[0].ID.split('_')[1]}`)
          .setLabel('Accept')
          .setEmoji('✅')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`app_reject_${activeApplications[0].ID.split('_')[1]}`)
          .setLabel('Reject')
          .setEmoji('❌')
          .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
          .setCustomId(`app_dm_${activeApplications[0].ID.split('_')[1]}`)
          .setLabel('DM User')
          .setEmoji('💬')
          .setStyle(ButtonStyle.Primary)
      );

      await appChannel.send({
        content: `New application for **${application.roleName}** from ${message.author}`,
        embeds: [
          createEmbed(
            '📋 Application Submission',
            `**Applicant:** ${message.author.tag} (${message.author.id})\n**Role:** ${application.roleName}`,
            COLORS.DEFAULT,
            fields
          )
        ],
        components: [appButtons]
      });

      await db.delete(`application_${activeApplications[0].ID.split('_')[1]}`);
      message.author.send({
        embeds: [successEmbed('Your application has been submitted! Staff will review it soon.')]
      });
    }
  }
});

// Event: Message Delete (for ticket transcripts)
client.on('messageDelete', async message => {
  if (message.channel.name.startsWith('ticket-') && !message.author.bot) {
    const ticketsData = getData('tickets');
    if (!ticketsData[message.guild.id]?.transcriptChannel) return;

    const transcriptChannel = message.guild.channels.cache.get(ticketsData[message.guild.id].transcriptChannel);
    if (!transcriptChannel) return;

    const embed = createEmbed(
      '🗑️ Message Deleted',
      `A message was deleted in ${message.channel}`,
      COLORS.WARNING,
      [
        { name: 'Author', value: message.author.tag, inline: true },
        { name: 'Content', value: message.content || 'No text content', inline: false }
      ]
    );

    transcriptChannel.send({ embeds: [embed] });
  }
});

// Initialize Lavalink connection
player.events.on('playerStart', (queue, track) => {
  queue.metadata.channel.send({
    embeds: [
      createEmbed(
        '🎵 Now Playing',
        `**${track.title}**\nDuration: ${track.duration}\nRequested by: ${track.requestedBy}`,
        COLORS.DEFAULT
      ).setThumbnail(track.thumbnail)
    ]
  });
});

player.events.on('error', (queue, error) => {
  console.error(`[${queue.guild.name}] Error emitted from the queue: ${error.message}`);
  queue.metadata.channel.send({ embeds: [errorEmbed(`An error occurred: ${error.message}`)] });
});

player.events.on('playerError', (queue, error) => {
  console.error(`[${queue.guild.name}] Error emitted from the player: ${error.message}`);
  queue.metadata.channel.send({ embeds: [errorEmbed(`A player error occurred: ${error.message}`)] });
});

// Login
client.login(process.env.DISCORD_TOKEN);