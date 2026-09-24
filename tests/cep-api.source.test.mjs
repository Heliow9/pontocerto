import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';

const read=(p)=>fs.readFileSync(new URL(`../${p}`,import.meta.url),'utf8');

test('API de CEP está montada e possui fallback',()=>{
  const app=read('apps/api/src/app.ts');
  const service=read('apps/api/src/services/postal-code.service.ts');
  assert.match(app,/app\.use\("\/postal-code",postalCodeRouter\)/);
  assert.match(service,/viacep\.com\.br\/ws/);
  assert.match(service,/brasilapi\.com\.br\/api\/cep\/v2/);
  assert.match(service,/CEP não encontrado/);
});

test('cadastros principais usam o componente de CEP',()=>{
  for(const file of [
    'apps/web/src/pages/CompaniesPage.tsx',
    'apps/web/src/pages/SaasPage.tsx',
    'apps/web/src/pages/SaasCommercialCustomers.tsx',
    'apps/web/src/pages/SaasSellerProfile.tsx',
    'apps/web/src/pages/SaasFinance.tsx',
  ]) assert.match(read(file),/CepLookupInput/,file);
});

test('número fica manual após busca de CEP',()=>{
  const files=[
    'apps/web/src/pages/CompaniesPage.tsx',
    'apps/web/src/pages/SaasPage.tsx',
    'apps/web/src/pages/SaasCommercialCustomers.tsx',
    'apps/web/src/pages/SaasSellerProfile.tsx',
    'apps/web/src/pages/SaasFinance.tsx',
  ].map(read).join('\n');
  assert.match(files,/number:\s*["']{2}/);
  assert.match(files,/billingNumber:\s*["']{2}/);
});
