const fs = require('fs');
const path = require('path');

const wikiMap = {
  purstream: 'https://purstream.wiki/',
  toflix: 'https://toflix.wiki/'
};

async function fetchTldFromWiki(providerName, wikiUrl) {
  try {
    const resp = await fetch(wikiUrl);
    const html = await resp.text();
    let match = html.match(/Domaine actuel # ([a-z0-9.-]+)/i);
    if (match) return match[1].split('.').slice(1).join('.');
    const regex = new RegExp(`${providerName}\\.[a-z]{2,}`, 'i');
    match = html.match(regex);
    if (match) return match[0].split('.').slice(1).join('.');
    return null;
  } catch(e) { return null; }
}

function getTldFromUrl(url) {
  try { return new URL(url).hostname.split('.').slice(1).join('.'); } catch(e) { return null; }
}

async function main() {
  const sources = JSON.parse(fs.readFileSync('sources.json', 'utf8'));
  const allItems = [...(sources.films_series || []), ...(sources.animes || []), ...(sources.direct_tv || [])];
  const providerFiles = fs.readdirSync('providers').filter(f => f.endsWith('.js'));
  
  let domains = {};
  let modifiedCount = 0;

  for (const file of providerFiles) {
    const filePath = path.join('providers', file);
    const providerName = file.replace(/\.js$/, '').toLowerCase();
    let content = fs.readFileSync(filePath, 'utf8');

    // 1. Détection robuste de la variable FALLBACK
    const fallbackMatch = content.match(/(var|let|const)\s+([A-Z_]+_FALLBACK)\s*=\s*['"]([^'"]*)['"]/i);
    
    if (fallbackMatch) {
      const varName = fallbackMatch[2];
      const currentValue = fallbackMatch[3];
      let tld = null;

      if (wikiMap[providerName]) tld = await fetchTldFromWiki(providerName, wikiMap[providerName]);
      if (!tld) {
        const matchItem = allItems.find(item => item.nom && item.nom.toLowerCase() === providerName);
        if (matchItem && matchItem.url) tld = getTldFromUrl(matchItem.url);
      }
      
      tld = tld || currentValue;

      // Mise à jour du contenu
      let newContent = content.replace(
        new RegExp(`((var|let|const)\\s+${varName}\\s*=\\s*['"])${currentValue}(['"])`, 'i'),
        `$1${tld}$3`
      );

      // Remplacer l'URL du repo
      newContent = newContent.replace(/https:\/\/raw\.githubusercontent\.com\/wooodyhood\/nuvio-repo\/main\/domains\.json/g, 'https://raw.githubusercontent.com/Nissay8z/json/main/domains.json');

      if (newContent !== content) {
        fs.writeFileSync(filePath, newContent, 'utf8');
        modifiedCount++;
      }
      domains[varName.replace('_FALLBACK', '').toLowerCase()] = tld;
    }
  }

  fs.writeFileSync('domains.json', JSON.stringify(domains, null, 2));
  
  // Génération du manifeste pour TOUS les fichiers trouvés
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
  console.log(`🚀 Mise à jour terminée : ${modifiedCount} fichiers mis à jour.`);
}

main();
