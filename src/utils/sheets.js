import { SHEET_ID } from '../config.js';

function parseCSVLine(line) {
  const result = [];
  let cell = '';
  let inQuotes = false;

  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && line[i + 1] === '"') { cell += '"'; i++; }
      else inQuotes = !inQuotes;
    } else if (ch === ',' && !inQuotes) {
      result.push(cell);
      cell = '';
    } else {
      cell += ch;
    }
  }
  result.push(cell);
  return result;
}

export async function fetchSheetData(sheetName) {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent(sheetName)}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h =>
    h.trim().replace(/^"|"$/g, '').toLowerCase()
  );

  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const raw = {};
    headers.forEach((h, i) => {
      raw[h] = (vals[i] || '').trim().replace(/^"|"$/g, '');
    });

    // Normalize to consistent field names regardless of sheet column naming
    return {
      title:          raw.title || raw.show || raw.name || '',
      year:           raw.year || '',
      genre:          raw.genre || '',
      status:         raw.status || raw.watched || '',
      subs:           raw.subs || '',
      rating:         raw.rating || raw.imdb || '',
      notes:          raw.notes || raw.comments || '',
      service:        raw.service || raw.platform || raw.streaming || '',
      overview:       raw.plot || raw.overview || raw.description || '',
      votes:          raw.votes || '',
      rottenTomatoes: raw['rotten tomatoes'] || raw.rt || '',
      posterUrl:      raw.poster || null,
      lastEpisode:    raw['last episode'] || raw.lastepisode || raw['last ep'] || '',
    };
  }).filter(row => row.title);
}

function looksLikeYear(value) {
  const cleaned = (value || '').replace(/,/g, '').trim();
  return /^\d{4}(\s*[–-]\s*\d{0,4})?$/.test(cleaned);
}

// The "Watched" sheet is shaped like the series ("List") sheet — it has a
// "Last episode" column that the movies sheet doesn't. Movie rows pasted in
// from the movies sheet therefore land one column short, shifting every
// field from "Subs" onward left by one. Detect that shift per-row (the
// "Year" column holds prose instead of a year, "Genre" holds a year instead
// of genre text) and remap. Rotten Tomatoes/runtime for shifted rows are left
// blank rather than guessed, since which trailing column holds which value
// isn't consistent — TMDB/OMDB enrichment fills those in afterward.
export async function fetchWatchedData() {
  const url = `https://docs.google.com/spreadsheets/d/${SHEET_ID}/gviz/tq?tqx=out:csv&sheet=${encodeURIComponent('Watched')}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Sheet fetch failed: ${res.status}`);

  const text = await res.text();
  const lines = text.split('\n').filter(l => l.trim());
  if (lines.length < 2) return [];

  const headers = parseCSVLine(lines[0]).map(h =>
    h.trim().replace(/^"|"$/g, '').toLowerCase()
  );

  return lines.slice(1).map(line => {
    const vals = parseCSVLine(line);
    const raw = {};
    headers.forEach((h, i) => {
      raw[h] = (vals[i] || '').trim().replace(/^"|"$/g, '');
    });

    const isExplicitMovie = raw.comments?.toLowerCase() === 'movie';
    const isShiftedMovie = !isExplicitMovie && looksLikeYear(raw.genre) && !looksLikeYear(raw.year);

    if (isShiftedMovie) {
      return {
        title:          raw.title || raw.show || raw.name || '',
        year:           raw.genre,
        genre:          '',
        status:         '',
        subs:           '',
        rating:         raw.subs,
        notes:          '',
        service:        raw.service || raw.platform || raw.streaming || '',
        overview:       raw.year,
        votes:          raw.rating,
        rottenTomatoes: '',
        posterUrl:      null,
        lastEpisode:    '',
        mediaType:      'movie',
      };
    }

    return {
      title:          raw.title || raw.show || raw.name || '',
      year:           raw.year || '',
      genre:          raw.genre || '',
      status:         '',
      subs:           raw.subs || '',
      rating:         raw.rating || raw.imdb || '',
      notes:          raw.notes || raw.comments || '',
      service:        raw.service || raw.platform || raw.streaming || '',
      overview:       raw.plot || raw.overview || raw.description || '',
      votes:          raw.votes || '',
      rottenTomatoes: raw['rotten tomatoes'] || raw.rt || '',
      posterUrl:      raw.poster || null,
      lastEpisode:    raw['last episode'] || raw.lastepisode || raw['last ep'] || '',
      mediaType:      isExplicitMovie ? 'movie' : 'tv',
    };
  }).filter(row => row.title);
}
