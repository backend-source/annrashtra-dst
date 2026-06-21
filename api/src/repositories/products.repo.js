import { query } from '../config/db.js';

// Reads run inside the caller's transaction client so pricing is consistent with
// the rest of the sale write.
export async function getProductsByIds(client, ids) {
  const { rows } = await client.query(
    'SELECT id, name, price, active FROM products WHERE id = ANY($1)',
    [ids],
  );
  return rows;
}

export async function listAll() {
  const { rows } = await query('SELECT id, name, sku, price, active FROM products ORDER BY sku');
  return rows;
}

export async function updateFields(id, { price, active }) {
  const { rows } = await query(
    `UPDATE products
     SET price  = COALESCE($2, price),
         active = COALESCE($3, active)
     WHERE id = $1 RETURNING id, name, sku, price, active`,
    [id, price ?? null, active ?? null],
  );
  return rows[0] || null;
}
