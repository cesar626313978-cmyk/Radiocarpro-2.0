import React from 'react';
import { motion, AnimatePresence } from 'motion/react';

interface PrivacyPolicyModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ isOpen, onClose }) => {
  if (!isOpen) return null;

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
                  Política de Privacidad y Seguridad
                </h2>
                <p className="text-[10px] sm:text-xs text-cyan-400/80 font-mono">
                  Myradio 2.0 Pro • Modo Coche y Streaming
                </p>
              </div>
            </div>
            <button
              onClick={onClose}
              className="w-8 h-8 rounded-full bg-white/5 hover:bg-white/15 border border-white/20 flex items-center justify-center text-gray-300 hover:text-white transition-all cursor-pointer"
              title="Cerrar"
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
                <span>1. Acceso Estricto a Google Drive</span>
              </div>
              <p className="text-gray-300 text-xs">
                La integración con Google Drive utiliza exclusivamente el permiso de solo lectura (<code className="text-cyan-300 bg-cyan-950/60 px-1.5 py-0.5 rounded font-mono">drive.readonly</code>) para acceder a los archivos de audio contenidos en tu carpeta <strong className="text-white font-semibold">/mimusica</strong>.
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] sm:text-xs text-gray-400">
                <li><strong className="text-gray-200">Sin servidores intermedios:</strong> El audio se descarga directamente entre los servidores de Google y tu navegador mediante canal HTTPS cifrado.</li>
                <li><strong className="text-gray-200">Sin modificación ni borrado:</strong> La aplicación no tiene permisos de escritura, modificación ni eliminación sobre tus archivos.</li>
                <li><strong className="text-gray-200">Aislamiento total:</strong> No accedemos a documentos, fotos ni ningún otro dato personal fuera de la carpeta musical autorizada.</li>
              </ul>
            </div>

            {/* Section 2 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">save</span>
                <span>2. Almacenamiento Local y Búfer Coche (IndexedDB)</span>
              </div>
              <p className="text-gray-300 text-xs">
                Para evitar microcortes al circular por túneles o zonas con baja cobertura móvil, las canciones y emisoras activas se almacenan temporalmente en la base de datos local <strong className="text-white font-semibold">IndexedDB</strong> de tu propio navegador.
              </p>
              <p className="text-[11px] sm:text-xs text-gray-400">
                Estos datos nunca salen de tu coche o dispositivo y pueden borrarse en cualquier momento cerrando sesión o limpiando la caché de la aplicación.
              </p>
            </div>

            {/* Section 3 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">sync</span>
                <span>3. Sincronización en la Nube (Firebase Firestore)</span>
              </div>
              <p className="text-gray-300 text-xs">
                Si inicias sesión con tu cuenta de Google o vinculas tu vehículo mediante código QR del coche, almacenamos de forma cifrada en la base de datos Firestore únicamente:
              </p>
              <ul className="list-disc pl-5 space-y-1 text-[11px] sm:text-xs text-gray-400">
                <li>Tu identificador único de usuario y correo electrónico de cuenta.</li>
                <li>Tu lista de emisoras de radio favoritas y preferencias de audio para sincronizarlas entre tu móvil y tu coche.</li>
                <li><strong className="text-emerald-400">Nunca</strong> solicitamos ni almacenamos contraseñas, medios de pago ni información financiera.</li>
              </ul>
            </div>

            {/* Section 4 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">directions_car</span>
                <span>4. Reproducción Segura en el Coche y Segundo Plano</span>
              </div>
              <p className="text-gray-300 text-xs">
                La aplicación implementa las tecnologías estándar <strong className="text-white font-semibold">MediaSession API</strong> y <strong className="text-white font-semibold">Screen WakeLock</strong> para permitir el control de avance/retroceso desde los mandos del volante del vehículo y mantener la reproducción activa cuando la pantalla conmuta al navegador GPS.
              </p>
            </div>

            {/* Section 5 */}
            <div className="bg-black/30 border border-cyan-500/20 rounded-xl p-4 space-y-2">
              <div className="flex items-center gap-2 text-cyan-300 font-bold text-xs sm:text-sm uppercase tracking-wide">
                <span className="material-symbols-outlined text-base">cookie_off</span>
                <span>5. Cero Cookies Publicitarias ni Rastreo Comercial</span>
              </div>
              <p className="text-gray-300 text-xs">
                No comercializamos tus datos con anunciantes ni empleamos cookies de perfilado publicitario. Tu concentración al volante y la privacidad de tus reproducciones son nuestra prioridad absoluta.
              </p>
            </div>
          </div>

          {/* Footer */}
          <div className="flex items-center justify-between px-5 py-3.5 border-t border-cyan-500/30 bg-black/60 backdrop-blur-md">
            <span className="text-[10px] text-cyan-400/70 font-mono">
              Actualizado: Septiembre 2026 • Cumplimiento RGPD & Google API Services
            </span>
            <button
              onClick={onClose}
              className="px-5 py-2 rounded-full bg-cyan-500 hover:bg-cyan-400 text-black font-black text-xs uppercase tracking-wider shadow-[0_0_15px_rgba(6,182,212,0.6)] cursor-pointer transition-all"
            >
              Entendido
            </button>
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
};
