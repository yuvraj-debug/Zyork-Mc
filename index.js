const { Client, IntentsBitField } = require('discord.js');
const http = require('http');
require('dotenv').config();

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages
  ]
});

// Create HTTP server for Render health checks
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Discord bot is running');
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});

client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

client.on('messageCreate', async (message) => {
  // Ignore messages from bots and without prefix
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !msg command
  if (command === 'msg') {
    const msgContent = args.join(' ');
    if (!msgContent) {
      return message.reply('Please provide a message to send.');
    }
    
    try {
      await message.channel.send(msgContent);
      await message.delete().catch(console.error);
    } catch (error) {
      console.error('Error sending message:', error);
      message.reply('There was an error sending your message.');
    }
  }

  // !dm command
  if (command === 'dm') {
    // Check if user has permission to use this command
    if (!message.member.permissions.has('ADMINISTRATOR')) {
      return message.reply('You do not have permission to use this command.');
    }

    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply('Please mention a role to DM.');
    }

    const dmContent = args.slice(1).join(' ');
    if (!dmContent) {
      return message.reply('Please provide a message to send.');
    }

    try {
      // Get all members with the role
      const members = (await message.guild.members.fetch()).filter(member => 
        member.roles.cache.has(role.id)
      );

      // Send DM to each member
      let successCount = 0;
      let failCount = 0;
      
      for (const member of members.values()) {
        try {
          await member.send(dmContent);
          successCount++;
        } catch (error) {
          console.error(`Could not send DM to ${member.user.tag}:`, error);
          failCount++;
        }
      }

      // Send summary
      const summary = `DMs sent successfully to ${successCount} members. Failed to send to ${failCount} members.`;
      await message.reply(summary);
      setTimeout(() => message.delete().catch(console.error), 5000);
    } catch (error) {
      console.error('Error processing DM command:', error);
      message.reply('There was an error processing your command.');
    }
  }
});

const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('No token provided in DISCORD_TOKEN environment variable');
  process.exit(1);
}

client.login(token).catch(console.error);