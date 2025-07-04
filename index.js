require('dotenv').config();
require('./keep_alive');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// Dummy endpoint to keep service alive
app.get('/', (req, res) => {
  res.send('✅ Bot is alive and running!');
});

app.listen(PORT, () => {
  console.log(`✅ Web server listening on port ${PORT}`);
});

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

// Initialize Discord client
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildVoiceStates
  ],
  partials: [Partials.Channel, Partials.Message, Partials.Reaction]
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
  },
  ratings: new Map()
};

// Deployment cooldown tracking
const lastDeployments = new Map();

// Utility functions
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

const getGuildData = (guildId, type) => {
  if (!data[type].has(guildId)) {
    data[type].set(guildId, type === 'tickets' ? {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null,
      footerImage: null,
      logChannelId: null,
      ratingChannelId: null
    } : {
      questions: [],
      options: {},
      channelId: null,
      cooldowns: new Map()
    });
  }
  return data[type].get(guildId);
};

const parseTimeToMs = (timeStr) => {
  const match = timeStr.match(/^(\d+)d$/i);
  if (!match) return null;
  return parseInt(match[1]) * 86400000;
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

// Ticket closing function
async function closeTicket(interaction, channel, setup, reason) {
  try {
    const msgs = await channel.messages.fetch({ limit: 100 });
    const transcript = [...msgs.values()]
      .reverse()
      .map(m => `${m.author.tag} [${m.createdAt.toLocaleString()}]: ${m.content}`)
      .join('\n');

    const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'transcript.txt' });

    // Find ticket owner and claimer
    const uname = channel.name.split('-')[1];
    const member = interaction.guild.members.cache.find(m => 
      m.user.username.toLowerCase().startsWith(uname)
    );
    
    // Check if ticket was claimed
    let claimedBy = null;
    const ticketButtons = channel.messages.cache.find(m => m.components.length > 0);
    if (ticketButtons) {
      const claimButton = ticketButtons.components[0].components.find(c => c.customId === 'ticket_claim');
      if (claimButton && claimButton.disabled) {
        claimedBy = ticketButtons.mentions.users.first();
      }
    }

    // Create transcript embed
    const transcriptEmbed = new EmbedBuilder()
      .setColor('#EB459E')
      .setTitle('🎟️ Ticket Transcript')
      .setDescription(`**Ticket:** ${channel.name}\n**Closed by:** ${interaction.user.tag}\n**Reason:** ${reason || 'No reason provided'}`)
      .setFooter({ text: `Closed at ${new Date().toLocaleString()}` });

    // Send to log channel if set
    if (setup.logChannelId) {
      const logChannel = await client.channels.fetch(setup.logChannelId).catch(() => null);
      if (logChannel) {
        await logChannel.send({ 
          embeds: [transcriptEmbed],
          files: [file] 
        });
      }
    }

    // Enhanced DM to ticket owner
    if (member) {
      try {
        const ticketCategory = channel.name.split('-')[2] || 'General Support';
        
        const dmEmbed = new EmbedBuilder()
          .setColor('#EB459E')
          .setTitle(`🎟️ Your Ticket in ${interaction.guild.name} has been closed`)
          .setDescription([
            `**Ticket Channel:** ${channel.name}`,
            `**Closed by:** ${interaction.user}`,
            `**Reason:** ${reason || 'No reason provided'}`,
            '',
            'We value your feedback and would appreciate your rating of our support.',
            'Please take a moment to share your satisfaction level by choosing a rating between 1-5 stars below. Your input is valuable to us!'
          ].join('\n'))
          .setThumbnail(interaction.guild.iconURL())
          .addFields(
            {
              name: '• Ticket Information',
              value: [
                `**Category:** ${ticketCategory}`,
                `**Claimed by:** ${claimedBy ? claimedBy.tag : 'Not claimed'}`,
                `**Total Messages:** ${msgs.size}`
              ].join('\n'),
              inline: false
            }
          )
          .setFooter({ 
            text: `Ticket closed at ${new Date().toLocaleString()}`, 
            iconURL: interaction.user.displayAvatarURL() 
          });

        // Create rating buttons
        const ratingButtons = new ActionRowBuilder()
          .addComponents(
            new ButtonBuilder()
              .setCustomId('rate_1')
              .setLabel('⭐')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('rate_2')
              .setLabel('⭐⭐')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('rate_3')
              .setLabel('⭐⭐⭐')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('rate_4')
              .setLabel('⭐⭐⭐⭐')
              .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
              .setCustomId('rate_5')
              .setLabel('⭐⭐⭐⭐⭐')
              .setStyle(ButtonStyle.Secondary)
          );

        await member.send({ 
          content: '📩 Here\'s the transcript of your closed ticket:',
          embeds: [dmEmbed, transcriptEmbed],
          files: [file],
          components: [ratingButtons]
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
          .setDescription([
            `This ticket has been closed by ${interaction.user}`,
            `**Reason:** ${reason || 'No reason provided'}`,
            '',
            'The channel will be deleted shortly.'
          ].join('\n'))
          .setFooter({ text: 'Thank you for using our ticket system!' })
      ] 
    });

    setTimeout(() => channel.delete().catch(() => {}), 5000);
  } catch (error) {
    console.error('Error closing ticket:', error);
    await interaction.followUp({
      embeds: [createErrorEmbed('Error', 'An error occurred while closing the ticket.')],
      ephemeral: true
    });
  }
}

// Event Handlers
client.once('ready', () => {
  console.log(`🤖 Bot logged in as ${client.user.tag}`);
});

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
    try {
      const embed = new EmbedBuilder()
        .setTitle('🌟 Bot Command Help Center')
        .setColor('#5865F2')
        .setThumbnail(client.user.displayAvatarURL())
        .setDescription('Here are all the commands you can use with this bot:')
        .addFields(
          { name: '🎟️ Ticket System', value: '`!ticket`, `!option`, `!ticketviewer`, `!ticketcategory`, `!ticketlog`, `!deployticketpanel`', inline: false },
          { name: '📝 Applications', value: '`!addques`, `!setoptions`, `!setchannel`, `!deployapp`, `!resetapp`', inline: false },
          { name: '🎮 Games', value: '`!guess`, `!trivia`, `!scramble`, `!rps`', inline: false },
          { name: '🔧 Utilities', value: '`!dm`, `!msg`, `!embed`', inline: false }
        )
        .setFooter({ 
          text: 'Use !help <category> for more details', 
          iconURL: 'https://cdn.discordapp.com/emojis/947070959172825118.webp' 
        })
        .setTimestamp();

      await message.reply({ embeds: [embed] });
    } catch (error) {
      console.error('Error in help command:', error);
      await message.reply('An error occurred while showing help.');
    }
    return;
  }

  // === ADMIN UTILITY COMMANDS ===
  if (lc.startsWith('!dm ')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ 
        embeds: [createErrorEmbed('Permission Denied', 'You need administrator permissions to use this command.')]
      });
    }

    const args = raw.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const messageContent = args.join(' ');

    if (!roleMention || !messageContent) {
      return message.reply({ 
        embeds: [createErrorEmbed('Invalid Usage', 'Usage: `!dm @role <message>`')]
      });
    }

    const roleId = roleMention.match(/<@&(\d+)>/)?.[1];
    if (!roleId) {
      return message.reply({ 
        embeds: [createErrorEmbed('Invalid Role', 'Please mention a valid role.')]
      });
    }

    const role = guild.roles.cache.get(roleId);
    if (!role) {
      return message.reply({ 
        embeds: [createErrorEmbed('Role Not Found', 'The specified role was not found.')]
      });
    }

    try {
      const members = await guild.members.fetch();
      const membersWithRole = members.filter(m => m.roles.cache.has(role.id));

      if (membersWithRole.size === 0) {
        return message.reply({ 
          embeds: [createErrorEmbed('No Members', 'No members have this role.')]
        });
      }

      const confirmation = await message.reply({ 
        embeds: [createInfoEmbed('Processing', `Sending DM to ${membersWithRole.size} members...`)]
      });

      let successCount = 0;
      let failCount = 0;

      for (const member of membersWithRole.values()) {
        try {
          await member.send({
            embeds: [createInfoEmbed(`Message from ${guild.name}`, messageContent)]
          });
          successCount++;
        } catch (error) {
          console.error(`Failed to DM ${member.user.tag}:`, error);
          failCount++;
        }
      }

      await confirmation.edit({ 
        embeds: [createSuccessEmbed('DM Complete', 
          `Successfully sent to ${successCount} members. Failed to send to ${failCount} members.`)]
      });
    } catch (error) {
      console.error('Error in DM command:', error);
      await message.reply({
        embeds: [createErrorEmbed('Error', 'An error occurred while processing your request.')]
      });
    }
    return;
  }

  // === MSG COMMAND ===
  if (lc.startsWith('!msg ')) {
    const msgContent = raw.slice(5).trim();
    if (!msgContent) return;

    try {
      await message.delete().catch(() => {});
      await channel.send(msgContent);
    } catch (error) {
      console.error('Error in !msg command:', error);
    }
    return;
  }

  // === EMBED COMMAND ===
  if (lc.startsWith('!embed ')) {
    const msgContent = raw.slice(7).trim();
    if (!msgContent) return;

    try {
      await message.delete().catch(() => {});
      
      const embed = new EmbedBuilder()
        .setDescription(msgContent)
        .setColor('#5865F2')
        .setTimestamp();

      await channel.send({ embeds: [embed] });
    } catch (error) {
      console.error('Error in !embed command:', error);
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

  if (lc.startsWith('!ticketlog')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set ticket log channel.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    const match = raw.match(/<#(\d+)>/);
    if (!match) return message.reply({ embeds: [
      createErrorEmbed('Invalid Channel', 'Please mention a valid channel.')
    ]});
    setup.logChannelId = match[1];
    return message.reply({ embeds: [
      createSuccessEmbed('Log Channel Set', `Ticket log channel set to <#${match[1]}>`)
    ]});
  }

  if (lc.startsWith('!ticketrating')) {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ embeds: [
        createErrorEmbed('Permission Denied', 'You need administrator permissions to set ticket rating channel.')
      ]});
    }
    const setup = getGuildData(guild.id, 'tickets');
    const match = raw.match(/<#(\d+)>/);
    if (!match) return message.reply({ embeds: [
      createErrorEmbed('Invalid Channel', 'Please mention a valid channel.')
    ]});
    setup.ratingChannelId = match[1];
    return message.reply({ embeds: [
      createSuccessEmbed('Rating Channel Set', `Ticket rating channel set to <#${match[1]}>`)
    ]});
  }

  if (lc === '!deployticketpanel') {
    if (!message.member.permissions.has(PermissionsBitField.Flags.Administrator)) {
      return message.reply({ 
        embeds: [createErrorEmbed('Permission Denied', 'You need administrator permissions to deploy ticket panel.')]
      });
    }

    const botPermissions = message.channel.permissionsFor(message.guild.members.me);
    if (!botPermissions.has(PermissionsBitField.Flags.SendMessages)) {
      return message.reply({
        embeds: [createErrorEmbed('Missing Permissions', 'I need "Send Messages" permission in this channel.')]
      });
    }
    if (!botPermissions.has(PermissionsBitField.Flags.EmbedLinks)) {
      return message.reply({
        embeds: [createErrorEmbed('Missing Permissions', 'I need "Embed Links" permission in this channel.')]
      });
    }

    const lastDeployed = lastDeployments.get(guild.id) || 0;
    if (Date.now() - lastDeployed < 30000) {
      return message.reply({
        embeds: [createErrorEmbed('Cooldown', 'Please wait 30 seconds between deployments.')]
      });
    }

    const setup = getGuildData(guild.id, 'tickets');
    
    const category = guild.channels.cache.get(setup.categoryId);
    if (!category) {
      return message.reply({
        embeds: [createErrorEmbed('Invalid Category', 'The configured category no longer exists.')]
      });
    }

    const missingRequirements = [];
    if (!setup.description) missingRequirements.push('Ticket message (!ticket <message>)');
    if (!setup.options.length) missingRequirements.push('Ticket options (!option <emoji> <label>)');
    if (!setup.viewerRoleId) missingRequirements.push('Viewer role (!ticketviewer @role)');
    if (!setup.categoryId) missingRequirements.push('Category (!ticketcategory #channel)');
    
    if (missingRequirements.length > 0) {
      return message.reply({
        embeds: [createErrorEmbed(
          'Setup Incomplete', 
          `Missing required setup:\n${missingRequirements.map(r => `• ${r}`).join('\n')}`
        )]
      });
    }

    try {
      const embed = createTicketEmbed('Open a Ticket', setup.description)
        .setImage(setup.footerImage);

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Select a ticket category')
        .addOptions(setup.options.map((opt, i) => ({
          label: opt.label.length > 25 ? opt.label.substring(0, 22) + '...' : opt.label,
          value: `ticket_${i}`,
          emoji: opt.emoji,
          description: opt.label.length > 50 ? 
            `Click to open ${opt.label.substring(0, 47)}...` : 
            `Click to open ${opt.label}`
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      
      await message.channel.send({ embeds: [embed], components: [row] });
      await message.delete().catch(() => {});
      
      lastDeployments.set(guild.id, Date.now());
      
      return message.channel.send({ 
        embeds: [createSuccessEmbed('Panel Deployed', 'Ticket panel deployed successfully!')]
      }).then(msg => {
        setTimeout(() => msg.delete(), 5000);
      });
    } catch (error) {
      console.error('Error deploying ticket panel:', error);
      return message.reply({ 
        embeds: [createErrorEmbed(
          'Deployment Failed', 
          `Failed to deploy ticket panel:\n\`\`\`${error.message}\`\`\``
        )]
      });
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
          app.options[name] = Math.floor(ms / 1000);
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

    const rows = [];
    const options = Object.entries(app.options);
    
    // Split buttons into multiple rows if more than 5 options
    for (let i = 0; i < options.length; i += 5) {
      const row = new ActionRowBuilder();
      const chunk = options.slice(i, i + 5);
      
      for (const [option, cooldown] of chunk) {
        row.addComponents(
          new ButtonBuilder()
            .setCustomId(`app_${option}`)
            .setLabel(option)
            .setStyle(ButtonStyle.Primary)
        );
      }
      
      rows.push(row);
    }

    await message.channel.send({ 
      embeds: [embed], 
      components: rows 
    });
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
    try {
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

      const ticketEmbed = new EmbedBuilder()
        .setColor('#EB459E')
        .setTitle(`🎟️ ${opt.label} Ticket`)
        .setDescription(`**Ticket created by:** ${user}\n**Category:** ${opt.label}\n\nPlease be patient while we assist you.`)
        .setFooter({ text: 'Ticket will be closed if inactive for too long' })
        .setTimestamp();

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
    } catch (error) {
      console.error('Error creating ticket channel:', error);
      return interaction.reply({
        embeds: [createErrorEmbed('Error', 'Failed to create ticket channel.')],
        ephemeral: true
      });
    }
  }

  // Ticket button interactions
  if (interaction.isButton() && interaction.channel.name.startsWith('ticket-')) {
    const ch = interaction.channel;
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

        try {
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
        } catch (error) {
          console.error('Error claiming ticket:', error);
          await interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to claim ticket.')],
            ephemeral: true
          });
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

        await interaction.deferReply();
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

    await interaction.deferReply();
    await closeTicket(interaction, ch, setup, reason);
  }

  // Application system interactions
  if (interaction.isButton() && interaction.customId.startsWith('app_')) {
    const parts = interaction.customId.split('_');
    if (parts.length < 2) return;
    
    const app = getGuildData(interaction.guild.id, 'applications');
    const option = parts.slice(1).join('_');
    const userId = interaction.user.id;

    if (!app.options[option]) {
      return interaction.reply({
        embeds: [createErrorEmbed('Invalid Option', 'This application option is not configured.')],
        ephemeral: true
      });
    }

    if (app.cooldowns.has(option)) {
      const userCooldown = app.cooldowns.get(option).get(userId);
      if (userCooldown && userCooldown > Date.now()) {
        const remaining = Math.ceil((userCooldown - Date.now()) / (1000 * 60 * 60 * 24));
        return interaction.reply({
          embeds: [createErrorEmbed('Cooldown Active', 
            `You're on cooldown for this application. Try again in ${remaining} day(s).`)],
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
        embeds: [createApplicationEmbed('Application Started', `You're applying for: **${option}**\n\nPlease answer the following questions:`)],
        components: [
          new ActionRowBuilder().addComponents(
            new ButtonBuilder()
              .setCustomId('cancel_application')
              .setLabel('Cancel Application')
              .setStyle(ButtonStyle.Danger)
          )
        ]
      });

      const responses = [];
      for (let i = 0; i < app.questions.length; i++) {
        const question = app.questions[i];
        await dmChannel.send({ 
          embeds: [createApplicationEmbed(`Question ${i + 1}/${app.questions.length}`, question)]
        });

        try {
          const collected = await dmChannel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 300000
          });
          
          const response = collected.first();
          if (!response) {
            await dmChannel.send({ 
              embeds: [createErrorEmbed('Timed Out', 'Application timed out due to inactivity.')]
            });
            userState.applicationActive = false;
            data.userStates.set(userId, userState);
            return;
          }
          
          if (response.content.toLowerCase() === 'cancel') {
            await dmChannel.send({ 
              embeds: [createErrorEmbed('Application Cancelled', 'Your application has been cancelled.')]
            });
            userState.applicationActive = false;
            data.userStates.set(userId, userState);
            return;
          }
          
          responses.push(response.content);
        } catch (error) {
          console.error('Error collecting application response:', error);
          await dmChannel.send({ 
            embeds: [createErrorEmbed('Error', 'An error occurred while processing your application.')]
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
        const logChannel = await client.channels.fetch(app.channelId).catch(() => null);
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

          const actionRow = new ActionRowBuilder()
            .addComponents(
              new ButtonBuilder()
                .setCustomId(`app_accept_${interaction.user.id}_${option}`)
                .setLabel('Accept')
                .setStyle(ButtonStyle.Success)
                .setEmoji('✅'),
              new ButtonBuilder()
                .setCustomId(`app_reject_${interaction.user.id}_${option}`)
                .setLabel('Reject')
                .setStyle(ButtonStyle.Danger)
                .setEmoji('❌'),
              new ButtonBuilder()
                .setCustomId(`app_ticket_${interaction.user.id}_${option}`)
                .setLabel('Open Ticket')
                .setStyle(ButtonStyle.Primary)
                .setEmoji('🎟️')
            );

          await logChannel.send({ 
            embeds: [embed],
            components: [actionRow]
          });
        }
      }

      await dmChannel.send({ 
        embeds: [createSuccessEmbed('Application Submitted', 'Your application has been submitted successfully!')]
      });
    } catch (error) {
      console.error('Error in application process:', error);
      await interaction.followUp({
        embeds: [createErrorEmbed('DM Failed', 'I couldn\'t DM you. Please enable DMs from server members.')],
        ephemeral: true
      });
    }
  }

  // Application response buttons
  if (interaction.isButton() && (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_reject_') || interaction.customId.startsWith('app_ticket_'))) {
    const parts = interaction.customId.split('_');
    if (parts.length < 4) return;
    
    const action = parts[1];
    const userId = parts[2];
    const option = parts.slice(3).join('_');
    
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    
    if (!member) {
      return interaction.reply({
        embeds: [createErrorEmbed('Error', 'User not found in this server.')],
        ephemeral: true
      });
    }

    switch (action) {
      case 'accept': {
        try {
          await member.send({
            embeds: [createSuccessEmbed('Application Accepted', 
              `🎉 Congratulations! Your application for **${option}** in **${interaction.guild.name}** has been accepted!`)]
          });

          await interaction.reply({
            embeds: [createSuccessEmbed('Application Accepted', 
              `Successfully accepted ${member}'s application for ${option}!`)],
            ephemeral: true
          });

          const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#57F287')
            .setTitle(`✅ Accepted: ${interaction.message.embeds[0].title}`)
            .setFooter({ text: `Accepted by ${interaction.user.tag}` });

          await interaction.message.edit({
            embeds: [newEmbed],
            components: []
          });
        } catch (error) {
          console.error('Error accepting application:', error);
          await interaction.reply({
            embeds: [createErrorEmbed('Error', 'Could not DM the user about the acceptance.')],
            ephemeral: true
          });
        }
        break;
      }

      case 'reject': {
        const modal = new ModalBuilder()
          .setCustomId(`app_reject_reason_${userId}_${option}`)
          .setTitle('Rejection Reason');

        const reasonInput = new TextInputBuilder()
          .setCustomId('reject_reason')
          .setLabel('Why are you rejecting this application?')
          .setStyle(TextInputStyle.Paragraph)
          .setRequired(true)
          .setMaxLength(1000);

        const actionRow = new ActionRowBuilder().addComponents(reasonInput);
        modal.addComponents(actionRow);

        await interaction.showModal(modal);
        break;
      }

      case 'ticket': {
        const setup = getGuildData(interaction.guild.id, 'tickets');
        if (!setup.categoryId) {
          return interaction.reply({
            embeds: [createErrorEmbed('Error', 'Ticket system not properly configured.')],
            ephemeral: true
          });
        }

        const name = `app-${member.user.username.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
        try {
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
                id: member.id, 
                allow: [
                  PermissionsBitField.Flags.ViewChannel, 
                  PermissionsBitField.Flags.SendMessages, 
                  PermissionsBitField.Flags.ReadMessageHistory
                ] 
              },
              { 
                id: interaction.user.id, 
                allow: [
                  PermissionsBitField.Flags.ViewChannel, 
                  PermissionsBitField.Flags.SendMessages, 
                  PermissionsBitField.Flags.ReadMessageHistory,
                  PermissionsBitField.Flags.ManageMessages
                ] 
              }
            ]
          });

          const ticketEmbed = new EmbedBuilder()
            .setColor('#EB459E')
            .setTitle(`🎟️ Application Follow-up: ${option}`)
            .setDescription(`**Ticket created for:** ${member}\n**Application type:** ${option}\n\nThis ticket was opened to discuss your application further.`)
            .setFooter({ text: 'Ticket will be closed if inactive for too long' })
            .setTimestamp();

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
            content: `🎫 Application follow-up for ${member} (${option})`, 
            embeds: [ticketEmbed],
            components: [ticketButtons]
          });

          await interaction.reply({
            embeds: [createSuccessEmbed('Ticket Created', `Created follow-up ticket: <#${ch.id}>`)],
            ephemeral: true
          });

          const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
            .setColor('#FEE75C')
            .setTitle(`🎟️ Ticket Opened: ${interaction.message.embeds[0].title}`)
            .setFooter({ text: `Ticket opened by ${interaction.user.tag}` });

          await interaction.message.edit({
            embeds: [newEmbed],
            components: []
          });
        } catch (error) {
          console.error('Error creating application ticket:', error);
          await interaction.reply({
            embeds: [createErrorEmbed('Error', 'Failed to create follow-up ticket.')],
            ephemeral: true
          });
        }
        break;
      }
    }
  }

  // Application rejection reason modal
  if (interaction.isModalSubmit() && interaction.customId.startsWith('app_reject_reason_')) {
    const parts = interaction.customId.split('_');
    if (parts.length < 4) return;
    
    const userId = parts[3];
    const option = parts.slice(4).join('_');
    
    const reason = interaction.fields.getTextInputValue('reject_reason');
    const member = await interaction.guild.members.fetch(userId).catch(() => null);
    
    if (!member) {
      return interaction.reply({
        embeds: [createErrorEmbed('Error', 'User not found in this server.')],
        ephemeral: true
      });
    }

    try {
      await member.send({
        embeds: [createErrorEmbed('Application Rejected', 
          `Your application for **${option}** in **${interaction.guild.name}** has been rejected.\n\n**Reason:** ${reason}`)]
      });

      await interaction.reply({
        embeds: [createSuccessEmbed('Application Rejected', 
          `Successfully rejected ${member}'s application for ${option} with the provided reason.`)],
        ephemeral: true
      });

      const newEmbed = EmbedBuilder.from(interaction.message.embeds[0])
        .setColor('#ED4245')
        .setTitle(`❌ Rejected: ${interaction.message.embeds[0].title}`)
        .setFooter({ text: `Rejected by ${interaction.user.tag}` });

      await interaction.message.edit({
        embeds: [newEmbed],
        components: []
      });
    } catch (error) {
      console.error('Error rejecting application:', error);
      await interaction.reply({
        embeds: [createErrorEmbed('Error', 'Could not DM the user about the rejection.')],
        ephemeral: true
      });
    }
  }

  // Cancel application button
  if (interaction.isButton() && interaction.customId === 'cancel_application') {
    const userId = interaction.user.id;
    const userState = data.userStates.get(userId) || {};
    
    if (userState.applicationActive) {
      userState.applicationActive = false;
      data.userStates.set(userId, userState);
      
      await interaction.reply({
        embeds: [createErrorEmbed('Application Cancelled', 'Your application has been cancelled.')]
      });
    }
  }

  // Rating system interaction
  if (interaction.isButton() && interaction.customId.startsWith('rate_')) {
    const rating = parseInt(interaction.customId.split('_')[1]);
    if (isNaN(rating)) return;

    try {
      await interaction.reply({
        embeds: [createSuccessEmbed('Thank You!', `You rated this ticket ${'⭐'.repeat(rating)}. We appreciate your feedback!`)],
        ephemeral: true
      });

      const setup = getGuildData(interaction.guild.id, 'tickets');
      if (setup.ratingChannelId) {
        const ratingChannel = await client.channels.fetch(setup.ratingChannelId).catch(() => null);
        if (ratingChannel) {
          await ratingChannel.send({
            embeds: [createInfoEmbed('Ticket Rating', 
              `${interaction.user} rated their ticket experience ${'⭐'.repeat(rating)}`)]
          });
        }
      }
    } catch (error) {
      console.error('Error handling rating:', error);
    }
  }
});

// Error handling
client.on('error', error => {
  console.error('❌ Discord client error:', error);
});

client.on('warn', warning => {
  console.warn('⚠️ Discord client warning:', warning);
});

process.on('unhandledRejection', error => {
  console.error('❌ Unhandled promise rejection:', error);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});