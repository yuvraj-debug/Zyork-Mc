// ===== index.js — PART 1: Basic Setup + Fire Help Panel =====
require('dotenv').config();
const keepAlive = require('./keep_alive');
keepAlive();
// Start the keep-alive server
keepAlive();

const { QuickDB } = require('quick.db');
const db = new QuickDB();

const { 
  Client, GatewayIntentBits, Partials, Collection, 
  EmbedBuilder, ButtonBuilder, ButtonStyle, ActionRowBuilder, 
  Events, REST, Routes, StringSelectMenuBuilder 
} = require('discord.js');
require('dotenv').config();
const { keepAlive } = require('./keep_alive');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildVoiceStates,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Message, Partials.Channel, Partials.User]
});

const prefix = '!';
const ownerId = 'your_discord_id_here'; // 👈 Replace with your Discord ID

// Fire UI Help Categories
const helpCategories = {
  ticket: {
    emoji: '🎟️',
    title: 'Ticket System',
    commands: [
      '`/ticket msg` / `!ticket msg`',
      '`/setoptions` / `!setoptions`',
      '`/deployticketpanel` / `!deployticketpanel`',
      '`/setviewer` / `!setviewer`',
      '`/setticketcategory` / `!setticketcategory`'
    ]
  },
  application: {
    emoji: '📋',
    title: 'Application System',
    commands: [
      '`/app msg` / `!app msg`',
      '`/addoptions` / `!addoptions`',
      '`/deployapp` / `!deployapp`',
      '`/ques1`–`/ques5` / `!ques1`–`!ques5`'
    ]
  },
  moderation: {
    emoji: '⚠️',
    title: 'Moderation',
    commands: [
      '`/warn` / `!warn`',
      '`/warnings` / `!warnings`',
      '`/warnlimit` / `!warnlimit`'
    ]
  },
  games: {
    emoji: '🎮',
    title: 'Mini-Games',
    commands: [
      '`/rps` / `!rps`',
      '`/guess` / `!guess`',
      '`/math` / `!math`',
      '`/trivia` / `!trivia`',
      '`/type` / `!type`'
    ]
  },
  economy: {
    emoji: '💰',
    title: 'Economy',
    commands: [
      '`/bal`, `/cf`, `/daily`, `/hunt` etc.',
      '`!bal`, `!cf`, `!daily`, `!hunt`, `!deposit`, `!withdraw`',
      '`!rob`, `!give`, `!profile`, `!shop`'
    ]
  },
  music: {
    emoji: '🎶',
    title: 'Music',
    commands: [
      '`/play`, `/pause`, `/resume`, `/queue`, `/volume`',
      '`!play`, `!skip`, `!nowplaying`, `!randomsong`, `!phonk`, etc.'
    ]
  },
  utility: {
    emoji: 'ℹ️',
    title: 'Utilities',
    commands: [
      '`/userinfo`, `/serverinfo`, `/ping`, `/embed`, `/dm`',
      '`!userinfo`, `!serverinfo`, `!embed`, `!dm`'
    ]
  }
};

// /help with dropdown
client.on(Events.InteractionCreate, async interaction => {
  if (interaction.isChatInputCommand() && interaction.commandName === 'help') {
    const select = new StringSelectMenuBuilder()
      .setCustomId('help-select')
      .setPlaceholder('📂 Choose a command category')
      .addOptions(
        Object.entries(helpCategories).map(([key, cat]) => ({
          label: cat.title,
          value: key,
          description: `View ${cat.title} commands`,
          emoji: cat.emoji
        }))
      );

    const row = new ActionRowBuilder().addComponents(select);

    await interaction.reply({
      content: '**📖 Select a category to view commands**',
      components: [row],
      ephemeral: true
    });
  }

  if (interaction.isStringSelectMenu() && interaction.customId === 'help-select') {
    const selected = interaction.values[0];
    const cat = helpCategories[selected];
    const embed = new EmbedBuilder()
      .setTitle(`${cat.emoji} ${cat.title} Commands`)
      .setDescription(cat.commands.join('\n'))
      .setColor('#ff006a')
      .setFooter({ text: 'ZyroBot Help Panel 🔥', iconURL: client.user.displayAvatarURL() });

    await interaction.update({ embeds: [embed], components: [] });
  }
});

// !help fallback
client.on('messageCreate', async message => {
  if (message.content === `${prefix}help`) {
    const embed = new EmbedBuilder()
      .setTitle('📖 Use `/help` to view categorized dropdown help menu!')
      .setColor('#ff9900')
      .setFooter({ text: 'ZyroBot Help 🔥', iconURL: client.user.displayAvatarURL() });

    message.reply({ embeds: [embed] });
  }
});

// Bot online
client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

keepAlive();
client.login(process.env.TOKEN);
// ====== index.js — PART 2: TICKET SYSTEM ======

// Deploy ticket panel: !deployticketpanel
client.on('messageCreate', async (msg) => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const [cmd] = msg.content.slice(prefix.length).trim().split(/ +/g);
  if (cmd === 'deployticketpanel') {
    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket-dropdown')
      .setPlaceholder('🎫 Select a ticket category')
      .addOptions([
        { label: 'General Support', value: 'general', emoji: '💬' },
        { label: 'Technical Help', value: 'tech', emoji: '🛠️' },
        { label: 'Report', value: 'report', emoji: '⚠️' }
      ]);

    const row = new ActionRowBuilder().addComponents(menu);
    const embed = new EmbedBuilder()
      .setTitle('🎟️ ZyroBot Ticket Panel')
      .setDescription('Select a reason to open a ticket. A private channel will be created.')
      .setColor('#00ff99');

    msg.channel.send({ embeds: [embed], components: [row] });
  }
});

// Handle dropdown to create ticket channel
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'ticket-dropdown') return;

  const reason = interaction.values[0];
  const username = interaction.user.username.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ticketName = `ticket-${username}-${reason}`;
  const existing = interaction.guild.channels.cache.find(c => c.name === ticketName);

  if (existing) {
    return interaction.reply({ content: '🚫 You already have a ticket open!', ephemeral: true });
  }

  const categoryId = 'YOUR_CATEGORY_ID_HERE'; // Replace with your ticket category ID

  const ticketChannel = await interaction.guild.channels.create({
    name: ticketName,
    type: 0,
    parent: categoryId,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'AttachFiles'] }
    ]
  });

  const embed = new EmbedBuilder()
    .setTitle('🎫 Ticket Opened')
    .setDescription(`Hello <@${interaction.user.id}>, a team member will assist you soon.\n\n**Reason:** ${reason}`)
    .setColor('#00ccff');

  const buttons = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('🛄 Claim').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('lock_ticket').setLabel('🔒 Lock').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('close_ticket').setLabel('✅ Close').setStyle(ButtonStyle.Danger),
    new ButtonBuilder().setCustomId('transcript_ticket').setLabel('📄 Transcript').setStyle(ButtonStyle.Success)
  );

  await ticketChannel.send({ content: `<@${interaction.user.id}>`, embeds: [embed], components: [buttons] });
  await interaction.reply({ content: `✅ Ticket opened: ${ticketChannel}`, ephemeral: true });
});

// Handle ticket buttons
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isButton()) return;

  const channel = interaction.channel;

  if (interaction.customId === 'claim_ticket') {
    await interaction.reply({ content: `🛄 Ticket claimed by <@${interaction.user.id}>`, ephemeral: false });
  }

  if (interaction.customId === 'lock_ticket') {
    await channel.permissionOverwrites.edit(channel.guild.roles.everyone, { SendMessages: false });
    await interaction.reply({ content: '🔒 Ticket locked.', ephemeral: false });
  }

  if (interaction.customId === 'close_ticket') {
    await interaction.reply({ content: '✅ Closing ticket in 5 seconds...', ephemeral: false });
    setTimeout(async () => {
      await channel.delete().catch(console.error);
    }, 5000);
  }

  if (interaction.customId === 'transcript_ticket') {
    await interaction.reply({ content: '📄 Transcript saved. (Simulated)', ephemeral: true });
    // TODO: Add real transcript logic in future part
  }
});
// ====== index.js — PART 3: APPLICATION SYSTEM ======

// Temporary app config (can later be stored per-guild)
let appMessage = '📋 Apply for roles below!';
let appRoles = [
  { label: 'Helper', value: 'helper', emoji: '🛡️' },
  { label: 'Builder', value: 'builder', emoji: '🏗️' }
];
let applicationChannelID = 'YOUR_CHANNEL_ID_HERE'; // Replace with your log channel

const questions = [
  'What is your name?',
  'How old are you?',
  'Why do you want this role?',
  'What skills do you bring?',
  'How much time can you dedicate?'
];

// !deployapp - sends role-based application panel
client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const [cmd] = msg.content.slice(prefix.length).trim().split(/ +/g);

  if (cmd === 'deployapp') {
    const buttons = new ActionRowBuilder().addComponents(
      appRoles.map(opt =>
        new ButtonBuilder()
          .setCustomId(`apply_${opt.value}`)
          .setLabel(opt.label)
          .setEmoji(opt.emoji)
          .setStyle(ButtonStyle.Primary)
      )
    );

    const embed = new EmbedBuilder()
      .setTitle('📋 ZyroBot Applications')
      .setDescription(appMessage)
      .setColor('#ffaa00');

    msg.channel.send({ embeds: [embed], components: [buttons] });
  }
});

// Handle role button click → start application DM
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('apply_')) return;

  const role = interaction.customId.split('apply_')[1];

  await interaction.reply({ content: '📩 Check your DMs to start the application!', ephemeral: true });

  const user = interaction.user;
  let answers = [];

  try {
    await user.send(`📋 **Application for ${role.toUpperCase()}**`);

    for (let i = 0; i < questions.length; i++) {
      await user.send(`❓ **Q${i + 1}: ${questions[i]}**`);
      const collected = await user.dmChannel.awaitMessages({
        filter: m => m.author.id === user.id,
        max: 1,
        time: 120000
      });
      const answer = collected.first()?.content;
      if (!answer) throw 'timeout';
      answers.push(`**Q${i + 1}:** ${questions[i]}\n➡️ ${answer}`);
    }

    const embed = new EmbedBuilder()
      .setTitle(`📨 New Application - ${user.tag}`)
      .setDescription(answers.join('\n\n'))
      .addFields({ name: 'Role', value: role })
      .setColor('#00ccff')
      .setFooter({ text: 'ZyroBot Applications', iconURL: client.user.displayAvatarURL() });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`accept_${user.id}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`reject_${user.id}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger)
    );

    const channel = await client.channels.fetch(applicationChannelID);
    channel.send({ embeds: [embed], components: [row] });

    await user.send('✅ Application submitted successfully! We will contact you soon.');
  } catch (err) {
    await user.send('❌ Application cancelled or timed out.');
  }
});

// Accept/Reject buttons
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const [action, userId] = interaction.customId.split('_');
  if (!['accept', 'reject'].includes(action)) return;

  const target = await client.users.fetch(userId).catch(() => null);
  if (!target) return interaction.reply({ content: 'User not found.', ephemeral: true });

  if (action === 'accept') {
    await target.send('🎉 You have been **ACCEPTED**! Welcome to the team!');
    await interaction.reply({ content: `✅ Accepted <@${userId}>`, ephemeral: false });
  } else if (action === 'reject') {
    await target.send('😢 Sorry, your application was **REJECTED**.');
    await interaction.reply({ content: `❌ Rejected <@${userId}>`, ephemeral: false });
  }
});
// ====== index.js — PART 3.1: APPLICATION CONFIG COMMANDS ======

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // !app msg <message>
  if (command === 'app' && args[0] === 'msg') {
    const newMsg = args.slice(1).join(' ');
    if (!newMsg) return msg.reply('❌ Please provide a message.');
    appMessage = newMsg;
    msg.reply('✅ Application panel message updated.');
  }

  // !addoptions Role:🛡️, Staff:👑
  if (command === 'addoptions') {
    const raw = args.join(' ');
    if (!raw.includes(':')) return msg.reply('❌ Use format: Role:🛡️, Staff:👑');

    const parsed = raw.split(',').map(entry => {
      const [label, emoji] = entry.trim().split(':');
      return { label: label.trim(), value: label.toLowerCase().replace(/ /g, '_'), emoji: emoji.trim() };
    });

    appRoles.push(...parsed);
    msg.reply(`✅ Added ${parsed.length} role button(s) to the application panel.`);
  }

  // !setappchannel <channelID>
  if (command === 'setappchannel') {
    const id = args[0];
    const channel = msg.guild.channels.cache.get(id);
    if (!channel) return msg.reply('❌ Invalid channel ID.');
    applicationChannelID = id;
    msg.reply(`✅ Application logs will now go to <#${id}>`);
  }

  // !ques1 <question>
  for (let i = 1; i <= 5; i++) {
    if (command === `ques${i}`) {
      const newQ = args.join(' ');
      if (!newQ) return msg.reply(`❌ Provide a new question for Q${i}`);
      questions[i - 1] = newQ;
      msg.reply(`✅ Updated Question ${i}: ${newQ}`);
    }
  }
});
// ====== index.js — PART 4: MODERATION SYSTEM ======

// Temporary in-memory warning tracker
const userWarnings = new Map();
let warnLimit = 3; // Default

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // !warn @user [reason]
  if (command === 'warn') {
    const user = msg.mentions.members.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!user) return msg.reply('❌ Mention a user to warn.');

    const count = (userWarnings.get(user.id) || 0) + 1;
    userWarnings.set(user.id, count);

    const embed = new EmbedBuilder()
      .setTitle('⚠️ User Warned')
      .addFields(
        { name: 'User', value: `<@${user.id}>`, inline: true },
        { name: 'Warned By', value: `<@${msg.author.id}>`, inline: true },
        { name: 'Reason', value: reason },
        { name: 'Total Warnings', value: `${count}/${warnLimit}` }
      )
      .setColor('#ff4444');

    msg.channel.send({ embeds: [embed] });

    // Auto-kick logic
    if (count >= warnLimit) {
      try {
        await user.kick(`Exceeded ${warnLimit} warnings.`);
        msg.channel.send(`👢 <@${user.id}> was auto-kicked for reaching the warning limit.`);
        userWarnings.delete(user.id);
      } catch (err) {
        msg.channel.send('❌ Failed to kick the user. Check bot permissions.');
      }
    }
  }

  // !warnings @user
  if (command === 'warnings') {
    const user = msg.mentions.members.first();
    if (!user) return msg.reply('❌ Mention a user to check warnings.');
    const count = userWarnings.get(user.id) || 0;
    msg.reply(`⚠️ <@${user.id}> has **${count}** warning(s).`);
  }

  // !warnlimit 5
  if (command === 'warnlimit') {
    const num = parseInt(args[0]);
    if (isNaN(num) || num < 1) return msg.reply('❌ Provide a valid number.');
    warnLimit = num;
    msg.reply(`✅ Warn limit set to **${warnLimit}**`);
  }
});
// ====== index.js — PART 5: ECONOMY SYSTEM ======

// Temporary in-memory user balances
const ecoData = new Map();

function getUserData(userId) {
  if (!ecoData.has(userId)) {
    ecoData.set(userId, { wallet: 500, bank: 0 }); // Start with 500
  }
  return ecoData.get(userId);
}

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;

  const args = msg.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift()?.toLowerCase();
  const userId = msg.author.id;
  const userEco = getUserData(userId);

  // !bal
  if (command === 'bal') {
    const embed = new EmbedBuilder()
      .setTitle(`💰 ${msg.author.username}'s Balance`)
      .addFields(
        { name: 'Wallet', value: `🪙 ${userEco.wallet}`, inline: true },
        { name: 'Bank', value: `🏦 ${userEco.bank}`, inline: true }
      )
      .setColor('#00ffaa')
      .setThumbnail(msg.author.displayAvatarURL());

    msg.reply({ embeds: [embed] });
  }

  // !daily
  if (command === 'daily') {
    const bonus = Math.floor(Math.random() * 200) + 100;
    userEco.wallet += bonus;
    msg.reply(`📅 You claimed your daily bonus of **${bonus} coins!**`);
  }

  // !cf head 100
  if (command === 'cf') {
    const side = args[0];
    const amount = parseInt(args[1]);
    if (!['head', 'tails'].includes(side)) return msg.reply('🪙 Choose `head` or `tails`');
    if (isNaN(amount) || amount <= 0 || userEco.wallet < amount) return msg.reply('❌ Invalid or insufficient funds');

    const flip = Math.random() < 0.5 ? 'head' : 'tails';
    const won = flip === side;

    if (won) {
      userEco.wallet += amount;
      msg.reply(`🎉 Coin landed on **${flip}**! You won **${amount}** coins.`);
    } else {
      userEco.wallet -= amount;
      msg.reply(`💀 Coin landed on **${flip}**. You lost **${amount}** coins.`);
    }
  }

  // !deposit 200
  if (command === 'deposit') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt <= 0 || userEco.wallet < amt) return msg.reply('❌ Invalid amount');
    userEco.wallet -= amt;
    userEco.bank += amt;
    msg.reply(`🏦 Deposited **${amt}** coins to your bank.`);
  }

  // !withdraw 200
  if (command === 'withdraw') {
    const amt = parseInt(args[0]);
    if (isNaN(amt) || amt <= 0 || userEco.bank < amt) return msg.reply('❌ Invalid amount');
    userEco.bank -= amt;
    userEco.wallet += amt;
    msg.reply(`💸 Withdrew **${amt}** coins from your bank.`);
  }

  // !give @user 100
  if (command === 'give') {
    const target = msg.mentions.users.first();
    const amt = parseInt(args[1]);
    if (!target || isNaN(amt) || amt <= 0 || userEco.wallet < amt) return msg.reply('❌ Invalid usage.');
    const targetEco = getUserData(target.id);
    userEco.wallet -= amt;
    targetEco.wallet += amt;
    msg.reply(`🤝 Gave <@${target.id}> **${amt}** coins.`);
  }

  // !rob @user
  if (command === 'rob') {
    const target = msg.mentions.users.first();
    if (!target || target.id === msg.author.id) return msg.reply('❌ Choose another user.');
    const targetEco = getUserData(target.id);
    if (targetEco.wallet < 100) return msg.reply('❌ Target is too poor to rob!');

    const success = Math.random() < 0.5;
    const stolen = Math.floor(Math.random() * targetEco.wallet * 0.5);

    if (success) {
      userEco.wallet += stolen;
      targetEco.wallet -= stolen;
      msg.reply(`🕶️ You successfully robbed <@${target.id}> for **${stolen}** coins!`);
    } else {
      const loss = Math.floor(Math.random() * userEco.wallet * 0.5);
      userEco.wallet -= loss;
      msg.reply(`🚨 You got caught and lost **${loss}** coins!`);
    }
  }

  // !profile
  if (command === 'profile') {
    const embed = new EmbedBuilder()
      .setTitle(`📜 ${msg.author.username}'s Profile`)
      .setThumbnail(msg.author.displayAvatarURL())
      .setColor('#ffa500')
      .addFields(
        { name: 'Wallet', value: `${userEco.wallet}`, inline: true },
        { name: 'Bank', value: `${userEco.bank}`, inline: true },
        { name: 'Net Worth', value: `${userEco.wallet + userEco.bank}`, inline: true }
      );
    msg.reply({ embeds: [embed] });
  }
});
// ====== index.js — PART 6: MUSIC SYSTEM ======
const { joinVoiceChannel, createAudioPlayer, createAudioResource, AudioPlayerStatus, getVoiceConnection } = require('@discordjs/voice');
const play = require('play-dl');

const queueMap = new Map();

async function playSong(msg, song, guildId) {
  const queue = queueMap.get(guildId);
  if (!song) {
    msg.channel.send('✅ Queue finished.');
    queueMap.delete(guildId);
    return;
  }

  const stream = await play.stream(song.url);
  const resource = createAudioResource(stream.stream, {
    inputType: stream.type
  });

  queue.player.play(resource);
  queue.current = song;

  const embed = new EmbedBuilder()
    .setTitle(`🎶 Now Playing`)
    .setDescription(`[${song.title}](${song.url})`)
    .setColor('#1DB954')
    .setFooter({ text: `Requested by ${song.requestedBy.tag}`, iconURL: song.requestedBy.displayAvatarURL() });

  queue.textChannel.send({ embeds: [embed] });
}

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot || !msg.guild) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift()?.toLowerCase();

  if (command === 'play') {
    const query = args.join(' ');
    if (!query) return msg.reply('❌ Provide a song name or YouTube link.');

    const voiceChannel = msg.member.voice.channel;
    if (!voiceChannel) return msg.reply('❌ You must be in a voice channel.');

    let search = await play.search(query, { limit: 1 });
    if (!search.length) return msg.reply('❌ Song not found.');

    const song = {
      title: search[0].title,
      url: search[0].url,
      requestedBy: msg.author
    };

    let queue = queueMap.get(msg.guild.id);

    if (!queue) {
      const connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: msg.guild.id,
        adapterCreator: msg.guild.voiceAdapterCreator
      });

      const player = createAudioPlayer();
      connection.subscribe(player);

      queue = {
        connection,
        player,
        songs: [],
        textChannel: msg.channel,
        current: null
      };

      queueMap.set(msg.guild.id, queue);

      player.on(AudioPlayerStatus.Idle, () => {
        queue.songs.shift();
        playSong(msg, queue.songs[0], msg.guild.id);
      });
    }

    queue.songs.push(song);
    if (queue.songs.length === 1) {
      playSong(msg, song, msg.guild.id);
    } else {
      msg.reply(`✅ Added to queue: **${song.title}**`);
    }
  }

  if (command === 'skip') {
    const queue = queueMap.get(msg.guild.id);
    if (!queue) return msg.reply('❌ Nothing playing.');
    queue.player.stop();
    msg.reply('⏭️ Skipped!');
  }

  if (command === 'pause') {
    const queue = queueMap.get(msg.guild.id);
    if (!queue) return msg.reply('❌ Nothing to pause.');
    queue.player.pause();
    msg.reply('⏸️ Paused!');
  }

  if (command === 'resume') {
    const queue = queueMap.get(msg.guild.id);
    if (!queue) return msg.reply('❌ Nothing to resume.');
    queue.player.unpause();
    msg.reply('▶️ Resumed!');
  }

  if (command === 'stop') {
    const queue = queueMap.get(msg.guild.id);
    if (!queue) return msg.reply('❌ Nothing playing.');
    queue.songs = [];
    queue.player.stop();
    queue.connection.destroy();
    queueMap.delete(msg.guild.id);
    msg.reply('⏹️ Stopped and left the channel.');
  }

  if (command === 'queue') {
    const queue = queueMap.get(msg.guild.id);
    if (!queue || queue.songs.length === 0) return msg.reply('📭 Queue is empty.');
    const embed = new EmbedBuilder()
      .setTitle('📃 Music Queue')
      .setDescription(queue.songs.map((s, i) => `**${i + 1}.** [${s.title}](${s.url})`).join('\n'))
      .setColor('#7289da');
    msg.reply({ embeds: [embed] });
  }
});
// ====== index.js — PART 7: MINI-GAMES ======

const rpsChoices = ['🪨 Rock', '📄 Paper', '✂️ Scissors'];

// !rps @user
client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/g);
  const command = args.shift()?.toLowerCase();

  // Rock Paper Scissors Game
  if (command === 'rps') {
    const opponent = msg.mentions.users.first();
    if (!opponent || opponent.bot || opponent.id === msg.author.id)
      return msg.reply('❌ Mention a valid opponent.');

    const embed = new EmbedBuilder()
      .setTitle('🎮 Rock Paper Scissors')
      .setDescription(`<@${msg.author.id}> vs <@${opponent.id}>\nChoose your move:`)
      .setColor('#ff33cc');

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`rps_rock_${msg.author.id}_${opponent.id}`).setLabel('🪨 Rock').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rps_paper_${msg.author.id}_${opponent.id}`).setLabel('📄 Paper').setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`rps_scissors_${msg.author.id}_${opponent.id}`).setLabel('✂️ Scissors').setStyle(ButtonStyle.Primary)
    );

    msg.channel.send({ embeds: [embed], components: [row] });
  }

  // !guess
  if (command === 'guess') {
    const num = Math.floor(Math.random() * 10) + 1;
    msg.reply('🎯 I\'m thinking of a number from 1–10. Can you guess it? Type your guess!');

    const filter = m => m.author.id === msg.author.id;
    const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });
    const guess = parseInt(collected.first()?.content);

    if (guess === num) {
      msg.reply(`🎉 Correct! The number was ${num}.`);
    } else {
      msg.reply(`❌ Nope! It was **${num}**.`);
    }
  }

  // !math
  if (command === 'math') {
    const a = Math.floor(Math.random() * 20 + 1);
    const b = Math.floor(Math.random() * 20 + 1);
    const answer = a + b;

    msg.reply(`🧠 What's ${a} + ${b}?`);

    const filter = m => m.author.id === msg.author.id;
    const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });

    if (parseInt(collected.first()?.content) === answer) {
      msg.reply('✅ Correct!');
    } else {
      msg.reply(`❌ Wrong! The answer was **${answer}**`);
    }
  }

  // !trivia
  if (command === 'trivia') {
    const trivia = [
      { q: 'What is the capital of France?', a: 'paris' },
      { q: 'Who wrote Harry Potter?', a: 'jk rowling' },
      { q: 'How many legs does a spider have?', a: '8' }
    ];
    const t = trivia[Math.floor(Math.random() * trivia.length)];

    msg.reply(`🤔 Trivia Time:\n**${t.q}** (15s)`);

    const filter = m => m.author.id === msg.author.id;
    const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 15000 });
    const answer = collected.first()?.content.toLowerCase();

    if (answer === t.a) {
      msg.reply('🎉 Correct!');
    } else {
      msg.reply(`❌ Nope! The answer was **${t.a}**`);
    }
  }

  // !type
  if (command === 'type') {
    const sentences = [
      'The quick brown fox jumps over the lazy dog.',
      'Discord bots are very fun to make!',
      'JavaScript is a powerful language.',
      'Typing fast can save you time.'
    ];
    const sentence = sentences[Math.floor(Math.random() * sentences.length)];

    msg.reply(`⌨️ Type this as fast as you can:\n\`\`\`${sentence}\`\`\``);

    const start = Date.now();
    const filter = m => m.author.id === msg.author.id;
    const collected = await msg.channel.awaitMessages({ filter, max: 1, time: 30000 });

    if (collected.first()?.content === sentence) {
      const time = ((Date.now() - start) / 1000).toFixed(2);
      msg.reply(`⚡ Great! You typed it in **${time}s**.`);
    } else {
      msg.reply('❌ Incorrect typing or timeout.');
    }
  }
});

// RPS button logic
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isButton()) return;

  const [_, choice, user1, user2] = interaction.customId.split('_');
  if (![user1, user2].includes(interaction.user.id)) return interaction.reply({ content: 'Not your match!', ephemeral: true });

  const gameId = `${user1}_${user2}`;
  if (!global.rpsStore) global.rpsStore = {};
  if (!global.rpsStore[gameId]) global.rpsStore[gameId] = {};

  global.rpsStore[gameId][interaction.user.id] = choice;

  if (Object.keys(global.rpsStore[gameId]).length === 2) {
    const p1 = global.rpsStore[gameId][user1];
    const p2 = global.rpsStore[gameId][user2];
    let result = '';

    if (p1 === p2) result = 'It\'s a tie!';
    else if (
      (p1 === 'rock' && p2 === 'scissors') ||
      (p1 === 'scissors' && p2 === 'paper') ||
      (p1 === 'paper' && p2 === 'rock')
    ) result = `<@${user1}> wins!`;
    else result = `<@${user2}> wins!`;

    await interaction.channel.send({
      embeds: [
        new EmbedBuilder()
          .setTitle('🎮 RPS Result')
          .setDescription(`> <@${user1}> chose **${p1}**\n> <@${user2}> chose **${p2}**\n\n🎉 **${result}**`)
          .setColor('#33ff99')
      ]
    });

    delete global.rpsStore[gameId];
  } else {
    await interaction.reply({ content: `✅ Choice locked: **${choice}**. Waiting for opponent...`, ephemeral: true });
  }
});
// ====== index.js — PART 8: UTILITY COMMANDS ======

// Temporary memory for role with access to all bot features
let privilegedRole = null;

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;

  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // !userinfo @user
  if (command === 'userinfo') {
    const user = msg.mentions.users.first() || msg.author;
    const member = msg.guild.members.cache.get(user.id);

    const embed = new EmbedBuilder()
      .setTitle(`👤 User Info`)
      .setThumbnail(user.displayAvatarURL())
      .setColor('#00bfff')
      .addFields(
        { name: 'Username', value: `${user.tag}`, inline: true },
        { name: 'ID', value: `${user.id}`, inline: true },
        { name: 'Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
        { name: 'Created Account', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true }
      );
    msg.reply({ embeds: [embed] });
  }

  // !serverinfo
  if (command === 'serverinfo') {
    const { guild } = msg;
    const embed = new EmbedBuilder()
      .setTitle(`🌍 ${guild.name}`)
      .setThumbnail(guild.iconURL())
      .setColor('#ffcc00')
      .addFields(
        { name: 'Owner', value: `<@${guild.ownerId}>`, inline: true },
        { name: 'Members', value: `${guild.memberCount}`, inline: true },
        { name: 'Channels', value: `${guild.channels.cache.size}`, inline: true },
        { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>` }
      );
    msg.reply({ embeds: [embed] });
  }

  // !ping
  if (command === 'ping') {
    const ping = Date.now() - msg.createdTimestamp;
    msg.reply(`🏓 Pong! Latency: **${ping}ms**`);
  }

  // !embed #00ff00 Hello!
  if (command === 'embed') {
    const color = args.shift();
    const message = args.join(' ');
    if (!/^#[0-9A-F]{6}$/i.test(color)) return msg.reply('❌ Invalid color. Use format like `#ff0000`');
    if (!message) return msg.reply('❌ Provide a message to embed.');
    const embed = new EmbedBuilder().setDescription(message).setColor(color);
    msg.channel.send({ embeds: [embed] });
  }

  // !dm @role Your message here
  if (command === 'dm') {
    const role = msg.mentions.roles.first();
    const content = args.slice(1).join(' ');
    if (!role || !content) return msg.reply('❌ Usage: `!dm @role message`');

    let count = 0;
    for (const member of role.members.values()) {
      if (!member.user.bot) {
        try {
          const embed = new EmbedBuilder()
            .setTitle('📩 Message from Server')
            .setColor('#3399ff')
            .setDescription(content)
            .setFooter({ text: `${msg.guild.name}`, iconURL: msg.guild.iconURL() });
          await member.send({ embeds: [embed] });
          count++;
        } catch {}
      }
    }
    msg.reply(`✅ Sent message to **${count}** members in ${role.name}.`);
  }

  // !prems @role
  if (command === 'prems') {
    const role = msg.mentions.roles.first();
    if (!role) return msg.reply('❌ Mention a role to give full bot permissions.');
    privilegedRole = role.id;
    msg.reply(`🔐 <@&${role.id}> now has privileged access to all bot commands.`);
  }
});
// ====== index.js — PART 9: TICKET & APP PANEL SETUP ======

let ticketEmbedMsg = 'Need help? Choose a category below!';
let ticketOptions = [
  { label: 'Support', value: 'support', emoji: '🛠️' },
  { label: 'General', value: 'general', emoji: '💬' }
];
let ticketCategory = null;
let ticketViewerRole = null;

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // !ticket msg <message>
  if (command === 'ticket' && args[0] === 'msg') {
    ticketEmbedMsg = args.slice(1).join(' ');
    msg.reply('✅ Ticket panel message updated.');
  }

  // !setoptions general:💬, support:🛠️
  if (command === 'setoptions') {
    const raw = args.join(' ');
    if (!raw.includes(':')) return msg.reply('❌ Format: name:emoji, ...');
    ticketOptions = raw.split(',').map(opt => {
      const [label, emoji] = opt.trim().split(':');
      return {
        label: label.trim(),
        value: label.toLowerCase().replace(/ /g, '_'),
        emoji
      };
    });
    msg.reply('✅ Ticket dropdown options updated.');
  }

  // !setviewer @role
  if (command === 'setviewer') {
    const role = msg.mentions.roles.first();
    if (!role) return msg.reply('❌ Mention a role.');
    ticketViewerRole = role.id;
    msg.reply(`✅ Only <@&${role.id}> can view new tickets.`);
  }

  // !setticketcategory <id>
  if (command === 'setticketcategory') {
    const cat = args[0];
    if (!msg.guild.channels.cache.get(cat)) return msg.reply('❌ Invalid category ID.');
    ticketCategory = cat;
    msg.reply(`✅ Ticket category set to <#${cat}>`);
  }

  // !deployticketpanel
  if (command === 'deployticketpanel') {
    const embed = new EmbedBuilder()
      .setTitle('🎫 Open a Ticket')
      .setDescription(ticketEmbedMsg)
      .setColor('#0099ff');

    const dropdown = new StringSelectMenuBuilder()
      .setCustomId('ticket_dropdown')
      .setPlaceholder('Choose a category...')
      .addOptions(ticketOptions);

    const row = new ActionRowBuilder().addComponents(dropdown);
    msg.channel.send({ embeds: [embed], components: [row] });
    msg.reply('✅ Ticket panel deployed!');
  }

  // !deployapp
  if (command === 'deployapp') {
    const embed = new EmbedBuilder()
      .setTitle('📋 Apply for a Role')
      .setDescription(appMessage || 'Click a button below to apply!')
      .setColor('#00cc66');

    const buttons = appRoles.map(opt =>
      new ButtonBuilder()
        .setLabel(opt.label)
        .setCustomId(`app_button_${opt.value}`)
        .setEmoji(opt.emoji)
        .setStyle(ButtonStyle.Secondary)
    );

    const row = new ActionRowBuilder().addComponents(buttons);
    msg.channel.send({ embeds: [embed], components: [row] });
    msg.reply('✅ Application panel deployed!');
  }
});
// ====== index.js — PART 10: HELP COMMAND (🔥 FIRE DROPDOWN) ======

client.on('messageCreate', async msg => {
  if (msg.content.toLowerCase() === `${prefix}help`) {
    const embed = new EmbedBuilder()
      .setTitle('🤖 Bot Help Menu')
      .setDescription('Select a category below to see commands.')
      .setColor('#ff007f');

    const dropdown = new StringSelectMenuBuilder()
      .setCustomId('help_menu')
      .setPlaceholder('Select a command category')
      .addOptions(
        {
          label: '🎟️ Ticket System',
          value: 'ticket',
          description: 'Commands to manage ticket support',
          emoji: '🎟️'
        },
        {
          label: '📋 Application System',
          value: 'app',
          description: 'Handle role-based applications',
          emoji: '📋'
        },
        {
          label: '⚠️ Moderation',
          value: 'mod',
          description: 'Warns, limits, and moderation tools',
          emoji: '⚠️'
        },
        {
          label: '💰 Economy',
          value: 'eco',
          description: 'Owo-style coins, games, wallet system',
          emoji: '💰'
        },
        {
          label: '🎮 Mini-Games',
          value: 'games',
          description: 'Fun & quick games like rps, trivia',
          emoji: '🎮'
        },
        {
          label: '🎛️ Utilities',
          value: 'utils',
          description: 'Info, embed, dm tools and more',
          emoji: '🎛️'
        },
        {
          label: '🎶 Music',
          value: 'music',
          description: 'Play songs, skip, queue, etc.',
          emoji: '🎶'
        }
      );

    const row = new ActionRowBuilder().addComponents(dropdown);
    msg.channel.send({ embeds: [embed], components: [row] });
  }
});

// Dropdown Handler
client.on(Events.InteractionCreate, async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'help_menu') return;

  const value = interaction.values[0];
  let embed = new EmbedBuilder().setColor('#00ffee');

  if (value === 'ticket') {
    embed
      .setTitle('🎟️ Ticket Commands')
      .setDescription(
        `> \`!ticket msg <message>\` – Set panel embed\n> \`!setoptions general:💬, support:🛠️\`\n> \`!setviewer @role\`\n> \`!setticketcategory <id>\`\n> \`!deployticketpanel\``
      );
  } else if (value === 'app') {
    embed
      .setTitle('📋 Application Commands')
      .setDescription(
        `> \`!app msg <message>\`\n> \`!addoptions Role:🛡️\`\n> \`!setappchannel <id>\`\n> \`!deployapp\`\n> \`!ques1 <question>\``
      );
  } else if (value === 'mod') {
    embed
      .setTitle('⚠️ Moderation Commands')
      .setDescription(
        `> \`!warn @user [reason]\`\n> \`!warnings @user\`\n> \`!warnlimit <number>\``
      );
  } else if (value === 'eco') {
    embed
      .setTitle('💰 Economy Commands')
      .setDescription(
        `> \`!bal\`, \`!daily\`, \`!cf head 100\`\n> \`!deposit\`, \`!withdraw\`\n> \`!rob @user\`, \`!give @user\`\n> \`!profile\``
      );
  } else if (value === 'games') {
    embed
      .setTitle('🎮 Mini-Games Commands')
      .setDescription(
        `> \`!rps @user\`, \`!guess\`\n> \`!math\`, \`!trivia\`, \`!type\``
      );
  } else if (value === 'utils') {
    embed
      .setTitle('🎛️ Utility Commands')
      .setDescription(
        `> \`!userinfo @user\`, \`!serverinfo\`\n> \`!embed <color> <msg>\`\n> \`!dm @role <msg>\`, \`!prems @role\`\n> \`!ping\``
      );
  } else if (value === 'music') {
    embed
      .setTitle('🎶 Music Commands')
      .setDescription(
        `> \`!play <song/url>\`\n> \`!skip\`, \`!pause\`, \`!resume\`\n> \`!queue\`, \`!stop\``
      );
  }

  interaction.update({ embeds: [embed], components: [interaction.message.components[0]] });
});
// ====== index.js — PART 11: TICKET CLOSE + DM TRANSCRIPT ======

const fs = require('fs');
const path = require('path');

// Utility to check if a channel is a ticket
function isTicketChannel(channelName) {
  return /^ticket-\d{4,}$/.test(channelName);
}

// Utility to get first mentioned user in topic
function extractUserFromTopic(topic) {
  const match = topic?.match(/<@!?(\d+)>/);
  return match ? match[1] : null;
}

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  if (command === 'close') {
    const reason = args.join(' ') || 'No reason provided';
    const channel = msg.channel;

    if (!isTicketChannel(channel.name)) return msg.reply('❌ This is not a ticket channel.');

    const userId = extractUserFromTopic(channel.topic);
    if (!userId) return msg.reply('❌ Couldn\'t find ticket creator.');

    const user = await client.users.fetch(userId);
    const messages = await channel.messages.fetch({ limit: 100 });
    const sorted = messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
    const transcriptLines = sorted.map(m => `[${m.createdAt.toLocaleString()}] ${m.author.tag}: ${m.content}`).join('\n');

    const ticketId = `${channel.name}-${Date.now()}`;
    const transcriptPath = path.join(__dirname, `transcript-${ticketId}.txt`);
    fs.writeFileSync(transcriptPath, transcriptLines);

    // Create DM Embed
    const embed = new EmbedBuilder()
      .setTitle('✅ Your Ticket Has Been Closed')
      .setColor('#57F287')
      .setThumbnail(msg.guild.iconURL())
      .addFields(
        { name: '📄 Ticket ID', value: `${ticketId}`, inline: true },
        { name: '📬 Opened By', value: `<@${userId}>`, inline: true },
        { name: '🔒 Closed By', value: `<@${msg.author.id}>`, inline: true },
        { name: '🎫 Claimed By', value: `Not Claimed`, inline: true },
        { name: '📝 Reason', value: `${reason}`, inline: false }
      )
      .setFooter({ text: msg.guild.name, iconURL: msg.guild.iconURL() });

    const button = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setLabel('📎 View Transcript')
        .setStyle(ButtonStyle.Link)
        .setURL(`https://file.io/?autoDelete=true`) // Placeholder link
    );

    // DM the user
    try {
      await user.send({ embeds: [embed], components: [button] });
    } catch {
      msg.channel.send('⚠️ Could not DM the ticket creator.');
    }

    // Optional: send summary to logs channel
    const logsChannel = msg.guild.channels.cache.find(c => c.name.includes('ticket-logs') && c.isTextBased());
    if (logsChannel) {
      const logEmbed = EmbedBuilder.from(embed).setTitle('📦 Ticket Closed (Log)');
      logsChannel.send({ embeds: [logEmbed] });
    }

    // Delete the ticket channel
    setTimeout(() => {
      fs.unlinkSync(transcriptPath); // delete transcript file
      channel.delete().catch(() => {});
    }, 5000);

    msg.reply('✅ Ticket will close in 5 seconds.');
  }
});
// ====== index.js — PART 12: QUICK.DB ECONOMY + WARNS ======

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  // !bal
  if (command === 'bal') {
    const user = msg.mentions.users.first() || msg.author;
    const cash = await db.get(`cash_${user.id}`) || 0;
    const bank = await db.get(`bank_${user.id}`) || 0;

    const embed = new EmbedBuilder()
      .setTitle(`💰 Balance for ${user.username}`)
      .addFields(
        { name: '🪙 Wallet', value: `${cash} coins`, inline: true },
        { name: '🏦 Bank', value: `${bank} coins`, inline: true }
      )
      .setColor('#facc15');
    msg.reply({ embeds: [embed] });
  }

  // !daily
  if (command === 'daily') {
    const cooldown = 24 * 60 * 60 * 1000;
    const last = await db.get(`daily_${msg.author.id}`);
    if (last && Date.now() - last < cooldown) {
      const remaining = cooldown - (Date.now() - last);
      const hours = Math.floor(remaining / 3600000);
      const mins = Math.floor((remaining % 3600000) / 60000);
      return msg.reply(`🕒 Come back in ${hours}h ${mins}m for your next daily.`);
    }

    const reward = Math.floor(Math.random() * 500) + 250;
    await db.add(`cash_${msg.author.id}`, reward);
    await db.set(`daily_${msg.author.id}`, Date.now());
    msg.reply(`✅ You claimed your daily **${reward} coins**!`);
  }

  // !warn @user [reason]
  if (command === 'warn') {
    const user = msg.mentions.users.first();
    const reason = args.slice(1).join(' ') || 'No reason provided';
    if (!user) return msg.reply('❌ Mention a user to warn.');

    await db.push(`warns_${user.id}`, {
      reason,
      mod: msg.author.id,
      time: Date.now()
    });

    msg.reply(`⚠️ Warned <@${user.id}> for: **${reason}**`);

    const warns = await db.get(`warns_${user.id}`) || [];
    const limit = await db.get('warnlimit') || 3;

    if (warns.length >= limit) {
      const member = msg.guild.members.cache.get(user.id);
      if (member) await member.kick(`Reached ${limit} warns`);
      msg.channel.send(`🚫 <@${user.id}> was kicked (warn limit reached).`);
      await db.delete(`warns_${user.id}`);
    }
  }

  // !warnings @user
  if (command === 'warnings') {
    const user = msg.mentions.users.first() || msg.author;
    const warns = await db.get(`warns_${user.id}`) || [];

    if (warns.length === 0) return msg.reply('✅ No warnings found.');

    const embed = new EmbedBuilder()
      .setTitle(`⚠️ Warnings for ${user.username}`)
      .setColor('#ff4444')
      .setDescription(warns.map((w, i) =>
        `**#${i + 1}** – ${w.reason} (by <@${w.mod}>, <t:${Math.floor(w.time / 1000)}:R>)`).join('\n'));

    msg.reply({ embeds: [embed] });
  }

  // !warnlimit <number>
  if (command === 'warnlimit') {
    const num = parseInt(args[0]);
    if (!num) return msg.reply('❌ Provide a number.');
    await db.set('warnlimit', num);
    msg.reply(`✅ Warn limit set to ${num}`);
  }
});
// ====== index.js — PART 14: MUSIC COMMANDS ======

client.on('messageCreate', async msg => {
  if (!msg.content.startsWith(prefix) || msg.author.bot || !msg.guild) return;
  const args = msg.content.slice(prefix.length).trim().split(/ +/);
  const command = args.shift()?.toLowerCase();

  const channel = msg.member?.voice.channel;

  if (['play', 'p'].includes(command)) {
    if (!channel) return msg.reply('🔊 Join a voice channel first!');
    const query = args.join(' ');
    if (!query) return msg.reply('🎶 Provide a song name or URL.');

    const result = await player.search(query, {
      requestedBy: msg.author
    });

    if (!result || !result.tracks.length) return msg.reply('❌ No results found.');

    const queue = await player.nodes.create(msg.guild, {
      metadata: {
        channel: msg.channel
      },
      selfDeaf: true
    });

    try {
      if (!queue.connection) await queue.connect(channel);
    } catch {
      player.nodes.delete(msg.guild.id);
      return msg.reply('❌ Failed to join the voice channel.');
    }

    queue.addTrack(result.tracks[0]);
    if (!queue.isPlaying()) queue.play();

    msg.reply(`▶️ Playing: **${result.tracks[0].title}**`);
  }

  if (command === 'skip') {
    const queue = player.nodes.get(msg.guild.id);
    if (!queue || !queue.isPlaying()) return msg.reply('❌ No song is currently playing.');
    queue.node.skip();
    msg.reply('⏭️ Skipped.');
  }

  if (command === 'stop') {
    const queue = player.nodes.get(msg.guild.id);
    if (!queue) return msg.reply('❌ Nothing to stop.');
    queue.delete();
    msg.reply('⏹️ Stopped music and left the voice channel.');
  }

  if (command === 'pause') {
    const queue = player.nodes.get(msg.guild.id);
    if (!queue || !queue.isPlaying()) return msg.reply('⏸️ Nothing to pause.');
    queue.node.pause();
    msg.reply('⏸️ Paused.');
  }

  if (command === 'resume') {
    const queue = player.nodes.get(msg.guild.id);
    if (!queue) return msg.reply('▶️ Nothing to resume.');
    queue.node.resume();
    msg.reply('▶️ Resumed.');
  }

  if (command === 'queue') {
    const queue = player.nodes.get(msg.guild.id);
    if (!queue || !queue.tracks.toArray().length) return msg.reply('📭 Queue is empty.');

    const tracks = queue.tracks.toArray().slice(0, 5).map((t, i) => `**${i + 1}.** ${t.title}`).join('\n');
    msg.reply({ embeds: [new EmbedBuilder().setTitle('🎶 Current Queue').setDescription(tracks).setColor('#00ffd0')] });
  }

  if (command === 'np') {
    const queue = player.nodes.get(msg.guild.id);
    if (!queue || !queue.currentTrack) return msg.reply('🎵 Nothing is currently playing.');
    msg.reply(`🎧 Now Playing: **${queue.currentTrack.title}**`);
  }
});
