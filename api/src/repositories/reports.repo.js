import { query } from '../config/db.js';

const n = (v) => Number(v) || 0;

// All aggregates for the overview, scoped to a set of promoter ids. An empty set
// (e.g. a supervisor with no promoters) yields zeros — ANY('{}') matches nothing.
export async function overview(ids) {
  const [revToday, revWeek, unitsWeek, leadAgg, checkins, inRadius, pts, series, board] = await Promise.all([
    query(`SELECT coalesce(sum(total),0) v FROM sales WHERE promoter_id = ANY($1) AND created_at::date = current_date`, [ids]),
    query(`SELECT coalesce(sum(total),0) v FROM sales WHERE promoter_id = ANY($1) AND created_at > now() - interval '7 days'`, [ids]),
    query(`SELECT coalesce(sum(si.qty),0) v FROM sale_items si JOIN sales s ON s.id = si.sale_id
           WHERE s.promoter_id = ANY($1) AND s.created_at > now() - interval '7 days'`, [ids]),
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
      revenue_week: n(revWeek.rows[0].v),
      units_week: n(unitsWeek.rows[0].v),
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
