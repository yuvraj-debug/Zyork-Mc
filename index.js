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
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const fs = require('fs');
const path = require('path');
const express = require('express');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ]
});

// Initialize data structures
client.ticketConfigs = new Map();
client.appConfigs = new Map();
client.activeTickets = new Map();
client.activeApplications = new Map();
client.cooldowns = new Map();
client.games = new Map();

// Load data from files
function loadData() {
  try {
    if (fs.existsSync('./data/tickets.json')) {
      const data = fs.readFileSync('./data/tickets.json', 'utf8');
      client.ticketConfigs = new Map(JSON.parse(data));
    }
  } catch (err) {
    console.error('Error loading ticket data:', err);
  }

  try {
    if (fs.existsSync('./data/applications.json')) {
      const data = fs.readFileSync('./data/applications.json', 'utf8');
      client.appConfigs = new Map(JSON.parse(data));
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

  fs.writeFileSync('./data/tickets.json', JSON.stringify([...client.ticketConfigs]), 'utf8');
  fs.writeFileSync('./data/applications.json', JSON.stringify([...client.appConfigs]), 'utf8');
}

// Initialize games
function initGames() {
  // Trivia Game
  client.games.set('trivia', {
    name: "Trivia Challenge",
    description: "Test your knowledge with random questions",
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

  // Number Guessing Game
  client.games.set('guess', {
    name: "Number Guesser",
    description: "Guess a number between 1-100",
    activeGames: new Map()
  });

  // Word Scramble
  client.games.set('scramble', {
    name: "Word Scramble",
    description: "Unscramble the letters to form a word",
    words: ["discord", "javascript", "developer", "bot", "ticket"],
    activeGames: new Map()
  });

  // Rock Paper Scissors
  client.games.set('rps', {
    name: "Rock Paper Scissors",
    description: "Classic RPS game against the bot",
    choices: ["🪨 Rock", "📄 Paper", "✂️ Scissors"]
  });
}

// Helper functions
function createEmbed(color, title, description, fields = [], footer = null) {
  const embed = new EmbedBuilder()
    .setColor(color)
    .setTitle(title)
    .setDescription(description)
    .setTimestamp();

  if (fields.length > 0) embed.addFields(fields);
  if (footer) embed.setFooter({ text: footer });

  return embed;
}

function checkCooldown(userId, command, cooldownSec) {
  if (!client.cooldowns.has(command)) {
    client.cooldowns.set(command, new Map());
  }

  const now = Date.now();
  const timestamps = client.cooldowns.get(command);
  const cooldownMs = cooldownSec * 1000;

  if (timestamps.has(userId)) {
    const expiration = timestamps.get(userId) + cooldownMs;
    if (now < expiration) return (expiration - now) / 1000;
  }

  timestamps.set(userId, now);
  setTimeout(() => timestamps.delete(userId), cooldownMs);
  return 0;
}

// Ticket System Functions
async function createTicket(interaction, type = "Support") {
  const guild = interaction.guild;
  const user = interaction.user;
  const config = client.ticketConfigs.get(guild.id);

  if (!config?.channelId || !config?.categoryId) {
    return interaction.reply({ 
      content: "❌ Ticket system not configured properly", 
      ephemeral: true 
    });
  }

  const category = await guild.channels.fetch(config.categoryId);
  if (!category) {
    return interaction.reply({ 
      content: "❌ Ticket category not found", 
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
      ...(config.supportRoleId ? [{
        id: config.supportRoleId,
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
    type: type,
    createdAt: new Date(),
    claimedBy: null,
    closed: false
  });

  const embed = createEmbed(
    0x5865F2,
    `${type} Ticket`,
    `Thank you for creating a ticket! Support will assist you shortly.\n\nPlease describe your issue in detail.`,
    [],
    `User: ${user.tag} | Ticket ID: ${ticketChannel.id}`
  );

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId('close_ticket')
      .setLabel('🔒 Close')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId('lock_ticket')
      .setLabel('🔐 Lock')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId('claim_ticket')
      .setLabel('🛡️ Claim')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId('transcript_ticket')
      .setLabel('📝 Transcript')
      .setStyle(ButtonStyle.Primary)
  );

  await ticketChannel.send({
    content: config.supportRoleId ? `<@&${config.supportRoleId}> <@${user.id}>` : `<@${user.id}>`,
    embeds: [embed],
    components: [buttons]
  });

  return interaction.reply({
    content: `🎫 Your ticket has been created: ${ticketChannel}`,
    ephemeral: true
  });
}

// Application System Functions
async function startApplication(interaction, appType) {
  const guild = interaction.guild;
  const user = interaction.user;
  const config = client.appConfigs.get(guild.id);

  if (!config?.options?.[appType]) {
    return interaction.reply({
      content: "❌ This application type isn't available",
      ephemeral: true
    });
  }

  const appConfig = config.options[appType];
  const cooldown = checkCooldown(user.id, `app_${appType}`, appConfig.cooldown);

  if (cooldown > 0) {
    return interaction.reply({
      content: `⏳ You must wait ${Math.ceil(cooldown)} seconds before applying again`,
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

  await askNextQuestion(user.id);
}

async function askNextQuestion(userId) {
  const application = client.activeApplications.get(userId);
  if (!application) return;

  const config = client.appConfigs.get(application.guildId);
  const questions = config.questions || [];

  if (application.currentQuestion >= questions.length) {
    await submitApplication(userId);
    return;
  }

  const question = questions[application.currentQuestion];
  const embed = createEmbed(
    0x5865F2,
    `Application Question ${application.currentQuestion + 1}/${questions.length}`,
    question
  );

  await application.dmChannel.send({ embeds: [embed] });
}

async function submitApplication(userId) {
  const application = client.activeApplications.get(userId);
  if (!application) return;

  const config = client.appConfigs.get(application.guildId);
  const appConfig = config.options[application.appType];
  const user = await client.users.fetch(userId);
  const guild = await client.guilds.fetch(application.guildId);

  const embed = createEmbed(
    0x5865F2,
    `New Application: ${appConfig.label}`,
    `Applicant: ${user.tag} (${user.id})`
  );

  const questions = config.questions || [];
  for (let i = 0; i < questions.length; i++) {
    embed.addFields(
      { name: `Question ${i + 1}`, value: questions[i], inline: false },
      { name: `Answer ${i + 1}`, value: application.answers[i] || "No answer", inline: false }
    );
  }

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`app_accept_${userId}`)
      .setLabel('✅ Accept')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`app_reject_${userId}`)
      .setLabel('❌ Reject')
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`app_ticket_${userId}`)
      .setLabel('🎫 Open Ticket')
      .setStyle(ButtonStyle.Primary)
  );

  const channel = await guild.channels.fetch(config.channelId);
  if (channel) {
    await channel.send({
      content: config.reviewRoleId ? `<@&${config.reviewRoleId}>` : '',
      embeds: [embed],
      components: [buttons]
    });
  }

  await application.dmChannel.send({
    embeds: [createEmbed(
      0x57F287,
      "Application Submitted",
      "Your application has been submitted for review. You'll be notified of the decision."
    )]
  });

  client.activeApplications.delete(userId);
}

// Game Functions
async function startTriviaGame(interaction) {
  const game = client.games.get('trivia');
  const question = game.questions[Math.floor(Math.random() * game.questions.length)];

  const embed = createEmbed(
    0xF1C40F,
    "Trivia Question",
    question.question
  );

  const buttons = new ActionRowBuilder().addComponents(
    ...question.options.map((opt, i) => 
      new ButtonBuilder()
        .setCustomId(`trivia_${i}`)
        .setLabel(opt)
        .setStyle(ButtonStyle.Primary)
    )
  );

  await interaction.reply({
    embeds: [embed],
    components: [buttons]
  });
}

// Event Handlers
client.on('ready', () => {
  console.log(`✅ Bot logged in as ${client.user.tag}`);
  loadData();
  initGames();

  // Start keep-alive server
  const app = express();
  const PORT = process.env.PORT || 3000;
  
  app.get('/', (req, res) => {
    res.send('Discord Ticket Bot is running!');
  });
  
  app.listen(PORT, () => {
    console.log(`🌐 Keep-alive server running on port ${PORT}`);
  });
});

client.on('interactionCreate', async interaction => {
  try {
    if (interaction.isButton()) {
      if (interaction.customId === 'create_ticket') {
        await createTicket(interaction);
      }
      // Handle other button interactions
    } else if (interaction.isStringSelectMenu()) {
      if (interaction.customId === 'ticket_type') {
        await createTicket(interaction, interaction.values[0]);
      } else if (interaction.customId === 'app_select') {
        await startApplication(interaction, interaction.values[0]);
      }
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: '❌ An error occurred', ephemeral: true });
    } else {
      await interaction.reply({ content: '❌ An error occurred', ephemeral: true });
    }
  }
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  try {
    switch (command) {
      // Ticket System Commands
      case 'setchannel':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions");
        }
        
        const channel = message.mentions.channels.first();
        if (!channel) return message.reply("❌ Please mention a channel");
        
        const category = channel.parent;
        if (!category) return message.reply("❌ Channel must be in a category");
        
        const ticketConfig = client.ticketConfigs.get(message.guild.id) || {};
        ticketConfig.channelId = channel.id;
        ticketConfig.categoryId = category.id;
        client.ticketConfigs.set(message.guild.id, ticketConfig);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Channel Set",
            `Panel will appear in ${channel}\nTickets will be created in ${category}`
          )]
        }).then(msg => setTimeout(() => msg.delete(), 10000));
        break;

      case 'ticket':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions");
        }
        
        const ticketMsg = args.join(' ');
        const ticketSettings = client.ticketConfigs.get(message.guild.id) || {};
        ticketSettings.message = ticketMsg;
        client.ticketConfigs.set(message.guild.id, ticketSettings);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Message Set",
            `Panel will display:\n\n${ticketMsg}`
          )]
        }).then(msg => setTimeout(() => msg.delete(), 10000));
        break;

      case 'setoptions':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions");
        }
        
        const options = args.join(' ').split(',').map(opt => opt.trim());
        const ticketOptions = client.ticketConfigs.get(message.guild.id) || {};
        ticketOptions.options = options;
        client.ticketConfigs.set(message.guild.id, ticketOptions);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Ticket Options Set",
            `Options:\n${options.map(opt => `- ${opt}`).join('\n')}`
          )]
        }).then(msg => setTimeout(() => msg.delete(), 10000));
        break;

      case 'deployticketpanel':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions");
        }
        
        const panelConfig = client.ticketConfigs.get(message.guild.id);
        if (!panelConfig?.channelId || !panelConfig?.message) {
          return message.reply("❌ Configure ticket system first");
        }
        
        const panelChannel = await message.guild.channels.fetch(panelConfig.channelId);
        if (!panelChannel) return message.reply("❌ Channel not found");
        
        const embed = createEmbed(
          0x5865F2,
          "Support Tickets",
          panelConfig.message
        );
        
        const selectMenu = new StringSelectMenuBuilder()
          .setCustomId('ticket_type')
          .setPlaceholder('Select ticket type')
          .addOptions(
            panelConfig.options.map(opt => ({
              label: opt,
              value: opt.toLowerCase().replace(/\s+/g, '_')
            }))
          );
        
        const row = new ActionRowBuilder().addComponents(selectMenu);
        
        await panelChannel.send({ embeds: [embed], components: [row] });
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "Panel Deployed",
            `Ticket panel created in ${panelChannel}`
          )]
        }).then(msg => setTimeout(() => msg.delete(), 10000));
        break;

      // Application System Commands
      case 'app':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions");
        }
        
        const appMsg = args.join(' ');
        const appConfig = client.appConfigs.get(message.guild.id) || {};
        appConfig.message = appMsg;
        client.appConfigs.set(message.guild.id, appConfig);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "App Message Set",
            `Panel will display:\n\n${appMsg}`
          )]
        }).then(msg => setTimeout(() => msg.delete(), 10000));
        break;

      case 'addoptions':
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply("❌ You need admin permissions");
        }
        
        const appOptions = args.join(' ').split(',').map(opt => {
          const [label, cooldown] = opt.trim().split('|');
          return { label, cooldown: parseCooldown(cooldown.trim()) };
        });
        
        const appOptsConfig = client.appConfigs.get(message.guild.id) || {};
        appOptsConfig.options = appOptsConfig.options || {};
        
        appOptions.forEach(opt => {
          appOptsConfig.options[opt.label.toLowerCase().replace(/\s+/g, '_')] = {
            label: opt.label,
            cooldown: opt.cooldown
          };
        });
        
        client.appConfigs.set(message.guild.id, appOptsConfig);
        saveData();
        
        message.reply({
          embeds: [createEmbed(
            0x57F287,
            "App Options Added",
            `Options:\n${appOptions.map(opt => `- ${opt.label} (${formatCooldown(opt.cooldown)})`).join('\n')}`
          )]
        }).then(msg => setTimeout(() => msg.delete(), 10000));
        break;

      // Utility Commands
      case 'help':
        const helpEmbed = createEmbed(
          0x5865F2,
          "Bot Commands Help",
          "Here are all available commands:"
        );
        
        helpEmbed.addFields(
          {
            name: "Ticket System",
            value: "`!setchannel #channel` - Set ticket channel\n`!ticket message` - Set panel message\n`!setoptions option1,option2` - Set ticket types\n`!deployticketpanel` - Create panel"
          },
          {
            name: "Application System",
            value: "`!app message` - Set app message\n`!addoptions Role|1d,Other|30m` - Add app options\n`!deployapp` - Create app panel"
          },
          {
            name: "Utilities",
            value: "`!dm @role message` - DM a role\n`!msg message` - Send anonymous message\n`!embed color message` - Send embed\n`!help` - Show this help"
          },
          {
            name: "Games",
            value: "`!trivia` - Trivia game\n`!guess` - Number guesser\n`!scramble` - Word scramble\n`!rps` - Rock Paper Scissors"
          }
        );
        
        message.reply({ embeds: [helpEmbed] });
        break;

      // Game Commands
      case 'trivia':
        await startTriviaGame(message);
        break;

      default:
        message.reply("❌ Unknown command. Use `!help`").then(msg => setTimeout(() => msg.delete(), 5000));
    }
  } catch (error) {
    console.error('Command error:', error);
    message.reply("❌ An error occurred").then(msg => setTimeout(() => msg.delete(), 5000));
  }
});

// Helper functions for application system
function parseCooldown(input) {
  if (!input) return 0;
  
  const match = input.match(/^(\d+)([smhd])$/);
  if (!match) return 0;
  
  const num = parseInt(match[1]);
  const unit = match[2];
  
  switch (unit) {
    case 's': return num;
    case 'm': return num * 60;
    case 'h': return num * 60 * 60;
    case 'd': return num * 60 * 60 * 24;
    default: return 0;
  }
}

function formatCooldown(seconds) {
  if (seconds < 60) return `${seconds}s`;
  if (seconds < 3600) return `${Math.floor(seconds / 60)}m`;
  if (seconds < 86400) return `${Math.floor(seconds / 3600)}h`;
  return `${Math.floor(seconds / 86400)}d`;
}

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Login error:', err);
  process.exit(1);
});

// Handle process termination
process.on('SIGINT', () => {
  saveData();
  process.exit();
});

process.on('SIGTERM', () => {
  saveData();
  process.exit();
});

process.on('unhandledRejection', err => {
  console.error('Unhandled rejection:', err);
});