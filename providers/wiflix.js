// ============================================================
// Provider Nuvio : Wiflix (VF)
// Version : 1.0.0
// Basé sur le scraper Python de vStream
// ============================================================

// Domaine par défaut (sera écrasé par domains.json si présent)
let WIFLIX_BASE = 'https://wiflix.lol';  // À mettre à jour si besoin

// Récupération dynamique du domaine depuis domains.json
const DOMAINS_URL = 'https://raw.githubusercontent.com/Nissay8z/json/main/domains.json';
let _cachedDomain = null;
async function getWiflixDomain() {
  if (_cachedDomain) return _cachedDomain;
  try {
    const res = await fetch(DOMAINS_URL);
    const data = await res.json();
    if (data.wiflix) {
      // Si la valeur est un domaine complet ou un TLD
      if (data.wiflix.startsWith('http')) {
        WIFLIX_BASE = data.wiflix;
      } else {
        WIFLIX_BASE = `https://wiflix.${data.wiflix}`;
      }
    }
  } catch(e) { /* garde la valeur par défaut */ }
  _cachedDomain = WIFLIX_BASE;
  return _cachedDomain;
}

const UA = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

// Helper pour extraire une URL vidéo depuis une page (pattern loadVideo)
async function extractVideoUrl(pageUrl) {
  const html = await fetch(pageUrl, { headers: { 'User-Agent': UA } }).then(r => r.text());
  const match = html.match(/loadVideo\('([^']+)'\)/);
  if (match) return match[1];
  // Fallback : chercher un .m3u8 dans la page
  const m3u8Match = html.match(/(https?:\/\/[^"'\s]+\.m3u8[^"'\s]*)/i);
  return m3u8Match ? m3u8Match[1] : null;
}

// Recherche d'un film ou d'une série par titre
async function searchWiflix(title, type) {
  const base = await getWiflixDomain();
  const searchUrl = `${base}/index.php?do=search`;
  const searchText = title.replace(/ /g, '+');
  // Requête POST comme dans le Python
  const body = `do=search&subaction=search&story=${searchText}&titleonly=3`;
  // Pour les films, catlist[]=1&catlist[]=37 ; pour les séries, catlist[]=31&catlist[]=35
  const finalBody = type === 'movie'
    ? body + '&catlist[]=1&catlist[]=37'
    : body + '&catlist[]=31&catlist[]=35';

  const resp = await fetch(searchUrl, {
    method: 'POST',
    headers: {
      'User-Agent': UA,
      'Content-Type': 'application/x-www-form-urlencoded',
      'Referer': base
    },
    body: finalBody
  });
  const html = await resp.text();

  // Pattern pour les films (similaire au Python)
  let pattern = /mov clearfix.+?src="([^"]*)" *alt="([^"]*).+?link="([^"]+)/gi;
  let match;
  while ((match = pattern.exec(html)) !== null) {
    const thumb = match[1].startsWith('/') ? base + match[1] : match[1];
    const itemTitle = match[2].replace(/ wiflix| flemmix/gi, '').trim();
    const url = match[3];
    if (itemTitle.toLowerCase() === title.toLowerCase()) {
      return { url, thumb, title: itemTitle };
    }
  }

  // Pattern pour les séries (un peu différent)
  pattern = /mov clearfix.+?src="([^"]+)" *alt="([^"]+).+?data-link="([^"]+)"/gi;
  while ((match = pattern.exec(html)) !== null) {
    const thumb = match[1].startsWith('/') ? base + match[1] : match[1];
    const itemTitle = match[2].replace(/ wiflix| flemmix/gi, '').trim();
    const url = match[3];
    if (itemTitle.toLowerCase() === title.toLowerCase()) {
      return { url, thumb, title: itemTitle };
    }
  }
  return null;
}

// Récupère la liste des épisodes d'une série
async function getEpisodes(seriesUrl) {
  const html = await fetch(seriesUrl, { headers: { 'User-Agent': UA } }).then(r => r.text());
  // Pattern pour les épisodes : <div class="clicbtn" rel="ep123vf">Episode 1</div>
  const pattern = /"clicbtn"\s+rel="([^"]+)"[^>]*>Episode\s+(\d+)</gi;
  const episodes = [];
  let match;
  while ((match = pattern.exec(html)) !== null) {
    episodes.push({ id: match[1], number: parseInt(match[2], 10) });
  }
  return episodes;
}

// Fonction principale pour obtenir les flux
async function getStreams(tmdbId, mediaType, season, episode) {
  // 1. Récupérer le titre via TMDB
  const tmdbUrl = `https://api.themoviedb.org/3/${mediaType === 'tv' ? 'tv' : 'movie'}/${tmdbId}?api_key=f3d757824f08ea2cff45eb8f47ca3a1e&language=fr-FR`;
  const tmdbRes = await fetch(tmdbUrl);
  const tmdb = await tmdbRes.json();
  const title = tmdb.title || tmdb.name;
  if (!title) return [];

  // 2. Rechercher sur Wiflix
  const searchResult = await searchWiflix(title, mediaType);
  if (!searchResult) return [];

  // 3. Si c'est un film, extraire directement l'URL vidéo
  if (mediaType === 'movie') {
    const videoUrl = await extractVideoUrl(searchResult.url);
    if (!videoUrl) return [];
    return [{
      name: 'Wiflix',
      title: title,
      url: videoUrl,
      quality: 'HD',
      format: videoUrl.includes('.m3u8') ? 'm3u8' : 'mp4'
    }];
  }

  // 4. Si c'est une série, récupérer tous les épisodes et trouver celui demandé
  const episodes = await getEpisodes(searchResult.url);
  const targetEp = episodes.find(ep => ep.number === episode);
  if (!targetEp) return [];

  // Construire l'URL de l'épisode (avec le rel)
  const episodeUrl = searchResult.url + (searchResult.url.includes('?') ? '&' : '?') + `ep=${targetEp.id}`;
  const videoUrl = await extractVideoUrl(episodeUrl);
  if (!videoUrl) return [];

  return [{
    name: 'Wiflix',
    title: `${title} S${season}E${episode}`,
    url: videoUrl,
    quality: 'HD',
    format: videoUrl.includes('.m3u8') ? 'm3u8' : 'mp4'
  }];
}

// Export pour Nuvio
if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams };
} else {
  global.getStreams = getStreams;
}