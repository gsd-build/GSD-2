// Native GSD Parser Bridge
// Provides drop-in replacements for the JS parsing functions in files.ts,
// backed by the Rust native parser for better performance on large projects.
//
// Functions fall back to JS implementations if the native module is unavailable.

import type { Roadmap, BoundaryMapEntry, RoadmapSliceEntry, RiskLevel } from './types.js';

let nativeModule: {
  parseFrontmatter: (content: string) => { metadata: string; body: string };
  extractSection: (content: string, heading: string, level?: number) => { content: string; found: boolean };
  extractAllSections: (content: string, level?: number) => string;
  batchParseGsdFiles: (directory: string) => { files: Array<{ path: string; metadata: string; body: string; sections: string }>; count: number };
  parseRoadmapFile: (content: string) => {
    title: string;
    vision: string;
    successCriteria: string[];
    slices: Array<{ id: string; title: string; risk: string; depends: string[]; done: boolean; demo: string }>;
    boundaryMap: Array<{ fromSlice: string; toSlice: string; produces: string; consumes: string }>;
  };
} | null = null;

let loadAttempted = false;

function loadNative(): typeof nativeModule {
  if (loadAttempted) return nativeModule;
  loadAttempted = true;

  try {
    // Dynamic import to avoid hard dependency - fails gracefully if native module not built
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const mod = require('@gsd/native');
    if (mod.parseFrontmatter && mod.extractSection && mod.batchParseGsdFiles) {
      nativeModule = mod;
    }
  } catch {
    // Native module not available - all functions fall back to JS
  }

  return nativeModule;
}

/**
 * Native-backed frontmatter splitting.
 * Returns [parsedMetadata, body] where parsedMetadata is the parsed key-value map.
 */
export function nativeSplitFrontmatter(content: string): { metadata: Record<string, unknown>; body: string } | null {
  const native = loadNative();
  if (!native) return null;

  const result = native.parseFrontmatter(content);
  return {
    metadata: JSON.parse(result.metadata) as Record<string, unknown>,
    body: result.body,
  };
}

/** Sentinel value indicating the native module is not available. */
const NATIVE_UNAVAILABLE = Symbol('native-unavailable');

/**
 * Native-backed section extraction.
 * Returns section content, null if not found, or NATIVE_UNAVAILABLE symbol
 * if the native module isn't loaded.
 */
export function nativeExtractSection(content: string, heading: string, level: number = 2): string | null | typeof NATIVE_UNAVAILABLE {
  const native = loadNative();
  if (!native) return NATIVE_UNAVAILABLE;

  const result = native.extractSection(content, heading, level);
  return result.found ? result.content : null;
}

export { NATIVE_UNAVAILABLE };

/**
 * Native-backed roadmap parsing.
 * Returns a Roadmap object or null if native module unavailable.
 */
export function nativeParseRoadmap(content: string): Roadmap | null {
  const native = loadNative();
  if (!native) return null;

  const result = native.parseRoadmapFile(content);
  return {
    title: result.title,
    vision: result.vision,
    successCriteria: result.successCriteria,
    slices: result.slices.map(s => ({
      id: s.id,
      title: s.title,
      risk: s.risk as RiskLevel,
      depends: s.depends,
      done: s.done,
      demo: s.demo,
    })),
    boundaryMap: result.boundaryMap.map(b => ({
      fromSlice: b.fromSlice,
      toSlice: b.toSlice,
      produces: b.produces,
      consumes: b.consumes,
    })),
  };
}

export interface BatchParsedFile {
  path: string;
  metadata: Record<string, unknown>;
  body: string;
  sections: Record<string, string>;
}

/**
 * Batch-parse all .md files in a .gsd/ directory tree using the native parser.
 * Returns null if native module unavailable.
 */
export function nativeBatchParseGsdFiles(directory: string): BatchParsedFile[] | null {
  const native = loadNative();
  if (!native) return null;

  const result = native.batchParseGsdFiles(directory);
  return result.files.map(f => ({
    path: f.path,
    metadata: JSON.parse(f.metadata) as Record<string, unknown>,
    body: f.body,
    sections: JSON.parse(f.sections) as Record<string, string>,
  }));
}

/**
 * Check if the native parser is available.
 */
export function isNativeParserAvailable(): boolean {
  return loadNative() !== null;
}
