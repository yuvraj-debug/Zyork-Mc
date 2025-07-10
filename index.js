require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder } = require('discord.js');
const Database = require('better-sqlite3');
const express = require('express');

// Initialize Express for keep-alive
const app = express();
app.listen(3000, () => console.log('Keep-alive server running'));

// Initialize SQLite database
const db = new Database('economy.db');
db.pragma('journal_mode = WAL');

// Create tables if they don't exist
db.exec(`
CREATE TABLE IF NOT EXISTS economy (
    user_id TEXT PRIMARY KEY,
    wallet INTEGER DEFAULT 100,
    bank INTEGER DEFAULT 0,
    inventory TEXT DEFAULT '[]',
    job TEXT,
    properties TEXT DEFAULT '[]'
);
CREATE TABLE IF NOT EXISTS cooldowns (
    user_id TEXT,
    command TEXT,
    last_used INTEGER,
    PRIMARY KEY (user_id, command)
);
CREATE TABLE IF NOT EXISTS shop (
    item_id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT,
    price INTEGER,
    description TEXT
);
`);

// Initialize default shop items
const shopItems = db.prepare('SELECT COUNT(*) AS count FROM shop').get();
if (shopItems.count === 0) {
    const insert = db.prepare('INSERT INTO shop (name, price, description) VALUES (?, ?, ?)');
    insert.run('Laptop', 2000, 'Increases work income by 20%');
    insert.run('Shield', 1500, 'Protects from robbery for 24 hours');
    insert.run('Lottery Ticket', 100, 'Entry to the daily lottery');
    insert.run('Mystery Box', 500, 'Random item or coins');
}

// Constants
const CURRENCY = '💰';
const DAILY_REWARD = 500;
const WORK_REWARD_MIN = 100;
const WORK_REWARD_MAX = 500;
const BEG_REWARD_MIN = 10;
const BEG_REWARD_MAX = 100;

// Job system
const JOB_TIERS = {
    'Intern': { basePay: 100, upgradeCost: 1000 },
    'Employee': { basePay: 250, upgradeCost: 2500 },
    'Manager': { basePay: 500, upgradeCost: 5000 },
    'Executive': { basePay: 1000, upgradeCost: 10000 },
    'CEO': { basePay: 2000, upgradeCost: 0 }
};

// Helper functions
function randomInt(min, max) {
    return Math.floor(Math.random() * (max - min + 1)) + min;
}

function formatMoney(amount) {
    return `${CURRENCY} ${amount.toLocaleString()}`;
}

function getEmbed(color, title, description) {
    return new EmbedBuilder()
        .setColor(color)
        .setTitle(title)
        .setDescription(description)
        .setTimestamp();
}

function checkCooldown(userId, command, cooldownTime) {
    const row = db.prepare('SELECT last_used FROM cooldowns WHERE user_id = ? AND command = ?').get(userId, command);
    const now = Date.now();
    
    if (row && now - row.last_used < cooldownTime) {
        return Math.ceil((cooldownTime - (now - row.last_used)) / 1000);
    }
    
    db.prepare('INSERT OR REPLACE INTO cooldowns (user_id, command, last_used) VALUES (?, ?, ?)')
      .run(userId, command, now);
    return 0;
}

function getUserInventory(userId) {
    const result = db.prepare('SELECT inventory FROM economy WHERE user_id = ?').get(userId);
    return JSON.parse(result.inventory);
}

function updateUserInventory(userId, inventory) {
    db.prepare('UPDATE economy SET inventory = ? WHERE user_id = ?')
      .run(JSON.stringify(inventory), userId);
}

// Initialize Discord client
const client = new Client({ 
    intents: [
        GatewayIntentBits.Guilds,
        GatewayIntentBits.GuildMessages,
        GatewayIntentBits.MessageContent
    ]
});

client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;

    // Initialize user if not exists
    const user = db.prepare('SELECT * FROM economy WHERE user_id = ?').get(userId);
    if (!user) {
        db.prepare('INSERT INTO economy (user_id) VALUES (?)').run(userId);
    }

    // Balance command
    if (command === 'balance' || command === 'bal') {
        const { wallet, bank } = db.prepare('SELECT wallet, bank FROM economy WHERE user_id = ?').get(userId);
        const embed = getEmbed(0x00FF00, `${message.author.username}'s Balance`, 
            `**Wallet:** ${formatMoney(wallet)}\n**Bank:** ${formatMoney(bank)}\n**Net Worth:** ${formatMoney(wallet + bank)}`);
        message.reply({ embeds: [embed] });
    }

    // Daily command
    if (command === 'daily') {
        const cooldown = 24 * 60 * 60 * 1000;
        const remaining = checkCooldown(userId, 'daily', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Daily Reward', 
                `Come back in ${Math.floor(remaining / 3600)} hours.`);
            return message.reply({ embeds: [embed] });
        }
        
        const streakRow = db.prepare('SELECT last_used FROM cooldowns WHERE user_id = ? AND command = ?').get(userId, 'dailyStreak');
        const streak = streakRow ? 1 : 0;
        const bonus = Math.floor(DAILY_REWARD * (1 + (streak * 0.1)));
        
        db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(bonus, userId);
        db.prepare('INSERT OR REPLACE INTO cooldowns (user_id, command, last_used) VALUES (?, ?, ?)')
          .run(userId, 'dailyStreak', Date.now());
        
        const embed = getEmbed(0x00FF00, 'Daily Reward Claimed!', 
            `You received ${formatMoney(bonus)}!`);
        message.reply({ embeds: [embed] });
    }

    // Work command
    if (command === 'work') {
        const cooldown = 60 * 60 * 1000;
        const remaining = checkCooldown(userId, 'work', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Work Cooldown', 
                `Come back in ${Math.floor(remaining / 60)} minutes.`);
            return message.reply({ embeds: [embed] });
        }
        
        let baseEarning = randomInt(WORK_REWARD_MIN, WORK_REWARD_MAX);
        const { job, inventory } = db.prepare('SELECT job, inventory FROM economy WHERE user_id = ?').get(userId);
        
        if (job && JOB_TIERS[job]) {
            baseEarning += JOB_TIERS[job].basePay;
        }
        
        if (JSON.parse(inventory).includes('Laptop')) {
            baseEarning = Math.floor(baseEarning * 1.2);
        }
        
        db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(baseEarning, userId);
        const embed = getEmbed(0x00FF00, 'Work Completed!', 
            `You earned ${formatMoney(baseEarning)}!`);
        message.reply({ embeds: [embed] });
    }

    // Beg command
    if (command === 'beg') {
        const cooldown = 5 * 60 * 1000;
        const remaining = checkCooldown(userId, 'beg', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Begging Cooldown', 
                `Try again in ${remaining} seconds.`);
            return message.reply({ embeds: [embed] });
        }
        
        if (Math.random() > 0.3) {
            const amount = randomInt(BEG_REWARD_MIN, BEG_REWARD_MAX);
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(amount, userId);
            const embed = getEmbed(0x00FF00, 'Begging Success', 
                `Someone gave you ${formatMoney(amount)}!`);
            message.reply({ embeds: [embed] });
        } else {
            const embed = getEmbed(0xFF0000, 'Begging Failed', 
                'No one gave you any money!');
            message.reply({ embeds: [embed] });
        }
    }

    // Deposit command
    if (command === 'deposit') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            const embed = getEmbed(0xFF0000, 'Deposit Error', 'Please specify a valid amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const { wallet } = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(userId);
        if (amount > wallet) {
            const embed = getEmbed(0xFF0000, 'Deposit Error', 'Not enough money in wallet!');
            return message.reply({ embeds: [embed] });
        }
        
        db.prepare('UPDATE economy SET wallet = wallet - ?, bank = bank + ? WHERE user_id = ?')
          .run(amount, amount, userId);
        
        const embed = getEmbed(0x00FF00, 'Deposit Successful', 
            `Deposited ${formatMoney(amount)} to your bank!`);
        message.reply({ embeds: [embed] });
    }

    // Withdraw command
    if (command === 'withdraw') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            const embed = getEmbed(0xFF0000, 'Withdraw Error', 'Please specify a valid amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const { bank } = db.prepare('SELECT bank FROM economy WHERE user_id = ?').get(userId);
        if (amount > bank) {
            const embed = getEmbed(0xFF0000, 'Withdraw Error', 'Not enough money in bank!');
            return message.reply({ embeds: [embed] });
        }
        
        db.prepare('UPDATE economy SET wallet = wallet + ?, bank = bank - ? WHERE user_id = ?')
          .run(amount, amount, userId);
        
        const embed = getEmbed(0x00FF00, 'Withdraw Successful', 
            `Withdrew ${formatMoney(amount)} from your bank!`);
        message.reply({ embeds: [embed] });
    }

    // Pay command
    if (command === 'pay') {
        const target = message.mentions.users.first();
        if (!target) {
            const embed = getEmbed(0xFF0000, 'Pay Error', 'Please mention a user!');
            return message.reply({ embeds: [embed] });
        }
        
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            const embed = getEmbed(0xFF0000, 'Pay Error', 'Please specify a valid amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const { wallet } = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(userId);
        if (amount > wallet) {
            const embed = getEmbed(0xFF0000, 'Pay Error', 'Not enough money!');
            return message.reply({ embeds: [embed] });
        }
        
        // Initialize target if not exists
        const targetUser = db.prepare('SELECT * FROM economy WHERE user_id = ?').get(target.id);
        if (!targetUser) {
            db.prepare('INSERT INTO economy (user_id) VALUES (?)').run(target.id);
        }
        
        db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(amount, userId);
        db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(amount, target.id);
        
        const embed = getEmbed(0x00FF00, 'Payment Sent', 
            `You paid ${target.username} ${formatMoney(amount)}!`);
        message.reply({ embeds: [embed] });
    }

    // Rob command
    if (command === 'rob') {
        const cooldown = 2 * 60 * 60 * 1000;
        const remaining = checkCooldown(userId, 'rob', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Robbery Cooldown', 
                `Come back in ${Math.floor(remaining / 3600)} hours.`);
            return message.reply({ embeds: [embed] });
        }
        
        const target = message.mentions.users.first();
        if (!target) {
            const embed = getEmbed(0xFF0000, 'Rob Error', 'Please mention a user!');
            return message.reply({ embeds: [embed] });
        }
        
        if (target.id === userId) {
            const embed = getEmbed(0xFF0000, 'Rob Error', "You can't rob yourself!");
            return message.reply({ embeds: [embed] });
        }
        
        // Check if target has shield
        const targetInventory = getUserInventory(target.id);
        if (targetInventory.includes('Shield')) {
            const embed = getEmbed(0xFF0000, 'Robbery Failed', 
                `${target.username} is protected by a shield!`);
            return message.reply({ embeds: [embed] });
        }
        
        const targetWallet = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(target.id).wallet;
        if (targetWallet < 100) {
            const embed = getEmbed(0xFF0000, 'Robbery Failed', 
                `${target.username} is too poor to rob!`);
            return message.reply({ embeds: [embed] });
        }
        
        if (Math.random() > 0.4) { // 60% success chance
            const stolenAmount = Math.floor(targetWallet * (0.1 + Math.random() * 0.2)); // 10-30%
            db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(stolenAmount, target.id);
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(stolenAmount, userId);
            
            const embed = getEmbed(0x00FF00, 'Robbery Successful!', 
                `You stole ${formatMoney(stolenAmount)} from ${target.username}!`);
            message.reply({ embeds: [embed] });
        } else {
            const fine = Math.floor(targetWallet * 0.1);
            db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(fine, userId);
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(fine, target.id);
            
            const embed = getEmbed(0xFF0000, 'Robbery Failed', 
                `You got caught and paid ${target.username} ${formatMoney(fine)}!`);
            message.reply({ embeds: [embed] });
        }
    }

    // Coinflip command
    if (command === 'coinflip' || command === 'cf') {
        const choice = args[0]?.toLowerCase();
        if (!choice || !['heads', 'tails'].includes(choice)) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', 'Please specify "heads" or "tails"!');
            return message.reply({ embeds: [embed] });
        }
        
        const amount = parseInt(args[1]);
        if (isNaN(amount) || amount <= 0) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', 'Please specify a valid amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const { wallet } = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(userId);
        if (amount > wallet) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', 'Not enough money!');
            return message.reply({ embeds: [embed] });
        }
        
        const result = Math.random() > 0.5 ? 'heads' : 'tails';
        if (result === choice) {
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(amount, userId);
            const embed = getEmbed(0x00FF00, 'Coinflip Win!', 
                `It was ${result}! You won ${formatMoney(amount)}!`);
            message.reply({ embeds: [embed] });
        } else {
            db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(amount, userId);
            const embed = getEmbed(0xFF0000, 'Coinflip Loss', 
                `It was ${result}! You lost ${formatMoney(amount)}.`);
            message.reply({ embeds: [embed] });
        }
    }

    // Gamble command
    if (command === 'gamble') {
        const amount = parseInt(args[0]);
        if (isNaN(amount) || amount <= 0) {
            const embed = getEmbed(0xFF0000, 'Gamble Error', 'Please specify a valid amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const { wallet } = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(userId);
        if (amount > wallet) {
            const embed = getEmbed(0xFF0000, 'Gamble Error', 'Not enough money!');
            return message.reply({ embeds: [embed] });
        }
        
        if (Math.random() > 0.5) { // 50% chance
            const winnings = amount * 2;
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(winnings, userId);
            const embed = getEmbed(0x00FF00, 'Gamble Win!', 
                `You won ${formatMoney(winnings)}!`);
            message.reply({ embeds: [embed] });
        } else {
            db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(amount, userId);
            const embed = getEmbed(0xFF0000, 'Gamble Loss', 
                `You lost ${formatMoney(amount)}.`);
            message.reply({ embeds: [embed] });
        }
    }

    // Slots command
    if (command === 'slots') {
        const amount = parseInt(args[0]) || 0;
        if (isNaN(amount) || amount < 0) {
            const embed = getEmbed(0xFF0000, 'Slots Error', 'Please specify a valid amount!');
            return message.reply({ embeds: [embed] });
        }
        
        if (amount > 0) {
            const { wallet } = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(userId);
            if (amount > wallet) {
                const embed = getEmbed(0xFF0000, 'Slots Error', 'Not enough money!');
                return message.reply({ embeds: [embed] });
            }
        }
        
        const symbols = ['🍎', '🍊', '🍇', '🍒', '🍋', '💰', '7️⃣'];
        const slots = [
            symbols[randomInt(0, symbols.length - 1)],
            symbols[randomInt(0, symbols.length - 1)],
            symbols[randomInt(0, symbols.length - 1)]
        ];
        
        let result;
        if (slots[0] === slots[1] && slots[1] === slots[2]) {
            const winnings = amount * 5;
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(winnings, userId);
            result = `JACKPOT! You won ${formatMoney(winnings)}!`;
        } else if (slots[0] === slots[1] || slots[1] === slots[2] || slots[0] === slots[2]) {
            const winnings = amount * 2;
            db.prepare('UPDATE economy SET wallet = wallet + ? WHERE user_id = ?').run(winnings, userId);
            result = `Two match! You won ${formatMoney(winnings)}!`;
        } else if (amount > 0) {
            db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(amount, userId);
            result = `You lost ${formatMoney(amount)}.`;
        } else {
            result = 'Play for free or bet coins to win!';
        }
        
        const embed = getEmbed(0x800080, 'Slot Machine', 
            `[ ${slots.join(' | ')} ]\n\n${result}`);
        message.reply({ embeds: [embed] });
    }

    // Shop command
    if (command === 'shop') {
        const items = db.prepare('SELECT * FROM shop').all();
        const shopList = items.map(item => 
            `**${item.name}** - ${formatMoney(item.price)}\n${item.description}`).join('\n\n');
        
        const embed = getEmbed(0xFFFF00, 'Shop', shopList);
        message.reply({ embeds: [embed] });
    }

    // Buy command
    if (command === 'buy') {
        const itemName = args.join(' ');
        if (!itemName) {
            const embed = getEmbed(0xFF0000, 'Buy Error', 'Please specify an item!');
            return message.reply({ embeds: [embed] });
        }
        
        const item = db.prepare('SELECT * FROM shop WHERE name LIKE ?').get(`%${itemName}%`);
        if (!item) {
            const embed = getEmbed(0xFF0000, 'Buy Error', 'Item not found!');
            return message.reply({ embeds: [embed] });
        }
        
        const { wallet } = db.prepare('SELECT wallet FROM economy WHERE user_id = ?').get(userId);
        if (wallet < item.price) {
            const embed = getEmbed(0xFF0000, 'Buy Error', 'Not enough money!');
            return message.reply({ embeds: [embed] });
        }
        
        const inventory = getUserInventory(userId);
        inventory.push(item.name);
        updateUserInventory(userId, inventory);
        
        db.prepare('UPDATE economy SET wallet = wallet - ? WHERE user_id = ?').run(item.price, userId);
        
        const embed = getEmbed(0x00FF00, 'Purchase Successful', 
            `You bought **${item.name}** for ${formatMoney(item.price)}!`);
        message.reply({ embeds: [embed] });
    }

    // Inventory command
    if (command === 'inventory' || command === 'inv') {
        const inventory = getUserInventory(userId);
        
        if (inventory.length === 0) {
            const embed = getEmbed(0xFFFF00, 'Inventory', 'Your inventory is empty!');
            return message.reply({ embeds: [embed] });
        }
        
        // Count items
        const itemCounts = {};
        inventory.forEach(item => {
            itemCounts[item] = (itemCounts[item] || 0) + 1;
        });
        
        const inventoryList = Object.entries(itemCounts)
            .map(([item, count]) => `**${item}** x${count}`)
            .join('\n');
        
        const embed = getEmbed(0xFFFF00, 'Inventory', inventoryList);
        message.reply({ embeds: [embed] });
    }

    // Leaderboard command
    if (command === 'leaderboard' || command === 'lb') {
        const users = db.prepare('SELECT user_id, wallet, bank FROM economy').all();
        const sorted = users
            .map(user => ({
                id: user.user_id,
                netWorth: user.wallet + user.bank
            }))
            .sort((a, b) => b.netWorth - a.netWorth)
            .slice(0, 10);
        
        let leaderboardText = '';
        for (let i = 0; i < sorted.length; i++) {
            try {
                const user = await client.users.fetch(sorted[i].id);
                leaderboardText += `**${i + 1}.** ${user.username} - ${formatMoney(sorted[i].netWorth)}\n`;
            } catch (err) {
                console.error(`Couldn't fetch user ${sorted[i].id}`);
            }
        }
        
        const embed = getEmbed(0xFFD700, 'Top 10 Richest Players', 
            leaderboardText || 'No users found');
        message.reply({ embeds: [embed] });
    }

    // Admin: Add item command
    if (command === 'additem' && message.member.permissions.has('ADMINISTRATOR')) {
        const price = parseInt(args.pop());
        const name = args.join(' ');
        
        if (!name || isNaN(price)) {
            const embed = getEmbed(0xFF0000, 'Add Item Error', 'Usage: !additem <name> <price>');
            return message.reply({ embeds: [embed] });
        }
        
        db.prepare('INSERT INTO shop (name, price, description) VALUES (?, ?, ?)')
          .run(name, price, 'No description provided');
        
        const embed = getEmbed(0x00FF00, 'Item Added', 
            `Added **${name}** for ${formatMoney(price)}!`);
        message.reply({ embeds: [embed] });
    }
});

client.login(process.env.DISCORD_TOKEN);