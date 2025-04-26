const fs = require('fs');
const path = require('path');
const {
    Client,
    GatewayIntentBits,
    REST,
    Routes,
    Collection
} = require('discord.js');
const mysql = require('mysql2');
require('dotenv').config();

// Import verification system
const { setupVerificationSystem, sendVerificationMessage } = require('./verification');

// Create a new client instance
const client = new Client({ intents: [GatewayIntentBits.Guilds] });

// Database Connection
const pool = mysql.createPool({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME
}).promise();

// Export pool for use in other files
module.exports.pool = pool;

// Load commands dynamically
client.commands = new Collection();
const commands = [];
const commandsPath = path.join(__dirname, 'commands');
const commandFiles = fs.readdirSync(commandsPath).filter(file => file.endsWith('.js'));

for (const file of commandFiles) {
    const filePath = path.join(commandsPath, file);
    const command = require(filePath);
    client.commands.set(command.data.name, command);
    commands.push(command.data.toJSON());
}

// Register slash commands
const rest = new REST({ version: '10' }).setToken(process.env.DISCORD_TOKEN);

// Handle command interactions
client.on('interactionCreate', async (interaction) => {
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

// When the client is ready, run this code (only once)
client.once('ready', async () => {
    try {
        console.log('Started refreshing application (/) commands.');

        await rest.put(
            Routes.applicationGuildCommands(process.env.CLIENT_ID, process.env.GUILD_ID),
            { body: commands }
        );

        console.log('Successfully reloaded application (/) commands.');

        // Set up verification system
        setupVerificationSystem(client, pool);

        // Set up verification message in the dedicated channel
        const verificationChannelId = process.env.VERIFICATION_CHANNEL_ID;
        if (verificationChannelId) {
            const channel = client.channels.cache.get(verificationChannelId);
            if (channel) {
                await sendVerificationMessage(channel, client);
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