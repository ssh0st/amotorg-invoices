/** Amotorg 3 — единая безопасная нормализация DaData для локального сервера, Netlify и Cloudflare. */
export const DADATA_ENDPOINT = 'https://suggestions.dadata.ru/suggestions/api/4_1/rs/findById/';

const string = (value, limit = 250) => (typeof value === 'string' ? value.trim().slice(0, limit) : '');
const response = (status, code, message) => ({ status, body: { code, error: message } });

export function validateLookup(kind, query) {
  const type = string(kind, 20);
  const value = string(query, 20);
  if (type !== 'party' && type !== 'bank') return { error: response(400, 'BAD_TYPE', 'Неизвестный тип поиска.') };
  if (type === 'party' && !/^(?:\d{10}|\d{12})$/.test(value)) return { error: response(400, 'INVALID_INN', 'Введите ИНН из 10 или 12 цифр.') };
  if (type === 'bank' && !/^\d{9}$/.test(value)) return { error: response(400, 'INVALID_BIK', 'Введите БИК из 9 цифр.') };
  return { type, query: value };
}

export function normalizeParty(json, inn) {
  const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
  const matches = suggestions.filter(s => String(s?.data?.inn || '') === inn);
  const found = matches.find(s => s?.data?.branch_type === 'MAIN') || matches[0];
  if (!found) return null;
  const d = found.data || {};
  const name = string(d.name?.short_with_opf || d.name?.full_with_opf || found.value, 250);
  if (!name) return null;
  return {
    type: 'party', inn, name, kpp: string(d.kpp, 20),
    address: string(d.address?.unrestricted_value || d.address?.value, 600),
    ogrn: string(d.ogrn, 30),
    position: string(d.management?.post, 120),
    manager: string(d.management?.name, 160),
    state: string(d.state?.status, 36),
  };
}

export function normalizeBank(json, bik) {
  const suggestions = Array.isArray(json?.suggestions) ? json.suggestions : [];
  const found = suggestions.find(s => String(s?.data?.bic || '') === bik);
  if (!found) return null;
  const d = found.data || {};
  const name = string(d.name?.payment || d.name?.short || found.value, 250);
  if (!name) return null;
  return {
    type: 'bank', bik, name,
    correspondentAccount: string(d.correspondent_account, 34),
    city: string(d.payment_city, 120),
    state: string(d.state?.status, 36),
  };
}

export async function lookupDadata({ type, query, token, fetchImpl = fetch, timeoutMs = 9000 }) {
  const validation = validateLookup(type, query);
  if (validation.error) return validation.error;
  if (!string(token, 2048)) return response(503, 'TOKEN_MISSING', 'Поиск не настроен: добавьте DADATA_TOKEN на сервере.');
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  let result;
  try {
    result = await fetchImpl(`${DADATA_ENDPOINT}${type}`, {
      method: 'POST',
      headers: {
        'Accept': 'application/json', 'Content-Type': 'application/json',
        'Authorization': `Token ${token}`,
      },
      body: JSON.stringify(type === 'party' ? { query, branch_type: 'MAIN', count: 3 } : { query, count: 3 }),
      signal: controller.signal,
    });
  } catch (error) {
    return response(controller.signal.aborted ? 504 : 502, controller.signal.aborted ? 'TIMEOUT' : 'UPSTREAM_UNAVAILABLE',
      controller.signal.aborted ? 'DaData долго не отвечает. Повторите запрос.' : 'Не удалось подключиться к DaData. Попробуйте позже.');
  } finally {
    clearTimeout(timeout);
  }
  if (result.status === 401 || result.status === 403) return response(503, 'TOKEN_INVALID', 'DaData отклонила токен. Проверьте DADATA_TOKEN на хостинге.');
  if (result.status === 429) return response(429, 'RATE_LIMIT', 'Достигнут лимит запросов DaData. Повторите позже.');
  if (!result.ok) return response(502, 'UPSTREAM_ERROR', `DaData временно недоступна (HTTP ${result.status}).`);
  let json;
  try { json = await result.json(); } catch { return response(502, 'BAD_RESPONSE', 'DaData вернула неожиданный ответ.'); }
  const record = type === 'party' ? normalizeParty(json, query) : normalizeBank(json, query);
  if (!record) return response(404, 'NOT_FOUND', type === 'party' ? 'Организация по этому ИНН не найдена.' : 'Банк по этому БИК не найден.');
  return { status: 200, body: record };
}

export const apiHeaders = {
  'Content-Type': 'application/json; charset=utf-8',
  'Cache-Control': 'no-store, max-age=0',
  'X-Content-Type-Options': 'nosniff',
};

export async function handleLookupUrl(url, token, fetchImpl = fetch) {
  const target = new URL(url, 'http://localhost');
  const { type, query } = Object.fromEntries(target.searchParams);
  return lookupDadata({ type, query, token, fetchImpl });
}
