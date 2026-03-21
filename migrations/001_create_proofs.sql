CREATE TABLE IF NOT EXISTS proofs (
  id          TEXT PRIMARY KEY,
  content     TEXT NOT NULL,
  iv          TEXT NOT NULL,
  tag         TEXT NOT NULL,
  data        TEXT NOT NULL,
  reference   TEXT,
  created_at  BIGINT NOT NULL,
  expires_at  BIGINT NOT NULL
);
