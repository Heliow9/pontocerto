import test from 'node:test';import assert from 'node:assert/strict';import fs from 'node:fs';
const sql=fs.readFileSync(new URL('../api/sql/025_commercial_multiproduct_core.sql',import.meta.url),'utf8');
test('025 creates multiproduct entities',()=>{for(const t of ['commercial_customers','commercial_products','commercial_product_plans','product_subscriptions'])assert.match(sql,new RegExp(`CREATE TABLE IF NOT EXISTS ${t}`));assert.doesNotMatch(sql,/REGEXP_REPLACE/i);});
test('025 seeds products and keeps PayHub inactive',()=>{assert.match(sql,/PONTO_CERTO/);assert.match(sql,/MOVYO/);assert.match(sql,/PAYHUB','PayHub'.*0/s);});
test('025 allows product monthly billing without fake tenant',()=>{assert.match(sql,/product_subscription_id/);assert.match(sql,/payer_source ENUM\(''TENANT'',''COMMERCIAL'',''EXTERNAL''\)/);assert.match(sql,/chk_financial_charge_owner/);});
const saas=fs.readFileSync(new URL('../api/src/routes/saas.routes.ts',import.meta.url),'utf8');
test('saas mounts multiproduct APIs',()=>{assert.match(saas,/commercial-customers/);assert.match(saas,/product-subscriptions/);assert.match(saas,/commercialProductsRouter/);});
const portal=fs.readFileSync(new URL('../web/src/pages/SaasPortal.tsx',import.meta.url),'utf8');
test('portal exposes commercial customer product subscription administration',()=>{assert.match(portal,/Clientes Comerciais/);assert.match(portal,/Assinaturas por Produto/);assert.match(portal,/SaasProducts/);});
