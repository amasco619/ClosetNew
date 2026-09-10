#!/usr/bin/env npx tsx
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { generateOutfitPool } from '../constants/outfitRotation';
import { scoreItemForProfile, scoreOutfitCombo } from '../constants/outfitScoring';
import { RECOMMENDATION_ENGINE_VERSION } from '../constants/recommendationVersion';
import { classifyGarment } from '../server/classify-garment';
import type {
  Fabric, ItemCategory, OccasionTag, OutfitComponent, Pattern, PatternScale,
  UserProfile, WardrobeItem, WarmthBand, WeatherSnapshot,
} from '../constants/types';

const ROOT = process.cwd();
const SNAP = join(ROOT, 'docs/recommendation/africa/benchmark-v1/frozen-v1');
const INPUT = join(SNAP, 'benchmark-input');
const OUT = join(ROOT, 'docs/recommendation/africa/track-c/baseline-v3.7/raw-engine-output');
const RUN_DATE = '2026-09-10';
const FIXED_EPOCH = Date.parse(`${RUN_DATE}T12:00:00Z`);
const resume = process.argv.includes('--resume');
const prepareOnly = process.argv.includes('--prepare-only');

type Fixture = {
  id: string; category: ItemCategory; subType: string; pattern?: Pattern;
  patternScale?: PatternScale; fabric?: Fabric; colorFamily: string;
  occasionTags: OccasionTag[]; formalityLevel: number; warmthBand?: WarmthBand;
};
type Candidate = { id: string; description: string; components: string[]; fingerprint: string };
type CaseInput = {
  case_id: string; case_type: 'outfit_ranking' | 'occasion_distinction' | 'weather_context';
  title: string; scenario_text: string; scenario_tag: OccasionTag;
  candidates: Candidate[]; weather: WeatherSnapshot | null;
};

const sha256 = (value: Buffer | string) =>
  createHash('sha256').update(value).digest('hex');
const stableJson = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

function splitCells(line: string) {
  return line.split('|').slice(1, -1).map((cell) => cell.trim());
}

function parseFixtures(): Map<string, Fixture> {
  const validFabric = new Set<Fabric>([
    'cotton', 'silk', 'denim', 'wool', 'linen', 'lace', 'synthetic', 'leather',
    'knit', 'satin', 'cashmere', 'suede', 'velvet', 'tweed', 'chiffon', 'jersey', 'corduroy',
  ]);
  const fixtures = new Map<string, Fixture>();
  for (const line of readFileSync(join(INPUT, 'runner-fixtures.md'), 'utf8').split('\n')) {
    const cells = splitCells(line);
    if (cells.length !== 10 || !/^(F\d+B?|OC-F\d+|WF\d+)$/.test(cells[0])) continue;
    const [id, category, subType, pattern, scale, fabric, colorFamily, tags, formality, warmth] = cells;
    fixtures.set(id, {
      id,
      category: category as ItemCategory,
      subType,
      ...(pattern !== '—' ? { pattern: pattern as Pattern } : {}),
      ...(scale !== '—' ? { patternScale: scale as PatternScale } : {}),
      ...(validFabric.has(fabric as Fabric) ? { fabric: fabric as Fabric } : {}),
      colorFamily,
      occasionTags: tags.split(',').map((tag) => tag.trim()) as OccasionTag[],
      formalityLevel: Number(formality),
      ...(warmth !== '—' ? { warmthBand: warmth as WarmthBand } : {}),
    });
  }
  if (fixtures.size !== 84) throw new Error(`Expected 84 fixtures, found ${fixtures.size}`);
  return fixtures;
}

function scenarioTag(caseId: string, text: string): OccasionTag {
  if (/interview/i.test(text)) return 'interview';
  if (/business|corporate|office|government|client-facing/i.test(text)) return 'work';
  if (/brunch/i.test(text)) return 'brunch';
  if (/casual first date/i.test(text)) return 'date-casual';
  if (/date night|evening date|fine-dining/i.test(text)) return 'date-dressy';
  if (/traditional wedding|aso-ebi|naming ceremony|traditional engagement|traditional event|cultural ceremony|community cultural/i.test(text)) return 'traditional-event';
  if (/white wedding|church wedding|wedding reception|wedding in London|Nigerian-British wedding/i.test(text)) return 'wedding';
  if (/church|gala|launch party|birthday|evening event|smart-casual.*event|formal event/i.test(text)) return 'event';
  if (/resort/i.test(text)) return 'resort';
  return 'casual';
}

function parseWeather(section: string): WeatherSnapshot | null {
  const line = section.match(/^\*\*Weather:\*\* (.+)$/m)?.[1];
  if (!line) return null;
  const high = Number(line.match(/high\s+(-?\d+)°C/i)?.[1]);
  const low = Number(line.match(/low\s+(-?\d+)°C/i)?.[1]);
  const rain = Number(line.match(/(\d+)% chance of rain/i)?.[1]);
  if (![high, low, rain].every(Number.isFinite)) throw new Error(`Incomplete weather line: ${line}`);
  const location = section.match(/^\*\*Location:\*\* (.+)$/m)?.[1] ?? 'Benchmark location';
  return {
    fetchedAt: FIXED_EPOCH, lat: 0, lon: 0, currentTempC: low,
    highC: high, lowC: low, precipProbability: rain / 100,
    source: 'ip', locationLabel: location,
  };
}

function parseCaseFile(file: string, prefix: 'OR' | 'OC' | 'WX'): CaseInput[] {
  const text = readFileSync(join(INPUT, file), 'utf8');
  const marker = prefix === 'WX' ? /^## (WX-\d{2}) — (.+)$/gm : /^### ((?:OR|OC)-\d{2}) — (.+)$/gm;
  const matches = [...text.matchAll(marker)];
  return matches.map((match, index) => {
    const section = text.slice(match.index, matches[index + 1]?.index ?? text.length);
    const candidates = [...section.matchAll(/^\| ([A-E]) \| ([^|]+) \| ([^|]+) \|$/gm)].map((row) => {
      const components = row[3].split('+').map((id) => id.trim());
      return { id: `${match[1]}-${row[1]}`, description: row[2].trim(), components, fingerprint: [...components].sort().join(',') };
    });
    const scenarioText = [
      match[2],
      section.match(/^\*\*Occasion:\*\* (.+)$/m)?.[1],
      section.match(/^\*\*Scenario:\*\* (.+)$/m)?.[1],
      section.match(/^\*\*Shared scenario[^:]*:\*\* (.+)$/m)?.[1],
    ].filter(Boolean).join(' ');
    return {
      case_id: match[1],
      case_type: prefix === 'OR' ? 'outfit_ranking' : prefix === 'OC' ? 'occasion_distinction' : 'weather_context',
      title: match[2],
      scenario_text: scenarioText,
      scenario_tag: scenarioTag(match[1], scenarioText),
      candidates,
      weather: prefix === 'WX' ? parseWeather(section) : null,
    };
  });
}

function resolveSharedCandidates(cases: CaseInput[], orCases: CaseInput[]) {
  const byId = new Map(orCases.map((c) => [c.case_id, c]));
  const source = readFileSync(join(INPUT, 'occasion-cases.md'), 'utf8');
  for (const c of cases) {
    if (!c.candidates.length) {
      const section = source.split(new RegExp(`^### ${c.case_id} —`, 'm'))[1]?.split(/^### OC-\d{2} —/m)[0] ?? '';
      const ref = section.match(/Same four candidates as ((?:OR|OC)-\d{2})/)?.[1];
      const original = ref ? byId.get(ref) : undefined;
      if (!original) throw new Error(`${c.case_id}: cannot resolve shared candidates`);
      c.candidates = original.candidates.map((candidate) => ({
        ...candidate, id: candidate.id.replace(ref!, c.case_id),
      }));
    }
    byId.set(c.case_id, c);
  }
}

function neutralProfile(): UserProfile {
  return {
    name: 'Track C neutral profile', bodyType: null, eyeColor: null, skinTone: null,
    undertone: null, styleGoalPrimary: null, styleGoalSecondary: null,
    lifestyleWork: 40, lifestyleCasual: 40, lifestyleEvents: 20,
    lifestyleActive: 0, lifestyleBrunch: 0,
    constraints: { noSleeveless: false, noShortSkirts: false, maxHeelHeight: 'any' },
    onboardingComplete: true, industry: 'unspecified', weatherEnabled: true, tempUnit: 'C',
  };
}

function wardrobeItem(fixture: Fixture): WardrobeItem {
  return {
    id: fixture.id, photoUri: '', category: fixture.category, subType: fixture.subType,
    colorFamily: fixture.colorFamily, occasionTags: fixture.occasionTags,
    seasonTags: ['all-season'], formalityLevel: fixture.formalityLevel,
    createdAt: `${RUN_DATE}T00:00:00.000Z`,
    ...(fixture.pattern ? { pattern: fixture.pattern } : {}),
    ...(fixture.patternScale ? { patternScale: fixture.patternScale } : {}),
    ...(fixture.fabric ? { fabric: fixture.fabric } : {}),
    ...(fixture.warmthBand ? { warmthBand: fixture.warmthBand } : {}),
  };
}

function component(item: WardrobeItem): OutfitComponent {
  return {
    category: item.category, subType: item.subType, colorFamily: item.colorFamily,
    owned: true, matchedItemId: item.id, photoUri: item.photoUri,
  };
}

function outputPath(caseId: string) {
  return join(OUT, `${caseId}-result.json`);
}

async function runGuCases() {
  const text = readFileSync(join(INPUT, 'classification-cases.md'), 'utf8');
  const rows = [...text.matchAll(/^\| \*\*(GU-\d{2})\*\* \| ([^|]+) \|$/gm)];
  if (rows.length !== 40) throw new Error(`Expected 40 GU cases, found ${rows.length}`);
  for (const [, caseId, description] of rows) {
    const target = outputPath(caseId);
    if (existsSync(target)) {
      if (resume) continue;
      throw new Error(`${target} already exists; use --resume to preserve it`);
    }
    const imagePath = join(SNAP, 'images', `IMG-${caseId}.png`);
    const image = readFileSync(imagePath);
    let statusCode = 200;
    let body: unknown;
    const req = { body: { imageBase64: image.toString('base64') } };
    const res = {
      status(code: number) { statusCode = code; return this; },
      json(value: unknown) { body = value; return this; },
    };
    const started = new Date().toISOString();
    try {
      await classifyGarment(req as never, res as never);
      writeFileSync(target, stableJson({
        case_id: caseId, case_type: 'garment_classification',
        engine_version: RECOMMENDATION_ENGINE_VERSION, run_timestamp: started,
        input_fingerprint: sha256(Buffer.concat([image, Buffer.from(description.trim())])),
        image_sha256: sha256(image), image_id: `IMG-${caseId}`,
        execution_status: statusCode === 200 ? 'success' : 'failed',
        http_status: statusCode, engine_output: body,
      }));
    } catch (error) {
      writeFileSync(target, stableJson({
        case_id: caseId, case_type: 'garment_classification',
        engine_version: RECOMMENDATION_ENGINE_VERSION, run_timestamp: started,
        input_fingerprint: sha256(Buffer.concat([image, Buffer.from(description.trim())])),
        image_sha256: sha256(image), image_id: `IMG-${caseId}`,
        execution_status: 'failed',
        error: error instanceof Error ? error.message : String(error),
      }));
    }
  }
}

function runOutfitCases(fixtures: Map<string, Fixture>, cases: CaseInput[]) {
  const profile = neutralProfile();
  for (const c of cases) {
    const target = outputPath(c.case_id);
    if (existsSync(target)) {
      if (resume) continue;
      throw new Error(`${target} already exists; use --resume to preserve it`);
    }
    const ids = [...new Set(c.candidates.flatMap((candidate) => candidate.components))];
    const items = ids.map((id) => {
      const fixture = fixtures.get(id);
      if (!fixture) throw new Error(`${c.case_id}: fixture ${id} missing`);
      return wardrobeItem(fixture);
    });
    const byId = new Map(items.map((item) => [item.id, item]));
    const scores = c.candidates.map((candidate) => {
      const candidateItems = candidate.components.map((id) => byId.get(id)!);
      const components = candidateItems.map(component);
      const breakdown = scoreOutfitCombo(components, items, profile, undefined);
      const item_score = candidateItems.reduce(
        (sum, item) => sum + scoreItemForProfile(item, c.scenario_tag, profile, null), 0);
      return { ...candidate, item_score, combo_score: breakdown.total, total_score: item_score + breakdown.total, score_breakdown: breakdown };
    }).sort((a, b) => b.total_score - a.total_score || a.id.localeCompare(b.id));
    try {
      const pools = generateOutfitPool(items, profile, null, [], RUN_DATE, [], undefined, c.weather, false);
      const pool = pools[c.scenario_tag] ?? [];
      const candidateByFingerprint = new Map(c.candidates.map((candidate) => [candidate.fingerprint, candidate.id]));
      const rawPool = pool.map((outfit, index) => {
        const componentIds = outfit.components.flatMap((part) => part.matchedItemId ? [part.matchedItemId] : []).sort();
        const fingerprint = componentIds.join(',');
        return {
          pool_rank: index + 1, outfit_id: outfit.id, matched_candidate_id: candidateByFingerprint.get(fingerprint) ?? null,
          component_ids: componentIds, fingerprint, confidence_score: outfit.confidenceScore ?? null,
          hero_id: outfit.heroId ?? null, generation_path: outfit.generationPath ?? 'strict',
          scenario: outfit.scenario, rationale: outfit.rationale ?? null,
        };
      });
      const matched = rawPool.filter((outfit) => outfit.matched_candidate_id);
      const top = scores[0];
      writeFileSync(target, stableJson({
        case_id: c.case_id, case_type: c.case_type, engine_version: RECOMMENDATION_ENGINE_VERSION,
        run_timestamp: new Date().toISOString(), execution_status: 'success',
        input_fingerprint: sha256(stableJson(c)), scenario_tag: c.scenario_tag,
        weather: c.weather, engine_ranked_outfit_ids: scores.map((score) => score.id),
        engine_top1_outfit_id: top.id, engine_top1_component_ids: top.components,
        engine_top1_fingerprint: top.fingerprint, engine_top1_confidence_score: top.total_score,
        engine_top1_score_breakdown: top.score_breakdown,
        candidate_scores: scores,
        production_pool_size: rawPool.length,
        production_pool_matched_candidate_ids: matched.map((outfit) => outfit.matched_candidate_id),
        production_pool_top1_candidate_id: matched[0]?.matched_candidate_id ?? null,
        production_pool: rawPool,
        fallback_activated: rawPool.some((outfit) => outfit.generation_path === 'relaxed'),
        evaluation_note: 'Fixed candidates are ranked by unchanged production item-profile plus combo scores. The full unchanged generator output is captured separately because the benchmark protocol does not define a candidate-to-generated-pool mapping.',
      }));
    } catch (error) {
      writeFileSync(target, stableJson({
        case_id: c.case_id, case_type: c.case_type, engine_version: RECOMMENDATION_ENGINE_VERSION,
        run_timestamp: new Date().toISOString(), execution_status: 'failed',
        input_fingerprint: sha256(stableJson(c)),
        error: error instanceof Error ? error.stack ?? error.message : String(error),
      }));
    }
  }
}

async function main() {
  if (RECOMMENDATION_ENGINE_VERSION !== '3.7') throw new Error(`Expected engine 3.7, got ${RECOMMENDATION_ENGINE_VERSION}`);
  if (existsSync(OUT) && readdirSync(OUT).length && !resume) {
    throw new Error(`${OUT} is non-empty; refusing to overwrite. Use --resume only to fill missing case files.`);
  }
  const fixtures = parseFixtures();
  const orCases = parseCaseFile('outfit-ranking-cases.md', 'OR');
  const ocCases = parseCaseFile('occasion-cases.md', 'OC');
  resolveSharedCandidates(ocCases, orCases);
  const wxCases = parseCaseFile('weather-cases.md', 'WX');
  if (orCases.length !== 30 || ocCases.length !== 20 || wxCases.length !== 10) {
    throw new Error(`Case count mismatch: OR=${orCases.length}, OC=${ocCases.length}, WX=${wxCases.length}`);
  }
  if (prepareOnly) {
    console.log(jsonSummary(fixtures.size, orCases, ocCases, wxCases));
    return;
  }
  mkdirSync(OUT, { recursive: true });
  await runGuCases();
  runOutfitCases(fixtures, [...orCases, ...ocCases, ...wxCases]);
  const files = readdirSync(OUT).filter((name) => /-result\.json$/.test(name)).sort();
  const results = files.map((name) => JSON.parse(readFileSync(join(OUT, name), 'utf8')));
  const summary = {
    engine_version: RECOMMENDATION_ENGINE_VERSION, run_date: RUN_DATE,
    cases_attempted: results.length,
    cases_successfully_executed: results.filter((r) => r.execution_status === 'success').length,
    cases_failed_to_execute: results.filter((r) => r.execution_status !== 'success').length,
    cases_skipped: 100 - results.length,
    failures: results.filter((r) => r.execution_status !== 'success').map((r) => ({ case_id: r.case_id, error: r.error ?? r.engine_output })),
  };
  writeFileSync(join(OUT, 'summary.json'), stableJson(summary));
  console.log(stableJson(summary));
}

function jsonSummary(fixtureCount: number, orCases: CaseInput[], ocCases: CaseInput[], wxCases: CaseInput[]) {
  return stableJson({
    fixture_count: fixtureCount,
    case_counts: { OR: orCases.length, OC: ocCases.length, WX: wxCases.length },
    candidates: [...orCases, ...ocCases, ...wxCases].reduce((sum, c) => sum + c.candidates.length, 0),
  });
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});