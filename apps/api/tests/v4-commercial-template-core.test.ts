import test from 'node:test';import assert from 'node:assert/strict';import {renderCommercialTemplate,escapeXml,assertTemplateEditable} from '../src/services/commercial-template-core.js';import {deepSnapshot} from '../src/services/commercial-document-snapshot-core.js';
test('renders allowed commercial placeholders',()=>{const out=renderCommercialTemplate('{{seller.legal_name}} vende {{product.name}} para {{customer.legal_name}}',{seller:{legal_name:'Ponto Certo'},product:{name:'Movyo'},customer:{legal_name:'Pizzaria Alfa'}});assert.equal(out,'Ponto Certo vende Movyo para Pizzaria Alfa');});
test('rejects unknown placeholders',()=>assert.throws(()=>renderCommercialTemplate('{{process.env.SECRET}}',{process:{env:{SECRET:'x'}}}),/não permitidos/));
test('xml escapes user content including quotes',()=>assert.equal(escapeXml(`<x a="b">Tom & 'Ana'</x>`),'&lt;x a=&quot;b&quot;&gt;Tom &amp; &apos;Ana&apos;&lt;/x&gt;'));
test('snapshot is detached from source',()=>{const source={seller:{name:'A'}};const snap=deepSnapshot(source);source.seller.name='B';assert.equal(snap.seller.name,'A');});

test('only draft commercial templates are editable in place',()=>{assert.equal(assertTemplateEditable('DRAFT'),true);assert.throws(()=>assertTemplateEditable('ACTIVE'),/nova versão/i);assert.throws(()=>assertTemplateEditable('ARCHIVED'),/nova versão/i);});
