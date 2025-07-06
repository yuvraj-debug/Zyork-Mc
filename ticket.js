const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require('discord.js');
const { v4: uuidv4 } = require('uuid');

module.exports = {
    data: new SlashCommandBuilder()
        .setName('ticket')
        .setDescription('Create a support ticket')
        .addStringOption(option =>
            option.setName('reason')
                .setDescription('Reason for creating the ticket')
                .setRequired(false)),
    
    async execute(interaction) {
        // 1. Generate a unique ticket ID
        const ticketId = uuidv4().slice(0, 6).toUpperCase();
        const reason = interaction.options.getString('reason') || 'No reason provided';

        // 2. Create embed
        const embed = new EmbedBuilder()
            .setColor('#5865F2')
            .setTitle('🎫 Ticket Created')
            .setDescription(`**Reason:** ${reason}`)
            .addFields(
                { name: 'Ticket ID', value: ticketId, inline: true },
                { name: 'Created By', value: interaction.user.tag, inline: true }
            );

        // 3. Create buttons
        const buttons = new ActionRowBuilder().addComponents(
            new ButtonBuilder()
                .setCustomId('close_ticket')
                .setLabel('🔒 Close Ticket')
                .setStyle(ButtonStyle.Danger),
            new ButtonBuilder()
                .setCustomId('claim_ticket')
                .setLabel('🛡️ Claim Ticket')
                .setStyle(ButtonStyle.Primary)
        );

        // 4. Send response
        await interaction.reply({
            embeds: [embed],
            components: [buttons],
            ephemeral: true
        });

        // 5. Log to console
        console.log(`[TICKET] New ticket created by ${interaction.user.tag} (ID: ${ticketId})`);
    }
};