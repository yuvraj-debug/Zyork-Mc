require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ]
});

// Data storage
const appData = {
  questions: [],
  options: {},
  channel: null,
  cooldowns: new Map()
};

const ticketData = {
  message: null,
  options: [],
  viewerRole: null,
  category: null
};

const activeApplications = new Set();

// Mini-Games
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Guess command
  if (message.content.startsWith('!guess')) {
    const number = parseInt(message.content.split(' ')[1]);
    if (isNaN(number) || number < 1 || number > 10) {
      return message.reply('Please guess a number between 1 and 10!');
    }

    const correct = Math.floor(Math.random() * 10) + 1;
    if (number === correct) {
      message.reply(`🎉 Congratulations! You guessed the correct number: ${correct}`);
    } else {
      message.reply(`Sorry, the correct number was ${correct}. Better luck next time!`);
    }
  }

  // Trivia command
  if (message.content.startsWith('!trivia')) {
    const questions = [
      { question: "What is the capital of France?", answer: "Paris" },
      { question: "How many continents are there?", answer: "7" },
      { question: "What is the largest planet in our solar system?", answer: "Jupiter" }
    ];
    const question = questions[Math.floor(Math.random() * questions.length)];

    await message.reply(`**Trivia Question:** ${question.question}`);

    const filter = m => m.author.id === message.author.id;
    try {
      const collected = await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000,
        errors: ['time']
      });

      const answer = collected.first().content.toLowerCase();
      if (answer === question.answer.toLowerCase()) {
        message.reply('✅ Correct!');
      } else {
        message.reply(`❌ Incorrect! The correct answer is: ${question.answer}`);
      }
    } catch {
      message.reply('⏰ Time\'s up!');
    }
  }

  // Scramble command
  if (message.content.startsWith('!scramble')) {
    const words = ["python", "discord", "banana", "elephant", "guitar"];
    const word = words[Math.floor(Math.random() * words.length)];
    const scrambled = word.split('').sort(() => 0.5 - Math.random()).join('');

    await message.reply(`Unscramble this word: **${scrambled}**`);

    const filter = m => m.author.id === message.author.id && m.content.toLowerCase() === word.toLowerCase();
    try {
      await message.channel.awaitMessages({
        filter,
        max: 1,
        time: 30000,
        errors: ['time']
      });
      message.reply('🎉 Correct! You unscrambled the word!');
    } catch {
      message.reply(`⏰ Time's up! The word was: **${word}**`);
    }
  }
});

// Applications
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Add question command
  if (message.content.startsWith('!addques') && message.member?.permissions.has('Administrator')) {
    const question = message.content.slice(8).trim();
    appData.questions.push(question);
    message.reply(`✅ Added question: ${question}`);
  }

  // Set options command
  if (message.content.startsWith('!setoptions') && message.member?.permissions.has('Administrator')) {
    const optionsStr = message.content.slice(11).trim();
    const optionsList = optionsStr.split(',').map(opt => opt.trim());
    
    appData.options = {};
    for (const opt of optionsList) {
      if (opt.includes('|')) {
        const [name, cooldown] = opt.split('|').map(x => x.trim());
        appData.options[name] = parseInt(cooldown) || 0;
      } else {
        appData.options[opt] = 0;
      }
    }
    message.reply('✅ Application options set!');
  }

  // Set channel command
  if (message.content.startsWith('!setchannel') && message.member?.permissions.has('Administrator')) {
    const channelId = message.mentions.channels.first()?.id;
    if (channelId) {
      appData.channel = channelId;
      message.reply(`✅ Application log channel set to <#${channelId}>`);
    } else {
      message.reply('❌ Please mention a valid channel!');
    }
  }

  // Deploy command
  if (message.content.startsWith('!deploy') && message.member?.permissions.has('Administrator')) {
    if (appData.questions.length === 0 || Object.keys(appData.options).length === 0) {
      return message.reply('❌ Please set questions and options first!');
    }

    const embed = new EmbedBuilder()
      .setTitle('Application Menu')
      .setDescription('Click the button below to start an application!')
      .setColor(0x3498db);

    const row = new ActionRowBuilder();
    for (const option in appData.options) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`app_${option}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Primary)
      );
    }

    message.channel.send({ embeds: [embed], components: [row] });
  }

  // Reset command
  if (message.content.startsWith('!reset') && message.member?.permissions.has('Administrator')) {
    appData.questions = [];
    appData.options = {};
    appData.channel = null;
    appData.cooldowns.clear();
    message.reply('✅ Application data has been reset!');
  }
});

// Tickets
client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // Ticket message command
  if (message.content.startsWith('!ticket') && message.member?.permissions.has('Administrator')) {
    const ticketMessage = message.content.slice(8).trim();
    ticketData.message = ticketMessage;
    message.reply('✅ Ticket panel message set!');
  }

  // Ticket option command
  if (message.content.startsWith('!option') && message.member?.permissions.has('Administrator')) {
    const parts = message.content.slice(8).trim().split(' ');
    const emoji = parts.shift();
    const label = parts.join(' ');
    ticketData.options.push({ emoji, label });
    message.reply(`✅ Added ticket option: ${emoji} ${label}`);
  }

  // Ticket viewer command
  if (message.content.startsWith('!ticketviewer') && message.member?.permissions.has('Administrator')) {
    const role = message.mentions.roles.first();
    if (role) {
      ticketData.viewerRole = role.id;
      message.reply(`✅ Ticket viewer role set to ${role}`);
    } else {
      message.reply('❌ Please mention a valid role!');
    }
  }

  // Ticket category command
  if (message.content.startsWith('!ticketcategory') && message.member?.permissions.has('Administrator')) {
    const category = message.mentions.channels.first();
    if (category && category.type === ChannelType.GuildCategory) {
      ticketData.category = category.id;
      message.reply(`✅ Ticket category set to ${category.name}`);
    } else {
      message.reply('❌ Please mention a valid category!');
    }
  }

  // Deploy ticket panel command
  if (message.content.startsWith('!deployticketpanel') && message.member?.permissions.has('Administrator')) {
    if (ticketData.options.length === 0) {
      return message.reply('❌ Please add ticket options first!');
    }

    const embed = new EmbedBuilder()
      .setTitle('Ticket Panel')
      .setDescription(ticketData.message || 'Click a button below to create a ticket!')
      .setColor(0x7289da);

    const row = new ActionRowBuilder();
    for (const option of ticketData.options) {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_${option.label.replace(/ /g, '_')}`)
          .setEmoji(option.emoji)
          .setLabel(option.label)
          .setStyle(ButtonStyle.Secondary)
      );
    }

    message.channel.send({ embeds: [embed], components: [row] });
  }

  // Reset ticket command
  if (message.content.startsWith('!resetticket') && message.member?.permissions.has('Administrator')) {
    ticketData.message = null;
    ticketData.options = [];
    ticketData.viewerRole = null;
    ticketData.category = null;
    message.reply('✅ Ticket setup has been reset!');
  }
});

// Application button handling
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  // Application handling
  if (interaction.customId.startsWith('app_')) {
    const option = interaction.customId.slice(4);
    const userId = interaction.user.id;

    // Check cooldown
    if (appData.cooldowns.has(option) && appData.cooldowns.get(option).has(userId)) {
      const remaining = appData.cooldowns.get(option).get(userId) - Date.now();
      if (remaining > 0) {
        return interaction.reply({
          content: `⏳ You're on cooldown for this application. Try again in ${Math.floor(remaining / 1000)} seconds.`,
          ephemeral: true
        });
      }
    }

    // Check active application
    if (activeApplications.has(userId)) {
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
      activeApplications.add(userId);

      await dmChannel.send('**Application Started!** Please answer the following questions:');

      const responses = [];
      for (let i = 0; i < appData.questions.length; i++) {
        const question = appData.questions[i];
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
          activeApplications.delete(userId);
          return;
        }
      }

      // Application completed
      activeApplications.delete(userId);

      // Set cooldown
      const cooldown = appData.options[option] || 0;
      if (cooldown > 0) {
        if (!appData.cooldowns.has(option)) {
          appData.cooldowns.set(option, new Map());
        }
        appData.cooldowns.get(option).set(userId, Date.now() + cooldown * 1000);
      }

      // Send to log channel
      if (appData.channel) {
        const logChannel = await client.channels.fetch(appData.channel);
        if (logChannel) {
          const embed = new EmbedBuilder()
            .setTitle(`New Application: ${option}`)
            .setDescription(`From ${interaction.user} (${interaction.user.tag})`)
            .setColor(0x2ecc71);

          for (let i = 0; i < appData.questions.length; i++) {
            embed.addFields({
              name: `Question ${i + 1}: ${appData.questions[i]}`,
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

  // Ticket handling
  if (interaction.customId.startsWith('ticket_')) {
    const label = interaction.customId.slice(7).replace(/_/g, ' ');
    const guild = interaction.guild;
    const user = interaction.user;

    // Check if category exists
    let category = null;
    if (ticketData.category) {
      category = await guild.channels.fetch(ticketData.category);
    }

    // Create ticket channel
    const overwrites = [
      { id: guild.id, deny: ['ViewChannel'] },
      { id: user.id, allow: ['ViewChannel'] }
    ];

    // Add viewer role if set
    if (ticketData.viewerRole) {
      overwrites.push({ id: ticketData.viewerRole, allow: ['ViewChannel'] });
    }

    try {
      const channel = await guild.channels.create({
        name: `ticket-${user.username}`,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: overwrites
      });

      // Send ticket message with delete button
      const embed = new EmbedBuilder()
        .setTitle(`Ticket: ${label}`)
        .setDescription(`Created by ${user}`)
        .setColor(0x2ecc71);

      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`delete_ticket_${channel.id}`)
          .setLabel('Delete Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      await channel.send({ embeds: [embed], components: [row] });

      // Ping user and viewer role
      let pingMsg = `${user}`;
      if (ticketData.viewerRole) {
        pingMsg += ` <@&${ticketData.viewerRole}>`;
      }
      await channel.send(pingMsg);

      await interaction.reply({
        content: `✅ Ticket created: ${channel}`,
        ephemeral: true
      });
    } catch (error) {
      console.error(error);
      await interaction.reply({
        content: '❌ Failed to create ticket!',
        ephemeral: true
      });
    }
  }

  // Delete ticket handling
  if (interaction.customId.startsWith('delete_ticket_')) {
    const channelId = interaction.customId.slice(14);
    const channel = await client.channels.fetch(channelId);
    const member = interaction.member;

    if (!channel || channel.type !== ChannelType.GuildText) {
      return interaction.reply({
        content: '❌ Channel not found!',
        ephemeral: true
      });
    }

    // Check permissions
    const hasPermission = member.permissions.has('ManageChannels') || 
                         (ticketData.viewerRole && member.roles.cache.has(ticketData.viewerRole));

    if (!hasPermission) {
      return interaction.reply({
        content: '❌ You don\'t have permission to delete this ticket!',
        ephemeral: true
      });
    }

    // Create transcript
    const messages = await channel.messages.fetch({ limit: 100 });
    const transcript = messages.reverse().map(msg => `${msg.author.tag}: ${msg.content}`).join('\n');

    // Send to user's DMs
    try {
      const dmChannel = await interaction.user.createDM();
      await dmChannel.send({
        content: '**Ticket Transcript**',
        files: [{
          attachment: Buffer.from(transcript),
          name: 'ticket-transcript.txt'
        }]
      });
    } catch (error) {
      console.error('Could not send DM:', error);
    }

    // Delete channel
    await channel.delete();
    await interaction.reply({
      content: '✅ Ticket deleted!',
      ephemeral: true
    });
  }
});

client.login(process.env.DISCORD_TOKEN);
