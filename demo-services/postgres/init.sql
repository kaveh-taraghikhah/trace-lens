-- Demo e-commerce schema for the TraceLens demo mesh
CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  price_cents INTEGER NOT NULL,
  stock INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY,
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL,
  customer_id TEXT NOT NULL,
  total_cents INTEGER NOT NULL,
  status TEXT NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

INSERT INTO products (id, name, price_cents, stock) VALUES
  ('prod_tee', 'TraceLens Tee', 2900, 100),
  ('prod_mug', 'Observability Mug', 1800, 50),
  ('prod_sticker', 'Span Sticker Pack', 500, 500)
ON CONFLICT (id) DO NOTHING;
