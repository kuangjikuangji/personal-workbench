import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, test } from 'vitest';

describe('GitHub Pages workflow', () => {
  const workflow = readFileSync(
    resolve(process.cwd(), '.github/workflows/deploy-pages.yml'),
    'utf8',
  );

  test('validates and deploys dist from master with minimum permissions', () => {
    expect(workflow).toContain('branches: [master]');
    expect(workflow).toContain('pages: write');
    expect(workflow).toContain('id-token: write');
    expect(workflow).toContain('npm ci');
    expect(workflow).toContain('npm run typecheck');
    expect(workflow).toContain('npm run test:run');
    expect(workflow).toContain('npm run build');
    expect(workflow).toContain('path: ./dist');
    expect(workflow).toContain('actions/deploy-pages@v4');
  });
});
