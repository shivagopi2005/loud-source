#!/usr/bin/env node
require('dotenv').config();
const { PrismaClient } = require('@prisma/client');

async function main() {
  const timestamp = new Date().toISOString();
  console.log(`[${timestamp}] [KeepAlive] Running Supabase Keepalive Ping...`);

  let dbOk = false;
  let apiOk = false;
  let dbMs = 0;
  let apiMs = 0;

  // 1. PostgreSQL DB Ping
  const prisma = new PrismaClient();
  try {
    const t0 = Date.now();
    await prisma.$queryRaw`SELECT 1 as keepalive`;
    dbMs = Date.now() - t0;
    dbOk = true;
    console.log(`[KeepAlive] PostgreSQL Database Ping: SUCCESS (${dbMs}ms)`);
  } catch (err) {
    console.error(`[KeepAlive] PostgreSQL Database Ping: FAILED - ${err.message}`);
  } finally {
    await prisma.$disconnect();
  }

  // 2. Supabase Cloud API Ping
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;

  if (supabaseUrl && supabaseKey) {
    try {
      const t0 = Date.now();
      const res = await fetch(`${supabaseUrl.replace(/\/$/, '')}/auth/v1/health`, {
        method: 'GET',
        headers: { apikey: supabaseKey },
      });
      apiMs = Date.now() - t0;
      if (res.ok) {
        apiOk = true;
        console.log(`[KeepAlive] Supabase Cloud API Ping: SUCCESS (${apiMs}ms, HTTP ${res.status})`);
      } else {
        console.warn(`[KeepAlive] Supabase Cloud API Ping: HTTP ${res.status}`);
      }
    } catch (err) {
      console.error(`[KeepAlive] Supabase Cloud API Ping: FAILED - ${err.message}`);
    }
  }

  if (dbOk || apiOk) {
    console.log(`[KeepAlive] COMPLETE: Supabase is ACTIVE and WILL NOT SLEEP.`);
    process.exit(0);
  } else {
    console.error(`[KeepAlive] FAILED: Both DB and API pings failed.`);
    process.exit(1);
  }
}

main();
