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

function isAdminOrOwner(userOrMember) {
  return (
    userOrMember?.permissions?.has?.('Administrator') ||
    userOrMember?.id === OWNER_ID
  );
}

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const content = message.content.trim();
  const lc = content.toLowerCase();
  const uid = message.author.id;

  const isGameCommand = lc.startsWith('!guess') || lc === '!trivia' || lc === '!scramble' || lc.startsWith('!rps');
  const isRestrictedCommand = !isGameCommand && !isAdminOrOwner(message.member);

  if (isRestrictedCommand) {
    return message.reply('❌ Only admins or the bot owner can use this command.');
  }

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

  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  if (lc === '!help') {
    return message.channel.send(`📘 **Bot Commands**

🎟️ **Ticket System** (Admin only)
\`!ticket <message>\` — Set ticket message  
\`!option <emoji> <label>\` — Add ticket category  
\`!resetticket\` — Reset ticket setup  
\`!ticketviewer @role\` — Set viewer role  
\`!ticketcategory #channel\` — Set category  
\`!deployticketpanel\` — Deploy ticket panel

🎮 **Mini‑Games** (Everyone)
\`!guess <number>\` — Guess the number  
\`!trivia\` — Trivia game  
\`!scramble\` — Unscramble word  
\`!rps <rock|paper|scissors>\` — Rock Paper Scissors

📬 **Messaging** (Admin only)
\`!msg <message>\` — Bot says a message  
\`!dm @role <message>\` — DM all users with a role

📝 **Application System** (Admin only)
\`!addques <question>\`  
\`!setoptions Option|Cooldown,...\`  
\`!setchannel #channel\`  
\`!deploy\`  
\`!reset\``);
  }

  // === MINI GAMES
  if (lc.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    if (isNaN(guess)) return message.reply('❌ Enter a number.');
    const correct = games.guessNumber;
    if (guess === correct) {
      games.guessNumber = Math.floor(Math.random() * 100) + 1;
      return message.reply(`🎉 Correct! The number was **${correct}**. New number generated.`);
    } else {
      return message.reply(`❌ Wrong guess. Try again!`);
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
    const choices = ['rock', 'paper', 'scissors'];
    if (!choices.includes(userChoice)) return message.reply('❌ Choose rock, paper, or scissors.');
    const botChoice = choices[Math.floor(Math.random() * 3)];
    let result = '🤝 It\'s a draw!';
    if (
      (userChoice === 'rock' && botChoice === 'scissors') ||
      (userChoice === 'paper' && botChoice === 'rock') ||
      (userChoice === 'scissors' && botChoice === 'paper')
    ) result = '🎉 You win!';
    else if (userChoice !== botChoice) result = '😢 You lose!';
    return message.reply(`You chose **${userChoice}**, I chose **${botChoice}**.\n${result}`);
  }

  // === ADMIN COMMANDS CONTINUE FROM HERE (unchanged logic)
  // === !resetticket, !ticket, !option, !ticketviewer, !ticketcategory,
  // === !deployticketpanel, !msg, !dm, !addques, !setoptions, !setchannel, !reset, !deploy
  // (Refer to full code posted in last message, no change needed for these.)

});

client.on(Events.InteractionCreate, async interaction => {
  // Your existing interaction handlers (for ticket + application form) stay here
  // No change needed unless you request updates
});

client.login(process.env.DISCORD_TOKEN);
