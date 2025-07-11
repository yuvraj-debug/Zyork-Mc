const { REST, Routes } = require('discord.js');
require('dotenv').config();

const CLIENT_ID = '1383659368276430949'; // Your Bot's Client ID

const rest = new REST({ version: '10' }).setToken(process.env.TOKEN);

(async () => {
  try {
    console.log('🧹 Deleting global slash commands...');
    await rest.put(Routes.applicationCommands(CLIENT_ID), { body: [] });
    console.log('✅ Successfully deleted all global slash commands!');
  } catch (error) {
    console.error('❌ Error deleting commands:', error);
  }
})();
