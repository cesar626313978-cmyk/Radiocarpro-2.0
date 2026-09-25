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
import { CarModeView } from './components/CarModeView';
import { TeslaPairingModal } from './components/TeslaPairingModal';
import { MobilePairingView } from './components/MobilePairingView';
import { audioEngine } from './services/audioEngine';
import { driveAudioEngine } from './services/driveAudioEngine';
import { googleDriveService } from './services/googleDriveService';
import { teslaPairingService } from './services/teslaPairingService';
import { teslaBackgroundService } from './services/teslaBackgroundService';
import {
  auth,
  signInWithGoogle,
  handleRedirectAuth,
  logOutUser,
  onAuthStateChanged,
  saveUserPreferencesToFirestore,
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

export default function App() {
  const [stations, setStations] = useState<RadioStation[]>(INITIAL_STATIONS);
  const [currentStation, setCurrentStation] = useState<RadioStation>(INITIAL_STATIONS[0]);
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
  const [lang, setLang] = useState<'ES' | 'EN'>('ES');

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
    });
    return unsub;
  }, []);

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
      const savedUserFavs = localStorage.getItem(userKey) || localStorage.getItem('radiostream_favs');
      if (savedUserFavs) {
        const parsed = JSON.parse(savedUserFavs);
        if (Array.isArray(parsed)) return parsed;
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
      const savedUserObjs = localStorage.getItem(userObjsKey) || localStorage.getItem('radiostream_fav_objects');
      if (savedUserObjs) {
        const parsed = JSON.parse(savedUserObjs);
        if (parsed && typeof parsed === 'object') return parsed;
      }
    } catch {
      // ignore
    }
    return {};
  });

  const nextStationRef = useRef<() => void>(() => {});
  const prevStationRef = useRef<() => void>(() => {});

  // Initialize Tesla background audio persistence and steering wheel navigation
  useEffect(() => {
    teslaBackgroundService.init();
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
      } else if (status === 'error') {
        setIsPlaying(false);
        setPlaybackError(errorMsg || 'Emisora no disponible');
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
   * Loads user preferences from cache & Firestore cleanly, without overwriting cloud data
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

      // 1. Instant local cache retrieval for this specific user
      const cachedFavsRaw = localStorage.getItem(userFavsKey);
      const cachedObjsRaw = localStorage.getItem(userObjsKey);

      let localFavs: string[] = [];
      if (cachedFavsRaw) {
        try {
          const parsed = JSON.parse(cachedFavsRaw);
          if (Array.isArray(parsed)) localFavs = parsed;
        } catch {}
      }
      let localObjs: Record<string, RadioStation> = {};
      if (cachedObjsRaw) {
        try {
          const parsedObjs = JSON.parse(cachedObjsRaw);
          if (parsedObjs && typeof parsedObjs === 'object') localObjs = parsedObjs;
        } catch {}
      }

      if (localFavs.length > 0) {
        setFavorites(localFavs);
      }
      if (Object.keys(localObjs).length > 0) {
        setFavoriteStationsMap(localObjs);
      }

      // 2. Fetch ground-truth preferences from Firestore database
      const remoteData = await loadUserPreferencesFromFirestore(userId);
      const remoteFavs = (remoteData && Array.isArray(remoteData.favorites)) ? remoteData.favorites : [];

      // Merge local and remote favorites (Union) so no favorites are ever lost across devices
      const mergedFavorites = Array.from(new Set([...localFavs, ...remoteFavs]));

      let remoteObjsMap: Record<string, RadioStation> = {};
      if (remoteData && Array.isArray(remoteData.favoriteStationObjects)) {
        remoteData.favoriteStationObjects.forEach((st: RadioStation) => {
          if (st && st.id) remoteObjsMap[st.id] = st;
        });
      }
      remoteFavs.forEach((id: string) => {
        if (!remoteObjsMap[id]) {
          const found = stations.find(s => s.id === id) || INITIAL_STATIONS.find(s => s.id === id);
          if (found) remoteObjsMap[id] = found;
        }
      });

      const mergedObjsMap = { ...localObjs, ...remoteObjsMap };
      mergedFavorites.forEach((id: string) => {
        if (!mergedObjsMap[id]) {
          const found = stations.find(s => s.id === id) || INITIAL_STATIONS.find(s => s.id === id);
          if (found) mergedObjsMap[id] = found;
        }
      });

      console.log(`[Firestore] Sincronización de favoritas para ${targetUser.email || userId}: Local(${localFavs.length}), Remotas(${remoteFavs.length}), Unidas(${mergedFavorites.length})`);
      isIncomingUpdateRef.current = true;
      setFavorites(mergedFavorites);
      setFavoriteStationsMap(mergedObjsMap);

      try {
        localStorage.setItem(userFavsKey, JSON.stringify(mergedFavorites));
        localStorage.setItem(userObjsKey, JSON.stringify(mergedObjsMap));
        localStorage.setItem('radiostream_favs', JSON.stringify(mergedFavorites));
        localStorage.setItem('radiostream_fav_objects', JSON.stringify(mergedObjsMap));
      } catch {}

      if (pendingFavoriteStationRef.current) {
        const pendingStation = pendingFavoriteStationRef.current;
        pendingFavoriteStationRef.current = null;
        if (!mergedFavorites.includes(pendingStation.id)) {
          mergedFavorites.push(pendingStation.id);
        }
        mergedObjsMap[pendingStation.id] = pendingStation;
        setFavorites([...mergedFavorites]);
        setFavoriteStationsMap({ ...mergedObjsMap });
      }

      // Save merged state back to Firestore to ensure complete sync across devices
      const favObjectsArray: RadioStation[] = Object.values(mergedObjsMap);
      await saveUserPreferencesToFirestore(
        userId,
        {
          favorites: mergedFavorites,
          favoriteStationObjects: favObjectsArray,
          alarms: remoteData?.alarms || EMPTY_ALARMS,
        },
        true
      );

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
      if (data && Array.isArray(data.favorites)) {
        isIncomingUpdateRef.current = true;
        setFavorites(data.favorites);

        if (Array.isArray(data.favoriteStationObjects) && data.favoriteStationObjects.length > 0) {
          setFavoriteStationsMap(prev => {
            const next = { ...prev };
            data.favoriteStationObjects.forEach((st: RadioStation) => {
              if (st && st.id) next[st.id] = st;
            });
            try {
              localStorage.setItem(getFavObjsStorageKey(currentUserId), JSON.stringify(next));
              localStorage.setItem('radiostream_fav_objects', JSON.stringify(next));
            } catch {}
            return next;
          });
        }

        try {
          localStorage.setItem(getFavsStorageKey(currentUserId), JSON.stringify(data.favorites));
          localStorage.setItem('radiostream_favs', JSON.stringify(data.favorites));
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

      if (auth.currentUser && auth.currentUser.uid === currentUserId) {
        saveUserPreferencesToFirestore(currentUserId, {
          favorites,
          favoriteStationObjects: favObjects,
          alarms: EMPTY_ALARMS,
        }).catch(err => console.warn('Firestore sync direct notice:', err));
      }

      teslaPairingService
        .savePairedPreferences(syncKey, {
          favorites,
          favoriteStationObjects: favObjects,
        })
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
        localStorage.removeItem('radiostream_favs');
        localStorage.removeItem('radiostream_fav_objects');
      } catch {}

      setFavorites([]);
      setFavoriteStationsMap({});
      setIsSyncing(false);
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

    driveAudioEngine.stop();
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
      if (drivePlaybackStatus === 'playing') {
        driveAudioEngine.pause();
        setIsPlaying(false);
      } else if (currentDriveTrack) {
        const token = googleDriveService.getToken();
        if (token) driveAudioEngine.playTrack(currentDriveTrack, token);
      }
      return;
    }

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
    const list = favoriteStationObjects.length > 0 ? favoriteStationObjects : stations;
    if (list.length === 0) return;
    const currentIndex = list.findIndex(s => s.id === currentStation.id);
    const prevIndex = currentIndex > 0 ? currentIndex - 1 : list.length - 1;
    handleTuneToStation(list[prevIndex]);
  };

  const handleNextStation = () => {
    const list = favoriteStationObjects.length > 0 ? favoriteStationObjects : stations;
    if (list.length === 0) return;
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

    setFavorites(prev => {
      const isFav = prev.includes(stationId);
      const nextFavorites = isFav
        ? prev.filter(id => id !== stationId)
        : [...prev, stationId];

      setFavoriteStationsMap(prevMap => {
        const nextMap = { ...prevMap };
        if (isFav) {
          delete nextMap[stationId];
        } else if (stationObj) {
          nextMap[stationId] = stationObj;
        }

        const currentUserId = user?.uid;
        const favObjsList: RadioStation[] = Object.values(nextMap) as RadioStation[];

        // Save immediately to user-specific localStorage cache
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
              alarms: EMPTY_ALARMS,
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
          }).catch(() => {});
        }

        return nextMap;
      });

      return nextFavorites;
    });
  };

  const favoriteStationObjects = useMemo(() => {
    return favorites
      .map(id => {
        return (
          favoriteStationsMap[id] ||
          stations.find(s => s.id === id) ||
          INITIAL_STATIONS.find(s => s.id === id)
        );
      })
      .filter((s): s is RadioStation => Boolean(s));
  }, [favorites, favoriteStationsMap, stations]);

  // Synchronize favorites array IDs with valid station objects so counts never desync
  useEffect(() => {
    const validIds = favoriteStationObjects.map(s => s.id);
    if (validIds.length > 0 && (favorites.length !== validIds.length || favorites.some((id, i) => id !== validIds[i]))) {
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
      {/* Clean Subtle Background */}
      <ShaderBackground />
      {/* Realistic Space Cosmos (comets, moons, planets, rockets, space stations, UFOs) */}
      <div className="fixed inset-0 pointer-events-none z-0 overflow-hidden opacity-55">
        <RealisticSpaceCosmos />
      </div>

      {/* Top App Bar with Google Login / Logout & Live API Badge */}
      <TopAppBar
        currentTab={currentTab}
        onSelectTab={handleSelectTab}
        onOpenSettings={() => setIsSettingsOpen(true)}
        lang={lang}
        onToggleLang={() => setLang(l => (l === 'ES' ? 'EN' : 'ES'))}
        user={user}
        onLoginWithGoogle={handleLoginWithGoogle}
        onLogout={handleLogout}
        onOpenTeslaPairing={() => setIsTeslaPairingModalOpen(true)}
        isSyncing={isSyncing}
      />

      {/* Main Layout Container */}
      <div className="flex flex-1 relative z-10">
        {/* Desktop Side Navigation */}
        <SideNav
          currentTab={currentTab}
          onSelectTab={handleSelectTab}
          favoritesCount={favoriteStationObjects.length}
        />

        {/* Main Content Area - Views stay persistent in DOM to prevent reload/waiting */}
        <main className="flex-1 p-3 sm:p-4 lg:p-6 w-full max-w-[1920px] mx-auto pb-36 md:pb-28">
          <div className={currentTab === 'descubrir' ? 'block' : 'hidden'}>
            <DiscoverView
              currentStation={currentStation}
              isPlaying={isPlaying}
              playbackStatus={playbackStatus}
              errorMessage={playbackError}
              onSelectStation={st => handleTuneToStation(st)}
              onTogglePlay={handleTogglePlay}
              favorites={favorites}
              onToggleFavorite={handleToggleFavorite}
              initialStations={stations}
              onInstallPWA={handleInstallPWA}
              isInstallable={isInstallable}
            />
          </div>

          <div className={currentTab === 'favoritas' ? 'block' : 'hidden'}>
            <FavoritesView
              favoriteStations={favoriteStationObjects}
              currentStation={currentStation}
              isPlaying={isPlaying}
              playbackStatus={playbackStatus}
              errorMessage={playbackError}
              onSelectStation={st => handleTuneToStation(st)}
              onTogglePlay={handleTogglePlay}
              onToggleFavorite={handleToggleFavorite}
              onNavigateToDiscover={() => handleSelectTab('descubrir')}
              user={user}
              onLoginWithGoogle={handleLoginWithGoogle}
            />
          </div>

          <div className={currentTab === 'drive' ? 'block' : 'hidden'}>
            <DriveMusicView
              onSwitchToRadio={() => handleSelectTab('descubrir')}
              activeSource={activeSource}
              onActivateDriveSource={() => {
                audioEngine.stop();
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
          onTogglePlay={() => {
            if (activeSource === 'drive') {
              if (drivePlaybackStatus === 'playing') {
                driveAudioEngine.pause();
              } else if (drivePlaybackStatus === 'paused') {
                driveAudioEngine.resume();
              } else if (currentDriveTrack) {
                const token = googleDriveService.getToken();
                driveAudioEngine.playTrack(currentDriveTrack, token || undefined);
              } else {
                driveAudioEngine.resume();
              }
            } else {
              handleTogglePlay();
            }
          }}
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
          onSelectDriveTrack={(track, index) => {
            setActiveSource('drive');
            const token = googleDriveService.getToken();
            const playlist = driveAudioEngine.getPlaylist();
            if (playlist && playlist.length > 0) {
              driveAudioEngine.setPlaylist(playlist, index);
            }
            driveAudioEngine.playTrack(track, token || undefined);
          }}
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
        onTogglePlay={() => {
          if (activeSource === 'drive') {
            if (drivePlaybackStatus === 'playing') {
              driveAudioEngine.pause();
            } else if (drivePlaybackStatus === 'paused') {
              driveAudioEngine.resume();
            } else if (currentDriveTrack) {
              const token = googleDriveService.getToken();
              driveAudioEngine.playTrack(currentDriveTrack, token || undefined);
            } else {
              driveAudioEngine.resume();
            }
          } else {
            handleTogglePlay();
          }
        }}
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
        onSuccess={(pairedUserData, syncedFavs, syncedObjs) => {
          if (pairedUserData) {
            setUser(pairedUserData);
          }
          if (Array.isArray(syncedFavs) && syncedFavs.length > 0) {
            setFavorites(syncedFavs);
            try {
              localStorage.setItem(getFavsStorageKey(pairedUserData?.uid), JSON.stringify(syncedFavs));
              localStorage.setItem('radiostream_favs', JSON.stringify(syncedFavs));
            } catch {}
          }
          if (Array.isArray(syncedObjs) && syncedObjs.length > 0) {
            setFavoriteStationsMap(prev => {
              const next = { ...prev };
              syncedObjs.forEach((st: RadioStation) => {
                if (st && st.id) next[st.id] = st;
              });
              try {
                localStorage.setItem(getFavObjsStorageKey(pairedUserData?.uid), JSON.stringify(next));
                localStorage.setItem('radiostream_fav_objects', JSON.stringify(next));
              } catch {}
              return next;
            });
          }
          handleSelectTab('drive');
        }}
        userEmail={user?.email || undefined}
      />

      {/* Settings Modal */}
      <SettingsModal
        isOpen={isSettingsOpen}
        onClose={() => setIsSettingsOpen(false)}
        lang={lang}
        onToggleLang={() => setLang(l => (l === 'ES' ? 'EN' : 'ES'))}
        favoritesCount={favoriteStationObjects.length}
        alarmsCount={0}
      />
    </div>
  );
}
