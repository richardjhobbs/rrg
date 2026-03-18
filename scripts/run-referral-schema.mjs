#!/usr/bin/env node
/**
 * Creates referral tables via Supabase REST API.
 * Usage: cd /home/agent/apps/rrg && set -a && . .env.local && set +a && node scripts/run-referral-schema.mjs
 */
import { createClient } from '@supabase/supabase-js';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_KEY);

// Check if tables already exist
const { error: checkErr } = await db.from('rrg_referral_partners').select('id').limit(1);
if (!checkErr) {
  console.log('rrg_referral_partners already exists — nothing to do.');
  process.exit(0);
}

console.log('Tables do not exist yet. Please run the following SQL in the Supabase SQL editor:');
console.log('File: scripts/referral-schema.sql');
console.log('URL: https://supabase.com/dashboard → SQL Editor → paste contents of referral-schema.sql');
process.exit(1);
