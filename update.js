const fs = require('fs');
const path = require('path');

// Mapping des wikis connus (nom du provider -> URL du wiki)
const wikiMap = {
  purstream: 'https://purstream.wiki/',
  toflix: 'https://toflix.wiki/'
  // ajoute d'autres si besoin (anime-sama n'a pas de wiki, movix non plus)
};

// Récupérer un TLD depuis un wiki
async function fetchTldFromWiki(providerName, wikiUrl) {
  try {
    const resp = await fetch(wikiUrl);
    const html = await resp.text();
    // Pour toflix.wiki : "Domaine actuel # toflix.fit"
    let match = html.match(/Domaine actuel # ([a-z0-9.-]+)/i);
    if (match) {
      const parts = match[1].split('.');
      return parts.slice(1).join('.');
    }
    // Pour purstream.wiki : chercher "purstream.xxx"
    const regex = new RegExp(`${providerName}\\.[a-z]{2,}`, 'i');
    match = html.match(regex);
    if (match) {
      const parts = match[0].split('.');
      return parts.slice(1).join('.');
    }
    return null;
  } catch(e) {
    console.warn(`⚠️ Échec scraping wiki ${providerName} : ${e.message}`);
    return null;
  }
}

// Extraire le TLD depuis une URL (dernier segment)
function getTldFromUrl(url) {
  try {
    const host = new URL(url).hostname;
    const parts = host.split('.');
    return parts.slice(1).join('.');
  } catch(e) { return null; }
}

async function main() {
  // 1. Charger sources.json
  if (!fs.existsSync('sources.json')) {
    console.error('❌ sources.json introuvable');
    process.exit(1);
  }
  const sources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
  const allItems = [
    ...(sources.films_series || []),
    ...(sources.animes || []),
    ...(sources.direct_tv || [])
  ];

  // 2. Lister tous les providers dans le dossier
  const providerFiles = fs.readdirSync('providers').filter(f => f.endsWith('.js'));
  console.log(`📦 ${providerFiles.length} provider(s) trouvés : ${providerFiles.join(', ')}`);

  let domains = {};
  let modifiedCount = 0;

  for (const file of providerFiles) {
    const filePath = path.join('providers', file);
    const providerName = file.replace(/\.js$/, '').toLowerCase();
    let content = fs.readFileSync(filePath, 'utf8');

    // Détecter la variable * _FALLBACK (ex: PURSTREAM_FALLBACK, MOVIX_FALLBACK...)
    const fallbackMatch = content.match(/(var\s+)([A-Z_]+_FALLBACK)\s*=\s*['"]([^'"]*)['"]/);
    if (!fallbackMatch) {
      console.log(`ℹ️ ${file} : aucune variable *_FALLBACK trouvée, ignoré`);
      continue;
    }
    const varName = fallbackMatch[2];
    const currentValue = fallbackMatch[3];

    // Chercher le TLD à utiliser
    let tld = null;

    // 1) Si un wiki existe pour ce provider, on le scrape
    if (wikiMap[providerName]) {
      tld = await fetchTldFromWiki(providerName, wikiMap[providerName]);
      if (tld) console.log(`🔍 ${file} : wiki → TLD = ${tld}`);
    }

    // 2) Sinon, on cherche dans sources.json une entrée dont le nom correspond
    if (!tld) {
      const matchItem = allItems.find(item => item.nom && item.nom.toLowerCase() === providerName);
      if (matchItem && matchItem.url) {
        tld = getTldFromUrl(matchItem.url);
        if (tld) console.log(`🔍 ${file} : sources.json → TLD = ${tld}`);
      }
    }

    // 3) Si toujours pas, on garde la valeur actuelle
    if (!tld) {
      console.log(`⚠️ ${file} : aucun TLD trouvé, on conserve "${currentValue}"`);
      tld = currentValue;
    }

    // Mettre à jour la variable _FALLBACK
    let newContent = content.replace(
      new RegExp(`(var\\s+${varName}\\s*=\\s*['"])${currentValue}(['"])`, 'i'),
      `$1${tld}$2`
    );

    // Remplacer DOMAINS_URL si présent
    newContent = newContent.replace(
      /https:\/\/raw\.githubusercontent\.com\/wooodyhood\/nuvio-repo\/main\/domains\.json/g,
      'https://raw.githubusercontent.com/Nissay8z/json/main/domains.json'
    );

    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      console.log(`✅ ${file} : ${varName} = '${tld}' (était '${currentValue}')`);
      modifiedCount++;
    } else {
      console.log(`ℹ️ ${file} : aucune modification nécessaire`);
    }

    // Stocker pour domains.json
    const key = varName.replace('_FALLBACK', '').toLowerCase();
    domains[key] = tld;
  }

  // 3. Générer domains.json
  fs.writeFileSync('domains.json', JSON.stringify(domains, null, 2));
  console.log(`📄 domains.json généré avec ${Object.keys(domains).length} entrées`);

  // 4. Générer manifest.json
  const manifest = {
    name: "Catalogue Ultime Nissay",
    version: "1.0.0",
    scrapers: providerFiles.map(file => {
      const id = file.replace(/\.js$/, '');
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
  console.log(`📄 manifest.json généré (${providerFiles.length} scrapers)`);

  console.log(`\n🚀 Terminé. ${modifiedCount} fichier(s) provider modifié(s).`);
}

main().catch(console.error);
