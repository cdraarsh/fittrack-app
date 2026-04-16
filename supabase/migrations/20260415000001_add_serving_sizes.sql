-- Add serving size fields so countable foods (eggs, roti, banana, etc.)
-- can be logged by piece count instead of grams.

ALTER TABLE ft_foods
  ADD COLUMN IF NOT EXISTS serving_size_g  numeric(6,1) DEFAULT NULL,
  ADD COLUMN IF NOT EXISTS serving_unit    text         DEFAULT NULL;

-- Update countable Indian staples with per-piece weights
UPDATE ft_foods SET serving_size_g = 50,  serving_unit = 'egg'     WHERE lower(name) = 'egg whole';
UPDATE ft_foods SET serving_size_g = 33,  serving_unit = 'white'   WHERE lower(name) = 'egg white';
UPDATE ft_foods SET serving_size_g = 30,  serving_unit = 'roti'    WHERE lower(name) = 'roti chapati';
UPDATE ft_foods SET serving_size_g = 80,  serving_unit = 'paratha' WHERE lower(name) = 'paratha plain';
UPDATE ft_foods SET serving_size_g = 100, serving_unit = 'paratha' WHERE lower(name) = 'aloo paratha';
UPDATE ft_foods SET serving_size_g = 30,  serving_unit = 'idli'    WHERE lower(name) = 'idli';
UPDATE ft_foods SET serving_size_g = 65,  serving_unit = 'dosa'    WHERE lower(name) = 'dosa plain';
UPDATE ft_foods SET serving_size_g = 120, serving_unit = 'banana'  WHERE lower(name) = 'banana';
UPDATE ft_foods SET serving_size_g = 150, serving_unit = 'apple'   WHERE lower(name) = 'apple';
UPDATE ft_foods SET serving_size_g = 200, serving_unit = 'mango'   WHERE lower(name) = 'mango';
UPDATE ft_foods SET serving_size_g = 130, serving_unit = 'orange'  WHERE lower(name) = 'orange';
UPDATE ft_foods SET serving_size_g = 6,   serving_unit = 'almond'  WHERE lower(name) = 'almonds';
