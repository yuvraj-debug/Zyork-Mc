require('dotenv').config();
const express = require('express');
const fs = require('fs');
const path = require('path');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  ChannelType,
  Events,
  PermissionsBitField,
  Collection
} = require('discord.js');

const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Keep-alive server running on port ${PORT}`));

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
const dataPath = path.join(__dirname, 'bot_data.json');

// Load data from file if exists
function loadData() {
  try {
    if (fs.existsSync(dataPath)) {
      const data = JSON.parse(fs.readFileSync(dataPath, 'utf8'));
      return {
        logChannelId: data.logChannelId || null,
        ticketSetup: data.ticketSetup || {
          description: '',
          options: [],
          viewerRoleId: null,
          categoryId: null
        },
        appQuestions: data.appQuestions || [],
        appOptions: data.appOptions || [],
        userLastApplied: new Map(data.userLastApplied || [])
      };
    }
  } catch (err) {
    console.error('Error loading data:', err);
  }
  return {
    logChannelId: null,
    ticketSetup: {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null
    },
    appQuestions: [],
    appOptions: [],
    userLastApplied: new Map()
  };
}

// Save data to file
function saveData(data) {
  try {
    const dataToSave = {
      ...data,
      userLastApplied: Array.from(data.userLastApplied.entries())
    };
    fs.writeFileSync(dataPath, JSON.stringify(dataToSave, null, 2));
  } catch (err) {
    console.error('Error saving data:', err);
  }
}

let { logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied } = loadData();
const activeApplications = new Map();

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  console.log(`🛠️ Serving ${client.guilds.cache.size} guilds`);
});

// Helper function to send error messages
async function sendError(message, error) {
  console.error(error);
  try {
    await message.reply({ embeds: [
      new EmbedBuilder()
        .setTitle('❌ Error')
        .setDescription(`An error occurred: ${error.message || error}`)
        .setColor('Red')
    ] });
  } catch (err) {
    console.error('Failed to send error message:', err);
  }
}

// Command handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  
  const content = message.content.trim();
  const lc = content.toLowerCase();

  try {
    if (lc === '!help') {
      const embed = new EmbedBuilder()
        .setTitle('📘 Bot Commands')
        .setColor('Blue')
        .setDescription(`🎮 **Mini‑Games**
\`!guess <number>\` — Guess the number
\`!trivia\` — Trivia game
\`!scramble\` — Unscramble word

📝 **Applications**
\`!addques <question>\` — Add application question
\`!setoptions Option|Cooldown,...\` — Set options with cooldown
\`!setchannel #channel\` — Set log channel
\`!deploy\` — Deploy application menu
\`!reset\` — Reset application data

🎟️ **Tickets**
\`!ticket <message>\` — Set ticket panel message
\`!option <emoji> <label>\` — Add ticket option
\`!ticketviewer @role\` — Set viewer role for tickets
\`!ticketcategory #channel\` — Set category for tickets
\`!deployticketpanel\` — Deploy ticket menu
\`!resetticket\` — Reset ticket setup`);

      return message.channel.send({ embeds: [embed] });
    }

    if (lc.startsWith('!addques ')) {
      const q = content.slice(9).trim();
      if (!q) return message.reply('Please provide a question.');
      appQuestions.push(q);
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('✅ Question added.');
    }

    if (lc.startsWith('!setoptions ')) {
      const raw = content.slice(12).trim();
      if (!raw) return message.reply('Please provide options in format: `Option|Cooldown,...`');
      
      appOptions = [];
      raw.split(',').forEach(str => {
        const [label, days] = str.split('|').map(s => s.trim());
        if (label) {
          appOptions.push({ 
            label, 
            value: label.toLowerCase().replace(/\s+/g, '_'), 
            cooldown: parseInt(days) || 7 
          });
        }
      });
      
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply(`✅ ${appOptions.length} options set.`);
    }

    if (lc.startsWith('!setchannel')) {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply('Please mention a channel.');
      logChannelId = ch.id;
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply(`✅ Log channel set to ${ch}.`);
    }

    if (lc === '!reset') {
      appOptions = [];
      appQuestions = [];
      logChannelId = null;
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('🔄 Application data reset.');
    }

    if (lc === '!resetticket') {
      ticketSetup = {
        description: '',
        options: [],
        viewerRoleId: null,
        categoryId: null
      };
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('🎟️ Ticket settings reset.');
    }

    if (lc.startsWith('!ticket ')) {
      const desc = content.slice(8).trim();
      if (!desc) return message.reply('Please provide a ticket message.');
      ticketSetup.description = desc;
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('✅ Ticket message set.');
    }

    if (lc.startsWith('!option ')) {
      const args = content.slice(8).trim().split(' ');
      if (args.length < 2) return message.reply('Please provide an emoji and label.');
      
      const emoji = args.shift();
      const label = args.join(' ');
      ticketSetup.options.push({ emoji, label });
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('✅ Ticket option added.');
    }

    if (lc.startsWith('!ticketviewer')) {
      const match = content.match(/<@&(\d+)>/);
      if (!match) return message.reply('Please mention a role.');
      ticketSetup.viewerRoleId = match[1];
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('✅ Ticket viewer role set.');
    }

    if (lc.startsWith('!ticketcategory')) {
      const match = content.match(/<#(\d+)>/);
      if (!match) return message.reply('Please mention a category channel.');
      ticketSetup.categoryId = match[1];
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      return message.reply('✅ Ticket category set.');
    }

    if (lc === '!deployticketpanel') {
      if (!ticketSetup.description || !ticketSetup.options.length) {
        return message.reply('❌ Ticket setup incomplete. Set description and options first.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎟️ Open a Ticket')
        .setDescription(ticketSetup.description)
        .setColor('Blue');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Choose ticket category')
        .addOptions(ticketSetup.options.map((opt, i) => ({
          label: opt.label,
          value: `ticket_${i}`,
          emoji: opt.emoji
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (lc === '!deploy') {
      if (!appOptions.length) return message.reply('⚠️ Use `!setoptions` first.');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('app_select')
        .setPlaceholder('Choose a role to apply')
        .addOptions(appOptions.map(opt => ({ 
          label: opt.label, 
          value: opt.value,
          description: `Cooldown: ${opt.cooldown} days`
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      return message.channel.send({ 
        content: '📥 Choose a role to apply:', 
        components: [row] 
      });
    }
  } catch (error) {
    sendError(message, error);
  }
});

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

  try {
    if (interaction.customId === 'ticket_select') {
      await interaction.deferReply({ ephemeral: true });
      
      const { guild, user } = interaction;
      const index = parseInt(interaction.values[0].split('_')[1]);
      const label = ticketSetup.options[index]?.label || 'ticket';
      
      // Check for existing ticket
      const existingTicket = guild.channels.cache.find(ch => 
        ch.name === `ticket-${user.username.toLowerCase()}` && 
        ch.parentId === ticketSetup.categoryId
      );
      
      if (existingTicket) {
        return interaction.editReply({ 
          content: `❗ You already have a ticket: ${existingTicket}` 
        });
      }

      // Create ticket channel
      const ch = await guild.channels.create({
        name: `ticket-${user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: ticketSetup.categoryId || null,
        permissionOverwrites: [
          { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
          ...(ticketSetup.viewerRoleId ? [{ 
            id: ticketSetup.viewerRoleId, 
            allow: [PermissionsBitField.Flags.ViewChannel] 
          }] : [])
        ]
      });

      // Add close button
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close Ticket')
          .setStyle(ButtonStyle.Danger)
      );

      // Send welcome message
      await ch.send({ 
        content: `🎫 Ticket for <@${user.id}> — **${label}**\n\nPlease describe your issue in detail. Staff will be with you shortly.`,
        components: [row] 
      });
      
      return interaction.editReply({ 
        content: `✅ Ticket created: ${ch}` 
      });
    }

    if (interaction.customId === 'close_ticket') {
      await interaction.deferReply({ ephemeral: true });
      
      const ch = interaction.channel;
      const user = interaction.user;
      
      // Create transcript
      const msgs = await ch.messages.fetch({ limit: 100 });
      const transcript = [...msgs.values()]
        .reverse()
        .map(m => `${m.author.tag} [${m.createdAt.toLocaleString()}]: ${m.content}`)
        .join('\n');
      
      const fileName = `ticket-${ch.name}-${Date.now()}.txt`;
      const file = Buffer.from(transcript, 'utf-8');
      
      // Try to send transcript to user
      try {
        await user.send({ 
          content: '📁 Here is your ticket transcript:', 
          files: [{ attachment: file, name: fileName }] 
        });
      } catch (err) {
        console.error('Failed to send transcript:', err);
      }
      
      // Notify and delete channel
      await interaction.editReply({ 
        content: '🗂️ Ticket closed. Check your DMs for the transcript.' 
      });
      
      setTimeout(() => ch.delete().catch(console.error), 2000);
    }

    if (interaction.customId === 'app_select') {
      await interaction.deferReply({ ephemeral: true });
      
      const user = interaction.user;
      const selected = interaction.values[0];
      const opt = appOptions.find(o => o.value === selected);
      
      if (!opt) {
        return interaction.editReply({ 
          content: '❌ Invalid option selected.' 
        });
      }

      // Check cooldown
      const now = Date.now();
      const key = `${user.id}_${opt.value}`;
      const last = userLastApplied.get(key);
      const cooldown = opt.cooldown * 24 * 60 * 60 * 1000;
      
      if (last && now - last < cooldown) {
        const rem = cooldown - (now - last);
        const days = Math.ceil(rem / (24 * 60 * 60 * 1000));
        return interaction.editReply({ 
          content: `⏳ You must wait **${days}** more day(s) before reapplying for ${opt.label}.` 
        });
      }

      // Start application process
      userLastApplied.set(key, now);
      saveData({ logChannelId, ticketSetup, appQuestions, appOptions, userLastApplied });
      
      await interaction.editReply({ 
        content: '📩 Check your DMs to complete the application!' 
      });
      
      const dm = await user.createDM();
      let currentQuestion = 0;
      const answers = [];
      
      // Send first question
      await dm.send({ embeds: [
        new EmbedBuilder()
          .setTitle(`📋 Application for ${opt.label}`)
          .setDescription(`Question 1/${appQuestions.length}\n\n${appQuestions[currentQuestion]}`)
          .setColor('Blue')
      ] });
      
      // Set up collector for answers
      const collector = dm.createMessageCollector({ 
        filter: m => m.author.id === user.id, 
        time: 300000, // 5 minutes
        max: appQuestions.length
      });
      
      collector.on('collect', async msg => {
        answers.push(msg.content);
        currentQuestion++;
        
        if (currentQuestion < appQuestions.length) {
          await dm.send({ embeds: [
            new EmbedBuilder()
              .setTitle(`📋 Question ${currentQuestion + 1}/${appQuestions.length}`)
              .setDescription(appQuestions[currentQuestion])
              .setColor('Blue')
          ] });
        }
      });
      
      collector.on('end', async collected => {
        if (answers.length === appQuestions.length) {
          // Application complete
          await dm.send({ embeds: [
            new EmbedBuilder()
              .setTitle('✅ Application Submitted')
              .setDescription(`Your application for **${opt.label}** has been received!`)
              .setColor('Green')
          ] });
          
          // Log to channel if set
          if (logChannelId) {
            try {
              const logChannel = await client.channels.fetch(logChannelId);
              const summary = answers.map((a, i) => 
                `**Q${i + 1}:** ${appQuestions[i]}\n**A:** ${a}`
              ).join('\n\n');
              
              const logEmbed = new EmbedBuilder()
                .setTitle(`📨 New Application: ${opt.label}`)
                .setDescription(`From: ${user.tag} (${user.id})`)
                .addFields(
                  { name: 'Application', value: summary.length > 1024 ? 
                    `${summary.substring(0, 1000)}...` : summary }
                )
                .setColor('Blue')
                .setTimestamp();
              
              await logChannel.send({ embeds: [logEmbed] });
            } catch (err) {
              console.error('Failed to log application:', err);
            }
          }
        } else {
          // Incomplete application
          await dm.send({ embeds: [
            new EmbedBuilder()
              .setTitle('❌ Application Incomplete')
              .setDescription('You took too long to answer all questions. Please try again.')
              .setColor('Red')
          ] });
        }
      });
    }
  } catch (error) {
    console.error('Interaction error:', error);
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply({ 
        content: '❌ An error occurred while processing your request.' 
      }).catch(console.error);
    } else {
      await interaction.reply({ 
        content: '❌ An error occurred while processing your request.', 
        ephemeral: true 
      }).catch(console.error);
    }
  }
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);

client.login(process.env.DISCORD_TOKEN).catch(err => {
  console.error('Login failed:', err);
  process.exit(1);
});
