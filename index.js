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
  AttachmentBuilder
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
  tickets: new Map(), // guildId -> ticket setup
  applications: new Map(), // guildId -> application setup
  userStates: new Map(), // userId -> game states
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

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

// Command handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const { author, content, guild } = message;
  const uid = author.id;
  const raw = content.trim();
  const lc = raw.toLowerCase();

  // Initialize user state if needed
  if (!data.userStates.has(uid)) data.userStates.set(uid, {});
  const state = data.userStates.get(uid);

  // === HELP COMMAND ===
  if (lc === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('📘 Bot Command Overview')
      .setColor('#0099ff')
      .addFields(
        {
          name: '🎟️ Ticket System',
          value: [
            '`!ticket <message>` — Set ticket message',
            '`!option <emoji> <label>` — Add a category',
            '`!ticketviewer @role` — Set viewer role',
            '`!ticketcategory #channel` — Set ticket category',
            '`!deployticketpanel` — Deploy ticket menu'
          ].join('\n')
        },
        {
          name: '📝 Application System',
          value: [
            '`!addques <question>` — Add application question',
            '`!setoptions Option|Cooldown,...` — Set options with cooldown',
            '`!setchannel #channel` — Set log channel',
            '`!deployapp` — Deploy application menu',
            '`!resetapp` — Reset application data'
          ].join('\n')
        },
        {
          name: '🎮 Mini-Games',
          value: [
            '`!guess <number>` — Guess a number (1-100)',
            '`!trivia` — Answer a trivia question',
            '`!scramble` — Unscramble word',
            '`!rps <rock|paper|scissors>` — Rock paper scissors'
          ].join('\n')
        }
      );

    return message.reply({ embeds: [embed] });
  }

  // === TICKET SYSTEM ===
  if (lc.startsWith('!ticket ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to set up tickets.');
    }
    const setup = getGuildData(guild.id, 'tickets');
    setup.description = raw.slice(8).trim();
    const att = message.attachments.first();
    setup.footerImage = att ? att.url : null;
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to add ticket options.');
    }
    const setup = getGuildData(guild.id, 'tickets');
    const args = raw.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 25) return message.reply('❌ Max 25 options allowed.');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (lc.startsWith('!ticketviewer')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to set viewer role.');
    }
    const setup = getGuildData(guild.id, 'tickets');
    const match = raw.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to set ticket category.');
    }
    const setup = getGuildData(guild.id, 'tickets');
    const match = raw.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid channel.');
    const ch = guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = ch.parentId;
    const parent = guild.channels.cache.get(setup.categoryId);
    return message.reply(`✅ Ticket category set to **${parent?.name}**.`);
  }

  if (lc === '!deployticketpanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to deploy ticket panel.');
    }
    const setup = getGuildData(guild.id, 'tickets');
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('❌ Setup incomplete. Need description, options, viewer role, and category.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');
    if (setup.footerImage) embed.setImage(setup.footerImage);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select a ticket category')
      .addOptions(setup.options.map((opt, i) => ({
        label: opt.label,
        value: `ticket_${i}`,
        emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    await message.channel.send({ embeds: [embed], components: [row] });
    return message.delete().catch(() => {});
  }

  // === APPLICATION SYSTEM ===
  if (lc.startsWith('!addques ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to add questions.');
    }
    const app = getGuildData(guild.id, 'applications');
    const question = raw.slice(9).trim();
    app.questions.push(question);
    return message.reply(`✅ Added question: ${question}`);
  }

  if (lc.startsWith('!setoptions ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to set options.');
    }
    const app = getGuildData(guild.id, 'applications');
    const optionsStr = raw.slice(11).trim();
    const optionsList = optionsStr.split(',').map(opt => opt.trim());
    
    app.options = {};
    for (const opt of optionsList) {
      if (opt.includes('|')) {
        const [name, cooldown] = opt.split('|').map(x => x.trim());
        app.options[name] = parseInt(cooldown) || 0;
      } else {
        app.options[opt] = 0;
      }
    }
    return message.reply('✅ Application options set!');
  }

  if (lc.startsWith('!setchannel ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to set channel.');
    }
    const app = getGuildData(guild.id, 'applications');
    const channelId = message.mentions.channels.first()?.id;
    if (channelId) {
      app.channelId = channelId;
      return message.reply(`✅ Application log channel set to <#${channelId}>`);
    }
    return message.reply('❌ Please mention a valid channel!');
  }

  if (lc === '!deployapp') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to deploy application.');
    }
    const app = getGuildData(guild.id, 'applications');
    if (app.questions.length === 0 || Object.keys(app.options).length === 0) {
      return message.reply('❌ Please set questions and options first!');
    }

    const embed = new EmbedBuilder()
      .setTitle('Application Menu')
      .setDescription('Click the button below to start an application!')
      .setColor('Green');

    const row = new ActionRowBuilder();
    for (const option in app.options) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`app_${option}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Primary)
      );
    }

    await message.channel.send({ embeds: [embed], components: [row] });
    return message.delete().catch(() => {});
  }

  if (lc === '!resetapp') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply('❌ You need administrator permissions to reset application.');
    }
    const app = getGuildData(guild.id, 'applications');
    app.questions = [];
    app.options = {};
    app.channelId = null;
    app.cooldowns.clear();
    return message.reply('✅ Application data has been reset!');
  }

  // === MINI-GAMES ===
  if (lc.startsWith('!guess ')) {
    const num = parseInt(raw.split(' ')[1]);
    if (isNaN(num)) return message.reply('❓ Enter a valid number.');
    
    state.guess = { 
      active: true, 
      answered: false, 
      answer: data.gameData.guessNumber 
    };

    if (num === data.gameData.guessNumber) {
      message.reply(`🎉 Correct! It was ${data.gameData.guessNumber}.`);
      data.gameData.guessNumber = Math.floor(Math.random() * 100) + 1;
      state.guess = null;
    } else {
      message.reply(num < data.gameData.guessNumber ? '🔼 Too low!' : '🔽 Too high!');
      state.guess.answered = true;
    }
    return;
  } else if (state.guess?.active && !state.guess.answered) {
    const num = parseInt(raw);
    if (!isNaN(num) && num !== state.guess.answer) {
      message.reply(num < state.guess.answer ? '🔼 Too low!' : '🔽 Too high!');
      state.guess.answered = true;
    }
    return;
  }

  if (lc === '!trivia') {
    const q = data.gameData.triviaQuestions[Math.floor(Math.random() * data.gameData.triviaQuestions.length)];
    state.trivia = { active: true, answered: false, answer: q.answer };
    return message.channel.send(`❓ ${q.question}`);
  } else if (state.trivia?.active) {
    if (raw.toLowerCase() === state.trivia.answer) {
      message.reply('✅ Correct!');
      state.trivia = null;
    } else if (!state.trivia.answered) {
      message.reply('❌ Wrong answer, try again!');
      state.trivia.answered = true;
    }
    return;
  }

  if (lc === '!scramble') {
    const word = data.gameData.scrambleWords[Math.floor(Math.random() * data.gameData.scrambleWords.length)];
    state.scramble = { active: true, answered: false, answer: word };
    return message.channel.send(`🔤 Unscramble this: **${scramble(word)}**`);
  } else if (state.scramble?.active) {
    if (raw.toLowerCase() === state.scramble.answer) {
      message.reply(`✅ Well done! The word was **${state.scramble.answer}**`);
      state.scramble = null;
    } else if (!state.scramble.answered) {
      message.reply(`❌ Nope, that's not it!`);
      state.scramble.answered = true;
    }
    return;
  }

  if (lc.startsWith('!rps ')) {
    const player = raw.split(' ')[1]?.toLowerCase();
    const opts = ['rock', 'paper', 'scissors'];
    if (!opts.includes(player)) return message.reply('🪨 📄 ✂️ Choose rock, paper, or scissors.');
    const botPick = opts[Math.floor(Math.random() * opts.length)];
    const result =
      player === botPick
        ? 'Draw!'
        : (player === 'rock' && botPick === 'scissors') ||
          (player === 'paper' && botPick === 'rock') ||
          (player === 'scissors' && botPick === 'paper')
        ? 'You win!'
        : 'I win!';
    return message.reply(`You chose **${player}**, I chose **${botPick}** → ${result}`);
  }
});

// Interaction handling
client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;

  // Ticket system interactions
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const setup = getGuildData(interaction.guild.id, 'tickets');
    if (!setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return interaction.reply({ content: '❌ Ticket system not fully configured.', ephemeral: true });
    }

    const idx = parseInt(interaction.values[0].split('_')[1]);
    const opt = setup.options[idx];
    const user = interaction.user;

    // Check for existing ticket
    const existing = interaction.guild.channels.cache.find(c =>
      c.name.startsWith(`ticket-${user.username.toLowerCase()}`)
    );
    if (existing) {
      return interaction.reply({ 
        content: `⚠️ You already have a ticket: <#${existing.id}>`, 
        ephemeral: true 
      });
    }

    // Create ticket channel
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

    // Send ticket message
    await ch.send({ 
      content: `🎫 <@${user.id}> opened **${opt.label}** ticket. <@&${setup.viewerRoleId}>`, 
      allowedMentions: { 
        users: [user.id], 
        roles: [setup.viewerRoleId] 
      } 
    });

    // Add delete button
    const delBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Delete Ticket')
        .setStyle(ButtonStyle.Danger)
    );
    await ch.send({ 
      content: '🗑️ Click to close and get transcript.', 
      components: [delBtn] 
    });

    return interaction.reply({ 
      content: `✅ Ticket created: <#${ch.id}>`, 
      ephemeral: true 
    });
  }

  // Ticket deletion
  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    const ch = interaction.channel;
    if (!ch.name.startsWith('ticket-')) return;

    // Check permissions
    const hasPermission = interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels) || 
                         interaction.member.roles.cache.has(getGuildData(interaction.guild.id, 'tickets').viewerRoleId);
    if (!hasPermission) {
      return interaction.reply({ 
        content: '❌ You need permission to delete tickets.', 
        ephemeral: true 
      });
    }

    await interaction.reply({ content: '🗂️ Generating transcript...', ephemeral: true });

    // Create transcript
    const msgs = await ch.messages.fetch({ limit: 100 });
    const transcript = [...msgs.values()]
      .reverse()
      .map(m => `${m.author.tag} [${m.createdAt.toLocaleString()}]: ${m.content}`)
      .join('\n');

    const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'transcript.txt' });

    // Send to ticket creator
    const uname = ch.name.split('-')[1];
    const member = interaction.guild.members.cache.find(m => 
      m.user.username.toLowerCase().startsWith(uname)
    );
    if (member) {
      member.send({ 
        content: `📁 Your ticket was closed by **${interaction.user.tag}**.`, 
        files: [file] 
      }).catch(() => {});
    }

    // Delete channel after delay
    setTimeout(() => ch.delete().catch(() => {}), 3000);
  }

  // Application system interactions
  if (interaction.isButton() && interaction.customId.startsWith('app_')) {
    const app = getGuildData(interaction.guild.id, 'applications');
    const option = interaction.customId.slice(4);
    const userId = interaction.user.id;

    // Check cooldown
    if (app.cooldowns.has(option) && app.cooldowns.get(option).has(userId)) {
      const remaining = app.cooldowns.get(option).get(userId) - Date.now();
      if (remaining > 0) {
        return interaction.reply({
          content: `⏳ You're on cooldown for this application. Try again in ${Math.floor(remaining / 1000)} seconds.`,
          ephemeral: true
        });
      }
    }

    // Check for active application
    const userState = data.userStates.get(userId) || {};
    if (userState.applicationActive) {
      return interaction.reply({
        content: '❌ You already have an application in progress!',
        ephemeral: true
      });
    }

    try {
      await interaction.reply({
        content: 'Check your DMs to complete the application!',
        ephemeral: true
      });

      const dmChannel = await interaction.user.createDM();
      userState.applicationActive = true;
      data.userStates.set(userId, userState);

      await dmChannel.send('**Application Started!** Please answer the following questions:');

      const responses = [];
      for (let i = 0; i < app.questions.length; i++) {
        const question = app.questions[i];
        await dmChannel.send(`**Question ${i + 1}:** ${question}`);

        try {
          const collected = await dmChannel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 300000
          });
          responses.push(collected.first().content);
        } catch {
          await dmChannel.send('⏰ Application timed out due to inactivity.');
          userState.applicationActive = false;
          data.userStates.set(userId, userState);
          return;
        }
      }

      // Application completed
      userState.applicationActive = false;
      data.userStates.set(userId, userState);

      // Set cooldown
      const cooldown = app.options[option] || 0;
      if (cooldown > 0) {
        if (!app.cooldowns.has(option)) {
          app.cooldowns.set(option, new Map());
        }
        app.cooldowns.get(option).set(userId, Date.now() + cooldown * 1000);
      }

      // Send to log channel
      if (app.channelId) {
        const logChannel = await client.channels.fetch(app.channelId);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle(`New Application: ${option}`)
            .setDescription(`From ${interaction.user} (${interaction.user.tag})`)
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

      await dmChannel.send('✅ Your application has been submitted!');
    } catch (error) {
      console.error(error);
      await interaction.followUp({
        content: '❌ I couldn\'t DM you. Please enable DMs from server members.',
        ephemeral: true
      });
    }
  }
});

process.on('unhandledRejection', err => console.error(err));
client.login(process.env.DISCORD_TOKEN);
