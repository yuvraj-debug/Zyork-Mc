// FINAL PUBLIC DISCORD BOT — TICKETS + CLOSE BUTTON + APPLICATIONS RESTORED — NO FILES NEEDED
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
app.listen(3000, () => console.log('✅ Keep-alive server running'));

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

let ticketSetup = {
  description: 'Select a category to open a ticket.',
  options: [],
  viewerRoleId: null,
  categoryId: null
};

let appQuestions = [];
let appOptions = [];
let logChannelId = null;

const userStates = new Map();
const userLastApplied = new Map();
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const uid = message.author.id;
  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  if (content.toLowerCase() === '!help') {
    return message.channel.send(`📘 **Bot Commands**

🎮 **Mini‑Games**
!guess <number> — Guess the number
!trivia — Trivia game
!scramble — Unscramble word

📝 **Applications**
!addques <question> — Add application question
!setoptions Option|Cooldown,... — Set options with cooldown
!setchannel #channel — Set log channel
!deploy — Deploy application menu
!reset — Reset application data

🎟️ **Tickets**
!ticket <message> — Set ticket panel message
!option <emoji> <label> — Add ticket option
!ticketviewer @role — Set viewer role for tickets
!ticketcategory #channel — Set category for tickets
!deployticketpanel — Deploy ticket menu
!resetticket — Reset ticket setup`);
  }

  if (content.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    const correct = 42;
    return message.reply(guess === correct ? '🎉 Correct!' : '❌ Wrong. Try again!');
  }

  if (content === '!trivia') {
    const q = { question: 'Capital of France?', answer: 'paris' };
    state.triviaAnswer = q.answer;
    return message.channel.send(`🧠 Trivia: ${q.question}`);
  }
  if (state.triviaAnswer && content.toLowerCase() === state.triviaAnswer.toLowerCase()) {
    state.triviaAnswer = null;
    return message.reply('✅ Correct answer!');
  }

  if (content === '!scramble') {
    const word = 'discord';
    state.scrambleAnswer = word;
    return message.channel.send(`🔤 Unscramble: \`${scramble(word)}\``);
  }
  if (state.scrambleAnswer && content.toLowerCase() === state.scrambleAnswer.toLowerCase()) {
    state.scrambleAnswer = null;
    return message.reply('✅ Correct unscramble!');
  }

  if (content.startsWith('!addques ')) {
    const q = content.slice(9).trim();
    appQuestions.push(q);
    return message.reply(`✅ Question added: "${q}"`);
  }

  if (content.startsWith('!setoptions ')) {
    appOptions = content.slice(12).split(',').map(pair => {
      const [label, days] = pair.split('|').map(s => s.trim());
      return { label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(days) || 7 };
    });
    return message.reply('✅ Options set.');
  }

  if (content.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    logChannelId = ch.id;
    return message.reply('📬 Log channel set.');
  }

  if (content.startsWith('!reset')) {
    appQuestions = [];
    appOptions = [];
    logChannelId = null;
    return message.reply('♻️ Application data reset.');
  }

  if (content.startsWith('!ticket ')) {
    ticketSetup.description = content.slice(8).trim();
    return message.reply('✅ Ticket panel message set.');
  }

  if (content.startsWith('!option ')) {
    const [, emoji, ...labelParts] = content.split(' ');
    const label = labelParts.join(' ');
    ticketSetup.options.push({ emoji, label });
    return message.reply('✅ Option added.');
  }

  if (content.startsWith('!ticketviewer')) {
    const role = message.mentions.roles.first();
    if (!role) return message.reply('❌ Mention a role.');
    ticketSetup.viewerRoleId = role.id;
    return message.reply('👁️ Viewer role set.');
  }

  if (content.startsWith('!ticketcategory')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a category channel.');
    ticketSetup.categoryId = ch.id;
    return message.reply('📁 Ticket category set.');
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.customId === 'ticket_select') {
    const { guild, user } = interaction;
    const selectedIndex = parseInt(interaction.values[0].split('_')[1]);
    const label = ticketSetup.options[selectedIndex]?.label || 'ticket';

    const existing = guild.channels.cache.find(ch => ch.name === `ticket-${user.username.toLowerCase()}`);
    if (existing) {
      return interaction.reply({ content: '❗ You already have an open ticket.', ephemeral: true });
    }

    const ticketChannel = await guild.channels.create({
      name: `ticket-${user.username}`,
      type: ChannelType.GuildText,
      parent: ticketSetup.categoryId || null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...(ticketSetup.viewerRoleId ? [{ id: ticketSetup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel] }] : [])
      ]
    });

    const closeBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('close_ticket')
        .setLabel('Close Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await ticketChannel.send({
      content: `🎫 Ticket created for <@${user.id}> under **${label}**.`,
      components: [closeBtn]
    });

    return interaction.reply({ content: `✅ Ticket opened: ${ticketChannel}`, ephemeral: true });
  }

  if (interaction.customId === 'close_ticket') {
    const ch = interaction.channel;
    await interaction.reply({ content: '🛑 Ticket will be closed in 5 seconds...', ephemeral: true });
    setTimeout(() => ch.delete().catch(() => {}), 5000);
  }

  if (interaction.customId === 'app_select') {
    const user = interaction.user;
    const selected = interaction.values[0];
    const option = appOptions.find(o => o.value === selected);
    if (!option) return interaction.reply({ content: '❌ Invalid.', ephemeral: true });

    const now = Date.now();
    const key = `${user.id}_${option.value}`;
    const last = userLastApplied.get(key);
    const cooldown = option.cooldown * 24 * 60 * 60 * 1000;

    if (last && now - last < cooldown) {
      const days = Math.ceil((cooldown - (now - last)) / (24 * 60 * 60 * 1000));
      return interaction.reply({ content: `⏳ Wait ${days} day(s).`, ephemeral: true });
    }

    userLastApplied.set(key, now);
    await interaction.reply({ content: '📩 Check DMs to begin your application.', ephemeral: true });

    const dm = await user.createDM();
    let i = 0;
    const answers = [];

    const ask = async () => {
      if (i >= appQuestions.length) {
        await dm.send({ embeds: [
          new EmbedBuilder()
            .setTitle('✅ Application Complete')
            .setDescription(`Your application for **${option.label}** has been submitted.`)
        ] });
        if (logChannelId) {
          const logCh = await client.channels.fetch(logChannelId).catch(() => null);
          if (logCh) {
            const summary = answers.map((a, j) => `**Q${j + 1}:** ${appQuestions[j]}\n**A:** ${a}`).join('\n\n');
            logCh.send(`📨 Application from **${user.tag}** for **${option.label}**\n\n${summary}`);
          }
        }
        return;
      }
      await dm.send({ embeds: [
        new EmbedBuilder()
          .setTitle(`📋 Question ${i + 1}`)
          .setDescription(appQuestions[i])
      ] });
    };

    const collector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });
    collector.on('collect', msg => {
      answers.push(msg.content);
      i++;
      ask();
    });

    ask();
  }
});

client.login(process.env.DISCORD_TOKEN);
