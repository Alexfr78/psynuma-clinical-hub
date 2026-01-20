-- Fix SCL-90-R scoring according to official Derogatis manual
-- Critical corrections:
-- 1. ANS: Remove item 2 (should be 9 items, not 10)
-- 2. DEP: Remove item 15 (should be 12 items, not 13)
-- Additional items (2, 19, 44, 59, 60, 64, 89) only contribute to global indices, not clinical scales

UPDATE assessment_templates
SET scoring = '{
  "SOM": {"label": "Somatización", "items": [1,4,12,27,40,42,48,49,52,53,56,58]},
  "OBS": {"label": "Obsesión-Compulsión", "items": [3,9,10,28,38,45,46,51,55,65]},
  "SEN": {"label": "Sensibilidad Interpersonal", "items": [6,21,34,36,37,41,61,69,73]},
  "DEP": {"label": "Depresión", "items": [5,14,20,22,26,29,30,31,32,54,71,79]},
  "ANS": {"label": "Ansiedad", "items": [17,23,33,39,57,72,78,80,86]},
  "HOS": {"label": "Hostilidad", "items": [11,24,63,67,74,81]},
  "FOB": {"label": "Ansiedad Fóbica", "items": [13,25,47,50,70,75,82]},
  "PAR": {"label": "Ideación Paranoide", "items": [8,18,43,68,76,83]},
  "PSI": {"label": "Psicoticismo", "items": [7,16,35,62,77,84,85,87,88,90]}
}'::jsonb,
updated_at = now()
WHERE code = 'SCL90_V1';