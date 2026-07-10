CREATE TABLE IF NOT EXISTS growth_snapshots (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  source text NOT NULL,
  window_key text NOT NULL,
  snapshot_date date NOT NULL,
  generated_at timestamptz NOT NULL,
  window_start timestamptz NULL,
  window_end timestamptz NULL,
  payload jsonb NOT NULL,
  payload_hash text NULL,
  schema_version integer NOT NULL DEFAULT 1,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS growth_snapshots_source_window_date_idx
  ON growth_snapshots (source, window_key, snapshot_date);

CREATE INDEX IF NOT EXISTS growth_snapshots_source_generated_idx
  ON growth_snapshots (source, generated_at DESC);

CREATE OR REPLACE FUNCTION growth_snapshots_set_updated_at()
RETURNS trigger AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS set_updated_at_growth_snapshots ON growth_snapshots;
CREATE TRIGGER set_updated_at_growth_snapshots
BEFORE UPDATE ON growth_snapshots
FOR EACH ROW
EXECUTE FUNCTION growth_snapshots_set_updated_at();
