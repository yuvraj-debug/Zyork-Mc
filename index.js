// FINAL FULL DISCORD BOT CODE — All Public Access Version (No Admin-Only Restrictions)
require('dotenv').config();
const fs = require('fs');
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ChannelType,
  Events
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

const DATA_FILE = './data.json';
const TICKET_FILE = './ticket_data.json';

let questions = [];
let options = [];
let logChannelId = '';
let ticketSetup = new Map();
const userStates = new Map();
const userLastApplied = new Map();

if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE));
  questions = saved.questions || [];
  options = saved.options || [];
  logChannelId = saved.logChannelId || '';
}

if (fs.existsSync(TICKET_FILE)) {
  const raw = JSON.parse(fs.readFileSync(TICKET_FILE));
  ticketSetup = new Map(Object.entries(raw));
}

function saveTicketSetup() {
  const plain = Object.fromEntries(ticketSetup);
  fs.writeFileSync(TICKET_FILE, JSON.stringify(plain, null, 2));
}

function saveApp() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ questions, options, logChannelId }, null, 2));
}

function getSetup(guildId) {
  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
  }
  return ticketSetup.get(guildId);
}

const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const uid = message.author.id;
  const content = message.content.trim();
  const lc = content.toLowerCase();

  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  if (lc === '!help') {
    return message.channel.send(`📘 **Bot Commands**

🎮 **Mini‑Games**
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
  }

  if (lc === '!trivia') {
    const q = [
      { question: 'Capital of France?', answer: 'paris' },
      { question: 'Red planet?', answer: 'mars' }
    ][Math.floor(Math.random() * 2)];
    state.triviaAnswer = q.answer;
    return message.channel.send(`🧠 Trivia: ${q.question}`);
  }
  if (state.triviaAnswer && lc === state.triviaAnswer.toLowerCase()) {
    state.triviaAnswer = null;
    return message.reply('✅ Correct answer!');
  }

  if (lc === '!scramble') {
    const word = 'discord';
    state.scrambleAnswer = word;
    return message.channel.send(`🔤 Unscramble: \`${scramble(word)}\``);
  }
  if (state.scrambleAnswer && lc === state.scrambleAnswer.toLowerCase()) {
    state.scrambleAnswer = null;
    return message.reply('✅ Correct unscramble!');
  }

  if (lc.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    const correct = 42;
    return message.reply(guess === correct ? '🎉 Correct!' : '❌ Wrong. Try again!');
  }

  if (lc.startsWith('!addques')) {
    questions.push(content.slice(9));
    saveApp();
    return message.reply('✅ Question added.');
  }

  if (lc.startsWith('!setoptions')) {
    options = content.slice(12).split(',').map(x => {
      const [label, days] = x.split('|');
      return { label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(days) || 14 };
    });
    saveApp();
    return message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (ch) logChannelId = ch.id;
    saveApp();
    return message.reply('✅ Log channel set.');
  }

  if (lc === '!deploy') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .addOptions(options.map(o => ({ label: o.label, value: o.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    message.channel.send({ content: '📥 Select below to apply.', components: [row] });
  }

  if (lc === '!reset') {
    questions = [];
    options = [];
    logChannelId = '';
    saveApp();
    message.reply('♻️ Reset done.');
  }

  if (lc.startsWith('!ticket ')) {
    const setup = getSetup(message.guild.id);
    setup.description = content.slice(8);
    saveTicketSetup();
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    const setup = getSetup(message.guild.id);
    const args = content.slice(8).split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    setup.options.push({ emoji, label });
    saveTicketSetup();
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (lc.startsWith('!ticketviewer')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<@&(\d+)>/);
    if (match) setup.viewerRoleId = match[1];
    saveTicketSetup();
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<#(\d+)>/);
    if (match) {
      const ch = message.guild.channels.cache.get(match[1]);
      if (ch?.parentId) setup.categoryId = ch.parentId;
    }
    saveTicketSetup();
    return message.reply('✅ Category set.');
  }

  if (lc === '!deployticketpanel') {
    const setup = getSetup(message.guild.id);
    const embed = new EmbedBuilder()
      .setTitle('📩 Open Ticket')
      .setDescription(setup.description)
      .setColor('Blue');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .addOptions(setup.options.map((opt, i) => ({ label: opt.label, value: `ticket_${i}`, emoji: opt.emoji })));
    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  const user = interaction.user;
  const selected = interaction.values[0];
  const option = options.find(o => o.value === selected);
  if (!option) return interaction.reply({ content: '❌ Invalid.', ephemeral: true });

  const now = Date.now();
  const key = `${user.id}_${option.value}`;
  const last = userLastApplied.get(key);
  const cooldown = option.cooldown * 24 * 60 * 60 * 1000;

  if (last && now - last < cooldown) {
    const days = Math.ceil((cooldown - (now - last)) / (24 * 60 * 60 * 1000));
    return interaction.reply({ content: `⏳ Try again in ${days} day(s).`, ephemeral: true });
  }
  userLastApplied.set(key, now);
  await interaction.reply({ content: '📩 Check DMs.', ephemeral: true });

  const dm = await user.createDM();
  let i = 0;
  const answers = [];

  const ask = async () => {
    if (i >= questions.length) {
      await dm.send({ embeds: [new EmbedBuilder().setTitle('✅ Done').setDescription(`Application submitted for **${option.label}**.`)] });
      if (logChannelId) {
        const logCh = await client.channels.fetch(logChannelId).catch(() => {});
        if (logCh) {
          const summary = answers.map((a, j) => `**Q${j + 1}:** ${questions[j]}\n**A:** ${a}`).join('\n\n');
          logCh.send(`📨 Application from **${user.tag}** for **${option.label}**\n\n${summary}`);
        }
      }
      return;
    }
    await dm.send({ embeds: [new EmbedBuilder().setTitle(`📋 Q${i + 1}`).setDescription(questions[i])] });
  };

  const collector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });
  collector.on('collect', msg => {
    answers.push(msg.content);
    i++;
    ask();
  });
  ask();
});

client.login(process.env.DISCORD_TOKEN);
