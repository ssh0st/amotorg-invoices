const test = require('node:test');
const assert = require('node:assert/strict');
const {
  parsePrice, parseQuantity, calculateLine, calculate, amountInWords, integerWords, declension
} = require('../src/assets/calculations.js');

test('цена: допускаются точка и запятая, соблюдаются две десятичные цифры', () => {
  assert.equal(parsePrice('1234,50'), 123450);
  assert.equal(parsePrice('0.05'), 5);
  assert.equal(parsePrice('1 234,56'), 123456);
  assert.equal(parsePrice('12,345'), null);
  assert.equal(parsePrice('-1'), null);
});

test('количество: до трёх десятичных знаков', () => {
  assert.equal(parseQuantity('1,25'), 1250);
  assert.equal(parseQuantity('0.001'), 1);
  assert.equal(parseQuantity('1.2345'), null);
});

test('расчёты в копейках: 3 × 499.99 = 1499.97', () => {
  const sum = calculateLine({ qty: '3', price: '499,99', vat: 'none' });
  assert.equal(sum.valid, true);
  assert.equal(sum.amount, 149997);
  assert.equal(sum.vatAmount, 0);
});

test('округление дробного количества, включая 0.005 × 1.00', () => {
  const sum = calculateLine({ qty: '0.005', price: '1.00', vat: 'none' });
  assert.equal(sum.amount, 1);
});

test('НДС выделяется из включающей его цены, а не начисляется сверху', () => {
  const sum = calculateLine({ qty: '1', price: '122', vat: '22' });
  assert.equal(sum.amount, 12200);
  assert.equal(sum.vatAmount, 2200);
});

test('смешанные услуги: без НДС и с НДС', () => {
  const sum = calculate([
    { description: 'Услуга A', qty: '2', unit: 'шт.', price: '500', vat: 'none' },
    { description: 'Услуга B', qty: '1', unit: 'шт.', price: '122', vat: '22' },
    { description: '', qty: '1', unit: 'шт.', price: '200', vat: '22' }
  ]);
  assert.equal(sum.count, 2);
  assert.equal(sum.total, 112200);
  assert.equal(sum.vat, 2200);
  assert.equal(sum.hasVat, true);
});

test('безопасное вычисление больших значений через BigInt', () => {
  assert.equal(calculateLine({ qty: '10000', price: '10000000', vat: 'none' }).amount, 10000000000000);
  assert.equal(calculateLine({ qty: '10001', price: '1', vat: 'none' }).valid, false);
});

test('суммы прописью корректно склоняются', () => {
  assert.equal(amountInWords(10101, 'RUB'), 'Сто один рубль 01 копейка');
  assert.equal(amountInWords(1102, 'RUB'), 'Одиннадцать рублей 02 копейки');
  assert.equal(amountInWords(100100, 'RUB'), 'Одна тысяча один рубль 00 копеек');
  assert.equal(amountInWords(0, 'EUR'), 'Ноль евро 00 евроцентов');
  assert.equal(integerWords(2000000), 'два миллиона');
  assert.equal(declension(12, ['рубль', 'рубля', 'рублей']), 'рублей');
});
