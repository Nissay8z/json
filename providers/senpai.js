// ============================================================
// Provider Nuvio : Senpai-Stream (VF/VOSTFR)
// Version : 1.0.0
// - Récupération dynamique du domaine via redirection wiki
// - Extraction du flux m3u8/mp4 depuis la page embed
// ============================================================

var DOMAINS_URL   = 'https://raw.githubusercontent.com/Nissay8z/json/main/domains.json';
var SENPAI_WIKI   = 'https://senpai-stream.wiki/';
var SENPAI_FALLBACK = 'design'; // si la redirection échoue
var TMDB_KEY      = 'f3d757824f08ea2cff45eb8f47ca3a1e';
var UA            = 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36';

var _cachedBase = null;

// ─── Détection du domaine actuel (suivi redirection) ────────
function detectSenpaiDomain() {
  if (_cachedBase) return Promise.resolve(_cachedBase);
  return fetch(SENPAI_WIKI, {
    method: 'GET',
    redirect: 'follow',
    headers: { 'User-Agent': UA }
  })
    .then(function(res) {
      var finalUrl = res.url;
      var origin = new URL(finalUrl).origin;
      _cachedBase = origin;
      return origin;
    })
    .catch(function() {
      return 'https://senpai-stream.' + SENPAI_FALLBACK;
    });
}

// ─── Extraction de l'URL vidéo depuis la page embed ─────────
function extractVideoUrl(html) {
  // Cherche une iframe pointant vers un .m3u8 ou .mp4
  var match = html.match(/<iframe[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
  if (match) return match[1];
  // Cherche une balise video
  match = html.match(/<video[^>]+src=["']([^"']+\.(?:m3u8|mp4)[^"']*)["']/i);
  if (match) return match[1];
  // Cherche dans un script JS (file: ...)
  match = html.match(/file\s*:\s*["']([^"']+\.m3u8[^"']*)["']/i);
  if (match) return match[1];
  return null;
}

// ─── Récupération du flux depuis Senpai-Stream ──────────────
function getSenpaiStreams(tmdbId, mediaType, season, episode) {
  return detectSenpaiDomain()
    .then(function(baseUrl) {
      var embedUrl;
      if (mediaType === 'movie') {
        embedUrl = baseUrl + '/embed/movie/' + tmdbId;
      } else {
        // Pour les séries : format à vérifier sur le site réel
        embedUrl = baseUrl + '/embed/tv/' + tmdbId + '/' + (season || 1) + '/' + (episode || 1);
      }
      return fetch(embedUrl, {
        headers: { 'User-Agent': UA, 'Referer': baseUrl }
      }).then(function(res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.text();
      }).then(function(html) {
        var videoUrl = extractVideoUrl(html);
        if (!videoUrl) return [];
        // Titre informatif (sans appel TMDB pour rester simple)
        var title = mediaType === 'movie' ? 'Film' : 'Saison ' + (season||1) + ' Épisode ' + (episode||1);
        return [{
          name: 'Senpai-Stream',
          title: title,
          url: videoUrl,
          quality: 'HD',
          format: videoUrl.includes('.m3u8') ? 'm3u8' : 'mp4',
          headers: { 'User-Agent': UA, 'Referer': baseUrl }
        }];
      });
    })
    .catch(function() { return []; });
}

// ─── Interface publique Nuvio ───────────────────────────────
function getStreams(tmdbId, mediaType, season, episode) {
  return getSenpaiStreams(tmdbId, mediaType, season, episode);
}

if (typeof module !== 'undefined' && module.exports) {
  module.exports = { getStreams: getStreams };
} else {
  global.getStreams = getStreams;
}
