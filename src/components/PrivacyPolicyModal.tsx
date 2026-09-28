import React from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { useTranslation } from '../i18n/LanguageContext';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  const { lang, t } = useTranslation();
  if (!isOpen) return null;

  const isEn = lang === 'EN';

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-6 bg-black/80 backdrop-blur-md select-none font-sans">
        <motion.div
          initial={{ opacity: 0, scale: 0.94, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.94, y: 15 }}
          transition={{ duration: 0.2, ease: 'easeOut' }}
          className="relative w-full max-w-2xl max-h-[85vh] flex flex-col bg-[#06121c] border-2 border-cyan-500/60 rounded-2xl shadow-[0_0_40px_rgba(6,182,212,0.35)] overflow-hidden text-white"
        >
          {/* Header */}
          <div className="flex items-center justify-between px-5 py-4 border-b border-cyan-500/30 bg-black/40 backdrop-blur-md">
            <div className="flex items-center gap-2.5">
              <div className="w-8 h-8 rounded-full bg-cyan-950 border border-cyan-400 flex items-center justify-center text-cyan-300 shadow-[0_0_10px_rgba(6,182,212,0.5)]">
                <span className="material-symbols-outlined text-lg">shield</span>
              </div>
              <div>
                <h2 className="text-sm sm:text-base font-black tracking-wider uppercase text-cyan-100">
                  {isEn ? 'Privacy & Security Policy' : 'Política de Privacidad y Seguridad'}
                </h2>
                <p className="text-[10px] sm:text-xs text-cyan-400/80 font-mono">
                  {isEn ? 'Myradio Pro 2.0 • Car Mode & Streaming' : 'Myradio Pro 2.0 • Modo Coche y Streaming'}
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer"
              title={t.common.close}
            >
              <span className="material-symbols-outlined text-lg">close</span>
            </button>
          </div>

          {/* Scrollable Content */}
          <div className="flex-1 overflow-y-auto p-5 sm:p-6 space-y-5 text-xs sm:text-sm text-gray-300 leading-relaxed font-sans scrollbar-thin scrollbar-thumb-cyan-500/50 scrollbar-track-transparent">
            {/* Section 1 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">cloud_download</span>
                <span>{isEn ? '1. Strict Google Drive Access' : '1. Acceso Estricto a Google Drive'}</span>
              </div>
              <p className="text-gray-300 text-xs">
                {isEn
                  ? 'Google Drive integration strictly uses read-only permission (drive.readonly) to access audio files inside your /mimusica folder.'
                  : 'La integración con Google Drive utiliza exclusivamente el permiso de solo lectura (drive.readonly) para acceder a los archivos de audio contenidos en tu carpeta /mimusica.'}
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] sm:text-xs text-gray-400">
                <li><strong className="text-gray-200">{isEn ? 'No intermediate servers:' : 'Sin servidores intermedios:'}</strong> {isEn ? 'Audio streams directly between Google servers and your browser over encrypted HTTPS.' : 'El audio se descarga directamente entre los servidores de Google y tu navegador mediante canal HTTPS cifrado.'}</li>
                <li><strong className="text-gray-200">{isEn ? 'No modification or deletion:' : 'Sin modificación ni borrado:'}</strong> {isEn ? 'The application has no write, edit, or delete permissions over your files.' : 'La aplicación no tiene permisos de escritura, modificación ni eliminación sobre tus archivos.'}</li>
                <li><strong className="text-gray-200">{isEn ? 'Total isolation:' : 'Aislamiento total:'}</strong> {isEn ? 'We never access documents, photos, or any other personal data outside the authorized music folder.' : 'No accedemos a documentos, fotos ni ningún otro dato personal fuera de la carpeta musical autorizada.'}</li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">save</span>
                <span>{isEn ? '2. Local Storage & Car Buffer (IndexedDB)' : '2. Almacenamiento Local y Búfer Coche (IndexedDB)'}</span>
              </div>
              <p className="text-gray-300 text-xs">
                {isEn
                  ? 'To prevent cutouts in tunnels or low cellular reception zones, active songs and stations are temporarily cached in your browser IndexedDB.'
                  : 'Para evitar microcortes al circular por túneles o zonas con baja cobertura móvil, las canciones y emisoras activas se almacenan temporalmente en la base de datos local IndexedDB de tu propio navegador.'}
              </p>
              <p className="text-[11px] sm:text-xs text-gray-400">
                {isEn
                  ? 'This data never leaves your device and can be cleared anytime by logging out or resetting app cache.'
                  : 'Estos datos nunca salen de tu coche o dispositivo y pueden borrarse en cualquier momento cerrando sesión o limpiando la caché de la aplicación.'}
              </p>
            </div>

            {/* Section 3 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">sync</span>
                <span>{isEn ? '3. Cloud Synchronization (Firebase Firestore)' : '3. Sincronización en la Nube (Firebase Firestore)'}</span>
              </div>
              <p className="text-gray-300 text-xs">
                {isEn
                  ? 'If you sign in with Google or pair your car via QR code, we only store encrypted in Firestore database:'
                  : 'Si inicias sesión con tu cuenta de Google o vinculas tu vehículo mediante código QR del coche, almacenamos de forma cifrada en la base de datos Firestore únicamente:'}
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] sm:text-xs text-gray-400">
                <li>{isEn ? 'Your unique user ID and account email.' : 'Tu identificador único de usuario y correo electrónico de cuenta.'}</li>
                <li>{isEn ? 'Your favorite radio station list and audio preferences synced between phone and car.' : 'Tu lista de emisoras de radio favoritas y preferencias de audio para sincronizarlas entre tu móvil y tu coche.'}</li>
                <li><strong className="text-emerald-400">{isEn ? 'Never' : 'Nunca'}</strong> {isEn ? 'do we ask for or store passwords or payment methods.' : 'solicitamos ni almacenamos contraseñas, medios de pago ni información financiera.'}</li>
              </ul>
            </div>

            {/* Section 4 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">directions_car</span>
                <span>{isEn ? '4. Safe Car Playback & Background Audio' : '4. Reproducción Segura en el Coche y Segundo Plano'}</span>
              </div>
              <p className="text-gray-300 text-xs">
                {isEn
                  ? 'The app implements standard MediaSession API and Screen WakeLock to enable steering wheel button control and keep playback seamless while using GPS navigation.'
                  : 'La aplicación implementa las tecnologías estándar MediaSession API y Screen WakeLock para permitir el control de avance/retroceso desde los mandos del volante del vehículo y mantener la reproducción activa cuando la pantalla conmuta al navegador GPS.'}
              </p>
            </div>

            {/* Section 5 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">cookie_off</span>
                <span>{isEn ? '5. Zero Advertising Cookies or Commercial Tracking' : '5. Cero Cookies Publicitarias ni Rastreo Comercial'}</span>
              </div>
              <p className="text-gray-300 text-xs">
                {isEn
                  ? 'We do not sell data to advertisers or use advertising tracking cookies. Your concentration while driving and playback privacy are our absolute priority.'
                  : 'No comercializamos tus datos con anunciantes ni empleamos cookies de perfilado publicitario. Tu concentración al volante y la privacidad de tus reproducciones son nuestra prioridad absoluta.'}
              </p>
            </div>

            {/* Section 6 - Official Legal Documentation Links */}
            <div className="bg-gradient-to-r from-cyan-950/40 via-black/50 to-cyan-950/40 border border-cyan-500/30 rounded-xl p-4 space-y-3 shadow-[0_0_20px_rgba(6,182,212,0.12)]">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">gavel</span>
                <span>{t.privacy.officialLinksSection}</span>
              </div>
              <p className="text-gray-300 text-xs">
                {t.privacy.officialLinksDesc}
              </p>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                <a
                  href="https://www.audio-car.es/privacidad.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-[#03111b]/80 border border-cyan-400/40 hover:border-cyan-300 hover:bg-[#072438] text-cyan-100 hover:text-white transition-all shadow-[0_2px_8px_rgba(0,0,0,0.4)] group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-base text-cyan-300">policy</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs font-bold truncate">
                        {t.privacy.privacyLinkText}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-cyan-400/70 font-mono truncate">
                        audio-car.es/privacidad.html
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-base text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0 ml-1">
                    open_in_new
                  </span>
                </a>

                <a
                  href="https://www.audio-car.es/terminos.html"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="flex items-center justify-between p-3 rounded-xl bg-[#03111b]/80 border border-cyan-400/40 hover:border-cyan-300 hover:bg-[#072438] text-cyan-100 hover:text-white transition-all shadow-[0_2px_8px_rgba(0,0,0,0.4)] group"
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-7 h-7 rounded-lg bg-cyan-500/10 border border-cyan-400/30 flex items-center justify-center shrink-0">
                      <span className="material-symbols-outlined text-base text-amber-300">description</span>
                    </div>
                    <div className="min-w-0">
                      <div className="text-[11px] sm:text-xs font-bold truncate">
                        {t.privacy.termsLinkText}
                      </div>
                      <div className="text-[9px] sm:text-[10px] text-amber-400/70 font-mono truncate">
                        audio-car.es/terminos.html
                      </div>
                    </div>
                  </div>
                  <span className="material-symbols-outlined text-base text-cyan-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform shrink-0 ml-1">
                    open_in_new
                  </span>
                </a>
              </div>
            </div>
          </div>

          {/* Footer */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-2 px-5 py-3.5 border-t border-cyan-500/30 bg-black/60 backdrop-blur-md">
            <div className="flex flex-wrap items-center gap-1.5 text-[10px] text-cyan-400/70 font-mono">
              <span>{isEn ? 'Updated: 2026 •' : 'Actualizado: 2026 •'}</span>
              <a
                href="https://www.audio-car.es/privacidad.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition-colors"
              >
                {t.privacy.privacyLinkText}
              </a>
              <span>•</span>
              <a
                href="https://www.audio-car.es/terminos.html"
                target="_blank"
                rel="noopener noreferrer"
                className="underline hover:text-white transition-colors"
              >
                {t.privacy.termsLinkText}
              </a>
            </div>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.6)] cursor-pointer transition-all shrink-0"
            >
              {isEn ? 'Got it' : 'Entendido'}
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
