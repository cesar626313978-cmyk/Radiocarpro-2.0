import React, { useState } from 'react';

export const LandingPage: React.FC = () => {
  const [formStatus, setFormStatus] = useState<'idle' | 'sending' | 'sent'>('idle');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormStatus('sending');
    // Simulate email sending to cesar626313978@gmail.com
    console.log("Sending email to cesar626313978@gmail.com");
    setTimeout(() => setFormStatus('sent'), 1000);
  };

  return (
    <div className="min-h-screen bg-[#030308] text-white p-6 md:p-12 font-sans">
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
              "description": "Reproductor web optimizado para vehículos para streaming directo de música desde Google Drive y Radio online."
            },
            {
              "@type": "FAQPage",
              "mainEntity": [
                {
                  "@type": "Question",
                  "name": "¿Es seguro loguearse con Google Drive?",
                  "acceptedAnswer": {"@type": "Answer", "text": "Sí, utilizamos OAuth 2.0 con permisos de solo lectura. AudioCar Pro no puede modificar ni eliminar tus archivos."}
                }
              ]
            }
          ]
        })}
      </script>

      <header className="max-w-4xl mx-auto flex justify-between items-center mb-16">
        <h1 className="text-2xl font-bold bg-gradient-to-r from-cyan-400 to-blue-500 bg-clip-text text-transparent">
          AudioCar Pro
        </h1>
        <a href="/" className="px-4 py-2 bg-white/5 rounded-full border border-white/10 hover:bg-white/15 transition-all text-sm">
          Ir a la App
        </a>
      </header>

      <main className="max-w-4xl mx-auto">
        {/* Hero */}
        <section className="text-center mb-20">
          <h2 className="text-4xl md:text-6xl font-extrabold mb-6 leading-tight">
            Música y Radio Online en tu vehículo, <br />
            <span className="text-cyan-400">sin cables ni límites.</span>
          </h2>
          <p className="text-lg md:text-xl text-gray-400 mb-8 max-w-2xl mx-auto">
            Acceso universal a tu música y radio, en tu coche, móvil o pantalla favorita.
          </p>
        </section>

        {/* Características Técnicas con Demos */}
        <section className="mb-20">
          <h3 className="text-2xl font-bold mb-8 text-center">Características Principales</h3>
          
          <div className="grid md:grid-cols-2 gap-8 items-center mb-12">
            <div className="space-y-4">
              <p className="p-4 bg-white/5 rounded border border-white/10 text-gray-400">✅ <strong>Streaming desde Google Drive:</strong> Crea la carpeta <code>/mimusica</code> en tu Drive y organiza tu música en subcarpetas para listas de reproducción.</p>
              <p className="p-4 bg-white/5 rounded border border-white/10 text-gray-400">✅ <strong>Radio Online Global:</strong> Miles de emisoras sin cortes por zona geográfica.</p>
            </div>
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl">
              <video src="/videos/demo1.mp4" controls className="w-full" />
            </div>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            <div className="rounded-2xl overflow-hidden border border-white/10 shadow-2xl order-2 md:order-1">
              <video src="/videos/demo2.mp4" controls className="w-full" />
            </div>
            <div className="space-y-4 order-1 md:order-2">
              <p className="p-4 bg-white/5 rounded border border-white/10 text-gray-400">✅ <strong>Temas Personalizables:</strong> Cambia la estética de la interfaz según tu estilo.</p>
              <p className="p-4 bg-white/5 rounded border border-white/10 text-gray-400">✅ <strong>Modo Coche Avanzado:</strong> Interfaz inmersiva diseñada para pantallas de alta resolución.</p>
            </div>
          </div>
        </section>

        {/* Galería de Capturas */}
        <section className="mb-20">
          <h3 className="text-2xl font-bold mb-8 text-center">Interfaz AudioCar Pro</h3>
          <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
            {['/images/tesla1.jpg', '/images/tesla2.jpg', '/images/tesla3.jpg', '/images/tesla4.jpg', '/images/tesla5.jpg', '/images/tesla6.jpg'].map((src, i) => (
              <img key={i} src={src} alt={`Captura AudioCar Pro ${i+1}`} className="rounded-lg border border-white/10 hover:scale-105 transition-transform cursor-pointer" />
            ))}
          </div>
        </section>

        {/* Formulario de Contacto */}
        <section className="mb-20 bg-white/5 p-8 rounded-2xl border border-white/10">
          <h3 className="text-2xl font-bold mb-6 text-center">Contacto / Soporte</h3>
          {formStatus === 'sent' ? (
            <p className="text-center text-emerald-400">¡Mensaje enviado correctamente!</p>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              <input type="email" placeholder="Tu email" required className="w-full p-3 rounded bg-[#030308] border border-white/10" />
              <select className="w-full p-3 rounded bg-[#030308] border border-white/10">
                <option>Tipo de consulta</option>
                <option>Soporte técnico</option>
                <option>Sugerencias</option>
                <option>Reportar error</option>
              </select>
              <textarea placeholder="Tu mensaje" required className="w-full p-3 rounded bg-[#030308] border border-white/10 h-32"></textarea>
              <button type="submit" disabled={formStatus === 'sending'} className="w-full p-3 rounded bg-cyan-600 hover:bg-cyan-500 font-bold transition-all">
                {formStatus === 'sending' ? 'Enviando...' : 'Enviar mensaje'}
              </button>
            </form>
          )}
        </section>
      </main>
    </div>
  );
};
