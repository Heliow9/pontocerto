import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
const read=p=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('priority forms use shared document and money inputs',()=>{
  const employees=read('web/src/pages/EmployeesPage.tsx');
  const companies=read('web/src/pages/CompaniesPage.tsx');
  const plans=read('web/src/pages/SaasPlans.tsx');
  const finance=read('web/src/pages/SaasFinance.tsx');
  const proposals=read('web/src/pages/ProposalsPage.tsx');
  const saas=read('web/src/pages/SaasPage.tsx');
  assert.match(employees,/MaskedInput/);
  assert.match(employees,/mask="cpf"/);
  assert.match(employees,/mask="pis"/);
  assert.match(companies,/mask="cnpj"/);
  assert.match(companies,/mask="phone"/);
  assert.match(companies,/mask="cep"/);
  assert.match(saas,/mask="cnpj"/);
  assert.match(saas,/mask="cpf"/);
  assert.match(saas,/mask="phone"/);
  assert.match(saas,/mask="cep"/);
  assert.match(finance,/MaskedInput/);
  assert.match(finance,/mask="cpf"/);
  assert.match(finance,/mask="cpfCnpj"|personType==="PF"\?"cpf":"cnpj"/);
  assert.match(finance,/mask="phone"/);
  assert.match(finance,/mask="cep"/);
  assert.match(plans,/CurrencyInput/);
  assert.match(finance,/CurrencyInput/);
  assert.match(proposals,/CurrencyInput/);
  assert.match(proposals,/mask="cnpj"/);
  assert.match(proposals,/mask="phone"/);
});

test('legacy identifiers are formatted in visible tables',()=>{
  assert.match(read('web/src/pages/EmployeesPage.tsx'),/formatCpf\(i\.cpf\)/);
  assert.match(read('web/src/pages/CompaniesPage.tsx'),/formatCnpj\(c\.cnpj\)/);
  assert.match(read('web/src/pages/ProposalsPage.tsx'),/formatCnpj\(p\.cnpj\)/);
  assert.match(read('web/src/pages/ContractsPage.tsx'),/formatCnpj\(c\.cnpj\)/);
  assert.match(read('web/src/pages/SaasPlans.tsx'),/formatCnpj\(c\.cnpj\)/);
});
