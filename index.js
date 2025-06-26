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

let logChannelId = null;
const ticketSetup = {
  description: '',
  options: [],
  viewerRoleId: null,
  categoryId: null
};

const appQuestions = [];
const appOptions = [];
const userLastApplied = new Map();
const activeApplications = new Map();

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const content = message.content.trim();
  const lc = content.toLowerCase();

  if (lc === '!help') {
    return message.channel.send({ embeds: [
      new EmbedBuilder()
        .setTitle('📘 Bot Commands')
        .setColor('Blue')
        .setDescription(`🎮 **Mini‑Games**
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
\`!ticketviewer @role\` — Set viewer role for tickets
\`!ticketcategory #channel\` — Set category for tickets
\`!deployticketpanel\` — Deploy ticket menu
\`!resetticket\` — Reset ticket setup`)
    ] });
  }

  if (lc.startsWith('!addques ')) {
    const q = content.slice(9).trim();
    if (q) appQuestions.push(q);
    return message.reply('✅ Question added.');
  }

  if (lc.startsWith('!setoptions ')) {
    const raw = content.slice(12).trim();
    appOptions.length = 0;
    raw.split(',').forEach(str => {
      const [label, days] = str.split('|').map(s => s.trim());
      appOptions.push({ label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(days) || 7 });
    });
    return message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (ch) logChannelId = ch.id;
    return message.reply('✅ Log channel set.');
  }

  if (lc === '!reset') {
    appOptions.length = 0;
    appQuestions.length = 0;
    logChannelId = null;
    return message.reply('🔄 Application data reset.');
  }

  if (lc === '!resetticket') {
    ticketSetup.description = '';
    ticketSetup.options = [];
    ticketSetup.viewerRoleId = null;
    ticketSetup.categoryId = null;
    return message.reply('🎟️ Ticket settings reset.');
  }

  if (lc.startsWith('!ticket ')) {
    ticketSetup.description = content.slice(8).trim();
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (emoji && label) ticketSetup.options.push({ emoji, label });
    return message.reply('✅ Ticket option added.');
  }

  if (lc.startsWith('!ticketviewer')) {
    const match = content.match(/<@&(\d+)>/);
    if (match) ticketSetup.viewerRoleId = match[1];
    return message.reply('✅ Ticket viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const match = content.match(/<#(\d+)>/);
    if (match) ticketSetup.categoryId = match[1];
    return message.reply('✅ Ticket category set.');
  }

  if (lc === '!deployticketpanel') {
    if (!ticketSetup.description || !ticketSetup.options.length) {
      return message.reply('❌ Ticket setup incomplete.');
    }
    const embed = new EmbedBuilder()
      .setTitle('🎟️ Open a Ticket')
      .setDescription(ticketSetup.description)
      .setColor('Blue');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Choose ticket category')
      .addOptions(ticketSetup.options.map((opt, i) => ({
        label: opt.label,
        value: `ticket_${i}`,
        emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ embeds: [embed], components: [row] });
  }

  if (lc === '!deploy') {
    if (!appOptions.length) return message.reply('⚠️ Use `!setoptions` first.');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .setPlaceholder('Choose a role to apply')
      .addOptions(appOptions.map(opt => ({ label: opt.label, value: opt.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ content: '📥 Choose a role:', components: [row] });
  }
});

client.on(Events.InteractionCreate, async interaction => {
  if (interaction.customId === 'ticket_select') {
    const { guild, user } = interaction;
    const index = parseInt(interaction.values[0].split('_')[1]);
    const label = ticketSetup.options[index]?.label || 'ticket';
    const exists = guild.channels.cache.find(ch => ch.name === `ticket-${user.username.toLowerCase()}`);
    if (exists) return interaction.reply({ content: '❗ You already have a ticket.', ephemeral: true });

    const ch = await guild.channels.create({
      name: `ticket-${user.username.toLowerCase()}`,
      type: ChannelType.GuildText,
      parent: ticketSetup.categoryId || null,
      permissionOverwrites: [
        { id: guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
        { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
        ...(ticketSetup.viewerRoleId ? [{ id: ticketSetup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel] }] : [])
      ]
    });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger)
    );

    await ch.send({ content: `🎫 Ticket for <@${user.id}> — **${label}**`, components: [row] });
    return interaction.reply({ content: `✅ Ticket created: ${ch}`, ephemeral: true });
  }

  if (interaction.customId === 'close_ticket') {
    const ch = interaction.channel;
    await interaction.reply({ content: '🗂️ Creating transcript...', ephemeral: true });
    const msgs = await ch.messages.fetch({ limit: 100 });
    const content = [...msgs.values()].reverse().map(m => `${m.author.tag}: ${m.content}`).join('\n');
    const file = Buffer.from(content, 'utf-8');
    await interaction.user.send({ content: '📁 Your ticket transcript:', files: [{ attachment: file, name: 'transcript.txt' }] }).catch(() => {});
    setTimeout(() => ch.delete().catch(() => {}), 3000);
  }

  if (interaction.customId === 'app_select') {
    const user = interaction.user;
    const selected = interaction.values[0];
    const opt = appOptions.find(o => o.value === selected);
    if (!opt) return interaction.reply({ content: '❌ Invalid option.', ephemeral: true });

    const now = Date.now();
    const key = `${user.id}_${opt.value}`;
    const last = userLastApplied.get(key);
    const cooldown = opt.cooldown * 24 * 60 * 60 * 1000;
    if (last && now - last < cooldown) {
      const rem = cooldown - (now - last);
      const days = Math.ceil(rem / (24 * 60 * 60 * 1000));
      return interaction.reply({ content: `⏳ Wait **${days}** day(s) to reapply.`, ephemeral: true });
    }

    userLastApplied.set(key, now);
    await interaction.reply({ content: '📩 Check DMs to apply!', ephemeral: true });
    const dm = await user.createDM();

    let i = 0;
    const answers = [];
    const ask = async () => {
      if (i >= appQuestions.length) {
        await dm.send({ embeds: [
          new EmbedBuilder().setTitle('✅ Done').setDescription(`Applied for **${opt.label}**.`)
        ] });
        if (logChannelId) {
          const ch = await client.channels.fetch(logChannelId);
          const summary = answers.map((a, j) => `**Q${j + 1}:** ${appQuestions[j]}\n**A:** ${a}`).join('\n\n');
          ch.send(`📨 App from **${user.tag}** — **${opt.label}**\n\n${summary}`);
        }
        return;
      }
      await dm.send({ embeds: [
        new EmbedBuilder().setTitle(`📋 Question ${i + 1}/${appQuestions.length}`).setDescription(appQuestions[i])
      ] });
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
