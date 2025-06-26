// FULL CODE — PERSISTENT TICKET + APPLICATION SYSTEM + ALL FIXES
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
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  AttachmentBuilder,
  Events,
  ChannelType
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

const OWNER_ID = '1202998273376522331';
const DATA_FILE = './data.json';
const TICKET_FILE = './ticket_data.json';

let questions = [];
let options = [];
let logChannelId = '';
let ticketSetup = new Map();

const userLastApplied = new Map();
const userStates = new Map();

if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE));
  options = saved.options || [];
  logChannelId = saved.logChannelId || '';
  questions = saved.questions || [];
}

if (fs.existsSync(TICKET_FILE)) {
  const raw = JSON.parse(fs.readFileSync(TICKET_FILE));
  ticketSetup = new Map(Object.entries(raw));
}

function saveTicketSetup() {
  const plain = Object.fromEntries(ticketSetup);
  fs.writeFileSync(TICKET_FILE, JSON.stringify(plain, null, 2));
}

const games = {
  guessNumber: Math.floor(Math.random() * 100) + 1,
  scrambleWords: [
    'banana', 'elephant', 'discord', 'javascript', 'pirate',
    'oxygen', 'galaxy', 'universe', 'python', 'reactor',
    'nebula', 'quantum', 'photon', 'gravity', 'comet'
  ]
};

const triviaQuestions = [
  { question: 'What is the capital of France?', answer: 'paris' },
  { question: 'Which planet is known as the Red Planet?', answer: 'mars' },
  { question: '2 + 2 * 2 = ?', answer: '6' },
  { question: 'What is the largest mammal?', answer: 'blue whale' },
  { question: 'Which element has the symbol O?', answer: 'oxygen' },
  { question: 'Who wrote Hamlet?', answer: 'shakespeare' },
  { question: 'What gas do plants absorb?', answer: 'carbon dioxide' },
  { question: 'How many continents are there?', answer: '7' },
  { question: 'In which sport is the term "love" used?', answer: 'tennis' },
  { question: 'What’s the boiling point of water (°C)?', answer: '100' },
  { question: 'Which country gifted the Statue of Liberty?', answer: 'france' },
  { question: 'Who painted the Mona Lisa?', answer: 'da vinci' },
  { question: 'What language is primarily spoken in Brazil?', answer: 'portuguese' }
];

const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');
const isAdminOrOwner = member => member?.permissions?.has('Administrator') || member?.id === OWNER_ID;

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const uid = message.author.id;
  const content = message.content.trim();
  const lc = content.toLowerCase();

  const isGameCmd = lc.startsWith('!guess') || lc === '!trivia' || lc === '!scramble' || lc.startsWith('!rps');
  const isCommand = lc.startsWith('!');
  const isPrivileged = isAdminOrOwner(message.member);

  if (isCommand && !isGameCmd && lc !== '!help' && !isPrivileged) {
    return message.reply('❌ Only admins or the bot owner can use this command.');
  }

  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  if (lc === '!help') {
    return message.channel.send(`📘 **Bot Commands**

🎮 **Mini‑Games** (Everyone)
\`!guess <number>\` — Guess the number  
\`!trivia\` — Trivia game  
\`!scramble\` — Unscramble word  
\`!rps <rock|paper|scissors>\` — Rock Paper Scissors

🛠️ **Admin / Owner Only**

🎟️ **Ticket System**
\`!ticket <message>\` — Set ticket message  
\`!option <emoji> <label>\` — Add ticket category  
\`!resetticket\` — Reset ticket setup  
\`!ticketviewer @role\` — Set viewer role  
\`!ticketcategory #channel\` — Set category  
\`!deployticketpanel\` — Deploy ticket panel

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

  if (lc.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    const correct = games.guessNumber;
    if (guess === correct) {
      games.guessNumber = Math.floor(Math.random() * 100) + 1;
      return message.reply(`🎉 Correct! It was **${correct}**.`);
    } else {
      return message.reply('❌ Wrong guess. Try again!');
    }
  }

  if (lc === '!trivia') {
    const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    state.triviaAnswer = q.answer;
    return message.channel.send(`🧠 Trivia: ${q.question}`);
  }

  if (state.triviaAnswer && lc === state.triviaAnswer.toLowerCase()) {
    state.triviaAnswer = null;
    return message.reply('✅ Correct answer!');
  }

  if (lc === '!scramble') {
    const word = games.scrambleWords[Math.floor(Math.random() * games.scrambleWords.length)];
    state.scrambleAnswer = word;
    return message.channel.send(`🔤 Unscramble: \`${scramble(word)}\``);
  }

  if (state.scrambleAnswer && lc === state.scrambleAnswer.toLowerCase()) {
    state.scrambleAnswer = null;
    return message.reply('✅ Correct unscramble!');
  }

  if (lc === '!resetticket') {
    ticketSetup.set(message.guild.id, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
    saveTicketSetup();
    return message.reply('♻️ Ticket setup reset.');
  }

  if (lc.startsWith('!ticket ')) {
    const setup = getSetup(message.guild.id);
    setup.description = content.slice(8);
    const att = message.attachments.first();
    if (att) setup.footerImage = att.url;
    saveTicketSetup();
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    const setup = getSetup(message.guild.id);
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    setup.options.push({ emoji, label });
    saveTicketSetup();
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (lc.startsWith('!ticketviewer')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    setup.viewerRoleId = match[1];
    saveTicketSetup();
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid channel.');
    const ch = message.guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = ch.parentId;
    saveTicketSetup();
    return message.reply(`✅ Category set.`);
  }

  if (lc === '!deployticketpanel') {
    const setup = getSetup(message.guild.id);
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId)
      return message.reply('❌ Setup incomplete.');

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');

    if (setup.footerImage) embed.setImage(setup.footerImage);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select ticket category')
      .addOptions(setup.options.map((opt, i) => ({
        label: opt.label, value: `ticket_${i}`, emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ embeds: [embed], components: [row] });
  }

  if (lc.startsWith('!addques')) {
    const q = content.slice(9);
    questions.push(q);
    saveApp();
    message.reply(`✅ Question added: ${q}`);
  }

  if (lc.startsWith('!setoptions')) {
    options = content.slice(12).split(',').map(o => {
      const [label, days] = o.split('|');
      return { label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(days) || 14 };
    });
    saveApp();
    message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    logChannelId = ch.id;
    saveApp();
    message.reply('✅ Log channel set.');
  }

  if (lc === '!deploy') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .setPlaceholder('Select an option')
      .addOptions(options.map(o => ({ label: o.label, value: o.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    message.channel.send({ content: '📥 Click below to apply!', components: [row] });
  }

  if (lc === '!reset') {
    questions = [];
    options = [];
    logChannelId = '';
    saveApp();
    message.reply('♻️ Reset all questions and options.');
  }
});

function getSetup(guildId) {
  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
  }
  return ticketSetup.get(guildId);
}

function saveApp() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ questions, options, logChannelId }, null, 2));
}

client.login(process.env.DISCORD_TOKEN);
