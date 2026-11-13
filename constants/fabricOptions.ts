import { ALL_FABRICS, type Fabric } from './types';

export const ADDITIONAL_FABRICS = [
  'george', 'swiss voile', 'aso-oke', 'akwete', 'hollandais', 'cord lace',
  'french lace', 'beaded lace', 'ankara/wax print', 'adire', 'brocade',
  'sequin', 'crepe', 'wool blend', 'polyester blend',
] as const;

export const FABRIC_OPTIONS = [...ALL_FABRICS, ...ADDITIONAL_FABRICS] as const;

const DISPLAY_LABELS: Readonly<Record<string, string>> = {
  george: 'George',
  'swiss voile': 'Swiss voile',
  akwete: 'Akwete',
  hollandais: 'Hollandais',
  'french lace': 'French lace',
  'ankara/wax print': 'Ankara/wax print',
};

export function isFabricOption(value?: string): value is Fabric | typeof ADDITIONAL_FABRICS[number] {
  return !!value && (FABRIC_OPTIONS as readonly string[]).includes(value);
}

export function fabricOptionLabel(value: string): string {
  return DISPLAY_LABELS[value] ?? value;
}

/** Exported labels preserve the classifier's existing capitalisation conventions. */
export const JUDGE_FABRIC_OPTIONS = [
  ...ALL_FABRICS,
  'George', 'Swiss voile', 'aso-oke', 'Akwete', 'Hollandais', 'cord lace',
  'French lace', 'beaded lace', 'Ankara/wax print', 'adire', 'brocade',
  'sequin', 'crepe', 'wool blend', 'polyester blend',
] as const;
