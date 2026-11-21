import { handleLookupUrl, apiHeaders } from '../../lib/dadata-service.mjs';

/** Cloudflare Pages Functions — переменная DADATA_TOKEN на сервере, а не в клиенте. */
export async function onRequestGet({ request, env }) {
  const result = await handleLookupUrl(request.url, (env.DADATA_TOKEN || env.dadata_token));
  return new Response(JSON.stringify(result.body), { status: result.status, headers: apiHeaders });
}
