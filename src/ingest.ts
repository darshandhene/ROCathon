import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { Pool } from 'pg';
import type { Creator } from './types';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

// Lazy-loaded embedder — downloads the model (~25MB) on first call, then caches it
let embedder: any;
async function getEmbedder() {
  if (!embedder) {
    // Dynamic import required for ESM compatibility with @xenova/transformers
    const { pipeline } = await import('@xenova/transformers');
    console.log('Loading embedding model (first run downloads ~25MB, cached after)...');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
    console.log('Model ready.');
  }
  return embedder;
}

// Build the text that gets embedded for each creator.
function buildEmbedText(creator: Creator): string {
  const tags = creator.content_style_tags.join(', ');
  return `${creator.bio} | Categories: ${tags}`;
}

// Embed a single string → 384-dimensional vector
async function embed(text: string): Promise<number[]> {
  const pipe = await getEmbedder();
  const result = await pipe(text, { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

async function main() {
  const dataPath = path.join(__dirname, '../creators.json');
  const creators: Creator[] = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));
  console.log(`Loaded ${creators.length} creators from creators.json`);

  const client = await pool.connect();
  try {
    // Apply schema (idempotent — drops and recreates table)
    const schemaPath = path.join(__dirname, '../schema.sql');
    const schema = fs.readFileSync(schemaPath, 'utf-8');
    await client.query(schema);
    console.log('Schema applied');

    let inserted = 0;
    for (const c of creators) {
      const text = buildEmbedText(c);
      const embedding = await embed(text);
      const m = c.metrics;
      const d = m.demographics;

      await client.query(
        `INSERT INTO creators (
          username, bio, content_style_tags, projected_score,
          follower_count, total_gmv_30d, avg_views_30d,
          engagement_rate, gpm,
          major_gender, gender_pct, age_ranges,
          embedding
        ) VALUES (
          $1, $2, $3, $4,
          $5, $6, $7,
          $8, $9,
          $10, $11, $12,
          $13
        )
        ON CONFLICT (username) DO UPDATE SET
          embedding = EXCLUDED.embedding,
          projected_score = EXCLUDED.projected_score`,
        [
          c.username,
          c.bio,
          c.content_style_tags,
          c.projected_score,
          m.follower_count,
          m.total_gmv_30d,
          m.avg_views_30d,
          m.engagement_rate,
          m.gpm,
          d.major_gender,
          d.gender_pct,
          d.age_ranges,
          `[${embedding.join(',')}]`,
        ]
      );

      inserted++;
      if (inserted % 20 === 0) console.log(`  Inserted ${inserted}/${creators.length}...`);
    }

    console.log(`\nDone. Inserted/updated ${inserted} creators.`);
  } finally {
    client.release();
    await pool.end();
  }
}

main().catch(err => {
  console.error('Ingest failed:', err);
  process.exit(1);
});
