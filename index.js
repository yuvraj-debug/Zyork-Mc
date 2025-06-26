require('dotenv').config();
const express = require('express');
const {
  Client,
  GatewayIntentBits,
  Partials,
  EmbedBuilder,
  ActionRowBuilder,
  StringSelectMenuBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionsBitField,
  AttachmentBuilder,
  ChannelType
} = require('discord.js');

// Keep-alive server
const app = express();
app.get('/', (_, res) => res.send('Bot is alive!'));
app.listen(3000, () => console.log('✅ Keep-alive server running'));

// Discord client setup
const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.DirectMessages
  ],
  partials: [Partials.Channel]
});

// Enhanced Data Storage
const data = {
  tickets: new Map(),
  applications: new Map(),
  userStates: new Map(),
  gameData: {
    guessNumber: Math.floor(Math.random() * 100) + 1,
    scrambleWords: ['banana', 'elephant', 'discord', 'javascript', 'pirate'],
    triviaQuestions: [
      { 
        question: 'What is the capital of Japan?', 
        answer: 'tokyo',
        difficulty: '🌱 Easy'
      },
      { 
        question: 'How many colors are in a rainbow?', 
        answer: '7',
        difficulty: '🌱 Easy' 
      },
      { 
        question: 'What is the largest mammal on Earth?', 
        answer: 'blue whale',
        difficulty: '🌿 Medium' 
      },
      { 
        question: 'Which planet is closest to the Sun?', 
        answer: 'mercury',
        difficulty: '🌱 Easy' 
      },
      { 
        question: 'What is the chemical symbol for gold?', 
        answer: 'au',
        difficulty: '🌿 Medium' 
      },
      { 
        question: 'In which year did World War II end?', 
        answer: '1945',
        difficulty: '🌿 Medium' 
      },
      { 
        question: 'What is the main ingredient in guacamole?', 
        answer: 'avocado',
        difficulty: '🌱 Easy' 
      }
    ]
  }
};

// Utility Functions
const scramble = word => word.split('').sort(() => 0.5 - Math.random()).join('');

const getGuildData = (guildId, type) => {
  if (!data[type].has(guildId)) {
    data[type].set(guildId, type === 'tickets' ? {
      description: '',
      options: [],
      viewerRoleId: null,
      categoryId: null,
      footerImage: null
    } : {
      questions: [],
      options: {},
      channelId: null,
      cooldowns: new Map()
    });
  }
  return data[type].get(guildId);
};

// Enhanced UI Functions
const createApplicationEmbed = (user, question, progress, total) => {
  return new EmbedBuilder()
    .setTitle(`📝 Application Question (${progress}/${total})`)
    .setDescription(`**${question}**`)
    .setColor('#5865F2')
    .setFooter({ 
      text: `Requested by ${user.username}`, 
      iconURL: user.displayAvatarURL() 
    });
};

const createTriviaEmbed = (question, difficulty) => {
  return new EmbedBuilder()
    .setTitle('🧠 Trivia Time!')
    .setDescription(`**${question}**\n\n*Difficulty: ${difficulty}*`)
    .setColor('#ED4245')
    .setTimestamp();
};

client.once('ready', () => console.log(`🤖 Logged in as ${client.user.tag}`));

// Command Handler
client.on('messageCreate', async message => {
  if (message.author.bot || !message.guild) return;

  const { author, content, guild } = message;
  const uid = author.id;
  const raw = content.trim();
  const lc = raw.toLowerCase();

  if (!data.userStates.has(uid)) data.userStates.set(uid, {});
  const state = data.userStates.get(uid);

  // === HELP COMMAND (Enhanced UI) ===
  if (lc === '!help') {
    const embed = new EmbedBuilder()
      .setTitle('📘 Bot Command Help')
      .setColor('#5865F2')
      .setThumbnail(client.user.displayAvatarURL())
      .addFields(
        {
          name: '🎟️ Ticket System',
          value: [
            '`!ticket <message>` - Set panel message',
            '`!option <emoji> <label>` - Add ticket type',
            '`!ticketviewer @role` - Set support role',
            '`!ticketcategory #channel` - Set ticket category',
            '`!deployticketpanel` - Create ticket panel'
          ].join('\n'),
          inline: true
        },
        {
          name: '📝 Applications',
          value: [
            '`!addques <question>` - Add application question',
            '`!setoptions Option|Cooldown,...` - Configure options',
            '`!setchannel #channel` - Set log channel',
            '`!deployapp` - Create application panel',
            '`!resetapp` - Reset application data'
          ].join('\n'),
          inline: true
        },
        {
          name: '🎮 Mini-Games',
          value: [
            '`!guess <1-100>` - Number guessing game',
            '`!trivia` - Answer a random question',
            '`!scramble` - Unscramble the word',
            '`!rps <choice>` - Rock Paper Scissors'
          ].join('\n')
        }
      )
      .setFooter({ text: 'Bot developed with ❤️', iconURL: guild.iconURL() });

    return message.reply({ embeds: [embed] });
  }

  // === TRIVIA COMMAND (Enhanced) ===
  if (lc === '!trivia') {
    const randomQuestion = data.gameData.triviaQuestions[
      Math.floor(Math.random() * data.gameData.triviaQuestions.length)
    ];
    
    state.trivia = { 
      active: true, 
      answered: false, 
      answer: randomQuestion.answer 
    };

    const embed = createTriviaEmbed(randomQuestion.question, randomQuestion.difficulty);
    return message.reply({ embeds: [embed] });
  } else if (state.trivia?.active) {
    if (raw.toLowerCase() === state.trivia.answer) {
      const winEmbed = new EmbedBuilder()
        .setTitle('✅ Correct!')
        .setDescription(`The answer was **${state.trivia.answer}**`)
        .setColor('#57F287');
      message.reply({ embeds: [winEmbed] });
      state.trivia = null;
    } else if (!state.trivia.answered) {
      message.reply({ 
        content: '❌ Incorrect! Try again or type `cancel` to quit.',
        ephemeral: true 
      });
      state.trivia.answered = true;
    }
    return;
  }

  // === APPLICATION SYSTEM (Enhanced DM Flow) ===
  if (interaction.isButton() && interaction.customId.startsWith('app_')) {
    const app = getGuildData(interaction.guild.id, 'applications');
    const option = interaction.customId.slice(4);
    const userId = interaction.user.id;

    // Cooldown check (existing code...)

    try {
      await interaction.reply({
        embeds: [
          new EmbedBuilder()
            .setTitle('📨 Check Your DMs!')
            .setDescription('Your application has started in direct messages.')
            .setColor('#5865F2')
        ],
        ephemeral: true
      });

      const dmChannel = await interaction.user.createDM();
      
      // Send welcome embed
      await dmChannel.send({
        embeds: [
          new EmbedBuilder()
            .setTitle(`📝 ${option} Application`)
            .setDescription('Please answer the following questions.\nYou have **5 minutes** per question.')
            .addFields(
              { name: 'Total Questions', value: `${app.questions.length}`, inline: true },
              { name: 'Cooldown', value: `${app.options[option] || 0}s`, inline: true }
            )
            .setColor('#5865F2')
            .setFooter({ text: 'Type "cancel" to quit anytime' })
        ]
      });

      const responses = [];
      for (let i = 0; i < app.questions.length; i++) {
        const question = app.questions[i];
        
        // Send question with progress indicator
        await dmChannel.send({ 
          embeds: [createApplicationEmbed(interaction.user, question, i+1, app.questions.length)] 
        });

        try {
          const collected = await dmChannel.awaitMessages({
            filter: m => m.author.id === interaction.user.id,
            max: 1,
            time: 300000
          });
          
          if (collected.first().content.toLowerCase() === 'cancel') {
            await dmChannel.send('❌ Application cancelled.');
            return;
          }
          
          responses.push(collected.first().content);
        } catch {
          await dmChannel.send('⏰ Timeout! Application cancelled due to inactivity.');
          return;
        }
      }

      // On completion
      const completionEmbed = new EmbedBuilder()
        .setTitle('✅ Application Submitted!')
        .setDescription('Your responses have been recorded.')
        .setColor('#57F287')
        .setFooter({ text: 'Thank you for applying!' });
      
      await dmChannel.send({ embeds: [completionEmbed] });

      // Log to application channel (existing code...)
      
    } catch (error) {
      console.error(error);
      await interaction.followUp({
        embeds: [
          new EmbedBuilder()
            .setTitle('❌ Failed to Start Application')
            .setDescription('Please enable DMs from server members and try again.')
            .setColor('#ED4245')
        ],
        ephemeral: true
      });
    }
  }

  // ... (rest of your existing commands with enhanced UI)
});

// Interaction Handler (existing code with UI improvements)
client.on('interactionCreate', async interaction => {
  // ... (existing interaction handling with embeds)
});

process.on('unhandledRejection', err => console.error(err));
client.login(process.env.DISCORD_TOKEN);
