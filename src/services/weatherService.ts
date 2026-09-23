export interface HourlyForecast {
  time: string; // e.g. "14:00" or "+1h"
  temp: number;
  weatherCode: number;
  condition: string;
  icon: string;
}

export interface WeatherData {
  locality: string;
  country: string;
  temp: number;
  condition: string;
  icon: string;
  windSpeed: number;
  hourly: HourlyForecast[];
  lastUpdated: Date;
  latitude: number;
  longitude: number;
  distanceFromLastKm: number;
}

// Convert WMO weather code to readable string and icon
export function parseWmoCode(code: number): { condition: string; icon: string } {
  switch (code) {
    case 0:
      return { condition: 'Despejado', icon: 'wb_sunny' };
    case 1:
    case 2:
      return { condition: 'Parcialmente Nublado', icon: 'partly_cloudy_day' };
    case 3:
      return { condition: 'Nublado', icon: 'cloud' };
    case 45:
    case 48:
      return { condition: 'Niebla', icon: 'foggy' };
    case 51:
    case 53:
    case 55:
      return { condition: 'Llovizna', icon: 'grain' };
    case 61:
    case 63:
    case 65:
      return { condition: 'Lluvia', icon: 'rainy' };
    case 71:
    case 73:
    case 75:
      return { condition: 'Nieve', icon: 'ac_unit' };
    case 80:
    case 81:
    case 82:
      return { condition: 'Chubascos', icon: 'water_drop' };
    case 95:
    case 96:
    case 99:
      return { condition: 'Tormenta Eléctrica', icon: 'thunderstorm' };
    default:
      return { condition: 'Despejado', icon: 'wb_sunny' };
  }
}

// Calculate distance in meters between two coordinates using Haversine formula
export function getDistanceMeters(lat1: number, lon1: number, lat2: number, lon2: number): number {
  const R = 6371e3; // Earth radius in meters
  const φ1 = (lat1 * Math.PI) / 180;
  const φ2 = (lat2 * Math.PI) / 180;
  const Δφ = ((lat2 - lat1) * Math.PI) / 180;
  const Δλ = ((lon2 - lon1) * Math.PI) / 180;

  const a =
    Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
    Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c;
}

// Reverse geocode to get city / municipality / locality name
export async function getLocalityName(lat: number, lon: number): Promise<string> {
  try {
    const res = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${lat}&lon=${lon}&zoom=12&addressdetails=1`,
      { headers: { 'Accept-Language': 'es' } }
    );
    if (res.ok) {
      const data = await res.json();
      const addr = data.address || {};
      const locality =
        addr.city ||
        addr.town ||
        addr.village ||
        addr.municipality ||
        addr.county ||
        addr.state_district ||
        'Tu Ubicación';
      return locality;
    }
  } catch {
    // ignore
  }
  return 'Torrevieja';
}

// Fetch live weather + 6-hour forecast from Open-Meteo (Free, reliable, no key needed)
export async function fetchLiveWeather(lat: number, lon: number): Promise<WeatherData> {
  const locality = await getLocalityName(lat, lon);

  try {
    const url = `https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,weather_code,wind_speed_10m&hourly=temperature_2m,weather_code&forecast_hours=6&timezone=auto`;
    const res = await fetch(url);

    if (res.ok) {
      const data = await res.json();
      const currentTemp = Math.round(data.current?.temperature_2m ?? 30);
      const currentCode = data.current?.weather_code ?? 0;
      const currentParsed = parseWmoCode(currentCode);
      const wind = Math.round(data.current?.wind_speed_10m ?? 4);

      const hourlyList: HourlyForecast[] = [];
      if (data.hourly && Array.isArray(data.hourly.time)) {
        const times = data.hourly.time;
        const temps = data.hourly.temperature_2m;
        const codes = data.hourly.weather_code;

        for (let i = 1; i < Math.min(times.length, 5); i++) {
          const timeObj = new Date(times[i]);
          const hourFormatted = `${String(timeObj.getHours()).padStart(2, '0')}:00`;
          const p = parseWmoCode(codes[i] ?? 0);
          hourlyList.push({
            time: `+${i}h (${hourFormatted})`,
            temp: Math.round(temps[i]),
            weatherCode: codes[i],
            condition: p.condition,
            icon: p.icon,
          });
        }
      }

      return {
        locality,
        country: 'ES',
        temp: currentTemp,
        condition: currentParsed.condition,
        icon: currentParsed.icon,
        windSpeed: wind,
        hourly: hourlyList,
        lastUpdated: new Date(),
        latitude: lat,
        longitude: lon,
        distanceFromLastKm: 0,
      };
    }
  } catch (err) {
    console.warn('Open-Meteo weather fetch error:', err);
  }

  // Fallback default
  return {
    locality: locality || 'Torrevieja',
    country: 'ES',
    temp: 30,
    condition: 'Despejado',
    icon: 'wb_sunny',
    windSpeed: 5,
    hourly: [
      { time: '+1h', temp: 31, weatherCode: 0, condition: 'Despejado', icon: 'wb_sunny' },
      { time: '+2h', temp: 29, weatherCode: 1, condition: 'Parcialmente Nublado', icon: 'partly_cloudy_day' },
      { time: '+3h', temp: 28, weatherCode: 2, condition: 'Nuboso', icon: 'cloud' },
      { time: '+4h', temp: 27, weatherCode: 0, condition: 'Despejado', icon: 'wb_sunny' },
    ],
    lastUpdated: new Date(),
    latitude: lat,
    longitude: lon,
    distanceFromLastKm: 0,
  };
}
