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
  PermissionsBitField,
  AttachmentBuilder
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
      categoryId: null,
      footerImage: null
    });
  }

  const setup = ticketSetup.get(guildId);

  if (content === '!help') {
    const helpText = `📘 **Bot Command Overview**

🎟️ **Ticket System**
📝 \`!ticket <message>\` — Set ticket message  
➕ \`!option <emoji> <label>\` — Add a category  
🎭 \`!ticketviewer @role\` — Set viewer role  
📂 \`!ticketcategory #channel\` — Use channel's category for tickets  
🚀 \`!deployticketpanel\` — Deploy dropdown ticket menu  
🗑️ Button — Close ticket & receive transcript

🎮 **Mini-Games**
🎯 \`!guess <number>\` — Guess a number  
🧠 \`!trivia\` — Trivia question  
🔤 \`!scramble\` — Unscramble word  
🤖 \`!rps <rock|paper|scissors>\` — Rock paper scissors

📬 **Messaging Tools**
💬 \`!msg <message>\` — Bot says a message  
📨 \`!dm @role <message>\` — DM a role

ℹ️ \`!help\` — Show this guide`;
    return message.channel.send(helpText);
  }

  if (content.startsWith('!ticket ')) {
    setup.description = content.slice(8).trim();
    const attachment = message.attachments.first();
    setup.footerImage = attachment?.url ?? null;
    return message.reply('✅ Ticket message set.');
  }

  if (content.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 25) return message.reply('❌ Max 25 options allowed.');
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
    if (!match) return message.reply('❌ Mention a valid channel.');
    const channel = message.guild.channels.cache.get(match[1]);
    if (!channel?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = channel.parentId;
    const parent = message.guild.channels.cache.get(setup.categoryId);
    return message.reply(`✅ Ticket category set to **${parent?.name || 'Unnamed'}**.`);
  }

  if (content === '!deployticketpanel') {
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('❌ Setup incomplete.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');

    if (setup.footerImage) embed.setImage(setup.footerImage);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select a ticket category')
      .addOptions(
        setup.options.map((opt, i) => ({
          label: opt.label,
          value: `ticket_${i}`,
          emoji: opt.emoji
        }))
      );

    const row = new ActionRowBuilder().addComponents(menu);
    const panelMessage = await message.channel.send({ embeds: [embed], components: [row] });

    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const deletables = fetched.filter(msg => msg.id !== panelMessage.id && msg.id !== message.id);
    await message.channel.bulkDelete(deletables, true).catch(() => {});
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
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('❌ Role not found.');
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
    const result =
      player === bot
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

if (
  games.scrambledWord && 
  typeof content === 'string' && 
  content.toLowerCase() === games.scrambledWord.toLowerCase()
) {
  try {
    await message.reply(`✅ Well done! The word was **${games.scrambledWord}**`);
  } catch (err) {
    console.error('❌ Failed to send scramble reply:', err);
  }
  games.scrambledWord = '';
}
client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;
  const setup = ticketSetup.get(interaction.guild.id);

  if (!setup || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
    return interaction.reply({
      content: '❌ Ticket system is not fully configured on this server.',
      ephemeral: true
    });
  }

  const user = interaction.user;

  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_select') {
    const index = parseInt(interaction.values[0].split('_')[1]);
    const option = setup.options[index];

    const existing = interaction.guild.channels.cache.find(c =>
      c.name.startsWith(`ticket-${user.username.toLowerCase()}`)
    );

    if (existing) {
      return interaction.reply({
        content: `⚠️ You already have an open ticket: <#${existing.id}>`,
        ephemeral: true
      });
    }

    const ticketName = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}-${Date.now().toString().slice(-4)}`;

    const channel = await interaction.guild.channels.create({
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
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        },
        {
          id: setup.viewerRoleId,
          allow: [
            PermissionsBitField.Flags.ViewChannel,
            PermissionsBitField.Flags.SendMessages,
            PermissionsBitField.Flags.ReadMessageHistory
          ]
        }
      ]
    });

    await channel.send({
      content: `🎫 <@${user.id}> created a ticket for **${option.label}**. <@&${setup.viewerRoleId}>`,
      allowedMentions: { users: [user.id], roles: [setup.viewerRoleId] }
    });

    const deleteRow = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId('ticket_delete')
        .setLabel('Delete Ticket')
        .setStyle(ButtonStyle.Danger)
    );

    await channel.send({
      content: '🗑️ Click the button below to close this ticket and receive a transcript.',
      components: [deleteRow]
    });

    await interaction.reply({
      content: `✅ Ticket created: <#${channel.id}>`,
      ephemeral: true
    });
  }

  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    const channel = interaction.channel;
    if (!channel.name.startsWith('ticket-')) return;

    await interaction.reply({ content: '🗂️ Generating transcript and closing ticket...', ephemeral: true });

    const messages = await channel.messages.fetch({ limit: 100 });
    const transcript = [...messages.values()]
      .reverse()
      .map(m => `${m.author.tag}: ${m.content}`)
      .join('\n');

    const buffer = Buffer.from(transcript, 'utf-8');
    const file = new AttachmentBuilder(buffer, { name: 'transcript.txt' });

    const username = channel.name.split('-')[1];
    const member = interaction.guild.members.cache.find(m =>
      m.user.username.toLowerCase().startsWith(username)
    );

    if (member) {
      member.send({
        content: `📁 Your ticket was closed by **${interaction.user.tag}**.`,
        files: [file]
      }).catch(() => {});
    }

    setTimeout(() => channel.delete().catch(() => {}), 3000);
  }
}); // 👈 This closes client.on('interactionCreate', ...)

process.on('unhandledRejection', err => {
  console.error('Unhandled Rejection:', err);
});

client.login(process.env.DISCORD_TOKEN);})
