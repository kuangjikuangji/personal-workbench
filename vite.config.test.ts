import { describe, expect, test } from 'vitest';
import { resolveBasePath } from './vite.config';

describe('GitHub Pages base path', () => {
  test('keeps development at the origin root', () => {
    expect(resolveBasePath('serve')).toBe('/');
  });

  test('builds production assets below the repository path', () => {
    expect(resolveBasePath('build')).toBe('/personal-workbench/');
  });

  test('previews production assets below the repository path', () => {
    expect(resolveBasePath('serve', true)).toBe('/personal-workbench/');
  });
});
