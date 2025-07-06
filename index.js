require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, Collection, Events } = require('discord.js');
const express = require('express');
const keepAlive = express();
const fs = require('fs');

// Initialize Discord client with required intents
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ]
});

// Server-specific settings storage
const serverSettings = new Map();
const userCooldowns = new Map();
const xpData = new Map();
const birthdayData = new Map();

// Default settings for a server
const defaultSettings = {
  prefix: '!',
  logChannel: null,
  triggers: [],
  customCommands: [],
  tags: [],
  reactionRoles: new Map(),
  autoReacts: [],
  autoMod: {
    invites: false,
    profanity: false,
    links: false,
    caps: false,
    mentions: false,
    repeats: false
  },
  applications: {
    message: null,
    options: [],
    questions: [],
    channel: null,
    roles: new Map()
  },
  tickets: {
    channel: null,
    message: null,
    options: [],
    viewerRole: null,
    openTickets: new Map()
  },
  levelChannel: null,
  birthdayChannel: null
};

// Initialize server settings
function getServerSettings(guildId) {
  if (!serverSettings.has(guildId)) {
    serverSettings.set(guildId, JSON.parse(JSON.stringify(defaultSettings)));
  }
  return serverSettings.get(guildId);
}

// XP system functions
function addXP(userId, guildId) {
  if (!xpData.has(guildId)) xpData.set(guildId, new Map());
  const guildXP = xpData.get(guildId);
  const currentXP = guildXP.get(userId) || { xp: 0, level: 1 };
  
  // Add random XP between 15-25
  currentXP.xp += Math.floor(Math.random() * 11) + 15;
  
  // Check level up (every 100 XP)
  const neededXP = currentXP.level * 100;
  if (currentXP.xp >= neededXP) {
    currentXP.level++;
    currentXP.xp = 0;
    guildXP.set(userId, currentXP);
    return { leveledUp: true, level: currentXP.level };
  }
  
  guildXP.set(userId, currentXP);
  return { leveledUp: false };
}

// Helper functions
function createEmbed(title, description, color = '#0099ff') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function createErrorEmbed(description) {
  return createEmbed('Error', description, '#ff0000');
}

function createSuccessEmbed(description) {
  return createEmbed('Success', description, '#00ff00');
}

// Logging function
async function logAction(guildId, action, details) {
  const settings = getServerSettings(guildId);
  if (!settings.logChannel) return;
  
  const logChannel = await client.channels.fetch(settings.logChannel).catch(() => null);
  if (!logChannel) return;
  
  const embed = createEmbed(`Action Log: ${action}`, details, '#ffff00');
  await logChannel.send({ embeds: [embed] });
}

// Command handlers
async function handleTriggerCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'add') {
    const keyword = args[1];
    const actions = args.slice(2).join(' ');
    
    settings.triggers.push({ keyword, actions });
    await message.reply({ embeds: [createSuccessEmbed(`Trigger added for keyword: ${keyword}`)] });
  } else if (args[0] === 'list') {
    const triggerList = settings.triggers.map(t => `**${t.keyword}**: ${t.actions}`).join('\n') || 'No triggers set up.';
    await message.reply({ embeds: [createEmbed('Trigger List', triggerList)] });
  } else if (args[0] === 'remove') {
    const keyword = args[1];
    settings.triggers = settings.triggers.filter(t => t.keyword !== keyword);
    await message.reply({ embeds: [createSuccessEmbed(`Trigger removed for keyword: ${keyword}`)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid trigger command. Usage: !trigger add <keyword> <actions>')] });
  }
}

async function handleCustomCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'add') {
    const name = args[1];
    const response = args.slice(2).join(' ');
    
    settings.customCommands.push({ name, response });
    await message.reply({ embeds: [createSuccessEmbed(`Custom command added: ${name}`)] });
  } else if (args[0] === 'list') {
    const commandList = settings.customCommands.map(c => `**${c.name}**: ${c.response}`).join('\n') || 'No custom commands set up.';
    await message.reply({ embeds: [createEmbed('Custom Command List', commandList)] });
  } else if (args[0] === 'remove') {
    const name = args[1];
    settings.customCommands = settings.customCommands.filter(c => c.name !== name);
    await message.reply({ embeds: [createSuccessEmbed(`Custom command removed: ${name}`)] });
  } else {
    // Execute custom command if it exists
    const cmd = settings.customCommands.find(c => c.name === args[0]);
    if (cmd) {
      let response = cmd.response
        .replace(/{user}/g, message.author.toString())
        .replace(/{channel}/g, message.channel.toString())
        .replace(/{args}/g, args.slice(1).join(' '));
      await message.reply(response);
    } else {
      await message.reply({ embeds: [createErrorEmbed('Invalid custom command. Usage: !cc add <name> <response>')] });
    }
  }
}

async function handleTagCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'add') {
    const name = args[1];
    const content = args.slice(2).join(' ');
    
    settings.tags.push({ name, content });
    await message.reply({ embeds: [createSuccessEmbed(`Tag added: ${name}`)] });
  } else if (args[0] === 'list') {
    const tagList = settings.tags.map(t => `**${t.name}**: ${t.content.substring(0, 50)}${t.content.length > 50 ? '...' : ''}`).join('\n') || 'No tags set up.';
    await message.reply({ embeds: [createEmbed('Tag List', tagList)] });
  } else if (args[0] === 'remove') {
    const name = args[1];
    settings.tags = settings.tags.filter(t => t.name !== name);
    await message.reply({ embeds: [createSuccessEmbed(`Tag removed: ${name}`)] });
  } else {
    // Show tag if it exists
    const tag = settings.tags.find(t => t.name === args[0]);
    if (tag) {
      await message.reply(tag.content);
    } else {
      await message.reply({ embeds: [createErrorEmbed('Invalid tag command. Usage: !tag add <name> <content>')] });
    }
  }
}

async function handleReactionRoleCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args.length < 2) {
    return message.reply({ embeds: [createErrorEmbed('Usage: !reactionrole <emoji> <@role>')] });
  }
  
  const emoji = args[0];
  const role = message.mentions.roles.first();
  
  if (!role) {
    return message.reply({ embeds: [createErrorEmbed('Please mention a valid role.')] });
  }
  
  settings.reactionRoles.set(emoji, role.id);
  await message.reply({ embeds: [createSuccessEmbed(`Reaction role added: ${emoji} -> ${role.name}`)] });
}

async function handleDropdownRoleCommand(message, args) {
  if (args[0] === 'add') {
    const roleNames = args.slice(1).join(' ').split(',');
    const roles = roleNames.map(name => name.trim()).filter(name => name);
    
    if (roles.length === 0) {
      return message.reply({ embeds: [createErrorEmbed('Please provide at least one role name.')] });
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('role_selection')
      .setPlaceholder('Select your roles')
      .setMinValues(1)
      .setMaxValues(roles.length)
      .addOptions(roles.map(role => ({
        label: role,
        value: role.toLowerCase().replace(/\s+/g, '_')
      })));
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    await message.channel.send({
      content: 'Select your roles:',
      components: [row]
    });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Usage: !dropdownrole add Role1, Role2, Role3')] });
  }
}

async function handleAutoReactCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'add') {
    const keyword = args[1];
    const emoji = args[2];
    
    settings.autoReacts.push({ keyword, emoji });
    await message.reply({ embeds: [createSuccessEmbed(`Auto-react added: ${keyword} -> ${emoji}`)] });
  } else if (args[0] === 'list') {
    const reactList = settings.autoReacts.map(r => `**${r.keyword}**: ${r.emoji}`).join('\n') || 'No auto-reacts set up.';
    await message.reply({ embeds: [createEmbed('Auto-React List', reactList)] });
  } else if (args[0] === 'remove') {
    const keyword = args[1];
    settings.autoReacts = settings.autoReacts.filter(r => r.keyword !== keyword);
    await message.reply({ embeds: [createSuccessEmbed(`Auto-react removed: ${keyword}`)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid auto-react command. Usage: !autoreact add <keyword> <emoji>')] });
  }
}

async function handleAutoModCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'enable') {
    const type = args[1];
    if (settings.autoMod.hasOwnProperty(type)) {
      settings.autoMod[type] = true;
      await message.reply({ embeds: [createSuccessEmbed(`Auto-mod enabled for: ${type}`)] });
    } else {
      await message.reply({ embeds: [createErrorEmbed(`Invalid auto-mod type. Available types: ${Object.keys(settings.autoMod).join(', ')}`)] });
    }
  } else if (args[0] === 'disable') {
    const type = args[1];
    if (settings.autoMod.hasOwnProperty(type)) {
      settings.autoMod[type] = false;
      await message.reply({ embeds: [createSuccessEmbed(`Auto-mod disabled for: ${type}`)] });
    } else {
      await message.reply({ embeds: [createErrorEmbed(`Invalid auto-mod type. Available types: ${Object.keys(settings.autoMod).join(', ')}`)] });
    }
  } else if (args[0] === 'status') {
    const statusList = Object.entries(settings.autoMod)
      .map(([type, enabled]) => `**${type}**: ${enabled ? '✅' : '❌'}`)
      .join('\n');
    await message.reply({ embeds: [createEmbed('Auto-Mod Status', statusList)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid auto-mod command. Usage: !automod enable/disable <type>')] });
  }
}

// Application system commands
async function handleAppCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'msg') {
    const appMessage = args.slice(1).join(' ');
    settings.applications.message = appMessage;
    await message.reply({ embeds: [createSuccessEmbed('Application message set.')] });
  } else if (args[0] === 'addoptions') {
    const options = args.slice(1).join(' ').split(',').map(opt => opt.trim());
    settings.applications.options = options;
    await message.reply({ embeds: [createSuccessEmbed(`Application options set: ${options.join(', ')}`)] });
  } else if (args[0] === 'deployapp') {
    if (!settings.applications.message || settings.applications.options.length === 0) {
      return message.reply({ embeds: [createErrorEmbed('Please set an application message and options first.')] });
    }
    
    const buttons = settings.applications.options.map(option => 
      new ButtonBuilder()
        .setCustomId(`app_${option.toLowerCase().replace(/\s+/g, '_')}`)
        .setLabel(option)
        .setStyle(ButtonStyle.Primary)
    );
    
    const row = new ActionRowBuilder().addComponents(buttons);
    
    await message.channel.send({
      embeds: [createEmbed('Application Panel', settings.applications.message)],
      components: [row]
    });
  } else if (args[0].startsWith('ques')) {
    const questionNumber = parseInt(args[0].replace('ques', ''));
    if (isNaN(questionNumber)) {
      return message.reply({ embeds: [createErrorEmbed('Invalid question number.')] });
    }
    
    const question = args.slice(1).join(' ');
    settings.applications.questions[questionNumber - 1] = question;
    await message.reply({ embeds: [createSuccessEmbed(`Question ${questionNumber} set.`)] });
  } else if (args[0] === 'setappchannel') {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [createErrorEmbed('Please mention a valid channel.')] });
    }
    
    settings.applications.channel = channel.id;
    await message.reply({ embeds: [createSuccessEmbed(`Application submission channel set to ${channel.name}`)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid application command.')] });
  }
}

// Ticket system commands
async function handleTicketCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'setticket') {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [createErrorEmbed('Please mention a valid channel.')] });
    }
    
    settings.tickets.channel = channel.id;
    await message.reply({ embeds: [createSuccessEmbed(`Ticket panel channel set to ${channel.name}`)] });
  } else if (args[0] === 'ticketmsg') {
    const ticketMessage = args.slice(1).join(' ');
    settings.tickets.message = ticketMessage;
    await message.reply({ embeds: [createSuccessEmbed('Ticket message set.')] });
  } else if (args[0] === 'ticketoptions') {
    const options = [];
    const parts = args.slice(1).join(' ').split(',');
    
    for (const part of parts) {
      const trimmed = part.trim();
      const emojiMatch = trimmed.match(/^\[(.*?)\]/);
      const emoji = emojiMatch ? emojiMatch[1] : null;
      const label = emojiMatch ? trimmed.replace(emojiMatch[0], '').trim() : trimmed;
      
      if (label) {
        options.push({ emoji, label });
      }
    }
    
    settings.tickets.options = options;
    await message.reply({ embeds: [createSuccessEmbed(`Ticket options set: ${options.map(o => o.label).join(', ')}`)] });
  } else if (args[0] === 'setviewer') {
    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ embeds: [createErrorEmbed('Please mention a valid role.')] });
    }
    
    settings.tickets.viewerRole = role.id;
    await message.reply({ embeds: [createSuccessEmbed(`Viewer role set to ${role.name}`)] });
  } else if (args[0] === 'deployticketpanel') {
    if (!settings.tickets.message || settings.tickets.options.length === 0) {
      return message.reply({ embeds: [createErrorEmbed('Please set a ticket message and options first.')] });
    }
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_selection')
      .setPlaceholder('Select a ticket type')
      .addOptions(settings.tickets.options.map(option => ({
        label: option.label,
        value: option.label.toLowerCase().replace(/\s+/g, '_'),
        emoji: option.emoji
      })));
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    const channel = await client.channels.fetch(settings.tickets.channel).catch(() => null);
    if (!channel) {
      return message.reply({ embeds: [createErrorEmbed('Ticket channel not found or bot lacks permissions.')] });
    }
    
    await channel.send({
      embeds: [createEmbed('Ticket System', settings.tickets.message)],
      components: [row]
    });
    
    await message.reply({ embeds: [createSuccessEmbed('Ticket panel deployed.')] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid ticket command.')] });
  }
}

// XP and level commands
async function handleXPCommand(message, args) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  
  if (args[0] === 'level') {
    const targetUser = message.mentions.users.first() || message.author;
    const targetUserId = targetUser.id;
    
    if (!xpData.has(guildId)) xpData.set(guildId, new Map());
    const guildXP = xpData.get(guildId);
    const userXP = guildXP.get(targetUserId) || { xp: 0, level: 1 };
    
    const embed = createEmbed(
      `${targetUser.username}'s Level`,
      `**Level**: ${userXP.level}\n**XP**: ${userXP.xp}/${userXP.level * 100}`
    ).setThumbnail(targetUser.displayAvatarURL());
    
    await message.reply({ embeds: [embed] });
  } else if (args[0] === 'leaderboard') {
    if (!xpData.has(guildId)) xpData.set(guildId, new Map());
    const guildXP = xpData.get(guildId);
    
    const sortedUsers = Array.from(guildXP.entries())
      .map(([id, data]) => ({ id, ...data }))
      .sort((a, b) => b.level - a.level || b.xp - a.xp)
      .slice(0, 10);
    
    const leaderboard = await Promise.all(sortedUsers.map(async (user, index) => {
      const member = await message.guild.members.fetch(user.id).catch(() => null);
      return `**${index + 1}.** ${member ? member.user.username : 'Unknown User'} - Level ${user.level} (${user.xp}/${user.level * 100} XP)`;
    }));
    
    const embed = createEmbed(
      'Server Leaderboard',
      leaderboard.join('\n') || 'No users have XP yet.'
    );
    
    await message.reply({ embeds: [embed] });
  } else if (args[0] === 'setlevelchannel') {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [createErrorEmbed('Please mention a valid channel.')] });
    }
    
    const settings = getServerSettings(guildId);
    settings.levelChannel = channel.id;
    await message.reply({ embeds: [createSuccessEmbed(`Level-up announcements will now appear in ${channel.name}`)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid XP command. Usage: !level [@user] or !leaderboard')] });
  }
}

// Birthday commands
async function handleBirthdayCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'setbirthday') {
    const date = args[1];
    if (!date || !date.match(/^\d{2}-\d{2}$/)) {
      return message.reply({ embeds: [createErrorEmbed('Please provide a valid date in MM-DD format.')] });
    }
    
    birthdayData.set(message.author.id, date);
    await message.reply({ embeds: [createSuccessEmbed(`Your birthday has been set to ${date}.`)] });
  } else if (args[0] === 'setbirthdaychannel') {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [createErrorEmbed('Please mention a valid channel.')] });
    }
    
    settings.birthdayChannel = channel.id;
    await message.reply({ embeds: [createSuccessEmbed(`Birthday announcements will now appear in ${channel.name}`)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid birthday command. Usage: !setbirthday MM-DD')] });
  }
}

// Game commands
async function handleGameCommand(message, args) {
  if (args[0] === 'rps') {
    const choices = ['rock', 'paper', 'scissors'];
    const userChoice = args[1]?.toLowerCase();
    
    if (!choices.includes(userChoice)) {
      return message.reply({ embeds: [createErrorEmbed('Please choose rock, paper, or scissors.')] });
    }
    
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    let result;
    
    if (userChoice === botChoice) {
      result = "It's a tie!";
    } else if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) {
      result = 'You win!';
    } else {
      result = 'I win!';
    }
    
    const embed = createEmbed(
      'Rock Paper Scissors',
      `You chose: ${userChoice}\nI chose: ${botChoice}\n\n**${result}**`
    );
    
    await message.reply({ embeds: [embed] });
  } else if (args[0] === 'math') {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer;
    switch (operator) {
      case '+': answer = num1 + num2; break;
      case '-': answer = num1 - num2; break;
      case '*': answer = num1 * num2; break;
    }
    
    const question = `What is ${num1} ${operator} ${num2}?`;
    const filter = m => m.author.id === message.author.id;
    
    await message.reply({ embeds: [createEmbed('Math Challenge', question)] });
    
    try {
      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 10000,
        errors: ['time']
      });
      
      const userAnswer = parseInt(collected.first().content);
      if (userAnswer === answer) {
        await message.reply({ embeds: [createSuccessEmbed('Correct! 🎉')] });
      } else {
        await message.reply({ embeds: [createErrorEmbed(`Wrong! The answer was ${answer}.`)] });
      }
    } catch {
      await message.reply({ embeds: [createErrorEmbed(`Time's up! The answer was ${answer}.`)] });
    }
  } else if (args[0] === 'hug' || args[0] === 'slap' || args[0] === 'kiss') {
    const action = args[0];
    const target = message.mentions.users.first();
    
    if (!target) {
      return message.reply({ embeds: [createErrorEmbed(`Please mention someone to ${action}.`)] });
    }
    
    const actions = {
      hug: ['hugs', '🤗'],
      slap: ['slaps', '👋'],
      kiss: ['kisses', '💋']
    };
    
    const [verb, emoji] = actions[action];
    await message.reply(`${message.author} ${verb} ${target} ${emoji}`);
  } else if (args[0] === 'type') {
    const words = ['discord', 'bot', 'javascript', 'node', 'developer', 'programming', 'coding', 'computer'];
    const word = words[Math.floor(Math.random() * words.length)];
    
    await message.reply({ embeds: [createEmbed('Type Race', `Type the following word as fast as you can:\n\n**${word}**`)] });
    
    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === word;
    
    try {
      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 10000
      });
      
      const timeTaken = (collected.first().createdTimestamp - message.createdTimestamp) / 1000;
      await message.reply({ embeds: [createSuccessEmbed(`You typed it in ${timeTaken.toFixed(2)} seconds!`)] });
    } catch {
      await message.reply({ embeds: [createErrorEmbed('You took too long!')] });
    }
  } else if (args[0] === 'trivia') {
    const questions = [
      {
        question: 'What is the capital of France?',
        options: ['London', 'Paris', 'Berlin', 'Madrid'],
        answer: 1
      },
      {
        question: 'Which planet is known as the Red Planet?',
        options: ['Venus', 'Mars', 'Jupiter', 'Saturn'],
        answer: 1
      },
      {
        question: 'How many continents are there?',
        options: ['5', '6', '7', '8'],
        answer: 2
      }
    ];
    
    const q = questions[Math.floor(Math.random() * questions.length)];
    const options = q.options.map((opt, i) => `${i + 1}. ${opt}`).join('\n');
    
    await message.reply({ embeds: [createEmbed('Trivia', `${q.question}\n\n${options}`)] });
    
    const filter = m => m.author.id === message.author.id && ['1', '2', '3', '4'].includes(m.content);
    
    try {
      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 10000
      });
      
      const answer = parseInt(collected.first().content) - 1;
      if (answer === q.answer) {
        await message.reply({ embeds: [createSuccessEmbed('Correct! 🎉')] });
      } else {
        await message.reply({ embeds: [createErrorEmbed(`Wrong! The correct answer was ${q.answer + 1}. ${q.options[q.answer]}`)] });
      }
    } catch {
      await message.reply({ embeds: [createErrorEmbed(`Time's up! The correct answer was ${q.answer + 1}. ${q.options[q.answer]}`)] });
    }
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid game command. Available games: rps, math, hug, slap, kiss, type, trivia')] });
  }
}

// Admin commands
async function handleAdminCommand(message, args) {
  const settings = getServerSettings(message.guild.id);
  
  if (args[0] === 'setlog') {
    const channel = message.mentions.channels.first();
    if (!channel) {
      return message.reply({ embeds: [createErrorEmbed('Please mention a valid channel.')] });
    }
    
    settings.logChannel = channel.id;
    await message.reply({ embeds: [createSuccessEmbed(`Log channel set to ${channel.name}`)] });
  } else if (args[0] === 'setprefix') {
    const newPrefix = args[1];
    if (!newPrefix) {
      return message.reply({ embeds: [createErrorEmbed('Please provide a new prefix.')] });
    }
    
    settings.prefix = newPrefix;
    await message.reply({ embeds: [createSuccessEmbed(`Prefix changed to ${newPrefix}`)] });
  } else if (args[0] === 'setrole') {
    const command = args[1];
    const role = message.mentions.roles.first();
    
    if (!command || !role) {
      return message.reply({ embeds: [createErrorEmbed('Usage: !setrole <command> <@role>')] });
    }
    
    if (!settings.commandRoles) settings.commandRoles = new Map();
    settings.commandRoles.set(command, role.id);
    await message.reply({ embeds: [createSuccessEmbed(`Command ${command} is now restricted to ${role.name}`)] });
  } else {
    await message.reply({ embeds: [createErrorEmbed('Invalid admin command.')] });
  }
}

// Help command
async function handleHelpCommand(message) {
  const embed = createEmbed('Bot Help', 'Here are all the available commands:')
    .addFields(
      { name: '📌 Triggers', value: '`!trigger add <keyword> <actions>` - Create auto-triggers\n`!trigger list` - List all triggers\n`!trigger remove <keyword>` - Remove a trigger' },
      { name: '📝 Applications', value: '`!app msg <message>` - Set application message\n`!addoptions Option1,Option2` - Set application options\n`!deployapp` - Deploy application panel\n`!ques1-10 <question>` - Set application questions\n`!setappchannel #channel` - Set submission channel' },
      { name: '🎟️ Tickets', value: '`!setticket #channel` - Set ticket channel\n`!ticketmsg <message>` - Set ticket message\n`!ticketoptions [emoji] Option1, [emoji] Option2` - Set ticket options\n`!setviewer @role` - Set viewer role\n`!deployticketpanel` - Deploy ticket panel' },
      { name: '🎮 Games', value: '`!rps <rock/paper/scissors>` - Rock Paper Scissors\n`!math` - Math challenge\n`!hug/slap/kiss @user` - Social actions\n`!type` - Typing speed test\n`!trivia` - Trivia question' },
      { name: '🛠️ Admin', value: '`!setlog #channel` - Set log channel\n`!setprefix <prefix>` - Change bot prefix\n`!setrole <command> @role` - Restrict command to role' }
    );
  
  await message.reply({ embeds: [embed] });
}

// Message event handler
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  const settings = getServerSettings(message.guild.id);
  const prefix = settings.prefix;
  
  // Check triggers
  for (const trigger of settings.triggers) {
    if (message.content.toLowerCase().includes(trigger.keyword.toLowerCase())) {
      const actions = trigger.actions.split(' ');
      for (const action of actions) {
        if (action === 'delete') {
          await message.delete().catch(() => {});
        } else if (action.startsWith('warn:')) {
          const reason = action.split(':')[1];
          await message.reply(`⚠️ Warning: ${reason}`);
          await logAction(message.guild.id, 'Trigger Warning', `${message.author.tag} was warned for "${trigger.keyword}" trigger: ${reason}`);
        } else if (action.startsWith('mute:')) {
          const duration = action.split(':')[1];
          // Implement mute logic here
          await logAction(message.guild.id, 'Trigger Mute', `${message.author.tag} was muted for "${trigger.keyword}" trigger for ${duration}`);
        } else if (action.startsWith('dm:')) {
          const dmMessage = action.split(':').slice(1).join(':');
          await message.author.send(dmMessage).catch(() => {});
        } else if (action.startsWith('embed:')) {
          const embedText = action.split(':').slice(1).join(':');
          await message.channel.send({ embeds: [createEmbed('Trigger', embedText)] });
        } else if (action.startsWith('react:')) {
          const emoji = action.split(':')[1];
          await message.react(emoji).catch(() => {});
        }
      }
    }
  }
  
  // Check auto-reacts
  for (const autoReact of settings.autoReacts) {
    if (message.content.toLowerCase().includes(autoReact.keyword.toLowerCase())) {
      await message.react(autoReact.emoji).catch(() => {});
    }
  }
  
  // Auto-moderation
  if (settings.autoMod.invites && message.content.match(/discord\.gg\/\w+/i)) {
    await message.delete().catch(() => {});
    await message.author.send('Invite links are not allowed in this server.').catch(() => {});
    await logAction(message.guild.id, 'AutoMod - Invite Link', `${message.author.tag} posted an invite link: ${message.content}`);
  }
  
  if (settings.autoMod.caps && message.content.length > 10 && message.content === message.content.toUpperCase()) {
    await message.delete().catch(() => {});
    await message.author.send('Excessive caps are not allowed in this server.').catch(() => {});
    await logAction(message.guild.id, 'AutoMod - All Caps', `${message.author.tag} posted an all-caps message`);
  }
  
  // XP system
  if (!message.content.startsWith(prefix)) {
    const xpResult = addXP(message.author.id, message.guild.id);
    if (xpResult.leveledUp) {
      const settings = getServerSettings(message.guild.id);
      if (settings.levelChannel) {
        const channel = await client.channels.fetch(settings.levelChannel).catch(() => null);
        if (channel) {
          await channel.send({ embeds: [createSuccessEmbed(`${message.author} has leveled up to level ${xpResult.level}! 🎉`)] });
        }
      }
    }
    return;
  }
  
  // Check if message starts with prefix
  if (!message.content.startsWith(prefix)) return;
  
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift().toLowerCase();
  
  // Check command roles
  if (settings.commandRoles?.has(command)) {
    const requiredRoleId = settings.commandRoles.get(command);
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !member.roles.cache.has(requiredRoleId)) {
      return message.reply({ embeds: [createErrorEmbed('You do not have permission to use this command.')] });
    }
  }
  
  try {
    // Command routing
    if (command === 'trigger') {
      await handleTriggerCommand(message, args);
    } else if (command === 'cc') {
      await handleCustomCommand(message, args);
    } else if (command === 'tag') {
      await handleTagCommand(message, args);
    } else if (command === 'reactionrole') {
      await handleReactionRoleCommand(message, args);
    } else if (command === 'dropdownrole') {
      await handleDropdownRoleCommand(message, args);
    } else if (command === 'autoreact') {
      await handleAutoReactCommand(message, args);
    } else if (command === 'automod') {
      await handleAutoModCommand(message, args);
    } else if (command === 'app') {
      await handleAppCommand(message, args);
    } else if (command === 'ticket') {
      await handleTicketCommand(message, args);
    } else if (command === 'level' || command === 'leaderboard') {
      await handleXPCommand(message, args);
    } else if (command === 'setbirthday' || command === 'setbirthdaychannel') {
      await handleBirthdayCommand(message, args);
    } else if (['rps', 'math', 'hug', 'slap', 'kiss', 'type', 'trivia'].includes(command)) {
      await handleGameCommand(message, args);
    } else if (command === 'setlog' || command === 'setprefix' || command === 'setrole') {
      await handleAdminCommand(message, args);
    } else if (command === 'help') {
      await handleHelpCommand(message);
    }
  } catch (error) {
    console.error('Command error:', error);
    await message.reply({ embeds: [createErrorEmbed('An error occurred while executing that command.')] });
  }
});

// Interaction handlers
client.on('interactionCreate', async interaction => {
  const settings = getServerSettings(interaction.guild.id);
  
  // Application system
  if (interaction.isButton() && interaction.customId.startsWith('app_')) {
    const appType = interaction.customId.replace('app_', '');
    const appSettings = settings.applications;
    
    if (appSettings.questions.length === 0) {
      return interaction.reply({ embeds: [createErrorEmbed('No application questions have been set up.')], ephemeral: true });
    }
    
    await interaction.reply({ embeds: [createEmbed('Application Started', 'Check your DMs to complete the application.')], ephemeral: true });
    
    const dmChannel = await interaction.user.createDM();
    const answers = [];
    
    for (let i = 0; i < appSettings.questions.length; i++) {
      const question = appSettings.questions[i];
      if (!question) continue;
      
      await dmChannel.send({ embeds: [createEmbed(`Question ${i + 1}`, question)] });
      
      try {
        const collected = await dmChannel.awaitMessages({
          filter: m => m.author.id === interaction.user.id,
          max: 1,
          time: 300000
        });
        
        answers.push(collected.first().content);
      } catch {
        await dmChannel.send({ embeds: [createErrorEmbed('You took too long to respond. Application cancelled.')] });
        return;
      }
    }
    
    if (!appSettings.channel) {
      return dmChannel.send({ embeds: [createErrorEmbed('No application submission channel has been set up.')] });
    }
    
    const submissionChannel = await client.channels.fetch(appSettings.channel).catch(() => null);
    if (!submissionChannel) {
      return dmChannel.send({ embeds: [createErrorEmbed('Could not find the application submission channel.')] });
    }
    
    const embed = createEmbed(
      `New Application: ${appType}`,
      `**User**: ${interaction.user.tag} (${interaction.user.id})\n\n` +
      answers.map((answer, i) => `**Q${i + 1}**: ${appSettings.questions[i]}\n**A**: ${answer}`).join('\n\n')
    ).setThumbnail(interaction.user.displayAvatarURL());
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId(`app_accept_${interaction.user.id}`)
          .setLabel('Accept')
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`app_reject_${interaction.user.id}`)
          .setLabel('Reject')
          .setStyle(ButtonStyle.Danger)
      );
    
    await submissionChannel.send({ embeds: [embed], components: [row] });
    await dmChannel.send({ embeds: [createSuccessEmbed('Your application has been submitted!')] });
  }
  
  // Application accept/reject
  if (interaction.isButton() && (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_reject_'))) {
    const action = interaction.customId.split('_')[1];
    const userId = interaction.customId.split('_')[2];
    const user = await client.users.fetch(userId).catch(() => null);
    
    if (action === 'accept') {
      const roleId = settings.applications.roles.get('accepted');
      if (roleId) {
        const member = await interaction.guild.members.fetch(userId).catch(() => null);
        if (member) {
          await member.roles.add(roleId);
        }
      }
      
      await interaction.update({ 
        embeds: interaction.message.embeds,
        components: [] 
      });
      
      await interaction.followUp({ embeds: [createSuccessEmbed(`Application accepted by ${interaction.user.tag}`)] });
      
      if (user) {
        await user.send({ embeds: [createSuccessEmbed('Your application has been accepted!')] });
      }
    } else if (action === 'reject') {
      const modal = new ModalBuilder()
        .setCustomId(`app_reject_modal_${userId}`)
        .setTitle('Rejection Reason');
      
      const reasonInput = new TextInputBuilder()
        .setCustomId('reject_reason')
        .setLabel('Reason for rejection')
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(true);
      
      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);
      
      await interaction.showModal(modal);
    }
  }
  
  // Application rejection reason modal
  if (interaction.isModalSubmit() && interaction.customId.startsWith('app_reject_modal_')) {
    const userId = interaction.customId.split('_')[3];
    const reason = interaction.fields.getTextInputValue('reject_reason');
    const user = await client.users.fetch(userId).catch(() => null);
    
    await interaction.update({ 
      embeds: interaction.message.embeds,
      components: [] 
    });
    
    await interaction.followUp({ embeds: [createEmbed('Application Rejected', `Reason: ${reason}\n\nRejected by ${interaction.user.tag}`)] });
    
    if (user) {
      await user.send({ embeds: [createErrorEmbed(`Your application has been rejected. Reason: ${reason}`)] });
    }
  }
  
  // Ticket system
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_selection') {
    const ticketType = interaction.values[0];
    const settings = getServerSettings(interaction.guild.id);
    
    await interaction.deferReply({ ephemeral: true });
    
    const ticketNumber = (settings.tickets.openTickets.size + 1).toString().padStart(4, '0');
    const ticketName = `ticket-${ticketType}-${ticketNumber}`;
    
    const channel = await interaction.guild.channels.create({
      name: ticketName,
      type: 0, // Text channel
      parent: interaction.channel.parentId,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: ['ViewChannel']
        },
        {
          id: interaction.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        },
        {
          id: client.user.id,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory', 'ManageChannels']
        },
        ...(settings.tickets.viewerRole ? [{
          id: settings.tickets.viewerRole,
          allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
        }] : [])
      ]
    });
    
    settings.tickets.openTickets.set(channel.id, {
      creator: interaction.user.id,
      claimedBy: null,
      type: ticketType,
      isLocked: false
    });
    
    const embed = createEmbed(
      `Ticket: ${ticketType}`,
      `**Created by**: ${interaction.user.tag}\n\nPlease describe your issue and wait for a staff member to assist you.`
    );
    
    const row = new ActionRowBuilder()
      .addComponents(
        new ButtonBuilder()
          .setCustomId('ticket_claim')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('ticket_lock')
          .setLabel('Lock')
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('ticket_close')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
      );
    
    await channel.send({ 
      content: `${interaction.user} ${settings.tickets.viewerRole ? `<@&${settings.tickets.viewerRole}>` : ''}`,
      embeds: [embed], 
      components: [row] 
    });
    
    await interaction.editReply({ 
      embeds: [createSuccessEmbed(`Your ticket has been created: ${channel}`)] 
    });
  }
  
  // Ticket buttons
  if (interaction.isButton() && interaction.customId.startsWith('ticket_')) {
    const action = interaction.customId.split('_')[1];
    const settings = getServerSettings(interaction.guild.id);
    const ticketData = settings.tickets.openTickets.get(interaction.channel.id);
    
    if (!ticketData) {
      return interaction.reply({ embeds: [createErrorEmbed('This is not a valid ticket channel.')], ephemeral: true });
    }
    
    if (action === 'claim') {
      if (ticketData.claimedBy) {
        return interaction.reply({ 
          embeds: [createErrorEmbed(`This ticket is already claimed by <@${ticketData.claimedBy}>.`)], 
          ephemeral: true 
        });
      }
      
      ticketData.claimedBy = interaction.user.id;
      settings.tickets.openTickets.set(interaction.channel.id, ticketData);
      
      await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
        ViewChannel: true,
        SendMessages: true,
        ReadMessageHistory: true
      });
      
      await interaction.update({
        embeds: interaction.message.embeds,
        components: interaction.message.components
      });
      
      await interaction.channel.send({ 
        embeds: [createSuccessEmbed(`Ticket claimed by ${interaction.user.tag}`)] 
      });
      
      await logAction(interaction.guild.id, 'Ticket Claimed', `${interaction.user.tag} claimed ticket ${interaction.channel.name}`);
    } else if (action === 'lock') {
      if (ticketData.isLocked) {
        // Unlock
        ticketData.isLocked = false;
        settings.tickets.openTickets.set(interaction.channel.id, ticketData);
        
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: null
        });
        
        await interaction.update({
          embeds: interaction.message.embeds,
          components: interaction.message.components
        });
        
        await interaction.channel.send({ 
          embeds: [createSuccessEmbed(`Ticket unlocked by ${interaction.user.tag}`)] 
        });
      } else {
        // Lock
        ticketData.isLocked = true;
        settings.tickets.openTickets.set(interaction.channel.id, ticketData);
        
        await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
          SendMessages: false
        });
        
        await interaction.update({
          embeds: interaction.message.embeds,
          components: interaction.message.components
        });
        
        await interaction.channel.send({ 
          embeds: [createSuccessEmbed(`Ticket locked by ${interaction.user.tag}`)] 
        });
      }
    } else if (action === 'close') {
      const modal = new ModalBuilder()
        .setCustomId('ticket_close_modal')
        .setTitle('Close Ticket');
      
      const reasonInput = new TextInputBuilder()
        .setCustomId('close_reason')
        .setLabel('Reason for closing')
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      
      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);
      
      await interaction.showModal(modal);
    }
  }
  
  // Ticket close modal
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_modal') {
    const reason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';
    const settings = getServerSettings(interaction.guild.id);
    const ticketData = settings.tickets.openTickets.get(interaction.channel.id);
    
    if (!ticketData) {
      return interaction.reply({ embeds: [createErrorEmbed('This is not a valid ticket channel.')], ephemeral: true });
    }
    
    const creator = await client.users.fetch(ticketData.creator).catch(() => null);
    if (creator) {
      await creator.send({ 
        embeds: [createEmbed(
          'Ticket Closed', 
          `Your ticket in ${interaction.guild.name} has been closed.\n\n**Reason**: ${reason}`
        )] 
      });
    }
    
    await interaction.channel.send({ 
      embeds: [createEmbed('Ticket Closed', `This ticket has been closed by ${interaction.user.tag}\n\n**Reason**: ${reason}`)] 
    });
    
    // Delete channel after delay
    setTimeout(() => {
      interaction.channel.delete().catch(() => {});
    }, 5000);
    
    settings.tickets.openTickets.delete(interaction.channel.id);
    await interaction.deferUpdate();
  }
  
  // Role selection dropdown
  if (interaction.isStringSelectMenu() && interaction.customId === 'role_selection') {
    const selectedRoles = interaction.values;
    
    // Remove all roles first
    for (const role of interaction.component.options) {
      const roleName = role.label;
      const existingRole = interaction.guild.roles.cache.find(r => r.name === roleName);
      if (existingRole) {
        await interaction.member.roles.remove(existingRole).catch(() => {});
      }
    }
    
    // Add selected roles
    for (const roleValue of selectedRoles) {
      const roleOption = interaction.component.options.find(opt => opt.value === roleValue);
      if (roleOption) {
        const role = interaction.guild.roles.cache.find(r => r.name === roleOption.label);
        if (role) {
          await interaction.member.roles.add(role).catch(() => {});
        }
      }
    }
    
    await interaction.reply({ 
      embeds: [createSuccessEmbed(`Your roles have been updated.`)], 
      ephemeral: true 
    });
  }
});

// Reaction role handler
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  
  // When a reaction is received, check if the reaction is a reaction role
  const settings = getServerSettings(reaction.message.guild.id);
  const emoji = reaction.emoji.toString();
  
  if (settings.reactionRoles.has(emoji)) {
    const roleId = settings.reactionRoles.get(emoji);
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    
    if (member) {
      await member.roles.add(roleId).catch(() => {});
    }
  }
});

// Reaction role removal handler
client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  
  const settings = getServerSettings(reaction.message.guild.id);
  const emoji = reaction.emoji.toString();
  
  if (settings.reactionRoles.has(emoji)) {
    const roleId = settings.reactionRoles.get(emoji);
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    
    if (member) {
      await member.roles.remove(roleId).catch(() => {});
    }
  }
});

// Birthday checker (runs daily)
function checkBirthdays() {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  birthdayData.forEach((date, userId) => {
    if (date === todayStr) {
      // Find all servers where this user is a member
      client.guilds.cache.forEach(guild => {
        const settings = getServerSettings(guild.id);
        if (settings.birthdayChannel) {
          const member = guild.members.cache.get(userId);
          if (member) {
            const channel = guild.channels.cache.get(settings.birthdayChannel);
            if (channel) {
              channel.send({ 
                embeds: [createEmbed(
                  '🎉 Happy Birthday!', 
                  `Everyone wish <@${userId}> a happy birthday! 🎂`
                )] 
              });
              
              // Send DM to the user
              member.user.send({ 
                embeds: [createEmbed(
                  '🎂 Happy Birthday!', 
                  `The ${guild.name} server wishes you a wonderful birthday!`
                )] 
              }).catch(() => {});
            }
          }
        }
      });
    }
  });
  
  // Schedule next check in 24 hours
  setTimeout(checkBirthdays, 24 * 60 * 60 * 1000);
}

// Start birthday checker on bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Start birthday checker with initial delay to align with midnight
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 0, 0, 0);
  const initialDelay = midnight - now;
  
  setTimeout(() => {
    checkBirthdays();
    // Then run every 24 hours
    setInterval(checkBirthdays, 24 * 60 * 60 * 1000);
  }, initialDelay);
});

// Keep alive server for Render
keepAlive.listen(10000, () => {
  console.log('Keep-alive server is ready.');
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);