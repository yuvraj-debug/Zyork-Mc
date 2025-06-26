// FINAL PUBLIC DISCORD BOT — TICKETS + APPLICATIONS + TRANSCRIPTS — USING .env
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
  ChannelType,
  Events,
  PermissionsBitField
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

const ticketSetup = {
  description: 'Select a category to open a ticket.',
  options: [],
  viewerRoleId: null,
  categoryId: null
};

let ticketLogChannel = null;
let applicationLogChannel = null;

const appQuestions = [];
const appOptions = [];
const userLastApplied = new Map();
const userStates = new Map();
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const lc = content.toLowerCase();

  const uid = message.author.id;
  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  if (lc === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('📘 Bot Commands')
      .setColor('Blue')
      .setDescription(`
🎮 **Mini‑Games**
\`!guess <number>\` — Guess the number
\`!trivia\` — Trivia game
\`!scramble\` — Unscramble word

📝 **Applications**
\`!addques <question>\` — Add application question
\`!setoptions Option|Cooldown,...\` — Set options with cooldown
\`!setchannel #channel\` — Set log channel
\`!deploy\` — Deploy application menu
\`!reset\` — Reset application data

🎟️ **Tickets**
\`!ticket <message>\` — Set ticket panel message
\`!option <emoji> <label>\` — Add ticket option
\`!ticketviewer @role\` — Set viewer role
\`!ticketcategory #channel\` — Set ticket category
\`!deployticketpanel\` — Deploy ticket menu
\`!resetticket\` — Reset ticket setup
      `);
    return message.channel.send({ embeds: [embed] });
  }

  // === Applications ===
  if (lc.startsWith('!addques')) {
    const q = content.slice(8).trim();
    if (q) appQuestions.push(q);
    return message.reply('✅ Question added.');
  }

  if (lc.startsWith('!setoptions')) {
    const raw = content.slice(12).trim();
    const parsed = raw.split(',').map(p => {
      const [label, cooldown] = p.split('|').map(x => x.trim());
      return { label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(cooldown || '7') };
    });
    appOptions.length = 0;
    appOptions.push(...parsed);
    return message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    applicationLogChannel = ch.id;
    return message.reply('✅ Log channel set.');
  }

  if (lc === '!reset') {
    appQuestions.length = 0;
    appOptions.length = 0;
    applicationLogChannel = null;
    return message.reply('✅ Application system reset.');
  }

  if (lc === '!deploy') {
    if (!appOptions.length) return message.reply('❌ Set options first.');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .setPlaceholder('Choose a role to apply for')
      .addOptions(appOptions.map(opt => ({ label: opt.label, value: opt.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ content: '📥 Choose a role to apply:', components: [row] });
  }

  // === Tickets ===
  if (lc.startsWith('!ticket ')) {
    ticketSetup.description = content.slice(8).trim();
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (emoji && label) ticketSetup.options.push({ emoji, label });
    return message.reply('✅ Option added.');
  }

  if (lc.startsWith('!ticketviewer')) {
    const match = content.match(/<@&(\d+)>/);
    if (match) ticketSetup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid channel.');
    const ch = message.guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply('❌ Channel has no category.');
    ticketSetup.categoryId = ch.parentId;
    return message.reply('✅ Ticket category set.');
  }

  if (lc === '!resetticket') {
    ticketSetup.description = '';
    ticketSetup.options = [];
    ticketSetup.viewerRoleId = null;
    ticketSetup.categoryId = null;
    return message.reply('✅ Ticket system reset.');
  }

  if (lc === '!deployticketpanel') {
    if (!ticketSetup.description || !ticketSetup.options.length) return message.reply('❌ Incomplete ticket setup.');
    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(ticketSetup.description)
      .setColor('Blue');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select a category')
      .addOptions(ticketSetup.options.map((opt, i) => ({
        label: opt.label,
        value: `ticket_${i}`,
        emoji: opt.emoji
      })));
    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ embeds: [embed], components: [row] });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.customId === 'ticket_select') {
    const { guild, user } = interaction;
    const index = parseInt(interaction.values[0].split('_')[1]);
    const opt = ticketSetup.options[index];
    if (!opt) return interaction.reply({ content: '❌ Option invalid.', ephemeral: true });

    const existing = guild.channels.cache.find(c => c.name.startsWith(`ticket-${user.username.toLowerCase()}`));
    if (existing) {
      return interaction.reply({ content: `⚠️ You already have a ticket: <#${existing.id}>`, ephemeral: true });
    }

    const ch = await guild.channels.create({
      name: `ticket-${user.username}`,
      type: ChannelType.GuildText,
      parent: ticketSetup.categoryId,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        { id: ticketSetup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
      ]
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('ticket_delete').setLabel('Delete Ticket').setStyle(ButtonStyle.Danger)
    );

    await ch.send({ content: `🎫 Ticket opened by <@${user.id}>`, components: [row] });
    return interaction.reply({ content: `✅ Ticket opened: <#${ch.id}>`, ephemeral: true });
  }

  if (interaction.customId === 'ticket_delete') {
    const ch = interaction.channel;
    const messages = await ch.messages.fetch({ limit: 100 });
    const transcript = [...messages.values()].reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
    await interaction.user.send({ content: '🗂️ Your ticket transcript:', files: [{ attachment: Buffer.from(transcript), name: 'transcript.txt' }] }).catch(() => {});
    await ch.delete().catch(() => {});
  }

  if (interaction.customId === 'app_select') {
    const user = interaction.user;
    const selected = interaction.values[0];
    const option = appOptions.find(o => o.value === selected);
    if (!option) return interaction.reply({ content: '❌ Option not found.', ephemeral: true });

    const now = Date.now();
    const key = `${user.id}_${option.value}`;
    const last = userLastApplied.get(key);
    const cooldown = option.cooldown * 86400000;
    if (last && now - last < cooldown) {
      const days = Math.ceil((cooldown - (now - last)) / 86400000);
      return interaction.reply({ content: `⏳ Please wait ${days} day(s) before reapplying.`, ephemeral: true });
    }
    userLastApplied.set(key, now);
    await interaction.reply({ content: '📩 Check your DMs.', ephemeral: true });

    const dm = await user.createDM();
    let i = 0;
    const answers = [];

    const ask = async () => {
      if (i >= appQuestions.length) {
        await dm.send({ embeds: [new EmbedBuilder().setTitle('✅ Application Complete').setDescription(`Thank you for applying for **${option.label}**.`)] });
        if (applicationLogChannel) {
          const ch = await client.channels.fetch(applicationLogChannel);
          const result = answers.map((a, idx) => `**Q${idx + 1}:** ${appQuestions[idx]}\n**A:** ${a}`).join('\n\n');
          ch.send({ embeds: [new EmbedBuilder().setTitle(`📝 Application from ${user.tag}`).setDescription(result)] });
        }
        return;
      }
      await dm.send({ embeds: [new EmbedBuilder().setTitle(`❓ Question ${i + 1} of ${appQuestions.length}`).setDescription(appQuestions[i])] });
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

client.login(process.env.DISCORD_TOKEN);
