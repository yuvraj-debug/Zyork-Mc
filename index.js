require('dotenv').config();
const { 
  Client, 
  IntentsBitField, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle, 
  StringSelectMenuBuilder, 
  StringSelectMenuOptionBuilder, 
  ChannelType, 
  PermissionFlagsBits, 
  Collection,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle
} = require('discord.js');
const { QuickDB } = require('quick.db');
const db = new QuickDB();
const http = require('http');

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages,
  ],
});

// Keep alive server for Render
const server = http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Discord Bot is running!');
});
server.listen(8080);

// Helper Functions
function createEmbed(title, description, color = '#5865F2') {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
}

async function sendResponse(message, content, isError = false) {
  const embed = createEmbed(
    isError ? '❌ Error' : '✅ Success',
    content,
    isError ? '#ED4245' : '#57F287'
  );
  const msg = await message.channel.send({ embeds: [embed] });
  setTimeout(() => msg.delete().catch(console.error), 5000);
  await message.delete().catch(console.error);
}

// Ticket System
async function setupTicketSystem(message) {
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (commandName === 'ticket') {
    const msg = args.join(' ');
    await db.set(`ticketSettings.${message.guild.id}.panelMessage`, msg);
    await sendResponse(message, `Ticket panel message set to: "${msg}"`);
    return;
  }

  if (commandName.startsWith('option')) {
    const optionNum = commandName.replace('option', '');
    if (!optionNum || isNaN(optionNum)) return;

    const emojiRegex = /(<a?:[\w]+:[\d]+>|[\u{1F300}-\u{1F5FF}\u{1F600}-\u{1F64F}\u{1F680}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}])/gu;
    const emojiMatch = args[0]?.match(emojiRegex);
    const emoji = emojiMatch ? emojiMatch[0] : null;
    const msg = emoji ? args.slice(1).join(' ') : args.join(' ');

    if (!msg && !emoji) return sendResponse(message, 'Please provide a message or emoji for this option.', true);

    const currentOptions = await db.get(`ticketSettings.${message.guild.id}.options`) || {};
    currentOptions[`option_${optionNum}`] = { text: msg, emoji };
    await db.set(`ticketSettings.${message.guild.id}.options`, currentOptions);
    await sendResponse(message, `Option ${optionNum} set with ${emoji ? `emoji ${emoji} and ` : ''}message: "${msg}"`);
    return;
  }

  if (commandName === 'setchannel') {
    const channel = message.mentions.channels.first();
    if (!channel) return sendResponse(message, 'Please mention a channel.', true);

    const category = channel.parent;
    if (!category) return sendResponse(message, 'Channel must be in a category.', true);

    await db.set(`ticketSettings.${message.guild.id}.panelChannel`, channel.id);
    await db.set(`ticketSettings.${message.guild.id}.categoryId`, category.id);
    await sendResponse(message, `Ticket panel channel set to ${channel} with category ${category}`);
    return;
  }

  if (commandName === 'setrole') {
    const role = message.mentions.roles.first();
    if (!role) return sendResponse(message, 'Please mention a role.', true);

    await db.set(`ticketSettings.${message.guild.id}.viewerRole`, role.id);
    await sendResponse(message, `Ticket viewer role set to ${role}`);
    return;
  }

  if (commandName === 'deployticketpanel') {
    const ticketSettings = await db.get(`ticketSettings.${message.guild.id}`);
    if (!ticketSettings?.panelChannel) {
      return sendResponse(message, 'Please set up ticket settings first (!ticket, !option1, !setchannel)', true);
    }

    const channel = message.guild.channels.cache.get(ticketSettings.panelChannel);
    if (!channel) return sendResponse(message, 'Ticket channel not found.', true);

    const embed = createEmbed(
      'Create a Ticket',
      ticketSettings.panelMessage || 'Click the dropdown below to create a ticket.',
      '#5865F2'
    );

    const options = ticketSettings.options || {
      option_1: { text: 'General Support', emoji: null },
      option_2: { text: 'Technical Support', emoji: null }
    };

    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('create_ticket')
      .setPlaceholder('Select a ticket type...')
      .addOptions(
        Object.entries(options).map(([key, opt]) => {
          const optionNum = key.split('_')[1];
          const option = new StringSelectMenuOptionBuilder()
            .setLabel(`Option ${optionNum}`)
            .setValue(key)
            .setDescription(opt.text.length > 50 ? opt.text.substring(0, 47) + '...' : opt.text);
          
          if (opt.emoji) option.setEmoji(opt.emoji);
          return option;
        })
      );

    await channel.send({
      embeds: [embed],
      components: [new ActionRowBuilder().addComponents(selectMenu)]
    });
    await sendResponse(message, 'Ticket panel deployed!');
  }
}

// Application System
async function setupApplicationSystem(message) {
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (commandName === 'app') {
    const msg = args.join(' ');
    await db.set(`applicationSettings.${message.guild.id}.panelMessage`, msg);
    await sendResponse(message, `Application panel message set to: "${msg}"`);
    return;
  }

  if (commandName === 'addapptype') {
    const [name, ...rest] = args.join(' ').split('|').map(x => x.trim());
    const cooldown = rest.pop() || '0';
    const pingRole = rest.pop() || '';
    const channel = message.mentions.channels.first()?.id || '';

    await db.set(`applicationSettings.${message.guild.id}.types.${name.toLowerCase()}`, {
      name,
      cooldown: parseCooldown(cooldown),
      pingRole: pingRole.startsWith('<@&') ? pingRole.slice(3, -1) : pingRole,
      channel,
      questions: []
    });
    
    await sendResponse(message, `Application type "${name}" added with cooldown: ${cooldown}`);
    return;
  }

  if (commandName.startsWith('ques')) {
    const quesNum = parseInt(commandName.replace('ques', ''));
    if (isNaN(quesNum)) return;
    
    const question = args.join(' ');
    const appType = await db.get(`applicationSettings.${message.guild.id}.currentType`);
    if (!appType) return sendResponse(message, 'Please set an application type first (!addapptype)', true);
    
    const questions = await db.get(`applicationSettings.${message.guild.id}.types.${appType}.questions`) || [];
    questions[quesNum - 1] = question;
    await db.set(`applicationSettings.${message.guild.id}.types.${appType}.questions`, questions);
    await sendResponse(message, `Question ${quesNum} set for ${appType}: "${question}"`);
    return;
  }

  if (commandName === 'deployapp') {
    const appSettings = await db.get(`applicationSettings.${message.guild.id}`);
    if (!appSettings?.types) {
      return sendResponse(message, 'Please set up application settings first (!app, !addapptype, !ques1)', true);
    }

    const channel = message.mentions.channels.first() || message.channel;
    const embed = createEmbed(
      'Applications',
      appSettings.panelMessage || 'Click the buttons below to apply.',
      '#FFD700'
    );

    const buttons = new ActionRowBuilder().addComponents(
      Object.entries(appSettings.types).map(([key, config]) => 
        new ButtonBuilder()
          .setCustomId(`start_app_${key}`)
          .setLabel(config.name)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝')
      )
    );

    await channel.send({ embeds: [embed], components: [buttons] });
    await sendResponse(message, 'Application panel deployed!');
  }
}

// Utility Commands
async function handleUtilityCommands(message) {
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (commandName === 'embed') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendResponse(message, 'You need administrator permissions to use this command.', true);
    }
    
    const msg = args.join(' ');
    if (!msg) return sendResponse(message, 'Please provide a message.', true);
    
    const color = getEmbedColor(msg);
    const embed = createEmbed('', msg, color);
    await message.channel.send({ embeds: [embed] });
    await message.delete().catch(console.error);
    return;
  }

  if (commandName === 'dm') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendResponse(message, 'You need administrator permissions to use this command.', true);
    }
    
    const role = message.mentions.roles.first();
    if (!role) return sendResponse(message, 'Please mention a role.', true);
    
    const msg = args.slice(1).join(' ');
    if (!msg) return sendResponse(message, 'Please provide a message.', true);
    
    const members = await message.guild.members.fetch();
    const roleMembers = members.filter(m => m.roles.cache.has(role.id));
    
    let success = 0, failed = 0;
    for (const member of roleMembers.values()) {
      try {
        await member.send(msg);
        success++;
      } catch {
        failed++;
      }
    }
    
    await sendResponse(message, `DM sent to ${success} members (${failed} failed)`);
    return;
  }

  if (commandName === 'msg') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendResponse(message, 'You need administrator permissions to use this command.', true);
    }
    
    const msg = args.join(' ');
    if (!msg) return sendResponse(message, 'Please provide a message.', true);
    
    await message.channel.send(msg);
    await message.delete().catch(console.error);
    return;
  }

  if (commandName === 'purge') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return sendResponse(message, 'You need administrator permissions to use this command.', true);
    }
    
    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount < 1 || amount > 100) {
      return sendResponse(message, 'Please provide a number between 1-100.', true);
    }
    
    await message.channel.bulkDelete(amount + 1).catch(console.error);
    const reply = await message.channel.send(`Deleted ${amount} messages.`);
    setTimeout(() => reply.delete().catch(console.error), 3000);
    return;
  }
}

// Games System
const games = {
  rps: {
    name: "Rock Paper Scissors",
    description: "Play rock paper scissors against the bot",
    emoji: "✊",
    play: async (message, choice) => {
      const options = ['rock', 'paper', 'scissors'];
      const botChoice = options[Math.floor(Math.random() * options.length)];
      
      if (!choice || !options.includes(choice.toLowerCase())) {
        return sendResponse(message, 'Please choose rock, paper, or scissors!', true);
      }
      
      const result = determineRPSWinner(choice.toLowerCase(), botChoice);
      const embed = createEmbed(
        'Rock Paper Scissors',
        `You chose: ${choice}\nBot chose: ${botChoice}\n\n**Result:** ${result}`,
        '#3498DB'
      );
      
      await message.channel.send({ embeds: [embed] });
    }
  },
  ttt: {
    name: "Tic Tac Toe",
    description: "Play tic tac toe against the bot",
    emoji: "❌",
    play: async (message) => {
      await sendResponse(message, 'Tic Tac Toe is coming soon!');
    }
  },
  trivia: {
    name: "Trivia",
    description: "Answer trivia questions",
    emoji: "🧠",
    play: async (message) => {
      await sendResponse(message, 'Trivia is coming soon!');
    }
  }
};

async function handleGameCommands(message) {
  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (commandName === 'games') {
    const embed = createEmbed(
      '🎮 Available Games',
      Object.entries(games).map(([key, game]) => 
        `${game.emoji} **${game.name}** - ${game.description}\nUsage: \`!play ${key}\``
      ).join('\n\n'),
      '#9B59B6'
    );
    
    await message.channel.send({ embeds: [embed] });
    return;
  }

  if (commandName === 'play') {
    const game = args[0]?.toLowerCase();
    if (!game || !games[game]) {
      return sendResponse(message, 'Invalid game. Use !games to see available games.', true);
    }
    
    await games[game].play(message, args[1]);
  }
}

// Helper Functions
function parseCooldown(cooldownStr) {
  if (!cooldownStr) return 0;
  
  const timeUnit = cooldownStr.slice(-1).toLowerCase();
  const timeValue = parseInt(cooldownStr.slice(0, -1));
  
  if (isNaN(timeValue)) return 0;
  
  switch (timeUnit) {
    case 'd': return timeValue * 1440; // days to minutes
    case 'h': return timeValue * 60;   // hours to minutes
    case 'm': return timeValue;        // minutes
    default: return 0;
  }
}

function determineRPSWinner(player, bot) {
  if (player === bot) return "It's a tie! 🎭";
  
  const winConditions = {
    rock: 'scissors',
    paper: 'rock',
    scissors: 'paper'
  };
  
  return winConditions[player] === bot 
    ? "You win! 🎉" 
    : "Bot wins! 🤖";
}

function getEmbedColor(message) {
  const lowerMsg = message.toLowerCase();
  if (lowerMsg.includes('error') || lowerMsg.includes('warning')) return '#ED4245';
  if (lowerMsg.includes('success') || lowerMsg.includes('congrat')) return '#57F287';
  if (lowerMsg.includes('info') || lowerMsg.includes('notice')) return '#3498DB';
  if (lowerMsg.includes('important') || lowerMsg.includes('alert')) return '#FEE75C';
  return '#5865F2';
}

// Event Handlers
client.on('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
  client.user.setActivity('!help for commands');
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (!message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const commandName = args.shift().toLowerCase();

  if (commandName === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('🎫 Ticket Bot Help')
      .setColor('#5865F2')
      .setDescription('Here are all the available commands:')
      .addFields(
        {
          name: '📋 Ticket System',
          value: [
            '`!ticket <message>` - Set ticket panel message',
            '`!option1 <emoji?> <message>` - Set first dropdown option',
            '`!option2 <emoji?> <message>` - Set second dropdown option',
            '`!setchannel #channel` - Set ticket channel',
            '`!setrole @role` - Set ticket viewer role',
            '`!deployticketpanel` - Deploy ticket panel'
          ].join('\n'),
          inline: false
        },
        {
          name: '📝 Application System',
          value: [
            '`!app <message>` - Set application message',
            '`!addapptype name|role|cooldown` - Add application type',
            '`!ques1 <question>` - Set question 1',
            '`!deployapp` - Deploy application panel'
          ].join('\n'),
          inline: false
        },
        {
          name: '🛠️ Utilities',
          value: [
            '`!embed <message>` - Send embed message',
            '`!dm @role <message>` - DM role members',
            '`!msg <message>` - Send message',
            '`!purge <amount>` - Delete messages'
          ].join('\n'),
          inline: false
        },
        {
          name: '🎮 Games',
          value: [
            '`!games` - List available games',
            '`!play rps` - Rock Paper Scissors',
            '`!play ttt` - Tic Tac Toe',
            '`!play trivia` - Trivia game'
          ].join('\n'),
          inline: false
        }
      )
      .setFooter({ text: 'Bot by YourName', iconURL: client.user.displayAvatarURL() });

    await message.channel.send({ embeds: [helpEmbed] });
    return;
  }

  // Route commands to appropriate handlers
  if (commandName === 'ticket' || commandName.startsWith('option') || 
      commandName === 'setchannel' || commandName === 'setrole' || 
      commandName === 'deployticketpanel') {
    await setupTicketSystem(message);
  } 
  else if (commandName === 'app' || commandName.startsWith('ques') || 
           commandName === 'addapptype' || commandName === 'deployapp') {
    await setupApplicationSystem(message);
  } 
  else if (commandName === 'embed' || commandName === 'dm' || 
           commandName === 'msg' || commandName === 'purge') {
    await handleUtilityCommands(message);
  } 
  else if (commandName === 'games' || commandName === 'play') {
    await handleGameCommands(message);
  }
});

// Ticket Creation Handler
client.on('interactionCreate', async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;

  if (interaction.customId === 'create_ticket') {
    const option = interaction.values[0];
    const ticketSettings = await db.get(`ticketSettings.${interaction.guild.id}`);
    const optionData = ticketSettings.options?.[option];
    
<<<<<<< HEAD
    await createTicket(interaction, optionData?.text || option);
  }
});

async function createTicket(interaction, reason) {
  const guildId = interaction.guild.id;
  const ticketSettings = await db.get(`ticketSettings.${guildId}`);
  
  if (!ticketSettings?.categoryId) {
    return interaction.reply({ 
      content: 'Ticket system is not properly configured.', 
      ephemeral: true 
    });
  }

  const ticketNumber = (await db.get(`tickets.${guildId}.count`) || 0) + 1;
  const ticketName = `ticket-${ticketNumber}-${interaction.user.username}`;

  try {
    const channel = await interaction.guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: ticketSettings.categoryId,
      permissionOverwrites: [
        {
          id: interaction.guild.id,
          deny: [PermissionFlagsBits.ViewChannel],
        },
        {
          id: interaction.user.id,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        },
        ...(ticketSettings.viewerRole ? [{
          id: ticketSettings.viewerRole,
          allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages],
        }] : []),
      ],
    });

    await db.set(`tickets.${guildId}.count`, ticketNumber);
    
    const embed = createEmbed(
      `Ticket #${ticketNumber}`,
      `**Created by:** ${interaction.user.tag}\n**Reason:** ${reason}\n\nPlease wait for staff assistance.`,
      '#5865F2'
=======
    const buttons = new ActionRowBuilder().addComponents(
      question.options.map((opt, i) => 
        new ButtonBuilder()
          .setCustomId(`trivia_${i}`)
          .setLabel(opt)
          .setStyle(ButtonStyle.Primary)
      )
>>>>>>> 8a24307adb7b9aef806e30f5101ae8254f016f34
    );

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('claim_ticket')
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary)
        .setEmoji('🙋'),
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close')
        .setStyle(ButtonStyle.Danger)
        .setEmoji('🔨')
    );

    const mention = ticketSettings.viewerRole ? `<@&${ticketSettings.viewerRole}>` : '';
    await channel.send({
      content: `${interaction.user} ${mention}`,
      embeds: [embed],
      components: [buttons]
    });

    await interaction.reply({ 
      content: `Ticket created: ${channel}`, 
      ephemeral: true 
    });
  } catch (error) {
    console.error('Ticket creation error:', error);
    await interaction.reply({ 
      content: 'Failed to create ticket. Please try again later.', 
      ephemeral: true 
    });
  }
}

client.login(process.env.DISCORD_TOKEN);