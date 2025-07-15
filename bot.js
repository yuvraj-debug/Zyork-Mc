const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const mongoose = require('mongoose');
const { Schema } = mongoose;
const ms = require('ms');

// Initialize client with necessary intents
const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildModeration,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.DirectMessages
    ]
});

// Connect to MongoDB
mongoose.connect('mongodb://localhost:27017/discordBot', {
    useNewUrlParser: true,
    useUnifiedTopology: true
}).then(() => console.log('Connected to MongoDB'))
    .catch(err => console.error('MongoDB connection error:', err));

// Database schemas
const warnSchema = new Schema({
    guildId: String,
    userId: String,
    warnings: [{
        moderatorId: String,
        reason: String,
        timestamp: { type: Date, default: Date.now }
    }],
    warnLimit: { type: Number, default: 3 }
});

const ticketSchema = new Schema({
    guildId: String,
    channelId: String,
    userId: String,
    claimedBy: { type: String, default: null },
    isClosed: { type: Boolean, default: false },
    type: String,
    createdAt: { type: Date, default: Date.now }
});

const applicationSchema = new Schema({
    guildId: String,
    channelId: String,
    roleId: String,
    questions: [String],
    createdAt: { type: Date, default: Date.now }
});

const userAppSchema = new Schema({
    guildId: String,
    userId: String,
    roleId: String,
    answers: [String],
    status: { type: String, default: 'pending' }, // pending, accepted, rejected
    reviewedBy: { type: String, default: null },
    createdAt: { type: Date, default: Date.now }
});

const jailSchema = new Schema({
    guildId: String,
    userId: String,
    jailedBy: String,
    reason: String,
    duration: String,
    jailedAt: { type: Date, default: Date.now },
    releasedAt: Date
});

// Models
const Warn = mongoose.model('Warn', warnSchema);
const Ticket = mongoose.model('Ticket', ticketSchema);
const Application = mongoose.model('Application', applicationSchema);
const UserApp = mongoose.model('UserApp', userAppSchema);
const Jail = mongoose.model('Jail', jailSchema);

// Bot ready event
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    client.user.setActivity('!help for commands');
});

// Slash command interaction
client.on('interactionCreate', async interaction => {
    if (interaction.isChatInputCommand()) {
        // Handle slash commands if needed
    } else if (interaction.isStringSelectMenu()) {
        handleSelectMenu(interaction);
    } else if (interaction.isButton()) {
        handleButtons(interaction);
    } else if (interaction.isModalSubmit()) {
        handleModalSubmit(interaction);
    }
});

// Message commands
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();

    try {
        switch (command) {
            case 'help':
                await helpCommand(message);
                break;
            case 'warn':
                await warnCommand(message, args);
                break;
            case 'warnings':
                await warningsCommand(message, args);
                break;
            case 'warnlimit':
                await warnLimitCommand(message, args);
                break;
            case 'kick':
                await kickCommand(message, args);
                break;
            case 'ban':
                await banCommand(message, args);
                break;
            case 'mute':
                await muteCommand(message, args);
                break;
            case 'jail':
                await jailCommand(message, args);
                break;
            case 'free':
                await freeCommand(message, args);
                break;
            case 'jailers':
                await jailersCommand(message);
                break;
            case 'ticket':
                await ticketCommand(message, args);
                break;
            case 'setoptions':
                await setOptionsCommand(message, args);
                break;
            case 'setviewer':
                await setViewerCommand(message, args);
                break;
            case 'app':
                await appCommand(message, args);
                break;
            case 'addoptions':
                await addOptionsCommand(message, args);
                break;
            case 'ques1':
            case 'ques2':
            case 'ques3':
            case 'ques4':
            case 'ques5':
                await addQuestionCommand(message, command, args);
                break;
            case 'rps':
                await rpsCommand(message, args);
                break;
            case 'tictactoe':
                await tictactoeCommand(message, args);
                break;
            case 'guess':
                await guessCommand(message);
                break;
            case 'math':
                await mathCommand(message);
                break;
            case 'trivia':
                await triviaCommand(message);
                break;
            case 'type':
                await typeCommand(message);
                break;
            case 'dm':
                await dmCommand(message, args);
                break;
            case 'embed':
                await embedCommand(message, args);
                break;
            case 'userinfo':
                await userInfoCommand(message, args);
                break;
            case 'serverinfo':
                await serverInfoCommand(message);
                break;
            case 'ping':
                await pingCommand(message);
                break;
            case 'prems':
                await premsCommand(message, args);
                break;
            default:
                break;
        }
    } catch (error) {
        console.error(`Error executing command ${command}:`, error);
        message.reply('There was an error executing that command.');
    }
});

// Command handlers
async function helpCommand(message) {
    const embed = new EmbedBuilder()
        .setTitle('🌟 Help Center 🌟')
        .setDescription('Welcome to the help center! Select a category below to view commands.')
        .setColor('#0099ff')
        .setThumbnail(client.user.displayAvatarURL())
        .setFooter({ text: 'Need more help? Contact server staff.' });

    const row = new ActionRowBuilder().addComponents(
        new StringSelectMenuBuilder()
            .setCustomId('help_menu')
            .setPlaceholder('Select a category')
            .addOptions(
                {
                    label: 'Moderation',
                    description: 'Commands for server moderation',
                    value: 'moderation'
                },
                {
                    label: 'Ticket System',
                    description: 'Commands for ticket management',
                    value: 'tickets'
                },
                {
                    label: 'Application System',
                    description: 'Commands for role applications',
                    value: 'applications'
                },
                {
                    label: 'Mini-Games',
                    description: 'Fun games to play',
                    value: 'games'
                },
                {
                    label: 'Utility',
                    description: 'Useful utility commands',
                    value: 'utility'
                }
            )
    );

    await message.channel.send({ embeds: [embed], components: [row] });
}

async function handleSelectMenu(interaction) {
    if (interaction.customId === 'help_menu') {
        const category = interaction.values[0];
        let embed;

        switch (category) {
            case 'moderation':
                embed = new EmbedBuilder()
                    .setTitle('🔨 Moderation Commands')
                    .setColor('#ff0000')
                    .addFields(
                        { name: '!warn [user] [reason]', value: 'Warn a user', inline: true },
                        { name: '!warnings [user]', value: 'View user warnings', inline: true },
                        { name: '!warnlimit [number]', value: 'Set warn limit', inline: true },
                        { name: '!kick [user] [reason]', value: 'Kick a user', inline: true },
                        { name: '!ban [user] [reason]', value: 'Ban a user', inline: true },
                        { name: '!mute [user] [time] [reason]', value: 'Mute a user', inline: true },
                        { name: '!jail [user] [time] [reason]', value: 'Jail a user', inline: true },
                        { name: '!free [user]', value: 'Free a jailed user', inline: true },
                        { name: '!jailers', value: 'View jail moderators', inline: true }
                    );
                break;
            case 'tickets':
                embed = new EmbedBuilder()
                    .setTitle('🎫 Ticket Commands')
                    .setColor('#00ff00')
                    .addFields(
                        { name: '!ticket msg [message]', value: 'Create ticket panel', inline: true },
                        { name: '!setoptions [option1,option2,...]', value: 'Set ticket options', inline: true },
                        { name: '!setviewer [role]', value: 'Set ticket viewer role', inline: true }
                    );
                break;
            case 'applications':
                embed = new EmbedBuilder()
                    .setTitle('📝 Application Commands')
                    .setColor('#ffff00')
                    .addFields(
                        { name: '!app msg [message]', value: 'Create application panel', inline: true },
                        { name: '!addoptions [role1,role2,...]', value: 'Add application roles', inline: true },
                        { name: '!ques1 [question]', value: 'Set question 1', inline: true },
                        { name: '!ques2 [question]', value: 'Set question 2', inline: true },
                        { name: '!ques3 [question]', value: 'Set question 3', inline: true }
                    );
                break;
            case 'games':
                embed = new EmbedBuilder()
                    .setTitle('🎮 Game Commands')
                    .setColor('#ff00ff')
                    .addFields(
                        { name: '!rps [@user]', value: 'Play rock-paper-scissors', inline: true },
                        { name: '!tictactoe [@user]', value: 'Play tic-tac-toe', inline: true },
                        { name: '!guess', value: 'Number guessing game', inline: true },
                        { name: '!math', value: 'Math challenge', inline: true },
                        { name: '!trivia', value: 'Trivia questions', inline: true },
                        { name: '!type', value: 'Typing speed test', inline: true }
                    );
                break;
            case 'utility':
                embed = new EmbedBuilder()
                    .setTitle('⚙️ Utility Commands')
                    .setColor('#00ffff')
                    .addFields(
                        { name: '!userinfo [user]', value: 'Get user information', inline: true },
                        { name: '!serverinfo', value: 'Get server information', inline: true },
                        { name: '!ping', value: 'Check bot latency', inline: true },
                        { name: '!dm [role] [message]', value: 'Mass DM a role', inline: true },
                        { name: '!embed [title] [description]', value: 'Create embed', inline: true },
                        { name: '!prems [role]', value: 'Set premium role', inline: true }
                    );
                break;
        }

        await interaction.update({ embeds: [embed], components: [] });
    }
}

async function warnCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.reply('You do not have permission to warn users.');
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply('Please mention a user to warn.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    let warnData = await Warn.findOne({ guildId: message.guild.id, userId: user.id });
    if (!warnData) {
        warnData = new Warn({ guildId: message.guild.id, userId: user.id, warnings: [] });
    }

    warnData.warnings.push({
        moderatorId: message.author.id,
        reason: reason
    });

    await warnData.save();

    const embed = new EmbedBuilder()
        .setTitle('⚠️ User Warned')
        .setColor('#ffcc00')
        .addFields(
            { name: 'User', value: user.tag, inline: true },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Reason', value: reason, inline: false },
            { name: 'Total Warnings', value: warnData.warnings.length.toString(), inline: true },
            { name: 'Warn Limit', value: warnData.warnLimit.toString(), inline: true }
        )
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    // Check if warnings exceed limit
    if (warnData.warnings.length >= warnData.warnLimit) {
        const member = await message.guild.members.fetch(user.id);
        await member.kick(`Exceeded warn limit (${warnData.warnLimit} warnings)`);
        message.channel.send(`${user.tag} has been kicked for exceeding the warn limit.`);
    }
}

async function warningsCommand(message, args) {
    const user = message.mentions.users.first() || message.author;
    
    const warnData = await Warn.findOne({ guildId: message.guild.id, userId: user.id });
    if (!warnData || warnData.warnings.length === 0) {
        return message.reply(`${user.tag} has no warnings.`);
    }

    const embed = new EmbedBuilder()
        .setTitle(`⚠️ Warnings for ${user.tag}`)
        .setColor('#ffcc00')
        .setThumbnail(user.displayAvatarURL());

    warnData.warnings.forEach((warn, index) => {
        embed.addFields({
            name: `Warning #${index + 1}`,
            value: `**Moderator:** <@${warn.moderatorId}>\n**Reason:** ${warn.reason}\n**Date:** ${warn.timestamp.toLocaleString()}`,
            inline: false
        });
    });

    embed.addFields(
        { name: 'Total Warnings', value: warnData.warnings.length.toString(), inline: true },
        { name: 'Warn Limit', value: warnData.warnLimit.toString(), inline: true }
    );

    await message.channel.send({ embeds: [embed] });
}

async function warnLimitCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.reply('You do not have permission to set warn limits.');
    }

    const limit = parseInt(args[0]);
    if (isNaN(limit) || limit < 1) {
        return message.reply('Please provide a valid number for the warn limit (minimum 1).');
    }

    const user = message.mentions.users.first();
    if (user) {
        // Set for specific user
        let warnData = await Warn.findOne({ guildId: message.guild.id, userId: user.id });
        if (!warnData) {
            warnData = new Warn({ guildId: message.guild.id, userId: user.id, warnings: [] });
        }
        warnData.warnLimit = limit;
        await warnData.save();
        message.reply(`Set warn limit to ${limit} for ${user.tag}.`);
    } else {
        // Set for all users (default)
        await Warn.updateMany(
            { guildId: message.guild.id },
            { $set: { warnLimit: limit } },
            { upsert: true }
        );
        message.reply(`Default warn limit set to ${limit} for all users.`);
    }
}

async function kickCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.reply('You do not have permission to kick users.');
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply('Please mention a user to kick.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    const member = await message.guild.members.fetch(user.id);
    await member.kick(reason);

    const embed = new EmbedBuilder()
        .setTitle('👢 User Kicked')
        .setColor('#ff6600')
        .addFields(
            { name: 'User', value: user.tag, inline: true },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

async function banCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.reply('You do not have permission to ban users.');
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply('Please mention a user to ban.');

    const reason = args.slice(1).join(' ') || 'No reason provided';

    const member = await message.guild.members.fetch(user.id);
    await member.ban({ reason: reason });

    const embed = new EmbedBuilder()
        .setTitle('🔨 User Banned')
        .setColor('#ff0000')
        .addFields(
            { name: 'User', value: user.tag, inline: true },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

async function muteCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('You do not have permission to mute users.');
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply('Please mention a user to mute.');

    const time = args[1];
    if (!time) return message.reply('Please specify a mute duration (e.g., 1h, 30m).');

    const reason = args.slice(2).join(' ') || 'No reason provided';

    const durationMs = ms(time);
    if (!durationMs || durationMs < 60000 || durationMs > 2419200000) {
        return message.reply('Please provide a valid duration between 1 minute and 28 days.');
    }

    const member = await message.guild.members.fetch(user.id);
    await member.timeout(durationMs, reason);

    const embed = new EmbedBuilder()
        .setTitle('🔇 User Muted')
        .setColor('#6600cc')
        .addFields(
            { name: 'User', value: user.tag, inline: true },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Duration', value: time, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

async function jailCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('You do not have permission to jail users.');
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply('Please mention a user to jail.');

    const time = args[1];
    if (!time) return message.reply('Please specify a jail duration (e.g., 1h, 30m).');

    const reason = args.slice(2).join(' ') || 'No reason provided';

    const durationMs = ms(time);
    if (!durationMs || durationMs < 60000 || durationMs > 2419200000) {
        return message.reply('Please provide a valid duration between 1 minute and 28 days.');
    }

    // Check if jail role exists, create if not
    let jailRole = message.guild.roles.cache.find(r => r.name === 'Jailed');
    if (!jailRole) {
        jailRole = await message.guild.roles.create({
            name: 'Jailed',
            color: '#000000',
            permissions: [],
            reason: 'Jail system role'
        });

        // Set channel permissions for jail role
        message.guild.channels.cache.forEach(async channel => {
            try {
                await channel.permissionOverwrites.edit(jailRole, {
                    SendMessages: false,
                    AddReactions: false,
                    Connect: false,
                    Speak: false,
                    ViewChannel: channel.type === 0 // Only allow view for text channels
                });
            } catch (error) {
                console.error(`Error setting permissions for channel ${channel.name}:`, error);
            }
        });
    }

    const member = await message.guild.members.fetch(user.id);
    await member.roles.add(jailRole);

    // Save to database
    const jailData = new Jail({
        guildId: message.guild.id,
        userId: user.id,
        jailedBy: message.author.id,
        reason: reason,
        duration: time,
        releasedAt: new Date(Date.now() + durationMs)
    });
    await jailData.save();

    const embed = new EmbedBuilder()
        .setTitle('⛓️ User Jailed')
        .setColor('#000000')
        .addFields(
            { name: 'User', value: user.tag, inline: true },
            { name: 'Moderator', value: message.author.tag, inline: true },
            { name: 'Duration', value: time, inline: true },
            { name: 'Reason', value: reason, inline: false }
        )
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });

    // Set timeout to automatically remove jail
    setTimeout(async () => {
        try {
            const member = await message.guild.members.fetch(user.id);
            if (member.roles.cache.has(jailRole.id)) {
                await member.roles.remove(jailRole);
                await Jail.updateOne(
                    { guildId: message.guild.id, userId: user.id, releasedAt: null },
                    { $set: { releasedAt: new Date() } }
                );
                
                const releaseEmbed = new EmbedBuilder()
                    .setTitle('🔓 User Released')
                    .setColor('#00ff00')
                    .setDescription(`${user.tag} has been automatically released from jail after ${time}.`)
                    .setTimestamp();
                
                message.channel.send({ embeds: [releaseEmbed] });
            }
        } catch (error) {
            console.error('Error auto-releasing jailed user:', error);
        }
    }, durationMs);
}

async function freeCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.reply('You do not have permission to free users.');
    }

    const user = message.mentions.users.first();
    if (!user) return message.reply('Please mention a user to free.');

    const jailRole = message.guild.roles.cache.find(r => r.name === 'Jailed');
    if (!jailRole) return message.reply('No jail role found.');

    const member = await message.guild.members.fetch(user.id);
    if (!member.roles.cache.has(jailRole.id)) {
        return message.reply('This user is not jailed.');
    }

    await member.roles.remove(jailRole);

    await Jail.updateOne(
        { guildId: message.guild.id, userId: user.id, releasedAt: null },
        { $set: { releasedAt: new Date() } }
    );

    const embed = new EmbedBuilder()
        .setTitle('🔓 User Released')
        .setColor('#00ff00')
        .addFields(
            { name: 'User', value: user.tag, inline: true },
            { name: 'Moderator', value: message.author.tag, inline: true }
        )
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

async function jailersCommand(message) {
    const jailers = await Jail.distinct('jailedBy', { guildId: message.guild.id });
    if (jailers.length === 0) {
        return message.reply('No jail actions recorded.');
    }

    const embed = new EmbedBuilder()
        .setTitle('👮 Jail Moderators')
        .setColor('#555555')
        .setDescription('Moderators who have used the jail command:');

    for (const jailerId of jailers) {
        try {
            const jailer = await message.guild.members.fetch(jailerId);
            const count = await Jail.countDocuments({ guildId: message.guild.id, jailedBy: jailerId });
            embed.addFields({
                name: jailer.user.tag,
                value: `${count} jail actions`,
                inline: true
            });
        } catch (error) {
            console.error(`Error fetching jailer ${jailerId}:`, error);
        }
    }

    await message.channel.send({ embeds: [embed] });
}

async function ticketCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply('You do not have permission to manage tickets.');
    }

    const subcommand = args[0];
    if (!subcommand) return message.reply('Please specify a subcommand (msg, panel, etc.)');

    if (subcommand === 'msg') {
        const panelMessage = args.slice(1).join(' ') || 'Create a ticket by selecting an option below:';
        
        const embed = new EmbedBuilder()
            .setTitle('🎫 Support Tickets')
            .setDescription(panelMessage)
            .setColor('#0099ff')
            .setFooter({ text: 'Select an option below to create a ticket' });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('ticket_create')
                .setPlaceholder('Select a ticket type')
                .addOptions(
                    {
                        label: 'General Support',
                        description: 'For general questions',
                        value: 'general'
                    },
                    {
                        label: 'Technical Issue',
                        description: 'For technical problems',
                        value: 'technical'
                    },
                    {
                        label: 'Report User',
                        description: 'To report a user',
                        value: 'report'
                    }
                )
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }
}

async function setOptionsCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.reply('You do not have permission to configure tickets.');
    }

    const options = args.join(' ').split(',');
    if (options.length === 0) return message.reply('Please provide ticket options separated by commas.');

    // In a real implementation, you would save these options to your database
    message.reply(`Ticket options set to: ${options.join(', ')}`);
}

async function setViewerCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply('You do not have permission to configure ticket viewers.');
    }

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Please mention a role or provide a role ID.');

    // In a real implementation, you would save this role to your database
    message.reply(`Ticket viewer role set to: ${role.name}`);
}

async function handleButtons(interaction) {
    if (interaction.customId === 'ticket_create') {
        // Handle ticket creation
        const type = interaction.values[0];
        await interaction.deferReply({ ephemeral: true });

        const channelName = `ticket-${interaction.user.username.toLowerCase()}`;
        const channel = await interaction.guild.channels.create({
            name: channelName,
            type: 0, // Text channel
            parent: interaction.channel.parentId,
            permissionOverwrites: [
                {
                    id: interaction.guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: interaction.user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }
            ]
        });

        const ticket = new Ticket({
            guildId: interaction.guild.id,
            channelId: channel.id,
            userId: interaction.user.id,
            type: type
        });
        await ticket.save();

        const embed = new EmbedBuilder()
            .setTitle(`🎫 ${type.charAt(0).toUpperCase() + type.slice(1)} Ticket`)
            .setDescription(`Hello ${interaction.user.toString()}! Support will be with you shortly.\n\nPlease describe your issue in detail.`)
            .setColor('#0099ff')
            .setFooter({ text: `Ticket ID: ${channel.id}` });

        const row = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('ticket_close')
                .setLabel('Close Ticket')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('ticket_claim')
                .setLabel('Claim Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        await channel.send({ 
            content: `${interaction.user.toString()} ${interaction.guild.roles.everyone.toString()}`,
            embeds: [embed], 
            components: [row] 
        });

        await interaction.editReply({ content: `Your ticket has been created: ${channel.toString()}`, ephemeral: true });
    } else if (interaction.customId === 'ticket_close') {
        // Handle ticket closing
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
        if (!ticket) return interaction.reply({ content: 'This channel is not a valid ticket.', ephemeral: true });

        if (ticket.userId !== interaction.user.id && !interaction.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
            return interaction.reply({ content: 'Only the ticket creator or staff can close this ticket.', ephemeral: true });
        }

        ticket.isClosed = true;
        await ticket.save();

        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Closed')
            .setDescription(`This ticket has been closed by ${interaction.user.toString()}`)
            .setColor('#ff0000')
            .setTimestamp();

        await interaction.channel.send({ embeds: [embed] });
        await interaction.channel.permissionOverwrites.set([
            {
                id: interaction.guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: ticket.userId,
                deny: [PermissionFlagsBits.ViewChannel]
            }
        ]);

        // In a real implementation, you would also generate and send a transcript
    } else if (interaction.customId === 'ticket_claim') {
        // Handle ticket claiming
        const ticket = await Ticket.findOne({ channelId: interaction.channel.id });
        if (!ticket) return interaction.reply({ content: 'This channel is not a valid ticket.', ephemeral: true });

        if (ticket.claimedBy) {
            return interaction.reply({ content: `This ticket is already claimed by <@${ticket.claimedBy}>`, ephemeral: true });
        }

        ticket.claimedBy = interaction.user.id;
        await ticket.save();

        await interaction.channel.permissionOverwrites.edit(interaction.user.id, {
            ViewChannel: true,
            SendMessages: true
        });

        const embed = new EmbedBuilder()
            .setTitle('🎫 Ticket Claimed')
            .setDescription(`This ticket has been claimed by ${interaction.user.toString()}`)
            .setColor('#00ff00')
            .setTimestamp();

        await interaction.reply({ embeds: [embed] });
    }
}

async function appCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply('You do not have permission to manage applications.');
    }

    const subcommand = args[0];
    if (!subcommand) return message.reply('Please specify a subcommand (msg, panel, etc.)');

    if (subcommand === 'msg') {
        const panelMessage = args.slice(1).join(' ') || 'Apply for a role by selecting an option below:';
        
        const appData = await Application.find({ guildId: message.guild.id });
        if (appData.length === 0) {
            return message.reply('No application roles configured. Use !addoptions first.');
        }

        const options = appData.map(app => {
            const role = message.guild.roles.cache.get(app.roleId);
            return {
                label: role ? role.name : 'Unknown Role',
                description: `Apply for ${role ? role.name : 'this role'}`,
                value: app.roleId
            };
        });

        const embed = new EmbedBuilder()
            .setTitle('📝 Role Applications')
            .setDescription(panelMessage)
            .setColor('#ffff00')
            .setFooter({ text: 'Select a role to apply' });

        const row = new ActionRowBuilder().addComponents(
            new StringSelectMenuBuilder()
                .setCustomId('app_select')
                .setPlaceholder('Select a role')
                .addOptions(options)
        );

        await message.channel.send({ embeds: [embed], components: [row] });
        await message.delete();
    }
}

async function addOptionsCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply('You do not have permission to configure applications.');
    }

    const roles = args.join(' ').split(',');
    if (roles.length === 0) return message.reply('Please provide role names or IDs separated by commas.');

    for (const roleStr of roles) {
        const role = message.mentions.roles.first() || message.guild.roles.cache.find(r => r.name === roleStr) || message.guild.roles.cache.get(roleStr);
        if (!role) {
            message.reply(`Role "${roleStr}" not found. Skipping.`);
            continue;
        }

        let appData = await Application.findOne({ guildId: message.guild.id, roleId: role.id });
        if (!appData) {
            appData = new Application({
                guildId: message.guild.id,
                roleId: role.id,
                questions: []
            });
            await appData.save();
            message.reply(`Added "${role.name}" to application options.`);
        } else {
            message.reply(`"${role.name}" is already in application options.`);
        }
    }
}

async function addQuestionCommand(message, command, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply('You do not have permission to configure applications.');
    }

    const questionNumber = parseInt(command.replace('ques', ''));
    const question = args.join(' ');
    if (!question) return message.reply('Please provide a question.');

    // In a real implementation, you would save this question to your database
    message.reply(`Question ${questionNumber} set to: "${question}"`);
}

async function handleModalSubmit(interaction) {
    if (interaction.customId.startsWith('app_')) {
        const roleId = interaction.customId.split('_')[1];
        const appData = await Application.findOne({ guildId: interaction.guild.id, roleId: roleId });
        if (!appData) return interaction.reply({ content: 'Application data not found.', ephemeral: true });

        const answers = [];
        for (let i = 0; i < appData.questions.length; i++) {
            answers.push(interaction.fields.getTextInputValue(`answer_${i}`));
        }

        const userApp = new UserApp({
            guildId: interaction.guild.id,
            userId: interaction.user.id,
            roleId: roleId,
            answers: answers
        });
        await userApp.save();

        const embed = new EmbedBuilder()
            .setTitle('📝 Application Submitted')
            .setDescription(`Your application for <@&${roleId}> has been submitted for review.`)
            .setColor('#ffff00')
            .setTimestamp();

        await interaction.reply({ embeds: [embed], ephemeral: true });

        // Notify staff
        const staffChannel = interaction.guild.channels.cache.find(c => c.name === 'applications');
        if (staffChannel) {
            const staffEmbed = new EmbedBuilder()
                .setTitle('📝 New Application')
                .setDescription(`New application from ${interaction.user.toString()} for <@&${roleId}>`)
                .setColor('#ffff00')
                .setThumbnail(interaction.user.displayAvatarURL());

            for (let i = 0; i < appData.questions.length; i++) {
                staffEmbed.addFields({
                    name: appData.questions[i],
                    value: answers[i] || 'No answer provided',
                    inline: false
                });
            }

            const row = new ActionRowBuilder().addComponents(
                new ButtonBuilder()
                    .setCustomId(`app_accept_${userApp._id}`)
                    .setLabel('Accept')
                    .setStyle(ButtonStyle.Success),
                new ButtonBuilder()
                    .setCustomId(`app_reject_${userApp._id}`)
                    .setLabel('Reject')
                    .setStyle(ButtonStyle.Danger)
            );

            await staffChannel.send({ 
                content: `${interaction.user.toString()} <@&${roleId}>`,
                embeds: [staffEmbed], 
                components: [row] 
            });
        }
    }
}

async function rpsCommand(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply('Please mention a user to play against.');

    if (opponent.bot) return message.reply('You cannot play against bots.');
    if (opponent.id === message.author.id) return message.reply('You cannot play against yourself.');

    const embed = new EmbedBuilder()
        .setTitle('🪨 Rock Paper Scissors')
        .setDescription(`${opponent.toString()}, ${message.author.toString()} has challenged you to Rock Paper Scissors!\n\nClick the button below to accept.`)
        .setColor('#00ff00');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`rps_accept_${message.author.id}_${opponent.id}`)
            .setLabel('Accept Challenge')
            .setStyle(ButtonStyle.Primary)
    );

    const challenge = await message.channel.send({ 
        content: opponent.toString(),
        embeds: [embed], 
        components: [row] 
    });

    // Delete the challenge after 60 seconds
    setTimeout(() => {
        if (!challenge.deleted) {
            challenge.delete().catch(console.error);
        }
    }, 60000);
}

async function tictactoeCommand(message, args) {
    const opponent = message.mentions.users.first();
    if (!opponent) return message.reply('Please mention a user to play against.');

    if (opponent.bot) return message.reply('You cannot play against bots.');
    if (opponent.id === message.author.id) return message.reply('You cannot play against yourself.');

    const embed = new EmbedBuilder()
        .setTitle('❌ Tic Tac Toe ⭕')
        .setDescription(`${opponent.toString()}, ${message.author.toString()} has challenged you to Tic Tac Toe!\n\nClick the button below to accept.`)
        .setColor('#0000ff');

    const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId(`ttt_accept_${message.author.id}_${opponent.id}`)
            .setLabel('Accept Challenge')
            .setStyle(ButtonStyle.Primary)
    );

    const challenge = await message.channel.send({ 
        content: opponent.toString(),
        embeds: [embed], 
        components: [row] 
    });

    // Delete the challenge after 60 seconds
    setTimeout(() => {
        if (!challenge.deleted) {
            challenge.delete().catch(console.error);
        }
    }, 60000);
}

async function guessCommand(message) {
    const number = Math.floor(Math.random() * 100) + 1;
    let attempts = 0;
    const maxAttempts = 5;

    const embed = new EmbedBuilder()
        .setTitle('🔢 Number Guessing Game')
        .setDescription(`I'm thinking of a number between 1 and 100. You have ${maxAttempts} attempts to guess it!\n\nType your guess in chat.`)
        .setColor('#ff00ff');

    await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: maxAttempts });

    collector.on('collect', m => {
        attempts++;
        const guess = parseInt(m.content);
        
        if (guess === number) {
            const winEmbed = new EmbedBuilder()
                .setTitle('🎉 You Win!')
                .setDescription(`Correct! The number was ${number}. You guessed it in ${attempts} attempts!`)
                .setColor('#00ff00');
            
            message.channel.send({ embeds: [winEmbed] });
            collector.stop();
        } else if (guess < number) {
            message.channel.send(`Too low! ${maxAttempts - attempts} attempts remaining.`);
        } else {
            message.channel.send(`Too high! ${maxAttempts - attempts} attempts remaining.`);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time') {
            message.channel.send(`Time's up! The number was ${number}.`);
        } else if (reason === 'limit' && !collected.last().content.includes(number)) {
            message.channel.send(`Game over! The number was ${number}.`);
        }
    });
}

async function mathCommand(message) {
    const operations = ['+', '-', '*', '/'];
    const operation = operations[Math.floor(Math.random() * operations.length)];
    let num1, num2, answer;

    switch (operation) {
        case '+':
            num1 = Math.floor(Math.random() * 50) + 1;
            num2 = Math.floor(Math.random() * 50) + 1;
            answer = num1 + num2;
            break;
        case '-':
            num1 = Math.floor(Math.random() * 100) + 1;
            num2 = Math.floor(Math.random() * num1) + 1;
            answer = num1 - num2;
            break;
        case '*':
            num1 = Math.floor(Math.random() * 12) + 1;
            num2 = Math.floor(Math.random() * 12) + 1;
            answer = num1 * num2;
            break;
        case '/':
            num2 = Math.floor(Math.random() * 10) + 1;
            answer = Math.floor(Math.random() * 10) + 1;
            num1 = num2 * answer;
            break;
    }

    const embed = new EmbedBuilder()
        .setTitle('🧮 Math Challenge')
        .setDescription(`What is ${num1} ${operation} ${num2}?\n\nYou have 15 seconds to answer.`)
        .setColor('#0000ff');

    await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

    collector.on('collect', m => {
        const guess = parseInt(m.content);
        if (guess === answer) {
            message.channel.send('✅ Correct! Well done!');
        } else {
            message.channel.send(`❌ Incorrect! The answer was ${answer}.`);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            message.channel.send(`Time's up! The answer was ${answer}.`);
        }
    });
}

async function triviaCommand(message) {
    const questions = [
        {
            question: 'What is the capital of France?',
            answer: 'paris'
        },
        {
            question: 'How many continents are there?',
            answer: '7'
        },
        {
            question: 'What is the largest planet in our solar system?',
            answer: 'jupiter'
        }
    ];

    const q = questions[Math.floor(Math.random() * questions.length)];

    const embed = new EmbedBuilder()
        .setTitle('❓ Trivia Question')
        .setDescription(q.question)
        .setColor('#ff00ff')
        .setFooter({ text: 'You have 15 seconds to answer.' });

    await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

    collector.on('collect', m => {
        if (m.content.toLowerCase() === q.answer) {
            message.channel.send('✅ Correct! Well done!');
        } else {
            message.channel.send(`❌ Incorrect! The answer was ${q.answer}.`);
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            message.channel.send(`Time's up! The answer was ${q.answer}.`);
        }
    });
}

async function typeCommand(message) {
    const sentences = [
        'The quick brown fox jumps over the lazy dog.',
        'Pack my box with five dozen liquor jugs.',
        'How vexingly quick daft zebras jump!',
        'Bright vixens jump; dozy fowl quack.'
    ];

    const sentence = sentences[Math.floor(Math.random() * sentences.length)];

    const embed = new EmbedBuilder()
        .setTitle('⌨️ Typing Test')
        .setDescription(`Type the following sentence as fast as you can:\n\n**${sentence}**`)
        .setColor('#00ffff');

    await message.channel.send({ embeds: [embed] });

    const startTime = Date.now();
    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', m => {
        const endTime = Date.now();
        const timeTaken = (endTime - startTime) / 1000; // in seconds
        const words = sentence.split(' ').length;
        const wpm = Math.round((words / timeTaken) * 60);

        if (m.content === sentence) {
            const resultEmbed = new EmbedBuilder()
                .setTitle('⌨️ Typing Results')
                .setDescription(`You typed ${words} words in ${timeTaken.toFixed(2)} seconds.\n\nYour typing speed: **${wpm} WPM**`)
                .setColor('#00ff00');
            
            message.channel.send({ embeds: [resultEmbed] });
        } else {
            message.channel.send('❌ Your typing didn\'t match the given sentence exactly.');
        }
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' && collected.size === 0) {
            message.channel.send('⏰ Time\'s up! You took too long to respond.');
        }
    });
}

async function dmCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.reply('You do not have permission to use this command.');
    }

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Please mention a role or provide a role ID.');

    const content = args.slice(1).join(' ');
    if (!content) return message.reply('Please provide a message to send.');

    const members = await message.guild.members.fetch();
    const targetMembers = members.filter(m => m.roles.cache.has(role.id));

    if (targetMembers.size === 0) {
        return message.reply('No members found with that role.');
    }

    const confirmation = await message.channel.send(`Are you sure you want to DM this message to ${targetMembers.size} members with the ${role.name} role?\n\n**Message:** ${content}\n\nReact with ✅ to confirm or ❌ to cancel.`);

    await confirmation.react('✅');
    await confirmation.react('❌');

    const filter = (reaction, user) => {
        return ['✅', '❌'].includes(reaction.emoji.name) && user.id === message.author.id;
    };

    const collector = confirmation.createReactionCollector({ filter, time: 60000, max: 1 });

    collector.on('collect', async reaction => {
        if (reaction.emoji.name === '✅') {
            let success = 0;
            let failed = 0;

            for (const member of targetMembers.values()) {
                try {
                    await member.send(content);
                    success++;
                } catch (error) {
                    failed++;
                    console.error(`Failed to DM ${member.user.tag}:`, error);
                }
            }

            message.channel.send(`✅ Successfully sent DMs to ${success} members. ${failed} failed.`);
        } else {
            message.channel.send('❌ DM operation cancelled.');
        }
    });

    collector.on('end', collected => {
        if (collected.size === 0) {
            message.channel.send('⏰ DM operation timed out.');
        }
    });
}

async function embedCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.reply('You do not have permission to create embeds.');
    }

    const title = args[0] || 'Embed Title';
    const description = args.slice(1).join(' ') || 'Embed description goes here.';

    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor('#0099ff')
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
    await message.delete();
}

async function userInfoCommand(message, args) {
    const user = message.mentions.users.first() || message.author;
    const member = await message.guild.members.fetch(user.id);

    const embed = new EmbedBuilder()
        .setTitle(`👤 User Information - ${user.tag}`)
        .setThumbnail(user.displayAvatarURL())
        .setColor(member.displayHexColor || '#0099ff')
        .addFields(
            { name: 'ID', value: user.id, inline: true },
            { name: 'Nickname', value: member.nickname || 'None', inline: true },
            { name: 'Account Created', value: user.createdAt.toLocaleString(), inline: true },
            { name: 'Joined Server', value: member.joinedAt.toLocaleString(), inline: true },
            { name: 'Roles', value: member.roles.cache.size > 1 ? member.roles.cache.filter(r => r.id !== message.guild.id).map(r => r.toString()).join(' ') : 'None', inline: false }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

async function serverInfoCommand(message) {
    const guild = message.guild;
    const owner = await guild.fetchOwner();

    const embed = new EmbedBuilder()
        .setTitle(`ℹ️ Server Information - ${guild.name}`)
        .setThumbnail(guild.iconURL())
        .setColor('#0099ff')
        .addFields(
            { name: 'Owner', value: owner.user.tag, inline: true },
            { name: 'ID', value: guild.id, inline: true },
            { name: 'Created', value: guild.createdAt.toLocaleString(), inline: true },
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
            { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true }
        )
        .setFooter({ text: `Requested by ${message.author.tag}` })
        .setTimestamp();

    await message.channel.send({ embeds: [embed] });
}

async function pingCommand(message) {
    const msg = await message.channel.send('Pinging...');
    const latency = msg.createdTimestamp - message.createdTimestamp;
    const apiLatency = Math.round(client.ws.ping);

    const embed = new EmbedBuilder()
        .setTitle('🏓 Pong!')
        .setColor('#00ff00')
        .addFields(
            { name: 'Bot Latency', value: `${latency}ms`, inline: true },
            { name: 'API Latency', value: `${apiLatency}ms`, inline: true }
        )
        .setTimestamp();

    await msg.edit({ content: '', embeds: [embed] });
}

async function premsCommand(message, args) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageRoles)) {
        return message.reply('You do not have permission to manage premium roles.');
    }

    const role = message.mentions.roles.first() || message.guild.roles.cache.get(args[0]);
    if (!role) return message.reply('Please mention a role or provide a role ID.');

    // In a real implementation, you would save this role to your database
    message.reply(`Premium role set to: ${role.name}`);
}

// Keep-alive system
const express = require('express');
const app = express();
const port = process.env.PORT || 3000;

app.get('/health', (req, res) => {
    res.status(200).json({ 
        status: 'healthy',
        uptime: process.uptime(),
        timestamp: Date.now()
    });
});

app.listen(port, () => {
    console.log(`Keep-alive server running on port ${port}`);
});

// Login to Discord
client.login(process.env.DISCORD_TOKEN);