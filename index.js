require('dotenv').config();
const fs = require('fs');
const express = require('express');
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits, ChannelType, Collection } = require('discord.js');
const app = express();
const port = 3000;

// Keep alive for Render
app.get('/', (req, res) => res.send('Discord Bot is alive!'));
app.listen(port, () => console.log(`Keep-alive server running on port ${port}`));

// Bot setup
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.DirectMessages
    ]
});

// In-memory storage
const settings = {
    ticketPanel: {
        message: null,
        options: [],
        channelId: null,
        viewerRole: null
    },
    applications: {
        message: null,
        options: [],
        questions: [],
        channelId: null,
        cooldowns: new Map()
    },
    warnings: new Map(),
    blacklistedWords: ['badword1', 'badword2', 'example'],
    modLogChannel: null
};

// Constants
const COLORS = {
    DEFAULT: 0x5865F2,
    SUCCESS: 0x57F287,
    ERROR: 0xED4245,
    WARNING: 0xFEE75C,
    INFO: 0x5865F2
};

const EMOJIS = {
    TICKET: '📩',
    MOD: '🛡️',
    UTIL: '💬',
    FUN: '🎮',
    SUCCESS: '✅',
    ERROR: '❌',
    WARNING: '⚠️',
    INFO: 'ℹ️',
    LOCK: '🔒',
    UNLOCK: '🔓',
    CLOSE: '🛑',
    CLAIM: '🔐',
    TRANSCRIPT: '📄'
};

// Helper functions
function createEmbed(title, description, color = COLORS.DEFAULT, fields = [], footer = null) {
    const embed = new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();

    if (fields.length > 0) embed.addFields(fields);
    if (footer) embed.setFooter({ text: footer });

    return embed;
}

function createActionRow(components) {
    return new ActionRowBuilder().addComponents(components);
}

function createButton(customId, label, style, emoji = null, disabled = false) {
    const button = new ButtonBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(style)
        .setDisabled(disabled);

    if (emoji) button.setEmoji(emoji);
    return button;
}

function createSelectMenu(customId, placeholder, options, min = 1, max = 1) {
    const select = new StringSelectMenuBuilder()
        .setCustomId(customId)
        .setPlaceholder(placeholder)
        .setMinValues(min)
        .setMaxValues(max);

    options.forEach(option => {
        select.addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel(option.label)
                .setValue(option.value)
                .setDescription(option.description || '')
                .setEmoji(option.emoji || '')
        );
    });

    return select;
}

function errorEmbed(description) {
    return createEmbed(`${EMOJIS.ERROR} Error`, description, COLORS.ERROR);
}

function successEmbed(description) {
    return createEmbed(`${EMOJIS.SUCCESS} Success`, description, COLORS.SUCCESS);
}

// Moderation functions
async function banUser(message, user, reason = 'No reason provided') {
    if (!message.member.permissions.has(PermissionFlagsBits.BanMembers)) {
        return message.channel.send({ embeds: [errorEmbed('You need ban permissions to use this command!')] });
    }

    try {
        await message.guild.members.ban(user, { reason });
        const embed = createEmbed(
            `${EMOJIS.MOD} User Banned`,
            `${user.tag} has been banned by ${message.author.tag}`,
            COLORS.SUCCESS,
            [{ name: 'Reason', value: reason }]
        );
        message.channel.send({ embeds: [embed] });
        logModAction(`User Banned: ${user.tag} by ${message.author.tag} - Reason: ${reason}`);
    } catch (err) {
        message.channel.send({ embeds: [errorEmbed(`Failed to ban user: ${err.message}`)] });
    }
}

async function kickUser(message, user, reason = 'No reason provided') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.channel.send({ embeds: [errorEmbed('You need kick permissions to use this command!')] });
    }

    try {
        await message.guild.members.kick(user, { reason });
        const embed = createEmbed(
            `${EMOJIS.MOD} User Kicked`,
            `${user.tag} has been kicked by ${message.author.tag}`,
            COLORS.SUCCESS,
            [{ name: 'Reason', value: reason }]
        );
        message.channel.send({ embeds: [embed] });
        logModAction(`User Kicked: ${user.tag} by ${message.author.tag} - Reason: ${reason}`);
    } catch (err) {
        message.channel.send({ embeds: [errorEmbed(`Failed to kick user: ${err.message}`)] });
    }
}

async function muteUser(message, user, duration) {
    if (!message.member.permissions.has(PermissionFlagsBits.ModerateMembers)) {
        return message.channel.send({ embeds: [errorEmbed('You need timeout permissions to use this command!')] });
    }

    const time = parseDuration(duration);
    if (!time) {
        return message.channel.send({ embeds: [errorEmbed('Invalid duration format. Use 1h, 30m, 2d etc.')] });
    }

    try {
        await user.timeout(time, 'Muted by command');
        const embed = createEmbed(
            `${EMOJIS.MOD} User Muted`,
            `${user.tag} has been muted by ${message.author.tag}`,
            COLORS.SUCCESS,
            [
                { name: 'Duration', value: duration },
                { name: 'Expires', value: `<t:${Math.floor((Date.now() + time) / 1000)}:R>` }
            ]
        );
        message.channel.send({ embeds: [embed] });
        logModAction(`User Muted: ${user.tag} by ${message.author.tag} - Duration: ${duration}`);
    } catch (err) {
        message.channel.send({ embeds: [errorEmbed(`Failed to mute user: ${err.message}`)] });
    }
}

function parseDuration(duration) {
    const regex = /^(\d+)([smhd])$/;
    const match = duration.match(regex);
    if (!match) return null;

    const amount = parseInt(match[1]);
    const unit = match[2];

    switch (unit) {
        case 's': return amount * 1000;
        case 'm': return amount * 60 * 1000;
        case 'h': return amount * 60 * 60 * 1000;
        case 'd': return amount * 24 * 60 * 60 * 1000;
        default: return null;
    }
}

function warnUser(message, user, reason = 'No reason provided') {
    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        return message.channel.send({ embeds: [errorEmbed('You need kick permissions to use this command!')] });
    }

    if (!settings.warnings.has(user.id)) {
        settings.warnings.set(user.id, []);
    }

    const warnings = settings.warnings.get(user.id);
    warnings.push({
        reason,
        moderator: message.author.tag,
        timestamp: Date.now()
    });

    const embed = createEmbed(
        `${EMOJIS.MOD} User Warned`,
        `${user.tag} has been warned by ${message.author.tag}`,
        COLORS.WARNING,
        [
            { name: 'Reason', value: reason },
            { name: 'Total Warnings', value: warnings.length.toString() }
        ]
    );
    message.channel.send({ embeds: [embed] });
    logModAction(`User Warned: ${user.tag} by ${message.author.tag} - Reason: ${reason} - Total Warnings: ${warnings.length}`);
}

function showWarnings(message, user) {
    if (!settings.warnings.has(user.id) || settings.warnings.get(user.id).length === 0) {
        return message.channel.send({ embeds: [createEmbed(`${EMOJIS.INFO} Warnings`, `${user.tag} has no warnings.`, COLORS.INFO)] });
    }

    const warnings = settings.warnings.get(user.id);
    const fields = warnings.map((warn, index) => ({
        name: `Warning #${index + 1}`,
        value: `**Moderator:** ${warn.moderator}\n**Reason:** ${warn.reason}\n**Date:** <t:${Math.floor(warn.timestamp / 1000)}:R>`,
        inline: false
    }));

    const embed = createEmbed(
        `${EMOJIS.MOD} Warnings for ${user.tag}`,
        `Total warnings: ${warnings.length}`,
        COLORS.WARNING,
        fields
    );
    message.channel.send({ embeds: [embed] });
}

async function clearMessages(message, amount) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.channel.send({ embeds: [errorEmbed('You need manage messages permissions to use this command!')] });
    }

    amount = parseInt(amount);
    if (isNaN(amount) {
        return message.channel.send({ embeds: [errorEmbed('Please provide a valid number of messages to delete!')] });
    }

    if (amount < 1 || amount > 100) {
        return message.channel.send({ embeds: [errorEmbed('You can only delete between 1 and 100 messages at a time!')] });
    }

    try {
        await message.channel.bulkDelete(amount + 1);
        const embed = createEmbed(
            `${EMOJIS.MOD} Messages Cleared`,
            `${amount} messages have been deleted by ${message.author.tag}`,
            COLORS.SUCCESS
        );
        const reply = await message.channel.send({ embeds: [embed] });
        setTimeout(() => reply.delete(), 5000);
        logModAction(`Messages Cleared: ${amount} messages by ${message.author.tag}`);
    } catch (err) {
        message.channel.send({ embeds: [errorEmbed(`Failed to delete messages: ${err.message}`)] });
    }
}

async function lockChannel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.channel.send({ embeds: [errorEmbed('You need manage channels permissions to use this command!')] });
    }

    try {
        await message.channel.permissionOverwrites.edit(message.guild.id, {
            SendMessages: false
        });
        message.channel.send({ embeds: [successEmbed(`${EMOJIS.LOCK} Channel locked by ${message.author.tag}`)] });
        logModAction(`Channel Locked: ${message.channel.name} by ${message.author.tag}`);
    } catch (err) {
        message.channel.send({ embeds: [errorEmbed(`Failed to lock channel: ${err.message}`)] });
    }
}

async function unlockChannel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageChannels)) {
        return message.channel.send({ embeds: [errorEmbed('You need manage channels permissions to use this command!')] });
    }

    try {
        await message.channel.permissionOverwrites.edit(message.guild.id, {
            SendMessages: null
        });
        message.channel.send({ embeds: [successEmbed(`${EMOJIS.UNLOCK} Channel unlocked by ${message.author.tag}`)] });
        logModAction(`Channel Unlocked: ${message.channel.name} by ${message.author.tag}`);
    } catch (err) {
        message.channel.send({ embeds: [errorEmbed(`Failed to unlock channel: ${err.message}`)] });
    }
}

function logModAction(action) {
    if (!settings.modLogChannel) return;
    const channel = client.channels.cache.get(settings.modLogChannel);
    if (!channel) return;

    const embed = createEmbed(
        `${EMOJIS.MOD} Moderation Action`,
        action,
        COLORS.INFO
    );
    channel.send({ embeds: [embed] }).catch(console.error);
}

// Ticket system functions
function setupTicketPanel(message, embedMessage) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    settings.ticketPanel.message = embedMessage;
    settings.ticketPanel.channelId = message.channel.id;
    message.channel.send({ embeds: [successEmbed('Ticket panel message set successfully!')] });
    setTimeout(() => message.delete(), 3000);
}

function setTicketOptions(message, options) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    settings.ticketPanel.options = options.split(',').map(opt => opt.trim());
    message.channel.send({ embeds: [successEmbed(`Ticket options set to: ${settings.ticketPanel.options.join(', ')}`)] });
    setTimeout(() => message.delete(), 3000);
}

function setViewerRole(message, role) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    settings.ticketPanel.viewerRole = role.id;
    message.channel.send({ embeds: [successEmbed(`Viewer role set to ${role.name}`)] });
    setTimeout(() => message.delete(), 3000);
}

async function deployTicketPanel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    if (!settings.ticketPanel.message || settings.ticketPanel.options.length === 0) {
        return message.channel.send({ embeds: [errorEmbed('Please set the ticket message and options first!')] });
    }

    const selectOptions = settings.ticketPanel.options.map(option => ({
        label: option,
        value: option.toLowerCase().replace(/\s+/g, '_'),
        emoji: EMOJIS.TICKET
    }));

    const selectMenu = createSelectMenu(
        'ticket_create',
        'Select a ticket type...',
        selectOptions
    );

    const embed = createEmbed(
        `${EMOJIS.TICKET} Support Tickets`,
        settings.ticketPanel.message,
        COLORS.INFO
    );

    await message.channel.send({
        embeds: [embed],
        components: [createActionRow([selectMenu])]
    });

    message.channel.send({ embeds: [successEmbed('Ticket panel deployed successfully!')] });
    setTimeout(() => message.delete(), 3000);
}

async function createTicket(interaction) {
    const ticketType = interaction.values[0];
    const guild = interaction.guild;
    const user = interaction.user;

    // Check if user already has an open ticket
    const existingTicket = guild.channels.cache.find(ch => 
        ch.name === `ticket-${user.username.toLowerCase()}` && 
        ch.parentId === settings.ticketPanel.categoryId
    );

    if (existingTicket) {
        return interaction.reply({
            embeds: [errorEmbed('You already have an open ticket! Please close it before creating a new one.')],
            ephemeral: true
        });
    }

    // Create ticket channel
    try {
        const channel = await guild.channels.create({
            name: `ticket-${user.username}`,
            type: ChannelType.GuildText,
            parent: settings.ticketPanel.categoryId,
            permissionOverwrites: [
                {
                    id: guild.id,
                    deny: [PermissionFlagsBits.ViewChannel]
                },
                {
                    id: user.id,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                },
                ...(settings.ticketPanel.viewerRole ? [{
                    id: settings.ticketPanel.viewerRole,
                    allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
                }] : [])
            ]
        });

        // Create ticket buttons
        const buttons = createActionRow([
            createButton('ticket_claim', 'Claim', ButtonStyle.Primary, EMOJIS.CLAIM),
            createButton('ticket_lock', 'Lock', ButtonStyle.Secondary, EMOJIS.LOCK),
            createButton('ticket_close', 'Close', ButtonStyle.Danger, EMOJIS.CLOSE),
            createButton('ticket_transcript', 'Transcript', ButtonStyle.Success, EMOJIS.TRANSCRIPT)
        ]);

        // Send welcome message
        const embed = createEmbed(
            `${EMOJIS.TICKET} ${ticketType} Ticket`,
            `Hello ${user}, support will be with you shortly.\n\nPlease describe your issue in detail.`,
            COLORS.INFO,
            [
                { name: 'User', value: user.tag },
                { name: 'Ticket Type', value: ticketType }
            ]
        );

        await channel.send({
            content: `${user} ${settings.ticketPanel.viewerRole ? `<@&${settings.ticketPanel.viewerRole}>` : ''}`,
            embeds: [embed],
            components: [buttons]
        });

        interaction.reply({
            embeds: [successEmbed(`Your ticket has been created: ${channel}`)],
            ephemeral: true
        });

        logModAction(`Ticket Created: ${channel.name} by ${user.tag} - Type: ${ticketType}`);
    } catch (err) {
        console.error(err);
        interaction.reply({
            embeds: [errorEmbed('Failed to create ticket. Please try again later.')],
            ephemeral: true
        });
    }
}

async function handleTicketButton(interaction) {
    const channel = interaction.channel;
    const user = interaction.user;
    const action = interaction.customId;

    if (!channel.name.startsWith('ticket-')) return;

    switch (action) {
        case 'ticket_claim':
            await claimTicket(interaction, channel, user);
            break;
        case 'ticket_lock':
            await lockTicket(interaction, channel);
            break;
        case 'ticket_close':
            await closeTicket(interaction, channel);
            break;
        case 'ticket_transcript':
            await createTranscript(interaction, channel);
            break;
    }
}

async function claimTicket(interaction, channel, user) {
    const embed = createEmbed(
        `${EMOJIS.CLAIM} Ticket Claimed`,
        `${user} has claimed this ticket.`,
        COLORS.SUCCESS
    );

    await channel.permissionOverwrites.edit(user.id, {
        ViewChannel: true,
        SendMessages: true
    });

    await interaction.reply({ embeds: [embed] });
    logModAction(`Ticket Claimed: ${channel.name} by ${user.tag}`);
}

async function lockTicket(interaction, channel) {
    await channel.permissionOverwrites.edit(channel.guild.id, {
        SendMessages: false
    });

    const embed = createEmbed(
        `${EMOJIS.LOCK} Ticket Locked`,
        'This ticket has been locked. Only staff can unlock it.',
        COLORS.WARNING
    );

    await interaction.reply({ embeds: [embed] });
    logModAction(`Ticket Locked: ${channel.name} by ${interaction.user.tag}`);
}

async function closeTicket(interaction, channel) {
    const confirmEmbed = createEmbed(
        `${EMOJIS.CLOSE} Confirm Closure`,
        'Are you sure you want to close this ticket?',
        COLORS.WARNING
    );

    const confirmButtons = createActionRow([
        createButton('ticket_confirm_close', 'Confirm', ButtonStyle.Danger),
        createButton('ticket_cancel_close', 'Cancel', ButtonStyle.Secondary)
    ]);

    await interaction.reply({
        embeds: [confirmEmbed],
        components: [confirmButtons],
        ephemeral: true
    });
}

async function confirmCloseTicket(interaction) {
    const channel = interaction.channel;

    const embed = createEmbed(
        `${EMOJIS.CLOSE} Ticket Closed`,
        `This ticket has been closed by ${interaction.user.tag}`,
        COLORS.ERROR
    );

    await channel.send({ embeds: [embed] });
    setTimeout(async () => {
        await channel.delete('Ticket closed');
    }, 5000);

    logModAction(`Ticket Closed: ${channel.name} by ${interaction.user.tag}`);
}

async function createTranscript(interaction, channel) {
    await interaction.deferReply({ ephemeral: true });

    try {
        const messages = await channel.messages.fetch({ limit: 100 });
        const transcript = messages.reverse().map(msg => {
            return `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}`;
        }).join('\n');

        const fileName = `transcript-${channel.name}.txt`;
        fs.writeFileSync(fileName, transcript);

        await interaction.followUp({
            content: 'Here is your transcript:',
            files: [fileName],
            ephemeral: true
        });

        fs.unlinkSync(fileName);
        logModAction(`Transcript Created: ${channel.name} by ${interaction.user.tag}`);
    } catch (err) {
        console.error(err);
        interaction.followUp({
            embeds: [errorEmbed('Failed to create transcript. Please try again later.')],
            ephemeral: true
        });
    }
}

// Application system functions
function setupApplicationPanel(message, embedMessage) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    settings.applications.message = embedMessage;
    settings.applications.channelId = message.channel.id;
    message.channel.send({ embeds: [successEmbed('Application panel message set successfully!')] });
    setTimeout(() => message.delete(), 3000);
}

function addApplicationOptions(message, options) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    settings.applications.options = options.split(',').map(opt => opt.trim());
    message.channel.send({ embeds: [successEmbed(`Application options set to: ${settings.applications.options.join(', ')}`)] });
    setTimeout(() => message.delete(), 3000);
}

function setApplicationQuestion(message, index, question) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    index = parseInt(index) - 1;
    if (isNaN(index) {
        return message.channel.send({ embeds: [errorEmbed('Please provide a valid question number!')] });
    }

    settings.applications.questions[index] = question;
    message.channel.send({ embeds: [successEmbed(`Question ${index + 1} set to: ${question}`)] });
    setTimeout(() => message.delete(), 3000);
}

async function deployApplicationPanel(message) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    if (!settings.applications.message || settings.applications.options.length === 0) {
        return message.channel.send({ embeds: [errorEmbed('Please set the application message and options first!')] });
    }

    const buttons = settings.applications.options.map(option => 
        createButton(`app_${option.toLowerCase().replace(/\s+/g, '_')}`, option, ButtonStyle.Primary)
    );

    const actionRows = [];
    for (let i = 0; i < buttons.length; i += 5) {
        actionRows.push(createActionRow(buttons.slice(i, i + 5)));
    }

    const embed = createEmbed(
        '📝 Applications',
        settings.applications.message,
        COLORS.INFO
    );

    await message.channel.send({
        embeds: [embed],
        components: actionRows
    });

    message.channel.send({ embeds: [successEmbed('Application panel deployed successfully!')] });
    setTimeout(() => message.delete(), 3000);
}

async function startApplication(interaction) {
    const roleName = interaction.customId.replace('app_', '').replace(/_/g, ' ');
    const user = interaction.user;

    // Check cooldown
    if (settings.applications.cooldowns.has(user.id)) {
        const cooldown = settings.applications.cooldowns.get(user.id);
        if (Date.now() - cooldown < 15 * 60 * 1000) {
            return interaction.reply({
                embeds: [errorEmbed(`You're on cooldown! Please wait ${Math.ceil((15 - (Date.now() - cooldown) / (60 * 1000))} more minutes.`)],
                ephemeral: true
            });
        }
    }

    settings.applications.cooldowns.set(user.id, Date.now());

    // Create modal
    const modal = new ModalBuilder()
        .setCustomId(`app_modal_${roleName}`)
        .setTitle(`Application for ${roleName}`);

    // Add text inputs for each question
    settings.applications.questions.forEach((question, index) => {
        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId(`app_q${index}`)
                    .setLabel(question.length > 45 ? `${question.substring(0, 45)}...` : question)
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );
    });

    await interaction.showModal(modal);
}

async function handleApplicationSubmit(interaction) {
    const roleName = interaction.customId.replace('app_modal_', '');
    const user = interaction.user;
    const guild = interaction.guild;

    // Collect responses
    const responses = [];
    for (let i = 0; i < settings.applications.questions.length; i++) {
        const response = interaction.fields.getTextInputValue(`app_q${i}`);
        responses.push({
            question: settings.applications.questions[i],
            answer: response
        });
    }

    // Create embed with responses
    const fields = responses.map((r, i) => ({
        name: `Question ${i + 1}`,
        value: `**${r.question}**\n${r.answer}`,
        inline: false
    }));

    const embed = createEmbed(
        `📝 New Application: ${roleName}`,
        `Applicant: ${user.tag} (${user.id})`,
        COLORS.INFO,
        fields
    );

    // Add accept/reject buttons
    const buttons = createActionRow([
        createButton(`app_accept_${user.id}_${roleName}`, 'Accept', ButtonStyle.Success),
        createButton(`app_reject_${user.id}_${roleName}`, 'Reject', ButtonStyle.Danger)
    ]);

    // Send to mod channel
    const modChannel = settings.applications.channelId ? guild.channels.cache.get(settings.applications.channelId) : null;
    if (modChannel) {
        await modChannel.send({
            content: `New application for ${roleName}`,
            embeds: [embed],
            components: [buttons]
        });
    }

    await interaction.reply({
        embeds: [successEmbed('Your application has been submitted! You will be notified of the result.')],
        ephemeral: true
    });
}

async function handleApplicationDecision(interaction) {
    const [action, userId, roleName] = interaction.customId.split('_').slice(1);
    const user = await client.users.fetch(userId);
    const guild = interaction.guild;

    if (action === 'accept') {
        // Find role by name
        const role = guild.roles.cache.find(r => r.name.toLowerCase() === roleName.toLowerCase());
        if (!role) {
            return interaction.reply({
                embeds: [errorEmbed(`Could not find role "${roleName}"`)],
                ephemeral: true
            });
        }

        // Add role to user
        const member = await guild.members.fetch(userId);
        await member.roles.add(role);

        // Notify user
        try {
            await user.send({
                embeds: [successEmbed(`Congratulations! Your application for ${roleName} has been accepted.`)]
            });
        } catch (err) {
            console.error(`Failed to DM user: ${err}`);
        }

        // Update embed
        const embed = interaction.message.embeds[0];
        embed.setColor(COLORS.SUCCESS);
        embed.setTitle(`✅ Accepted: ${roleName}`);

        await interaction.update({
            embeds: [embed],
            components: []
        });

        interaction.followUp({
            embeds: [successEmbed(`Application accepted and role assigned to ${user.tag}`)],
            ephemeral: true
        });
    } else {
        // Reject application
        // Ask for reason
        const modal = new ModalBuilder()
            .setCustomId(`app_reject_reason_${userId}_${roleName}`)
            .setTitle('Rejection Reason');

        modal.addComponents(
            new ActionRowBuilder().addComponents(
                new TextInputBuilder()
                    .setCustomId('reason')
                    .setLabel('Reason for rejection')
                    .setStyle(TextInputStyle.Paragraph)
                    .setRequired(true)
            )
        );

        await interaction.showModal(modal);
    }
}

async function handleRejectionReason(interaction) {
    const [_, userId, roleName] = interaction.customId.split('_').slice(1);
    const reason = interaction.fields.getTextInputValue('reason');
    const user = await client.users.fetch(userId);

    // Notify user
    try {
        await user.send({
            embeds: [errorEmbed(`Your application for ${roleName} has been rejected.\n\nReason: ${reason}`)]
        });
    } catch (err) {
        console.error(`Failed to DM user: ${err}`);
    }

    // Update embed
    const originalMessage = interaction.message;
    const embed = originalMessage.embeds[0];
    embed.setColor(COLORS.ERROR);
    embed.setTitle(`❌ Rejected: ${roleName}`);
    embed.addFields([{ name: 'Reason', value: reason }]);

    await originalMessage.edit({
        embeds: [embed],
        components: []
    });

    await interaction.reply({
        embeds: [successEmbed(`Application rejected and user notified.`)],
        ephemeral: true
    });
}

// Utility functions
async function sendRoleDM(message, role, content) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    const members = await message.guild.members.fetch();
    const roleMembers = members.filter(m => m.roles.cache.has(role.id));

    if (roleMembers.size === 0) {
        return message.channel.send({ embeds: [errorEmbed('No members found with that role!')] });
    }

    const embed = createEmbed(
        '📢 Announcement',
        content,
        COLORS.INFO,
        [],
        `Sent to ${role.name} role`
    );

    let success = 0;
    let fails = 0;

    for (const [_, member] of roleMembers) {
        try {
            await member.send({ embeds: [embed] });
            success++;
        } catch (err) {
            fails++;
        }
    }

    message.channel.send({
        embeds: [successEmbed(`DM sent to ${success} members (${fails} failed)`)]
    });
}

function sendBotMessage(message, content) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    message.channel.send(content);
    message.delete().catch(console.error);
}

function sendEmbed(message, color, content) {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
        return message.channel.send({ embeds: [errorEmbed('You need administrator permissions to use this command!')] });
    }

    const embed = createEmbed(
        '',
        content,
        color
    );

    message.channel.send({ embeds: [embed] });
    message.delete().catch(console.error);
}

async function createPoll(message, question) {
    if (!message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        return message.channel.send({ embeds: [errorEmbed('You need manage messages permissions to use this command!')] });
    }

    const embed = createEmbed(
        '📊 Poll',
        question,
        COLORS.INFO
    );

    const poll = await message.channel.send({ embeds: [embed] });
    await poll.react('👍');
    await poll.react('👎');
    message.delete().catch(console.error);
}

function showServerInfo(message) {
    const guild = message.guild;
    const owner = guild.members.cache.get(guild.ownerId);

    const embed = createEmbed(
        'ℹ️ Server Information',
        '',
        COLORS.INFO,
        [
            { name: 'Name', value: guild.name, inline: true },
            { name: 'ID', value: guild.id, inline: true },
            { name: 'Owner', value: owner?.user.tag || 'Unknown', inline: true },
            { name: 'Created', value: `<t:${Math.floor(guild.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Members', value: guild.memberCount.toString(), inline: true },
            { name: 'Roles', value: guild.roles.cache.size.toString(), inline: true },
            { name: 'Channels', value: guild.channels.cache.size.toString(), inline: true },
            { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
            { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true }
        ]
    );

    if (guild.icon) embed.setThumbnail(guild.iconURL());
    message.channel.send({ embeds: [embed] });
}

function showUserInfo(message, user) {
    const member = message.guild.members.cache.get(user.id);
    if (!member) return message.channel.send({ embeds: [errorEmbed('User not found in this server!')] });

    const roles = member.roles.cache
        .filter(role => role.id !== message.guild.id)
        .map(role => role.toString())
        .join(' ') || 'None';

    const embed = createEmbed(
        'ℹ️ User Information',
        '',
        COLORS.INFO,
        [
            { name: 'Username', value: user.tag, inline: true },
            { name: 'ID', value: user.id, inline: true },
            { name: 'Created', value: `<t:${Math.floor(user.createdTimestamp / 1000)}:R>`, inline: true },
            { name: 'Joined', value: `<t:${Math.floor(member.joinedTimestamp / 1000)}:R>`, inline: true },
            { name: 'Nickname', value: member.nickname || 'None', inline: true },
            { name: 'Bot', value: user.bot ? 'Yes' : 'No', inline: true },
            { name: 'Roles', value: roles, inline: false },
            { name: 'Status', value: member.presence?.status || 'offline', inline: true },
            { name: 'Client', value: member.presence?.clientStatus ? Object.keys(member.presence.clientStatus).join(', ') : 'None', inline: true }
        ]
    );

    if (user.avatar) embed.setThumbnail(user.displayAvatarURL());
    message.channel.send({ embeds: [embed] });
}

// Fun commands
async function rockPaperScissors(message) {
    const buttons = createActionRow([
        createButton('rps_rock', 'Rock', ButtonStyle.Primary, '🪨'),
        createButton('rps_paper', 'Paper', ButtonStyle.Primary, '📄'),
        createButton('rps_scissors', 'Scissors', ButtonStyle.Primary, '✂️')
    ]);

    const embed = createEmbed(
        '🎮 Rock Paper Scissors',
        'Choose your move!',
        COLORS.INFO
    );

    const reply = await message.channel.send({
        embeds: [embed],
        components: [buttons]
    });

    const filter = i => i.user.id === message.author.id;
    const collector = reply.createMessageComponentCollector({ filter, time: 30000 });

    collector.on('collect', async interaction => {
        const choices = ['🪨 Rock', '📄 Paper', '✂️ Scissors'];
        const botChoice = choices[Math.floor(Math.random() * choices.length)];
        const userChoice = interaction.customId.replace('rps_', '');
        
        let result;
        if (
            (userChoice === 'rock' && botChoice.includes('Scissors')) ||
            (userChoice === 'paper' && botChoice.includes('Rock')) ||
            (userChoice === 'scissors' && botChoice.includes('Paper'))
        ) {
            result = 'You win!';
        } else if (
            (userChoice === 'rock' && botChoice.includes('Paper')) ||
            (userChoice === 'paper' && botChoice.includes('Scissors')) ||
            (userChoice === 'scissors' && botChoice.includes('Rock'))
        ) {
            result = 'I win!';
        } else {
            result = "It's a tie!";
        }

        const resultEmbed = createEmbed(
            '🎮 Rock Paper Scissors - Result',
            `You chose ${userChoice}\nI chose ${botChoice}\n\n**${result}**`,
            COLORS.INFO
        );

        await interaction.update({
            embeds: [resultEmbed],
            components: []
        });
    });

    collector.on('end', () => {
        if (!reply.editable) return;
        reply.edit({
            components: []
        }).catch(console.error);
    });
}

async function guessNumber(message) {
    const number = Math.floor(Math.random() * 10) + 1;
    let attempts = 3;

    const embed = createEmbed(
        '🎮 Guess the Number',
        'I\'m thinking of a number between 1 and 10. You have 3 attempts to guess it!',
        COLORS.INFO
    );

    const reply = await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 3 });

    collector.on('collect', m => {
        const guess = parseInt(m.content);
        attempts--;

        if (guess === number) {
            const winEmbed = createEmbed(
                '🎮 Guess the Number - Winner!',
                `🎉 Correct! The number was ${number}.`,
                COLORS.SUCCESS
            );
            reply.edit({ embeds: [winEmbed] });
            collector.stop();
            return;
        }

        const hint = guess < number ? 'higher' : 'lower';
        const attemptText = attempts === 1 ? 'last attempt' : `${attempts} attempts left`;

        const attemptEmbed = createEmbed(
            '🎮 Guess the Number',
            `❌ Wrong! The number is ${hint}. You have ${attemptText}.`,
            COLORS.WARNING
        );

        reply.edit({ embeds: [attemptEmbed] });
    });

    collector.on('end', (collected, reason) => {
        if (reason === 'time' || attempts === 0) {
            const loseEmbed = createEmbed(
                '🎮 Guess the Number - Game Over',
                `😢 You lost! The number was ${number}.`,
                COLORS.ERROR
            );
            reply.edit({ embeds: [loseEmbed] });
        }
    });
}

async function mathChallenge(message) {
    const operations = ['+', '-', '*'];
    const num1 = Math.floor(Math.random() * 10) + 1;
    const num2 = Math.floor(Math.random() * 10) + 1;
    const operation = operations[Math.floor(Math.random() * operations.length)];

    let answer;
    switch (operation) {
        case '+': answer = num1 + num2; break;
        case '-': answer = num1 - num2; break;
        case '*': answer = num1 * num2; break;
    }

    const embed = createEmbed(
        '🎮 Math Challenge',
        `What is ${num1} ${operation} ${num2}?`,
        COLORS.INFO
    );

    const reply = await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id && !isNaN(m.content);
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

    collector.on('collect', m => {
        const guess = parseInt(m.content);
        if (guess === answer) {
            const winEmbed = createEmbed(
                '🎮 Math Challenge - Correct!',
                `✅ ${num1} ${operation} ${num2} = ${answer}`,
                COLORS.SUCCESS
            );
            reply.edit({ embeds: [winEmbed] });
        } else {
            const loseEmbed = createEmbed(
                '🎮 Math Challenge - Incorrect',
                `❌ The correct answer was ${answer}`,
                COLORS.ERROR
            );
            reply.edit({ embeds: [loseEmbed] });
        }
    });

    collector.on('end', () => {
        if (collector.collected.size === 0) {
            const timeoutEmbed = createEmbed(
                '🎮 Math Challenge - Time\'s Up!',
                `⏰ The correct answer was ${answer}`,
                COLORS.WARNING
            );
            reply.edit({ embeds: [timeoutEmbed] });
        }
    });
}

async function triviaQuestion(message) {
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

    const embed = createEmbed(
        '🎮 Trivia',
        q.question,
        COLORS.INFO
    );

    const reply = await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 15000, max: 1 });

    collector.on('collect', m => {
        if (m.content.toLowerCase() === q.answer.toLowerCase()) {
            const winEmbed = createEmbed(
                '🎮 Trivia - Correct!',
                `✅ The answer was ${q.answer}`,
                COLORS.SUCCESS
            );
            reply.edit({ embeds: [winEmbed] });
        } else {
            const loseEmbed = createEmbed(
                '🎮 Trivia - Incorrect',
                `❌ The correct answer was ${q.answer}`,
                COLORS.ERROR
            );
            reply.edit({ embeds: [loseEmbed] });
        }
    });

    collector.on('end', () => {
        if (collector.collected.size === 0) {
            const timeoutEmbed = createEmbed(
                '🎮 Trivia - Time\'s Up!',
                `⏰ The correct answer was ${q.answer}`,
                COLORS.WARNING
            );
            reply.edit({ embeds: [timeoutEmbed] });
        }
    });
}

async function typingChallenge(message) {
    const sentences = [
        'The quick brown fox jumps over the lazy dog.',
        'Pack my box with five dozen liquor jugs.',
        'How vexingly quick daft zebras jump!'
    ];

    const sentence = sentences[Math.floor(Math.random() * sentences.length)];

    const embed = createEmbed(
        '🎮 Typing Challenge',
        `Type the following sentence exactly as shown:\n\n\`${sentence}\``,
        COLORS.INFO
    );

    const reply = await message.channel.send({ embeds: [embed] });

    const filter = m => m.author.id === message.author.id;
    const collector = message.channel.createMessageCollector({ filter, time: 30000, max: 1 });

    collector.on('collect', m => {
        if (m.content === sentence) {
            const timeTaken = (m.createdTimestamp - reply.createdTimestamp) / 1000;
            const winEmbed = createEmbed(
                '🎮 Typing Challenge - Success!',
                `✅ You typed it correctly in ${timeTaken.toFixed(2)} seconds!`,
                COLORS.SUCCESS
            );
            reply.edit({ embeds: [winEmbed] });
        } else {
            const loseEmbed = createEmbed(
                '🎮 Typing Challenge - Failed',
                `❌ Your typing didn't match exactly. Try again!`,
                COLORS.ERROR
            );
            reply.edit({ embeds: [loseEmbed] });
        }
    });

    collector.on('end', () => {
        if (collector.collected.size === 0) {
            const timeoutEmbed = createEmbed(
                '🎮 Typing Challenge - Time\'s Up!',
                `⏰ You didn't type the sentence in time.`,
                COLORS.WARNING
            );
            reply.edit({ embeds: [timeoutEmbed] });
        }
    });
}

// Help command
function showHelp(message) {
    const embed = createEmbed(
        '❓ Help Menu',
        'Here are all the available commands:',
        COLORS.INFO
    );

    const categories = [
        {
            name: '🎫 Ticket System',
            commands: [
                { name: '!ticket msg <message>', value: 'Set the ticket panel message' },
                { name: '!setoptions <option1,option2,...>', value: 'Set ticket dropdown options' },
                { name: '!setviewer @role', value: 'Set default viewer role for tickets' },
                { name: '!deployticketpanel', value: 'Deploy the ticket panel' }
            ]
        },
        {
            name: '📝 Application System',
            commands: [
                { name: '!app msg <message>', value: 'Set the application panel message' },
                { name: '!addoptions <role1,role2,...>', value: 'Add application role buttons' },
                { name: '!ques1-10 <question>', value: 'Set application questions' },
                { name: '!deployapp', value: 'Deploy the application panel' }
            ]
        },
        {
            name: '🛡️ Moderation',
            commands: [
                { name: '!ban @user [reason]', value: 'Ban a user' },
                { name: '!kick @user [reason]', value: 'Kick a user' },
                { name: '!mute @user <duration>', value: 'Mute a user' },
                { name: '!unmute @user', value: 'Unmute a user' },
                { name: '!warn @user [reason]', value: 'Warn a user' },
                { name: '!warnings @user', value: 'View user warnings' },
                { name: '!clear <amount>', value: 'Delete messages' },
                { name: '!lock', value: 'Lock channel' },
                { name: '!unlock', value: 'Unlock channel' }
            ]
        },
        {
            name: '💬 Utility',
            commands: [
                { name: '!dm @role <message>', value: 'DM all users with role' },
                { name: '!msg <message>', value: 'Send message as bot' },
                { name: '!embed <color> <message>', value: 'Send embed message' },
                { name: '!poll <question>', value: 'Create a poll' },
                { name: '!serverinfo', value: 'Show server info' },
                { name: '!userinfo @user', value: 'Show user info' }
            ]
        },
        {
            name: '🎮 Fun & Games',
            commands: [
                { name: '!rps', value: 'Rock Paper Scissors' },
                { name: '!guess', value: 'Guess the number' },
                { name: '!math', value: 'Math challenge' },
                { name: '!trivia', value: 'Trivia question' },
                { name: '!type', value: 'Typing challenge' }
            ]
        }
    ];

    categories.forEach(category => {
        embed.addFields({
            name: category.name,
            value: category.commands.map(cmd => `**${cmd.name}** - ${cmd.value}`).join('\n'),
            inline: false
        });
    });

    message.channel.send({ embeds: [embed] });
}

// Event handlers
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
    client.user.setActivity('!help', { type: 'WATCHING' });
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith('!')) return;

    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const content = args.join(' ');

    // Delete command message for certain commands
    if (['set', 'add', 'ques', 'ticket', 'app'].some(cmd => command.startsWith(cmd))) {
        setTimeout(() => message.delete().catch(console.error), 5000);
    }

    try {
        switch (command) {
            // Ticket system
            case 'ticket':
                if (args[0] === 'msg') setupTicketPanel(message, content.replace('msg', '').trim());
                break;
            case 'setoptions':
                setTicketOptions(message, content);
                break;
            case 'setviewer':
                setViewerRole(message, message.mentions.roles.first());
                break;
            case 'deployticketpanel':
                deployTicketPanel(message);
                break;

            // Application system
            case 'app':
                if (args[0] === 'msg') setupApplicationPanel(message, content.replace('msg', '').trim());
                break;
            case 'addoptions':
                addApplicationOptions(message, content);
                break;
            case 'deployapp':
                deployApplicationPanel(message);
                break;
            case 'ques1':
            case 'ques2':
            case 'ques3':
            case 'ques4':
            case 'ques5':
            case 'ques6':
            case 'ques7':
            case 'ques8':
            case 'ques9':
            case 'ques10':
                setApplicationQuestion(message, command.replace('ques', ''), content);
                break;

            // Moderation
            case 'ban':
                banUser(message, message.mentions.users.first(), content);
                break;
            case 'kick':
                kickUser(message, message.mentions.users.first(), content);
                break;
            case 'mute':
                muteUser(message, message.mentions.users.first(), args[1]);
                break;
            case 'unmute':
                unmuteUser(message, message.mentions.users.first());
                break;
            case 'warn':
                warnUser(message, message.mentions.users.first(), content);
                break;
            case 'warnings':
                showWarnings(message, message.mentions.users.first() || message.author);
                break;
            case 'clear':
                clearMessages(message, args[0]);
                break;
            case 'lock':
                lockChannel(message);
                break;
            case 'unlock':
                unlockChannel(message);
                break;

            // Utility
            case 'dm':
                sendRoleDM(message, message.mentions.roles.first(), content.replace(/<@&\d+>/, '').trim());
                break;
            case 'msg':
                sendBotMessage(message, content);
                break;
            case 'embed':
                sendEmbed(message, args[0], content.replace(args[0], '').trim());
                break;
            case 'poll':
                createPoll(message, content);
                break;
            case 'serverinfo':
                showServerInfo(message);
                break;
            case 'userinfo':
                showUserInfo(message, message.mentions.users.first() || message.author);
                break;

            // Fun & Games
            case 'rps':
                rockPaperScissors(message);
                break;
            case 'guess':
                guessNumber(message);
                break;
            case 'math':
                mathChallenge(message);
                break;
            case 'trivia':
                triviaQuestion(message);
                break;
            case 'type':
                typingChallenge(message);
                break;

            // Help
            case 'help':
                showHelp(message);
                break;
        }
    } catch (err) {
        console.error(err);
        message.channel.send({ embeds: [errorEmbed('An error occurred while executing that command.')] });
    }
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isStringSelectMenu()) {
            if (interaction.customId === 'ticket_create') {
                await createTicket(interaction);
            }
        } else if (interaction.isButton()) {
            if (interaction.customId.startsWith('ticket_')) {
                await handleTicketButton(interaction);
            } else if (interaction.customId.startsWith('app_')) {
                if (interaction.customId.startsWith('app_accept_') || interaction.customId.startsWith('app_reject_')) {
                    await handleApplicationDecision(interaction);
                } else {
                    await startApplication(interaction);
                }
            } else if (interaction.customId.startsWith('rps_')) {
                // Handled in the rockPaperScissors function
            }
        } else if (interaction.isModalSubmit()) {
            if (interaction.customId.startsWith('app_modal_')) {
                await handleApplicationSubmit(interaction);
            } else if (interaction.customId.startsWith('app_reject_reason_')) {
                await handleRejectionReason(interaction);
            }
        }
    } catch (err) {
        console.error(err);
        if (interaction.replied || interaction.deferred) {
            interaction.followUp({ embeds: [errorEmbed('An error occurred while processing your interaction.')], ephemeral: true });
        } else {
            interaction.reply({ embeds: [errorEmbed('An error occurred while processing your interaction.')], ephemeral: true });
        }
    }
});

client.on('messageCreate', message => {
    if (message.author.bot) return;

    // Anti-link system
    if (message.content.match(/(https?:\/\/[^\s]+)/g) && !message.member.permissions.has(PermissionFlagsBits.ManageMessages)) {
        message.delete().catch(console.error);
        if (settings.modLogChannel) {
            const logChannel = message.guild.channels.cache.get(settings.modLogChannel);
            if (logChannel) {
                logChannel.send({
                    embeds: [createEmbed(
                        '⚠️ Link Detected',
                        `${message.author.tag} tried to send a link in ${message.channel}`,
                        COLORS.WARNING,
                        [
                            { name: 'Message', value: message.content },
                            { name: 'Action', value: 'Message deleted' }
                        ]
                    )]
                });
            }
        }
        return;
    }

    // Blacklisted words filter
    const blacklisted = settings.blacklistedWords.find(word => 
        message.content.toLowerCase().includes(word.toLowerCase())
    );

    if (blacklisted) {
        message.delete().catch(console.error);
        if (settings.modLogChannel) {
            const logChannel = message.guild.channels.cache.get(settings.modLogChannel);
            if (logChannel) {
                logChannel.send({
                    embeds: [createEmbed(
                        '⚠️ Blacklisted Word Detected',
                        `${message.author.tag} tried to use a blacklisted word in ${message.channel}`,
                        COLORS.WARNING,
                        [
                            { name: 'Word', value: blacklisted },
                            { name: 'Action', value: 'Message deleted' }
                        ]
                    )]
                });
            }
        }
        return;
    }
});

// Start bot
client.login(process.env.TOKEN);

// Keep alive for Render
require('./keep_alive');
