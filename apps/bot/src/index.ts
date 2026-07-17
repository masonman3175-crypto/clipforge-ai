import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
} from 'discord.js';
import { TOKEN, GUILD_ID } from './config.js';
import { commands } from './commands.js';
import {
  handleGenerate,
  handleCheck,
  handleRevoke,
  handleList,
  handleStats,
  handleUser,
} from './handlers.js';

// Only the (non-privileged) Guilds intent is needed for slash commands.
// The optional welcome-on-join message below needs the privileged
// GuildMembers intent — to enable it, add GatewayIntentBits.GuildMembers here
// AND turn on "Server Members Intent" in the Discord Developer Portal.
const client = new Client({
  intents: [GatewayIntentBits.Guilds],
});

client.once('ready', async (c) => {
  console.log(`Bot ready: ${c.user.tag}`);

  // Register slash commands
  const rest = new REST({ version: '10' }).setToken(TOKEN!);
  try {
    await rest.put(Routes.applicationGuildCommands(c.user.id, GUILD_ID!), {
      body: commands.map((cmd) => cmd.toJSON()),
    });
    console.log('Slash commands registered.');
  } catch (err) {
    console.error('Failed to register commands:', err);
  }
});

client.on('interactionCreate', async (interaction) => {
  if (!interaction.isChatInputCommand()) return;

  try {
    switch (interaction.commandName) {
      case 'generate':
        await handleGenerate(interaction);
        break;
      case 'check':
        await handleCheck(interaction);
        break;
      case 'revoke':
        await handleRevoke(interaction);
        break;
      case 'list':
        await handleList(interaction);
        break;
      case 'stats':
        await handleStats(interaction);
        break;
      case 'user':
        await handleUser(interaction);
        break;
    }
  } catch (err) {
    console.error(`Error handling /${interaction.commandName}:`, err);
    const reply = { content: 'An error occurred while running this command.', ephemeral: true };
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp(reply);
    } else {
      await interaction.reply(reply);
    }
  }
});

// Welcome message for new members
client.on('guildMemberAdd', async (member) => {
  if (member.guild.id !== GUILD_ID) return;

  // Find a general/welcome channel
  const channel = member.guild.channels.cache.find(
    (ch) => ch.name === 'general' || ch.name === 'welcome' || ch.name === 'chat',
  );

  if (channel && channel.isTextBased()) {
    const embed = {
      color: 0x8b5cf6,
      title: `Welcome to ClipForge AI!`,
      description: [
        `Hey ${member}, welcome to the server!`,
        '',
        '**How to get started:**',
        '1. Sign up at clipforge.ai',
        '2. Try 1 video for free',
        '3. Purchase a license key for unlimited access',
        '',
        'Need help? Ask in this channel!',
      ].join('\n'),
      timestamp: new Date().toISOString(),
    };

    try {
      await channel.send({ embeds: [embed] });
    } catch {
      // Channel not accessible
    }
  }
});

client.login(TOKEN);
