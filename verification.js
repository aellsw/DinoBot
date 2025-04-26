const {
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');

// Function to save Steam ID to the database
async function saveSteamID(pool, discordID, steamID) {
    try {
        const query = `
            INSERT INTO ${process.env.DB_TABLE} (DiscordID, SteamID)
            VALUES (?, ?)
                ON DUPLICATE KEY UPDATE SteamID = VALUES(SteamID);
        `;
        const [result] = await pool.query(query, [discordID, steamID]);
        console.log(`✅ Steam ID ${steamID} linked to Discord ID ${discordID}`);
    } catch (error) {
        console.error('❌ Database error:', error);
    }
}

// Function to send the verification message
async function sendVerificationMessage(channel, client) {
    const messages = await channel.messages.fetch({ limit: 10 });
    const existingVerifyMsg = messages.find(msg =>
        msg.author.id === client.user.id &&
        msg.embeds.length > 0 &&
        msg.embeds[0].title === 'Steam Account Verification'
    );

    if (existingVerifyMsg) {
        console.log('Verification message already exists in channel');
        return;
    }

    const verifyEmbed = new EmbedBuilder()
        .setColor(0x0099FF)
        .setTitle('Steam Account Verification')
        .setDescription('Click the button below to verify your Steam account')
        .setFooter({ text: 'This verification is only visible to you when interacted with' });

    const verifyButton = new ButtonBuilder()
        .setCustomId('verify-steam-button')
        .setLabel('Verify with Steam')
        .setStyle(ButtonStyle.Primary);

    const row = new ActionRowBuilder().addComponents(verifyButton);

    await channel.send({
        embeds: [verifyEmbed],
        components: [row]
    });
}

// Setup verification system
function setupVerificationSystem(client, pool) {
    client.on('interactionCreate', async (interaction) => {
        if (interaction.isButton() && interaction.customId === 'verify-steam-button') {
            const modal = new ModalBuilder()
                .setCustomId('steam-id-modal')
                .setTitle('Steam Account Verification');

            const steamIdInput = new TextInputBuilder()
                .setCustomId('steam-id-input')
                .setLabel('Enter your Steam ID (17-digit number)')
                .setPlaceholder('76561198xxxxxxxxx')
                .setStyle(TextInputStyle.Short)
                .setMinLength(17)
                .setMaxLength(17)
                .setRequired(true);

            const firstActionRow = new ActionRowBuilder().addComponents(steamIdInput);
            modal.addComponents(firstActionRow);

            await interaction.showModal(modal);
        }

        if (interaction.isModalSubmit() && interaction.customId === 'steam-id-modal') {
            const steamId = interaction.fields.getTextInputValue('steam-id-input');

            if (steamId && /^7656119\d{10}$/.test(steamId)) {
                await interaction.reply({
                    content: `✅ Your Steam ID (${steamId}) has been verified! Your account is now linked.`,
                    ephemeral: true
                });

                // Store in database
                await saveSteamID(pool, interaction.user.id, steamId);

                // Assign "Verified" role
                try {
                    const member = interaction.guild.members.cache.get(interaction.user.id);
                    const role = interaction.guild.roles.cache.find(r => r.name === "Verified");
                    if (role && member) await member.roles.add(role);
                } catch (error) {
                    console.error("❌ Error adding role:", error);
                }
            } else {
                await interaction.reply({
                    content: "❌ Invalid Steam ID format. Please make sure you entered a valid 17-digit Steam ID.",
                    ephemeral: true
                });
            }
        }
    });
}

module.exports = {
    setupVerificationSystem,
    sendVerificationMessage
};