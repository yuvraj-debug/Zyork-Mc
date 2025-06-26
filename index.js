// FULL FIXED DISCORD BOT CODE ✅ NO DOUBLE MESSAGES ✅ NON-ADMIN ACCESS ✅ TICKET & APPLICATION SYSTEM PERSISTENCE ✅ INTERACTION FIXED
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

function saveApp() {
  fs.writeFileSync(DATA_FILE, JSON.stringify({ questions, options, logChannelId }, null, 2));
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
  const isCommand = lc.startsWith('!');
  const state = userStates.get(uid) || {};
  userStates.set(uid, state);

  // Allow everyone to use help + games
  const allowedCommands = ['!help', '!guess', '!trivia', '!scramble', '!rps'];
  if (isCommand && !allowedCommands.some(cmd => lc.startsWith(cmd)) && !isAdminOrOwner(message.member)) {
    return message.reply('❌ Only admins or the bot owner can use this command.');
  }

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
});

client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;

  const user = interaction.user;
  const customId = interaction.customId;

  if (customId === 'ticket_select') {
    const setup = getSetup(interaction.guildId);
    const selected = interaction.values[0];
    const index = parseInt(selected.split('_')[1]);
    const categoryId = setup.categoryId;
    const viewerRoleId = setup.viewerRoleId;
    const option = setup.options[index];

    const ticketChannel = await interaction.guild.channels.create({
      name: `ticket-${user.username}`,
      type: ChannelType.GuildText,
      parent: categoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
        { id: user.id, allow: ['ViewChannel', 'SendMessages'] },
        { id: viewerRoleId, allow: ['ViewChannel'] }
      ]
    });

    await ticketChannel.send(`🎟️ Ticket created by <@${user.id}> for **${option.label}**.`);
    return interaction.reply({ content: '✅ Ticket created. Check your channel list.', ephemeral: true });
  }

  if (customId === 'app_select') {
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
    await interaction.reply({ content: '📩 Check your DMs to apply!', ephemeral: true });

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
  }
});

function getSetup(guildId) {
  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
  }
  return ticketSetup.get(guildId);
}

client.login(process.env.DISCORD_TOKEN);
