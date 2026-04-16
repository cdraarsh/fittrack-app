-- ft_foods: shared food database (Indian staples + cached Open Food Facts results)
-- Run this in the Supabase SQL editor or via supabase db push

CREATE TABLE IF NOT EXISTS ft_foods (
  id           uuid    DEFAULT gen_random_uuid() PRIMARY KEY,
  name         text    NOT NULL,
  brand        text    NOT NULL DEFAULT '',
  kcal_100g    integer NOT NULL,
  protein_100g numeric(5,1) NOT NULL DEFAULT 0,
  carbs_100g   numeric(5,1) NOT NULL DEFAULT 0,
  fat_100g     numeric(5,1) NOT NULL DEFAULT 0,
  source       text    NOT NULL DEFAULT 'manual', -- 'manual' | 'openfoodfacts'
  created_at   timestamptz DEFAULT now()
);

-- Case-insensitive search index
CREATE INDEX IF NOT EXISTS ft_foods_name_lower ON ft_foods (lower(name));
-- Prevent duplicate caching of OFF results
CREATE UNIQUE INDEX IF NOT EXISTS ft_foods_name_brand_unique ON ft_foods (lower(name), lower(brand));

-- No RLS needed — this is a shared public food reference table, not user data.
-- The service role key is used for all reads/writes from the API route.

-- ─── Indian Staples Seed ──────────────────────────────────────────────────────
-- Source: IFCT (Indian Food Composition Tables) + NIN India
-- All values per 100g unless noted. Cooked weights for grains/legumes.

INSERT INTO ft_foods (name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, source) VALUES

-- Lentils & Legumes (cooked)
('Toor Dal',              '', 116, 6.8,  20.5,  0.4,  'manual'),
('Masoor Dal',            '', 116, 9.0,  20.0,  0.4,  'manual'),
('Moong Dal',             '', 105, 7.1,  19.5,  0.4,  'manual'),
('Chana Dal',             '', 164, 8.9,  27.3,  2.6,  'manual'),
('Rajma',                 '', 127, 8.7,  22.8,  0.5,  'manual'),
('Chole Chickpeas',       '', 164, 8.9,  27.4,  2.6,  'manual'),
('Dal Makhani',           '', 150, 8.0,  18.0,  5.0,  'manual'),
('Moong Bean Sprouts',    '', 30,  3.0,  5.9,   0.2,  'manual'),
('Soya Chunks Dry',       '', 345, 52.0, 33.0,  0.5,  'manual'),

-- Grains & Breads (cooked, except where noted dry)
('Rice Cooked',           '', 130, 2.7,  28.2,  0.3,  'manual'),
('Roti Chapati',          '', 300, 8.5,  56.7,  4.0,  'manual'),
('Paratha Plain',         '', 300, 7.0,  48.9,  9.0,  'manual'),
('Aloo Paratha',          '', 277, 7.0,  43.0,  9.0,  'manual'),
('Poha Flattened Rice',   '', 369, 6.3,  81.4,  0.5,  'manual'),
('Upma',                  '', 150, 4.0,  24.0,  4.0,  'manual'),
('Idli',                  '', 58,  2.0,  11.6,  0.1,  'manual'),
('Dosa Plain',            '', 133, 4.0,  24.1,  2.5,  'manual'),
('Khichdi',               '', 136, 6.0,  24.2,  2.0,  'manual'),
('White Bread',           '', 265, 9.0,  50.6,  3.2,  'manual'),
('Brown Bread',           '', 247, 11.8, 47.5,  3.5,  'manual'),
('Oats',                  '', 389, 16.9, 66.3,  6.9,  'manual'),
('Makhana Fox Nuts',      '', 347, 9.7,  76.9,  0.1,  'manual'),
('Sattu',                 '', 406, 22.0, 65.2,  6.0,  'manual'),

-- Dairy
('Paneer',                '', 265, 18.3, 1.2,   20.8, 'manual'),
('Paneer Bhurji',         '', 228, 12.0, 7.0,   17.0, 'manual'),
('Curd Dahi Full Fat',    '', 98,  11.0, 3.4,   4.5,  'manual'),
('Curd Dahi Low Fat',     '', 63,  8.0,  4.5,   1.5,  'manual'),
('Milk Full Fat',         '', 67,  3.4,  4.4,   4.1,  'manual'),
('Milk Toned',            '', 58,  3.1,  4.8,   3.0,  'manual'),
('Lassi Sweet',           '', 83,  3.5,  10.0,  3.3,  'manual'),
('Greek Yogurt',          '', 59,  10.0, 3.6,   0.4,  'manual'),
('Ghee',                  '', 900, 0.0,  0.0,   99.5, 'manual'),

-- Eggs & Poultry
('Egg Whole',             '', 155, 13.0, 1.1,   11.0, 'manual'),
('Egg White',             '', 52,  11.0, 0.7,   0.2,  'manual'),
('Chicken Breast Cooked', '', 165, 31.0, 0.0,   3.6,  'manual'),
('Chicken Curry',         '', 150, 15.0, 5.0,   8.0,  'manual'),
('Chicken Biryani',       '', 195, 12.0, 27.5,  4.0,  'manual'),

-- Vegetables
('Potato Boiled',         '', 87,  1.9,  20.1,  0.1,  'manual'),
('Sweet Potato',          '', 86,  1.6,  20.1,  0.1,  'manual'),
('Palak Spinach',         '', 23,  2.9,  3.6,   0.4,  'manual'),
('Broccoli',              '', 34,  2.8,  6.6,   0.4,  'manual'),
('Cauliflower Gobi',      '', 25,  1.9,  5.0,   0.3,  'manual'),
('Tomato',                '', 18,  0.9,  3.9,   0.2,  'manual'),
('Onion',                 '', 40,  1.1,  9.3,   0.1,  'manual'),
('Carrot',                '', 41,  0.9,  9.6,   0.2,  'manual'),

-- Fruits
('Banana',                '', 89,  1.1,  22.8,  0.3,  'manual'),
('Apple',                 '', 52,  0.3,  13.8,  0.2,  'manual'),
('Mango',                 '', 60,  0.8,  15.0,  0.4,  'manual'),
('Orange',                '', 47,  0.9,  11.8,  0.1,  'manual'),
('Watermelon',            '', 30,  0.6,  7.6,   0.2,  'manual'),
('Papaya',                '', 43,  0.5,  10.8,  0.3,  'manual'),
('Grapes',                '', 69,  0.7,  18.1,  0.2,  'manual'),

-- Nuts, Seeds & Fats
('Almonds',               '', 579, 21.2, 21.6,  49.9, 'manual'),
('Peanuts Roasted',       '', 567, 25.8, 16.1,  49.2, 'manual'),
('Peanut Butter',         '', 588, 25.0, 20.0,  50.0, 'manual'),
('Walnuts',               '', 654, 15.2, 13.7,  65.2, 'manual'),
('Coconut Oil',           '', 862, 0.0,  0.0,   100.0,'manual'),
('Olive Oil',             '', 884, 0.0,  0.0,   100.0,'manual'),

-- Protein Supplements
('Whey Protein',          '', 400, 80.0, 5.0,   5.0,  'manual'),
('Casein Protein',        '', 370, 80.0, 4.0,   3.0,  'manual'),

-- Prepared Dishes
('Sambar',                '', 63,  3.0,  9.0,   2.0,  'manual'),
('Curd Rice',             '', 145, 5.0,  25.0,  3.0,  'manual'),
('Peanut Chikki',         '', 507, 14.8, 50.2,  28.1, 'manual')

ON CONFLICT (lower(name), lower(brand)) DO NOTHING;
