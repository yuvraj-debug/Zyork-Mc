require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ChannelType, PermissionFlagsBits, StringSelectMenuBuilder, Collection, Events } = require('discord.js');
const http = require('http');

// Initialize client with all required intents
const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.GuildMessageReactions,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages
  ]
});

// Keep alive server for hosting platforms
const server = http.createServer((req, res) => {
  if (req.url === '/health') {
    res.writeHead(200, { 'Content-Type': 'text/plain' });
    return res.end('OK');
  }
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('Bot is alive!');
});

const PORT = process.env.PORT || 10000;
server.listen(PORT, () => {
  console.log(`Keep-alive server running on port ${PORT}`);
  console.log(`Server started at ${new Date().toISOString()}`);
});

server.on('error', (error) => console.error('Server error:', error));

// Data storage for all bot functions
const botData = {
  ticketSettings: {},
  applicationSettings: {},
  warnings: new Map(),
  warnLimits: new Map(),
  games: new Map(),
  premiumRoles: new Map(),
  jailed: new Map(),
  economy: new Map(),
  userSettings: new Map(),
  lottery: {
    participants: [],
    pot: 0,
    active: false
  }
};

// Color palette with varied emojis
const themeColors = {
  primary: '#5865F2',     // Blurple
  secondary: '#57F287',   // Green
  accent: '#FEE75C',      // Yellow
  dark: '#EB459E',        // Pink
  light: '#ED4245',       // Red
  error: '#ED4245',       // Red
  success: '#57F287',     // Green
  warning: '#FEE75C',     // Yellow
  info: '#5865F2',        // Blurple
  economy: '#F47FFF',     // Purple
  moderation: '#FF7F7F',  // Light red
  games: '#7FFF7F',       // Light green
  utility: '#7F7FFF'      // Light blue
};

// Enhanced error handler
function handleError(error, interaction) {
  console.error(error);
  const errorEmbed = new EmbedBuilder()
    .setColor(themeColors.error)
    .setTitle('❌ Error Occurred')
    .setDescription(`\`\`\`${error.message || 'An unknown error occurred'}\`\`\``)
    .setFooter({ 
      text: 'Please try again or contact support', 
      iconURL: 'https://emojicdn.elk.sh/❌' 
    });

  if (interaction.replied || interaction.deferred) {
    interaction.editReply({ embeds: [errorEmbed] }).catch(console.error);
  } else {
    interaction.reply({ embeds: [errorEmbed], ephemeral: true }).catch(console.error);
  }
}

// Premium permission check
function hasPremiumPermissions(member) {
  if (member.permissions.has(PermissionFlagsBits.Administrator)) return true;
  const premiumRoles = botData.premiumRoles.get(member.guild.id) || [];
  return premiumRoles.some(roleId => member.roles.cache.has(roleId));
}

// Theme embed builder
function createThemeEmbed(title, description, color = themeColors.primary) {
  return new EmbedBuilder()
    .setColor(color)
    .setTitle(`${title}`)
    .setDescription(description)
    .setFooter({ 
      text: `${client.user.username} • ${new Date().toLocaleString()}`, 
      iconURL: client.user.displayAvatarURL() 
    });
}

// Theme button builder
function createThemeButton(customId, label, emoji, style = ButtonStyle.Primary) {
  return new ButtonBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setEmoji(emoji)
    .setStyle(style);
}

// Theme action row
function createThemeActionRow(buttons) {
  return new ActionRowBuilder().addComponents(buttons);
}

// Moderation system
function setupModerationSystem() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // Warn limit command
      if (command === 'warnlimit') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set warn limits!', themeColors.error)
          ]});
        }
        
        const limit = parseInt(args[0]);
        if (isNaN(limit) || limit < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Input', 'Please provide a valid number (1 or higher)!', themeColors.warning)
          ]});
        }

        botData.warnLimits.set(message.guild.id, limit);
        
        await message.reply({ embeds: [
          createThemeEmbed('Warn Limit Set', `Members will now be automatically kicked after reaching ${limit} warnings.`, themeColors.success)
        ]});
      }

      // Warn command
      if (command === 'warn') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to warn members!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid User', 'Please mention a user to warn!', themeColors.warning)
          ]});
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member) {
          return message.reply({ embeds: [
            createThemeEmbed('User Not Found', 'That user is not in this server!', themeColors.warning)
          ]});
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        if (!botData.warnings.has(message.guild.id)) {
          botData.warnings.set(message.guild.id, new Map());
        }

        const guildWarnings = botData.warnings.get(message.guild.id);
        if (!guildWarnings.has(user.id)) {
          guildWarnings.set(user.id, []);
        }

        const warnings = guildWarnings.get(user.id);
        warnings.push({
          moderator: message.author.id,
          reason: reason,
          timestamp: Date.now()
        });

        const warnLimit = botData.warnLimits.get(message.guild.id) || 3;
        
        if (warnings.length >= warnLimit) {
          try {
            await member.kick(`Automatically kicked for reaching ${warnLimit} warnings`);

            const kickEmbed = createThemeEmbed('Member Kicked', 
              `${user.toString()} has been automatically kicked for reaching ${warnLimit} warnings.`, themeColors.error)
              .addFields(
                { name: 'Total Warnings', value: warnings.length.toString(), inline: true },
                { name: 'Last Warning', value: reason, inline: true }
              )
              .setFooter({ 
                text: `Moderator: ${message.author.tag}`, 
                iconURL: message.author.displayAvatarURL() 
              });

            await message.channel.send({ embeds: [kickEmbed] });
          } catch (e) {
            await message.reply({ embeds: [
              createThemeEmbed('Action Failed', 'Failed to automatically kick the member. I might not have permission.', themeColors.error)
            ]});
          }
        } else {
          const warnEmbed = createThemeEmbed('Warning Issued', `${user.toString()} has been warned.`, themeColors.warning)
            .addFields(
              { name: 'Reason', value: reason, inline: true },
              { name: 'Total Warnings', value: `${warnings.length}/${warnLimit}`, inline: true }
            )
            .setFooter({ 
              text: `Moderator: ${message.author.tag}`, 
              iconURL: message.author.displayAvatarURL() 
            });

          await message.channel.send({ embeds: [warnEmbed] });

          try {
            const dmEmbed = createThemeEmbed(`Warning in ${message.guild.name}`, 
              `You have received a warning from a moderator.`, themeColors.warning)
              .addFields(
                { name: 'Reason', value: reason, inline: true },
                { name: 'Total Warnings', value: `${warnings.length}/${warnLimit}`, inline: true }
              );

            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            console.log('Could not send DM to warned user');
          }
        }
      }

      // Warnings command
      if (command === 'warnings') {
        const user = message.mentions.users.first() || message.author;
        const guildWarnings = botData.warnings.get(message.guild.id);

        if (!guildWarnings || !guildWarnings.has(user.id)) {
          return message.reply({ embeds: [
            createThemeEmbed('No Warnings', `${user.toString()} has no warnings.`, themeColors.info)
          ]});
        }

        const warnings = guildWarnings.get(user.id);
        const warnLimit = botData.warnLimits.get(message.guild.id) || 3;
        
        const warnEmbed = createThemeEmbed(`Warnings for ${user.tag}`, 
          `Total warnings: ${warnings.length}/${warnLimit}`, themeColors.warning);

        warnings.forEach((warn, i) => {
          warnEmbed.addFields({
            name: `Warning #${i + 1}`,
            value: `**Moderator:** <@${warn.moderator}>\n**Reason:** ${warn.reason}\n**Date:** ${new Date(warn.timestamp).toLocaleString()}`,
            inline: false
          });
        });

        await message.channel.send({ embeds: [warnEmbed] });
      }

      // Jail system commands
      if (command === 'jail') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to jail members!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid User', 'Please mention a user to jail!', themeColors.warning)
          ]});
        }

        const member = message.guild.members.cache.get(user.id);
        const jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        
        if (!jailRole) {
          return message.reply({ embeds: [
            createThemeEmbed('Role Missing', 'No "jailed" role found!', themeColors.error)
          ]});
        }

        await member.roles.add(jailRole);
        botData.jailed.set(user.id, { 
          guild: message.guild.id, 
          timestamp: Date.now() 
        });

        await message.reply({ embeds: [
          createThemeEmbed('Member Jailed', `${user.tag} has been jailed.`, themeColors.success)
        ]});

        try {
          const dmEmbed = createThemeEmbed(`Jailed in ${message.guild.name}`, 
            'You have been jailed by a moderator.', themeColors.warning);

          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('Could not send DM to jailed user');
        }
      }

      if (command === 'jailers') {
        const jailed = [...botData.jailed.entries()]
          .filter(([_, v]) => v.guild === message.guild.id)
          .map(([id]) => `<@${id}>`);
        
        if (!jailed.length) {
          return message.reply({ embeds: [
            createThemeEmbed('Jail Status', 'No one is currently jailed.', themeColors.info)
          ]});
        }

        await message.reply({ embeds: [
          createThemeEmbed('Jailed Members', jailed.join('\n'), themeColors.warning)
        ]});
      }

      if (command === 'free') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to free members!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid User', 'Please mention a user to free!', themeColors.warning)
          ]});
        }

        const member = message.guild.members.cache.get(user.id);
        const jailRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'jailed');
        
        if (!jailRole) {
          return message.reply({ embeds: [
            createThemeEmbed('Role Missing', 'No "jailed" role found!', themeColors.error)
          ]});
        }

        await member.roles.remove(jailRole);
        botData.jailed.delete(user.id);

        await message.reply({ embeds: [
          createThemeEmbed('Member Freed', `${user.tag} has been freed from jail.`, themeColors.success)
        ]});

        try {
          const dmEmbed = createThemeEmbed(`Freed in ${message.guild.name}`, 
            'You have been released from jail by a moderator.', themeColors.success);

          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('Could not send DM to freed user');
        }
      }

      // Kick command
      if (command === 'kick') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to kick members!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid User', 'Please mention a user to kick!', themeColors.warning)
          ]});
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member) {
          return message.reply({ embeds: [
            createThemeEmbed('User Not Found', 'That user is not in this server!', themeColors.warning)
          ]});
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        try {
          const dmEmbed = createThemeEmbed(`Kicked from ${message.guild.name}`, 
            `You have been kicked by a moderator.\n**Reason:** ${reason}`, themeColors.error);

          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('Could not send DM to kicked user');
        }

        await member.kick(reason);
        
        await message.reply({ embeds: [
          createThemeEmbed('Member Kicked', `${user.tag} has been kicked.`, themeColors.success)
            .addFields({ name: 'Reason', value: reason })
        ]});
      }

      // Ban command
      if (command === 'ban') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to ban members!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid User', 'Please mention a user to ban!', themeColors.warning)
          ]});
        }

        const member = message.guild.members.cache.get(user.id);
        if (!member) {
          return message.reply({ embeds: [
            createThemeEmbed('User Not Found', 'That user is not in this server!', themeColors.warning)
          ]});
        }

        const reason = args.slice(1).join(' ') || 'No reason provided';

        try {
          const dmEmbed = createThemeEmbed(`Banned from ${message.guild.name}`, 
            `You have been banned by a moderator.\n**Reason:** ${reason}`, themeColors.error);

          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('Could not send DM to banned user');
        }

        await member.ban({ reason });
        
        await message.reply({ embeds: [
          createThemeEmbed('Member Banned', `${user.tag} has been banned.`, themeColors.success)
            .addFields({ name: 'Reason', value: reason })
        ]});
      }

      // Mute command
      if (command === 'mute') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to mute members!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid User', 'Please mention a user to mute!', themeColors.warning)
          ]});
        }

        const member = message.guild.members.cache.get(user.id);
        const muteRole = message.guild.roles.cache.find(r => r.name.toLowerCase() === 'muted');
        
        if (!muteRole) {
          return message.reply({ embeds: [
            createThemeEmbed('Role Missing', 'No "muted" role found!', themeColors.error)
          ]});
        }

        const duration = args[1] ? parseInt(args[1]) : 10;
        
        await member.roles.add(muteRole);
        
        try {
          const dmEmbed = createThemeEmbed(`Muted in ${message.guild.name}`, 
            `You have been muted for ${duration} minutes.`, themeColors.warning);

          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log('Could not send DM to muted user');
        }

        await message.reply({ embeds: [
          createThemeEmbed('Member Muted', `${user.tag} has been muted for ${duration} minutes.`, themeColors.success)
        ]});

        setTimeout(async () => {
          if (member.roles.cache.has(muteRole.id)) {
            await member.roles.remove(muteRole);
            
            try {
              const dmEmbed = createThemeEmbed(`Unmuted in ${message.guild.name}`, 
                'Your mute has expired.', themeColors.success);

              await user.send({ embeds: [dmEmbed] });
            } catch (e) {
              console.log('Could not send DM to unmuted user');
            }
          }
        }, duration * 60 * 1000);
      }
    } catch (error) {
      handleError(error, message);
    }
  });
}

// Economy system
function setupEconomySystem() {
  function getEco(userId) {
    if (!botData.economy.has(userId)) {
      botData.economy.set(userId, {
        wallet: 100,
        bank: 0,
        bio: '',
        items: [],
        job: null,
        level: 1,
        xp: 0,
        badges: [],
        lastBeg: 0,
        lastWork: 0,
        lastRob: 0,
        lastLottery: 0,
        lastDaily: 0,
        lastWeekly: 0,
        lastMonthly: 0,
        bankInterestDate: 0
      });
    }
    return botData.economy.get(userId);
  }

  function applyBankInterest(userId) {
    const eco = getEco(userId);
    const now = Date.now();
    const oneDay = 86400000;
    
    if (now - eco.bankInterestDate >= oneDay) {
      const interest = Math.floor(eco.bank * 0.05);
      eco.bank += interest;
      eco.bankInterestDate = now;
      return interest;
    }
    return 0;
  }

  // Initialize lottery if not exists
  if (!botData.lottery) {
    botData.lottery = {
      participants: [],
      pot: 0,
      lastDraw: Date.now(),
      nextDraw: Date.now() + 86400000 // 24 hours from now
    };
  }

  // Lottery auto-draw function
  async function checkAndDrawLottery() {
    const now = Date.now();
    if (now >= botData.lottery.nextDraw) {
      if (botData.lottery.participants.length > 0) {
        const winnerIndex = Math.floor(Math.random() * botData.lottery.participants.length);
        const winnerId = botData.lottery.participants[winnerIndex];
        const winner = await client.users.fetch(winnerId).catch(() => null);
        const winnerEco = getEco(winnerId);

        winnerEco.wallet += botData.lottery.pot;

        const embed = createThemeEmbed('🎉 Lottery Winner!', `The automatic lottery draw has occurred!`, themeColors.success)
          .addFields(
            { name: 'Winner', value: winner ? winner.toString() : 'Unknown User', inline: true },
            { name: 'Prize', value: `${botData.lottery.pot} coins`, inline: true },
            { name: 'Total Tickets', value: botData.lottery.participants.length.toString(), inline: true }
          );

        if (winner) {
          embed.setThumbnail(winner.displayAvatarURL());
          try {
            const dmEmbed = createThemeEmbed('🎉 You Won the Lottery!', 
              `Congratulations! You won ${botData.lottery.pot} coins in the lottery!`, themeColors.success);
            await winner.send({ embeds: [dmEmbed] });
          } catch (e) {
            console.log('Could not send DM to lottery winner');
          }
        }

        // Announce in all guilds
        client.guilds.cache.forEach(guild => {
          const channel = guild.systemChannel || guild.channels.cache.find(c => c.type === 'GUILD_TEXT' && c.permissionsFor(guild.me).has('SEND_MESSAGES'));
          if (channel) {
            channel.send({ embeds: [embed] }).catch(() => {});
          }
        });
      }

      // Reset lottery
      botData.lottery = {
        participants: [],
        pot: 0,
        lastDraw: now,
        nextDraw: now + 86400000 // Next draw in 24 hours
      };
    }
  }

  // Check lottery every 5 minutes
  setInterval(checkAndDrawLottery, 300000);
  checkAndDrawLottery(); // Initial check

  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      if (command === 'get') {
        if (message.author.id !== '1202998273376522331') {
          return message.reply({ embeds: [
            createThemeEmbed('Permission Denied', 'Only the bot owner can use this command!', themeColors.error)
          ]});
        }

        const user = message.mentions.users.first();
        const amount = parseInt(args[1]);

        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing User', 'Please mention a user to give coins to!', themeColors.warning)
          ]});
        }

        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please specify a valid amount of coins to give!', themeColors.warning)
          ]});
        }

        const eco = getEco(user.id);
        eco.wallet += amount;

        await message.reply({ embeds: [
          createThemeEmbed('Coins Granted', `Successfully gave ${amount} coins to ${user.username}!`, themeColors.success)
            .addFields(
              { name: 'New Balance', value: `${eco.wallet} coins`, inline: true }
            )
        ]});

        try {
          const dmEmbed = createThemeEmbed('You Received Free Coins!', 
            `The bot owner gave you ${amount} coins!\nYour new balance: ${eco.wallet} coins`, 
            themeColors.success);
          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log(`Could not send DM to ${user.username}`);
        }
      }

      if (['balance', 'bal'].includes(command)) {
        const eco = getEco(message.author.id);
        const interest = applyBankInterest(message.author.id);
        
        const embed = createThemeEmbed(`${message.author.username}'s Balance`, 'Your current financial status', themeColors.economy)
          .addFields(
            { name: '💰 Wallet', value: `${eco.wallet} coins`, inline: false },
            { name: '🏦 Bank', value: `${eco.bank} coins`, inline: false },
            { name: '💼 Job', value: eco.job || 'Unemployed', inline: false },
            { name: '📊 Level', value: eco.level.toString(), inline: false },
            { name: '⭐ XP', value: `${eco.xp}/${eco.level * 100}`, inline: false },
            { name: '🎖️ Badges', value: eco.badges.join(' ') || 'None', inline: false }
          )
          .setThumbnail(message.author.displayAvatarURL());

        if (interest > 0) {
          embed.addFields({ 
            name: '💹 Bank Interest', 
            value: `You earned ${interest} coins in interest today!`,
            inline: false 
          });
        }

        await message.reply({ embeds: [embed] });
      }

      if (command === 'daily') {
        const eco = getEco(message.author.id);
        const now = Date.now();
        let cooldown = 86400000;
        
        if (eco.items.includes('dailybooster')) {
          cooldown -= 21600000;
        }
        
        if (now - eco.lastDaily < cooldown) {
          const remaining = Math.ceil((cooldown - (now - eco.lastDaily)) / 1000 / 60 / 60);
          return message.reply({ embeds: [
            createThemeEmbed('Daily Cooldown', `You can claim your daily reward again in ${remaining.toFixed(1)} hours.`, themeColors.warning)
          ]});
        }

        eco.lastDaily = now;
        const amount = 100;
        eco.wallet += amount;
        
        await message.reply({ embeds: [
          createThemeEmbed('Daily Reward Claimed', `You received ${amount} coins! Come back tomorrow for more.`, themeColors.success)
        ]});
      }

      if (command === 'weekly') {
        const eco = getEco(message.author.id);
        const now = Date.now();
        let cooldown = 604800000;
        
        if (eco.items.includes('weeklybooster')) {
          cooldown -= 86400000;
        }
        
        if (now - eco.lastWeekly < cooldown) {
          const remaining = Math.ceil((cooldown - (now - eco.lastWeekly)) / 1000 / 60 / 60 / 24);
          return message.reply({ embeds: [
            createThemeEmbed('Weekly Cooldown', `You can claim your weekly reward again in ${remaining} days.`, themeColors.warning)
          ]});
        }

        eco.lastWeekly = now;
        const amount = 1000;
        eco.wallet += amount;
        
        await message.reply({ embeds: [
          createThemeEmbed('Weekly Reward Claimed', `You received ${amount} coins! Come back next week for more.`, themeColors.success)
        ]});
      }

      if (command === 'monthly') {
        const eco = getEco(message.author.id);
        const now = Date.now();
        let cooldown = 2592000000;
        
        if (eco.items.includes('monthlybooster')) {
          cooldown -= 259200000;
        }
        
        if (now - eco.lastMonthly < cooldown) {
          const remaining = Math.ceil((cooldown - (now - eco.lastMonthly)) / 1000 / 60 / 60 / 24);
          return message.reply({ embeds: [
            createThemeEmbed('Monthly Cooldown', `You can claim your monthly reward again in ${remaining} days.`, themeColors.warning)
          ]});
        }

        eco.lastMonthly = now;
        const amount = 5000;
        eco.wallet += amount;
        
        await message.reply({ embeds: [
          createThemeEmbed('Monthly Reward Claimed', `You received ${amount} coins! Come back next month for more.`, themeColors.success)
        ]});
      }

      if (command === 'pay') {
        const user = message.mentions.users.first();
        const amount = parseInt(args[1]);
        
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing User', 'Please mention a user to pay!', themeColors.warning)
          ]});
        }

        if (user.id === message.author.id) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Target', 'You can\'t pay yourself!', themeColors.error)
          ]});
        }

        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please specify a valid amount to send (minimum 1 coin)!', themeColors.warning)
          ]});
        }

        const senderEco = getEco(message.author.id);
        const receiverEco = getEco(user.id);

        if (senderEco.wallet < amount) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', `You don't have enough coins in your wallet to send ${amount} coins!`, themeColors.error)
              .addFields(
                { name: 'Your Wallet', value: `${senderEco.wallet} coins`, inline: true },
                { name: 'Amount', value: `${amount} coins`, inline: true }
              )
          ]});
        }

        senderEco.wallet -= amount;
        receiverEco.wallet += amount;

        const embed = createThemeEmbed('Payment Successful', `${message.author.username} sent ${amount} coins to ${user.username}`, themeColors.success)
          .addFields(
            { name: `${message.author.username}'s New Balance`, value: `${senderEco.wallet} coins`, inline: true },
            { name: `${user.username}'s New Balance`, value: `${receiverEco.wallet} coins`, inline: true }
          );

        await message.reply({ embeds: [embed] });

        try {
          const dmEmbed = createThemeEmbed('You Received Coins!', 
            `${message.author.username} sent you ${amount} coins!\nYour new balance: ${receiverEco.wallet} coins`, 
            themeColors.success);
          await user.send({ embeds: [dmEmbed] });
        } catch (e) {
          console.log(`Could not send payment DM to ${user.username}`);
        }
      }

      if (['deposit', 'dep'].includes(command)) {
        const amount = parseInt(args[0]);
        const eco = getEco(message.author.id);
        
        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please provide a valid amount to deposit!', themeColors.warning)
          ]});
        }

        if (eco.wallet < amount) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', 'You don\'t have enough coins in your wallet!', themeColors.error)
          ]});
        }

        eco.wallet -= amount;
        eco.bank += amount;
        
        await message.reply({ embeds: [
          createThemeEmbed('Deposit Successful', `You deposited ${amount} coins to your bank.`, themeColors.success)
            .addFields(
              { name: '💰 New Wallet', value: `${eco.wallet} coins`, inline: true },
              { name: '🏦 New Bank', value: `${eco.bank} coins`, inline: true }
            )
        ]});
      }

      if (['withdraw', 'with'].includes(command)) {
        const amount = parseInt(args[0]);
        const eco = getEco(message.author.id);
        
        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please provide a valid amount to withdraw!', themeColors.warning)
          ]});
        }

        if (eco.bank < amount) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', 'You don\'t have enough coins in your bank!', themeColors.error)
          ]});
        }

        eco.bank -= amount;
        eco.wallet += amount;
        
        await message.reply({ embeds: [
          createThemeEmbed('Withdrawal Successful', `You withdrew ${amount} coins from your bank.`, themeColors.success)
            .addFields(
              { name: '💰 New Wallet', value: `${eco.wallet} coins`, inline: true },
              { name: '🏦 New Bank', value: `${eco.bank} coins`, inline: true }
            )
        ]});
      }

      if (command === 'beg') {
        const eco = getEco(message.author.id);
        const now = Date.now();
        const cooldown = 60 * 1000;
        
        if (now - eco.lastBeg < cooldown) {
          const remaining = Math.ceil((cooldown - (now - eco.lastBeg)) / 1000);
          return message.reply({ embeds: [
            createThemeEmbed('Begging Cooldown', `You can beg again in ${remaining} seconds.`, themeColors.warning)
          ]});
        }

        eco.lastBeg = now;
        const amount = Math.floor(Math.random() * 50) + 1;
        eco.wallet += amount;
        
        const responses = [
          `A kind stranger gave you ${amount} coins!`,
          `You begged on the street and earned ${amount} coins!`,
          `Someone took pity on you and gave you ${amount} coins.`,
          `You found ${amount} coins on the ground while begging!`
        ];
        
        await message.reply({ embeds: [
          createThemeEmbed('Begging Success', responses[Math.floor(Math.random() * responses.length)], themeColors.success)
        ]});
      }

      if (command === 'work') {
        const eco = getEco(message.author.id);
        const now = Date.now();
        const cooldown = 5 * 60 * 1000;
        
        if (!eco.job) {
          return message.reply({ embeds: [
            createThemeEmbed('No Job', 'You don\'t have a job! Use `!jobs` to see available jobs and `!apply <job>` to get one.', themeColors.warning)
          ]});
        }

        if (now - eco.lastWork < cooldown) {
          const remaining = Math.ceil((cooldown - (now - eco.lastWork)) / 1000);
          return message.reply({ embeds: [
            createThemeEmbed('Work Cooldown', `You can work again in ${remaining} seconds.`, themeColors.warning)
          ]});
        }

        eco.lastWork = now;
        const baseAmount = 50 + (eco.level * 10);
        const amount = Math.floor(Math.random() * baseAmount) + baseAmount;
        
        const settings = botData.userSettings.get(message.author.id) || {};
        const finalAmount = settings.workBoost ? amount * 2 : amount;
        if (settings.workBoost) {
          botData.userSettings.set(message.author.id, {
            ...settings,
            workBoost: false
          });
        }
        
        eco.wallet += finalAmount;
        
        eco.xp += 10;
        if (eco.xp >= eco.level * 100) {
          eco.xp = 0;
          eco.level += 1;
          
          await message.reply({ embeds: [
            createThemeEmbed('Level Up!', `Congratulations! You've reached level ${eco.level}!`, themeColors.success)
          ]});
        }
        
        const responses = [
          `You worked hard as a ${eco.job} and earned ${finalAmount} coins!`,
          `Your shift as a ${eco.job} paid you ${finalAmount} coins.`,
          `After a long day as a ${eco.job}, you earned ${finalAmount} coins.`,
          `Your ${eco.job} job rewarded you with ${finalAmount} coins.`
        ];
        
        await message.reply({ embeds: [
          createThemeEmbed('Work Complete', responses[Math.floor(Math.random() * responses.length)], themeColors.success)
        ]});
      }

      if (command === 'jobs') {
        const jobs = [
          { name: 'Chef', emoji: '👨‍🍳', salary: '50-150 coins' },
          { name: 'Farmer', emoji: '👨‍🌾', salary: '40-120 coins' },
          { name: 'Developer', emoji: '👨‍💻', salary: '80-200 coins' },
          { name: 'Artist', emoji: '👨‍🎨', salary: '60-180 coins' },
          { name: 'Writer', emoji: '✍️', salary: '50-150 coins' }
        ];
        
        const embed = createThemeEmbed('Available Jobs', 'Here are the jobs you can apply for:', themeColors.info);
        
        jobs.forEach(job => {
          embed.addFields({
            name: `${job.emoji} ${job.name}`,
            value: `Salary: ${job.salary}\nUse \`!apply ${job.name.toLowerCase()}\` to apply`,
            inline: true
          });
        });
        
        await message.reply({ embeds: [embed] });
      }

      if (command === 'apply') {
        const job = args[0]?.toLowerCase();
        if (!job) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Job', 'Please specify a job to apply for! Use `!jobs` to see options.', themeColors.warning)
          ]});
        }

        const jobs = ['chef', 'farmer', 'developer', 'artist', 'writer'];
        if (!jobs.includes(job)) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Job', 'That job doesn\'t exist! Use `!jobs` to see available options.', themeColors.error)
          ]});
        }

        const eco = getEco(message.author.id);
        eco.job = job.charAt(0).toUpperCase() + job.slice(1);
        
        await message.reply({ embeds: [
          createThemeEmbed('Job Applied', `You are now a **${eco.job}**! Use \`!work\` to earn coins.`, themeColors.success)
        ]});
      }

      if (['lb', 'leaderboard'].includes(command)) {
        const top = [...botData.economy.entries()]
          .sort((a, b) => (b[1].wallet + b[1].bank) - (a[1].wallet + a[1].bank))
          .slice(0, 10);
        
        const embed = createThemeEmbed('🏆 Economy Leaderboard', 'Top 10 richest users:', themeColors.accent);
        
        top.forEach(([id, eco], i) => {
          embed.addFields({
            name: `${i + 1}. ${client.users.cache.get(id)?.username || 'Unknown'}`,
            value: `💰 ${eco.wallet + eco.bank} coins | Level ${eco.level}`,
            inline: false
          });
        });
        
        await message.channel.send({ embeds: [embed] });
      }

      if (command === 'cf' || command === 'coinflip') {
        let side = args[0]?.toLowerCase();
        const amount = parseInt(args[1]);
        
        if (side === 'head') side = 'heads';
        if (side === 'tail') side = 'tails';
        
        if (!['heads', 'tails'].includes(side)) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Choice', 'Please choose `heads` or `tails`! (or head/tail)', themeColors.warning)
          ]});
        }

        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please provide a valid amount to bet!', themeColors.warning)
          ]});
        }

        const eco = getEco(message.author.id);
        if (eco.wallet < amount) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', 'You don\'t have enough coins to bet that amount!', themeColors.error)
          ]});
        }

        const randomFactors = [
          Math.random(),
          Math.random(),
          Math.random(),
          Math.random()
        ];
        const totalRandom = randomFactors.reduce((a, b) => a + b, 0);
        const win = (totalRandom / randomFactors.length) < 0.5 ? 'heads' : 'tails';
        
        if (side === win) {
          const settings = botData.userSettings.get(message.author.id) || {};
          const multiplier = settings.gamblingBoost ? 1.15 : 1;
          const winnings = Math.floor(amount * multiplier);
          
          eco.wallet += winnings;
          await message.reply({ embeds: [
            createThemeEmbed('You Won!', `The coin landed on **${win}**! You won ${winnings} coins.`, themeColors.success)
          ]});
        } else {
          eco.wallet -= amount;
          await message.reply({ embeds: [
            createThemeEmbed('You Lost!', `The coin landed on **${win}**. You lost ${amount} coins.`, themeColors.error)
          ]});
        }
      }

      if (command === 'dice') {
        const num = parseInt(args[0]);
        const amount = parseInt(args[1]);
        
        if (isNaN(num) || num < 1 || num > 6) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Number', 'Please pick a number between 1 and 6!', themeColors.warning)
          ]});
        }

        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please provide a valid amount to bet!', themeColors.warning)
          ]});
        }

        const eco = getEco(message.author.id);
        if (eco.wallet < amount) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', 'You don\'t have enough coins to bet that amount!', themeColors.error)
          ]});
        }

        const roll = Math.floor(Math.random() * 6) + 1;
        
        if (roll === num) {
          const settings = botData.userSettings.get(message.author.id) || {};
          const multiplier = settings.gamblingBoost ? 6 : 5;
          
          eco.wallet += amount * multiplier;
          await message.reply({ embeds: [
            createThemeEmbed('You Won!', `You rolled a ${roll} and won ${amount * multiplier} coins!`, themeColors.success)
          ]});
        } else {
          eco.wallet -= amount;
          await message.reply({ embeds: [
            createThemeEmbed('You Lost!', `You rolled a ${roll} and lost ${amount} coins.`, themeColors.error)
          ]});
        }
      }

      if (command === 'slots') {
        const amount = parseInt(args[0]);
        
        if (isNaN(amount) || amount < 1) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Amount', 'Please provide a valid amount to bet!', themeColors.warning)
          ]});
        }

        const eco = getEco(message.author.id);
        if (eco.wallet < amount) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', 'You don\'t have enough coins to bet that amount!', themeColors.error)
          ]});
        }

        const emojis = ['🍒', '🍋', '🍉', '🍇', '🍀'];
        const slot = [0, 0, 0].map(() => emojis[Math.floor(Math.random() * emojis.length)]);
        const win = slot[0] === slot[1] && slot[1] === slot[2];
        
        if (win) {
          const settings = botData.userSettings.get(message.author.id) || {};
          const multiplier = settings.gamblingBoost ? 11 : 10;
          
          eco.wallet += amount * multiplier;
          await message.reply({ embeds: [
            createThemeEmbed('🎰 Slots - JACKPOT!', 
              `${slot.join(' ')}\nYou won ${amount * multiplier} coins!`, themeColors.success)
          ]});
        } else if (slot[0] === slot[1] || slot[1] === slot[2] || slot[0] === slot[2]) {
          eco.wallet += amount;
          await message.reply({ embeds: [
            createThemeEmbed('🎰 Slots - Small Win!', 
              `${slot.join(' ')}\nYou got your bet back!`, themeColors.info)
          ]});
        } else {
          eco.wallet -= amount;
          await message.reply({ embeds: [
            createThemeEmbed('🎰 Slots - You Lost!', 
              `${slot.join(' ')}\nYou lost ${amount} coins.`, themeColors.error)
          ]});
        }
      }

      if (command === 'profile') {
        const user = message.mentions.users.first() || message.author;
        const eco = getEco(user.id);
        applyBankInterest(user.id);
        
        const now = Date.now();
        const dailyCooldown = eco.items.includes('dailybooster') ? 18 : 24;
        const weeklyCooldown = eco.items.includes('weeklybooster') ? 6 : 7;
        const monthlyCooldown = eco.items.includes('monthlybooster') ? 27 : 30;
        
        const dailyRemaining = eco.lastDaily ? Math.max(0, dailyCooldown - Math.floor((now - eco.lastDaily) / 3600000)) : 0;
        const weeklyRemaining = eco.lastWeekly ? Math.max(0, weeklyCooldown - Math.floor((now - eco.lastWeekly) / 86400000)) : 0;
        const monthlyRemaining = eco.lastMonthly ? Math.max(0, monthlyCooldown - Math.floor((now - eco.lastMonthly) / 86400000)) : 0;
        
        const cooldownStatus = [
          `Daily: ${eco.lastDaily === 0 ? 'Ready' : dailyRemaining > 0 ? `${dailyRemaining}h` : 'Ready'}`,
          `Weekly: ${eco.lastWeekly === 0 ? 'Ready' : weeklyRemaining > 0 ? `${weeklyRemaining}d` : 'Ready'}`,
          `Monthly: ${eco.lastMonthly === 0 ? 'Ready' : monthlyRemaining > 0 ? `${monthlyRemaining}d` : 'Ready'}`
        ].join('\n');

        const embed = createThemeEmbed(`${user.username}'s Profile`, eco.bio || 'No bio set.', themeColors.economy)
          .setThumbnail(user.displayAvatarURL())
          .addFields(
            { name: '💰 Wallet', value: `${eco.wallet} coins`, inline: true },
            { name: '🏦 Bank', value: `${eco.bank} coins`, inline: true },
            { name: '💼 Job', value: eco.job || 'Unemployed', inline: true },
            { name: '📊 Level', value: eco.level.toString(), inline: true },
            { name: '⭐ XP', value: `${eco.xp}/${eco.level * 100}`, inline: true },
            { name: '🎖️ Badges', value: eco.badges.join(' ') || 'None', inline: true },
            { name: '⏳ Reward Status', value: cooldownStatus, inline: false }
          );
        
        await message.reply({ embeds: [embed] });
      }

      if (command === 'setbio') {
        const text = args.join(' ');
        if (!text) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Bio', 'Please provide text for your bio!', themeColors.warning)
          ]});
        }

        const eco = getEco(message.author.id);
        eco.bio = text.slice(0, 200);
        
        await message.reply({ embeds: [
          createThemeEmbed('Bio Updated', 'Your profile bio has been updated!', themeColors.success)
        ]});
      }

      if (command === 'shop') {
        const items = [
          { name: 'Cake', price: 100, emoji: '🍰', description: 'Gives you a small XP boost', command: '!buy cake' },
          { name: 'Shield', price: 250, emoji: '🛡️', description: 'Protects you from being robbed', command: '!buy shield' },
          { name: 'Sword', price: 500, emoji: '⚔️', description: 'Increases your robbery success rate', command: '!buy sword' },
          { name: 'Potion', price: 300, emoji: '🧪', description: 'Boosts your next work earnings', command: '!buy potion' },
          { name: 'Ring', price: 1000, emoji: '💍', description: 'Increases all earnings by 10%', command: '!buy ring' },
          { name: 'Lucky Charm', price: 750, emoji: '🍀', description: 'Increases gambling winnings by 15%', command: '!buy luckycharm' },
          { name: 'Backpack', price: 1500, emoji: '🎒', description: 'Increases your inventory capacity', command: '!buy backpack' },
          { name: 'Golden Ticket', price: 2000, emoji: '🎫', description: 'Gives you a free lottery ticket', command: '!buy goldenticket' },
          { name: 'Daily Booster', price: 1500, emoji: '⏱️', description: 'Reduces daily cooldown by 6 hours', command: '!buy dailybooster' },
          { name: 'Weekly Booster', price: 2500, emoji: '📅', description: 'Reduces weekly cooldown by 1 day', command: '!buy weeklybooster' },
          { name: 'Monthly Booster', price: 4000, emoji: '🗓️', description: 'Reduces monthly cooldown by 3 days', command: '!buy monthlybooster' }
        ];
        
        const embed = createThemeEmbed('🛒 Shop', 'Buy items to enhance your economy experience!', themeColors.economy);
        
        items.forEach(item => {
          embed.addFields({
            name: `${item.emoji} ${item.name} - ${item.price} coins`,
            value: `${item.description}\n**Command:** \`${item.command}\``,
            inline: false
          });
        });
        
        await message.reply({ embeds: [embed] });
      }

      if (command === 'buy') {
        const item = args[0]?.toLowerCase();
        if (!item) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Item', 'Please specify an item to buy! Use `!shop` to see options.', themeColors.warning)
          ]});
        }

        const items = {
          cake: { name: 'Cake', price: 100, emoji: '🍰' },
          shield: { name: 'Shield', price: 250, emoji: '🛡️' },
          sword: { name: 'Sword', price: 500, emoji: '⚔️' },
          potion: { name: 'Potion', price: 300, emoji: '🧪' },
          ring: { name: 'Ring', price: 1000, emoji: '💍' },
          luckycharm: { name: 'Lucky Charm', price: 750, emoji: '🍀' },
          backpack: { name: 'Backpack', price: 1500, emoji: '🎒' },
          goldenticket: { name: 'Golden Ticket', price: 2000, emoji: '🎫' },
          dailybooster: { name: 'Daily Booster', price: 1500, emoji: '⏱️' },
          weeklybooster: { name: 'Weekly Booster', price: 2500, emoji: '📅' },
          monthlybooster: { name: 'Monthly Booster', price: 4000, emoji: '🗓️' }
        };

        if (!items[item]) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Item', 'That item doesn\'t exist! Use `!shop` to see available items.', themeColors.error)
          ]});
        }

        const eco = getEco(message.author.id);
        if (eco.wallet < items[item].price) {
          return message.reply({ embeds: [
            createThemeEmbed('Insufficient Funds', `You need ${items[item].price} coins to buy this item!`, themeColors.error)
          ]});
        }

        eco.wallet -= items[item].price;
        eco.items.push(item);
        
        await message.reply({ embeds: [
          createThemeEmbed('Purchase Complete', `You bought a ${items[item].emoji} ${items[item].name}!`, themeColors.success)
        ]});
      }

      if (['inventory', 'inv'].includes(command)) {
        const eco = getEco(message.author.id);
        
        if (!eco.items.length) {
          return message.reply({ embeds: [
            createThemeEmbed('Inventory Empty', 'You don\'t have any items! Use `!shop` to buy some.', themeColors.info)
          ]});
        }

        const itemCounts = {};
        eco.items.forEach(item => {
          itemCounts[item] = (itemCounts[item] || 0) + 1;
        });

        const embed = createThemeEmbed(`${message.author.username}'s Inventory`, 'Your collected items:', themeColors.economy);
        
        Object.entries(itemCounts).forEach(([item, count]) => {
          const itemInfo = {
            cake: { emoji: '🍰', name: 'Cake' },
            shield: { emoji: '🛡️', name: 'Shield' },
            sword: { emoji: '⚔️', name: 'Sword' },
            potion: { emoji: '🧪', name: 'Potion' },
            ring: { emoji: '💍', name: 'Ring' },
            luckycharm: { emoji: '🍀', name: 'Lucky Charm' },
            backpack: { emoji: '🎒', name: 'Backpack' },
            goldenticket: { emoji: '🎫', name: 'Golden Ticket' },
            dailybooster: { emoji: '⏱️', name: 'Daily Booster' },
            weeklybooster: { emoji: '📅', name: 'Weekly Booster' },
            monthlybooster: { emoji: '🗓️', name: 'Monthly Booster' }
          }[item];
          
          embed.addFields({
            name: `${itemInfo.emoji} ${itemInfo.name}`,
            value: `Quantity: ${count}`,
            inline: true
          });
        });
        
        await message.reply({ embeds: [embed] });
      }

      if (command === 'use') {
        const item = args[0]?.toLowerCase();
        if (!item) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Item', 'Please specify an item to use! Use `!inv` to see your items.', themeColors.warning)
          ]});
        }

        const eco = getEco(message.author.id);
        const itemIndex = eco.items.indexOf(item);
        
        if (itemIndex === -1) {
          return message.reply({ embeds: [
            createThemeEmbed('Item Not Found', 'You don\'t have that item! Use `!inv` to see your items.', themeColors.error)
          ]});
        }

        eco.items.splice(itemIndex, 1);
        
        let effect = '';
        switch (item) {
          case 'cake':
            eco.xp += 20;
            effect = 'You gained 20 XP!';
            break;
          case 'shield':
            effect = 'You are now protected from robberies for 1 hour!';
            botData.userSettings.set(message.author.id, {
              ...(botData.userSettings.get(message.author.id) || {}),
              robberyProtection: Date.now() + 3600000
            });
            break;
          case 'sword':
            effect = 'Your next robbery attempt will have increased success chance!';
            botData.userSettings.set(message.author.id, {
              ...(botData.userSettings.get(message.author.id) || {}),
              robberyBoost: true
            });
            break;
          case 'potion':
            effect = 'Your next work earnings will be doubled!';
            botData.userSettings.set(message.author.id, {
              ...(botData.userSettings.get(message.author.id) || {}),
              workBoost: true
            });
            break;
          case 'ring':
            effect = 'All your earnings are increased by 10% for 24 hours!';
            botData.userSettings.set(message.author.id, {
              ...(botData.userSettings.get(message.author.id) || {}),
              earningsBoost: Date.now() + 86400000
            });
            break;
          case 'luckycharm':
            effect = 'Your gambling winnings are increased by 15% for 12 hours!';
            botData.userSettings.set(message.author.id, {
              ...(botData.userSettings.get(message.author.id) || {}),
              gamblingBoost: Date.now() + 43200000
            });
            break;
          case 'backpack':
            effect = 'Your inventory capacity has been increased!';
            break;
          case 'goldenticket':
            effect = 'You received a free lottery ticket!';
            break;
          case 'dailybooster':
            effect = 'Your daily cooldown is now reduced by 6 hours!';
            break;
          case 'weeklybooster':
            effect = 'Your weekly cooldown is now reduced by 1 day!';
            break;
          case 'monthlybooster':
            effect = 'Your monthly cooldown is now reduced by 3 days!';
            break;
          default:
            effect = 'Item used!';
        }
        
        await message.reply({ embeds: [
          createThemeEmbed('Item Used', effect, themeColors.success)
        ]});
      }

      if (command === 'rob') {
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Target', 'Please mention a user to rob!', themeColors.warning)
          ]});
        }

        if (user.id === message.author.id) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Target', 'You can\'t rob yourself!', themeColors.error)
          ]});
        }

        const eco = getEco(message.author.id);
        const targetEco = getEco(user.id);
        
        if (targetEco.wallet < 50) {
          return message.reply({ embeds: [
            createThemeEmbed('Poor Target', 'That user doesn\'t have enough coins to rob!', themeColors.warning)
          ]});
        }

        const now = Date.now();
        const cooldown = 30 * 60 * 1000;
        
        if (now - eco.lastRob < cooldown) {
          const remaining = Math.ceil((cooldown - (now - eco.lastRob)) / 1000 / 60);
          return message.reply({ embeds: [
            createThemeEmbed('Robbery Cooldown', `You can attempt another robbery in ${remaining} minutes.`, themeColors.warning)
          ]});
        }

        eco.lastRob = now;
        
        const targetSettings = botData.userSettings.get(user.id) || {};
        if (targetSettings.robberyProtection && targetSettings.robberyProtection > now) {
          return message.reply({ embeds: [
            createThemeEmbed('Robbery Failed', 'That user is protected by a shield!', themeColors.error)
          ]});
        }

        const robberSettings = botData.userSettings.get(message.author.id) || {};
        const successChance = robberSettings.robberyBoost ? 0.6 : 0.5;
        
        if (Math.random() < successChance) {
          const amount = Math.floor(targetEco.wallet * 0.2);
          eco.wallet += amount;
          targetEco.wallet -= amount;
          
          await message.reply({ embeds: [
            createThemeEmbed('Robbery Success', `You robbed ${user.username} and stole ${amount} coins!`, themeColors.success)
          ]});
          
          try {
            const dmEmbed = createThemeEmbed('You Were Robbed!', 
              `${message.author.username} robbed you and took ${amount} coins!`, themeColors.error);
            
            await user.send({ embeds: [dmEmbed] });
          } catch (e) {
            console.log('Could not send DM to robbed user');
          }
          
          if (robberSettings.robberyBoost) {
            botData.userSettings.set(message.author.id, {
              ...robberSettings,
              robberyBoost: false
            });
          }
        } else {
          const penalty = Math.floor(eco.wallet * 0.1);
          eco.wallet -= penalty;
          
          await message.reply({ embeds: [
            createThemeEmbed('Robbery Failed', `You got caught and had to pay a ${penalty} coin fine!`, themeColors.error)
          ]});
        }
      }

      if (command === 'ecoreset') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to reset economy data!', themeColors.error)
          ]});
        }
        
        const user = message.mentions.users.first();
        if (!user) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing User', 'Please mention a user to reset!', themeColors.warning)
          ]});
        }

        botData.economy.set(user.id, {
          wallet: 100,
          bank: 0,
          bio: '',
          items: [],
          job: null,
          level: 1,
          xp: 0,
          badges: [],
          lastBeg: 0,
          lastWork: 0,
          lastRob: 0,
          lastLottery: 0,
          lastDaily: 0,
          lastWeekly: 0,
          lastMonthly: 0,
          bankInterestDate: 0
        });
        
        await message.reply({ embeds: [
          createThemeEmbed('Economy Reset', `${user.username}'s economy data has been reset.`, themeColors.success)
        ]});
      }

      if (command === 'lottery') {
        const subcommand = args[0]?.toLowerCase();
        const eco = getEco(message.author.id);

        if (!subcommand || subcommand === 'info') {
          const now = Date.now();
          const timeUntilDraw = botData.lottery.nextDraw - now;
          const hours = Math.floor(timeUntilDraw / 3600000);
          const minutes = Math.floor((timeUntilDraw % 3600000) / 60000);
          
          const embed = createThemeEmbed('🎟️ Lottery System', 'Join the lottery for a chance to win big!', themeColors.economy)
            .addFields(
              { name: 'Current Pot', value: `${botData.lottery.pot} coins`, inline: true },
              { name: 'Participants', value: botData.lottery.participants.length.toString(), inline: true },
              { name: 'Your Tickets', value: eco.items.filter(i => i === 'goldenticket').length.toString(), inline: true },
              { name: 'Next Draw', value: `${hours}h ${minutes}m`, inline: false },
              { name: 'How to Join', value: 'Use `!lottery join <amount>` to buy tickets (100 coins each)\nOr use `!lottery join free` if you have a Golden Ticket', inline: false },
              { name: 'Your Chance', value: botData.lottery.participants.length > 0 
                ? `You have a ${((eco.items.filter(i => i === 'goldenticket').length + 1) / (botData.lottery.participants.length + 1) * 100).toFixed(2)}% chance to win!` 
                : 'Be the first to join!', inline: false }
            );
          
          return message.reply({ embeds: [embed] });
        }

        if (subcommand === 'join') {
          const amountArg = args[1]?.toLowerCase();
          
          if (amountArg === 'free') {
            if (!eco.items.includes('goldenticket')) {
              return message.reply({ embeds: [
                createThemeEmbed('No Golden Ticket', 'You don\'t have a Golden Ticket to enter for free!', themeColors.error)
              ]});
            }
            
            eco.items = eco.items.filter(i => i !== 'goldenticket');
            botData.lottery.participants.push(message.author.id);
            
            return message.reply({ embeds: [
              createThemeEmbed('Lottery Joined', 'You entered the lottery using your Golden Ticket!', themeColors.success)
            ]});
          }
          
          const amount = parseInt(amountArg);
          if (isNaN(amount)) {
            return message.reply({ embeds: [
              createThemeEmbed('Invalid Amount', 'Please specify how many tickets to buy (100 coins each) or "free" to use a Golden Ticket', themeColors.warning)
            ]});
          }

          const totalCost = amount * 100;
          if (eco.wallet < totalCost) {
            return message.reply({ embeds: [
              createThemeEmbed('Insufficient Funds', `You need ${totalCost} coins to buy ${amount} tickets!`, themeColors.error)
              .addFields(
                { name: 'Your Wallet', value: `${eco.wallet} coins`, inline: true },
                { name: 'Required', value: `${totalCost} coins`, inline: true }
              )
            ]});
          }

          eco.wallet -= totalCost;
          botData.lottery.pot += totalCost;
          for (let i = 0; i < amount; i++) {
            botData.lottery.participants.push(message.author.id);
          }

          return message.reply({ embeds: [
            createThemeEmbed('Lottery Joined', `You bought ${amount} lottery tickets for ${totalCost} coins!`, themeColors.success)
            .addFields(
              { name: 'Current Pot', value: `${botData.lottery.pot} coins`, inline: true },
              { name: 'Your Tickets', value: amount.toString(), inline: true },
              { name: 'Total Participants', value: botData.lottery.participants.length.toString(), inline: true }
            )
          ]});
        }

        if (subcommand === 'draw' && hasPremiumPermissions(message.member)) {
          if (botData.lottery.participants.length === 0) {
            return message.reply({ embeds: [
              createThemeEmbed('No Participants', 'There are no participants in the current lottery!', themeColors.warning)
            ]});
          }

          const winnerIndex = Math.floor(Math.random() * botData.lottery.participants.length);
          const winnerId = botData.lottery.participants[winnerIndex];
          const winner = await client.users.fetch(winnerId);
          const winnerEco = getEco(winnerId);

          winnerEco.wallet += botData.lottery.pot;

          const embed = createThemeEmbed('🎉 Lottery Winner!', `The lottery has been drawn!`, themeColors.success)
            .addFields(
              { name: 'Winner', value: winner.toString(), inline: true },
              { name: 'Prize', value: `${botData.lottery.pot} coins`, inline: true },
              { name: 'Total Tickets', value: botData.lottery.participants.length.toString(), inline: true }
            )
            .setThumbnail(winner.displayAvatarURL());

          await message.channel.send({ embeds: [embed] });

          botData.lottery = {
            participants: [],
            pot: 0,
            lastDraw: Date.now(),
            nextDraw: Date.now() + 86400000 // Next draw in 24 hours
          };
        }
      }
    } catch (error) {
      handleError(error, message);
    }
  });
}

// Ticket system
function setupTicketSystem() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // Set ticket message
      if (command === 'ticket' && args[0] === 'msg') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set up tickets!', themeColors.error)
          ]});
        }
        
        const ticketMsg = args.slice(1).join(' ');
        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].message = ticketMsg;

        await message.reply({ embeds: [
          createThemeEmbed('Ticket Message Set', 'The ticket panel message has been configured.', themeColors.success)
            .addFields({ name: 'Message', value: ticketMsg || 'Not provided' })
        ]});
      }

      // Set ticket options
      if (command === 'setoptions') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set ticket options!', themeColors.error)
          ]});
        }
        
        const options = args.join(' ').split(',').map(opt => opt.trim());
        const formattedOptions = options.map(opt => {
          const [name, emoji] = opt.split(':').map(part => part.trim());
          return { name, emoji: emoji || '🎫' };
        });

        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].options = formattedOptions;

        await message.reply({ embeds: [
          createThemeEmbed('Ticket Options Set', 'The ticket dropdown options have been configured.', themeColors.success)
            .addFields({
              name: 'Options', 
              value: formattedOptions.map(opt => `${opt.emoji} ${opt.name}`).join('\n')
            })
        ]});
      }

      // Set ticket viewer role
      if (command === 'setviewer') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set ticket viewers!', themeColors.error)
          ]});
        }
        
        const role = message.mentions.roles.first();
        if (!role) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Role', 'Please mention a valid role!', themeColors.warning)
          ]});
        }

        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].viewerRole = role.id;

        await message.reply({ embeds: [
          createThemeEmbed('Viewer Role Set', `The role ${role.toString()} can now view all ticket channels.`, themeColors.success)
        ]});
      }

      // Set ticket category
      if (command === 'setticketcategory') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set the ticket category!', themeColors.error)
          ]});
        }
        
        const categoryId = args[0];
        if (!categoryId) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Category', 'Please provide a valid category ID!', themeColors.warning)
          ]});
        }

        botData.ticketSettings[message.guild.id] = botData.ticketSettings[message.guild.id] || {};
        botData.ticketSettings[message.guild.id].categoryId = categoryId;

        await message.reply({ embeds: [
          createThemeEmbed('Category Set', `New tickets will be created under category ID: ${categoryId}`, themeColors.success)
        ]});
      }

      // Deploy ticket panel
      if (command === 'deployticketpanel') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to deploy ticket panels!', themeColors.error)
          ]});
        }
        
        const settings = botData.ticketSettings[message.guild.id];
        if (!settings || !settings.message || !settings.options) {
          return message.reply({ embeds: [
            createThemeEmbed('Incomplete Setup', 'Please set up ticket message and options first!', themeColors.warning)
          ]});
        }

        const selectMenu = new ActionRowBuilder().addComponents(
          new StringSelectMenuBuilder()
            .setCustomId('ticket_type')
            .setPlaceholder('Select a ticket type')
            .addOptions(settings.options.map(opt => ({
              label: opt.name,
              value: opt.name.toLowerCase(),
              emoji: opt.emoji
            })))
        );

        const embed = createThemeEmbed('Create a Ticket', settings.message, themeColors.primary)
          .setFooter({ 
            text: `${message.guild.name} Ticket System`, 
            iconURL: message.guild.iconURL() 
          });

        await message.channel.send({ embeds: [embed], components: [selectMenu] });
        await message.reply({ embeds: [
          createThemeEmbed('Panel Deployed', 'Ticket panel deployed successfully!', themeColors.success)
        ]}).then(msg => setTimeout(() => msg.delete(), 5000));
      }
    } catch (error) {
      handleError(error, message);
    }
  });

  // Ticket creation interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isStringSelectMenu() || interaction.customId !== 'ticket_type') return;

    try {
      await interaction.deferReply({ ephemeral: true });
      const settings = botData.ticketSettings[interaction.guild.id];
      if (!settings) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('Configuration Error', 'Ticket system not configured properly on this server.', themeColors.error)
        ]});
      }

      const ticketType = interaction.values[0];
      const ticketName = `ticket-${ticketType}-${interaction.user.username}-${Date.now().toString().slice(-4)}`;
      const category = interaction.guild.channels.cache.get(settings.categoryId);

      if (!category || category.type !== ChannelType.GuildCategory) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('Category Error', 'Ticket category not found or invalid. Contact server admin.', themeColors.error)
        ]});
      }

      // Create the ticket channel
      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: category.id,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          },
          ...(settings.viewerRole ? [{
            id: settings.viewerRole,
            allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
          }] : [])
        ]
      });

      // Create ticket control buttons
      const buttons = createThemeActionRow([
        createThemeButton('claim_ticket', 'Claim', '🔒'),
        createThemeButton('lock_ticket', 'Lock', '🔐', ButtonStyle.Secondary),
        createThemeButton('close_ticket', 'Close', '❌', ButtonStyle.Danger)
      ]);

      // Create welcome embed
      const welcomeEmbed = createThemeEmbed(
        `${ticketType.charAt(0).toUpperCase() + ticketType.slice(1)} Ticket`,
        `Hello ${interaction.user.toString()}! Support will be with you shortly.\n\nPlease describe your issue in detail.`,
        themeColors.primary
      )
      .addFields(
        { name: 'Ticket Type', value: ticketType, inline: true },
        { name: 'Created By', value: interaction.user.toString(), inline: true }
      )
      .setFooter({ 
        text: `${interaction.guild.name} Ticket System`, 
        iconURL: interaction.guild.iconURL() 
      });

      // Send welcome message to ticket channel
      await ticketChannel.send({ 
        content: `${interaction.user.toString()} ${settings.viewerRole ? `<@&${settings.viewerRole}>` : ''}`,
        embeds: [welcomeEmbed], 
        components: [buttons] 
      });

      // Send success message to user
      await interaction.editReply({ embeds: [
        createThemeEmbed('Ticket Created', `Your ticket has been created: ${ticketChannel.toString()}`, themeColors.success)
      ]});
    } catch (error) {
      handleError(error, interaction);
    }
  });

  // Ticket button interactions
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.channel?.name?.startsWith('ticket-')) return;

    try {
      const ticketChannel = interaction.channel;
      const ticketName = ticketChannel.name;
      const ticketType = ticketName.split('-')[1];
      const creatorId = ticketChannel.permissionOverwrites.cache.find(ow => ow.type === 1)?.id;
      const creator = await client.users.fetch(creatorId).catch(() => null);

      // Claim ticket button
      if (interaction.customId === 'claim_ticket') {
        if (!hasPremiumPermissions(interaction.member)) {
          return interaction.reply({ 
            embeds: [
              createThemeEmbed('Access Denied', 'You need premium permissions to claim tickets!', themeColors.error)
            ], 
            ephemeral: true 
          });
        }

        await ticketChannel.permissionOverwrites.edit(interaction.user.id, {
          ViewChannel: true,
          SendMessages: true
        });

        const claimEmbed = createThemeEmbed('Ticket Claimed', 
          `This ticket has been claimed by ${interaction.user.toString()}`, themeColors.accent)
          .setFooter({ 
            text: 'Please wait for their response', 
            iconURL: interaction.user.displayAvatarURL() 
          });

        await interaction.reply({ embeds: [claimEmbed] });
      }

      // Lock ticket button
      if (interaction.customId === 'lock_ticket') {
        if (!hasPremiumPermissions(interaction.member)) {
          return interaction.reply({ 
            embeds: [
              createThemeEmbed('Access Denied', 'You need premium permissions to lock tickets!', themeColors.error)
            ], 
            ephemeral: true 
          });
        }

        await ticketChannel.permissionOverwrites.edit(creatorId, {
          SendMessages: false
        });

        const lockEmbed = createThemeEmbed('Ticket Locked', 
          `This ticket has been locked by ${interaction.user.toString()}`, themeColors.warning)
          .setFooter({ 
            text: 'Only staff can send messages now', 
            iconURL: interaction.user.displayAvatarURL() 
          });

        await interaction.reply({ embeds: [lockEmbed] });
      }

      // Close ticket button
      if (interaction.customId === 'close_ticket') {
        if (!hasPremiumPermissions(interaction.member)) {
          return interaction.reply({ 
            embeds: [
              createThemeEmbed('Access Denied', 'You need premium permissions to close tickets!', themeColors.error)
            ], 
            ephemeral: true 
          });
        }

        // Ask for close reason
        const reasonEmbed = createThemeEmbed('Close Ticket', 
          'Please provide a reason for closing this ticket (or type "none"):', themeColors.warning);
        
        await interaction.reply({ embeds: [reasonEmbed] });

        // Collect reason
        const filter = m => m.author.id === interaction.user.id;
        const collector = interaction.channel.createMessageCollector({ filter, time: 30000 });

        collector.on('collect', async m => {
          collector.stop();
          const reason = m.content.toLowerCase() === 'none' ? 'No reason provided' : m.content;

          const closeEmbed = createThemeEmbed('Closing Ticket', 
            'This ticket will be closed in 10 seconds...', themeColors.error)
            .addFields({ name: 'Reason', value: reason })
            .setFooter({ 
              text: 'A transcript will be sent to the creator', 
              iconURL: interaction.guild.iconURL() 
            });

          await interaction.editReply({ embeds: [closeEmbed] });
          await m.delete().catch(() => {});

          setTimeout(async () => {
            try {
              const channel = await interaction.guild.channels.fetch(ticketChannel.id).catch(() => null);
              if (!channel) {
                console.log(`Ticket channel ${ticketChannel.id} already deleted`);
                return;
              }

              // Create transcript embed
              const dmEmbed = createThemeEmbed('Ticket Closed', 
                'Your ticket has been closed by staff.', themeColors.info)
                .addFields(
                  { name: '🆔 Ticket ID', value: ticketChannel.id, inline: true },
                  { name: '🟢 Opened By', value: creator?.toString() || 'Unknown', inline: true },
                  { name: '🔴 Closed By', value: interaction.user.toString(), inline: true },
                  { name: '⏰ Open Time', value: new Date(ticketChannel.createdTimestamp).toLocaleString(), inline: true },
                  { name: '🕓 Closed At', value: new Date().toLocaleString(), inline: true },
                  { name: '📝 Close Reason', value: reason, inline: false }
                )
                .setThumbnail(interaction.guild.iconURL());

              try {
                if (creator) await creator.send({ embeds: [dmEmbed] });
              } catch (e) {
                console.log('Could not send DM to ticket creator');
              }

              // Delete the ticket channel
              await ticketChannel.delete('Ticket closed by staff').catch(e => {
                console.error(`Failed to delete ticket channel ${ticketChannel.id}:`, e);
              });
            } catch (error) {
              console.error('Error in ticket closing process:', error);
            }
          }, 10000);
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            interaction.editReply({ 
              embeds: [createThemeEmbed('Timed Out', 'No reason provided, closing ticket...', themeColors.error)]
            });
            
            setTimeout(async () => {
              try {
                const channel = await interaction.guild.channels.fetch(ticketChannel.id).catch(() => null);
                if (!channel) return;

                const dmEmbed = createThemeEmbed('Ticket Closed', 
                  'Your ticket has been closed by staff.', themeColors.info)
                  .addFields(
                    { name: '🆔 Ticket ID', value: ticketChannel.id, inline: true },
                    { name: '🟢 Opened By', value: creator?.toString() || 'Unknown', inline: true },
                    { name: '🔴 Closed By', value: interaction.user.toString(), inline: true },
                    { name: '⏰ Open Time', value: new Date(ticketChannel.createdTimestamp).toLocaleString(), inline: true },
                    { name: '🕓 Closed At', value: new Date().toLocaleString(), inline: true },
                    { name: '📝 Close Reason', value: 'No reason provided', inline: false }
                  )
                  .setThumbnail(interaction.guild.iconURL());

                try {
                  if (creator) await creator.send({ embeds: [dmEmbed] });
                } catch (e) {
                  console.log('Could not send DM to ticket creator');
                }

                await ticketChannel.delete('Ticket closed by staff').catch(console.error);
              } catch (error) {
                console.error('Error in ticket closing process:', error);
              }
            }, 10000);
          }
        });
      }
    } catch (error) {
      handleError(error, interaction);
    }
  });
}

// Application system
function setupApplicationSystem() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // Set application message
      if (command === 'app' && args[0] === 'msg') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set up applications!', themeColors.error)
          ]});
        }
        
        const appMsg = args.slice(1).join(' ');
        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].message = appMsg;

        await message.reply({ embeds: [
          createThemeEmbed('Application Message Set', 'The application panel message has been configured.', themeColors.success)
            .addFields({ name: 'Message', value: appMsg || 'Not provided' })
        ]});
      }

      // Add application options
      if (command === 'addoptions') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set application options!', themeColors.error)
          ]});
        }
        
        const options = args.join(' ').split(',').map(opt => opt.trim());
        const formattedOptions = options.map(opt => {
          // Remove @ symbol if present and split by :
          const cleanOpt = opt.replace(/^@/, '');
          const [name, emoji] = cleanOpt.split(':').map(part => part.trim());
          return { 
            name, 
            emoji: emoji || '📋',
            // Store clean name without @
            cleanName: name.replace(/^@/, '') 
          };
        });

        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].options = formattedOptions;

        await message.reply({ embeds: [
          createThemeEmbed('Application Options Set', 'The application role buttons have been configured.', themeColors.success)
            .addFields({
              name: 'Options', 
              value: formattedOptions.map(opt => `${opt.emoji} ${opt.name}`).join('\n')
            })
        ]});
      }

      // Set application channel
      if (command === 'setappchannel') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set the application channel!', themeColors.error)
          ]});
        }
        
        const channelId = args[0];
        if (!channelId) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Channel', 'Please provide a valid channel ID!', themeColors.warning)
          ]});
        }

        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].channelId = channelId;

        await message.reply({ embeds: [
          createThemeEmbed('Channel Set', `New applications will be sent to channel ID: ${channelId}`, themeColors.success)
        ]});
      }

      // Deploy application panel
      if (command === 'deployapp') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to deploy application panels!', themeColors.error)
          ]});
        }
        
        const settings = botData.applicationSettings[message.guild.id];
        if (!settings || !settings.message || !settings.options) {
          return message.reply({ embeds: [
            createThemeEmbed('Incomplete Setup', 'Please set up application message and options first!', themeColors.warning)
          ]});
        }

        const buttons = createThemeActionRow(
          settings.options.map(opt => 
            createThemeButton(
              `app_${opt.cleanName.toLowerCase()}`, 
              opt.name, 
              opt.emoji
            )
          )
        );

        const embed = createThemeEmbed('Application System', settings.message, themeColors.primary)
          .setFooter({ 
            text: `${message.guild.name} Applications`, 
            iconURL: message.guild.iconURL() 
          });

        await message.channel.send({ embeds: [embed], components: [buttons] });
        await message.reply({ embeds: [
          createThemeEmbed('Panel Deployed', 'Application panel deployed successfully!', themeColors.success)
        ]}).then(msg => setTimeout(() => msg.delete(), 5000));
      }

      // Set application questions
      if (command.startsWith('ques')) {
        const questionNum = parseInt(command.replace('ques', ''));
        if (isNaN(questionNum)) return;

        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to set application questions!', themeColors.error)
          ]});
        }
        
        const question = args.join(' ');
        botData.applicationSettings[message.guild.id] = botData.applicationSettings[message.guild.id] || {};
        botData.applicationSettings[message.guild.id].questions = botData.applicationSettings[message.guild.id].questions || [];
        botData.applicationSettings[message.guild.id].questions[questionNum - 1] = question;

        await message.reply({ embeds: [
          createThemeEmbed(`Question ${questionNum} Set`, 'This question will be asked to applicants.', themeColors.success)
            .addFields({ name: 'Question', value: question })
        ]});
      }
    } catch (error) {
      handleError(error, message);
    }
  });

  // Application button interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('app_')) return;

    try {
      await interaction.deferReply({ ephemeral: true });
      const settings = botData.applicationSettings[interaction.guild.id];
      if (!settings || !settings.questions || settings.questions.length === 0) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('Configuration Error', 'Application system not properly configured on this server.', themeColors.error)
        ]});
      }

      const roleName = interaction.customId.replace('app_', '');
      // Find role by name (case insensitive, without @ symbol)
      const role = interaction.guild.roles.cache.find(r => 
        r.name.toLowerCase() === roleName.toLowerCase()
      );
      
      if (!role) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('Role Error', 
            `The role "${roleName}" doesn't exist. ` +
            'Please contact an admin to fix this.', 
            themeColors.error)
        ]});
      }

      // Store application data with role ID and name
      botData.applicationSettings[interaction.user.id] = {
        guildId: interaction.guild.id,
        roleId: role.id,
        roleName: role.name,
        answers: [],
        currentQuestion: 0
      };

      try {
        // Send first question via DM
        const questionEmbed = createThemeEmbed(
          `Application for ${role.name}`,
          settings.questions[0],
          themeColors.primary
        )
        .setFooter({ 
          text: 'Reply with your answer. Type "cancel" to stop.', 
          iconURL: interaction.guild.iconURL() 
        });

        await interaction.user.send({ embeds: [questionEmbed] });
        await interaction.editReply({ embeds: [
          createThemeEmbed('Check DMs', 'Please check your DMs for the first question!', themeColors.success)
        ]});
      } catch (e) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('DM Error', 'I couldn\'t send you a DM. Please enable DMs and try again.', themeColors.error)
        ]});
      }

      // Set up DM collector for application answers
      const filter = m => m.author.id === interaction.user.id && m.channel.type === ChannelType.DM;
      const collector = interaction.client.channels.cache
        .find(c => c.type === ChannelType.DM && c.recipient?.id === interaction.user.id)
        ?.createMessageCollector({ filter, time: 600000 });

      if (!collector) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('Error', 'Failed to set up question collector. Please try again.', themeColors.error)
        ]});
      }

      collector.on('collect', async m => {
        if (m.content.toLowerCase() === 'cancel') {
          collector.stop();
          await interaction.user.send({ embeds: [
            createThemeEmbed('Application Cancelled', 'Your application has been cancelled.', themeColors.error)
          ]});
          delete botData.applicationSettings[interaction.user.id];
          return;
        }

        const appData = botData.applicationSettings[interaction.user.id];
        appData.answers.push(m.content);
        appData.currentQuestion++;

        if (appData.currentQuestion < settings.questions.length) {
          // Send next question
          const nextQuestionEmbed = createThemeEmbed(
            `Question ${appData.currentQuestion + 1}`,
            settings.questions[appData.currentQuestion],
            themeColors.primary
          )
          .setFooter({ 
            text: 'Reply with your answer. Type "cancel" to stop.', 
            iconURL: interaction.guild.iconURL() 
          });

          await interaction.user.send({ embeds: [nextQuestionEmbed] });
        } else {
          // All questions answered, submit application
          collector.stop();
          await submitApplication(interaction, appData);
        }
      });

      collector.on('end', (collected, reason) => {
        if (reason === 'time') {
          interaction.user.send({ embeds: [
            createThemeEmbed('Application Timed Out', 'You took too long to answer the questions.', themeColors.error)
          ]}).catch(() => {});
        }
        delete botData.applicationSettings[interaction.user.id];
      });
    } catch (error) {
      handleError(error, interaction);
    }
  });

  // Submit application function
  async function submitApplication(interaction, appData) {
    try {
      const settings = botData.applicationSettings[appData.guildId];
      const guild = client.guilds.cache.get(appData.guildId);
      const appChannel = guild.channels.cache.get(settings.channelId);

      if (!appChannel) {
        await interaction.user.send({ embeds: [
          createThemeEmbed('Error', 'Application channel not found. Contact server admin.', themeColors.error)
        ]});
        return;
      }

      // Create application review buttons
      const buttons = createThemeActionRow([
        createThemeButton('accept_app', 'Accept', '✅', ButtonStyle.Success),
        createThemeButton('reject_app', 'Reject', '❌', ButtonStyle.Danger)
      ]);

      // Create application embed
      const appEmbed = createThemeEmbed(
        `Application for ${appData.roleName}`,
        `Applicant: ${interaction.user.toString()}`,
        themeColors.primary
      )
      .setThumbnail(interaction.user.displayAvatarURL());

      // Add all questions and answers
      settings.questions.forEach((question, i) => {
        appEmbed.addFields({ 
          name: `❓ ${question}`, 
          value: appData.answers[i] || 'No answer provided' 
        });
      });

      // Send application to review channel
      await appChannel.send({ 
        content: `New application from ${interaction.user.toString()} for ${appData.roleName}`,
        embeds: [appEmbed], 
        components: [buttons] 
      });

      // Notify applicant
      await interaction.user.send({ embeds: [
        createThemeEmbed('Application Submitted', 
          `Your application for ${appData.roleName} has been submitted successfully.`, themeColors.success)
          .setFooter({ 
            text: 'You will be notified when a decision is made.', 
            iconURL: guild.iconURL() 
          })
      ]});
    } catch (error) {
      handleError(error, interaction);
    }
  }

  // Application review button interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !['accept_app', 'reject_app'].includes(interaction.customId)) return;
    if (!interaction.message.embeds[0].title.includes('Application for')) return;

    try {
      await interaction.deferReply({ ephemeral: true });
      
      const appEmbed = interaction.message.embeds[0];
      const applicantId = appEmbed.description.match(/<@!?(\d+)>/)[1];
      const applicant = interaction.guild.members.cache.get(applicantId);
      
      if (!applicant) {
        return interaction.editReply({ embeds: [
          createThemeEmbed('Error', 'Could not find the applicant in this server.', themeColors.error)
        ]});
      }

      // Extract role name from the embed title
      const roleName = appEmbed.title.replace('Application for ', '');
      const role = interaction.guild.roles.cache.find(r => r.name === roleName);

      // Accept application
      if (interaction.customId === 'accept_app') {
        await applicant.roles.add(role);

        const acceptEmbed = createThemeEmbed(
          `Application Accepted!`,
          `Congratulations! Your application for ${role.name} in ${interaction.guild.name} has been accepted.`,
          themeColors.success
        )
        .addFields(
          { name: 'Accepted By', value: interaction.user.toString(), inline: true },
          { name: 'Accepted At', value: new Date().toLocaleString(), inline: true }
        )
        .setThumbnail(interaction.guild.iconURL());

        try {
          await applicant.send({ embeds: [acceptEmbed] });
        } catch (e) {
          console.log('Could not send DM to applicant');
        }

        await interaction.editReply({ embeds: [
          createThemeEmbed('Success', 'Application accepted and role assigned!', themeColors.success)
        ]});
      } 
      // Reject application
      else {
        const rejectEmbed = createThemeEmbed(
          `Application Rejected`,
          `Your application for ${role.name} in ${interaction.guild.name} has been rejected.`,
          themeColors.error
        )
        .addFields(
          { name: 'Rejected By', value: interaction.user.toString(), inline: true },
          { name: 'Rejected At', value: new Date().toLocaleString(), inline: true }
        )
        .setFooter({ 
          text: 'You may reapply if you wish', 
          iconURL: interaction.guild.iconURL() 
        });

        try {
          await applicant.send({ embeds: [rejectEmbed] });
        } catch (e) {
          console.log('Could not send DM to applicant');
        }

        await interaction.editReply({ embeds: [
          createThemeEmbed('Success', 'Application rejected and applicant notified!', themeColors.success)
        ]});
      }

      // Update the application message
      const updatedEmbed = new EmbedBuilder(appEmbed.data)
        .setColor(interaction.customId === 'accept_app' ? themeColors.success : themeColors.error)
        .setTitle(`📋 ${interaction.customId === 'accept_app' ? '✅ Accepted' : '❌ Rejected'}: ${roleName}`);

      await interaction.message.edit({ embeds: [updatedEmbed], components: [] });
    } catch (error) {
      handleError(error, interaction);
    }
  });
}

// Mini-games system
function setupMiniGames() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // Rock Paper Scissors game
      if (command === 'rps') {
        const opponent = message.mentions.users.first();
        if (!opponent) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Opponent', 'Please mention a user to play with!', themeColors.warning)
          ]});
        }
        
        if (opponent.bot) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Opponent', 'You can\'t play with bots!', themeColors.warning)
          ]});
        }
        
        if (opponent.id === message.author.id) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Opponent', 'You can\'t play with yourself!', themeColors.warning)
          ]});
        }

        const gameId = `${message.author.id}-${opponent.id}-rps`;
        if (botData.games.has(gameId)) {
          return message.reply({ embeds: [
            createThemeEmbed('Game Exists', 'There\'s already an ongoing game between these players!', themeColors.warning)
          ]});
        }

        botData.games.set(gameId, {
          players: [message.author.id, opponent.id],
          choices: {}
        });

        // Create RPS buttons
        const buttons = createThemeActionRow([
          createThemeButton('rps_rock', 'Rock', '🪨'),
          createThemeButton('rps_paper', 'Paper', '📄'),
          createThemeButton('rps_scissors', 'Scissors', '✂️')
        ]);

        const embed = createThemeEmbed(
          'Rock, Paper, Scissors',
          `${message.author.toString()} has challenged ${opponent.toString()} to a game!\n\nBoth players must select their choice.`,
          themeColors.games
        )
        .setFooter({ 
          text: 'Game will timeout in 60 seconds', 
          iconURL: message.guild.iconURL() 
        });

        const gameMessage = await message.channel.send({ 
          content: `${message.author.toString()} ${opponent.toString()}`,
          embeds: [embed], 
          components: [buttons] 
        });

        // Set timeout for game
        setTimeout(() => {
          if (botData.games.has(gameId)) {
            botData.games.delete(gameId);
            embed.setColor(themeColors.error)
              .setDescription('⏰ Game timed out due to inactivity.');
            gameMessage.edit({ embeds: [embed], components: [] }).catch(console.error);
          }
        }, 60000);
      }

      // Number guessing game
      if (command === 'guess') {
        const gameId = `${message.author.id}-guess`;
        if (botData.games.has(gameId)) {
          return message.reply({ embeds: [
            createThemeEmbed('Game Exists', 'You already have an ongoing guessing game!', themeColors.warning)
          ]});
        }

        const number = Math.floor(Math.random() * 100) + 1;
        botData.games.set(gameId, {
          number: number,
          attempts: 0
        });

        const embed = createThemeEmbed(
          'Number Guessing Game',
          'I\'ve picked a number between 1 and 100. Try to guess it!',
          themeColors.games
        )
        .setFooter({ 
          text: 'Type your guesses in chat. Game will timeout in 2 minutes.', 
          iconURL: message.guild.iconURL() 
        });

        await message.channel.send({ embeds: [embed] });

        // Set up guess collector
        const filter = m => m.author.id === message.author.id && !isNaN(m.content);
        const collector = message.channel.createMessageCollector({ filter, time: 120000 });

        collector.on('collect', async m => {
          const guess = parseInt(m.content);
          const game = botData.games.get(gameId);
          game.attempts++;

          if (guess === game.number) {
            const winEmbed = createThemeEmbed(
              'You Win!',
              `You guessed the number ${game.number} correctly in ${game.attempts} attempts!`,
              themeColors.success
            )
            .setFooter({ 
              text: 'Game over', 
              iconURL: message.author.displayAvatarURL() 
            });

            await message.channel.send({ embeds: [winEmbed] });
            botData.games.delete(gameId);
            collector.stop();
          } else {
            const hint = guess < game.number ? 'higher' : 'lower';
            await message.channel.send({ embeds: [
              createThemeEmbed('Wrong Guess', `Try a ${hint} number.`, themeColors.warning)
            ]});
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            const game = botData.games.get(gameId);
            if (game) {
              const timeoutEmbed = createThemeEmbed(
                'Game Over',
                `Time's up! The number was ${game.number}.`,
                themeColors.error
              )
              .setFooter({ 
                text: 'Better luck next time!', 
                iconURL: message.guild.iconURL() 
              });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }
        });
      }

      // Math challenge game
      if (command === 'math') {
        const operations = ['+', '-', '*', '/'];
        const operation = operations[Math.floor(Math.random() * operations.length)];
        let num1, num2, answer;

        switch (operation) {
          case '+':
            num1 = Math.floor(Math.random() * 100);
            num2 = Math.floor(Math.random() * 100);
            answer = num1 + num2;
            break;
          case '-':
            num1 = Math.floor(Math.random() * 100);
            num2 = Math.floor(Math.random() * num1);
            answer = num1 - num2;
            break;
          case '*':
            num1 = Math.floor(Math.random() * 15);
            num2 = Math.floor(Math.random() * 15);
            answer = num1 * num2;
            break;
          case '/':
            num2 = Math.floor(Math.random() * 10) + 1;
            answer = Math.floor(Math.random() * 10);
            num1 = num2 * answer;
            break;
        }

        const gameId = `${message.author.id}-math`;
        botData.games.set(gameId, {
          answer: answer,
          timeout: setTimeout(() => {
            if (botData.games.has(gameId)) {
              const timeoutEmbed = createThemeEmbed(
                'Time\'s Up!',
                `The correct answer was ${answer}.`,
                themeColors.error
              )
              .setFooter({ 
                text: 'Better luck next time!', 
                iconURL: message.guild.iconURL() 
              });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }, 15000)
        });

        const embed = createThemeEmbed(
          'Math Challenge',
          `Solve this problem: **${num1} ${operation} ${num2} = ?**`,
          themeColors.games
        )
        .setFooter({ 
          text: 'You have 15 seconds to answer!', 
          iconURL: message.guild.iconURL() 
        });

        await message.channel.send({ embeds: [embed] });

        // Set up answer collector
        const filter = m => m.author.id === message.author.id && !isNaN(m.content);
        const collector = message.channel.createMessageCollector({ filter, time: 15000 });

        collector.on('collect', async m => {
          const guess = parseInt(m.content);
          const game = botData.games.get(gameId);

          if (guess === game.answer) {
            clearTimeout(game.timeout);
            const winEmbed = createThemeEmbed(
              'Correct!',
              `You solved it! ${num1} ${operation} ${num2} = ${answer}`,
              themeColors.success
            )
            .setFooter({ 
              text: 'Great job!', 
              iconURL: message.author.displayAvatarURL() 
            });

            await message.channel.send({ embeds: [winEmbed] });
            botData.games.delete(gameId);
            collector.stop();
          } else {
            await message.channel.send({ embeds: [
              createThemeEmbed('Incorrect!', 'Try again.', themeColors.warning)
            ]});
          }
        });
      }

      // Trivia game
      if (command === 'trivia') {
        const triviaQuestions = [
          {
            question: "What is the capital of France?",
            options: ["London", "Berlin", "Paris", "Madrid"],
            answer: 2
          },
          {
            question: "Which planet is known as the Red Planet?",
            options: ["Venus", "Mars", "Jupiter", "Saturn"],
            answer: 1
          },
          {
            question: "How many continents are there?",
            options: ["5", "6", "7", "8"],
            answer: 2
          },
          {
            question: "Who painted the Mona Lisa?",
            options: ["Vincent van Gogh", "Pablo Picasso", "Leonardo da Vinci", "Michelangelo"],
            answer: 2
          },
          {
            question: "What is the largest ocean on Earth?",
            options: ["Atlantic", "Indian", "Arctic", "Pacific"],
            answer: 3
          }
        ];

        const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
        const gameId = `${message.author.id}-trivia`;

        botData.games.set(gameId, {
          answer: question.answer,
          timeout: setTimeout(() => {
            if (botData.games.has(gameId)) {
              const timeoutEmbed = createThemeEmbed(
                'Time\'s Up!',
                `The correct answer was: **${question.options[question.answer]}`,
                themeColors.error
              )
              .setFooter({ 
                text: 'Better luck next time!', 
                iconURL: message.guild.iconURL() 
              });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }, 15000)
        });

        // Create trivia buttons
        const buttons = createThemeActionRow(
          question.options.map((option, index) => 
            createThemeButton(
              `trivia_${index}`, 
              option, 
              null
            )
          )
        );

        const embed = createThemeEmbed(
          'Trivia Question',
          question.question,
          themeColors.games
        )
        .setFooter({ 
          text: 'You have 15 seconds to answer!', 
          iconURL: message.guild.iconURL() 
        });

        await message.channel.send({ embeds: [embed], components: [buttons] });
      }

      // Typing test game
      if (command === 'type') {
        const sentences = [
          "The quick brown fox jumps over the lazy dog.",
          "Pack my box with five dozen liquor jugs.",
          "How vexingly quick daft zebras jump!",
          "Bright vixens jump; dozy fowl quack.",
          "Sphinx of black quartz, judge my vow."
        ];

        const sentence = sentences[Math.floor(Math.random() * sentences.length)];
        const gameId = `${message.author.id}-type`;

        botData.games.set(gameId, {
          sentence: sentence,
          startTime: Date.now()
        });

        const embed = createThemeEmbed(
          'Typing Speed Test',
          `Type the following sentence as fast as you can:\n\n**${sentence}**`,
          themeColors.games
        )
        .setFooter({ 
          text: 'The timer starts now!', 
          iconURL: message.guild.iconURL() 
        });

        await message.channel.send({ embeds: [embed] });

        // Set up typing test collector
        const filter = m => m.author.id === message.author.id;
        const collector = message.channel.createMessageCollector({ filter, time: 60000 });

        collector.on('collect', async m => {
          if (m.content === sentence) {
            const game = botData.games.get(gameId);
            const timeTaken = (Date.now() - game.startTime) / 1000;
            const wpm = Math.round((sentence.split(' ').length / timeTaken) * 60);

            const resultEmbed = createThemeEmbed(
              'Test Completed!',
              `You typed the sentence correctly in ${timeTaken.toFixed(2)} seconds!`,
              themeColors.success
            )
            .addFields(
              { name: 'Words Per Minute', value: wpm.toString(), inline: true },
              { name: 'Characters', value: sentence.length.toString(), inline: true }
            )
            .setFooter({ 
              text: 'Great job!', 
              iconURL: message.author.displayAvatarURL() 
            });

            await message.channel.send({ embeds: [resultEmbed] });
            botData.games.delete(gameId);
            collector.stop();
          } else {
            await message.channel.send({ embeds: [
              createThemeEmbed('Try Again', 'That\'s not quite right. Try again!', themeColors.warning)
            ]});
          }
        });

        collector.on('end', (collected, reason) => {
          if (reason === 'time') {
            if (botData.games.has(gameId)) {
              const timeoutEmbed = createThemeEmbed(
                'Time\'s Up!',
                'You took too long to complete the typing test.',
                themeColors.error
              )
              .setFooter({ 
                text: 'Try again!', 
                iconURL: message.guild.iconURL() 
              });

              message.channel.send({ embeds: [timeoutEmbed] });
              botData.games.delete(gameId);
            }
          }
        });
      }

      // Tic Tac Toe game
      if (command === 'tictactoe' || command === 'ttt') {
        const opponent = message.mentions.users.first();
        if (!opponent) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Opponent', 'Please mention a user to play with!', themeColors.warning)
          ]});
        }
        
        if (opponent.bot) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Opponent', 'You can\'t play with bots!', themeColors.warning)
          ]});
        }
        
        if (opponent.id === message.author.id) {
          return message.reply({ embeds: [
            createThemeEmbed('Invalid Opponent', 'You can\'t play with yourself!', themeColors.warning)
          ]});
        }

        const gameId = `${message.author.id}-${opponent.id}-ttt`;
        if (botData.games.has(gameId)) {
          return message.reply({ embeds: [
            createThemeEmbed('Game Exists', 'There\'s already an ongoing game between these players!', themeColors.warning)
          ]});
        }

        // Initialize game board
        const board = [
          [null, null, null],
          [null, null, null],
          [null, null, null]
        ];

        botData.games.set(gameId, {
          players: [message.author.id, opponent.id],
          board: board,
          currentPlayer: 0,
          lastMove: Date.now()
        });

        // Create initial game embed
        const embed = createThemeEmbed(
          'Tic Tac Toe',
          `${message.author.toString()} (❌) vs ${opponent.toString()} (⭕)\n\nIt's ${message.author.toString()}'s turn!`,
          themeColors.games
        )
        .setFooter({ 
          text: 'Game will timeout in 5 minutes of inactivity', 
          iconURL: message.guild.iconURL() 
        });

        // Create game board buttons
        const rows = [];
        for (let i = 0; i < 3; i++) {
          const row = new ActionRowBuilder();
          for (let j = 0; j < 3; j++) {
            row.addComponents(
              new ButtonBuilder()
                .setCustomId(`ttt_${i}_${j}`)
                .setLabel(' ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji('⬜')
            );
          }
          rows.push(row);
        }

        const gameMessage = await message.channel.send({ 
          content: `${message.author.toString()} ${opponent.toString()}`,
          embeds: [embed], 
          components: rows 
        });

        // Set timeout for game
        const timeout = setTimeout(() => {
          if (botData.games.has(gameId)) {
            botData.games.delete(gameId);
            embed.setColor(themeColors.error)
              .setDescription('⏰ Game timed out due to inactivity.');
            gameMessage.edit({ embeds: [embed], components: [] }).catch(console.error);
          }
        }, 300000);

        // Store timeout reference
        botData.games.get(gameId).timeout = timeout;
      }
    } catch (error) {
      handleError(error, message);
    }
  });

  // RPS button interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('rps_')) return;

    try {
      const choice = interaction.customId.replace('rps_', '');
      const gameId = [...botData.games.keys()].find(key => 
        key.includes(interaction.user.id) && key.endsWith('-rps')
      );

      if (!gameId) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Game Error', 'No active game found or game expired.', themeColors.error)
          ], 
          ephemeral: true 
        });
      }

      const game = botData.games.get(gameId);
      if (!game.players.includes(interaction.user.id)) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Game Error', 'You\'re not part of this game!', themeColors.error)
          ], 
          ephemeral: true 
        });
      }

      game.choices[interaction.user.id] = choice;
      await interaction.deferUpdate();

      // If both players have chosen
      if (Object.keys(game.choices).length === 2) {
        const [player1, player2] = game.players;
        const choice1 = game.choices[player1];
        const choice2 = game.choices[player2];

        let result;
        if (choice1 === choice2) {
          result = 'It\'s a tie!';
        } else if (
          (choice1 === 'rock' && choice2 === 'scissors') ||
          (choice1 === 'paper' && choice2 === 'rock') ||
          (choice1 === 'scissors' && choice2 === 'paper')
        ) {
          result = `<@${player1}> wins!`;
        } else {
          result = `<@${player2}> wins!`;
        }

        const getEmoji = c => {
          switch (c) {
            case 'rock': return '🪨 Rock';
            case 'paper': return '📄 Paper';
            case 'scissors': return '✂️ Scissors';
            default: return c;
          }
        };

        const embed = createThemeEmbed(
          'Game Results',
          `${interaction.client.users.cache.get(player1).toString()} chose ${getEmoji(choice1)}\n${interaction.client.users.cache.get(player2).toString()} chose ${getEmoji(choice2)}\n\n${result}`,
          themeColors.success
        )
        .setFooter({ 
          text: 'Thanks for playing!', 
          iconURL: interaction.guild.iconURL() 
        });

        await interaction.message.edit({ embeds: [embed], components: [] });
        botData.games.delete(gameId);
      }
    } catch (error) {
      handleError(error, interaction);
    }
  });

  // Trivia button interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('trivia_')) return;

    try {
      const answerIndex = parseInt(interaction.customId.replace('trivia_', ''));
      const gameId = `${interaction.user.id}-trivia`;
      const game = botData.games.get(gameId);

      if (!game) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Game Error', 'No active trivia game found or game expired.', themeColors.error)
          ], 
          ephemeral: true 
        });
      }

      clearTimeout(game.timeout);
      await interaction.deferUpdate();

      if (answerIndex === game.answer) {
        const winEmbed = createThemeEmbed(
          'Correct Answer!',
          'You got it right! 🎉',
          themeColors.success
        )
        .setFooter({ 
          text: 'Well done!', 
          iconURL: interaction.user.displayAvatarURL() 
        });

        await interaction.message.edit({ embeds: [winEmbed], components: [] });
      } else {
        const loseEmbed = createThemeEmbed(
          'Wrong Answer!',
          'Better luck next time!',
          themeColors.error
        )
        .setFooter({ 
          text: 'Keep trying!', 
          iconURL: interaction.guild.iconURL() 
        });

        await interaction.message.edit({ embeds: [loseEmbed], components: [] });
      }

      botData.games.delete(gameId);
    } catch (error) {
      handleError(error, interaction);
    }
  });

  // Tic Tac Toe button interaction
  client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() || !interaction.customId.startsWith('ttt_')) return;

    try {
      const [_, row, col] = interaction.customId.split('_');
      const gameId = [...botData.games.keys()].find(key => 
        key.includes(interaction.user.id) && key.endsWith('-ttt')
      );

      if (!gameId) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Game Error', 'No active game found or game expired.', themeColors.error)
          ], 
          ephemeral: true 
        });
      }

      const game = botData.games.get(gameId);
      
      // Check if it's the player's turn
      const playerIndex = game.players.indexOf(interaction.user.id);
      if (playerIndex === -1) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Game Error', 'You\'re not part of this game!', themeColors.error)
          ], 
          ephemeral: true 
        });
      }

      if (playerIndex !== game.currentPlayer) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Not Your Turn', 'Please wait for your turn!', themeColors.warning)
          ], 
          ephemeral: true 
        });
      }

      // Check if the cell is already taken
      if (game.board[row][col] !== null) {
        return interaction.reply({ 
          embeds: [
            createThemeEmbed('Invalid Move', 'That cell is already taken!', themeColors.warning)
          ], 
          ephemeral: true 
        });
      }

      // Make the move
      game.board[row][col] = playerIndex;
      game.lastMove = Date.now();

      // Check for winner
      const winner = checkTicTacToeWinner(game.board);
      if (winner !== null || isBoardFull(game.board)) {
        // Game over
        clearTimeout(game.timeout);
        botData.games.delete(gameId);

        let result;
        if (winner !== null) {
          result = `${interaction.client.users.cache.get(game.players[winner]).toString()} wins!`;
        } else {
          result = "It's a tie!";
        }

        // Update board display
        const rows = [];
        for (let i = 0; i < 3; i++) {
          const actionRow = new ActionRowBuilder();
          for (let j = 0; j < 3; j++) {
            const cell = game.board[i][j];
            let emoji = '⬜';
            if (cell === 0) emoji = '❌';
            if (cell === 1) emoji = '⭕';

            actionRow.addComponents(
              new ButtonBuilder()
                .setCustomId(`ttt_${i}_${j}`)
                .setLabel(' ')
                .setStyle(ButtonStyle.Secondary)
                .setEmoji(emoji)
                .setDisabled(true)
            );
          }
          rows.push(actionRow);
        }

        const embed = createThemeEmbed(
          'Tic Tac Toe - Game Over',
          `${interaction.client.users.cache.get(game.players[0]).toString()} (❌) vs ${interaction.client.users.cache.get(game.players[1]).toString()} (⭕)\n\n${result}`,
          winner !== null ? themeColors.success : themeColors.info
        );

        await interaction.message.edit({ 
          embeds: [embed], 
          components: rows 
        });

        return;
      }

      // Switch player
      game.currentPlayer = game.currentPlayer === 0 ? 1 : 0;

      // Update board display
      const rows = [];
      for (let i = 0; i < 3; i++) {
        const actionRow = new ActionRowBuilder();
        for (let j = 0; j < 3; j++) {
          const cell = game.board[i][j];
          let emoji = '⬜';
          if (cell === 0) emoji = '❌';
          if (cell === 1) emoji = '⭕';

          actionRow.addComponents(
            new ButtonBuilder()
              .setCustomId(`ttt_${i}_${j}`)
              .setLabel(' ')
              .setStyle(ButtonStyle.Secondary)
              .setEmoji(emoji)
              .setDisabled(cell !== null)
          );
        }
        rows.push(actionRow);
      }

      const embed = createThemeEmbed(
        'Tic Tac Toe',
        `${interaction.client.users.cache.get(game.players[0]).toString()} (❌) vs ${interaction.client.users.cache.get(game.players[1]).toString()} (⭕)\n\nIt's ${interaction.client.users.cache.get(game.players[game.currentPlayer]).toString()}'s turn!`,
        themeColors.games
      );

      await interaction.message.edit({ 
        embeds: [embed], 
        components: rows 
      });

      await interaction.deferUpdate();
    } catch (error) {
      handleError(error, interaction);
    }
  });

  // Helper function to check Tic Tac Toe winner
  function checkTicTacToeWinner(board) {
    // Check rows
    for (let i = 0; i < 3; i++) {
      if (board[i][0] !== null && board[i][0] === board[i][1] && board[i][1] === board[i][2]) {
        return board[i][0];
      }
    }
    
    // Check columns
    for (let j = 0; j < 3; j++) {
      if (board[0][j] !== null && board[0][j] === board[1][j] && board[1][j] === board[2][j]) {
        return board[0][j];
      }
    }
    
    // Check diagonals
    if (board[0][0] !== null && board[0][0] === board[1][1] && board[1][1] === board[2][2]) {
      return board[0][0];
    }
    if (board[0][2] !== null && board[0][2] === board[1][1] && board[1][1] === board[2][0]) {
      return board[0][2];
    }
    
    return null;
  }

  // Helper function to check if board is full
  function isBoardFull(board) {
    for (let i = 0; i < 3; i++) {
      for (let j = 0; j < 3; j++) {
        if (board[i][j] === null) return false;
      }
    }
    return true;
  }
}

// DM and embed tools
function setupDmAndEmbedTools() {
  client.on('messageCreate', async message => {
    if (!message.content.startsWith('!') || message.author.bot) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
      // DM a role
      if (command === 'dm') {
        if (!hasPremiumPermissions(message.member)) {
          return message.reply({ embeds: [
            createThemeEmbed('Access Denied', 'You need premium permissions to DM roles!', themeColors.error)
          ]});
        }
        
        const role = message.mentions.roles.first();
        if (!role) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Role', 'Please mention a role to DM!', themeColors.warning)
          ]});
        }

        const dmMessage = args.slice(1).join(' ');
        if (!dmMessage) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Message', 'Please provide a message to send!', themeColors.warning)
          ]});
        }

        const members = role.members.filter(m => !m.user.bot);
        if (members.size === 0) {
          return message.reply({ embeds: [
            createThemeEmbed('No Members', 'That role has no members to DM!', themeColors.warning)
          ]});
        }

        const confirmEmbed = createThemeEmbed(
          'Confirm DM Send',
          `You are about to DM **${members.size}** members of ${role.toString()}.\n\n**Message:**\n${dmMessage}`,
          themeColors.warning
        )
        .setFooter({ 
          text: 'This action cannot be undone', 
          iconURL: message.guild.iconURL() 
        });

        const confirmButtons = createThemeActionRow([
          createThemeButton('confirm_dm', 'Confirm', '✅', ButtonStyle.Success),
          createThemeButton('cancel_dm', 'Cancel', '❌', ButtonStyle.Danger)
        ]);

        const confirmation = await message.reply({ 
          embeds: [confirmEmbed], 
          components: [confirmButtons] 
        });

        const filter = i => i.user.id === message.author.id;
        const collector = confirmation.createMessageComponentCollector({ filter, time: 60000 });

        collector.on('collect', async i => {
          if (i.customId === 'confirm_dm') {
            await i.deferUpdate();
            let successCount = 0;
            let failCount = 0;

            for (const [, member] of members) {
              try {
                const dmEmbed = createThemeEmbed(
                  `Message from ${message.guild.name}`,
                  dmMessage,
                  themeColors.primary
                )
                .setFooter({ 
                  text: `Sent by ${message.author.tag}`, 
                  iconURL: message.guild.iconURL() 
                });

                await member.send({ embeds: [dmEmbed] });
                successCount++;
              } catch (e) {
                failCount++;
              }
            }

            const resultEmbed = createThemeEmbed(
              'DM Sent',
              `Successfully sent to ${successCount} members. ${failCount > 0 ? `${failCount} failed.` : ''}`,
              themeColors.success
            )
            .setFooter({ 
              text: 'DM operation completed', 
              iconURL: message.guild.iconURL() 
            });

            await confirmation.edit({ embeds: [resultEmbed], components: [] });
          } else {
            await i.update({ 
              embeds: [
                createThemeEmbed('Operation Cancelled', 'DM sending cancelled.', themeColors.error)
              ], 
              components: [] 
            });
          }
          collector.stop();
        });

        collector.on('end', () => {
          if (!collector.ended) {
            confirmation.edit({ 
              embeds: [
                createThemeEmbed('Timed Out', 'DM confirmation timed out.', themeColors.error)
              ], 
              components: [] 
            }).catch(console.error);
          }
        });
      }

      // Create embed
      if (command === 'embed') {
        const color = args.shift();
        if (!color) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Color', 'Please provide a color (hex or name)!', themeColors.warning)
          ]});
        }

        const embedMessage = args.join(' ');
        if (!embedMessage) {
          return message.reply({ embeds: [
            createThemeEmbed('Missing Message', 'Please provide a message for the embed!', themeColors.warning)
          ]});
        }

        let embedColor;
        if (color.startsWith('#')) {
          embedColor = color;
        } else {
          const colorMap = {
            red: '#FF0000',
            green: '#00FF00',
            blue: '#0000FF',
            yellow: '#FFFF00',
            purple: '#800080',
            pink: '#FFC0CB',
            orange: '#FFA500',
            black: '#000000',
            white: '#FFFFFF'
          };
          embedColor = colorMap[color.toLowerCase()] || themeColors.primary;
        }

        const embed = createThemeEmbed('', embedMessage, embedColor)
          .setFooter({ 
            text: `Sent by ${message.author.tag}`, 
            iconURL: message.author.displayAvatarURL() 
          });

        await message.channel.send({ embeds: [embed] });
        await message.delete().catch(console.error);
      }
    } catch (error) {
      handleError(error, message);
    }
  });
}

// Utility commands
function setupUtilityCommands() {
  client.on('messageCreate', async (message) => {
    if (!message.content.startsWith('!') || message.author.bot) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const isOwner = message.author.id === '1202998273376522331';

    try {
      // Premium role management
      if (command === 'prems') {
        if (!isOwner && !message.member.permissions.has(PermissionFlagsBits.Administrator)) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Access Denied')
                .setDescription('You need administrator permissions to set premium roles!')
            ]
          });
        }

        const role = message.mentions.roles.first();
        if (!role) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#FFFF00')
                .setTitle('⚠️ Missing Role')
                .setDescription('Please mention a role to give premium permissions!')
            ]
          });
        }

        botData.premiumRoles.set(message.guild.id, [
          ...(botData.premiumRoles.get(message.guild.id) || []),
          role.id
        ]);

        return message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#00FF00')
              .setTitle('✅ Premium Role Added')
              .setDescription(`Members with ${role.toString()} now have full access to all bot commands and features.`)
              .setFooter({ 
                text: 'Use this command again to add more roles',
                iconURL: message.guild.iconURL() 
              })
          ]
        });
      }

      // Help command
      if (command === 'help') {
        const embed = new EmbedBuilder()
          .setColor('#7289DA')
          .setTitle('📚 Bot Command Help')
          .setDescription('Here are all available commands:')
          .addFields(
            { 
              name: '🎟️ Ticket System', 
              value: '`!ticket msg <message>` - Set ticket panel message\n' +
                     '`!setoptions general:💬, support:🛠️` - Set dropdown options\n' +
                     '`!setviewer @role` - Set ticket viewer role\n' +
                     '`!setticketcategory <id>` - Set ticket category\n' +
                     '`!deployticketpanel` - Deploy ticket panel'
            },
            { 
              name: '📋 Application System', 
              value: '`!app msg <message>` - Set app panel message\n' +
                     '`!addoptions Role:🛡️` - Add role buttons\n' +
                     '`!setappchannel <id>` - Set app channel\n' +
                     '`!deployapp` - Deploy app panel\n' +
                     '`!ques1 <question>` - Set question 1'
            },
            { 
              name: '⚠️ Moderation', 
              value: '`!warn @user [reason]` - Warn a user\n' +
                     '`!warnings @user` - Check warnings\n' +
                     '`!warnlimit <number>` - Set warn limit\n' +
                     '`!kick @user [reason]` - Kick a user\n' +
                     '`!ban @user [reason]` - Ban a user\n' +
                     '`!mute @user [duration]` - Mute a user\n' +
                     '`!jail @user` - Jail a user\n' +
                     '`!jailers` - List jailed users\n' +
                     '`!free @user` - Free a jailed user'
            },
            { 
              name: '💰 Economy', 
              value: '`!bal` - Check balance\n' +
                     '`!pay @user <amount>` - Pay or send money\n' +
                     '`!dep <amount>` - Deposit coins\n' +
                     '`!with <amount>` - Withdraw coins\n' +
                     '`!work` - Work for coins\n' +
                     '`!jobs` - List available jobs\n' +
                     '`!apply <job>` - Apply for a job\n' +
                     '`!shop` - View shop\n' +
                     '`!buy <item>` - Buy an item\n' +
                     '`!inv` - View inventory\n' +
                     '`!use <item>` - Use an item\n' +
                     '`!rob @user` - Rob another user\n' +
                     '`!cf head/tail <amount>` - Coin flip game\n' +
                     '`!dice <number> <amount>` - Dice game\n' +
                     '`!slots <amount>` - Slots game\n' +
                     '`!lottery` - Lottery system\n' +
                     '`!profile @user` - View profile\n' +
                     '`!setbio <text>` - Set profile bio\n' +
                     '`!lb` - Economy leaderboard'
            },
            { 
              name: '🎮 Mini-Games', 
              value: '`!rps @user` - Rock Paper Scissors\n' +
                     '`!tictactoe @user` - Tic Tac Toe\n' +
                     '`!guess` - Number guessing game\n' +
                     '`!math` - Math challenge\n' +
                     '`!trivia` - Trivia questions\n' +
                     '`!type` - Typing speed test'
            },
            { 
              name: '📩 DM & Embeds', 
              value: '`!dm @role <message>` - DM a role\n' +
                     '`!embed <color> <message>` - Create an embed'
            },
            { 
              name: 'ℹ️ Utilities', 
              value: '`!userinfo @user` - User information\n' +
                     '`!serverinfo` - Server information\n' +
                     '`!ping` - Bot latency\n' +
                     '`!prems @role` - Give role full bot access\n' +
                     '`!help` - This menu\n' +
                     '`!mods` - Moderation commands\n' +
                     '`!minigames` - Game commands\n' +
                     '`!eco` - Economy commands\n' +
                     '`!eco help` - Economy commands\n' +
                     '`!eco helps` - Economy commands\n' +
                     '`!economy` - Economy commands\n' +
                     '`!economy help` - Economy commands\n' +
                     '`!economy helps` - Economy commands'
            }
          )
          .setFooter({ 
            text: `${client.user.username} | Prefix: !`, 
            iconURL: client.user.displayAvatarURL() 
          });

        return message.channel.send({ embeds: [embed] });
      }

      // User information
      if (command === 'userinfo') {
        const user = message.mentions.users.first() || message.author;
        const member = message.guild.members.cache.get(user.id);

        if (!member) {
          return message.reply({
            embeds: [
              new EmbedBuilder()
                .setColor('#FFFF00')
                .setTitle('⚠️ User Not Found')
                .setDescription('That user is not in this server!')
            ]
          });
        }

        const roles = member.roles.cache
          .filter(role => role.id !== message.guild.id)
          .map(role => role.toString())
          .join(' ') || 'None';

        const embed = new EmbedBuilder()
          .setColor(member.displayHexColor || '#0099FF')
          .setTitle(`📝 User Info: ${user.tag}`)
          .setThumbnail(user.displayAvatarURL({ dynamic: true }))
          .addFields(
            { name: '🆔 ID', value: user.id, inline: true },
            { name: '📅 Joined Server', value: `<t:${Math.floor(member.joinedAt.getTime() / 1000)}:F>`, inline: true },
            { name: '📅 Account Created', value: `<t:${Math.floor(user.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: `🎭 Roles [${member.roles.cache.size - 1}]`, value: roles.length > 1024 ? 'Too many roles to display' : roles, inline: false },
            { name: '🌟 Premium Status', value: hasPremiumPermissions(member) ? '✅ Has premium access' : '❌ No premium access', inline: true }
          )
          .setFooter({ 
            text: message.guild.name, 
            iconURL: message.guild.iconURL() 
          });

        return message.channel.send({ embeds: [embed] });
      }

      // Server information
      if (command === 'serverinfo') {
        const { guild } = message;
        const owner = await guild.fetchOwner();
        const channels = guild.channels.cache;
        const textChannels = channels.filter(c => c.isTextBased()).size;
        const voiceChannels = channels.filter(c => c.isVoiceBased()).size;

        const embed = new EmbedBuilder()
          .setColor('#0099FF')
          .setTitle(`📊 Server Info: ${guild.name}`)
          .setThumbnail(guild.iconURL({ dynamic: true }))
          .addFields(
            { name: '🆔 ID', value: guild.id, inline: true },
            { name: '👑 Owner', value: owner.user.tag, inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(guild.createdAt.getTime() / 1000)}:F>`, inline: true },
            { name: '👥 Members', value: guild.memberCount.toString(), inline: true },
            { name: '📊 Channels', value: `💬 ${textChannels} | 🔊 ${voiceChannels}`, inline: true },
            { name: '🎭 Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: '✨ Boost Level', value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`, inline: true }
          )
          .setFooter({ 
            text: `Requested by ${message.author.tag}`, 
            iconURL: message.author.displayAvatarURL() 
          });

        return message.channel.send({ embeds: [embed] });
      }

      // Ping command
      if (command === 'ping') {
        const sent = await message.channel.send({
          embeds: [
            new EmbedBuilder()
              .setColor('#0099FF')
              .setTitle('⏳ Pinging...')
              .setDescription('Calculating bot latency...')
          ]
        });
        
        const latency = sent.createdTimestamp - message.createdTimestamp;
        const apiLatency = Math.round(client.ws.ping);

        const embed = new EmbedBuilder()
          .setColor('#00FF00')
          .setTitle('🏓 Pong!')
          .addFields(
            { name: '🤖 Bot Latency', value: `${latency}ms`, inline: true },
            { name: '🌐 API Latency', value: `${apiLatency}ms`, inline: true }
          )
          .setFooter({ 
            text: message.guild.name, 
            iconURL: message.guild.iconURL() 
          });

        return sent.edit({ embeds: [embed] });
      }

      // Moderation help command
      if (command === 'mods') {
        const embed = new EmbedBuilder()
          .setColor('#FF0000')
          .setTitle('⚠️ Moderation Commands')
          .setDescription('Here are all the moderation commands:')
          .addFields(
            { 
              name: 'Warnings', 
              value: '`!warn @user [reason]` - Warn user\n`!warnings @user` - Check warnings\n`!warnlimit <number>` - Set warn limit',
              inline: true 
            },
            { 
              name: 'Punishments', 
              value: '`!kick @user [reason]` - Kick user\n`!ban @user [reason]` - Ban user\n`!mute @user [duration]` - Mute user',
              inline: true 
            },
            { 
              name: 'Jail System', 
              value: '`!jail @user` - Jail user\n`!jailers` - List jailed users\n`!free @user` - Free user',
              inline: true 
            }
          )
          .setFooter({ 
            text: `${client.user.username} Moderation`, 
            iconURL: client.user.displayAvatarURL() 
          });

        return message.channel.send({ embeds: [embed] });
      }

      // Economy help command
      if (command === 'eco' || command === 'economy') {
        const subcommand = args[0]?.toLowerCase();
        if (subcommand && !['help', 'helps'].includes(subcommand)) return;

        const embed = new EmbedBuilder()
          .setColor('#FFD700')
          .setTitle('💰 Economy Commands')
          .setDescription('Here are all the economy-related commands:')
          .addFields(
            { 
              name: '💰 Basic Commands', 
              value: '`!bal` - Check balance\n`!pay @user <amount>` - Pay or send money\n`!dep <amount>` - Deposit coins\n`!with <amount>` - Withdraw coins\n`!daily` - Daily reward\n`!weekly` - Weekly reward\n`!monthly` - Monthly reward',
              inline: true 
            },
            { 
              name: '💼 Jobs & Shop', 
              value: '`!work` - Work for coins\n`!jobs` - List jobs\n`!apply <job>` - Apply for job\n`!shop` - View shop\n`!buy <item>` - Buy item\n`!inv` - Inventory\n`!use <item>` - Use item',
              inline: true 
            },
            { 
              name: '🎲 Games & More', 
              value: '`!cf head/tail <amount>` - Coin flip\n`!dice <number> <amount>` - Dice game\n`!slots <amount>` - Slots\n`!rob @user` - Rob user\n`!lottery` - Lottery\n`!profile @user` - View profile\n`!setbio <text>` - Set bio\n`!lb` - Leaderboard',
              inline: true 
            }
          )
          .setFooter({ 
            text: `${client.user.username} Economy System`, 
            iconURL: client.user.displayAvatarURL() 
          });

        return message.channel.send({ embeds: [embed] });
      }

      // Mini-games command
      if (command === 'minigames' || command === 'mini games') {
        const embed = new EmbedBuilder()
          .setColor('#FF00FF')
          .setTitle('🎮 Mini-Games Commands')
          .setDescription('Here are all the mini-game commands:')
          .addFields(
            { 
              name: 'Games', 
              value: '`!rps @user` - Rock Paper Scissors\n`!tictactoe @user` - Tic Tac Toe\n`!guess` - Number guessing\n`!math` - Math challenge\n`!trivia` - Trivia questions\n`!type` - Typing test'
            }
          )
          .setFooter({ 
            text: `${client.user.username} Games`, 
            iconURL: client.user.displayAvatarURL() 
          });

        return message.channel.send({ embeds: [embed] });
      }

    } catch (error) {
      console.error('Command Error:', error);
      if (!message.deleted) {
        message.reply({
          embeds: [
            new EmbedBuilder()
              .setColor('#FF0000')
              .setTitle('❌ Command Error')
              .setDescription('An error occurred while executing this command')
          ]
        }).catch(console.error);
      }
    }
  });
}

// Client ready event
client.once('ready', () => {
  console.log(`✅ ${client.user.tag} is online!`);
  
  // Set status
  client.user.setPresence({
    activities: [{
      name: '!help for commands',
      type: 'PLAYING'
    }],
    status: 'online'
  });

  // Setup all systems
  setupModerationSystem();
  setupEconomySystem();
  setupTicketSystem();
  setupApplicationSystem();
  setupMiniGames();
  setupDmAndEmbedTools();
  setupUtilityCommands();
});

// Error handling
client.on('error', console.error);
process.on('unhandledRejection', console.error);
process.on('uncaughtException', console.error);

// Login to Discord
client.login(process.env.TOKEN).catch(err => {
  console.error('❌ Failed to login:', err);
  process.exit(1);
});