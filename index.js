require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Keep-alive server running'));

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

const games = {
  guessNumber: Math.floor(Math.random() * 100) + 1,
  scrambledWord: '',
  trivia: null
};

const triviaQuestions = [
  { question: "What is the capital of France?", answer: "paris" },
  { question: "2 + 2 * 2 = ?", answer: "6" },
  { question: "Which planet is known as the Red Planet?", answer: "mars" }
];

const words = ['banana', 'elephant', 'discord', 'javascript', 'pirate'];

function scramble(word) {
  return word.split('').sort(() => 0.5 - Math.random()).join('');
}

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  const content = message.content.toLowerCase();

  // !help
  if (content === '!help') {
    const helpText = `
**Available Commands**
\`!msg <message>\` - Sends a message in the channel.
\`!dm <@role> <message>\` - Sends a DM to each member in a role.
\`!guess <number>\` - Guess a number between 1–100.
\`!rps <rock|paper|scissors>\` - Rock-Paper-Scissors vs the bot.
\`!scramble\` - Unscramble the random word.
\`!trivia\` - Answer a trivia question.
    `;
    return message.channel.send(helpText);
  }

  // !msg
  if (content.startsWith('!msg ')) {
    const msg = message.content.slice(5).trim();
    if (msg) {
      await message.channel.send(msg);
      await message.delete().catch(() => {});
    }
  }

  // !dm
  if (content.startsWith('!dm ')) {
    const args = message.content.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const msg = args.join(' ');

    const roleId = roleMention.match(/^<@&(\d+)>$/)?.[1];
    if (!roleId) return message.reply('Please mention a valid role.');

    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('Role not found.');

    const members = role.members;
    if (!members.size) return message.reply('No members in this role.');

    let sent = 0;
    members.forEach(member => {
      member.send(msg)
        .then(() => sent++)
        .catch(() => console.log(`❌ Couldn't DM ${member.user.tag}`));
    });

    message.delete().catch(() => {});
    console.log(`✅ Sent message to ${sent} member(s)`);
  }

  // !guess
  if (content.startsWith('!guess ')) {
    const num = parseInt(content.split(' ')[1]);
    if (isNaN(num)) return message.reply('Please enter a valid number.');

    if (num === games.guessNumber) {
      message.reply(`🎉 Correct! The number was ${games.guessNumber}.`);
      games.guessNumber = Math.floor(Math.random() * 100) + 1;
    } else if (num < games.guessNumber) {
      message.reply('🔼 Too low!');
    } else {
      message.reply('🔽 Too high!');
    }
  }

  // !rps
  if (content.startsWith('!rps ')) {
    const player = content.split(' ')[1];
    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];

    if (!choices.includes(player)) {
      return message.reply('Please pick rock, paper, or scissors.');
    }

    let result = '';
    if (player === bot) result = 'It’s a draw!';
    else if (
      (player === 'rock' && bot === 'scissors') ||
      (player === 'paper' && bot === 'rock') ||
      (player === 'scissors' && bot === 'paper')
    ) result = 'You win!';
    else result = 'I win!';

    message.reply(`You chose **${player}**, I chose **${bot}**. ${result}`);
  }

  // !scramble
  if (content === '!scramble') {
    const word = words[Math.floor(Math.random() * words.length)];
    games.scrambledWord = word;
    message.channel.send(`🔤 Unscramble this word: **${scramble(word)}**`);
  }

  if (games.scrambledWord && content === games.scrambledWord) {
    message.reply(`✅ Correct! The word was **${games.scrambledWord}**`);
    games.scrambledWord = '';
  }

  // !trivia
  if (content === '!trivia') {
    games.trivia = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    message.channel.send(`❓ ${games.trivia.question}`);
  }

  if (games.trivia && content === games.trivia.answer.toLowerCase()) {
    message.reply(`🧠 Correct!`);
    games.trivia = null;
  }
});

process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);
