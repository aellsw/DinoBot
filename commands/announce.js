// Require necessary discord.js classes
const {
    SlashCommandBuilder,
    PermissionFlagsBits,
    ChannelType,
    EmbedBuilder
} = require('discord.js');

// Define the announce command
const data = new SlashCommandBuilder()
    .setName('announce')
    .setDescription('Create an announcement embed')
    .setDefaultMemberPermissions(PermissionFlagsBits.ManageMessages) // Restrict to users who can manage messages
    .addStringOption(option =>
        option.setName('title')
            .setDescription('The title of the announcement')
            .setRequired(true)
    )
    .addStringOption(option =>
        option.setName('body')
            .setDescription('The body text of the announcement')
            .setRequired(true)
    )
    .addChannelOption(option =>
        option.setName('channel')
            .setDescription('The channel to send the announcement to')
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText)
    )
    .addStringOption(option =>
        option.setName('color')
            .setDescription('The color of the embed (hex code without #)')
            .setRequired(false)
    )
    .addAttachmentOption(option =>
        option.setName('header')
            .setDescription('Optional header image to include at the top of the announcement')
            .setRequired(false)
    )
    .addAttachmentOption(option =>
        option.setName('image')
            .setDescription('Optional image to include in the announcement body')
            .setRequired(false)
    );

// Function to handle the announce command
async function execute(interaction) {
    // Default channel ID if none specified
    const DEFAULT_CHANNEL_ID = '1349926566871826527';

    try {
        // Get the options from the interaction
        const targetChannel = interaction.options.getChannel('channel') ||
            interaction.client.channels.cache.get(DEFAULT_CHANNEL_ID);
        const title = interaction.options.getString('title');
        const body = interaction.options.getString('body');
        const color = interaction.options.getString('color') || '0099FF'; // Default blue if no color specified
        const headerAttachment = interaction.options.getAttachment('header');
        const bodyAttachment = interaction.options.getAttachment('image');

        // Check if the target channel exists
        if (!targetChannel) {
            return interaction.reply({
                content: `Error: Could not find the specified channel or the default channel.`,
                ephemeral: true
            });
        }

        // Create the embed
        const announceEmbed = new EmbedBuilder()
            .setColor(`#${color.replace('#', '')}`) // Remove # if user included it
            .setTitle(title)
            .setDescription(body)
            .setTimestamp();

        // Add header image if provided
        if (headerAttachment && headerAttachment.contentType && headerAttachment.contentType.startsWith('image/')) {
            announceEmbed.setThumbnail(headerAttachment.url);
        }

        // Add body image if provided
        if (bodyAttachment && bodyAttachment.contentType && bodyAttachment.contentType.startsWith('image/')) {
            announceEmbed.setImage(bodyAttachment.url);
        }

        // Send the embed to the channel
        await targetChannel.send({ embeds: [announceEmbed] });

        // Confirm to the user that the announcement was sent
        await interaction.reply({
            content: `Announcement successfully sent to ${targetChannel}!`,
            ephemeral: true
        });

    } catch (error) {
        console.error('Error in announce command:', error);
        await interaction.reply({
            content: `Failed to send announcement: ${error.message}`,
            ephemeral: true
        });
    }
}
// Export the command data and execute function
module.exports = {
    data,
    execute
};