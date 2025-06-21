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
  PermissionsBitField,
  REST,
  Routes,
  SlashCommandBuilder
} = require('discord.js');

const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const ticketSetup = new Map();
const games = {
  guessNumber: Math.floor(Math.random() * 100) + 1,
  scrambledWord: '',
  trivia: null
};

const triviaQuestions = [
  { question: 'What is the capital of France?', answer: 'paris' },
  { question: 'Which planet is known as the Red Planet?', answer: 'mars' },
  { question: '2 + 2 * 2 = ?', answer: '6' }
];

const scrambleWords = ['banana', 'elephant', 'discord', 'javascript', 'pirate'];
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

client.once('ready', async () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);

  const commands = [
    new SlashCommandBuilder().setName('help').setDescription('Show help menu'),
    new SlashCommandBuilder().setName('ping').setDescription('Ping the bot')
  ].map(cmd => cmd.toJSON());

  const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);
  try {
    await rest.put(Routes.applicationCommands('1383659368276430949'), { body: commands });
    console.log('✅ Slash commands registered');
  } catch (err) {
    console.error('❌ Slash command registration error:', err);
  }
});

client.on('interactionCreate', async interaction => {
  if (interaction.isChatInputCommand()) {
    if (interaction.commandName === 'ping') {
      return interaction.reply('🏓 Pong!');
    }

    if (interaction.commandName === 'help') {
      return interaction.reply({ content: getHelpMessage(), ephemeral: true });
    }
  }

  if (!interaction.isButton() || !interaction.guild) return;

  const setup = ticketSetup.get(interaction.guild.id);
  if (!setup || !setup.options.length || !setup.categoryId || !setup.viewerRoleId) {
    return interaction.reply({ content: '❌ Ticket system is not fully configured.', ephemeral: true });
  }

  const optionIndex = parseInt(interaction.customId.split('_')[1]);
  const option = setup.options[optionIndex];
  const user = interaction.user;
  const ticketName = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;

  const existing = interaction.guild.channels.cache.find(c =>
    c.name.startsWith(`ticket-${user.username.toLowerCase()}`)
  );

  if (existing) {
    return interaction.reply({ content: `⚠️ You already have an open ticket: <#${existing.id}>`, ephemeral: true });
  }

  const ticketChannel = await interaction.guild.channels.create({
    name: ticketName,
    type: 0,
    parent: setup.categoryId,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone,
        deny: [PermissionsBitField.Flags.ViewChannel]
      },
      {
        id: user.id,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      },
      {
        id: setup.viewerRoleId,
        allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory]
      }
    ]
  });

  await ticketChannel.send({
    content: `🎫 <@${user.id}> created a ticket for **${option.label}**. <@&${setup.viewerRoleId}>`,
    allowedMentions: { users: [user.id], roles: [setup.viewerRoleId] }
  });

  await interaction.reply({ content: `✅ Ticket created: <#${ticketChannel.id}>`, ephemeral: true });
});

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const content = message.content.trim().toLowerCase();
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

  if (content === '!help') {
    return message.channel.send(getHelpMessage());
  }

  if (content === '!ping') {
    return message.reply('🏓 Pong!');
  }

  if (content.startsWith('!ticket ')) {
    setup.description = content.slice(8).trim();
    const attachment = message.attachments.first();
    if (attachment && /\.(png|jpe?g|gif|webp)$/i.test(attachment.name)) {
      setup.footerImage = attachment.url;
    } else {
      setup.footerImage = null;
    }
    return message.reply('✅ Ticket panel message set. Use `!deployticketpanel` when ready.');
  }

  if (content.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 10) return message.reply('❌ Max 10 options allowed.');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (content.startsWith('!ticketviewer')) {
    const match = content.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  if (content.startsWith('!ticketcategory')) {
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid text channel.');
    const channel = message.guild.channels.cache.get(match[1]);
    if (!channel?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = channel.parentId;
    return message.reply(`✅ Ticket category set from parent of #${channel.name}`);
  }

  if (content === '!deployticketpanel') {
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('❌ Incomplete setup. Please configure everything first.');
    }

    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = fetched.filter(msg => msg.id !== message.id);
    await message.channel.bulkDelete(toDelete, true).catch(() => {});

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');

    if (setup.footerImage) {
      embed.setImage(setup.footerImage);
    }

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
    return message.reply('✅ Ticket panel deployed. Previous messages cleared.');
  }

  if (content === '!close') {
    if (!message.channel.name.startsWith('ticket-')) {
      return message.reply('❌ This is not a ticket channel.');
    }
    await message.reply('🗑️ Closing this ticket...');
    setTimeout(() => message.channel.delete(), 3000);
  }

  if (content.startsWith('!msg ')) {
    const msg = content.slice(5).trim();
    if (msg) {
      await message.channel.send(msg);
      await message.delete().catch(() => {});
    }
  }

  if (content.startsWith('!dm ')) {
    const args = content.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const msg = args.join(' ');
    const roleId = roleMention.match(/^<@&(\d+)>$/)?.[1];
    if (!roleId) return message.reply('❌ Mention a valid role.');
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('message.reply('❌ Role not found.');
    let sent = 0;
    for (const [, member] of role.members) {
      member.send(msg).then(() => sent++).catch(() => {});
    }
    message.delete().catch(() => {});
    console.log(`✅ DMs sent: ${sent}`);
  }

  if (content.startsWith('!guess ')) {
    const guess = parseInt(content.split(' ')[1]);
    if (isNaN(guess)) return message.reply('❓ Enter a number.');
    if (guess === games.guessNumber) {
      message.reply(`🎉 Correct! It was ${games.guessNumber}`);
      games.guessNumber = Math.floor(Math.random() * 100) + 1;
    } else {
      message.reply(guess < games.guessNumber ? '🔼 Too low!' : '🔽 Too high!');
    }
  }

  if (content === '!trivia') {
    const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    games.trivia = q;
    return message.channel.send(`❓ ${q.question}`);
  }

  if (games.trivia && content.toLowerCase() === games.trivia.answer.toLowerCase()) {
    message.reply('✅ Correct!');
    games.trivia = null;
  }

  if (content.startsWith('!rps ')) {
    const player = content.split(' ')[1]?.toLowerCase();
    const options = ['rock', 'paper', 'scissors'];
    if (!options.includes(player)) return message.reply('🪨 📄 ✂️ Choose rock, paper, or scissors.');
    const bot = options[Math.floor(Math.random() * 3)];
    const result = player === bot
      ? 'Draw!'
      : (player === 'rock' && bot === 'scissors') ||
        (player === 'paper' && bot === 'rock') ||
        (player === 'scissors' && bot === 'paper')
        ? 'You win!' : 'I win!';
    message.reply(`You chose **${player}**, I chose **${bot}** → ${result}`);
  }

  if (content === '!scramble') {
    const word = scrambleWords[Math.floor(Math.random() * scrambleWords.length)];
    games.scrambledWord = word;
    message.channel.send(`🔤 Unscramble this: **${scramble(word)}**`);
  }

  if (games.scrambledWord && content.toLowerCase() === games.scrambledWord) {
    message.reply(`✅ Well done! The word was **${games.scrambledWord}**`);
    games.scrambledWord = '';
  }
});

// 📘 Shared help message used by both slash and text commands
function getHelpMessage() {
  return `
📘 **Bot Command Overview**

━━━━━━━━━━━━━━━━━━━━
🎟️ **Ticket System**
━━━━━━━━━━━━━━━━━━━━
📝 \`ticket <message>\` — Set ticket panel message  
➕ \`option <emoji> <label>\` — Add a ticket button  
🎭 \`ticketviewer @role\` — Set support role  
📂 \`ticketcategory #channel\` — Use channel category  
🚀 \`deployticketpanel\` — Deploy the ticket panel  
🗑️ \`close\` — Close ticket channel

━━━━━━━━━━━━━━━━━━━━
🎮 **Mini-Games**
━━━━━━━━━━━━━━━━━━━━
🎯 \`guess <number>\` — Number guessing  
🧠 \`trivia\` — Answer trivia  
🔤 \`scramble\` — Unscramble a word  
🤖 \`rps <rock|paper|scissors>\` — Rock Paper Scissors

━━━━━━━━━━━━━━━━━━━━
📬 **Messaging Tools**
━━━━━━━━━━━━━━━━━━━━
💬 \`msg <message>\` — Bot echo  
📨 \`dm @role <message>\` — DM a role

━━━━━━━━━━━━━━━━━━━━
ℹ️ **Utilities**
━━━━━━━━━━━━━━━━━━━━
📖 \`help\`, \`ping\` — Show help or check bot status
  `;
}

process.on('unhandledRejection', err => {
  console.error('❌ Unhandled Rejection:', err);
});

client.login(process.env.DISCORD_TOKEN);

