import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const componentPath = new URL('../web/src/components/EmployeeFacePhoto.tsx', import.meta.url);
const employees = fs.readFileSync(new URL('../web/src/pages/EmployeesPage.tsx', import.meta.url), 'utf8');

test('employee form supports camera or image reference photo and shows optional face status', () => {
  assert.equal(fs.existsSync(componentPath), true);
  const component = fs.readFileSync(componentPath, 'utf8');
  assert.match(component, /capture="user"/);
  assert.match(component, /accept="image\/jpeg,image\/png"/);
  assert.match(component, /\/face\/employee\/\$\{employeeId\}\/photo/);
  assert.match(component, /Remover foto/);
  assert.match(component, /Validação facial ativa/);
  assert.match(component, /Validação facial não exigida/);
  assert.match(employees, /EmployeeFacePhoto/);
});
