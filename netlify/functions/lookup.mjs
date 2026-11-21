import { handleLookupUrl, apiHeaders } from '../../lib/dadata-service.mjs';

/** Netlify Function — секрет доступен только на сервере. */
export default async function handler(request) {
  if (request.method !== 'GET') return new Response(JSON.stringify({ code: 'METHOD_NOT_ALLOWED', error: 'Используйте GET.' }), { status: 405, headers: { ...apiHeaders, Allow: 'GET' } });
  const result = await handleLookupUrl(request.url, (process.env.DADATA_TOKEN || process.env.dadata_token));
  return new Response(JSON.stringify(result.body), { status: result.status, headers: apiHeaders });
}
