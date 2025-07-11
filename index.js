require('dotenv').config();
require('./keep_alive.js');

const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, PermissionFlagsBits } = require('discord.js');
const client = new Client({
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.GuildMembers,
        GatewayIntentBits.MessageContent,
        GatewayIntentBits.DirectMessages
    ]
});

// Memory storage
const storage = {
    tickets: {},
    applications: {},
    warns: {},
    economy: {},
    games: {},
    config: {
        ticketCategory: null,
        ticketViewerRole: null,
        appChannel: null
    }
};

// Economy defaults
const economyDefaults = {
    dailyCooldown: 86400000, // 24 hours
    weeklyCooldown: 604800000, // 7 days
    startingBalance: 1000,
    shopItems: [
        { id: 'apple', name: '🍎 Apple', price: 50, description: 'Heals 10 HP' },
        { id: 'sword', name: '⚔️ Sword', price: 500, description: 'Increases attack by 5' },
        { id: 'shield', name: '🛡️ Shield', price: 500, description: 'Increases defense by 5' },
        { id: 'potion', name: '🧪 Potion', price: 200, description: 'Restores 50 HP' }
    ]
};

// Initialize economy for user
function initEconomy(userId) {
    if (!storage.economy[userId]) {
        storage.economy[userId] = {
            balance: economyDefaults.startingBalance,
            inventory: [],
            lastDaily: 0,
            lastWeekly: 0,
            bank: 0
        };
    }
    return storage.economy[userId];
}

// Helper function to create embeds
function createEmbed(title, description, color = '#0099ff') {
    return new EmbedBuilder()
        .setTitle(title)
        .setDescription(description)
        .setColor(color)
        .setTimestamp();
}

// Register slash commands
async function registerCommands() {
    try {
        await client.application.commands.set([
            // Help command
            {
                name: 'help',
                description: 'Get help with the bot commands',
                options: []
            },
            // Mini-games
            {
                name: 'rps',
                description: 'Play Rock Paper Scissors with another user',
                options: [{
                    name: 'user',
                    description: 'The user to challenge',
                    type: 6,
                    required: true
                }]
            },
            {
                name: 'guess',
                description: 'Guess the number between 1-100'
            },
            {
                name: 'math',
                description: 'Solve a math challenge'
            },
            {
                name: 'type',
                description: 'Test your typing speed'
            },
            {
                name: 'trivia',
                description: 'Answer a trivia question'
            },
            {
                name: 'snake',
                description: 'Play the snake game'
            },
            {
                name: 'slots',
                description: 'Play the slot machine'
            },
            {
                name: 'tictactoe',
                description: 'Play Tic Tac Toe with another user',
                options: [{
                    name: 'user',
                    description: 'The user to challenge',
                    type: 6,
                    required: true
                }]
            },
            {
                name: 'colorclick',
                description: 'Test your reaction time with colors'
            },
            {
                name: 'fastclick',
                description: 'Test how fast you can click'
            },
            {
                name: 'wordguess',
                description: 'Play a word guessing game'
            },
            // Ticket commands
            {
                name: 'ticket',
                description: 'Set up a ticket panel',
                options: [{
                    name: 'message',
                    description: 'The message to display on the panel',
                    type: 3,
                    required: true
                }],
                default_member_permissions: PermissionFlagsBits.ManageGuild.toString()
            },
            {
                name: 'setoptions',
                description: 'Set dropdown options for tickets',
                options: [{
                    name: 'options',
                    description: 'Comma-separated list of options',
                    type: 3,
                    required: true
                }],
                default_member_permissions: PermissionFlagsBits.ManageGuild.toString()
            },
            // Economy commands
            {
                name: 'balance',
                description: 'Check your economy balance'
            },
            {
                name: 'daily',
                description: 'Claim your daily reward'
            },
            {
                name: 'weekly',
                description: 'Claim your weekly reward'
            },
            // Moderation commands
            {
                name: 'warn',
                description: 'Warn a user',
                options: [
                    {
                        name: 'user',
                        description: 'The user to warn',
                        type: 6,
                        required: true
                    },
                    {
                        name: 'reason',
                        description: 'Reason for the warning',
                        type: 3,
                        required: false
                    }
                ],
                default_member_permissions: PermissionFlagsBits.KickMembers.toString()
            },
            // Utility commands
            {
                name: 'userinfo',
                description: 'Get information about a user',
                options: [{
                    name: 'user',
                    description: 'The user to get info about',
                    type: 6,
                    required: false
                }]
            },
            {
                name: 'serverinfo',
                description: 'Get information about the server'
            }
        ]);
        console.log('Slash commands registered successfully!');
    } catch (error) {
        console.error('Error registering slash commands:', error);
    }
}

// Help command with dropdown
function createHelpEmbed() {
    const embed = createEmbed('📚 Bot Help Center', 'Select a category from the dropdown below to see available commands', '#7289DA');
    
    const selectMenu = new StringSelectMenuBuilder()
        .setCustomId('help_select')
        .setPlaceholder('Choose a category...')
        .addOptions(
            new StringSelectMenuOptionBuilder()
                .setLabel('🎟️ Ticket System')
                .setValue('ticket'),
            new StringSelectMenuOptionBuilder()
                .setLabel('📋 Application System')
                .setValue('application'),
            new StringSelectMenuOptionBuilder()
                .setLabel('⚠️ Moderation')
                .setValue('moderation'),
            new StringSelectMenuOptionBuilder()
                .setLabel('💰 Economy')
                .setValue('economy'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🎮 Mini-Games')
                .setValue('games'),
            new StringSelectMenuOptionBuilder()
                .setLabel('📩 DM & Embeds')
                .setValue('embeds'),
            new StringSelectMenuOptionBuilder()
                .setLabel('ℹ️ Utility')
                .setValue('utility'),
            new StringSelectMenuOptionBuilder()
                .setLabel('🛠️ Admin Config')
                .setValue('admin')
        );
    
    const row = new ActionRowBuilder().addComponents(selectMenu);
    
    return { embeds: [embed], components: [row] };
}

// Category-specific help embeds
function getCategoryHelp(category) {
    const commands = {
        ticket: [
            { name: '!ticket [msg]', description: 'Set panel embed message' },
            { name: '!setoptions [options]', description: 'Set dropdown options (comma separated)' },
            { name: '!setviewer [role]', description: 'Set viewable role for tickets' },
            { name: '!setticketcategory [category]', description: 'Set ticket category channel' },
            { name: '!deployticketpanel', description: 'Send the ticket panel' }
        ],
        application: [
            { name: '!app [msg]', description: 'Set application message' },
            { name: '!addoptions [roles]', description: 'Add role buttons (comma separated)' },
            { name: '!setappchannel [channel]', description: 'Set application log channel' },
            { name: '!deployapp', description: 'Send application panel' },
            { name: '!ques1 to !ques10', description: 'DM questions for application' }
        ],
        moderation: [
            { name: '!warn [user] [reason]', description: 'Warn a user' },
            { name: '!clearwarns [user]', description: 'Clear all warns for a user' },
            { name: '!warnings [user]', description: 'Check user warnings' },
            { name: '!warnlimit [number]', description: 'Set warn limit before action' },
            { name: '!kick [user] [reason]', description: 'Kick a user' },
            { name: '!ban [user] [reason]', description: 'Ban a user' },
            { name: '!unban [user]', description: 'Unban a user' }
        ],
        economy: [
            { name: '!balance', description: 'Check your balance' },
            { name: '!daily', description: 'Claim daily reward' },
            { name: '!weekly', description: 'Claim weekly reward' },
            { name: '!beg', description: 'Beg for coins' },
            { name: '!cf [head/tail] [amount]', description: 'Coin flip gamble' },
            { name: '!give [user] [amount]', description: 'Give coins to another user' }
        ],
        games: [
            { name: '!rps [user]', description: 'Rock Paper Scissors challenge' },
            { name: '!guess', description: 'Number guessing game (1-100)' },
            { name: '!math', description: 'Math challenge' },
            { name: '!type', description: 'Typing speed test' },
            { name: '!trivia', description: 'Trivia quiz' },
            { name: '!snake', description: 'Snake game' }
        ],
        embeds: [
            { name: '!dm [role] [msg]', description: 'DM all users in a role' },
            { name: '!embed [color] [msg]', description: 'Send rich embed' },
            { name: '!msg [channel] [msg]', description: 'Send message to specific channel' }
        ],
        utility: [
            { name: '!userinfo [user]', description: 'Show user information' },
            { name: '!serverinfo', description: 'Show server information' },
            { name: '!ping', description: 'Check bot latency' },
            { name: '!uptime', description: 'Check bot uptime' },
            { name: '!botstats', description: 'Show bot statistics' }
        ],
        admin: [
            { name: '!prems [role]', description: 'Give admin access to role' },
            { name: '!setcooldown [type] [time]', description: 'Set economy cooldowns' },
            { name: '!resetconfig', description: 'Reset all configurations' }
        ]
    };
    
    const embed = createEmbed(
        `${category.charAt(0).toUpperCase() + category.slice(1)} Commands`,
        commands[category].map(cmd => `**${cmd.name}** - ${cmd.description}`).join('\n'),
        '#7289DA'
    );
    
    const backButton = new ButtonBuilder()
        .setCustomId('help_back')
        .setLabel('Back to Main Menu')
        .setStyle(ButtonStyle.Secondary);
    
    const row = new ActionRowBuilder().addComponents(backButton);
    
    return { embeds: [embed], components: [row] };
}

// Rock Paper Scissors game
async function handleRPS(interaction, opponent) {
    if (opponent.bot) {
        await interaction.reply({ embeds: [createEmbed('❌ Error', 'You cannot challenge a bot!', '#ff0000')] });
        return;
    }
    
    if (opponent.id === interaction.user.id) {
        await interaction.reply({ embeds: [createEmbed('❌ Error', 'You cannot challenge yourself!', '#ff0000')] });
        return;
    }
    
    const embed = createEmbed(
        '🎮 Rock Paper Scissors',
        `${opponent}, you have been challenged to a game of Rock Paper Scissors by ${interaction.user}!\n\nPlease choose your move:`,
        '#00ff00'
    );
    
    const buttons = new ActionRowBuilder()
        .addComponents(
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
    
    const reply = await interaction.reply({
        content: `${opponent}`,
        embeds: [embed],
        components: [buttons],
        fetchReply: true
    });
    
    const gameId = `rps_${reply.id}`;
    storage.games[gameId] = {
        challenger: interaction.user.id,
        opponent: opponent.id,
        choices: {},
        message: reply
    };
    
    // Timeout after 30 seconds
    setTimeout(async () => {
        if (storage.games[gameId] && (!storage.games[gameId].choices[interaction.user.id] || !storage.games[gameId].choices[opponent.id])) {
            delete storage.games[gameId];
            await reply.edit({
                content: '',
                embeds: [createEmbed('⏰ Game Expired', 'The Rock Paper Scissors game timed out due to inactivity.', '#ff0000')],
                components: []
            });
        }
    }, 30000);
}

// Guess the number game
async function handleGuessGame(interaction) {
    const number = Math.floor(Math.random() * 100) + 1;
    const gameId = `guess_${interaction.user.id}`;
    
    storage.games[gameId] = {
        number: number,
        attempts: 0,
        startTime: Date.now()
    };
    
    const embed = createEmbed(
        '🔢 Guess the Number',
        'I\'m thinking of a number between 1 and 100. Try to guess it!\n\nType your guess below:',
        '#00ff00'
    );
    
    await interaction.reply({ embeds: [embed] });
}

// Math challenge game
async function handleMathGame(interaction) {
    const num1 = Math.floor(Math.random() * 50) + 1;
    const num2 = Math.floor(Math.random() * 50) + 1;
    const operators = ['+', '-', '*'];
    const operator = operators[Math.floor(Math.random() * operators.length)];
    
    let answer;
    switch (operator) {
        case '+': answer = num1 + num2; break;
        case '-': answer = num1 - num2; break;
        case '*': answer = num1 * num2; break;
    }
    
    const gameId = `math_${interaction.user.id}`;
    storage.games[gameId] = {
        answer: answer,
        expires: Date.now() + 30000
    };
    
    const embed = createEmbed(
        '🧮 Math Challenge',
        `Solve the following equation:\n\n**${num1} ${operator} ${num2} = ?**\n\nYou have 30 seconds to answer!`,
        '#00ff00'
    );
    
    await interaction.reply({ embeds: [embed] });
}

// Typing speed test
async function handleTypingTest(interaction) {
    const sentences = [
        "The quick brown fox jumps over the lazy dog.",
        "Pack my box with five dozen liquor jugs.",
        "How vexingly quick daft zebras jump!",
        "Bright vixens jump; dozy fowl quack.",
        "Sphinx of black quartz, judge my vow."
    ];
    
    const sentence = sentences[Math.floor(Math.random() * sentences.length)];
    const gameId = `type_${interaction.user.id}`;
    
    storage.games[gameId] = {
        sentence: sentence,
        startTime: null,
        expires: Date.now() + 20000
    };
    
    const embed = createEmbed(
        '⌨️ Typing Speed Test',
        `You will have **20 seconds** to type the following sentence **exactly** as shown:\n\n\`\`\`${sentence}\`\`\`\n\nType it below when ready!`,
        '#00ff00'
    );
    
    await interaction.reply({ embeds: [embed] });
}

// Trivia game
async function handleTrivia(interaction) {
    const questions = [
        {
            question: "What is the capital of France?",
            options: ["London", "Berlin", "Paris", "Madrid"],
            answer: 2,
            fact: "Paris is often called the 'City of Light' because of its early adoption of street lighting."
        },
        {
            question: "Which planet is known as the Red Planet?",
            options: ["Venus", "Mars", "Jupiter", "Saturn"],
            answer: 1,
            fact: "Mars appears red due to iron oxide (rust) on its surface."
        }
    ];
    
    const question = questions[Math.floor(Math.random() * questions.length)];
    const gameId = `trivia_${interaction.user.id}`;
    
    storage.games[gameId] = {
        question: question,
        answered: false
    };
    
    const embed = createEmbed(
        '❓ Trivia Question',
        `${question.question}\n\nA) ${question.options[0]}\nB) ${question.options[1]}\nC) ${question.options[2]}\nD) ${question.options[3]}`,
        '#00ff00'
    );
    
    const buttons = new ActionRowBuilder()
        .addComponents(
            new ButtonBuilder()
                .setCustomId('trivia_a')
                .setLabel('A')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('trivia_b')
                .setLabel('B')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('trivia_c')
                .setLabel('C')
                .setStyle(ButtonStyle.Primary),
            new ButtonBuilder()
                .setCustomId('trivia_d')
                .setLabel('D')
                .setStyle(ButtonStyle.Primary)
        );
    
    await interaction.reply({
        embeds: [embed],
        components: [buttons]
    });
}

// Ticket system
async function handleTicketPanel(interaction, message) {
    if (!interaction.member.permissions.has(PermissionFlagsBits.ManageGuild)) {
        await interaction.reply({
            embeds: [createEmbed('❌ Permission Denied', 'You need the `Manage Server` permission to use this command.', '#ff0000')],
            ephemeral: true
        });
        return;
    }
    
    storage.config.ticketMessage = message;
    
    const embed = createEmbed(
        '🎟️ Ticket Panel Created',
        'The ticket panel message has been set. Use `/setoptions` to configure the dropdown options.',
        '#00ff00'
    );
    
    await interaction.reply({ embeds: [embed], ephemeral: true });
}

// Economy commands
async function handleBalance(interaction) {
    const user = initEconomy(interaction.user.id);
    const embed = createEmbed(
        '💰 Your Balance',
        `**Wallet:** ${user.balance} coins\n**Bank:** ${user.bank} coins\n**Total:** ${user.balance + user.bank} coins`,
        '#ffd700'
    );
    
    await interaction.reply({ embeds: [embed] });
}

async function handleDaily(interaction) {
    const user = initEconomy(interaction.user.id);
    const now = Date.now();
    const cooldown = economyDefaults.dailyCooldown;
    
    if (now - user.lastDaily < cooldown) {
        const remaining = Math.ceil((cooldown - (now - user.lastDaily)) / 1000 / 60 / 60);
        await interaction.reply({
            embeds: [createEmbed('⏳ Cooldown Active', `You can claim your next daily reward in ${remaining} hours.`, '#ff0000')]
        });
        return;
    }
    
    const reward = 500 + Math.floor(Math.random() * 500);
    user.balance += reward;
    user.lastDaily = now;
    
    const embed = createEmbed(
        '🎉 Daily Reward Claimed',
        `You received **${reward} coins**!\n\nNew balance: **${user.balance} coins**`,
        '#00ff00'
    );
    
    await interaction.reply({ embeds: [embed] });
}

// Moderation commands
async function handleWarn(interaction, user, reason = 'No reason provided') {
    if (!interaction.member.permissions.has(PermissionFlagsBits.KickMembers)) {
        await interaction.reply({
            embeds: [createEmbed('❌ Permission Denied', 'You need the `Kick Members` permission to use this command.', '#ff0000')],
            ephemeral: true
        });
        return;
    }
    
    if (user.id === interaction.user.id) {
        await interaction.reply({
            embeds: [createEmbed('❌ Error', 'You cannot warn yourself!', '#ff0000')],
            ephemeral: true
        });
        return;
    }
    
    if (user.id === client.user.id) {
        await interaction.reply({
            embeds: [createEmbed('❌ Error', 'I cannot warn myself!', '#ff0000')],
            ephemeral: true
        });
        return;
    }
    
    if (!storage.warns[user.id]) {
        storage.warns[user.id] = [];
    }
    
    const warn = {
        moderator: interaction.user.id,
        reason: reason,
        timestamp: Date.now()
    };
    
    storage.warns[user.id].push(warn);
    
    const embed = createEmbed(
        '⚠️ User Warned',
        `${user} has been warned by ${interaction.user}.\n**Reason:** ${reason}\n\nTotal warns: ${storage.warns[user.id].length}`,
        '#ffcc00'
    );
    
    await interaction.reply({ embeds: [embed] });
    
    try {
        const dmEmbed = createEmbed(
            '⚠️ You have been warned',
            `You received a warning in **${interaction.guild.name}**.\n**Reason:** ${reason}\n\nPlease follow the server rules to avoid further action.`,
            '#ffcc00'
        );
        await user.send({ embeds: [dmEmbed] });
    } catch (error) {
        console.log(`Could not send DM to ${user.tag}`);
    }
}

// Utility commands
async function handleUserInfo(interaction, user = null) {
    const targetUser = user || interaction.user;
    const member = interaction.guild.members.cache.get(targetUser.id);
    
    if (!member) {
        await interaction.reply({
            embeds: [createEmbed('❌ Error', 'User not found in this server.', '#ff0000')],
            ephemeral: true
        });
        return;
    }
    
    const roles = member.roles.cache
        .filter(role => role.id !== interaction.guild.id)
        .map(role => role.toString())
        .join(', ') || 'None';
    
    const embed = createEmbed(
        `ℹ️ User Info: ${targetUser.tag}`,
        `**ID:** ${targetUser.id}\n**Created:** <t:${Math.floor(targetUser.createdTimestamp / 1000)}:R>\n**Joined:** <t:${Math.floor(member.joinedTimestamp / 1000)}:R>\n\n**Roles (${member.roles.cache.size - 1}):** ${roles}`,
        '#7289DA'
    )
    .setThumbnail(targetUser.displayAvatarURL({ dynamic: true }))
    .addFields(
        { name: 'Status', value: member.presence?.status || 'offline', inline: true },
        { name: 'Bot', value: targetUser.bot ? 'Yes' : 'No', inline: true },
        { name: 'Nickname', value: member.nickname || 'None', inline: true }
    );
    
    await interaction.reply({ embeds: [embed] });
}

async function handleServerInfo(interaction) {
    const guild = interaction.guild;
    const owner = await guild.fetchOwner();
    
    const embed = createEmbed(
        `ℹ️ Server Info: ${guild.name}`,
        `**ID:** ${guild.id}\n**Owner:** ${owner.user.tag}\n**Created:** <t:${Math.floor(guild.createdTimestamp / 1000)}:R>\n\n**Members:** ${guild.memberCount}\n**Roles:** ${guild.roles.cache.size}\n**Channels:** ${guild.channels.cache.size}`,
        '#7289DA'
    )
    .setThumbnail(guild.iconURL({ dynamic: true }))
    .addFields(
        { name: 'Boosts', value: guild.premiumSubscriptionCount.toString(), inline: true },
        { name: 'Boost Level', value: guild.premiumTier.toString(), inline: true },
        { name: 'Verification Level', value: guild.verificationLevel.toString(), inline: true }
    );
    
    await interaction.reply({ embeds: [embed] });
}

// Event handlers
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}`);
    registerCommands();
});

client.on('interactionCreate', async interaction => {
    try {
        if (interaction.isChatInputCommand()) {
            // Slash commands
            switch (interaction.commandName) {
                case 'help':
                    await interaction.reply(createHelpEmbed());
                    break;
                case 'rps':
                    const opponent = interaction.options.getUser('user');
                    await handleRPS(interaction, opponent);
                    break;
                case 'guess':
                    await handleGuessGame(interaction);
                    break;
                case 'math':
                    await handleMathGame(interaction);
                    break;
                case 'type':
                    await handleTypingTest(interaction);
                    break;
                case 'trivia':
                    await handleTrivia(interaction);
                    break;
                case 'ticket':
                    const message = interaction.options.getString('message');
                    await handleTicketPanel(interaction, message);
                    break;
                case 'balance':
                    await handleBalance(interaction);
                    break;
                case 'daily':
                    await handleDaily(interaction);
                    break;
                case 'warn':
                    const user = interaction.options.getUser('user');
                    const reason = interaction.options.getString('reason');
                    await handleWarn(interaction, user, reason);
                    break;
                case 'userinfo':
                    const targetUser = interaction.options.getUser('user');
                    await handleUserInfo(interaction, targetUser);
                    break;
                case 'serverinfo':
                    await handleServerInfo(interaction);
                    break;
            }
        } else if (interaction.isButton()) {
            // Button interactions
            if (interaction.customId.startsWith('rps_')) {
                const gameId = `rps_${interaction.message.id}`;
                const game = storage.games[gameId];
                
                if (!game || (game.challenger !== interaction.user.id && game.opponent !== interaction.user.id)) {
                    await interaction.reply({
                        embeds: [createEmbed('❌ Error', 'This game is not for you or has expired.', '#ff0000')],
                        ephemeral: true
                    });
                    return;
                }
                
                const choice = interaction.customId.split('_')[1];
                game.choices[interaction.user.id] = choice;
                
                await interaction.deferUpdate();
                
                if (game.choices[game.challenger] && game.choices[game.opponent]) {
                    const challengerChoice = game.choices[game.challenger];
                    const opponentChoice = game.choices[game.opponent];
                    const challengerUser = await client.users.fetch(game.challenger);
                    const opponentUser = await client.users.fetch(game.opponent);
                    
                    let result;
                    if (challengerChoice === opponentChoice) {
                        result = "It's a tie!";
                    } else if (
                        (challengerChoice === 'rock' && opponentChoice === 'scissors') ||
                        (challengerChoice === 'paper' && opponentChoice === 'rock') ||
                        (challengerChoice === 'scissors' && opponentChoice === 'paper')
                    ) {
                        result = `${challengerUser} wins!`;
                    } else {
                        result = `${opponentUser} wins!`;
                    }
                    
                    const embed = createEmbed(
                        '🎮 Rock Paper Scissors - Results',
                        `${challengerUser} chose **${challengerChoice}**\n${opponentUser} chose **${opponentChoice}**\n\n${result}`,
                        '#00ff00'
                    );
                    
                    await interaction.message.edit({
                        content: '',
                        embeds: [embed],
                        components: []
                    });
                    
                    delete storage.games[gameId];
                }
            } else if (interaction.customId === 'help_back') {
                await interaction.update(createHelpEmbed());
            }
        } else if (interaction.isStringSelectMenu()) {
            // Dropdown menu interactions
            if (interaction.customId === 'help_select') {
                const category = interaction.values[0];
                await interaction.update(getCategoryHelp(category));
            }
        } else if (interaction.isModalSubmit()) {
            // Modal submissions
            // Handle modals if needed
        } else if (interaction.isMessageContextMenuCommand()) {
            // Context menu commands
        }
    } catch (error) {
        console.error('Error handling interaction:', error);
        if (!interaction.replied && !interaction.deferred) {
            await interaction.reply({
                embeds: [createEmbed('❌ Error', 'An error occurred while processing your request.', '#ff0000')],
                ephemeral: true
            });
        } else {
            await interaction.followUp({
                embeds: [createEmbed('❌ Error', 'An error occurred while processing your request.', '#ff0000')],
                ephemeral: true
            });
        }
    }
});

client.on('messageCreate', async message => {
    if (message.author.bot) return;
    
    // Handle prefix commands
    if (message.content.startsWith('!')) {
        const args = message.content.slice(1).trim().split(/ +/);
        const command = args.shift().toLowerCase();
        
        try {
            switch (command) {
                case 'help':
                    await message.reply(createHelpEmbed());
                    break;
                case 'rps':
                    const user = message.mentions.users.first();
                    if (!user) {
                        await message.reply({ embeds: [createEmbed('❌ Error', 'Please mention a user to challenge!', '#ff0000')] });
                        return;
                    }
                    await handleRPS(message, user);
                    break;
                case 'guess':
                    await handleGuessGame(message);
                    break;
                case 'math':
                    await handleMathGame(message);
                    break;
                case 'type':
                    await handleTypingTest(message);
                    break;
                case 'trivia':
                    await handleTrivia(message);
                    break;
                case 'balance':
                    await handleBalance(message);
                    break;
                case 'daily':
                    await handleDaily(message);
                    break;
                case 'warn':
                    if (!message.member.permissions.has(PermissionFlagsBits.KickMembers)) {
                        await message.reply({ embeds: [createEmbed('❌ Permission Denied', 'You need the `Kick Members` permission to use this command.', '#ff0000')] });
                        return;
                    }
                    const target = message.mentions.users.first();
                    if (!target) {
                        await message.reply({ embeds: [createEmbed('❌ Error', 'Please mention a user to warn!', '#ff0000')] });
                        return;
                    }
                    const reason = args.slice(1).join(' ') || 'No reason provided';
                    await handleWarn(message, target, reason);
                    break;
                case 'userinfo':
                    const mentionedUser = message.mentions.users.first() || message.author;
                    await handleUserInfo(message, mentionedUser);
                    break;
                case 'serverinfo':
                    await handleServerInfo(message);
                    break;
            }
        } catch (error) {
            console.error('Error handling message command:', error);
            await message.reply({ embeds: [createEmbed('❌ Error', 'An error occurred while processing your command.', '#ff0000')] });
        }
    }
    
    // Handle game responses
    if (storage.games[`guess_${message.author.id}`]) {
        const game = storage.games[`guess_${message.author.id}`];
        const guess = parseInt(message.content);
        
        if (isNaN(guess)) {
            return;
        }
        
        game.attempts++;
        
        if (guess === game.number) {
            const timeTaken = (Date.now() - game.startTime) / 1000;
            const embed = createEmbed(
                '🎉 Correct Guess!',
                `You guessed the number **${game.number}** in **${game.attempts} attempts** (${timeTaken.toFixed(1)} seconds)!`,
                '#00ff00'
            );
            
            await message.reply({ embeds: [embed] });
            delete storage.games[`guess_${message.author.id}`];
        } else {
            const hint = guess < game.number ? 'Too low!' : 'Too high!';
            await message.reply({ embeds: [createEmbed('🔢 Guess the Number', hint, '#ffff00')] });
        }
    } else if (storage.games[`math_${message.author.id}`]) {
        const game = storage.games[`math_${message.author.id}`];
        const answer = parseInt(message.content);
        
        if (isNaN(answer)) {
            return;
        }
        
        if (Date.now() > game.expires) {
            await message.reply({ embeds: [createEmbed('⏰ Time\'s Up!', `The correct answer was **${game.answer}**.`, '#ff0000')] });
            delete storage.games[`math_${message.author.id}`];
            return;
        }
        
        if (answer === game.answer) {
            await message.reply({ embeds: [createEmbed('✅ Correct!', `**${answer}** is the right answer!`, '#00ff00')] });
        } else {
            await message.reply({ embeds: [createEmbed('❌ Incorrect', `**${answer}** is not the right answer. Try again!`, '#ff0000')] });
        }
        
        delete storage.games[`math_${message.author.id}`];
    } else if (storage.games[`type_${message.author.id}`]) {
        const game = storage.games[`type_${message.author.id}`];
        
        if (!game.startTime) {
            game.startTime = Date.now();
            return;
        }
        
        if (Date.now() > game.expires) {
            await message.reply({ embeds: [createEmbed('⏰ Time\'s Up!', 'You took too long to complete the typing test.', '#ff0000')] });
            delete storage.games[`type_${message.author.id}`];
            return;
        }
        
        if (message.content === game.sentence) {
            const timeTaken = (Date.now() - game.startTime) / 1000;
            const words = game.sentence.split(' ').length;
            const wpm = Math.floor((words / timeTaken) * 60);
            
            const embed = createEmbed(
                '⌨️ Typing Test Results',
                `✅ You typed the sentence correctly!\n\n**Time:** ${timeTaken.toFixed(2)} seconds\n**WPM:** ${wpm}\n**Accuracy:** 100%`,
                '#00ff00'
            );
            
            await message.reply({ embeds: [embed] });
        } else {
            const embed = createEmbed(
                '❌ Typing Test Failed',
                'Your sentence didn\'t match exactly. Try again!',
                '#ff0000'
            );
            
            await message.reply({ embeds: [embed] });
        }
        
        delete storage.games[`type_${message.author.id}`];
    }
});

client.login(process.env.DISCORD_TOKEN);