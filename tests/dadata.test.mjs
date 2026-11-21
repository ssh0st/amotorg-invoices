import { test } from 'node:test';
import { strict as assert } from 'node:assert';
import { normalizeParty, normalizeBank, validateLookup, lookupDadata, handleLookupUrl } from '../lib/dadata-service.mjs';

const company = {
  suggestions: [{ value: 'ООО «Тест»', data: { inn: '7707083893', kpp: '770701001', name: { short_with_opf: 'ООО «Тест»' }, address: { unrestricted_value: 'г. Москва, улица Тест' }, management: { post: 'Директор', name: 'Тестов Иван Иванович' }, state: { status: 'ACTIVE' }, branch_type: 'MAIN' } }],
};
const bank = { suggestions: [{ value: 'ПАО Сбербанк', data: { bic: '044525225', name: { payment: 'ПАО СБЕРБАНК' }, correspondent_account: '30101810400000000225', state: { status: 'ACTIVE' } } }] };
const mock = (body, status=200) => async () => ({ status, ok: status>=200&&status<300, json: async()=>body });

test('ИНН и БИК валидируются до вызова API', async () => {
  assert.equal(validateLookup('party','abc').error.status,400);
  assert.equal(validateLookup('bank','123').error.body.code,'INVALID_BIK');
  assert.equal(validateLookup('party','7707083893').query,'7707083893');
  assert.equal(validateLookup('bank','044525225').query,'044525225');
});
test('организация: название, КПП, адрес и подпись', () => {
  const record=normalizeParty(company,'7707083893');
  assert.equal(record.name,'ООО «Тест»');
  assert.equal(record.kpp,'770701001');
  assert.equal(record.manager,'Тестов Иван Иванович');
  assert.equal(record.position,'Директор');
});
test('банк: название, БИК и корреспондентский счёт', () => {
  assert.deepEqual({ name: normalizeBank(bank,'044525225').name, correspondentAccount: normalizeBank(bank,'044525225').correspondentAccount }, { name: 'ПАО СБЕРБАНК', correspondentAccount: '30101810400000000225' });
});
test('компания не возвращается при несовпадении ИНН', () => assert.equal(normalizeParty(company,'1234567890'),null));
test('банк не возвращается при несовпадении БИК', () => assert.equal(normalizeBank(bank,'123456789'),null));
test('нельзя обратиться без DADATA_TOKEN', async () => {
  let called=false;
  const result=await lookupDadata({type:'bank',query:'044525225',token:'',fetchImpl:async()=>{called=true;}});
  assert.equal(result.body.code,'TOKEN_MISSING');
  assert.equal(called,false);
});
test('API использует Authorization: Token, возвращает только безопасные поля', async () => {
  const result=await lookupDadata({type:'party',query:'7707083893',token:'some-secret',fetchImpl:async (url,opts)=>{
    assert.match(url,/findById\/party$/);
    assert.equal(opts.headers.Authorization,'Token some-secret');
    assert.equal(JSON.parse(opts.body).branch_type,'MAIN');
    return (await mock(company)());
  }});
  assert.equal(result.status,200);
  assert.equal(result.body.name,'ООО «Тест»');
  assert.ok(!JSON.stringify(result.body).includes('some-secret'));
});
test('ошибка токена преобразуется в безопасную ошибку', async () => {
  const result=await lookupDadata({type:'party',query:'7707083893',token:'wrong',fetchImpl:mock({},401)});
  assert.equal(result.status,503);
  assert.equal(result.body.code,'TOKEN_INVALID');
});
test('лимит DaData имеет код RATE_LIMIT', async () => {
  const result=await lookupDadata({type:'bank',query:'044525225',token:'secret',fetchImpl:mock({},429)});
  assert.equal(result.status,429);
  assert.equal(result.body.code,'RATE_LIMIT');
});
test('неизвестная компания: 404', async () => {
  const result=await lookupDadata({type:'party',query:'7707083893',token:'secret',fetchImpl:mock({suggestions:[]})});
  assert.equal(result.status,404);
});
test('неисправный JSON не приводит к падению', async () => {
  const result=await lookupDadata({type:'bank',query:'044525225',token:'secret',fetchImpl:async()=>({status:200,ok:true,json:async()=>{throw new Error('x')}})});
  assert.equal(result.body.code,'BAD_RESPONSE');
});
test('таймаут и сетевые сбои не раскрывают серверные ошибки', async () => {
  const result=await lookupDadata({type:'bank',query:'044525225',token:'secret',fetchImpl:async()=>{throw new Error('internal private host')}});
  assert.equal(result.body.code,'UPSTREAM_UNAVAILABLE');
  assert.ok(!JSON.stringify(result.body).includes('internal private host'));
});
test('GET API на локальном сервере', async () => {
  const response=await handleLookupUrl('http://localhost:8080/api/lookup?type=bank&query=044525225','secret',mock(bank));
  assert.equal(response.status,200);
  assert.equal(response.body.bik,'044525225');
});
