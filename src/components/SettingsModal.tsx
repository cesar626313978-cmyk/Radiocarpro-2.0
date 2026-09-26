import React, { useState, useEffect } from 'react';
import { audioEngine } from '../services/audioEngine';
import { driveAudioEngine } from '../services/driveAudioEngine';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ES' | 'EN';
  onToggleLang: () => void;
  favoritesCount: number;
  alarmsCount: number;
  onSaveSettings?: (settings: {
    bufferSize: string;
    driveCrossfade: number;
    fadeOutMins: number;
    synthFallback: boolean;
    lowDataMode: boolean;
  }) => void;
  currentSettings?: {
    bufferSize?: string;
    driveCrossfade?: number;
    fadeOutMins?: number;
    synthFallback?: boolean;
    lowDataMode?: boolean;
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  onToggleLang,
  favoritesCount,
  alarmsCount,
  onSaveSettings,
  currentSettings,
}) => {
  const getInitialBufferSize = () => {
    if (currentSettings?.bufferSize) return currentSettings.bufferSize;
    try {
      const saved = localStorage.getItem('radiostream_buffer_size');
      if (saved && ['64KB', '128KB', '256KB', '512KB'].includes(saved)) return saved;
    } catch {}
    return driveAudioEngine.getBufferSize() || audioEngine.getBufferSize() || '128KB';
  };

  const getInitialCrossfade = () => {
    if (typeof currentSettings?.driveCrossfade === 'number') return currentSettings.driveCrossfade;
    try {
      const saved = localStorage.getItem('myradiopro_drive_crossfade');
      if (saved) {
        const val = parseInt(saved, 10);
        if ([0, 3, 5, 8, 12].includes(val)) return val;
      }
    } catch {}
    return driveAudioEngine.getCrossfadeSeconds();
  };

  const getInitialFadeOut = () => {
    if (typeof currentSettings?.fadeOutMins === 'number') return currentSettings.fadeOutMins;
    try {
      const saved = localStorage.getItem('radiostream_fade_mins');
      return saved ? parseInt(saved, 10) : 5;
    } catch {
      return 5;
    }
  };

  const [bufferSize, setBufferSize] = useState<string>(getInitialBufferSize);
  const [fadeOutMins, setFadeOutMins] = useState<number>(getInitialFadeOut);
  const [driveCrossfade, setDriveCrossfade] = useState<number>(getInitialCrossfade);
  const [synthFallback, setSynthFallback] = useState<boolean>(() => {
    if (typeof currentSettings?.synthFallback === 'boolean') return currentSettings.synthFallback;
    try {
      return localStorage.getItem('myradiopro_synth_fallback') !== 'false';
    } catch {
      return true;
    }
  });
  const [lowDataMode, setLowDataMode] = useState<boolean>(() => {
    if (typeof currentSettings?.lowDataMode === 'boolean') return currentSettings.lowDataMode;
    try {
      return localStorage.getItem('myradiopro_low_data') === 'true';
    } catch {
      return false;
    }
  });
  const [savedToast, setSavedToast] = useState(false);

  const [sleepSecondsLeft, setSleepSecondsLeft] = useState(() => audioEngine.getSleepTimerSeconds());
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);

  // When modal opens, synchronize state with stored values and engines
  useEffect(() => {
    if (!isOpen) return;
    setBufferSize(getInitialBufferSize());
    setDriveCrossfade(getInitialCrossfade());
    setFadeOutMins(getInitialFadeOut());

    const unsubscribe = audioEngine.onSleepTimerChange(secs => {
      setSleepSecondsLeft(secs);
    });
    return unsubscribe;
  }, [isOpen]);

  const formatTimeLeft = (secs: number) => {
    if (secs <= 0) return '';
    const m = Math.floor(secs / 60);
    const s = secs % 60;
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  if (!isOpen) return null;

  const handleSave = () => {
    try {
      // 1. Persist Buffer Size locally and update both audio engines immediately
      localStorage.setItem('radiostream_buffer_size', bufferSize);
      audioEngine.setBufferSize(bufferSize);
      driveAudioEngine.setBufferSize(bufferSize);

      // 2. Persist Drive Crossfade locally and update engine
      localStorage.setItem('myradiopro_drive_crossfade', String(driveCrossfade));
      driveAudioEngine.setCrossfadeSeconds(driveCrossfade);

      // 3. Persist Fade Out Minutes
      localStorage.setItem('radiostream_fade_mins', fadeOutMins.toString());

      // 4. Persist Synthesizer and Low Data preferences
      localStorage.setItem('myradiopro_synth_fallback', String(synthFallback));
      localStorage.setItem('myradiopro_low_data', String(lowDataMode));

      // 5. Notify parent (App.tsx) to sync settings with Cloud Firestore
      if (onSaveSettings) {
        onSaveSettings({
          bufferSize,
          driveCrossfade,
          fadeOutMins,
          synthFallback,
          lowDataMode,
        });
      }
    } catch {
      // ignore
    }
    setSavedToast(true);
    setTimeout(() => {
      setSavedToast(false);
      onClose();
    }, 700);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm scanlines">
      <div className="bg-[#201f1f] border-3 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full p-6 flex flex-col gap-5 relative max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b-2 border-black pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4edea3] text-2xl">settings</span>
            <h2 className="font-black text-xl text-white uppercase font-['Inter']">
              Ajustes de Myradio 1.0 Pro
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#bbcabf] hover:text-white p-1"
            title="Cerrar"
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Settings Sections */}
        <div className="flex flex-col gap-4">
          {/* Buffer Size */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-mono-tech text-xs text-white font-bold uppercase">
                Tamaño de Buffer de Transmisión
              </span>
              <span className="font-mono-tech text-xs text-[#4edea3] font-bold">{bufferSize}</span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              Mayor buffer previene microcortes en redes móviles inestables.
            </p>
            <div className="grid grid-cols-4 gap-2 mt-1">
              {['64KB', '128KB', '256KB', '512KB'].map(size => (
                <button
                  key={size}
                  onClick={() => setBufferSize(size)}
                  className={`py-1.5 font-mono-tech text-xs font-bold border-2 border-black uppercase ${
                    bufferSize === size
                      ? 'bg-[#4edea3] text-[#003824]'
                      : 'bg-[#201f1f] text-white hover:bg-[#353534]'
                  }`}
                >
                  {size}
                </button>
              ))}
            </div>
          </div>

          {/* Sleep Timer (Temporizador de Apagado) */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4edea3] text-base">bedtime</span>
                <span className="font-mono-tech text-xs text-white font-bold uppercase">
                  Temporizador de Apagado (Sleep Timer)
                </span>
              </div>
              {sleepSecondsLeft > 0 && (
                <span className="font-mono-tech text-xs text-[#4edea3] font-bold animate-pulse">
                  Apagando en {formatTimeLeft(sleepSecondsLeft)}
                </span>
              )}
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              Detiene la reproducción de audio automáticamente tras el tiempo seleccionado (audioEngine.stop).
            </p>
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {[
                { label: 'Off', mins: 0 },
                { label: '15m', mins: 15 },
                { label: '30m', mins: 30 },
                { label: '45m', mins: 45 },
                { label: '60m', mins: 60 },
              ].map(item => {
                const isActive =
                  (item.mins === 0 && sleepSecondsLeft === 0) ||
                  (item.mins > 0 && Math.abs(sleepSecondsLeft - item.mins * 60) < 60);
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      if (item.mins === 0) {
                        audioEngine.cancelSleepTimer();
                      } else {
                        audioEngine.setSleepTimer(item.mins, fadeOutMins);
                      }
                    }}
                    className={`py-1.5 font-mono-tech text-xs font-bold border-2 border-black uppercase cursor-pointer ${
                      isActive
                        ? 'bg-[#4edea3] text-[#003824] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-[#201f1f] text-white hover:bg-[#353534]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
            {sleepSecondsLeft > 0 && (
              <button
                type="button"
                onClick={() => audioEngine.cancelSleepTimer()}
                className="mt-1 bg-[#EF4444]/20 border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/30 py-1 font-mono-tech text-[10px] font-bold uppercase cursor-pointer"
              >
                Cancelar Temporizador Activo
              </button>
            )}
          </div>

          {/* Fade Out Duration */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-mono-tech text-xs text-white font-bold uppercase">
                Duración de Fade-Out (Temporizador)
              </span>
              <span className="font-mono-tech text-xs text-[#8B5CF6] font-bold">
                {fadeOutMins} Minutos
              </span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              Atenuación suave progresiva de volumen (-3dB/min) antes del apagado.
            </p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[3, 5, 10].map(mins => (
                <button
                  key={mins}
                  onClick={() => setFadeOutMins(mins)}
                  className={`py-1.5 font-mono-tech text-xs font-bold border-2 border-black uppercase ${
                    fadeOutMins === mins
                      ? 'bg-[#8B5CF6] text-white'
                      : 'bg-[#201f1f] text-white hover:bg-[#353534]'
                  }`}
                >
                  {mins} min
                </button>
              ))}
            </div>
          </div>

          {/* Crossfade de Google Drive */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4edea3] text-base">shuffle</span>
                <span className="font-mono-tech text-xs text-white font-bold uppercase">
                  Crossfade entre canciones de Drive
                </span>
              </div>
              <span className="font-mono-tech text-xs text-[#4edea3] font-bold">
                {driveCrossfade === 0 ? 'Desactivado' : `${driveCrossfade} Segundos`}
              </span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              Fundido cruzado continuo y sin silencios entre pistas consecutivas de Google Drive.
            </p>
            <div className="grid grid-cols-5 gap-1.5 mt-1">
              {[
                { label: 'Off', sec: 0 },
                { label: '3s', sec: 3 },
                { label: '5s', sec: 5 },
                { label: '8s', sec: 8 },
                { label: '12s', sec: 12 },
              ].map(item => {
                const isActive = driveCrossfade === item.sec;
                return (
                  <button
                    key={item.label}
                    type="button"
                    onClick={() => {
                      setDriveCrossfade(item.sec);
                      driveAudioEngine.setCrossfadeSeconds(item.sec);
                    }}
                    className={`py-1.5 font-mono-tech text-xs font-bold border-2 border-black uppercase cursor-pointer transition-all ${
                      isActive
                        ? 'bg-[#4edea3] text-[#003824] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-[#201f1f] text-white hover:bg-[#353534]'
                    }`}
                  >
                    {item.label}
                  </button>
                );
              })}
            </div>
          </div>

          {/* Toggle Synth Fallback */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center">
            <div>
              <div className="font-mono-tech text-xs text-white font-bold uppercase">
                Sintetizador de Respaldo WebAudio
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                Genera audio continuo si la emisora externa tiene cortes de red.
              </div>
            </div>
            <label className="neo-toggle shrink-0 ml-3">
              <input
                type="checkbox"
                checked={synthFallback}
                onChange={e => setSynthFallback(e.target.checked)}
              />
              <span className="neo-toggle-slider"></span>
            </label>
          </div>

          {/* Low Data Mode */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center">
            <div>
              <div className="font-mono-tech text-xs text-white font-bold uppercase">
                Modo Ahorro de Datos (Low Bitrate)
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                Prioriza codecs AAC 64kbps para reducir consumo en datos móviles.
              </div>
            </div>
            <label className="neo-toggle shrink-0 ml-3">
              <input
                type="checkbox"
                checked={lowDataMode}
                onChange={e => setLowDataMode(e.target.checked)}
              />
              <span className="neo-toggle-slider"></span>
            </label>
          </div>

          {/* Language Switch */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center">
            <div>
              <div className="font-mono-tech text-xs text-white font-bold uppercase">
                Idioma de la Interfaz
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                Español (ES) / English (EN)
              </div>
            </div>
            <button
              onClick={onToggleLang}
              className="neo-button bg-[#201f1f] text-white px-4 py-1.5 border-2 border-black font-mono-tech text-xs font-bold"
            >
              {lang === 'ES' ? 'Español' : 'English'}
            </button>
          </div>

          {/* Privacy Policy Link */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center">
            <div>
              <div className="font-mono-tech text-xs text-white font-bold uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4edea3]">verified_user</span>
                <span>Política de Privacidad y Seguridad</span>
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                Permisos Google Drive, búfer offline IndexedDB y protección de datos.
              </div>
            </div>
            <button
              onClick={() => setShowPrivacyModal(true)}
              className="neo-button bg-[#062436] hover:bg-[#073048] text-cyan-300 border-2 border-cyan-500/60 px-3.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 cursor-pointer shrink-0 ml-3"
            >
              <span>Ver</span>
              <span className="material-symbols-outlined text-sm">open_in_new</span>
            </button>
          </div>

          {/* System Specs Readout */}
          <div className="bg-[#0e0e0e] p-3 border-2 border-black font-mono-tech text-[10px] text-[#86948a] flex flex-col gap-1">
            <div className="text-white font-bold">ESPECIFICACIONES DEL SISTEMA:</div>
            <div>• Motor de Audio: HTML5 Audio + Web Audio API (AnalyserNode 64 FFT)</div>
            <div>• Almacenamiento Local: SQLite Synced / LocalStorage Persistent DB</div>
            <div>• Estado del Sistema: {favoritesCount} Favoritas | {alarmsCount} Alarmas</div>
            <div>• Identidad Visual: Signal Zero Neo-Brutalist 3px Hard-Edge</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#353534] text-white py-3 border-3 border-black font-mono-tech text-xs font-bold uppercase hover:bg-[#4a4948]"
          >
            Cerrar
          </button>
          <button
            onClick={handleSave}
            className="flex-1 neo-button bg-[#4edea3] text-[#003824] py-3 border-3 border-black font-mono-tech text-xs font-bold uppercase hover:bg-[#38c98e]"
          >
            {savedToast ? '¡Guardado!' : 'Guardar Ajustes'}
          </button>
        </div>
      </div>

      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
    </div>
  );
};
