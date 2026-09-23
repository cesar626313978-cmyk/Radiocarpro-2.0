import { RadioStation } from '../types/radio';

// Radio Browser API server mirrors
const API_SERVERS = [
  'https://de1.api.radio-browser.info',
  'https://at1.api.radio-browser.info',
  'https://nl1.api.radio-browser.info',
];

let currentServerIndex = 0;

function getBaseUrl(): string {
  return API_SERVERS[currentServerIndex % API_SERVERS.length];
}

function rotateServer(): void {
  currentServerIndex = (currentServerIndex + 1) % API_SERVERS.length;
}

export interface ApiStationRaw {
  changeuuid: string;
  stationuuid: string;
  name: string;
  url: string;
  url_resolved: string;
  homepage: string;
  favicon: string;
  tags: string;
  country: string;
  countrycode: string;
  iso_3166_2: string;
  state: string;
  language: string;
  languagecodes: string;
  votes: number;
  lastchangetime: string;
  codec: string;
  bitrate: number;
  hls: number;
  lastcheckok: number;
  lastchecktime: string;
  clickcount: number;
  clicktrend: number;
  ssl_error: number;
}

// Convert Radio Browser raw object into our standardized RadioStation
export function mapApiStationToRadioStation(raw: ApiStationRaw): RadioStation {
  const cleanTags = raw.tags
    ? raw.tags
        .split(',')
        .map(t => t.trim().toLowerCase())
        .filter(Boolean)
        .slice(0, 4)
    : [];

  const mainGenre = cleanTags[0]
    ? cleanTags[0].charAt(0).toUpperCase() + cleanTags[0].slice(1)
    : raw.country || 'Global';

  // Palette generator based on station UUID
  const colorPalette = [
    '#8B5CF6',
    '#06B6D4',
    '#EF4444',
    '#F59E0B',
    '#10B981',
    '#F43F5E',
    '#3B82F6',
    '#84CC16',
    '#D97706',
    '#14B8A6',
  ];
  const charCodeSum = (raw.name || '')
    .split('')
    .reduce((acc, char) => acc + char.charCodeAt(0), 0);
  const pickedColor = colorPalette[charCodeSum % colorPalette.length];

  // Pick working URL
  const streamUrl = raw.url_resolved || raw.url;

  // Format Codec
  let format: 'MP3' | 'AAC' | 'OGG' | 'FLAC' = 'MP3';
  const codecUpper = (raw.codec || '').toUpperCase();
  if (codecUpper.includes('AAC')) format = 'AAC';
  else if (codecUpper.includes('OGG') || codecUpper.includes('OPUS')) format = 'OGG';
  else if (codecUpper.includes('FLAC')) format = 'FLAC';

  return {
    id: raw.stationuuid,
    name: (raw.name || 'Emisora Sin Nombre').trim(),
    country: raw.country || 'Internacional',
    countryCode: (raw.countrycode || 'UN').toUpperCase(),
    genre: mainGenre,
    tags: cleanTags.length > 0 ? cleanTags : ['radio', 'stream'],
    bitrate: raw.bitrate || 128,
    format,
    streamUrl,
    ip: `157.230.${(charCodeSum % 200) + 10}.${(charCodeSum % 250) + 1}`,
    logoUrl: raw.favicon && raw.favicon.startsWith('http') ? raw.favicon : undefined,
    color: pickedColor,
    accentColor: '#10B981',
    currentTrack: 'Emisión en directo 24/7',
    currentArtist: (raw.name || '').trim(),
    isLive: raw.lastcheckok === 1,
    frequency: raw.bitrate ? `${raw.bitrate} kbps ${format}` : 'Web Digital HD',
    description: raw.state
      ? `${raw.state}, ${raw.country}`
      : `${raw.country || 'Transmisión Online'} - ${cleanTags.join(', ')}`,
  };
}

/**
 * Fetch wrapper with timeout and fallback mirror rotation
 */
async function fetchWithFallback(endpoint: string, options: RequestInit = {}): Promise<any> {
  const maxRetries = API_SERVERS.length;
  let lastError: Error | null = null;

  for (let attempt = 0; attempt < maxRetries; attempt++) {
    const base = getBaseUrl();
    const url = `${base}${endpoint}`;

    try {
      const controller = new AbortController();
      const timeoutId = setTimeout(() => controller.abort(), 6500);

      const response = await fetch(url, {
        ...options,
        headers: {
          'User-Agent': 'RadioStreamApp/2.0 (GoogleAIStudio; WebClient)',
          Accept: 'application/json',
          ...(options.headers || {}),
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!response.ok) {
        throw new Error(`HTTP Error ${response.status} from ${base}`);
      }

      const data = await response.json();
      return data;
    } catch (err) {
      lastError = err as Error;
      rotateServer();
    }
  }

  throw lastError || new Error('All Radio Browser API mirrors failed.');
}

/**
 * Search stations by query, tag, country, etc.
 */
export async function searchRadioStations(params: {
  query?: string;
  tag?: string;
  country?: string;
  countrycode?: string;
  language?: string;
  limit?: number;
  order?: 'votes' | 'clickcount' | 'name' | 'bitrate';
  reverse?: boolean;
}): Promise<RadioStation[]> {
  const {
    query = '',
    tag = '',
    country = '',
    countrycode = '',
    limit = 40,
    order = 'votes',
    reverse = true,
  } = params;

  const queryParams = new URLSearchParams();
  if (query.trim()) {
    queryParams.append('name', query.trim());
  }
  if (tag.trim()) {
    queryParams.append('tag', tag.trim().toLowerCase());
  }
  if (country.trim()) {
    queryParams.append('country', country.trim());
  }
  if (countrycode.trim()) {
    queryParams.append('countrycode', countrycode.trim().toUpperCase());
  }

  queryParams.append('limit', String(limit));
  queryParams.append('order', order);
  queryParams.append('reverse', String(reverse));
  queryParams.append('hidebroken', 'true');

  try {
    const rawStations: ApiStationRaw[] = await fetchWithFallback(
      `/json/stations/search?${queryParams.toString()}`
    );

    if (!Array.isArray(rawStations)) return [];

    return rawStations
      .filter(s => s.url_resolved || s.url)
      .map(mapApiStationToRadioStation);
  } catch (error) {
    console.error('Failed to search Radio Browser stations:', error);
    return [];
  }
}

/**
 * Get Top Voted / Most Popular Stations
 */
export async function getTopVotedStations(limit = 40): Promise<RadioStation[]> {
  try {
    const rawStations: ApiStationRaw[] = await fetchWithFallback(
      `/json/stations/topvote/${limit}?hidebroken=true`
    );

    if (!Array.isArray(rawStations)) return [];

    return rawStations
      .filter(s => s.url_resolved || s.url)
      .map(mapApiStationToRadioStation);
  } catch (error) {
    console.error('Failed to fetch top voted stations:', error);
    return [];
  }
}

/**
 * Get Stations By Tag (e.g., '80s', 'jazz', 'news', 'electronic', 'rock', 'pop', 'techno')
 */
export async function getStationsByTag(tag: string, limit = 40): Promise<RadioStation[]> {
  try {
    const rawStations: ApiStationRaw[] = await fetchWithFallback(
      `/json/stations/bytag/${encodeURIComponent(tag.toLowerCase())}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
    );

    if (!Array.isArray(rawStations)) return [];

    return rawStations
      .filter(s => s.url_resolved || s.url)
      .map(mapApiStationToRadioStation);
  } catch (error) {
    console.error(`Failed to fetch stations for tag ${tag}:`, error);
    return [];
  }
}

/**
 * Get Stations By Country Code (e.g., 'ES', 'GB', 'US', 'FR', 'DE', 'JP', 'MX', 'IT')
 */
export async function getStationsByCountryCode(
  countryCode: string,
  limit = 40
): Promise<RadioStation[]> {
  try {
    const rawStations: ApiStationRaw[] = await fetchWithFallback(
      `/json/stations/bycountrycodeexact/${encodeURIComponent(countryCode.toLowerCase())}?limit=${limit}&order=votes&reverse=true&hidebroken=true`
    );

    if (!Array.isArray(rawStations)) return [];

    return rawStations
      .filter(s => s.url_resolved || s.url)
      .map(mapApiStationToRadioStation);
  } catch (error) {
    console.error(`Failed to fetch stations for country ${countryCode}:`, error);
    return [];
  }
}
