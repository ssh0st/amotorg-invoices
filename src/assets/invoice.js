(() => {
  'use strict';

  const calc = window.InvoiceMath;
  const form = document.getElementById('invoice-form');
  if (!form || !calc) return;

  const STORAGE_KEY = 'amotorg-invoice:v3';
  const PREVIOUS_STORAGE_KEYS = ['amotorg-invoice:v1', 'amotorgh-invoice:v1'];
  const MAX_ROWS = 100;
  const FIELD_NAMES = [
    'invoiceNo', 'issueDate', 'actNo', 'actDate', 'currency',
    'contractTitle', 'contractNo', 'contractDate',
    'bankName', 'bik', 'correspondentAccount', 'settlementAccount',
    'taxId', 'kpp', 'recipient', 'seller', 'sellerAddress', 'sellerInfo',
    'buyerTaxId', 'buyerKpp', 'buyer', 'buyerAddress', 'buyerInfo', 'comment',
    'position', 'signatureName', 'buyerPosition', 'buyerSignatureName' 
  ];
  const rowsHost = document.getElementById('line-items');
  const addRowButton = document.getElementById('add-row');
  const fileInput = document.getElementById('import-file');
  const toastElement = document.getElementById('app-toast');
  const tabs = [...document.querySelectorAll('[data-document-target]')];
  const documents = [...document.querySelectorAll('[data-document]')];
  let activeDocument = 'invoice';
  let toastTimer;
  let saveTimer;
  let previousSeller = '';
  const autoValues = Object.create(null);
  const lookupTimers = Object.create(null);
  const requestId = { seller: 0, buyer: 0, bank: 0 };
  const lastQuery = { seller: '', buyer: '', bank: '' };

  function todayLocal() {
    const now = new Date();
    return [now.getFullYear(), String(now.getMonth() + 1).padStart(2, '0'), String(now.getDate()).padStart(2, '0')].join('-');
  }

  function initialData() {
    const date = todayLocal();
    return {
      fields: { invoiceNo: '1', issueDate: date, actNo: '1', actDate: date, currency: 'RUB', contractTitle: 'Договор' },
      items: [{ description: '', qty: '1', unit: 'усл.', vat: 'none', price: '0' }]
    };
  }

  function field(name) {
    return form.elements.namedItem(name);
  }

  function cleanText(text, max = 1200) {
    return typeof text === 'string' ? text.slice(0, max) : '';
  }

  function getFieldData() {
    const data = {};
    for (const key of FIELD_NAMES) data[key] = field(key).value;
    return data;
  }

  function getItems() {
    return [...rowsHost.querySelectorAll('.line-item')].map(row => {
      const item = {};
      for (const key of ['description', 'qty', 'unit', 'vat', 'price']) {
        item[key] = row.querySelector(`[data-field="${key}"]`).value;
      }
      return item;
    });
  }

  function getData() {
    return { version: 2, fields: getFieldData(), items: getItems() };
  }

  function makeRow(item = {}) {
    const element = document.createElement('div');
    element.className = 'line-item';
    // Шаблон статический. Значения пользователя назначаются только через .value.
    element.innerHTML = `
      <div class="item-heading"><strong class="item-index">Услуга</strong><button type="button" class="remove-row" title="Убрать позицию" aria-label="Удалить услугу">Удалить</button></div>
      <div class="item-grid">
        <label class="wide">Наименование услуги<input data-field="description" maxlength="350" placeholder="Например: Разработка сайта" required></label>
        <label>Количество<input data-field="qty" inputmode="decimal" maxlength="10" pattern="[0-9]+([.,][0-9]{1,3})?" title="Количество, например 1 или 1,5" required></label>
        <label>Ед. изм.<input data-field="unit" maxlength="20" placeholder="усл." required></label>
        <label>НДС<select data-field="vat"><option value="none">Без НДС</option><option value="0">0%</option><option value="5">5%</option><option value="7">7%</option><option value="10">10%</option><option value="20">20%</option><option value="22">22%</option></select></label>
        <label class="wide">Цена за единицу (НДС включён)<input data-field="price" inputmode="decimal" maxlength="12" pattern="[0-9]+([.,][0-9]{1,2})?" placeholder="0,00" required></label>
      </div>
      <div class="item-sum"><span>Сумма позиции</span><strong data-sum>0,00</strong></div>`;
    for (const key of ['description', 'qty', 'unit', 'vat', 'price']) {
      const input = element.querySelector(`[data-field="${key}"]`);
      const defaults = { description: '', qty: '1', unit: 'усл.', vat: 'none', price: '0' };
      const value = Object.prototype.hasOwnProperty.call(item, key) ? item[key] : defaults[key];
      input.value = cleanText(value, 350);
      if (key === 'vat' && !['none', '0', '5', '7', '10', '20', '22'].includes(input.value)) input.value = 'none';
    }
    element.querySelector('.remove-row').addEventListener('click', () => {
      if (rowsHost.children.length === 1) {
        const fresh = makeRow();
        element.replaceWith(fresh);
      } else {
        element.remove();
      }
      renumberRows();
      update();
    });
    return element;
  }

  function renumberRows() {
    [...rowsHost.children].forEach((row, index) => {
      row.querySelector('.item-index').textContent = `Услуга ${index + 1}`;
    });
    addRowButton.disabled = rowsHost.children.length >= MAX_ROWS;
  }

  function applyData(data) {
    const defaults = initialData();
    const source = data && typeof data === 'object' ? data : defaults;
    const inputFields = source.fields && typeof source.fields === 'object' ? source.fields : defaults.fields;
    for (const key of FIELD_NAMES) {
      const fallback = Object.prototype.hasOwnProperty.call(defaults.fields, key) ? defaults.fields[key] : '';
      const value = Object.prototype.hasOwnProperty.call(inputFields, key) ? inputFields[key] : fallback;
      field(key).value = cleanText(value);
    }
    if (!['RUB', 'EUR', 'USD', 'GBP', 'KZT'].includes(field('currency').value)) field('currency').value = 'RUB';
    rowsHost.replaceChildren();
    const items = Array.isArray(source.items) ? source.items.slice(0, MAX_ROWS) : defaults.items;
    for (const item of (items.length ? items : defaults.items)) {
      rowsHost.append(makeRow(item && typeof item === 'object' ? item : {}));
    }
    previousSeller = field('seller').value;
    Object.keys(autoValues).forEach(key => delete autoValues[key]);
    Object.keys(lastQuery).forEach(key => { lastQuery[key] = ''; requestId[key] += 1; });
    renumberRows();
    render();
  }

  function readLocal() {
    try {
      const text = [STORAGE_KEY, ...PREVIOUS_STORAGE_KEYS].map(key => window.localStorage.getItem(key)).find(Boolean);
      if (!text) return null;
      const data = JSON.parse(text);
      return data && [1, 2].includes(data.version) ? data : null;
    } catch { return null; }
  }

  function saveLocal() {
    try { window.localStorage.setItem(STORAGE_KEY, JSON.stringify(getData())); }
    catch { /* Частный режим может блокировать localStorage; предпросмотр всё равно работает. */ }
  }

  function update() {
    render();
    window.clearTimeout(saveTimer);
    saveTimer = window.setTimeout(saveLocal, 220);
  }

  function text(id, value, placeholder = '—') {
    const element = document.getElementById(id);
    if (element) element.textContent = String(value || placeholder);
  }

  function dateText(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(iso || '')) return '—';
    const [year, month, day] = iso.split('-').map(Number);
    const date = new Date(year, month - 1, day);
    if (date.getFullYear() !== year || date.getMonth() !== month - 1 || date.getDate() !== day) return '—';
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(date);
  }

  function formatContract(data) {
    if (!data.contractNo.trim() && !data.contractDate.trim()) return '';
    const title = data.contractTitle.trim() || 'Договор';
    return [title, data.contractNo.trim() && `№ ${data.contractNo.trim()}`, data.contractDate.trim() && `от ${dateText(data.contractDate)}`].filter(Boolean).join(' ');
  }

  function createCell(row, value) {
    const cell = document.createElement('td');
    cell.textContent = String(value ?? '');
    row.append(cell);
  }

  function updateTable(bodyId, lines, currency, isAct) {
    const tbody = document.getElementById(bodyId);
    tbody.replaceChildren();
    if (!lines.length) {
      const tr = document.createElement('tr');
      const td = document.createElement('td');
      td.colSpan = isAct ? 6 : 7;
      td.textContent = 'Добавьте хотя бы одну услугу';
      td.style.textAlign = 'center';
      tr.append(td);
      tbody.append(tr);
      return;
    }
    lines.forEach((item, index) => {
      const tr = document.createElement('tr');
      createCell(tr, index + 1);
      createCell(tr, item.description);
      createCell(tr, calc.formatNumber(item.quantity / 1000));
      createCell(tr, item.unit || '—');
      if (!isAct) createCell(tr, item.vat === 'none' ? 'Без НДС' : `${item.vat}%`);
      createCell(tr, calc.formatMoney(item.unitPrice, currency));
      createCell(tr, calc.formatMoney(item.amount, currency));
      tbody.append(tr);
    });
  }

  function render() {
    const data = getFieldData();
    const currency = data.currency;
    const items = getItems();
    const totals = calc.calculate(items);

    text('p-bank-name', data.bankName);
    text('p-bank-bik', data.bik);
    text('p-bank-correspondent', data.correspondentAccount);
    text('p-bank-tax-id', data.taxId);
    text('p-bank-kpp', data.kpp);
    text('p-bank-settlement', data.settlementAccount);
    text('p-bank-recipient', data.recipient);
    text('p-invoice-no', data.invoiceNo);
    text('p-invoice-date', dateText(data.issueDate));
    text('p-invoice-seller', data.seller, 'Исполнитель');
    text('p-invoice-seller-info', [data.taxId && `ИНН ${data.taxId}`, data.kpp && `КПП ${data.kpp}`, data.sellerAddress, data.sellerInfo].filter(Boolean).join('\n'), '');
    text('p-invoice-buyer', data.buyer, 'Заказчик');
    const buyerInfo = [data.buyerTaxId && `ИНН ${data.buyerTaxId}`, data.buyerKpp && `КПП ${data.buyerKpp}`, data.buyerAddress, data.buyerInfo].filter(Boolean).join('\n');
    text('p-invoice-buyer-info', buyerInfo, '');
    const commentWrapper = document.getElementById('p-invoice-comment-box');
    commentWrapper.hidden = !data.comment.trim();
    text('p-invoice-comment', data.comment, '');
    const contract = formatContract(data);
    document.getElementById('p-invoice-contract-box').hidden = !contract;
    document.getElementById('p-act-contract-box').hidden = !contract;
    text('p-invoice-contract', contract, '');
    text('p-act-contract', contract, '');
    document.getElementById('p-act-comment-box').hidden = !data.comment.trim();
    text('p-act-comment', data.comment, '');

    text('p-act-no', data.actNo);
    text('p-act-date', dateText(data.actDate));
    text('p-act-invoice-no', data.invoiceNo);
    text('p-act-invoice-date', dateText(data.issueDate));
    text('p-act-seller-intro', data.seller, 'Исполнитель');
    text('p-act-buyer-intro', data.buyer, 'Заказчик');
    text('p-act-seller', data.seller, 'Исполнитель');
    text('p-act-buyer', data.buyer, 'Заказчик');
    text('p-act-seller-info', [data.taxId && `ИНН ${data.taxId}`, data.kpp && `КПП ${data.kpp}`, data.sellerAddress, data.sellerInfo].filter(Boolean).join('\n'), '');
    text('p-act-buyer-info', buyerInfo, '');
    text('p-act-position', data.position, 'Должность');
    text('p-act-signature-name', data.signatureName, 'Расшифровка подписи');
    text('p-act-buyer-position', data.buyerPosition, 'Уполномоченный представитель');
    text('p-act-buyer-signature-name', data.buyerSignatureName, 'Расшифровка подписи');
    text('p-invoice-position', data.position, 'Должность');
    text('p-invoice-signature-name', data.signatureName, 'Расшифровка подписи');

    updateTable('p-invoice-lines', totals.lines, currency, false);
    updateTable('p-act-lines', totals.lines, currency, true);
    text('p-invoice-total', calc.formatMoney(totals.total, currency));
    text('p-act-total', calc.formatMoney(totals.total, currency));
    text('p-invoice-count', totals.count, '0');
    text('p-invoice-total-text', calc.formatMoney(totals.total, currency));
    text('p-invoice-amount-words', calc.amountInWords(totals.total, currency));
    text('p-invoice-vat', calc.formatMoney(totals.vat, currency));
    document.getElementById('p-invoice-vat-wrap').hidden = !totals.hasVat;
    text('p-act-vat-note', totals.hasVat ? `В том числе НДС: ${calc.formatMoney(totals.vat, currency)}` : 'Без НДС');

    [...rowsHost.querySelectorAll('.line-item')].forEach(row => {
      const get = key => row.querySelector(`[data-field="${key}"]`).value;
      const line = calc.calculateLine({ qty: get('qty'), price: get('price'), vat: get('vat') });
      row.querySelector('[data-sum]').textContent = line.valid ? calc.formatMoney(line.amount, currency) : 'Проверьте значение';
    });
  }

  function activateDocument(target) {
    if (!['invoice', 'act'].includes(target)) return;
    activeDocument = target;
    tabs.forEach(tab => {
      const selected = tab.dataset.documentTarget === target;
      tab.classList.toggle('is-active', selected);
      tab.setAttribute('aria-selected', String(selected));
      tab.tabIndex = selected ? 0 : -1;
    });
    documents.forEach(doc => {
      const selected = doc.dataset.document === target;
      doc.classList.toggle('is-active', selected);
      doc.setAttribute('aria-hidden', String(!selected));
    });
    document.getElementById('download-label').textContent = target === 'invoice' ? 'Сохранить счёт в PDF' : 'Сохранить акт в PDF';
  }

  function notify(message, isError = false) {
    toastElement.textContent = message;
    toastElement.classList.toggle('error', isError);
    toastElement.hidden = false;
    window.clearTimeout(toastTimer);
    toastTimer = window.setTimeout(() => { toastElement.hidden = true; }, 4300);
  }

  function validateLines() {
    for (const row of rowsHost.querySelectorAll('.line-item')) {
      const data = {};
      for (const key of ['description', 'qty', 'unit', 'vat', 'price']) data[key] = row.querySelector(`[data-field="${key}"]`).value;
      const line = calc.calculateLine(data);
      if (!line.valid || line.quantity <= 0) {
        const input = row.querySelector(`[data-field="${!line.quantity ? 'qty' : 'price'}"]`);
        input.setCustomValidity('Количество должно быть больше нуля и не превышать 10 000; цена — от 0 до 10 000 000');
        input.reportValidity();
        input.focus();
        return false;
      }
    }
    return true;
  }

  function downloadFile(name, body, type) {
    const url = URL.createObjectURL(new Blob([body], { type }));
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = name;
    document.body.append(anchor);
    anchor.click();
    anchor.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  }

  function exportJSON() {
    const data = { ...getData(), exportedAt: new Date().toISOString() };
    const number = (data.fields.invoiceNo || 'draft').replace(/[^a-zA-Zа-яА-ЯёЁ\d_-]/g, '_').slice(0, 40);
    downloadFile(`schet-${number}.json`, JSON.stringify(data, null, 2), 'application/json;charset=utf-8');
    notify('Данные сохранены в JSON. Файл можно импортировать позже.');
  }

  function onSellerTyping() {
    const current = field('seller').value;
    if (!field('recipient').value.trim() || field('recipient').value === previousSeller) {
      field('recipient').value = current;
    }
    previousSeller = current;
  }

  function setField(name, value, overwrite = true) {
    const input = field(name);
    if (!input || (input.value.trim() && !overwrite)) return;
    input.value = cleanText(value, input.maxLength > 0 ? input.maxLength : 1200);
  }

  // Автозаполнение сохраняет любые ручные исправления. Кнопка поиска явно разрешает перезапись.
  function applyAutoField(name, value, force = false) {
    if (typeof value !== 'string' || !value.trim()) return false;
    const input = field(name);
    if (!input) return false;
    const current = input.value;
    if (!force && current.trim() && autoValues[name] !== current) return false;
    setField(name, value);
    autoValues[name] = input.value;
    input.dataset.autofilled = 'true';
    return true;
  }

  function setLookupStatus(key, message, isError = false) {
    const el = document.getElementById(`${key}-lookup-status`);
    el.classList.toggle('error', isError);
    el.textContent = message;
  }

  async function lookupCompany(who, force = false) {
    const seller = who === 'seller';
    const taxInput = field(seller ? 'taxId' : 'buyerTaxId');
    const button = document.getElementById(seller ? 'lookup-seller' : 'lookup-buyer');
    const key = seller ? 'seller' : 'buyer';
    const inn = taxInput.value.trim();
    if (!/^(?:\d{10}|\d{12})$/.test(inn)) {
      setLookupStatus(key, 'Введите ИНН из 10 или 12 цифр.', true);
      if (force) taxInput.focus();
      return;
    }
    if (!force && lastQuery[key] === inn) return;
    const id = ++requestId[key];
    button.disabled = true;
    setLookupStatus(key, 'Ищем реквизиты в DaData…');
    try {
      const result = await window.DadataLookup.search('party', inn);
      if (requestId[key] !== id || taxInput.value.trim() !== inn) return;
      lastQuery[key] = inn;
      let applied = 0;
      if (seller) {
        applied += Number(applyAutoField('seller', result.name, force));
        applied += Number(applyAutoField('recipient', result.name, force));
        applied += Number(applyAutoField('kpp', result.kpp, force));
        applied += Number(applyAutoField('sellerAddress', result.address, force));
        applied += Number(applyAutoField('position', result.position, force));
        applied += Number(applyAutoField('signatureName', result.manager, force));
        previousSeller = field('seller').value;
      } else {
        applied += Number(applyAutoField('buyer', result.name, force));
        applied += Number(applyAutoField('buyerKpp', result.kpp, force));
        applied += Number(applyAutoField('buyerAddress', result.address, force));
        applied += Number(applyAutoField('buyerPosition', result.position, force));
        applied += Number(applyAutoField('buyerSignatureName', result.manager, force));
      }
      const warning = result.state && result.state !== 'ACTIVE' ? ' Внимание: статус организации не «Действующая»!' : '';
      setLookupStatus(key, applied
        ? `Данные найдены и подставлены (${applied} пол.). Можно изменить вручную.${warning}`
        : `Организация найдена. Заполненные вручную поля сохранены; нажмите «Найти по ИНН», чтобы заменить их.${warning}`);
      update();
    } catch (error) {
      if (requestId[key] !== id) return;
      lastQuery[key] = '';
      setLookupStatus(key, error.message || 'Не удалось получить данные DaData.', true);
    } finally {
      if (requestId[key] === id) button.disabled = false;
    }
  }

  async function lookupBank(force = false) {
    const input = field('bik');
    const button = document.getElementById('lookup-bank');
    const bik = input.value.trim();
    if (!/^\d{9}$/.test(bik)) {
      setLookupStatus('bank', 'Введите БИК из 9 цифр.', true);
      if (force) input.focus();
      return;
    }
    if (!force && lastQuery.bank === bik) return;
    const id = ++requestId.bank;
    button.disabled = true;
    setLookupStatus('bank', 'Ищем банк в DaData…');
    try {
      const result = await window.DadataLookup.search('bank', bik);
      if (requestId.bank !== id || input.value.trim() !== bik) return;
      lastQuery.bank = bik;
      const filled = Number(applyAutoField('bankName', result.name, force)) + Number(applyAutoField('correspondentAccount', result.correspondentAccount, force));
      const warning = result.state && result.state !== 'ACTIVE' ? ' Проверьте статус банка.' : '';
      setLookupStatus('bank', filled
        ? `Банк и доступные реквизиты подставлены. Расчётный счёт вводится отдельно.${warning}`
        : `Банк найден. Ваши правки сохранены; кнопка «Найти по БИК» перезапишет их.${warning}`);
      update();
    } catch (error) {
      if (requestId.bank !== id) return;
      lastQuery.bank = '';
      setLookupStatus('bank', error.message || 'Ошибка поиска БИК.', true);
    } finally { if (requestId.bank === id) button.disabled = false; }
  }

  // После паузы автоматически искать только полный идентификатор. Ручной запуск перезапишет поля.
  function queueLookup(key, inputName) {
    clearTimeout(lookupTimers[key]);
    const value = field(inputName).value.trim();
    if (value !== lastQuery[key]) requestId[key] += 1; // устаревший ответ не должен заполнить форму
    if (key === 'bank' ? !/^\d{9}$/.test(value) : !/^(?:\d{10}|\d{12})$/.test(value)) {
      setLookupStatus(key, key === 'bank' ? 'Введите 9 цифр БИК для автозаполнения.' : 'Введите ИНН из 10 или 12 цифр для автозаполнения.');
      return;
    }
    lookupTimers[key] = setTimeout(() => {
      if (key === 'bank') lookupBank(false);
      else lookupCompany(key, false);
    }, 650);
  }

  function escapeHtml(value) {
    return String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]);
  }

  // Печать из отдельного HTML-документа: в нём нет ни формы, ни навигации, ни футера сайта.
  function printActiveDocument() {
    const original = document.querySelector(`.paper[data-document="${activeDocument}"]`);
    if (!original) return;
    const copy = original.cloneNode(true);
    copy.classList.add('is-active');
    copy.querySelectorAll('.created-with, [data-no-print]').forEach(element => element.remove());
    const number = field(activeDocument === 'invoice' ? 'invoiceNo' : 'actNo').value;
    const title = `${activeDocument === 'invoice' ? 'Счёт' : 'Акт'} № ${number} — Amotorg`;
    const printableHtml = `<!doctype html><html lang="ru"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${escapeHtml(title)}</title><link rel="stylesheet" href="${new URL('/assets/print.css', document.baseURI).href}"></head><body><main class="print-root">${copy.outerHTML}</main></body></html>`;
    const frame = document.createElement('iframe');
    frame.title = 'Документ для печати';
    frame.setAttribute('aria-hidden', 'true');
    frame.style.cssText = 'position:fixed;right:0;bottom:0;width:1px;height:1px;border:0;opacity:0;pointer-events:none;';
    document.body.append(frame);
    let started = false;
    let cleanupTimer;
    const cleanup = () => { window.clearTimeout(cleanupTimer); frame.remove(); };
    frame.onload = async () => {
      if (started) return;
      started = true;
      try {
        if (frame.contentDocument?.fonts?.ready) await frame.contentDocument.fonts.ready;
        frame.contentWindow.addEventListener('afterprint', cleanup, { once: true });
        frame.contentWindow.focus();
        frame.contentWindow.print();
        cleanupTimer = window.setTimeout(cleanup, 90000);
      } catch {
        cleanup();
        notify('Не удалось открыть печать. Разрешите печать для этого сайта.', true);
      }
    };
    frame.srcdoc = printableHtml;
  }

  addRowButton.addEventListener('click', () => {
    if (rowsHost.children.length >= MAX_ROWS) return;
    const row = makeRow();
    rowsHost.append(row);
    renumberRows();
    update();
    row.querySelector('[data-field="description"]').focus();
  });

  form.addEventListener('input', event => {
    if (event.target.name === 'seller') onSellerTyping();
    if (event.target.name && event.target.dataset.autofilled === 'true') delete event.target.dataset.autofilled;
    if (event.target.hasAttribute('data-field')) event.target.setCustomValidity('');
    update();
  });
  form.addEventListener('change', update);
  form.addEventListener('submit', event => event.preventDefault());

  tabs.forEach((tab, index) => {
    tab.addEventListener('click', () => activateDocument(tab.dataset.documentTarget));
    tab.addEventListener('keydown', event => {
      if (!['ArrowLeft', 'ArrowRight'].includes(event.key)) return;
      event.preventDefault();
      const next = tabs[(index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length];
      activateDocument(next.dataset.documentTarget);
      next.focus();
    });
  });

  document.getElementById('download-pdf').addEventListener('click', () => {
    for (const row of rowsHost.querySelectorAll('.line-item')) {
      for (const input of row.querySelectorAll('input')) input.setCustomValidity('');
    }
    if (!form.reportValidity() || !validateLines()) {
      notify('Проверьте обязательные поля и значения услуг.', true);
      return;
    }
    saveLocal();
    printActiveDocument();
  });

  document.getElementById('new-invoice').addEventListener('click', () => {
    if (!window.confirm('Создать новый счёт? Данные исполнителя, банка и подписанта сохранятся; заказчик, договор и услуги будут очищены.')) return;
    const previous = getData().fields;
    const fresh = initialData();
    const retained = ['currency','taxId','kpp','seller','recipient','sellerAddress','sellerInfo','bankName','bik',
      'correspondentAccount','settlementAccount','position','signatureName'];
    for (const key of retained) fresh.fields[key] = previous[key];
    const currentNumber = previous.invoiceNo.trim();
    if (/^\d{1,12}$/.test(currentNumber)) {
      fresh.fields.invoiceNo = String(BigInt(currentNumber) + 1n).padStart(currentNumber.length, '0');
      fresh.fields.actNo = fresh.fields.invoiceNo;
    }
    applyData(fresh);
    activateDocument('invoice');
    saveLocal();
    notify('Новый счёт создан. Исполнитель и банк сохранены.');
    field('buyerTaxId').focus();
  });

  document.getElementById('reset-btn').addEventListener('click', () => {
    if (!window.confirm('Удалить все введённые данные и очистить черновик?')) return;
    window.clearTimeout(saveTimer);
    try { [STORAGE_KEY, ...PREVIOUS_STORAGE_KEYS].forEach(key => window.localStorage.removeItem(key)); } catch {}
    applyData(initialData());
    saveLocal();
    notify('Форма очищена.');
    field('invoiceNo').focus();
  });

  document.getElementById('export-json').addEventListener('click', exportJSON);
  document.getElementById('import-json').addEventListener('click', () => fileInput.click());
  fileInput.addEventListener('change', async () => {
    const file = fileInput.files?.[0];
    fileInput.value = '';
    if (!file) return;
    if (file.size > 256 * 1024) { notify('Файл слишком большой (максимум 256 КБ).', true); return; }
    try {
      const data = JSON.parse(await file.text());
      if (!data || ![1,2].includes(data.version) || !data.fields || !Array.isArray(data.items)) throw new Error('Неверный формат JSON для этого генератора.');
      applyData(data);
      saveLocal();
      notify('Черновик импортирован.');
    } catch (error) { notify(error.message || 'Не удалось прочитать файл.', true); }
  });

  document.getElementById('lookup-seller').addEventListener('click', () => { clearTimeout(lookupTimers.seller); lookupCompany('seller', true); });
  document.getElementById('lookup-buyer').addEventListener('click', () => { clearTimeout(lookupTimers.buyer); lookupCompany('buyer', true); });
  document.getElementById('lookup-bank').addEventListener('click', () => { clearTimeout(lookupTimers.bank); lookupBank(true); });
  field('taxId').addEventListener('input', () => queueLookup('seller', 'taxId'));
  field('buyerTaxId').addEventListener('input', () => queueLookup('buyer', 'buyerTaxId'));
  field('bik').addEventListener('input', () => queueLookup('bank', 'bik'));

  applyData(readLocal() || initialData());
  activateDocument('invoice');
})();
