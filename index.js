const express = require('express');
const app = express();

app.get('/', (req, res) => {
  res.send("Bot is alive!");
});

function run() {
  app.listen(10000, '0.0.0.0', () => {
    console.log('✅ Keep-alive server running on port 10000');
  });
}

function keep_alive() {
  run();
}

module.exports = keep_alive;
require('dotenv').config();
const keep_alive = require('./keep_alive');
keep_alive();

const { Client, GatewayIntentBits, Partials, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ChannelType } = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

// In-memory config (can be expanded to JSON later)
const config = {
  ticketParent: null,
  ticketViewerRole: null,
  ticketMessage: '🎫 Please select a category to open a ticket!',
  ticketOptions: [],
  appMessage: '📨 Apply for your desired role below!',
  appOptions: [],
  appChannel: null,
  appQuestions: []
};

client.once('ready', () => {
  console.log(`🚀 Bot ready: ${client.user.tag}`);
});
client.on('messageCreate', async message => {
  if (message.author.bot) return;
  const args = message.content.trim().split(' ');
  const cmd = args.shift().toLowerCase();

  // Set ticket panel message
  if (cmd === '!ticket' && args[0] === 'msg') {
    const msg = message.content.split(' ').slice(2).join(' ');
    if (!msg) return message.reply('❌ Please provide a ticket panel message.');
    config.ticketMessage = msg;
    return message.reply('✅ Ticket panel message updated.');
  }

  // Set dropdown options
  if (cmd === '!setoptions') {
    const list = args.join(' ').split(',').map(x => x.trim());
    if (!list.length) return message.reply('❌ Provide at least one option.');
    config.ticketOptions = list.map(opt => ({
      label: opt,
      value: `ticket_${opt.toLowerCase().replace(/\s+/g, '_')}`,
      description: `Create a ticket for ${opt}`
    }));
    return message.reply(`✅ Set ${list.length} ticket options.`);
  }

  // Deploy ticket panel
  if (cmd === '!deployticketpanel') {
    if (!config.ticketOptions.length) return message.reply('❌ No options set. Use `!setoptions` first.');

    const embed = new EmbedBuilder()
      .setTitle('🎫 Support Ticket')
      .setDescription(config.ticketMessage)
      .setColor('Blue');

    const menu = new StringSelectMenuBuilder()
      .setCustomId('ticket_reason')
      .setPlaceholder('Select a category...')
      .addOptions(config.ticketOptions);

    const row = new ActionRowBuilder().addComponents(menu);

    message.channel.send({ embeds: [embed], components: [row] });
    return message.reply('✅ Ticket panel deployed.');
  }

  // Set application panel message
  if (cmd === '!app' && args[0] === 'msg') {
    const msg = message.content.split(' ').slice(2).join(' ');
    if (!msg) return message.reply('❌ Please provide an application panel message.');
    config.appMessage = msg;
    return message.reply('✅ Application panel message updated.');
  }

  // Deploy application panel
  if (cmd === '!deployapp') {
    if (!config.appOptions.length) return message.reply('❌ Add roles first using `!addoptions`.');
    const embed = new EmbedBuilder()
      .setTitle('📨 Apply for a Role')
      .setDescription(config.appMessage)
      .setColor('Purple');

    const row = new ActionRowBuilder();
    config.appOptions.forEach(opt => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`app_start_${opt.label}_${opt.cooldown}`)
          .setLabel(`Apply: ${opt.label}`)
          .setStyle(ButtonStyle.Primary)
          .setEmoji('📝')
      );
    });

    message.channel.send({ embeds: [embed], components: [row] });
    return message.reply('✅ Application panel deployed.');
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'ticket_reason') return;

  const selected = interaction.values[0];
  const option = config.ticketOptions.find(o => o.value === selected);
  if (!option) return interaction.reply({ content: '❌ Option not found.', ephemeral: true });

  if (!config.ticketParent || !config.ticketViewerRole)
    return interaction.reply({ content: '❌ Use `!setchannel` and `!setviewer` to configure ticket system.', ephemeral: true });

  const ticketName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');
  const ticketChannel = await interaction.guild.channels.create({
    name: ticketName,
    parent: config.ticketParent,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
      { id: interaction.user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
      { id: config.ticketViewerRole, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
    ]
  });

  const ticketEmbed = new EmbedBuilder()
    .setTitle('🎟️ New Ticket')
    .setDescription(`Hello <@${interaction.user.id}>, a team member will assist you shortly.\nCategory: **${option.label}**`)
    .setColor('Orange');

  const controls = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
    new ButtonBuilder().setCustomId('lock_ticket').setLabel('Lock').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    new ButtonBuilder().setCustomId('close_reason').setLabel('Close w/ Reason').setStyle(ButtonStyle.Danger).setEmoji('📋')
  );

  await ticketChannel.send({
    content: `<@${interaction.user.id}> <@&${config.ticketViewerRole}>`,
    embeds: [ticketEmbed],
    components: [controls]
  });

  await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const ch = interaction.channel;
  if (!ch.name.startsWith('ticket-')) return;

  if (interaction.customId === 'claim_ticket') {
    interaction.reply({ content: `🛠️ Ticket claimed by <@${interaction.user.id}>.` });
  }

  if (interaction.customId === 'lock_ticket') {
    await ch.permissionOverwrites.edit(interaction.guild.roles.everyone, { SendMessages: false });
    await interaction.reply({ content: '🔒 Ticket locked.' });
  }

  if (interaction.customId === 'close_ticket') {
    await interaction.reply('❌ Ticket will be closed in 5 seconds...');
    setTimeout(() => ch.delete().catch(() => {}), 5000);
  }

  if (interaction.customId === 'close_reason') {
    await interaction.reply({ content: '📋 Please type the reason in chat.', ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    ch.awaitMessages({ filter, max: 1, time: 30000 }).then(async collected => {
      const reason = collected.first().content;
      await ch.send(`❌ Ticket closed by <@${interaction.user.id}>. Reason: ${reason}`);
      setTimeout(() => ch.delete().catch(() => {}), 5000);
    }).catch(() => {
      interaction.followUp({ content: '❌ Timed out. Ticket not closed.', ephemeral: true });
    });
  }
});
client.on('messageCreate', async message => {
  if (message.content === '!rps') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rock').setLabel('🪨 Rock').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('paper').setLabel('📄 Paper').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('scissors').setLabel('✂️ Scissors').setStyle(ButtonStyle.Secondary)
    );
    return message.reply({ content: '🎮 Rock Paper Scissors — Choose!', components: [row] });
  }

  if (message.content === '!guess') {
    const num = Math.floor(Math.random() * 10) + 1;
    message.reply('🎲 Guess a number between 1 and 10 (reply below)...');

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 15000 });
    if (!collected.size) return message.reply('⏰ Timeout!');

    const guess = parseInt(collected.first().content);
    return guess === num
      ? message.reply('🎉 Correct guess!')
      : message.reply(`❌ Wrong! It was **${num}**.`);
  }

  if (message.content === '!math') {
    const a = Math.floor(Math.random() * 10), b = Math.floor(Math.random() * 10);
    const answer = a + b;
    message.reply(`🧠 What is ${a} + ${b}?`);

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 10000 });
    if (!collected.size) return message.reply('⏰ Timeout!');
    return parseInt(collected.first().content) === answer
      ? message.reply('✅ Correct!')
      : message.reply(`❌ Wrong! Answer was ${answer}.`);
  }

  if (message.content === '!type') {
    const words = ['discord', 'moderation', 'ticket', 'bot', 'application'];
    const chosen = words[Math.floor(Math.random() * words.length)];
    message.reply(`⌨️ Type this word: **${chosen}**`);

    const filter = m => m.author.id === message.author.id;
    const collected = await message.channel.awaitMessages({ filter, max: 1, time: 10000 });
    if (!collected.size) return message.reply('⏰ Timeout!');
    return collected.first().content.toLowerCase() === chosen
      ? message.reply('✅ Fast and accurate!')
      : message.reply('❌ Incorrect!');
  }

  if (message.content === '!trivia') {
    const q = {
      question: "What is the capital of France?",
      answer: "paris"
    };
    message.reply(`🧠 Trivia: ${q.question}`);
    const collected = await message.channel.awaitMessages({ filter: m => m.author.id === message.author.id, max: 1, time: 15000 });
    if (!collected.size) return message.reply('⏰ Timeout!');
    return collected.first().content.toLowerCase() === q.answer
      ? message.reply('✅ Correct!')
      : message.reply(`❌ Wrong! It was ${q.answer}.`);
  }
});
client.on('messageCreate', message => {
  if (message.content === '!help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📘 Zyrok Bot Help Menu')
      .setColor('Blurple')
      .setDescription('Here’s a list of all available commands categorized by features.')
      .addFields(
        {
          name: '🎫 Ticket System',
          value:
            '`!ticket msg <text>` — Set ticket panel message\n' +
            '`!setoptions <opt1, opt2>` — Set dropdown options\n' +
            '`!deployticketpanel` — Deploy ticket panel\n' +
            '`!setchannel #channel` — Set category for new tickets\n' +
            '`!setviewer @role` — Set role that sees new tickets'
        },
        {
          name: '📨 Application System',
          value:
            '`!app msg <text>` — Set application panel message\n' +
            '`!addoptions Role|Cooldown` — Add role to apply for\n' +
            '`!deployapp` — Deploy application panel\n' +
            '`!ques1`, `!ques2`, ... — Set application questions\n' +
            '`!setappchannel #channel` — Set app review channel'
        },
        {
          name: '🔧 Utility Commands',
          value:
            '`!dm @role <msg>` — DM a role\n' +
            '`!msg <msg>` — Send message as bot\n' +
            '`!embed <color> <msg>` — Send message as embed'
        },
        {
          name: '🎮 Mini-Games',
          value:
            '`!rps` — Rock Paper Scissors\n' +
            '`!guess` — Guess the Number\n' +
            '`!math` — Quick Math\n' +
            '`!type` — Fast Type\n' +
            '`!trivia` — Simple Trivia'
        }
      )
      .setFooter({ text: 'Zyrok Team • All systems deployed' });

    return message.channel.send({ embeds: [helpEmbed] });
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;

  const id = interaction.customId;
  if (!id.startsWith('app_start_')) return;

  const [_, label, cooldown] = id.split('_');
  const userId = interaction.user.id;
  const now = Date.now();
  const cooldownKey = `${userId}_${label}`;
  const remaining = appCooldowns.get(cooldownKey);

  if (remaining && remaining > now) {
    const timeLeft = Math.ceil((remaining - now) / 1000);
    return interaction.reply({ content: `⏳ You can apply for **${label}** again in ${timeLeft} seconds.`, ephemeral: true });
  }

  appCooldowns.set(cooldownKey, now + parseInt(cooldown) * 1000);

  try {
    await interaction.reply({ content: `📨 Application for **${label}** started in your DM.`, ephemeral: true });

    const dm = await interaction.user.createDM();
    const answers = [];

    for (let i = 0; i < config.appQuestions.length; i++) {
      const question = config.appQuestions[i];
      if (!question) continue;

      await dm.send(`❓ **Q${i + 1}:** ${question}`);
      const collected = await dm.awaitMessages({ filter: m => m.author.id === userId, max: 1, time: 2 * 60 * 1000 });

      if (!collected.size) {
        await dm.send('❌ Timeout. Application cancelled.');
        return;
      }

      answers.push(`**Q${i + 1}:** ${question}\n**A:** ${collected.first().content}`);
    }

    if (!config.appChannel) return dm.send('❌ Application channel not set.');

    const appEmbed = new EmbedBuilder()
      .setTitle(`📝 Application: ${label}`)
      .setColor('Green')
      .setDescription(`**User:** <@${userId}> (${userId})\n\n${answers.join('\n\n')}`)
      .setFooter({ text: 'Zyrok Application System' });

    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_accept_${userId}_${label}`).setLabel('Accept ✅').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_reject_${userId}_${label}`).setLabel('Reject ❌').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`app_accept_reason_${userId}_${label}`).setLabel('Accept w/ Reason 📗').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_reject_reason_${userId}_${label}`).setLabel('Reject w/ Reason 📕').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`app_ticket_${userId}_${label}`).setLabel('Open Ticket 🎫').setStyle(ButtonStyle.Primary)
    );

    const appChannel = await client.channels.fetch(config.appChannel);
    await appChannel.send({ embeds: [appEmbed], components: [row] });
    await dm.send('✅ Application submitted successfully!');
  } catch (e) {
    console.error(e);
    interaction.reply({ content: '❌ Failed to send DM. Please enable messages from server members.', ephemeral: true });
  }
});
client.login(process.env.TOKEN);