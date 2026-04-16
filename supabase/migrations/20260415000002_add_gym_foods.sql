-- Gym-focused foods: proteins, supplements, carb sources, dairy
-- Sources: USDA FoodData Central, manufacturer labels (MuscleBlaze, RiteBite, ON),
--          IFCT for Indian items. All per 100g unless noted.

INSERT INTO ft_foods (name, brand, kcal_100g, protein_100g, carbs_100g, fat_100g, source, serving_size_g, serving_unit) VALUES

-- ─── Protein Sources ─────────────────────────────────────────────────────────
('Tuna Canned Water',      '', 116, 25.5, 0.0,  1.0,  'manual', NULL,  NULL),
('Salmon Cooked',          '', 206, 28.0, 0.0,  10.0, 'manual', NULL,  NULL),
('Turkey Breast Cooked',   '', 135, 30.0, 0.0,  1.0,  'manual', NULL,  NULL),
('Tofu Firm',              '', 76,  8.0,  1.9,  4.8,  'manual', NULL,  NULL),
('Cottage Cheese Low Fat', '', 72,  12.4, 3.4,  1.0,  'manual', NULL,  NULL),
('Edamame Cooked',         '', 122, 11.9, 8.9,  5.2,  'manual', NULL,  NULL),

-- ─── Gym Supplements (per 100g powder) ───────────────────────────────────────
('Mass Gainer',            '', 388, 16.0, 72.0, 4.0,  'manual', 75,   'scoop'),
('Pre-Workout Powder',     '', 50,  0.0,  12.5, 0.0,  'manual', 10,   'scoop'),
('BCAA Powder',            '', 390, 90.0, 2.0,  0.0,  'manual', 10,   'scoop'),
('Creatine Monohydrate',   '', 0,   0.0,  0.0,  0.0,  'manual', 5,    'scoop'),
('Protein Bar',            '', 380, 28.0, 38.0, 10.0, 'manual', 60,   'bar'),
('Peanut Protein Bar',     '', 403, 30.0, 32.0, 14.0, 'manual', 60,   'bar'),

-- ─── Carb Sources / Gym Fuel ─────────────────────────────────────────────────
('Rice Cakes',             '', 387, 7.5,  82.0, 2.8,  'manual', 9,    'cake'),
('Quinoa Cooked',          '', 120, 4.4,  21.3, 1.9,  'manual', NULL,  NULL),
('Pasta Cooked',           '', 158, 5.8,  31.0, 0.9,  'manual', NULL,  NULL),
('Oat Bran',               '', 246, 17.3, 66.2, 7.0,  'manual', NULL,  NULL),
('Sweet Corn Boiled',      '', 86,  3.2,  19.0, 1.2,  'manual', NULL,  NULL),
('Dates',                  '', 277, 1.8,  75.0, 0.2,  'manual', 8,    'date'),

-- ─── Dairy / High Protein ────────────────────────────────────────────────────
('Skimmed Milk',           '', 34,  3.4,  5.0,  0.1,  'manual', NULL,  NULL),
('Protein Yogurt',         '', 66,  10.0, 4.0,  1.0,  'manual', 200,  'cup'),
('Paneer Low Fat',         '', 174, 19.1, 3.4,  9.3,  'manual', NULL,  NULL),

-- ─── Fats / Micronutrient-dense ──────────────────────────────────────────────
('Flaxseeds',              '', 534, 18.3, 28.9, 42.2, 'manual', NULL,  NULL),
('Chia Seeds',             '', 486, 16.5, 42.1, 30.7, 'manual', NULL,  NULL),
('Cashews',                '', 553, 18.2, 30.2, 43.9, 'manual', NULL,  NULL),
('Sunflower Seeds',        '', 584, 20.8, 20.0, 51.5, 'manual', NULL,  NULL)

ON CONFLICT (lower(name), lower(brand)) DO NOTHING;
