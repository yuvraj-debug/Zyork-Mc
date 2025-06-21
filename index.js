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

const ticketSetup = new Map(); // Store config per guild

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

  // 📖 Help Command
  if (content === '!help') {
    return message.channel.send(`
**🤖 Bot Commands**

🎫 **Ticket System**
\`!ticket <message>\` — Set the panel embed description.
\`!option <emoji> <label>\` — Add a ticket button (up to 10).
\`!ticketviewer @role\` — Set the role that can view ticket channels.
\`!ticketcategory #channel\` — Set the ticket category from a channel's parent.
\`!deployticketpanel\` — Send the ticket panel with buttons.
\`!close\` — Close the current ticket channel.

ℹ️ Use these to fully configure your custom ticket system!
    `);
  }

  // 🧱 Ticket Setup Commands
  if (content.startsWith('!ticket ')) {
    setup.description = content.slice(8).trim();
    return message.reply('✅ Ticket message set.');
  }

  if (content.startsWith('!option ')) {
    const args = content.slice(8).trim().split(' ');
    const emoji = args.shift();
    const label = args.join(' ');
    if (!emoji || !label) return message.reply('Usage: `!option <emoji> <label>`');
    if (setup.options.length >= 10) return message.reply('❌ You can add up to 10 options.');
    setup.options.push({ emoji, label });
    return message.reply(`✅ Added: ${emoji} ${label}`);
  }

  if (content.startsWith('!ticketviewer')) {
    const match = content.match(/<@&(\d+)>/);
    if (!match) return message.reply('❌ Please mention a valid role.');
    setup.viewerRoleId = match[1];
    return message.reply('✅ Viewer role set.');
  }

  if (content.startsWith('!ticketcategory')) {
    const match = content.match(/<#(\d+)>/);
    if (!match) return message.reply('❌ Please mention a text channel.');
    const channel = message.guild.channels.cache.get(match[1]);
    if (!channel?.parentId) return message.reply('❌ That channel doesn’t belong to a category.');
    setup.categoryId = channel.parentId;
    return message.reply(`✅ Ticket category set to parent of #${channel.name}`);
  }

  if (content === '!deployticketpanel') {
    if (!setup.description || setup.options.length === 0 || !setup.viewerRoleId || !setup.categoryId) {
      return message.reply('❌ Setup incomplete. Make sure description, at least one option, a role, and category are set.');
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

  // 🗑️ Close Ticket Channel
  if (content === '!close') {
    if (!message.channel.name.startsWith('ticket-')) {
      return message.reply('❌ This is not a ticket channel.');
    }
    await message.reply('🗑️ Closing this ticket...');
    setTimeout(() => message.channel.delete(), 3000);
  }
});

// 🎟️ Handle Ticket Button Interactions
client.on('interactionCreate', async interaction => {
  if (!interaction.isButton() || !interaction.guild) return;

  const setup = ticketSetup.get(interaction.guild.id);
  if (!setup || !setup.options.length || !setup.categoryId || !setup.viewerRoleId) {
    return interaction.reply({ content: '❌ Ticket system not fully configured on this server.', ephemeral: true });
  }

  const optionIndex = parseInt(interaction.customId.split('_')[1]);
  const option = setup.options[optionIndex];
  const user = interaction.user;
  const guild = interaction.guild;
  const channelName = `ticket-${user.username.toLowerCase().replace(/\s+/g, '-')}`;

  const channel = await guild.channels.create({
    name: channelName,
    type: 0, // Text
    parent: setup.categoryId,
    permissionOverwrites: [
      { id: guild.roles.everyone, deny: [PermissionsBitField.Flags.ViewChannel] },
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
    content: `✅ Ticket created: ${channel}`,
    ephemeral: true
  });
});

process.on('unhandledRejection', console.error);
client.login(process.env.DISCORD_TOKEN);
