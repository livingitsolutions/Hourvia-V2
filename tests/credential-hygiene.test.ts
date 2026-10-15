import { readFileSync } from 'node:fs';
import { it, expect } from 'vitest';

it('keeps package metadata free of URL credentials and GitHub token formats', () => {
  for (const path of ['package.json', 'package-lock.json']) {
    const contents = readFileSync(path, 'utf8');
    const data: unknown = JSON.parse(contents);
    const strings = (value: unknown): string[] => {
      if (typeof value === 'string') return [value];
      if (Array.isArray(value)) return value.flatMap(strings);
      if (value !== null && typeof value === 'object') return Object.values(value).flatMap(strings);
      return [];
    };
    const hasCredentialUrl = strings(data).some(value => {
      try {
        const url = new URL(value.replace(/^git\+/, ''));
        return Boolean(url.username || url.password);
      } catch { return false; }
    });
    // Assert only booleans so test failures cannot serialize confidential input.
    expect(hasCredentialUrl, `${path}: credential URL detected`).toBe(false);
    expect(/(?:ghs_|ghp_|github_pat_)[A-Za-z0-9_.-]{15,}/.test(contents), `${path}: token format detected`).toBe(false);
  }
});
