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
  ChannelType,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
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

// Time parsing utility (days only)
const parseTimeToMs = (timeStr) => {
  const match = timeStr.match(/^(\d+)d$/i);
  if (!match) return null;
  return parseInt(match[1]) * 86400000; // days to milliseconds
};

const formatCooldown = (seconds) => {
  if (seconds <= 0) return 'No cooldown';
  const days = Math.floor(seconds / 86400);
  return `${days}d`;
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

  const { author, content, guild, channel } = message;
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
          name: '`!setoptions Option|Days,...`',
          value: 'Set options with cooldown in days (e.g., Staff|1d, Mod|3d)',
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
        },
        {
          name: '\u200B',
          value: '\u200B',
          inline: false
        },
        {
          name: '🔧 Utility Commands',
          value: 'Useful utility commands',
          inline: false
        },
        {
          name: '`!dm @role <message>`',
          value: 'DM all members with a role (Admin only)',
          inline: true
        },
        {
          name: '`!msg <message>`',
          value: 'Resend your message as bot and delete original',
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

  // === ADMIN UTILITY COMMANDS ===
  if (lc.startsWith('!dm ')) {
    // Check if user is admin or has specific ID (1202998273376522331)
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator) && 
        message.author.id !== '1202998273376522331') {
      return; // Silently ignore non-admin users
    }

    const args = raw.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const messageContent = args.join(' ');

    if (!roleMention || !messageContent) {
      return message.reply({ 
        embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!dm @role <message>`')],
        ephemeral: true
      });
    }

    const roleId = roleMention.match(/<@&(\d+)>/)?.[1];
    if (!roleId) {
      return message.reply({ 
        embeds: [createErrorEmbed('Invalid Role', 'Please mention a valid role.')],
        ephemeral: true
      });
    }

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return message.reply({ 
        embeds: [createErrorEmbed('Role Not Found', 'The specified role was not found.')],
        ephemeral: true
      });
    }

    // Get all members with this role
    const members = (await guild.members.fetch()).filter(m => m.roles.cache.has(role.id));

    if (members.size === 0) {
      return message.reply({ 
        embeds: [createErrorEmbed('No Members', 'No members have this role.')],
        ephemeral: true
      });
    }

    // Send initial confirmation
    const confirmation = await message.reply({ 
      embeds: [createInfoEmbed('Processing', `Sending DM to ${members.size} members...`)],
      ephemeral: true
    });

    let successCount = 0;
    let failCount = 0;

    // Send DMs to each member
    for (const member of members.values()) {
      try {
        await member.send({
          embeds: [createInfoEmbed(`Message from ${guild.name}`, messageContent)]
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to DM ${member.user.tag}:`, error);
        failCount++;
      }
      // Small delay to avoid rate limits
      await new Promise(resolve => setTimeout(resolve, 1000));
    }

    // Update confirmation with results
    await confirmation.edit({ 
      embeds: [createSuccessEmbed('DM Complete', 
        `Successfully sent to ${successCount} members. Failed to send to ${failCount} members.`)]
    });
  }

  // === MSG COMMAND ===
  if (lc.startsWith('!msg ')) {
    const msgContent = raw.slice(5).trim();
    if (!msgContent) return;

    try {
      // Delete the original message
      await message.delete().catch(() => {});
      
      // Send the same message as the bot
      await channel.send(msgContent);
    } catch (error) {
      console.error('Error in !msg command:', error);
    }
    return;
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
        
        const ms = parseTimeToMs(cooldownStr.toLowerCase());
        if (ms !== null) {
          app.options[name] = Math.floor(ms / 1000); // Convert to seconds
        } else {
          app.options[name] = 0;
          message.channel.send({ embeds: [
            createErrorEmbed('Invalid Cooldown', 
              `Cooldown must be in days (e.g., 1d, 3d). Using 0 days for "${name}".`)
          ]}).then(msg => setTimeout(() => msg.delete(), 5000));
        }
      } else {
        app.options[opt] = 0;
      }
    }
    
    const formattedOptions = Object.entries(app.options).map(([name, cd]) => {
      return `• ${name}: ${formatCooldown(cd)} cooldown`;
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
          .setLabel(`${option} (${formatCooldown(app.options[option])})`)
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
            PermissionsBitField.Flags.ReadMessageHistory,
            PermissionsBitField.Flags.ManageMessages
          ] 
        }
      ]
    });

    // Send ticket creation message
    const ticketEmbed = new EmbedBuilder()
      .setColor('#EB459E')
      .setTitle(`🎟️ ${opt.label} Ticket`)
      .setDescription(`**Ticket created by:** ${user}\n**Category:** ${opt.label}\n\nPlease be patient while we assist you.`)
      .setFooter({ text: 'Ticket will be closed if inactive for too long' })
      .setTimestamp();

    // Create ticket control buttons
    const ticketButtons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_claim')
        .setLabel('Claim Ticket')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId('ticket_close')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔒'),
      new ButtonBuilder()
        .setCustomId('ticket_close_reason')
        .setLabel('Close with Reason')
        .setStyle(ButtonStyle.Secondary)
        .setEmoji('📝')
    );

    await ch.send({ 
      content: `🎫 <@${user.id}> opened **${opt.label}** ticket. <@&${setup.viewerRoleId}>`, 
      allowedMentions: { 
        users: [user.id], 
        roles: [setup.viewerRoleId] 
      },
      embeds: [ticketEmbed],
      components: [ticketButtons]
    });

    return interaction.reply({ 
      embeds: [createSuccessEmbed('Ticket Created', `Your ticket has been created: <#${ch.id}>`)],
      ephemeral: true 
    });
  }

  // Ticket button interactions
  if (interaction.isButton()) {
    const ch = interaction.channel;
    if (!ch.name.startsWith('ticket-')) return;

    const setup = getGuildData(interaction.guild.id, 'tickets');
    const isStaff = interaction.member.roles.cache.has(setup.viewerRoleId) || 
                    interaction.member.permissions.has(PermissionsBitField.Flags.ManageChannels);
    const isTicketOwner = ch.permissionOverwrites.cache.get(interaction.user.id)?.allow.has(PermissionsBitField.Flags.ViewChannel);

    switch (interaction.customId) {
      case 'ticket_claim': {
        if (!isStaff) {
          return interaction.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'Only staff can claim tickets.')], 
            ephemeral: true 
          });
        }

        // Update permissions to remove other staff and add this staff member
        await ch.permissionOverwrites.set([
          {
            id: interaction.guild.roles.everyone,
            deny: [PermissionsBitField.Flags.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.ReadMessageHistory,
              PermissionsBitField.Flags.ManageMessages
            ]
          },
          ...ch.permissionOverwrites.cache
            .filter(overwrite => overwrite.type === 1 && overwrite.id !== interaction.user.id)
            .map(overwrite => ({
              id: overwrite.id,
              deny: [PermissionsBitField.Flags.ViewChannel]
            }))
        ]);

        await interaction.reply({ 
          embeds: [createSuccessEmbed('Ticket Claimed', `${interaction.user} has claimed this ticket!`)],
          allowedMentions: { users: [interaction.user.id] }
        });

        // Disable the claim button
        const newButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('ticket_claim')
            .setLabel('Claimed')
            .setStyle(ButtonStyle.Success)
            .setEmoji('✅')
            .setDisabled(true),
          new ButtonBuilder()
            .setCustomId('ticket_close')
            .setLabel('Close')
            .setStyle(ButtonStyle.Danger)
            .setEmoji('🔒'),
          new ButtonBuilder()
            .setCustomId('ticket_close_reason')
            .setLabel('Close with Reason')
            .setStyle(ButtonStyle.Secondary)
            .setEmoji('📝')
        );

        const msg = await ch.messages.fetch({ limit: 1 }).then(messages => messages.first());
        if (msg) {
          await msg.edit({ components: [newButtons] });
        }
        break;
      }

      case 'ticket_close': {
        if (!isStaff && !isTicketOwner) {
          return interaction.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'Only staff or ticket owner can close tickets.')], 
            ephemeral: true 
          });
        }

        await interaction.reply({ 
          embeds: [createInfoEmbed('Processing', 'Generating transcript and closing ticket...')] 
        });

        await closeTicket(interaction, ch, setup, 'No reason provided');
        break;
      }

      case 'ticket_close_reason': {
        if (!isStaff && !isTicketOwner) {
          return interaction.reply({ 
            embeds: [createErrorEmbed('Permission Denied', 'Only staff or ticket owner can close tickets.')], 
            ephemeral: true 
          });
        }

        // Create a modal for the close reason
        const modal = new ModalBuilder()
          .setCustomId('ticket_close_modal')
          .setTitle('Close Ticket Reason');

        const reasonInput = new TextInputBuilder()
          .setCustomId('close_reason')
          .setLabel('Why are you closing this ticket?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        break;
      }
    }
  }

  // Ticket close reason modal
  if (interaction.isModalSubmit() && interaction.customId === 'ticket_close_modal') {
    const reason = interaction.fields.getTextInputValue('close_reason');
    const ch = interaction.channel;
    const setup = getGuildData(interaction.guild.id, 'tickets');

    await interaction.reply({ 
      embeds: [createInfoEmbed('Processing', 'Generating transcript and closing ticket...')] 
    });

    await closeTicket(interaction, ch, setup, reason);
  }

  // Application system interactions
  if (interaction.isButton() && interaction.customId.startsWith('app_')) {
    const app = getGuildData(interaction.guild.id, 'applications');
    const option = interaction.customId.slice(4);
    const userId = interaction.user.id;

    if (app.cooldowns.has(option) && app.cooldowns.get(option).has(userId)) {
      const remaining = app.cooldowns.get(option).get(userId) - Date.now();
      if (remaining > 0) {
        const days = Math.ceil(remaining / (1000 * 60 * 60 * 24));
        return interaction.reply({
          embeds: [createErrorEmbed('Cooldown Active', 
            `You're on cooldown for this application. Try again in ${days} day(s).`)],
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

// Helper function to close tickets
async function closeTicket(interaction, channel, setup, reason) {
  const msgs = await channel.messages.fetch({ limit: 100 });
  const transcript = [...msgs.values()]
    .reverse()
    .map(m => `${m.author.tag} [${m.createdAt.toLocaleString()}]: ${m.content}`)
    .join('\n');

  const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'transcript.txt' });

  // Find ticket owner
  const uname = channel.name.split('-')[1];
  const member = interaction.guild.members.cache.find(m => 
    m.user.username.toLowerCase().startsWith(uname)
  );

  // Create transcript embed
  const transcriptEmbed = new EmbedBuilder()
    .setColor('#EB459E')
    .setTitle('🎟️ Ticket Transcript')
    .setDescription(`**Ticket:** ${channel.name}\n**Closed by:** ${interaction.user.tag}\n**Reason:** ${reason}`)
    .setFooter({ text: `Closed at ${new Date().toLocaleString()}` });

  // Send to log channel if set
  if (setup.channelId) {
    const logChannel = await client.channels.fetch(setup.channelId);
    if (logChannel) {
      await logChannel.send({ 
        embeds: [transcriptEmbed],
        files: [file] 
      });
    }
  }

  // Send to ticket owner
  if (member) {
    try {
      await member.send({ 
        embeds: [
          new EmbedBuilder()
            .setColor('#EB459E')
            .setTitle('🎟️ Your Ticket Was Closed')
            .setDescription(`**Ticket:** ${channel.name}\n**Closed by:** ${interaction.user.tag}\n**Reason:** ${reason}`)
            .setFooter({ text: 'Transcript attached below' }),
          transcriptEmbed
        ],
        files: [file] 
      });
    } catch (error) {
      console.error(`Failed to DM ${member.user.tag}:`, error);
      await channel.send(`Couldn't DM transcript to ${member.user.tag} (DMs disabled?)`);
    }
  }

  // Send final message and delete channel
  await channel.send({ 
    embeds: [
      new EmbedBuilder()
        .setColor('#EB459E')
        .setTitle('🎟️ Ticket Closed')
        .setDescription(`This ticket has been closed by ${interaction.user}\n**Reason:** ${reason}\n\nChannel will be deleted shortly.`)
    ] 
  });

  setTimeout(() => channel.delete().catch(() => {}), 3000);
}

process.on('unhandledRejection', err => console.error(err));
client.login(process.env.DISCORD_TOKEN);
