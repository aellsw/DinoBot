const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    Collection,
    EmbedBuilder,
    ActionRowBuilder,
    ButtonBuilder,
    ButtonStyle,
    ModalBuilder,
    TextInputBuilder,
    TextInputStyle
} = require('discord.js');
const mysql = require('mysql2');
require('dotenv').config();

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Database Connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
}).promise();

// Load commands dynamically
client.commands = new Collection();
const commands = [];
const commandsPath = path.join(__dirname, 'commands'); // Create a 'commands' folder
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Function to save Steam ID to the database
async function saveSteamID(discordID, steamID) {
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
            const command = client.commands.get(interaction.commandName);
            if (!command) return;

            try {
                await command.execute(interaction);
            } catch (error) {
                console.error(error);
                await interaction.reply({ content: 'There was an error executing this command.', ephemeral: true });
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
            { body: commands }
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
