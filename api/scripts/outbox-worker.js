// Outbox sender. Polls outbox_messages and delivers them via MSG91.
//   node scripts/outbox-worker.js          -> loop forever (interval)
//   node scripts/outbox-worker.js --once   -> single pass then exit (tests/cron)
import { processPending } from '../src/services/outbox.service.js';
import { pool } from '../src/config/db.js';

const INTERVAL_MS = Number(process.env.OUTBOX_INTERVAL_MS || 5000);
const once = process.argv.includes('--once');

async function tick() {
  try {
    const r = await processPending({ limit: 50 });
    if (r.processed) console.log('[outbox]', new Date().toISOString(), r);
  } catch (err) {
    console.error('[outbox] pass failed:', err.message);
  }
}

if (once) {
  await tick();
  await pool.end();
  process.exit(0);
} else {
  console.log(`[outbox] worker started (every ${INTERVAL_MS}ms)`);
  await tick();
  setInterval(tick, INTERVAL_MS);
}
