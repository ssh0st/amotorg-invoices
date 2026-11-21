/** Браузерный клиент: запрос только к собственному API, без токена DaData. */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  if (root) root.DadataLookup = api;
})(typeof window !== 'undefined' ? window : null, function () {
  'use strict';
  const cache = new Map();
  async function search(type, query) {
    const value = String(query || '').trim();
    if (!(type === 'party' ? /^(?:\d{10}|\d{12})$/.test(value) : type === 'bank' && /^\d{9}$/.test(value))) {
      throw new Error(type === 'party' ? 'Введите ИНН из 10 или 12 цифр.' : 'Введите БИК из 9 цифр.');
    }
    const cacheKey = `${type}:${value}`;
    const cached = cache.get(cacheKey);
    if (cached && Date.now() - cached.time < 5 * 60_000) return cached.data;
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 12000);
    let response;
    try {
      response = await fetch(`/api/lookup?type=${type}&query=${encodeURIComponent(value)}`, {
        headers: { Accept: 'application/json' }, cache: 'no-store', signal: controller.signal,
      });
      const ct = response.headers.get('content-type') || '';
      if (!ct.includes('application/json')) throw new Error('Серверный поиск не подключён. Запустите `npm run dev` или опубликуйте серверную функцию.');
      const result = await response.json();
      if (!response.ok) throw new Error(typeof result.error === 'string' ? result.error : `Ошибка поиска (${response.status}).`);
      if (result.type !== type || (type === 'party' ? result.inn !== value : result.bik !== value)) throw new Error('Сервер вернул некорректные реквизиты.');
      cache.set(cacheKey, { time: Date.now(), data: result });
      return result;
    } catch (error) {
      if (controller.signal.aborted) throw new Error('Превышено время ожидания. Проверьте интернет и повторите поиск.');
      if (error instanceof TypeError) throw new Error('Нет связи с серверной функцией поиска. Проверьте запуск или настройки хостинга.');
      throw error;
    } finally { clearTimeout(timeout); }
  }
  return { search };
});
