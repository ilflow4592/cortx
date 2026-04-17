import { describe, it, expect } from 'vitest';
import {
  extractOutputMarkers,
  substituteArtifacts,
  validateProducedArtifacts,
} from '../../src/utils/pipeline-exec/outputMarker';

describe('extractOutputMarkers', () => {
  it('returns empty artifacts when no markers', () => {
    const { artifacts, stripped } = extractOutputMarkers('Hello world');
    expect(artifacts).toEqual({});
    expect(stripped).toBe('Hello world');
  });

  it('extracts single marker block', () => {
    const text = 'preface\n[OUTPUT:plan]\n1. Do X\n2. Do Y\n[/OUTPUT:plan]\nepilogue';
    const { artifacts, stripped } = extractOutputMarkers(text);
    expect(artifacts.plan).toBe('1. Do X\n2. Do Y');
    expect(stripped).toBe('preface\n\nepilogue');
  });

  it('keeps last when same key appears twice', () => {
    const text = '[OUTPUT:x]first[/OUTPUT:x]\n[OUTPUT:x]second[/OUTPUT:x]';
    const { artifacts } = extractOutputMarkers(text);
    expect(artifacts.x).toBe('second');
  });

  it('extracts multiple different keys', () => {
    const text = '[OUTPUT:a]A content[/OUTPUT:a] and [OUTPUT:b]B content[/OUTPUT:b]';
    const { artifacts } = extractOutputMarkers(text);
    expect(artifacts).toEqual({ a: 'A content', b: 'B content' });
  });

  it('does not match mismatched keys', () => {
    const text = '[OUTPUT:a]wrong closer[/OUTPUT:b]';
    const { artifacts } = extractOutputMarkers(text);
    expect(artifacts).toEqual({});
  });
});

describe('substituteArtifacts', () => {
  it('replaces {key} with artifact value', () => {
    const { result, missing } = substituteArtifacts('Use {plan} now', { plan: '1,2,3' });
    expect(result).toBe('Use 1,2,3 now');
    expect(missing).toEqual([]);
  });

  it('reports missing keys and replaces with empty string', () => {
    const { result, missing } = substituteArtifacts('Hello {unknown} world', {});
    expect(result).toBe('Hello  world');
    expect(missing).toEqual(['unknown']);
  });

  it('preserves escaped braces', () => {
    const { result } = substituteArtifacts('code \\{literal\\} and {x}', { x: 'VAL' });
    expect(result).toBe('code {literal} and VAL');
  });

  it('supports multiple substitutions', () => {
    const { result } = substituteArtifacts('{a} + {b} = {c}', {
      a: '1',
      b: '2',
      c: '3',
    });
    expect(result).toBe('1 + 2 = 3');
  });
});

describe('validateProducedArtifacts', () => {
  it('returns empty when declared is undefined', () => {
    expect(validateProducedArtifacts(undefined, { anything: 'x' })).toEqual([]);
  });

  it('returns missing declared keys', () => {
    const missing = validateProducedArtifacts(['a', 'b', 'c'], { a: '', c: '' });
    expect(missing).toEqual(['b']);
  });

  it('returns all declared when none produced', () => {
    const missing = validateProducedArtifacts(['x', 'y'], {});
    expect(missing).toEqual(['x', 'y']);
  });
});
