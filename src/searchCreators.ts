import * as dotenv from 'dotenv';
dotenv.config();

import { Pool } from 'pg';
import type { BrandProfile, Creator, RankedCreator } from './types';

const pool = new Pool({ connectionString: process.env.DATABASE_URL });

const SEMANTIC_WEIGHT  = 0.45;
const PROJECTED_WEIGHT = 0.55;
const VECTOR_CANDIDATES = 50;
const TOP_K = 10;

let embedder: any;
async function embedQuery(query: string): Promise<number[]> {
  if (!embedder) {
    const { pipeline } = await import('@xenova/transformers');
    embedder = await pipeline('feature-extraction', 'Xenova/all-MiniLM-L6-v2');
  }
  const result = await embedder(query, { pooling: 'mean', normalize: true });
  return Array.from(result.data as Float32Array);
}

function normaliseProjectedScore(score: number): number {
  return Math.max(0, Math.min(1, (score - 60) / 40));
}

interface CreatorRow {
  username: string;
  bio: string;
  content_style_tags: string[];
  projected_score: number;
  follower_count: number;
  total_gmv_30d: number;
  avg_views_30d: number;
  engagement_rate: number;
  gpm: number;
  major_gender: 'MALE' | 'FEMALE';
  gender_pct: number;
  age_ranges: string[];
  semantic_score: number;
}

function brandAlignmentBonus(creator: CreatorRow, brand: BrandProfile): number {
  let bonus = 0;
  const creatorTags = new Set(creator.content_style_tags);
  const matchingIndustries = brand.industries.filter(ind => creatorTags.has(ind));
  bonus += Math.min(0.08, matchingIndustries.length * 0.04);
  if (creator.major_gender === brand.target_audience.gender) bonus += 0.04;
  const brandAges = new Set(brand.target_audience.age_ranges);
  const ageOverlap = (creator.age_ranges ?? []).filter(a => brandAges.has(a)).length;
  if (ageOverlap > 0) bonus += Math.min(0.03, ageOverlap * 0.015);
  return bonus;
}

function computeFinalScore(semantic: number, projected: number, bonus: number): number {
  return semantic * SEMANTIC_WEIGHT + normaliseProjectedScore(projected) * PROJECTED_WEIGHT + bonus;
}

export async function searchCreators(
  query: string,
  brandProfile: BrandProfile
): Promise<RankedCreator[]> {
  const queryEmbedding = await embedQuery(query);
  const vectorLiteral = `[${queryEmbedding.join(',')}]`;

  const { rows } = await pool.query<CreatorRow>(
    `SELECT
       username, bio, content_style_tags, projected_score,
       follower_count, total_gmv_30d, avg_views_30d,
       engagement_rate, gpm,
       major_gender, gender_pct, age_ranges,
       1 - (embedding <=> $1::vector) AS semantic_score
     FROM creators
     ORDER BY embedding <=> $1::vector
     LIMIT $2`,
    [vectorLiteral, VECTOR_CANDIDATES]
  );

  const ranked: RankedCreator[] = rows.map(row => {
    const bonus = brandAlignmentBonus(row, brandProfile);
    const finalScore = computeFinalScore(row.semantic_score, Number(row.projected_score), bonus);

    return {
      username: row.username,
      bio: row.bio,
      content_style_tags: row.content_style_tags as Creator['content_style_tags'],
      projected_score: Number(row.projected_score),
      metrics: {
        follower_count: Number(row.follower_count),
        total_gmv_30d: Number(row.total_gmv_30d),
        avg_views_30d: Number(row.avg_views_30d),
        engagement_rate: Number(row.engagement_rate),
        gpm: Number(row.gpm),
        demographics: {
          major_gender: row.major_gender,
          gender_pct: Number(row.gender_pct),
          age_ranges: row.age_ranges,
        },
      },
      scores: {
        semantic_score: Math.round(row.semantic_score * 10000) / 10000,
        projected_score: Number(row.projected_score),
        final_score: Math.round(finalScore * 10000) / 10000,
      },
    };
  });

  ranked.sort((a, b) => b.scores.final_score - a.scores.final_score);
  return ranked.slice(0, TOP_K);
}
