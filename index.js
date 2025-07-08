require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, Collection, Events } = require('discord.js');
const http = require('http');

// Initialize client with required intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages
  ]
});

// Keep alive server with Render.com compatibility
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive!');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Keep-alive server is running on port ${PORT}`);
  console.log(`Server started at ${new Date().toISOString()}`);
});

server.on('error', (error) => {
  console.error('Server error:', error);
});

// Data storage
const botData = {
  ticketSettings: {},
  applicationSettings: {},
  warnings: new Map(),
  warnLimits: new Map(),
  games: new Map(),
  premiumRoles: new Map()
};

// Error handler with colorful embeds
function handleError(error, interaction) {
  console.error(error);
  const errorEmbed = new EmbedBuilder()
    .setColor('#FF0000')
    .setTitle('❌ Error Occurred')
    .setDescription(`\`\`\`${error.message || 'An unknown error occurred'}\`\`\``)
    .setFooter({ text: 'Please try again or contact support if the issue persists' });

  if (interaction.replied || interaction.deferred) {
    interaction.editReply({ embeds: [errorEmbed] }).catch(console.error);
  } else {
    interaction.reply({ embeds: [errorEmbed], flags: { ephemeral: true } }).catch(console.error);
  }
}

// Check if user has premium permissions
function hasPremiumPermissions(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const premiumRoles = botData.premiumRoles.get(member.guild.id) || [];
  return premiumRoles.some(roleId => member.roles.cache.has(roleId));
}

// Ticket system
function setupTicketSystem() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'ticket' && args[0] === 'msg') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set up tickets!');
        }
        const ticketMsg = args.slice(1).join(' ');
        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].message = ticketMsg;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Ticket Message Set!')
          .setDescription('The ticket panel message has been successfully configured.')
          .addFields({ name: 'Message', value: ticketMsg || 'Not provided' });

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'setoptions') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set ticket options!');
        }
        const options = args.join(' ').split(',').map(opt => opt.trim());
        const formattedOptions = options.map(opt => {
          const [name, emoji] = opt.split(':').map(part => part.trim());
          return { name, emoji };
        });

        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].options = formattedOptions;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Ticket Options Set!')
          .setDescription('The ticket dropdown options have been configured.')
          .addFields(
            { name: 'Options', value: formattedOptions.map(opt => `${opt.emoji} ${opt.name}`).join('\n') }
          );

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'setviewer') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set ticket viewers!');
        }
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Please mention a valid role!');

        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].viewerRole = role.id;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Ticket Viewer Role Set!')
          .setDescription(`The role ${role.name} can now view all ticket channels.`);

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'setticketcategory') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set the ticket category!');
        }
        const categoryId = args[0];
        if (!categoryId) return message.reply('❌ Please provide a valid category ID!');

        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].categoryId = categoryId;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Ticket Category Set!')
          .setDescription(`New tickets will be created under category ID: ${categoryId}`);

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'deployticketpanel') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to deploy ticket panels!');
        }
        const settings = botData.ticketSettings[message.guild.id];
        if (!settings || !settings.message || !settings.options) {
          return message.reply('❌ Please set up ticket message and options first!');
        }

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticket_type')
            .setPlaceholder('Select a ticket type')
            .addOptions(settings.options.map(opt => ({
              label: opt.name,
              value: opt.name.toLowerCase(),
              emoji: opt.emoji
            })))
        );

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🎟️ Create a Ticket')
          .setDescription(settings.message)
          .setFooter({ text: `${message.guild.name} Ticket System`, iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed], components: [selectMenu] });
        await message.reply('✅ Ticket panel deployed successfully!').then(msg => setTimeout(() => msg.delete(), 5000));
      }
    } catch (error) {
      handleError(error, message);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'ticket_type') return;

    try {
      await interaction.deferReply({ ephemeral: true });
      const settings = botData.ticketSettings[interaction.guild.id];
      if (!settings) {
        return interaction.editReply('❌ Ticket system not configured properly on this server.');
      }

      const ticketType = interaction.values[0];
      const ticketName = `ticket-${ticketType}-${interaction.user.username}-${Date.now().toString().slice(-4)}`;
      const category = interaction.guild.channels.cache.get(settings.categoryId);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.editReply('❌ Ticket category not found or invalid. Contact server admin.');
      }

      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          ...(settings.viewerRole ? [{
            id: settings.viewerRole,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          }] : [])
        ]
      });

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('claim_ticket')
          .setLabel('Claim')
          .setEmoji({ name: '🔒' })
          .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
          .setCustomId('lock_ticket')
          .setLabel('Lock')
          .setEmoji({ name: '🔐' })
          .setStyle(ButtonStyle.Secondary),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close')
          .setEmoji({ name: '❌' })
          .setStyle(ButtonStyle.Danger)
      );

      const welcomeEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`🎟️ ${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Ticket`)
        .setDescription(`Hello ${interaction.user.toString()}! Support will be with you shortly.\n\nPlease describe your issue in detail.`)
        .addFields(
          { name: 'Ticket Type', value: ticketType, inline: true },
          { name: 'Created By', value: interaction.user.toString(), inline: true }
        )
        .setFooter({ text: `${interaction.guild.name} Ticket System`, iconURL: interaction.guild.iconURL() });

      await ticketChannel.send({ 
        content: `${interaction.user.toString()} ${settings.viewerRole ? `<@&${settings.viewerRole}>` : ''}`,
        embeds: [welcomeEmbed], 
        components: [buttons] 
      });

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Ticket Created!')
        .setDescription(`Your ticket has been created: ${ticketChannel.toString()}`);

      await interaction.editReply({ embeds: [successEmbed] });
    } catch (error) {
      handleError(error, interaction);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.channel?.name?.startsWith('ticket-')) return;

    try {
      const ticketChannel = interaction.channel;
      const ticketName = ticketChannel.name;
      const ticketType = ticketName.split('-')[1];
      const creatorId = ticketChannel.permissionOverwrites.cache.find(ow => ow.type === 1)?.id;
      const creator = await client.users.fetch(creatorId).catch(() => null);

      if (interaction.customId === 'claim_ticket') {
        if (!hasPremiumPermissions(interaction.member)) {
          return interaction.reply({ content: '❌ You need premium permissions to claim tickets!', ephemeral: true });
        }

        await ticketChannel.permissionOverwrites.edit(interaction.user.id, {
          ViewChannel: true,
          SendMessages: true
        });

        const claimEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle('🔒 Ticket Claimed')
          .setDescription(`This ticket has been claimed by ${interaction.user.toString()}`)
          .setFooter({ text: 'Please wait for their response', iconURL: interaction.user.displayAvatarURL() });

        await interaction.reply({ embeds: [claimEmbed] });
      }

      if (interaction.customId === 'lock_ticket') {
        if (!hasPremiumPermissions(interaction.member)) {
          return interaction.reply({ content: '❌ You need premium permissions to lock tickets!', ephemeral: true });
        }

        await ticketChannel.permissionOverwrites.edit(creatorId, {
          SendMessages: false
        });

        const lockEmbed = new EmbedBuilder()
          .setColor('#FFFF00')
          .setTitle('🔐 Ticket Locked')
          .setDescription(`This ticket has been locked by ${interaction.user.toString()}`)
          .setFooter({ text: 'Only staff can send messages now', iconURL: interaction.user.displayAvatarURL() });

        await interaction.reply({ embeds: [lockEmbed] });
      }

      if (interaction.customId === 'close_ticket') {
        if (!hasPremiumPermissions(interaction.member)) {
          return interaction.reply({ content: '❌ You need premium permissions to close tickets!', ephemeral: true });
        }

        const closeEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Closing Ticket')
          .setDescription('This ticket will be closed in 10 seconds...')
          .setFooter({ text: 'A transcript will be sent to the creator', iconURL: interaction.guild.iconURL() });

        await interaction.reply({ embeds: [closeEmbed] });

        setTimeout(async () => {
          try {
            const channel = await interaction.guild.channels.fetch(ticketChannel.id).catch(() => null);
            if (!channel) {
              console.log(`Ticket channel ${ticketChannel.id} already deleted`);
              return;
            }

            const dmEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setAuthor({ name: interaction.guild.name, iconURL: interaction.guild.iconURL() })
              .setTitle('Ticket Closed')
              .addFields(
                { name: '🆔 Ticket ID', value: ticketChannel.id, inline: true },
                { name: '🟢 Opened By', value: creator?.toString() || 'Unknown', inline: true },
                { name: '🔴 Closed By', value: interaction.user.toString(), inline: true },
                { name: '⏰ Open Time', value: new Date(ticketChannel.createdTimestamp).toLocaleDateString('en-GB'), inline: true },
                { name: '🔐 Claimed By', value: 'Not claimed', inline: true },
                { name: '📄 Reason', value: 'No reason specified', inline: true },
                { name: '🕓 Closed At', value: new Date().toLocaleDateString('en-GB'), inline: true }
              )
              .setThumbnail(interaction.guild.iconURL());

            try {
              if (creator) await creator.send({ embeds: [dmEmbed] });
            } catch (e) {
              console.log('Could not send DM to ticket creator');
            }

            await ticketChannel.delete('Ticket closed by staff').catch(e => {
              console.error(`Failed to delete ticket channel ${ticketChannel.id}:`, e);
            });
          } catch (error) {
            console.error('Error in ticket closing process:', error);
          }
        }, 10000);
      }
    } catch (error) {
      handleError(error, interaction);
    }
  });
}

// Application system
function setupApplicationSystem() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'app' && args[0] === 'msg') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set up applications!');
        }
        const appMsg = args.slice(1).join(' ');
        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].message = appMsg;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Application Message Set!')
          .setDescription('The application panel message has been successfully configured.')
          .addFields({ name: 'Message', value: appMsg || 'Not provided' });

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'addoptions') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set application options!');
        }
        const options = args.join(' ').split(',').map(opt => opt.trim());
        const formattedOptions = options.map(opt => {
          const [name, emoji] = opt.split(':').map(part => part.trim());
          return { name, emoji };
        });

        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].options = formattedOptions;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Application Options Set!')
          .setDescription('The application role buttons have been configured.')
          .addFields(
            { name: 'Options', value: formattedOptions.map(opt => `${opt.emoji} ${opt.name}`).join('\n') }
          );

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'setappchannel') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set the application channel!');
        }
        const channelId = args[0];
        if (!channelId) return message.reply('❌ Please provide a valid channel ID!');

        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].channelId = channelId;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Application Channel Set!')
          .setDescription(`New applications will be sent to channel ID: ${channelId}`);

        message.reply({ embeds: [successEmbed] });
      }

      if (command === 'deployapp') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to deploy application panels!');
        }
        const settings = botData.applicationSettings[message.guild.id];
        if (!settings || !settings.message || !settings.options) {
          return message.reply('❌ Please set up application message and options first!');
        }

        const buttons = new ActionRowBuilder().addComponents(
          settings.options.map(opt => 
            new ButtonBuilder()
              .setCustomId(`app_${opt.name.toLowerCase()}`)
              .setLabel(opt.name)
              .setEmoji({ name: opt.emoji })
              .setStyle(ButtonStyle.Primary)
          )
        );

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('📋 Application System')
          .setDescription(settings.message)
          .setFooter({ text: `${message.guild.name} Applications`, iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed], components: [buttons] });
        await message.reply('✅ Application panel deployed successfully!').then(msg => setTimeout(() => msg.delete(), 5000));
      }

      if (command.startsWith('ques')) {
        const questionNum = parseInt(command.replace('ques', ''));
        if (isNaN(questionNum)) return;

        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set application questions!');
        }

        const question = args.join(' ');
        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].questions = botData.applicationSettings[message.guild.id].questions || [];
        botData.applicationSettings[message.guild.id].questions[questionNum - 1] = question;

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(`✅ Question ${questionNum} Set!`)
          .setDescription('This question will be asked to applicants.')
          .addFields({ name: 'Question', value: question });

        message.reply({ embeds: [successEmbed] });
      }
    } catch (error) {
      handleError(error, message);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('app_')) return;

    try {
      await interaction.deferReply({ ephemeral: true });
      const settings = botData.applicationSettings[interaction.guild.id];
      if (!settings || !settings.questions || settings.questions.length === 0) {
        return interaction.editReply('❌ Application system not properly configured on this server.');
      }

      const roleName = interaction.customId.replace('app_', '');
      const role = interaction.guild.roles.cache.find(r => r.name.toLowerCase() === roleName);
      if (!role) {
        return interaction.editReply('❌ The role for this application no longer exists.');
      }

      botData.applicationSettings[interaction.user.id] = {
        guildId: interaction.guild.id,
        roleId: role.id,
        answers: [],
        currentQuestion: 0
      };

      try {
        const questionEmbed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`📋 Application for ${role.name}`)
          .setDescription(settings.questions[0])
          .setFooter({ text: 'Reply with your answer. Type "cancel" to stop.', iconURL: interaction.guild.iconURL() });

        await interaction.user.send({ embeds: [questionEmbed] });
        await interaction.editReply({ content: '✅ Check your DMs for the first question!' });
      } catch (e) {
        return interaction.editReply('❌ I couldn\'t send you a DM. Please enable DMs and try again.');
      }

      const filter = m => m.author.id === interaction.user.id && m.channel.type === ChannelType.DM;
      const collector = interaction.client.channels.cache
        .find(c => c.type === ChannelType.DM && c.recipient?.id === interaction.user.id)
        ?.createMessageCollector({ filter, time: 600000 });

      if (!collector) {
        return interaction.editReply('❌ Failed to set up question collector. Please try again.');
      }

      collector.on('collect', async m => {
        if (m.content.toLowerCase() === 'cancel') {
          collector.stop();
          await interaction.user.send('❌ Application cancelled.');
          delete botData.applicationSettings[interaction.user.id];
          return;
        }

        const appData = botData.applicationSettings[interaction.user.id];
        appData.answers.push(m.content);
        appData.currentQuestion++;

        if (appData.currentQuestion < settings.questions.length) {
          const nextQuestionEmbed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle(`📋 Question ${appData.currentQuestion + 1}`)
            .setDescription(settings.questions[appData.currentQuestion])
            .setFooter({ text: 'Reply with your answer. Type "cancel" to stop.', iconURL: interaction.guild.iconURL() });

          await interaction.user.send({ embeds: [nextQuestionEmbed] });
        } else {
          collector.stop();
          await submitApplication(interaction, appData);
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          interaction.user.send('⏰ Application timed out due to inactivity.').catch(() => {});
        }
        delete botData.applicationSettings[interaction.user.id];
      });
    } catch (error) {
      handleError(error, interaction);
    }
  });

  async function submitApplication(interaction, appData) {
    try {
      const settings = botData.applicationSettings[appData.guildId];
      const guild = client.guilds.cache.get(appData.guildId);
      const role = guild.roles.cache.get(appData.roleId);
      const appChannel = guild.channels.cache.get(settings.channelId);

      if (!appChannel) {
        await interaction.user.send('❌ Application channel not found. Contact server admin.');
        return;
      }

      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('accept_app')
          .setLabel('Accept')
          .setEmoji({ name: '✅' })
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId('reject_app')
          .setLabel('Reject')
          .setEmoji({ name: '❌' })
          .setStyle(ButtonStyle.Danger)
      );

      const appEmbed = new EmbedBuilder()
        .setColor('#5865F2')
        .setTitle(`📋 Application for ${role.name}`)
        .setDescription(`Applicant: ${interaction.user.toString()}`)
        .setThumbnail(interaction.user.displayAvatarURL());

      settings.questions.forEach((question, i) => {
        appEmbed.addFields({ name: `❓ ${question}`, value: appData.answers[i] || 'No answer provided' });
      });

      await appChannel.send({ 
        content: `New application from ${interaction.user.toString()} for ${role.toString()}`,
        embeds: [appEmbed], 
        components: [buttons] 
      });

      const successEmbed = new EmbedBuilder()
        .setColor('#00FF00')
        .setTitle('✅ Application Submitted!')
        .setDescription(`Your application for ${role.name} has been submitted successfully.`)
        .setFooter({ text: 'You will be notified when a decision is made.', iconURL: guild.iconURL() });

      await interaction.user.send({ embeds: [successEmbed] });
    } catch (error) {
      handleError(error, interaction);
    }
  }

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !['accept_app', 'reject_app'].includes(interaction.customId)) return;
    if (!interaction.message.embeds[0].title.includes('Application for')) return;

    try {
      await interaction.deferReply({ ephemeral: true });
      
      const appEmbed = interaction.message.embeds[0];
      const applicantId = appEmbed.description.match(/<@!?(\d+)>/)[1];
      const applicant = interaction.guild.members.cache.get(applicantId);
      
      if (!applicant) {
        return interaction.editReply('❌ Could not find the applicant in this server.');
      }

      const roleName = appEmbed.title.replace('📋 Application for ', '');
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      if (interaction.customId === 'accept_app') {
        await applicant.roles.add(role);

        const acceptEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle(`✅ Application Accepted!`)
          .setDescription(`Congratulations! Your application for ${role.name} in ${interaction.guild.name} has been accepted.`)
          .addFields(
            { name: 'Accepted By', value: interaction.user.toString(), inline: true },
            { name: 'Accepted At', value: new Date().toLocaleString(), inline: true }
          )
          .setThumbnail(interaction.guild.iconURL());

        try {
          await applicant.send({ embeds: [acceptEmbed] });
        } catch (e) {
          console.log('Could not send DM to applicant');
        }

        await interaction.editReply('✅ Application accepted and role assigned!');
      } else {
        const rejectEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle(`❌ Application Rejected`)
          .setDescription(`Your application for ${role.name} in ${interaction.guild.name} has been rejected.`)
          .addFields(
            { name: 'Rejected By', value: interaction.user.toString(), inline: true },
            { name: 'Rejected At', value: new Date().toLocaleString(), inline: true }
          )
          .setFooter({ text: 'You may reapply if you wish', iconURL: interaction.guild.iconURL() });

        try {
          await applicant.send({ embeds: [rejectEmbed] });
        } catch (e) {
          console.log('Could not send DM to applicant');
        }

        await interaction.editReply('✅ Application rejected and applicant notified!');
      }

      const updatedEmbed = new EmbedBuilder(appEmbed.data)
        .setColor(interaction.customId === 'accept_app' ? '#00FF00' : '#FF0000')
        .setTitle(`📋 ${interaction.customId === 'accept_app' ? '✅ Accepted' : '❌ Rejected'}: ${roleName}`);

      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
    } catch (error) {
      handleError(error, interaction);
    }
  });
}

// Warning system
function setupWarningSystem() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'warnlimit') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to set warn limits!');
        }
        
        const limit = parseInt(args[0]);
        if (isNaN(limit) || limit < 1) {
          return message.reply('❌ Please provide a valid number (1 or higher)!');
        }

        botData.warnLimits.set(message.guild.id, limit);
        
        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Warn Limit Set!')
          .setDescription(`Members will now be automatically kicked after reaching ${limit} warnings.`)
          .setFooter({ text: 'Use !warn @user to issue warnings', iconURL: message.guild.iconURL() });

        await message.reply({ embeds: [successEmbed] });
      }

      if (command === 'warn') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to use this command!');
        }
        const user = message.mentions.users.first();
        if (!user) return message.reply('❌ Please mention a user to warn!');

        const member = message.guild.members.cache.get(user.id);
        if (!member) return message.reply('❌ That user is not in this server!');

        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!botData.warnings.has(message.guild.id)) {
          botData.warnings.set(message.guild.id, new Map());
        }

        const guildWarnings = botData.warnings.get(message.guild.id);
        if (!guildWarnings.has(user.id)) {
          guildWarnings.set(user.id, []);
        }

        const warnings = guildWarnings.get(user.id);
        warnings.push({
          moderator: message.author.id,
          reason: reason,
          timestamp: Date.now()
        });

        const warnLimit = botData.warnLimits.get(message.guild.id) || 3;
        
        if (warnings.length >= warnLimit) {
          try {
            await member.kick(`Automatically kicked for reaching ${warnLimit} warnings`);

            const kickEmbed = new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('⚠️ Member Kicked')
              .setDescription(`${user.toString()} has been automatically kicked for reaching ${warnLimit} warnings.`)
              .addFields(
                { name: 'Total Warnings', value: warnings.length.toString(), inline: true },
                { name: 'Last Warning', value: reason, inline: true }
              )
              .setFooter({ text: `Moderator: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

            await message.channel.send({ embeds: [kickEmbed] });
          } catch (e) {
            message.reply('❌ Failed to automatically kick the member. I might not have permission.');
          }
        } else {
          const warnEmbed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('⚠️ Warning Issued')
            .setDescription(`${user.toString()} has been warned.`)
            .addFields(
              { name: 'Reason', value: reason, inline: true },
              { name: 'Total Warnings', value: `${warnings.length}/${warnLimit}`, inline: true }
            )
            .setFooter({ text: `Moderator: ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

          await message.channel.send({ embeds: [warnEmbed] });

          try {
            const dmEmbed = new EmbedBuilder()
              .setColor('#FFA500')
              .setTitle(`⚠️ Warning in ${message.guild.name}`)
              .setDescription(`You have received a warning from a moderator.`)
              .addFields(
                { name: 'Reason', value: reason, inline: true },
                { name: 'Total Warnings', value: `${warnings.length}/${warnLimit}`, inline: true }
              )
              .setFooter({ text: 'Repeated warnings may result in kicks or bans', iconURL: message.guild.iconURL() });

            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            console.log('Could not send DM to warned user');
          }
        }
      }

      if (command === 'warnings') {
        const user = message.mentions.users.first() || message.author;
        const guildWarnings = botData.warnings.get(message.guild.id);

        if (!guildWarnings || !guildWarnings.has(user.id)) {
          return message.reply(`ℹ️ ${user.toString()} has no warnings.`);
        }

        const warnings = guildWarnings.get(user.id);
        const warnLimit = botData.warnLimits.get(message.guild.id) || 3;
        
        const warnEmbed = new EmbedBuilder()
          .setColor('#FFA500')
          .setTitle(`⚠️ Warnings for ${user.tag}`)
          .setDescription(`Total warnings: ${warnings.length}/${warnLimit}`);

        warnings.forEach((warn, i) => {
          warnEmbed.addFields({
            name: `Warning #${i + 1}`,
            value: `**Moderator:** <@${warn.moderator}>\n**Reason:** ${warn.reason}\n**Date:** ${new Date(warn.timestamp).toLocaleString()}`,
            inline: false
          });
        });

        await message.channel.send({ embeds: [warnEmbed] });
      }
    } catch (error) {
      handleError(error, message);
    }
  });
}

// Mini-games system
function setupMiniGames() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'rps') {
        const opponent = message.mentions.users.first();
        if (!opponent) return message.reply('❌ Please mention a user to play with!');
        if (opponent.bot) return message.reply('❌ You can\'t play with bots!');
        if (opponent.id === message.author.id) return message.reply('❌ You can\'t play with yourself!');

        const gameId = `${message.author.id}-${opponent.id}-rps`;
        if (botData.games.has(gameId)) {
          return message.reply('❌ There\'s already an ongoing game between these players!');
        }

        botData.games.set(gameId, {
          players: [message.author.id, opponent.id],
          choices: {}
        });

        const buttons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('rps_rock')
            .setLabel('Rock')
            .setEmoji({ name: '🪨' })
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('rps_paper')
            .setLabel('Paper')
            .setEmoji({ name: '📄' })
            .setStyle(ButtonStyle.Primary),
          new ButtonBuilder()
            .setCustomId('rps_scissors')
            .setLabel('Scissors')
            .setEmoji({ name: '✂️' })
            .setStyle(ButtonStyle.Primary)
        );

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🪨 Rock, 📄 Paper, ✂️ Scissors')
          .setDescription(`${message.author.toString()} has challenged ${opponent.toString()} to a game!\n\nBoth players must select their choice.`)
          .setFooter({ text: 'Game will timeout in 60 seconds', iconURL: message.guild.iconURL() });

        const gameMessage = await message.channel.send({ 
          content: `${message.author.toString()} ${opponent.toString()}`,
          embeds: [embed], 
          components: [buttons] 
        });

        setTimeout(() => {
          if (botData.games.has(gameId)) {
            botData.games.delete(gameId);
            embed.setColor('#FF0000')
              .setDescription('⏰ Game timed out due to inactivity.');
            gameMessage.edit({ embeds: [embed], components: [] }).catch(console.error);
          }
        }, 60000);
      }

      if (command === 'guess') {
        const gameId = `${message.author.id}-guess`;
        if (botData.games.has(gameId)) {
          return message.reply('❌ You already have an ongoing guessing game!');
        }

        const number = Math.floor(Math.random() * 100) + 1;
        botData.games.set(gameId, {
          number: number,
          attempts: 0
        });

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🔢 Number Guessing Game')
          .setDescription('I\'ve picked a number between 1 and 100. Try to guess it!')
          .setFooter({ text: 'Type your guesses in chat. Game will timeout in 2 minutes.', iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed] });

        const filter = m => m.author.id === message.author.id && !isNaN(m.content);
        const collector = message.channel.createMessageCollector({ filter, time: 120000 });

        collector.on('collect', async m => {
          const guess = parseInt(m.content);
          const game = botData.games.get(gameId);
          game.attempts++;

          if (guess === game.number) {
            const winEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('🎉 You Win!')
              .setDescription(`You guessed the number ${game.number} correctly in ${game.attempts} attempts!`)
              .setFooter({ text: 'Game over', iconURL: message.author.displayAvatarURL() });

            await message.channel.send({ embeds: [winEmbed] });
            botData.games.delete(gameId);
            collector.stop();
          } else {
            const hint = guess < game.number ? 'higher' : 'lower';
            await message.channel.send(`❌ Wrong! Try a ${hint} number.`);
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            const game = botData.games.get(gameId);
            if (game) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⏰ Game Over')
                .setDescription(`Time's up! The number was ${game.number}.`)
                .setFooter({ text: 'Better luck next time!', iconURL: message.guild.iconURL() });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }
        });
      }

      if (command === 'math') {
        const operations = ['+', '-', '*', '/'];
        const operation = operations[Math.floor(Math.random() * operations.length)];
        let num1, num2, answer;

        switch (operation) {
          case '+':
            num1 = Math.floor(Math.random() * 100);
            num2 = Math.floor(Math.random() * 100);
            answer = num1 + num2;
            break;
          case '-':
            num1 = Math.floor(Math.random() * 100);
            num2 = Math.floor(Math.random() * num1);
            answer = num1 - num2;
            break;
          case '*':
            num1 = Math.floor(Math.random() * 15);
            num2 = Math.floor(Math.random() * 15);
            answer = num1 * num2;
            break;
          case '/':
            num2 = Math.floor(Math.random() * 10) + 1;
            answer = Math.floor(Math.random() * 10);
            num1 = num2 * answer;
            break;
        }

        const gameId = `${message.author.id}-math`;
        botData.games.set(gameId, {
          answer: answer,
          timeout: setTimeout(() => {
            if (botData.games.has(gameId)) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⏰ Time\'s Up!')
                .setDescription(`The correct answer was ${answer}.`)
                .setFooter({ text: 'Better luck next time!', iconURL: message.guild.iconURL() });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }, 15000)
        });

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🧮 Math Challenge')
          .setDescription(`Solve this problem: **${num1} ${operation} ${num2} = ?**`)
          .setFooter({ text: 'You have 15 seconds to answer!', iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed] });

        const filter = m => m.author.id === message.author.id && !isNaN(m.content);
        const collector = message.channel.createMessageCollector({ filter, time: 15000 });

        collector.on('collect', async m => {
          const guess = parseInt(m.content);
          const game = botData.games.get(gameId);

          if (guess === game.answer) {
            clearTimeout(game.timeout);
            const winEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ Correct!')
              .setDescription(`You solved it! ${num1} ${operation} ${num2} = ${answer}`)
              .setFooter({ text: 'Great job!', iconURL: message.author.displayAvatarURL() });

            await message.channel.send({ embeds: [winEmbed] });
            botData.games.delete(gameId);
            collector.stop();
          } else {
            await message.channel.send('❌ Incorrect! Try again.');
          }
        });
      }

      if (command === 'trivia') {
        const triviaQuestions = [
          {
            question: "What is the capital of France?",
            options: ["London", "Berlin", "Paris", "Madrid"],
            answer: 2
          },
          {
            question: "Which planet is known as the Red Planet?",
            options: ["Venus", "Mars", "Jupiter", "Saturn"],
            answer: 1
          },
          {
            question: "How many continents are there?",
            options: ["5", "6", "7", "8"],
            answer: 2
          },
          {
            question: "Who painted the Mona Lisa?",
            options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
            answer: 2
          },
          {
            question: "What is the largest ocean on Earth?",
            options: ["Atlantic", "Indian", "Arctic", "Pacific"],
            answer: 3
          }
        ];

        const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
        const gameId = `${message.author.id}-trivia`;

        botData.games.set(gameId, {
          answer: question.answer,
          timeout: setTimeout(() => {
            if (botData.games.has(gameId)) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⏰ Time\'s Up!')
                .setDescription(`The correct answer was: **${question.options[question.answer]}**`)
                .setFooter({ text: 'Better luck next time!', iconURL: message.guild.iconURL() });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }, 15000)
        });

        const buttons = new ActionRowBuilder().addComponents(
          question.options.map((option, index) => 
            new ButtonBuilder()
              .setCustomId(`trivia_${index}`)
              .setLabel(option)
              .setStyle(ButtonStyle.Primary)
          )
        );

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('❓ Trivia Question')
          .setDescription(question.question)
          .setFooter({ text: 'You have 15 seconds to answer!', iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed], components: [buttons] });
      }

      if (command === 'type') {
        const sentences = [
          "The quick brown fox jumps over the lazy dog.",
          "Pack my box with five dozen liquor jugs.",
          "How vexingly quick daft zebras jump!",
          "Bright vixens jump; dozy fowl quack.",
          "Sphinx of black quartz, judge my vow."
        ];

        const sentence = sentences[Math.floor(Math.random() * sentences.length)];
        const gameId = `${message.author.id}-type`;

        botData.games.set(gameId, {
          sentence: sentence,
          startTime: Date.now()
        });

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('⌨️ Typing Speed Test')
          .setDescription(`Type the following sentence as fast as you can:\n\n**${sentence}**`)
          .setFooter({ text: 'The timer starts now!', iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed] });

        const filter = m => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, time: 60000 });

        collector.on('collect', async m => {
          if (m.content === sentence) {
            const game = botData.games.get(gameId);
            const timeTaken = (Date.now() - game.startTime) / 1000;
            const wpm = Math.round((sentence.split(' ').length / timeTaken) * 60);

            const resultEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('🏁 Test Completed!')
              .setDescription(`You typed the sentence correctly in ${timeTaken.toFixed(2)} seconds!`)
              .addFields(
                { name: 'Words Per Minute', value: wpm.toString(), inline: true },
                { name: 'Characters', value: sentence.length.toString(), inline: true }
              )
              .setFooter({ text: 'Great job!', iconURL: message.author.displayAvatarURL() });

            await message.channel.send({ embeds: [resultEmbed] });
            botData.games.delete(gameId);
            collector.stop();
          } else {
            await message.channel.send('❌ That\'s not quite right. Try again!');
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            if (botData.games.has(gameId)) {
              const timeoutEmbed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('⏰ Time\'s Up!')
                .setDescription('You took too long to complete the typing test.')
                .setFooter({ text: 'Try again!', iconURL: message.guild.iconURL() });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }
        });
      }
    } catch (error) {
      handleError(error, message);
    }
  });

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('rps_')) return;

    try {
      const choice = interaction.customId.replace('rps_', '');
      const gameId = [...botData.games.keys()].find(key => 
        key.includes(interaction.user.id) && key.endsWith('-rps')
      );

      if (!gameId) {
        return interaction.reply({ content: '❌ No active game found or game expired.', ephemeral: true });
      }

      const game = botData.games.get(gameId);
      if (!game.players.includes(interaction.user.id)) {
        return interaction.reply({ content: '❌ You\'re not part of this game!', ephemeral: true });
      }

      game.choices[interaction.user.id] = choice;
      await interaction.deferUpdate();

      if (Object.keys(game.choices).length === 2) {
        const [player1, player2] = game.players;
        const choice1 = game.choices[player1];
        const choice2 = game.choices[player2];

        let result;
        if (choice1 === choice2) {
          result = 'It\'s a tie!';
        } else if (
          (choice1 === 'rock' && choice2 === 'scissors') ||
          (choice1 === 'paper' && choice2 === 'rock') ||
          (choice1 === 'scissors' && choice2 === 'paper')
        ) {
          result = `<@${player1}> wins!`;
        } else {
          result = `<@${player2}> wins!`;
        }

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🎮 Game Results')
          .setDescription(`${interaction.client.users.cache.get(player1).toString()} chose ${getEmoji(choice1)}\n${interaction.client.users.cache.get(player2).toString()} chose ${getEmoji(choice2)}\n\n${result}`)
          .setFooter({ text: 'Thanks for playing!', iconURL: interaction.guild.iconURL() });

        await interaction.message.edit({ embeds: [embed], components: [] });
        botData.games.delete(gameId);
      }
    } catch (error) {
      handleError(error, interaction);
    }
  });

  function getEmoji(choice) {
    switch (choice) {
      case 'rock': return '🪨 Rock';
      case 'paper': return '📄 Paper';
      case 'scissors': return '✂️ Scissors';
      default: return choice;
    }
  }

  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('trivia_')) return;

    try {
      const answerIndex = parseInt(interaction.customId.replace('trivia_', ''));
      const gameId = `${interaction.user.id}-trivia`;
      const game = botData.games.get(gameId);

      if (!game) {
        return interaction.reply({ content: '❌ No active trivia game found or game expired.', ephemeral: true });
      }

      clearTimeout(game.timeout);
      await interaction.deferUpdate();

      if (answerIndex === game.answer) {
        const winEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Correct Answer!')
          .setDescription('You got it right! 🎉')
          .setFooter({ text: 'Well done!', iconURL: interaction.user.displayAvatarURL() });

        await interaction.message.edit({ embeds: [winEmbed], components: [] });
      } else {
        const loseEmbed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('❌ Wrong Answer!')
          .setDescription('Better luck next time!')
          .setFooter({ text: 'Keep trying!', iconURL: interaction.guild.iconURL() });

        await interaction.message.edit({ embeds: [loseEmbed], components: [] });
      }

      botData.games.delete(gameId);
    } catch (error) {
      handleError(error, interaction);
    }
  });
}

// DM and Embed tools
function setupDmAndEmbedTools() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'dm') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply('❌ You need premium permissions to DM roles!');
        }
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Please mention a role to DM!');

        const dmMessage = args.slice(1).join(' ');
        if (!dmMessage) return message.reply('❌ Please provide a message to send!');

        const members = role.members.filter(m => !m.user.bot);
        if (members.size === 0) return message.reply('❌ That role has no members to DM!');

        const confirmEmbed = new EmbedBuilder()
          .setColor('#FFFF00')
          .setTitle('⚠️ Confirm DM Send')
          .setDescription(`You are about to DM **${members.size}** members of ${role.toString()}.\n\n**Message:**\n${dmMessage}`)
          .setFooter({ text: 'This action cannot be undone', iconURL: message.guild.iconURL() });

        const confirmButtons = new ActionRowBuilder().addComponents(
          new ButtonBuilder()
            .setCustomId('confirm_dm')
            .setLabel('Confirm')
            .setStyle(ButtonStyle.Success),
          new ButtonBuilder()
            .setCustomId('cancel_dm')
            .setLabel('Cancel')
            .setStyle(ButtonStyle.Danger)
        );

        const confirmation = await message.reply({ 
          embeds: [confirmEmbed], 
          components: [confirmButtons] 
        });

        const filter = i => i.user.id === message.author.id;
        const collector = confirmation.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
          if (i.customId === 'confirm_dm') {
            await i.deferUpdate();
            let successCount = 0;
            let failCount = 0;

            for (const [, member] of members) {
              try {
                const dmEmbed = new EmbedBuilder()
                  .setColor('#5865F2')
                  .setTitle(`Message from ${message.guild.name}`)
                  .setDescription(dmMessage)
                  .setFooter({ 
                    text: `Sent by ${message.author.tag}`, 
                    iconURL: message.guild.iconURL() 
                  });

                await member.send({ embeds: [dmEmbed] });
                successCount++;
              } catch (e) {
                failCount++;
              }
            }

            const resultEmbed = new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ DM Sent')
              .setDescription(`Successfully sent to ${successCount} members. ${failCount > 0 ? `${failCount} failed.` : ''}`)
              .setFooter({ text: 'DM operation completed', iconURL: message.guild.iconURL() });

            await confirmation.edit({ embeds: [resultEmbed], components: [] });
          } else {
            await i.update({ 
              content: '❌ DM operation cancelled.', 
              embeds: [], 
              components: [] 
            });
          }
          collector.stop();
        });

        collector.on('end', () => {
          if (!collector.ended) {
            confirmation.edit({ 
              content: '⏰ DM confirmation timed out.', 
              embeds: [], 
              components: [] 
            }).catch(console.error);
          }
        });
      }

      if (command === 'embed') {
        const color = args.shift();
        if (!color) return message.reply('❌ Please provide a color (hex or name)!');

        const embedMessage = args.join(' ');
        if (!embedMessage) return message.reply('❌ Please provide a message for the embed!');

        let embedColor;
        if (color.startsWith('#')) {
          embedColor = color;
        } else {
          const colorMap = {
            red: '#FF0000',
            green: '#00FF00',
            blue: '#0000FF',
            yellow: '#FFFF00',
            purple: '#800080',
            pink: '#FFC0CB',
            orange: '#FFA500',
            black: '#000000',
            white: '#FFFFFF'
          };
          embedColor = colorMap[color.toLowerCase()] || '#5865F2';
        }

        const embed = new EmbedBuilder()
          .setColor(embedColor)
          .setDescription(embedMessage)
          .setFooter({ 
            text: `Sent by ${message.author.tag}`, 
            iconURL: message.author.displayAvatarURL() 
          });

        await message.channel.send({ embeds: [embed] });
        await message.delete().catch(console.error);
      }
    } catch (error) {
      handleError(error, message);
    }
  });
}

// Utility commands
function setupUtilityCommands() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'prems') {
        if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply('❌ You need administrator permissions to set premium roles!');
        }
        const role = message.mentions.roles.first();
        if (!role) return message.reply('❌ Please mention a role to give premium permissions!');

        botData.premiumRoles.set(message.guild.id, [...(botData.premiumRoles.get(message.guild.id) || []), role.id]);

        const successEmbed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('✅ Premium Role Added!')
          .setDescription(`Members with ${role.toString()} now have full access to all bot commands and features.`)
          .setFooter({ text: 'Use this command again to add more roles', iconURL: message.guild.iconURL() });

        await message.reply({ embeds: [successEmbed] });
      }

      if (command === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);

        if (!member) return message.reply('❌ That user is not in this server!');

        const roles = member.roles.cache
          .filter(role => role.id !== message.guild.id)
          .map(role => role.toString())
          .join(' ') || 'None';

        const embed = new EmbedBuilder()
          .setColor(member.displayHexColor || '#5865F2')
          .setTitle(`ℹ️ User Info: ${user.tag}`)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: '🆔 ID', value: user.id, inline: true },
            { name: '📅 Joined Server', value: member.joinedAt.toLocaleDateString(), inline: true },
            { name: '📅 Account Created', value: user.createdAt.toLocaleDateString(), inline: true },
            { name: `🎭 Roles [${member.roles.cache.size - 1}]`, value: roles, inline: false },
            { name: '🌟 Premium Status', value: hasPremiumPermissions(member) ? '✅ Has premium access' : '❌ No premium access', inline: true }
          )
          .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() });

        await message.channel.send({ embeds: [embed] });
      }

      if (command === 'serverinfo') {
        const { guild } = message;
        const owner = await guild.fetchOwner();

        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle(`ℹ️ Server Info: ${guild.name}`)
          .setThumbnail(guild.iconURL())
          .addFields(
            { name: '🆔 ID', value: guild.id, inline: true },
            { name: '👑 Owner', value: owner.user.tag, inline: true },
            { name: '📅 Created', value: guild.createdAt.toLocaleDateString(), inline: true },
            { name: '👥 Members', value: guild.memberCount.toString(), inline: true },
            { name: '📊 Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: '🎭 Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: '✨ Boost Level', value: `Level ${guild.premiumTier}`, inline: true },
            { name: '🚀 Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true }
          )
          .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

        await message.channel.send({ embeds: [embed] });
      }

      if (command === 'ping') {
        const sent = await message.channel.send('🏓 Pinging...');
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🏓 Pong!')
          .addFields(
            { name: '🤖 Bot Latency', value: `${latency}ms`, inline: true },
            { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true }
          )
          .setFooter({ text: message.guild.name, iconURL: message.guild.iconURL() });

        await sent.edit({ content: '', embeds: [embed] });
      }

      if (command === 'help') {
        const embed = new EmbedBuilder()
          .setColor('#5865F2')
          .setTitle('🤖 Bot Help Menu')
          .setDescription('Here are all the available commands:')
          .addFields(
            { 
              name: '🎟️ Ticket System', 
              value: '`!ticket msg <message>` - Set ticket panel message\n' +
                    '`!setoptions general:💬, support:🛠️` - Set dropdown options\n' +
                    '`!setviewer @role` - Set ticket viewer role\n' +
                    '`!setticketcategory <id>` - Set ticket category\n' +
                    '`!deployticketpanel` - Deploy ticket panel'
            },
            { 
              name: '📋 Application System', 
              value: '`!app msg <message>` - Set app panel message\n' +
                    '`!addoptions Role:🛡️` - Add role buttons\n' +
                    '`!setappchannel <id>` - Set app channel\n' +
                    '`!deployapp` - Deploy app panel\n' +
                    '`!ques1 <question>` - Set question 1'
            },
            { 
              name: '⚠️ Moderation', 
              value: '`!warn @user [reason]` - Warn a user\n' +
                    '`!warnings @user` - Check warnings\n' +
                    '`!warnlimit <number>` - Set warn limit for auto-kick'
            },
            { 
              name: '🎮 Mini-Games', 
              value: '`!rps @user` - Rock Paper Scissors\n' +
                    '`!guess` - Number guessing game\n' +
                    '`!math` - Math challenge\n' +
                    '`!trivia` - Trivia questions\n' +
                    '`!type` - Typing speed test'
            },
            { 
              name: '📩 DM & Embeds', 
              value: '`!dm @role <message>` - DM a role\n' +
                    '`!embed <color> <message>` - Create an embed'
            },
            { 
              name: 'ℹ️ Utilities', 
              value: '`!userinfo @user` - User information\n' +
                    '`!serverinfo` - Server information\n' +
                    '`!ping` - Bot latency\n' +
                    '`!prems @role` - Give role full bot access\n' +
                    '`!help` - This menu'
            }
          )
          .setFooter({ text: 'Prefix: ! | All commands are prefix-based', iconURL: client.user.displayAvatarURL() });

        await message.channel.send({ embeds: [embed] });
      }
    } catch (error) {
      handleError(error, message);
    }
  });
}

// Client ready event
client.once('ready', () => {
  console.log(`🔥 ${client.user.tag} is online!`);
  client.user.setActivity('!help for commands', { type: 'PLAYING' });

  // Setup all systems
  setupTicketSystem();
  setupApplicationSystem();
  setupWarningSystem();
  setupMiniGames();
  setupDmAndEmbedTools();
  setupUtilityCommands();
});

// Login to Discord
client.login(process.env.TOKEN).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
