/**
 * driveApiService.ts
 * Servicio directo para la conexión e indexación de archivos de Google Drive
 * Búsqueda de carpeta /mimusica y listado de archivos de audio para Myradio Pro 2.0.
 */

export async function findOrCreateMusicFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent("(name = 'Mi música' or name = 'Mi musica' or name = 'mi música' or name = 'mi musica' or name = 'mimusica' or name = 'Música' or name = 'Musica' or name = 'Music' or name contains 'música' or name contains 'musica') and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=files(id,name)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`[DriveAPI] Error al consultar carpetas: HTTP ${res.status}`);
  }
  const data = await res.json();
  if (data.files && data.files.length > 0) {
    return data.files[0].id;
  }

  // Fallback: list all folders and normalize
  const allRes = await fetch(`https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent("mimeType = 'application/vnd.google-apps.folder' and trashed = false")}&fields=files(id,name)&pageSize=100`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (allRes.ok) {
    const allData = await allRes.json();
    const normalize = (s: string) => s.toLowerCase().replace(/[\s_.-]/g, '').normalize("NFD").replace(/[\u0300-\u036f]/g, "");
    const match = allData.files?.find((f: any) => normalize(f.name) === 'mimusica' || normalize(f.name).includes('mimusica') || normalize(f.name) === 'musica');
    if (match) return match.id;
    if (allData.files && allData.files.length > 0) {
      return allData.files[0].id;
    }
  }

  throw new Error("No se encontró la carpeta de música en tu Google Drive.");
}

export async function listAudioFiles(folderId: string, accessToken: string): Promise<any[]> {
  const query = encodeURIComponent(`'${folderId}' in parents and (mimeType contains 'audio/' or fileExtension = 'mp3') and trashed = false`);
  const res = await fetch(`https://www.googleapis.com/drive/v3/files?q=${query}&fields=nextPageToken,files(id,name,size,modifiedTime)`, {
    headers: { Authorization: `Bearer ${accessToken}` }
  });
  if (!res.ok) {
    throw new Error(`[DriveAPI] Error al listar archivos de audio: HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.files || [];
}
