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
    };
  }).filter(row => row.title);
}
