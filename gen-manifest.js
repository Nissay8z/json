const fs = require('fs');
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
console.log(`✅ manifest.json généré (${files.length} scrapers)`);
