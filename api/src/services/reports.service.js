import { query } from '../config/db.js';
import * as repo from '../repositories/reports.repo.js';

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
