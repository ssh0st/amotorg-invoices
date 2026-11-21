/* Расчёты выполняются в целых минимальных единицах (копейках/центах). */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.InvoiceMath = api;
})(typeof window !== 'undefined' ? window : undefined, function () {
  'use strict';

  const currencyNames = {
    RUB: { main: ['рубль', 'рубля', 'рублей'], sub: ['копейка', 'копейки', 'копеек'], subFemale: true },
    EUR: { main: ['евро', 'евро', 'евро'], sub: ['евроцент', 'евроцента', 'евроцентов'] },
    USD: { main: ['доллар', 'доллара', 'долларов'], sub: ['цент', 'цента', 'центов'] },
    GBP: { main: ['фунт', 'фунта', 'фунтов'], sub: ['пенс', 'пенса', 'пенсов'] },
    KZT: { main: ['тенге', 'тенге', 'тенге'], sub: ['тиын', 'тиына', 'тиынов'] }
  };

  function decimalParts(value, places) {
    const text = String(value ?? '').trim().replace(/\s|\u00a0|\u202f/g, '').replace(',', '.');
    const regex = places === 2 ? /^\d+(?:\.\d{1,2})?$/ : /^\d+(?:\.\d{1,3})?$/;
    if (!regex.test(text)) return null;
    const [whole, fractional = ''] = text.split('.');
    const multiplier = places === 2 ? 100 : 1000;
    const result = Number(whole) * multiplier + Number(fractional.padEnd(places, '0'));
    return Number.isSafeInteger(result) ? result : null;
  }

  function parsePrice(value) { return decimalParts(value, 2); }
  function parseQuantity(value) { return decimalParts(value, 3); }

  function calculateLine(item) {
    const quantity = parseQuantity(item.qty);
    const unitPrice = parsePrice(item.price);
    if (quantity === null || unitPrice === null || quantity > 10000 * 1000 || unitPrice > 10000000 * 100) {
      return { valid: false, amount: 0, vatAmount: 0, quantity: 0, unitPrice: 0 };
    }
    const amount = Number((BigInt(quantity) * BigInt(unitPrice) + 500n) / 1000n);
    const rate = item.vat === 'none' ? null : Number(item.vat);
    const validRates = [0, 5, 7, 10, 20, 22];
    if (rate !== null && !validRates.includes(rate)) {
      return { valid: false, amount: 0, vatAmount: 0, quantity, unitPrice };
    }
    // Цена уже содержит НДС; выделяем его из суммы, а не прибавляем сверху.
    const vatAmount = rate === null ? 0 : Math.round(amount * rate / (100 + rate));
    return { valid: true, amount, vatAmount, quantity, unitPrice };
  }

  function calculate(items) {
    const rows = (Array.isArray(items) ? items : []).filter(item => typeof item.description === 'string' && item.description.trim());
    let total = 0;
    let vat = 0;
    let hasVat = false;
    const lines = rows.map(item => {
      const result = calculateLine(item);
      total += result.amount;
      vat += result.vatAmount;
      if (item.vat !== 'none') hasVat = true;
      return { ...item, ...result };
    });
    return { lines, total, vat, hasVat, count: lines.length };
  }

  function formatMoney(minor, currency = 'RUB') {
    const code = currencyNames[currency] ? currency : 'RUB';
    return new Intl.NumberFormat('ru-RU', {
      style: 'currency', currency: code, minimumFractionDigits: 2, maximumFractionDigits: 2
    }).format(minor / 100);
  }

  function formatNumber(value, maxFractionDigits = 3) {
    return new Intl.NumberFormat('ru-RU', { maximumFractionDigits: maxFractionDigits }).format(value);
  }

  const onesMale = ['', 'один', 'два', 'три', 'четыре', 'пять', 'шесть', 'семь', 'восемь', 'девять'];
  const onesFemale = ['', 'одна', 'две', ...onesMale.slice(3)];
  const teens = ['десять', 'одиннадцать', 'двенадцать', 'тринадцать', 'четырнадцать', 'пятнадцать', 'шестнадцать', 'семнадцать', 'восемнадцать', 'девятнадцать'];
  const tens = ['', '', 'двадцать', 'тридцать', 'сорок', 'пятьдесят', 'шестьдесят', 'семьдесят', 'восемьдесят', 'девяносто'];
  const hundreds = ['', 'сто', 'двести', 'триста', 'четыреста', 'пятьсот', 'шестьсот', 'семьсот', 'восемьсот', 'девятьсот'];
  const groups = [
    null,
    { forms: ['тысяча', 'тысячи', 'тысяч'], female: true },
    { forms: ['миллион', 'миллиона', 'миллионов'] },
    { forms: ['миллиард', 'миллиарда', 'миллиардов'] },
    { forms: ['триллион', 'триллиона', 'триллионов'] }
  ];

  function pluralIndex(n) {
    const mod100 = n % 100;
    const mod10 = n % 10;
    if (mod100 >= 11 && mod100 <= 14) return 2;
    if (mod10 === 1) return 0;
    if (mod10 >= 2 && mod10 <= 4) return 1;
    return 2;
  }
  function declension(n, forms) { return forms[pluralIndex(n)]; }

  function tripleWords(n, female) {
    const words = [];
    const hundred = Math.floor(n / 100);
    if (hundred) words.push(hundreds[hundred]);
    const two = n % 100;
    if (two >= 10 && two <= 19) words.push(teens[two - 10]);
    else {
      if (two >= 20) words.push(tens[Math.floor(two / 10)]);
      const one = two % 10;
      if (one) words.push((female ? onesFemale : onesMale)[one]);
    }
    return words.join(' ');
  }

  function integerWords(n, female) {
    if (n === 0) return 'ноль';
    if (!Number.isSafeInteger(n) || n < 0) return '';
    const words = [];
    let idx = 0;
    while (n > 0 && idx < groups.length) {
      const triple = n % 1000;
      if (triple) {
        const group = groups[idx];
        const part = tripleWords(triple, group ? Boolean(group.female) : female);
        words.unshift(group ? `${part} ${declension(triple, group.forms)}` : part);
      }
      n = Math.floor(n / 1000);
      idx++;
    }
    return words.join(' ');
  }

  function amountInWords(minor, currency = 'RUB') {
    if (!Number.isSafeInteger(minor) || minor < 0) return '';
    const unit = currencyNames[currency] || currencyNames.RUB;
    const major = Math.floor(minor / 100);
    const cents = minor % 100;
    const majorText = integerWords(major, false);
    const result = `${majorText} ${declension(major, unit.main)} ${String(cents).padStart(2, '0')} ${declension(cents, unit.sub)}`;
    return result.charAt(0).toUpperCase() + result.slice(1);
  }

  return { parsePrice, parseQuantity, calculateLine, calculate, formatMoney, formatNumber, amountInWords, integerWords, declension };
});
