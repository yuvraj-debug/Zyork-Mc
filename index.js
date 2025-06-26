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
  ChannelType,
  Events,
  PermissionsBitField
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

// In-memory data storage
let botData = {
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

// Track processed messages to prevent duplicates
const processedMessages = new Set();

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
  client.user.setActivity('!help for commands');
});

// Command handler with duplicate prevention
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  
  // Prevent duplicate processing
  if (processedMessages.has(message.id)) return;
  processedMessages.add(message.id);
  
  // Clean up old message IDs to prevent memory leaks
  if (processedMessages.size > 1000) {
    const oldest = Array.from(processedMessages).slice(0, 100);
    oldest.forEach(id => processedMessages.delete(id));
  }

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

    // Mini-Games Commands
    if (lc.startsWith('!guess ')) {
      const number = parseInt(content.slice(7).trim());
      if (isNaN(number)) return message.reply('Please provide a valid number.');
      const randomNum = Math.floor(Math.random() * 10) + 1;
      return message.reply(number === randomNum ? 
        `🎉 Correct! The number was ${randomNum}.` : 
        `❌ Wrong! The number was ${randomNum}. Try again!`);
    }

    if (lc === '!trivia') {
      const questions = [
        { q: "What is the capital of France?", a: "paris" },
        { q: "How many continents are there?", a: "7" },
        { q: "What is the largest planet in our solar system?", a: "jupiter" }
      ];
      const randomQ = questions[Math.floor(Math.random() * questions.length)];
      return message.reply(`❓ ${randomQ.q}\nReply with your answer!`);
    }

    if (lc === '!scramble') {
      const words = ['apple', 'banana', 'orange', 'grape', 'strawberry'];
      const word = words[Math.floor(Math.random() * words.length)];
      const scrambled = word.split('').sort(() => 0.5 - Math.random()).join('');
      return message.reply(`🔀 Unscramble this word: ${scrambled}`);
    }

    // Application Commands
    if (lc.startsWith('!addques ')) {
      const q = content.slice(9).trim();
      if (!q) return message.reply('Please provide a question.');
      botData.appQuestions.push(q);
      return message.reply('✅ Question added.');
    }

    if (lc.startsWith('!setoptions ')) {
      const raw = content.slice(12).trim();
      if (!raw) return message.reply('Please provide options in format: `Option|Cooldown,...`');
      
      botData.appOptions = [];
      raw.split(',').forEach(str => {
        const [label, days] = str.split('|').map(s => s.trim());
        if (label) {
          botData.appOptions.push({ 
            label, 
            value: label.toLowerCase().replace(/\s+/g, '_'), 
            cooldown: parseInt(days) || 7 
          });
        }
      });
      
      return message.reply(`✅ ${botData.appOptions.length} options set.`);
    }

    if (lc.startsWith('!setchannel')) {
      const ch = message.mentions.channels.first();
      if (!ch) return message.reply('Please mention a channel.');
      botData.logChannelId = ch.id;
      return message.reply(`✅ Log channel set to ${ch}.`);
    }

    if (lc === '!deploy') {
      if (!botData.appOptions.length) return message.reply('⚠️ Use `!setoptions` first.');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('app_select')
        .setPlaceholder('Choose a role to apply')
        .addOptions(botData.appOptions.map(opt => ({ 
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

    if (lc === '!reset') {
      botData.appOptions = [];
      botData.appQuestions = [];
      botData.logChannelId = null;
      return message.reply('🔄 Application data reset.');
    }

    // Ticket Commands
    if (lc.startsWith('!ticket ')) {
      const desc = content.slice(8).trim();
      if (!desc) return message.reply('Please provide a ticket message.');
      botData.ticketSetup.description = desc;
      return message.reply('✅ Ticket message set.');
    }

    if (lc.startsWith('!option ')) {
      const args = content.slice(8).trim().split(' ');
      if (args.length < 2) return message.reply('Please provide an emoji and label.');
      
      const emoji = args.shift();
      const label = args.join(' ');
      botData.ticketSetup.options.push({ emoji, label });
      return message.reply('✅ Ticket option added.');
    }

    if (lc.startsWith('!ticketviewer')) {
      const match = content.match(/<@&(\d+)>/);
      if (!match) return message.reply('Please mention a role.');
      botData.ticketSetup.viewerRoleId = match[1];
      return message.reply('✅ Ticket viewer role set.');
    }

    if (lc.startsWith('!ticketcategory')) {
      const match = content.match(/<#(\d+)>/);
      if (!match) return message.reply('Please mention a category channel.');
      botData.ticketSetup.categoryId = match[1];
      return message.reply('✅ Ticket category set.');
    }

    if (lc === '!deployticketpanel') {
      if (!botData.ticketSetup.description || !botData.ticketSetup.options.length) {
        return message.reply('❌ Ticket setup incomplete. Set description and options first.');
      }

      const embed = new EmbedBuilder()
        .setTitle('🎟️ Open a Ticket')
        .setDescription(botData.ticketSetup.description)
        .setColor('Blue');

      const menu = new StringSelectMenuBuilder()
        .setCustomId('ticket_select')
        .setPlaceholder('Choose ticket category')
        .addOptions(botData.ticketSetup.options.map((opt, i) => ({
          label: opt.label,
          value: `ticket_${i}`,
          emoji: opt.emoji
        })));

      const row = new ActionRowBuilder().addComponents(menu);
      return message.channel.send({ embeds: [embed], components: [row] });
    }

    if (lc === '!resetticket') {
      botData.ticketSetup = {
        description: '',
        options: [],
        viewerRoleId: null,
        categoryId: null
      };
      return message.reply('🎟️ Ticket settings reset.');
    }
  } catch (error) {
    console.error('Command error:', error);
    message.reply('❌ An error occurred while processing your command.').catch(console.error);
  }
});

// Interaction handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu() && !interaction.isButton()) return;

  try {
    // Ticket selection handler
    if (interaction.customId === 'ticket_select') {
      await interaction.deferReply({ ephemeral: true });
      
      const { guild, user } = interaction;
      const index = parseInt(interaction.values[0].split('_')[1]);
      const label = botData.ticketSetup.options[index]?.label || 'ticket';
      
      // Check for existing ticket
      const existingTicket = guild.channels.cache.find(ch => 
        ch.name === `ticket-${user.username.toLowerCase()}` && 
        ch.parentId === botData.ticketSetup.categoryId
      );
      
      if (existingTicket) {
        return interaction.editReply({ 
          content: `❗ You already have a ticket: ${existingTicket}`,
          ephemeral: true
        });
      }

      // Create ticket channel
      const ch = await guild.channels.create({
        name: `ticket-${user.username.toLowerCase()}`,
        type: ChannelType.GuildText,
        parent: botData.ticketSetup.categoryId || null,
        permissionOverwrites: [
          { 
            id: guild.id, 
            deny: [PermissionsBitField.Flags.ViewChannel] 
          },
          { 
            id: user.id, 
            allow: [
              PermissionsBitField.Flags.ViewChannel, 
              PermissionsBitField.Flags.SendMessages,
              PermissionsBitField.Flags.AttachFiles,
              PermissionsBitField.Flags.EmbedLinks
            ] 
          },
          ...(botData.ticketSetup.viewerRoleId ? [{ 
            id: botData.ticketSetup.viewerRoleId, 
            allow: [
              PermissionsBitField.Flags.ViewChannel,
              PermissionsBitField.Flags.SendMessages
            ] 
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
        content: `✅ Ticket created: ${ch}`,
        ephemeral: true
      });
    }

    // Ticket close handler
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
      
      // Try to send transcript to user
      try {
        await user.send({ 
          content: '📁 Here is your ticket transcript:', 
          files: [{
            attachment: Buffer.from(transcript, 'utf-8'),
            name: fileName
          }] 
        });
      } catch (err) {
        console.error('Failed to send transcript:', err);
        await interaction.followUp({
          content: "⚠️ Couldn't DM you the transcript. Make sure your DMs are open!",
          ephemeral: true
        });
      }
      
      // Notify and delete channel
      await interaction.editReply({ 
        content: '🗂️ Ticket closed. Check your DMs for the transcript.' 
      });
      
      setTimeout(() => ch.delete().catch(console.error), 2000);
    }

    // Application selection handler
    if (interaction.customId === 'app_select') {
      await interaction.deferReply({ ephemeral: true });
      
      const user = interaction.user;
      const selected = interaction.values[0];
      const opt = botData.appOptions.find(o => o.value === selected);
      
      if (!opt) {
        return interaction.editReply({ 
          content: '❌ Invalid option selected.',
          ephemeral: true
        });
      }

      // Check cooldown
      const now = Date.now();
      const key = `${user.id}_${opt.value}`;
      const last = botData.userLastApplied.get(key);
      const cooldown = opt.cooldown * 24 * 60 * 60 * 1000;
      
      if (last && now - last < cooldown) {
        const rem = cooldown - (now - last);
        const days = Math.ceil(rem / (24 * 60 * 60 * 1000));
        return interaction.editReply({ 
          content: `⏳ You must wait **${days}** more day(s) before reapplying for ${opt.label}.`,
          ephemeral: true
        });
      }

      // Start application process
      botData.userLastApplied.set(key, now);
      
      await interaction.editReply({ 
        content: '📩 Check your DMs to complete the application!',
        ephemeral: true
      });
      
      const dm = await user.createDM();
      let currentQuestion = 0;
      const answers = [];
      
      // Send first question
      await dm.send({ embeds: [
        new EmbedBuilder()
          .setTitle(`📋 Application for ${opt.label}`)
          .setDescription(`Question 1/${botData.appQuestions.length}\n\n${botData.appQuestions[currentQuestion]}`)
          .setColor('Blue')
      ] }).catch(() => {
        return interaction.followUp({
          content: "⚠️ Couldn't DM you. Please enable DMs and try again!",
          ephemeral: true
        });
      });
      
      // Set up collector for answers
      const collector = dm.createMessageCollector({ 
        filter: m => m.author.id === user.id, 
        time: 300000, // 5 minutes
        max: botData.appQuestions.length
      });
      
      collector.on('collect', async msg => {
        answers.push(msg.content);
        currentQuestion++;
        
        if (currentQuestion < botData.appQuestions.length) {
          await dm.send({ embeds: [
            new EmbedBuilder()
              .setTitle(`📋 Question ${currentQuestion + 1}/${botData.appQuestions.length}`)
              .setDescription(botData.appQuestions[currentQuestion])
              .setColor('Blue')
          ] });
        }
      });
      
      collector.on('end', async collected => {
        if (answers.length === botData.appQuestions.length) {
          // Application complete
          await dm.send({ embeds: [
            new EmbedBuilder()
              .setTitle('✅ Application Submitted')
              .setDescription(`Your application for **${opt.label}** has been received!`)
              .setColor('Green')
          ] });
          
          // Log to channel if set
          if (botData.logChannelId) {
            try {
              const logChannel = await client.channels.fetch(botData.logChannelId);
              const summary = answers.map((a, i) => 
                `**Q${i + 1}:** ${botData.appQuestions[i]}\n**A:** ${a}`
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
        content: '❌ An error occurred while processing your request.',
        ephemeral: true
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
