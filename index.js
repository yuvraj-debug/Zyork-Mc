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
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTimestamp();
  
  if (title && title.length > 0) embed.setTitle(title);
  if (description && description.length > 0) embed.setDescription(description);
  
  return embed;
}

function sendConfirmation(message, content) {
  const embed = createEmbed("✅ Success", content, config.colors.green);
  message.channel.send({ embeds: [embed] }).then(msg => {
    setTimeout(() => msg.delete(), 5000);
  });
  message.delete().catch(console.error);
}

function sendError(message, content) {
  const embed = createEmbed("❌ Error", content, config.colors.red);
  message.channel.send({ embeds: [embed] }).then(msg => {
    setTimeout(() => msg.delete(), 5000);
  });
  message.delete().catch(console.error);
}

function parseEmoji(emojiString) {
  if (!emojiString) return null;
  
  // Check if it's a custom emoji
  const customEmojiMatch = emojiString.match(/<a?:(\w+):(\d+)>/);
  if (customEmojiMatch) {
    return {
      id: customEmojiMatch[2],
      name: customEmojiMatch[1],
      animated: emojiString.startsWith('<a:')
    };
  }
  
  // Check if it's a unicode emoji
  const unicodeEmojiMatch = emojiString.match(/\p{Emoji}/u);
  if (unicodeEmojiMatch) {
    return unicodeEmojiMatch[0];
  }
  
  return null;
}

// Ticket system functions
async function createTicket(interaction, type) {
  const member = interaction.member;
  const guild = interaction.guild;
  
  if (!config.ticketPanel.channelId || !config.ticketPanel.viewerRole) {
    return interaction.reply({ content: "Ticket system is not properly configured.", ephemeral: true });
  }
  
  const category = guild.channels.cache.get(config.ticketPanel.channelId)?.parent;
  if (!category) {
    return interaction.reply({ content: "Could not find category for tickets.", ephemeral: true });
  }
  
  const ticketNumber = Math.floor(Math.random() * 90000) + 10000;
  const ticketChannel = await guild.channels.create({
    name: `ticket-${member.user.username}-${ticketNumber}`,
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
    locked: false,
    createdAt: new Date()
  });
  
  const embed = createEmbed(
    "🎟️ Ticket Created",
    `Thank you for creating a ticket!\n\n**Type:** ${type}\n**Ticket ID:** ${ticketNumber}\n\nSupport will be with you shortly. Please describe your issue in detail.`,
    config.colors.blue
  )
  .setFooter({ text: `Opened at ${new Date().toLocaleString()}` });
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Claim')
      .setEmoji('🙋')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId('lock_ticket')
      .setLabel('Lock')
      .setEmoji('🔒')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close')
      .setEmoji('🔐')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('rate_ticket')
      .setLabel('Rate')
      .setEmoji('⭐')
      .setStyle(ButtonStyle.Success)
  );
  
  await ticketChannel.send({
    content: `${member} <@&${config.ticketPanel.viewerRole}>`,
    embeds: [embed],
    components: [buttons]
  });
  
  interaction.reply({
    content: `🎟️ Your ticket has been created: ${ticketChannel}`,
    ephemeral: true
  });
}

async function closeTicket(channel, interaction, reason = "No reason provided") {
  const ticket = activeTickets.get(channel.id);
  if (!ticket) return;
  
  const creator = await client.users.fetch(ticket.creator);
  const closedAt = new Date();
  const duration = Math.floor((closedAt - ticket.createdAt) / 1000); // in seconds
  
  // Create transcript
  const messages = await channel.messages.fetch({ limit: 100 });
  let transcript = `=== Ticket Transcript ===\n`;
  transcript += `Ticket: ${channel.name}\n`;
  transcript += `Creator: ${creator.tag} (${creator.id})\n`;
  transcript += `Type: ${ticket.type}\n`;
  transcript += `Claimed by: ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Not claimed"}\n`;
  transcript += `Closed by: ${interaction.user.tag} (${interaction.user.id})\n`;
  transcript += `Reason: ${reason}\n`;
  transcript += `Opened at: ${ticket.createdAt.toLocaleString()}\n`;
  transcript += `Closed at: ${closedAt.toLocaleString()}\n`;
  transcript += `Duration: ${Math.floor(duration / 60)}m ${duration % 60}s\n`;
  transcript += `Total messages: ${messages.size}\n\n`;
  
  messages.reverse().forEach(msg => {
    transcript += `[${msg.author.tag}] [${msg.createdAt.toLocaleString()}]: ${msg.content}\n`;
  });
  
  // Send transcript to creator
  try {
    const transcriptEmbed = createEmbed(
      "📩 Ticket Transcript",
      `Here's the transcript of your closed ticket:\n\n**Ticket Channel:** ${channel.name}\n**Closed by:** ${interaction.user.tag}\n**Reason:** ${reason}\n**Closed at:** ${closedAt.toLocaleString()}`,
      config.colors.purple
    );
    
    const ratingButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('rate_1')
        .setLabel('1★')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('rate_2')
        .setLabel('2★')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('rate_3')
        .setLabel('3★')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('rate_4')
        .setLabel('4★')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId('rate_5')
        .setLabel('5★')
        .setStyle(ButtonStyle.Secondary)
    );
    
    const feedbackEmbed = createEmbed(
      "🎟️ Your Ticket has been closed",
      `We value your feedback and would appreciate your rating of our support.\n\nPlease take a moment to share your satisfaction level by choosing a rating between 1-5 stars below. Your input is valuable to us!`,
      config.colors.blue
    )
    .addFields(
      { name: '• Ticket Information', value: `**Category:** ${ticket.type}\n**Claimed by:** ${ticket.claimedBy ? `<@${ticket.claimedBy}>` : "Not claimed"}\n**Total Messages:** ${messages.size}\n**Duration:** ${Math.floor(duration / 60)}m ${duration % 60}s` },
      { name: 'Closed at', value: closedAt.toLocaleString(), inline: true }
    );
    
    await creator.send({
      content: `📩 Here's the transcript of your closed ticket:\n\n${creator.tag} [${ticket.createdAt.toLocaleString()}]: 🎫 <@${creator.id}> opened **${ticket.type}** ticket. <@&${config.ticketPanel.viewerRole}>`,
      files: [{
        attachment: Buffer.from(transcript),
        name: `transcript-${channel.name}.txt`
      }],
      embeds: [feedbackEmbed],
      components: [ratingButtons]
    });
  } catch (err) {
    console.error("Failed to send transcript:", err);
  }
  
  // Send closing message in ticket channel
  const closeEmbed = createEmbed(
    "🎟️ Ticket Closed",
    `This ticket has been closed by ${interaction.user.tag}\n\n**Reason:** ${reason}\n\nChannel will be deleted shortly.`,
    config.colors.red
  )
  .setFooter({ text: `Closed at ${closedAt.toLocaleString()}` });
  
  await channel.send({ embeds: [closeEmbed] });
  
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
      content: `⏳ You're on cooldown for this application. Please try again in ${remaining} seconds.`,
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
        content: "❌ This application has no questions configured.",
        ephemeral: true
      });
    }
    
    activeApplications.set(interaction.user.id, {
      appType: appType,
      currentQuestion: 0,
      answers: [],
      guild: interaction.guild
    });
    
    const guild = interaction.guild;
    const dmEmbed = createEmbed(
      `📝 Application from ${guild.name}`,
      question
    )
    .setThumbnail(guild.iconURL())
    .setFooter({ text: `You're applying for: ${appType}` });
    
    await dmChannel.send({ embeds: [dmEmbed] });
    await interaction.reply({
      content: "📬 Check your DMs to complete the application!",
      ephemeral: true
    });
  } catch (err) {
    console.error("Failed to start application:", err);
    interaction.reply({
      content: "❌ Failed to send you a DM. Please check your privacy settings.",
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
  const guild = application.guild;
  
  const embed = createEmbed(
    `📄 New Application: ${application.appType}`,
    `**Applicant:** ${user.tag} (${user.id})`,
    config.colors.purple
  )
  .setThumbnail(guild.iconURL())
  .setFooter({ text: `From server: ${guild.name}` });
  
  application.answers.forEach((answer, index) => {
    const question = config.application.questions[index] || `Question ${index + 1}`;
    embed.addFields({
      name: `📌 ${question}`,
      value: answer || "No answer provided",
      inline: false
    });
  });
  
  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${userId}`)
      .setLabel('Accept')
      .setEmoji('✅')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`app_reject_${userId}`)
      .setLabel('Reject')
      .setEmoji('❌')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`app_ticket_${userId}`)
      .setLabel('Open Ticket')
      .setEmoji('🎟️')
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
  user.send({
    embeds: [
      createEmbed(
        "📩 Application Submitted",
        "Your application has been submitted! We'll review it shortly.",
        config.colors.green
      )
      .setThumbnail(guild.iconURL())
      .setFooter({ text: `From server: ${guild.name}` })
    ]
  }).catch(console.error);
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
    sendConfirmation(message, "🎟️ Ticket panel message updated!");
  }
  
  if (message.content.startsWith('!setoptions ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const options = message.content.slice(11).split(',').map(opt => {
      const parts = opt.trim().split('|');
      const emoji = parts.length > 1 ? parseEmoji(parts[1].trim()) : null;
      return {
        label: parts[0].trim(),
        value: parts[0].trim().toLowerCase().replace(/\s+/g, '_'),
        description: `Open a ${parts[0].trim()} ticket`,
        emoji: emoji
      };
    });
    
    config.ticketPanel.options = options;
    sendConfirmation(message, `🎟️ Ticket options set to: ${options.map(opt => opt.label).join(', ')}`);
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
    sendConfirmation(message, `🎟️ Ticket channel set to: <#${channelId}>`);
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
    sendConfirmation(message, `🎟️ Ticket viewer role set to: <@&${roleId}>`);
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
    
    const embed = createEmbed(
      "🎟️ Open a Ticket",
      config.ticketPanel.message,
      config.colors.blue
    );
    
    const options = config.ticketPanel.options.length > 0 
      ? config.ticketPanel.options 
      : [{ 
          label: "General Support", 
          value: "general_support",
          description: "Open a general support ticket",
          emoji: '❓'
        }];
    
    const dropdown = new ActionRowBuilder().addComponents(
      new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder('Select a ticket type...')
        .addOptions(options)
    );
    
    await channel.send({ embeds: [embed], components: [dropdown] });
    sendConfirmation(message, "🎟️ Ticket panel deployed successfully!");
  }
  
  // Application commands
  if (message.content.startsWith('!app ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const msg = message.content.slice(5);
    config.application.message = msg;
    sendConfirmation(message, "📝 Application panel message updated!");
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
    sendConfirmation(message, `📝 Question ${index + 1} set to: ${question}`);
  }
  
  if (message.content.startsWith('!addoptions ')) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendError(message, "You don't have permission to use this command.");
    }
    
    const options = message.content.slice(11).split(',').map(opt => {
      const parts = opt.trim().split('|');
      const emoji = parts.length > 2 ? parseEmoji(parts[2].trim()) : null;
      return {
        label: parts[0].trim(),
        cooldown: parts[1] ? parts[1].trim() : null,
        description: `Apply for ${parts[0].trim()} position`,
        emoji: emoji
      };
    });
    
    config.application.options = options.map(opt => ({
      label: opt.label,
      value: opt.label.toLowerCase().replace(/\s+/g, '_'),
      description: opt.description,
      cooldown: opt.cooldown,
      emoji: opt.emoji
    }));
    
    sendConfirmation(message, `📝 Application options added: ${options.map(opt => opt.label).join(', ')}`);
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
    
    const embed = createEmbed(
      "📝 Application System",
      config.application.message,
      config.colors.purple
    );
    
    const options = config.application.options.length > 0 
      ? config.application.options 
      : [{ 
          label: "Staff Application", 
          value: "staff_application", 
          description: "Apply for staff position",
          cooldown: "1d",
          emoji: '👔'
        }];
    
    const buttons = new ActionRowBuilder().addComponents(
      options.map(opt => 
        new ButtonBuilder()
          .setCustomId(`start_app_${opt.value}`)
          .setLabel(opt.label)
          .setEmoji(opt.emoji || '📝')
          .setStyle(ButtonStyle.Primary)
      )
    );
    
    await channel.send({ embeds: [embed], components: [buttons] });
    sendConfirmation(message, "📝 Application panel deployed successfully!");
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
    sendConfirmation(message, `📝 Application channel set to: <#${channelId}>`);
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
        const dmEmbed = createEmbed(
          `📩 Message from ${message.guild.name}`,
          content
        )
        .setThumbnail(message.guild.iconURL())
        .setFooter({ text: "Please do not reply to this message" });
        
        await member.send({ embeds: [dmEmbed] });
        success++;
      } catch (err) {
        failed++;
      }
    }
    
    sendConfirmation(message, `📩 DM sent to ${success} members (${failed} failed)`);
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
    const color = parts[0].toLowerCase();
    const content = parts.slice(1).join(' ');
    
    const embedColor = config.colors[color] || config.colors.blue;
    const embed = createEmbed("", content, embedColor);
    
    await message.channel.send({ embeds: [embed] });
    message.delete().catch(console.error);
  }
  
  // Game commands
  if (message.content === '!trivia') {
    const question = games.trivia.questions[0];
    const embed = createEmbed("❓ Trivia", question.question, config.colors.yellow);
    
    const buttons = new ActionRowBuilder().addComponents(
      question.options.map((opt, i) => 
        new ButtonBuilder()
          .setCustomId(`trivia_${i}`)
          .setLabel(opt)
          .setStyle(ButtonStyle.Primary)
      )
    );
    
    message.channel.send({ embeds: [embed], components: [buttons] });
  }
  else if (message.content === '!tictactoe') {
    const embed = createEmbed("⭕ Tic Tac Toe", "React with numbers to play!", config.colors.yellow);
    message.channel.send({ embeds: [embed] });
  }
  else if (message.content === '!hangman') {
    const embed = createEmbed("🧵 Hangman", "Guess the word by typing letters!", config.colors.yellow);
    message.channel.send({ embeds: [embed] });
  }
  else if (message.content === '!rps') {
    const embed = createEmbed("✂️ Rock Paper Scissors", "Choose your move!", config.colors.yellow);
    
    const buttons = new ActionRowBuilder().addComponents(
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
    
    message.channel.send({ embeds: [embed], components: [buttons] });
  }
  else if (message.content === '!guess') {
    const number = Math.floor(Math.random() * 100) + 1;
    games.guess[message.channel.id] = number;
    
    const embed = createEmbed("🔢 Guess the Number", "I'm thinking of a number between 1 and 100. Guess it!", config.colors.yellow);
    message.channel.send({ embeds: [embed] });
  }
  
  // Help command
  if (message.content === '!help') {
    const embed = createEmbed("❔ Bot Commands", "Here are all available commands:", config.colors.blue);
    
    embed.addFields(
      { 
        name: "🎟️ Ticket System", 
        value: "`!ticket [msg]` - Set ticket panel message\n`!setoptions option1|emoji, option2|emoji` - Set ticket options with optional emoji\n`!setchannel #channel` - Set ticket channel\n`!setrole @role` - Set ticket viewer role\n`!deployticketpanel` - Deploy ticket panel" 
      },
      { 
        name: "📝 Application System", 
        value: "`!app [msg]` - Set application message\n`!ques1 [question]` - Set question 1 (use ques2, ques3, etc.)\n`!addoptions Option1|1d|emoji, Option2|5m|emoji` - Add application options with cooldown and emoji\n`!setappchannel #channel` - Set application channel\n`!deployapp` - Deploy application panel" 
      },
      { 
        name: "🛠️ Utility", 
        value: "`!dm @role [msg]` - DM all members with a role\n`!msg [content]` - Send a message (deletes command)\n`!embed [color] [msg]` - Send an embed message\n`!help` - Show this help menu" 
      },
      { 
        name: "🎮 Games", 
        value: "`!trivia` - Play Trivia\n`!tictactoe` - Play Tic Tac Toe\n`!hangman` - Play Hangman\n`!rps` - Play Rock Paper Scissors\n`!guess` - Play Number Guessing" 
      }
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
          content: `❌ This ticket is already claimed by <@${ticket.claimedBy}>`,
          ephemeral: true
        });
      }
      
      ticket.claimedBy = interaction.user.id;
      activeTickets.set(interaction.channel.id, ticket);
      
      const embed = createEmbed(
        "🙋 Ticket Claimed",
        `This ticket has been claimed by ${interaction.user.tag}`,
        config.colors.green
      );
      
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: "✅ You've claimed this ticket!", ephemeral: true });
    }
    
    if (interaction.customId === 'lock_ticket') {
      const ticket = activeTickets.get(interaction.channel.id);
      if (!ticket) return;
      
      if (ticket.locked) {
        return interaction.reply({
          content: "❌ This ticket is already locked.",
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
        "🔒 Ticket Locked",
        `This ticket has been locked by ${interaction.user.tag}`,
        config.colors.yellow
      );
      
      await interaction.channel.send({ embeds: [embed] });
      await interaction.reply({ content: "✅ You've locked this ticket!", ephemeral: true });
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
    
    if (interaction.customId === 'rate_ticket') {
      const modal = new ModalBuilder()
        .setCustomId('rate_ticket_modal')
        .setTitle('Rate Your Experience');
      
      const ratingInput = new TextInputBuilder()
        .setCustomId('rating')
        .setLabel("Rating (1-5 stars)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true);
      
      const feedbackInput = new TextInputBuilder()
        .setCustomId('feedback')
        .setLabel("Additional feedback (optional)")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false);
      
      const row1 = new ActionRowBuilder().addComponents(ratingInput);
      const row2 = new ActionRowBuilder().addComponents(feedbackInput);
      modal.addComponents(row1, row2);
      
      await interaction.showModal(modal);
    }
    
    // Rating buttons
    if (interaction.customId.startsWith('rate_')) {
      const stars = parseInt(interaction.customId.split('_')[1]);
      const embed = createEmbed(
        "⭐ Thank You!",
        `You rated your ticket experience ${stars} star(s)!`,
        config.colors.green
      );
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
    }
    
    // Application buttons
    if (interaction.customId.startsWith('start_app_')) {
      const appType = interaction.customId.slice(10);
      await startApplication(interaction, appType);
    }
    
    if (interaction.customId.startsWith('app_accept_')) {
      const userId = interaction.customId.slice(11);
      const user = await client.users.fetch(userId);
      const application = activeApplications.get(userId);
      
      const embed = createEmbed(
        "✅ Application Accepted",
        `Your application has been accepted by ${interaction.user.tag}`,
        config.colors.green
      )
      .setThumbnail(interaction.guild.iconURL())
      .setFooter({ text: `From server: ${interaction.guild.name}` });
      
      await user.send({ embeds: [embed] }).catch(console.error);
      await interaction.reply({ content: `✅ Application accepted for <@${userId}>`, ephemeral: true });
      interaction.message.delete().catch(console.error);
    }
    
    if (interaction.customId.startsWith('app_reject_')) {
      const userId = interaction.customId.slice(11);
      const user = await client.users.fetch(userId);
      
      const embed = createEmbed(
        "❌ Application Rejected",
        `Your application has been rejected by ${interaction.user.tag}`,
        config.colors.red
      )
      .setThumbnail(interaction.guild.iconURL())
      .setFooter({ text: `From server: ${interaction.guild.name}` });
      
      await user.send({ embeds: [embed] }).catch(console.error);
      await interaction.reply({ content: `❌ Application rejected for <@${userId}>`, ephemeral: true });
      interaction.message.delete().catch(console.error);
    }
    
    if (interaction.customId.startsWith('app_ticket_')) {
      const userId = interaction.customId.slice(11);
      const member = await interaction.guild.members.fetch(userId);
      
      const ticketNumber = Math.floor(Math.random() * 90000) + 10000;
      const ticketChannel = await interaction.guild.channels.create({
        name: `app-${member.user.username}-${ticketNumber}`,
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
        "🎟️ Application Follow-up",
        `Ticket created for application follow-up with ${member.user.tag}`,
        config.colors.blue
      );
      
      await ticketChannel.send({
        content: `${member} <@&${config.ticketPanel.viewerRole}>`,
        embeds: [embed]
      });
      
      await interaction.reply({
        content: `🎟️ Ticket created for application follow-up: ${ticketChannel}`,
        ephemeral: true
      });
      
      interaction.message.delete().catch(console.error);
    }
    
    // Game buttons
    if (interaction.customId.startsWith('trivia_')) {
      const answerIndex = parseInt(interaction.customId.slice(7));
      const question = games.trivia.questions[0];
      
      if (question.options[answerIndex] === question.answer) {
        await interaction.reply({ content: "✅ Correct!", ephemeral: true });
      } else {
        await interaction.reply({ content: `❌ Wrong! The correct answer is: ${question.answer}`, ephemeral: true });
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
    
    if (interaction.customId === 'rate_ticket_modal') {
      const rating = interaction.fields.getTextInputValue('rating');
      const feedback = interaction.fields.getTextInputValue('feedback') || "No feedback provided";
      
      const embed = createEmbed(
        "⭐ Ticket Rating",
        `**Rating:** ${rating}/5\n**Feedback:** ${feedback}`,
        config.colors.green
      );
      
      await interaction.reply({ embeds: [embed], ephemeral: true });
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
    const dmEmbed = createEmbed(
      `📝 Application from ${application.guild.name}`,
      nextQuestion
    )
    .setThumbnail(application.guild.iconURL())
    .setFooter({ text: `You're applying for: ${application.appType}` });
    
    await message.author.send({ embeds: [dmEmbed] });
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
    const embed = createEmbed("🎉 Correct!", `${message.author.tag} guessed the number ${number}!`, config.colors.green);
    message.channel.send({ embeds: [embed] });
    delete games.guess[message.channel.id];
  } else if (guess < number) {
    message.reply("⬆️ Too low!").then(msg => setTimeout(() => msg.delete(), 3000));
  } else {
    message.reply("⬇️ Too high!").then(msg => setTimeout(() => msg.delete(), 3000));
  }
});

client.login(process.env.DISCORD_TOKEN);
