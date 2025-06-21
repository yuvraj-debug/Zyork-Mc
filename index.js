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

// Keep-alive server
const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running'));

// Discord client setup
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

// Ticket system storage
const ticketSetup = new Map();

// Game data
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

// Per-user state tracking
const userStates = new Map();

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const uid = message.author.id;
  const raw = message.content;
  const content = raw.trim();
  const lc = content.toLowerCase();

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
    return message.channel.send(`📘 **Bot Command Overview**
🎟️ **Ticket System**
📝 \`!ticket <message>\` — Set ticket message  
➕ \`!option <emoji> <label>\` — Add a category  
🎭 \`!ticketviewer @role\` — Set viewer role  
📂 \`!ticketcategory #channel\` — Use channel's category for tickets  
🚀 \`!deployticketpanel\` — Deploy dropdown ticket menu  

🎮 **Mini‑Games**
🎯 \`!guess <number>\` — Guess a number  
🧠 \`!trivia\` — Trivia question  
🔤 \`!scramble\` — Unscramble word  
📄 \`!rps <rock|paper|scissors>\` — Rock paper scissors  

📬 **Messaging Tools**
💬 \`!msg <message>\` — Bot says a message  
📨 \`!dm @role <message>\` — DM a role`);
  }

  // === !ticket
  if (lc.startsWith('!ticket ')) {
    setup.description = raw.slice(8).trim();
    const att = message.attachments.first();
    setup.footerImage = att ? att.url : null;
    return message.reply('✅ Ticket message set.');
  }

  // === !option
  if (lc.startsWith('!option ')) {
    const args = raw.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 25) return message.reply('❌ Max 25 options allowed.');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  // === !ticketviewer
  if (lc.startsWith('!ticketviewer')) {
    const match = raw.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  // === !ticketcategory
  if (lc.startsWith('!ticketcategory')) {
    const match = raw.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid channel.');
    const ch = message.guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = ch.parentId;
    const parent = message.guild.channels.cache.get(setup.categoryId);
    return message.reply(`✅ Ticket category set to **${parent?.name}**.`);
  }

  // === !deployticketpanel
  if (lc === '!deployticketpanel') {
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('❌ Setup incomplete.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue')
      .addFields(
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '\u200B', value: '\u200B', inline: true },
        { name: '\u200B', value: '\u200B', inline: true }
      )
      .setThumbnail('https://via.placeholder.com/400x1.png');
    if (setup.footerImage) embed.setImage(setup.footerImage);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select a ticket category')
      .addOptions(setup.options.map((opt, i) => ({
        label: opt.label,
        value: `ticket_${i}`,
        emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    const panel = await message.channel.send({ embeds: [embed], components: [row] });

    const fetched = await message.channel.messages.fetch({ limit: 100 });
    const toDelete = fetched.filter(m => ![panel.id, message.id].includes(m.id));
    await message.channel.bulkDelete(toDelete, true).catch(() => {});
  }

  // === !msg <message>
  if (lc.startsWith('!msg ')) {
    const msg = raw.slice(5).trim();
    if (!msg) return message.reply('❌ Provide a message after !msg');
    await message.channel.send(msg);
    await message.delete().catch(() => {});
    return;
  }

  // === !dm @role <message>
  if (lc.startsWith('!dm ')) {
    const parts = raw.split(' ');
    const mention = parts[1];
    const msg = parts.slice(2).join(' ').trim();
    if (!mention || !msg) return message.reply('Usage: `!dm @role <message>`');

    const roleId = mention.match(/^<@&(\d+)>/)?.[1];
    if (!roleId) return message.reply('❌ Mention a valid role.');
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('❌ Role not found.');

    let sent = 0;
    for (const m of role.members.values()) {
      if (m.user.bot) continue;
      try { await m.send(msg); sent++; } catch {}
    }
    await message.delete().catch(() => {});
    console.log(`✅ DMs sent: ${sent}`);
    return;
  }

  // === !guess <number>
  if (lc.startsWith('!guess ')) {
    const num = parseInt(raw.split(' ')[1]);
    if (isNaN(num)) return message.reply('❓ Enter a valid number.');
    state.guess = { active: true, answered: false, answer: games.guessNumber };

    if (num === games.guessNumber) {
      message.reply(`🎉 Correct! It was ${games.guessNumber}.`);
      games.guessNumber = Math.floor(Math.random() * 100) + 1;
      state.guess = null;
    } else {
      message.reply(num < games.guessNumber ? '🔼 Too low!' : '🔽 Too high!');
      state.guess.answered = true;
    }
    return;
  } else if (state.guess?.active && !state.guess.answered) {
    const num = parseInt(raw);
    if (!isNaN(num) && num !== state.guess.answer) {
      message.reply(num < state.guess.answer ? '🔼 Too low!' : '🔽 Too high!');
      state.guess.answered = true;
    }
    return;
  }

  // === !trivia
  if (lc === '!trivia') {
    const q = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    state.trivia = { active: true, answered: false, answer: q.answer };
    message.channel.send(`❓ ${q.question}`);
    return;
  } else if (state.trivia?.active) {
    if (content.toLowerCase() === state.trivia.answer) {
      message.reply('✅ Correct!');
      state.trivia = null;
    } else if (!state.trivia.answered) {
      message.reply('❌ Wrong answer, try again!');
      state.trivia.answered = true;
    }
    return;
  }

  // === !scramble
  if (lc === '!scramble') {
    const word = games.scrambleWords[Math.floor(Math.random() * games.scrambleWords.length)];
    state.scramble = { active: true, answered: false, answer: word };
    message.channel.send(`🔤 Unscramble this: **${scramble(word)}**`);
    return;
  } else if (state.scramble?.active) {
    if (content.toLowerCase() === state.scramble.answer) {
      message.reply(`✅ Well done! The word was **${state.scramble.answer}**`);
      state.scramble = null;
    } else if (!state.scramble.answered) {
      message.reply('❌ Nope, that’s not it!');
      state.scramble.answered = true;
    }
    return;
  }

  // === !rps <choice>
  if (lc.startsWith('!rps ')) {
    const player = raw.split(' ')[1]?.toLowerCase();
    const opts = ['rock', 'paper', 'scissors'];
    if (!opts.includes(player)) return message.reply('🪨 📄 ✂️ Choose rock, paper, or scissors.');
    const botPick = opts[Math.floor(Math.random() * opts.length)];
    const result =
      player === botPick
        ? 'Draw!'
        : (player === 'rock' && botPick === 'scissors')
        || (player === 'paper' && botPick === 'rock')
        || (player === 'scissors' && botPick === 'paper')
        ? 'You win!'
        : 'I win!';
    message.reply(`You chose **${player}**, I chose **${botPick}** → ${result}`);
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.guild) return;
  const setup = ticketSetup.get(interaction.guild.id);
  if (!setup?.options.length || !setup.viewerRoleId || !setup.categoryId) {
    return interaction.reply({ content: '❌ Ticket system not fully configured.', ephemeral: true });
  }

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
      type: 0, parent: setup.categoryId,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] },
        { id: setup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages, PermissionsBitField.Flags.ReadMessageHistory] }
      ]
    });

    await ch.send({ content: `🎫 <@${user.id}> opened **${opt.label}** ticket. <@&${setup.viewerRoleId}>`, allowedMentions: { users: [user.id], roles: [setup.viewerRoleId] } });
    const delBtn = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete Ticket').setStyle(ButtonStyle.Danger)
    );
    await ch.send({ content: '🗑️ Click to close and get transcript.', components: [delBtn] });
    await interaction.reply({ content: `✅ Ticket: <#${ch.id}>`, ephemeral: true });
  }

  if (interaction.isButton() && interaction.customId === 'ticket_delete') {
    const ch = interaction.channel;
    if (!ch.name.startsWith('ticket-')) return;

    await interaction.reply({ content: '🗂️ Generating transcript...', ephemeral: true });
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

process.on('unhandledRejection', err => console.error(err));
client.login(process.env.DISCORD_TOKEN);
