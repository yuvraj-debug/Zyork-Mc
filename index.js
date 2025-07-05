require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  StringSelectMenuBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  ChannelType, 
  Collection, 
  PermissionFlagsBits,
  TextInputStyle,
  ModalBuilder,
  TextInputBuilder
} = require('discord.js');
const fs = require('fs');
const path = require('path');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Initialize collections
client.ticketSettings = new Map();
client.appSettings = new Map();
client.activeApplications = new Map();
client.activeTickets = new Map();
client.cooldowns = new Map();
client.games = new Map();

// Load data from files
function loadData() {
  try {
    if (fs.existsSync('./data/tickets.json')) {
      const ticketData = JSON.parse(fs.readFileSync('./data/tickets.json', 'utf8'));
      client.ticketSettings = new Map(ticketData);
    }
  } catch (err) {
    console.error('Error loading ticket data:', err);
  }

  try {
    if (fs.existsSync('./data/applications.json')) {
      const appData = JSON.parse(fs.readFileSync('./data/applications.json', 'utf8'));
      client.appSettings = new Map(appData);
    }
  } catch (err) {
    console.error('Error loading application data:', err);
  }
}

// Save data to files
function saveData() {
  if (!fs.existsSync('./data')) {
    fs.mkdirSync('./data');
  }

  fs.writeFileSync('./data/tickets.json', JSON.stringify([...client.ticketSettings]), 'utf8');
  fs.writeFileSync('./data/applications.json', JSON.stringify([...client.appSettings]), 'utf8');
}

// Initialize games
function initializeGames() {
  client.games.set('trivia', {
    name: "Trivia Challenge",
    description: "Answer random trivia questions",
    questions: [
      {
        question: "What is the capital of France?",
        options: ["London", "Berlin", "Paris", "Madrid"],
        answer: 2
      },
      {
        question: "Which planet is known as the Red Planet?",
        options: ["Venus", "Mars", "Jupiter", "Saturn"],
        answer: 1
      }
    ],
    scores: new Map()
  });

  client.games.set('guess', {
    name: "Number Guesser",
    description: "Guess a number between 1-100",
    activeGames: new Map()
  });

  client.games.set('scramble', {
    name: "Word Scramble",
    description: "Unscramble the letters to form a word",
    words: ["discord", "javascript", "developer", "bot", "ticket", "application", "support", "moderation"],
    activeGames: new Map()
  });

  client.games.set('rps', {
    name: "Rock Paper Scissors",
    description: "Classic RPS game against the bot",
    choices: ["🪨 Rock", "📄 Paper", "✂️ Scissors"]
  });
}

// Helper function to create embeds
function createEmbed(color, title, description, fields = [], footer = null) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (fields.length > 0) {
    embed.addFields(fields);
  }

  if (footer) {
    embed.setFooter({ text: footer });
  }

  return embed;
}

// Helper function to check cooldowns
function checkCooldown(userId, commandName, cooldownSeconds) {
  if (!client.cooldowns.has(commandName)) {
    client.cooldowns.set(commandName, new Map());
  }

  const now = Date.now();
  const timestamps = client.cooldowns.get(commandName);
  const cooldownAmount = cooldownSeconds * 1000;

  if (timestamps.has(userId)) {
    const expirationTime = timestamps.get(userId) + cooldownAmount;
    if (now < expirationTime) {
      const timeLeft = (expirationTime - now) / 1000;
      return timeLeft;
    }
  }

  timestamps.set(userId, now);
  setTimeout(() => timestamps.delete(userId), cooldownAmount);
  return 0;
}

// Ticket system functions
async function createTicket(interaction, ticketType) {
  const guild = interaction.guild;
  const user = interaction.user;
  const settings = client.ticketSettings.get(guild.id);

  if (!settings || !settings.channelId || !settings.categoryId) {
    return interaction.reply({ 
      content: "Ticket system is not properly configured for this server.", 
      ephemeral: true 
    });
  }

  const category = await guild.channels.fetch(settings.categoryId);
  if (!category) {
    return interaction.reply({ 
      content: "Ticket category not found. Please contact an administrator.", 
      ephemeral: true 
    });
  }

  const ticketName = `ticket-${user.username}-${Date.now().toString().slice(-4)}`;
  const ticketChannel = await guild.channels.create({
    name: ticketName,
    type: ChannelType.GuildText,
    parent: category,
    permissionOverwrites: [
      {
        id: guild.id,
        deny: [PermissionFlagsBits.ViewChannel]
      },
      {
        id: user.id,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks
        ]
      },
      ...(settings.supportRoleId ? [{
        id: settings.supportRoleId,
        allow: [
          PermissionFlagsBits.ViewChannel,
          PermissionFlagsBits.SendMessages,
          PermissionFlagsBits.AttachFiles,
          PermissionFlagsBits.EmbedLinks,
          PermissionFlagsBits.ManageMessages
        ]
      }] : [])
    ]
  });

  client.activeTickets.set(ticketChannel.id, {
    userId: user.id,
    guildId: guild.id,
    createdAt: new Date(),
    claimedBy: null,
    closed: false
  });

  const embed = createEmbed(
    0x5865F2,
    `${ticketType || 'Support'} Ticket`,
    `Thank you for creating a ticket! Support staff will be with you shortly.\n\nPlease describe your issue in detail.`,
    [],
    `User: ${user.tag} | Ticket ID: ${ticketChannel.id}`
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('Close Ticket')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('lock_ticket')
      .setLabel('Lock Ticket')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('Claim Ticket')
      .setStyle(ButtonStyle.Success)
  );

  await ticketChannel.send({
    content: settings.supportRoleId ? `<@&${settings.supportRoleId}> <@${user.id}>` : `<@${user.id}>`,
    embeds: [embed],
    components: [buttons]
  });

  return interaction.reply({
    content: `Your ticket has been created: ${ticketChannel}`,
    ephemeral: true
  });
}

// Application system functions
async function startApplication(interaction, appType) {
  const guild = interaction.guild;
  const user = interaction.user;
  const settings = client.appSettings.get(guild.id);

  if (!settings || !settings.options || !settings.options[appType]) {
    return interaction.reply({
      content: "This application type is not available.",
      ephemeral: true
    });
  }

  const appConfig = settings.options[appType];
  const cooldown = checkCooldown(user.id, `app_${appType}`, appConfig.cooldown);

  if (cooldown > 0) {
    return interaction.reply({
      content: `You must wait ${Math.ceil(cooldown)} seconds before submitting another application for this position.`,
      ephemeral: true
    });
  }

  client.activeApplications.set(user.id, {
    guildId: guild.id,
    appType: appType,
    currentQuestion: 0,
    answers: [],
    dmChannel: null
  });

  const dmChannel = await user.createDM();
  client.activeApplications.get(user.id).dmChannel = dmChannel;

  await askApplicationQuestion(user.id);
}

async function askApplicationQuestion(userId) {
  const application = client.activeApplications.get(userId);
  if (!application) return;

  const settings = client.appSettings.get(application.guildId);
  const appConfig = settings.options[application.appType];
  const questions = settings.questions;

  if (application.currentQuestion >= questions.length) {
    await submitApplication(userId);
    return;
  }

  const currentQuestion = questions[application.currentQuestion];
  const embed = createEmbed(
    0x5865F2,
    `Application Question ${application.currentQuestion + 1}/${questions.length}`,
    currentQuestion
  );

  await application.dmChannel.send({ embeds: [embed] });
}

async function submitApplication(userId) {
  const application = client.activeApplications.get(userId);
  if (!application) return;

  const settings = client.appSettings.get(application.guildId);
  const appConfig = settings.options[application.appType];
  const user = await client.users.fetch(userId);
  const guild = await client.guilds.fetch(application.guildId);

  const embed = createEmbed(
    0x5865F2,
    `New Application: ${appConfig.label}`,
    `Applicant: ${user.tag} (${user.id})`
  );

  const fields = [];
  for (let i = 0; i < settings.questions.length; i++) {
    fields.push({
      name: `Question ${i + 1}`,
      value: settings.questions[i],
      inline: false
    });
    fields.push({
      name: `Answer ${i + 1}`,
      value: application.answers[i] || "No answer provided",
      inline: false
    });
  }

  embed.addFields(fields);

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

  const channel = await guild.channels.fetch(settings.channelId);
  if (channel) {
    await channel.send({
      content: settings.reviewRoleId ? `<@&${settings.reviewRoleId}>` : '',
      embeds: [embed],
      components: [buttons]
    });
  }

  await application.dmChannel.send({
    embeds: [createEmbed(
      0x5865F2,
      "Application Submitted",
      "Your application has been submitted for review. You will be notified of the decision."
    )]
  });

  client.activeApplications.delete(userId);
}

// Game functions
async function startTriviaGame(interaction) {
  const game = client.games.get('trivia');
  const question = game.questions[Math.floor(Math.random() * game.questions.length)];

  const embed = createEmbed(
    0xF1C40F,
    "Trivia Question",
    question.question
  );

  const buttons = new ActionRowBuilder().addComponents(
    ...question.options.map((option, index) => 
      new ButtonBuilder()
        .setCustomId(`trivia_${index}`)
        .setLabel(option)
        .setStyle(ButtonStyle.Primary)
    )
  );

  await interaction.reply({
    embeds: [embed],
    components: [buttons]
  });
}

async function startNumberGuessGame(interaction) {
  const game = client.games.get('guess');
  const number = Math.floor(Math.random() * 100) + 1;
  game.activeGames.set(interaction.user.id, {
    number: number,
    attempts: 0
  });

  await interaction.reply({
    embeds: [createEmbed(
      0xF1C40F,
      "Number Guesser",
      "I've picked a number between 1 and 100. Guess what it is!"
    )]
  });
}

// Event handlers
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
  loadData();
  initializeGames();
});

client.on('interactionCreate', async interaction => {
  if (interaction.isButton()) {
    if (interaction.customId === 'create_ticket') {
      await createTicket(interaction);
    }
    // Handle other button interactions
  } else if (interaction.isStringSelectMenu()) {
    if (interaction.customId === 'ticket_type') {
      await createTicket(interaction, interaction.values[0]);
    }
    // Handle other select menu interactions
  } else if (interaction.isModalSubmit()) {
    // Handle modal submissions
  } else if (interaction.isCommand()) {
    // Handle slash commands
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Handle prefix commands
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      case 'setchannel':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("You don't have permission to use this command.");
        }
        
        const channel = message.mentions.channels.first();
        if (!channel) {
          return message.reply("Please mention a channel.");
        }
        
        const category = channel.parent;
        if (!category) {
          return message.reply("The channel must be in a category.");
        }
        
        const settings = client.ticketSettings.get(message.guild.id) || {};
        settings.channelId = channel.id;
        settings.categoryId = category.id;
        client.ticketSettings.set(message.guild.id, settings);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Channel Set",
            `Ticket panel will be created in ${channel} and new tickets will be created in the ${category} category.`
          )]
        });
        break;
        
      case 'ticket':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("You don't have permission to use this command.");
        }
        
        const ticketMsg = args.join(' ');
        const settings = client.ticketSettings.get(message.guild.id) || {};
        settings.message = ticketMsg;
        client.ticketSettings.set(message.guild.id, settings);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Message Set",
            `The ticket panel will display:\n\n${ticketMsg}`
          )]
        });
        break;
        
      case 'setoptions':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("You don't have permission to use this command.");
        }
        
        const options = args.join(' ').split(',').map(opt => opt.trim());
        const settings = client.ticketSettings.get(message.guild.id) || {};
        settings.options = options;
        client.ticketSettings.set(message.guild.id, settings);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Options Set",
            `Ticket options:\n${options.map(opt => `- ${opt}`).join('\n')}`
          )]
        });
        break;
        
      case 'deployticketpanel':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("You don't have permission to use this command.");
        }
        
        const settings = client.ticketSettings.get(message.guild.id);
        if (!settings || !settings.channelId || !settings.message) {
          return message.reply("Ticket system is not properly configured. Use !setchannel, !ticket, and !setoptions first.");
        }
        
        const channel = await message.guild.channels.fetch(settings.channelId);
        if (!channel) {
          return message.reply("Ticket channel not found.");
        }
        
        const embed = createEmbed(
          0x5865F2,
          "Support Tickets",
          settings.message
        );
        
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_type')
          .setPlaceholder('Select a ticket type')
          .addOptions(
            settings.options.map(opt => ({
              label: opt,
              value: opt.toLowerCase().replace(/\s+/g, '_')
            }))
          );
        
        const actionRow = new ActionRowBuilder().addComponents(selectMenu);
        
        await channel.send({
          embeds: [embed],
          components: [actionRow]
        });
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Panel Deployed",
            `Ticket panel has been created in ${channel}`
          )]
        });
        break;
        
      // Add other commands similarly...
      
      case 'help':
        const helpEmbed = createEmbed(
          0x5865F2,
          "Bot Commands Help",
          "Here are all the available commands:"
        );
        
        helpEmbed.addFields(
          {
            name: "Ticket System",
            value: "`!setchannel #channel` - Set ticket channel\n`!ticket message` - Set ticket message\n`!setoptions option1,option2` - Set ticket options\n`!deployticketpanel` - Deploy ticket panel"
          },
          {
            name: "Application System",
            value: "`!app message` - Set application message\n`!ques1 question` - Add question 1\n`!addoptions Staff|1d,Media|5m` - Add application options\n`!deployapp` - Deploy application panel"
          },
          {
            name: "Utilities",
            value: "`!dm @role message` - DM a role\n`!msg message` - Send anonymous message\n`!embed color message` - Send embed message"
          },
          {
            name: "Games",
            value: "`!trivia` - Start trivia game\n`!guess` - Number guessing game\n`!scramble` - Word scramble game\n`!rps` - Rock Paper Scissors"
          }
        );
        
        message.reply({ embeds: [helpEmbed] });
        break;
        
      case 'trivia':
        await startTriviaGame(message);
        break;
        
      case 'guess':
        await startNumberGuessGame(message);
        break;
        
      // Add other game commands...
        
      default:
        message.reply("Unknown command. Use `!help` to see available commands.");
    }
  } catch (error) {
    console.error("Error handling command:", error);
    message.reply("There was an error processing your command.");
  }
});

// Start the bot
client.login(process.env.DISCORD_TOKEN);

// Keep alive for Render
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

app.get('/', (req, res) => {
  res.send('Discord Ticket Bot is running!');
});

app.listen(PORT, () => {
  console.log(`Keep-alive server running on port ${PORT}`);
});