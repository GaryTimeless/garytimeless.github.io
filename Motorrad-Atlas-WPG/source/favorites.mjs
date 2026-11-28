// Favourite places "Zuhause" and "Arbeit". Stored only on this device.
const KEY = 'wpg-atlas-favorites';

export const FAVORITES = {
  home: {
    label: 'Zuhause', go: 'Nach Hause', words: ['zuhause', 'zu hause', 'daheim', 'heim', 'home', 'nach hause'],
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M4 11l8-7 8 7"/><path d="M6 9.5V20h12V9.5"/><path d="M10 20v-5h4v5"/></svg>',
  },
  work: {
    label: 'Arbeit', go: 'Zur Arbeit', words: ['arbeit', 'zur arbeit', 'büro', 'buero', 'firma', 'work'],
    icon: '<svg viewBox="0 0 24 24" aria-hidden="true"><rect x="3.5" y="7.5" width="17" height="12" rx="2"/><path d="M9 7.5V5h6v2.5M3.5 12.5h17"/></svg>',
  },
};

export function loadFavorites(storage = globalThis.localStorage) {
  try {
    const raw = JSON.parse(storage.getItem(KEY)) || {};
    const valid = place => place && Number.isFinite(place.lat) && Number.isFinite(place.lng) ? place : null;
    return { home: valid(raw.home), work: valid(raw.work) };
  } catch {
    return { home: null, work: null };
  }
}

export function saveFavorite(kind, place, storage = globalThis.localStorage) {
  const all = loadFavorites(storage);
  all[kind] = place ? { title: place.title, subtitle: place.subtitle || '', kind: place.kind || '', lat: place.lat, lng: place.lng } : null;
  try { storage.setItem(KEY, JSON.stringify(all)); } catch {}
  return all;
}

// Favourites whose name matches what the rider is typing ("zuh", "heim", "arb" …).
export function matchFavorites(query, favorites) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  return Object.entries(FAVORITES)
    .filter(([kind, meta]) => favorites[kind] && meta.words.some(word => word.startsWith(q) || (q.length >= 4 && q.startsWith(word))))
    .map(([kind]) => kind);
}
