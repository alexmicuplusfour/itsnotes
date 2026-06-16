INSERT INTO settings (key, value) VALUES
  ('PAGE_SIZE', '80')
ON CONFLICT (key) DO NOTHING;
