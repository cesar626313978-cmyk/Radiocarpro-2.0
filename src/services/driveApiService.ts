/**
 * driveApiService.ts
 * Servicio directo para la conexión e indexación de archivos de Google Drive
 * Búsqueda de carpeta /mimusica y listado de archivos de audio para Myradio Pro 2.0.
 */

export async function findOrCreateMusicFolder(accessToken: string): Promise<string> {
  const query = encodeURIComponent("name = 'mimusica' and mimeType = 'application/vnd.google-apps.folder' and trashed = false");
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
  throw new Error("No se encontró la carpeta /mimusica en tu Google Drive.");
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
