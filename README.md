# RoC Hackathon — Hybrid Creator Search Engine

## How It Works

```
Query (natural language)
        │
        ▼
  Embed query via OpenAI text-embedding-3-small
        │
        ▼
  pgvector HNSW ANN search → top-50 by cosine similarity
        │
        ▼
  Hybrid re-ranking:
    final_score = (semantic × 0.45) + (projected_norm × 0.55) + brand_bonus
        │
        ▼
  Top-10 RankedCreator[]
```

### Why this formula satisfies the hard constraint

`projected_norm = (projected_score − 60) / 40` maps the 60–100 range to 0–1.

A creator with perfect vibe but **$0 GMV** (projected_score=60, norm=0) scores at most `1.0 × 0.45 = 0.45`.
A creator with good vibe (semantic=0.75) and **high GMV** (projected_score=100, norm=1) scores `0.75×0.45 + 1.0×0.55 = 0.89`.

Good vibe + high GMV beats perfect vibe + $0 GMV. ✓

### Brand alignment bonus (additive, up to ~0.15)
- +0.04 per matching industry tag (capped at +0.08)
- +0.04 for gender audience match
- +0.015 per overlapping age range (capped at +0.03)

---

## Setup

### 1. Clone + install

```bash
git clone <your-fork>
cd roc-hackathon
npm install
```

### 2. Configure environment

```bash
cp .env.example .env
# Fill in OPENAI_API_KEY and DATABASE_URL
```

### 3. Set up the database

**Option A — Supabase (recommended, no Docker):**

1. Create a free project at [supabase.com](https://supabase.com)
2. SQL Editor → run:
   ```sql
   CREATE EXTENSION IF NOT EXISTS vector;
   ```
3. Copy the **Session mode** connection string (port 5432) to `DATABASE_URL`

**Option B — Local Docker:**

```bash
docker run -d \
  --name pgvector \
  -e POSTGRES_PASSWORD=password \
  -e POSTGRES_DB=rocathon \
  -p 5432:5432 \
  pgvector/pgvector:pg16
```

Set `DATABASE_URL=postgresql://postgres:password@localhost:5432/rocathon`

### 4. Ingest creators

This runs `schema.sql` (creates table + HNSW index), then embeds all 200 creators
and inserts them. Takes ~30 seconds.

```bash
npm run ingest
```

### 5. Run demo

Runs the required query against the `brand_smart_home` profile and writes
`output/brand_smart_home_results.json`.

```bash
npm run demo
```

---

## Project Structure

```
.
├── data/
│   └── creators.json          # air-gapped dataset (200 creators)
├── output/
│   └── brand_smart_home_results.json   # required deliverable
├── scripts/
│   ├── ingest.ts              # embed + insert creators into pgvector
│   └── demo.ts                # run required demo query
├── src/
│   ├── searchCreators.ts      # main implementation
│   └── types.ts               # Creator, BrandProfile, RankedCreator
├── schema.sql                 # table + HNSW index DDL
├── .env.example
├── package.json
└── tsconfig.json
```

---

## Scoring Formula

| Signal | Weight | Notes |
|--------|--------|-------|
| `semantic_score` | 0.45 | Cosine similarity from pgvector (0–1) |
| `projected_norm` | 0.55 | `(projected_score − 60) / 40`, mapped to 0–1 |
| `brand_bonus` | 0–0.15 | Industry + gender + age overlap |

Tune `SEMANTIC_WEIGHT` / `PROJECTED_WEIGHT` in `src/searchCreators.ts` to experiment.
