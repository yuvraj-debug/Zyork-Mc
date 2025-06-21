require('dotenv').config();
const { Client, GatewayIntentBits, Partials } = require('discord.js');
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

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

client.on('messageCreate', async message => {
  if (message.author.bot) return;

  // !msg command
  if (message.content.startsWith('!msg ')) {
    const content = message.content.slice(5);
    await message.channel.send(content);
    await message.delete();
  }

  // !dm command
  if (message.content.startsWith('!dm ')) {
    const args = message.content.slice(4).split(' ');
    const roleMention = args.shift();
    const msg = args.join(' ');

    const roleId = roleMention.match(/^<@&(\d+)>$/)?.[1];
    if (!roleId) return message.reply('Please mention a valid role.');

    const role = message.guild.roles.cache.get(roleId);
    if (!role) return message.reply('Role not found.');

    const members = role.members;
    members.forEach(member => {
      member.send(msg).catch(() => console.log(`Couldn't DM ${member.user.tag}`));
    });

    await message.delete();
  }
});

client.login(process.env.DISCORD_TOKEN);