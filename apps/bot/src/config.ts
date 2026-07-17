import dotenv from 'dotenv';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

// This file lives at apps/bot/src, so the repo root (.env) is 3 levels up.
// (In the cloud there's no .env file — dotenv no-ops and host env vars are used.)
const here = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.resolve(here, '../../../.env') });

export const TOKEN = process.env.DISCORD_BOT_TOKEN;
export const GUILD_ID = process.env.DISCORD_GUILD_ID;
export const LICENSE_ROLE_ID = process.env.DISCORD_LICENSE_ROLE_ID;
export const DATABASE_URL = process.env.DATABASE_URL;

if (!TOKEN || !GUILD_ID || !DATABASE_URL) {
  console.error('Missing required env vars: DISCORD_BOT_TOKEN, DISCORD_GUILD_ID, DATABASE_URL');
  process.exit(1);
}
