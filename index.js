const { Client, IntentsBitField, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, StringSelectMenuOptionBuilder, ChannelType, PermissionFlagsBits, Colors } = require('discord.js');
const http = require('http');
const fs = require('fs');
const path = require('path');
require('dotenv').config();

const client = new Client({
  intents: [
    IntentsBitField.Flags.Guilds,
    IntentsBitField.Flags.GuildMembers,
    IntentsBitField.Flags.GuildMessages,
    IntentsBitField.Flags.MessageContent,
    IntentsBitField.Flags.DirectMessages,
    IntentsBitField.Flags.GuildMessageReactions
  ]
});

// Ticket system configuration
const ticketConfig = {
  embedMessage: "Create a ticket for support",
  options: [],
  ticketRole: null,
  ticketCategory: null,
  openTickets: new Map(),
  ticketCount: 0
};

// Create HTTP server for Render
const server = http.createServer((req, res) => {
  res.writeHead(200);
  res.end('Discord bot is running');
});
server.listen(process.env.PORT || 3000);

// Helper function to create transcript
async function createTranscript(channel) {
  const messages = await channel.messages.fetch({ limit: 100 });
  let transcript = `<!DOCTYPE html><html><head><title>Ticket Transcript</title><style>body{font-family:Arial,sans-serif;line-height:1.6;margin:20px;background:#f5f5f5;color:#333}.message{margin-bottom:15px;padding:10px;background:#fff;border-radius:5px;box-shadow:0 1px 3px rgba(0,0,0,0.1)}.author{font-weight:bold;color:#7289da}.timestamp{color:#999;font-size:0.8em;margin-left:5px}.content{margin-top:5px}</style></head><body><h1>Ticket Transcript</h1>`;
  
  messages.reverse().forEach(msg => {
    transcript += `
      <div class="message">
        <span class="author">${msg.author.tag}</span>
        <span class="timestamp">${msg.createdAt.toLocaleString()}</span>
        <div class="content">${msg.content}</div>
      </div>
    `;
  });
  
  transcript += '</body></html>';
  return transcript;
}

// Ready event
client.on('ready', () => {
  console.log(`Logged in as ${client.user.tag}!`);
});

// Message Create event
client.on('messageCreate', async (message) => {
  if (message.author.bot || !message.content.startsWith('!')) return;

  const args = message.content.slice(1).trim().split(/ +/);
  const command = args.shift().toLowerCase();

  // !help command
  if (command === 'help') {
    const helpEmbed = new EmbedBuilder()
      .setTitle('Bot Commands')
      .setColor(Colors.Blue)
      .addFields(
        { name: 'Ticket System', value: 'Commands to manage the ticket system' },
        { name: '!ticket [message]', value: 'Set the embed message for ticket panel' },
        { name: '!option :emoji: [description]', value: 'Add an option to ticket dropdown menu' },
        { name: '!ticketrole @role', value: 'Set the ticket viewer role' },
        { name: '!ticketchannel #channel', value: 'Set the parent category for tickets' },
        { name: '!deployticket', value: 'Deploy the ticket panel' },
        { name: 'General', value: 'Other useful commands' },
        { name: '!msg [message]', value: 'Send a message to current channel' },
        { name: '!dm @role [message]', value: 'DM all members with the specified role' }
      )
      .setFooter({ text: 'Bot by Your Name' });
    
    return message.reply({ embeds: [helpEmbed] });
  }

  // !ticket command - Set embed message
  if (command === 'ticket') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    }
    ticketConfig.embedMessage = args.join(' ') || "Create a ticket for support";
    return message.reply({ content: `✅ Ticket panel message set to: ${ticketConfig.embedMessage}`, ephemeral: true });
  }

  // !option command - Add dropdown option
  else if (command === 'option') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    }
    const emoji = args.shift();
    const description = args.join(' ');
    
    if (!emoji || !description) {
      return message.reply({ content: "❌ Usage: !option :emoji: Description", ephemeral: true });
    }
    
    ticketConfig.options.push({ emoji, description });
    return message.reply({ content: `✅ Added option: ${emoji} - ${description}`, ephemeral: true });
  }

  // !ticketrole command - Set ticket viewer role
  else if (command === 'ticketrole') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    }
    const role = message.mentions.roles.first();
    
    if (!role) {
      return message.reply({ content: "❌ Please mention a role.", ephemeral: true });
    }
    
    ticketConfig.ticketRole = role.id;
    return message.reply({ content: `✅ Ticket viewer role set to: ${role.name}`, ephemeral: true });
  }

  // !ticketchannel command - Set ticket category
  else if (command === 'ticketchannel') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    }
    const channel = message.mentions.channels.first();
    
    if (!channel) {
      return message.reply({ content: "❌ Please mention a channel.", ephemeral: true });
    }
    
    ticketConfig.ticketCategory = channel.parentId;
    return message.reply({ content: `✅ Ticket category set to: ${channel.parent?.name || 'Unknown'}`, ephemeral: true });
  }

  // !deployticket command - Deploy ticket panel
  else if (command === 'deployticket') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    }
    
    if (ticketConfig.options.length === 0) {
      return message.reply({ content: "❌ Please add at least one option using !option command.", ephemeral: true });
    }
    
    const embed = new EmbedBuilder()
      .setTitle('Support Tickets')
      .setDescription(ticketConfig.embedMessage)
      .setColor(Colors.Blurple);
    
    const selectMenu = new StringSelectMenuBuilder()
      .setCustomId('ticket_reason')
      .setPlaceholder('Select a reason for your ticket')
      .addOptions(
        ticketConfig.options.map(option => 
          new StringSelectMenuOptionBuilder()
            .setLabel(option.description)
            .setValue(option.description)
            .setEmoji(option.emoji)
        )
      );
    
    const actionRow = new ActionRowBuilder().addComponents(selectMenu);
    
    await message.channel.send({ embeds: [embed], components: [actionRow] });
    return message.reply({ content: "✅ Ticket panel deployed!", ephemeral: true });
  }

  // !msg command - Send message to channel
  else if (command === 'msg') {
    const msgContent = args.join(' ');
    if (!msgContent) {
      return message.reply({ content: "❌ Please provide a message to send.", ephemeral: true });
    }
    
    try {
      await message.channel.send(msgContent);
      await message.delete().catch(() => {});
    } catch (error) {
      console.error('Error sending message:', error);
      message.reply({ content: "❌ There was an error sending your message.", ephemeral: true });
    }
  }

  // !dm command - DM role members
  else if (command === 'dm') {
    if (!message.member.permissions.has(PermissionFlagsBits.Administrator)) {
      return message.reply({ content: "❌ You don't have permission to use this command.", ephemeral: true });
    }
    
    const role = message.mentions.roles.first();
    if (!role) {
      return message.reply({ content: "❌ Please mention a role to DM.", ephemeral: true });
    }
    
    const dmContent = args.slice(1).join(' ');
    if (!dmContent) {
      return message.reply({ content: "❌ Please provide a message to send.", ephemeral: true });
    }
    
    try {
      const members = (await message.guild.members.fetch()).filter(member => 
        member.roles.cache.has(role.id)
      );
      
      let successCount = 0;
      let failCount = 0;
      
      for (const member of members.values()) {
        try {
          await member.send(dmContent);
          successCount++;
        } catch (error) {
          console.error(`Could not send DM to ${member.user.tag}:`, error);
          failCount++;
        }
      }
      
      const summary = `✅ DMs sent successfully to ${successCount} members. Failed to send to ${failCount} members.`;
      await message.reply({ content: summary, ephemeral: true });
      setTimeout(() => message.delete().catch(() => {}), 5000);
    } catch (error) {
      console.error('Error processing DM command:', error);
      message.reply({ content: "❌ There was an error processing your command.", ephemeral: true });
    }
  }
});

// Interaction Create event for ticket system
client.on('interactionCreate', async interaction => {
  // Ticket creation from dropdown
  if (interaction.isStringSelectMenu() && interaction.customId === 'ticket_reason') {
    if (!ticketConfig.ticketRole || !ticketConfig.ticketCategory) {
      return interaction.reply({ 
        content: "❌ Ticket system is not properly configured. Please contact an admin.", 
        ephemeral: true 
      });
    }
    
    await interaction.deferReply({ ephemeral: true });
    
    const reason = interaction.values[0];
    ticketConfig.ticketCount++;
    const ticketName = `ticket-${ticketConfig.ticketCount}`;
    
    try {
      const category = await interaction.guild.channels.fetch(ticketConfig.ticketCategory);
      if (!category) throw new Error("Category not found");
      
      const ticketChannel = await interaction.guild.channels.create({
        name: ticketName,
        type: ChannelType.GuildText,
        parent: category,
        permissionOverwrites: [
          {
            id: interaction.guild.id,
            deny: [PermissionFlagsBits.ViewChannel]
          },
          {
            id: interaction.user.id,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          },
          {
            id: ticketConfig.ticketRole,
            allow: [
              PermissionFlagsBits.ViewChannel,
              PermissionFlagsBits.SendMessages,
              PermissionFlagsBits.AttachFiles,
              PermissionFlagsBits.EmbedLinks
            ]
          }
        ]
      });
      
      ticketConfig.openTickets.set(ticketChannel.id, {
        creator: interaction.user.id,
        claimedBy: null,
        isLocked: false
      });
      
      const ticketEmbed = new EmbedBuilder()
        .setTitle(`Ticket: ${ticketName}`)
        .setDescription(`**Reason:** ${reason}\n\nPlease describe your issue in detail. A staff member will assist you shortly.`)
        .addFields(
          { name: 'Created by', value: interaction.user.toString(), inline: true },
          { name: 'Status', value: '🟢 Open', inline: true }
        )
        .setColor(Colors.Green)
        .setTimestamp();
      
      const buttons = new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId('claim_ticket')
          .setLabel('Claim')
          .setStyle(ButtonStyle.Primary)
          .setEmoji('🙋'),
        new ButtonBuilder()
          .setCustomId('lock_ticket')
          .setLabel('Lock')
          .setStyle(ButtonStyle.Secondary)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('close_ticket')
          .setLabel('Close')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🔒'),
        new ButtonBuilder()
          .setCustomId('delete_ticket')
          .setLabel('Delete')
          .setStyle(ButtonStyle.Danger)
          .setEmoji('🗑️')
      );
      
      await ticketChannel.send({ 
        content: `${interaction.user} ${ticketConfig.ticketRole ? `<@&${ticketConfig.ticketRole}>` : ''}`,
        embeds: [ticketEmbed],
        components: [buttons]
      });
      
      await interaction.editReply({ 
        content: `✅ Your ticket has been created: ${ticketChannel}` 
      });
    } catch (error) {
      console.error('Error creating ticket:', error);
      await interaction.editReply({ 
        content: "❌ There was an error creating your ticket. Please try again later." 
      });
    }
  }
  
  // Ticket button interactions
  if (interaction.isButton()) {
    const ticketData = ticketConfig.openTickets.get(interaction.channel.id);
    if (!ticketData) return;
    
    const ticketEmbed = interaction.message.embeds[0];
    if (!ticketEmbed) return;
    
    await interaction.deferReply({ ephemeral: true });
    
    // Claim ticket
    if (interaction.customId === 'claim_ticket') {
      if (ticketData.claimedBy) {
        return interaction.editReply({ 
          content: `❌ This ticket is already claimed by <@${ticketData.claimedBy}>` 
        });
      }
      
      ticketData.claimedBy = interaction.user.id;
      ticketConfig.openTickets.set(interaction.channel.id, ticketData);
      
      const newEmbed = EmbedBuilder.from(ticketEmbed)
        .spliceFields(1, 1, { name: 'Status', value: '🟡 Claimed', inline: true })
        .addFields({ name: 'Claimed by', value: interaction.user.toString(), inline: true })
        .setColor(Colors.Yellow);
      
      await interaction.message.edit({ embeds: [newEmbed] });
      return interaction.editReply({ content: '✅ You have claimed this ticket!' });
    }
    
    // Lock ticket
    else if (interaction.customId === 'lock_ticket') {
      if (ticketData.isLocked) {
        return interaction.editReply({ content: '❌ This ticket is already locked.' });
      }
      
      ticketData.isLocked = true;
      ticketConfig.openTickets.set(interaction.channel.id, ticketData);
      
      await interaction.channel.permissionOverwrites.edit(interaction.channel.guild.roles.everyone, {
        SendMessages: false
      });
      
      const newEmbed = EmbedBuilder.from(ticketEmbed)
        .spliceFields(1, 1, { name: 'Status', value: '🔴 Locked', inline: true })
        .setColor(Colors.Red);
      
      await interaction.message.edit({ embeds: [newEmbed] });
      return interaction.editReply({ content: '✅ Ticket has been locked!' });
    }
    
    // Close ticket
    else if (interaction.customId === 'close_ticket') {
      const modal = new ModalBuilder()
        .setCustomId('close_reason')
        .setTitle('Close Ticket')
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder()
              .setCustomId('reason')
              .setLabel('Reason for closing (optional)')
              .setStyle(TextInputStyle.Paragraph)
              .setRequired(false)
          )
        );
      
      return interaction.showModal(modal);
    }
    
    // Delete ticket
    else if (interaction.customId === 'delete_ticket') {
      try {
        const transcript = await createTranscript(interaction.channel);
        const fileName = `transcript-${interaction.channel.id}-${interaction.channel.name}.html`;
        fs.writeFileSync(fileName, transcript);
        
        const creator = await client.users.fetch(ticketData.creator);
        if (creator) {
          try {
            await creator.send({
              content: `Your ticket ${interaction.channel.name} in ${interaction.guild.name} has been deleted by ${interaction.user.tag}`,
              files: [fileName]
            });
          } catch (err) {
            console.error('Could not send transcript to user:', err);
          }
        }
        
        fs.unlinkSync(fileName);
        await interaction.channel.delete();
        ticketConfig.openTickets.delete(interaction.channel.id);
      } catch (error) {
        console.error('Error deleting ticket:', error);
        await interaction.editReply({ 
          content: '❌ There was an error deleting this ticket.' 
        });
      }
    }
  }
  
  // Modal submit for closing reason
  if (interaction.isModalSubmit() && interaction.customId === 'close_reason') {
    const reason = interaction.fields.getTextInputValue('reason') || 'No reason provided';
    const ticketData = ticketConfig.openTickets.get(interaction.channel.id);
    if (!ticketData) return;
    
    try {
      const transcript = await createTranscript(interaction.channel);
      const fileName = `transcript-${interaction.channel.id}-${interaction.channel.name}.html`;
      fs.writeFileSync(fileName, transcript);
      
      const creator = await client.users.fetch(ticketData.creator);
      if (creator) {
        try {
          await creator.send({
            content: `Your ticket ${interaction.channel.name} in ${interaction.guild.name} has been closed by ${interaction.user.tag}\n\n**Reason:** ${reason}`,
            files: [fileName]
          });
        } catch (err) {
          console.error('Could not send transcript to user:', err);
        }
      }
      
      fs.unlinkSync(fileName);
      
      const closedEmbed = new EmbedBuilder()
        .setTitle(`Ticket Closed`)
        .setDescription(`This ticket has been closed by ${interaction.user.toString()}`)
        .addFields(
          { name: 'Reason', value: reason },
          { name: 'Created by', value: `<@${ticketData.creator}>`, inline: true },
          { name: 'Closed by', value: interaction.user.toString(), inline: true }
        )
        .setColor(Colors.Red)
        .setTimestamp();
      
      await interaction.channel.send({ embeds: [closedEmbed] });
      await interaction.channel.setName(`closed-${interaction.channel.name}`);
      await interaction.channel.permissionOverwrites.edit(interaction.channel.guild.roles.everyone, {
        SendMessages: false
      });
      
      ticketConfig.openTickets.delete(interaction.channel.id);
      await interaction.reply({ content: '✅ Ticket has been closed!', ephemeral: true });
    } catch (error) {
      console.error('Error closing ticket:', error);
      await interaction.reply({ 
        content: '❌ There was an error closing this ticket.', 
        ephemeral: true 
      });
    }
  }
});

// Login to Discord
const token = process.env.DISCORD_TOKEN;
if (!token) {
  console.error('No token provided in DISCORD_TOKEN environment variable');
  process.exit(1);
}
client.login(token).catch(console.error);