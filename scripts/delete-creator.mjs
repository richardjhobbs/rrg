#!/usr/bin/env node
/**
 * Delete a creator account completely.
 * Usage: cd /home/agent/apps/rrg && set -a && . .env.local && set +a && node scripts/delete-creator.mjs richard@bnv.me
 */
import { createClient } from '@supabase/supabase-js';

const email = process.argv[2];
if (!email) { console.log('Usage: node scripts/delete-creator.mjs <email>'); process.exit(1); }

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Find the Supabase Auth user
const { data: { users } } = await db.auth.admin.listUsers({ page: 1, perPage: 200 });
const user = users?.find(u => u.email === email);
if (!user) { console.log(`No Supabase Auth user found for ${email}`); process.exit(1); }
console.log(`Found auth user: ${user.id} (${user.email})`);

// Delete creator membership
const { data: member } = await db.from('rrg_creator_members').delete().eq('user_id', user.id).select();
console.log(`Deleted creator_members: ${member?.length || 0} rows`);

// Delete contributor record
const { data: contrib } = await db.from('rrg_contributors').delete().eq('email', email).select();
console.log(`Deleted contributors: ${contrib?.length || 0} rows`);

// Delete the auth user
const { error: delErr } = await db.auth.admin.deleteUser(user.id);
console.log(delErr ? `Auth delete failed: ${delErr.message}` : 'Auth user deleted');

console.log(`Done — ${email} fully removed.`);
