import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const componentPath = new URL('../apps/web/src/components/EmployeeFaceEnrollment.tsx', import.meta.url);
const employees = fs.readFileSync(new URL('../apps/web/src/pages/EmployeesPage.tsx', import.meta.url), 'utf8');
const types = fs.readFileSync(new URL('../apps/web/src/types.ts', import.meta.url), 'utf8');

test('employee form supports camera or image enrollment and shows face status', () => {
  assert.equal(fs.existsSync(componentPath), true);
  const component = fs.readFileSync(componentPath, 'utf8');
  assert.match(component, /getUserMedia/);
  assert.match(component, /facingMode:\s*"user"/);
  assert.match(component, /accept="image\/jpeg,image\/png"/);
  assert.match(component, /\/faces\/employee\/\$\{employeeId\}\/enroll/);
  assert.match(component, /Remover cadastro facial/);
  assert.match(employees, /EmployeeFaceEnrollment/);
  assert.match(employees, /pendingFace/);
  assert.match(employees, /face_status/);
  assert.match(types, /face_status\?: string \| null/);
});
