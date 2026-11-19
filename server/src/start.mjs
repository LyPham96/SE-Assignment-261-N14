import { createPool } from './db.mjs';
import { createApp } from './app.mjs';
import rules from '../config/business-rules.json' with { type: 'json' };

const pool = createPool();
const app = await createApp({ pool, logger: true, secureCookies: process.env.COOKIE_SECURE === 'true' });
let scanning = false;
const expire = async () => {
  if (scanning) return;
  scanning = true;
  try { await app.service.expire(); } catch (error) { app.log.error(error); } finally { scanning = false; }
};
await expire();
const timer = setInterval(expire, rules.schedulerMilliseconds);
timer.unref();
app.addHook('onClose', async () => { clearInterval(timer); await pool.end(); });
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, async () => { await app.close(); process.exit(0); });
await app.listen({ host: process.env.HOST ?? '127.0.0.1', port: Number(process.env.PORT ?? 3001) });
