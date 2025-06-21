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
  PermissionsBitField
} = require('discord.js');

const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Keep-alive server running'));

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers
  ],
  partials: [Partials.Channel]
});

const ticketSetup = new Map(); // per-server setup

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
      categoryId: null
    });
  }

  const setup = ticketSetup.get(guildId);

  // 🆘 HELP COMMAND
  if (content === '!help') {
    return message.channel.send(`
📘 **Bot Command Reference**

🎫 **Ticket System Setup**
\`!ticket <message>\` — Set the embed description shown in the ticket panel.
\`!option <emoji> <label>\` — Add a ticket button (up to 10 max).
\`!ticketviewer @role\` — Set the role that should have access to all ticket channels.
\`!ticketcategory #channel\` — Sets the ticket category by using the parent of the mentioned text channel.
\`!deployticketpanel\` — Deploys the configured ticket panel with buttons.
\`!close\` — Closes (deletes) the current ticket channel.

📬 **Messaging Tools**
\`!msg <message>\` — Sends a message in the channel and deletes your original command.
\`!dm <@role> <message>\` — Sends a DM to every member with the specified role (use with care!).

🧪 **Utility & Meta**
\`!help\` — Displays this list of all available commands.

💡 **Pro Tips**
- Configure all ticket settings before using \`!deployticketpanel\`.
- Each server keeps its own setup (multi-server ready).
- You can add more features like transcript saving, close buttons, or user limits. Just ask!

    `);
  }

  // 🎟️ Ticket Setup Commands
  if (content.startsWith('!ticket ')) {
    setup.description = content.slice(8).trim();
    return message.reply('✅ Ticket panel message set.');
  }

  if (content.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 10) return message.reply('❌ You can only add up to 10 options.');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added option: ${emoji} ${label}`);
  }

  if (content.startsWith('!ticketviewer')) {
    const match = content.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Please mention a valid role.');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Ticket viewer role set.');
  }

  if (content.startsWith('!ticketcategory')) {
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Please mention a valid text channel.');
    const channel = message.guild.channels.cache.get(match[1]);
    if (!channel || !channel.parentId) return message.reply('❌ Couldn’t find a category for that channel.');
    setup.categoryId = channel.parentId;
    return message.reply(`✅ Ticket category set from parent of #${channel.name}`);
  }

  if (content === '!deployticketpanel') {
    if (!setup.description || !setup.options.length || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('❌ Incomplete setup. Please set the message, add options, viewer role, and category first.');
    }

    const embed = new EmbedBuilder()
      .setTitle('📩 Open a Ticket')
      .setDescription(setup.description)
      .setColor('Blue');

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
    return message.reply('✅ Ticket panel deployed.');
  }

  // 🗑️ Close ticket
  if (content === '!close') {
    if (!message.channel.name.startsWith('ticket-')) {
      return message.reply('❌ This is not a ticket channel.');
    }
    await message.reply('🗑️ Closing this ticket...');
    setTimeout(() => message.channel.delete(), 3000);
  }

  // ✉️ Message Forwarding
  if (content.startsWith('!msg ')) {
    const msg = message.content.slice(5).trim();
    if (msg) {
      await message.channel.send(msg);
      await message.delete().catch(() => {});
    }
  }

  // 📩 DM Role
  if (content.startsWith('!dm ')) {
    const args = message.content.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const msg = args.join(' ');
    const roleId = roleMention.match(/^<@&(\d+)>$/)?.[1];
    if (!roleId) return message.reply('❌ Please mention a role.');
    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('❌ Role not found.');
    let sent = 0;
    role.members.forEach(member => {
      member.send(msg).then(() => sent++).catch(() => {});
    });
    message.delete().catch(() => {});
    console.log(`✅ Sent message to ${sent} member(s)`);
  }
});

// 🎟️ Handle button click
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.guild) return;

  const setup = ticketSetup.get(interaction.guild.id);
  if (!setup || !setup.options.length || !setup.categoryId || !setup.viewerRoleId) {
    return interaction.reply({ content: '❌ Ticket system not fully configured on this server.', ephemeral: true });
  }

  const optionIndex = parseInt(interaction.customId.split('_')[1]);
  const option = setup.options[optionIndex];
  const user = interaction.user;
  const channelName = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}`;

  const channel = await interaction.guild.channels.create({
    name: channelName,
    type: 0,
    parent: setup.categoryId,
    permissionOverwrites: [
      { id: interaction.guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
      { id: user.id, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] },
      { id: setup.viewerRoleId, allow: [PermissionsBitField.Flags.ViewChannel, PermissionsBitField.Flags.SendMessages] }
    ]
  });

  await channel.send({
    content: `🎫 <@${user.id}> opened a ticket for **${option.label}**! <@&${setup.viewerRoleId}>`,
    allowedMentions: {
      users: [user.id],
      roles: [setup.viewerRoleId]
    }
  });

  await interaction.reply({
    content: `✅ Your ticket has been created: ${channel}`,
    ephemeral: true
  });
});

process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
