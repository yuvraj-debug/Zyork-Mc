// === KEEP-ALIVE + ENV
require('dotenv').config();
const express = require('express');
const fs = require('fs');
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
  Events
} = require('discord.js');

const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running'));

// === BOT SETUP
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

// === TICKET SYSTEM VARIABLES
const ticketSetup = new Map();
const userStates = new Map();

// === APPLICATION SYSTEM
const DATA_FILE = './data.json';
let questions = [];
let options = [];
let logChannelId = '';
const userLastApplied = new Map();
const allowedUserIds = ['1202998273376522331'];

if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE));
  options = saved.options || [];
  logChannelId = saved.logChannelId || '';
}

const isAdminOrOwner = user =>
  user?.permissions?.has?.('Administrator') || allowedUserIds.includes(user?.id);

// === GAMES
const games = {
  guessNumber: Math.floor(Math.random() * 100) + 1,
  scrambleWords: ['banana', 'elephant', 'discord', 'javascript', 'pirate']
};
const triviaQuestions = [
  { question: 'What is the capital of France?', answer: 'paris' },
  { question: 'Which planet is known as the Red Planet?', answer: 'mars' },
  { question: '2 + 2 * 2 = ?', answer: '6' }
];
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

// === READY
client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

// === MESSAGE HANDLER
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const raw = message.content;
  const content = raw.trim();
  const lc = content.toLowerCase();
  const uid = message.author.id;

  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);
  const guildId = message.guild.id;

  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null,
      footerImage: null
    });
  }
  const setup = ticketSetup.get(guildId);

  // === !help
  if (lc === '!help') {
    return message.channel.send(`📘 **Bot Commands**

🎟️ **Ticket System**
\`!ticket <message>\` — Set ticket message  
\`!option <emoji> <label>\` — Add ticket category  
\`!resetticket\` — Reset ticket setup  
\`!ticketviewer @role\` — Set viewer role  
\`!ticketcategory #channel\` — Set category  
\`!deployticketpanel\` — Deploy ticket panel

🎮 **Mini‑Games**
\`!guess <number>\` — Guess the number  
\`!trivia\` — Trivia game  
\`!scramble\` — Unscramble word  
\`!rps <rock|paper|scissors>\` — Rock Paper Scissors

📬 **Messaging**
\`!msg <message>\` — Bot says a message  
\`!dm @role <message>\` — DM all users with a role

📝 **Application System**
\`!addques <question>\` — Add question  
\`!setoptions Option|Cooldown,...\` — Set options  
\`!setchannel #channel\` — Set log channel  
\`!deploy\` — Deploy application menu  
\`!reset\` — Reset all settings`);
  }

  // === Application System Admin Commands
  if (lc.startsWith('!addques')) {
    if (!isAdminOrOwner(message.member)) return message.reply('❌ You do not have permission.');
    const q = content.slice(9).trim();
    if (!q) return message.reply('❌ Provide a question.');
    questions.push(q);
    return message.reply(`✅ Question added: "${q}"`);
  }

  if (lc.startsWith('!setoptions')) {
    if (!isAdminOrOwner(message.member)) return message.reply('❌ You do not have permission.');
    options = raw.slice(12).split(',').map(pair => {
      const [label, days] = pair.split('|').map(s => s.trim());
      return { label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(days) || 14 };
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ options, logChannelId }));
    return message.reply(`🎯 Options set:\n${options.map(o => `• ${o.label} (${o.cooldown}d)`).join('\n')}`);
  }

  if (lc.startsWith('!setchannel')) {
    if (!isAdminOrOwner(message.member)) return message.reply('❌ You do not have permission.');
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    logChannelId = ch.id;
    fs.writeFileSync(DATA_FILE, JSON.stringify({ options, logChannelId }));
    return message.reply('📬 Log channel set.');
  }

  if (lc === '!reset') {
    if (!isAdminOrOwner(message.member)) return message.reply('❌ You do not have permission.');
    questions = [];
    options = [];
    logChannelId = '';
    fs.writeFileSync(DATA_FILE, JSON.stringify({ options: [], logChannelId: '' }));
    return message.reply('♻️ Reset complete.');
  }

  if (lc === '!deploy') {
    if (!isAdminOrOwner(message.member)) return message.reply('❌ You do not have permission.');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .setPlaceholder('Apply for an option')
      .addOptions(options.map(o => ({ label: o.label, value: o.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ content: '📥 Click to apply:', components: [row] });
  }

  // === Messaging commands (!msg, !dm) already in first bot
  // === Ticket commands (ticket, option, etc.) already in first bot
  // === Games — reuse as-is if needed (you can insert trivia/scramble logic as you want)
});

// === INTERACTION HANDLER
client.on(Events.InteractionCreate, async interaction => {
  const setup = ticketSetup.get(interaction.guild?.id);

  // === Ticket Selection
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const idx = parseInt(interaction.values[0].split('_')[1]);
    const opt = setup.options[idx];
    const user = interaction.user;

    const existing = interaction.guild.channels.cache.find(c =>
      c.name.startsWith(`ticket-${user.username.toLowerCase()}`)
    );
    if (existing) {
      return interaction.reply({ content: `⚠️ You already have a ticket: <#${existing.id}>`, ephemeral: true });
    }

    const name = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;
    const ch = await interaction.guild.channels.create({
      name,
      type: 0,
      parent: setup.categoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: setup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
      ]
    });

    await ch.send({ content: `🎫 <@${user.id}> opened **${opt.label}** ticket. <@&${setup.viewerRoleId}>` });
    const delBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete Ticket').setStyle(ButtonStyle.Danger)
    );
    await ch.send({ content: '🗑️ Click to close and get transcript.', components: [delBtn] });
    await interaction.reply({ content: `✅ Ticket: <#${ch.id}>`, ephemeral: true });
  }

  // === Application Menu
  if (interaction.isStringSelectMenu() && interaction.customId === 'app_select') {
    const user = interaction.user;
    const selected = interaction.values[0];
    const option = options.find(o => o.value === selected);
    if (!option) return interaction.reply({ content: '❌ Option not found.', ephemeral: true });

    const now = Date.now();
    const key = `${user.id}_${option.value}`;
    const last = userLastApplied.get(key);
    const cooldownMs = option.cooldown * 86400000;
    const isAdmin = isAdminOrOwner(user);

    const dm = await user.createDM();
    await interaction.reply({ content: '📩 Check your DMs.', ephemeral: true });

    if (!isAdmin && last && now - last < cooldownMs) {
      const remaining = cooldownMs - (now - last);
      const days = Math.ceil(remaining / 86400000);
      return dm.send(`⏳ You can apply again for **${option.label}** in **${days} day(s)**.`);
    }
    if (!isAdmin) userLastApplied.set(key, now);

    const answers = [];
    let i = 0;
    let completed = false;

    const ask = async () => {
      if (i >= questions.length) {
        if (completed) return;
        completed = true;

        const embed = new EmbedBuilder()
          .setColor('Green')
          .setTitle('✅ Application Complete')
          .setDescription(`Your application for **${option.label}** is submitted.`);

        await dm.send({ embeds: [embed] });

        if (logChannelId) {
          const logCh = await client.channels.fetch(logChannelId);
          const summary = answers.map((a, j) => `**Q${j + 1}:** ${questions[j]}\n**A:** ${a}`).join('\n\n');
          logCh.send(`📨 **Application from ${user.tag}** for **${option.label}**\n\n${summary}`);
        }
        return;
      }

      const embed = new EmbedBuilder()
        .setColor('Blue')
        .setTitle(`📋 Question ${i + 1} of ${questions.length}`)
        .setDescription(questions[i]);

      await dm.send({ embeds: [embed] });
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

  // === Delete ticket
  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    const ch = interaction.channel;
    if (!ch.name.startsWith('ticket-')) return;

    await interaction.reply({ content: '📃 Generating transcript...', ephemeral: true });
    const msgs = await ch.messages.fetch({ limit: 100 });
    const transcript = [...msgs.values()].reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
    const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'transcript.txt' });

    const uname = ch.name.split('-')[1];
    const member = interaction.guild.members.cache.find(m => m.user.username.toLowerCase().startsWith(uname));
    if (member) {
      member.send({ content: `📁 Your ticket was closed by **${interaction.user.tag}**.`, files: [file] }).catch(() => {});
    }

    setTimeout(() => ch.delete().catch(() => {}), 3000);
  }
});

client.login(process.env.DISCORD_TOKEN);
