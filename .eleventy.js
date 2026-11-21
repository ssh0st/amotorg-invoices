const { existsSync } = require('node:fs');

module.exports = function(eleventyConfig) {
  eleventyConfig.addPassthroughCopy({ 'src/assets': 'assets' });

  // Локальный API: работает с `npm run dev` и .env без Netlify CLI.
  eleventyConfig.setServerOptions({
    onRequest: {
      '/api/lookup': async function({ url }) {
        if (existsSync('.env') && typeof process.loadEnvFile === 'function') {
          // Возможность редактировать .env без отдельной сборки; ключ никогда не попадает в _site.
          try { process.loadEnvFile('.env'); } catch { /* при отсутствии корректного .env вернём понятную ошибку */ }
        }
        const { handleLookupUrl, apiHeaders } = await import('./lib/dadata-service.mjs');
        const result = await handleLookupUrl(url, (process.env.DADATA_TOKEN || process.env.dadata_token));
        return { status: result.status, headers: apiHeaders, body: JSON.stringify(result.body) };
      },
    },
  });

  return {
    dir: { input: 'src', includes: '_includes', output: '_site' },
    templateFormats: ['njk', 'md', 'html'],
    htmlTemplateEngine: 'njk',
    markdownTemplateEngine: 'njk',
  };
};
