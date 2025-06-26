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

const initGuildData = (guildId) => {
  if (!guildData.has(guildId)) {
    guildData.set(guildId, {
      // Ticket System
      tickets: {
        panelMessage: "",
        options: [],
        supportRoleId: null,
        categoryId: null,
        activeTickets: new Map()
      },
      
      // Application System
      applications: {
        questions: [],
        options: {},
        logChannelId: null,
        cooldowns: new Map(),
        activeApps: new Set()
      },
      
      // Games
      games: {
        currentGuess: Math.floor(Math.random() * 100) + 1,
        triviaQuestions: [
          { question: "What is the capital of France?", answer: "paris", difficulty: "Easy" },
          { question: "Which planet is known as the Red Planet?", answer: "mars", difficulty: "Easy" },
          { question: "What is 2+2*2?", answer: "6", difficulty: "Medium" },
          { question: "What is the largest mammal?", answer: "blue whale", difficulty: "Easy" },
          { question: "How many continents are there?", answer: "7", difficulty: "Easy" },
          { question: "What is the main ingredient in guacamole?", answer: "avocado", difficulty: "Easy" },
          { question: "Which language is used for web development?", answer: "javascript", difficulty: "Medium" }
        ],
        scrambleWords: ["banana", "elephant", "javascript", "discord", "developer", "pineapple", "watermelon"]
      },
      
      // User States
      userStates: new Map()
    });
  }
  return guildData.get(guildId);
};

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

// Command Handler
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
      **🎟️ TICKET SYSTEM**
      \`!ticket <message>\` - Set ticket panel message
      \`!addoption <emoji> <name>\` - Add ticket option
      \`!setsupport @role\` - Set support role
      \`!setcategory #channel\` - Set ticket category
      \`!deploypanel\` - Create ticket panel

      **📝 APPLICATIONS**
      \`!addquestion <text>\` - Add application question
      \`!setoptions name|cooldown,...\` - Configure applications
      \`!setlogchannel #channel\` - Set application logs
      \`!deployapp\` - Create application menu

      **🎮 GAMES**
      \`!guess <number>\` - Guess a number (1-100)
      \`!trivia\` - Answer a trivia question
      \`!scramble\` - Unscramble the word
      \`!rps <choice>\` - Rock Paper Scissors
      `
    ).setFooter({ text: "Made with ❤️ by yuvrajsingh0321" });

    return channel.send({ embeds: [embed] });
  }

  // Ticket System Commands
  if (command === "!ticket" && args.length) {
    data.tickets.panelMessage = args.join(" ");
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
    data.tickets.supportRoleId = message.mentions.roles.first().id;
    return channel.send(createEmbed("✅ Success", "Support role set!", "#57F287"));
  }

  if (command === "!setcategory" && message.mentions.channels.first()) {
    const targetChannel = message.mentions.channels.first();
    if (targetChannel.parent) {
      data.tickets.categoryId = targetChannel.parentId;
      return channel.send(createEmbed("✅ Success", `Ticket category set to ${targetChannel.parent.name}`, "#57F287"));
    }
    return channel.send(createEmbed("❌ Error", "Channel must be in a category", "#ED4245"));
  }

  if (command === "!deploypanel") {
    if (!data.tickets.options.length) {
      return channel.send(createEmbed("❌ Error", "Add options first with !addoption", "#ED4245"));
    }

    const embed = createEmbed("🎟️ Create Ticket", data.tickets.panelMessage || "Select a ticket type below");
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

  // Application System Commands
  if (command === "!addquestion" && args.length) {
    data.applications.questions.push(args.join(" "));
    return channel.send(createEmbed("✅ Success", "Question added to application!", "#57F287"));
  }

  if (command === "!setoptions" && args.length) {
    data.applications.options = {};
    args.join(" ").split(",").forEach(option => {
      const [name, cooldown] = option.split("|").map(x => x.trim());
      data.applications.options[name] = parseInt(cooldown) || 0;
    });
    return channel.send(createEmbed("✅ Success", "Application options configured!", "#57F287"));
  }

  if (command === "!setlogchannel" && message.mentions.channels.first()) {
    data.applications.logChannelId = message.mentions.channels.first().id;
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

  // Game Commands
  if (command === "!guess" && args[0]) {
    const guess = parseInt(args[0]);
    if (isNaN(guess)) {
      return channel.send(createEmbed("❌ Error", "Please enter a valid number", "#ED4245"));
    }

    if (guess === data.games.currentGuess) {
      data.games.currentGuess = Math.floor(Math.random() * 100) + 1;
      return channel.send(createEmbed("🎉 Correct!", `The number was ${guess}!`, "#57F287"));
    }
    
    const hint = guess < data.games.currentGuess ? "🔼 Too low!" : "🔽 Too high!";
    return channel.send(createEmbed(hint, "Try guessing again!"));
  }

  if (command === "!trivia") {
    const question = data.games.triviaQuestions[
      Math.floor(Math.random() * data.games.triviaQuestions.length)
    ];
    const embed = createEmbed(
      "🧠 Trivia Question", 
      `${question.question}\n\n*Difficulty: ${question.difficulty}*`
    );
    
    if (!data.userStates.has(author.id)) data.userStates.set(author.id, {});
    data.userStates.get(author.id).trivia = question.answer;
    
    return channel.send({ embeds: [embed] });
  }

  if (command === "!scramble") {
    const word = data.games.scrambleWords[
      Math.floor(Math.random() * data.games.scrambleWords.length)
    ];
    const scrambled = scrambleWord(word);
    
    if (!data.userStates.has(author.id)) data.userStates.set(author.id, {});
    data.userStates.get(author.id).scramble = word;
    
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

  // Handle Game Answers
  if (data.userStates.has(author.id)) {
    const userState = data.userStates.get(author.id);
    
    // Trivia Answer
    if (userState.trivia && content.toLowerCase() === userState.trivia) {
      data.userStates.delete(author.id);
      return channel.send(createEmbed("✅ Correct!", `The answer was **${userState.trivia}**`, "#57F287"));
    }
    
    // Scramble Answer
    if (userState.scramble && content.toLowerCase() === userState.scramble) {
      data.userStates.delete(author.id);
      return channel.send(createEmbed("✅ Correct!", `The word was **${userState.scramble}**`, "#57F287"));
    }
  }
});

// Interaction Handling
client.on('interactionCreate', async (interaction) => {
  if (!interaction.guild) return;
  const data = initGuildData(interaction.guild.id);

  // Ticket Creation
  if (interaction.isStringSelectMenu() && interaction.customId === "create_ticket") {
    const optionIndex = parseInt(interaction.values[0].split("_")[1]);
    const option = data.tickets.options[optionIndex];
    
    if (!option || !data.tickets.supportRoleId || !data.tickets.categoryId) {
      return interaction.reply({ 
        content: "❌ Ticket system not configured properly", 
        ephemeral: true 
      });
    }

    // Check for existing ticket
    if (data.tickets.activeTickets.has(interaction.user.id)) {
      const existingTicket = await interaction.guild.channels.fetch(
        data.tickets.activeTickets.get(interaction.user.id)
      ).catch(() => null);
      
      if (existingTicket) {
        return interaction.reply({ 
          content: `❌ You already have an open ticket: ${existingTicket}`, 
          ephemeral: true 
        });
      }
    }

    try {
      const ticketChannel = await interaction.guild.channels.create({
        name: `ticket-${interaction.user.username.toLowerCase().slice(0, 10)}-${Date.now().toString().slice(-4)}`,
        type: ChannelType.GuildText,
        parent: data.tickets.categoryId,
        permissionOverwrites: [
          { id: interaction.guild.id, deny: [PermissionsBitField.Flags.ViewChannel] },
          { id: interaction.user.id, allow: [PermissionsBitField.Flags.ViewChannel] },
          { id: data.tickets.supportRoleId, allow: [PermissionsBitField.Flags.ViewChannel] }
        ]
      });

      data.tickets.activeTickets.set(interaction.user.id, ticketChannel.id);

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
        content: `${interaction.user} <@&${data.tickets.supportRoleId}>`, 
        embeds: [embed], 
        components: [closeButton] 
      });

      return interaction.reply({ 
        content: `✅ Ticket created: ${ticketChannel}`, 
        ephemeral: true 
      });
    } catch (error) {
      console.error("Ticket creation error:", error);
      return interaction.reply({ 
        content: "❌ Failed to create ticket", 
        ephemeral: true 
      });
    }
  }

  // Ticket Closing
  if (interaction.isButton() && interaction.customId === "close_ticket") {
    if (!interaction.channel.name.startsWith("ticket-")) return;
    
    try {
      await interaction.deferUpdate();
      
      // Create transcript
      const transcript = await interaction.channel.messages.fetch()
        .then(messages => {
          return messages.reverse().map(msg => {
            return `[${msg.createdAt.toLocaleString()}] ${msg.author.tag}: ${msg.content}`;
          }).join('\n');
        });
      
      // Send to user
      const file = new AttachmentBuilder(Buffer.from(transcript), { name: 'ticket_transcript.txt' });
      await interaction.user.send({ 
        content: "Here's your ticket transcript:", 
        files: [file] 
      }).catch(() => {});
      
      // Delete channel and clean up
      data.tickets.activeTickets.delete(interaction.user.id);
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
      const remaining = Math.ceil(
        (appData.cooldowns.get(appType).get(interaction.user.id) - Date.now()) / 1000
      );
      if (remaining > 0) {
        return interaction.reply({
          content: `⏳ You're on cooldown! Try again in ${remaining} seconds.`,
          ephemeral: true
        });
      }
    }
    
    // Check for active application
    if (appData.activeApps.has(interaction.user.id)) {
      return interaction.reply({
        content: "❌ You already have an active application",
        ephemeral: true
      });
    }
    
    try {
      // Start DM application
      const dmChannel = await interaction.user.createDM();
      appData.activeApps.add(interaction.user.id);
      
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
      for (const [index, question] of appData.questions.entries()) {
        await dmChannel.send(createEmbed(
          `Question ${index + 1}/${appData.questions.length}`,
          question
        ));
        
        try {
          const collected = await dmChannel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 300000
          });
          
          const response = collected.first().content;
          if (response.toLowerCase() === "cancel") {
            await dmChannel.send(createEmbed("❌ Cancelled", "Application cancelled."));
            return;
          }
          responses.push(response);
        } catch {
          await dmChannel.send(createEmbed("⏰ Timeout", "Application cancelled due to inactivity."));
          return;
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
      if (appData.logChannelId) {
        const logChannel = await client.channels.fetch(appData.logChannelId);
        if (logChannel) {
          const logEmbed = createEmbed(
            `📄 New ${appType} Application`,
            `**User:** ${interaction.user.tag}\n\n**Responses:**\n${
              appData.questions.map((q, i) => `**${i + 1}.** ${q}\n> ${responses[i]}`).join('\n\n')
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
    } finally {
      appData.activeApps.delete(interaction.user.id);
    }
  }
});

client.login(process.env.DISCORD_TOKEN);
