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

// Keep-alive server
const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running'));

// Bot setup
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

// ========== MEMORY STORAGE ==========
const ticketSetup = {
  description: 'Select a category to open a ticket.',
  options: [],
  viewerRoleId: null,
  categoryId: null
};

let appQuestions = [];
let appOptions = []; // { label, value, cooldown }
let logChannelId = '';
const userStates = new Map(); // temporary states
const userLastApplied = new Map(); // cooldown tracker

// ========== UTILS ==========
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');
const msToDays = ms => Math.ceil(ms / (24 * 60 * 60 * 1000));

// ========== READY ==========
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

// ========== COMMAND HANDLER ==========
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const lc = content.toLowerCase();
  const uid = message.author.id;

  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  // ========== !help ==========
  if (lc === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('📘 Bot Commands')
      .setColor('Blue')
      .addFields(
        { name: '🎮 Mini‑Games', value: '`!guess <number>` — Guess the number\n`!trivia` — Trivia game\n`!scramble` — Unscramble word' },
        { name: '📝 Applications', value: '`!addques <question>` — Add question\n`!setoptions Option|Cooldown,...`\n`!setchannel #channel`\n`!deploy` — Deploy app menu\n`!reset` — Reset app data' },
        { name: '🎟️ Tickets', value: '`!ticket <message>` — Set panel message\n`!option <emoji> <label>` — Add option\n`!ticketviewer @role`\n`!ticketcategory #channel`\n`!deployticketpanel`\n`!resetticket` — Reset ticket setup' }
      )
      .setFooter({ text: 'All users can use commands — no admin needed' });

    return message.channel.send({ embeds: [embed] });
  }

  // ========== MINIGAMES ==========
  if (lc.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    const correct = 42;
    return message.reply(guess === correct ? '🎉 Correct!' : '❌ Wrong. Try again!');
  }

  if (lc === '!trivia') {
    state.triviaAnswer = 'paris';
    return message.channel.send('🧠 Trivia: What is the capital of France?');
  }
  if (state.triviaAnswer && lc === state.triviaAnswer) {
    state.triviaAnswer = null;
    return message.reply('✅ Correct!');
  }

  if (lc === '!scramble') {
    const word = 'discord';
    state.scrambleAnswer = word;
    return message.channel.send(`🔤 Unscramble this: \`${scramble(word)}\``);
  }
  if (state.scrambleAnswer && lc === state.scrambleAnswer) {
    state.scrambleAnswer = null;
    return message.reply('✅ Correct unscramble!');
  }

  // ========== TICKETS ==========
  if (lc.startsWith('!ticket ')) {
    ticketSetup.description = content.slice(8).trim();
    return message.reply('✅ Ticket panel description set.');
  }

  if (lc.startsWith('!option ')) {
    const parts = content.slice(8).trim().split(' ');
    const emoji = parts[0];
    const label = parts.slice(1).join(' ');
    if (!emoji || !label) return message.reply('❌ Use: `!option <emoji> <label>`');
    ticketSetup.options.push({ emoji, label });
    return message.reply(`✅ Added option: ${emoji} ${label}`);
  }

  if (lc.startsWith('!ticketviewer')) {
    const roleId = message.mentions.roles.first()?.id;
    if (!roleId) return message.reply('❌ Mention a valid role.');
    ticketSetup.viewerRoleId = roleId;
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const ch = message.mentions.channels.first();
    if (!ch?.parentId) return message.reply('❌ Mention a channel in a category.');
    ticketSetup.categoryId = ch.parentId;
    return message.reply('✅ Category set.');
  }

  if (lc === '!resetticket') {
    ticketSetup.options = [];
    ticketSetup.viewerRoleId = null;
    ticketSetup.categoryId = null;
    return message.reply('🔄 Ticket setup reset.');
  }

  if (lc === '!deployticketpanel') {
    if (!ticketSetup.description || !ticketSetup.options.length) {
      return message.reply('❌ Setup incomplete.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(ticketSetup.description)
      .setColor('Blue');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Choose a category')
      .addOptions(ticketSetup.options.map((opt, i) => ({
        label: opt.label,
        value: `ticket_${i}`,
        emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ embeds: [embed], components: [row] });
  }

  // ========== APPLICATION SYSTEM ==========
  if (lc.startsWith('!addques ')) {
    const q = content.slice(9).trim();
    appQuestions.push(q);
    return message.reply(`✅ Added question: "${q}"`);
  }

  if (lc.startsWith('!setoptions ')) {
    const raw = content.slice(12);
    appOptions = raw.split(',').map(p => {
      const [label, cd] = p.split('|');
      return { label: label.trim(), value: label.trim().toLowerCase(), cooldown: parseInt(cd.trim()) || 14 };
    });
    return message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    logChannelId = ch.id;
    return message.reply('📬 Log channel set.');
  }

  if (lc === '!reset') {
    appQuestions = [];
    appOptions = [];
    logChannelId = '';
    return message.reply('🔄 Application data reset.');
  }

  if (lc === '!deploy') {
    if (!appOptions.length) return message.reply('❌ No options set.');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .setPlaceholder('Choose a role')
      .addOptions(appOptions.map(o => ({ label: o.label, value: o.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ content: '📥 Select a role to apply for:', components: [row] });
  }
});

// ========== INTERACTIONS ==========
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isButton() && interaction.customId === 'close_ticket') {
    await interaction.reply({ content: '🛑 Closing ticket...', ephemeral: true });
    setTimeout(() => interaction.channel.delete().catch(() => {}), 3000);
    return;
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const user = interaction.user;
    const idx = parseInt(interaction.values[0].split('_')[1]);
    const label = ticketSetup.options[idx]?.label || 'ticket';

    const existing = interaction.guild.channels.cache.find(ch =>
      ch.name.startsWith(`ticket-${user.username.toLowerCase()}`)
    );
    if (existing) {
      return interaction.reply({ content: '❗ You already have an open ticket.', ephemeral: true });
    }

    const ch = await interaction.guild.channels.create({
      name: `ticket-${user.username.toLowerCase()}-${Date.now().toString().slice(-4)}`,
      type: ChannelType.GuildText,
      parent: ticketSetup.categoryId,
      permissionOverwrites: [
        { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: ticketSetup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const btn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
    );

    await ch.send({ content: `🎫 Ticket for <@${user.id}> — **${label}**`, components: [btn] });
    await interaction.reply({ content: `✅ Ticket created: <#${ch.id}>`, ephemeral: true });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'app_select') {
    const user = interaction.user;
    const selected = interaction.values[0];
    const option = appOptions.find(o => o.value === selected);
    if (!option) return interaction.reply({ content: '❌ Option not found.', ephemeral: true });

    const now = Date.now();
    const key = `${user.id}_${option.value}`;
    const last = userLastApplied.get(key);
    const cooldownMs = option.cooldown * 24 * 60 * 60 * 1000;

    if (last && now - last < cooldownMs) {
      const daysLeft = msToDays(cooldownMs - (now - last));
      return interaction.reply({ content: `⏳ You can apply again in **${daysLeft} day(s)**.`, ephemeral: true });
    }

    userLastApplied.set(key, now);
    await interaction.reply({ content: '📩 Check your DMs to start the application!', ephemeral: true });

    const dm = await user.createDM();
    let i = 0;
    const answers = [];
    let completed = false;

    const ask = async () => {
      if (i >= appQuestions.length) {
        if (completed) return;
        completed = true;

        await dm.send({ embeds: [new EmbedBuilder().setTitle('✅ Application Complete').setDescription(`Thanks for applying for **${option.label}**.`).setColor('Green')] });
        if (logChannelId) {
          const logCh = await client.channels.fetch(logChannelId);
          const text = answers.map((a, idx) => `**Q${idx + 1}:** ${appQuestions[idx]}\n**A:** ${a}`).join('\n\n');
          await logCh.send(`📨 New application from **${user.tag}** for **${option.label}**\n\n${text}`);
        }
        return;
      }

      await dm.send({ embeds: [
        new EmbedBuilder()
          .setTitle(`📋 Question ${i + 1} of ${appQuestions.length}`)
          .setDescription(appQuestions[i])
          .setColor('Blue')
      ] });
    };

    const collector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });
    collector.on('collect', msg => {
      if (completed) return;
      answers.push(msg.content);
      i++;
      ask();
    });

    ask();
  }
});

// ========== LOGIN ==========
client.login(process.env.DISCORD_TOKEN);
