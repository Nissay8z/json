// ===================== update.js =====================
const fs = require('fs');

async function fetchDomainFromWiki(url) {
  try {
    const resp = await fetch(url);
    const html = await resp.text();
    let match = html.match(/Domaine actuel # ([a-z0-9.-]+)/i);
    if (match) return match[1];
    match = html.match(/purstream\.[a-z]{2,}/i);
    return match ? match[0] : null;
  } catch(e) { return null; }
}

async function main() {
  // 1. Charger sources.json
  const sources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
  const allItems = [
    ...(sources.films_series || []),
    ...(sources.animes || []),
    ...(sources.direct_tv || [])
  ];

  const providerMap = [
    { nameMatch: /purstream/i, file: 'providers/purstream.js', varName: 'PURSTREAM_FALLBACK', varRegex: /(var\s+PURSTREAM_FALLBACK\s*=\s*['"])([^'"]*)(['"])/i, wikiUrl: 'https://purstream.wiki/' },
    { nameMatch: /anime-sama/i, file: 'providers/anime-sama.js', varName: 'AS_FALLBACK', varRegex: /(var\s+AS_FALLBACK\s*=\s*['"])([^'"]*)(['"])/i, wikiUrl: null },
    { nameMatch: /toflix/i, file: 'providers/toflix.js', varName: 'TOFLIX_FALLBACK', varRegex: /(var\s+TOFLIX_FALLBACK\s*=\s*['"])([^'"]*)(['"])/i, wikiUrl: 'https://toflix.wiki/' },
    { nameMatch: /movix/i, file: 'providers/movix.js', varName: 'MOVIX_FALLBACK', varRegex: /(var\s+MOVIX_FALLBACK\s*=\s*['"])([^'"]*)(['"])/i, wikiUrl: null },
    { nameMatch: /nakios/i, file: 'providers/nakios.js', varName: 'NAKIOS_FALLBACK', varRegex: /(var\s+NAKIOS_FALLBACK\s*=\s*['"])([^'"]*)(['"])/i, wikiUrl: null }
  ];

  let domains = {};
  let modified = 0;

  for (const item of allItems) {
    for (const provider of providerMap) {
      if (provider.nameMatch.test(item.nom)) {
        let tld = null;
        if (provider.wikiUrl) {
          const domain = await fetchDomainFromWiki(provider.wikiUrl);
          if (domain) tld = domain.split('.').slice(1).join('.');
        }
        if (!tld && item.url) {
          try {
            const host = new URL(item.url).hostname;
            tld = host.split('.').slice(1).join('.');
          } catch(e) {}
        }
        if (tld) {
          const key = provider.varName.replace('_FALLBACK', '').toLowerCase();
          domains[key] = tld;

          if (fs.existsSync(provider.file)) {
            let content = fs.readFileSync(provider.file, 'utf8');
            let newContent = content.replace(provider.varRegex, `$1${tld}$3`);
            newContent = newContent.replace(
              /https:\/\/raw\.githubusercontent\.com\/wooodyhood\/nuvio-repo\/main\/domains\.json/g,
              'https://raw.githubusercontent.com/Nissay8z/json/main/domains.json'
            );
            if (newContent !== content) {
              fs.writeFileSync(provider.file, newContent, 'utf8');
              console.log(`✅ ${provider.file} : ${provider.varName}=${tld}`);
              modified++;
            }
          }
        }
        break;
      }
    }
  }

  // Générer domains.json
  fs.writeFileSync('domains.json', JSON.stringify(domains, null, 2));
  console.log(`📄 domains.json généré`);

  // Générer manifest.json à partir des providers présents
  const files = fs.readdirSync('providers').filter(f => f.endsWith('.js'));
  const manifest = {
    name: "Catalogue Ultime Nissay",
    version: "1.0.0",
    scrapers: files.map(file => {
      const id = file.replace('.js', '');
      return {
        id: `${id}_nissay`,
        name: id.toUpperCase(),
        description: `Extension synchronisée pour ${id}`,
        version: "1.0.0",
        author: "Nissay",
        supportedTypes: ["movie", "tv"],
        filename: `providers/${file}`,
        enabled: true,
        formats: ["mp4", "m3u8"],
        contentLanguage: ["fr"]
      };
    })
  };
  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`📄 manifest.json généré (${files.length} scrapers)`);
  console.log(`\n🚀 Terminé. ${modified} fichier(s) provider modifié(s).`);
}

main().catch(console.error);
