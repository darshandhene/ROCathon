import * as dotenv from 'dotenv';
dotenv.config();

import * as fs from 'fs';
import * as path from 'path';
import { searchCreators } from '../src/searchCreators';
import type { BrandProfile } from '../src/types';

// ─── Required deliverable profile & query ────────────────────────────────────
// Query specified in the challenge brief.
const QUERY = 'Affordable home decor for small apartments';

// brand_smart_home profile — adjust fields to match what the hackathon
// graders supply if they publish an exact definition.
const BRAND_SMART_HOME: BrandProfile = {
  id: 'brand_smart_home',
  industries: ['Home', 'Tools & Hardware', 'Phones & Electronics'],
  target_audience: {
    gender: 'FEMALE',
    age_ranges: ['18-24', '25-34', '35-44'],
  },
  gmv: 150000,
};

async function main() {
  console.log('Query :', QUERY);
  console.log('Brand :', BRAND_SMART_HOME.id);
  console.log('─'.repeat(60));

  const results = await searchCreators(QUERY, BRAND_SMART_HOME);

  // Pretty-print to console
  results.forEach((c, i) => {
    console.log(
      `${String(i + 1).padStart(2)}. @${c.username.padEnd(32)} ` +
      `final=${c.scores.final_score.toFixed(4)}  ` +
      `sem=${c.scores.semantic_score.toFixed(4)}  ` +
      `proj=${c.scores.projected_score}  ` +
      `gmv=$${c.metrics.total_gmv_30d.toLocaleString()}`
    );
  });

  // Write required JSON output
path.join(__dirname, '../output/brand_smart_home_results.json')

 const outPath = path.join(__dirname, '../output/brand_smart_home_results.json');
  fs.mkdirSync(path.dirname(outPath), { recursive: true });
  fs.writeFileSync(outPath, JSON.stringify(results, null, 2));
  console.log(`\nFull JSON written to ${outPath}`);
}

main().catch(err => {
  console.error(err);
  process.exit(1);
});
