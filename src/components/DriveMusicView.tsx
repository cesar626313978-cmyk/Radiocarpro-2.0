import React, { useState, useEffect, useMemo, useRef } from 'react';
import { DriveAudioFile, DrivePlaybackStatus } from '../types/drive';
import { googleDriveService } from '../services/googleDriveService';
import { driveAudioEngine } from '../services/driveAudioEngine';
import { driveCacheService } from '../services/driveCacheService';
import { trySilentTokenRefresh, startTokenHeartbeat, isDriveConnectedPersistently } from '../services/googleDriveAuth';
import { User, isTeslaBrowser } from '../services/firebase';
import { useTranslation } from '../i18n/LanguageContext';

interface DriveMusicViewProps {
  onSwitchToRadio: () => void;
  activeSource: 'radio' | 'drive';
  onActivateDriveSource: () => void;
  user?: User | any | null;
  onOpenCarPairing?: () => void;
  onOpenTeslaPairing?: () => void; // compatibilidad
  onDisconnect?: () => void;
  isVisible?: boolean;
}

export const DriveMusicView: React.FC<DriveMusicViewProps> = ({
  onSwitchToRadio,
  activeSource,
  onActivateDriveSource,
  user,
  onOpenCarPairing,
  onOpenTeslaPairing,
  onDisconnect,
  isVisible = true,
}) => {
  const { t } = useTranslation();
  const triggerCarPairing = onOpenCarPairing || onOpenTeslaPairing;
  // Synchronous cache retrieval for instant 0ms rendering
  const cachedInitial = driveCacheService.getCachedLibrarySync();

  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(() => {
    return googleDriveService.hasToken() || !!(cachedInitial && cachedInitial.allRecursiveFiles && cachedInitial.allRecursiveFiles.length > 0);
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [folderStatus, setFolderStatus] = useState<string>(
    () => cachedInitial?.folderStatus || (googleDriveService.hasToken() ? 'Listo en memoria' : 'Biblioteca lista en vehículo')
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
      return localStorage.getItem('radiostream_drive_folder_id') || '';
    } catch {
      return '';
    }
  });
  const [availableDriveFolders, setAvailableDriveFolders] = useState<{ id: string; name: string }[]>([]);
  const [isListingDriveFolders, setIsListingDriveFolders] = useState<boolean>(false);

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

  // AUTOMOTIVE MASTER-DETAIL NAVIGATION STATE
  // mobileTab: 'collections' vs 'tracks' (for narrow screen viewports)
  const [mobileTab, setMobileTab] = useState<'collections' | 'tracks'>('tracks');
  // selectedFolderId: 'all' (all songs), 'root' (loose files), or subfolder ID
  const [selectedFolderId, setSelectedFolderId] = useState<string>('all');
  const [folderSearchQuery, setFolderSearchQuery] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
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
      const cached = driveCacheService.getCachedLibrarySync();
      const hasCachedFiles = !!(cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0);
      const hadPreviousLogin = typeof window !== 'undefined' && !!(
        localStorage.getItem('radiostream_drive_token') ||
        localStorage.getItem('gdrive_bearer_token') ||
        localStorage.getItem('radiostream_paired_user')
      );
      // En el vehículo: si ya tenemos canciones indexadas en caché o sesión previa, NUNCA bloquear la pantalla
      setIsAuthenticated(hasTok || hasCachedFiles || hadPreviousLogin);
      if (hasTok) {
        if (!cached || !cached.files || cached.files.length === 0) {
          loadMusicFolder(undefined, false);
        }
      }
    });
    return unsub;
  }, []);

  // Proactive check when switching back to tab or focusing
  useEffect(() => {
    const handleCheckOnFocus = () => {
      const token = googleDriveService.getToken();
      if (!token) {
        trySilentTokenRefresh().catch(() => {});
      }
    };
    window.addEventListener('focus', handleCheckOnFocus);
    const onVisibility = () => {
      if (document.visibilityState === 'visible') {
        handleCheckOnFocus();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => {
      window.removeEventListener('focus', handleCheckOnFocus);
      document.removeEventListener('visibilitychange', onVisibility);
    };
  }, []);

  // Listen to token expiration events from DriveAudioEngine
  useEffect(() => {
    const handleTokenExpired = (e: any) => {
      const trackName = e?.detail?.trackName;
      setErrorMessage(
        trackName
          ? `La sesión de Google Drive ha expirado para reproducir "${trackName}". Pulsa "Renovar Conexión".`
          : 'La sesión de Google Drive ha expirado (1 hora de seguridad). Pulsa "Renovar Conexión" para continuar.'
      );
    };
    window.addEventListener('gdrive:token-expired', handleTokenExpired);
    return () => {
      window.removeEventListener('gdrive:token-expired', handleTokenExpired);
    };
  }, []);

  // Proactive check & restore when user returns to the Drive tab inside the vehicle
  useEffect(() => {
    if (isVisible) {
      const cached = driveCacheService.getCachedLibrarySync();
      const hasCachedFiles = !!(cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0);
      const hasTok = googleDriveService.hasToken();
      if (hasTok || hasCachedFiles || isDriveConnectedPersistently()) {
        setIsAuthenticated(true);
        if (files.length === 0 && allRecursiveFiles.length === 0 && hasCachedFiles && cached) {
          const uniqueFiles = Array.from(new Map((cached.files || []).map(f => [f.id, f])).values());
          const uniqueSubs = Array.from(new Map((cached.subfolders || []).map(s => [s.id, s])).values());
          const uniqueAll = Array.from(new Map((cached.allRecursiveFiles || []).map(f => [f.id, f])).values());
          setFiles(uniqueFiles);
          setSubfolders(uniqueSubs);
          setAllRecursiveFiles(uniqueAll);
          setTotalRecursiveFiles(uniqueAll.length);
          setCurrentFolderId(cached.folderId);
          setFolderStatus(cached.folderStatus || `${uniqueAll.length} canciones disponibles • Modo Vehículo`);
          driveAudioEngine.setPlaylist(uniqueFiles.length > 0 ? uniqueFiles : uniqueAll);
        }
      }
      if (!googleDriveService.getToken()) {
        trySilentTokenRefresh().catch(() => {});
      }
    }
  }, [isVisible]);

  // Check auth state on mount & use instant cache without blocking network rescan
  useEffect(() => {
    // 1. Iniciar heartbeat de renovación silenciosa preventivo
    startTokenHeartbeat();

    const hasTok = googleDriveService.hasToken();
    const cached = driveCacheService.getCachedLibrarySync();
    const hasCachedFiles = !!(cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0);
    const hadPreviousLogin = typeof window !== 'undefined' && !!(
      localStorage.getItem('radiostream_drive_token') ||
      localStorage.getItem('gdrive_bearer_token') ||
      localStorage.getItem('radiostream_paired_user')
    );

    if (hasTok || hasCachedFiles || hadPreviousLogin) {
      setIsAuthenticated(true);
      if (hasCachedFiles && cached) {
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

        // Intentar refresco en segundo plano sin bloquear interfaz
        trySilentTokenRefresh().catch(() => {});
      } else {
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
    setMobileTab('tracks');
  };

  const handleNextFolder = () => {
    const currentIndex = folderOptionsList.findIndex(f => f.id === selectedFolderId);
    const nextIndex = (currentIndex + 1) % folderOptionsList.length;
    setSelectedFolderId(folderOptionsList[nextIndex].id);
    setMobileTab('tracks');
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

  // Filtered tracks with search query and active folder (< 5ms response)
  const displayedTracks = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return activeFolderTracks;

    const pool = allRecursiveFiles.length > 0 ? allRecursiveFiles : files;
    return pool.filter(
      f => f.name.toLowerCase().includes(q) ||
           (f.artist && f.artist.toLowerCase().includes(q)) ||
           (f.album && f.album.toLowerCase().includes(q))
    );
  }, [searchQuery, activeFolderTracks, allRecursiveFiles, files]);

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
      let token = googleDriveService.getToken();
      if (!token) {
        token = await trySilentTokenRefresh();
      }

      if (!token) {
        // Preservar la biblioteca en caché sin cortar la música ni bloquear la pantalla
        const cached = await driveCacheService.getCachedLibrary();
        if (cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0) {
          setIsAuthenticated(true);
          setIsLoading(false);
          setCurrentFolderId(cached.folderId);
          setFiles(cached.files);
          setSubfolders(cached.subfolders);
          setAllRecursiveFiles(cached.allRecursiveFiles);
          setTotalRecursiveFiles(cached.totalRecursiveFiles);
          setFolderStatus(`${cached.allRecursiveFiles.length} canciones disponibles • Modo Vehículo`);
          setLoadProgress(100);
          driveAudioEngine.setPlaylist(cached.files.length > 0 ? cached.files : cached.allRecursiveFiles);
        } else if (files.length > 0 || allRecursiveFiles.length > 0) {
          setIsAuthenticated(true);
          setIsLoading(false);
          setFolderStatus(`${allRecursiveFiles.length || files.length} canciones listas en memoria`);
          setLoadProgress(100);
        } else {
          setIsAuthenticated(false);
          setIsLoading(false);
          setFolderStatus('Sesión de Google Drive lista para vincular');
          setErrorMessage('Pulsa "Conectar Drive" o "Vincular Coche" para sincronizar tus canciones con Google Drive.');
        }
        return;
      }

      setLoadProgress(35);
      let folderId = targetFolderId;
      if (!folderId) {
        folderId = await googleDriveService.findMusicFolderId(token, folderInput);
      }

      if (!folderId) {
        // Fetch all accessible folders in user's Drive so user can click their folder
        try {
          setIsListingDriveFolders(true);
          const folders = await googleDriveService.getUserFolders(token);
          if (folders && folders.length > 0) {
            setAvailableDriveFolders(folders);
          }
        } catch {} finally {
          setIsListingDriveFolders(false);
        }

        // Also check if we have cached library
        const cached = await driveCacheService.getCachedLibrary();
        if (cached && Array.isArray(cached.allRecursiveFiles) && cached.allRecursiveFiles.length > 0) {
          setCurrentFolderId(cached.folderId);
          setFiles(cached.files);
          setSubfolders(cached.subfolders);
          setAllRecursiveFiles(cached.allRecursiveFiles);
          setTotalRecursiveFiles(cached.totalRecursiveFiles);
          setFolderStatus(`${cached.allRecursiveFiles.length} canciones cargadas desde la caché local`);
          setLoadProgress(100);
          driveAudioEngine.setPlaylist(cached.files.length > 0 ? cached.files : cached.allRecursiveFiles);
          setIsLoading(false);
          return;
        }

        setErrorMessage('No se encontró automáticamente la carpeta "Mi música" en Google Drive. Elige una de tus carpetas a continuación o introduce su enlace/ID.');
        setFolderStatus('Selecciona tu carpeta de música');
        setIsLoading(false);
        return;
      }

      setAvailableDriveFolders([]);
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
        googleDriveService.redirectToOAuth();
        return;
      }
      await googleDriveService.authenticate();
      setIsAuthenticated(true);
      await loadMusicFolder(undefined, true);
    } catch (err: any) {
      console.warn('Drive popup auth failed, attempting redirect:', err);
      try {
        googleDriveService.redirectToOAuth();
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
    setErrorMessage(null);
    let token = googleDriveService.getToken();
    if (!token && !file.isCached) {
      token = await trySilentTokenRefresh(undefined, true);
    }
    const currentList = customList || (displayedTracks.length > 0 ? displayedTracks : (allRecursiveFiles.length > 0 ? allRecursiveFiles : files));
    driveAudioEngine.setPlaylist(currentList, index);
    try {
      await driveAudioEngine.playTrack(file, token || undefined);
    } catch (err: any) {
      console.warn('Playback error for track:', err);
      if (!token && !file.isCached) {
        setErrorMessage('La sesión de Google Drive ha expirado. Pulsa "Renovar Conexión" para seguir reproduciendo en streaming.');
      } else {
        setErrorMessage(err.message || 'Error al reproducir canción');
      }
    }
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
    setErrorMessage(null);
    let token = googleDriveService.getToken();
    if (!token && !listToPlay[0]?.isCached) {
      token = await trySilentTokenRefresh(undefined, true);
    }
    driveAudioEngine.setPlaylist(listToPlay, 0);
    try {
      await driveAudioEngine.playTrack(listToPlay[0], token || undefined);
      setFolderStatus(`Reproduciendo "${selectedFolderName}" (${listToPlay.length} pistas${shuffle ? ' • aleatorio' : ''})`);
    } catch (err: any) {
      console.warn('Error playing active folder:', err);
      if (!token && !listToPlay[0]?.isCached) {
        setErrorMessage('La sesión de Google Drive ha expirado. Pulsa "Renovar Conexión" para reproducir canciones en streaming.');
      }
    }
  };

  // Direct play button for a subfolder
  const handlePlaySubfolderDirect = async (sub: { id: string; name: string }, e?: React.MouseEvent) => {
    if (e) e.stopPropagation();
    setSelectedFolderId(sub.id);
    setMobileTab('tracks');
    onActivateDriveSource();
    let token = googleDriveService.getToken();
    if (!token) {
      token = await trySilentTokenRefresh();
    }

    setLoadingSubfolderId(sub.id);
    try {
      let subFiles = folderFilesCache[sub.id] || allRecursiveFiles.filter(
        f => f.album?.trim().toLowerCase() === sub.name.trim().toLowerCase()
      );
      if (subFiles.length === 0 && token) {
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
      await driveAudioEngine.playTrack(subFiles[0], token || undefined);
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

  const handleTrackRowClick = (file: DriveAudioFile, idx: number) => {
    if (currentTrack?.id === file.id) {
      if (playbackStatus === 'playing') {
        driveAudioEngine.pause();
      } else {
        driveAudioEngine.resume();
      }
    } else {
      handleSelectTrack(file, idx, displayedTracks);
    }
  };

  return (
    <div className="w-full flex flex-col bg-zinc-950 text-zinc-100 rounded-2xl border border-zinc-800/80 shadow-2xl overflow-hidden select-none mb-24">
      {/* 1. BARRA SUPERIOR ULTRA-COMPACTA (CABINA ERGONÓMICA) */}
      <header className="h-16 px-4 sm:px-6 border-b border-zinc-800 flex items-center justify-between bg-zinc-900/80 backdrop-blur shrink-0 gap-3">
        <div className="flex items-center gap-3 shrink-0">
          <div className={`w-3 h-3 rounded-full ${isAuthenticated ? 'bg-emerald-500 animate-pulse' : 'bg-amber-500'}`} />
          <h1 className="text-base sm:text-lg font-black tracking-wider text-emerald-400">AUDIO-CAR</h1>
          <span className="text-xs text-zinc-400 font-mono hidden md:inline">
            /mimusica • {(totalRecursiveFiles || allRecursiveFiles.length).toLocaleString()} Pistas
          </span>
        </div>

        {/* Buscador Integrado */}
        <div className="flex-1 max-w-md mx-2 sm:mx-6">
          <div className="relative">
            <input
              type="text"
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
              placeholder="Buscar artista, pista o carpeta..."
              className="w-full h-12 bg-zinc-800/80 border border-zinc-700/80 rounded-xl px-4 pl-10 text-sm text-zinc-100 placeholder-zinc-400 focus:outline-none focus:border-emerald-500 transition-colors"
            />
            <span className="material-symbols-outlined text-zinc-400 text-lg absolute left-3 top-1/2 -translate-y-1/2 pointer-events-none">
              search
            </span>
            {searchQuery && (
              <button
                type="button"
                onClick={() => setSearchQuery('')}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-400 hover:text-white text-xs font-mono p-1 cursor-pointer"
                aria-label="Limpiar búsqueda"
              >
                ✕
              </button>
            )}
          </div>
        </div>

        {/* Acciones Rápidas de Audio (Hitboxes automotrices >= 48px) */}
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setShowEq(!showEq)}
            className={`h-12 px-3.5 sm:px-4 rounded-xl text-xs font-bold tracking-wider flex items-center gap-1.5 border transition-colors cursor-pointer min-w-[48px] ${
              showEq
                ? 'bg-amber-500 text-black border-amber-400 shadow-[0_0_12px_rgba(245,158,11,0.3)]'
                : 'bg-zinc-800 hover:bg-zinc-700 text-zinc-200 border-zinc-700'
            }`}
            title="Ecualizador"
          >
            <span className="material-symbols-outlined text-base">equalizer</span>
            <span>EQ</span>
          </button>
          <button
            type="button"
            onClick={handleRefreshFolders}
            disabled={isLoading}
            className="h-12 px-3.5 sm:px-4 rounded-xl bg-emerald-500/10 text-emerald-400 hover:bg-emerald-500/20 text-xs font-bold tracking-wider border border-emerald-500/30 flex items-center gap-1.5 transition-colors cursor-pointer disabled:opacity-60 min-w-[48px]"
            title="Sincronizar canciones con Google Drive"
          >
            <span className={`material-symbols-outlined text-base ${isLoading ? 'animate-spin' : ''}`}>sync</span>
            <span>{isLoading ? 'SYNC...' : 'SYNC'}</span>
          </button>
          {triggerCarPairing && (
            <button
              type="button"
              onClick={triggerCarPairing}
              className="h-12 px-3 sm:px-4 rounded-xl bg-purple-500/15 text-purple-300 hover:bg-purple-500/25 text-xs font-bold tracking-wider border border-purple-500/30 hidden sm:flex items-center gap-1.5 transition-colors cursor-pointer min-w-[48px]"
              title="Vincular con el móvil mediante QR"
            >
              <span className="material-symbols-outlined text-base">qr_code_scanner</span>
              <span className="hidden lg:inline">VINCULAR</span>
            </button>
          )}
          {isAuthenticated && (
            <button
              type="button"
              onClick={handleDisconnectDrive}
              className="h-12 w-12 rounded-xl bg-zinc-800/80 hover:bg-red-500/20 text-zinc-400 hover:text-red-300 border border-zinc-700/80 flex items-center justify-center transition-colors cursor-pointer"
              title="Desconectar Google Drive"
            >
              <span className="material-symbols-outlined text-base">logout</span>
            </button>
          )}
        </div>
      </header>

      {/* Notificación de Éxito / Estado */}
      {refreshSuccessMessage && (
        <div className="bg-emerald-950/90 text-emerald-300 border-b border-emerald-500/40 px-4 py-2 text-xs font-mono flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-sm">check_circle</span>
            <span>{refreshSuccessMessage}</span>
          </div>
          <button type="button" onClick={() => setRefreshSuccessMessage(null)} className="text-emerald-400 hover:text-white">✕</button>
        </div>
      )}

      {/* Barra de progreso de carga */}
      {isLoading && (
        <div className="w-full bg-zinc-900 border-b border-zinc-800 px-4 py-2 flex items-center justify-between text-xs font-mono text-zinc-400">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-emerald-400 text-sm animate-spin">sync</span>
            <span>Sincronizando /mimusica con Google Drive...</span>
          </div>
          <span className="text-emerald-400 font-bold">{loadProgress}%</span>
        </div>
      )}

      {/* Banner de error y renovación inmediata */}
      {errorMessage && (
        <div className="bg-amber-950/90 border-b border-amber-500/40 text-amber-200 px-4 py-3 text-xs flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 shrink-0">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-amber-400 text-base">warning</span>
            <span>{errorMessage}</span>
          </div>
          <div className="flex items-center gap-2 shrink-0 self-end sm:self-center">
            {(!googleDriveService.hasToken() || errorMessage.includes('expirado') || errorMessage.includes('caducad') || errorMessage.includes('renovar') || errorMessage.includes('Renovar')) && (
              <button
                type="button"
                onClick={handleConnectDrive}
                className="px-3.5 py-1.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs flex items-center gap-1.5 shadow-md transition-transform active:scale-95 cursor-pointer"
              >
                <span className="material-symbols-outlined text-base">sync</span>
                <span>Renovar Conexión</span>
              </button>
            )}
            <button type="button" onClick={() => setErrorMessage(null)} className="text-amber-400 hover:text-white p-1 cursor-pointer" title="Cerrar">✕</button>
          </div>
        </div>
      )}

      {/* Equalizer Drawer */}
      {showEq && (
        <div className="bg-zinc-900/95 border-b border-zinc-800 p-4 sm:p-5 flex flex-col gap-3">
          <div className="flex items-center justify-between text-xs font-bold uppercase text-zinc-200 border-b border-zinc-800 pb-2">
            <span className="flex items-center gap-2 text-amber-400">
              <span className="material-symbols-outlined text-base">equalizer</span>
              Ecualizador Paramétrico (BiquadFilter Web Audio API)
            </span>
            <button
              type="button"
              onClick={() => { setEqLow(0); setEqMid(0); setEqHigh(0); driveAudioEngine.setEqualizer(0, 0, 0); }}
              className="text-[11px] text-emerald-400 hover:text-emerald-300 underline font-mono cursor-pointer"
            >
              Restablecer a 0 dB
            </button>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div className="flex flex-col gap-1.5 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Graves (100 Hz)</span>
                <span className="text-emerald-400 font-bold">{eqLow > 0 ? `+${eqLow}` : eqLow} dB</span>
              </div>
              <input
                type="range"
                min="-20"
                max="20"
                step="1"
                value={eqLow}
                onChange={e => handleEqChange('low', parseFloat(e.target.value))}
                className="accent-emerald-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1.5 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Medios (1 kHz)</span>
                <span className="text-emerald-400 font-bold">{eqMid > 0 ? `+${eqMid}` : eqMid} dB</span>
              </div>
              <input
                type="range"
                min="-20"
                max="20"
                step="1"
                value={eqMid}
                onChange={e => handleEqChange('mid', parseFloat(e.target.value))}
                className="accent-emerald-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
            <div className="flex flex-col gap-1.5 bg-zinc-950/60 p-3 rounded-xl border border-zinc-800/80">
              <div className="flex items-center justify-between text-xs font-mono text-zinc-400">
                <span>Agudos (8 kHz)</span>
                <span className="text-emerald-400 font-bold">{eqHigh > 0 ? `+${eqHigh}` : eqHigh} dB</span>
              </div>
              <input
                type="range"
                min="-20"
                max="20"
                step="1"
                value={eqHigh}
                onChange={e => handleEqChange('high', parseFloat(e.target.value))}
                className="accent-emerald-500 h-2 bg-zinc-800 rounded-lg cursor-pointer"
              />
            </div>
          </div>
        </div>
      )}

      {/* Switcher para móvil (pantallas verticales estrechas) */}
      {(isAuthenticated || displayedTracks.length > 0 || allRecursiveFiles.length > 0) && (
        <div className="md:hidden flex items-center border-b border-zinc-800 bg-zinc-900/90 p-2 gap-2 shrink-0">
          <button
            type="button"
            onClick={() => setMobileTab('collections')}
            className={`flex-1 h-12 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mobileTab === 'collections'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white bg-zinc-850'
            }`}
          >
            <span className="material-symbols-outlined text-base">folder_copy</span>
            <span>COLECCIONES ({subfolders.length + 1})</span>
          </button>
          <button
            type="button"
            onClick={() => setMobileTab('tracks')}
            className={`flex-1 h-12 rounded-xl text-xs font-black uppercase flex items-center justify-center gap-2 transition-all cursor-pointer ${
              mobileTab === 'tracks'
                ? 'bg-emerald-500 text-black shadow-md'
                : 'text-zinc-400 hover:text-white bg-zinc-850'
            }`}
          >
            <span className="material-symbols-outlined text-base">queue_music</span>
            <span className="truncate">PISTAS ({displayedTracks.length})</span>
          </button>
        </div>
      )}

      {/* Unauthenticated Welcome Banner si no hay canciones ni sesión */}
      {!isAuthenticated && displayedTracks.length === 0 && files.length === 0 && allRecursiveFiles.length === 0 && (
        <div className="p-8 sm:p-14 text-center flex flex-col items-center justify-center gap-6 w-full bg-zinc-950 py-16">
          <div className="w-20 h-20 rounded-3xl bg-zinc-900 border border-zinc-800 flex items-center justify-center text-emerald-400 shadow-[0_0_30px_rgba(16,185,129,0.15)]">
            <span className="material-symbols-outlined text-4xl">folder_open</span>
          </div>
          <div>
            <h2 className="text-xl sm:text-2xl font-black text-white uppercase tracking-tight">
              {t.drive.title}
            </h2>
            <p className="text-xs sm:text-sm text-zinc-400 max-w-lg mt-2 mx-auto leading-relaxed">
              Conecta tu Google Drive para reproducir la carpeta /mimusica con sincronización automática en cabina o vincula tu vehículo con código QR.
            </p>
          </div>
          <div className="flex flex-col sm:flex-row items-center justify-center gap-3 w-full max-w-md mt-2">
            <button
              type="button"
              onClick={handleConnectDrive}
              disabled={isConnectingDrive}
              className="w-full sm:w-auto h-13 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_16px_rgba(16,185,129,0.35)] cursor-pointer disabled:opacity-60"
            >
              <span className={`material-symbols-outlined text-lg ${isConnectingDrive ? 'animate-spin' : ''}`}>
                {isConnectingDrive ? 'sync' : 'key'}
              </span>
              <span>{isConnectingDrive ? 'SINCRONIZANDO...' : 'CONECTAR DRIVE'}</span>
            </button>

            {triggerCarPairing && (
              <button
                type="button"
                onClick={triggerCarPairing}
                className="w-full sm:w-auto h-13 px-6 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold text-xs sm:text-sm tracking-wider uppercase flex items-center justify-center gap-2 transition-transform active:scale-95 shadow-[0_0_16px_rgba(147,51,234,0.35)] cursor-pointer"
              >
                <span className="material-symbols-outlined text-lg">qr_code_scanner</span>
                <span>VINCULAR COCHE</span>
              </button>
            )}
          </div>
        </div>
      )}

      {/* 2. MASTER-DETAIL AUTOMOTRIZ (PANTALLA APAISADA / TESLA UI / CARPLAY) */}
      {(isAuthenticated || displayedTracks.length > 0 || allRecursiveFiles.length > 0 || files.length > 0) && (
        <div className="w-full flex-1 flex flex-col md:flex-row min-h-0 h-full overflow-hidden">
          {/* Master Column: COLECCIONES (Carpetas) */}
          <aside className={`${mobileTab === 'collections' ? 'flex' : 'hidden md:flex'} w-full md:w-80 lg:w-96 flex-col border-r border-zinc-800/80 bg-zinc-950/70 shrink-0 overflow-hidden`}>
            {/* Header de Colecciones */}
            <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 bg-zinc-900/40 flex flex-col gap-2 shrink-0">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className="material-symbols-outlined text-emerald-400 text-lg">folder_copy</span>
                  <span className="text-xs font-black uppercase tracking-wider text-zinc-200">
                    COLECCIONES
                  </span>
                </div>
                <span className="text-xs font-mono text-zinc-400 tabular-nums">
                  {subfolders.length + 1} carpetas
                </span>
              </div>

              {/* Filtro rápido de carpetas si hay más de 5 */}
              {subfolders.length > 5 && (
                <div className="relative mt-1">
                  <input
                    type="text"
                    value={folderSearchQuery}
                    onChange={e => setFolderSearchQuery(e.target.value)}
                    placeholder="Filtrar carpetas..."
                    className="w-full h-10 bg-zinc-900 border border-zinc-800 rounded-lg px-3 pl-8 text-xs text-zinc-200 placeholder-zinc-500 focus:outline-none focus:border-emerald-500"
                  />
                  <span className="material-symbols-outlined text-zinc-500 text-sm absolute left-2.5 top-1/2 -translate-y-1/2 pointer-events-none">
                    filter_list
                  </span>
                  {folderSearchQuery && (
                    <button
                      type="button"
                      onClick={() => setFolderSearchQuery('')}
                      className="absolute right-2.5 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-white text-xs font-mono cursor-pointer"
                    >
                      ✕
                    </button>
                  )}
                </div>
              )}
            </div>

            {/* Lista scrollable de colecciones con hitboxes ergonómicos >= 56px */}
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-800/40">
              {/* Opción 1: Todas las canciones */}
              <div
                onClick={() => {
                  setSelectedFolderId('all');
                  setMobileTab('tracks');
                }}
                className={`min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                  selectedFolderId === 'all'
                    ? 'bg-emerald-500/15 border-l-4 border-emerald-500 text-white font-bold'
                    : 'hover:bg-zinc-850/70 text-zinc-300 hover:text-white'
                }`}
              >
                <div className="flex items-center gap-3 min-w-0 flex-1">
                  <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                    selectedFolderId === 'all' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-850 text-zinc-400'
                  }`}>
                    <span className="material-symbols-outlined text-lg">queue_music</span>
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="font-bold text-xs sm:text-sm uppercase truncate">
                      {t.drive.allTracks}
                    </div>
                    <div className="text-[11px] font-mono text-zinc-400">
                      Biblioteca completa
                    </div>
                  </div>
                </div>
                <span className={`text-xs font-mono tabular-nums px-2 py-0.5 rounded ${
                  selectedFolderId === 'all' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-zinc-400'
                }`}>
                  {totalRecursiveFiles || allRecursiveFiles.length}
                </span>
              </div>

              {/* Opción 2: Raíz /mimusica si contiene archivos sueltos */}
              {files.length > 0 && (
                <div
                  onClick={() => {
                    setSelectedFolderId('root');
                    setMobileTab('tracks');
                  }}
                  className={`min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                    selectedFolderId === 'root'
                      ? 'bg-emerald-500/15 border-l-4 border-emerald-500 text-white font-bold'
                      : 'hover:bg-zinc-850/70 text-zinc-300 hover:text-white'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0 flex-1">
                    <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                      selectedFolderId === 'root' ? 'bg-emerald-500/20 text-emerald-400' : 'bg-zinc-850 text-zinc-400'
                    }`}>
                      <span className="material-symbols-outlined text-lg">folder_open</span>
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="font-bold text-xs sm:text-sm uppercase truncate">
                        {t.drive.root}
                      </div>
                      <div className="text-[11px] font-mono text-zinc-400">
                        Archivos sueltos
                      </div>
                    </div>
                  </div>
                  <span className={`text-xs font-mono tabular-nums px-2 py-0.5 rounded ${
                    selectedFolderId === 'root' ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-zinc-400'
                  }`}>
                    {files.length}
                  </span>
                </div>
              )}

              {/* Subcarpetas */}
              {filteredSubfolders.map(sub => {
                const isSelected = selectedFolderId === sub.id;
                const isPlaying = currentTrack?.album === sub.name && playbackStatus === 'playing';
                const count = folderTrackCounts[sub.name.trim().toLowerCase()] || 0;

                return (
                  <div
                    key={sub.id}
                    onClick={() => {
                      setSelectedFolderId(sub.id);
                      setMobileTab('tracks');
                    }}
                    className={`min-h-[56px] px-4 py-3 flex items-center justify-between gap-3 cursor-pointer transition-colors select-none ${
                      isSelected
                        ? 'bg-emerald-500/15 border-l-4 border-emerald-500 text-white font-bold'
                        : 'hover:bg-zinc-850/70 text-zinc-300 hover:text-white'
                    }`}
                  >
                    <div className="flex items-center gap-3 min-w-0 flex-1">
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 ${
                        isPlaying
                          ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.35)]'
                          : isSelected
                          ? 'bg-emerald-500/20 text-emerald-400'
                          : 'bg-zinc-850 text-purple-400'
                      }`}>
                        <span className={`material-symbols-outlined text-lg ${isPlaying ? 'animate-pulse' : ''}`}>
                          {isPlaying ? 'volume_up' : 'folder'}
                        </span>
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className={`font-bold text-xs sm:text-sm uppercase leading-snug break-words ${
                          isSelected ? 'text-emerald-300' : 'text-zinc-200'
                        }`} title={sub.name}>
                          {sub.name}
                        </div>
                        <div className="text-[11px] font-mono text-zinc-400">
                          {count > 0 ? `${count} canciones` : 'Carpeta'}
                        </div>
                      </div>
                    </div>
                    <span className={`text-xs font-mono tabular-nums px-2 py-0.5 rounded ${
                      isSelected ? 'bg-emerald-500/20 text-emerald-300 font-bold' : 'text-zinc-400'
                    }`}>
                      {count > 0 ? count : ''}
                    </span>
                  </div>
                );
              })}
            </div>
          </aside>

          {/* Detail Column: LISTA DE PISTAS (Área de Acción Rápida) */}
          <section className={`${mobileTab === 'tracks' ? 'flex' : 'hidden md:flex'} flex-1 min-w-0 flex-col bg-zinc-900/30 overflow-hidden`}>
            {/* Detail Action Header */}
            <div className="p-3.5 sm:p-4 border-b border-zinc-800/80 bg-zinc-900/60 flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 shrink-0">
              <div className="flex items-center gap-2.5 min-w-0">
                {/* Mobile Back Button */}
                <button
                  type="button"
                  onClick={() => setMobileTab('collections')}
                  className="md:hidden h-11 px-3 rounded-xl bg-zinc-800 text-zinc-200 hover:text-white flex items-center gap-1.5 text-xs font-bold shrink-0 cursor-pointer"
                  title="Volver a colecciones"
                >
                  <span className="material-symbols-outlined text-base">arrow_back</span>
                  <span>Carpetas</span>
                </button>

                <div className="min-w-0">
                  <h2 className="text-sm sm:text-base font-black uppercase text-white truncate flex items-center gap-2">
                    <span>{selectedFolderName}</span>
                  </h2>
                  <div className="text-xs font-mono text-zinc-400">
                    {displayedTracks.length} {displayedTracks.length === 1 ? 'canción' : 'canciones'}
                    {searchQuery && ' · filtradas'}
                  </div>
                </div>
              </div>

              {/* Botones de Acción de Conducción (Hitboxes ergonómicos >= 48px) */}
              <div className="flex items-center gap-2 shrink-0">
                <button
                  type="button"
                  onClick={() => handlePlayActiveFolder(false)}
                  className="h-11 sm:h-12 px-4 sm:px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-black font-black uppercase text-xs sm:text-sm tracking-wider flex items-center gap-2 transition-transform active:scale-95 shadow-md cursor-pointer"
                  title="Reproducir todas las canciones"
                >
                  <span className="material-symbols-outlined text-lg font-black">play_arrow</span>
                  <span>REPRODUCIR TODO</span>
                </button>

                <button
                  type="button"
                  onClick={() => handlePlayActiveFolder(true)}
                  className="h-11 sm:h-12 px-3.5 sm:px-4 rounded-xl bg-purple-600 hover:bg-purple-500 text-white font-bold uppercase text-xs sm:text-sm tracking-wider flex items-center gap-2 transition-transform active:scale-95 shadow-md cursor-pointer"
                  title="Reproducir en modo aleatorio"
                >
                  <span className="material-symbols-outlined text-lg">shuffle</span>
                  <span className="hidden sm:inline">ALEATORIO</span>
                </button>
              </div>
            </div>

            {/* Lista Scrollable de Canciones */}
            <div className="flex-1 overflow-y-auto min-h-0 divide-y divide-zinc-800/40">
              {displayedTracks.length > 0 ? (
                displayedTracks.map((file, idx) => {
                  const isCurrent = currentTrack?.id === file.id;
                  const isPlaying = isCurrent && playbackStatus === 'playing';

                  return (
                    <div
                      key={file.id}
                      ref={isCurrent ? activeTrackRef : null}
                      onClick={() => handleTrackRowClick(file, idx)}
                      className={`group flex items-center justify-between min-h-[58px] px-3.5 sm:px-4 py-2.5 cursor-pointer transition-colors select-none gap-3 ${
                        isCurrent
                          ? 'bg-emerald-500/15 border-l-4 border-emerald-500 text-white shadow-[inset_0_0_24px_rgba(16,185,129,0.08)]'
                          : 'hover:bg-zinc-850/80 text-zinc-200'
                      }`}
                    >
                      {/* Índice / Indicador de onda acústica / Estado de carga */}
                      <div className={`w-9 h-9 rounded-xl flex items-center justify-center shrink-0 font-mono text-xs font-bold transition-all ${
                        isPlaying
                          ? 'bg-emerald-500 text-black shadow-[0_0_12px_rgba(16,185,129,0.4)]'
                          : isCurrent && playbackStatus === 'buffering'
                          ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.4)]'
                          : isCurrent && playbackStatus === 'paused'
                          ? 'bg-amber-500/30 text-amber-300'
                          : 'bg-zinc-800/80 text-zinc-400 group-hover:text-zinc-200 group-hover:bg-zinc-800'
                      }`}>
                        {isPlaying ? (
                          <span className="material-symbols-outlined text-base animate-pulse">volume_up</span>
                        ) : isCurrent && playbackStatus === 'buffering' ? (
                          <span className="material-symbols-outlined text-base animate-spin">progress_activity</span>
                        ) : isCurrent && playbackStatus === 'paused' ? (
                          <span className="material-symbols-outlined text-base">pause</span>
                        ) : (
                          <span>{idx + 1}</span>
                        )}
                      </div>

                      {/* Información de la pista */}
                      <div className="flex-1 min-w-0">
                        <div className={`font-bold text-sm sm:text-base leading-snug truncate ${
                          isCurrent ? 'text-emerald-300 font-black' : 'text-zinc-100 group-hover:text-white'
                        }`}>
                          {file.name}
                        </div>
                        <div className="text-xs text-zinc-400 font-mono flex items-center gap-1.5 truncate mt-0.5">
                          <span className="truncate">{file.artist || 'Google Drive'}</span>
                          <span aria-hidden="true" className="text-zinc-600">·</span>
                          <span className="truncate">{file.album || 'Drive'}</span>
                          {file.size && (
                            <>
                              <span aria-hidden="true" className="text-zinc-600">·</span>
                              <span className="text-zinc-500 shrink-0">{Math.round(file.size / 1024 / 1024 * 10) / 10} MB</span>
                            </>
                          )}
                        </div>
                      </div>

                      {/* Derecha: Indicador pasivo Offline/Drive + Botón único de reproducción */}
                      <div className="flex items-center gap-3 shrink-0">
                        {file.isCached ? (
                          <span
                            className="flex items-center gap-1 text-[11px] font-mono text-emerald-400 px-2 py-0.5 rounded-md bg-emerald-500/10 border border-emerald-500/20"
                            title="Disponible sin conexión (Caché local)"
                          >
                            <span className="material-symbols-outlined text-sm">offline_pin</span>
                            <span className="hidden lg:inline font-bold">Offline</span>
                          </span>
                        ) : (
                          <span
                            className="flex items-center gap-1 text-[11px] font-mono text-zinc-400 px-2 py-0.5 rounded-md bg-zinc-800/40 border border-zinc-700/40"
                            title="Streaming desde Google Drive"
                          >
                            <span className="material-symbols-outlined text-sm">cloud</span>
                            <span className="hidden lg:inline">Drive</span>
                          </span>
                        )}

                        <button
                          type="button"
                          onClick={(e) => {
                            e.stopPropagation();
                            handleTrackRowClick(file, idx);
                          }}
                          title={isPlaying ? t.player.pause : isCurrent && playbackStatus === 'buffering' ? 'Cargando pista...' : t.player.play}
                          aria-label={isPlaying ? t.player.pause : isCurrent && playbackStatus === 'buffering' ? 'Cargando pista...' : t.player.play}
                          className={`w-11 h-11 rounded-xl flex items-center justify-center cursor-pointer shrink-0 transition-transform active:scale-95 shadow-md ${
                            isPlaying
                              ? 'bg-zinc-800 text-emerald-400 border border-emerald-500/50 hover:bg-zinc-700'
                              : isCurrent && playbackStatus === 'buffering'
                              ? 'bg-amber-500 text-black shadow-[0_0_12px_rgba(245,158,11,0.5)]'
                              : 'bg-emerald-500 hover:bg-emerald-400 text-black'
                          }`}
                        >
                          <span className={`material-symbols-outlined text-xl font-black ${isCurrent && playbackStatus === 'buffering' ? 'animate-spin' : ''}`}>
                            {isPlaying ? 'pause' : isCurrent && playbackStatus === 'buffering' ? 'progress_activity' : 'play_arrow'}
                          </span>
                        </button>
                      </div>
                    </div>
                  );
                })
              ) : isLoading ? (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400 font-mono text-sm">
                  <span className="material-symbols-outlined text-3xl text-emerald-400 animate-spin">sync</span>
                  <span>Sincronizando canciones con Google Drive...</span>
                </div>
              ) : (
                <div className="py-20 flex flex-col items-center justify-center gap-3 text-zinc-400 font-mono text-sm p-4 text-center">
                  <span className="material-symbols-outlined text-3xl text-amber-500">music_off</span>
                  <span>No se encontraron canciones en esta carpeta</span>
                  {searchQuery && (
                    <button
                      type="button"
                      onClick={() => setSearchQuery('')}
                      className="text-xs text-emerald-400 underline font-mono mt-1 cursor-pointer"
                    >
                      Limpiar filtro de búsqueda
                    </button>
                  )}
                </div>
              )}
            </div>
          </section>
        </div>
      )}

      {/* 3. DOCKED MINI NOW-PLAYING BAR */}
      {currentTrack && (
        <div className="h-16 sm:h-[72px] px-4 sm:px-6 border-t border-zinc-800 bg-zinc-950/95 backdrop-blur flex items-center justify-between gap-3 shrink-0">
          {/* Left: Información de la pista actual */}
          <div className="flex items-center gap-3 min-w-0 max-w-[220px] sm:max-w-xs md:max-w-sm">
            <div className="w-10 h-10 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shrink-0 text-emerald-400">
              <span className="material-symbols-outlined text-xl">album</span>
            </div>
            <div className="min-w-0">
              <div className="font-bold text-xs sm:text-sm text-white truncate leading-snug">
                {currentTrack.name}
              </div>
              <div className="text-[11px] font-mono text-zinc-400 truncate">
                {currentTrack.artist || 'Google Drive'} · {currentTrack.album || 'Drive'}
              </div>
            </div>
          </div>

          {/* Center: Barra de progreso y temporizador */}
          <div className="hidden sm:flex flex-1 max-w-md items-center gap-2.5 mx-2">
            <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0">
              {formatTime(currentTime)}
            </span>
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="w-full accent-emerald-500 h-1.5 bg-zinc-800 rounded-lg cursor-pointer"
              aria-label="Posición de audio"
            />
            <span className="text-xs font-mono text-zinc-400 tabular-nums shrink-0">
              {formatTime(duration)}
            </span>
          </div>

          {/* Right: Controles ergonómicos grandes (Fat-finger safe >= 48px) */}
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => driveAudioEngine.playPrev(true)}
              className="w-11 h-11 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 flex items-center justify-center transition-colors cursor-pointer"
              title="Canción anterior"
              aria-label="Canción anterior"
            >
              <span className="material-symbols-outlined text-xl">skip_previous</span>
            </button>

            <button
              type="button"
              onClick={handleTogglePlay}
              className={`w-12 h-12 sm:w-13 sm:h-13 rounded-2xl flex items-center justify-center transition-transform active:scale-95 cursor-pointer shadow-md ${
                playbackStatus === 'buffering'
                  ? 'bg-amber-500 text-black shadow-[0_0_16px_rgba(245,158,11,0.4)]'
                  : 'bg-emerald-500 hover:bg-emerald-400 text-black shadow-[0_0_16px_rgba(16,185,129,0.35)]'
              }`}
              title={playbackStatus === 'playing' ? 'Pausar' : playbackStatus === 'buffering' ? 'Cargando pista...' : 'Reproducir'}
              aria-label={playbackStatus === 'playing' ? 'Pausar' : playbackStatus === 'buffering' ? 'Cargando pista...' : 'Reproducir'}
            >
              <span className={`material-symbols-outlined text-2xl font-black ${playbackStatus === 'buffering' ? 'animate-spin' : ''}`}>
                {playbackStatus === 'playing' ? 'pause' : playbackStatus === 'buffering' ? 'progress_activity' : 'play_arrow'}
              </span>
            </button>

            <button
              type="button"
              onClick={() => driveAudioEngine.playNext(true)}
              className="w-11 h-11 rounded-xl bg-zinc-850 hover:bg-zinc-800 text-zinc-200 border border-zinc-700/80 flex items-center justify-center transition-colors cursor-pointer"
              title="Canción siguiente"
              aria-label="Canción siguiente"
            >
              <span className="material-symbols-outlined text-xl">skip_next</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
