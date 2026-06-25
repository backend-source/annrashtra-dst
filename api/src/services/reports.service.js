import { query } from '../config/db.js';
import { ApiError } from '../middleware/errorHandler.js';
import * as repo from '../repositories/reports.repo.js';

function toCsv(headers, rows) {
  const esc = (v) => {
    if (v === null || v === undefined) return '';
    const s = String(v);
    return /[",\n]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  };
  return [headers.join(','), ...rows.map((r) => r.map(esc).join(','))].join('\n');
}

// Per-type CSV spec: which repo query, the header row, and the columns to pull.
const EXPORTS = {
  sales: { fn: repo.exportSales, headers: ['Promoter', 'Code', 'Invoice', 'Date', 'Customer', 'Mobile', 'Payment', 'Total', 'Items'], keys: ['promoter', 'code', 'invoice_no', 'dt', 'customer', 'customer_mobile', 'payment_mode', 'total', 'items'] },
  leads: { fn: repo.exportLeads, headers: ['Promoter', 'Code', 'Name', 'Mobile', 'Concern', 'Interest', 'Source', 'Verify', 'Status', 'Date'], keys: ['promoter', 'code', 'name', 'mobile', 'health_concern', 'product_interest', 'source', 'verify_status', 'status', 'dt'] },
  attendance: { fn: repo.exportAttendance, headers: ['Promoter', 'Code', 'Location', 'Shift', 'Check-in', 'Check-out', 'In radius', 'Verified by', 'Lat', 'Lng', 'Map'], keys: ['promoter', 'code', 'location', 'shift', 'checkin', 'checkout', 'in_radius', 'verified_by', 'gps_lat', 'gps_lng', 'map_url'] },
  inventory: { fn: repo.exportInventory, headers: ['Promoter', 'Code', 'SKU', 'Opening', 'Refill', 'Sold', 'Closing', 'Day'], keys: ['promoter', 'code', 'sku', 'opening', 'refill', 'sold', 'closing', 'day'] },
  collections: { fn: repo.exportCollections, headers: ['Promoter', 'Code', 'Day', 'Expected cash', 'Cash handed', 'Expected UPI', 'UPI handed', 'Status', 'Verified by', 'Verified at'], keys: ['promoter', 'code', 'day', 'expected_cash', 'handed_cash', 'expected_upi', 'handed_upi', 'status', 'confirmed_by', 'confirmed_at'] },
};

// Promoter ids visible to this user: promoter -> self; supervisor -> their team;
// admin -> everyone. This is the same scoping rule used across the app.
async function scopeIds(user) {
  if (user.role === 'promoter') return [user.id];
  if (user.role === 'supervisor') {
    const { rows } = await query(`SELECT id FROM users WHERE role = 'promoter' AND supervisor_id = $1`, [user.id]);
    return rows.map((r) => r.id);
  }
  const { rows } = await query(`SELECT id FROM users WHERE role = 'promoter'`);
  return rows.map((r) => r.id);
}

export async function overview(user) {
  const ids = await scopeIds(user);
  const data = await repo.overview(ids);
  // Promoters don't get a leaderboard (it's a team view).
  if (user.role === 'promoter') data.leaderboard = [];
  return { scope: user.role, promoters_in_scope: ids.length, ...data };
}

// Promoter's own dashboard (today | week). Promoter-only — uses their own id.
export function me(user, period) {
  const p = period === 'week' ? 'week' : 'today';
  return repo.promoterSummary(user.id, p);
}

// Build a CSV for a report type, scoped to the user's role.
export async function exportCsv(user, type, from, to) {
  const spec = EXPORTS[type];
  if (!spec) throw new ApiError(400, `Unknown report type: ${type}`);
  const ids = await scopeIds(user);
  const rows = await spec.fn(ids, from, to);
  const csv = toCsv(spec.headers, rows.map((r) => spec.keys.map((k) => r[k])));
  return { filename: `${type}_${from}_to_${to}.csv`, csv, count: rows.length };
}
