import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';

const sql = fs.readFileSync(path.resolve('api/sql/023_financial_payers_and_delivery.sql'),'utf8');

test('migration 023 avoids REGEXP_REPLACE for legacy MySQL compatibility', () => {
  assert.equal(/REGEXP_REPLACE\s*\(/i.test(sql), false);
});

test('migration 023 is restart-safe for the columns added before data backfill', () => {
  for (const column of ['billing_legal_name','billing_document','auto_email_charges','payer_source','payer_document','send_email_after_issue']) {
    assert.match(sql, new RegExp(`information_schema\\.COLUMNS[\\s\\S]{0,500}COLUMN_NAME='${column}'`, 'i'));
  }
});

test('migration 023 guards payer index creation for restart safety', () => {
  assert.match(sql, /information_schema\.STATISTICS[\s\S]{0,500}idx_financial_payer_document/i);
});
