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

  const [folderInput] = useState<string>(() => {
    try {
      return localStorage.getItem('radiostream_drive_folder_id') || 'https://drive.google.com/drive/folders/1mUgFaomlz2DDuXNw_1T5fQ64bGympC8E';
    } catch {
      return 'https://drive.google.com/drive/folders/1mUgFaomlz2DDuXNw_1T5fQ64bGympC8E';
    }
  });

  const [subfolders, setSubfolders] = useState<{ id: string; name: string }[]>(() => {
    if (!cachedInitial?.subfolders) return [];
    return Array.from(new Map(cachedInitial.subfolders.map(s => [s.id, s])).values());
  });
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(() => cachedInitial?.folderId || null);
  const [totalRecursiveFiles, setTotalRecursiveFiles] = useState<number>(() => cachedInitial?.totalRecursiveFiles || 0);
  const [allRecursiveFiles, setAllRecursiveFiles] = useState<DriveAudioFile[]>(() => {
    if (!cachedInitial?.allRecursiveFiles) return [];
    return Array.from(new Map(cachedInitial.allRecursiveFiles.map(f => [f.id, f])).values());
  });
  const [loadProgress, setLoadProgress] = useState<number>(() => (cachedInitial ? 100 : 0));
  const [loadingSubfolderId, setLoadingSubfolderId] = useState<string | null>(null);
  const [isConnectingDrive, setIsConnectingDrive] = useState<boolean>(false);
  const [refreshSuccessMessage, setRefreshSuccessMessage] = useState<string | null>(null);

  // UNIFIED SINGLE-BLOCK NAVIGATION STATE
  // viewMode: 'tracks' (shows songs of selected folder) or 'folders' (shows all folders grid)
  const [viewMode, setViewMode] = useState<'tracks' | 'folders'>('tracks');
  // selectedFolderId: 'all' (all songs), 'root' (loose files), or subfolder ID
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [folderSearchQuery, setFolderSearchQuery] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [searchScope, setSearchScope] = useState<'current' | 'all'>('current');
  const [folderFilesCache, setFolderFilesCache] = useState<Record<string, DriveAudioFile[]>>({});

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
        const uniqueFiles = Array.from(new Map((cached.files || []).map(f => [f.id, f])).values());
        const uniqueSubs = Array.from(new Map((cached.subfolders || []).map(s => [s.id, s])).values());
        const uniqueAll = Array.from(new Map((cached.allRecursiveFiles || []).map(f => [f.id, f])).values());
        const playlistToSet = uniqueFiles.length > 0 ? uniqueFiles : uniqueAll;
        driveAudioEngine.setPlaylist(playlistToSet);
        setFiles(uniqueFiles);
        setSubfolders(uniqueSubs);
        setAllRecursiveFiles(uniqueAll);
        setTotalRecursiveFiles(uniqueAll.length);
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

    return () => {
      unsubStatus();
      unsubTime();
      unsubTrack();
    };
  }, []);

  // Map of subfolder names to track count
  const folderTrackCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    for (const f of allRecursiveFiles) {
      if (f.album) {
        const key = f.album.trim().toLowerCase();
        counts[key] = (counts[key] || 0) + 1;
      }
    }
    return counts;
  }, [allRecursiveFiles]);

  // Current subfolder object if selectedFolderId corresponds to a subfolder
  const currentSubfolder = useMemo(() => {
    if (selectedFolderId === 'all' || selectedFolderId === 'root') return null;
    return subfolders.find(s => s.id === selectedFolderId) || null;
  }, [selectedFolderId, subfolders]);

  // List of all folder options for linear navigation
  const folderOptionsList = useMemo(() => {
    const list: { id: string; name: string }[] = [{ id: 'all', name: 'Todas las canciones' }];
    if (files.length > 0) {
      list.push({ id: 'root', name: 'Raíz /mimusica' });
    }
    for (const s of subfolders) {
      list.push(s);
    }
    return list;
  }, [files, subfolders]);

  const handlePrevFolder = () => {
    const currentIndex = folderOptionsList.findIndex(f => f.id === selectedFolderId);
    const prevIndex = (currentIndex - 1 + folderOptionsList.length) % folderOptionsList.length;
    setSelectedFolderId(folderOptionsList[prevIndex].id);
    setViewMode('tracks');
  };

  const handleNextFolder = () => {
    const currentIndex = folderOptionsList.findIndex(f => f.id === selectedFolderId);
    const nextIndex = (currentIndex + 1) % folderOptionsList.length;
    setSelectedFolderId(folderOptionsList[nextIndex].id);
    setViewMode('tracks');
  };

  // Active folder name for display
  const selectedFolderName = useMemo(() => {
    if (selectedFolderId === 'all') return 'Todas las canciones';
    if (selectedFolderId === 'root') return 'Raíz /mimusica';
    return currentSubfolder?.name || 'Carpeta';
  }, [selectedFolderId, currentSubfolder]);

  // Tracks inside the active folder
  const activeFolderTracks = useMemo(() => {
    if (selectedFolderId === 'all') {
      return allRecursiveFiles.length > 0 ? allRecursiveFiles : files;
    }
    if (selectedFolderId === 'root') {
      return files;
    }
    if (!currentSubfolder) return files;

    // 1. In-memory folderFilesCache
    if (folderFilesCache[currentSubfolder.id] && folderFilesCache[currentSubfolder.id].length > 0) {
      return folderFilesCache[currentSubfolder.id];
    }

    // 2. Filter from allRecursiveFiles by album name
    const matching = allRecursiveFiles.filter(
      f => f.album?.trim().toLowerCase() === currentSubfolder.name.trim().toLowerCase()
    );
    if (matching.length > 0) {
      return matching;
    }

    return [];
  }, [selectedFolderId, currentSubfolder, allRecursiveFiles, files, folderFilesCache]);

  // Lazy-load folder files over network if not in recursive index
  useEffect(() => {
    if (selectedFolderId === 'all' || selectedFolderId === 'root' || !currentSubfolder) return;
    if (folderFilesCache[currentSubfolder.id]) return;

    const matching = allRecursiveFiles.filter(
      f => f.album?.trim().toLowerCase() === currentSubfolder.name.trim().toLowerCase()
    );
    if (matching.length > 0) {
      setFolderFilesCache(prev => ({ ...prev, [currentSubfolder.id]: matching }));
      return;
    }

    const token = googleDriveService.getToken();
    if (!token) return;

    setIsLoading(true);
    setLoadingSubfolderId(currentSubfolder.id);
    googleDriveService.getFolderContents(token, currentSubfolder.id)
      .then(async contents => {
        const cachedIds = await driveCacheService.getCachedFileIds();
        const enriched = contents.files.map(f => ({ ...f, isCached: cachedIds.includes(f.id) }));
        setFolderFilesCache(prev => ({ ...prev, [currentSubfolder.id]: enriched }));
      })
      .catch(err => console.warn('Error fetching subfolder tracks:', err))
      .finally(() => {
        setIsLoading(false);
        setLoadingSubfolderId(null);
      });
  }, [selectedFolderId, currentSubfolder, allRecursiveFiles, folderFilesCache]);

  // Filtered tracks with search query and scope
  const displayedTracks = useMemo(() => {
    const baseList = (searchQuery.trim() && searchScope === 'all')
      ? (allRecursiveFiles.length > 0 ? allRecursiveFiles : files)
      : activeFolderTracks;

    if (!searchQuery.trim()) return baseList;
    const q = searchQuery.toLowerCase().trim();
    return baseList.filter(
      f => f.name.toLowerCase().includes(q) ||
           (f.artist && f.artist.toLowerCase().includes(q)) ||
           (f.album && f.album.toLowerCase().includes(q))
    );
  }, [searchQuery, searchScope, activeFolderTracks, allRecursiveFiles, files]);

  // Filtered subfolders for the folders grid view
  const filteredSubfolders = useMemo(() => {
    if (!folderSearchQuery.trim()) return subfolders;
    const q = folderSearchQuery.toLowerCase().trim();
    return subfolders.filter(s => s.name.toLowerCase().includes(q));
  }, [subfolders, folderSearchQuery]);

  const loadMusicFolder = async (targetFolderId?: string, forceRefresh = false) => {
    if (!forceRefresh) {
      const cached = await driveCacheService.getCachedLibrary();
      if (cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0) {
        setCurrentFolderId(cached.folderId);
        setFiles(cached.files);
        setSubfolders(cached.subfolders);
        setAllRecursiveFiles(cached.allRecursiveFiles);
        setTotalRecursiveFiles(cached.totalRecursiveFiles);
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
        googleDriveService.listAudioFilesInFolder(token, folderId),
      ]);

      setLoadProgress(85);
      const initialStack = [{ id: contents.folderId, name: contents.folderName }];

      const cachedIds = await driveCacheService.getCachedFileIds();
      const enrichedFiles = contents.files.map(file => ({
        ...file,
        isCached: cachedIds.includes(file.id),
      }));

      const enrichedAll = allRecursive.map(file => ({
        ...file,
        isCached: cachedIds.includes(file.id),
      }));

      const uniqueFiles = Array.from(new Map(enrichedFiles.map(f => [f.id, f])).values());
      const uniqueAll = Array.from(new Map(enrichedAll.map(f => [f.id, f])).values());
      const uniqueSubs = Array.from(new Map(contents.subfolders.map(s => [s.id, s])).values());

      setFiles(uniqueFiles);
      setSubfolders(uniqueSubs);
      setAllRecursiveFiles(uniqueAll);
      setTotalRecursiveFiles(uniqueAll.length);
      driveAudioEngine.setPlaylist(uniqueFiles.length > 0 ? uniqueFiles : uniqueAll);
      setLoadProgress(100);
      const finalStatus = `${uniqueSubs.length} carpetas, ${uniqueAll.length} canciones en total en /mimusica`;
      setFolderStatus(finalStatus);

      await driveCacheService.saveCachedLibrary({
        folderId,
        folderName: contents.folderName,
        files: uniqueFiles,
        subfolders: uniqueSubs,
        allRecursiveFiles: uniqueAll,
        folderStack: initialStack,
        totalRecursiveFiles: uniqueAll.length,
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
      setRefreshSuccessMessage('¡Carpetas y canciones sincronizadas!');
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
    setCurrentTrack(null);
    setFolderStatus('Desconectado de Google Drive');
    if (activeSource === 'drive') {
      onSwitchToRadio();
    }
    if (onDisconnect) {
      onDisconnect();
    }
  };

  // Play a specific track
  const handleSelectTrack = async (file: DriveAudioFile, index: number, customList?: DriveAudioFile[]) => {
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) {
      setErrorMessage('Sesión de Drive expirada. Vuelve a conectar.');
      setIsAuthenticated(false);
      return;
    }
    const currentList = customList || (displayedTracks.length > 0 ? displayedTracks : (allRecursiveFiles.length > 0 ? allRecursiveFiles : files));
    driveAudioEngine.setPlaylist(currentList, index);
    await driveAudioEngine.playTrack(file, token);
  };

  // Play active folder (sequential or shuffle)
  const handlePlayActiveFolder = async (shuffle = false) => {
    const baseList = displayedTracks.length > 0 ? displayedTracks : activeFolderTracks;
    if (baseList.length === 0) return;
    let listToPlay = [...baseList];
    if (shuffle) {
      for (let i = listToPlay.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [listToPlay[i], listToPlay[j]] = [listToPlay[j], listToPlay[i]];
      }
    }
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;
    driveAudioEngine.setPlaylist(listToPlay, 0);
    await driveAudioEngine.playTrack(listToPlay[0], token);
    setFolderStatus(`Reproduciendo "${selectedFolderName}" (${listToPlay.length} pistas${shuffle ? ' • aleatorio' : ''})`);
  };

  // Direct play button for a subfolder
  const handlePlaySubfolderDirect = async (sub: { id: string; name: string }, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFolderId(sub.id);
    setViewMode('tracks');
    onActivateDriveSource();
    const token = googleDriveService.getToken();
    if (!token) return;

    setLoadingSubfolderId(sub.id);
    try {
      let subFiles = folderFilesCache[sub.id] || allRecursiveFiles.filter(
        f => f.album?.trim().toLowerCase() === sub.name.trim().toLowerCase()
      );
      if (subFiles.length === 0) {
        subFiles = await googleDriveService.listAudioFilesInFolder(token, sub.id);
        const cachedIds = await driveCacheService.getCachedFileIds();
        subFiles = subFiles.map(f => ({ ...f, isCached: cachedIds.includes(f.id) }));
        setFolderFilesCache(prev => ({ ...prev, [sub.id]: subFiles }));
      }
      if (subFiles.length === 0) {
        setFolderStatus(`La carpeta "${sub.name}" no contiene archivos de audio.`);
        return;
      }
      driveAudioEngine.setPlaylist(subFiles, 0);
      await driveAudioEngine.playTrack(subFiles[0], token);
      setFolderStatus(`Reproduciendo carpeta "${sub.name}" (${subFiles.length} pistas)`);
    } catch (err: any) {
      setErrorMessage(err.message || 'Error al reproducir carpeta');
    } finally {
      setLoadingSubfolderId(null);
    }
  };

  const handleTogglePlay = () => {
    if (playbackStatus === 'playing') {
      driveAudioEngine.pause();
    } else if (playbackStatus === 'paused') {
      driveAudioEngine.resume();
    } else if (displayedTracks.length > 0) {
      handleSelectTrack(displayedTracks[0], 0);
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
    <div className="flex flex-col gap-4 w-full max-w-full overflow-x-hidden pb-32">
      {/* 1. TOP DRIVE CONNECTION STATUS BAR (COMPACT & RESPONSIVE) */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 bg-[#1A1A1A] border-3 border-black p-3 sm:p-4 neo-shadow w-full max-w-full">
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <div className="w-9 h-9 sm:w-10 sm:h-10 bg-[#201f1f] border-2 border-black flex items-center justify-center shrink-0">
            <span className={`material-symbols-outlined text-xl sm:text-2xl ${isAuthenticated ? 'text-[#4edea3]' : 'text-[#f59e0b]'}`}>
              {isAuthenticated ? 'cloud_done' : 'cloud_off'}
            </span>
          </div>
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="font-black text-xs sm:text-sm md:text-base text-white tracking-tight uppercase truncate">
                Música en Google Drive (/mimusica)
              </h1>
              {isAuthenticated ? (
                <span className="bg-[#10B981] text-black text-[9px] sm:text-[10px] font-mono-tech font-bold px-1.5 py-0.5 border border-black uppercase shrink-0 flex items-center gap-1">
                  <span className="w-1.5 h-1.5 rounded-full bg-black animate-pulse" />
                  CONECTADO
                </span>
              ) : (
                <span className="bg-[#f59e0b] text-black text-[9px] sm:text-[10px] font-mono-tech font-bold px-1.5 py-0.5 border border-black uppercase shrink-0">
                  DESCONECTADO
                </span>
              )}
            </div>
            <p className="font-mono-tech text-[11px] text-[#bbcabf] truncate mt-0.5">
              {isAuthenticated
                ? `${subfolders.length} carpetas • ${totalRecursiveFiles} canciones`
                : 'Conecta Google Drive para reproducir tu música.'}
            </p>
          </div>
        </div>

        {/* Global Toolbar buttons */}
        <div className="flex items-center gap-1.5 sm:gap-2 flex-wrap shrink-0 w-full sm:w-auto justify-start sm:justify-end">
          {isAuthenticated ? (
            <>
              <button
                type="button"
                onClick={handleRefreshFolders}
                disabled={isLoading}
                className="neo-button bg-[#10B981] text-black px-2.5 sm:px-3 py-1.5 font-mono-tech text-[11px] font-black uppercase flex items-center gap-1 hover:bg-[#059669] cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
                title="Sincronizar carpetas y canciones de Google Drive"
              >
                <span className={`material-symbols-outlined text-sm ${isLoading ? 'animate-spin' : ''}`}>sync</span>
                <span>{isLoading ? 'Sincronizando...' : 'Actualizar'}</span>
              </button>

              <button
                type="button"
                onClick={() => setShowEq(!showEq)}
                className={`neo-button px-2.5 sm:px-3 py-1.5 font-mono-tech text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer border-2 border-black ${
                  showEq ? 'bg-[#F59E0B] text-black' : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
                title="Ecualizador de audio"
              >
                <span className="material-symbols-outlined text-sm">equalizer</span>
                <span>EQ</span>
              </button>

              <button
                type="button"
                onClick={() => setShowDriveGuide(!showDriveGuide)}
                className={`neo-button px-2.5 sm:px-3 py-1.5 font-mono-tech text-[11px] font-bold uppercase flex items-center gap-1 cursor-pointer border-2 border-black ${
                  showDriveGuide ? 'bg-[#4edea3] text-black' : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
                title="Guía de organización de carpetas"
              >
                <span className="material-symbols-outlined text-sm">folder_special</span>
                <span className="hidden md:inline">Guía</span>
              </button>

              <button
                type="button"
                onClick={handleDisconnectDrive}
                className="neo-button bg-[#262626] border-2 border-black hover:bg-[#dc2626] text-[#bbb] hover:text-white px-2.5 py-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] flex items-center gap-1 font-mono-tech text-[11px] font-bold"
                title="Desconectar acceso a Google Drive"
              >
                <span className="material-symbols-outlined text-sm">logout</span>
                <span className="hidden md:inline">Desconectar</span>
              </button>
            </>
          ) : (
            <>
              <button
                type="button"
                onClick={handleConnectDrive}
                disabled={isConnectingDrive}
                className="neo-button bg-[#4edea3] text-[#003824] px-4 py-2 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 hover:bg-[#38c98e] cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
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
                >
                  <span className="material-symbols-outlined text-sm">qr_code_scanner</span>
                  <span>QR Móvil</span>
                </button>
              )}
            </>
          )}
        </div>
      </div>

      {/* Success notification banner */}
      {refreshSuccessMessage && (
        <div className="bg-[#10B981] text-black font-mono-tech text-xs font-bold px-4 py-2.5 border-3 border-black neo-shadow flex items-center justify-between gap-3 w-full">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-base">check_circle</span>
            <span>{refreshSuccessMessage}</span>
          </div>
          <button type="button" onClick={() => setRefreshSuccessMessage(null)} className="hover:opacity-75">
            <span className="material-symbols-outlined text-sm">close</span>
          </button>
        </div>
      )}

      {/* Loading Progress Bar */}
      {isLoading && (
        <div className="bg-[#1A1A1A] border-3 border-black p-3 neo-shadow flex flex-col gap-2 w-full">
          <div className="flex items-center justify-between text-xs font-mono-tech">
            <span className="text-white font-bold uppercase flex items-center gap-2">
              <span className="material-symbols-outlined text-[#4edea3] text-sm animate-spin">sync</span>
              Sincronizando /mimusica...
            </span>
            <span className="text-[#4edea3] font-bold tabular-nums">{loadProgress}%</span>
          </div>
          <div className="w-full h-2 bg-black border border-black relative overflow-hidden">
            <div className="h-full bg-[#4edea3] transition-all duration-300" style={{ width: `${loadProgress}%` }} />
          </div>
        </div>
      )}

      {/* Error banner */}
      {errorMessage && (
        <div className="bg-[#EF4444] text-white p-3.5 border-3 border-black neo-shadow flex items-start gap-3 w-full">
          <span className="material-symbols-outlined text-xl shrink-0">error</span>
          <div className="flex-1 min-w-0">
            <h3 className="font-bold text-xs uppercase">Atención con Google Drive</h3>
            <p className="font-mono-tech text-xs mt-0.5">{errorMessage}</p>
          </div>
          <button type="button" onClick={() => setErrorMessage(null)} className="text-white hover:opacity-80">
            <span className="material-symbols-outlined text-base">close</span>
          </button>
        </div>
      )}

      {/* Equalizer Drawer */}
      {showEq && (
        <div className="bg-[#201f1f] border-3 border-black p-4 neo-shadow flex flex-col gap-3 w-full">
          <div className="font-mono-tech text-xs font-bold text-white uppercase flex items-center justify-between border-b border-[#333] pb-2">
            <span className="flex items-center gap-2">
              <span className="material-symbols-outlined text-[#F59E0B] text-base">equalizer</span>
              Ecualizador Biquad (Web Audio API)
            </span>
            <button
              type="button"
              onClick={() => { setEqLow(0); setEqMid(0); setEqHigh(0); driveAudioEngine.setEqualizer(0,0,0); }}
              className="text-[10px] text-[#4edea3] underline hover:text-white"
            >
              Resetear a 0dB
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

      {/* Guide Drawer */}
      {showDriveGuide && (
        <div className="bg-[#121212] border-3 border-[#4edea3] p-4 flex flex-col gap-3 shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] w-full">
          <div className="flex items-center justify-between border-b border-[#2b2b2b] pb-2">
            <div className="flex items-center gap-2 text-[#4edea3] font-black text-xs uppercase font-mono-tech">
              <span className="material-symbols-outlined text-base">account_tree</span>
              <span>Organización en Google Drive (/mimusica)</span>
            </div>
            <button type="button" onClick={() => setShowDriveGuide(false)} className="text-gray-400 hover:text-white">
              <span className="material-symbols-outlined text-sm">close</span>
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs font-mono-tech">
            <div className="bg-[#1a1a1a] p-3 border border-[#333]">
              <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                <span className="w-4 h-4 bg-[#4edea3] text-black font-black flex items-center justify-center text-[10px]">1</span>
                Carpeta raíz: <span className="text-[#4edea3]">/mimusica</span>
              </div>
              <p className="text-[#bbb] text-[11px] leading-relaxed">
                Crea una carpeta llamada <strong className="text-white">mimusica</strong> en la raíz de tu Google Drive. Se detecta automáticamente.
              </p>
            </div>
            <div className="bg-[#1a1a1a] p-3 border border-[#333]">
              <div className="text-white font-bold mb-1 flex items-center gap-1.5">
                <span className="w-4 h-4 bg-[#06B6D4] text-black font-black flex items-center justify-center text-[10px]">2</span>
                Subcarpetas = Listas de Reproducción
              </div>
              <p className="text-[#bbb] text-[11px] leading-relaxed">
                Cada subcarpeta dentro de <strong className="text-white">mimusica</strong> se convierte automáticamente en una lista o álbum navegable en este bloque.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Unauthenticated Welcome Banner */}
      {!isAuthenticated && (
        <div className="bg-[#1A1A1A] border-3 border-black neo-shadow p-6 sm:p-8 text-center flex flex-col items-center justify-center gap-5 w-full">
          <div className="w-14 h-14 bg-[#201f1f] border-2 border-black flex items-center justify-center text-[#4edea3]">
            <span className="material-symbols-outlined text-3xl">folder_open</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
              Tus Archivos de Música en Google Drive
            </h2>
            <p className="font-mono-tech text-xs sm:text-sm text-[#bbcabf] max-w-lg mt-2 mx-auto leading-relaxed">
              Conecta tu Google Drive para explorar y reproducir tu música organizada en carpetas (/mimusica) en una sola pantalla navegable y responsiva.
            </p>
          </div>
          <button
            type="button"
            onClick={handleConnectDrive}
            disabled={isConnectingDrive}
            className="neo-button bg-[#4edea3] text-[#003824] px-6 py-3 font-mono-tech text-xs sm:text-sm font-black uppercase flex items-center gap-2 hover:bg-[#38c98e] cursor-pointer shadow-[3px_3px_0px_0px_rgba(0,0,0,1)] disabled:opacity-60"
          >
            <span className={`material-symbols-outlined text-base ${isConnectingDrive ? 'animate-spin' : ''}`}>
              {isConnectingDrive ? 'sync' : 'key'}
            </span>
            <span>{isConnectingDrive ? 'Conectando...' : 'Conectar Google Drive'}</span>
          </button>
        </div>
      )}

      {/* 2. EL DIV/BLOQUE ÚNICO NAVEGABLE Y TOTALMENTE RESPONSIVO */}
      {isAuthenticated && (
        <div className="w-full max-w-full bg-[#1A1A1A] border-3 border-black neo-shadow p-3 sm:p-4 md:p-5 flex flex-col gap-3.5 box-border">
          {/* A. BLOCK TOP NAVIGATION & VIEW SELECTOR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pb-2.5 border-b-2 border-black">
            {/* View switcher tabs */}
            <div className="flex items-center gap-1.5 flex-wrap">
              <button
                type="button"
                onClick={() => setViewMode('tracks')}
                className={`neo-button px-3 py-1.5 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 border-2 border-black transition-all cursor-pointer ${
                  viewMode === 'tracks'
                    ? 'bg-[#4edea3] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">music_note</span>
                <span className="truncate max-w-[180px] sm:max-w-[320px] md:max-w-[450px]">
                  {selectedFolderName}
                </span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/60 text-[#bbcabf] border border-black tabular-nums">
                  {displayedTracks.length}
                </span>
              </button>

              <button
                type="button"
                onClick={() => setViewMode('folders')}
                className={`neo-button px-3 py-1.5 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 border-2 border-black transition-all cursor-pointer ${
                  viewMode === 'folders'
                    ? 'bg-[#4edea3] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-base">folder_open</span>
                <span>Explorar Carpetas</span>
                <span className="text-[10px] px-1.5 py-0.2 bg-black/60 text-[#bbcabf] border border-black tabular-nums">
                  {subfolders.length}
                </span>
              </button>
            </div>

            {/* Action buttons (Reproducir Todo & Aleatorio) */}
            <div className="flex items-center gap-2 shrink-0">
              <button
                type="button"
                onClick={() => handlePlayActiveFolder(false)}
                title="Reproducir esta carpeta en orden"
                className="neo-button bg-gradient-to-b from-[#5af3b6] to-[#38c98e] text-[#003824] px-3 py-1.5 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:from-[#6df5c1] hover:to-[#43d499]"
              >
                <span className="material-symbols-outlined text-base">play_arrow</span>
                <span className="hidden xs:inline">Reproducir</span> Todo
              </button>

              <button
                type="button"
                onClick={() => handlePlayActiveFolder(true)}
                title="Reproducir esta carpeta en modo aleatorio"
                className="neo-button bg-[#8B5CF6] text-white px-3 py-1.5 font-mono-tech text-xs font-black uppercase flex items-center gap-1.5 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:bg-[#7c3aed]"
              >
                <span className="material-symbols-outlined text-base">shuffle</span>
                <span>Aleatorio</span>
              </button>
            </div>
          </div>

          {/* B. FOLDER SELECTOR & ACCESOS RÁPIDOS (100% RESPONSIVE - NOMBRES COMPLETOS SIN CORTAR) */}
          <div className="flex flex-col gap-2.5 w-full max-w-full select-none bg-[#141414] border-2 border-black p-2.5 sm:p-3">
            {/* Fila 1: Selector desplegable para acceso directo inmediato a cualquier carpeta */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 w-full">
              <div className="flex items-center gap-2 min-w-0 flex-1">
                <span className="material-symbols-outlined text-base text-[#4edea3] shrink-0">folder_open</span>
                <span className="text-[11px] font-mono-tech font-bold uppercase text-[#bbcabf] shrink-0">
                  Carpeta activa:
                </span>
                <div className="relative flex-1 min-w-0 max-w-full sm:max-w-md">
                  <select
                    value={selectedFolderId}
                    onChange={(e) => {
                      setSelectedFolderId(e.target.value);
                      setViewMode('tracks');
                    }}
                    aria-label="Seleccionar carpeta de música"
                    className="w-full bg-[#1e1e1e] border-2 border-black text-[#4edea3] font-mono-tech text-xs font-bold uppercase py-1.5 pl-2.5 pr-8 outline-none cursor-pointer appearance-none shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] hover:border-[#4edea3] transition-colors"
                  >
                    <option value="all" className="bg-[#1a1a1a] text-white">
                      ⭐ TODAS LAS CANCIONES ({totalRecursiveFiles} pistas)
                    </option>
                    {files.length > 0 && (
                      <option value="root" className="bg-[#1a1a1a] text-white">
                        📁 RAÍZ /mimusica ({files.length} pistas)
                      </option>
                    )}
                    {subfolders.map((sub) => {
                      const count = folderTrackCounts[sub.name.trim().toLowerCase()] || 0;
                      return (
                        <option key={sub.id} value={sub.id} className="bg-[#1a1a1a] text-white">
                          📁 {sub.name.toUpperCase()} {count > 0 ? `(${count} pistas)` : ''}
                        </option>
                      );
                    })}
                  </select>
                  <span className="material-symbols-outlined text-base text-[#4edea3] absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none">
                    unfold_more
                  </span>
                </div>
              </div>

              {/* Botón para alternar a vista en cuadrícula de carpetas */}
              <div className="flex items-center gap-2 shrink-0 justify-end">
                <span className="text-[10px] font-mono-tech text-[#888] uppercase hidden md:inline">
                  {subfolders.length} carpetas
                </span>
                <button
                  type="button"
                  onClick={() => setViewMode(v => v === 'folders' ? 'tracks' : 'folders')}
                  className="neo-button px-2.5 py-1 bg-[#201f1f] text-[#bbcabf] hover:text-white border-2 border-black font-mono-tech text-[10px] font-bold uppercase flex items-center gap-1 cursor-pointer"
                  title="Ver todas las carpetas en cuadrícula amplia"
                >
                  <span className="material-symbols-outlined text-xs">
                    {viewMode === 'folders' ? 'view_list' : 'grid_view'}
                  </span>
                  <span>{viewMode === 'folders' ? 'Ver pistas' : 'Ver cuadrícula'}</span>
                </button>
              </div>
            </div>

            {/* Fila 2: Etiquetas de carpetas completas (SIN cortar texto, envolventes y responsivas) */}
            <div className="flex flex-wrap items-center gap-1.5 w-full max-w-full pt-2 border-t border-[#262626]">
              {/* Pill: Todas las canciones */}
              <button
                type="button"
                onClick={() => { setSelectedFolderId('all'); setViewMode('tracks'); }}
                className={`neo-button px-2.5 py-1 font-mono-tech text-[10px] sm:text-[11px] font-bold uppercase flex items-center gap-1.5 border-2 border-black transition-all cursor-pointer ${
                  selectedFolderId === 'all' && viewMode === 'tracks'
                    ? 'bg-[#4edea3] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                    : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                }`}
              >
                <span className="material-symbols-outlined text-xs sm:text-sm">queue_music</span>
                <span>Todas</span>
                <span className={`text-[9px] px-1 py-0 border border-black font-black tabular-nums ${
                  selectedFolderId === 'all' && viewMode === 'tracks' ? 'bg-black text-[#4edea3]' : 'bg-black/60 text-[#bbb]'
                }`}>
                  {totalRecursiveFiles}
                </span>
              </button>

              {/* Pill: Raíz /mimusica if any */}
              {files.length > 0 && (
                <button
                  type="button"
                  onClick={() => { setSelectedFolderId('root'); setViewMode('tracks'); }}
                  className={`neo-button px-2.5 py-1 font-mono-tech text-[10px] sm:text-[11px] font-bold uppercase flex items-center gap-1.5 border-2 border-black transition-all cursor-pointer ${
                    selectedFolderId === 'root' && viewMode === 'tracks'
                      ? 'bg-[#4edea3] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                      : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                  }`}
                >
                  <span className="material-symbols-outlined text-xs sm:text-sm">folder_open</span>
                  <span>Raíz</span>
                  <span className={`text-[9px] px-1 py-0 border border-black font-black tabular-nums ${
                    selectedFolderId === 'root' && viewMode === 'tracks' ? 'bg-black text-[#4edea3]' : 'bg-black/60 text-[#bbb]'
                  }`}>
                    {files.length}
                  </span>
                </button>
              )}

              {/* Pills: Cada subcarpeta con NOMBRE COMPLETO sin truncar */}
              {subfolders.map(sub => {
                const isSelected = selectedFolderId === sub.id && viewMode === 'tracks';
                const isPlaying = currentTrack?.album === sub.name && playbackStatus === 'playing';
                const count = folderTrackCounts[sub.name.trim().toLowerCase()] || 0;

                return (
                  <button
                    key={sub.id}
                    type="button"
                    onClick={() => { setSelectedFolderId(sub.id); setViewMode('tracks'); }}
                    className={`neo-button px-2.5 py-1 font-mono-tech text-[10px] sm:text-[11px] font-bold uppercase flex items-center gap-1.5 border-2 border-black transition-all cursor-pointer ${
                      isSelected
                        ? 'bg-[#4edea3] text-black shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : isPlaying
                        ? 'bg-[#262626] text-[#4edea3] border-[#4edea3]'
                        : 'bg-[#201f1f] text-[#bbcabf] hover:text-white'
                    }`}
                  >
                    <span className="material-symbols-outlined text-xs sm:text-sm shrink-0">
                      {isPlaying ? 'volume_up' : 'folder'}
                    </span>
                    <span className="whitespace-normal leading-tight text-left">{sub.name}</span>
                    {count > 0 && (
                      <span className={`text-[9px] px-1 py-0 border border-black font-black tabular-nums shrink-0 ${
                        isSelected ? 'bg-black text-[#4edea3]' : 'bg-black/60 text-[#bbb]'
                      }`}>
                        {count}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
          </div>

          {/* C. ACTIVE FOLDER TITLE & RESPONSIVE SEARCH BAR */}
          <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2 bg-[#141414] border-2 border-black p-2.5 w-full max-w-full">
            {/* Search Input */}
            <div className="flex items-center gap-2 flex-1 min-w-0">
              <span className="material-symbols-outlined text-[#4edea3] text-base shrink-0">search</span>
              <input
                type="text"
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
                placeholder={
                  viewMode === 'folders'
                    ? 'Filtrar canciones...'
                    : searchScope === 'all'
                    ? 'Buscar en toda la música...'
                    : `Buscar en "${selectedFolderName}"...`
                }
                className="w-full bg-transparent font-mono-tech text-xs text-white placeholder-[#666] outline-none"
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  className="text-gray-400 hover:text-white text-xs font-mono-tech cursor-pointer shrink-0"
                >
                  ✕
                </button>
              )}
            </div>

            {/* Scope selector */}
            <div className="flex items-center border border-black bg-[#1e1e1e] shrink-0 font-mono-tech text-[10px] font-bold uppercase">
              <button
                type="button"
                onClick={() => setSearchScope('current')}
                className={`px-2 py-1 transition-colors cursor-pointer ${
                  searchScope === 'current' ? 'bg-[#4edea3] text-black font-black' : 'text-[#888] hover:text-white'
                }`}
              >
                Esta carpeta
              </button>
              <button
                type="button"
                onClick={() => setSearchScope('all')}
                className={`px-2 py-1 transition-colors cursor-pointer ${
                  searchScope === 'all' ? 'bg-[#4edea3] text-black font-black' : 'text-[#888] hover:text-white'
                }`}
              >
                Toda la música
              </button>
            </div>
          </div>

          {/* D. BODY: EITHER FOLDERS GRID OR TRACK LIST (ALL IN THIS SINGLE BLOCK) */}
          {viewMode === 'folders' ? (
            /* --- FOLDERS GRID VIEW --- */
            <div className="flex flex-col gap-3 w-full max-w-full">
              {/* Folder search input */}
              {subfolders.length > 8 && (
                <div className="flex items-center gap-2 bg-[#141414] border-2 border-black px-3 py-2 w-full">
                  <span className="material-symbols-outlined text-[#bbcabf] text-sm">filter_list</span>
                  <input
                    type="text"
                    value={folderSearchQuery}
                    onChange={e => setFolderSearchQuery(e.target.value)}
                    placeholder="Filtrar carpetas por nombre..."
                    className="w-full bg-transparent font-mono-tech text-xs text-white placeholder-[#666] outline-none"
                  />
                  {folderSearchQuery && (
                    <button type="button" onClick={() => setFolderSearchQuery('')} className="text-gray-400 hover:text-white text-xs">
                      ✕
                    </button>
                  )}
                </div>
              )}

              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 xl:grid-cols-4 gap-2.5 w-full max-w-full">
                {/* All songs card */}
                <div
                  onClick={() => { setSelectedFolderId('all'); setViewMode('tracks'); }}
                  className={`border-2 border-black p-3 transition-all cursor-pointer group flex items-center justify-between gap-2.5 ${
                    selectedFolderId === 'all'
                      ? 'bg-[#252525] border-[#4edea3] shadow-[2px_2px_0px_0px_rgba(78,222,163,0.8)]'
                      : 'bg-[#1e1e1e] hover:bg-[#252525] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0 flex-1">
                    <div className="w-8 h-8 bg-black/50 border border-black flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-[#4edea3] text-lg">queue_music</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs text-white uppercase break-words leading-snug group-hover:text-[#4edea3]">
                        Todas las canciones
                      </div>
                      <div className="font-mono-tech text-[10px] text-[#bbcabf] tabular-nums mt-0.5">
                        {totalRecursiveFiles} pistas
                      </div>
                    </div>
                  </div>
                  <span className="text-[#4edea3] font-mono-tech text-xs">Ver →</span>
                </div>

                {/* Subfolder cards */}
                {filteredSubfolders.map(sub => {
                  const isSelected = selectedFolderId === sub.id;
                  const isPlaying = currentTrack?.album === sub.name && playbackStatus === 'playing';
                  const isSubLoading = loadingSubfolderId === sub.id;
                  const count = folderTrackCounts[sub.name.trim().toLowerCase()] || 0;

                  return (
                    <div
                      key={sub.id}
                      onClick={() => { setSelectedFolderId(sub.id); setViewMode('tracks'); }}
                      className={`border-2 border-black p-3 transition-all cursor-pointer group flex items-center justify-between gap-2.5 ${
                        isPlaying
                          ? 'bg-[#201f1f] border-[#4edea3] shadow-[3px_3px_0px_0px_rgba(78,222,163,0.8)]'
                          : isSelected
                          ? 'bg-[#252525] border-[#4edea3] shadow-[2px_2px_0px_0px_rgba(78,222,163,0.5)]'
                          : 'bg-[#1e1e1e] hover:bg-[#252525] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                      }`}
                    >
                      <div className="flex items-center gap-2.5 min-w-0 flex-1">
                        <div className="w-8 h-8 bg-black/50 border border-black flex items-center justify-center shrink-0">
                          <span className={`material-symbols-outlined text-lg ${isPlaying ? 'text-[#10B981] animate-pulse' : 'text-[#8B5CF6]'}`}>
                            {isPlaying ? 'volume_up' : 'folder'}
                          </span>
                        </div>
                        <div className="min-w-0 flex-1">
                          <div className="font-bold text-xs text-white uppercase break-words line-clamp-2 leading-snug group-hover:text-[#4edea3]" title={sub.name}>
                            {sub.name}
                          </div>
                          <div className="font-mono-tech text-[10px] text-[#bbcabf] tabular-nums mt-0.5">
                            {count > 0 ? `${count} pistas` : 'Carpeta'}
                          </div>
                        </div>
                      </div>

                      {/* Direct play button on folder card */}
                      <button
                        type="button"
                        onClick={(e) => handlePlaySubfolderDirect(sub, e)}
                        title={`Reproducir ${sub.name}`}
                        className="w-8 h-8 rounded-sm border border-black flex items-center justify-center bg-[#4edea3] text-black hover:bg-[#38c98e] cursor-pointer shrink-0 transition-transform active:scale-95"
                      >
                        {isSubLoading ? (
                          <span className="material-symbols-outlined text-xs animate-spin">progress_activity</span>
                        ) : (
                          <span className="material-symbols-outlined text-base font-black">
                            {isPlaying ? 'pause' : 'play_arrow'}
                          </span>
                        )}
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          ) : (
            /* --- TRACKS LIST VIEW --- */
            <div className="flex flex-col gap-2 w-full max-w-full">
              {displayedTracks.length > 0 ? (
                <div className="flex flex-col gap-1.5 max-h-[560px] overflow-y-auto pr-1 w-full max-w-full">
                  {displayedTracks.map((file, idx) => {
                    const isCurrent = currentTrack?.id === file.id;
                    const isPlaying = isCurrent && playbackStatus === 'playing';

                    return (
                      <div
                        key={file.id}
                        ref={isCurrent ? activeTrackRef : null}
                        onClick={() => handleSelectTrack(file, idx, displayedTracks)}
                        className={`flex items-center justify-between p-2.5 sm:p-3 border-2 border-black cursor-pointer transition-all gap-2 w-full max-w-full select-none ${
                          isCurrent
                            ? 'bg-[#4edea3] text-black font-bold shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                            : 'bg-[#201f1f] text-white hover:bg-[#282828]'
                        }`}
                      >
                        <div className="flex items-center gap-2.5 truncate min-w-0 flex-1">
                          <div className={`w-7 h-7 sm:w-8 sm:h-8 border border-black flex items-center justify-center font-mono-tech text-xs shrink-0 tabular-nums ${
                            isCurrent ? 'bg-black text-[#4edea3]' : 'bg-[#141414] text-[#bbcabf]'
                          }`}>
                            {isPlaying ? (
                              <span className="material-symbols-outlined text-xs sm:text-sm animate-pulse">volume_up</span>
                            ) : (
                              idx + 1
                            )}
                          </div>
                          <div className="truncate min-w-0 flex-1">
                            <div className="font-bold text-xs sm:text-sm truncate leading-tight">
                              {file.name}
                            </div>
                            <div className={`font-mono-tech text-[10px] truncate mt-0.5 ${
                              isCurrent ? 'text-black/80' : 'text-[#bbcabf]'
                            }`}>
                              {file.artist || 'Google Drive'} • {file.album || 'Drive'} {file.size ? `• ${Math.round(file.size / 1024 / 1024 * 10) / 10} MB` : ''}
                            </div>
                          </div>
                        </div>

                        <div className="flex items-center gap-2 shrink-0">
                          {file.isCached ? (
                            <span className="bg-[#10B981] text-black text-[9px] font-mono-tech font-bold px-1.5 py-0.5 border border-black flex items-center gap-1" title="Guardado en caché local">
                              <span className="material-symbols-outlined text-[10px]">offline_pin</span>
                              <span className="hidden sm:inline">OFFLINE</span>
                            </span>
                          ) : (
                            <span className="bg-[#8B5CF6] text-white text-[9px] font-mono-tech font-bold px-1.5 py-0.5 border border-black flex items-center gap-1" title="Stream desde Google Drive">
                              <span className="material-symbols-outlined text-[10px]">cloud</span>
                              <span className="hidden sm:inline">DRIVE</span>
                            </span>
                          )}

                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              if (isPlaying) {
                                driveAudioEngine.pause();
                              } else if (isCurrent && playbackStatus === 'paused') {
                                driveAudioEngine.resume();
                              } else {
                                handleSelectTrack(file, idx, displayedTracks);
                              }
                            }}
                            title={isPlaying ? 'Pausar' : 'Reproducir'}
                            aria-label={isPlaying ? 'Pausar' : 'Reproducir'}
                            className={`w-10 h-7 sm:w-11 sm:h-7.5 rounded-sm border-2 border-black flex items-center justify-center cursor-pointer shrink-0 transition-all select-none ${
                              isPlaying
                                ? 'bg-[#181818] text-[#4edea3] shadow-[0_2px_0_0_#000000] active:translate-y-[2px]'
                                : isCurrent && playbackStatus === 'loading'
                                ? 'bg-[#F59E0B] text-black shadow-[0_2px_0_0_#b45309]'
                                : 'bg-gradient-to-b from-[#5af3b6] to-[#38c98e] text-[#003824] shadow-[0_2px_0_0_#000000] hover:from-[#6df5c1] hover:to-[#43d499] active:translate-y-[2px]'
                            }`}
                          >
                            <span className="material-symbols-outlined text-base font-black">
                              {isPlaying ? 'pause' : 'play_arrow'}
                            </span>
                          </button>
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : isLoading ? (
                <div className="py-12 text-center font-mono-tech text-xs sm:text-sm text-[#bbcabf] bg-[#201f1f] border-2 border-black p-4 flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-2xl text-[#4edea3] animate-spin">sync</span>
                  <span>Cargando canciones de la carpeta...</span>
                </div>
              ) : (
                <div className="py-12 text-center font-mono-tech text-xs sm:text-sm text-[#bbcabf] bg-[#201f1f] border-2 border-black p-4 flex flex-col items-center justify-center gap-2">
                  <span className="material-symbols-outlined text-2xl text-[#f59e0b]">music_off</span>
                  <span>No hay canciones disponibles en esta carpeta o búsqueda.</span>
                  {searchQuery && (
                    <button type="button" onClick={() => setSearchQuery('')} className="text-xs text-[#4edea3] underline mt-1">
                      Limpiar búsqueda
                    </button>
                  )}
                </div>
              )}
            </div>
          )}

          {/* E. INTEGRATED MINI NOW-PLAYING BAR (INSIDE THIS SINGLE BLOCK) */}
          {currentTrack && (
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-2.5 pt-2.5 border-t-2 border-black bg-[#161616] p-2.5 w-full max-w-full">
              <div className="flex items-center gap-2.5 min-w-0 flex-1">
                <div className="w-8 h-8 bg-black border border-black flex items-center justify-center shrink-0">
                  <span className="material-symbols-outlined text-[#4edea3] text-base">album</span>
                </div>
                <div className="min-w-0 flex-1">
                  <div className="text-xs font-bold text-white uppercase truncate">
                    {currentTrack.name}
                  </div>
                  <div className="font-mono-tech text-[10px] text-[#bbcabf] truncate">
                    📁 {currentTrack.album || 'Drive'} • {currentTrack.artist || 'Google Drive'}
                  </div>
                </div>
              </div>

              {/* Mini seek & controls */}
              <div className="flex items-center gap-2 shrink-0">
                <span className="font-mono-tech text-[10px] text-[#bbcabf] tabular-nums">
                  {formatTime(currentTime)} / {formatTime(duration)}
                </span>
                <input
                  type="range"
                  min="0"
                  max={duration || 100}
                  value={currentTime}
                  onChange={handleSeek}
                  className="w-20 sm:w-28 accent-[#4edea3] cursor-pointer"
                />
                <button
                  type="button"
                  onClick={() => driveAudioEngine.playPrev(true)}
                  className="w-7 h-7 bg-[#201f1f] text-white border border-black flex items-center justify-center hover:bg-[#333]"
                  title="Anterior"
                >
                  <span className="material-symbols-outlined text-sm">skip_previous</span>
                </button>
                <button
                  type="button"
                  onClick={handleTogglePlay}
                  className="w-8 h-8 bg-[#4edea3] text-black border border-black flex items-center justify-center hover:bg-[#3bc791]"
                  title={playbackStatus === 'playing' ? 'Pausar' : 'Reproducir'}
                >
                  <span className="material-symbols-outlined text-base font-black">
                    {playbackStatus === 'playing' ? 'pause' : 'play_arrow'}
                  </span>
                </button>
                <button
                  type="button"
                  onClick={() => driveAudioEngine.playNext(true)}
                  className="w-7 h-7 bg-[#201f1f] text-white border border-black flex items-center justify-center hover:bg-[#333]"
                  title="Siguiente"
                >
                  <span className="material-symbols-outlined text-sm">skip_next</span>
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
