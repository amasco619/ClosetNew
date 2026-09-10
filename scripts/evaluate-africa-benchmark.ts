#!/usr/bin/env npx tsx
import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

const ROOT = process.cwd();
const BASE = join(ROOT, 'docs/recommendation/africa/track-c/baseline-v3.7');
const RAW = join(BASE, 'raw-engine-output');
const EVAL = join(BASE, 'evaluation');
const GOLD = join(ROOT, 'docs/recommendation/africa/benchmark-v1/frozen-v1/gold-standard/gold-labels.json');
const replace = process.argv.includes('--replace');
const sha256 = (value: Buffer | string) => createHash('sha256').update(value).digest('hex');
const json = (value: unknown) => JSON.stringify(value, null, 2) + '\n';

function csvCell(value: unknown) {
  const text = Array.isArray(value) ? value.join('|') : String(value ?? '');
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: Record<string, unknown>[]) {
  if (!rows.length) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((row) => headers.map((key) => csvCell(row[key])).join(','))].join('\n') + '\n';
}

function kendallTau(a: string[], b: string[]) {
  const shared = a.filter((id) => b.includes(id));
  if (shared.length < 3) return null;
  const posA = new Map(shared.map((id) => [id, a.indexOf(id)]));
  const posB = new Map(shared.map((id) => [id, b.indexOf(id)]));
  let concordant = 0, discordant = 0;
  for (let i = 0; i < shared.length; i++) for (let j = i + 1; j < shared.length; j++) {
    const x = shared[i], y = shared[j];
    ((posA.get(x)! - posA.get(y)!) * (posB.get(x)! - posB.get(y)!) > 0 ? concordant++ : discordant++);
  }
  return (concordant - discordant) / (concordant + discordant);
}

function candidateLabel(id: string) {
  return id.match(/-([A-E])$/)?.[1] ?? id;
}

function normalize(value: unknown) {
  return String(value ?? '').toLowerCase().replace(/[^a-z0-9]+/g, ' ').trim();
}

function semanticMatch(engineValue: unknown, goldValue: unknown) {
  const engine = normalize(engineValue);
  const gold = normalize(goldValue);
  return Boolean(engine && gold && (gold.includes(engine) || engine.includes(gold)));
}

function inferCategory(garmentType: string) {
  const value = normalize(garmentType);
  if (/shoe|heel|sandal|mule|trainer|boot|flat/.test(value)) return 'shoes';
  if (/bag|clutch|tote/.test(value)) return 'bag';
  if (/earring|necklace|bracelet|jewelry/.test(value)) return 'jewelry';
  if (/blazer|jacket|coat|cardigan/.test(value)) return 'outerwear';
  if (/skirt|trouser|wrapper|iro|shorts/.test(value)) return 'bottom';
  if (/blouse|top|buba/.test(value)) return 'top';
  if (/dress|gown|kaftan|jumpsuit/.test(value)) return 'dress';
  return null;
}

function main() {
  const seal = join(BASE, 'execution-manifest.json');
  if (!existsSync(seal)) throw new Error('Raw outputs are not sealed; execution-manifest.json is required');
  if (existsSync(EVAL) && readdirSync(EVAL).length && !replace) throw new Error('Evaluation directory is non-empty; use --replace to replace evaluator-owned outputs');
  const manifest = JSON.parse(readFileSync(seal, 'utf8'));
  for (const [file, expected] of Object.entries(manifest.raw_output_sha256 as Record<string, string>)) {
    if (sha256(readFileSync(join(RAW, file))) !== expected) throw new Error(`Raw output seal mismatch: ${file}`);
  }
  mkdirSync(EVAL, { recursive: true });
  const gold = JSON.parse(readFileSync(GOLD, 'utf8'));
  const goldCases = [...gold.garment_classification_cases, ...gold.outfit_cases];
  const goldById = new Map(goldCases.map((c: any) => [c.case_id, c]));
  const outputs = readdirSync(RAW).filter((name) => /-result\.json$/.test(name)).sort()
    .map((name) => JSON.parse(readFileSync(join(RAW, name), 'utf8')));

  const rows = outputs.map((output: any) => {
    const goldCase: any = goldById.get(output.case_id);
    if (!goldCase) throw new Error(`No gold case for ${output.case_id}`);
    if (output.case_type === 'garment_classification') {
      const engine = output.engine_output ?? {};
      const label = goldCase.gold_label;
      const inferredCategory = inferCategory(label.garment_type);
      const dimensions = {
        broad_category: inferredCategory ? normalize(engine.category) === inferredCategory : null,
        garment_type: semanticMatch(engine.subType, label.garment_type),
        fabric: semanticMatch(engine.fabric, label.fabric),
        pattern: semanticMatch(engine.pattern, label.pattern),
        pattern_scale: semanticMatch(engine.patternScale, label.pattern_scale),
        colour: semanticMatch(engine.colorFamily, label.colour),
      };
      const supported = Object.values(dimensions).filter((value) => value !== null);
      return {
        case_id: output.case_id, case_type: output.case_type, execution_status: output.execution_status,
        engine_top1: engine.subType ?? '', gold_preferred: label.garment_type,
        top1_match: dimensions.garment_type, top3_match: '', pairwise_correct: '', pairwise_total: '',
        regret: '', kendall_tau: '', acceptable_recall: '', not_acceptable_exclusion: '',
        dimension_agreement: supported.filter(Boolean).length / supported.length,
        dimension_detail: JSON.stringify(dimensions),
      };
    }
    const label = goldCase.gold_label;
    const ranking: string[] = (output.engine_ranked_outfit_ids ?? []).map(candidateLabel);
    const preferred = label.preferred_candidate_id;
    const pairs = label.pairwise ?? [];
    const pos = new Map(ranking.map((id, index) => [id, index]));
    const correctPairs = pairs.filter((pair: any) => pos.has(pair.better) && pos.has(pair.worse) && pos.get(pair.better)! < pos.get(pair.worse)!).length;
    const acceptable = label.acceptable_candidates ?? [];
    const generated = new Set((output.production_pool_matched_candidate_ids ?? []).map(candidateLabel));
    const unacceptable = label.not_acceptable_candidates ?? [];
    const selected = ranking[0];
    const regret = selected ? Math.max(0, label.utility[preferred] - label.utility[selected]) : Math.max(...Object.values(label.utility) as number[]);
    return {
      case_id: output.case_id, case_type: output.case_type, execution_status: output.execution_status,
      engine_top1: selected ?? '', gold_preferred: preferred,
      top1_match: selected === preferred, top3_match: ranking.slice(0, 3).includes(preferred),
      pairwise_correct: correctPairs, pairwise_total: pairs.length, regret,
      kendall_tau: kendallTau(ranking, label.ranking),
      acceptable_recall: acceptable.filter((id: string) => generated.has(id)).length / acceptable.length,
      not_acceptable_exclusion: unacceptable.length ? unacceptable.filter((id: string) => !generated.has(id)).length / unacceptable.length : 1,
      dimension_agreement: '', dimension_detail: '',
    };
  });

  const outfitRows = rows.filter((row) => row.case_type !== 'garment_classification');
  const guRows = rows.filter((row) => row.case_type === 'garment_classification');
  const outfitOutputs = outputs.filter((output) => output.case_type !== 'garment_classification');
  const successful = rows.filter((row) => row.execution_status === 'success');
  const mean = (values: number[]) => values.length ? values.reduce((a, b) => a + b, 0) / values.length : null;
  const dimensionNames = ['broad_category', 'garment_type', 'fabric', 'pattern', 'pattern_scale', 'colour'];
  const garmentDimensionAccuracy = Object.fromEntries(dimensionNames.map((name) => {
    const values = guRows.map((row) => JSON.parse(String(row.dimension_detail))[name]).filter((value) => value !== null);
    return [name, { correct: values.filter(Boolean).length, supported: values.length, accuracy: mean(values.map(Number)) }];
  }));
  const totalCandidates = outfitOutputs.reduce((sum, output) => sum + (output.candidate_scores?.length ?? 0), 0);
  const generatedCandidates = outfitOutputs.reduce((sum, output) => sum + new Set(
    (output.production_pool_matched_candidate_ids ?? []).map(candidateLabel)).size, 0);
  const poolMapped = outfitOutputs.filter((output) => output.production_pool_top1_candidate_id);
  const goldByCase = new Map(gold.outfit_cases.map((c: any) => [c.case_id, c.gold_label]));
  const byType = Object.fromEntries(['garment_classification', 'outfit_ranking', 'occasion_distinction', 'weather_context'].map((type) => {
    const subset = rows.filter((row) => row.case_type === type);
    const rank = subset.filter((row) => row.case_type !== 'garment_classification');
    return [type, {
      cases: subset.length, successful: subset.filter((row) => row.execution_status === 'success').length,
      top1_accuracy: rank.length ? rank.filter((row) => row.top1_match === true).length / rank.length : null,
      top3_accuracy: rank.length ? rank.filter((row) => row.top3_match === true).length / rank.length : null,
      mean_regret: mean(rank.map((row) => Number(row.regret))),
      mean_dimension_agreement: type === 'garment_classification' ? mean(subset.map((row) => Number(row.dimension_agreement))) : null,
    }];
  }));
  const metrics = {
    benchmark_version: '1.0.0-frozen', engine_version: '3.7',
    cases_attempted: rows.length, cases_successfully_executed: successful.length,
    cases_failed_to_execute: rows.length - successful.length, cases_skipped: 100 - rows.length,
    garment_type_semantic_accuracy: guRows.filter((row) => row.top1_match === true).length / 40,
    garment_mean_dimension_agreement: mean(guRows.map((row) => Number(row.dimension_agreement))),
    garment_dimension_accuracy: garmentDimensionAccuracy,
    outfit_context_top1_accuracy: outfitRows.filter((row) => row.top1_match === true).length / 60,
    outfit_context_top3_accuracy: outfitRows.filter((row) => row.top3_match === true).length / 60,
    pairwise_accuracy: outfitRows.reduce((n, row) => n + Number(row.pairwise_correct), 0) /
      outfitRows.reduce((n, row) => n + Number(row.pairwise_total), 0),
    mean_regret: mean(outfitRows.map((row) => Number(row.regret))),
    max_regret: Math.max(...outfitRows.map((row) => Number(row.regret))),
    mean_kendall_tau: mean(outfitRows.map((row) => row.kendall_tau).filter((v): v is number => typeof v === 'number')),
    mean_acceptable_candidate_generation_recall: mean(outfitRows.map((row) => Number(row.acceptable_recall))),
    mean_not_acceptable_candidate_exclusion: mean(outfitRows.map((row) => Number(row.not_acceptable_exclusion))),
    candidate_generation: {
      benchmark_candidates: totalCandidates,
      exact_candidates_generated: generatedCandidates,
      exact_candidate_generation_rate: generatedCandidates / totalCandidates,
      cases_with_any_exact_candidate: outfitOutputs.filter((output) => output.production_pool_matched_candidate_ids?.length).length,
      cases_with_no_exact_candidate: outfitOutputs.filter((output) => !output.production_pool_matched_candidate_ids?.length).length,
      cases_with_empty_production_pool: outfitOutputs.filter((output) => output.production_pool_size === 0).length,
      fallback_activated_cases: outfitOutputs.filter((output) => output.fallback_activated).length,
      mapped_pool_top1_accuracy: poolMapped.filter((output) =>
        candidateLabel(output.production_pool_top1_candidate_id) === (goldByCase.get(output.case_id) as any)?.preferred_candidate_id).length / poolMapped.length,
      mapped_pool_top1_supported_cases: poolMapped.length,
    },
    by_type: byType,
    metric_notes: {
      ranking: 'Fixed candidate ranking uses unchanged production scoreItemForProfile + scoreOutfitCombo totals.',
      generation: 'Acceptable recall and not-acceptable exclusion use exact fingerprint matches in the unchanged full generator pool.',
      garment: 'Broad category is inferred deterministically from gold garment_type for 32 supported cases. Garment type and other dimensions use normalized containment because reviewer terminology is richer than production enum values.',
      representation: 'Taxonomy/representation gaps require separate evidence-based review and are not automatically counted as engine recognition failures.',
    },
  };
  writeFileSync(join(EVAL, 'metrics.json'), json(metrics));
  writeFileSync(join(EVAL, 'case-results.csv'), toCsv(rows));
  writeFileSync(join(EVAL, 'garment-results.csv'), toCsv(guRows));
  writeFileSync(join(EVAL, 'outfit-results.csv'), toCsv(rows.filter((row) => row.case_type === 'outfit_ranking')));
  writeFileSync(join(EVAL, 'occasion-results.csv'), toCsv(rows.filter((row) => row.case_type === 'occasion_distinction')));
  writeFileSync(join(EVAL, 'weather-results.csv'), toCsv(rows.filter((row) => row.case_type === 'weather_context')));
  console.log(json(metrics));
}

main();