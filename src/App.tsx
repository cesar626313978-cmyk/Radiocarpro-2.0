import { useState, useEffect, useRef, useMemo } from 'react';
import { RadioStation, TabType, PlaybackStatus } from './types/radio';
import { DriveAudioFile, DrivePlaybackStatus } from './types/drive';
import { INITIAL_STATIONS } from './services/stationsData';
import { TopAppBar } from './components/TopAppBar';
import { SideNav } from './components/SideNav';
import { BottomNavBar } from './components/BottomNavBar';
import { GlobalPlayerBar } from './components/GlobalPlayerBar';
import { DiscoverView } from './components/DiscoverView';
import { FavoritesView } from './components/FavoritesView';
import { DriveMusicView } from './components/DriveMusicView';
import { TuningModal } from './components/TuningModal';
import { SettingsModal } from './components/SettingsModal';
import { ShaderBackground } from './components/ShaderBackground';
import { RealisticSpaceCosmos } from './components/RealisticSpaceCosmos';
import { DynamicBackground } from './components/DynamicBackground';
import { ThemeSelectorModal } from './components/ThemeSelectorModal';
import { ThemeId, THEMES } from './types/theme';
import { ThemeService } from './services/themeService';
import { useTranslation } from './i18n/LanguageContext';
import { CarModeView } from './components/CarModeView';
import { TeslaPairingModal } from './components/TeslaPairingModal';
import { MobilePairingView } from './components/MobilePairingView';
import { audioEngine } from './services/audioEngine';
import { driveAudioEngine } from './services/driveAudioEngine';
import { googleDriveService } from './services/googleDriveService';
import { teslaPairingService } from './services/teslaPairingService';
import { teslaBackgroundService } from './services/teslaBackgroundService';
import { startTokenHeartbeat } from './services/googleDriveAuth';
import {
  auth,
  signInWithGoogle,
  handleRedirectAuth,
  logOutUser,
  onAuthStateChanged,
  saveUserPreferencesToFirestore,
  saveUserSettingsToFirestore,
  loadUserPreferencesFromFirestore,
  flushPendingPreferencesSave,
  subscribeToUserPreferences,
  User,
} from './services/firebase';

const INITIAL_FAVORITES: string[] = [];
const EMPTY_ALARMS: never[] = [];

// Per-user local storage key helpers
const getFavsStorageKey = (userId?: string | null) =>
  userId ? `radiostream_favs_${userId}` : 'radiostream_favs_guest';

const getFavObjsStorageKey = (userId?: string | null) =>
  userId ? `radiostream_fav_objects_${userId}` : 'radiostream_fav_objects_guest';

const getDeletedFavsStorageKey = (userId?: string | null) =>
  userId ? `radiostream_deleted_favs_${userId}` : 'radiostream_deleted_favs_guest';

export default function App() {
  const [stations, setStations] = useState<RadioStation[]>(INITIAL_STATIONS);
  const [currentStation, setCurrentStation] = useState<RadioStation>(INITIAL_STATIONS[0]);
  const currentStationRef = useRef<RadioStation>(INITIAL_STATIONS[0]);
  useEffect(() => {
    currentStationRef.current = currentStation;
  }, [currentStation]);

  const [failedStationIds, setFailedStationIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem('radiostream_failed_stations');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed)) return parsed;
      }
    } catch {}
    return [];
  });

  const [stationPlaytimes, setStationPlaytimes] = useState<Record<string, number>>(() => {
    try {
      const saved = localStorage.getItem('radiostream_station_playtimes');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {}
    return {};
  });

  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [playbackStatus, setPlaybackStatus] = useState<PlaybackStatus>('idle');
  const [playbackError, setPlaybackError] = useState<string>('');
  const [volume, setVolume] = useState<number>(0.8);
  const [currentTab, setCurrentTab] = useState<TabType>('descubrir');
  const previousTabRef = useRef<TabType>('descubrir');

  const handleSelectTab = (tab: TabType) => {
    if (currentTab !== 'coche') {
      previousTabRef.current = currentTab;
    }
    setCurrentTab(tab);
  };

  const [activeSource, setActiveSource] = useState<'radio' | 'drive'>('radio');
  const [currentDriveTrack, setCurrentDriveTrack] = useState<DriveAudioFile | null>(null);
  const [drivePlaybackStatus, setDrivePlaybackStatus] = useState<DrivePlaybackStatus>('idle');
  const [isSettingsOpen, setIsSettingsOpen] = useState<boolean>(false);
  const [isTeslaPairingModalOpen, setIsTeslaPairingModalOpen] = useState<boolean>(false);
  const [mobilePairCode, setMobilePairCode] = useState<string | null>(null);
  const { lang, setLang, toggleLang } = useTranslation();

  // Dynamic Biomes & Visual Thematization state
  const [activeTheme, setActiveTheme] = useState<ThemeId>(ThemeService.getInitialTheme);
  const [isThemeModalOpen, setIsThemeModalOpen] = useState<boolean>(false);

  useEffect(() => {
    ThemeService.applyTheme(activeTheme);
  }, [activeTheme]);

  const handleSelectTheme = (newTheme: ThemeId) => {
    setActiveTheme(newTheme);
    ThemeService.applyTheme(newTheme);
    const currentUserId = user?.uid;
    if (currentUserId) {
      saveUserSettingsToFirestore(currentUserId, {
        ...userSettings,
        theme: newTheme,
      }).catch(() => {});
    }
  };

  // Synchronized user app settings (Buffer size, Crossfade, Language, etc.)
  const [userSettings, setUserSettings] = useState(() => {
    let buf = '128KB';
    let cf = 0;
    let fade = 5;
    let synth = true;
    let lowData = false;
    let norm = true;
    try {
      const sBuf = localStorage.getItem('radiostream_buffer_size');
      if (sBuf && ['64KB', '128KB', '256KB', '512KB'].includes(sBuf)) buf = sBuf;
      const sCf = localStorage.getItem('myradiopro_drive_crossfade');
      if (sCf) cf = parseInt(sCf, 10);
      const sFade = localStorage.getItem('radiostream_fade_mins');
      if (sFade) fade = parseInt(sFade, 10);
      synth = localStorage.getItem('myradiopro_synth_fallback') !== 'false';
      lowData = localStorage.getItem('myradiopro_low_data') === 'true';
      norm = localStorage.getItem('myradiopro_dynamic_normalizer') !== 'false';
    } catch {}
    return {
      bufferSize: buf,
      driveCrossfade: cf,
      fadeOutMins: fade,
      synthFallback: synth,
      lowDataMode: lowData,
      dynamicNormalizer: norm,
    };
  });

  const applyRemoteSettings = (remoteSettings: any) => {
    if (!remoteSettings || typeof remoteSettings !== 'object') return;
    try {
      if (remoteSettings.bufferSize && ['64KB', '128KB', '256KB', '512KB'].includes(remoteSettings.bufferSize)) {
        audioEngine.setBufferSize(remoteSettings.bufferSize);
        driveAudioEngine.setBufferSize(remoteSettings.bufferSize);
        localStorage.setItem('radiostream_buffer_size', remoteSettings.bufferSize);
      }
      if (typeof remoteSettings.driveCrossfade === 'number') {
        driveAudioEngine.setCrossfadeSeconds(remoteSettings.driveCrossfade);
        localStorage.setItem('myradiopro_drive_crossfade', String(remoteSettings.driveCrossfade));
      }
      if (typeof remoteSettings.fadeOutMins === 'number') {
        localStorage.setItem('radiostream_fade_mins', String(remoteSettings.fadeOutMins));
      }
      if (typeof remoteSettings.synthFallback === 'boolean') {
        localStorage.setItem('myradiopro_synth_fallback', String(remoteSettings.synthFallback));
      }
      if (typeof remoteSettings.lowDataMode === 'boolean') {
        localStorage.setItem('myradiopro_low_data', String(remoteSettings.lowDataMode));
      }
      if (typeof remoteSettings.dynamicNormalizer === 'boolean') {
        driveAudioEngine.setVolumeNormalization(remoteSettings.dynamicNormalizer);
        localStorage.setItem('myradiopro_dynamic_normalizer', String(remoteSettings.dynamicNormalizer));
      }
      if (remoteSettings.lang === 'ES' || remoteSettings.lang === 'EN') {
        setLang(remoteSettings.lang);
        localStorage.setItem('radiostream_lang', remoteSettings.lang);
      }
      if (remoteSettings.theme && THEMES[remoteSettings.theme as ThemeId]) {
        setActiveTheme(remoteSettings.theme as ThemeId);
        ThemeService.applyTheme(remoteSettings.theme as ThemeId);
      }
      setUserSettings(prev => ({
        ...prev,
        ...remoteSettings,
      }));
    } catch (e) {
      console.warn('[Settings] Error aplicando ajustes remotos:', e);
    }
  };

  // Tuning simulation state
  const [isTuning, setIsTuning] = useState<boolean>(false);
  const [tuningStation, setTuningStation] = useState<RadioStation | null>(null);
  const tuningTimeoutRef = useRef<number | null>(null);

  // User Auth state (Firebase user or paired Tesla user)
  const initialPairedUser = (() => {
    try {
      const saved = localStorage.getItem('radiostream_paired_user');
      if (saved) return JSON.parse(saved);
    } catch {}
    return null;
  })();

  const [user, setUser] = useState<User | any | null>(initialPairedUser);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);

  // Google Drive connection status & subscription
  const [isDriveConnected, setIsDriveConnected] = useState<boolean>(() => googleDriveService.hasToken());

  useEffect(() => {
    const unsub = googleDriveService.onTokenChange(hasTok => {
      setIsDriveConnected(hasTok);
      if (hasTok && !user) {
        googleDriveService.fetchUserInfo().then(info => {
          if (info && (info.email || info.displayName)) {
            const recoveredUser = {
              uid: `paired-${info.email || Date.now()}`,
              email: info.email || '',
              displayName: info.displayName || info.email?.split('@')[0] || 'Usuario Coche',
              photoURL: info.photoURL || '',
            };
            try {
              localStorage.setItem('radiostream_paired_user', JSON.stringify(recoveredUser));
            } catch {}
            setUser(recoveredUser);
            loadUserAccountPreferences(recoveredUser);
          }
        });
      }
    });
    return unsub;
  }, [user]);

  const pendingFavoriteStationRef = useRef<RadioStation | null>(null);

  // PWA Install prompt state
  const [deferredPrompt, setDeferredPrompt] = useState<any>(null);
  const [isInstallable, setIsInstallable] = useState<boolean>(false);

  useEffect(() => {
    const handleBeforeInstall = (e: Event) => {
      e.preventDefault();
      setDeferredPrompt(e);
      setIsInstallable(true);
    };

    window.addEventListener('beforeinstallprompt', handleBeforeInstall);

    if (window.matchMedia('(display-mode: standalone)').matches) {
      setIsInstallable(false);
    }

    return () => {
      window.removeEventListener('beforeinstallprompt', handleBeforeInstall);
    };
  }, []);

  const handleInstallPWA = async () => {
    if (!deferredPrompt) return;
    deferredPrompt.prompt();
    const { outcome } = await deferredPrompt.userChoice;
    if (outcome === 'accepted') {
      setIsInstallable(false);
    }
    setDeferredPrompt(null);
  };

  // Favorites IDs state
  const [favorites, setFavorites] = useState<string[]>(() => {
    try {
      const userKey = getFavsStorageKey(initialPairedUser?.uid);
      const delKey = getDeletedFavsStorageKey(initialPairedUser?.uid);
      let deleted: string[] = [];
      try {
        const rawDel = localStorage.getItem(delKey);
        if (rawDel) deleted = JSON.parse(rawDel);
      } catch {}

      const savedUserFavs = localStorage.getItem(userKey);
      if (savedUserFavs !== null) {
        const parsed = JSON.parse(savedUserFavs);
        if (Array.isArray(parsed)) return parsed.filter(id => !deleted.includes(id));
      }
      const fallbackFavs = localStorage.getItem('radiostream_favs');
      if (fallbackFavs) {
        const parsed = JSON.parse(fallbackFavs);
        if (Array.isArray(parsed)) return parsed.filter(id => !deleted.includes(id));
      }
      return [];
    } catch {
      return [];
    }
  });

  // Cached full station objects for favorites
  const [favoriteStationsMap, setFavoriteStationsMap] = useState<Record<string, RadioStation>>(() => {
    try {
      const userObjsKey = getFavObjsStorageKey(initialPairedUser?.uid);
      const delKey = getDeletedFavsStorageKey(initialPairedUser?.uid);
      let deleted: string[] = [];
      try {
        const rawDel = localStorage.getItem(delKey);
        if (rawDel) deleted = JSON.parse(rawDel);
      } catch {}

      const savedUserObjs = localStorage.getItem(userObjsKey) || localStorage.getItem('radiostream_fav_objects');
      if (savedUserObjs) {
        const parsedObjs = JSON.parse(savedUserObjs);
        if (parsedObjs && typeof parsedObjs === 'object') {
          const filtered: Record<string, RadioStation> = {};
          Object.keys(parsedObjs).forEach(id => {
            if (!deleted.includes(id)) {
              filtered[id] = parsedObjs[id];
            }
          });
          return filtered;
        }
      }
    } catch {
      // ignore
    }
    return {};
  });

  // Increment listening time for current station when playing
  useEffect(() => {
    if (!isPlaying || activeSource !== 'radio' || !currentStation?.id) return;

    const interval = setInterval(() => {
      setStationPlaytimes(prev => {
        if (!currentStation?.id) return prev;
        const currentId = currentStation.id;
        const currentVal = prev[currentId] || 0;
        const next = {
          ...prev,
          [currentId]: currentVal + 1,
        };
        try {
          localStorage.setItem('radiostream_station_playtimes', JSON.stringify(next));
        } catch {}
        return next;
      });
    }, 1000);

    return () => clearInterval(interval);
  }, [isPlaying, activeSource, currentStation?.id]);

  // Periodic sync of playtimes to Firestore (every 20 seconds, or on pause)
  useEffect(() => {
    const currentUserId = user?.uid;
    if (!currentUserId || isInitialUserLoadRef.current || isIncomingUpdateRef.current) return;

    const syncToCloud = () => {
      const favObjects = Object.values(favoriteStationsMap) as RadioStation[];
      if (auth.currentUser && auth.currentUser.uid === currentUserId) {
        saveUserPreferencesToFirestore(currentUserId, {
          favorites,
          favoriteStationObjects: favObjects,
          alarms: EMPTY_ALARMS,
          settings: userSettings,
          stationPlaytimes,
        }).catch(() => {});
      }
    };

    if (!isPlaying) {
      syncToCloud();
    } else {
      const timer = setTimeout(syncToCloud, 20000);
      return () => clearTimeout(timer);
    }
  }, [isPlaying, stationPlaytimes, user?.uid, favorites, favoriteStationsMap, userSettings]);

  const nextStationRef = useRef<() => void>(() => {});
  const prevStationRef = useRef<() => void>(() => {});

  // Initialize Tesla background audio persistence and steering wheel navigation
  useEffect(() => {
    teslaBackgroundService.init();
    startTokenHeartbeat();
    audioEngine.setStationNavigationHandlers(
      () => nextStationRef.current(),
      () => prevStationRef.current()
    );
  }, []);

  // Listen to Audio Engine status changes
  useEffect(() => {
    const unsubscribe = audioEngine.onStatusChange((status, errorMsg) => {
      setPlaybackStatus(status);
      if (status === 'playing') {
        setIsPlaying(true);
        setPlaybackError('');
        if (currentStationRef.current?.id) {
          const sid = currentStationRef.current.id;
          setFailedStationIds(prev => {
            if (!prev.includes(sid)) return prev;
            const next = prev.filter(id => id !== sid);
            try {
              localStorage.setItem('radiostream_failed_stations', JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      } else if (status === 'error') {
        setIsPlaying(false);
        setPlaybackError(errorMsg || 'Emisora no disponible');
        if (currentStationRef.current?.id) {
          const sid = currentStationRef.current.id;
          setFailedStationIds(prev => {
            if (prev.includes(sid)) return prev;
            const next = [...prev, sid];
            try {
              localStorage.setItem('radiostream_failed_stations', JSON.stringify(next));
            } catch {}
            return next;
          });
        }
      } else if (status === 'idle') {
        setIsPlaying(false);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to Drive audio engine changes
  useEffect(() => {
    const unsubTrack = driveAudioEngine.onTrackChange(track => setCurrentDriveTrack(track));
    const unsubStatus = driveAudioEngine.onStatusChange(status => {
      setDrivePlaybackStatus(status);
      if (status === 'playing') {
        setIsPlaying(true);
        setActiveSource('drive');
      } else if (status === 'paused' || status === 'idle') {
        if (activeSource === 'drive') {
          setIsPlaying(false);
        }
      }
    });
    return () => {
      unsubTrack();
      unsubStatus();
    };
  }, [activeSource]);

  // Protection refs to prevent race conditions & unwanted clobbering of remote Firestore data
  const isInitialUserLoadRef = useRef<boolean>(false);
  const isIncomingUpdateRef = useRef<boolean>(false);
  const currentLoadedUserIdRef = useRef<string | null>(null);

  /**
   * Loads user preferences from cache & Firestore cleanly, without resurrecting deleted favorites
   */
  const loadUserAccountPreferences = async (
    targetUser: { uid: string; email?: string | null; displayName?: string | null; photoURL?: string | null }
  ) => {
    if (!targetUser || !targetUser.uid) return;
    const userId = targetUser.uid;

    if (currentLoadedUserIdRef.current === userId && !isInitialUserLoadRef.current) {
      return;
    }

    currentLoadedUserIdRef.current = userId;
    isInitialUserLoadRef.current = true;
    setIsSyncing(true);

    try {
      const userFavsKey = getFavsStorageKey(userId);
      const userObjsKey = getFavObjsStorageKey(userId);
      const userDelKey = getDeletedFavsStorageKey(userId);

      // Load local deleted tombstones
      let localDeletedFavs: string[] = [];
      try {
        const rawDel = localStorage.getItem(userDelKey);
        if (rawDel) {
          const parsed = JSON.parse(rawDel);
          if (Array.isArray(parsed)) localDeletedFavs = parsed;
        }
      } catch {}

      // 1. Instant local cache retrieval for this specific user
      const cachedFavsRaw = localStorage.getItem(userFavsKey) !== null
        ? localStorage.getItem(userFavsKey)
        : localStorage.getItem('radiostream_favs');

      const cachedObjsRaw = localStorage.getItem(userObjsKey) !== null
        ? localStorage.getItem(userObjsKey)
        : localStorage.getItem('radiostream_fav_objects');

      let localFavs: string[] = [];
      if (cachedFavsRaw) {
        try {
          const parsed = JSON.parse(cachedFavsRaw);
          if (Array.isArray(parsed)) localFavs = parsed;
        } catch {}
      }
      if (localDeletedFavs.length > 0) {
        localFavs = localFavs.filter(id => !localDeletedFavs.includes(id));
      }

      let localObjs: Record<string, RadioStation> = {};
      if (cachedObjsRaw) {
        try {
          const parsedObjs = JSON.parse(cachedObjsRaw);
          if (parsedObjs && typeof parsedObjs === 'object') {
            Object.keys(parsedObjs).forEach(id => {
              if (!localDeletedFavs.includes(id)) {
                localObjs[id] = parsedObjs[id];
              }
            });
          }
        } catch {}
      }

      setFavorites(localFavs);
      setFavoriteStationsMap(localObjs);

      // 2. Fetch ground-truth preferences from Firestore or paired Tesla session
      let remoteData: any = null;
      let pairedData: any = null;
      const syncKey = targetUser.email || userId;

      if (auth.currentUser && auth.currentUser.uid === userId) {
        try {
          remoteData = await loadUserPreferencesFromFirestore(userId);
        } catch (e) {
          console.warn('[Firestore] Error leyendo /users:', e);
        }
      }

      try {
        pairedData = await teslaPairingService.getPairedPreferences(syncKey);
      } catch (e) {
        console.warn('[TeslaPairingService] Error leyendo preferencias emparejadas:', e);
      }

      // Determine authoritative source based on updatedAt timestamps
      let authoritativeSource: any = null;
      if (remoteData && pairedData) {
        const remoteTime = remoteData.updatedAt ? new Date(remoteData.updatedAt).getTime() : 0;
        const pairedTime = pairedData.updatedAt ? new Date(pairedData.updatedAt).getTime() : 0;
        authoritativeSource = pairedTime > remoteTime ? pairedData : remoteData;
      } else {
        authoritativeSource = remoteData || pairedData;
      }

      // Combine deleted tombstones from all sources
      const allDeleted = Array.from(new Set([
        ...localDeletedFavs,
        ...(Array.isArray(authoritativeSource?.deletedFavorites) ? authoritativeSource.deletedFavorites : []),
        ...(Array.isArray(remoteData?.deletedFavorites) ? remoteData.deletedFavorites : []),
        ...(Array.isArray(pairedData?.deletedFavorites) ? pairedData.deletedFavorites : []),
      ]));

      try {
        localStorage.setItem(userDelKey, JSON.stringify(allDeleted));
      } catch {}

      // Merge local and remote station play times
      let mergedPlaytimes = { ...stationPlaytimes };
      if (authoritativeSource?.stationPlaytimes) {
        mergedPlaytimes = { ...mergedPlaytimes, ...authoritativeSource.stationPlaytimes };
        setStationPlaytimes(mergedPlaytimes);
        try {
          localStorage.setItem('radiostream_station_playtimes', JSON.stringify(mergedPlaytimes));
        } catch {}
      }

      // Apply synchronized remote settings across devices
      if (authoritativeSource?.settings) {
        applyRemoteSettings(authoritativeSource.settings);
      }

      // Sync cloud drive token if present
      if (authoritativeSource?.driveToken) {
        const expiresInMs = authoritativeSource.driveTokenExpiresAt ? Math.max(60000, authoritativeSource.driveTokenExpiresAt - Date.now()) : 3600000;
        googleDriveService.setAccessToken(authoritativeSource.driveToken, expiresInMs);
      }

      // Ground truth favorites:
      let finalFavorites: string[];
      let finalObjsMap: Record<string, RadioStation> = {};

      if (authoritativeSource && Array.isArray(authoritativeSource.favorites)) {
        // Authoritative cloud source exists: CLOUD IS GROUND TRUTH!
        // Prune any stations that were explicitly deleted
        finalFavorites = (authoritativeSource.favorites as string[]).filter(id => !allDeleted.includes(id));

        if (Array.isArray(authoritativeSource.favoriteStationObjects)) {
          authoritativeSource.favoriteStationObjects.forEach((st: RadioStation) => {
            if (st && st.id && finalFavorites.includes(st.id)) {
              finalObjsMap[st.id] = st;
            }
          });
        }
      } else {
        // Brand new account with no cloud records yet: seed with local favorites (excluding deleted)
        finalFavorites = localFavs.filter(id => !allDeleted.includes(id));
        finalObjsMap = { ...localObjs };
      }

      // If user clicked favorite on a station right before login prompt, include it
      if (pendingFavoriteStationRef.current) {
        const pendingStation = pendingFavoriteStationRef.current;
        pendingFavoriteStationRef.current = null;
        if (!finalFavorites.includes(pendingStation.id)) {
          finalFavorites.push(pendingStation.id);
        }
        finalObjsMap[pendingStation.id] = pendingStation;
        const prunedDel = allDeleted.filter(id => id !== pendingStation.id);
        try {
          localStorage.setItem(userDelKey, JSON.stringify(prunedDel));
        } catch {}
      }

      // Resolve any missing station objects from catalog
      finalFavorites.forEach(id => {
        if (!finalObjsMap[id]) {
          const found = stations.find(s => s.id === id) || INITIAL_STATIONS.find(s => s.id === id) || localObjs[id];
          if (found) finalObjsMap[id] = found;
        }
      });

      console.log(`[Firestore] Sincronización de favoritas para ${targetUser.email || userId}: Final(${finalFavorites.length}), Eliminadas(${allDeleted.length})`);
      isIncomingUpdateRef.current = true;
      setFavorites(finalFavorites);
      setFavoriteStationsMap(finalObjsMap);

      try {
        localStorage.setItem(userFavsKey, JSON.stringify(finalFavorites));
        localStorage.setItem(userObjsKey, JSON.stringify(finalObjsMap));
        localStorage.setItem('radiostream_favs', JSON.stringify(finalFavorites));
        localStorage.setItem('radiostream_fav_objects', JSON.stringify(finalObjsMap));
      } catch {}

      // Save ground truth state back to Firestore if logged in with Firebase Auth
      if (auth.currentUser && auth.currentUser.uid === userId) {
        const favObjectsArray: RadioStation[] = Object.values(finalObjsMap);
        await saveUserPreferencesToFirestore(
          userId,
          {
            favorites: finalFavorites,
            favoriteStationObjects: favObjectsArray,
            deletedFavorites: allDeleted,
            alarms: authoritativeSource?.alarms || EMPTY_ALARMS,
            stationPlaytimes: mergedPlaytimes,
          },
          true
        );
      }

      // Keep paired document updated in background
      teslaPairingService.savePairedPreferences(syncKey, {
        favorites: finalFavorites,
        favoriteStationObjects: Object.values(finalObjsMap),
        deletedFavorites: allDeleted,
        settings: authoritativeSource?.settings || userSettings,
        stationPlaytimes: mergedPlaytimes,
      }).catch(() => {});

      setTimeout(() => {
        isIncomingUpdateRef.current = false;
      }, 400);
    } catch (err) {
      console.warn('[Firestore] Error al cargar preferencias del usuario:', err);
    } finally {
      setIsSyncing(false);
      setTimeout(() => {
        isInitialUserLoadRef.current = false;
      }, 400);
    }
  };

  // Listen to Firebase Auth state & Redirect Result + Auto-recover paired Tesla session
  useEffect(() => {
    handleRedirectAuth().then(redirectUser => {
      if (redirectUser) {
        setUser(redirectUser);
        try {
          localStorage.setItem(
            'radiostream_paired_user',
            JSON.stringify({
              uid: redirectUser.uid,
              email: redirectUser.email || '',
              displayName: redirectUser.displayName || '',
              photoURL: redirectUser.photoURL || '',
            })
          );
        } catch {}
        loadUserAccountPreferences(redirectUser);
      }
    });

    const unsubscribeAuth = onAuthStateChanged(auth, currentUser => {
      if (currentUser) {
        setUser(currentUser);
        try {
          localStorage.setItem(
            'radiostream_paired_user',
            JSON.stringify({
              uid: currentUser.uid,
              email: currentUser.email || '',
              displayName: currentUser.displayName || '',
              photoURL: currentUser.photoURL || '',
            })
          );
        } catch {}
        loadUserAccountPreferences(currentUser);
      } else {
        currentLoadedUserIdRef.current = null;
        // If no direct Firebase Auth session on this browser, check saved paired Tesla session
        const saved = localStorage.getItem('radiostream_paired_user');
        if (saved) {
          try {
            const parsed = JSON.parse(saved);
            setUser(parsed);
            if (parsed && parsed.uid) {
              loadUserAccountPreferences(parsed);
            }
            return;
          } catch {}
        }

        // If an active Google Drive token exists (e.g. connected via QR pairing), recover user info
        if (googleDriveService.hasToken()) {
          googleDriveService.fetchUserInfo().then(info => {
            if (info && (info.email || info.displayName)) {
              const recoveredUser = {
                uid: `paired-${info.email || Date.now()}`,
                email: info.email || '',
                displayName: info.displayName || info.email?.split('@')[0] || 'Usuario Coche',
                photoURL: info.photoURL || '',
                isPairedViaTesla: true,
              };
              try {
                localStorage.setItem('radiostream_paired_user', JSON.stringify(recoveredUser));
              } catch {}
              setUser(recoveredUser);
              loadUserAccountPreferences(recoveredUser);
            }
          });
        }
      }
    });
    return () => unsubscribeAuth();
  }, []);

  // Check for mobile pairing query param (?pair=XXXX)
  useEffect(() => {
    if (typeof window !== 'undefined') {
      const urlParams = new URLSearchParams(window.location.search);
      const pair = urlParams.get('pair');
      if (pair) {
        setMobilePairCode(pair.toUpperCase());
      }
    }
  }, []);

  // Listen to Firestore & Paired Tesla preferences in real-time
  useEffect(() => {
    if (!user || !user.uid) return;

    const currentUserId = user.uid;
    const syncKey = user.email || currentUserId;

    const handleIncomingData = (data: any) => {
      if (isInitialUserLoadRef.current) return;
      setIsSyncing(false);
      if (data && data.settings) {
        applyRemoteSettings(data.settings);
      }
      if (data && data.driveToken) {
        const expiresInMs = data.driveTokenExpiresAt ? Math.max(60000, data.driveTokenExpiresAt - Date.now()) : 3600000;
        googleDriveService.setAccessToken(data.driveToken, expiresInMs);
      }
      if (data && data.stationPlaytimes) {
        setStationPlaytimes(prev => {
          const merged = { ...prev, ...data.stationPlaytimes };
          try {
            localStorage.setItem('radiostream_station_playtimes', JSON.stringify(merged));
          } catch {}
          return merged;
        });
      }
      if (data && Array.isArray(data.favorites)) {
        isIncomingUpdateRef.current = true;
        const deletedList = Array.isArray(data.deletedFavorites) ? data.deletedFavorites : [];
        const incomingFavs = data.favorites.filter((id: string) => !deletedList.includes(id));
        setFavorites(incomingFavs);

        const nextObjs: Record<string, RadioStation> = {};
        if (Array.isArray(data.favoriteStationObjects)) {
          data.favoriteStationObjects.forEach((st: RadioStation) => {
            if (st && st.id && incomingFavs.includes(st.id)) {
              nextObjs[st.id] = st;
            }
          });
        }
        incomingFavs.forEach((id: string) => {
          if (!nextObjs[id]) {
            const found = stations.find(s => s.id === id) || INITIAL_STATIONS.find(s => s.id === id);
            if (found) nextObjs[id] = found;
          }
        });
        setFavoriteStationsMap(nextObjs);

        try {
          localStorage.setItem(getFavsStorageKey(currentUserId), JSON.stringify(incomingFavs));
          localStorage.setItem(getFavObjsStorageKey(currentUserId), JSON.stringify(nextObjs));
          localStorage.setItem('radiostream_favs', JSON.stringify(incomingFavs));
          localStorage.setItem('radiostream_fav_objects', JSON.stringify(nextObjs));
          if (deletedList.length > 0) {
            localStorage.setItem(getDeletedFavsStorageKey(currentUserId), JSON.stringify(deletedList));
          }
        } catch {}

        setTimeout(() => {
          isIncomingUpdateRef.current = false;
        }, 300);
      }
    };

    let unsubDirect = () => {};
    if (auth.currentUser && auth.currentUser.uid === currentUserId) {
      unsubDirect = subscribeToUserPreferences(currentUserId, handleIncomingData);
    }

    const unsubPaired = teslaPairingService.subscribeToPairedPreferences(syncKey, handleIncomingData);

    return () => {
      unsubDirect();
      unsubPaired();
    };
  }, [user?.uid]);

  // Persist favorites to local storage & Firestore / Tesla paired sync
  useEffect(() => {
    const currentUserId = user?.uid;
    const favsKey = getFavsStorageKey(currentUserId);
    const objsKey = getFavObjsStorageKey(currentUserId);

    try {
      localStorage.setItem(favsKey, JSON.stringify(favorites));
      localStorage.setItem(objsKey, JSON.stringify(favoriteStationsMap));
      localStorage.setItem('radiostream_favs', JSON.stringify(favorites));
      localStorage.setItem('radiostream_fav_objects', JSON.stringify(favoriteStationsMap));
    } catch {
      // ignore
    }

    // Do NOT write to Firestore if we are loading user preferences or applying a remote snapshot
    if (isInitialUserLoadRef.current || isIncomingUpdateRef.current) {
      return;
    }

    if (user && currentUserId) {
      const syncKey = user.email || currentUserId;
      const favObjects: RadioStation[] = Object.values(favoriteStationsMap);

      let currentDeleted: string[] = [];
      try {
        const raw = localStorage.getItem(getDeletedFavsStorageKey(currentUserId));
        if (raw) currentDeleted = JSON.parse(raw);
      } catch {}

      if (auth.currentUser && auth.currentUser.uid === currentUserId) {
        saveUserPreferencesToFirestore(currentUserId, {
          favorites,
          favoriteStationObjects: favObjects,
          deletedFavorites: currentDeleted,
          alarms: EMPTY_ALARMS,
          settings: userSettings,
          stationPlaytimes,
        }).catch(err => console.warn('Firestore sync direct notice:', err));
      }

      teslaPairingService
        .savePairedPreferences(syncKey, {
          favorites,
          favoriteStationObjects: favObjects,
          deletedFavorites: currentDeleted,
          settings: userSettings,
          stationPlaytimes,
        } as any)
        .catch(err => console.warn('Tesla paired sync notice:', err));
    }
  }, [favorites, favoriteStationsMap, user?.uid]);

  // Audio volume sync
  useEffect(() => {
    audioEngine.setVolume(volume);
  }, [volume]);

  // Google Sign In / Sign Out Handlers
  const handleLoginWithGoogle = async () => {
    const isTesla = typeof navigator !== 'undefined' && (
      navigator.userAgent.includes('Tesla') ||
      navigator.userAgent.includes('QtCarBrowser') ||
      (navigator.userAgent.includes('Linux') && typeof window !== 'undefined' && window.innerWidth >= 1100 && !navigator.userAgent.includes('Android'))
    );

    if (isTesla) {
      setIsTeslaPairingModalOpen(true);
      return;
    }

    try {
      const loggedUser = await signInWithGoogle();
      if (loggedUser) {
        setUser(loggedUser);
        await loadUserAccountPreferences(loggedUser);
      }
    } catch (err: any) {
      console.warn('Login error, opening pairing modal fallback:', err);
      setIsTeslaPairingModalOpen(true);
    }
  };

  const handleLogout = async () => {
    setIsSyncing(true);
    try {
      if (user && auth.currentUser) {
        await flushPendingPreferencesSave(user.uid);
      }
      await logOutUser();
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      localStorage.removeItem('radiostream_drive_folder_id');
      localStorage.removeItem('radiostream_paired_user');
      googleDriveService.clearAccessToken();
      setUser(null);
      currentLoadedUserIdRef.current = null;

      // Cleanly clear favorites when disconnected from Drive
      try {
        localStorage.removeItem('radiostream_favs_guest');
        localStorage.removeItem('radiostream_fav_objects_guest');
        localStorage.removeItem('radiostream_deleted_favs_guest');
        localStorage.removeItem('radiostream_favs');
        localStorage.removeItem('radiostream_fav_objects');
      } catch {}

      setFavorites([]);
      setFavoriteStationsMap({});
      setIsSyncing(false);
    }
  };

  /**
   * Restores curated top favorite stations if the user's list was lost or is empty
   */
  const handleRestoreDefaultFavorites = () => {
    const topIds = ['cadena-ser', 'heart-80s', 'pure-ibiza-radio'];
    const candidates = INITIAL_STATIONS.slice(0, 10);
    const chosenIds = Array.from(new Set([...topIds, ...candidates.map(s => s.id)])).slice(0, 8);
    const chosenMap: Record<string, RadioStation> = {};
    chosenIds.forEach(id => {
      const st = stations.find(s => s.id === id) || INITIAL_STATIONS.find(s => s.id === id);
      if (st) chosenMap[st.id] = st;
    });

    setFavorites(chosenIds);
    setFavoriteStationsMap(chosenMap);

    const currentUserId = user?.uid;
    try {
      localStorage.setItem(getFavsStorageKey(currentUserId), JSON.stringify(chosenIds));
      localStorage.setItem(getFavObjsStorageKey(currentUserId), JSON.stringify(chosenMap));
      localStorage.setItem('radiostream_favs', JSON.stringify(chosenIds));
      localStorage.setItem('radiostream_fav_objects', JSON.stringify(chosenMap));
      localStorage.removeItem(getDeletedFavsStorageKey(currentUserId));
    } catch {}

    if (user && currentUserId) {
      const syncKey = user.email || currentUserId;
      if (auth.currentUser && auth.currentUser.uid === currentUserId) {
        saveUserPreferencesToFirestore(currentUserId, {
          favorites: chosenIds,
          favoriteStationObjects: Object.values(chosenMap),
          deletedFavorites: [],
          alarms: EMPTY_ALARMS,
          settings: userSettings,
          stationPlaytimes,
        }).catch(() => {});
      }
      teslaPairingService.savePairedPreferences(syncKey, {
        favorites: chosenIds,
        favoriteStationObjects: Object.values(chosenMap),
        deletedFavorites: [],
        settings: userSettings,
        stationPlaytimes,
      }).catch(() => {});
    }
  };

  // Tune to station
  const handleTuneToStation = (station: RadioStation, showTuningOverlay = true) => {
    if (tuningTimeoutRef.current) {
      clearTimeout(tuningTimeoutRef.current);
    }

    setStations(prev => {
      if (!prev.some(s => s.id === station.id)) {
        return [station, ...prev];
      }
      return prev;
    });

    if (favorites.includes(station.id)) {
      setFavoriteStationsMap(prev => ({
        ...prev,
        [station.id]: station,
      }));
    }

    setPlaybackError('');
    setCurrentStation(station);

    if (showTuningOverlay) {
      setTuningStation(station);
      setIsTuning(true);
      tuningTimeoutRef.current = window.setTimeout(() => {
        setIsTuning(false);
        setTuningStation(null);
      }, 700);
    }

    driveAudioEngine.stopAndDisconnect();
    setActiveSource('radio');
    audioEngine.updateMediaMetadata(station);
    audioEngine.playStream(station.streamUrl);
  };

  const handleCancelTuning = () => {
    if (tuningTimeoutRef.current) {
      clearTimeout(tuningTimeoutRef.current);
    }
    setIsTuning(false);
    setTuningStation(null);
    audioEngine.stop();
  };

  const handleTogglePlay = () => {
    if (activeSource === 'drive') {
      if (!googleDriveService.hasToken()) {
        setIsPlaying(false);
        handleSelectTab('drive');
        return;
      }
      // Stop the opposite engine to ensure complete coexistence
      audioEngine.cleanupAudio();

      if (drivePlaybackStatus === 'playing') {
        driveAudioEngine.pause();
        setIsPlaying(false);
      } else if (drivePlaybackStatus === 'paused') {
        driveAudioEngine.resume();
        setIsPlaying(true);
      } else {
        // If idle/stopped, play currentTrack or the track at currentIndex, or the first track of the playlist
        const currentEngineTrack = driveAudioEngine.getCurrentTrack();
        const playlist = driveAudioEngine.getPlaylist();
        const curIdx = driveAudioEngine.getCurrentIndex();
        const trackToPlay = currentDriveTrack || currentEngineTrack || (curIdx >= 0 && playlist[curIdx]) || playlist[0];
        if (trackToPlay) {
          const token = googleDriveService.getToken();
          driveAudioEngine.playTrack(trackToPlay, token || undefined);
          setIsPlaying(true);
        }
      }
      return;
    }

    // activeSource === 'radio'
    // Stop the opposite engine to ensure complete coexistence
    driveAudioEngine.stopAndDisconnect();

    if (isPlaying) {
      audioEngine.stop();
      setIsPlaying(false);
    } else {
      if (currentStation) {
        handleTuneToStation(currentStation, false);
      }
    }
  };

  const handlePrevStation = () => {
    let list = favoriteStationObjects.length > 0 ? favoriteStationObjects : stations;
    if (list.length === 0) return;
    list = [...list].sort((a, b) => {
      const aIsFailed = failedStationIds.includes(a.id) ? 1 : 0;
      const bIsFailed = failedStationIds.includes(b.id) ? 1 : 0;
      if (aIsFailed !== bIsFailed) {
        return aIsFailed - bIsFailed;
      }
      const aTime = stationPlaytimes[a.id] || 0;
      const bTime = stationPlaytimes[b.id] || 0;
      return bTime - aTime;
    });
    const currentIndex = list.findIndex(s => s.id === currentStation.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    handleTuneToStation(list[prevIndex]);
  };

  const handleNextStation = () => {
    let list = favoriteStationObjects.length > 0 ? favoriteStationObjects : stations;
    if (list.length === 0) return;
    list = [...list].sort((a, b) => {
      const aIsFailed = failedStationIds.includes(a.id) ? 1 : 0;
      const bIsFailed = failedStationIds.includes(b.id) ? 1 : 0;
      if (aIsFailed !== bIsFailed) {
        return aIsFailed - bIsFailed;
      }
      const aTime = stationPlaytimes[a.id] || 0;
      const bTime = stationPlaytimes[b.id] || 0;
      return bTime - aTime;
    });
    const currentIndex = list.findIndex(s => s.id === currentStation.id);
    const nextIndex = currentIndex !== -1 && currentIndex < list.length - 1 ? currentIndex + 1 : 0;
    handleTuneToStation(list[nextIndex]);
  };

  nextStationRef.current = handleNextStation;
  prevStationRef.current = handlePrevStation;

  // Favorite toggle handler supporting both ID and full station object
  const handleToggleFavorite = (
    stationOrId: string | RadioStation,
    explicitStation?: RadioStation
  ) => {
    const stationId = typeof stationOrId === 'string' ? stationOrId : stationOrId.id;
    const stationObj =
      explicitStation ||
      (typeof stationOrId === 'object' ? stationOrId : null) ||
      favoriteStationsMap[stationId] ||
      stations.find(s => s.id === stationId) ||
      INITIAL_STATIONS.find(s => s.id === stationId);

    // If not authenticated with Firebase or Google Drive, prompt Google login
    if (!user && !auth.currentUser && !googleDriveService.hasToken()) {
      if (stationObj) {
        pendingFavoriteStationRef.current = stationObj;
      }
      handleLoginWithGoogle();
      return;
    }

    const currentUserId = user?.uid;
    const userDelKey = getDeletedFavsStorageKey(currentUserId);

    let currentDeleted: string[] = [];
    try {
      const raw = localStorage.getItem(userDelKey);
      if (raw) currentDeleted = JSON.parse(raw);
    } catch {}

    setFavorites(prev => {
      const isFav = prev.includes(stationId);
      const nextFavorites = isFav
        ? prev.filter(id => id !== stationId)
        : [...prev, stationId];

      let nextDeleted: string[];
      if (isFav) {
        // Removing favorite: add to tombstones so it cannot be resurrected
        nextDeleted = Array.from(new Set([...currentDeleted, stationId]));
      } else {
        // Adding favorite: remove from tombstones
        nextDeleted = currentDeleted.filter(id => id !== stationId);
      }

      try {
        localStorage.setItem(userDelKey, JSON.stringify(nextDeleted));
      } catch {}

      setFavoriteStationsMap(prevMap => {
        const nextMap = { ...prevMap };
        if (isFav) {
          delete nextMap[stationId];
        } else if (stationObj) {
          nextMap[stationId] = stationObj;
        }

        const favObjsList: RadioStation[] = Object.values(nextMap) as RadioStation[];

        // Save immediately to user-specific localStorage cache and global cache
        try {
          localStorage.setItem(getFavsStorageKey(currentUserId), JSON.stringify(nextFavorites));
          localStorage.setItem(getFavObjsStorageKey(currentUserId), JSON.stringify(nextMap));
          localStorage.setItem('radiostream_favs', JSON.stringify(nextFavorites));
          localStorage.setItem('radiostream_fav_objects', JSON.stringify(nextMap));
        } catch {
          // ignore
        }

        // Save immediately to Firestore if user is authenticated with Firebase
        if (currentUserId && auth.currentUser && auth.currentUser.uid === currentUserId) {
          saveUserPreferencesToFirestore(
            currentUserId,
            {
              favorites: nextFavorites,
              favoriteStationObjects: favObjsList,
              deletedFavorites: nextDeleted,
              alarms: EMPTY_ALARMS,
              settings: userSettings,
              stationPlaytimes,
            },
            true // Immediate write to prevent loss on fast logout
          ).catch(err => console.warn('[Firestore] Error guardando favoritas:', err));
        }

        // Also sync Tesla pairing if session is active
        if (user) {
          const syncKey = user.email || currentUserId;
          teslaPairingService.savePairedPreferences(syncKey, {
            favorites: nextFavorites,
            favoriteStationObjects: favObjsList,
            deletedFavorites: nextDeleted,
            settings: userSettings,
            stationPlaytimes,
          }).catch(() => {});
        }

        return nextMap;
      });

      return nextFavorites;
    });
  };

  const favoriteStationObjects = useMemo(() => {
    const list = favorites
      .map(id => {
        return (
          favoriteStationsMap[id] ||
          stations.find(s => s.id === id) ||
          INITIAL_STATIONS.find(s => s.id === id)
        );
      })
      .filter((s): s is RadioStation => Boolean(s));

    return [...list].sort((a, b) => {
      const aIsFailed = failedStationIds.includes(a.id) ? 1 : 0;
      const bIsFailed = failedStationIds.includes(b.id) ? 1 : 0;
      if (aIsFailed !== bIsFailed) {
        return aIsFailed - bIsFailed;
      }
      const aTime = stationPlaytimes[a.id] || 0;
      const bTime = stationPlaytimes[b.id] || 0;
      return bTime - aTime; // De más escuchadas a menos (descendente)
    });
  }, [favorites, favoriteStationsMap, stations, failedStationIds, stationPlaytimes]);

  // Synchronize favorites array IDs with valid station objects so counts never desync
  useEffect(() => {
    const validIds = favoriteStationObjects.map(s => s.id);
    if (favorites.length !== validIds.length || favorites.some((id, i) => id !== validIds[i])) {
      setFavorites(validIds);
      const currentUserId = user?.uid;
      try {
        localStorage.setItem(getFavsStorageKey(currentUserId), JSON.stringify(validIds));
        localStorage.setItem('radiostream_favs', JSON.stringify(validIds));
      } catch {}
    }
  }, [favoriteStationObjects, favorites, user?.uid]);

  if (mobilePairCode) {
    return (
      <MobilePairingView
        pairCode={mobilePairCode}
        onDone={() => {
          setMobilePairCode(null);
          window.history.replaceState(null, '', window.location.pathname);
        }}
      />
    );
  }

  return (
    <div className="min-h-screen bg-[#131313] text-[#e5e2e1] flex flex-col font-['Inter'] relative selection:bg-[#8B5CF6] selection:text-white">
      {/* Dynamic Interactive Biome Canvas (Space, Ocean, Lunar, Canyon, Savanna, Jungle) */}
      <DynamicBackground activeTheme={activeTheme} />
      {/* Realistic Space Cosmos with space stations, comets, rockets when in space theme */}
      {activeTheme === 'space' && (
        <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-50">
          <RealisticSpaceCosmos />
        </div>
      )}

      {/* Top App Bar with Google Login / Logout & Live API Badge */}
      <TopAppBar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        lang={lang}
        onToggleLang={toggleLang}
        user={user}
        onLoginWithGoogle={handleLoginWithGoogle}
        onLogout={handleLogout}
        onOpenTeslaPairing={() => setIsTeslaPairingModalOpen(true)}
        isSyncing={isSyncing}
      />

      {/* Main Layout Container */}
      <div className="flex flex-1 relative z-10 min-w-0 overflow-x-hidden">
        {/* Layout spacer for fixed SideNav consistency */}
        <div className="hidden md:block w-56 xl:w-64 shrink-0" />

        {/* Desktop Side Navigation */}
        <SideNav
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          favoritesCount={favoriteStationObjects.length}
          onOpenThemes={() => setIsThemeModalOpen(true)}
          onOpenSettings={() => setIsSettingsOpen(true)}
          activeThemeName={THEMES[activeTheme]?.name}
        />

        {/* Main Content Area - Views stay persistent in DOM to prevent reload/waiting */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 w-full max-w-[1920px] mx-auto pb-36 md:pb-28 min-w-0 overflow-x-hidden">
          <div className={currentTab === 'descubrir' ? 'block w-full min-w-0' : 'hidden'}>
            <DiscoverView
              currentStation={currentStation}
              isPlaying={isPlaying && activeSource === 'radio'}
              playbackStatus={activeSource === 'radio' ? playbackStatus : 'idle'}
              errorMessage={playbackError}
              onSelectStation={st => handleTuneToStation(st)}
              onTogglePlay={handleTogglePlay}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              initialStations={stations}
              onInstallPWA={handleInstallPWA}
              isInstallable={isInstallable}
              failedStationIds={failedStationIds}
              stationPlaytimes={stationPlaytimes}
            />
          </div>

          <div className={currentTab === 'favoritas' ? 'block w-full min-w-0' : 'hidden'}>
            <FavoritesView
              favoriteStations={favoriteStationObjects}
              currentStation={currentStation}
              isPlaying={isPlaying && activeSource === 'radio'}
              playbackStatus={activeSource === 'radio' ? playbackStatus : 'idle'}
              errorMessage={playbackError}
              onSelectStation={st => handleTuneToStation(st)}
              onTogglePlay={handleTogglePlay}
              onToggleFavorite={handleToggleFavorite}
              onNavigateToDiscover={() => handleSelectTab('descubrir')}
              user={user}
              onLoginWithGoogle={handleLoginWithGoogle}
              onRestoreDefaultFavorites={handleRestoreDefaultFavorites}
            />
          </div>

          <div className={currentTab === 'drive' ? 'block w-full min-w-0' : 'hidden'}>
            <DriveMusicView
              isVisible={currentTab === 'drive'}
              onSwitchToRadio={() => handleSelectTab('descubrir')}
              activeSource={activeSource}
              onActivateDriveSource={() => {
                audioEngine.cleanupAudio();
                setIsPlaying(false);
                setActiveSource('drive');
              }}
              user={user}
              onOpenTeslaPairing={() => setIsTeslaPairingModalOpen(true)}
              onDisconnect={handleLogout}
            />
          </div>
        </main>
      </div>

      {currentTab === 'coche' && (
        <CarModeView
          activeSource={activeSource}
          currentStation={currentStation}
          currentDriveTrack={currentDriveTrack}
          isPlaying={isPlaying}
          playbackStatus={activeSource === 'drive' ? drivePlaybackStatus : playbackStatus}
          errorMessage={playbackError}
          onTogglePlay={handleTogglePlay}
          onNext={() => {
            if (activeSource === 'drive') {
              driveAudioEngine.playNext(true);
            } else {
              handleNextStation();
            }
          }}
          onPrev={() => {
            if (activeSource === 'drive') {
              driveAudioEngine.playPrev(true);
            } else {
              handlePrevStation();
            }
          }}
          onExitCarMode={() => setCurrentTab(previousTabRef.current || 'descubrir')}
          volume={volume}
          onVolumeChange={val => {
            setVolume(val);
            audioEngine.setVolume(val);
            driveAudioEngine.setVolume(val);
          }}
          onConnectDrive={() => {
            handleSelectTab('drive');
          }}
          drivePlaylist={driveAudioEngine.getPlaylist()}
          onSelectDriveTrack={(track, index) => {
            audioEngine.cleanupAudio();
            setIsPlaying(false);
            setActiveSource('drive');
            const token = googleDriveService.getToken();
            const playlist = driveAudioEngine.getPlaylist();
            if (playlist && playlist.length > 0) {
              driveAudioEngine.setPlaylist(playlist, index);
            }
            driveAudioEngine.playTrack(track, token || undefined);
          }}
          activeTheme={activeTheme}
          onOpenThemes={() => setIsThemeModalOpen(true)}
          favoriteStations={favoriteStationObjects}
          onSelectStation={handleTuneToStation}
          onRestoreDefaultFavorites={handleRestoreDefaultFavorites}
        />
      )}

      {/* Global Fixed Player Bar */}
      <GlobalPlayerBar
        activeSource={activeSource}
        currentStation={currentStation}
        currentDriveTrack={currentDriveTrack}
        isPlaying={isPlaying}
        playbackStatus={playbackStatus}
        drivePlaybackStatus={drivePlaybackStatus}
        errorMessage={playbackError}
        onTogglePlay={handleTogglePlay}
        onPrevStation={handlePrevStation}
        onNextStation={handleNextStation}
        onDrivePrev={() => driveAudioEngine.playPrev(true)}
        onDriveNext={() => driveAudioEngine.playNext(true)}
        volume={volume}
        onVolumeChange={val => {
          setVolume(val);
          audioEngine.setVolume(val);
          driveAudioEngine.setVolume(val);
        }}
        isFavorite={favoriteStationObjects.some(s => s.id === currentStation.id)}
        onToggleFavorite={handleToggleFavorite}
      />

      {/* Mobile Bottom Navigation Bar */}
      <BottomNavBar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
      />

      {/* Tuning Modal */}
      <TuningModal
        isOpen={isTuning}
        station={tuningStation}
        onCancel={handleCancelTuning}
      />

      {/* Tesla Mobile QR Pairing Modal */}
      <TeslaPairingModal
        isOpen={isTeslaPairingModalOpen}
        onClose={() => setIsTeslaPairingModalOpen(false)}
        onSuccess={(pairedUserData, syncedFavs, syncedObjs, syncedDeleted) => {
          if (pairedUserData) {
            setUser(pairedUserData);
          }
          const delList = Array.isArray(syncedDeleted) ? syncedDeleted : [];
          const effectiveFavs = Array.isArray(syncedFavs)
            ? syncedFavs.filter(id => !delList.includes(id))
            : [];
          setFavorites(effectiveFavs);

          const nextMap: Record<string, RadioStation> = {};
          if (Array.isArray(syncedObjs)) {
            syncedObjs.forEach((st: RadioStation) => {
              if (st && st.id && effectiveFavs.includes(st.id)) {
                nextMap[st.id] = st;
              }
            });
          }
          effectiveFavs.forEach(id => {
            if (!nextMap[id]) {
              const found = stations.find(s => s.id === id) || INITIAL_STATIONS.find(s => s.id === id);
              if (found) nextMap[id] = found;
            }
          });
          setFavoriteStationsMap(nextMap);

          const uid = pairedUserData?.uid;
          try {
            localStorage.setItem(getFavsStorageKey(uid), JSON.stringify(effectiveFavs));
            localStorage.setItem(getFavObjsStorageKey(uid), JSON.stringify(nextMap));
            localStorage.setItem('radiostream_favs', JSON.stringify(effectiveFavs));
            localStorage.setItem('radiostream_fav_objects', JSON.stringify(nextMap));
            if (delList.length > 0) {
              localStorage.setItem(getDeletedFavsStorageKey(uid), JSON.stringify(delList));
            }
          } catch {}

          handleSelectTab('drive');
        }}
        userEmail={user?.email || undefined}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        lang={lang}
        onToggleLang={toggleLang}
        favoritesCount={favoriteStationObjects.length}
        alarmsCount={0}
        onOpenThemes={() => setIsThemeModalOpen(true)}
        activeThemeName={THEMES[activeTheme]?.name}
        currentSettings={userSettings}
        onSaveSettings={async newSettings => {
          const settingsWithTheme = {
            ...newSettings,
            theme: activeTheme,
          };
          setUserSettings(settingsWithTheme);
          const currentUserId = user?.uid;
          if (currentUserId) {
            try {
              await saveUserSettingsToFirestore(currentUserId, settingsWithTheme);
              await saveUserPreferencesToFirestore(
                currentUserId,
                {
                  favorites,
                  favoriteStationObjects: Object.values(favoriteStationsMap),
                  alarms: EMPTY_ALARMS,
                  settings: settingsWithTheme,
                },
                true
              );
            } catch (err) {
              console.warn('[Firestore] Error guardando ajustes en la nube:', err);
            }
            const syncKey = user.email || currentUserId;
            teslaPairingService.savePairedPreferences(syncKey, {
              favorites,
              favoriteStationObjects: Object.values(favoriteStationsMap),
              settings: settingsWithTheme,
            }).catch(() => {});
          }
        }}
      />

      {/* Dynamic Theme & Biome Selector Modal */}
      <ThemeSelectorModal
        isOpen={isThemeModalOpen}
        activeTheme={activeTheme}
        onSelectTheme={handleSelectTheme}
        onClose={() => setIsThemeModalOpen(false)}
      />
    </div>
  );
}
