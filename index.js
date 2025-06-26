require('dotenv').config();
const { 
  Client, 
  GatewayIntentBits, 
  EmbedBuilder, 
  ActionRowBuilder, 
  ButtonBuilder, 
  ButtonStyle,
  StringSelectMenuBuilder,
  AttachmentBuilder,
  ChannelType,
  PermissionsBitField
} = require('discord.js');

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ]
});

// Data Storage
const guildData = new Map();

// Initialize Guild Data
const initGuildData = (guildId) => {
  if (!guildData.has(guildId)) {
    guildData.set(guildId, {
      tickets: {
        message: "",
        options: [],
        supportRole: null,
        category: null
      },
      applications: {
        questions: [],
        options: {},
        logChannel: null,
        cooldowns: new Map()
      },
      games: {
        guessNumber: Math.floor(Math.random() * 100) + 1
      }
    });
  }
  return guildData.get(guildId);
};

// Trivia Questions
const triviaQuestions = [
  { question: "What is the capital of France?", answer: "paris", difficulty: "Easy" },
  { question: "How many continents are there?", answer: "7", difficulty: "Easy" },
  { question: "What is the largest planet in our solar system?", answer: "jupiter", difficulty: "Medium" },
  { question: "Which language is used for web development?", answer: "javascript", difficulty: "Medium" },
  { question: "What is 2+2*2?", answer: "6", difficulty: "Easy" }
];

// Scramble Words
const scrambleWords = ["apple", "banana", "orange", "grapes", "watermelon"];

// Helper Functions
const createEmbed = (title, description, color = "#5865F2") => {
  return new EmbedBuilder()
    .setTitle(title)
    .setDescription(description)
    .setColor(color)
    .setTimestamp();
};

const scrambleWord = (word) => {
  return word.split('').sort(() => 0.5 - Math.random()).join('');
};

client.on('ready', () => {
  console.log(`✅ Bot is online as ${client.user.tag}`);
});

client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.guild) return;

  const { content, guild, channel, author } = message;
  const args = content.trim().split(/ +/);
  const command = args.shift().toLowerCase();
  const data = initGuildData(guild.id);

  // Help Command
  if (command === "!help") {
    const embed = createEmbed(
      "🤖 Bot Commands Help",
      `
      **🎟️ Ticket System**
      \`!ticket <message>\` - Set ticket panel message
      \`!addoption <emoji> <name>\` - Add ticket option
      \`!setsupport @role\` - Set support role
      \`!setcategory #channel\` - Set ticket category
      \`!deploypanel\` - Create ticket panel

      **📝 Applications**
      \`!addquestion <text>\` - Add application question
      \`!setappoptions name|cooldown,...\` - Configure applications
      \`!setlogchannel #channel\` - Set application logs
      \`!deployapp\` - Create application menu

      **🎮 Games**
      \`!guess <number>\` - Guess a number (1-100)
      \`!trivia\` - Answer a trivia question
      \`!scramble\` - Unscramble the word
      \`!rps <choice>\` - Rock Paper Scissors
      `
    ).setFooter({ text: "Made with ❤️ by yuvrajsingh0321" });

    return channel.send({ embeds: [embed] });
  }

  // Ticket System
  if (command === "!ticket" && args.length) {
    data.tickets.message = args.join(" ");
    return channel.send(createEmbed("✅ Success", "Ticket message set!", "#57F287"));
  }

  if (command === "!addoption" && args.length >= 2) {
    data.tickets.options.push({
      emoji: args[0],
      label: args.slice(1).join(" ")
    });
    return channel.send(createEmbed("✅ Success", "Ticket option added!", "#57F287"));
  }

  if (command === "!setsupport" && message.mentions.roles.first()) {
    data.tickets.supportRole = message.mentions.roles.first().id;
    return channel.send(createEmbed("✅ Success", "Support role set!", "#57F287"));
  }

  if (command === "!setcategory" && message.mentions.channels.first()) {
    const targetChannel = message.mentions.channels.first();
    if (targetChannel.parent) {
      data.tickets.category = targetChannel.parentId;
      return channel.send(createEmbed("✅ Success", `Ticket category set to ${targetChannel.parent.name}`, "#57F287"));
    }
    return channel.send(createEmbed("❌ Error", "Channel must be in a category", "#ED4245"));
  }

  if (command === "!deploypanel") {
    if (!data.tickets.options.length) {
      return channel.send(createEmbed("❌ Error", "Add options first with !addoption", "#ED4245"));
    }

    const embed = createEmbed("🎟️ Create Ticket", data.tickets.message || "Select a ticket type below");
    const menu = new StringSelectMenuBuilder()
      .setCustomId("create_ticket")
      .setPlaceholder("Select ticket type")
      .addOptions(data.tickets.options.map((opt, i) => ({
        label: opt.label,
        value: `ticket_${i}`,
        emoji: opt.emoji
      })));

    const row = new ActionRowBuilder().addComponents(menu);
    return channel.send({ embeds: [embed], components: [row] });
  }

  // Application System
  if (command === "!addquestion" && args.length) {
    data.applications.questions.push(args.join(" "));
    return channel.send(createEmbed("✅ Success", "Question added to application!", "#57F287"));
  }

  if (command === "!setappoptions" && args.length) {
    data.applications.options = {};
    args.join(" ").split(",").forEach(option => {
      const [name, cooldown] = option.split("|").map(x => x.trim());
      data.applications.options[name] = parseInt(cooldown) || 0;
    });
    return channel.send(createEmbed("✅ Success", "Application options configured!", "#57F287"));
  }

  if (command === "!setlogchannel" && message.mentions.channels.first()) {
    data.applications.logChannel = message.mentions.channels.first().id;
    return channel.send(createEmbed("✅ Success", "Log channel set for applications!", "#57F287"));
  }

  if (command === "!deployapp") {
    if (!data.applications.questions.length) {
      return channel.send(createEmbed("❌ Error", "Add questions first with !addquestion", "#ED4245"));
    }

    const embed = createEmbed("📝 Application", "Click a button to start your application");
    const row = new ActionRowBuilder();
    
    Object.keys(data.applications.options).forEach(option => {
      row.addComponents(
        new ButtonBuilder()
          .setCustomId(`app_${option}`)
          .setLabel(option)
          .setStyle(ButtonStyle.Primary)
      );
    });

    return channel.send({ embeds: [embed], components: [row] });
  }

  // Games
  if (command === "!guess" && args[0]) {
    const guess = parseInt(args[0]);
    if (isNaN(guess)) return channel.send(createEmbed("❌ Error", "Please enter a valid number", "#ED4245"));

    if (guess === data.games.guessNumber) {
      data.games.guessNumber = Math.floor(Math.random() * 100) + 1;
      return channel.send(createEmbed("🎉 Correct!", `The number was ${guess}`, "#57F287"));
    }
    
    const hint = guess < data.games.guessNumber ? "🔼 Too low!" : "🔽 Too high!";
    return channel.send(createEmbed(hint, "Try guessing again!"));
  }

  if (command === "!trivia") {
    const question = triviaQuestions[Math.floor(Math.random() * triviaQuestions.length)];
    const embed = createEmbed(
      "🧠 Trivia Question", 
      `${question.question}\n\n*Difficulty: ${question.difficulty}*`
    );
    
    const state = {
      type: "trivia",
      answer: question.answer,
      timestamp: Date.now()
    };
    
    guildData.get(guild.id).currentGame = state;
    return channel.send({ embeds: [embed] });
  }

  if (command === "!scramble") {
    const word = scrambleWords[Math.floor(Math.random() * scrambleWords.length)];
    const scrambled = scrambleWord(word);
    
    const state = {
      type: "scramble",
      answer: word,
      timestamp: Date.now()
    };
    
    guildData.get(guild.id).currentGame = state;
    return channel.send(createEmbed("🔤 Word Scramble", `Unscramble this word: **${scrambled}**`));
  }

  if (command === "!rps" && ["rock", "paper", "scissors"].includes(args[0]?.toLowerCase())) {
    const choices = ["rock", "paper", "scissors"];
    const botChoice = choices[Math.floor(Math.random() * choices.length)];
    const playerChoice = args[0].toLowerCase();
    
    let result;
    if (playerChoice === botChoice) {
      result = "It's a tie!";
    } else if (
      (playerChoice === "rock" && botChoice === "scissors") ||
      (playerChoice === "paper" && botChoice === "rock") ||
      (playerChoice === "scissors" && botChoice === "paper")
    ) {
      result = "You win!";
    } else {
      result = "I win!";
    }
    
    return channel.send(createEmbed(
      "🪨 📄 ✂️ Rock Paper Scissors",
      `You chose **${playerChoice}**\nI chose **${botChoice}**\n\n**Result:** ${result}`
    ));
  }

  // Game Answer Handling
  if (guildData.get(guild.id)?.currentGame) {
    const game = guildData.get(guild.id).currentGame;
    
    // Trivia Answer
    if (game.type === "trivia" && Date.now() - game.timestamp < 30000) {
      if (content.toLowerCase() === game.answer) {
        guildData.get(guild.id).currentGame = null;
        return channel.send(createEmbed("✅ Correct!", `The answer was **${game.answer}**`, "#57F287"));
      }
    }
    
    // Scramble Answer
    if (game.type === "scramble" && Date.now() - game.timestamp < 30000) {
      if (content.toLowerCase() === game.answer) {
        guildData.get(guild.id).currentGame = null;
        return channel.send(createEmbed("✅ Correct!", `The word was **${game.answer}**`, "#57F287"));
      }
    }
  }
});

// Interactions
client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) return;
  const data = initGuildData(interaction.guild.id);

  // Ticket Creation
  if (interaction.isStringSelectMenu() && interaction.customId === "create_ticket") {
    const optionIndex = parseInt(interaction.values[0].split("_")[1]);
    const option = data.tickets.options[optionIndex];
    
    if (!option || !data.tickets.supportRole || !data.tickets.category) {
      return interaction.reply({ 
        content: "❌ Ticket system not configured properly", 
        ephemeral: true 
      });
    }

    const ticketName = `ticket-${interaction.user.username.toLowerCase().slice(0, 10)}-${Date.now().toString().slice(-4)}`;
    
    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: data.tickets.category,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] },
          { id: data.tickets.supportRole, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      const embed = createEmbed(
        `🎟️ ${option.label} Ticket`,
        `**Created by:** ${interaction.user}\n\nPlease describe your issue below.`
      );

      const closeButton = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId("close_ticket")
          .setLabel("Close Ticket")
          .setStyle(ButtonStyle.Danger)
      );

      await ticketChannel.send({ 
        content: `${interaction.user} <@&${data.tickets.supportRole}>`, 
        embeds: [embed], 
        components: [closeButton] 
      });

      return interaction.reply({ 
        content: `✅ Ticket created: <#${ticketChannel.id}>`, 
        ephemeral: true 
      });
    } catch (error) {
      console.error(error);
      return interaction.reply({ 
        content: "❌ Failed to create ticket", 
        ephemeral: true 
      });
    }
  }

  // Close Ticket
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    if (!interaction.channel.name.startsWith("ticket-")) return;
    
    try {
      await interaction.deferUpdate();
      
      // Create transcript
      const messages = await interaction.channel.messages.fetch({ limit: 100 });
      const transcript = messages.reverse().map(msg => {
        return `${msg.author.tag} [${msg.createdAt.toLocaleString()}]: ${msg.content}`;
      }).join('\n');
      
      // Send to user
      const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'transcript.txt' });
      await interaction.user.send({ 
        content: "Here's your ticket transcript:", 
        files: [file] 
      }).catch(() => {});
      
      // Delete channel
      await interaction.channel.delete();
    } catch (error) {
      console.error("Error closing ticket:", error);
    }
  }

  // Application Start
  if (interaction.isButton() && interaction.customId.startsWith("app_")) {
    const appType = interaction.customId.slice(4);
    const appData = data.applications;
    
    // Check cooldown
    if (appData.cooldowns.has(appType) && appData.cooldowns.get(appType).has(interaction.user.id)) {
      const remaining = (appData.cooldowns.get(appType).get(interaction.user.id) - Date.now()) / 1000;
      if (remaining > 0) {
        return interaction.reply({
          content: `⏳ You're on cooldown! Try again in ${Math.ceil(remaining)} seconds.`,
          ephemeral: true
        });
      }
    }
    
    try {
      // Start DM application
      const dmChannel = await interaction.user.createDM();
      
      await interaction.reply({ 
        content: "Check your DMs to continue the application!", 
        ephemeral: true 
      });
      
      // Send welcome message
      await dmChannel.send(createEmbed(
        `📝 ${appType} Application`,
        `You have **5 minutes** per question.\nType "cancel" at any time to quit.\n\n**Total Questions:** ${appData.questions.length}`
      ));
      
      // Process questions
      const responses = [];
      for (const question of appData.questions) {
        await dmChannel.send(createEmbed("Question", question));
        
        try {
          const collected = await dmChannel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 300000
          });
          
          const response = collected.first().content;
          if (response.toLowerCase() === "cancel") {
            return dmChannel.send(createEmbed("❌ Cancelled", "Application cancelled."));
          }
          responses.push(response);
        } catch {
          return dmChannel.send(createEmbed("⏰ Timeout", "Application cancelled due to inactivity."));
        }
      }
      
      // Application complete
      await dmChannel.send(createEmbed(
        "✅ Application Submitted",
        "Thank you for applying! Your responses have been recorded."
      ));
      
      // Set cooldown
      const cooldown = appData.options[appType] || 0;
      if (cooldown > 0) {
        if (!appData.cooldowns.has(appType)) {
          appData.cooldowns.set(appType, new Map());
        }
        appData.cooldowns.get(appType).set(interaction.user.id, Date.now() + cooldown * 1000);
      }
      
      // Log to channel
      if (appData.logChannel) {
        const logChannel = await client.channels.fetch(appData.logChannel);
        if (logChannel) {
          const logEmbed = createEmbed(
            `📄 New ${appType} Application`,
            `**User:** ${interaction.user.tag}\n\n**Responses:**\n${
              appData.questions.map((q, i) => `**${i+1}.** ${q}\n> ${responses[i]}`).join('\n\n')
            }`
          );
          await logChannel.send({ embeds: [logEmbed] });
        }
      }
    } catch (error) {
      console.error("Application error:", error);
      await interaction.followUp({ 
        content: "❌ Couldn't start application. Please enable DMs!", 
        ephemeral: true 
      });
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
