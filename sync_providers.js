const fs = require('fs');
const url = require('url');

// 1. Charger les données du source.json
const sourcePath = './source.json';
const manifestPath = './manifest.json';
const sourceData = JSON.parse(fs.readFileSync(sourcePath, 'utf8'));

// 2. Extraire et aplatir tous les domaines depuis source.json
const currentDomains = {};
['films_series', 'animes', 'direct_tv'].forEach(category => {
    if (sourceData[category]) {
        sourceData[category].forEach(site => {
            try {
                // On extrait juste le domaine (ex: "streamflix.mom" depuis "https://streamflix.mom")
                const hostname = new URL(site.url).hostname;
                currentDomains[site.nom.toLowerCase()] = hostname;
            } catch (e) {
                console.error(`URL invalide pour ${site.nom}`);
            }
        });
    }
});

// 3. Configuration des fichiers à mettre à jour
// On fait correspondre le nom du source.json avec la variable dans le fichier JS
const providersConfig = [
    { 
        file: './providers/streamflix.js', 
        sourceName: 'streamflix', 
        regex: /(var STREAMFLIX_DOMAIN\s*=\s*)['"]([^'"]+)['"];/ 
    },
    { 
        file: './providers/toflix.js', 
        sourceName: 'toflix', 
        regex: /(var TOFLIX_DOMAIN\s*=\s*)['"]([^'"]+)['"];/ 
    },
    { 
        file: './providers/webflix.js', 
        sourceName: 'webflix', 
        regex: /(var WEBFLIX_DOMAIN\s*=\s*)['"]([^'"]+)['"];/ 
    },
    { 
        file: './providers/4afterdark.js', 
        sourceName: '4afterdark', 
        regex: /(var AFTERDARK_DOMAIN\s*=\s*)['"]([^'"]+)['"];/ 
    },
    { 
        file: './providers/fstream.js', 
        sourceName: 'french stream', 
        regex: /(var FSTREAM_DOMAIN\s*=\s*)['"]([^'"]+)['"];/ 
    }
];

let filesChanged = false;

// 4. Mettre à jour les providers si nécessaire
providersConfig.forEach(provider => {
    if (!fs.existsSync(provider.file)) {
        console.log(`Fichier introuvable: ${provider.file}`);
        return;
    }

    let content = fs.readFileSync(provider.file, 'utf8');
    const newDomain = currentDomains[provider.sourceName];

    if (newDomain) {
        const match = content.match(provider.regex);
        // Si la variable existe et que le domaine est différent
        if (match && match[2] !== newDomain) {
            content = content.replace(provider.regex, `$1'${newDomain}';`);
            fs.writeFileSync(provider.file, content, 'utf8');
            console.log(`✅ Mis à jour : ${provider.file} -> ${newDomain}`);
            filesChanged = true;
        } else {
            console.log(`🔄 Aucun changement requis pour ${provider.sourceName}`);
        }
    }
});

// 5. Optionnel : Mettre à jour la version du manifest.json s'il y a eu des modifications
if (filesChanged && fs.existsSync(manifestPath)) {
    let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    
    // Exemple : Incrémenter la version du manifest (1.0.0 -> 1.0.1)
    let versionParts = manifest.version.split('.');
    versionParts[2] = parseInt(versionParts[2]) + 1;
    manifest.version = versionParts.join('.');
    
    fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
    console.log(`📦 manifest.json mis à jour à la version ${manifest.version}`);
}
