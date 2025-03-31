// Require necessary discord.js classes
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    SlashCommandBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle,
    EmbedBuilder
} = require('discord.js');
const mysql = require('mysql2');
require('dotenv').config(); // Load environment variables

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Database Connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
}).promise();

// Define the /savedino command
const commands = [
    new SlashCommandBuilder()
        .setName('savedino')
        .setDescription('Saves a dinosaur (placeholder - no functionality yet)')
        .toJSON(),
    new SlashCommandBuilder()
        .setName('resetverify')
        .setDescription('Admin only: Reset the verification message in the verification channel')
        .setDefaultMemberPermissions('0') // Requires administrator permission
        .toJSON()
];

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Function to save Steam ID to the database
async function saveSteamID(discordID, steamID) {
    try {
        const query = `
            INSERT INTO ${process.env.DP_TABLE} (DiscordID, SteamID)
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
async function sendVerificationMessage(channel) {
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
function setupVerificationSystem(client) {
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
                await saveSteamID(interaction.user.id, steamId);

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

        if (interaction.isCommand()) {
            const { commandName } = interaction;

            if (commandName === 'savedino') {
                await interaction.reply({ content: 'This command will save a dinosaur in the future!', ephemeral: true });
            }

            if (commandName === 'resetverify') {
                const verificationChannelId = process.env.VERIFICATION_CHANNEL_ID;
                if (!verificationChannelId) {
                    return interaction.reply({
                        content: 'Error: VERIFICATION_CHANNEL_ID not set in environment variables',
                        ephemeral: true
                    });
                }

                const channel = client.channels.cache.get(verificationChannelId);
                if (!channel) {
                    return interaction.reply({
                        content: `Error: Could not find channel with ID ${verificationChannelId}`,
                        ephemeral: true
                    });
                }

                // Delete existing verification messages
                const messages = await channel.messages.fetch({ limit: 10 });
                const existingVerifyMsgs = messages.filter(msg =>
                    msg.author.id === client.user.id &&
                    msg.embeds.length > 0 &&
                    msg.embeds[0].title === 'Steam Account Verification'
                );

                for (const msg of existingVerifyMsgs.values()) {
                    await msg.delete().catch(console.error);
                }

                // Send a new verification message
                await sendVerificationMessage(channel);
                await interaction.reply({
                    content: 'Verification message has been reset in the verification channel',
                    ephemeral: true
                });
            }
        }
    });
}

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands },
        );

        console.log('Successfully reloaded application (/) commands.');

        setupVerificationSystem(client);

        // Set up verification message in the dedicated channel
        const verificationChannelId = process.env.VERIFICATION_CHANNEL_ID;
        if (verificationChannelId) {
            const channel = client.channels.cache.get(verificationChannelId);
            if (channel) {
                await sendVerificationMessage(channel);
                console.log(`Verification message set up in channel: ${channel.name}`);
            } else {
                console.error(`Channel with ID ${verificationChannelId} not found`);
            }
        } else {
            console.error('VERIFICATION_CHANNEL_ID not set in environment variables');
        }

        console.log(`✅ Logged in as ${client.user.tag}!`);
    } catch (error) {
        console.error(error);
    }
});

// Login to Discord with your client's token
client.login(process.env.DISCORD_TOKEN);
