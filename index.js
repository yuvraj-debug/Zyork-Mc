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

const OWNER_ID = '1202998273376522331';
const ticketSetup = new Map();
const userStates = new Map();
const DATA_FILE = './data.json';

let questions = [];
let options = [];
let logChannelId = '';
const userLastApplied = new Map();

if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE));
  options = saved.options || [];
  logChannelId = saved.logChannelId || '';
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
const isAdminOrOwner = member => member?.permissions?.has?.('Administrator') || member?.id === OWNER_ID;

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const uid = message.author.id;
  const content = message.content.trim();
  const lc = content.toLowerCase();
  const isGameCmd = lc.startsWith('!guess') || lc === '!trivia' || lc === '!scramble' || lc.startsWith('!rps');
  const restricted = !isGameCmd && !isAdminOrOwner(message.member);
  if (restricted) return message.reply('❌ Only admins or the bot owner can use this.');

  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  if (lc === '!help') {
    return message.channel.send(`📘 **Bot Commands**

🎮 **Mini‑Games** (Everyone)
\`!guess <number>\` — Guess the number  
\`!trivia\` — Trivia game  
\`!scramble\` — Unscramble word  
\`!rps <rock|paper|scissors>\` — Rock Paper Scissors

🔧 **Admin Only**
\`!ticket <msg>\`, \`!option <emoji> <label>\`, \`!resetticket\`, \`!ticketviewer @role\`, \`!ticketcategory #channel\`, \`!deployticketpanel\`  
\`!msg <message>\`, \`!dm @role <message>\`  
\`!addques <q>\`, \`!setoptions Opt|Cooldown,...\`, \`!setchannel #ch\`, \`!deploy\`, \`!reset\``);
  }

  // ===== MINI GAMES
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

  if (lc.startsWith('!rps ')) {
    const userChoice = lc.split(' ')[1];
    const options = ['rock', 'paper', 'scissors'];
    if (!options.includes(userChoice)) return message.reply('❌ Use: rock, paper, or scissors');
    const botChoice = options[Math.floor(Math.random() * 3)];
    const result = userChoice === botChoice
      ? '🤝 It\'s a draw!'
      : (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
        ? '🎉 You win!' : '😢 You lose!';
    return message.reply(`You: **${userChoice}**, Bot: **${botChoice}**\n${result}`);
  }

  // ===== ADMIN SETUP COMMANDS
  if (lc === '!resetticket') {
    ticketSetup.set(message.guild.id, {
      description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null
    });
    return message.reply('♻️ Ticket setup reset.');
  }

  if (lc.startsWith('!ticket ')) {
    const setup = getSetup(message.guild.id);
    setup.description = content.slice(8);
    const att = message.attachments.first();
    if (att) setup.footerImage = att.url;
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    const setup = getSetup(message.guild.id);
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (lc.startsWith('!ticketviewer')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<@&(\\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<#(\\d+)>/);
    if (!match) return message.reply('❌ Mention a valid channel.');
    const ch = message.guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = ch.parentId;
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

  if (lc.startsWith('!msg ')) {
    const msg = content.slice(5);
    await message.channel.send(msg);
    await message.delete().catch(() => {});
  }

  if (lc.startsWith('!dm ')) {
    const parts = content.split(' ');
    const match = parts[1].match(/^<@&(\\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    const msg = parts.slice(2).join(' ');
    const role = message.guild.roles.cache.get(match[1]);
    if (!role) return message.reply('❌ Role not found.');
    for (const m of role.members.values()) {
      if (!m.user.bot) m.send(msg).catch(() => {});
    }
    message.reply('✅ DMs sent.');
  }

  // === APPLICATION SYSTEM
  if (lc.startsWith('!addques')) {
    const q = content.slice(9);
    questions.push(q);
    message.reply(`✅ Question added: ${q}`);
  }

  if (lc.startsWith('!setoptions')) {
    options = content.slice(12).split(',').map(o => {
      const [label, days] = o.split('|');
      return { label, value: label.toLowerCase().replace(/\\s+/g, '_'), cooldown: parseInt(days) || 14 };
    });
    fs.writeFileSync(DATA_FILE, JSON.stringify({ options, logChannelId }));
    message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    logChannelId = ch.id;
    fs.writeFileSync(DATA_FILE, JSON.stringify({ options, logChannelId }));
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
    fs.writeFileSync(DATA_FILE, JSON.stringify({ options: [], logChannelId: '' }));
    message.reply('♻️ Reset all questions and options.');
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  const user = interaction.user;
  const selected = interaction.values[0];
  const option = options.find(o => o.value === selected);
  if (!option) return interaction.reply({ content: '❌ Invalid option.', ephemeral: true });

  const now = Date.now();
  const key = `${user.id}_${option.value}`;
  const last = userLastApplied.get(key);
  const cooldownMs = option.cooldown * 24 * 60 * 60 * 1000;

  if (!isAdminOrOwner(user) && last && now - last < cooldownMs) {
    const days = Math.ceil((cooldownMs - (now - last)) / (24 * 60 * 60 * 1000));
    return interaction.reply({ content: `⏳ Try again in **${days} day(s)**.`, ephemeral: true });
  }

  if (!isAdminOrOwner(user)) userLastApplied.set(key, now);
  const dm = await user.createDM();
  await interaction.reply({ content: '📩 Check your DMs.', ephemeral: true });

  let i = 0;
  const answers = [];

  const ask = async () => {
    if (i >= questions.length) {
      await dm.send({ embeds: [new EmbedBuilder().setTitle('✅ Application Complete').setDescription(`Your application for **${option.label}** has been submitted.`)] });
      if (logChannelId) {
        const logCh = await client.channels.fetch(logChannelId);
        const summary = answers.map((a, j) => `**Q${j + 1}:** ${questions[j]}\n**A:** ${a}`).join('\n\n');
        logCh.send(`📨 Application from **${user.tag}** for **${option.label}**\n\n${summary}`);
      }
      return;
    }
    await dm.send({ embeds: [new EmbedBuilder().setTitle(`📋 Question ${i + 1}`).setDescription(questions[i])] });
  };

  const collector = dm.createMessageCollector({ filter: m => m.author.id === user.id, time: 300000 });
  collector.on('collect', msg => {
    answers.push(msg.content);
    i++;
    ask();
  });

  ask();
});

function getSetup(guildId) {
  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
  }
  return ticketSetup.get(guildId);
}

client.login(process.env.DISCORD_TOKEN);
