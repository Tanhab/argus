-- Up Migration
-- Forward-fix: prod may already have check_results_2026_07 from rollover while
-- 1782500000000_check-results-july-partition failed on CREATE without IF NOT EXISTS.
CREATE TABLE IF NOT EXISTS check_results_2026_07
  PARTITION OF check_results
  FOR VALUES FROM ('2026-07-01') TO ('2026-08-01');

CREATE TABLE IF NOT EXISTS check_results_2026_08
  PARTITION OF check_results
  FOR VALUES FROM ('2026-08-01') TO ('2026-09-01');

CREATE OR REPLACE FUNCTION ensure_next_partition(p_parent regclass)
RETURNS void
LANGUAGE plpgsql
AS $$
DECLARE
  t_name        text;
  month_offset  int;
  range_start   date;
  range_end     date;
  part_name     text;
BEGIN
  t_name := split_part(p_parent::text, '.', 2);
  IF t_name = '' THEN t_name := p_parent::text; END IF;

  FOR month_offset IN 0..1 LOOP
    range_start := (date_trunc('month', CURRENT_DATE) + make_interval(months => month_offset))::date;
    range_end   := (date_trunc('month', CURRENT_DATE) + make_interval(months => month_offset + 1))::date;
    part_name   := format('%s_%s', t_name, to_char(range_start, 'YYYY_MM'));

    EXECUTE format(
      'CREATE TABLE IF NOT EXISTS %I PARTITION OF %s FOR VALUES FROM (%L) TO (%L)',
      part_name, p_parent, range_start, range_end
    );
  END LOOP;
END;
$$;

-- Down Migration
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
