// FINAL DISCORD BOT CODE — Full Version with Ticket + Application System + Close Button + Fixed Trigger
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
  ChannelType,
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
const DATA_FILE = './data.json';
const TICKET_FILE = './ticket_data.json';

let questions = [];
let options = [];
let logChannelId = '';
let ticketSetup = new Map();
const userStates = new Map();
const userLastApplied = new Map();

if (fs.existsSync(DATA_FILE)) {
  const saved = JSON.parse(fs.readFileSync(DATA_FILE));
  questions = saved.questions || [];
  options = saved.options || [];
  logChannelId = saved.logChannelId || '';
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

function getSetup(guildId) {
  if (!ticketSetup.has(guildId)) {
    ticketSetup.set(guildId, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
  }
  return ticketSetup.get(guildId);
}

const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');
const isAdminOrOwner = member => member?.permissions?.has('Administrator') || member?.id === OWNER_ID;

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;
  const uid = message.author.id;
  const content = message.content.trim();
  const lc = content.toLowerCase();
  if (!userStates.has(uid)) userStates.set(uid, {});
  const state = userStates.get(uid);

  const gameCmds = ['!guess', '!trivia', '!scramble', '!rps'];
  const generalCmds = ['!help'];
  const appTicketCmds = ['!addques', '!setoptions', '!setchannel', '!deploy', '!reset', '!ticket', '!option', '!resetticket', '!ticketviewer', '!ticketcategory', '!deployticketpanel', '!msg', '!dm'];
  const matchedGame = gameCmds.find(c => lc.startsWith(c));
  const matchedApp = appTicketCmds.find(c => lc.startsWith(c));
  const isGeneral = generalCmds.includes(lc);

  if (!matchedGame && !matchedApp && !isGeneral && !isAdminOrOwner(message.member)) {
    return message.reply('❌ Only admins or the bot owner can use this command.');
  }

  // HELP
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

  if (matchedApp && !isAdminOrOwner(message.member)) {
    return message.reply('❌ Only admins or the bot owner can use application/ticket setup commands.');
  }

  if (lc.startsWith('!ticket ')) {
    const setup = getSetup(message.guild.id);
    setup.description = content.slice(8);
    const att = message.attachments.first();
    if (att) setup.footerImage = att.url;
    saveTicketSetup();
    return message.reply('✅ Ticket message set.');
  }

  if (lc.startsWith('!option ')) {
    const setup = getSetup(message.guild.id);
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    setup.options.push({ emoji, label });
    saveTicketSetup();
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (lc === '!resetticket') {
    ticketSetup.set(message.guild.id, { description: '', options: [], viewerRoleId: null, categoryId: null, footerImage: null });
    saveTicketSetup();
    return message.reply('♻️ Ticket setup reset.');
  }

  if (lc.startsWith('!ticketviewer')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid role.');
    setup.viewerRoleId = match[1];
    saveTicketSetup();
    return message.reply('✅ Viewer role set.');
  }

  if (lc.startsWith('!ticketcategory')) {
    const setup = getSetup(message.guild.id);
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Mention a valid channel.');
    const ch = message.guild.channels.cache.get(match[1]);
    if (!ch?.parentId) return message.reply('❌ Channel has no category.');
    setup.categoryId = ch.parentId;
    saveTicketSetup();
    return message.reply(`✅ Category set.`);
  }

  if (lc === '!deployticketpanel') {
    const setup = getSetup(message.guild.id);
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId)
      return message.reply('❌ Setup incomplete.');

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');
    if (setup.footerImage) embed.setImage(setup.footerImage);

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_select')
      .setPlaceholder('Select ticket category')
      .addOptions(setup.options.map((opt, i) => ({
        label: opt.label, value: `ticket_${i}`, emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    return message.channel.send({ embeds: [embed], components: [row] });
  }

  if (lc.startsWith('!addques')) {
    const q = content.slice(9);
    questions.push(q);
    saveApp();
    message.reply(`✅ Question added: ${q}`);
  }

  if (lc.startsWith('!setoptions')) {
    options = content.slice(12).split(',').map(o => {
      const [label, days] = o.split('|');
      return { label, value: label.toLowerCase().replace(/\s+/g, '_'), cooldown: parseInt(days) || 14 };
    });
    saveApp();
    message.reply('✅ Options set.');
  }

  if (lc.startsWith('!setchannel')) {
    const ch = message.mentions.channels.first();
    if (!ch) return message.reply('❌ Mention a valid channel.');
    logChannelId = ch.id;
    saveApp();
    message.reply('✅ Log channel set.');
  }

  if (lc === '!deploy') {
    if (!options.length) return message.reply('❌ No application options set.');
    const menu = new StringSelectMenuBuilder()
      .setCustomId('app_select')
      .setPlaceholder('Select an option')
      .addOptions(options.map(o => ({ label: o.label, value: o.value })));
    const row = new ActionRowBuilder().addComponents(menu);
    message.channel.send({ content: '📥 Click below to apply!', components: [row] });
  }

  if (lc === '!reset') {
    questions = [];
    options = [];
    logChannelId = '';
    saveApp();
    message.reply('♻️ Reset all questions and options.');
  }
});


client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  const user = interaction.user;
  const selected = interaction.values[0];

  if (interaction.customId === 'app_select') {
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
    await interaction.reply({ content: '📩 Check your DMs.', ephemeral: true });

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

  if (interaction.customId?.startsWith('ticket_select')) {
    const guild = interaction.guild;
    const member = await guild.members.fetch(interaction.user.id);
    const setup = getSetup(guild.id);
    const index = parseInt(interaction.values[0].split('_')[1]);
    const opt = setup.options[index];

    const ticketName = `ticket-${interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '')}`;
    const existing = guild.channels.cache.find(c => c.name === ticketName);
    if (existing) return interaction.reply({ content: '❌ You already have an open ticket.', ephemeral: true });

    const ch = await guild.channels.create({
      name: ticketName,
      type: ChannelType.GuildText,
      parent: setup.categoryId,
      permissionOverwrites: [
        { id: guild.roles.everyone, deny: ['ViewChannel'] },
        { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages'] },
        { id: setup.viewerRoleId, allow: ['ViewChannel'] }
      ]
    });

    const closeBtn = new ButtonBuilder().setCustomId('close_ticket').setLabel('Close Ticket').setStyle(ButtonStyle.Danger);
    const row = new ActionRowBuilder().addComponents(closeBtn);

    await ch.send({
      content: `<@${interaction.user.id}> Your ticket for **${opt.label}** is created.`,
      components: [row]
    });

    await interaction.reply({ content: `✅ Ticket created: ${ch}`, ephemeral: true });
  }

  if (interaction.customId === 'close_ticket') {
    const ch = interaction.channel;
    if (!ch.name.startsWith('ticket-')) return;
    await interaction.reply({ content: '🛑 Closing this ticket.', ephemeral: true });
    setTimeout(() => ch.delete().catch(() => {}), 3000);
  }
});

client.login(process.env.DISCORD_TOKEN);
