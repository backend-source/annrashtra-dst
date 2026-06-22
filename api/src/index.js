import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import { env } from './config/env.js';
import routes from './routes/index.js';
import { errorHandler, notFound } from './middleware/errorHandler.js';

const app = express();

app.disable('x-powered-by');
app.use(helmet());
// CORS only affects browsers (the dashboard). In prod, restrict to configured
// origins; in dev, allow all. Mobile and the MSG91 webhook are non-browser.
app.use(cors(env.corsOrigin ? { origin: env.corsOrigin.split(',').map((o) => o.trim()) } : {}));
app.use(express.json({ limit: '1mb' }));

app.get('/health', (_req, res) => res.json({ ok: true }));
app.use('/api', routes);

app.use(notFound);
app.use(errorHandler);

// Don't let a stray async error take the server down (esp. during local dev).
process.on('unhandledRejection', (reason) => {
  console.error('[unhandledRejection]', reason);
});
process.on('uncaughtException', (err) => {
  console.error('[uncaughtException]', err);
});

app.listen(env.port, () => {
  console.log(`Annrashtra DST API listening on :${env.port} (${env.nodeEnv})`);
});
