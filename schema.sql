CREATE EXTENSION IF NOT EXISTS vector;

DROP TABLE IF EXISTS creators;

CREATE TABLE creators (
  id               SERIAL PRIMARY KEY,
  username         TEXT NOT NULL UNIQUE,
  bio              TEXT NOT NULL,
  content_style_tags TEXT[] NOT NULL,
  projected_score  NUMERIC NOT NULL,
  follower_count   BIGINT,
  total_gmv_30d    NUMERIC,
  avg_views_30d    BIGINT,
  engagement_rate  NUMERIC,
  gpm              NUMERIC,
  major_gender     TEXT,
  gender_pct       NUMERIC,
  age_ranges       TEXT[],
  embedding        vector(384)   -- all-MiniLM-L6-v2 outputs 384 dimensions
);

CREATE INDEX creators_embedding_hnsw
  ON creators
  USING hnsw (embedding vector_cosine_ops)
  WITH (m = 16, ef_construction = 128);
