require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  AttachmentBuilder,
  ChannelType
} = require('discord.js');

// Keep-alive server
const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running'));

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Data storage
const data = {
  tickets: new Map(),
  applications: new Map(),
  userStates: new Map(),
  gameData: {
    guessNumber: Math.floor(Math.random() * 100) + 1,
    scrambleWords: ['banana', 'elephant', 'discord', 'javascript', 'pirate'],
    triviaQuestions: [
      { question: 'What is the capital of France?', answer: 'paris' },
      { question: 'Which planet is known as the Red Planet?', answer: 'mars' },
      { question: '2 + 2 * 2 = ?', answer: '6' }
    ]
  }
};

// Utility functions
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

const getGuildData = (guildId, type) => {
  if (!data[type].has(guildId)) {
    data[type].set(guildId, type === 'tickets' ? {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null,
      footerImage: null
    } : {
      questions: [],
      options: {},
      channelId: null,
      cooldowns: new Map()
    });
  }
  return data[type].get(guildId);
};

// Time parsing utility
const parseTimeToMs = (timeStr) => {
  const timeUnits = {
    s: 1000,         // seconds
    m: 1000 * 60,    // minutes
    h: 1000 * 60 * 60, // hours
    d: 1000 * 60 * 60 * 24, // days
    w: 1000 * 60 * 60 * 24 * 7 // weeks
  };
  
  const match = timeStr.match(/^(\d+)([smhdw])$/i);
  if (!match) return null;
  
  const value = parseInt(match[1]);
  const unit = match[2].toLowerCase();
  return value * timeUnits[unit];
};

const formatSeconds = (seconds) => {
  if (seconds <= 0) return 'No cooldown';
  
  const days = Math.floor(seconds / 86400);
  const hours = Math.floor((seconds % 86400) / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  const parts = [];
  if (days > 0) parts.push(`${days}d`);
  if (hours > 0) parts.push(`${hours}h`);
  if (minutes > 0) parts.push(`${minutes}m`);
  if (secs > 0) parts.push(`${secs}s`);
  
  return parts.join(' ');
};

// UI Utility Functions
const createSuccessEmbed = (title, description) => new EmbedBuilder()
  .setTitle(`✅ ${title}`)
  .setDescription(description)
  .setColor('#57F287')
  .setTimestamp();

const createErrorEmbed = (title, description) => new EmbedBuilder()
  .setTitle(`❌ ${title}`)
  .setDescription(description)
  .setColor('#ED4245')
  .setTimestamp();

const createInfoEmbed = (title, description) => new EmbedBuilder()
  .setTitle(`ℹ️ ${title}`)
  .setDescription(description)
  .setColor('#3498DB')
  .setTimestamp();

const createGameEmbed = (title, description) => new EmbedBuilder()
  .setTitle(`🎮 ${title}`)
  .setDescription(description)
  .setColor('#FEE75C')
  .setTimestamp();

const createTicketEmbed = (title, description) => new EmbedBuilder()
  .setTitle(`🎟️ ${title}`)
  .setDescription(description)
  .setColor('#EB459E')
  .setTimestamp();

const createApplicationEmbed = (title, description) => new EmbedBuilder()
  .setTitle(`📝 ${title}`)
  .setDescription(description)
  .setColor('#5865F2')
  .setTimestamp();

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

// Command handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const { author, content, guild } = message;
  const uid = author.id;
  const raw = content.trim();
  const lc = raw.toLowerCase();

  if (!data.userStates.has(uid)) data.userStates.set(uid, {});
  const state = data.userStates.get(uid);

  // === HELP COMMAND ===
  if (lc === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('🌟 Bot Command Help Center')
      .setColor('#5865F2')
      .setThumbnail(client.user.displayAvatarURL())
      .setDescription('Here are all the commands you can use with this bot:')
      .addFields(
        {
          name: '🎟️ Ticket System Commands',
          value: 'Create and manage support tickets',
          inline: false
        },
        {
          name: '`!ticket <message>`',
          value: 'Set the ticket message',
          inline: true
        },
        {
          name: '`!option <emoji> <label>`',
          value: 'Add a ticket category',
          inline: true
        },
        {
          name: '`!ticketviewer @role`',
          value: 'Set ticket viewer role',
          inline: true
        },
        {
          name: '`!ticketcategory #channel`',
          value: 'Set ticket category',
          inline: true
        },
        {
          name: '`!deployticketpanel`',
          value: 'Deploy ticket menu',
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: false
        },
        {
          name: '📝 Application System Commands',
          value: 'Manage application forms',
          inline: false
        },
        {
          name: '`!addques <question>`',
          value: 'Add application question',
          inline: true
        },
        {
          name: '`!setoptions Option|Cooldown,...`',
          value: 'Set options with cooldown (e.g., Staff|1d, Mod|12h)',
          inline: true
        },
        {
          name: '`!setchannel #channel`',
          value: 'Set log channel',
          inline: true
        },
        {
          name: '`!deployapp`',
          value: 'Deploy application menu',
          inline: true
        },
        {
          name: '`!resetapp`',
          value: 'Reset application data',
          inline: true
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: false
        },
        {
          name: '🎮 Mini-Games Commands',
          value: 'Fun games to play',
          inline: false
        },
        {
          name: '`!guess <number>`',
          value: 'Guess a number (1-100)',
          inline: true
        },
        {
          name: '`!trivia`',
          value: 'Answer trivia questions',
          inline: true
        },
        {
          name: '`!scramble`',
          value: 'Unscramble the word',
          inline: true
        },
        {
          name: '`!rps <choice>`',
          value: 'Rock Paper Scissors',
          inline: true
        }
      )
      .setFooter({ 
        text: 'Made with ❤️ by yuvrajsingh0321', 
        iconURL: 'https://cdn.discordapp.com/emojis/947070959172825118.webp' 
      })
      .setTimestamp();

    return message.reply({ embeds: [embed] });
  }

  // === TICKET SYSTEM ===
  if (lc.startsWith('!ticket ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set up tickets.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    setup.description = raw.slice(8).trim();
    const att = message.attachments.first();
    setup.footerImage = att ? att.url : null;
    return message.reply({ embeds: [
      createSuccessEmbed('Ticket Message Set', 'The ticket message has been updated successfully!')
    ]});
  }

  if (lc.startsWith('!option ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to add ticket options.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    const args = raw.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply({ embeds: [
      createErrorEmbed('Invalid Usage', 'Usage: `!option <emoji> <label>`')
    ]});
    if (setup.options.length >= 25) return message.reply({ embeds: [
      createErrorEmbed('Limit Reached', 'Maximum 25 options allowed.')
    ]});
    setup.options.push({ emoji, label });
    return message.reply({ embeds: [
      createSuccessEmbed('Option Added', `Successfully added: ${emoji} ${label}`)
    ]});
  }

  if (lc.startsWith('!ticketviewer')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set viewer role.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    const match = raw.match(/<@&(\d+)>/);
    if (!match) return message.reply({ embeds: [
      createErrorEmbed('Invalid Role', 'Please mention a valid role.')
    ]});
    setup.viewerRoleId = match[1];
    return message.reply({ embeds: [
      createSuccessEmbed('Viewer Role Set', 'The ticket viewer role has been updated successfully!')
    ]});
  }

  if (lc.startsWith('!ticketcategory')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set ticket category.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    const match = raw.match(/<#(\d+)>/);
    if (!match) return message.reply({ embeds: [
      createErrorEmbed('Invalid Channel', 'Please mention a valid channel.')
    ]});
    const ch = guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply({ embeds: [
      createErrorEmbed('Invalid Category', 'The channel must be in a category.')
    ]});
    setup.categoryId = ch.parentId;
    const parent = guild.channels.cache.get(setup.categoryId);
    return message.reply({ embeds: [
      createSuccessEmbed('Category Set', `Ticket category has been set to **${parent?.name}**`)
    ]});
  }

  if (lc === '!deployticketpanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to deploy ticket panel.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    
    if (!setup.description) {
      return message.reply({ embeds: [
        createErrorEmbed('Setup Incomplete', 'Please set a ticket message first using `!ticket <message>`')
      ]});
    }
    if (!setup.options.length) {
      return message.reply({ embeds: [
        createErrorEmbed('Setup Incomplete', 'Please add ticket options first using `!option <emoji> <label>`')
      ]});
    }
    if (!setup.viewerRoleId) {
      return message.reply({ embeds: [
        createErrorEmbed('Setup Incomplete', 'Please set a viewer role first using `!ticketviewer @role`')
      ]});
    }
    if (!setup.categoryId) {
      return message.reply({ embeds: [
        createErrorEmbed('Setup Incomplete', 'Please set a category first using `!ticketcategory #channel`')
      ]});
    }

    try {
      const embed = createTicketEmbed('Open a Ticket', setup.description)
        .setImage(setup.footerImage);

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Select a ticket category')
        .addOptions(setup.options.map((opt, i) => ({
          label: opt.label,
          value: `ticket_${i}`,
          emoji: opt.emoji,
          description: `Click to open ${opt.label} ticket`
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      
      await message.channel.send({ embeds: [embed], components: [row] });
      await message.delete().catch(() => {});
      
      return message.channel.send({ embeds: [
        createSuccessEmbed('Panel Deployed', 'Ticket panel deployed successfully!')
      ]}).then(msg => {
        setTimeout(() => msg.delete(), 5000);
      });
    } catch (error) {
      console.error('Error deploying ticket panel:', error);
      return message.reply({ embeds: [
        createErrorEmbed('Deployment Failed', 'Failed to deploy ticket panel. Please check console for errors.')
      ]});
    }
  }

  // === APPLICATION SYSTEM ===
  if (lc.startsWith('!addques ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to add questions.')
      ]});
    }
    const app = getGuildData(guild.id, 'applications');
    const question = raw.slice(9).trim();
    app.questions.push(question);
    return message.reply({ embeds: [
      createSuccessEmbed('Question Added', `Added question: ${question}`)
    ]});
  }

  if (lc.startsWith('!setoptions ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set options.')
      ]});
    }
    const app = getGuildData(guild.id, 'applications');
    const optionsStr = raw.slice(11).trim();
    const optionsList = optionsStr.split(',').map(opt => opt.trim());
    
    app.options = {};
    for (const opt of optionsList) {
      if (opt.includes('|')) {
        const [name, cooldownStr] = opt.split('|').map(x => x.trim());
        // Try to parse as simple number first
        let cooldown = parseInt(cooldownStr);
        
        // If not a simple number, try to parse as time string (1d, 12h, etc.)
        if (isNaN(cooldown)) {
          const ms = parseTimeToMs(cooldownStr.toLowerCase());
          if (ms !== null) {
            cooldown = Math.floor(ms / 1000); // Convert to seconds
          } else {
            // Invalid format - default to 0
            cooldown = 0;
            message.channel.send({ embeds: [
              createErrorEmbed('Invalid Cooldown', 
                `Couldn't parse cooldown "${cooldownStr}" for option "${name}". Using 0 seconds.`)
            ]}).then(msg => setTimeout(() => msg.delete(), 5000));
          }
        }
        
        app.options[name] = cooldown > 0 ? cooldown : 0;
      } else {
        app.options[opt] = 0;
      }
    }
    
    // Format the options for display
    const formattedOptions = Object.entries(app.options).map(([name, cd]) => {
      return `• ${name}: ${formatSeconds(cd)} cooldown`;
    });
    
    return message.reply({ embeds: [
      createSuccessEmbed('Options Set', 
        `Application options updated successfully!\n\n${formattedOptions.join('\n')}`)
    ]});
  }

  if (lc.startsWith('!setchannel ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set channel.')
      ]});
    }
    const app = getGuildData(guild.id, 'applications');
    const channelId = message.mentions.channels.first()?.id;
    if (channelId) {
      app.channelId = channelId;
      return message.reply({ embeds: [
        createSuccessEmbed('Channel Set', `Application log channel set to <#${channelId}>`)
      ]});
    }
    return message.reply({ embeds: [
      createErrorEmbed('Invalid Channel', 'Please mention a valid channel!')
    ]});
  }

  if (lc === '!deployapp') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to deploy application.')
      ]});
    }
    const app = getGuildData(guild.id, 'applications');
    if (app.questions.length === 0 || Object.keys(app.options).length === 0) {
      return message.reply({ embeds: [
        createErrorEmbed('Setup Incomplete', 'Please set questions and options first!')
      ]});
    }

    const embed = createApplicationEmbed('Application Menu', 'Click the button below to start an application!');

    const row = new ActionRowBuilder();
    for (const option in app.options) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`app_${option}`)
          .setLabel(`${option} (${formatSeconds(app.options[option])})`)
          .setStyle(ButtonStyle.Primary)
      );
    }

    await message.channel.send({ embeds: [embed], components: [row] });
    return message.delete().catch(() => {});
  }

  if (lc === '!resetapp') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to reset application.')
      ]});
    }
    const app = getGuildData(guild.id, 'applications');
    app.questions = [];
    app.options = {};
    app.channelId = null;
    app.cooldowns.clear();
    return message.reply({ embeds: [
      createSuccessEmbed('Application Reset', 'Application data has been reset successfully!')
    ]});
  }

  // === MINI-GAMES ===
  if (lc.startsWith('!guess ')) {
    const num = parseInt(raw.split(' ')[1]);
    if (isNaN(num)) return message.reply({ embeds: [
      createErrorEmbed('Invalid Input', 'Please enter a valid number.')
    ]});
    
    state.guess = { 
      active: true, 
      answered: false, 
      answer: data.gameData.guessNumber 
    };

    if (num === data.gameData.guessNumber) {
      message.reply({ embeds: [
        createGameEmbed('Correct!', `🎉 You guessed it! The number was ${data.gameData.guessNumber}.`)
      ]});
      data.gameData.guessNumber = Math.floor(Math.random() * 100) + 1;
      state.guess = null;
    } else {
      message.reply({ embeds: [
        createGameEmbed(num < data.gameData.guessNumber ? 'Too Low!' : 'Too High!', 
          num < data.gameData.guessNumber ? '🔼 Try a higher number!' : '🔽 Try a lower number!')
      ]});
      state.guess.answered = true;
    }
    return;
  } else if (state.guess?.active && !state.guess.answered) {
    const num = parseInt(raw);
    if (!isNaN(num) && num !== state.guess.answer) {
      message.reply({ embeds: [
        createGameEmbed(num < state.guess.answer ? 'Too Low!' : 'Too High!', 
          num < state.guess.answer ? '🔼 Try a higher number!' : '🔽 Try a lower number!')
      ]});
      state.guess.answered = true;
    }
    return;
  }

  if (lc === '!trivia') {
    const q = data.gameData.triviaQuestions[Math.floor(Math.random() * data.gameData.triviaQuestions.length)];
    state.trivia = { active: true, answered: false, answer: q.answer };
    return message.channel.send({ embeds: [
      createGameEmbed('Trivia Question', `❓ ${q.question}`)
    ]});
  } else if (state.trivia?.active) {
    if (raw.toLowerCase() === state.trivia.answer) {
      message.reply({ embeds: [
        createGameEmbed('Correct!', '✅ You got it right!')
      ]});
      state.trivia = null;
    } else if (!state.trivia.answered) {
      message.reply({ embeds: [
        createGameEmbed('Wrong Answer', '❌ That\'s not correct, try again!')
      ]});
      state.trivia.answered = true;
    }
    return;
  }

  if (lc === '!scramble') {
    const word = data.gameData.scrambleWords[Math.floor(Math.random() * data.gameData.scrambleWords.length)];
    state.scramble = { active: true, answered: false, answer: word };
    return message.channel.send({ embeds: [
      createGameEmbed('Word Scramble', `🔤 Unscramble this word: **${scramble(word)}**`)
    ]});
  } else if (state.scramble?.active) {
    if (raw.toLowerCase() === state.scramble.answer) {
      message.reply({ embeds: [
        createGameEmbed('Correct!', `✅ Well done! The word was **${state.scramble.answer}**`)
      ]});
      state.scramble = null;
    } else if (!state.scramble.answered) {
      message.reply({ embeds: [
        createGameEmbed('Wrong Answer', '❌ Nope, that\'s not it!')
      ]});
      state.scramble.answered = true;
    }
    return;
  }

  if (lc.startsWith('!rps ')) {
    const player = raw.split(' ')[1]?.toLowerCase();
    const opts = ['rock', 'paper', 'scissors'];
    if (!opts.includes(player)) return message.reply({ embeds: [
      createErrorEmbed('Invalid Choice', 'Please choose either rock, paper, or scissors.')
    ]});
    const botPick = opts[Math.floor(Math.random() * opts.length)];
    const result =
      player === botPick
        ? 'Draw!'
        : (player === 'rock' && botPick === 'scissors') ||
          (player === 'paper' && botPick === 'rock') ||
          (player === 'scissors' && botPick === 'paper')
        ? 'You win!'
        : 'I win!';
    return message.reply({ embeds: [
      createGameEmbed('Rock Paper Scissors', 
        `You chose **${player}**, I chose **${botPick}** → ${result}`)
    ]});
  }
});

// Interaction handling
client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;

  // Ticket system interactions
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const setup = getGuildData(interaction.guild.id, 'tickets');
    if (!setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return interaction.reply({ 
        embeds: [createErrorEmbed('Setup Incomplete', 'Ticket system not fully configured.')], 
        ephemeral: true 
      });
    }

    const idx = parseInt(interaction.values[0].split('_')[1]);
    const opt = setup.options[idx];
    const user = interaction.user;

    const existing = interaction.guild.channels.cache.find(c =>
      c.name.startsWith(`ticket-${user.username.toLowerCase()}`)
    );
    if (existing) {
      return interaction.reply({ 
        embeds: [createErrorEmbed('Existing Ticket', `You already have a ticket: <#${existing.id}>`)], 
        ephemeral: true 
      });
    }

    const name = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const ch = await interaction.guild.channels.create({
      name,
      type: ChannelType.GuildText,
      parent: setup.categoryId,
      permissionOverwrites: [
        { 
          id: interaction.guild.roles.everyone, 
          deny: [PermissionsBitField.Flags.ViewChannel] 
        },
        { 
          id: user.id, 
          allow: [
            PermissionsBitField.Flags.ViewChannel, 
            PermissionsBitField.Flags.SendMessages, 
            PermissionsBitField.Flags.ReadMessageHistory
          ] 
        },
        { 
          id: setup.viewerRoleId, 
          allow: [
            PermissionsBitField.Flags.ViewChannel, 
            PermissionsBitField.Flags.SendMessages, 
            PermissionsBitField.Flags.ReadMessageHistory
          ] 
        }
      ]
    });

    await ch.send({ 
      content: `🎫 <@${user.id}> opened **${opt.label}** ticket. <@&${setup.viewerRoleId}>`, 
      allowedMentions: { 
        users: [user.id], 
        roles: [setup.viewerRoleId] 
      } 
    });

    const delBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Delete Ticket')
        .setStyle(ButtonStyle.Danger)
    );
    await ch.send({ 
      embeds: [createInfoEmbed('Ticket Controls', 'Click the button below to close this ticket and get a transcript.')],
      components: [delBtn] 
    });

    return interaction.reply({ 
      embeds: [createSuccessEmbed('Ticket Created', `Your ticket has been created: <#${ch.id}>`)],
      ephemeral: true 
    });
  }

  // Ticket deletion
  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    const ch = interaction.channel;
    if (!ch.name.startsWith('ticket-')) return;

    const hasPermission = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) || 
                         interaction.member.roles.cache.has(getGuildData(interaction.guild.id, 'tickets').viewerRoleId);
    if (!hasPermission) {
      return interaction.reply({ 
        embeds: [createErrorEmbed('Permission Denied', 'You need permission to delete tickets.')], 
        ephemeral: true 
      });
    }

    await interaction.reply({ 
      embeds: [createInfoEmbed('Processing', 'Generating transcript...')], 
      ephemeral: true 
    });

    const msgs = await ch.messages.fetch({ limit: 100 });
    const transcript = [...msgs.values()]
      .reverse()
      .map(m => `${m.author.tag} [${m.createdAt.toLocaleString()}]: ${m.content}`)
      .join('\n');

    const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'transcript.txt' });

    const uname = ch.name.split('-')[1];
    const member = interaction.guild.members.cache.find(m => 
      m.user.username.toLowerCase().startsWith(uname)
    );
    if (member) {
      member.send({ 
        embeds: [createInfoEmbed('Ticket Closed', `Your ticket was closed by **${interaction.user.tag}**.`)],
        files: [file] 
      }).catch(() => {});
    }

    setTimeout(() => ch.delete().catch(() => {}), 3000);
  }

  // Application system interactions
  if (interaction.isButton() && interaction.customId.startsWith('app_')) {
    const app = getGuildData(interaction.guild.id, 'applications');
    const option = interaction.customId.slice(4);
    const userId = interaction.user.id;

    if (app.cooldowns.has(option) && app.cooldowns.get(option).has(userId)) {
      const remaining = app.cooldowns.get(option).get(userId) - Date.now();
      if (remaining > 0) {
        return interaction.reply({
          embeds: [createErrorEmbed('Cooldown Active', 
            `You're on cooldown for this application. Try again in ${formatSeconds(Math.floor(remaining / 1000))}.`)],
          ephemeral: true
        });
      }
    }

    const userState = data.userStates.get(userId) || {};
    if (userState.applicationActive) {
      return interaction.reply({
        embeds: [createErrorEmbed('Application Active', 'You already have an application in progress!')],
        ephemeral: true
      });
    }

    try {
      await interaction.reply({
        embeds: [createInfoEmbed('Check Your DMs', 'Please check your direct messages to complete the application.')],
        ephemeral: true
      });

      const dmChannel = await interaction.user.createDM();
      userState.applicationActive = true;
      data.userStates.set(userId, userState);

      await dmChannel.send({ 
        embeds: [createApplicationEmbed('Application Started', 'Please answer the following questions:')]
      });

      const responses = [];
      for (let i = 0; i < app.questions.length; i++) {
        const question = app.questions[i];
        await dmChannel.send({ 
          embeds: [createApplicationEmbed(`Question ${i + 1}`, question)]
        });

        try {
          const collected = await dmChannel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 300000
          });
          responses.push(collected.first().content);
        } catch {
          await dmChannel.send({ 
            embeds: [createErrorEmbed('Timed Out', 'Application timed out due to inactivity.')]
          });
          userState.applicationActive = false;
          data.userStates.set(userId, userState);
          return;
        }
      }

      userState.applicationActive = false;
      data.userStates.set(userId, userState);

      const cooldown = app.options[option] || 0;
      if (cooldown > 0) {
        if (!app.cooldowns.has(option)) {
          app.cooldowns.set(option, new Map());
        }
        app.cooldowns.get(option).set(userId, Date.now() + cooldown * 1000);
      }

      if (app.channelId) {
        const logChannel = await client.channels.fetch(app.channelId);
        if (logChannel) {
          const embed = createApplicationEmbed(`New Application: ${option}`, 
            `From ${interaction.user} (${interaction.user.tag})`)
            .setColor(0x2ecc71);

          for (let i = 0; i < app.questions.length; i++) {
            embed.addFields({
              name: `Question ${i + 1}: ${app.questions[i]}`,
              value: responses[i] || 'No response',
              inline: false
            });
          }

          await logChannel.send({ embeds: [embed] });
        }
      }

      await dmChannel.send({ 
        embeds: [createSuccessEmbed('Application Submitted', 'Your application has been submitted successfully!')]
      });
    } catch (error) {
      console.error(error);
      await interaction.followUp({
        embeds: [createErrorEmbed('DM Failed', 'I couldn\'t DM you. Please enable DMs from server members.')],
        ephemeral: true
      });
    }
  }
});

process.on('unhandledRejection', err => console.error(err));
client.login(process.env.DISCORD_TOKEN);
