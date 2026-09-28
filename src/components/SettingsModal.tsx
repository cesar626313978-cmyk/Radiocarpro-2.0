import React, { useState, useEffect } from 'react';
import { audioEngine } from '../services/audioEngine';
import { driveAudioEngine } from '../services/driveAudioEngine';
import { PrivacyPolicyModal } from './PrivacyPolicyModal';
import { db, auth } from '../services/firebase';
import { collection, addDoc } from 'firebase/firestore';
import { useTranslation } from '../i18n/LanguageContext';

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  lang: 'ES' | 'EN';
  onToggleLang: () => void;
  favoritesCount: number;
  alarmsCount: number;
  onOpenThemes?: () => void;
  activeThemeName?: string;
  onSaveSettings?: (settings: {
    bufferSize: string;
    driveCrossfade: number;
    fadeOutMins: number;
    synthFallback: boolean;
    lowDataMode: boolean;
    dynamicNormalizer: boolean;
  }) => void;
  currentSettings?: {
    bufferSize?: string;
    driveCrossfade?: number;
    fadeOutMins?: number;
    synthFallback?: boolean;
    lowDataMode?: boolean;
    dynamicNormalizer?: boolean;
  };
}

export const SettingsModal: React.FC<SettingsModalProps> = ({
  isOpen,
  onClose,
  lang,
  onToggleLang,
  favoritesCount,
  alarmsCount,
  onOpenThemes,
  activeThemeName,
  onSaveSettings,
  currentSettings,
}) => {
  const { t, lang: ctxLang, toggleLang: ctxToggleLang } = useTranslation();
  const currentLang = lang || ctxLang;
  const handleToggleLang = () => {
    ctxToggleLang();
    if (onToggleLang) {
      onToggleLang();
    }
  };

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
  const [dynamicNormalizer, setDynamicNormalizer] = useState<boolean>(() => {
    if (typeof currentSettings?.dynamicNormalizer === 'boolean') return currentSettings.dynamicNormalizer;
    try {
      return localStorage.getItem('myradiopro_dynamic_normalizer') !== 'false';
    } catch {
      return true;
    }
  });
  const [savedToast, setSavedToast] = useState(false);

  const [sleepSecondsLeft, setSleepSecondsLeft] = useState(() => audioEngine.getSleepTimerSeconds());
  const [customMinutes, setCustomMinutes] = useState<string>('');
  const [showPrivacyModal, setShowPrivacyModal] = useState<boolean>(false);

  // Formulario de Contacto y Feedback
  const [feedbackType, setFeedbackType] = useState<'fallo' | 'mejora' | 'comentario' | 'soporte'>('comentario');
  const [feedbackName, setFeedbackName] = useState('');
  const [feedbackEmail, setFeedbackEmail] = useState('');
  const [feedbackMessage, setFeedbackMessage] = useState('');
  const [feedbackStatus, setFeedbackStatus] = useState<'idle' | 'sending' | 'success' | 'error'>('idle');
  const [feedbackErrorMsg, setFeedbackErrorMsg] = useState('');

  // When modal opens, synchronize state with stored values and engines
  useEffect(() => {
    if (!isOpen) return;
    setBufferSize(getInitialBufferSize());
    setDriveCrossfade(getInitialCrossfade());
    setFadeOutMins(getInitialFadeOut());

    // Pre-fill email if user is logged in
    const currentUser = auth.currentUser;
    if (currentUser && currentUser.email) {
      setFeedbackEmail(currentUser.email);
    }
    // Reset form on open
    setFeedbackStatus('idle');
    setFeedbackMessage('');

    const unsubscribe = audioEngine.onSleepTimerChange(secs => {
      setSleepSecondsLeft(secs);
    });
    return unsubscribe;
  }, [isOpen]);

  const formatTimeLeft = (secs: number) => {
    if (secs <= 0) return '';
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) {
      return `${h}h ${m.toString().padStart(2, '0')}m ${s.toString().padStart(2, '0')}s`;
    }
    return `${m.toString().padStart(2, '0')}:${s.toString().padStart(2, '0')}`;
  };

  const handleSetCustomSleepTimer = (e: React.FormEvent) => {
    e.preventDefault();
    const mins = parseInt(customMinutes, 10);
    if (!isNaN(mins) && mins > 0) {
      audioEngine.setSleepTimer(mins, fadeOutMins);
      setCustomMinutes('');
    }
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

      // 4. Persist Synthesizer, Low Data and Dynamic Normalizer preferences
      localStorage.setItem('myradiopro_synth_fallback', String(synthFallback));
      localStorage.setItem('myradiopro_low_data', String(lowDataMode));
      localStorage.setItem('myradiopro_dynamic_normalizer', String(dynamicNormalizer));
      driveAudioEngine.setVolumeNormalization(dynamicNormalizer);

      // 5. Notify parent (App.tsx) to sync settings with Cloud Firestore
      if (onSaveSettings) {
        onSaveSettings({
          bufferSize,
          driveCrossfade,
          fadeOutMins,
          synthFallback,
          lowDataMode,
          dynamicNormalizer,
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

  const handleSendFeedback = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!feedbackMessage.trim() || feedbackMessage.trim().length < 5) {
      setFeedbackStatus('error');
      setFeedbackErrorMsg(lang === 'ES' ? 'El mensaje debe tener al menos 5 caracteres.' : 'Message must be at least 5 characters.');
      return;
    }

    setFeedbackStatus('sending');
    setFeedbackErrorMsg('');

    try {
      const timestamp = new Date().toISOString();
      const payload = {
        name: feedbackName.trim() || 'Anónimo',
        email: feedbackEmail.trim() || 'No proporcionado',
        type: feedbackType,
        message: feedbackMessage.trim(),
        timestamp,
        userAgent: typeof navigator !== 'undefined' ? navigator.userAgent : 'Unknown',
        sourceApp: 'MyRadio Pro 2.0 Web'
      };

      // 1. Guardar copia de seguridad en Firestore (Privado, 100% seguro)
      try {
        await addDoc(collection(db, 'feedback'), payload);
      } catch (dbErr) {
        console.warn('Fallo al guardar copia en Firestore:', dbErr);
      }

      // 2. Enviar email de forma segura vía FormSubmit sin exponer el email en código fuente claro
      const encodedDest = 'Y2VzYXI2MjYzMTM5NzhAZ21haWwuY29t'; // cesar626313978@gmail.com
      const destEmail = atob(encodedDest);

      const response = await fetch(`https://formsubmit.co/ajax/${destEmail}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Accept': 'application/json'
        },
        body: JSON.stringify({
          _subject: `[MyRadio Pro 2.0] Nuevo ${feedbackType.toUpperCase()} de ${payload.name}`,
          Nombre: payload.name,
          Email: payload.email,
          Tipo: feedbackType.toUpperCase(),
          Mensaje: payload.message,
          Fecha: timestamp,
          _honey: '', // Campo trampa anti-spam
        })
      });

      if (response.ok) {
        setFeedbackStatus('success');
        setFeedbackMessage('');
        setFeedbackName('');
      } else {
        throw new Error('FormSubmit returned error status');
      }
    } catch (err) {
      console.error('Error al enviar feedback:', err);
      setFeedbackStatus('error');
      setFeedbackErrorMsg(
        lang === 'ES' 
          ? 'Hubo un problema al enviar el formulario. Por favor, inténtalo de nuevo.' 
          : 'There was a problem sending the form. Please try again.'
      );
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm scanlines">
      <div className="bg-[#201f1f] border-3 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] max-w-lg w-full p-6 flex flex-col gap-5 relative max-h-[90vh] overflow-y-auto">
        {/* Modal Header */}
        <div className="flex justify-between items-center border-b-2 border-black pb-3">
          <div className="flex items-center gap-2">
            <span className="material-symbols-outlined text-[#4edea3] text-2xl">settings</span>
            <h2 className="font-black text-xl text-white uppercase font-['Inter']">
              {t.settings.title}
            </h2>
          </div>
          <button
            onClick={onClose}
            className="text-[#bbcabf] hover:text-white p-1 cursor-pointer"
            title={t.settings.close}
          >
            <span className="material-symbols-outlined">close</span>
          </button>
        </div>

        {/* Settings Sections */}
        <div className="flex flex-col gap-4">
          {/* Biomas y Temas Dinámicos */}
          {onOpenThemes && (
            <div className="bg-[#131313] p-3.5 border-2 border-black flex items-center justify-between gap-3 shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
              <div className="flex flex-col gap-0.5">
                <div className="flex items-center gap-2">
                  <span
                    className="material-symbols-outlined text-lg"
                    style={{ color: 'var(--color-accent, #00e5ff)' }}
                  >
                    palette
                  </span>
                  <span className="font-mono-tech text-xs text-white font-bold uppercase">
                    {t.settings.themeBiomeTitle}
                  </span>
                </div>
                <p className="font-mono-tech text-[10px] text-[#bbcabf]">
                  {t.settings.currentTheme}: <span className="font-bold text-white" style={{ color: 'var(--color-accent, #00e5ff)' }}>{activeThemeName || (currentLang === 'ES' ? 'Espacio Exterior' : 'Outer Space')}</span>
                </p>
              </div>
              <button
                type="button"
                onClick={() => {
                  onClose();
                  onOpenThemes();
                }}
                className="neo-button border-2 border-black px-3 py-1.5 font-mono-tech text-xs font-bold uppercase shrink-0 cursor-pointer shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
                style={{
                  backgroundColor: 'var(--color-hud-center, #081326)',
                  color: 'var(--color-accent, #00e5ff)',
                }}
              >
                {t.settings.changeBiome}
              </button>
            </div>
          )}

          {/* Buffer Size */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-mono-tech text-xs text-white font-bold uppercase">
                {t.settings.bufferTitle}
              </span>
              <span className="font-mono-tech text-xs text-[#4edea3] font-bold">{bufferSize}</span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              {t.settings.bufferDesc}
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
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2.5">
            <div className="flex justify-between items-center flex-wrap gap-1.5">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4edea3] text-base">bedtime</span>
                <span className="font-mono-tech text-xs text-white font-bold uppercase">
                  {t.settings.sleepTimerTitle}
                </span>
              </div>
              {sleepSecondsLeft > 0 && (
                <span className="font-mono-tech text-xs text-[#4edea3] font-bold animate-pulse flex items-center gap-1 bg-[#052e16] border border-[#10B981] px-2 py-0.5">
                  <span className="material-symbols-outlined text-xs">timer</span>
                  {t.settings.stopsIn} {formatTimeLeft(sleepSecondsLeft)}
                </span>
              )}
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf] leading-normal">
              {t.settings.sleepTimerDesc}
            </p>

            {/* Presets Grid */}
            <div className="grid grid-cols-3 sm:grid-cols-6 gap-1.5 mt-0.5">
              {[
                { label: 'Off', mins: 0 },
                { label: '15m', mins: 15 },
                { label: '30m', mins: 30 },
                { label: '45m', mins: 45 },
                { label: '60m', mins: 60 },
                { label: '90m', mins: 90 },
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
                    className={`py-2 px-1 font-mono-tech text-xs font-bold border-2 border-black uppercase cursor-pointer transition-all flex items-center justify-center gap-1 ${
                      isActive
                        ? 'bg-[#4edea3] text-[#003824] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]'
                        : 'bg-[#201f1f] text-white hover:bg-[#353534]'
                    }`}
                  >
                    {isActive && item.mins > 0 && (
                      <span className="material-symbols-outlined text-xs font-black">check</span>
                    )}
                    <span>{item.label}</span>
                  </button>
                );
              })}
            </div>

            {/* Custom Minutes Input */}
            <form onSubmit={handleSetCustomSleepTimer} className="flex items-center gap-2 mt-0.5">
              <div className="relative flex-1">
                <input
                  type="number"
                  min="1"
                  max="480"
                  placeholder={t.settings.customMinsPlaceholder}
                  value={customMinutes}
                  onChange={e => setCustomMinutes(e.target.value)}
                  className="w-full bg-[#201f1f] text-white border border-black p-1.5 font-mono-tech text-xs outline-none focus:border-[#4edea3]"
                />
              </div>
              <button
                type="submit"
                disabled={!customMinutes || parseInt(customMinutes, 10) <= 0}
                className="neo-button bg-[#8B5CF6] text-white px-3.5 py-1.5 font-mono-tech text-xs font-bold uppercase border-2 border-black flex items-center gap-1 hover:bg-[#7c3aed] cursor-pointer disabled:opacity-40 transition-all shrink-0"
              >
                <span className="material-symbols-outlined text-xs">alarm_add</span>
                <span>{t.settings.set}</span>
              </button>
            </form>

            {sleepSecondsLeft > 0 && (
              <button
                type="button"
                onClick={() => audioEngine.cancelSleepTimer()}
                className="mt-1 bg-[#EF4444]/20 border border-[#EF4444] text-[#EF4444] hover:bg-[#EF4444]/30 py-1.5 font-mono-tech text-xs font-bold uppercase cursor-pointer flex items-center justify-center gap-1.5 transition-all"
              >
                <span className="material-symbols-outlined text-sm">stop_circle</span>
                <span>{t.settings.cancelActiveTimer}</span>
              </button>
            )}
          </div>

          {/* Fade Out Duration */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2">
            <div className="flex justify-between items-center">
              <span className="font-mono-tech text-xs text-white font-bold uppercase">
                {t.settings.fadeOutTitle}
              </span>
              <span className="font-mono-tech text-xs text-[#8B5CF6] font-bold">
                {fadeOutMins} {t.settings.minutes}
              </span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              {t.settings.fadeOutDesc}
            </p>
            <div className="grid grid-cols-3 gap-2 mt-1">
              {[3, 5, 10].map(mins => (
                <button
                  key={mins}
                  onClick={() => setFadeOutMins(mins)}
                  className={`py-1.5 font-mono-tech text-xs font-bold border-2 border-black uppercase cursor-pointer ${
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
                  {t.settings.crossfadeTitle}
                </span>
              </div>
              <span className="font-mono-tech text-xs text-[#4edea3] font-bold">
                {driveCrossfade === 0 ? t.settings.crossfadeDisabled : `${driveCrossfade} ${t.settings.seconds}`}
              </span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf]">
              {t.settings.crossfadeDesc}
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

          {/* Normalizador de Dinámica (AGC) */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center">
            <div className="flex-1 pr-3">
              <div className="flex items-center gap-2">
                <span className="material-symbols-outlined text-[#4edea3] text-base">tune</span>
                <span className="font-mono-tech text-xs text-white font-bold uppercase">
                  {t.settings.dynamicNormalizerTitle}
                </span>
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                {t.settings.dynamicNormalizerDesc}
              </div>
            </div>
            <label className="neo-toggle shrink-0 ml-3">
              <input
                type="checkbox"
                checked={dynamicNormalizer}
                onChange={e => {
                  setDynamicNormalizer(e.target.checked);
                  driveAudioEngine.setVolumeNormalization(e.target.checked);
                }}
              />
              <span className="neo-toggle-slider"></span>
            </label>
          </div>

          {/* Toggle Synth Fallback */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center">
            <div>
              <div className="font-mono-tech text-xs text-white font-bold uppercase">
                {t.settings.synthFallbackTitle}
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                {t.settings.synthFallbackDesc}
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
                {t.settings.lowDataModeTitle}
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                {t.settings.lowDataModeDesc}
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
          <div className="bg-[#131313] p-3.5 border-2 border-black flex justify-between items-center shadow-[2px_2px_0px_0px_rgba(0,0,0,1)]">
            <div>
              <div className="font-mono-tech text-xs text-white font-bold uppercase flex items-center gap-1.5">
                <span className="material-symbols-outlined text-sm text-[#4edea3]">language</span>
                <span>{t.settings.languageTitle}</span>
              </div>
              <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                {t.settings.languageDesc}
              </div>
            </div>
            <button
              onClick={handleToggleLang}
              className="neo-button bg-[#4edea3] text-[#003824] px-4 py-1.5 border-2 border-black font-mono-tech text-xs font-black uppercase cursor-pointer hover:bg-[#38c98e] shadow-[2px_2px_0px_0px_rgba(0,0,0,1)] active:translate-y-0.5"
            >
              {currentLang === 'ES' ? 'Español (ES)' : 'English (EN)'}
            </button>
          </div>

          {/* Privacy Policy Link */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-2.5">
            <div className="flex justify-between items-center">
              <div>
                <div className="font-mono-tech text-xs text-white font-bold uppercase flex items-center gap-1.5">
                  <span className="material-symbols-outlined text-sm text-[#4edea3]">verified_user</span>
                  <span>{t.settings.privacyTitle}</span>
                </div>
                <div className="font-mono-tech text-[10px] text-[#bbcabf] mt-0.5">
                  {t.settings.privacyDesc}
                </div>
              </div>
              <button
                onClick={() => setShowPrivacyModal(true)}
                className="neo-button bg-[#062436] hover:bg-[#073048] text-cyan-300 border-2 border-cyan-500/60 px-3.5 py-1.5 font-mono-tech text-xs font-bold uppercase flex items-center gap-1 cursor-pointer shrink-0 ml-3"
              >
                <span>{t.settings.view}</span>
                <span className="material-symbols-outlined text-sm">open_in_new</span>
              </button>
            </div>

            {/* Direct Official Links */}
            <div className="flex flex-wrap items-center gap-2 pt-1 border-t border-[#222]">
              <a
                href="https://www.audio-car.es/privacidad.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 border border-cyan-500/40 text-cyan-300 hover:text-white hover:border-cyan-300 text-[10px] font-mono-tech transition-all"
              >
                <span className="material-symbols-outlined text-[11px] text-cyan-400">policy</span>
                <span>audio-car.es/privacidad.html</span>
                <span className="material-symbols-outlined text-[10px]">open_in_new</span>
              </a>
              <a
                href="https://www.audio-car.es/terminos.html"
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-black/60 border border-amber-500/40 text-amber-300 hover:text-white hover:border-amber-300 text-[10px] font-mono-tech transition-all"
              >
                <span className="material-symbols-outlined text-[11px] text-amber-400">description</span>
                <span>audio-car.es/terminos.html</span>
                <span className="material-symbols-outlined text-[10px]">open_in_new</span>
              </a>
            </div>
          </div>

          {/* Formulario de Contacto / Soporte / Sugerencias */}
          <div className="bg-[#131313] p-3.5 border-2 border-black flex flex-col gap-3">
            <div className="flex items-center gap-2 border-b border-black pb-1.5">
              <span className="material-symbols-outlined text-[#4edea3] text-lg">mail</span>
              <span className="font-mono-tech text-xs text-white font-bold uppercase">
                {t.settings.contactTitle}
              </span>
            </div>
            <p className="font-mono-tech text-[10px] text-[#bbcabf] leading-normal">
              {t.settings.contactDesc}
            </p>

            {feedbackStatus === 'success' ? (
              <div className="bg-[#052e16] border border-[#10B981] p-3 text-center flex flex-col gap-1">
                <span className="material-symbols-outlined text-[#10B981] text-2xl">check_circle</span>
                <div className="font-mono-tech text-xs text-white font-bold uppercase">
                  {t.settings.messageSent}
                </div>
                <div className="font-mono-tech text-[9px] text-[#10B981]">
                  {t.settings.messageSentDesc}
                </div>
                <button
                  type="button"
                  onClick={() => setFeedbackStatus('idle')}
                  className="mt-2 text-white hover:underline text-[9px] font-mono-tech uppercase"
                >
                  {t.settings.sendAnother}
                </button>
              </div>
            ) : (
              <form onSubmit={handleSendFeedback} className="flex flex-col gap-2.5">
                <div className="grid grid-cols-2 gap-2">
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-tech text-[9px] text-[#bbcabf] uppercase font-bold">
                      {t.settings.nameAlias}
                    </label>
                    <input
                      type="text"
                      placeholder={t.settings.optional}
                      value={feedbackName}
                      onChange={e => setFeedbackName(e.target.value)}
                      className="bg-[#201f1f] text-white border border-black p-1.5 font-mono-tech text-xs outline-none focus:border-[#4edea3]"
                    />
                  </div>
                  <div className="flex flex-col gap-1">
                    <label className="font-mono-tech text-[9px] text-[#bbcabf] uppercase font-bold">
                      {t.settings.yourEmail}
                    </label>
                    <input
                      type="email"
                      placeholder={t.settings.optional}
                      value={feedbackEmail}
                      onChange={e => setFeedbackEmail(e.target.value)}
                      className="bg-[#201f1f] text-white border border-black p-1.5 font-mono-tech text-xs outline-none focus:border-[#4edea3]"
                    />
                  </div>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-mono-tech text-[9px] text-[#bbcabf] uppercase font-bold">
                    {t.settings.messageType}
                  </label>
                  <select
                    value={feedbackType}
                    onChange={e => setFeedbackType(e.target.value as any)}
                    className="bg-[#201f1f] text-white border border-black p-1.5 font-mono-tech text-xs outline-none focus:border-[#4edea3]"
                  >
                    <option value="comentario">{t.settings.comment}</option>
                    <option value="fallo">{t.settings.bug}</option>
                    <option value="mejora">{t.settings.improvement}</option>
                    <option value="soporte">{t.settings.support}</option>
                  </select>
                </div>

                <div className="flex flex-col gap-1">
                  <label className="font-mono-tech text-[9px] text-[#bbcabf] uppercase font-bold">
                    {t.settings.message}
                  </label>
                  <textarea
                    rows={3}
                    placeholder={t.settings.messagePlaceholder}
                    value={feedbackMessage}
                    onChange={e => setFeedbackMessage(e.target.value)}
                    className="bg-[#201f1f] text-white border border-black p-1.5 font-mono-tech text-xs outline-none focus:border-[#4edea3] resize-none h-20"
                    required
                  />
                </div>

                {feedbackStatus === 'error' && (
                  <div className="text-[#EF4444] font-mono-tech text-[10px] font-bold bg-[#EF4444]/10 p-2 border border-[#EF4444]/30">
                    {feedbackErrorMsg}
                  </div>
                )}

                <button
                  type="submit"
                  disabled={feedbackStatus === 'sending'}
                  className="neo-button bg-[#8B5CF6] text-white font-mono-tech text-xs font-bold uppercase py-2 border-2 border-black flex items-center justify-center gap-1.5 cursor-pointer hover:bg-[#7c3aed] disabled:opacity-50"
                >
                  {feedbackStatus === 'sending' ? (
                    <>
                      <span className="material-symbols-outlined text-sm animate-spin">progress_activity</span>
                      <span>{t.settings.sending}</span>
                    </>
                  ) : (
                    <>
                      <span className="material-symbols-outlined text-sm">send</span>
                      <span>{t.settings.sendMessage}</span>
                    </>
                  )}
                </button>
              </form>
            )}
          </div>

          {/* System Specs Readout */}
          <div className="bg-[#0e0e0e] p-3 border-2 border-black font-mono-tech text-[10px] text-[#86948a] flex flex-col gap-1">
            <div className="text-white font-bold">{t.settings.systemSpecsTitle}</div>
            <div>• {t.settings.audioEngineSpec}</div>
            <div>• {t.settings.localStorageSpec}</div>
            <div>• {t.settings.systemStatusSpec}: {favoritesCount} {t.nav.favorites} | {alarmsCount} 0</div>
            <div>• {t.settings.visualIdentitySpec}</div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-3 mt-2">
          <button
            onClick={onClose}
            className="flex-1 bg-[#353534] text-white py-3 border-3 border-black font-mono-tech text-xs font-bold uppercase hover:bg-[#4a4948]"
          >
            {t.common.close}
          </button>
          <button
            onClick={handleSave}
            className="flex-1 neo-button bg-[#4edea3] text-[#003824] py-3 border-3 border-black font-mono-tech text-xs font-bold uppercase hover:bg-[#38c98e]"
          >
            {savedToast ? t.common.saved : t.settings.saveSettings}
          </button>
        </div>
      </div>

      <PrivacyPolicyModal isOpen={showPrivacyModal} onClose={() => setShowPrivacyModal(false)} />
    </div>
  );
};
