import {
  SlashCommandBuilder,
  PermissionFlagsBits,
} from 'discord.js';

export const commands = [
  new SlashCommandBuilder()
    .setName('generate')
    .setDescription('Generate a new license key')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addIntegerOption((opt) =>
      opt.setName('count').setDescription('Number of keys to generate (1-50)').setMinValue(1).setMaxValue(50),
    )
    .addStringOption((opt) =>
      opt.setName('tier').setDescription('License tier').addChoices(
        { name: 'Pro (unlimited)', value: 'pro' },
        { name: 'Free (limited)', value: 'free' },
      ),
    )
    .addIntegerOption((opt) =>
      opt.setName('days').setDescription('Expiration in days (leave empty for no expiry)').setMinValue(1).setMaxValue(3650),
    )
    .addStringOption((opt) => opt.setName('notes').setDescription('Private note (e.g. customer name)')),

  new SlashCommandBuilder()
    .setName('check')
    .setDescription('Check a license key')
    .addStringOption((opt) => opt.setName('key').setDescription('The license key to check').setRequired(true)),

  new SlashCommandBuilder()
    .setName('revoke')
    .setDescription('Revoke a license key')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) => opt.setName('key').setDescription('The license key to revoke').setRequired(true)),

  new SlashCommandBuilder()
    .setName('list')
    .setDescription('List all license keys')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addStringOption((opt) =>
      opt.setName('filter').setDescription('Filter by status').addChoices(
        { name: 'All', value: 'all' },
        { name: 'Unused', value: 'unused' },
        { name: 'Active (redeemed)', value: 'redeemed' },
        { name: 'Revoked', value: 'revoked' },
      ),
    ),

  new SlashCommandBuilder()
    .setName('stats')
    .setDescription('Show platform stats')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator),

  new SlashCommandBuilder()
    .setName('user')
    .setDescription('Check a users license status')
    .setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addUserOption((opt) => opt.setName('target').setDescription('The user to check').setRequired(true)),
];
