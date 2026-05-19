const fs = require('fs');
const path = require('path');

const wikiMap = {
  purstream: 'https://purstream.wiki/',
  toflix: 'https://toflix.wiki/'
};

// Extraction améliorée du TLD depuis un wiki
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
    // Pour purstream.wiki : chercher "purstream.cx" (ou autre)
    const regex = new RegExp(`${providerName}\\.([a-z]{2,})`, 'i');
    match = html.match(regex);
    if (match) return match[1];
    return null;
  } catch(e) {
    console.error(`Erreur scraping ${providerName}:`, e.message);
    return null;
  }
}

function getTldFromUrl(url) {
  try {
    const hostname = new URL(url).hostname;
    const parts = hostname.split('.');
    return parts.slice(1).join('.');
  } catch(e) {
    return null;
  }
}

async function main() {
  // Lire sources.json
  const sources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
  const allItems = [
    ...(sources.films_series || []),
    ...(sources.animes || []),
    ...(sources.direct_tv || [])
  ];

  // Lister tous les providers du dossier
  const providerFiles = fs.readdirSync('providers').filter(f => f.endsWith('.js'));
  let domains = {};
  let modifiedCount = 0;

  for (const file of providerFiles) {
    const filePath = path.join('providers', file);
    const providerName = file.replace(/\.js$/, '').toLowerCase();
    let content = fs.readFileSync(filePath, 'utf8');

    // Détecter la variable *_FALLBACK
    const fallbackMatch = content.match(/(var|let|const)\s+([A-Z_]+_FALLBACK)\s*=\s*['"]([^'"]*)['"]/i);
    if (!fallbackMatch) continue;

    const varName = fallbackMatch[2];
    const currentValue = fallbackMatch[3];
    let tld = null;

    // 1. Essayer d'obtenir le TLD depuis le wiki si disponible
    if (wikiMap[providerName]) {
      tld = await fetchTldFromWiki(providerName, wikiMap[providerName]);
      if (tld) console.log(`✅ ${providerName} : wiki → TLD = ${tld}`);
    }

    // 2. Sinon, chercher dans sources.json
    if (!tld) {
      const matchItem = allItems.find(item => item.nom && item.nom.toLowerCase() === providerName);
      if (matchItem && matchItem.url) {
        tld = getTldFromUrl(matchItem.url);
        if (tld) console.log(`✅ ${providerName} : sources.json → TLD = ${tld}`);
      }
    }

    // 3. Fallback : garder la valeur actuelle
    if (!tld) {
      tld = currentValue;
      console.log(`⚠️ ${providerName} : aucun TLD trouvé, on garde "${currentValue}"`);
    }

    // Mettre à jour le fichier provider
    let newContent = content.replace(
      new RegExp(`((var|let|const)\\s+${varName}\\s*=\\s*['"])${currentValue}(['"])`, 'i'),
      `$1${tld}$3`
    );
    // Remplacer l'URL du repo externe
    newContent = newContent.replace(
      /https:\/\/raw\.githubusercontent\.com\/wooodyhood\/nuvio-repo\/main\/domains\.json/g,
      'https://raw.githubusercontent.com/Nissay8z/json/main/domains.json'
    );
    if (newContent !== content) {
      fs.writeFileSync(filePath, newContent, 'utf8');
      modifiedCount++;
      console.log(`✏️ ${file} : ${varName} mis à jour (${currentValue} → ${tld})`);
    }

    // Stocker pour domains.json (sans le suffixe _FALLBACK)
    const key = varName.replace('_FALLBACK', '').toLowerCase();
    domains[key] = tld;
  }

  // Écrire domains.json
  fs.writeFileSync('domains.json', JSON.stringify(domains, null, 2));
  console.log(`📄 domains.json généré : ${JSON.stringify(domains)}`);

  // Générer manifest.json
  const manifest = {
    name: "Catalogue Ultime Nissay",
    version: "1.0.0",
    scrapers: providerFiles.map(file => {
      const id = file.replace(/\.js$/, '');
      return {
        id: `${id}_nissay`,
        name: id.toUpperCase(),
        description: `Extension pour ${id}`,
        version: "1.0.0",
        author: "Nissay",
        supportedTypes: ["movie", "tv"],
        filename: `providers/${file}`,
        enabled: true
      };
    })
  };
  fs.writeFileSync('manifest.json', JSON.stringify(manifest, null, 2));
  console.log(`📄 manifest.json généré (${providerFiles.length} scrapers)`);
  console.log(`🚀 Terminé : ${modifiedCount} fichier(s) provider modifié(s).`);
}

main().catch(console.error);
