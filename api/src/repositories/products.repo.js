import { query } from '../config/db.js';

// Reads run inside the caller's transaction client so pricing is consistent with
// the rest of the sale write.
export async function getProductsByIds(client, ids) {
  const { rows } = await client.query(
    'SELECT id, name, price, active, points FROM products WHERE id = ANY($1)',
    [ids],
  );
  return rows;
}

export async function listAll() {
  const { rows } = await query('SELECT id, name, sku, price, active, points FROM products ORDER BY sku');
  return rows;
}

export async function insertProduct({ name, sku, price, points }) {
  const { rows } = await query(
    `INSERT INTO products (name, sku, price, points, active)
     VALUES ($1, $2, $3, $4, true)
     RETURNING id, name, sku, price, active, points`,
    [name, sku, price, points ?? 0],
  );
  return rows[0];
}

export async function updateFields(id, { price, active, points }) {
  const { rows } = await query(
    `UPDATE products
     SET price  = COALESCE($2, price),
         active = COALESCE($3, active),
         points = COALESCE($4, points)
     WHERE id = $1 RETURNING id, name, sku, price, active, points`,
    [id, price ?? null, active ?? null, points ?? null],
  );
  return rows[0] || null;
}
