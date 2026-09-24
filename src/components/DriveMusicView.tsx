import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { googleDriveService } from '../services/googleDriveService';
import { driveAudioEngine } from '../services/driveAudioEngine';
import { driveCacheService } from '../services/driveCacheService';
import { User, isTeslaBrowser } from '../services/firebase';

interface DriveMusicViewProps {
  onSwitchToRadio: () => void;
  activeSource: 'radio' | 'drive';
  onActivateDriveSource: () => void;
  user?: User | any | null;
  onOpenCarPairing?: () => void;
  onOpenTeslaPairing?: () => void; // compatibilidad
  onDisconnect?: () => void;
}

export const DriveMusicView: React.FC<DriveMusicViewProps> = ({
  onSwitchToRadio,
  activeSource,
  onActivateDriveSource,
  user,
  onOpenCarPairing,
  onOpenTeslaPairing,
  onDisconnect,
}) => {
  const triggerCarPairing = onOpenCarPairing || onOpenTeslaPairing;
  // Synchronous cache retrieval for instant 0ms rendering
  const cachedInitial = driveCacheService.getCachedLibrarySync();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => googleDriveService.hasToken());
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [folderStatus, setFolderStatus] = useState<string>(
    () => cachedInitial?.folderStatus || (googleDriveService.hasToken() ? 'Listo en memoria' : 'Desconectado')
  );
  const [files, setFiles] = useState<DriveAudioFile[]>(() => cachedInitial?.files || []);
  const [currentTrack, setCurrentTrack] = useState<DriveAudioFile | null>(null);
  const [playbackStatus, setPlaybackStatus] = useState<DrivePlaybackStatus>('idle');
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);

  // Equalizer & Guide state
  const [eqLow, setEqLow] = useState<number>(0);
  const [eqMid, setEqMid] = useState<number>(0);
  const [eqHigh, setEqHigh] = useState<number>(0);
  const [showEq, setShowEq] = useState<boolean>(false);
  const [showDriveGuide, setShowDriveGuide] = useState<boolean>(false);

  const [folderInput, setFolderInput] = useState<string>(() => {
    try {
      return localStorage.getItem('radiostream_drive_folder_id') || 'https://drive.google.com/drive/folders/1mUgFaomlz2DDuXNw_1T5fQ64bGympC8E';
    } catch {
      return 'https://drive.google.com/drive/folders/1mUgFaomlz2DDuXNw_1T5fQ64bGympC8E';
    }
  });

  const [subfolders, setSubfolders] = useState<{ id: string; name: string }[]>(() => cachedInitial?.subfolders || []);
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => cachedInitial?.folderId || null);
  const [folderStack, setFolderStack] = useState<{ id: string; name: string }[]>(() => cachedInitial?.folderStack || []);
  const [totalRecursiveFiles, setTotalRecursiveFiles] = useState<number>(() => cachedInitial?.totalRecursiveFiles || 0);
  const [allRecursiveFiles, setAllRecursiveFiles] = useState<DriveAudioFile[]>(() => cachedInitial?.allRecursiveFiles || []);
  const [loadProgress, setLoadProgress] = useState<number>(() => (cachedInitial ? 100 : 0));
  const [loadingSubfolderId, setLoadingSubfolderId] = useState<string | null>(null);
  const [playingSubfolderId, setPlayingSubfolderId] = useState<string | null>(null);
  const [activePlaylist, setActivePlaylist] = useState<DriveAudioFile[]>(() => driveAudioEngine.getPlaylist());
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);
  const activeTrackRef = useRef<HTMLDivElement | null>(null);

  // Auto-scroll the active track inside the scrollable playlist window
  useEffect(() => {
    if (activeTrackRef.current) {
      activeTrackRef.current.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    }
  }, [currentTrack?.id]);

  // Dynamic token subscription: auto-detect when Drive connects or disconnects
  useEffect(() => {
    const unsub = googleDriveService.onTokenChange(hasTok => {
      setIsAuthenticated(hasTok);
      if (hasTok) {
        const cached = driveCacheService.getCachedLibrarySync();
        if (!cached || !cached.files || cached.files.length === 0) {
          loadMusicFolder(undefined, false);
        }
      }
    });
    return unsub;
  }, []);

  // Check auth state on mount & use instant cache without blocking network rescan
  useEffect(() => {
    if (googleDriveService.hasToken()) {
      setIsAuthenticated(true);
      const cached = driveCacheService.getCachedLibrarySync();
      if (cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0) {
        // Instant restore from cache - 0 wait time!
        const playlistToSet = cached.files.length > 0 ? cached.files : cached.allRecursiveFiles;
        driveAudioEngine.setPlaylist(playlistToSet);
        setFiles(cached.files);
        setSubfolders(cached.subfolders);
        setAllRecursiveFiles(cached.allRecursiveFiles);
        setTotalRecursiveFiles(cached.totalRecursiveFiles);
        setFolderStack(cached.folderStack);
        setCurrentFolderId(cached.folderId);
        setFolderStatus(cached.folderStatus);
        setLoadProgress(100);
      } else {
        // Only load over network on first-time setup or if cache is empty
        loadMusicFolder();
      }
    }
  }, []);

  // Subscribe to drive audio engine events
  useEffect(() => {
    const unsubStatus = driveAudioEngine.onStatusChange(status => setPlaybackStatus(status));
    const unsubTime = driveAudioEngine.onTimeUpdate((time, dur) => {
      setCurrentTime(time);
      setDuration(dur);
    });
    const unsubTrack = driveAudioEngine.onTrackChange(track => setCurrentTrack(track));
    const unsubPlaylist = driveAudioEngine.onPlaylistChange(list => setActivePlaylist(list));

    return () => {
      unsubStatus();
      unsubTime();
      unsubTrack();
      unsubPlaylist();
    };
  }, []);

  const handlePlayAllSequentially = async () => {
    const listToPlay = allRecursiveFiles.length > 0 ? allRecursiveFiles : files;
    if (listToPlay.length === 0) return;
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;
    driveAudioEngine.setPlaylist(listToPlay, 0);
    await driveAudioEngine.playTrack(listToPlay[0], token);
    setFolderStatus(`Reproduciendo todo seguido (${listToPlay.length} pistas)`);
  };

  const handlePlayCurrentFolderSequential = async () => {
    const listToPlay = files.length > 0 ? files : allRecursiveFiles;
    if (listToPlay.length === 0) return;
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;
    driveAudioEngine.setPlaylist(listToPlay, 0);
    await driveAudioEngine.playTrack(listToPlay[0], token);
    setFolderStatus(`Reproduciendo en orden (${listToPlay.length} pistas)`);
  };

  const handlePlayCurrentFolderShuffle = async () => {
    const sourceList = files.length > 0 ? files : allRecursiveFiles;
    if (sourceList.length === 0) return;
    const listToPlay = [...sourceList];
    for (let i = listToPlay.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [listToPlay[i], listToPlay[j]] = [listToPlay[j], listToPlay[i]];
    }
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;
    driveAudioEngine.setPlaylist(listToPlay, 0);
    await driveAudioEngine.playTrack(listToPlay[0], token);
    setFolderStatus(`Reproduciendo en aleatorio (${listToPlay.length} pistas)`);
  };

  const handlePlayShuffle = async () => {
    const listToPlay = [...(allRecursiveFiles.length > 0 ? allRecursiveFiles : files)];
    if (listToPlay.length === 0) return;
    for (let i = listToPlay.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [listToPlay[i], listToPlay[j]] = [listToPlay[j], listToPlay[i]];
    }
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;
    driveAudioEngine.setPlaylist(listToPlay, 0);
    await driveAudioEngine.playTrack(listToPlay[0], token);
    setFolderStatus(`Reproduciendo en aleatorio (${listToPlay.length} pistas)`);
  };

  const loadMusicFolder = async (targetFolderId?: string, forceRefresh = false) => {
    // 1. If not a forced refresh, check cache first to avoid waiting
    if (!forceRefresh) {
      const cached = await driveCacheService.getCachedLibrary();
      if (cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0) {
        setCurrentFolderId(cached.folderId);
        setFiles(cached.files);
        setSubfolders(cached.subfolders);
        setAllRecursiveFiles(cached.allRecursiveFiles);
        setTotalRecursiveFiles(cached.totalRecursiveFiles);
        setFolderStack(cached.folderStack);
        setFolderStatus(cached.folderStatus);
        setLoadProgress(100);
        driveAudioEngine.setPlaylist(cached.files.length > 0 ? cached.files : cached.allRecursiveFiles);
        setIsLoading(false);
        return;
      }
    }

    setIsLoading(true);
    setLoadProgress(15);
    setErrorMessage(null);
    setFolderStatus('Buscando carpeta /mimusica en Google Drive...');

    try {
      const token = googleDriveService.getToken();
      if (!token) {
        setIsAuthenticated(false);
        setIsLoading(false);
        return;
      }

      setLoadProgress(35);
      let folderId = targetFolderId;
      if (!folderId) {
        folderId = await googleDriveService.findMusicFolderId(token, folderInput);
      }

      if (!folderId) {
        setErrorMessage('No se encontró la carpeta de Google Drive especificada. Por favor, comprueba el enlace.');
        setFolderStatus('Carpeta no encontrada');
        setIsLoading(false);
        return;
      }

      setCurrentFolderId(folderId);
      setLoadProgress(60);
      setFolderStatus('Escaneando archivos de audio y subcarpetas...');

      const [contents, allRecursive] = await Promise.all([
        googleDriveService.getFolderContents(token, folderId),
        googleDriveService.listAudioFilesInFolder(token, folderId)
      ]);

      setLoadProgress(85);
      const initialStack = [{ id: contents.folderId, name: contents.folderName }];
      setFolderStack(initialStack);

      // Check cached status for each file
      const cachedIds = await driveCacheService.getCachedFileIds();
      const enrichedFiles = contents.files.map(file => ({
        ...file,
        isCached: cachedIds.includes(file.id),
      }));

      const enrichedAll = allRecursive.map(file => ({
        ...file,
        isCached: cachedIds.includes(file.id),
      }));

      setFiles(enrichedFiles);
      setSubfolders(contents.subfolders);
      setAllRecursiveFiles(enrichedAll);
      setTotalRecursiveFiles(enrichedAll.length);
      driveAudioEngine.setPlaylist(enrichedFiles.length > 0 ? enrichedFiles : enrichedAll);
      setLoadProgress(100);
      const finalStatus = `${contents.subfolders.length} carpetas, ${enrichedAll.length} canciones en total en /mimusica`;
      setFolderStatus(finalStatus);

      // Save library to cache so future visits are 100% instant
      await driveCacheService.saveCachedLibrary({
        folderId,
        folderName: contents.folderName,
        files: enrichedFiles,
        subfolders: contents.subfolders,
        allRecursiveFiles: enrichedAll,
        folderStack: initialStack,
        totalRecursiveFiles: enrichedAll.length,
        folderStatus: finalStatus,
      });
    } catch (err: any) {
      console.error('Error loading music folder:', err);
      setErrorMessage(err.message || 'Error al conectar con la API de Google Drive');
      setFolderStatus('Error de sincronización');
    } finally {
      setIsLoading(false);
    }
  };

  const handleConnectDrive = async () => {
    setIsConnectingDrive(true);
    setErrorMessage(null);
    setRefreshSuccessMessage(null);
    try {
      const isCar = isTeslaBrowser();
      if (isCar) {
        googleDriveService.redirectToOAuth(user?.email);
        return;
      }
      await googleDriveService.authenticate(user?.email);
      setIsAuthenticated(true);
      await loadMusicFolder(undefined, true);
    } catch (err: any) {
      console.warn('Drive popup auth failed, attempting redirect:', err);
      try {
        googleDriveService.redirectToOAuth(user?.email);
      } catch (redirErr: any) {
        setErrorMessage(err.message || 'Error al conectar con Google Drive');
      }
    } finally {
      setIsConnectingDrive(false);
    }
  };

  const handleRefreshFolders = async () => {
    setIsLoading(true);
    setErrorMessage(null);
    setRefreshSuccessMessage(null);
    try {
      await loadMusicFolder(currentFolderId || undefined, true);
      setRefreshSuccessMessage('¡Carpetas y archivos de /mimusica actualizados!');
      setTimeout(() => {
        setRefreshSuccessMessage(null);
      }, 4000);
    } catch (err: any) {
      console.error('Error refreshing folders:', err);
      setErrorMessage(err.message || 'Error al actualizar carpetas de Google Drive');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDisconnectDrive = async () => {
    googleDriveService.clearAccessToken();
    await driveCacheService.clearCachedLibrary();
    setIsAuthenticated(false);
    setFiles([]);
    setSubfolders([]);
    setAllRecursiveFiles([]);
    setTotalRecursiveFiles(0);
    setFolderStack([]);
    setCurrentTrack(null);
    setFolderStatus('Desconectado de Google Drive');
    if (activeSource === 'drive') {
      onSwitchToRadio();
    }
    if (onDisconnect) {
      onDisconnect();
    }
  };

  const navigateToSubfolder = async (sub: { id: string; name: string }) => {
    const token = googleDriveService.getToken();
    if (!token) return;
    setIsLoading(true);
    try {
      setCurrentFolderId(sub.id);
      setFolderStack(prev => [...prev, sub]);
      const contents = await googleDriveService.getFolderContents(token, sub.id);
      const cachedIds = await driveCacheService.getCachedFileIds();
      const enrichedFiles = contents.files.map(file => ({
        ...file,
        isCached: cachedIds.includes(file.id),
      }));
      setFiles(enrichedFiles);
      setSubfolders(contents.subfolders);
      driveAudioEngine.setPlaylist(enrichedFiles);
      setFolderStatus(`${contents.subfolders.length} carpetas, ${enrichedFiles.length} canciones`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al abrir carpeta');
    } finally {
      setIsLoading(false);
    }
  };

  const jumpToBreadcrumb = async (index: number) => {
    const target = folderStack[index];
    if (!target) return;
    const token = googleDriveService.getToken();
    if (!token) return;

    // Fast path: if navigating back to root folder (index 0) and we have cache
    if (index === 0) {
      const cached = driveCacheService.getCachedLibrarySync();
      if (cached && cached.folderId === target.id) {
        setCurrentFolderId(target.id);
        setFolderStack([{ id: cached.folderId, name: cached.folderName }]);
        setFiles(cached.files);
        setSubfolders(cached.subfolders);
        driveAudioEngine.setPlaylist(cached.files);
        setFolderStatus(`${cached.subfolders.length} carpetas, ${cached.allRecursiveFiles.length} canciones en total en /mimusica`);
        return;
      }
    }

    setIsLoading(true);
    try {
      setCurrentFolderId(target.id);
      setFolderStack(prev => prev.slice(0, index + 1));
      const contents = await googleDriveService.getFolderContents(token, target.id);
      const cachedIds = await driveCacheService.getCachedFileIds();
      const enrichedFiles = contents.files.map(file => ({
        ...file,
        isCached: cachedIds.includes(file.id),
      }));
      setFiles(enrichedFiles);
      setSubfolders(contents.subfolders);
      driveAudioEngine.setPlaylist(enrichedFiles);
      setFolderStatus(`${contents.subfolders.length} carpetas, ${enrichedFiles.length} canciones`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al navegar');
    } finally {
      setIsLoading(false);
    }
  };

  const handlePlaySubfolder = async (sub: { id: string; name: string }) => {
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;
    setLoadingSubfolderId(sub.id);
    setIsLoading(true);
    try {
      setFolderStatus(`Cargando carpeta "${sub.name}"...`);
      const subFiles = await googleDriveService.listAudioFilesInFolder(token, sub.id);
      if (subFiles.length === 0) {
        setFolderStatus(`La carpeta "${sub.name}" no contiene archivos de audio.`);
        setIsLoading(false);
        setLoadingSubfolderId(null);
        return;
      }
      const cachedIds = await driveCacheService.getCachedFileIds();
      const enriched = subFiles.map(f => ({ ...f, isCached: cachedIds.includes(f.id) }));
      driveAudioEngine.setPlaylist(enriched, 0);
      setPlayingSubfolderId(sub.id);
      await driveAudioEngine.playTrack(enriched[0], token);
      setFolderStatus(`Reproduciendo carpeta "${sub.name}" (${enriched.length} pistas)`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al reproducir carpeta');
    } finally {
      setIsLoading(false);
      setLoadingSubfolderId(null);
    }
  };

  const displayFiles = files.length > 0 ? files : (folderStack.length <= 1 ? allRecursiveFiles : []);

  const queueList = useMemo(() => {
    if (activePlaylist && activePlaylist.length > 0) {
      return activePlaylist;
    }
    if (files.length > 0) {
      return files;
    }
    return allRecursiveFiles;
  }, [activePlaylist, files, allRecursiveFiles]);

  const handleSelectTrack = async (file: DriveAudioFile, index: number, customList?: DriveAudioFile[]) => {
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) {
      setErrorMessage('Sesión de Drive expirada. Vuelve a conectar.');
      setIsAuthenticated(false);
      return;
    }
    const currentList = customList || (displayFiles.length > 0 ? displayFiles : (allRecursiveFiles.length > 0 ? allRecursiveFiles : files));
    driveAudioEngine.setPlaylist(currentList, index);
    await driveAudioEngine.playTrack(file, token);
  };

  const handleTogglePlay = () => {
    if (playbackStatus === 'playing') {
      driveAudioEngine.pause();
    } else if (playbackStatus === 'paused') {
      driveAudioEngine.resume();
    } else if (displayFiles.length > 0) {
      handleSelectTrack(displayFiles[0], 0);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    driveAudioEngine.seek(val);
  };

  const handleEqChange = (type: 'low' | 'mid' | 'high', val: number) => {
    if (type === 'low') {
      setEqLow(val);
      driveAudioEngine.setEqualizer(val, eqMid, eqHigh);
    } else if (type === 'mid') {
      setEqMid(val);
      driveAudioEngine.setEqualizer(eqLow, val, eqHigh);
    } else {
      setEqHigh(val);
      driveAudioEngine.setEqualizer(eqLow, eqMid, val);
    }
  };

  const formatTime = (seconds: number) => {
    if (isNaN(seconds)) return '0:00';
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  return (
    <div className="flex flex-col gap-6 w-full pb-32">
      {/* Top Drive Connection Status & Folder Management Bar */}
      <div className="flex flex-col xl:flex-row items-start xl:items-center justify-between gap-4 bg-[#1A1A1A] border-3 border-black p-4 neo-shadow">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-10 h-10 bg-[#201f1f] border-2 border-black flex items-center justify-center shrink-0">
            <span className={`material-symbols-outlined text-2xl ${isAuthenticated ? 'text-[#4edea3]' : 'text-[#f59e0b]'}`}>
              {isAuthenticated ? 'cloud_done' : 'cloud_off'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-black text-sm sm:text-base md:text-lg text-white tracking-tight uppercase truncate">
                Música en Google Drive (/mimusica)
              </h1>
              {isAuthenticated ? (
                <span className="bg-[#10B981] text-black text-[10px] font-mono-tech font-bold px-2 py-0.5 border border-black uppercase shrink-0 flex items-center gap-1.5">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                  CONECTADO A DRIVE
                </span>
              ) : (
                <span className="bg-[#f59e0b] text-black text-[10px] font-mono-tech font-bold px-2 py-0.5 border border-black uppercase shrink-0">
                  DESCONECTADO DE DRIVE
                </span>
              )}
            </div>
            <p className="font-mono-tech text-xs text-[#bbcabf] truncate mt-0.5">
              {isAuthenticated
                ? `${folderStatus}${user?.email ? ` • ${user.email}` : ''}`
                : 'Conexión independiente de Gmail. Pulsa Conectar Google Drive para cargar tu colección.'}
            </p>
          </div>
        </div>

        {/* Action controls */}
        <div className="flex items-center gap-2 flex-wrap shrink-0 w-full xl:w-auto justify-start xl:justify-end">
          {isAuthenticated ? (
            <>
              <button
                onClick={handleRefreshFolders}
                disabled={isLoading}
                className="neo-button bg-[#10B981] text-black px-3.5 py-2 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 hover:bg-[#059669] cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
                title="Volver a escanear Google Drive para sincronizar carpetas y canciones nuevas"
              >
                <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>sync</span>
                <span>{isLoading ? 'Actualizando...' : 'Actualizar Carpetas'}</span>
              </button>

              <button
                onClick={() => setShowDriveGuide(!showDriveGuide)}
                className={`neo-button px-3 py-2 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 cursor-pointer border-2 border-black ${
                  showDriveGuide ? 'bg-[#4edea3] text-black' : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
                title="Ver guía de organización de carpetas /mimusica"
              >
                <span className="material-symbols-outlined text-sm">folder_special</span>
                <span className="hidden sm:inline">Guía Drive</span>
              </button>

              <button
                onClick={() => setShowEq(!showEq)}
                className={`neo-button px-3 py-2 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 cursor-pointer border-2 border-black ${
                  showEq ? 'bg-[#F59E0B] text-black' : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
                title="Ecualizador de audio"
              >
                <span className="material-symbols-outlined text-sm">equalizer</span>
                <span>EQ</span>
              </button>

              <button
                onClick={handleDisconnectDrive}
                className="neo-button bg-[#262626] border-2 border-black hover:bg-[#dc2626] text-[#bbb] hover:text-white px-2.5 py-2 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1 font-mono-tech text-xs font-bold"
                title="Desconectar acceso a Google Drive (tu cuenta de Gmail y favoritos de radio se mantienen)"
              >
                <span className="material-symbols-outlined text-sm">logout</span>
                <span className="hidden sm:inline">Desconectar Drive</span>
              </button>
            </>
          ) : (
            <>
              <button
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
                className="neo-button bg-[#4edea3] text-[#003824] px-4 py-2 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 hover:bg-[#38c98e] cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
                title="Iniciar sesión en Google Drive para reproducir archivos"
              >
                <span className={`material-symbols-outlined text-base ${isConnectingDrive ? 'animate-spin' : ''}`}>
                  {isConnectingDrive ? 'sync' : 'key'}
                </span>
                <span>{isConnectingDrive ? 'Conectando...' : 'Conectar Google Drive'}</span>
              </button>

              {triggerCarPairing && (
                <button
                  type="button"
                  onClick={triggerCarPairing}
                  className="neo-button bg-[#8B5CF6] text-white px-3 py-2 font-mono-tech text-xs font-bold uppercase flex items-center gap-1.5 hover:bg-[#7c3aed] cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]"
                  title="Vincular desde el móvil escaneando código QR"
                >
                  <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
                  <span className="hidden sm:inline">Vincular Coche (QR)</span>
                </button>
              )}

              <button
                onClick={() => setShowDriveGuide(!showDriveGuide)}
                className={`neo-button px-3 py-2 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 cursor-pointer border-2 border-black ${
                  showDriveGuide ? 'bg-[#4edea3] text-black' : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
                title="Ver guía de carpetas /mimusica"
              >
                <span className="material-symbols-outlined text-sm">folder_special</span>
                <span>Guía Drive</span>
              </button>
            </>
          )}
        </div>
      </div>

      {/* Success notification banner */}
      {refreshSuccessMessage && (
        <div className="bg-[#10B981] text-black font-mono-tech text-xs font-bold px-4 py-3 border-3 border-black neo-shadow flex items-center justify-between gap-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>{refreshSuccessMessage}</span>
          </div>
          <button onClick={() => setRefreshSuccessMessage(null)} className="hover:opacity-75">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* File reading progress bar inside /mimusica */}
      <div className="bg-[#1A1A1A] border-3 border-black p-4 neo-shadow flex flex-col gap-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className={`material-symbols-outlined text-[#4edea3] text-lg ${isLoading ? 'animate-spin' : ''}`}>
              {isLoading ? 'sync' : 'folder_open'}
            </span>
            <span className="font-mono-tech text-xs text-white font-bold uppercase tracking-wider">
              {isLoading
                ? 'Leyendo archivos y carpetas dentro de /mimusica...'
                : totalRecursiveFiles > 0
                ? 'Colección /mimusica lista (Caché instantánea)'
                : 'Lectura de /mimusica completada'}
            </span>
          </div>
          <span className="font-mono-tech text-xs text-[#4edea3] font-bold">
            {isLoading ? `${loadProgress}%` : `${totalRecursiveFiles} canciones`}
          </span>
        </div>
        <div className="w-full h-3.5 bg-black border-2 border-black relative overflow-hidden">
          <div
            className="h-full bg-[#4edea3] transition-all duration-300"
            style={{ width: `${isLoading ? loadProgress : 100}%` }}
          ></div>
        </div>
      </div>

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-[#EF4444] text-white p-4 border-3 border-black neo-shadow flex items-start gap-3">
          <span className="material-symbols-outlined text-2xl shrink-0">error</span>
          <div className="flex-1">
            <h3 className="font-bold text-sm uppercase">Atención con Google Drive</h3>
            <p className="font-mono-tech text-xs mt-0.5">{errorMessage}</p>
          </div>
          <button onClick={() => setErrorMessage(null)} className="text-white hover:opacity-80">
            <span className="material-symbols-outlined text-lg">close</span>
          </button>
        </div>
      )}

      {/* Not authenticated state */}
      {!isAuthenticated && (
        <div className="bg-[#1A1A1A] border-3 border-black neo-shadow p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-6">
          <div className="w-16 h-16 bg-[#201f1f] border-3 border-black flex items-center justify-center text-[#4edea3]">
            <span className="material-symbols-outlined text-4xl">folder_open</span>
          </div>
          <div>
            <div className="inline-flex items-center gap-2 bg-[#141414] px-3 py-1 border border-black mb-3">
              <span className="w-2 h-2 rounded-full bg-[#f59e0b]"></span>
              <span className="font-mono-tech text-xs font-bold uppercase tracking-wider text-[#e5e2e1]">
                Google Drive no conectado
              </span>
            </div>
            <h2 className="text-2xl sm:text-3xl font-black text-white uppercase tracking-tight">
              Tus Archivos de /mimusica en Google Drive
            </h2>
            <p className="font-mono-tech text-xs sm:text-sm text-[#bbcabf] max-w-xl mt-2 mx-auto leading-relaxed">
              La conexión con Google Drive es totalmente independiente de tu cuenta de Gmail para la radio. Puedes escuchar la radio y tus emisoras favoritas sin conectar Drive, o conectar Drive aquí para acceder a tu colección musical personal.
            </p>
          </div>

          {/* Action buttons inside MUSIC view */}
          <div className="flex items-center justify-center gap-3 flex-wrap">
            <button
              onClick={handleConnectDrive}
              disabled={isConnectingDrive}
              className="neo-button bg-[#4edea3] text-[#003824] px-6 py-3.5 font-mono-tech text-xs sm:text-sm font-black uppercase flex items-center gap-2 hover:bg-[#38c98e] cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-lg ${isConnectingDrive ? 'animate-spin' : ''}`}>
                {isConnectingDrive ? 'sync' : 'key'}
              </span>
              <span>{isConnectingDrive ? 'Conectando con Google Drive...' : 'Conectar Google Drive'}</span>
            </button>

            {triggerCarPairing && (
              <button
                type="button"
                onClick={triggerCarPairing}
                className="neo-button bg-[#8B5CF6] text-white px-5 py-3.5 font-mono-tech text-xs sm:text-sm font-bold uppercase flex items-center gap-2 hover:bg-[#7c3aed] cursor-pointer shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]"
              >
                <span className="material-symbols-outlined text-base">qr_code_scanner</span>
                <span>Vincular Coche (QR Móvil)</span>
              </button>
            )}
          </div>

          {/* Access / Action Card */}
          <div className="bg-[#141414] border-2 border-black p-4 max-w-2xl w-full text-left font-mono-tech text-xs text-[#bbcabf] flex flex-col sm:flex-row items-start gap-4 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
            <span className="material-symbols-outlined text-[#4edea3] text-2xl shrink-0 mt-0.5">info</span>
            <div className="flex-1 flex flex-col gap-2">
              <span className="text-white font-bold uppercase text-xs tracking-wide">Acceso bajo demanda para tu música</span>
              <p className="text-[12px] text-[#bbcabf] leading-relaxed">
                Pulsa <strong className="text-[#4edea3]">Conectar Google Drive</strong> arriba para autorizar la lectura de tu carpeta <strong className="text-white">/mimusica</strong>. Si estás en el coche, también puedes usar el botón <strong className="text-[#c4b5fd]">Vincular Coche (QR Móvil)</strong> para autorizar al instante desde tu teléfono sin contraseñas en pantalla.
              </p>
            </div>
          </div>

          {/* Comprehensive Guide: Where to put music and how folder playlists work */}
          <div className="bg-[#121212] border-3 border-black p-5 sm:p-6 max-w-2xl w-full text-left flex flex-col gap-4 shadow-[4px_4px_0px_0px_rgba(0,0,0,1)]">
            <div className="flex items-center gap-2 border-b-2 border-black pb-2.5">
              <span className="material-symbols-outlined text-[#4edea3] text-xl">folder_special</span>
              <h3 className="text-white font-black text-sm uppercase tracking-wide">
                ¿Dónde colocar tu música en Google Drive y cómo organizar tus listas?
              </h3>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Step 1: Main folder location */}
              <div className="bg-[#1c1c1c] border-2 border-black p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[#4edea3] font-bold text-xs uppercase font-mono-tech">
                  <span className="w-5 h-5 bg-[#4edea3] text-black font-black flex items-center justify-center text-[11px] shrink-0">1</span>
                  <span>Carpeta Principal en Google Drive</span>
                </div>
                <p className="text-[11px] text-[#ccc] font-mono-tech leading-relaxed">
                  Crea una carpeta llamada <strong className="text-white bg-black px-1.5 py-0.5 border border-[#444]">mimusica</strong> (o también <code className="text-[#4edea3]">Música</code> / <code className="text-[#4edea3]">Music</code>) directamente en la raíz de tu Drive (<strong className="text-white">Mi unidad</strong>).
                </p>
                <p className="text-[10px] text-[#86948a] font-mono-tech mt-1">
                  ✓ El reproductor la detectará de forma automática e inmediata al conectar tu cuenta.
                </p>
              </div>

              {/* Step 2: Subfolders as playlists */}
              <div className="bg-[#1c1c1c] border-2 border-black p-3.5 flex flex-col gap-1.5">
                <div className="flex items-center gap-2 text-[#06B6D4] font-bold text-xs uppercase font-mono-tech">
                  <span className="w-5 h-5 bg-[#06B6D4] text-black font-black flex items-center justify-center text-[11px] shrink-0">2</span>
                  <span>Carpetas = Listas de Reproducción</span>
                </div>
                <p className="text-[11px] text-[#ccc] font-mono-tech leading-relaxed">
                  Cada subcarpeta que crees dentro de <strong className="text-white">mimusica</strong> se convierte automáticamente en una <strong className="text-[#06B6D4]">Lista de Reproducción o Álbum</strong> independiente.
                </p>
                <p className="text-[10px] text-[#86948a] font-mono-tech mt-1">
                  ✓ Puedes navegar entre listas o reproducir cualquier carpeta completa con un toque.
                </p>
              </div>
            </div>

            {/* Folder structure diagram */}
            <div className="bg-black border-2 border-black p-3.5 font-mono-tech text-[11px] text-[#bbcabf] overflow-x-auto">
              <div className="text-[10px] text-[#4edea3] font-bold uppercase mb-1.5 tracking-wider flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm">account_tree</span>
                Ejemplo de estructura recomendada en Google Drive:
              </div>
              <pre className="text-[11px] leading-relaxed font-mono whitespace-pre text-[#e5e5e5]">
{`📁 Mi unidad (Google Drive)
  └── 📁 mimusica                   ← Carpeta principal autodetectada
        ├── 📁 Rock Clásico         ← Lista de reproducción 1
        │     ├── Thunderstruck.mp3
        │     └── Back_In_Black.mp3
        ├── 📁 Música de Viaje      ← Lista de reproducción 2
        │     ├── Road_Trip.mp3
        │     └── Highway_Star.m4a
        ├── 📁 Pop & Chill          ← Lista de reproducción 3
        │     ├── track01.mp3
        │     └── track02.flac
        └── Cancion_Suelta.mp3      ← Disponible en la lista general`}
              </pre>
            </div>

            {/* Formats and playback features */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1 border-t border-[#262626]">
              <div className="flex flex-col gap-1 font-mono-tech text-[11px]">
                <span className="text-white font-bold uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-[#4edea3]">audio_file</span>
                  Formatos Compatibles
                </span>
                <div className="flex flex-wrap gap-1 mt-0.5">
                  {['MP3', 'M4A', 'FLAC', 'AAC', 'WAV', 'OGG'].map(fmt => (
                    <span key={fmt} className="bg-[#201f1f] text-[#4edea3] text-[10px] font-bold px-1.5 py-0.5 border border-black">
                      {fmt}
                    </span>
                  ))}
                </div>
              </div>

              <div className="flex flex-col gap-1 font-mono-tech text-[11px]">
                <span className="text-white font-bold uppercase flex items-center gap-1">
                  <span className="material-symbols-outlined text-sm text-[#06B6D4]">offline_bolt</span>
                  Ventajas para Conducción
                </span>
                <p className="text-[10px] text-[#aaa] leading-relaxed">
                  Reproducción continua en segundo plano, controles de volante integrados y <strong className="text-white">caché local inteligente</strong> para que el audio no se corte en túneles o zonas sin cobertura móvil.
                </p>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Authenticated state */}
      {isAuthenticated && (
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
          {/* Left: Playlist view (2 cols) */}
          <div className="lg:col-span-2 bg-[#1A1A1A] border-3 border-black neo-shadow p-5 flex flex-col gap-4">
            <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between border-b-2 border-black pb-3 gap-3">
              <h3 className="font-black text-lg text-white uppercase tracking-tight flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4edea3]">queue_music</span>
                {folderStack.length > 1 ? folderStack[folderStack.length - 1].name : 'Colección /mimusica'} ({totalRecursiveFiles > 0 ? totalRecursiveFiles : files.length} canciones)
              </h3>
              <div className="flex items-center gap-2 flex-wrap">
                <button
                  onClick={handleRefreshFolders}
                  disabled={isLoading}
                  title="Actualizar y re-escanear carpetas y archivos de /mimusica"
                  className="neo-button bg-[#10B981] text-black px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 hover:bg-[#059669] cursor-pointer disabled:opacity-60"
                >
                  <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>sync</span>
                  <span>{isLoading ? 'Actualizando...' : 'Actualizar Carpetas'}</span>
                </button>
                <button
                  onClick={handlePlayCurrentFolderSequential}
                  title="Reproducir solo la carpeta actual en orden"
                  className="neo-button bg-[#4edea3] text-black px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 hover:bg-[#3bc791] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">folder_open</span>
                  Carpeta (Orden)
                </button>
                <button
                  onClick={handlePlayCurrentFolderShuffle}
                  title="Reproducir solo la carpeta actual en aleatorio (suflé)"
                  className="neo-button bg-[#06B6D4] text-black px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 hover:bg-[#0891b2] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">shuffle</span>
                  Carpeta (Suflé)
                </button>
                <button
                  onClick={handlePlayAllSequentially}
                  title="Reproducir todo seguido (todas las subcarpetas)"
                  className="neo-button bg-[#22c55e] text-black px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 hover:bg-[#16a34a] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">playlist_play</span>
                  Todo (Orden)
                </button>
                <button
                  onClick={handlePlayShuffle}
                  title="Reproducir todo en aleatorio"
                  className="neo-button bg-[#8B5CF6] text-white px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 hover:bg-[#7c3aed] cursor-pointer"
                >
                  <span className="material-symbols-outlined text-sm">shuffle</span>
                  Todo (Suflé)
                </button>
                <button
                  onClick={() => setShowEq(!showEq)}
                  className={`neo-button px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 ${
                    showEq ? 'bg-[#F59E0B] text-black' : 'bg-[#201f1f] text-[#bbcabf]'
                  }`}
                  title="Ecualizador"
                >
                  <span className="material-symbols-outlined text-sm">equalizer</span>
                  EQ
                </button>
                <button
                  onClick={() => setShowDriveGuide(!showDriveGuide)}
                  className={`neo-button px-2.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 ${
                    showDriveGuide ? 'bg-[#4edea3] text-black' : 'bg-[#201f1f] text-[#bbcabf]'
                  }`}
                  title="Ver cómo organizar carpetas y listas de reproducción en Google Drive"
                >
                  <span className="material-symbols-outlined text-sm">folder_special</span>
                  Guía Drive
                </button>
              </div>
            </div>

            {/* Drive Organization Guide Drawer (Visible anytime on request) */}
            {showDriveGuide && (
              <div className="bg-[#121212] border-3 border-[#4edea3] p-4 flex flex-col gap-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]">
                <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-2">
                  <div className="flex items-center gap-2 text-[#4edea3] font-black text-xs uppercase font-mono-tech">
                    <span className="material-symbols-outlined text-base">account_tree</span>
                    <span>Organización de Carpetas y Listas en Google Drive</span>
                  </div>
                  <button
                    onClick={() => setShowDriveGuide(false)}
                    className="text-gray-400 hover:text-white cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">close</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs font-mono-tech">
                  <div className="bg-[#1a1a1a] p-3 border border-[#333]">
                    <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-[#4edea3] text-black font-black flex items-center justify-center text-[10px]">1</span>
                      Carpeta raíz: <span className="text-[#4edea3]">/mimusica</span>
                    </div>
                    <p className="text-[#bbb] text-[11px] leading-relaxed">
                      Crea la carpeta <strong className="text-white">mimusica</strong> en la raíz de Google Drive (Mi unidad). El reproductor la escaneará y sincronizará automáticamente.
                    </p>
                  </div>
                  <div className="bg-[#1a1a1a] p-3 border border-[#333]">
                    <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                      <span className="w-4 h-4 bg-[#06B6D4] text-black font-black flex items-center justify-center text-[10px]">2</span>
                      Subcarpetas = Listas de Reproducción
                    </div>
                    <p className="text-[#bbb] text-[11px] leading-relaxed">
                      Cada subcarpeta que crees dentro de <strong className="text-white">mimusica</strong> actuará como un álbum o lista independiente navegable con un clic.
                    </p>
                  </div>
                </div>

                <div className="bg-black border border-[#333] p-3 font-mono text-[11px] text-[#e5e5e5] overflow-x-auto">
                  <pre className="leading-relaxed">
{`📁 Mi unidad (Google Drive)
  └── 📁 mimusica                   ← Carpeta principal de música
        ├── 📁 Rock Clásico         ← Lista de reproducción 1
        │     ├── Thunderstruck.mp3
        │     └── Back_In_Black.mp3
        ├── 📁 Música de Viaje      ← Lista de reproducción 2
        │     ├── Road_Trip.mp3
        │     └── Highway_Star.m4a
        ├── 📁 Pop & Chill          ← Lista de reproducción 3
        │     ├── track01.mp3
        │     └── track02.flac
        └── Cancion_Suelta.mp3      ← Visible en la lista general`}
                  </pre>
                </div>
              </div>
            )}

            {/* Equalizer Drawer */}
            {showEq && (
              <div className="bg-[#201f1f] border-2 border-black p-4 flex flex-col gap-3">
                <div className="font-mono-tech text-xs font-bold text-white uppercase flex items-center justify-between">
                  <span>Filtros Biquad (Web Audio API)</span>
                  <button onClick={() => { setEqLow(0); setEqMid(0); setEqHigh(0); driveAudioEngine.setEqualizer(0,0,0); }} className="text-[10px] text-[#4edea3] underline">
                    Resetear
                  </button>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-tech text-[10px] text-[#bbcabf]">Bajos 100Hz: {eqLow}dB</label>
                    <input type="range" min="-20" max="20" step="1" value={eqLow} onChange={e => handleEqChange('low', parseFloat(e.target.value))} className="accent-[#4edea3]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-tech text-[10px] text-[#bbcabf]">Medios 1kHz: {eqMid}dB</label>
                    <input type="range" min="-20" max="20" step="1" value={eqMid} onChange={e => handleEqChange('mid', parseFloat(e.target.value))} className="accent-[#4edea3]" />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-tech text-[10px] text-[#bbcabf]">Agudos 8kHz: {eqHigh}dB</label>
                    <input type="range" min="-20" max="20" step="1" value={eqHigh} onChange={e => handleEqChange('high', parseFloat(e.target.value))} className="accent-[#4edea3]" />
                  </div>
                </div>
              </div>
            )}

            {/* Breadcrumb Navigation */}
            {folderStack.length > 1 && (
              <div className="flex items-center gap-1.5 flex-wrap bg-[#201f1f] p-2.5 border-2 border-black font-mono-tech text-xs">
                <span className="material-symbols-outlined text-[#4edea3] text-base">folder_open</span>
                {folderStack.map((item, idx) => (
                  <React.Fragment key={item.id}>
                    {idx > 0 && <span className="text-[#bbcabf]">/</span>}
                    <button
                      onClick={() => jumpToBreadcrumb(idx)}
                      className={`hover:underline uppercase font-bold ${idx === folderStack.length - 1 ? 'text-[#4edea3]' : 'text-white'}`}
                    >
                      {item.name}
                    </button>
                  </React.Fragment>
                ))}
              </div>
            )}

            {/* Subfolders Grid */}
            {subfolders.length > 0 && (
              <div className="flex flex-col gap-2">
                <div className="flex items-center justify-between">
                  <h4 className="font-mono-tech text-xs text-[#bbcabf] font-bold uppercase tracking-wider">
                    Subcarpetas / Playlists ({subfolders.length})
                  </h4>
                  <span className="text-[10px] font-mono-tech text-[#bbcabf]">
                    Pulsa tarjeta para abrir • Botón ▶ para reproducir
                  </span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-2 2xl:grid-cols-3 gap-2.5 sm:gap-3">
                  {subfolders.map(sub => {
                    const isSubPlaying =
                      (playingSubfolderId === sub.id || currentTrack?.album === sub.name) &&
                      playbackStatus === 'playing';
                    const isSubPaused =
                      (playingSubfolderId === sub.id || currentTrack?.album === sub.name) &&
                      playbackStatus === 'paused';
                    const isSubLoading = loadingSubfolderId === sub.id;

                    return (
                      <div
                        key={sub.id}
                        onClick={() => navigateToSubfolder(sub)}
                        title={`Abrir carpeta: ${sub.name}`}
                        className={`border-2 border-black p-2.5 sm:p-3 transition-all cursor-pointer group flex items-center justify-between gap-3 ${
                          isSubPlaying
                            ? 'bg-[#201f1f] shadow-[3px_3px_0px_0px_rgba(78,222,163,0.8)] border-[#4edea3]'
                            : 'bg-[#1e1e1e] hover:bg-[#252525] shadow-[3px_3px_0px_0px_rgba(0,0,0,1)]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 min-w-0 flex-1">
                          <div className="w-8 h-8 sm:w-9 sm:h-9 bg-black/40 border border-black flex items-center justify-center shrink-0">
                            <span className="material-symbols-outlined text-[#8B5CF6] text-xl group-hover:scale-110 transition-transform">
                              folder
                            </span>
                          </div>
                          <div className="min-w-0 flex-1">
                            <span
                              className="font-bold text-xs sm:text-sm text-white uppercase group-hover:text-[#4edea3] break-words line-clamp-2 leading-snug"
                              title={sub.name}
                            >
                              {sub.name}
                            </span>
                          </div>
                        </div>

                        {/* Play Button - Exactly styled like the RADIO play button */}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isSubPlaying) {
                              driveAudioEngine.pause();
                            } else if (isSubPaused) {
                              driveAudioEngine.resume();
                            } else {
                              handlePlaySubfolder(sub);
                            }
                          }}
                          title={
                            isSubPlaying
                              ? `Pausar ${sub.name}`
                              : isSubPaused
                              ? `Reanudar ${sub.name}`
                              : `Reproducir carpeta ${sub.name}`
                          }
                          aria-label={`Reproducir carpeta ${sub.name}`}
                          className={`w-11 h-7 sm:w-12 sm:h-7.5 rounded-sm border-2 border-black flex items-center justify-center cursor-pointer shrink-0 transition-all select-none ${
                            isSubPlaying
                              ? 'bg-[#181818] text-[#4edea3] shadow-[0_3px_0_0_#000000] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#000000] active:translate-y-[3px] active:shadow-none'
                              : isSubLoading
                              ? 'bg-[#F59E0B] text-black shadow-[0_3px_0_0_#b45309] hover:-translate-y-[1px] active:translate-y-[3px]'
                              : 'bg-gradient-to-b from-[#5af3b6] to-[#38c98e] text-[#003824] shadow-[0_3px_0_0_#000000] hover:from-[#6df5c1] hover:to-[#43d499] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#000000] active:translate-y-[3px] active:shadow-none'
                          }`}
                        >
                          {isSubLoading ? (
                            <span className="material-symbols-outlined text-sm font-bold animate-spin">
                              progress_activity
                            </span>
                          ) : isSubPlaying ? (
                            <span className="material-symbols-outlined text-base font-black">
                              pause
                            </span>
                          ) : (
                            <span className="material-symbols-outlined text-base font-black">
                              play_arrow
                            </span>
                          )}
                        </button>
                      </div>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Song list */}
            {displayFiles.length > 0 ? (
              <div className="flex flex-col gap-2 max-h-[500px] overflow-y-auto pr-1">
                <h4 className="font-mono-tech text-xs text-[#bbcabf] font-bold uppercase tracking-wider mt-2">
                  {folderStack.length > 1
                    ? `Canciones en esta carpeta (${displayFiles.length})`
                    : `Todas las canciones (${displayFiles.length})`}
                </h4>
                {displayFiles.map((file, idx) => {
                  const isCurrent = currentTrack?.id === file.id;
                  return (
                    <div
                      key={file.id}
                      onClick={() => handleSelectTrack(file, idx)}
                      className={`flex items-center justify-between p-3 border-2 border-black cursor-pointer transition-all ${
                        isCurrent
                          ? 'bg-[#4edea3] text-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                          : 'bg-[#201f1f] text-white hover:bg-[#353534]'
                      }`}
                    >
                      <div className="flex items-center gap-3 truncate">
                        <div className={`w-8 h-8 border border-black flex items-center justify-center font-mono-tech text-xs ${isCurrent ? 'bg-black text-[#4edea3]' : 'bg-[#1A1A1A] text-[#bbcabf]'}`}>
                          {isCurrent && playbackStatus === 'playing' ? (
                            <span className="material-symbols-outlined text-sm animate-pulse">volume_up</span>
                          ) : (
                            idx + 1
                          )}
                        </div>
                        <div className="truncate">
                          <div className="font-bold text-sm truncate">{file.name}</div>
                          <div className={`font-mono-tech text-[10px] truncate ${isCurrent ? 'text-black/80' : 'text-[#bbcabf]'}`}>
                            {file.artist} • {file.album || 'Drive'} • {file.size ? `${Math.round(file.size / 1024 / 1024 * 10) / 10} MB` : 'Cloud Stream'}
                          </div>
                        </div>
                      </div>

                      <div className="flex items-center gap-2 shrink-0">
                        {file.isCached ? (
                          <span className="bg-[#10B981] text-black text-[9px] font-mono-tech font-bold px-1.5 py-0.5 border border-black flex items-center gap-1" title="Guardado en caché local (IndexedDB)">
                            <span className="material-symbols-outlined text-[10px]">offline_pin</span>
                            OFFLINE
                          </span>
                        ) : (
                          <span className="bg-[#8B5CF6] text-white text-[9px] font-mono-tech font-bold px-1.5 py-0.5 border border-black flex items-center gap-1" title="Stream desde Google Drive">
                            <span className="material-symbols-outlined text-[10px]">cloud</span>
                            DRIVE
                          </span>
                        )}
                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            if (isCurrent && playbackStatus === 'playing') {
                              driveAudioEngine.pause();
                            } else if (isCurrent && playbackStatus === 'paused') {
                              driveAudioEngine.resume();
                            } else {
                              handleSelectTrack(file, idx);
                            }
                          }}
                          title={isCurrent && playbackStatus === 'playing' ? 'Pausar' : 'Reproducir'}
                          aria-label={isCurrent && playbackStatus === 'playing' ? 'Pausar' : 'Reproducir'}
                          className={`w-11 h-7 sm:w-12 sm:h-7.5 rounded-sm border-2 border-black flex items-center justify-center cursor-pointer shrink-0 transition-all select-none ${
                            isCurrent && playbackStatus === 'playing'
                              ? 'bg-[#181818] text-[#4edea3] shadow-[0_3px_0_0_#000000] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#000000] active:translate-y-[3px] active:shadow-none'
                              : isCurrent && playbackStatus === 'loading'
                              ? 'bg-[#F59E0B] text-black shadow-[0_3px_0_0_#b45309]'
                              : 'bg-gradient-to-b from-[#5af3b6] to-[#38c98e] text-[#003824] shadow-[0_3px_0_0_#000000] hover:from-[#6df5c1] hover:to-[#43d499] hover:-translate-y-[1px] hover:shadow-[0_4px_0_0_#000000] active:translate-y-[3px] active:shadow-none'
                          }`}
                        >
                          <span className="material-symbols-outlined text-base font-black">
                            {isCurrent && playbackStatus === 'playing' ? 'pause' : 'play_arrow'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            ) : isLoading ? (
              <div className="py-8 text-center font-mono-tech text-sm text-[#bbcabf]">
                Cargando canciones...
              </div>
            ) : subfolders.length === 0 ? (
              <div className="py-12 text-center font-mono-tech text-sm text-[#bbcabf]">
                {folderStack.length > 1
                  ? 'Esta carpeta no contiene archivos de audio MP3.'
                  : 'No se encontraron archivos de audio MP3 en la carpeta /mimusica.'}
              </div>
            ) : (
              <div className="py-6 text-center font-mono-tech text-xs text-[#bbcabf] bg-[#201f1f] border-2 border-black p-3">
                Selecciona una de las {subfolders.length} subcarpetas de arriba para ver sus canciones.
              </div>
            )}
          </div>

          {/* Right: Active Player Card (1 col) */}
          <div className="bg-[#1A1A1A] border-3 border-black neo-shadow p-4 sm:p-5 flex flex-col justify-between gap-3 min-h-[580px] h-full">
            <div className="flex flex-col gap-3 shrink-0">
              <div className="border-b-2 border-black pb-2 flex items-center justify-between">
                <span className="font-mono-tech text-xs font-bold text-[#bbcabf] uppercase">Reproductor Activo</span>
                <span className="w-2.5 h-2.5 rounded-full bg-[#10B981] animate-pulse"></span>
              </div>

              {/* Cover Art Box */}
              <div className="w-full h-32 sm:h-36 bg-[#201f1f] border-3 border-black neo-shadow flex flex-col items-center justify-center p-3 text-center relative overflow-hidden shrink-0">
                <div className="absolute inset-0 bg-gradient-to-br from-[#8B5CF6]/20 to-transparent"></div>
                <span className="material-symbols-outlined text-4xl sm:text-5xl text-[#4edea3] mb-1 relative z-10">album</span>
                <div className="font-black text-sm sm:text-base text-white uppercase tracking-tight relative z-10 truncate max-w-full">
                  {currentTrack ? currentTrack.name : 'Ninguna pista seleccionada'}
                </div>
                <div className="font-mono-tech text-[11px] text-[#bbcabf] relative z-10 truncate max-w-full">
                  {currentTrack ? `${currentTrack.artist || 'Google Drive'} • ${currentTrack.album || 'Drive'}` : 'Selecciona una canción o carpeta'}
                </div>
              </div>

              {/* Seek Bar */}
              <div className="flex flex-col gap-1 shrink-0">
                <div className="flex justify-between font-mono-tech text-[10px] text-[#bbcabf]">
                  <span>{formatTime(currentTime)}</span>
                  <span>{formatTime(duration)}</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-full accent-[#4edea3] cursor-pointer"
                />
              </div>
            </div>

            {/* Scrollable Playlist Window inside the player card */}
            <div className="flex-1 min-h-[190px] max-h-[380px] bg-[#141414] border-2 border-black neo-shadow flex flex-col overflow-hidden my-1">
              <div className="bg-[#1f1f1f] border-b-2 border-black px-3 py-1.5 flex items-center justify-between shrink-0">
                <div className="flex items-center gap-2 min-w-0">
                  <span className="material-symbols-outlined text-[#4edea3] text-sm">queue_music</span>
                  <span className="font-mono-tech text-xs font-bold text-white uppercase tracking-wider truncate">
                    Lista de Reproducción
                  </span>
                </div>
                <div className="flex items-center gap-1.5 shrink-0">
                  {queueList.filter(t => t.isCached).length > 0 && (
                    <span
                      className="font-mono-tech text-[9px] text-[#10B981] font-bold bg-black px-1.5 py-0.5 border border-[#10B981]/40 flex items-center gap-1 shrink-0"
                      title="Canciones precargadas en el búfer del coche para evitar cortes sin cobertura"
                    >
                      <span className="w-1.5 h-1.5 rounded-full bg-[#10B981] animate-pulse"></span>
                      Búfer Coche: {queueList.filter(t => t.isCached).length}
                    </span>
                  )}
                  <span className="font-mono-tech text-[10px] text-[#4edea3] font-bold bg-black px-1.5 py-0.5 border border-black shrink-0">
                    {queueList.length} pistas
                  </span>
                </div>
              </div>

              <div className="flex-1 overflow-y-auto p-1.5 flex flex-col gap-1 select-none">
                {queueList.length > 0 ? (
                  queueList.map((track, idx) => {
                    const isCurrent = currentTrack?.id === track.id;
                    return (
                      <div
                        key={`${track.id}-${idx}`}
                        ref={isCurrent ? activeTrackRef : null}
                        onClick={() => handleSelectTrack(track, idx, queueList)}
                        className={`px-2.5 py-2 border border-black flex items-center justify-between gap-2 cursor-pointer transition-all ${
                          isCurrent
                            ? 'bg-[#4edea3] text-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                            : 'bg-[#1c1c1c] text-white hover:bg-[#282828]'
                        }`}
                      >
                        <div className="flex items-center gap-2 min-w-0 flex-1">
                          <div
                            className={`w-6 h-6 border border-black flex items-center justify-center font-mono-tech text-[10px] shrink-0 ${
                              isCurrent ? 'bg-black text-[#4edea3]' : 'bg-[#121212] text-[#bbcabf]'
                            }`}
                          >
                            {isCurrent && playbackStatus === 'playing' ? (
                              <span className="material-symbols-outlined text-xs animate-pulse">volume_up</span>
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div className="min-w-0 flex-1">
                            <div className="text-xs font-bold truncate leading-tight">{track.name}</div>
                            <div
                              className={`font-mono-tech text-[9px] truncate ${
                                isCurrent ? 'text-black/80' : 'text-[#8e9f93]'
                              }`}
                            >
                              {track.artist || 'Google Drive'}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-1.5 shrink-0">
                          {track.isCached && (
                            <span
                              className="bg-[#10B981] text-black text-[8px] font-mono-tech font-bold px-1 py-0.5 border border-black"
                              title="En caché local"
                            >
                              OFF
                            </span>
                          )}
                          <span className={`material-symbols-outlined text-base ${isCurrent ? 'text-black' : 'text-[#4edea3]'}`}>
                            {isCurrent && playbackStatus === 'playing' ? 'pause' : 'play_arrow'}
                          </span>
                        </div>
                      </div>
                    );
                  })
                ) : (
                  <div className="py-8 text-center font-mono-tech text-xs text-[#bbcabf]">
                    No hay canciones en la lista
                  </div>
                )}
              </div>
            </div>

            {/* Playback Controls */}
            <div className="flex items-center justify-center gap-4 pt-1 shrink-0">
              <button
                onClick={() => driveAudioEngine.playPrev()}
                className="neo-button w-12 h-12 bg-[#201f1f] text-white flex items-center justify-center hover:bg-[#353534]"
                title="Pista Anterior"
              >
                <span className="material-symbols-outlined text-2xl">skip_previous</span>
              </button>

              <button
                onClick={handleTogglePlay}
                className="neo-button w-16 h-16 bg-[#4edea3] text-black flex items-center justify-center hover:bg-[#3bc791]"
                title={playbackStatus === 'playing' ? 'Pausar' : 'Reproducir'}
              >
                <span className="material-symbols-outlined text-3xl font-black">
                  {playbackStatus === 'playing' ? 'pause' : 'play_arrow'}
                </span>
              </button>

              <button
                onClick={() => driveAudioEngine.playNext()}
                className="neo-button w-12 h-12 bg-[#201f1f] text-white flex items-center justify-center hover:bg-[#353534]"
                title="Pista Siguiente"
              >
                <span className="material-symbols-outlined text-2xl">skip_next</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
