require('dotenv').config();
const { 
    Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, 
    ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, 
    PermissionFlagsBits, Colors, ChannelType, TextInputStyle,
    ModalBuilder, TextInputBuilder, AttachmentBuilder
} = require('discord.js');
const express = require('express');
const app = express();
const PORT = process.env.PORT || 3000;

// In-memory data storage
const data = {
    tickets: {
        message: null,
        options: [],
        category: null,
        viewerRole: null,
        activeTickets: new Map(),
        logsChannel: null
    },
    applications: {
        message: null,
        roles: [],
        questions: [],
        cooldowns: new Map(),
        logsChannel: null
    },
    moderation: {
        warnings: new Map(),
        blacklistedWords: ['badword1', 'badword2', 'example'],
        mutedUsers: new Map()
    }
};

// Initialize Discord client
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// Keep alive server
app.get('/', (req, res) => res.send('Bot is alive!'));
app.listen(PORT, () => console.log(`Keep-alive server running on port ${PORT}`));
require('./keep_alive.js');

// Bot ready event
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('!help for commands');
});

// Message handler
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        // Help command
        if (command === 'help') await helpCommand(message);

        // Ticket system
        else if (command === 'ticket') await ticketCommand(message, args);
        else if (command === 'setoptions') await setTicketOptions(message, args);
        else if (command === 'deployticketpanel') await deployTicketPanel(message);
        else if (command === 'setviewer') await setViewerRole(message, args);

        // Application system
        else if (command === 'app') await appCommand(message, args);
        else if (command === 'addoptions') await addAppOptions(message, args);
        else if (command === 'deployapp') await deployAppPanel(message);
        else if (command.startsWith('ques')) await setQuestion(message, command, args);

        // Moderation
        else if (command === 'ban') await banUser(message, args);
        else if (command === 'kick') await kickUser(message, args);
        else if (command === 'mute') await muteUser(message, args);
        else if (command === 'unmute') await unmuteUser(message, args);
        else if (command === 'warn') await warnUser(message, args);
        else if (command === 'warnings') await showWarnings(message, args);
        else if (command === 'clear') await clearMessages(message, args);
        else if (command === 'lock') await lockChannel(message);
        else if (command === 'unlock') await unlockChannel(message);

        // Utility
        else if (command === 'dm') await dmRole(message, args);
        else if (command === 'msg') await sendAsBot(message, args);
        else if (command === 'embed') await sendEmbed(message, args);
        else if (command === 'poll') await createPoll(message, args);
        else if (command === 'serverinfo') await serverInfo(message);
        else if (command === 'userinfo') await userInfo(message, args);

        // Fun
        else if (command === 'rps') await rockPaperScissors(message);
        else if (command === 'guess') await guessNumber(message);
        else if (command === 'math') await mathChallenge(message);
        else if (command === 'trivia') await triviaGame(message);
        else if (command === 'type') await typeChallenge(message);

    } catch (error) {
        console.error(error);
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('An error occurred while executing that command.');
        await message.reply({ embeds: [embed] });
    }
});

// Interaction handler (for buttons, dropdowns)
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton() && !interaction.isStringSelectMenu() && !interaction.isModalSubmit()) return;

    try {
        // Ticket system interactions
        if (interaction.customId === 'create_ticket') await handleTicketCreation(interaction);
        else if (interaction.customId.startsWith('ticket_')) await handleTicketAction(interaction);

        // Application system interactions
        else if (interaction.customId.startsWith('apply_')) await handleApplicationStart(interaction);
        else if (interaction.customId === 'application_modal') await handleApplicationSubmit(interaction);
        else if (interaction.customId.startsWith('app_response_')) await handleApplicationResponse(interaction);

        // Fun game interactions
        else if (interaction.customId.startsWith('rps_')) await handleRPSChoice(interaction);
        else if (interaction.customId === 'guess_submit') await handleGuessSubmit(interaction);
        else if (interaction.customId === 'math_submit') await handleMathSubmit(interaction);
        else if (interaction.customId === 'trivia_submit') await handleTriviaSubmit(interaction);
        else if (interaction.customId === 'type_submit') await handleTypeSubmit(interaction);

    } catch (error) {
        console.error(error);
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('❌ Error')
            .setDescription('An error occurred while processing your interaction.');
        if (interaction.replied || interaction.deferred) {
            await interaction.followUp({ embeds: [embed], ephemeral: true });
        } else {
            await interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }
});

// ----------------------
// 🎯 COMMAND FUNCTIONS
// ----------------------

// ✅ BOT BASICS
async function helpCommand(message) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blue)
        .setTitle('📚 Help Menu')
        .setDescription('Here are all available commands:')
        .addFields(
            { name: '🎫 Ticket System', value: '`!ticket msg <message>` - Set ticket panel\n`!setoptions <options>` - Set ticket options\n`!deployticketpanel` - Deploy ticket panel\n`!setviewer @role` - Set ticket viewer role' },
            { name: '📝 Application System', value: '`!app msg <message>` - Set app panel\n`!addoptions <roles>` - Add role options\n`!deployapp` - Deploy app panel\n`!ques1-10 <question>` - Set application questions' },
            { name: '🛡️ Moderation', value: '`!ban @user [reason]` - Ban user\n`!kick @user [reason]` - Kick user\n`!mute @user <time>` - Mute user\n`!warn @user [reason]` - Warn user\n`!clear <amount>` - Clear messages\n`!lock`/`!unlock` - Lock channel' },
            { name: '💬 Utility', value: '`!dm @role <message>` - DM role members\n`!embed <color> <message>` - Send embed\n`!poll <question>` - Create poll\n`!serverinfo` - Server info\n`!userinfo @user` - User info' },
            { name: '🎮 Fun', value: '`!rps` - Rock Paper Scissors\n`!guess` - Guess the number\n`!math` - Math challenge\n`!trivia` - Trivia question\n`!type` - Typing challenge' }
        )
        .setFooter({ text: `Requested by ${message.author.tag}`, iconURL: message.author.displayAvatarURL() });

    await message.reply({ embeds: [embed] });
}

// 🎫 TICKET SYSTEM
async function ticketCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const msg = args.join(' ');
    if (!msg) return sendError(message, 'Please provide a message for the ticket panel.');

    data.tickets.message = msg;
    data.tickets.logsChannel = message.channel.id;

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Success')
        .setDescription('Ticket panel message set successfully!')
        .addFields(
            { name: 'Next Steps', value: '1. Use `!setoptions` to set ticket options\n2. Use `!deployticketpanel` to deploy the panel' }
        );
    
    await message.reply({ embeds: [embed] });
    setTimeout(() => message.delete(), 5000);
}

async function setTicketOptions(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    if (!args.length) return sendError(message, 'Please provide at least one option.');

    data.tickets.options = args;
    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Success')
        .setDescription(`Ticket options set to: ${args.join(', ')}`);
    
    await message.reply({ embeds: [embed] });
    setTimeout(() => message.delete(), 5000);
}

async function deployTicketPanel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    if (!data.tickets.message || !data.tickets.options.length) {
        return sendError(message, 'Please set the ticket message and options first.');
    }

    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('create_ticket')
        .setPlaceholder('Select a ticket type')
        .addOptions(data.tickets.options.map(option => ({
            label: option,
            value: option.toLowerCase()
        })));

    const row = new ActionRowBuilder().addComponents(selectMenu);

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('🎫 Create a Ticket')
        .setDescription(data.tickets.message)
        .setFooter({ text: 'Select an option from the dropdown below' });

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
}

async function setViewerRole(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const role = message.mentions.roles.first();
    if (!role) return sendError(message, 'Please mention a valid role.');

    data.tickets.viewerRole = role.id;
    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Success')
        .setDescription(`Default viewer role set to ${role.name}`);
    
    await message.reply({ embeds: [embed] });
    setTimeout(() => message.delete(), 5000);
}

// 📝 APPLICATION SYSTEM
async function appCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const msg = args.join(' ');
    if (!msg) return sendError(message, 'Please provide a message for the application panel.');

    data.applications.message = msg;
    data.applications.logsChannel = message.channel.id;

    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Success')
        .setDescription('Application panel message set successfully!')
        .addFields(
            { name: 'Next Steps', value: '1. Use `!addoptions` to set role options\n2. Use `!ques1-10` to set questions\n3. Use `!deployapp` to deploy the panel' }
        );
    
    await message.reply({ embeds: [embed] });
    setTimeout(() => message.delete(), 5000);
}

async function addAppOptions(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    if (!args.length) return sendError(message, 'Please provide at least one role.');

    const roles = message.mentions.roles.map(role => ({
        id: role.id,
        name: role.name
    }));

    if (!roles.length) return sendError(message, 'Please mention valid roles.');

    data.applications.roles = roles;
    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Success')
        .setDescription(`Application options set to: ${roles.map(r => r.name).join(', ')}`);
    
    await message.reply({ embeds: [embed] });
    setTimeout(() => message.delete(), 5000);
}

async function deployAppPanel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    if (!data.applications.message || !data.applications.roles.length || !data.applications.questions.length) {
        return sendError(message, 'Please set the application message, role options, and questions first.');
    }

    const buttons = data.applications.roles.map(role => 
        new ButtonBuilder()
            .setCustomId(`apply_${role.id}`)
            .setLabel(role.name)
            .setStyle(ButtonStyle.Primary)
    );

    const rows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        rows.push(new ActionRowBuilder().addComponents(buttons.slice(i, i + 5)));
    }

    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('📝 Application Panel')
        .setDescription(data.applications.message)
        .setFooter({ text: 'Click a button below to apply' });

    await message.channel.send({ embeds: [embed], components: rows });
    await message.delete();
}

async function setQuestion(message, command, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const questionNumber = parseInt(command.replace('ques', ''));
    if (isNaN(questionNumber) || questionNumber < 1 || questionNumber > 10) {
        return sendError(message, 'Question number must be between 1 and 10 (use !ques1-10)');
    }

    const question = args.join(' ');
    if (!question) return sendError(message, 'Please provide a question.');

    data.applications.questions[questionNumber - 1] = question;
    const embed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ Success')
        .setDescription(`Question ${questionNumber} set to: ${question}`);
    
    await message.reply({ embeds: [embed] });
    setTimeout(() => message.delete(), 5000);
}

// 🛡️ MODERATION COMMANDS
async function banUser(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return sendError(message, 'You need ban members permissions to use this command.');
    }

    const user = message.mentions.users.first();
    if (!user) return sendError(message, 'Please mention a user to ban.');

    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
        await message.guild.members.ban(user, { reason });
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setTitle('🔨 User Banned')
            .setDescription(`${user.tag} has been banned from the server.`)
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Moderator', value: message.author.tag }
            );
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        sendError(message, 'Failed to ban user. Check bot permissions and role hierarchy.');
    }
}

async function kickUser(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return sendError(message, 'You need kick members permissions to use this command.');
    }

    const user = message.mentions.users.first();
    if (!user) return sendError(message, 'Please mention a user to kick.');

    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    try {
        await message.guild.members.kick(user, { reason });
        const embed = new EmbedBuilder()
            .setColor(Colors.Orange)
            .setTitle('👢 User Kicked')
            .setDescription(`${user.tag} has been kicked from the server.`)
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Moderator', value: message.author.tag }
            );
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        sendError(message, 'Failed to kick user. Check bot permissions and role hierarchy.');
    }
}

async function muteUser(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return sendError(message, 'You need moderate members permissions to use this command.');
    }

    const user = message.mentions.users.first();
    if (!user) return sendError(message, 'Please mention a user to mute.');

    const duration = args[1];
    if (!duration) return sendError(message, 'Please provide a duration (e.g., 1h, 30m)');

    const time = parseDuration(duration);
    if (!time) return sendError(message, 'Invalid duration format. Use formats like 1h, 30m, 2d');

    const reason = args.slice(2).join(' ') || 'No reason provided';
    
    try {
        const member = await message.guild.members.fetch(user.id);
        await member.timeout(time, reason);
        
        data.moderation.mutedUsers.set(user.id, Date.now() + time);
        
        const embed = new EmbedBuilder()
            .setColor(Colors.DarkOrange)
            .setTitle('🔇 User Muted')
            .setDescription(`${user.tag} has been muted for ${formatDuration(time)}.`)
            .addFields(
                { name: 'Reason', value: reason },
                { name: 'Moderator', value: message.author.tag }
            );
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        sendError(message, 'Failed to mute user. Check bot permissions and role hierarchy.');
    }
}

async function unmuteUser(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return sendError(message, 'You need moderate members permissions to use this command.');
    }

    const user = message.mentions.users.first();
    if (!user) return sendError(message, 'Please mention a user to unmute.');

    try {
        const member = await message.guild.members.fetch(user.id);
        await member.timeout(null);
        
        data.moderation.mutedUsers.delete(user.id);
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setTitle('🔊 User Unmuted')
            .setDescription(`${user.tag} has been unmuted.`)
            .addFields(
                { name: 'Moderator', value: message.author.tag }
            );
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        sendError(message, 'Failed to unmute user. Check bot permissions and role hierarchy.');
    }
}

async function warnUser(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return sendError(message, 'You need moderate members permissions to use this command.');
    }

    const user = message.mentions.users.first();
    if (!user) return sendError(message, 'Please mention a user to warn.');

    const reason = args.slice(1).join(' ') || 'No reason provided';
    
    if (!data.moderation.warnings.has(user.id)) {
        data.moderation.warnings.set(user.id, []);
    }
    
    data.moderation.warnings.get(user.id).push({
        reason,
        moderator: message.author.tag,
        timestamp: Date.now()
    });
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle('⚠️ User Warned')
        .setDescription(`${user.tag} has been warned.`)
        .addFields(
            { name: 'Reason', value: reason },
            { name: 'Moderator', value: message.author.tag },
            { name: 'Total Warnings', value: data.moderation.warnings.get(user.id).length.toString() }
        );
    
    await message.reply({ embeds: [embed] });
}

async function showWarnings(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return sendError(message, 'You need moderate members permissions to use this command.');
    }

    const user = message.mentions.users.first();
    if (!user) return sendError(message, 'Please mention a user to check warnings for.');

    const warnings = data.moderation.warnings.get(user.id) || [];
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Yellow)
        .setTitle(`⚠️ Warnings for ${user.tag}`)
        .setDescription(warnings.length ? `Total warnings: ${warnings.length}` : 'No warnings found.');
    
    if (warnings.length) {
        embed.addFields(warnings.map((warn, i) => ({
            name: `Warning #${i + 1}`,
            value: `Reason: ${warn.reason}\nModerator: ${warn.moderator}\nDate: <t:${Math.floor(warn.timestamp / 1000)}:f>`,
            inline: false
        })));
    }
    
    await message.reply({ embeds: [embed] });
}

async function clearMessages(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return sendError(message, 'You need manage messages permissions to use this command.');
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount)) return sendError(message, 'Please provide a valid number of messages to delete.');
    if (amount < 1 || amount > 100) return sendError(message, 'You can only delete between 1 and 100 messages at once.');

    try {
        await message.channel.bulkDelete(amount + 1); // +1 to include the command message
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setDescription(`✅ Deleted ${amount} messages.`);
        
        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete(), 3000);
    } catch (error) {
        sendError(message, 'Failed to delete messages. Messages may be too old or missing permissions.');
    }
}

async function lockChannel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return sendError(message, 'You need manage channels permissions to use this command.');
    }

    try {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: false
        });
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setDescription('🔒 Channel has been locked.');
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        sendError(message, 'Failed to lock channel. Check bot permissions.');
    }
}

async function unlockChannel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return sendError(message, 'You need manage channels permissions to use this command.');
    }

    try {
        await message.channel.permissionOverwrites.edit(message.guild.roles.everyone, {
            SendMessages: null
        });
        
        const embed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setDescription('🔓 Channel has been unlocked.');
        
        await message.reply({ embeds: [embed] });
    } catch (error) {
        sendError(message, 'Failed to unlock channel. Check bot permissions.');
    }
}

// 💬 UTILITY COMMANDS
async function dmRole(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const role = message.mentions.roles.first();
    if (!role) return sendError(message, 'Please mention a role to DM.');

    const content = args.slice(1).join(' ');
    if (!content) return sendError(message, 'Please provide a message to send.');

    const members = (await message.guild.members.fetch()).filter(m => m.roles.cache.has(role.id));
    if (members.size === 0) return sendError(message, 'No members found with that role.');

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`📩 Message from ${message.guild.name}`)
        .setDescription(content)
        .setFooter({ text: 'This is an automated message' });

    let success = 0, failed = 0;
    for (const member of members.values()) {
        try {
            await member.send({ embeds: [embed] });
            success++;
        } catch {
            failed++;
        }
    }

    const resultEmbed = new EmbedBuilder()
        .setColor(Colors.Green)
        .setTitle('✅ DM Sent')
        .setDescription(`Successfully sent to ${success} members, failed for ${failed} members.`);
    
    await message.reply({ embeds: [resultEmbed] });
}

async function sendAsBot(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const content = args.join(' ');
    if (!content) return sendError(message, 'Please provide a message to send.');

    await message.channel.send(content);
    await message.delete();
}

async function sendEmbed(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return sendError(message, 'You need administrator permissions to use this command.');
    }

    const color = args.shift();
    if (!color) return sendError(message, 'Please provide a color (e.g., red, #FF0000, 0xFF0000)');

    const content = args.join(' ');
    if (!content) return sendError(message, 'Please provide embed content.');

    let embedColor;
    if (color.startsWith('#')) {
        embedColor = parseInt(color.slice(1), 16);
    } else if (color.startsWith('0x')) {
        embedColor = parseInt(color.slice(2), 16);
    } else if (Colors[color.toUpperCase()]) {
        embedColor = Colors[color.toUpperCase()];
    } else {
        return sendError(message, 'Invalid color format. Use color name, hex (#FF0000), or hex (0xFF0000)');
    }

    const embed = new EmbedBuilder()
        .setColor(embedColor)
        .setDescription(content);
    
    await message.channel.send({ embeds: [embed] });
    await message.delete();
}

async function createPoll(message, args) {
    const question = args.join(' ');
    if (!question) return sendError(message, 'Please provide a poll question.');

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('📊 Poll')
        .setDescription(question)
        .setFooter({ text: `Poll created by ${message.author.tag}` });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('poll_yes')
            .setLabel('👍 Yes')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId('poll_no')
            .setLabel('👎 No')
            .setStyle(ButtonStyle.Danger)
    );

    await message.channel.send({ embeds: [embed], components: [row] });
    await message.delete();
}

async function serverInfo(message) {
    const guild = message.guild;
    
    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`ℹ️ Server Info - ${guild.name}`)
        .setThumbnail(guild.iconURL())
        .addFields(
            { name: '👑 Owner', value: (await guild.fetchOwner()).user.tag, inline: true },
            { name: '🆔 ID', value: guild.id, inline: true },
            { name: '📅 Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:f>`, inline: true },
            { name: '👥 Members', value: guild.memberCount.toString(), inline: true },
            { name: '💬 Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: '🎭 Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: '🚀 Boost Level', value: `Level ${guild.premiumTier} (${guild.premiumSubscriptionCount} boosts)`, inline: true }
        );
    
    await message.reply({ embeds: [embed] });
}

async function userInfo(message, args) {
    const user = message.mentions.users.first() || message.author;
    const member = message.guild.members.cache.get(user.id);
    
    if (!member) return sendError(message, 'User not found in this server.');

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`👤 User Info - ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .addFields(
            { name: '🆔 ID', value: user.id, inline: true },
            { name: '📅 Joined Server', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:f>`, inline: true },
            { name: '📅 Account Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:f>`, inline: true },
            { name: '🎭 Roles', value: member.roles.cache.size.toString(), inline: true },
            { name: '🚀 Boosting', value: member.premiumSince ? `<t:${Math.floor(member.premiumSinceTimestamp / 1000)}:f>` : 'Not boosting', inline: true },
            { name: '📛 Nickname', value: member.nickname || 'None', inline: true }
        );
    
    await message.reply({ embeds: [embed] });
}

// 🎮 FUN COMMANDS
async function rockPaperScissors(message) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('🪨 Rock, 📄 Paper, ✂️ Scissors')
        .setDescription('Choose your move!');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('rps_rock')
            .setLabel('🪨 Rock')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_paper')
            .setLabel('📄 Paper')
            .setStyle(ButtonStyle.Primary),
        new ButtonBuilder()
            .setCustomId('rps_scissors')
            .setLabel('✂️ Scissors')
            .setStyle(ButtonStyle.Primary)
    );

    await message.reply({ embeds: [embed], components: [row] });
}

async function guessNumber(message) {
    const number = Math.floor(Math.random() * 10) + 1;
    data.guessNumber = number; // Store the number for the interaction handler

    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('🔢 Guess the Number')
        .setDescription('I\'m thinking of a number between 1 and 10. Can you guess it?');

    const modal = new ModalBuilder()
        .setCustomId('guess_submit')
        .setTitle('Guess the Number')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('guess_input')
                    .setLabel('Your guess (1-10)')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(2)
            )
        );

    await message.showModal(modal);
    await message.reply({ embeds: [embed] });
}

async function mathChallenge(message) {
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer;
    switch (operator) {
        case '+': answer = num1 + num2; break;
        case '-': answer = num1 - num2; break;
        case '*': answer = num1 * num2; break;
    }
    
    data.mathAnswer = answer; // Store the answer for the interaction handler

    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('🧮 Math Challenge')
        .setDescription(`What is ${num1} ${operator} ${num2}?`);

    const modal = new ModalBuilder()
        .setCustomId('math_submit')
        .setTitle('Math Challenge')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('math_input')
                    .setLabel('Your answer')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
                    .setMinLength(1)
                    .setMaxLength(4)
            )
        );

    await message.showModal(modal);
    await message.reply({ embeds: [embed] });
}

async function triviaGame(message) {
    const questions = [
        { question: 'What is the capital of France?', answer: 'Paris' },
        { question: 'How many continents are there?', answer: '7' },
        { question: 'What is the largest planet in our solar system?', answer: 'Jupiter' },
        { question: 'Who painted the Mona Lisa?', answer: 'Leonardo da Vinci' },
        { question: 'What is the chemical symbol for gold?', answer: 'Au' }
    ];
    
    const randomQuestion = questions[Math.floor(Math.random() * questions.length)];
    data.triviaAnswer = randomQuestion.answer.toLowerCase();

    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('❓ Trivia Question')
        .setDescription(randomQuestion.question);

    const modal = new ModalBuilder()
        .setCustomId('trivia_submit')
        .setTitle('Trivia Question')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('trivia_input')
                    .setLabel('Your answer')
                    .setStyle(TextInputStyle.Short)
                    .setRequired(true)
            )
        );

    await message.showModal(modal);
    await message.reply({ embeds: [embed] });
}

async function typeChallenge(message) {
    const sentences = [
        'The quick brown fox jumps over the lazy dog',
        'Pack my box with five dozen liquor jugs',
        'How vexingly quick daft zebras jump',
        'Bright vixens jump; dozy fowl quack',
        'Sphinx of black quartz, judge my vow'
    ];
    
    const sentence = sentences[Math.floor(Math.random() * sentences.length)];
    data.typeChallenge = sentence;

    const embed = new EmbedBuilder()
        .setColor(Colors.Gold)
        .setTitle('⌨️ Typing Challenge')
        .setDescription('Type the following sentence as fast as you can:')
        .addFields(
            { name: 'Sentence', value: `\`\`\`${sentence}\`\`\`` }
        );

    const modal = new ModalBuilder()
        .setCustomId('type_submit')
        .setTitle('Typing Challenge')
        .addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('type_input')
                    .setLabel('Type the sentence exactly')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );

    await message.showModal(modal);
    await message.reply({ embeds: [embed] });
}

// ----------------------
// 🎯 INTERACTION HANDLERS
// ----------------------

// 🎫 TICKET SYSTEM INTERACTIONS
async function handleTicketCreation(interaction) {
    if (!interaction.isStringSelectMenu()) return;

    const ticketType = interaction.values[0];
    const ticketName = `ticket-${interaction.user.username.toLowerCase()}`;
    
    // Check if user already has an open ticket
    for (const [channelId, ticket] of data.tickets.activeTickets) {
        if (ticket.user === interaction.user.id && !ticket.closed) {
            const embed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription('❌ You already have an open ticket!');
            return interaction.reply({ embeds: [embed], ephemeral: true });
        }
    }

    // Create ticket channel
    try {
        const channel = await interaction.guild.channels.create({
            name: ticketName,
            type: ChannelType.GuildText,
            parent: data.tickets.category,
            permissionOverwrites: [
                {
                    id: interaction.guild.roles.everyone,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AttachFiles
                    ]
                },
                ...(data.tickets.viewerRole ? [{
                    id: data.tickets.viewerRole,
                    allow: [
                        PermissionFlagsBits.ViewChannel,
                        PermissionFlagsBits.SendMessages,
                        PermissionFlagsBits.AttachFiles
                    ]
                }] : [])
            ]
        });

        // Store ticket data
        data.tickets.activeTickets.set(channel.id, {
            user: interaction.user.id,
            type: ticketType,
            claimed: false,
            locked: false,
            closed: false,
            createdAt: Date.now(),
            lastActivity: Date.now()
        });

        // Send ticket message
        const embed = new EmbedBuilder()
            .setColor(Colors.Blurple)
            .setTitle(`🎫 ${ticketType} Ticket`)
            .setDescription(`Hello ${interaction.user}, support will be with you shortly.\n\nPlease describe your issue in detail.`)
            .setFooter({ text: 'Ticket controls below' });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_claim')
                .setLabel('🔐 Claim')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('ticket_lock')
                .setLabel('🔒 Lock')
                .setStyle(ButtonStyle.Secondary),
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('🛑 Close')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_transcript')
                .setLabel('📄 Transcript')
                .setStyle(ButtonStyle.Success)
        );

        await channel.send({ 
            content: `${interaction.user}${data.tickets.viewerRole ? ` <@&${data.tickets.viewerRole}>` : ''}`,
            embeds: [embed], 
            components: [row] 
        });

        const successEmbed = new EmbedBuilder()
            .setColor(Colors.Green)
            .setDescription(`✅ Your ticket has been created: ${channel}`);
        
        await interaction.reply({ embeds: [successEmbed], ephemeral: true });

        // Start inactivity timer
        startInactivityTimer(channel.id);

    } catch (error) {
        console.error(error);
        const embed = new EmbedBuilder()
            .setColor(Colors.Red)
            .setDescription('❌ Failed to create ticket. Please contact an admin.');
        
        await interaction.reply({ embeds: [embed], ephemeral: true });
    }
}

async function handleTicketAction(interaction) {
    if (!interaction.isButton()) return;

    const action = interaction.customId.split('_')[1];
    const ticket = data.tickets.activeTickets.get(interaction.channel.id);
    if (!ticket) return;

    // Check permissions
    const isStaff = interaction.member.permissions.has(PermissionFlagsBits.ManageMessages) || 
                   (data.tickets.viewerRole && interaction.member.roles.cache.has(data.tickets.viewerRole));
    
    if (!isStaff && interaction.user.id !== ticket.user) {
        return interaction.reply({ 
            content: '❌ You cannot perform this action.', 
            ephemeral: true 
        });
    }

    switch (action) {
        case 'claim':
            if (ticket.claimed) {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription(`❌ This ticket is already claimed by <@${ticket.claimedBy}>`);
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            ticket.claimed = true;
            ticket.claimedBy = interaction.user.id;
            data.tickets.activeTickets.set(interaction.channel.id, ticket);

            await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
                ViewChannel: true,
                SendMessages: true,
                AttachFiles: true
            });

            const claimEmbed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setDescription(`✅ Ticket claimed by ${interaction.user}`);
            
            await interaction.reply({ embeds: [claimEmbed] });
            break;

        case 'lock':
            if (ticket.locked) {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ This ticket is already locked');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            ticket.locked = true;
            data.tickets.activeTickets.set(interaction.channel.id, ticket);

            await interaction.channel.permissionOverwrites.edit(ticket.user, {
                SendMessages: false
            });

            const lockEmbed = new EmbedBuilder()
                .setColor(Colors.Orange)
                .setDescription(`🔒 Ticket locked by ${interaction.user}\n\nOnly staff can send messages now.`);
            
            await interaction.reply({ embeds: [lockEmbed] });
            break;

        case 'close':
            if (ticket.closed) {
                const embed = new EmbedBuilder()
                    .setColor(Colors.Red)
                    .setDescription('❌ This ticket is already closed');
                return interaction.reply({ embeds: [embed], ephemeral: true });
            }

            ticket.closed = true;
            data.tickets.activeTickets.set(interaction.channel.id, ticket);

            const closeEmbed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription(`🛑 Ticket closed by ${interaction.user}\n\nThis channel will be deleted in 10 seconds.`);
            
            await interaction.reply({ embeds: [closeEmbed] });
            
            // Delete channel after delay
            setTimeout(async () => {
                try {
                    await interaction.channel.delete();
                    data.tickets.activeTickets.delete(interaction.channel.id);
                } catch (error) {
                    console.error('Failed to delete ticket channel:', error);
                }
            }, 10000);
            break;

        case 'transcript':
            await interaction.deferReply({ ephemeral: true });
            
            // Generate transcript (simplified)
            const messages = await interaction.channel.messages.fetch({ limit: 100 });
            const transcript = messages.reverse().map(msg => 
                `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}`
            ).join('\n');
            
            const attachment = new AttachmentBuilder()
                .setFile(Buffer.from(transcript))
                .setName(`transcript-${interaction.channel.name}.txt`);
            
            const logChannel = interaction.guild.channels.cache.get(data.tickets.logsChannel);
            if (logChannel) {
                await logChannel.send({ 
                    content: `📄 Transcript for ${interaction.channel.name}`,
                    files: [attachment] 
                });
            }

            try {
                await interaction.user.send({ 
                    content: `📄 Here's the transcript for your ticket in ${interaction.guild.name}`,
                    files: [attachment] 
                });
            } catch {
                // Couldn't DM user
            }

            await interaction.editReply({ 
                content: '✅ Transcript has been generated and sent to the logs and your DMs.',
                ephemeral: true 
            });
            break;
    }
}

// 📝 APPLICATION SYSTEM INTERACTIONS
async function handleApplicationStart(interaction) {
    if (!interaction.isButton()) return;

    const roleId = interaction.customId.split('_')[1];
    const role = interaction.guild.roles.cache.get(roleId);
    if (!role) return;

    // Check cooldown
    if (data.applications.cooldowns.has(interaction.user.id)) {
        const cooldown = data.applications.cooldowns.get(interaction.user.id);
        if (cooldown > Date.now()) {
            const remaining = Math.ceil((cooldown - Date.now()) / 1000 / 60);
            return interaction.reply({ 
                content: `⏳ You're on cooldown! Please wait ${remaining} more minutes before applying again.`, 
                ephemeral: true 
            });
        }
    }

    // Set cooldown (15 minutes)
    data.applications.cooldowns.set(interaction.user.id, Date.now() + 15 * 60 * 1000);

    // Create modal with application questions
    const modal = new ModalBuilder()
        .setCustomId('application_modal')
        .setTitle(`Application for ${role.name}`)
        .addComponents(
            ...data.applications.questions.map((question, i) => 
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId(`app_q${i + 1}`)
                        .setLabel(question.length > 45 ? `${question.substring(0, 42)}...` : question)
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                )
            )
        );

    // Store application data for the modal submit
    data.currentApplication = {
        userId: interaction.user.id,
        roleId: role.id,
        roleName: role.name
    };

    await interaction.showModal(modal);
}

async function handleApplicationSubmit(interaction) {
    if (!interaction.isModalSubmit()) return;

    const { userId, roleId, roleName } = data.currentApplication;
    const user = await interaction.client.users.fetch(userId);

    // Get all answers
    const answers = [];
    for (let i = 0; i < data.applications.questions.length; i++) {
        const answer = interaction.fields.getTextInputValue(`app_q${i + 1}`);
        answers.push({
            question: data.applications.questions[i],
            answer: answer
        });
    }

    // Send to logs channel
    const logChannel = interaction.guild.channels.cache.get(data.applications.logsChannel);
    if (!logChannel) return;

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle(`📝 New Application - ${roleName}`)
        .setDescription(`Applicant: ${user.tag} (${user.id})`)
        .addFields(
            answers.map((item, i) => ({
                name: `Question ${i + 1}`,
                value: `**${item.question}**\n${item.answer}`,
                inline: false
            }))
        )
        .setFooter({ text: 'Review this application below' });

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`app_response_accept_${user.id}_${roleId}`)
            .setLabel('✅ Accept')
            .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
            .setCustomId(`app_response_reject_${user.id}`)
            .setLabel('❌ Reject')
            .setStyle(ButtonStyle.Danger)
    );

    await logChannel.send({ 
        content: `New application from ${user} for ${roleName}`,
        embeds: [embed], 
        components: [row] 
    });

    await interaction.reply({ 
        content: '✅ Your application has been submitted successfully!', 
        ephemeral: true 
    });
}

async function handleApplicationResponse(interaction) {
    if (!interaction.isButton()) return;

    const [action, userId, roleId] = interaction.customId.split('_').slice(1);
    const user = await interaction.client.users.fetch(userId);
    const member = interaction.guild.members.cache.get(userId);

    if (action === 'accept') {
        // Add role to user
        try {
            await member.roles.add(roleId);
            
            const embed = new EmbedBuilder()
                .setColor(Colors.Green)
                .setTitle('✅ Application Accepted')
                .setDescription(`Congratulations! Your application for **${interaction.guild.roles.cache.get(roleId).name}** has been accepted.`)
                .setFooter({ text: interaction.guild.name });
            
            await user.send({ embeds: [embed] });
            
            await interaction.update({ 
                content: `✅ Application accepted by ${interaction.user}. Role has been assigned.`,
                components: [] 
            });
        } catch (error) {
            await interaction.reply({ 
                content: '❌ Failed to assign role. Check bot permissions and role hierarchy.', 
                ephemeral: true 
            });
        }
    } else if (action === 'reject') {
        // Ask for rejection reason
        const modal = new ModalBuilder()
            .setCustomId(`app_reject_reason_${userId}`)
            .setTitle('Rejection Reason')
            .addComponents(
                new ActionRowBuilder().addComponents(
                    new TextInputBuilder()
                        .setCustomId('reason')
                        .setLabel('Reason for rejection')
                        .setStyle(TextInputStyle.Paragraph)
                        .setRequired(true)
                )
            );

        await interaction.showModal(modal);
        
        // Store interaction for follow-up
        data.rejectInteraction = interaction;
    }
}

// 🎮 FUN GAME INTERACTIONS
async function handleRPSChoice(interaction) {
    if (!interaction.isButton()) return;

    const userChoice = interaction.customId.split('_')[1];
    const choices = ['rock', 'paper', 'scissors'];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];

    let result;
    if (userChoice === botChoice) {
        result = 'It\'s a tie!';
    } else if (
        (userChoice === 'rock' && botChoice === 'scissors') ||
        (userChoice === 'paper' && botChoice === 'rock') ||
        (userChoice === 'scissors' && botChoice === 'paper')
    ) {
        result = 'You win!';
    } else {
        result = 'I win!';
    }

    const emojiMap = {
        rock: '🪨',
        paper: '📄',
        scissors: '✂️'
    };

    const embed = new EmbedBuilder()
        .setColor(Colors.Blurple)
        .setTitle('🪨 Rock, 📄 Paper, ✂️ Scissors')
        .setDescription(`${interaction.user} vs. Bot`)
        .addFields(
            { name: 'Your Choice', value: `${emojiMap[userChoice]} ${userChoice}`, inline: true },
            { name: 'Bot Choice', value: `${emojiMap[botChoice]} ${botChoice}`, inline: true },
            { name: 'Result', value: result, inline: false }
        );

    await interaction.update({ embeds: [embed], components: [] });
}

async function handleGuessSubmit(interaction) {
    if (!interaction.isModalSubmit()) return;

    const guess = parseInt(interaction.fields.getTextInputValue('guess_input'));
    const correctNumber = data.guessNumber;
    
    let result;
    if (isNaN(guess)) {
        result = 'That\'s not a valid number!';
    } else if (guess === correctNumber) {
        result = '🎉 Correct! You guessed the right number!';
    } else {
        result = `❌ Wrong! The number was ${correctNumber}.`;
    }

    const embed = new EmbedBuilder()
        .setColor(guess === correctNumber ? Colors.Green : Colors.Red)
        .setTitle('🔢 Guess the Number')
        .setDescription(result)
        .setFooter({ text: `You guessed: ${guess}` });

    await interaction.reply({ embeds: [embed] });
}

async function handleMathSubmit(interaction) {
    if (!interaction.isModalSubmit()) return;

    const answer = interaction.fields.getTextInputValue('math_input');
    const correctAnswer = data.mathAnswer;
    
    let result;
    if (isNaN(answer)) {
        result = 'That\'s not a valid number!';
    } else if (parseInt(answer) === correctAnswer) {
        result = '✅ Correct! Great job!';
    } else {
        result = `❌ Incorrect! The answer was ${correctAnswer}.`;
    }

    const embed = new EmbedBuilder()
        .setColor(parseInt(answer) === correctAnswer ? Colors.Green : Colors.Red)
        .setTitle('🧮 Math Challenge')
        .setDescription(result)
        .setFooter({ text: `Your answer: ${answer}` });

    await interaction.reply({ embeds: [embed] });
}

async function handleTriviaSubmit(interaction) {
    if (!interaction.isModalSubmit()) return;

    const answer = interaction.fields.getTextInputValue('trivia_input').toLowerCase();
    const correctAnswer = data.triviaAnswer;
    
    let result;
    if (answer === correctAnswer) {
        result = '✅ Correct! Well done!';
    } else {
        result = `❌ Incorrect! The correct answer was "${correctAnswer}".`;
    }

    const embed = new EmbedBuilder()
        .setColor(answer === correctAnswer ? Colors.Green : Colors.Red)
        .setTitle('❓ Trivia Question')
        .setDescription(result)
        .setFooter({ text: `Your answer: ${answer}` });

    await interaction.reply({ embeds: [embed] });
}

async function handleTypeSubmit(interaction) {
    if (!interaction.isModalSubmit()) return;

    const typedText = interaction.fields.getTextInputValue('type_input');
    const originalText = data.typeChallenge;
    
    let result;
    if (typedText === originalText) {
        result = '✅ Perfect! You typed it exactly right!';
    } else {
        result = '❌ Not quite right. Here\'s the original text:';
    }

    const embed = new EmbedBuilder()
        .setColor(typedText === originalText ? Colors.Green : Colors.Red)
        .setTitle('⌨️ Typing Challenge')
        .setDescription(result);

    if (typedText !== originalText) {
        embed.addFields(
            { name: 'Your Attempt', value: `\`\`\`${typedText}\`\`\`` },
            { name: 'Original Text', value: `\`\`\`${originalText}\`\`\`` }
        );
    }

    await interaction.reply({ embeds: [embed] });
}

// ----------------------
// 🛠️ UTILITY FUNCTIONS
// ----------------------

function sendError(message, content) {
    const embed = new EmbedBuilder()
        .setColor(Colors.Red)
        .setDescription(`❌ ${content}`);
    return message.reply({ embeds: [embed] });
}

function parseDuration(duration) {
    const regex = /^(\d+)([smhd])$/;
    const match = duration.match(regex);
    if (!match) return null;

    const value = parseInt(match[1]);
    const unit = match[2];
    
    switch (unit) {
        case 's': return value * 1000;
        case 'm': return value * 1000 * 60;
        case 'h': return value * 1000 * 60 * 60;
        case 'd': return value * 1000 * 60 * 60 * 24;
        default: return null;
    }
}

function formatDuration(ms) {
    const seconds = Math.floor(ms / 1000) % 60;
    const minutes = Math.floor(ms / (1000 * 60)) % 60;
    const hours = Math.floor(ms / (1000 * 60 * 60)) % 24;
    const days = Math.floor(ms / (1000 * 60 * 60 * 24));

    let parts = [];
    if (days > 0) parts.push(`${days}d`);
    if (hours > 0) parts.push(`${hours}h`);
    if (minutes > 0) parts.push(`${minutes}m`);
    if (seconds > 0) parts.push(`${seconds}s`);

    return parts.join(' ') || '0s';
}

function startInactivityTimer(channelId) {
    const ticket = data.tickets.activeTickets.get(channelId);
    if (!ticket) return;

    const checkInactivity = async () => {
        const now = Date.now();
        const inactiveTime = now - ticket.lastActivity;
        const thirtyMinutes = 30 * 60 * 1000;

        if (inactiveTime >= thirtyMinutes && !ticket.closed) {
            const channel = client.channels.cache.get(channelId);
            if (!channel) return;

            const embed = new EmbedBuilder()
                .setColor(Colors.Red)
                .setDescription('🛑 This ticket is being closed due to 30 minutes of inactivity.');

            await channel.send({ embeds: [embed] });
            
            // Close the ticket
            ticket.closed = true;
            data.tickets.activeTickets.set(channelId, ticket);
            
            setTimeout(async () => {
                try {
                    await channel.delete();
                    data.tickets.activeTickets.delete(channelId);
                } catch (error) {
                    console.error('Failed to delete inactive ticket:', error);
                }
            }, 10000);
        } else if (!ticket.closed) {
            // Check again in 1 minute
            setTimeout(checkInactivity, 60 * 1000);
        }
    };

    // Initial check after 30 minutes
    setTimeout(checkInactivity, 30 * 60 * 1000);
}

// ----------------------
// 🚀 START THE BOT
// ----------------------
client.login('MTM4MzY1OTM2ODI3NjQzMDk0OQ.GTBR_g.eTA0aTq4qfPLWv1eUrnWUY5gL4NjKrvJppdfN4');
