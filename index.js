require('dotenv').config();
const { Client, GatewayIntentBits, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const client = new Client({ intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent] });
const quickdb = require('quick.db');
const db = new quickdb.QuickDB();
const economy = db.table('economy');
const cooldowns = db.table('cooldowns');
const shop = db.table('shop');
const jobs = db.table('jobs');
const properties = db.table('properties');
const events = db.table('events');

// Currency symbol and default values
const CURRENCY = '💰';
const DAILY_REWARD = 500;
const WORK_REWARD_MIN = 100;
const WORK_REWARD_MAX = 500;
const BEG_REWARD_MIN = 10;
const BEG_REWARD_MAX = 100;

// Shop items
const DEFAULT_SHOP = [
    { name: 'Laptop', price: 2000, description: 'Increases work income by 20%' },
    { name: 'Shield', price: 1500, description: 'Protects from robbery for 24 hours' },
    { name: 'Lottery Ticket', price: 100, description: 'Entry to the daily lottery' },
    { name: 'Mystery Box', price: 500, description: 'Random item or coins' }
];

// Job system
const JOB_TIERS = {
    'Intern': { basePay: 100, upgradeCost: 1000 },
    'Employee': { basePay: 250, upgradeCost: 2500 },
    'Manager': { basePay: 500, upgradeCost: 5000 },
    'Executive': { basePay: 1000, upgradeCost: 10000 },
    'CEO': { basePay: 2000, upgradeCost: 0 }
};

// Initialize database
async function initDatabase() {
    if (!await shop.get('items')) await shop.set('items', DEFAULT_SHOP);
    if (!await jobs.get('available')) await jobs.set('available', Object.keys(JOB_TIERS));
}

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
    const now = Date.now();
    const lastUsed = cooldowns.get(`${userId}.${command}`) || 0;
    if (now - lastUsed < cooldownTime) {
        return Math.ceil((cooldownTime - (now - lastUsed)) / 1000);
    }
    cooldowns.set(`${userId}.${command}`, now);
    return 0;
}

// Economy commands
client.on('messageCreate', async message => {
    if (message.author.bot || !message.content.startsWith('!')) return;
    
    const args = message.content.slice(1).trim().split(/ +/);
    const command = args.shift().toLowerCase();
    const userId = message.author.id;
    const guildId = message.guild.id;
    
    // Initialize user data if not exists
    if (!await economy.get(`${userId}.wallet`)) await economy.set(`${userId}.wallet`, 100);
    if (!await economy.get(`${userId}.bank`)) await economy.set(`${userId}.bank`, 0);
    if (!await economy.get(`${userId}.inventory`)) await economy.set(`${userId}.inventory`, []);
    if (!await economy.get(`${userId}.job`)) await economy.set(`${userId}.job`, null);
    if (!await economy.get(`${userId}.properties`)) await economy.set(`${userId}.properties`, []);
    
    // Balance command
    if (command === 'balance' || command === 'bal') {
        const wallet = await economy.get(`${userId}.wallet`);
        const bank = await economy.get(`${userId}.bank`);
        
        const embed = getEmbed(0x00FF00, `${message.author.username}'s Balance`, 
            `**Wallet:** ${formatMoney(wallet)}\n` +
            `**Bank:** ${formatMoney(bank)}\n` +
            `**Net Worth:** ${formatMoney(wallet + bank)}`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Daily command
    if (command === 'daily') {
        const cooldown = 24 * 60 * 60 * 1000; // 24 hours
        const remaining = checkCooldown(userId, 'daily', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Daily Reward', 
                `You've already claimed your daily reward! Come back in ${Math.floor(remaining / 3600)} hours.`);
            return message.reply({ embeds: [embed] });
        }
        
        const streak = (await cooldowns.get(`${userId}.dailyStreak`) || 0) + 1;
        const bonus = Math.floor(DAILY_REWARD * (1 + (streak * 0.1)));
        await cooldowns.set(`${userId}.dailyStreak`, streak);
        await economy.add(`${userId}.wallet`, bonus);
        
        const embed = getEmbed(0x00FF00, 'Daily Reward Claimed!', 
            `You received ${formatMoney(bonus)} (${streak} day streak bonus included!)\n` +
            `Come back tomorrow for an even bigger reward!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Work command
    if (command === 'work') {
        const cooldown = 60 * 60 * 1000; // 1 hour
        const remaining = checkCooldown(userId, 'work', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Work Cooldown', 
                `You need to rest! Come back in ${Math.floor(remaining / 60)} minutes.`);
            return message.reply({ embeds: [embed] });
        }
        
        const job = await economy.get(`${userId}.job`);
        let baseEarning = randomInt(WORK_REWARD_MIN, WORK_REWARD_MAX);
        
        if (job) {
            const jobTier = JOB_TIERS[job];
            baseEarning += jobTier.basePay;
        }
        
        // Check for work boost items
        const inventory = await economy.get(`${userId}.inventory`);
        if (inventory.includes('Laptop')) baseEarning = Math.floor(baseEarning * 1.2);
        
        await economy.add(`${userId}.wallet`, baseEarning);
        
        const embed = getEmbed(0x00FF00, 'Work Completed!', 
            `You earned ${formatMoney(baseEarning)} from working${job ? ` as a ${job}` : ''}!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Beg command
    if (command === 'beg') {
        const cooldown = 5 * 60 * 1000; // 5 minutes
        const remaining = checkCooldown(userId, 'beg', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Begging Cooldown', 
                `People are tired of you! Try again in ${remaining} seconds.`);
            return message.reply({ embeds: [embed] });
        }
        
        const success = Math.random() > 0.3; // 70% chance
        if (!success) {
            const embed = getEmbed(0xFF0000, 'Begging Failed', 
                'No one gave you any money. Try again later!');
            return message.reply({ embeds: [embed] });
        }
        
        const amount = randomInt(BEG_REWARD_MIN, BEG_REWARD_MAX);
        await economy.add(`${userId}.wallet`, amount);
        
        const embed = getEmbed(0x00FF00, 'Begging Success', 
            `Someone took pity on you and gave you ${formatMoney(amount)}!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Deposit command
    if (command === 'deposit') {
        const amount = args[0];
        if (!amount || isNaN(amount)) {
            const embed = getEmbed(0xFF0000, 'Deposit Error', 'Please specify a valid amount to deposit!');
            return message.reply({ embeds: [embed] });
        }
        
        const numAmount = parseInt(amount);
        const wallet = await economy.get(`${userId}.wallet`);
        
        if (numAmount > wallet) {
            const embed = getEmbed(0xFF0000, 'Deposit Error', `You don't have enough money in your wallet!`);
            return message.reply({ embeds: [embed] });
        }
        
        await economy.sub(`${userId}.wallet`, numAmount);
        await economy.add(`${userId}.bank`, numAmount);
        
        const embed = getEmbed(0x00FF00, 'Deposit Successful', 
            `You deposited ${formatMoney(numAmount)} into your bank!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Withdraw command
    if (command === 'withdraw') {
        const amount = args[0];
        if (!amount || isNaN(amount)) {
            const embed = getEmbed(0xFF0000, 'Withdraw Error', 'Please specify a valid amount to withdraw!');
            return message.reply({ embeds: [embed] });
        }
        
        const numAmount = parseInt(amount);
        const bank = await economy.get(`${userId}.bank`);
        
        if (numAmount > bank) {
            const embed = getEmbed(0xFF0000, 'Withdraw Error', `You don't have enough money in your bank!`);
            return message.reply({ embeds: [embed] });
        }
        
        await economy.sub(`${userId}.bank`, numAmount);
        await economy.add(`${userId}.wallet`, numAmount);
        
        const embed = getEmbed(0x00FF00, 'Withdraw Successful', 
            `You withdrew ${formatMoney(numAmount)} from your bank!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Pay command
    if (command === 'pay') {
        const target = message.mentions.users.first();
        if (!target) {
            const embed = getEmbed(0xFF0000, 'Pay Error', 'Please mention a user to pay!');
            return message.reply({ embeds: [embed] });
        }
        
        const amount = args[1];
        if (!amount || isNaN(amount)) {
            const embed = getEmbed(0xFF0000, 'Pay Error', 'Please specify a valid amount to pay!');
            return message.reply({ embeds: [embed] });
        }
        
        const numAmount = parseInt(amount);
        const wallet = await economy.get(`${userId}.wallet`);
        
        if (numAmount > wallet) {
            const embed = getEmbed(0xFF0000, 'Pay Error', `You don't have enough money in your wallet!`);
            return message.reply({ embeds: [embed] });
        }
        
        if (numAmount <= 0) {
            const embed = getEmbed(0xFF0000, 'Pay Error', 'You must pay a positive amount!');
            return message.reply({ embeds: [embed] });
        }
        
        await economy.sub(`${userId}.wallet`, numAmount);
        await economy.add(`${target.id}.wallet`, numAmount);
        
        const embed = getEmbed(0x00FF00, 'Payment Sent', 
            `You paid ${target.username} ${formatMoney(numAmount)}!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Rob command
    if (command === 'rob') {
        const cooldown = 2 * 60 * 60 * 1000; // 2 hours
        const remaining = checkCooldown(userId, 'rob', cooldown);
        
        if (remaining > 0) {
            const embed = getEmbed(0xFF0000, 'Robbery Cooldown', 
                `You need to lay low! Come back in ${Math.floor(remaining / 3600)} hours.`);
            return message.reply({ embeds: [embed] });
        }
        
        const target = message.mentions.users.first();
        if (!target) {
            const embed = getEmbed(0xFF0000, 'Rob Error', 'Please mention a user to rob!');
            return message.reply({ embeds: [embed] });
        }
        
        if (target.id === userId) {
            const embed = getEmbed(0xFF0000, 'Rob Error', 'You can\'t rob yourself!');
            return message.reply({ embeds: [embed] });
        }
        
        // Check if target has shield
        const targetInventory = await economy.get(`${target.id}.inventory`);
        if (targetInventory.includes('Shield')) {
            const embed = getEmbed(0xFF0000, 'Robbery Failed', 
                `${target.username} is protected by a shield!`);
            return message.reply({ embeds: [embed] });
        }
        
        const targetWallet = await economy.get(`${target.id}.wallet`);
        if (targetWallet < 100) {
            const embed = getEmbed(0xFF0000, 'Robbery Failed', 
                `${target.username} doesn't have enough money to rob!`);
            return message.reply({ embeds: [embed] });
        }
        
        const success = Math.random() > 0.4; // 60% chance
        if (!success) {
            // Fine for failed robbery
            const fine = Math.floor(targetWallet * 0.1);
            await economy.sub(`${userId}.wallet`, fine);
            await economy.add(`${target.id}.wallet`, fine);
            
            const embed = getEmbed(0xFF0000, 'Robbery Failed', 
                `You got caught and had to pay ${target.username} ${formatMoney(fine)} as compensation!`);
            return message.reply({ embeds: [embed] });
        }
        
        // Successful robbery
        const stolenAmount = Math.floor(targetWallet * (0.1 + Math.random() * 0.2)); // 10-30%
        await economy.sub(`${target.id}.wallet`, stolenAmount);
        await economy.add(`${userId}.wallet`, stolenAmount);
        
        const embed = getEmbed(0x00FF00, 'Robbery Successful!', 
            `You stole ${formatMoney(stolenAmount)} from ${target.username}!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Coinflip command
    if (command === 'coinflip' || command === 'cf') {
        const choice = args[0]?.toLowerCase();
        if (!choice || !['heads', 'tails'].includes(choice)) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', 'Please specify "heads" or "tails"!');
            return message.reply({ embeds: [embed] });
        }
        
        const amount = args[1];
        if (!amount || isNaN(amount)) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', 'Please specify a valid amount to bet!');
            return message.reply({ embeds: [embed] });
        }
        
        const numAmount = parseInt(amount);
        const wallet = await economy.get(`${userId}.wallet`);
        
        if (numAmount > wallet) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', `You don't have enough money in your wallet!`);
            return message.reply({ embeds: [embed] });
        }
        
        if (numAmount <= 0) {
            const embed = getEmbed(0xFF0000, 'Coinflip Error', 'You must bet a positive amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const result = Math.random() > 0.5 ? 'heads' : 'tails';
        const win = result === choice;
        
        if (win) {
            await economy.add(`${userId}.wallet`, numAmount);
            const embed = getEmbed(0x00FF00, 'Coinflip Win!', 
                `It was ${result}! You won ${formatMoney(numAmount)}!`);
            message.reply({ embeds: [embed] });
        } else {
            await economy.sub(`${userId}.wallet`, numAmount);
            const embed = getEmbed(0xFF0000, 'Coinflip Loss', 
                `It was ${result}! You lost ${formatMoney(numAmount)}.`);
            message.reply({ embeds: [embed] });
        }
    }
    
    // Gamble command
    if (command === 'gamble') {
        const amount = args[0];
        if (!amount || isNaN(amount)) {
            const embed = getEmbed(0xFF0000, 'Gamble Error', 'Please specify a valid amount to gamble!');
            return message.reply({ embeds: [embed] });
        }
        
        const numAmount = parseInt(amount);
        const wallet = await economy.get(`${userId}.wallet`);
        
        if (numAmount > wallet) {
            const embed = getEmbed(0xFF0000, 'Gamble Error', `You don't have enough money in your wallet!`);
            return message.reply({ embeds: [embed] });
        }
        
        if (numAmount <= 0) {
            const embed = getEmbed(0xFF0000, 'Gamble Error', 'You must gamble a positive amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const win = Math.random() > 0.5; // 50% chance
        
        if (win) {
            const winnings = numAmount * 2;
            await economy.add(`${userId}.wallet`, winnings);
            const embed = getEmbed(0x00FF00, 'Gamble Win!', 
                `You won ${formatMoney(winnings)}! Double or nothing?`);
            message.reply({ embeds: [embed] });
        } else {
            await economy.sub(`${userId}.wallet`, numAmount);
            const embed = getEmbed(0xFF0000, 'Gamble Loss', 
                `You lost ${formatMoney(numAmount)}. Better luck next time!`);
            message.reply({ embeds: [embed] });
        }
    }
    
    // Slots command
    if (command === 'slots') {
        const amount = args[0] || '0';
        if (isNaN(amount)) {
            const embed = getEmbed(0xFF0000, 'Slots Error', 'Please specify a valid amount to bet!');
            return message.reply({ embeds: [embed] });
        }
        
        const numAmount = parseInt(amount);
        const wallet = await economy.get(`${userId}.wallet`);
        
        if (numAmount > wallet) {
            const embed = getEmbed(0xFF0000, 'Slots Error', `You don't have enough money in your wallet!`);
            return message.reply({ embeds: [embed] });
        }
        
        if (numAmount < 0) {
            const embed = getEmbed(0xFF0000, 'Slots Error', 'You must bet a positive amount!');
            return message.reply({ embeds: [embed] });
        }
        
        const symbols = ['🍎', '🍊', '🍇', '🍒', '🍋', '💰', '7️⃣'];
        const slots = [
            symbols[randomInt(0, symbols.length - 1)],
            symbols[randomInt(0, symbols.length - 1)],
            symbols[randomInt(0, symbols.length - 1)]
        ];
        
        let result;
        if (slots[0] === slots[1] && slots[1] === slots[2]) {
            // Jackpot - all three match
            const winnings = numAmount * 5;
            await economy.add(`${userId}.wallet`, winnings);
            result = `JACKPOT! You won ${formatMoney(winnings)}!`;
        } else if (slots[0] === slots[1] || slots[1] === slots[2] || slots[0] === slots[2]) {
            // Two match
            const winnings = numAmount * 2;
            await economy.add(`${userId}.wallet`, winnings);
            result = `Two match! You won ${formatMoney(winnings)}!`;
        } else if (numAmount > 0) {
            // Lose only if they bet something
            await economy.sub(`${userId}.wallet`, numAmount);
            result = `You lost ${formatMoney(numAmount)}. Try again!`;
        } else {
            result = 'Play for free or bet some coins to win big!';
        }
        
        const embed = getEmbed(0x800080, 'Slot Machine', 
            `[ ${slots.join(' | ')} ]\n\n${result}`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Shop command
    if (command === 'shop') {
        const shopItems = await shop.get('items');
        const shopList = shopItems.map(item => 
            `**${item.name}** - ${formatMoney(item.price)}\n${item.description}`).join('\n\n');
        
        const embed = getEmbed(0xFFFF00, 'Shop', shopList);
        message.reply({ embeds: [embed] });
    }
    
    // Buy command
    if (command === 'buy') {
        const itemName = args.join(' ');
        if (!itemName) {
            const embed = getEmbed(0xFF0000, 'Buy Error', 'Please specify an item to buy!');
            return message.reply({ embeds: [embed] });
        }
        
        const shopItems = await shop.get('items');
        const item = shopItems.find(i => i.name.toLowerCase() === itemName.toLowerCase());
        
        if (!item) {
            const embed = getEmbed(0xFF0000, 'Buy Error', 'That item doesn\'t exist in the shop!');
            return message.reply({ embeds: [embed] });
        }
        
        const wallet = await economy.get(`${userId}.wallet`);
        if (wallet < item.price) {
            const embed = getEmbed(0xFF0000, 'Buy Error', `You don't have enough money to buy ${item.name}!`);
            return message.reply({ embeds: [embed] });
        }
        
        await economy.sub(`${userId}.wallet`, item.price);
        await economy.push(`${userId}.inventory`, item.name);
        
        const embed = getEmbed(0x00FF00, 'Purchase Successful', 
            `You bought **${item.name}** for ${formatMoney(item.price)}!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // Inventory command
    if (command === 'inventory' || command === 'inv') {
        const inventory = await economy.get(`${userId}.inventory`);
        
        if (!inventory || inventory.length === 0) {
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
        const allUsers = await economy.all();
        const usersWithBalances = [];
        
        for (const user of allUsers) {
            if (user.id.includes('.wallet')) {
                const userId = user.id.split('.')[0];
                const wallet = user.data;
                const bank = await economy.get(`${userId}.bank`) || 0;
                usersWithBalances.push({
                    id: userId,
                    netWorth: wallet + bank
                });
            }
        }
        
        usersWithBalances.sort((a, b) => b.netWorth - a.netWorth);
        const top10 = usersWithBalances.slice(0, 10);
        
        let leaderboardText = '';
        for (let i = 0; i < top10.length; i++) {
            try {
                const user = await client.users.fetch(top10[i].id);
                leaderboardText += `**${i + 1}.** ${user.username} - ${formatMoney(top10[i].netWorth)}\n`;
            } catch (err) {
                console.error(`Couldn't fetch user ${top10[i].id}`);
            }
        }
        
        const embed = getEmbed(0xFFD700, 'Top 10 Richest Players', leaderboardText || 'No users found');
        message.reply({ embeds: [embed] });
    }
    
    // Admin commands
    if (command === 'additem' && message.member.permissions.has('ADMINISTRATOR')) {
        const itemName = args.slice(0, -1).join(' ');
        const price = parseInt(args[args.length - 1]);
        
        if (!itemName || isNaN(price)) {
            const embed = getEmbed(0xFF0000, 'Add Item Error', 'Usage: !additem <name> <price>');
            return message.reply({ embeds: [embed] });
        }
        
        const shopItems = await shop.get('items');
        shopItems.push({
            name: itemName,
            price: price,
            description: 'No description provided'
        });
        
        await shop.set('items', shopItems);
        
        const embed = getEmbed(0x00FF00, 'Item Added', 
            `Added **${itemName}** to the shop for ${formatMoney(price)}!`);
        
        message.reply({ embeds: [embed] });
    }
    
    // More commands can be added here following the same pattern
});

// Initialize and start bot
async function startBot() {
    await initDatabase();
    await client.login(process.env.DISCORD_TOKEN);
    console.log(`Logged in as ${client.user.tag}`);
}

startBot();