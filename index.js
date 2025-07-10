const { Client, GatewayIntentBits, EmbedBuilder, Collection } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });

// In-memory data storage
const users = {};
const shopItems = [
    { name: 'Laptop', price: 500, description: 'Increases work income by 2x', effect: 'workMultiplier', value: 2 },
    { name: 'Lucky Charm', price: 300, description: 'Increases gambling win chance by 10%', effect: 'gambleBonus', value: 0.1 },
    { name: 'Safe', price: 800, description: 'Protects 50% of your money when robbed', effect: 'robProtection', value: 0.5 },
    { name: 'Energy Drink', price: 150, description: 'Reduces work cooldown by 30 minutes', effect: 'workCooldownReduction', value: 1800000 },
    { name: 'Golden Ticket', price: 1000, description: 'Gives a random reward when used', effect: 'randomReward', value: null }
];

// Cooldowns in milliseconds
const cooldowns = {
    daily: 86400000,    // 24 hours
    work: 3600000,      // 1 hour
    beg: 300000,        // 5 minutes
    rob: 1800000,       // 30 minutes
    use: 60000          // 1 minute for item use
};

// Default user data
function getUserData(userId) {
    if (!users[userId]) {
        users[userId] = {
            wallet: 100,
            bank: 0,
            cooldowns: {},
            inventory: [],
            stats: {
                worked: 0,
                begged: 0,
                robbed: 0,
                dailyClaims: 0,
                gamesPlayed: 0,
                moneyEarned: 0,
                moneySpent: 0,
                itemsBought: 0
            }
        };
    }
    return users[userId];
}

// Helper functions
function formatMoney(amount) {
    return `💰 ${amount.toLocaleString()}`;
}

function checkCooldown(userId, action) {
    const user = getUserData(userId);
    if (user.cooldowns[action] && Date.now() < user.cooldowns[action]) {
        return Math.ceil((user.cooldowns[action] - Date.now()) / 60000); // Return minutes remaining
    }
    return 0;
}

function setCooldown(userId, action) {
    const user = getUserData(userId);
    user.cooldowns[action] = Date.now() + cooldowns[action];
}

function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

// Command handling
client.commands = new Collection();

const commands = {
    balance: {
        aliases: ['bal', 'cash'],
        execute: (message, args) => showBalance(message)
    },
    daily: {
        execute: (message, args) => claimDaily(message)
    },
    work: {
        execute: (message, args) => work(message)
    },
    beg: {
        execute: (message, args) => beg(message)
    },
    deposit: {
        aliases: ['dep'],
        execute: (message, args) => deposit(message, args)
    },
    withdraw: {
        aliases: ['with'],
        execute: (message, args) => withdraw(message, args)
    },
    pay: {
        execute: (message, args) => pay(message, args)
    },
    rob: {
        execute: (message, args) => rob(message, args)
    },
    coinflip: {
        aliases: ['cf'],
        execute: (message, args) => coinflip(message, args)
    },
    gamble: {
        execute: (message, args) => gamble(message, args)
    },
    slots: {
        execute: (message, args) => slots(message)
    },
    shop: {
        execute: (message, args) => showShop(message)
    },
    buy: {
        execute: (message, args) => buyItem(message, args)
    },
    sell: {
        execute: (message, args) => sellItem(message, args)
    },
    inventory: {
        aliases: ['inv'],
        execute: (message, args) => showInventory(message)
    },
    use: {
        execute: (message, args) => useItem(message, args)
    },
    leaderboard: {
        aliases: ['top'],
        execute: (message, args) => showLeaderboard(message)
    },
    stats: {
        execute: (message, args) => showStats(message, args)
    },
    help: {
        execute: (message, args) => showHelp(message)
    }
};

// Register commands and aliases
for (const [name, cmd] of Object.entries(commands)) {
    client.commands.set(name, cmd);
    if (cmd.aliases) {
        for (const alias of cmd.aliases) {
            client.commands.set(alias, cmd);
        }
    }
}

// Prefix handling
const prefix = '!eco ';
client.on('messageCreate', async message => {
    if (message.author.bot) return;
    if (!message.content.startsWith(prefix)) return;

    const args = message.content.slice(prefix.length).trim().split(/ +/);
    const commandName = args.shift().toLowerCase();

    const command = client.commands.get(commandName);
    if (!command) return;

    try {
        await command.execute(message, args);
    } catch (error) {
        console.error(error);
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Error')
            .setDescription('An error occurred while executing that command.');
        message.reply({ embeds: [embed] });
    }
});

// Economy commands
function showBalance(message) {
    const user = getUserData(message.author.id);
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`💰 ${message.author.username}'s Balance`)
        .addFields(
            { name: 'Wallet', value: formatMoney(user.wallet), inline: true },
            { name: 'Bank', value: formatMoney(user.bank), inline: true },
            { name: 'Net Worth', value: formatMoney(user.wallet + user.bank), inline: true }
        )
        .setThumbnail(message.author.displayAvatarURL());
    message.reply({ embeds: [embed] });
}

function claimDaily(message) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    const cooldownLeft = checkCooldown(userId, 'daily');
    if (cooldownLeft > 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏳ Cooldown Active')
            .setDescription(`You can claim your daily again in ${cooldownLeft} minutes.`);
        return message.reply({ embeds: [embed] });
    }

    const amount = randomInt(100, 500);
    user.wallet += amount;
    user.stats.dailyClaims += 1;
    user.stats.moneyEarned += amount;
    setCooldown(userId, 'daily');

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🎉 Daily Reward Claimed!')
        .setDescription(`You received ${formatMoney(amount)} as your daily reward!`)
        .setFooter({ text: 'Come back tomorrow for more!' });
    message.reply({ embeds: [embed] });
}

function work(message) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    const cooldownLeft = checkCooldown(userId, 'work');
    if (cooldownLeft > 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏳ Cooldown Active')
            .setDescription(`You can work again in ${cooldownLeft} minutes.`);
        return message.reply({ embeds: [embed] });
    }

    // Check for work multiplier items
    let multiplier = 1;
    user.inventory.forEach(item => {
        if (item.effect === 'workMultiplier') {
            multiplier *= item.value;
        }
    });

    const baseAmount = randomInt(50, 200);
    const amount = Math.floor(baseAmount * multiplier);
    user.wallet += amount;
    user.stats.worked += 1;
    user.stats.moneyEarned += amount;
    setCooldown(userId, 'work');

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('💼 Work Completed')
        .setDescription(`You earned ${formatMoney(amount)} from working!`)
        .setFooter({ text: multiplier > 1 ? `Bonus: ${multiplier}x multiplier applied!` : 'Keep working hard!' });
    message.reply({ embeds: [embed] });
}

function beg(message) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    const cooldownLeft = checkCooldown(userId, 'beg');
    if (cooldownLeft > 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏳ Cooldown Active')
            .setDescription(`You can beg again in ${cooldownLeft} minutes.`);
        return message.reply({ embeds: [embed] });
    }

    const success = Math.random() > 0.4; // 60% chance to get something
    if (!success) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('😢 No Luck')
            .setDescription('No one gave you any money this time. Try again later!');
        setCooldown(userId, 'beg');
        return message.reply({ embeds: [embed] });
    }

    const amount = randomInt(5, 50);
    user.wallet += amount;
    user.stats.begged += 1;
    user.stats.moneyEarned += amount;
    setCooldown(userId, 'beg');

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🙏 Begging Success')
        .setDescription(`Someone pitied you and gave you ${formatMoney(amount)}!`)
        .setFooter({ text: 'Try working for more reliable income!' });
    message.reply({ embeds: [embed] });
}

function deposit(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (!args[0]) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Amount')
            .setDescription('Please specify an amount to deposit (or "all" to deposit everything).');
        return message.reply({ embeds: [embed] });
    }

    let amount;
    if (args[0].toLowerCase() === 'all') {
        amount = user.wallet;
    } else {
        amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Amount')
                .setDescription('Please specify a valid positive number.');
            return message.reply({ embeds: [embed] });
        }
    }

    if (amount > user.wallet) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`You only have ${formatMoney(user.wallet)} in your wallet.`);
        return message.reply({ embeds: [embed] });
    }

    user.wallet -= amount;
    user.bank += amount;

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🏦 Deposit Successful')
        .setDescription(`You deposited ${formatMoney(amount)} into your bank.`)
        .addFields(
            { name: 'New Wallet Balance', value: formatMoney(user.wallet), inline: true },
            { name: 'New Bank Balance', value: formatMoney(user.bank), inline: true }
        );
    message.reply({ embeds: [embed] });
}

function withdraw(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (!args[0]) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Amount')
            .setDescription('Please specify an amount to withdraw (or "all" to withdraw everything).');
        return message.reply({ embeds: [embed] });
    }

    let amount;
    if (args[0].toLowerCase() === 'all') {
        amount = user.bank;
    } else {
        amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            const embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Invalid Amount')
                .setDescription('Please specify a valid positive number.');
            return message.reply({ embeds: [embed] });
        }
    }

    if (amount > user.bank) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`You only have ${formatMoney(user.bank)} in your bank.`);
        return message.reply({ embeds: [embed] });
    }

    user.bank -= amount;
    user.wallet += amount;

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🏦 Withdrawal Successful')
        .setDescription(`You withdrew ${formatMoney(amount)} from your bank.`)
        .addFields(
            { name: 'New Wallet Balance', value: formatMoney(user.wallet), inline: true },
            { name: 'New Bank Balance', value: formatMoney(user.bank), inline: true }
        );
    message.reply({ embeds: [embed] });
}

function pay(message, args) {
    const senderId = message.author.id;
    const sender = getUserData(senderId);
    
    if (args.length < 2) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco pay @user <amount>`');
        return message.reply({ embeds: [embed] });
    }

    const recipient = message.mentions.users.first();
    if (!recipient) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ User Not Found')
            .setDescription('Please mention a valid user to pay.');
        return message.reply({ embeds: [embed] });
    }

    if (recipient.id === senderId) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Recipient')
            .setDescription('You cannot pay yourself.');
        return message.reply({ embeds: [embed] });
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Amount')
            .setDescription('Please specify a valid positive number.');
        return message.reply({ embeds: [embed] });
    }

    if (amount > sender.wallet) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`You only have ${formatMoney(sender.wallet)} in your wallet.`);
        return message.reply({ embeds: [embed] });
    }

    const recipientData = getUserData(recipient.id);
    sender.wallet -= amount;
    recipientData.wallet += amount;

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('💸 Payment Sent')
        .setDescription(`You paid ${recipient.username} ${formatMoney(amount)}.`)
        .addFields(
            { name: 'Your New Balance', value: formatMoney(sender.wallet), inline: true },
            { name: `${recipient.username}'s Balance`, value: formatMoney(recipientData.wallet), inline: true }
        );
    message.reply({ embeds: [embed] });
}

function rob(message, args) {
    const robberId = message.author.id;
    const robber = getUserData(robberId);
    
    const cooldownLeft = checkCooldown(robberId, 'rob');
    if (cooldownLeft > 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏳ Cooldown Active')
            .setDescription(`You can attempt to rob again in ${cooldownLeft} minutes.`);
        return message.reply({ embeds: [embed] });
    }

    if (args.length < 1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco rob @user`');
        return message.reply({ embeds: [embed] });
    }

    const victim = message.mentions.users.first();
    if (!victim) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ User Not Found')
            .setDescription('Please mention a valid user to rob.');
        return message.reply({ embeds: [embed] });
    }

    if (victim.id === robberId) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Target')
            .setDescription('You cannot rob yourself.');
        return message.reply({ embeds: [embed] });
    }

    const victimData = getUserData(victim.id);
    if (victimData.wallet < 10) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('😈 Robbery Failed')
            .setDescription(`${victim.username} doesn't have enough money to rob (minimum 10 coins needed).`);
        setCooldown(robberId, 'rob');
        return message.reply({ embeds: [embed] });
    }

    // Check for rob protection items
    let protection = 0;
    victimData.inventory.forEach(item => {
        if (item.effect === 'robProtection') {
            protection = item.value;
        }
    });

    const successChance = 0.4; // 40% chance to succeed
    const random = Math.random();
    
    if (random > successChance) {
        // Robbery failed
        const fine = Math.floor(victimData.wallet * 0.1);
        robber.wallet = Math.max(0, robber.wallet - fine);
        robber.stats.robbed += 1;
        setCooldown(robberId, 'rob');

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('🚨 Caught!')
            .setDescription(`You were caught trying to rob ${victim.username} and had to pay a fine of ${formatMoney(fine)}!`)
            .setFooter({ text: 'Crime doesn\'t pay... well, sometimes it does.' });
        return message.reply({ embeds: [embed] });
    }

    // Robbery succeeded
    const maxRobAmount = Math.floor(victimData.wallet * 0.5);
    const robAmount = randomInt(10, maxRobAmount);
    const actualRobAmount = Math.floor(robAmount * (1 - protection));
    
    victimData.wallet -= robAmount;
    robber.wallet += actualRobAmount;
    robber.stats.robbed += 1;
    robber.stats.moneyEarned += actualRobAmount;
    setCooldown(robberId, 'rob');

    const embed = new EmbedBuilder()
        .setColor('#9b59b6')
        .setTitle('😈 Robbery Successful')
        .setDescription(`You stole ${formatMoney(actualRobAmount)} from ${victim.username}!`)
        .setFooter({ 
            text: protection > 0 ? 
                `Their protection saved them ${formatMoney(robAmount - actualRobAmount)}!` : 
                'Easy money! (but risky)' 
        });
    message.reply({ embeds: [embed] });
}

// Mini-games
function coinflip(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (args.length < 2) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco coinflip <heads/tails> <amount>`');
        return message.reply({ embeds: [embed] });
    }

    const choice = args[0].toLowerCase();
    if (choice !== 'heads' && choice !== 'tails') {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Choice')
            .setDescription('Please choose either "heads" or "tails".');
        return message.reply({ embeds: [embed] });
    }

    const amount = parseInt(args[1]);
    if (isNaN(amount) || amount <= 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Amount')
            .setDescription('Please specify a valid positive number.');
        return message.reply({ embeds: [embed] });
    }

    if (amount > user.wallet) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`You only have ${formatMoney(user.wallet)} in your wallet.`);
        return message.reply({ embeds: [embed] });
    }

    const result = Math.random() < 0.5 ? 'heads' : 'tails';
    user.stats.gamesPlayed += 1;

    if (choice === result) {
        // Win
        const winAmount = amount;
        user.wallet += winAmount;
        user.stats.moneyEarned += winAmount;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🎉 You Won!')
            .setDescription(`The coin landed on **${result}**! You won ${formatMoney(winAmount)}!`)
            .setFooter({ text: 'Lucky guess!' });
        message.reply({ embeds: [embed] });
    } else {
        // Lose
        user.wallet -= amount;

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('😢 You Lost')
            .setDescription(`The coin landed on **${result}**. You lost ${formatMoney(amount)}.`)
            .setFooter({ text: 'Better luck next time!' });
        message.reply({ embeds: [embed] });
    }
}

function gamble(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (args.length < 1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco gamble <amount>`');
        return message.reply({ embeds: [embed] });
    }

    const amount = parseInt(args[0]);
    if (isNaN(amount) || amount <= 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Amount')
            .setDescription('Please specify a valid positive number.');
        return message.reply({ embeds: [embed] });
    }

    if (amount > user.wallet) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`You only have ${formatMoney(user.wallet)} in your wallet.`);
        return message.reply({ embeds: [embed] });
    }

    // Check for gamble bonus items
    let winChance = 0.45; // 45% base chance
    user.inventory.forEach(item => {
        if (item.effect === 'gambleBonus') {
            winChance += item.value;
        }
    });

    const random = Math.random();
    user.stats.gamesPlayed += 1;

    if (random < winChance) {
        // Win
        const winMultiplier = randomInt(15, 25) / 10; // 1.5x to 2.5x
        const winAmount = Math.floor(amount * winMultiplier);
        user.wallet += winAmount;
        user.stats.moneyEarned += winAmount;

        const embed = new EmbedBuilder()
            .setColor('#2ecc71')
            .setTitle('🎰 Jackpot!')
            .setDescription(`You won ${formatMoney(winAmount)} (${winMultiplier.toFixed(1)}x your bet)!`)
            .setFooter({ text: winChance > 0.45 ? 'Your lucky charm helped!' : 'Feeling lucky?' });
        message.reply({ embeds: [embed] });
    } else {
        // Lose
        user.wallet -= amount;

        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('💸 Bust!')
            .setDescription(`You lost ${formatMoney(amount)}.`)
            .setFooter({ text: 'The house always wins... eventually.' });
        message.reply({ embeds: [embed] });
    }
}

function slots(message) {
    const userId = message.author.id;
    const user = getUserData(userId);
    const cost = 25;
    
    if (user.wallet < cost) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`Slots cost ${formatMoney(cost)} to play. You only have ${formatMoney(user.wallet)}.`);
        return message.reply({ embeds: [embed] });
    }

    user.wallet -= cost;
    user.stats.gamesPlayed += 1;
    user.stats.moneySpent += cost;

    const emojis = ['🍎', '🍒', '🍋', '🍉', '🍇', '7️⃣'];
    const slots = [
        emojis[randomInt(0, emojis.length - 1)],
        emojis[randomInt(0, emojis.length - 1)],
        emojis[randomInt(0, emojis.length - 1)]
    ];

    // Calculate winnings
    let winnings = 0;
    if (slots[0] === slots[1] && slots[1] === slots[2]) {
        if (slots[0] === '7️⃣') {
            winnings = 500; // Jackpot
        } else {
            winnings = 200; // Three of a kind
        }
    } else if (slots[0] === slots[1] || slots[1] === slots[2] || slots[0] === slots[2]) {
        winnings = 50; // Two of a kind
    }

    if (winnings > 0) {
        user.wallet += winnings;
        user.stats.moneyEarned += winnings;
    }

    const embed = new EmbedBuilder()
        .setColor(winnings > 0 ? '#2ecc71' : '#FF0000')
        .setTitle('🎰 Slot Machine')
        .setDescription(`[ ${slots.join(' | ')} ]`)
        .addFields(
            { name: 'Result', value: winnings > 0 ? `You won ${formatMoney(winnings)}!` : 'No win this time!', inline: true },
            { name: 'Cost', value: formatMoney(cost), inline: true }
        )
        .setFooter({ text: winnings > 0 ? 'Winner winner chicken dinner!' : 'Try again!' });
    message.reply({ embeds: [embed] });
}

// Shop & Inventory
function showShop(message) {
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('🛍️ Economy Shop')
        .setDescription('Use `!eco buy <item>` to purchase an item.')
        .addFields(
            ...shopItems.map(item => ({
                name: `${item.name} - ${formatMoney(item.price)}`,
                value: item.description,
                inline: true
            }))
        )
        .setFooter({ text: 'Check your balance with !eco balance' });
    message.reply({ embeds: [embed] });
}

function buyItem(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (args.length < 1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco buy <item>`\nUse `!eco shop` to see available items.');
        return message.reply({ embeds: [embed] });
    }

    const itemName = args.join(' ').toLowerCase();
    const shopItem = shopItems.find(item => item.name.toLowerCase() === itemName);
    
    if (!shopItem) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Item Not Found')
            .setDescription('That item doesn\'t exist in the shop. Use `!eco shop` to see available items.');
        return message.reply({ embeds: [embed] });
    }

    if (user.wallet < shopItem.price) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Insufficient Funds')
            .setDescription(`You need ${formatMoney(shopItem.price)} to buy ${shopItem.name}, but you only have ${formatMoney(user.wallet)}.`);
        return message.reply({ embeds: [embed] });
    }

    // Check if user already has this item (for non-stackable items)
    if (user.inventory.some(item => item.name === shopItem.name)) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Already Owned')
            .setDescription(`You already have ${shopItem.name} in your inventory.`);
        return message.reply({ embeds: [embed] });
    }

    user.wallet -= shopItem.price;
    user.inventory.push({
        name: shopItem.name,
        price: shopItem.price,
        effect: shopItem.effect,
        value: shopItem.value
    });
    user.stats.itemsBought += 1;
    user.stats.moneySpent += shopItem.price;

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🛍️ Purchase Successful')
        .setDescription(`You bought **${shopItem.name}** for ${formatMoney(shopItem.price)}.`)
        .addFields(
            { name: 'Effect', value: shopItem.description, inline: true },
            { name: 'New Balance', value: formatMoney(user.wallet), inline: true }
        )
        .setFooter({ text: 'Use !eco inventory to see your items' });
    message.reply({ embeds: [embed] });
}

function sellItem(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (args.length < 1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco sell <item>`\nUse `!eco inventory` to see your items.');
        return message.reply({ embeds: [embed] });
    }

    const itemName = args.join(' ').toLowerCase();
    const itemIndex = user.inventory.findIndex(item => item.name.toLowerCase() === itemName);
    
    if (itemIndex === -1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Item Not Found')
            .setDescription('You don\'t have that item in your inventory. Use `!eco inventory` to see your items.');
        return message.reply({ embeds: [embed] });
    }

    const item = user.inventory[itemIndex];
    const sellPrice = Math.floor(item.price * 0.7); // 70% of purchase price

    user.inventory.splice(itemIndex, 1);
    user.wallet += sellPrice;

    const embed = new EmbedBuilder()
        .setColor('#2ecc71')
        .setTitle('🛍️ Sale Successful')
        .setDescription(`You sold **${item.name}** for ${formatMoney(sellPrice)}.`)
        .addFields(
            { name: 'New Balance', value: formatMoney(user.wallet), inline: true }
        )
        .setFooter({ text: 'Use !eco shop to buy more items' });
    message.reply({ embeds: [embed] });
}

function showInventory(message) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    if (user.inventory.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🎒 Empty Inventory')
            .setDescription('You don\'t have any items yet. Visit the shop with `!eco shop`.');
        return message.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`🎒 ${message.author.username}'s Inventory`)
        .setDescription('Use `!eco use <item>` to use an item.')
        .addFields(
            ...user.inventory.map(item => ({
                name: item.name,
                value: `Purchase Price: ${formatMoney(item.price)}\nEffect: ${shopItems.find(si => si.name === item.name).description}`,
                inline: true
            }))
        )
        .setFooter({ text: `Total items: ${user.inventory.length}` });
    message.reply({ embeds: [embed] });
}

function useItem(message, args) {
    const userId = message.author.id;
    const user = getUserData(userId);
    
    const cooldownLeft = checkCooldown(userId, 'use');
    if (cooldownLeft > 0) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('⏳ Cooldown Active')
            .setDescription(`You can use items again in ${cooldownLeft} minutes.`);
        return message.reply({ embeds: [embed] });
    }

    if (args.length < 1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Invalid Command')
            .setDescription('Usage: `!eco use <item>`\nUse `!eco inventory` to see your items.');
        return message.reply({ embeds: [embed] });
    }

    const itemName = args.join(' ').toLowerCase();
    const itemIndex = user.inventory.findIndex(item => item.name.toLowerCase() === itemName);
    
    if (itemIndex === -1) {
        const embed = new EmbedBuilder()
            .setColor('#FF0000')
            .setTitle('❌ Item Not Found')
            .setDescription('You don\'t have that item in your inventory. Use `!eco inventory` to see your items.');
        return message.reply({ embeds: [embed] });
    }

    const item = user.inventory[itemIndex];
    let embed;

    switch (item.effect) {
        case 'randomReward':
            const reward = randomInt(50, 500);
            user.wallet += reward;
            user.inventory.splice(itemIndex, 1);
            embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('🎁 Golden Ticket Used')
                .setDescription(`You received a random reward of ${formatMoney(reward)}!`);
            break;
            
        case 'workMultiplier':
        case 'gambleBonus':
        case 'robProtection':
            embed = new EmbedBuilder()
                .setColor('#FFA500')
                .setTitle('ℹ️ Passive Item')
                .setDescription(`**${item.name}** is a passive item and its effect is always active. You don't need to use it.`);
            break;
            
        case 'workCooldownReduction':
            if (user.cooldowns.work) {
                user.cooldowns.work = Math.max(Date.now(), user.cooldowns.work - item.value);
            }
            user.inventory.splice(itemIndex, 1);
            embed = new EmbedBuilder()
                .setColor('#2ecc71')
                .setTitle('⚡ Energy Drink Used')
                .setDescription('Your work cooldown has been reduced by 30 minutes!');
            break;
            
        default:
            embed = new EmbedBuilder()
                .setColor('#FF0000')
                .setTitle('❌ Cannot Use Item')
                .setDescription('This item cannot be used directly.');
    }

    setCooldown(userId, 'use');
    message.reply({ embeds: [embed] });
}

// Stats & Leaderboard
function showLeaderboard(message) {
    // Get top 10 users by net worth
    const topUsers = Object.entries(users)
        .map(([id, data]) => ({
            id,
            netWorth: data.wallet + data.bank,
            ...data
        }))
        .sort((a, b) => b.netWorth - a.netWorth)
        .slice(0, 10);

    if (topUsers.length === 0) {
        const embed = new EmbedBuilder()
            .setColor('#FFA500')
            .setTitle('🏆 Leaderboard')
            .setDescription('No users have any money yet. Be the first to earn some!');
        return message.reply({ embeds: [embed] });
    }

    const embed = new EmbedBuilder()
        .setColor('#f1c40f')
        .setTitle('🏆 Top 10 Richest Users')
        .setDescription('Ranked by total net worth (wallet + bank)');

    for (let i = 0; i < topUsers.length; i++) {
        const userData = topUsers[i];
        const user = client.users.cache.get(userData.id) || { username: 'Unknown User' };
        embed.addFields({
            name: `${i + 1}. ${user.username}`,
            value: `Net Worth: ${formatMoney(userData.netWorth)}\nWallet: ${formatMoney(userData.wallet)} | Bank: ${formatMoney(userData.bank)}`,
            inline: false
        });
    }

    message.reply({ embeds: [embed] });
}

function showStats(message, args) {
    let targetUser = message.author;
    if (args.length > 0 && message.mentions.users.size > 0) {
        targetUser = message.mentions.users.first();
    }

    const userData = getUserData(targetUser.id);
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle(`📊 ${targetUser.username}'s Stats`)
        .setThumbnail(targetUser.displayAvatarURL())
        .addFields(
            { name: '💰 Economy', value: `Net Worth: ${formatMoney(userData.wallet + userData.bank)}\nWallet: ${formatMoney(userData.wallet)}\nBank: ${formatMoney(userData.bank)}`, inline: true },
            { name: '📈 Activity', value: `Worked: ${userData.stats.worked}\nBegged: ${userData.stats.begged}\nRobbed: ${userData.stats.robbed}`, inline: true },
            { name: '🎮 Games', value: `Played: ${userData.stats.gamesPlayed}\nEarned: ${formatMoney(userData.stats.moneyEarned)}\nSpent: ${formatMoney(userData.stats.moneySpent)}`, inline: true },
            { name: '🛍️ Items', value: `Owned: ${userData.inventory.length}\nBought: ${userData.stats.itemsBought}`, inline: true }
        )
        .setFooter({ text: 'Keep playing to improve your stats!' });

    message.reply({ embeds: [embed] });
}

// Help system
function showHelp(message) {
    const embed = new EmbedBuilder()
        .setColor('#3498db')
        .setTitle('📘 Economy Bot Help')
        .setDescription('All commands are prefixed with `!eco` or `!` for basic commands.')
        .addFields(
            { name: '💰 Basic Economy', value: '`balance` - Show your wallet & bank\n`daily` - Claim daily reward\n`work` - Work for coins\n`beg` - Beg for coins\n`deposit <amount>` - Move money to bank\n`withdraw <amount>` - Move money to wallet\n`pay @user <amount>` - Send money\n`rob @user` - Attempt to steal money' },
            { name: '🎲 Mini-Games', value: '`coinflip <heads/tails> <amount>` - 50/50 chance\n`gamble <amount>` - Risk it all\n`slots` - Play slot machine' },
            { name: '🛍️ Shop & Inventory', value: '`shop` - View available items\n`buy <item>` - Purchase an item\n`sell <item>` - Sell an item\n`inventory` - View your items\n`use <item>` - Use an item' },
            { name: '🏆 Stats & Leaderboard', value: '`leaderboard` - Top 10 richest\n`stats @user` - View user stats' },
            { name: '📘 Help', value: '`help` - Show this message' }
        )
        .setFooter({ text: 'Example: !eco work or !daily' });

    message.reply({ embeds: [embed] });
}

// Bot startup
client.on('ready', () => {
    console.log(`Logged in as ${client.user.tag}!`);
});

client.login(process.env.TOKEN);

// Keep alive (for Replit)
require('./keep_alive.js');