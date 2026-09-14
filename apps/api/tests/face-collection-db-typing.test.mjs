import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

const source = readFileSync(new URL('../src/services/face-collection.service.ts', import.meta.url), 'utf8');

test('face collection database override keeps mysql query generic typing', () => {
  assert.match(source, /import type \{ Pool, PoolConnection \} from ["']mysql2\/promise["'];/);
  const typedOverrides = source.match(/db\?: Pool \| PoolConnection;/g) || [];
  assert.equal(typedOverrides.length, 2);
  assert.doesNotMatch(source, /db\?: any;/);
});
