export type Language = 'ES' | 'EN';

export interface Translations {
  common: {
    loading: string;
    error: string;
    close: string;
    cancel: string;
    save: string;
    saved: string;
    active: string;
    connected: string;
    disconnected: string;
    offline: string;
    unavailable: string;
    all: string;
    folders: string;
    tracks: string;
    stations: string;
    yes: string;
    no: string;
  };
  nav: {
    radio: string;
    favorites: string;
    music: string;
    carMode: string;
    themes: string;
    settings: string;
    radioEngine: string;
    online: string;
    streamBuffer: string;
  };
  topBar: {
    live: string;
    loginWithGoogle: string;
    loginWithGmail: string;
    pairCar: string;
    fullscreen: string;
    exitFullscreen: string;
    fullscreenTooltip: string;
    exitFullscreenTooltip: string;
    logout: string;
    userProfile: string;
    syncing: string;
    synced: string;
    favoritesSynced: string;
    languageToggle: string;
  };
  discover: {
    title: string;
    searchPlaceholder: string;
    liveStationsCount: string;
    installPwa: string;
    searchingOnline: string;
    noResultsTitle: string;
    noResultsDesc: string;
    clearSearch: string;
    resetFilters: string;
    localCatalogNotice: string;
    noStationsForQuery: string;
    tune: string;
    retrying: string;
    favoriteBadge: string;
    nowPlaying: string;
    paused: string;
    buffering: string;
    unavailable: string;
  };
  favorites: {
    title: string;
    syncedWithGmail: string;
    savedLocally: string;
    syncWithGmail: string;
    emptyTitle: string;
    emptyDescLoggedIn: string;
    emptyDescLoggedOut: string;
    exploreStations: string;
    removeFavorite: string;
    addFavorite: string;
    pauseStream: string;
    retryTune: string;
    tune: string;
  };
  player: {
    googleDriveMusic: string;
    liveStreaming: string;
    live: string;
    playing: string;
    paused: string;
    buffering: string;
    connecting: string;
    standby: string;
    play: string;
    pause: string;
    prev: string;
    next: string;
    prevStation: string;
    nextStation: string;
    prevTrack: string;
    nextTrack: string;
    volume: string;
    carMode: string;
    equalizer: string;
    audioCockpit: string;
    addToFavorites: string;
    removeFromFavorites: string;
    mute: string;
    unmute: string;
  };
  settings: {
    title: string;
    themeBiomeTitle: string;
    currentTheme: string;
    changeBiome: string;
    bufferTitle: string;
    bufferDesc: string;
    sleepTimerTitle: string;
    sleepTimerDesc: string;
    stopsIn: string;
    customMinsPlaceholder: string;
    set: string;
    cancelActiveTimer: string;
    fadeOutTitle: string;
    fadeOutDesc: string;
    minutes: string;
    crossfadeTitle: string;
    crossfadeDesc: string;
    crossfadeDisabled: string;
    seconds: string;
    dynamicNormalizerTitle: string;
    dynamicNormalizerDesc: string;
    synthFallbackTitle: string;
    synthFallbackDesc: string;
    lowDataModeTitle: string;
    lowDataModeDesc: string;
    languageTitle: string;
    languageDesc: string;
    privacyTitle: string;
    privacyDesc: string;
    view: string;
    contactTitle: string;
    contactDesc: string;
    messageSent: string;
    messageSentDesc: string;
    sendAnother: string;
    nameAlias: string;
    optional: string;
    yourEmail: string;
    messageType: string;
    comment: string;
    bug: string;
    improvement: string;
    support: string;
    message: string;
    messagePlaceholder: string;
    sending: string;
    sendMessage: string;
    disconnectDrive: string;
    saveSettings: string;
    settingsSaved: string;
    close: string;
    systemSpecsTitle: string;
    audioEngineSpec: string;
    localStorageSpec: string;
    systemStatusSpec: string;
    visualIdentitySpec: string;
  };
  drive: {
    title: string;
    subtitle: string;
    connectDrive: string;
    connected: string;
    disconnected: string;
    disconnect: string;
    refresh: string;
    syncing: string;
    folders: string;
    allTracks: string;
    tracks: string;
    searchPlaceholder: string;
    searchCurrentPlaceholder: string;
    searchAllPlaceholder: string;
    emptyFolders: string;
    emptyFoldersDesc: string;
    scanning: string;
    connectToPlay: string;
    equalizer: string;
    guide: string;
    disconnectTitle: string;
    driveSyncSuccess: string;
    scopeCurrent: string;
    scopeAll: string;
    activeFolder: string;
    allTracksDropdown: string;
    rootFolder: string;
    root: string;
    viewTracks: string;
    viewGrid: string;
    filterFoldersPlaceholder: string;
    folder: string;
    view: string;
    equalizerBiquad: string;
    resetToZero: string;
    bass: string;
    mid: string;
    treble: string;
    guideTitle: string;
    guideStep1: string;
    guideStep1Desc: string;
    guideStep2: string;
    guideStep2Desc: string;
  };
  carMode: {
    hudTitle: string;
    player: string;
    tracksLibrary: string;
    favoriteStations: string;
    library: string;
    themes: string;
    fullscreen: string;
    window: string;
    exit: string;
    connectDrive: string;
    connected: string;
    disconnected: string;
    playing: string;
    standby: string;
    buffering: string;
    localTime: string;
    folder: string;
    station: string;
    mix: string;
    prev: string;
    play: string;
    pause: string;
    next: string;
    loop: string;
    privacy: string;
    carAudio: string;
    returnToPlayer: string;
    searchLibrary: string;
    searchRadioPlaceholder: string;
    searchDrivePlaceholder: string;
    noFavoriteStations: string;
    noFavoriteStationsFound: string;
    noSongsFound: string;
    tracks: string;
    stations: string;
    viewFolderInLibrary: string;
    carAudioTitle: string;
    carAudioQuestion: string;
    carAudioExplanation: string;
    carAudioStep1: string;
    carAudioStep2: string;
    carAudioClose: string;
  };
  themes: {
    systemTitle: string;
    title: string;
    subtitle: string;
    activeBadge: string;
    close: string;
    space: string;
    ocean: string;
    lunar: string;
    canyon: string;
    savanna: string;
    jungle: string;
  };
  tuning: {
    moduleTag: string;
    tuning: string;
    cancel: string;
  };
  privacy: {
    title: string;
    subtitle: string;
    close: string;
    driveSection: string;
    driveDesc: string;
    point1Title: string;
    point1Desc: string;
    point2Title: string;
    point2Desc: string;
    point3Title: string;
    point3Desc: string;
    officialLinksSection: string;
    officialLinksDesc: string;
    privacyLinkText: string;
    termsLinkText: string;
  };
  pairing: {
    title: string;
    subtitle: string;
    carModeReady: string;
    qrTab: string;
    redirectTab: string;
    manualTab: string;
    screenCode: string;
    whyBestOption: string;
    whyBestOptionDesc: string;
    step1: string;
    step2: string;
    step3: string;
    waiting: string;
    pairedSuccess: string;
    pairedWith: string;
    syncingTracks: string;
    directRedirectTitle: string;
    directRedirectDesc: string;
    driverNote: string;
    signInDirectGoogle: string;
    manualAccessTitle: string;
    manualAccessDesc: string;
    manualTokenPlaceholder: string;
    applyToken: string;
    closeWindow: string;
    carEditionFooter: string;
  };
}

export const translations: Record<Language, Translations> = {
  ES: {
    common: {
      loading: 'Cargando...',
      error: 'Error',
      close: 'Cerrar',
      cancel: 'Cancelar',
      save: 'Guardar',
      saved: 'Guardado',
      active: 'ACTIVO',
      connected: 'CONECTADO',
      disconnected: 'DESCONECTADO',
      offline: 'Sin conexión',
      unavailable: 'No disponible',
      all: 'Todas',
      folders: 'Carpetas',
      tracks: 'Canciones',
      stations: 'Emisoras',
      yes: 'Sí',
      no: 'No',
    },
    nav: {
      radio: 'RADIO',
      favorites: 'FAVORITAS',
      music: 'MÚSICA',
      carMode: 'MODO COCHE',
      themes: 'TEMAS',
      settings: 'AJUSTES',
      radioEngine: 'RADIO ENGINE',
      online: 'ONLINE',
      streamBuffer: 'STREAM BUFFER: 128KB | AUTO-SYNC',
    },
    topBar: {
      live: 'EN VIVO',
      loginWithGoogle: 'Acceder con Google',
      loginWithGmail: 'Acceder con Gmail',
      pairCar: 'Vincular Coche (QR)',
      fullscreen: 'PANTALLA TOTAL',
      exitFullscreen: 'VENTANA',
      fullscreenTooltip: 'Pantalla completa Coche',
      exitFullscreenTooltip: 'Salir de pantalla completa',
      logout: 'Cerrar Sesión',
      userProfile: 'Perfil de usuario',
      syncing: 'SYNC...',
      synced: 'CLOUD SYNC',
      favoritesSynced: 'Favoritas sincronizadas',
      languageToggle: 'ES / EN',
    },
    discover: {
      title: 'Emisoras en Vivo (30.000+ Online)',
      searchPlaceholder: 'Busca cualquier emisora o país en internet (ej. SER, Ibiza, Jazz, Madrid)...',
      liveStationsCount: 'Emisoras en Vivo',
      installPwa: 'Instalar App',
      searchingOnline: 'Buscando en directorio global...',
      noResultsTitle: 'No se encontraron emisoras',
      noResultsDesc: 'Prueba con otro término de búsqueda o limpia los filtros.',
      clearSearch: 'Limpiar búsqueda',
      resetFilters: 'Restablecer filtros',
      localCatalogNotice: 'Catálogo recomendado sin conexión',
      noStationsForQuery: 'No se encontraron emisoras para',
      tune: 'SINTONIZAR',
      retrying: 'Reintentando...',
      favoriteBadge: 'Favorita',
      nowPlaying: 'SONANDO',
      paused: 'PAUSADO',
      buffering: 'BÚFER...',
      unavailable: 'NO DISPONIBLE',
    },
    favorites: {
      title: 'Tus Emisoras Favoritas',
      syncedWithGmail: 'Sincronizado con tu cuenta Google',
      savedLocally: 'Guardado localmente en este dispositivo',
      syncWithGmail: 'Inicia sesión con Google para sincronizar en todos tus dispositivos y coche.',
      emptyTitle: 'No tienes emisoras favoritas aún',
      emptyDescLoggedIn: 'Explora el catálogo o busca tus emisoras preferidas y pulsa el corazón para añadirlas.',
      emptyDescLoggedOut: 'Inicia sesión con Google para sincronizar tus favoritas entre tu móvil, ordenador y coche.',
      exploreStations: 'Explorar Emisoras',
      removeFavorite: 'Eliminar de favoritas',
      addFavorite: 'Añadir a favoritas',
      pauseStream: 'Pausar emisora',
      retryTune: 'Reintentar conexión',
      tune: 'Sintonizar emisora',
    },
    player: {
      googleDriveMusic: 'Música en Google Drive',
      liveStreaming: 'Emisión en Directo',
      live: 'EN DIRECTO',
      playing: 'REPRODUCIENDO',
      paused: 'PAUSADO',
      buffering: 'BÚFER...',
      connecting: 'Conectando...',
      standby: 'EN ESPERA',
      play: 'Reproducir',
      pause: 'Pausar',
      prev: 'Anterior',
      next: 'Siguiente',
      prevStation: 'Emisora anterior',
      nextStation: 'Emisora siguiente',
      prevTrack: 'Pista anterior',
      nextTrack: 'Pista siguiente',
      volume: 'Volumen',
      carMode: 'Modo Coche',
      equalizer: 'Ecualizador',
      audioCockpit: 'Cockpit de Audio',
      addToFavorites: 'Añadir a favoritas',
      removeFromFavorites: 'Eliminar de favoritas',
      mute: 'Silenciar',
      unmute: 'Activar sonido',
    },
    settings: {
      title: 'Ajustes de Myradio Pro 2.0',
      themeBiomeTitle: 'Biomas y Entornos Reactivos',
      currentTheme: 'Tema actual',
      changeBiome: 'Cambiar Bioma',
      bufferTitle: 'Búfer de Audio Pre-reproducción',
      bufferDesc: 'Mayor búfer evita cortes de señal en túneles o autopistas.',
      sleepTimerTitle: 'Temporizador de Apagado (Sleep Timer)',
      sleepTimerDesc: 'Detiene la reproducción de audio automáticamente tras la duración seleccionada (Radio y Google Drive).',
      stopsIn: 'Apagando en',
      customMinsPlaceholder: 'Otros minutos (ej. 20, 120)...',
      set: 'Fijar',
      cancelActiveTimer: 'Cancelar Temporizador Activo',
      fadeOutTitle: 'Duración de Atenuación (Fade Out)',
      fadeOutDesc: 'Disminución suave y progresiva del volumen antes de apagarse.',
      minutes: 'minutos',
      crossfadeTitle: 'Transición Suave Google Drive (Crossfade)',
      crossfadeDesc: 'Funde el final de una pista con el inicio de la siguiente sin silencios.',
      crossfadeDisabled: 'Desactivado (Corte normal)',
      seconds: 'segundos',
      dynamicNormalizerTitle: 'Normalizador Dinámico de Volumen (AGC)',
      dynamicNormalizerDesc:
        'Nivelación continua perceptual y compensación de ganancia (+3.5 dB). Iguala el volumen entre grabaciones antiguas de CDs y masterizaciones modernas comprimidas de Drive sin distorsión por recorte digital.',
      synthFallbackTitle: 'Sintetizador de Respaldo WebAudio',
      synthFallbackDesc: 'Genera audio continuo si la emisora externa tiene cortes de red.',
      lowDataModeTitle: 'Modo Ahorro de Datos (Low Bitrate)',
      lowDataModeDesc: 'Prioriza codecs AAC 64kbps para reducir consumo en datos móviles.',
      languageTitle: 'Idioma de la Interfaz',
      languageDesc: 'Español (ES) / English (EN)',
      privacyTitle: 'Política de Privacidad y Seguridad',
      privacyDesc: 'Permisos Google Drive, búfer offline IndexedDB y protección de datos.',
      view: 'Ver',
      contactTitle: 'Contacto y Soporte (Buzón de Sugerencias)',
      contactDesc: 'Envíanos fallos, emisoras que no funcionan o nuevas funciones que te gustaría tener.',
      messageSent: '¡Mensaje Enviado!',
      messageSentDesc: 'Gracias por tu aportación para mejorar MyRadio Pro.',
      sendAnother: 'Enviar otro mensaje',
      nameAlias: 'Nombre / Alias',
      optional: 'Opcional',
      yourEmail: 'Tu Email',
      messageType: 'Tipo de Mensaje',
      comment: 'Comentario / Sugerencia',
      bug: 'Reportar un Fallo / Bug',
      improvement: 'Propuesta de Mejora',
      support: 'Soporte Técnico',
      message: 'Mensaje *',
      messagePlaceholder: 'Escribe aquí tus comentarios, sugerencias o fallos...',
      sending: 'Enviando...',
      sendMessage: 'Enviar Mensaje al Desarrollador',
      disconnectDrive: 'Desconectar Google Drive',
      saveSettings: 'Guardar Ajustes',
      settingsSaved: '¡Ajustes guardados correctamente!',
      close: 'Cerrar',
      systemSpecsTitle: 'ESPECIFICACIONES DEL SISTEMA:',
      audioEngineSpec: 'Motor de Audio: HTML5 Audio + Web Audio API (AnalyserNode 64 FFT)',
      localStorageSpec: 'Almacenamiento Local: SQLite Synced / LocalStorage Persistent DB',
      systemStatusSpec: 'Estado del Sistema',
      visualIdentitySpec: 'Identidad Visual: Signal Zero Neo-Brutalist 3px Hard-Edge',
    },
    drive: {
      title: 'Música en Google Drive (/mimusica)',
      subtitle: 'Navega y reproduce tus álbumes y canciones sincronizadas desde Google Drive con calidad Lossless.',
      connectDrive: 'Conectar con Google Drive',
      connected: 'CONECTADO',
      disconnected: 'DESCONECTADO',
      disconnect: 'Desconectar',
      refresh: 'Sincronizar Carpetas',
      syncing: 'Sincronizando...',
      folders: 'Carpetas',
      allTracks: 'Todas las canciones',
      tracks: 'canciones',
      searchPlaceholder: 'Buscar canciones o carpetas...',
      searchCurrentPlaceholder: 'Buscar en esta carpeta...',
      searchAllPlaceholder: 'Buscar en todas las canciones...',
      emptyFolders: 'No se encontraron canciones en tu Google Drive',
      emptyFoldersDesc: 'Asegúrate de tener archivos .mp3, .m4a o .wav en tu Drive y pulsa Sincronizar.',
      scanning: 'Escaneando archivos de audio...',
      connectToPlay: 'Conecta Google Drive para reproducir tu música.',
      equalizer: 'EQ',
      guide: 'Guía',
      disconnectTitle: 'Desconectar acceso a Google Drive',
      driveSyncSuccess: '¡Carpetas de Google Drive sincronizadas correctamente!',
      scopeCurrent: 'Carpeta actual',
      scopeAll: 'Todo Drive',
      activeFolder: 'Carpeta activa:',
      allTracksDropdown: 'TODAS LAS CANCIONES',
      rootFolder: 'RAÍZ /mimusica',
      root: 'Raíz',
      viewTracks: 'Ver pistas',
      viewGrid: 'Ver cuadrícula',
      filterFoldersPlaceholder: 'Filtrar carpetas por nombre...',
      folder: 'Carpeta',
      view: 'Ver',
      equalizerBiquad: 'Ecualizador Biquad (Web Audio API)',
      resetToZero: 'Resetear a 0dB',
      bass: 'Bajos',
      mid: 'Medios',
      treble: 'Agudos',
      guideTitle: 'Organización en Google Drive (/mimusica)',
      guideStep1: 'Carpeta raíz: /mimusica',
      guideStep1Desc: 'Crea una carpeta llamada mimusica en la raíz de tu Google Drive. Se detecta automáticamente.',
      guideStep2: 'Subcarpetas = Listas de Reproducción',
      guideStep2Desc: 'Cada subcarpeta dentro de mimusica se convierte automáticamente en una lista o álbum navegable en este bloque.',
    },
    carMode: {
      hudTitle: 'MODO COCHE HUD',
      player: 'REPRODUCTOR',
      tracksLibrary: 'BIBLIOTECA PISTAS',
      favoriteStations: 'EMISORAS FAVORITAS',
      library: 'BIBLIOTECA',
      themes: 'TEMAS',
      fullscreen: 'PANTALLA TOTAL',
      window: 'VENTANA',
      exit: 'Salir',
      connectDrive: 'Conectar Drive',
      connected: 'CONECTADO',
      disconnected: 'DESCONECTADO',
      playing: 'REPRODUCIENDO',
      standby: 'EN ESPERA',
      buffering: 'BÚFER...',
      localTime: 'Local',
      folder: 'Carpeta:',
      station: 'Emisora:',
      mix: 'MIX',
      prev: 'PREV',
      play: 'PLAY',
      pause: 'PAUSE',
      next: 'NEXT',
      loop: 'LOOP',
      privacy: 'Privacidad',
      carAudio: 'Audio Coche',
      returnToPlayer: 'Volver al Reproductor',
      searchLibrary: 'Buscar en biblioteca...',
      searchRadioPlaceholder: 'Buscar emisora favorita...',
      searchDrivePlaceholder: 'Buscar canción o artista...',
      noFavoriteStations: 'No tienes emisoras favoritas añadidas aún. Añádelas en Descubrir.',
      noFavoriteStationsFound: 'No se encontraron emisoras favoritas para',
      noSongsFound: 'No se encontraron canciones para',
      tracks: 'Pistas',
      stations: 'Emisoras',
      viewFolderInLibrary: 'Ver carpeta en biblioteca',
      carAudioTitle: 'Audio en el Coche',
      carAudioQuestion: '¿Se escucha la radio propia del coche al mismo tiempo que esta emisora?',
      carAudioExplanation:
        'Los coches cuentan con un sintonizador físico de radio FM/DAB independiente del navegador web. Por seguridad del vehículo, los navegadores no pueden apagar el chip de radio física, por lo que el sistema mezcla ambos sonidos en los altavoces.',
      carAudioStep1: 'En la pantalla del coche, abre la app nativa de Radio y ponla en Silencio (Mute) o Volumen 0.',
      carAudioStep2: 'O bien selecciona la fuente Bluetooth / AUX / Web en el coche.',
      carAudioClose: 'Entendido',
    },
    themes: {
      systemTitle: 'SISTEMA • TEMATIZACIÓN',
      title: 'Biomas y Fondos Dinámicos',
      subtitle:
        'Selecciona un bioma reactivo para transformar la atmósfera, el fondo interactivo en canvas y la paleta de colores del cockpit y HUD.',
      activeBadge: 'ACTIVO',
      close: 'Cerrar selector de temas',
      space: 'Espacio Exterior',
      ocean: 'Fondo Marino',
      lunar: 'Paisaje Lunar',
      canyon: 'Gran Cañón',
      savanna: 'Sabana Africana',
      jungle: 'Selva Amazónica',
    },
    tuning: {
      moduleTag: 'TUNING_MODULE',
      tuning: 'SINTONIZANDO...',
      cancel: 'Cancelar',
    },
    privacy: {
      title: 'Política de Privacidad y Seguridad',
      subtitle: 'Myradio Pro 2.0 • Modo Coche y Streaming',
      close: 'Cerrar',
      driveSection: '1. Acceso Estricto a Google Drive',
      driveDesc:
        'La integración con Google Drive utiliza exclusivamente el permiso de solo lectura (drive.readonly) para acceder a los archivos de audio contenidos en tu carpeta /mimusica.',
      point1Title: 'Sin servidores intermedios:',
      point1Desc: 'El audio se descarga directamente entre los servidores de Google y tu navegador mediante canal HTTPS cifrado.',
      point2Title: 'Sin modificación ni borrado:',
      point2Desc: 'La aplicación no tiene permisos de escritura, modificación ni eliminación sobre tus archivos.',
      point3Title: 'Aislamiento total:',
      point3Desc: 'No accedemos a documentos, fotos ni ningún otro dato personal fuera de la carpeta musical autorizada.',
      officialLinksSection: '6. Documentación Legal y Términos Oficiales',
      officialLinksDesc:
        'Puedes consultar la documentación legal completa, política de privacidad web y términos de servicio en nuestras páginas oficiales:',
      privacyLinkText: 'Política de Privacidad Oficial',
      termsLinkText: 'Términos y Condiciones de Uso',
    },
    pairing: {
      title: 'Conectar Gmail & Google Drive',
      subtitle: 'Solución optimizada para el navegador y pantalla del coche',
      carModeReady: 'Modo Coche Ready',
      qrTab: '1. Vincular con Móvil (QR)',
      redirectTab: '2. Redirección en esta pestaña',
      manualTab: '3. Manual / Token',
      screenCode: 'Código de pantalla',
      whyBestOption: '¿Por qué esta es la mejor opción en el coche?',
      whyBestOptionDesc:
        'El navegador del coche suele bloquear o restringir las ventanas emergentes (popups) de Google al abrirlas en pestañas aisladas. Al escanear este código con tu teléfono móvil, tu cuenta se autoriza en 1 segundo y la música se activa de inmediato en la pantalla del coche.',
      step1: 'Apunta la cámara de tu móvil al código QR.',
      step2: 'Toca el enlace en tu móvil y pulsa "Autorizar en mi Coche".',
      step3: 'Esta pantalla se conectará automáticamente sin que tengas que teclear contraseñas en el coche.',
      waiting: 'Esperando confirmación desde tu teléfono móvil...',
      pairedSuccess: '¡Coche Vinculado Correctamente!',
      pairedWith: 'Conectado a Google Drive con',
      syncingTracks: 'Sincronizando canciones...',
      directRedirectTitle: 'Redirección en la misma ventana',
      directRedirectDesc:
        'En lugar de abrir una pestaña nueva (que en el navegador del coche puede quedar desconectada), este método navegará directamente en esta misma pestaña hacia la página oficial de Google y volverá automáticamente con tus canciones y favoritos cargados.',
      driverNote:
        'Nota para conductores en el coche: Al regresar de Google, la aplicación guardará la sesión en el almacenamiento local para que no tengas que repetir este proceso cada vez que entres al coche.',
      signInDirectGoogle: 'Iniciar sesión directa con Google',
      manualAccessTitle: 'Acceso Manual por Token de Drive',
      manualAccessDesc: 'Si has obtenido un token de acceso temporal de Google OAuth o quieres introducirlo directamente:',
      manualTokenPlaceholder: 'Pega aquí el OAuth Access Token (ya29....)',
      applyToken: 'Aplicar Token a Google Drive',
      closeWindow: 'Cerrar ventana',
      carEditionFooter: 'RadioStream Car Edition • Compatible con Pantallas de Coche',
    },
  },
  EN: {
    common: {
      loading: 'Loading...',
      error: 'Error',
      close: 'Close',
      cancel: 'Cancel',
      save: 'Save',
      saved: 'Saved',
      active: 'ACTIVE',
      connected: 'CONNECTED',
      disconnected: 'DISCONNECTED',
      offline: 'Offline',
      unavailable: 'Unavailable',
      all: 'All',
      folders: 'Folders',
      tracks: 'Tracks',
      stations: 'Stations',
      yes: 'Yes',
      no: 'No',
    },
    nav: {
      radio: 'RADIO',
      favorites: 'FAVORITES',
      music: 'MUSIC',
      carMode: 'CAR MODE',
      themes: 'THEMES',
      settings: 'SETTINGS',
      radioEngine: 'RADIO ENGINE',
      online: 'ONLINE',
      streamBuffer: 'STREAM BUFFER: 128KB | AUTO-SYNC',
    },
    topBar: {
      live: 'LIVE',
      loginWithGoogle: 'Sign in with Google',
      loginWithGmail: 'Sign in with Gmail',
      pairCar: 'Pair Car (QR)',
      fullscreen: 'FULLSCREEN',
      exitFullscreen: 'WINDOW',
      fullscreenTooltip: 'Car Fullscreen',
      exitFullscreenTooltip: 'Exit Fullscreen',
      logout: 'Sign Out',
      userProfile: 'User Profile',
      syncing: 'SYNC...',
      synced: 'CLOUD SYNC',
      favoritesSynced: 'Favorites synced',
      languageToggle: 'ES / EN',
    },
    discover: {
      title: 'Live Radio Stations (30,000+ Online)',
      searchPlaceholder: 'Search any station or country worldwide (e.g. BBC, Jazz, Chill, Ibiza)...',
      liveStationsCount: 'Live Stations',
      installPwa: 'Install App',
      searchingOnline: 'Searching global directory...',
      noResultsTitle: 'No stations found',
      noResultsDesc: 'Try another search query or clear the filters.',
      clearSearch: 'Clear search',
      resetFilters: 'Reset filters',
      localCatalogNotice: 'Recommended offline catalog',
      noStationsForQuery: 'No stations found for',
      tune: 'TUNE IN',
      retrying: 'Retrying...',
      favoriteBadge: 'Favorite',
      nowPlaying: 'PLAYING',
      paused: 'PAUSED',
      buffering: 'BUFFERING...',
      unavailable: 'UNAVAILABLE',
    },
    favorites: {
      title: 'Your Favorite Stations',
      syncedWithGmail: 'Synced with your Google account',
      savedLocally: 'Saved locally on this device',
      syncWithGmail: 'Sign in with Google to sync across all your devices and car.',
      emptyTitle: 'No favorite stations yet',
      emptyDescLoggedIn: 'Explore the catalog or search for your favorite stations and click the heart to add them.',
      emptyDescLoggedOut: 'Sign in with Google to sync your favorites across mobile, PC, and car.',
      exploreStations: 'Explore Stations',
      removeFavorite: 'Remove from favorites',
      addFavorite: 'Add to favorites',
      pauseStream: 'Pause stream',
      retryTune: 'Retry connection',
      tune: 'Tune into station',
    },
    player: {
      googleDriveMusic: 'Google Drive Music',
      liveStreaming: 'Live Streaming',
      live: 'LIVE',
      playing: 'PLAYING',
      paused: 'PAUSED',
      buffering: 'BUFFERING...',
      connecting: 'Connecting...',
      standby: 'STANDBY',
      play: 'Play',
      pause: 'Pause',
      prev: 'Previous',
      next: 'Next',
      prevStation: 'Previous station',
      nextStation: 'Next station',
      prevTrack: 'Previous track',
      nextTrack: 'Next track',
      volume: 'Volume',
      carMode: 'Car Mode',
      equalizer: 'Equalizer',
      audioCockpit: 'Audio Cockpit',
      addToFavorites: 'Add to favorites',
      removeFromFavorites: 'Remove from favorites',
      mute: 'Mute',
      unmute: 'Unmute',
    },
    settings: {
      title: 'Myradio Pro 2.0 Settings',
      themeBiomeTitle: 'Biomes & Reactive Environments',
      currentTheme: 'Current Theme',
      changeBiome: 'Change Biome',
      bufferTitle: 'Pre-playback Audio Buffer',
      bufferDesc: 'Larger buffer prevents audio cutouts in tunnels or highways.',
      sleepTimerTitle: 'Sleep Timer (Auto-Off)',
      sleepTimerDesc: 'Automatically stops all audio playback (Radio & Google Drive) after the specified duration.',
      stopsIn: 'Stops in',
      customMinsPlaceholder: 'Custom mins (e.g. 20, 120)...',
      set: 'Set',
      cancelActiveTimer: 'Cancel Active Sleep Timer',
      fadeOutTitle: 'Fade Out Duration',
      fadeOutDesc: 'Smooth volume decrease before stopping audio.',
      minutes: 'minutes',
      crossfadeTitle: 'Google Drive Smooth Transition (Crossfade)',
      crossfadeDesc: 'Blends the end of a track with the start of the next track without silence.',
      crossfadeDisabled: 'Disabled (Normal cut)',
      seconds: 'seconds',
      dynamicNormalizerTitle: 'Dynamic Volume Normalizer (AGC)',
      dynamicNormalizerDesc:
        'Continuous perceptual loudness normalization and gain compensation (+3.5 dB). Evens out volume between older CD rips and modern compressed tracks without digital clipping.',
      synthFallbackTitle: 'WebAudio Backup Synthesizer',
      synthFallbackDesc: 'Generates smooth ambient backup tone if stream experiences network loss.',
      lowDataModeTitle: 'Low Data Mode (Data Saver)',
      lowDataModeDesc: 'Prefers AAC 64kbps streams to minimize mobile cellular data usage.',
      languageTitle: 'Interface Language',
      languageDesc: 'Spanish (ES) / English (EN)',
      privacyTitle: 'Privacy & Security Policy',
      privacyDesc: 'Google Drive permissions, offline IndexedDB buffer, and data protection.',
      view: 'View',
      contactTitle: 'Contact & Support (Feedback Box)',
      contactDesc: 'Send us bug reports, broken stations, or feature requests you would love to have.',
      messageSent: 'Message Sent!',
      messageSentDesc: 'Thank you for your feedback to help make MyRadio Pro even better.',
      sendAnother: 'Send another message',
      nameAlias: 'Name / Alias',
      optional: 'Optional',
      yourEmail: 'Your Email',
      messageType: 'Message Type',
      comment: 'Comment / Suggestion',
      bug: 'Report a Bug / Issue',
      improvement: 'Improvement Proposal',
      support: 'Technical Support',
      message: 'Message *',
      messagePlaceholder: 'Write your comments, suggestions, or bug reports here...',
      sending: 'Sending...',
      sendMessage: 'Send Message to Developer',
      disconnectDrive: 'Disconnect Google Drive',
      saveSettings: 'Save Settings',
      settingsSaved: 'Settings saved successfully!',
      close: 'Close',
      systemSpecsTitle: 'SYSTEM SPECIFICATIONS:',
      audioEngineSpec: 'Audio Engine: HTML5 Audio + Web Audio API (AnalyserNode 64 FFT)',
      localStorageSpec: 'Local Storage: SQLite Synced / LocalStorage Persistent DB',
      systemStatusSpec: 'System Status',
      visualIdentitySpec: 'Visual Identity: Signal Zero Neo-Brutalist 3px Hard-Edge',
    },
    drive: {
      title: 'Google Drive Music (/mimusica)',
      subtitle: 'Browse and play your synced albums and tracks from Google Drive in Lossless quality.',
      connectDrive: 'Connect with Google Drive',
      connected: 'CONNECTED',
      disconnected: 'DISCONNECTED',
      disconnect: 'Disconnect',
      refresh: 'Sync Folders',
      syncing: 'Syncing...',
      folders: 'Folders',
      allTracks: 'All Songs',
      tracks: 'tracks',
      searchPlaceholder: 'Search songs or folders...',
      searchCurrentPlaceholder: 'Search in this folder...',
      searchAllPlaceholder: 'Search in all songs...',
      emptyFolders: 'No songs found in your Google Drive',
      emptyFoldersDesc: 'Make sure you have .mp3, .m4a or .wav files in your Drive and click Sync Folders.',
      scanning: 'Scanning audio files...',
      connectToPlay: 'Connect Google Drive to play your music.',
      equalizer: 'EQ',
      guide: 'Guide',
      disconnectTitle: 'Disconnect Google Drive access',
      driveSyncSuccess: 'Google Drive folders synced successfully!',
      scopeCurrent: 'Current folder',
      scopeAll: 'All Drive',
      activeFolder: 'Active folder:',
      allTracksDropdown: 'ALL SONGS',
      rootFolder: 'ROOT /mimusica',
      root: 'Root',
      viewTracks: 'View tracks',
      viewGrid: 'View grid',
      filterFoldersPlaceholder: 'Filter folders by name...',
      folder: 'Folder',
      view: 'View',
      equalizerBiquad: 'Biquad Equalizer (Web Audio API)',
      resetToZero: 'Reset to 0dB',
      bass: 'Bass',
      mid: 'Mids',
      treble: 'Treble',
      guideTitle: 'Google Drive Organization (/mimusica)',
      guideStep1: 'Root folder: /mimusica',
      guideStep1Desc: 'Create a folder named mimusica in the root of your Google Drive. It is automatically detected.',
      guideStep2: 'Subfolders = Playlists',
      guideStep2Desc: 'Each subfolder inside mimusica automatically becomes a playlist or album browsable here.',
    },
    carMode: {
      hudTitle: 'CAR MODE HUD',
      player: 'PLAYER',
      tracksLibrary: 'TRACKS LIBRARY',
      favoriteStations: 'FAVORITE STATIONS',
      library: 'LIBRARY',
      themes: 'THEMES',
      fullscreen: 'FULLSCREEN',
      window: 'WINDOW',
      exit: 'Exit',
      connectDrive: 'Connect Drive',
      connected: 'CONNECTED',
      disconnected: 'DISCONNECTED',
      playing: 'PLAYING',
      standby: 'STANDBY',
      buffering: 'BUFFERING...',
      localTime: 'Local',
      folder: 'Folder:',
      station: 'Station:',
      mix: 'MIX',
      prev: 'PREV',
      play: 'PLAY',
      pause: 'PAUSE',
      next: 'NEXT',
      loop: 'LOOP',
      privacy: 'Privacy',
      carAudio: 'Car Audio',
      returnToPlayer: 'Return to Player',
      searchLibrary: 'Search library...',
      searchRadioPlaceholder: 'Search favorite station...',
      searchDrivePlaceholder: 'Search song or artist...',
      noFavoriteStations: 'You have no favorite stations added yet. Add them in Discover tab.',
      noFavoriteStationsFound: 'No favorite stations found for',
      noSongsFound: 'No songs found for',
      tracks: 'Tracks',
      stations: 'Stations',
      viewFolderInLibrary: 'View folder in library',
      carAudioTitle: 'Car Audio Coexistence',
      carAudioQuestion: 'Can you hear the car built-in radio playing at the same time?',
      carAudioExplanation:
        'Cars have a physical FM/DAB radio tuner independent of the web browser. For vehicle safety, web browsers cannot disable the physical radio chip, causing the car system to mix both audio sources through the speakers.',
      carAudioStep1: 'On the car screen, open the native Radio app and set it to Mute or Volume 0.',
      carAudioStep2: 'Or select Bluetooth / AUX / Web audio source in the car system.',
      carAudioClose: 'Got it',
    },
    themes: {
      systemTitle: 'SYSTEM • THEMATIZATION',
      title: 'Biomes & Dynamic Backgrounds',
      subtitle:
        'Select a reactive biome to transform the atmosphere, interactive canvas background, and color palette of cockpit and HUD.',
      activeBadge: 'ACTIVE',
      close: 'Close theme selector',
      space: 'Outer Space',
      ocean: 'Deep Ocean',
      lunar: 'Lunar Landscape',
      canyon: 'Grand Canyon',
      savanna: 'African Savanna',
      jungle: 'Amazon Jungle',
    },
    tuning: {
      moduleTag: 'TUNING_MODULE',
      tuning: 'TUNING IN...',
      cancel: 'Cancel',
    },
    privacy: {
      title: 'Privacy & Security Policy',
      subtitle: 'Myradio Pro 2.0 • Car Mode & Streaming',
      close: 'Close',
      driveSection: '1. Strict Google Drive Access',
      driveDesc:
        'Google Drive integration strictly uses read-only permission (drive.readonly) to access audio files inside your /mimusica folder.',
      point1Title: 'No intermediate servers:',
      point1Desc: 'Audio streams directly between Google servers and your browser over encrypted HTTPS.',
      point2Title: 'No modification or deletion:',
      point2Desc: 'The application has no write, edit, or delete permissions over your files.',
      point3Title: 'Total isolation:',
      point3Desc: 'We never access documents, photos, or any other personal data outside the authorized music folder.',
      officialLinksSection: '6. Official Legal Documentation & Terms',
      officialLinksDesc:
        'You can review our full legal documentation, official web privacy policy, and terms of service at our official URLs:',
      privacyLinkText: 'Official Privacy Policy',
      termsLinkText: 'Terms & Conditions of Service',
    },
    pairing: {
      title: 'Connect Gmail & Google Drive',
      subtitle: 'Optimized solution for car browser and infotainment screen',
      carModeReady: 'Car Mode Ready',
      qrTab: '1. Pair with Mobile (QR)',
      redirectTab: '2. Same Tab Redirect',
      manualTab: '3. Manual / Token',
      screenCode: 'Screen Code',
      whyBestOption: 'Why is this the best option in the car?',
      whyBestOptionDesc:
        'Car browsers often block or restrict Google popups when opened in isolated tabs. By scanning this QR code with your phone, your account is authorized in 1 second and music activates immediately on the car screen.',
      step1: 'Point your mobile camera at the QR code.',
      step2: 'Tap the link on your mobile and tap "Authorize in my Car".',
      step3: 'This screen connects automatically without having to type passwords on your car touchscreen.',
      waiting: 'Waiting for mobile confirmation...',
      pairedSuccess: 'Car Paired Successfully!',
      pairedWith: 'Connected to Google Drive with',
      syncingTracks: 'Syncing tracks...',
      directRedirectTitle: 'Direct redirect in same window',
      directRedirectDesc:
        'Instead of opening a new tab, this method navigates directly within this tab to the official Google page and returns automatically with your songs and favorites loaded.',
      driverNote:
        'Driver note: Upon returning from Google, the session is saved in local storage so you do not repeat this process each time you enter the car.',
      signInDirectGoogle: 'Direct Google Sign In',
      manualAccessTitle: 'Manual Access via Drive Token',
      manualAccessDesc: 'If you have a temporary Google OAuth access token or wish to enter it directly:',
      manualTokenPlaceholder: 'Paste OAuth Access Token here (ya29....)',
      applyToken: 'Apply Token to Google Drive',
      closeWindow: 'Close window',
      carEditionFooter: 'RadioStream Car Edition • Compatible with Car Displays',
    },
  },
};
