require('dotenv').config();
const express = require('express');
const { Client, GatewayIntentBits, Partials } = require('discord.js');

// Keep-alive server (useful for Render web service)
const app = express();
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('Keep-alive server running'));

// Discord bot setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel] // Needed for DMs
});

client.once('ready', () => {
  console.log(`🤖 Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // !msg command
  if (message.content.startsWith('!msg ')) {
    const content = message.content.slice(5).trim();
    if (content.length) {
      await message.channel.send(content);
      await message.delete().catch(() => {});
    }
  }

  // !dm command
  if (message.content.startsWith('!dm ')) {
    const args = message.content.slice(4).trim().split(' ');
    const roleMention = args.shift();
    const msg = args.join(' ');

    const roleId = roleMention.match(/^<@&(\d+)>$/)?.[1];
    if (!roleId) return message.reply('Please mention a valid role.');

    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('Role not found.');

    const members = role.members;
    if (!members.size) return message.reply('No members in this role.');

    let sent = 0;
    members.forEach(member => {
      member.send(msg)
        .then(() => sent++)
        .catch(() => console.log(`❌ Couldn't DM ${member.user.tag}`));
    });

    message.delete().catch(() => {});
    console.log(`✅ Sent message to ${sent} member(s)`);
  }
});

// Error handling
process.on('unhandledRejection', error => {
  console.error('Unhandled promise rejection:', error);
});

client.login(process.env.DISCORD_TOKEN);