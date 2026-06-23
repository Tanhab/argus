-- Up Migration
CREATE OR REPLACE FUNCTION ensure_next_partition(p_parent regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  t_name     text;
  range_start date;
  range_end   date;
  part_name   text;
BEGIN
  -- table name without schema
  t_name := split_part(p_parent::text, '.', 2);
  IF t_name = '' THEN t_name := p_parent::text; END IF;

  range_start := (date_trunc('month', CURRENT_DATE) + interval '1 month')::date;
  range_end   := (date_trunc('month', CURRENT_DATE) + interval '2 months')::date;
  part_name   := format('%s_%s', t_name, to_char(range_start, 'YYYY_MM'));

  EXECUTE format(
    'CREATE TABLE IF NOT EXISTS %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
    part_name, p_parent, range_start, range_end
  );
END;
$$;

ALTER TABLE api_keys ADD COLUMN expires_at TIMESTAMPTZ;

-- Down Migration
ALTER TABLE api_keys DROP COLUMN expires_at;
DROP FUNCTION ensure_next_partition(regclass);