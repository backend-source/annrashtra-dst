// Reads run inside the caller's transaction client so pricing is consistent with
// the rest of the sale write.
export async function getProductsByIds(client, ids) {
  const { rows } = await client.query(
    'SELECT id, name, price, active FROM products WHERE id = ANY($1)',
    [ids],
  );
  return rows;
}
