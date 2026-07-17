import { ChatInputCommandInteraction, EmbedBuilder, GuildMember } from 'discord.js';
import { dbQuery } from './db.js';
import { generateKey } from './helpers.js';
import { LICENSE_ROLE_ID } from './config.js';

export async function handleGenerate(interaction: ChatInputCommandInteraction) {
  const count = interaction.options.getInteger('count') ?? 1;
  const tier = interaction.options.getString('tier') ?? 'pro';
  const days = interaction.options.getInteger('days');
  const notes = interaction.options.getString('notes');

  const keys: string[] = [];
  for (let i = 0; i < count; i++) {
    const code = generateKey();
    const expiresAt = days ? new Date(Date.now() + days * 86400000).toISOString() : null;
    await dbQuery(
      `INSERT INTO licenses (code, tier, max_devices, expires_at, created_by, notes)
       VALUES ($1, $2, 1, $3, $4, $5)`,
      [code, tier, expiresAt, `discord:${interaction.user.id}`, notes],
    );
    keys.push(code);
  }

  const embed = new EmbedBuilder()
    .setColor(tier === 'pro' ? 0x8b5cf6 : 0x6b7280)
    .setTitle(`Generated ${count} ${tier.toUpperCase()} key${count > 1 ? 's' : ''}`)
    .setDescription(
      keys.map((k) => `\`${k}\``).join('\n') +
      (days ? `\n\nExpires in ${days} days` : '\n\nNo expiration') +
      (notes ? `\nNote: ${notes}` : ''),
    )
    .setFooter({ text: 'Copy and send to the customer after payment' })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleCheck(interaction: ChatInputCommandInteraction) {
  const key = interaction.options.getString('key')!.toUpperCase();

  const { rows } = await dbQuery(
    `SELECT l.*, u.email AS redeemed_by_email
     FROM licenses l
     LEFT JOIN users u ON u.id = l.redeemed_by
     WHERE l.code = $1`,
    [key],
  );

  if (!rows[0]) {
    return interaction.reply({ content: `Key \`${key}\` not found.`, ephemeral: true });
  }

  const lic = rows[0];
  const statusEmoji = lic.status === 'redeemed' ? '✅' : lic.status === 'revoked' ? '❌' : '⏳';
  const embed = new EmbedBuilder()
    .setColor(
      lic.status === 'redeemed' ? 0x10b981 :
      lic.status === 'revoked' ? 0xef4444 : 0x6b7280,
    )
    .setTitle(`${statusEmoji} Key: ${lic.code}`)
    .addFields(
      { name: 'Status', value: lic.status, inline: true },
      { name: 'Tier', value: lic.tier, inline: true },
      { name: 'Max Devices', value: String(lic.max_devices), inline: true },
    );

  if (lic.redeemed_by_email) {
    embed.addFields({ name: 'Redeemed By', value: lic.redeemed_by_email, inline: true });
  }
  if (lic.redeemed_at) {
    embed.addFields({ name: 'Redeemed At', value: new Date(lic.redeemed_at).toLocaleString(), inline: true });
  }
  if (lic.expires_at) {
    const expired = new Date(lic.expires_at) < new Date();
    embed.addFields({
      name: 'Expires',
      value: expired ? `EXPIRED (${new Date(lic.expires_at).toLocaleString()})` : new Date(lic.expires_at).toLocaleString(),
      inline: true,
    });
  }
  if (lic.notes) {
    embed.addFields({ name: 'Notes', value: lic.notes, inline: false });
  }

  const devices: string[] = lic.device_fingerprints || [];
  if (devices.length > 0) {
    embed.addFields({ name: 'Devices Used', value: `${devices.length}/${lic.max_devices}`, inline: true });
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleRevoke(interaction: ChatInputCommandInteraction) {
  const key = interaction.options.getString('key')!.toUpperCase();

  const { rowCount } = await dbQuery(
    `UPDATE licenses SET status = 'revoked' WHERE code = $1 AND status != 'revoked'`,
    [key],
  );

  if (!rowCount) {
    return interaction.reply({ content: `Key \`${key}\` not found or already revoked.`, ephemeral: true });
  }

  const { rows } = await dbQuery<{ redeemed_by: string | null }>(
    `SELECT redeemed_by FROM licenses WHERE code = $1`,
    [key],
  );
  if (rows[0]?.redeemed_by) {
    await dbQuery(`UPDATE users SET plan = 'free' WHERE id = $1`, [rows[0].redeemed_by]);
  }

  const embed = new EmbedBuilder()
    .setColor(0xef4444)
    .setTitle('Key Revoked')
    .setDescription(`Key \`${key}\` has been revoked.`)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleList(interaction: ChatInputCommandInteraction) {
  const filter = interaction.options.getString('filter') ?? 'all';

  let q = `SELECT l.code, l.tier, l.status, l.redeemed_at, u.email AS redeemed_by_email
           FROM licenses l LEFT JOIN users u ON u.id = l.redeemed_by`;
  const params: string[] = [];

  if (filter !== 'all') {
    q += ` WHERE l.status = $1`;
    params.push(filter);
  }
  q += ` ORDER BY l.created_at DESC LIMIT 25`;

  const { rows } = await dbQuery(q, params);

  if (rows.length === 0) {
    return interaction.reply({ content: 'No keys found.', ephemeral: true });
  }

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle(`License Keys (${filter})`)
    .setDescription(
      rows.map((r: any) => {
        const s = r.status === 'redeemed' ? '✅' : r.status === 'revoked' ? '❌' : '⏳';
        return `${s} \`${r.code}\` [${r.tier}] ${r.redeemed_by_email ? `→ ${r.redeemed_by_email}` : ''}`;
      }).join('\n'),
    )
    .setFooter({ text: `Showing ${rows.length} keys` })
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleStats(interaction: ChatInputCommandInteraction) {
  const [licenseStats, userStats, trialStats] = await Promise.all([
    dbQuery(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE status = 'unused')::int AS unused,
      count(*) FILTER (WHERE status = 'redeemed')::int AS active,
      count(*) FILTER (WHERE status = 'revoked')::int AS revoked
    FROM licenses`),
    dbQuery(`SELECT
      count(*)::int AS total,
      count(*) FILTER (WHERE plan = 'pro')::int AS pro,
      count(*) FILTER (WHERE plan = 'free')::int AS free
    FROM users`),
    dbQuery(`SELECT count(*)::int AS total, COALESCE(sum(videos_used), 0)::int AS videos FROM free_trials`),
  ]);

  const ls = licenseStats.rows[0];
  const us = userStats.rows[0];
  const ts = trialStats.rows[0];

  const embed = new EmbedBuilder()
    .setColor(0x8b5cf6)
    .setTitle('Platform Stats')
    .addFields(
      { name: 'Users', value: `**${us.total}** total\n${us.pro} Pro\n${us.free} Free`, inline: true },
      { name: 'Keys', value: `**${ls.total}** total\n${ls.unused} unused\n${ls.active} active\n${ls.revoked} revoked`, inline: true },
      { name: 'Free Trials', value: `**${ts.total || 0}** users\n${ts.videos || 0} videos processed`, inline: true },
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

export async function handleUser(interaction: ChatInputCommandInteraction) {
  const target = interaction.options.getUser('target')!;

  const { rows: users } = await dbQuery<{ id: string; email: string; plan: string }>(
    `SELECT id, email, plan FROM users WHERE id = $1`,
    [target.id],
  );

  if (!users[0]) {
    return interaction.reply({ content: `User ${target.tag} is not registered in ClipForge.`, ephemeral: true });
  }

  const dbUser = users[0];

  const { rows: licenses } = await dbQuery(
    `SELECT tier, status, redeemed_at, expires_at FROM licenses WHERE redeemed_by = $1 ORDER BY redeemed_at DESC`,
    [dbUser.id],
  );

  const { rows: trials } = await dbQuery<{ videos_used: number; max_videos: number }>(
    `SELECT videos_used, max_videos FROM free_trials WHERE user_id = $1`,
    [dbUser.id],
  );

  const embed = new EmbedBuilder()
    .setColor(dbUser.plan === 'pro' ? 0x10b981 : 0x6b7280)
    .setTitle(`User: ${dbUser.email}`)
    .addFields(
      { name: 'Plan', value: dbUser.plan, inline: true },
      { name: 'Discord', value: `<@${target.id}>`, inline: true },
    );

  if (licenses.length > 0) {
    embed.addFields({
      name: 'Licenses',
      value: licenses.map((l: any) =>
        `${l.status === 'redeemed' ? '✅' : '❌'} ${l.tier} - ${l.redeemed_at ? new Date(l.redeemed_at).toLocaleDateString() : 'n/a'}`,
      ).join('\n'),
      inline: false,
    });
  } else {
    embed.addFields({ name: 'Licenses', value: 'None', inline: false });
  }

  const trial = trials[0];
  if (trial) {
    embed.addFields({
      name: 'Free Trial',
      value: `${trial.videos_used}/${trial.max_videos} videos used`,
      inline: true,
    });
  }

  // Grant role if they have a license
  if (LICENSE_ROLE_ID && licenses.some((l: any) => l.status === 'redeemed')) {
    try {
      const guildMember = await interaction.guild?.members.fetch(target.id);
      if (guildMember && !guildMember.roles.cache.has(LICENSE_ROLE_ID)) {
        await (guildMember as GuildMember).roles.add(LICENSE_ROLE_ID);
        embed.addFields({ name: 'Role', value: 'License role granted', inline: true });
      }
    } catch {
      // Role grant failed (permissions or user left) - ignore
    }
  }

  await interaction.reply({ embeds: [embed], ephemeral: true });
}
