const test = require('node:test');
const assert = require('node:assert/strict');
const lookup = require('../src/assets/dadata-lookup.js');

test('клиент отправляет только ИНН на собственный /api/lookup, без токена', async () => {
  const saved = global.fetch;
  let url;
  global.fetch = async (input) => {
    url = input;
    return { ok: true, headers: { get: () => 'application/json' }, json: async () => ({ type: 'party', inn: '7707083893', name: 'Тест' }) };
  };
  try {
    const result = await lookup.search('party','7707083893');
    assert.equal(result.name,'Тест');
    assert.match(url, /^\/api\/lookup\?type=party&query=7707083893$/);
    assert.ok(!url.includes('Token'));
  } finally { global.fetch = saved; }
});

test('клиент отвергает неполный БИК без обращения к сети', async () => {
  await assert.rejects(() => lookup.search('bank','12345'),/БИК/);
});
