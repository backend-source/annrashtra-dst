import * as service from '../services/reports.service.js';

const istToday = () => new Date().toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });
const istDaysAgo = (n) => new Date(Date.now() - n * 86400000).toLocaleDateString('en-CA', { timeZone: 'Asia/Kolkata' });

export async function overview(req, res, next) {
  try {
    res.json(await service.overview(req.user));
  } catch (err) {
    next(err);
  }
}

// Promoter's own dashboard summary (?period=today|week).
export async function me(req, res, next) {
  try {
    res.json(await service.me(req.user, req.query.period));
  } catch (err) {
    next(err);
  }
}

// CSV download. Defaults to the last 90 days (IST); override with ?from&to=YYYY-MM-DD.
export async function exportReport(req, res, next) {
  try {
    const to = req.query.to || istToday();
    const from = req.query.from || istDaysAgo(90);
    const { filename, csv } = await service.exportCsv(req.user, req.params.type, from, to);
    res.setHeader('Content-Type', 'text/csv; charset=utf-8');
    res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
    res.send(csv);
  } catch (err) {
    next(err);
  }
}
