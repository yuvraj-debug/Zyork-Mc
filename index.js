require('dotenv').config();
const { Client, GatewayIntentBits, Partials, ChannelType, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder } = require('discord.js');
const fs = require('fs');
const keep_alive = require('./keep_alive');
keep_alive();


const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessageReactions,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

let config = {
  ticketParent: null,
  ticketViewerRole: null,
  applicationChannel: null,
  applicationQuestions: [],
  applicationOptions: [],
};

const ticketData = new Map();
const appCooldowns = new Map();

client.on('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;

  const prefix = '!';
  if (!message.content.startsWith(prefix)) return;

  const [cmd, ...args] = message.content.slice(prefix.length).trim().split(' ');

  // Set ticket parent category from channel
  if (cmd === 'setchannel') {
    if (!message.mentions.channels.first()) return message.reply("Mention a channel inside the category.");
    const channel = message.mentions.channels.first();
    if (channel.parent) {
      config.ticketParent = channel.parent.id;
      message.reply(`✅ Ticket parent category set to \`${channel.parent.name}\``);
    } else {
      message.reply("❌ That channel is not under a category.");
    }
  }

  // Set ticket viewer role
  if (cmd === 'setviewer') {
    const role = message.mentions.roles.first();
    if (!role) return message.reply("Mention a role.");
    config.ticketViewerRole = role.id;
    message.reply(`✅ Ticket viewer role set to <@&${role.id}>`);
  }

  // Help command
  if (cmd === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('📚 Help - Zyrok Bot')
      .setColor('Blue')
      .setDescription('Here are all available commands and features:')
      .addFields(
        { name: '🎫 Ticket Commands', value: '`!setchannel #channel`\n`!setviewer @role`' },
        { name: '📝 Application System', value: '`!ques1 <text>` to `!ques5 <text>`\n`!addoptions Role|Cooldown`' },
        { name: '📩 Utility', value: '`!dm @role <msg>`\n`!msg <msg>`\n`!embed <color> <msg>`' },
        { name: '🎮 Mini-Games', value: 'Coming Soon: 4–5 Mini Games' },
      )
      .setFooter({ text: 'Zyrok Team | All systems operational.' });
    message.channel.send({ embeds: [helpEmbed] });
  }
});
const { ComponentType } = require('discord.js');

let ticketPanel = {
  title: "🎫 Need Help?",
  description: "Select a reason below to open a ticket.",
  options: []
};

// Command to create the ticket panel
client.on('messageCreate', async message => {
  if (!message.content.startsWith('!ticketpanel')) return;
  if (!message.member.permissions.has('Administrator')) return;

  const panelEmbed = new EmbedBuilder()
    .setTitle(ticketPanel.title)
    .setDescription(ticketPanel.description)
    .setColor('Green');

  const menu = new StringSelectMenuBuilder()
    .setCustomId('ticket_reason')
    .setPlaceholder('Select a reason')
    .addOptions(ticketPanel.options);

  const row = new ActionRowBuilder().addComponents(menu);

  message.channel.send({ embeds: [panelEmbed], components: [row] });
});

// Command to add dropdown options: !addoption Label|Emoji|RoleID
client.on('messageCreate', async message => {
  if (!message.content.startsWith('!addoption')) return;
  if (!message.member.permissions.has('Administrator')) return;

  const args = message.content.replace('!addoption', '').trim().split('|');
  if (args.length < 3) return message.reply("Use format: `!addoption Label|Emoji|RoleID`");

  const [label, emoji, roleId] = args;

  ticketPanel.options.push({
    label: label.trim(),
    value: `open_${label.trim().toLowerCase().replace(/\s+/g, '_')}`,
    emoji: emoji.trim(),
    description: `Open a ticket for ${label.trim()}`,
    roleId: roleId.trim()
  });

  message.reply(`✅ Added option: **${label}** with emoji ${emoji} for <@&${roleId.trim()}>`);
});

// When user selects a reason from dropdown
client.on('interactionCreate', async interaction => {
  if (!interaction.isStringSelectMenu()) return;
  if (interaction.customId !== 'ticket_reason') return;

  const selected = interaction.values[0];
  const option = ticketPanel.options.find(o => o.value === selected);
  if (!option) return interaction.reply({ content: 'Option not found.', ephemeral: true });

  const category = config.ticketParent;
  const viewerRole = config.ticketViewerRole;

  if (!category || !viewerRole) {
    return interaction.reply({ content: 'Ticket system not fully configured. Use `!setchannel` and `!setviewer`.', ephemeral: true });
  }

  const channelName = `ticket-${interaction.user.username}`.toLowerCase().replace(/[^a-z0-9]/g, '');

  const ticketChannel = await interaction.guild.channels.create({
    name: channelName,
    parent: category,
    type: ChannelType.GuildText,
    permissionOverwrites: [
      {
        id: interaction.guild.roles.everyone,
        deny: ['ViewChannel']
      },
      {
        id: interaction.user.id,
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
      },
      {
        id: viewerRole,
        allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory']
      }
    ]
  });

  const controlRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('claim_ticket').setLabel('Claim').setStyle(ButtonStyle.Primary).setEmoji('🛠️'),
    new ButtonBuilder().setCustomId('lock_ticket').setLabel('Lock').setStyle(ButtonStyle.Secondary).setEmoji('🔒'),
    new ButtonBuilder().setCustomId('close_ticket').setLabel('Close').setStyle(ButtonStyle.Danger).setEmoji('❌'),
    new ButtonBuilder().setCustomId('close_reason').setLabel('Close w/ Reason').setStyle(ButtonStyle.Danger).setEmoji('📋')
  );

  const ticketEmbed = new EmbedBuilder()
    .setTitle('🎟️ New Ticket')
    .setDescription(`Hello <@${interaction.user.id}>! A staff member will be with you shortly.\nReason: **${option.label}**`)
    .setColor('Orange')
    .setFooter({ text: 'Use the buttons below to manage this ticket.' });

  await ticketChannel.send({
    content: `<@${interaction.user.id}> <@&${option.roleId}>`,
    embeds: [ticketEmbed],
    components: [controlRow]
  });

  await interaction.reply({ content: `✅ Ticket created: ${ticketChannel}`, ephemeral: true });
});
client.on('messageCreate', message => {
  if (!message.content.startsWith('!ques')) return;
  const num = parseInt(message.content.match(/!ques(\d)/)?.[1]);
  if (!num || num < 1 || num > 5) return;

  const question = message.content.split(' ').slice(1).join(' ');
  if (!question) return message.reply('❌ Provide the question.');

  config.applicationQuestions[num - 1] = question;
  message.reply(`✅ Question ${num} set.`);
});

// Add application option: !addoptions Staff|1d
client.on('messageCreate', message => {
  if (!message.content.startsWith('!addoptions')) return;

  const parts = message.content.replace('!addoptions', '').trim().split('|');
  if (parts.length !== 2) return message.reply('❌ Format: `!addoptions Role|Cooldown`');

  const [label, cooldownRaw] = parts;
  let cooldown = 0;
  if (cooldownRaw.endsWith('m')) cooldown = parseInt(cooldownRaw) * 60;
  if (cooldownRaw.endsWith('h')) cooldown = parseInt(cooldownRaw) * 3600;
  if (cooldownRaw.endsWith('d')) cooldown = parseInt(cooldownRaw) * 86400;

  config.applicationOptions.push({ label, cooldown });
  message.reply(`✅ Added application option: **${label}** with cooldown **${cooldownRaw}**`);
});

// Set application submission channel
client.on('messageCreate', message => {
  if (!message.content.startsWith('!setappchannel')) return;
  const ch = message.mentions.channels.first();
  if (!ch) return message.reply('❌ Mention a valid channel.');
  config.applicationChannel = ch.id;
  message.reply(`✅ Application submissions will go to ${ch}`);
});
client.on('messageCreate', async message => {
  if (!message.content.startsWith('!apppanel')) return;
  if (!message.member.permissions.has('Administrator')) return;

  if (!config.applicationOptions.length || !config.applicationChannel) {
    return message.reply('❌ Use `!addoptions` and `!setappchannel` first.');
  }

  const appEmbed = new EmbedBuilder()
    .setTitle('📨 Apply Now')
    .setDescription('Choose a role below to apply. You’ll be asked a few questions in DM.')
    .setColor('Purple');

  const row = new ActionRowBuilder();

  config.applicationOptions.forEach((opt, i) => {
    row.addComponents(
      new ButtonBuilder()
        .setCustomId(`app_start_${opt.label}_${opt.cooldown}`)
        .setLabel(`Apply for ${opt.label}`)
        .setStyle(ButtonStyle.Primary)
        .setEmoji('📝')
    );
  });

  message.channel.send({ embeds: [appEmbed], components: [row] });
});

// Button interaction: start application
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (!interaction.customId.startsWith('app_start_')) return;

  const [_, __, label, cooldown] = interaction.customId.split('_');
  const cooldownSecs = parseInt(cooldown);

  const key = `${interaction.user.id}_${label}`;
  if (appCooldowns.has(key)) {
    const expire = appCooldowns.get(key);
    const remaining = Math.ceil((expire - Date.now()) / 1000);
    if (remaining > 0) {
      return interaction.reply({ content: `⏳ Please wait **${Math.ceil(remaining / 60)}m** before applying for ${label} again.`, ephemeral: true });
    }
  }

  try {
    await interaction.reply({ content: `📩 Starting your application in DMs.`, ephemeral: true });
    const dm = await interaction.user.createDM();

    const answers = [];
    for (let i = 0; i < config.applicationQuestions.length; i++) {
      const q = config.applicationQuestions[i];
      if (!q) continue;

      await dm.send(`❓ **Question ${i + 1}:** ${q}`);
      const collected = await dm.awaitMessages({ max: 1, time: 60000 });
      if (!collected.size) return dm.send('❌ Timeout. Application cancelled.');
      answers.push(collected.first().content);
    }

    appCooldowns.set(key, Date.now() + cooldownSecs * 1000);

    const appEmbed = new EmbedBuilder()
      .setTitle(`📥 New Application: ${label}`)
      .setColor('Aqua')
      .setDescription(`Submitted by: <@${interaction.user.id}>`)
      .setFooter({ text: 'Zyrok Applications' });

    answers.forEach((ans, idx) => {
      appEmbed.addFields({ name: `Q${idx + 1}`, value: ans });
    });

    const buttons = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId(`app_accept_${interaction.user.id}_${label}`).setLabel('✅ Accept').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_reject_${interaction.user.id}_${label}`).setLabel('❌ Reject').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`app_reason_accept_${interaction.user.id}_${label}`).setLabel('✅ Accept w/ Reason').setStyle(ButtonStyle.Success),
      new ButtonBuilder().setCustomId(`app_reason_reject_${interaction.user.id}_${label}`).setLabel('❌ Reject w/ Reason').setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`app_ticket_${interaction.user.id}_${label}`).setLabel('🎫 Open Ticket').setStyle(ButtonStyle.Secondary)
    );

    const channel = await client.channels.fetch(config.applicationChannel);
    await channel.send({ embeds: [appEmbed], components: [buttons] });

    dm.send('✅ Application submitted successfully!');
  } catch (err) {
    console.error(err);
    interaction.reply({ content: '❌ Could not send DM. Open your DMs and try again.', ephemeral: true });
  }
});
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const [type, userId, role] = interaction.customId.split('_');

  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) return interaction.reply({ content: '❌ User not found.', ephemeral: true });

  if (type === 'app_accept') {
    await interaction.reply({ content: `✅ Accepted <@${user.id}> for **${role}**.` });
    await user.send(`🎉 You have been **accepted** for ${role}!`);
  }

  if (type === 'app_reject') {
    await interaction.reply({ content: `❌ Rejected <@${user.id}> for **${role}**.` });
    await user.send(`We're sorry. You have been **rejected** for ${role}.`);
  }

  if (type === 'app_reason_accept' || type === 'app_reason_reject') {
    await interaction.reply({ content: '📋 Please type the reason...', ephemeral: true });

    const filter = m => m.author.id === interaction.user.id;
    interaction.channel.awaitMessages({ filter, max: 1, time: 30000 }).then(async collected => {
      const reason = collected.first().content;
      const status = type.includes('accept') ? 'accepted' : 'rejected';
      await user.send(`📋 You were **${status}** for ${role}. Reason: ${reason}`);
      await interaction.followUp({ content: `✅ Sent ${status} message with reason.`, ephemeral: true });
    }).catch(() => {
      interaction.followUp({ content: '❌ Timed out.', ephemeral: true });
    });
  }

  if (type === 'app' && interaction.customId.includes('ticket')) {
    const category = config.ticketParent;
    if (!category) return interaction.reply({ content: '❌ No ticket category set.', ephemeral: true });

    const channel = await interaction.guild.channels.create({
      name: `ticket-${user.username}`,
      parent: category,
      type: ChannelType.GuildText,
      permissionOverwrites: [
        { id: interaction.guild.roles.everyone, deny: ['ViewChannel'] },
        { id: user.id, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] },
        { id: config.ticketViewerRole, allow: ['ViewChannel', 'SendMessages', 'ReadMessageHistory'] }
      ]
    });

    const embed = new EmbedBuilder()
      .setTitle('🎫 Application Follow-up Ticket')
      .setDescription(`<@${user.id}> has opened a ticket regarding their application for **${role}**.`)
      .setColor('Gold');

    await channel.send({ content: `<@${user.id}> <@&${config.ticketViewerRole}>`, embeds: [embed] });
    await interaction.reply({ content: `🎫 Opened ticket: ${channel}`, ephemeral: true });
  }
});
client.on('messageCreate', async message => {
  if (message.content.startsWith('!dm')) {
    const [_, mention, ...msg] = message.content.split(' ');
    const role = message.mentions.roles.first();
    if (!role) return message.reply('Mention a role.');
    role.members.forEach(m => m.send(msg.join(' ')).catch(() => {}));
    message.reply(`✅ DMed ${role.members.size} members.`);
  }

  if (message.content.startsWith('!msg')) {
    const msg = message.content.slice(5);
    if (!msg) return;
    message.channel.send(msg);
    message.delete().catch(() => {});
  }

  if (message.content.startsWith('!embed')) {
    const [_, color, ...rest] = message.content.split(' ');
    const embed = new EmbedBuilder()
      .setColor(color || 'Blue')
      .setDescription(rest.join(' '));
    message.channel.send({ embeds: [embed] });
    message.delete().catch(() => {});
  }
});
client.on('messageCreate', async message => {
  if (message.content === '!rps') {
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder().setCustomId('rock').setLabel('🪨 Rock').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('paper').setLabel('📄 Paper').setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId('scissors').setLabel('✂️ Scissors').setStyle(ButtonStyle.Secondary)
    );
    message.reply({ content: 'Let’s play Rock Paper Scissors!', components: [row] });
  }
});

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  const choices = ['rock', 'paper', 'scissors'];
  const user = interaction.customId;
  const bot = choices[Math.floor(Math.random() * 3)];

  let result = '';
  if (user === bot) result = 'It’s a tie!';
  else if ((user === 'rock' && bot === 'scissors') || (user === 'paper' && bot === 'rock') || (user === 'scissors' && bot === 'paper'))
    result = 'You win!';
  else result = 'You lose!';

  interaction.reply({ content: `You chose **${user}**.\nI chose **${bot}**.\n**${result}**` });
});
async function sendTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  const sorted = [...messages.values()].reverse();
  const text = sorted.map(m => `${m.author.tag}: ${m.content}`).join('\n');

  const ratingRow = new ActionRowBuilder().addComponents(
    new ButtonBuilder().setCustomId('rate_1').setLabel('⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_2').setLabel('⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_3').setLabel('⭐⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_4').setLabel('⭐⭐⭐⭐').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('rate_5').setLabel('⭐⭐⭐⭐⭐').setStyle(ButtonStyle.Success)
  );

  const transcriptEmbed = new EmbedBuilder()
    .setTitle('📄 Ticket Transcript')
    .setDescription(`Here is the summary of your ticket conversation.`)
    .setColor('Blue');

  await channel.send({ files: [{ attachment: Buffer.from(text, 'utf-8'), name: 'transcript.txt' }] });
  await channel.send({ embeds: [transcriptEmbed], components: [ratingRow] });
}

client.on('interactionCreate', async interaction => {
  if (!interaction.isButton()) return;
  if (interaction.customId.startsWith('rate_')) {
    const stars = interaction.customId.split('_')[1];
    await interaction.reply({ content: `⭐ Thank you for rating us ${stars} star(s)!`, ephemeral: true });
  }
});
require('./keep_alive')();
client.login(process.env.TOKEN);
