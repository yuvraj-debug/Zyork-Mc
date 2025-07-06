require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  ModalBuilder, 
  TextInputBuilder, 
  TextInputStyle, 
  Collection, 
  PermissionFlagsBits 
} = require('discord.js');
const express = require('express');
const keepAlive = express();
const fs = require('fs');
const path = require('path');
const mongoose = require('mongoose');
const schedule = require('node-schedule');

// Database connection
mongoose.connect(process.env.MONGODB_URI || 'mongodb://localhost/discordbot', {
  useNewUrlParser: true,
  useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
  .catch(err => console.error('MongoDB connection error:', err));

// Database schemas
const ServerSettings = mongoose.model('ServerSettings', new mongoose.Schema({
  guildId: String,
  prefix: { type: String, default: '!' },
  logChannel: String,
  triggers: { type: Array, default: [] },
  customCommands: { type: Array, default: [] },
  tags: { type: Array, default: [] },
  reactionRoles: { type: Map, of: String, default: new Map() },
  autoReacts: { type: Array, default: [] },
  autoMod: {
    invites: { type: Boolean, default: false },
    profanity: { type: Boolean, default: false },
    links: { type: Boolean, default: false },
    caps: { type: Boolean, default: false },
    mentions: { type: Boolean, default: false },
    repeats: { type: Boolean, default: false },
    spam: { type: Boolean, default: false }
  },
  applications: {
    message: String,
    options: { type: Array, default: [] },
    questions: { type: Array, default: [] },
    channel: String,
    roles: { type: Map, of: String, default: new Map() }
  },
  tickets: {
    channel: String,
    message: String,
    options: { type: Array, default: [] },
    viewerRole: String,
    openTickets: { type: Map, of: Object, default: new Map() }
  },
  levelChannel: String,
  birthdayChannel: String,
  welcomeChannel: String,
  welcomeMessage: String,
  commandRoles: { type: Map, of: String, default: new Map() },
  modRoles: { type: Array, default: [] },
  muteRole: String,
  createdAt: { type: Date, default: Date.now }
}));

const UserData = mongoose.model('UserData', new mongoose.Schema({
  userId: String,
  guildId: String,
  xp: { type: Number, default: 0 },
  level: { type: Number, default: 1 },
  birthday: String,
  warnings: { type: Number, default: 0 },
  mutes: { type: Number, default: 0 },
  kicks: { type: Number, default: 0 },
  bans: { type: Number, default: 0 },
  lastSeen: { type: Date, default: Date.now }
}));

const Ticket = mongoose.model('Ticket', new mongoose.Schema({
  channelId: String,
  guildId: String,
  creatorId: String,
  claimerId: String,
  type: String,
  status: { type: String, default: 'open' },
  createdAt: { type: Date, default: Date.now },
  closedAt: Date,
  closedBy: String,
  closeReason: String
}));

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildModeration
  ],
  partials: ['MESSAGE', 'CHANNEL', 'REACTION']
});

// Command handling
client.commands = new Collection();
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
  const filePath = path.join(commandsPath, file);
  const command = require(filePath);
  client.commands.set(command.name, command);
}

// Event handling
const eventsPath = path.join(__dirname, 'events');
const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));

for (const file of eventFiles) {
  const filePath = path.join(eventsPath, file);
  const event = require(filePath);
  if (event.once) {
    client.once(event.name, (...args) => event.execute(...args, client));
  } else {
    client.on(event.name, (...args) => event.execute(...args, client));
  }
}

// Helper functions
async function getServerSettings(guildId) {
  let settings = await ServerSettings.findOne({ guildId });
  if (!settings) {
    settings = new ServerSettings({ guildId });
    await settings.save();
  }
  return settings;
}

async function getUserData(userId, guildId) {
  let userData = await UserData.findOne({ userId, guildId });
  if (!userData) {
    userData = new UserData({ userId, guildId });
    await userData.save();
  }
  return userData;
}

async function createEmbed(title, description, color = '#0099ff', fields = [], footer = null, thumbnail = null) {
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

function createErrorEmbed(description) {
  return createEmbed('Error', description, '#ff0000');
}

function createSuccessEmbed(description) {
  return createEmbed('Success', description, '#00ff00');
}

async function logAction(guildId, action, details) {
  const settings = await getServerSettings(guildId);
  if (!settings.logChannel) return;

  const logChannel = await client.channels.fetch(settings.logChannel).catch(() => null);
  if (!logChannel) return;

  const embed = createEmbed(`Action Log: ${action}`, details, '#ffff00');
  await logChannel.send({ embeds: [embed] });
}

// XP System
async function addXP(userId, guildId) {
  const userData = await getUserData(userId, guildId);
  const xpToAdd = Math.floor(Math.random() * 11) + 15; // 15-25 XP
  
  userData.xp += xpToAdd;
  const neededXP = userData.level * 100;
  
  if (userData.xp >= neededXP) {
    userData.level++;
    userData.xp = 0;
    await userData.save();
    
    const settings = await getServerSettings(guildId);
    if (settings.levelChannel) {
      const channel = await client.channels.fetch(settings.levelChannel).catch(() => null);
      if (channel) {
        const user = await client.users.fetch(userId).catch(() => null);
        if (user) {
          await channel.send({ 
            embeds: [createSuccessEmbed(`${user} has leveled up to level ${userData.level}! 🎉`)] 
          });
        }
      }
    }
    
    return { leveledUp: true, level: userData.level };
  }
  
  await userData.save();
  return { leveledUp: false };
}

// Message event handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const settings = await getServerSettings(message.guild.id);
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
          await muteUser(message.author.id, message.guild.id, message.member, duration, `Trigger: ${trigger.keyword}`);
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
    return;
  }

  if (settings.autoMod.caps && message.content.length > 10 && message.content === message.content.toUpperCase()) {
    await message.delete().catch(() => {});
    await message.author.send('Excessive caps are not allowed in this server.').catch(() => {});
    await logAction(message.guild.id, 'AutoMod - All Caps', `${message.author.tag} posted an all-caps message`);
    return;
  }

  if (settings.autoMod.spam && isSpam(message)) {
    await message.delete().catch(() => {});
    await message.author.send('Spamming is not allowed in this server.').catch(() => {});
    await logAction(message.guild.id, 'AutoMod - Spam', `${message.author.tag} was detected spamming`);
    return;
  }

  // XP system - only if not a command
  if (!message.content.startsWith(prefix)) {
    await addXP(message.author.id, message.guild.id);
    return;
  }

  // Command handling
  const args = message.content.slice(prefix.length).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  const command = client.commands.get(commandName) || 
    client.commands.find(cmd => cmd.aliases && cmd.aliases.includes(commandName));

  if (!command) return;

  // Check permissions
  if (command.permissions) {
    const authorPerms = message.channel.permissionsFor(message.author);
    if (!authorPerms || !authorPerms.has(command.permissions)) {
      return message.reply({ 
        embeds: [createErrorEmbed('You do not have permission to use this command.')] 
      });
    }
  }

  // Check command roles
  if (settings.commandRoles.has(command.name)) {
    const requiredRoleId = settings.commandRoles.get(command.name);
    const member = await message.guild.members.fetch(message.author.id).catch(() => null);
    if (!member || !member.roles.cache.has(requiredRoleId)) {
      return message.reply({ 
        embeds: [createErrorEmbed('You do not have permission to use this command.')] 
      });
    }
  }

  // Check cooldown
  if (command.cooldown) {
    const now = Date.now();
    const timestamps = client.cooldowns.get(command.name) || new Collection();
    const cooldownAmount = (command.cooldown || 3) * 1000;

    if (timestamps.has(message.author.id)) {
      const expirationTime = timestamps.get(message.author.id) + cooldownAmount;

      if (now < expirationTime) {
        const timeLeft = (expirationTime - now) / 1000;
        return message.reply({ 
          embeds: [createErrorEmbed(`Please wait ${timeLeft.toFixed(1)} more seconds before reusing the \`${command.name}\` command.`)] 
        });
      }
    }

    timestamps.set(message.author.id, now);
    client.cooldowns.set(command.name, timestamps);
  }

  // Execute command
  try {
    await command.execute(message, args, client);
  } catch (error) {
    console.error(`Error executing command ${command.name}:`, error);
    await message.reply({ 
      embeds: [createErrorEmbed('There was an error trying to execute that command!')] 
    });
  }
});

// Interaction handlers
client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;

  if (interaction.isButton()) {
    if (interaction.customId.startsWith('app_')) {
      await handleApplicationButton(interaction);
    } else if (interaction.customId.startsWith('ticket_')) {
      await handleTicketButton(interaction);
    }
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'role_selection') {
      await handleRoleSelection(interaction);
    } else if (interaction.customId === 'ticket_selection') {
      await handleTicketSelection(interaction);
    }
  } else if (interaction.isModalSubmit()) {
    if (interaction.customId.startsWith('app_reject_modal_')) {
      await handleAppRejectModal(interaction);
    } else if (interaction.customId === 'ticket_close_modal') {
      await handleTicketCloseModal(interaction);
    }
  }
});

// Application system handlers
async function handleApplicationButton(interaction) {
  const settings = await getServerSettings(interaction.guild.id);
  const appType = interaction.customId.replace('app_', '');
  
  if (appType.startsWith('accept_') || appType.startsWith('reject_')) {
    await handleAppDecision(interaction, settings);
    return;
  }

  const appSettings = settings.applications;
  
  if (appSettings.questions.length === 0) {
    return interaction.reply({ 
      embeds: [createErrorEmbed('No application questions have been set up.')], 
      ephemeral: true 
    });
  }

  await interaction.reply({ 
    embeds: [createEmbed('Application Started', 'Check your DMs to complete the application.')], 
    ephemeral: true 
  });

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
      await dmChannel.send({ 
        embeds: [createErrorEmbed('You took too long to respond. Application cancelled.')] 
      });
      return;
    }
  }

  if (!appSettings.channel) {
    return dmChannel.send({ 
      embeds: [createErrorEmbed('No application submission channel has been set up.')] 
    });
  }

  const submissionChannel = await client.channels.fetch(appSettings.channel).catch(() => null);
  if (!submissionChannel) {
    return dmChannel.send({ 
      embeds: [createErrorEmbed('Could not find the application submission channel.')] 
    });
  }

  const embed = createEmbed(
    `New Application: ${appType}`,
    `**User**: ${interaction.user.tag} (${interaction.user.id})\n\n` +
    answers.map((answer, i) => `**Q${i + 1}**: ${appSettings.questions[i]}\n**A**: ${answer}`).join('\n\n'),
    '#00ff00',
    [],
    null,
    interaction.user.displayAvatarURL()
  );

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
  await dmChannel.send({ 
    embeds: [createSuccessEmbed('Your application has been submitted!')] 
  });
}

async function handleAppDecision(interaction, settings) {
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

    await interaction.followUp({ 
      embeds: [createSuccessEmbed(`Application accepted by ${interaction.user.tag}`)] 
    });

    if (user) {
      await user.send({ 
        embeds: [createSuccessEmbed('Your application has been accepted!')] 
      });
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

async function handleAppRejectModal(interaction) {
  const userId = interaction.customId.split('_')[3];
  const reason = interaction.fields.getTextInputValue('reject_reason');
  const user = await client.users.fetch(userId).catch(() => null);

  await interaction.update({ 
    embeds: interaction.message.embeds,
    components: [] 
  });

  await interaction.followUp({ 
    embeds: [createEmbed('Application Rejected', `Reason: ${reason}\n\nRejected by ${interaction.user.tag}`, '#ff0000')] 
  });

  if (user) {
    await user.send({ 
      embeds: [createErrorEmbed(`Your application has been rejected. Reason: ${reason}`)] 
    });
  }
}

// Ticket system handlers
async function handleTicketSelection(interaction) {
  const settings = await getServerSettings(interaction.guild.id);
  const ticketType = interaction.values[0];

  await interaction.deferReply({ ephemeral: true });

  const ticketCount = await Ticket.countDocuments({ guildId: interaction.guild.id });
  const ticketNumber = (ticketCount + 1).toString().padStart(4, '0');
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

  const ticket = new Ticket({
    channelId: channel.id,
    guildId: interaction.guild.id,
    creatorId: interaction.user.id,
    type: ticketType
  });
  await ticket.save();

  const embed = createEmbed(
    `Ticket: ${ticketType}`,
    `**Created by**: ${interaction.user.tag}\n\nPlease describe your issue and wait for a staff member to assist you.`,
    '#0099ff',
    [],
    null,
    interaction.user.displayAvatarURL()
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

async function handleTicketButton(interaction) {
  const action = interaction.customId.split('_')[1];
  const ticket = await Ticket.findOne({ 
    channelId: interaction.channel.id, 
    status: 'open' 
  });

  if (!ticket) {
    return interaction.reply({ 
      embeds: [createErrorEmbed('This is not a valid ticket channel.')], 
      ephemeral: true 
    });
  }

  if (action === 'claim') {
    if (ticket.claimerId) {
      return interaction.reply({ 
        embeds: [createErrorEmbed(`This ticket is already claimed by <@${ticket.claimerId}>.`)], 
        ephemeral: true 
      });
    }

    ticket.claimerId = interaction.user.id;
    await ticket.save();

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
    const isLocked = interaction.channel.permissionsFor(interaction.guild.id).has('SendMessages');
    
    if (isLocked) {
      // Unlock
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

async function handleTicketCloseModal(interaction) {
  const reason = interaction.fields.getTextInputValue('close_reason') || 'No reason provided';
  const ticket = await Ticket.findOne({ 
    channelId: interaction.channel.id, 
    status: 'open' 
  });

  if (!ticket) {
    return interaction.reply({ 
      embeds: [createErrorEmbed('This is not a valid ticket channel.')], 
      ephemeral: true 
    });
  }

  ticket.status = 'closed';
  ticket.closedAt = new Date();
  ticket.closedBy = interaction.user.id;
  ticket.closeReason = reason;
  await ticket.save();

  const creator = await client.users.fetch(ticket.creatorId).catch(() => null);
  if (creator) {
    await creator.send({ 
      embeds: [createEmbed(
        'Ticket Closed', 
        `Your ticket in ${interaction.guild.name} has been closed.\n\n**Reason**: ${reason}`,
        '#ff0000'
      )] 
    });
  }

  await interaction.channel.send({ 
    embeds: [createEmbed(
      'Ticket Closed', 
      `This ticket has been closed by ${interaction.user.tag}\n\n**Reason**: ${reason}`,
      '#ff0000'
    )] 
  });

  // Delete channel after delay
  setTimeout(() => {
    interaction.channel.delete().catch(() => {});
  }, 5000);

  await interaction.deferUpdate();
}

// Role selection handler
async function handleRoleSelection(interaction) {
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

// Reaction role handlers
client.on('messageReactionAdd', async (reaction, user) => {
  if (user.bot) return;
  
  const settings = await getServerSettings(reaction.message.guild.id);
  const emoji = reaction.emoji.toString();
  
  if (settings.reactionRoles.has(emoji)) {
    const roleId = settings.reactionRoles.get(emoji);
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    
    if (member) {
      await member.roles.add(roleId).catch(() => {});
    }
  }
});

client.on('messageReactionRemove', async (reaction, user) => {
  if (user.bot) return;
  
  const settings = await getServerSettings(reaction.message.guild.id);
  const emoji = reaction.emoji.toString();
  
  if (settings.reactionRoles.has(emoji)) {
    const roleId = settings.reactionRoles.get(emoji);
    const member = await reaction.message.guild.members.fetch(user.id).catch(() => null);
    
    if (member) {
      await member.roles.remove(roleId).catch(() => {});
    }
  }
});

// Moderation functions
async function muteUser(userId, guildId, member, duration, reason = 'No reason provided') {
  const settings = await getServerSettings(guildId);
  if (!settings.muteRole) {
    throw new Error('No mute role has been set up for this server.');
  }

  const userData = await getUserData(userId, guildId);
  userData.mutes += 1;
  await userData.save();

  await member.roles.add(settings.muteRole, reason);
  
  // Schedule unmute
  if (duration) {
    const milliseconds = parseDuration(duration);
    if (milliseconds) {
      setTimeout(async () => {
        try {
          const currentMember = await member.guild.members.fetch(userId).catch(() => null);
          if (currentMember && currentMember.roles.cache.has(settings.muteRole)) {
            await currentMember.roles.remove(settings.muteRole, 'Mute duration expired');
          }
        } catch (error) {
          console.error('Error unmuting user:', error);
        }
      }, milliseconds);
    }
  }

  await logAction(guildId, 'User Muted', `${member.user.tag} was muted for ${duration || 'indefinitely'}. Reason: ${reason}`);
}

function parseDuration(duration) {
  const time = parseInt(duration.slice(0, -1));
  const unit = duration.slice(-1).toLowerCase();

  if (isNaN(time)) return null;

  switch (unit) {
    case 's': return time * 1000;
    case 'm': return time * 60 * 1000;
    case 'h': return time * 60 * 60 * 1000;
    case 'd': return time * 24 * 60 * 60 * 1000;
    default: return null;
  }
}

function isSpam(message) {
  // Basic spam detection - can be enhanced
  const similarMessages = message.channel.messages.cache.filter(m => 
    m.author.id === message.author.id && 
    Date.now() - m.createdTimestamp < 5000 &&
    m.content.length > 10 &&
    similarity(m.content, message.content) > 0.7
  );

  return similarMessages.size >= 3;
}

function similarity(str1, str2) {
  // Simple similarity comparison
  const set1 = new Set(str1.split(' '));
  const set2 = new Set(str2.split(' '));
  const intersection = new Set([...set1].filter(x => set2.has(x)));
  return intersection.size / Math.max(set1.size, set2.size);
}

// Birthday checker
async function checkBirthdays() {
  const today = new Date();
  const todayStr = `${String(today.getMonth() + 1).padStart(2, '0')}-${String(today.getDate()).padStart(2, '0')}`;
  
  const usersWithBirthday = await UserData.find({ birthday: todayStr });
  
  for (const userData of usersWithBirthday) {
    const guilds = client.guilds.cache.filter(g => g.members.cache.has(userData.userId));
    
    for (const guild of guilds.values()) {
      const settings = await getServerSettings(guild.id);
      if (settings.birthdayChannel) {
        const member = guild.members.cache.get(userData.userId);
        if (member) {
          const channel = guild.channels.cache.get(settings.birthdayChannel);
          if (channel) {
            await channel.send({ 
              embeds: [createEmbed(
                '🎉 Happy Birthday!', 
                `Everyone wish <@${userData.userId}> a happy birthday! 🎂`,
                '#ff00ff',
                [],
                null,
                member.user.displayAvatarURL()
              )] 
            });
            
            // Send DM to the user
            await member.user.send({ 
              embeds: [createEmbed(
                '🎂 Happy Birthday!', 
                `The ${guild.name} server wishes you a wonderful birthday!`,
                '#ff00ff'
              )] 
            }).catch(() => {});
          }
        }
      }
    }
  }
}

// Welcome new members
client.on('guildMemberAdd', async member => {
  const settings = await getServerSettings(member.guild.id);
  
  if (settings.welcomeChannel && settings.welcomeMessage) {
    const channel = member.guild.channels.cache.get(settings.welcomeChannel);
    if (channel) {
      const welcomeMessage = settings.welcomeMessage
        .replace(/{user}/g, member.toString())
        .replace(/{server}/g, member.guild.name)
        .replace(/{membercount}/g, member.guild.memberCount.toString());
      
      await channel.send(welcomeMessage);
    }
  }
  
  // Assign default role if set
  if (settings.defaultRole) {
    await member.roles.add(settings.defaultRole).catch(() => {});
  }
});

// Start birthday checker on bot ready
client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  
  // Schedule birthday check daily at midnight
  schedule.scheduleJob('0 0 * * *', checkBirthdays);
  
  // Check birthdays immediately if it's midnight
  const now = new Date();
  if (now.getHours() === 0 && now.getMinutes() === 0) {
    checkBirthdays();
  }
});

// Keep alive server for hosting
keepAlive.listen(process.env.PORT || 3000, () => {
  console.log('Keep-alive server is ready.');
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);
