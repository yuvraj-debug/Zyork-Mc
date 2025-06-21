require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField
} = require('discord.js');

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Keep-alive server running'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const ticketSetup = new Map(); // per-server config
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
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim();
  const guildId = message.guild.id;

  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null
    });
  }

  const setup = ticketSetup.get(guildId);

  // !help
  if (content === '!help') {
    return message.channel.send(`
**🤖 Bot Commands Overview**

🎫 **Ticket Setup**
\`!ticket <message>\` – Set ticket panel message
\`!option <emoji> <label>\` – Add ticket button
\`!ticketviewer @role\` – Support role for tickets
\`!ticketcategory #channel\` – Use parent category of a text channel
\`!deployticketpanel\` – Deploy ticket panel
\`!close\` – Close a ticket channel

📬 **Messaging**
\`!msg <message>\` – Send a message & delete command
\`!dm <@role> <message>\` – DM all users in a role

🎮 **Mini-Games**
\`!guess <number>\` – Guess a number
\`!rps <rock|paper|scissors>\` – Rock-Paper-Scissors vs bot
\`!scramble\` – Unscramble the word
\`!trivia\` – Answer a trivia question

ℹ️ \`!help\` – Show all commands
    `);
  }

  // Ticket commands
  if (content.startsWith('!ticket ')) {
    setup.description = content.slice(8).trim();
    return message.reply('✅ Ticket description set.');
  }

  if (content.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 10) return message.reply('Max 10 options allowed.');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (content.startsWith('!ticketviewer')) {
    const match = content.match(/<@&(\d+)>/);
    if (!match) return message.reply('Mention a role like @SupportTeam');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  if (content.startsWith('!ticketcategory')) {
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('Mention a channel like #general');
    const channel = message.guild.channels.cache.get(match[1]);
    if (!channel?.parentId) return message.reply('Could not find parent category.');
    setup.categoryId = channel.parentId;
    return message.reply(`✅ Category set from parent of #${channel.name}`);
  }

  if (content === '!deployticketpanel') {
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('Setup incomplete. Set description, options, role, and category.');
    }
    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');

    const row = new ActionRowBuilder();
    setup.options.forEach((opt, i) => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`ticket_${i}`)
          .setLabel(opt.label)
          .setEmoji(opt.emoji)
          .setStyle(ButtonStyle.Primary)
      );
    });

    await message.channel.send({ embeds: [embed], components: [row] });
    return message.reply('✅ Ticket panel deployed.');
  }

  if (content === '!close') {
    if (!message.channel.name.startsWith('ticket-')) {
      return message.reply('❌ This is not a ticket channel.');
    }
    await message.reply('Closing this ticket...');
    setTimeout(() => message.channel.delete(), 3000);
  }

  // Messaging
  if (content.startsWith('!msg ')) {
    const msg = message.content.slice(5).trim();
    if (msg) {
      await message.channel.send(msg);
      await message.delete().catch(() => {});
    }
  }

  if (content.startsWith('!dm ')) {
    const args = message.content.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const msg = args.join(' ');
    const roleId = roleMention.match(/^<@&(\d+)>$/)?.[1];
    if (!roleId) return message.reply('Mention a role like @Members');
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('Role not found.');
    const members = role.members;
    let sent = 0;
    members.forEach(member => {
      member.send(msg).then(() => sent++).catch(() => {});
    });
    message.delete().catch(() => {});
    console.log(`✅ DM sent to ${sent} member(s)`);
  }

  // Games
  if (content.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    if (isNaN(guess)) return message.reply('Enter a number.');
    if (guess === games.guessNumber) {
      message.reply(`🎉 Correct! Number was ${games.guessNumber}.`);
      games.guessNumber = Math.floor(Math.random() * 100) + 1;
    } else {
      message.reply(guess < games.guessNumber ? '🔼 Too low' : '🔽 Too high');
    }
  }

  if (content.startsWith('!rps ')) {
    const player = content.split(' ')[1];
    const choices = ['rock', 'paper', 'scissors'];
    const bot = choices[Math.floor(Math.random() * 3)];
    if (!choices.includes(player)) return message.reply('Choose rock, paper or scissors.');
    let result = player === bot ? 'Draw!' :
      (player === 'rock' && bot === 'scissors') || (player === 'paper' && bot === 'rock') || (player === 'scissors' && bot === 'paper') ? 'You win!' : 'I win!';
    message.reply(`You chose ${player}, I chose ${bot}. ${result}`);
  }

  if (content === '!scramble') {
    const word = words[Math.floor(Math.random() * words.length)];
    games.scrambledWord = word;
    message.channel.send(`🔤 Unscramble this: **${scramble(word)}**`);
  }

  if (games.scrambledWord && content === games.scrambledWord) {
    message.reply(`✅ Correct! It was **${games.scrambledWord}**`);
    games.scrambledWord = '';
  }

  if (content === '!trivia') {
    games.trivia = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    message.channel.send(`❓ ${games.trivia.question}`);
  }

  if (
