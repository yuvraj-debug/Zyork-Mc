require('dotenv').config();
const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ModalBuilder, TextInputBuilder, TextInputStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionFlagsBits, Guild, GuildMemberManager, Collection } = require('discord.js');
const { joinVoiceChannel, createAudioPlayer, createAudioResource, entersState, StreamType, AudioPlayerStatus, VoiceConnectionStatus, getVoiceConnection } = require('@discordjs/voice');
const mongoose = require('mongoose');
const db = require('quick.db');
const { createCanvas, loadImage } = require('canvas');
const { request } = require('axios');
const ms = require('ms');
const humanizeDuration = require('humanize-duration');
const path = require('path');
const fs = require('fs');
const ytdl = require('ytdl-core');
const { YouTube } = require('popyt');
const swearjar = require('swearjar');
const Filter = require('bad-words');
const { v4: uuidv4 } = require('uuid');

const client = new Client({
    intents: [
        IntentsBitField.Flags.Guilds,
        IntentsBitField.Flags.GuildMembers,
        IntentsBitField.Flags.GuildMessages,
        IntentsBitField.Flags.GuildVoiceStates,
        IntentsBitField.Flags.MessageContent,
        IntentsBitField.Flags.GuildMessageReactions,
        IntentsBitField.Flags.GuildInvites,
        IntentsBitField.Flags.GuildPresences,
        IntentsBitField.Flags.DirectMessages
    ]
});

// Configuration
const config = {
    prefix: '/',
    token: process.env.DISCORD_TOKEN,
    color: '#5865F2',
    owners: ['YOUR_DISCORD_ID'],
    supportServer: 'YOUR_SUPPORT_SERVER_INVITE',
    mongoURI: process.env.MONGODB_URI || 'mongodb+srv://yuvraj:ldjEJJauoHlWUHsH@orbitx.x17pmve.mongodb.net/?retryWrites=true&w=majority&appName=orbitx',
    youtubeAPI: process.env.YOUTUBE_API_KEY
};

// Collections for storing data
client.commands = new Collection();
client.aliases = new Collection();
client.slashCommands = new Collection();
client.cooldowns = new Collection();
client.snipes = new Map();
client.autoModSettings = new Collection();
client.musicPlayers = new Map();
client.tickets = new Map();
client.config = config;

// Load commands
const loadCommands = () => {
    const commandFolders = ['slash', 'context', 'message'];
    
    commandFolders.forEach(folder => {
        const commandPath = path.join(__dirname, 'commands', folder);
        if (!fs.existsSync(commandPath)) fs.mkdirSync(commandPath, { recursive: true });
        
        const commandFiles = fs.readdirSync(commandPath).filter(file => file.endsWith('.js'));
        
        for (const file of commandFiles) {
            const command = require(path.join(commandPath, file));
            
            if (folder === 'slash') {
                client.slashCommands.set(command.data.name, command);
            } else if (folder === 'context') {
                client.slashCommands.set(command.data.name, command);
            } else {
                client.commands.set(command.name, command);
                if (command.aliases) {
                    command.aliases.forEach(alias => {
                        client.aliases.set(alias, command.name);
                    });
                }
            }
        }
    });
};

// Load events
const loadEvents = () => {
    const eventsPath = path.join(__dirname, 'events');
    if (!fs.existsSync(eventsPath)) fs.mkdirSync(eventsPath);
    
    const eventFiles = fs.readdirSync(eventsPath).filter(file => file.endsWith('.js'));
    
    for (const file of eventFiles) {
        const event = require(path.join(eventsPath, file));
        if (event.once) {
            client.once(event.name, (...args) => event.execute(...args, client));
        } else {
            client.on(event.name, (...args) => event.execute(...args, client));
        }
    }
};

// Create necessary folders
const createFolders = () => {
    const folders = ['commands/slash', 'commands/context', 'commands/message', 'events'];
    folders.forEach(folder => {
        const folderPath = path.join(__dirname, folder);
        if (!fs.existsSync(folderPath)) {
            fs.mkdirSync(folderPath, { recursive: true });
        }
    });
};

// Database connection
async function connectDB() {
    try {
        await mongoose.connect(config.mongoURI, {
            useNewUrlParser: true,
            useUnifiedTopology: true,
            retryWrites: true,
            w: 'majority'
        });
        console.log('✅ Connected to MongoDB Atlas');
        
        // Initialize database models
        initializeModels();
        initializeDatabaseDefaults();
    } catch (err) {
        console.error('❌ MongoDB connection error:', err);
        process.exit(1);
    }
}

// Initialize database models
function initializeModels() {
    // Ticket System
    client.ticketSchema = new mongoose.Schema({
        guildId: String,
        ticketId: String,
        channelId: String,
        creatorId: String,
        claimedBy: { type: String, default: null },
        closed: { type: Boolean, default: false },
        createdAt: { type: Date, default: Date.now },
        transcript: { type: String, default: null }
    });
    client.Ticket = mongoose.model('Ticket', client.ticketSchema);

    // Guild Settings
    client.guildSchema = new mongoose.Schema({
        guildId: String,
        ticketCategory: String,
        modRole: String,
        welcomeChannel: String,
        welcomeMessage: { type: String, default: 'Welcome {member} to {server}!' },
        farewellMessage: { type: String, default: 'Goodbye {member}!' },
        autoMod: {
            antiSpam: { type: Boolean, default: true },
            antiLink: { type: Boolean, default: true },
            antiSwear: { type: Boolean, default: true },
            antiGhostPing: { type: Boolean, default: true },
            antiRaid: { type: Boolean, default: true }
        },
        musicSettings: {
            defaultVolume: { type: Number, default: 50 },
            allowPlaylists: { type: Boolean, default: true }
        }
    });
    client.Guild = mongoose.model('Guild', client.guildSchema);

    // Music Queue
    client.queueSchema = new mongoose.Schema({
        guildId: String,
        songs: [{
            title: String,
            url: String,
            duration: String,
            thumbnail: String,
            requestedBy: String
        }],
        volume: { type: Number, default: 50 },
        loop: { type: Boolean, default: false }
    });
    client.Queue = mongoose.model('Queue', client.queueSchema);
}

// Initialize database with default settings
async function initializeDatabaseDefaults() {
    // Initialize guild settings for all guilds the bot is in
    client.guilds.cache.forEach(async guild => {
        const existingSettings = await client.Guild.findOne({ guildId: guild.id });
        if (!existingSettings) {
            await new client.Guild({ guildId: guild.id }).save();
        }
    });
}

// Music Player Functions
client.createMusicPlayer = (guildId) => {
    const player = createAudioPlayer();
    client.musicPlayers.set(guildId, player);
    return player;
};

client.getMusicPlayer = (guildId) => {
    return client.musicPlayers.get(guildId) || client.createMusicPlayer(guildId);
};

// Auto Moderation System
client.autoModCheck = async (message) => {
    if (message.author.bot) return false;
    
    const guildSettings = await client.Guild.findOne({ guildId: message.guild.id });
    if (!guildSettings) return false;

    // Anti-Spam
    if (guildSettings.autoMod.antiSpam) {
        // Implement spam detection logic
    }

    // Anti-Link
    if (guildSettings.autoMod.antiLink) {
        const urlRegex = /https?:\/\/[^\s]+/g;
        if (urlRegex.test(message.content)) {
            await message.delete();
            await message.channel.send(`${message.author}, links are not allowed here!`);
            return true;
        }
    }

    // Anti-Swear
    if (guildSettings.autoMod.antiSwear) {
        const filter = new Filter();
        if (filter.isProfane(message.content) || swearjar.profane(message.content)) {
            await message.delete();
            await message.channel.send(`${message.author}, please keep the chat clean!`);
            return true;
        }
    }

    return false;
};

// Ticket System Functions
client.createTicket = async (guild, member, reason) => {
    const ticketId = uuidv4().split('-')[0];
    const guildSettings = await client.Guild.findOne({ guildId: guild.id });
    
    const category = guildSettings?.ticketCategory ? 
        guild.channels.cache.get(guildSettings.ticketCategory) : 
        null;

    const ticketChannel = await guild.channels.create({
        name: `ticket-${ticketId}`,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: [
            {
                id: guild.id,
                deny: [PermissionFlagsBits.ViewChannel]
            },
            {
                id: member.id,
                allow: [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages]
            }
        ]
    });

    const ticket = new client.Ticket({
        guildId: guild.id,
        ticketId,
        channelId: ticketChannel.id,
        creatorId: member.id
    });
    await ticket.save();

    const embed = new EmbedBuilder()
        .setColor(config.color)
        .setTitle('Ticket Created')
        .setDescription(reason || 'No reason provided')
        .addFields(
            { name: 'Created By', value: member.toString(), inline: true },
            { name: 'Ticket ID', value: ticketId, inline: true }
        );

    const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
            .setCustomId('close_ticket')
            .setLabel('Close Ticket')
            .setStyle(ButtonStyle.Danger),
        new ButtonBuilder()
            .setCustomId('claim_ticket')
            .setLabel('Claim Ticket')
            .setStyle(ButtonStyle.Primary)
    );

    await ticketChannel.send({
        content: `${member}, your ticket has been created!`,
        embeds: [embed],
        components: [buttons]
    });

    return ticketChannel;
};

// Start the bot
async function startBot() {
    createFolders();
    loadCommands();
    loadEvents();
    await connectDB();
    await client.login(config.token);
}

startBot().catch(err => {
    console.error('❌ Bot startup error:', err);
    process.exit(1);
});

// Error handling
process.on('unhandledRejection', error => {
    console.error('Unhandled promise rejection:', error);
});

process.on('uncaughtException', error => {
    console.error('Uncaught exception:', error);
});

// Bot ready event
client.once('ready', () => {
    console.log(`✅ Logged in as ${client.user.tag}`);
    client.user.setActivity('your server', { type: 'WATCHING' });
    
    // Register slash commands
    if (process.env.REGISTER_COMMANDS === 'true') {
        require('./deploy-commands.js');
    }
});

// Interaction Create for Ticket Buttons
client.on('interactionCreate', async interaction => {
    if (!interaction.isButton()) return;

    if (interaction.customId === 'close_ticket') {
        const ticket = await client.Ticket.findOne({ channelId: interaction.channel.id });
        if (!ticket) return;

        await interaction.channel.permissionOverwrites.edit(ticket.creatorId, {
            ViewChannel: false
        });

        ticket.closed = true;
        await ticket.save();

        await interaction.reply(`Ticket closed by ${interaction.user}`);
        await interaction.channel.send('This ticket will be deleted in 10 seconds...');
        setTimeout(() => interaction.channel.delete().catch(() => {}), 10000);
    }

    if (interaction.customId === 'claim_ticket') {
        const ticket = await client.Ticket.findOne({ channelId: interaction.channel.id });
        if (!ticket) return;

        ticket.claimedBy = interaction.user.id;
        await ticket.save();

        await interaction.reply(`Ticket claimed by ${interaction.user}`);
    }
});

// Message Create for Auto Moderation
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // Auto Moderation
    await client.autoModCheck(message);
    
    // Message commands
    if (!message.content.startsWith(config.prefix)) return;
    
    const args = message.content.slice(config.prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();
    
    const command = client.commands.get(commandName) || 
                   client.commands.get(client.aliases.get(commandName));
    
    if (!command) return;
    
    try {
        await command.execute(message, args, client);
    } catch (error) {
        console.error(error);
        await message.reply('There was an error while executing this command!');
    }
});