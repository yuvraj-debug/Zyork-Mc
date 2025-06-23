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
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

const ticketSetup = new Map();

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
♻️ \`!resetticket\` — Reset ticket setup  
🎭 \`!ticketviewer @role\` — Set viewer role  
📂 \`!ticketcategory #channel\` — Set ticket category  
🚀 \`!deployticketpanel\` — Deploy panel

🎮 **Mini‑Games**
🎯 \`!guess <number>\` — Guess a number  
🧠 \`!trivia\` — Trivia  
🔤 \`!scramble\` — Unscramble  
📄 \`!rps <rock|paper|scissors>\` — RPS game

📬 **Messaging**
💬 \`!msg <message>\` — Bot sends a message  
📨 \`!dm @role <message>\` — DM all users with role`);
  }

  // === !resetticket
  if (lc === '!resetticket') {
    ticketSetup.set(guildId, {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null,
      footerImage: null
    });
    return message.reply('♻️ Ticket setup has been reset.');
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
});

client.on('interactionCreate', async interaction => {
  const setup = ticketSetup.get(interaction.guild?.id);
  if (!setup?.options.length || !setup.viewerRoleId || !setup.categoryId) return;

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
      type: 0,
      parent: setup.categoryId,
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
