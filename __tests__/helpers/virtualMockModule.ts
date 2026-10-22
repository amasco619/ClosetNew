import type { OnLoadResult } from 'esbuild';

/** Virtual modules need filesystem context for bare imports such as React. */
export function virtualMockModule(contents: string): OnLoadResult {
  return { contents, loader: 'js', resolveDir: process.cwd() };
}
