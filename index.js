require('dotenv').config();
const express = require('express');
const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, ChannelType, PermissionFlagsBits } = require('discord.js');

const app = express();
const PORT = process.env.PORT || 3000;

// Basic HTTP server for Render
app.get('/', (req, res) => {
  res.send('Discord Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages
  ]
});

// Configurable variables
let config = {
  ticketPanel: {
    message: "Click the dropdown below to open a ticket!",
    options: [],
    channelId: null,
    viewerRole: null
  },
  application: {
    message: "Click a button below to start an application!",
    questions: [],
    options: [],
    channelId: null
  },
  colors: {
    blue: "#0099ff",
    green: "#00ff00",
    red: "#ff0000",
    yellow: "#ffff00",
    purple: "#800080"
  }
};

// Games data
const games = {
  tictactoe: {},
  hangman: {},
  trivia: {
    questions: [
      {
        question: "What is the capital of France?",
        options: ["London", "Paris", "Berlin", "Madrid"],
        answer: "Paris"
      },
      {
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        answer: "Mars"
      }
    ]
  },
  rps: {},
  guess: {}
};

// Active tickets and applications
const activeTickets = new Map();
const activeApplications = new Map();
const cooldowns = new Map();

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Helper functions
function createEmbed(title, description, color = config.colors.blue) {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

function sendConfirmation(message, content) {
  const embed = createEmbed("Success", content, config.colors.green);
  message.channel.send({ embeds: [embed] }).then(msg => {
    setTimeout(() => msg.delete(), 5000);
  });
  message.delete().catch(console.error);
}

function sendError(message, content) {
  const embed = createEmbed("Error", content, config.colors.red);
  message.channel.send({ embeds: [embed] }).then(msg => {
    setTimeout(() => msg.delete(), 5000);
  });
  message.delete().catch(console.error);
}

// Ticket system functions
async function createTicket(interaction, type) {
  const member = interaction.member;
  const guild = interaction.guild;
  
  if (!config.ticketPanel.channelId || !config.ticketPanel.viewerRole) {
    return interaction.reply({ content: "Ticket system is not properly configured.", ephemeral: true });
  }
  
  const category = guild.channels.cache.get(config.ticketPanel.channelId).parent;
  if (!category) {
    return interaction.reply({ content: "Could not find category for tickets.", ephemeral: true });
  }
  
  const ticketNumber = Math.floor(Math.random() * 90000) + 10000;
  const ticketChannel = await guild.channels.create({
    name: `ticket-${ticketNumber}`,
    type: ChannelType.GuildText,
    parent: category.id,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: member.id,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
      },
      {
        id: config.ticketPanel.viewerRole,
        allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
      }
    ]
  });
  
  activeTickets.set(ticketChannel.id, {
    creator: member.id,
    type: type,
    claimedBy: null,
    locked: false
  });
  
  const embed = createEmbed(
    `Ticket - ${type}`,
    `Thank you for creating a ticket!\n\nSupport will be with you shortly.\n\nPlease describe your issue in detail.`,
    config.colors.blue
  );
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Claim')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('lock_ticket')
      .setLabel('Lock')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close')
      .setStyle(ButtonStyle.Danger)
  );
  
  await ticketChannel.send({
    content: `${member} <@&${config.ticketPanel.viewerRole}>`,
    embeds: [embed],
    components: [buttons]
  });
  
  interaction.reply({
    content: `Your ticket has been created: ${ticketChannel}`,
    ephemeral: true
  });
}

async function closeTicket(channel, interaction, reason = "No reason provided") {
  const ticket = activeTickets.get(channel.id);
  if (!ticket) return;
  
  const creator = await client.users.fetch(ticket.creator);
  const embed = createEmbed(
    "Ticket Closed",
    `Ticket closed by ${interaction.user.tag}\nReason: ${reason}`,
    config.colors.red
  );
  
  await channel.send({ embeds: [embed] });
  
  // Create transcript (simplified version)
  const messages = await channel.messages.fetch({ limit: 100 });
  let transcript = `=== Ticket Transcript ===\n`;
  transcript += `Creator: ${creator.tag} (${creator.id})\n`;
  transcript += `Type: ${ticket.type}\n`;
  transcript += `Closed by: ${interaction.user.tag} (${interaction.user.id})\n`;
  transcript += `Reason: ${reason}\n\n`;
  
  messages.reverse().forEach(msg => {
    transcript += `[${msg.author.tag}]: ${msg.content}\n`;
  });
  
  // Send transcript to creator (simplified)
  try {
    await creator.send({
      content: "Here's your ticket transcript:",
      files: [{
        attachment: Buffer.from(transcript),
        name: `ticket-${channel.name}.txt`
      }]
    });
  } catch (err) {
    console.error("Failed to send transcript:", err);
  }
  
  // Delete channel after delay
  setTimeout(() => {
    channel.delete().catch(console.error);
  }, 5000);
  
  activeTickets.delete(channel.id);
}

// Application system functions
async function startApplication(interaction, appType) {
  const option = config.application.options.find(opt => opt.label === appType);
  if (!option) return;
  
  // Check cooldown
  const cooldownKey = `app-${interaction.user.id}-${appType}`;
  const cooldown = cooldowns.get(cooldownKey);
  
  if (cooldown && cooldown > Date.now()) {
    const remaining = Math.ceil((cooldown - Date.now()) / 1000);
    return interaction.reply({
      content: `You're on cooldown for this application. Please try again in ${remaining} seconds.`,
      ephemeral: true
    });
  }
  
  // Set cooldown
  const cooldownDuration = parseCooldown(option.cooldown);
  if (cooldownDuration > 0) {
    cooldowns.set(cooldownKey, Date.now() + cooldownDuration);
  }
  
  // Start application in DM
  try {
    const dmChannel = await interaction.user.createDM();
    const question = config.application.questions[0];
    
    if (!question) {
      return interaction.reply({
        content: "This application has no questions configured.",
        ephemeral: true
      });
    }
    
    activeApplications.set(interaction.user.id, {
      appType: appType,
      currentQuestion: 0,
      answers: []
    });
    
    await dmChannel.send(question);
    await interaction.reply({
      content: "Check your DMs to complete the application!",
      ephemeral: true
    });
  } catch (err) {
    console.error("Failed to start application:", err);
    interaction.reply({
      content: "Failed to send you a DM. Please check your privacy settings.",
      ephemeral: true
    });
  }
}

function parseCooldown(cooldownStr) {
  if (!cooldownStr) return 0;
  
  const timeUnits = {
    's': 1000,
    'm': 1000 * 60,
    'h': 1000 * 60 * 60,
    'd': 1000 * 60 * 60 * 24
  };
  
  const match = cooldownStr.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  
  const value = parseInt(match[1]);
  const unit = match[2];
  
  return value * (timeUnits[unit] || 0);
}

async function submitApplication(userId) {
  const application = activeApplications.get(userId);
  if (!application) return;
  
  const user = await client.users.fetch(userId);
  const embed = createEmbed(
    `New Application: ${application.appType}`,
    `Applicant: ${user.tag} (${user.id})`,
    config.colors.purple
  );
  
  application.answers.forEach((answer, index) => {
    const question = config.application.questions[index] || `Question ${index + 1}`;
    embed.addFields({
      name: question,
      value: answer || "No answer provided",
      inline: false
    });
  });
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${userId}`)
      .setLabel('Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`app_reject_${userId}`)
      .setLabel('Reject')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`app_ticket_${userId}`)
      .setLabel('Open Ticket')
      .setStyle(ButtonStyle.Primary)
  );
  
  const channel = client.channels.cache.get(config.application.channelId);
  if (channel) {
    await channel.send({
      content: `<@&${config.ticketPanel.viewerRole}>`,
      embeds: [embed],
      components: [buttons]
    });
  }
  
  activeApplications.delete(userId);
  user.send("Your application has been submitted! We'll review it shortly.").catch(console.error);
}

// Command handlers
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  
  // Ticket commands
  if (message.content.startsWith('!ticket ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const msg = message.content.slice(8);
    config.ticketPanel.message = msg;
    sendConfirmation(message, "Ticket panel message updated!");
  }
  
  if (message.content.startsWith('!setoptions ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const options = message.content.slice(11).split(',').map(opt => opt.trim());
    config.ticketPanel.options = options.map(opt => ({
      label: opt,
      value: opt.toLowerCase().replace(/\s+/g, '_'),
      emoji: null
    }));
    
    sendConfirmation(message, `Ticket options set to: ${options.join(', ')}`);
  }
  
  if (message.content.startsWith('!setchannel ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const channelId = message.mentions.channels.first()?.id;
    if (!channelId) {
      return sendError(message, "Please mention a valid channel.");
    }
    
    config.ticketPanel.channelId = channelId;
    sendConfirmation(message, `Ticket channel set to: <#${channelId}>`);
  }
  
  if (message.content.startsWith('!setrole ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const roleId = message.mentions.roles.first()?.id;
    if (!roleId) {
      return sendError(message, "Please mention a valid role.");
    }
    
    config.ticketPanel.viewerRole = roleId;
    sendConfirmation(message, `Ticket viewer role set to: <@&${roleId}>`);
  }
  
  if (message.content === '!deployticketpanel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    if (!config.ticketPanel.channelId) {
      return sendError(message, "Please set a ticket channel first with !setchannel");
    }
    
    const channel = message.guild.channels.cache.get(config.ticketPanel.channelId);
    if (!channel) {
      return sendError(message, "Invalid channel ID. Please set a new one with !setchannel");
    }
    
    const embed = createEmbed("Ticket System", config.ticketPanel.message);
    
    const options = config.ticketPanel.options.length > 0 
      ? config.ticketPanel.options 
      : [{ label: "General Support", value: "general_support" }];
    
    const dropdown = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder('Select a ticket type...')
        .addOptions(options)
    );
    
    await channel.send({ embeds: [embed], components: [dropdown] });
    sendConfirmation(message, "Ticket panel deployed successfully!");
  }
  
  // Application commands
  if (message.content.startsWith('!app ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const msg = message.content.slice(5);
    config.application.message = msg;
    sendConfirmation(message, "Application panel message updated!");
  }
  
  if (message.content.startsWith('!ques')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const parts = message.content.split(' ');
    const index = parseInt(parts[0].slice(5)) - 1;
    const question = parts.slice(1).join(' ');
    
    if (isNaN(index) || index < 0) {
      return sendError(message, "Invalid question number. Use !ques1, !ques2, etc.");
    }
    
    config.application.questions[index] = question;
    sendConfirmation(message, `Question ${index + 1} set to: ${question}`);
  }
  
  if (message.content.startsWith('!addoptions ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const options = message.content.slice(11).split(',').map(opt => {
      const parts = opt.trim().split('|');
      return {
        label: parts[0].trim(),
        cooldown: parts[1] ? parts[1].trim() : null
      };
    });
    
    config.application.options = options.map(opt => ({
      label: opt.label,
      value: opt.label.toLowerCase().replace(/\s+/g, '_'),
      cooldown: opt.cooldown
    }));
    
    sendConfirmation(message, `Application options added: ${options.map(opt => opt.label).join(', ')}`);
  }
  
  if (message.content === '!deployapp') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    if (!config.application.channelId) {
      return sendError(message, "Please set an application channel first with !setappchannel");
    }
    
    const channel = message.guild.channels.cache.get(config.application.channelId);
    if (!channel) {
      return sendError(message, "Invalid channel ID. Please set a new one with !setappchannel");
    }
    
    const embed = createEmbed("Application System", config.application.message);
    
    const options = config.application.options.length > 0 
      ? config.application.options 
      : [{ label: "Staff Application", value: "staff_application", cooldown: "1d" }];
    
    const buttons = new ActionRowBuilder().addComponents(
      options.map(opt => 
        new ButtonBuilder()
          .setCustomId(`start_app_${opt.value}`)
          .setLabel(opt.label)
          .setStyle(ButtonStyle.Primary)
      )
    );
    
    await channel.send({ embeds: [embed], components: [buttons] });
    sendConfirmation(message, "Application panel deployed successfully!");
  }
  
  if (message.content.startsWith('!setappchannel ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const channelId = message.mentions.channels.first()?.id;
    if (!channelId) {
      return sendError(message, "Please mention a valid channel.");
    }
    
    config.application.channelId = channelId;
    sendConfirmation(message, `Application channel set to: <#${channelId}>`);
  }
  
  // Utility commands
  if (message.content.startsWith('!dm ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const role = message.mentions.roles.first();
    const content = message.content.slice(4 + role.toString().length).trim();
    
    if (!role || !content) {
      return sendError(message, "Usage: !dm @role message");
    }
    
    const members = await message.guild.members.fetch();
    const roleMembers = members.filter(m => m.roles.cache.has(role.id));
    
    let success = 0;
    let failed = 0;
    
    for (const member of roleMembers.values()) {
      try {
        await member.send(content);
        success++;
      } catch (err) {
        failed++;
      }
    }
    
    sendConfirmation(message, `DM sent to ${success} members (${failed} failed)`);
  }
  
  if (message.content.startsWith('!msg ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const content = message.content.slice(5);
    await message.channel.send(content);
    message.delete().catch(console.error);
  }
  
  if (message.content.startsWith('!embed ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const parts = message.content.slice(7).split(' ');
    const color = parts[0];
    const content = parts.slice(1).join(' ');
    
    const embedColor = config.colors[color] || config.colors.blue;
    const embed = createEmbed("", content, embedColor);
    
    await message.channel.send({ embeds: [embed] });
    message.delete().catch(console.error);
  }
  
  // Games commands
  if (message.content.startsWith('!game ')) {
    const game = message.content.slice(6).toLowerCase();
    
    if (game === 'tictactoe') {
      // Tic Tac Toe game logic
      const embed = createEmbed("Tic Tac Toe", "React with numbers to play!", config.colors.yellow);
      message.channel.send({ embeds: [embed] });
    } 
    else if (game === 'hangman') {
      // Hangman game logic
      const embed = createEmbed("Hangman", "Guess the word by typing letters!", config.colors.yellow);
      message.channel.send({ embeds: [embed] });
    }
    else if (game === 'trivia') {
      // Trivia game logic
      const question = games.trivia.questions[0];
      const embed = createEmbed("Trivia", question.question, config.colors.yellow);
      
      const buttons = new ActionRowBuilder().addComponents(
        question.options.map((opt, i) => 
          new ButtonBuilder()
            .setCustomId(`trivia_${i}`)
            .setLabel(opt)
            .setStyle(ButtonStyle.Primary)
      ) );
      
      message.channel.send({ embeds: [embed], components: [buttons] });
    }
    else if (game === 'rps') {
      // Rock Paper Scissors game logic
      const embed = createEmbed("Rock Paper Scissors", "Choose your move!", config.colors.yellow);
      
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('rps_rock')
          .setLabel('Rock')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('rps_paper')
          .setLabel('Paper')
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('rps_scissors')
          .setLabel('Scissors')
          .setStyle(ButtonStyle.Primary)
      );
      
      message.channel.send({ embeds: [embed], components: [buttons] });
    }
    else if (game === 'guess') {
      // Number guessing game logic
      const number = Math.floor(Math.random() * 100) + 1;
      games.guess[message.channel.id] = number;
      
      const embed = createEmbed("Guess the Number", "I'm thinking of a number between 1 and 100. Guess it!", config.colors.yellow);
      message.channel.send({ embeds: [embed] });
    }
  }
  
  // Help command
  if (message.content === '!help') {
    const embed = createEmbed("Bot Commands", "Here are all available commands:", config.colors.blue);
    
    embed.addFields(
      { name: "Ticket System", value: "`!ticket [msg]` - Set ticket panel message\n`!setoptions option1, option2` - Set ticket options\n`!setchannel #channel` - Set ticket channel\n`!setrole @role` - Set ticket viewer role\n`!deployticketpanel` - Deploy ticket panel" },
      { name: "Application System", value: "`!app [msg]` - Set application message\n`!ques1 [question]` - Set question 1 (use ques2, ques3, etc.)\n`!addoptions Option1|1d, Option2|5m` - Add application options\n`!setappchannel #channel` - Set application channel\n`!deployapp` - Deploy application panel" },
      { name: "Utility", value: "`!dm @role [msg]` - DM all members with a role\n`!msg [content]` - Send a message (deletes command)\n`!embed [color] [msg]` - Send an embed message\n`!help` - Show this help menu" },
      { name: "Games", value: "`!game tictactoe` - Play Tic Tac Toe\n`!game hangman` - Play Hangman\n`!game trivia` - Play Trivia\n`!game rps` - Play Rock Paper Scissors\n`!game guess` - Play Number Guessing" }
    );
    
    message.channel.send({ embeds: [embed] });
  }
});

// Interaction handlers
client.on('interactionCreate', async interaction => {
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'create_ticket') {
      const type = interaction.values[0];
      await createTicket(interaction, type);
    }
  }
  
  if (interaction.isButton()) {
    // Ticket buttons
    if (interaction.customId === 'claim_ticket') {
      const ticket = activeTickets.get(interaction.channel.id);
      if (!ticket) return;
      
      if (ticket.claimedBy) {
        return interaction.reply({
          content: `This ticket is already claimed by <@${ticket.claimedBy}>`,
          ephemeral: true
        });
      }
      
      ticket.claimedBy = interaction.user.id;
      activeTickets.set(interaction.channel.id, ticket);
      
      const embed = createEmbed(
        "Ticket Claimed",
        `This ticket has been claimed by ${interaction.user.tag}`,
        config.colors.green
      );
      
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: "You've claimed this ticket!", ephemeral: true });
    }
    
    if (interaction.customId === 'lock_ticket') {
      const ticket = activeTickets.get(interaction.channel.id);
      if (!ticket) return;
      
      if (ticket.locked) {
        return interaction.reply({
          content: "This ticket is already locked.",
          ephemeral: true
        });
      }
      
      ticket.locked = true;
      activeTickets.set(interaction.channel.id, ticket);
      
      await interaction.channel.permissionOverwrites.edit(interaction.guild.id, {
        ViewChannel: true,
        SendMessages: false
      });
      
      const embed = createEmbed(
        "Ticket Locked",
        `This ticket has been locked by ${interaction.user.tag}`,
        config.colors.yellow
      );
      
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: "You've locked this ticket!", ephemeral: true });
    }
    
    if (interaction.customId === 'close_ticket') {
      const ticket = activeTickets.get(interaction.channel.id);
      if (!ticket) return;
      
      const modal = new ModalBuilder()
        .setCustomId('close_reason')
        .setTitle('Close Ticket');
      
      const reasonInput = new TextInputBuilder()
        .setCustomId('reason')
        .setLabel("Reason for closing (optional)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false);
      
      const row = new ActionRowBuilder().addComponents(reasonInput);
      modal.addComponents(row);
      
      await interaction.showModal(modal);
    }
    
    // Application buttons
    if (interaction.customId.startsWith('start_app_')) {
      const appType = interaction.customId.slice(10);
      await startApplication(interaction, appType);
    }
    
    if (interaction.customId.startsWith('app_accept_')) {
      const userId = interaction.customId.slice(11);
      const user = await client.users.fetch(userId);
      
      const embed = createEmbed(
        "Application Accepted",
        `Your application has been accepted by ${interaction.user.tag}`,
        config.colors.green
      );
      
      await user.send({ embeds: [embed] }).catch(console.error);
      await interaction.reply({ content: `Application accepted for <@${userId}>`, ephemeral: true });
      interaction.message.delete().catch(console.error);
    }
    
    if (interaction.customId.startsWith('app_reject_')) {
      const userId = interaction.customId.slice(11);
      const user = await client.users.fetch(userId);
      
      const embed = createEmbed(
        "Application Rejected",
        `Your application has been rejected by ${interaction.user.tag}`,
        config.colors.red
      );
      
      await user.send({ embeds: [embed] }).catch(console.error);
      await interaction.reply({ content: `Application rejected for <@${userId}>`, ephemeral: true });
      interaction.message.delete().catch(console.error);
    }
    
    if (interaction.customId.startsWith('app_ticket_')) {
      const userId = interaction.customId.slice(11);
      const member = await interaction.guild.members.fetch(userId);
      
      const ticketNumber = Math.floor(Math.random() * 90000) + 10000;
      const ticketChannel = await interaction.guild.channels.create({
        name: `app-${ticketNumber}`,
        type: ChannelType.GuildText,
        parent: config.ticketPanel.channelId ? interaction.guild.channels.cache.get(config.ticketPanel.channelId).parent : null,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: member.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
          },
          {
            id: config.ticketPanel.viewerRole,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.AttachFiles]
          }
        ]
      });
      
      const embed = createEmbed(
        "Application Follow-up",
        `Ticket created for application follow-up with ${member.user.tag}`,
        config.colors.blue
      );
      
      await ticketChannel.send({
        content: `${member} <@&${config.ticketPanel.viewerRole}>`,
        embeds: [embed]
      });
      
      await interaction.reply({
        content: `Ticket created for application follow-up: ${ticketChannel}`,
        ephemeral: true
      });
      
      interaction.message.delete().catch(console.error);
    }
    
    // Game buttons
    if (interaction.customId.startsWith('trivia_')) {
      const answerIndex = parseInt(interaction.customId.slice(7));
      const question = games.trivia.questions[0];
      
      if (question.options[answerIndex] === question.answer) {
        await interaction.reply({ content: "Correct!", ephemeral: true });
      } else {
        await interaction.reply({ content: "Wrong! The correct answer is: " + question.answer, ephemeral: true });
      }
    }
    
    if (interaction.customId.startsWith('rps_')) {
      const userChoice = interaction.customId.slice(4);
      const choices = ['rock', 'paper', 'scissors'];
      const botChoice = choices[Math.floor(Math.random() * 3)];
      
      let result;
      if (userChoice === botChoice) {
        result = "It's a tie!";
      } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
      ) {
        result = "You win!";
      } else {
        result = "I win!";
      }
      
      await interaction.reply({
        content: `You chose ${userChoice}, I chose ${botChoice}. ${result}`,
        ephemeral: true
      });
    }
  }
  
  if (interaction.isModalSubmit()) {
    if (interaction.customId === 'close_reason') {
      const reason = interaction.fields.getTextInputValue('reason') || "No reason provided";
      await closeTicket(interaction.channel, interaction, reason);
    }
  }
});

// DM message handler for applications
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (message.channel.type !== ChannelType.DM) return;
  
  const application = activeApplications.get(message.author.id);
  if (!application) return;
  
  application.answers.push(message.content);
  application.currentQuestion++;
  
  const nextQuestion = config.application.questions[application.currentQuestion];
  if (nextQuestion) {
    await message.author.send(nextQuestion);
  } else {
    await submitApplication(message.author.id);
  }
});

// Number guessing game handler
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  if (!games.guess[message.channel.id]) return;
  
  const guess = parseInt(message.content);
  if (isNaN(guess)) return;
  
  const number = games.guess[message.channel.id];
  
  if (guess === number) {
    const embed = createEmbed("Correct!", `${message.author.tag} guessed the number ${number}!`, config.colors.green);
    message.channel.send({ embeds: [embed] });
    delete games.guess[message.channel.id];
  } else if (guess < number) {
    message.reply("Too low!").then(msg => setTimeout(() => msg.delete(), 3000));
  } else {
    message.reply("Too high!").then(msg => setTimeout(() => msg.delete(), 3000));
  }
});

client.login(process.env.DISCORD_TOKEN);