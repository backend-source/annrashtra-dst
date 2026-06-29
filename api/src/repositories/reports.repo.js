import { query } from '../config/db.js';

const n = (v) => Number(v) || 0;

// All aggregates for the overview, scoped to a set of promoter ids. An empty set
// (e.g. a supervisor with no promoters) yields zeros — ANY('{}') matches nothing.
export async function overview(ids) {
  const [revToday, revMonth, unitsMonth, leadAgg, checkins, inRadius, pts, series, board] = await Promise.all([
    query(`SELECT coalesce(sum(total),0) v FROM sales WHERE promoter_id = ANY($1) AND created_at::date = current_date`, [ids]),
    query(`SELECT coalesce(sum(total),0) v FROM sales WHERE promoter_id = ANY($1) AND date_trunc('month', created_at) = date_trunc('month', current_date)`, [ids]),
    query(`SELECT coalesce(sum(si.qty),0) v FROM sale_items si JOIN sales s ON s.id = si.sale_id
           WHERE s.promoter_id = ANY($1) AND date_trunc('month', s.created_at) = date_trunc('month', current_date)`, [ids]),
    query(`SELECT count(*)::int total,
                  count(*) FILTER (WHERE verify_status IN ('whatsapp_confirmed','otp_verified'))::int verified,
                  count(*) FILTER (WHERE status = 'converted')::int converted
           FROM leads WHERE promoter_id = ANY($1)`, [ids]),
    query(`SELECT count(*)::int v FROM attendance WHERE promoter_id = ANY($1) AND check_in_at::date = current_date`, [ids]),
    query(`SELECT coalesce(avg(CASE WHEN in_radius THEN 1 ELSE 0 END),0) v FROM attendance
           WHERE promoter_id = ANY($1) AND in_radius IS NOT NULL AND check_in_at > now() - interval '30 days'`, [ids]),
    query(`SELECT coalesce(sum(points),0) v FROM promoter_points WHERE promoter_id = ANY($1)`, [ids]),
    query(`SELECT to_char(d,'Dy') label, to_char(d,'YYYY-MM-DD') iso,
                  coalesce((SELECT sum(total) FROM sales WHERE promoter_id = ANY($1) AND created_at::date = d::date),0) total
           FROM generate_series(current_date - 6, current_date, interval '1 day') d ORDER BY d`, [ids]),
    query(`SELECT u.id, u.name,
                  coalesce((SELECT sum(total) FROM sales WHERE promoter_id = u.id),0) revenue,
                  coalesce((SELECT sum(points) FROM promoter_points WHERE promoter_id = u.id),0)::int points
           FROM users u WHERE u.id = ANY($1) ORDER BY points DESC, revenue DESC LIMIT 5`, [ids]),
  ]);

  const leads = leadAgg.rows[0];
  return {
    kpis: {
      revenue_today: n(revToday.rows[0].v),
      revenue_month: n(revMonth.rows[0].v),
      units_month: n(unitsMonth.rows[0].v),
      leads_total: leads.total,
      leads_verified: leads.verified,
      leads_converted: leads.converted,
      conversion_rate: leads.total ? Math.round((leads.converted / leads.total) * 100) : 0,
      checkins_today: checkins.rows[0].v,
      in_radius_rate: Math.round(n(inRadius.rows[0].v) * 100),
      points: n(pts.rows[0].v),
    },
    sales_7d: series.rows.map((r) => ({ label: r.label.trim(), day: r.iso, total: n(r.total) })),
    funnel: { captured: leads.total, verified: leads.verified, converted: leads.converted },
    leaderboard: board.rows.map((r) => ({ id: r.id, name: r.name, revenue: n(r.revenue), points: r.points })),
  };
}

// Build the IST date predicate for a period. 'today' = the IST business day,
// 'month' = the calendar month to date. (Week kept as a fallback.)
function periodPredicate(period, col = 'created_at') {
  if (period === 'month') return `date_trunc('month', ${col}) = date_trunc('month', current_date)`;
  if (period === 'week') return `${col} > now() - interval '7 days'`;
  return `${col}::date = current_date`;
}

// Promoter's own dashboard. The period (today | month) scopes the ACTIVITY counts
// — leads, sales, revenue, points. "Cash / UPI in hand" is a point-in-time balance
// = ALL sales by mode minus ALL handovers (the money physically held right now),
// so handing over an earlier day's cash can never drag a period's in-hand negative.
export async function promoterSummary(promoterId, period) {
  const p = period === 'month' ? 'month' : period === 'week' ? 'week' : 'today';
  const salesP = periodPredicate(p, 'created_at');
  const [stock, agg, inhand, pts] = await Promise.all([
    query(
      `SELECT p.sku, p.name,
              COALESCE(
                (SELECT opening + refill - sold FROM inventory WHERE promoter_id=$1 AND product_id=p.id AND day=current_date),
                (SELECT closing FROM inventory WHERE promoter_id=$1 AND product_id=p.id AND day<current_date ORDER BY day DESC LIMIT 1),
                0) AS in_hand
       FROM products p WHERE p.active = true ORDER BY p.sku`, [promoterId]),
    query(`SELECT
             (SELECT count(*) FROM leads WHERE promoter_id=$1 AND ${salesP}) AS leads,
             (SELECT count(*) FROM sales WHERE promoter_id=$1 AND ${salesP}) AS sales_count,
             (SELECT coalesce(sum(total),0) FROM sales WHERE promoter_id=$1 AND ${salesP}) AS revenue`, [promoterId]),
    query(`SELECT
             (SELECT coalesce(sum(total),0) FROM sales WHERE promoter_id=$1 AND payment_mode='cash')
               - (SELECT coalesce(sum(amount),0) FROM collections WHERE promoter_id=$1) AS cash,
             (SELECT coalesce(sum(total),0) FROM sales WHERE promoter_id=$1 AND payment_mode='upi')
               - (SELECT coalesce(sum(upi_amount),0) FROM collections WHERE promoter_id=$1) AS upi`, [promoterId]),
    query(`SELECT coalesce(sum(points),0) v FROM promoter_points WHERE promoter_id=$1 AND ${salesP}`, [promoterId]),
  ]);
  return {
    stock_by_sku: stock.rows.map((r) => ({ sku: r.sku, name: r.name, in_hand: n(r.in_hand) })),
    leads: n(agg.rows[0].leads),
    sales_count: n(agg.rows[0].sales_count),
    revenue: n(agg.rows[0].revenue),
    cash_in_hand: Math.max(0, n(inhand.rows[0].cash)),
    upi_in_hand: Math.max(0, n(inhand.rows[0].upi)),
    points: n(pts.rows[0].v),
  };
}

// Current cumulative cash & UPI a promoter holds (all sales by mode minus all
// handovers). Used to block handing over more than they have (#8).
export async function currentBalance(promoterId) {
  const { rows } = await query(
    `SELECT
       (SELECT coalesce(sum(total),0) FROM sales WHERE promoter_id=$1 AND payment_mode='cash')
         - (SELECT coalesce(sum(amount),0) FROM collections WHERE promoter_id=$1) AS cash,
       (SELECT coalesce(sum(total),0) FROM sales WHERE promoter_id=$1 AND payment_mode='upi')
         - (SELECT coalesce(sum(upi_amount),0) FROM collections WHERE promoter_id=$1) AS upi`,
    [promoterId]);
  return { cash: Math.max(0, n(rows[0].cash)), upi: Math.max(0, n(rows[0].upi)) };
}

// ---- CSV export row sources (inclusive date range on the IST business day) ----
export async function exportSales(ids, from, to) {
  const { rows } = await query(
    `SELECT s.invoice_no, to_char(s.created_at,'YYYY-MM-DD HH24:MI') AS dt, u.name AS promoter, u.emp_code AS code,
            c.name AS customer, c.mobile AS customer_mobile,
            s.payment_mode, s.total,
            CASE WHEN s.oversold THEN 'OVERSOLD' ELSE '' END AS oversold,
            (SELECT string_agg(p.sku || ' x' || si.qty, '; ')
             FROM sale_items si JOIN products p ON p.id = si.product_id WHERE si.sale_id = s.id) AS items
     FROM sales s JOIN users u ON u.id = s.promoter_id
     LEFT JOIN customers c ON c.id = s.customer_id
     WHERE s.promoter_id = ANY($1) AND s.created_at::date BETWEEN $2 AND $3
     ORDER BY s.created_at DESC`, [ids, from, to]);
  return rows;
}

export async function exportLeads(ids, from, to) {
  const { rows } = await query(
    `SELECT u.name AS promoter, u.emp_code AS code, l.name, l.mobile, l.health_concern, l.product_interest,
            l.source, l.verify_status, l.status, to_char(l.created_at,'YYYY-MM-DD HH24:MI') AS dt
     FROM leads l JOIN users u ON u.id = l.promoter_id
     WHERE l.promoter_id = ANY($1) AND l.created_at::date BETWEEN $2 AND $3
     ORDER BY l.created_at DESC`, [ids, from, to]);
  return rows;
}

export async function exportAttendance(ids, from, to) {
  const { rows } = await query(
    `SELECT u.name AS promoter, u.emp_code AS code, loc.name AS location, a.shift,
            to_char(a.check_in_at,'YYYY-MM-DD HH24:MI') AS checkin,
            to_char(a.check_out_at,'YYYY-MM-DD HH24:MI') AS checkout,
            a.in_radius, v.name AS verified_by,
            a.gps_lat, a.gps_lng,
            CASE WHEN a.gps_lat IS NOT NULL AND a.gps_lng IS NOT NULL
                 THEN 'https://maps.google.com/?q=' || a.gps_lat || ',' || a.gps_lng END AS map_url
     FROM attendance a JOIN users u ON u.id = a.promoter_id
     LEFT JOIN locations loc ON loc.id = a.location_id
     LEFT JOIN users v ON v.id = a.verified_by
     WHERE a.promoter_id = ANY($1) AND a.check_in_at::date BETWEEN $2 AND $3
     ORDER BY a.check_in_at DESC`, [ids, from, to]);
  return rows;
}

export async function exportCollections(ids, from, to) {
  const { rows } = await query(
    `SELECT u.name AS promoter, u.emp_code AS code, to_char(c.day,'YYYY-MM-DD') AS day,
            COALESCE((SELECT sum(total) FROM sales s WHERE s.promoter_id=c.promoter_id
                      AND s.payment_mode='cash' AND s.created_at::date=c.day),0) AS expected_cash,
            c.amount AS handed_cash,
            COALESCE((SELECT sum(total) FROM sales s WHERE s.promoter_id=c.promoter_id
                      AND s.payment_mode='upi' AND s.created_at::date=c.day),0) AS expected_upi,
            c.upi_amount AS handed_upi, c.status, v.name AS confirmed_by,
            to_char(c.confirmed_at,'YYYY-MM-DD HH24:MI') AS confirmed_at
     FROM collections c JOIN users u ON u.id=c.promoter_id LEFT JOIN users v ON v.id=c.confirmed_by
     WHERE c.promoter_id = ANY($1) AND c.day BETWEEN $2::date AND $3::date
     ORDER BY c.day DESC, u.name`, [ids, from, to]);
  return rows;
}

// ---- cash ledger (#4) ----
// Running cash & UPI balance per promoter per day. Opening = prior day's closing
// (carry-forward of whatever wasn't handed over); first opening = 0. The window
// runs over the promoter's FULL history so the balance carried into [from,to] is
// correct; the date range only limits which rows are returned.
//   opening + collected - handed = balance (closing) -> next day's opening
export async function cashLedger(ids, from, to) {
  const { rows } = await query(
    `WITH days AS (
       SELECT promoter_id, day FROM (
         SELECT promoter_id, created_at::date AS day FROM sales WHERE promoter_id = ANY($1)
         UNION
         SELECT promoter_id, day FROM collections WHERE promoter_id = ANY($1)
       ) u GROUP BY promoter_id, day
     ),
     daily AS (
       SELECT d.promoter_id, d.day,
         COALESCE((SELECT sum(total) FROM sales s WHERE s.promoter_id=d.promoter_id AND s.payment_mode='cash' AND s.created_at::date=d.day),0) AS collected_cash,
         COALESCE((SELECT sum(amount) FROM collections c WHERE c.promoter_id=d.promoter_id AND c.day=d.day),0) AS handed_cash,
         COALESCE((SELECT sum(total) FROM sales s WHERE s.promoter_id=d.promoter_id AND s.payment_mode='upi' AND s.created_at::date=d.day),0) AS collected_upi,
         COALESCE((SELECT sum(upi_amount) FROM collections c WHERE c.promoter_id=d.promoter_id AND c.day=d.day),0) AS handed_upi
       FROM days d
     ),
     ledger AS (
       SELECT promoter_id, day, collected_cash, handed_cash, collected_upi, handed_upi,
         sum(collected_cash - handed_cash) OVER w AS balance_cash,
         sum(collected_upi - handed_upi) OVER w AS balance_upi
       FROM daily
       WINDOW w AS (PARTITION BY promoter_id ORDER BY day ROWS BETWEEN UNBOUNDED PRECEDING AND CURRENT ROW)
     )
     SELECT u.name AS promoter, u.emp_code AS code, to_char(l.day,'YYYY-MM-DD') AS day,
            (l.balance_cash - (l.collected_cash - l.handed_cash)) AS opening_cash,
            l.collected_cash, l.handed_cash, l.balance_cash,
            (l.balance_upi - (l.collected_upi - l.handed_upi)) AS opening_upi,
            l.collected_upi, l.handed_upi, l.balance_upi
     FROM ledger l JOIN users u ON u.id = l.promoter_id
     WHERE l.day BETWEEN $2::date AND $3::date
     ORDER BY u.name, l.day DESC`, [ids, from, to]);
  return rows.map((r) => ({
    promoter: r.promoter, code: r.code, day: r.day,
    opening_cash: n(r.opening_cash), collected_cash: n(r.collected_cash), handed_cash: n(r.handed_cash), balance_cash: n(r.balance_cash),
    opening_upi: n(r.opening_upi), collected_upi: n(r.collected_upi), handed_upi: n(r.handed_upi), balance_upi: n(r.balance_upi),
  }));
}

export async function exportInventory(ids, from, to) {
  const { rows } = await query(
    `SELECT u.name AS promoter, u.emp_code AS code, p.sku, i.opening, i.refill, i.sold, i.closing,
            to_char(i.day,'YYYY-MM-DD') AS day
     FROM inventory i JOIN users u ON u.id = i.promoter_id JOIN products p ON p.id = i.product_id
     WHERE i.promoter_id = ANY($1) AND i.day BETWEEN $2::date AND $3::date
     ORDER BY i.day DESC, p.sku`, [ids, from, to]);
  return rows;
}
