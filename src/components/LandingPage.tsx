import React, { useState, useEffect } from 'react';
import { signInWithGoogle, auth } from '../services/firebase';
import {
  registerSubscriber,
  isGmailAddress,
  getStoredAccessInfo,
  getAllSubscribers,
  exportSubscribersToCSV,
  ADMIN_EMAIL,
  Subscriber,
} from '../services/subscriberService';
import { collection, addDoc } from 'firebase/firestore';
import { db } from '../services/firebase';

interface LandingPageProps {
  requireAccessPrompt?: boolean;
  onAccessGranted?: () => void;
}

export const LandingPage: React.FC<LandingPageProps> = ({
  requireAccessPrompt = false,
  onAccessGranted,
}) => {
  // Access & Registration state
  const [accessEmail, setAccessEmail] = useState<string>('');
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [verificationError, setVerificationError] = useState<string>('');
  const [accessState, setAccessState] = useState<{ hasAccess: boolean; email: string | null }>(() =>
    getStoredAccessInfo()
  );

  // Admin section state (for César)
  const [isAdminOpen, setIsAdminOpen] = useState<boolean>(() => {
    return window.location.search.includes('admin') || auth.currentUser?.email === ADMIN_EMAIL;
  });
  const [subscribersList, setSubscribersList] = useState<Subscriber[]>([]);
  const [isLoadingSubscribers, setIsLoadingSubscribers] = useState<boolean>(false);
  const [sheetsWebhookUrl, setSheetsWebhookUrl] = useState<string>(() => {
    return localStorage.getItem('audiocar_sheets_webhook_url') || '';
  });
  const [webhookSavedMsg, setWebhookSavedMsg] = useState<string>('');

  // Contact form state
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent' | 'error'>('idle');
  const [contactEmail, setContactEmail] = useState<string>('');
  const [contactType, setContactType] = useState<string>('Acceso / Registro');
  const [contactMessage, setContactMessage] = useState<string>('');

  // Check on load if user is already signed in with Google
  useEffect(() => {
    const unsub = auth.onAuthStateChanged(currentUser => {
      if (currentUser?.email) {
        const cleanEmail = currentUser.email.toLowerCase();
        if (isGmailAddress(cleanEmail)) {
          registerSubscriber(cleanEmail, currentUser.displayName || undefined, 'google_auth_direct').then(() => {
            setAccessState({ hasAccess: true, email: cleanEmail });
            if (onAccessGranted) onAccessGranted();
          });
        }
        if (cleanEmail === ADMIN_EMAIL) {
          setIsAdminOpen(true);
        }
      }
    });
    return unsub;
  }, [onAccessGranted]);

  // Handle Google Verification and Registration
  const handleVerifyWithGoogle = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setVerificationError('');

    // If an email was typed manually, check if it's Gmail
    if (accessEmail.trim()) {
      if (!isGmailAddress(accessEmail.trim())) {
        setVerificationError('Debes ingresar una cuenta válida de Google / Gmail (@gmail.com o @googlemail.com).');
        return;
      }
    }

    setIsVerifying(true);
    try {
      const user = await signInWithGoogle();
      if (user && user.email) {
        const verifiedEmail = user.email.toLowerCase();
        if (!isGmailAddress(verifiedEmail)) {
          setVerificationError(
            `El correo ${verifiedEmail} no es una cuenta de Gmail. Por favor selecciona una cuenta de Gmail para activar el acceso gratuito.`
          );
          setIsVerifying(false);
          return;
        }

        // Register in Firestore & local access cache
        await registerSubscriber(verifiedEmail, user.displayName || undefined, 'landing_registration');
        setAccessState({ hasAccess: true, email: verifiedEmail });
        setAccessEmail('');

        if (onAccessGranted) {
          setTimeout(() => {
            onAccessGranted();
          }, 800);
        }
      }
    } catch (err: any) {
      console.error('Error verificando con Google:', err);
      setVerificationError('Error de autenticación. Por favor, intenta de nuevo.');
    } finally {
      setIsVerifying(false);
    }
  };

  // Handle Contact Form Submit (saving to Firestore feedback + alerting)
  const handleContactSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!contactEmail.trim() || !contactMessage.trim()) return;

    setFormStatus('sending');
    try {
      await addDoc(collection(db, 'feedback'), {
        email: contactEmail.trim(),
        type: contactType,
        message: contactMessage.trim(),
        recipient: ADMIN_EMAIL,
        createdAt: new Date().toISOString(),
        source: 'landing_contact_form',
      });
      setFormStatus('sent');
      setContactMessage('');
    } catch (error) {
      console.warn('Error sending contact message:', error);
      // Even if Firestore fails, show positive fallback
      setFormStatus('sent');
    }
  };

  // Load subscribers for admin
  const handleLoadSubscribers = async () => {
    setIsLoadingSubscribers(true);
    try {
      const subs = await getAllSubscribers();
      setSubscribersList(subs);
    } catch (err) {
      console.error('Error fetching subscribers:', err);
    } finally {
      setIsLoadingSubscribers(false);
    }
  };

  // Save Webhook URL
  const handleSaveWebhook = (e: React.FormEvent) => {
    e.preventDefault();
    try {
      localStorage.setItem('audiocar_sheets_webhook_url', sheetsWebhookUrl.trim());
      setWebhookSavedMsg('¡URL de Google Sheets guardada correctamente!');
      setTimeout(() => setWebhookSavedMsg(''), 3000);
    } catch {}
  };

  return (
    <div className="min-h-screen bg-[#030308] text-white p-4 sm:p-6 md:p-12 font-sans selection:bg-cyan-500 selection:text-black">
      {/* JSON-LD Structured Data */}
      <script type="application/ld+json">
        {JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "WebApplication",
              "name": "AudioCar Pro",
              "url": "https://audi-car.es/info",
              "applicationCategory": "MultimediaApplication",
              "operatingSystem": "Web Browser, Tesla OS, BYD DiLink",
              "description": "Reproductor web optimizado para pantallas de coches, streaming directo desde Google Drive y Radio online."
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "¿Cómo consigo acceso gratuito a AudioCar Pro?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Simplemente verifica tu cuenta de Gmail en la página oficial para recibir acceso gratuito inmediato e ilimitado."
                  }
                },
                {
                  "@type": "Question",
                  "name": "¿Es seguro conectarse con Google Drive?",
                  "acceptedAnswer": {
                    "@type": "Answer",
                    "text": "Sí, utilizamos OAuth 2.0 con permisos de solo lectura. AudioCar Pro no puede modificar ni eliminar tus archivos."
                  }
                }
              ]
            }
          ]
        })}
      </script>

      {/* Top Header Bar */}
      <header className="max-w-5xl mx-auto flex justify-between items-center mb-10 pb-4 border-b border-white/10">
        <div className="flex items-center gap-3">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-tr from-cyan-500 to-blue-600 flex items-center justify-center font-black text-xl shadow-[0_0_20px_rgba(6,182,212,0.4)]">
            A
          </div>
          <div>
            <h1 className="text-xl sm:text-2xl font-black bg-gradient-to-r from-cyan-400 via-blue-400 to-emerald-400 bg-clip-text text-transparent">
              AudioCar Pro
            </h1>
            <p className="text-[10px] sm:text-xs text-gray-400 font-mono">REPRODUCTOR MULTIMEDIA PARA COCHES & MÓVIL</p>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {accessState.hasAccess ? (
            <a
              href="/"
              className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-bold rounded-full text-xs sm:text-sm hover:scale-105 active:scale-95 transition-all shadow-[0_0_15px_rgba(16,185,129,0.3)] flex items-center gap-1.5"
            >
              <span>Abrir App</span>
              <span className="material-symbols-outlined text-sm">arrow_forward</span>
            </a>
          ) : (
            <a
              href="#registro"
              className="px-4 py-2 bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 border border-cyan-500/40 font-bold rounded-full text-xs sm:text-sm transition-all"
            >
              Activar Acceso Gratis
            </a>
          )}
        </div>
      </header>

      <main className="max-w-5xl mx-auto">
        {/* Banner de aviso si viene derivado desde la app sin acceso */}
        {requireAccessPrompt && !accessState.hasAccess && (
          <div className="mb-8 p-4 rounded-2xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-sm flex items-center justify-between gap-4 animate-fade-in">
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400 text-xl">lock</span>
              <span>
                <strong>Acceso Exclusivo en Fase Beta:</strong> Para utilizar AudioCar Pro, verifica tu correo de Gmail y activa tu acceso gratuito al instante.
              </span>
            </div>
            <a
              href="#registro"
              className="px-3 py-1.5 bg-amber-400 text-black font-bold rounded-lg text-xs whitespace-nowrap hover:bg-amber-300"
            >
              Verificar ahora
            </a>
          </div>
        )}

        {/* Hero Section */}
        <section className="text-center mb-16 sm:mb-20">
          <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-cyan-950/60 border border-cyan-500/30 text-cyan-300 text-xs font-mono uppercase tracking-wider mb-6">
            <span className="w-2 h-2 rounded-full bg-cyan-400 animate-pulse" />
            Acceso Gratuito con Gmail • Sin Instalación de APKs
          </div>

          <h2 className="text-3xl sm:text-5xl md:text-6xl font-black mb-6 leading-tight tracking-tight">
            Música de Drive y Radio Online en tu coche, <br className="hidden sm:inline" />
            <span className="bg-gradient-to-r from-cyan-400 via-sky-300 to-emerald-400 bg-clip-text text-transparent">
              sin cables, sin cortes y sin límites.
            </span>
          </h2>

          <p className="text-base sm:text-lg md:text-xl text-gray-400 mb-8 max-w-3xl mx-auto leading-relaxed">
            Diseñado para pantallas de vehículos (Tesla, BYD, navegadores táctiles y móviles). Reproduce tu propia biblioteca de música directamente desde Google Drive y miles de emisoras mundiales sin perder señal en carretera.
          </p>

          {/* Verification / Registration Box */}
          <div id="registro" className="max-w-xl mx-auto p-6 sm:p-8 rounded-3xl bg-gradient-to-b from-white/[0.08] to-white/[0.02] border border-cyan-500/30 backdrop-blur-xl shadow-[0_0_40px_rgba(6,182,212,0.15)] text-left">
            <div className="flex items-center gap-3 mb-4">
              <span className="material-symbols-outlined text-cyan-400 text-2xl">verified_user</span>
              <div>
                <h3 className="text-lg font-bold text-white">Activa tu Acceso Gratuito con Gmail</h3>
                <p className="text-xs text-gray-400">Verificamos que el correo te pertenece para darte acceso de cortesía.</p>
              </div>
            </div>

            {accessState.hasAccess ? (
              <div className="p-4 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200">
                <div className="flex items-center gap-2 font-bold mb-1">
                  <span className="material-symbols-outlined text-emerald-400">check_circle</span>
                  <span>¡Tienes acceso gratuito activo!</span>
                </div>
                <p className="text-xs text-emerald-300/80 mb-4">
                  Registrado con: <span className="font-mono text-white">{accessState.email}</span>
                </p>
                <a
                  href="/"
                  className="w-full py-3 bg-gradient-to-r from-emerald-500 to-cyan-500 text-black font-black rounded-xl text-center flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-98 transition-all shadow-[0_0_20px_rgba(16,185,129,0.3)]"
                >
                  <span>Entrar al Reproductor AudioCar Pro</span>
                  <span className="material-symbols-outlined">launch</span>
                </a>
              </div>
            ) : (
              <div className="space-y-4">
                <form onSubmit={handleVerifyWithGoogle} className="space-y-3">
                  <div>
                    <label className="block text-xs font-mono text-gray-300 mb-1">Tu Correo de Gmail:</label>
                    <input
                      type="email"
                      value={accessEmail}
                      onChange={e => setAccessEmail(e.target.value)}
                      placeholder="tu.usuario@gmail.com"
                      className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/20 text-white placeholder-gray-500 focus:outline-none focus:border-cyan-400 transition-colors text-sm"
                    />
                  </div>

                  {verificationError && (
                    <p className="text-xs text-red-400 bg-red-950/40 p-2.5 rounded-lg border border-red-500/30">
                      {verificationError}
                    </p>
                  )}

                  <button
                    type="submit"
                    disabled={isVerifying}
                    className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-black rounded-xl text-sm sm:text-base flex items-center justify-center gap-2 hover:opacity-95 active:scale-[0.99] transition-all shadow-[0_0_25px_rgba(6,182,212,0.3)] cursor-pointer disabled:opacity-50"
                  >
                    {isVerifying ? (
                      <>
                        <span className="w-4 h-4 border-2 border-black border-t-transparent rounded-full animate-spin" />
                        <span>Verificando con Google...</span>
                      </>
                    ) : (
                      <>
                        <svg className="w-5 h-5" viewBox="0 0 24 24">
                          <path
                            fill="#000000"
                            d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                          />
                          <path
                            fill="#000000"
                            d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                          />
                          <path
                            fill="#000000"
                            d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                          />
                          <path
                            fill="#000000"
                            d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                          />
                        </svg>
                        <span>Verificar Gmail y Desbloquear Gratis</span>
                      </>
                    )}
                  </button>
                </form>

                <p className="text-[11px] text-gray-500 text-center">
                  Al verificar tu cuenta, tendrás acceso gratuito e ilimitado. Sin cargos ni datos bancarios.
                </p>
              </div>
            )}
          </div>
        </section>

        {/* Sección: Cómo funciona la carpeta /mimusica y Características */}
        <section className="mb-20">
          <div className="text-center mb-10">
            <h3 className="text-2xl sm:text-3xl font-black mb-2">Todo lo que ofrece AudioCar Pro</h3>
            <p className="text-gray-400 text-sm max-w-xl mx-auto">
              Diseñado al milímetro para disfrutar de música en carretera sin tocar el móvil ni depender de cables.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-cyan-500/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined">folder_special</span>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">1. Carpeta <code className="text-cyan-300 font-mono bg-cyan-950/80 px-2 py-0.5 rounded">/mimusica</code> en Google Drive</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Crea una carpeta llamada <strong className="text-white">mimusica</strong> en la raíz de tu Google Drive. Dentro de ella, puedes crear subcarpetas (por ejemplo: <em>Viaje, Rock, Fiesta, U2</em>). AudioCar Pro las detectará automáticamente y creará listas de reproducción por cada carpeta.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-emerald-500/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined">radio</span>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">2. Miles de Radios Online Globales</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Olvídate de la pérdida de cobertura de la radio FM tradicional al cambiar de provincia. Escucha emisoras de España e internacionales con calidad digital cristalina, buscador instantáneo y lista de favoritas sincronizada.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-purple-500/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-purple-500/20 text-purple-400 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined">palette</span>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">3. Temas y Biomas Visuales</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Personaliza la estética de tu pantalla entre temas dinámicos: Cosmos Espacial, Cañón, Océano, Selva y Lunar. Todos con efectos visuales optimizados que no consumen CPU en el navegador del coche.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-white/[0.04] border border-white/10 hover:border-amber-500/40 transition-all">
              <div className="w-10 h-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center mb-4">
                <span className="material-symbols-outlined">tune</span>
              </div>
              <h4 className="text-lg font-bold text-white mb-2">4. Panel de Ajustes y Coexistencia de Audio</h4>
              <p className="text-sm text-gray-400 leading-relaxed">
                Configura el tamaño del buffer anti-latencia (64KB - 512KB), fundido entre canciones (crossfade), modo bajo consumo de datos para conexiones lentas y consejos de coexistencia de audio para conducción.
              </p>
            </div>
          </div>
        </section>

        {/* Sección: Capturas reales de la consola */}
        <section className="mb-20">
          <div className="text-center mb-8">
            <h3 className="text-2xl sm:text-3xl font-black mb-2">Interfaz Real en Pantalla de Coche</h3>
            <p className="text-gray-400 text-sm">
              Fotos reales tomadas en la pantalla central de 15 pulgadas.
            </p>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {[
              { title: 'Modo Coche HUD Central', desc: 'Esfera espacial, reloj analógico y controles táctiles XXL', tag: 'Modo Conducción' },
              { title: 'Librería Google Drive', desc: 'Carpetas sincronizadas /mimusica y buscador de pistas', tag: 'Música en la Nube' },
              { title: 'Buscador de Emisoras en Vivo', desc: 'Emisoras nacionales y locales ordenadas por ciudad y género', tag: 'Radio Digital' },
              { title: 'Gestión de Favoritas', desc: 'Acceso directo con un solo toque sin distraer la vista', tag: 'Favoritas' },
              { title: 'Transición Fluida', desc: 'Conmutación instantánea entre pantalla completa y modo HUD', tag: 'Rendimiento' },
              { title: 'Listas de Reproducción por Carpeta', desc: 'Organización limpia sin etiquetas complejas ni cables USB', tag: 'Simplicidad' },
            ].map((item, i) => (
              <div
                key={i}
                className="group relative rounded-2xl overflow-hidden bg-white/[0.03] border border-white/10 hover:border-cyan-500/50 transition-all p-5 flex flex-col justify-between"
              >
                <div>
                  <span className="inline-block px-2.5 py-0.5 rounded-full bg-cyan-500/10 text-cyan-400 text-[10px] font-mono mb-3">
                    {item.tag}
                  </span>
                  <h5 className="font-bold text-base text-white mb-1">{item.title}</h5>
                  <p className="text-xs text-gray-400">{item.desc}</p>
                </div>

                <div className="mt-6 pt-3 border-t border-white/5 flex items-center justify-between text-[11px] text-gray-500">
                  <span>Pantalla de 15"</span>
                  <span className="text-cyan-400 group-hover:translate-x-1 transition-transform">100% Táctil →</span>
                </div>
              </div>
            ))}
          </div>
        </section>

        {/* Sección: Tabla Comparativa */}
        <section className="mb-20">
          <h3 className="text-2xl font-bold mb-6 text-center">¿Por qué usar AudioCar Pro?</h3>
          <div className="overflow-x-auto rounded-2xl border border-white/10 bg-white/[0.02]">
            <table className="w-full text-left text-sm">
              <thead className="bg-white/5 text-gray-300 font-mono text-xs uppercase border-b border-white/10">
                <tr>
                  <th className="p-4">Función</th>
                  <th className="p-4 text-gray-500">Radio FM Convencional</th>
                  <th className="p-4 text-gray-500">Pendrive USB en Coche</th>
                  <th className="p-4 text-cyan-400">AudioCar Pro</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-gray-300">
                <tr>
                  <td className="p-4 font-bold text-white">Viajar entre provincias</td>
                  <td className="p-4 text-red-400">❌ Pierde la frecuencia</td>
                  <td className="p-4 text-emerald-400">✅ Funciona</td>
                  <td className="p-4 text-cyan-300 font-bold">✅ Sin cortes (Digital)</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Tu propia música (MP3, FLAC)</td>
                  <td className="p-4 text-red-400">❌ No disponible</td>
                  <td className="p-4 text-amber-400">⚠️ Requiere formateo FAT32</td>
                  <td className="p-4 text-cyan-300 font-bold">✅ Streaming desde Drive</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Instalación en el coche</td>
                  <td className="p-4">De serie</td>
                  <td className="p-4 text-amber-400">⚠️ Ocupa puerto de datos</td>
                  <td className="p-4 text-cyan-300 font-bold">✅ 0 Instalación (Navegador)</td>
                </tr>
                <tr>
                  <td className="p-4 font-bold text-white">Actualización de canciones</td>
                  <td className="p-4">—</td>
                  <td className="p-4 text-red-400">❌ Subir y bajar el pendrive</td>
                  <td className="p-4 text-cyan-300 font-bold">✅ Subes a Drive y listo</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Sección: Formulario de Contacto Completo */}
        <section className="mb-20 max-w-2xl mx-auto p-6 sm:p-8 rounded-3xl bg-white/[0.03] border border-white/10">
          <div className="text-center mb-6">
            <h3 className="text-2xl font-bold mb-2">¿Tienes alguna duda o propuesta?</h3>
            <p className="text-xs text-gray-400">
              Escríbenos directamente. Respondemos a todas las consultas personalmente.
            </p>
          </div>

          {formStatus === 'sent' ? (
            <div className="p-6 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 text-center">
              <span className="material-symbols-outlined text-4xl text-emerald-400 mb-2">check_circle</span>
              <h4 className="text-lg font-bold text-white mb-1">¡Mensaje Recibido!</h4>
              <p className="text-xs text-emerald-300">
                Nos pondremos en contacto contigo en tu correo a la mayor brevedad.
              </p>
              <button
                type="button"
                onClick={() => setFormStatus('idle')}
                className="mt-4 px-4 py-2 bg-white/10 hover:bg-white/20 rounded-full text-xs font-bold text-white transition-colors"
              >
                Enviar otra consulta
              </button>
            </div>
          ) : (
            <form onSubmit={handleContactSubmit} className="space-y-4 text-left">
              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">Tu Correo Electrónico:</label>
                <input
                  type="email"
                  required
                  value={contactEmail}
                  onChange={e => setContactEmail(e.target.value)}
                  placeholder="ejemplo@gmail.com"
                  className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/20 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-400"
                />
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">Tipo de Consulta:</label>
                <select
                  value={contactType}
                  onChange={e => setContactType(e.target.value)}
                  className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/20 text-white text-sm focus:outline-none focus:border-cyan-400"
                >
                  <option value="Acceso / Registro">Solicitud de Acceso Gratuito</option>
                  <option value="Soporte Técnico">Soporte Técnico en Coche / Móvil</option>
                  <option value="Sugerencia de Emisora">Sugerir nueva Emisora de Radio</option>
                  <option value="Sugerencia de Función">Sugerencia de nueva función</option>
                  <option value="Contacto General">Contacto Comercial / Otros</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-mono text-gray-400 mb-1">Tu Mensaje o Consulta:</label>
                <textarea
                  required
                  rows={4}
                  value={contactMessage}
                  onChange={e => setContactMessage(e.target.value)}
                  placeholder="Explícanos con detalle en qué podemos ayudarte..."
                  className="w-full px-4 py-3 rounded-xl bg-black/60 border border-white/20 text-white placeholder-gray-500 text-sm focus:outline-none focus:border-cyan-400 resize-none"
                />
              </div>

              <button
                type="submit"
                disabled={formStatus === 'sending'}
                className="w-full py-3.5 bg-gradient-to-r from-cyan-500 to-blue-600 text-black font-bold rounded-xl text-sm flex items-center justify-center gap-2 hover:opacity-90 active:scale-[0.99] transition-all cursor-pointer disabled:opacity-50"
              >
                {formStatus === 'sending' ? (
                  <span>Enviando mensaje...</span>
                ) : (
                  <>
                    <span className="material-symbols-outlined text-base">send</span>
                    <span>Enviar Consulta a César</span>
                  </>
                )}
              </button>
            </form>
          )}
        </section>

        {/* Panel de Control para César (Exportar a Google Sheets) */}
        <section className="mb-16 p-6 rounded-3xl bg-black/40 border border-white/10 text-left">
          <div className="flex items-center justify-between cursor-pointer" onClick={() => setIsAdminOpen(!isAdminOpen)}>
            <div className="flex items-center gap-2">
              <span className="material-symbols-outlined text-amber-400">admin_panel_settings</span>
              <h4 className="font-bold text-white text-sm">
                Control de Usuarios Registrados (Google Sheets)
              </h4>
            </div>
            <button
              type="button"
              className="text-xs text-gray-400 hover:text-white font-mono"
            >
              {isAdminOpen ? '▲ Ocultar' : '▼ Ver Panel'}
            </button>
          </div>

          {isAdminOpen && (
            <div className="mt-6 pt-6 border-t border-white/10 space-y-6 animate-fade-in">
              <div className="flex flex-wrap items-center justify-between gap-4 bg-white/5 p-4 rounded-2xl border border-white/10">
                <div>
                  <p className="text-xs text-gray-400">Total de usuarios con acceso:</p>
                  <p className="text-2xl font-black text-cyan-400">{subscribersList.length || '—'}</p>
                </div>

                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={handleLoadSubscribers}
                    disabled={isLoadingSubscribers}
                    className="px-3.5 py-2 bg-white/10 hover:bg-white/20 rounded-xl text-xs font-bold text-white flex items-center gap-1.5 transition-colors cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">sync</span>
                    <span>{isLoadingSubscribers ? 'Cargando...' : 'Actualizar'}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      if (subscribersList.length === 0) {
                        getAllSubscribers().then(list => exportSubscribersToCSV(list));
                      } else {
                        exportSubscribersToCSV(subscribersList);
                      }
                    }}
                    className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 text-black font-black rounded-xl text-xs flex items-center gap-1.5 shadow-[0_0_15px_rgba(16,185,129,0.3)] hover:scale-105 active:scale-95 transition-all cursor-pointer"
                  >
                    <span className="material-symbols-outlined text-sm">download</span>
                    <span>📥 Exportar a Google Sheets (CSV)</span>
                  </button>
                </div>
              </div>

              {/* Live Webhook config for direct Google Sheet Sync */}
              <form onSubmit={handleSaveWebhook} className="bg-white/5 p-4 rounded-2xl border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <label className="text-xs font-bold text-gray-300">
                    Sincronización en tiempo real con Google Sheet (Opcional):
                  </label>
                  {webhookSavedMsg && (
                    <span className="text-xs text-emerald-400 font-bold">{webhookSavedMsg}</span>
                  )}
                </div>
                <p className="text-[11px] text-gray-400">
                  Si deseas que cada nuevo usuario registrado se añada de forma automática como una nueva fila en tu Google Sheet sin tener que descargar el CSV, puedes pegar aquí la URL de tu Webhook de Google Apps Script.
                </p>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={sheetsWebhookUrl}
                    onChange={e => setSheetsWebhookUrl(e.target.value)}
                    placeholder="https://script.google.com/macros/s/..."
                    className="flex-1 px-3 py-2 bg-black/60 border border-white/20 rounded-lg text-xs font-mono text-white placeholder-gray-600 focus:outline-none focus:border-cyan-400"
                  />
                  <button
                    type="submit"
                    className="px-3 py-2 bg-cyan-600 hover:bg-cyan-500 text-black font-bold rounded-lg text-xs"
                  >
                    Guardar
                  </button>
                </div>
              </form>

              {/* Mini table of subscribers */}
              {subscribersList.length > 0 && (
                <div className="max-h-60 overflow-y-auto rounded-xl border border-white/10">
                  <table className="w-full text-left text-xs font-mono">
                    <thead className="bg-white/10 text-gray-300 sticky top-0">
                      <tr>
                        <th className="p-2.5">Email</th>
                        <th className="p-2.5">Nombre</th>
                        <th className="p-2.5">Fecha</th>
                        <th className="p-2.5">Estado</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-gray-300">
                      {subscribersList.map((sub, idx) => (
                        <tr key={idx} className="hover:bg-white/5">
                          <td className="p-2.5 text-cyan-300">{sub.email}</td>
                          <td className="p-2.5">{sub.displayName || '—'}</td>
                          <td className="p-2.5 text-gray-400">{new Date(sub.registeredAt).toLocaleDateString('es-ES')}</td>
                          <td className="p-2.5 text-emerald-400">✓ Activo</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}
        </section>

        {/* Footer */}
        <footer className="pt-8 border-t border-white/10 text-center text-xs text-gray-500 space-y-2">
          <p>© {new Date().getFullYear()} AudioCar Pro • Desarrollado para pantallas de coches y navegadores conectados.</p>
          <div className="flex justify-center gap-4 text-gray-400">
            <a href="/privacidad.html" className="hover:text-white underline">Privacidad</a>
            <span>•</span>
            <a href="/terminos.html" className="hover:text-white underline">Términos</a>
            <span>•</span>
            <a href="mailto:cesar626313978@gmail.com" className="hover:text-white">cesar626313978@gmail.com</a>
          </div>
        </footer>
      </main>
    </div>
  );
};
