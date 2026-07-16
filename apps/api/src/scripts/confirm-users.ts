/**
 * One-off maintenance script: confirm any Supabase users whose email was never
 * confirmed (useful after toggling off email confirmation). Run:
 *   npx tsx src/scripts/confirm-users.ts
 */
import { supabaseAdmin } from '../services/storage.js';

async function run() {
  const { data, error } = await supabaseAdmin.auth.admin.listUsers();
  if (error) {
    console.error('Could not list users:', error.message);
    process.exit(1);
  }

  const users = data.users;
  console.log(`Found ${users.length} user(s).`);

  for (const u of users) {
    if (!u.email_confirmed_at) {
      const { error: upErr } = await supabaseAdmin.auth.admin.updateUserById(u.id, {
        email_confirm: true,
      });
      console.log(`  ${u.email}: ${upErr ? 'FAILED — ' + upErr.message : 'confirmed ✓'}`);
    } else {
      console.log(`  ${u.email}: already confirmed`);
    }
  }
  console.log('Done.');
}

run();
