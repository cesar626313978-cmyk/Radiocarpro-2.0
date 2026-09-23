import React, { useEffect, useState } from 'react';
import { RadioStation } from '../types/radio';

interface TuningModalProps {
  station: RadioStation | null;
  isOpen: boolean;
  onCancel: () => void;
}

export const TuningModal: React.FC<TuningModalProps> = ({ station, isOpen, onCancel }) => {
  const [barHeights, setBarHeights] = useState<number[]>([15, 35, 25, 60, 45, 85, 95, 75, 50, 65, 30, 20]);

  useEffect(() => {
    if (!isOpen) return;

    const interval = setInterval(() => {
      setBarHeights(prev =>
        prev.map(() => Math.floor(Math.random() * 85) + 15)
      );
    }, 120);

    return () => clearInterval(interval);
  }, [isOpen]);

  if (!isOpen || !station) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm scanlines animate-fadeIn">
      <div className="w-full max-w-lg bg-[#201f1f] border-3 border-black shadow-[8px_8px_0px_0px_rgba(0,0,0,1)] p-6 md:p-8 flex flex-col gap-6 relative">
        {/* Top Left Tag */}
        <div className="absolute top-0 left-0 bg-black text-[#10B981] px-3 py-1 font-mono-tech text-[10px] font-bold border-b-3 border-r-3 border-black uppercase flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-[#10B981] animate-pulse"></div>
          TUNING_MODULE
        </div>

        {/* Station Frequency Display */}
        <div className="mt-4 flex flex-col items-center text-center gap-2">
          <h2 className="font-mono-tech text-2xl md:text-3xl font-black text-[#10B981] tracking-tighter uppercase animate-blinker">
            SINTONIZANDO...
          </h2>
          <div className="text-sm font-bold text-white uppercase tracking-wider">
            {station.name}
          </div>
          <div className="flex flex-wrap items-center justify-center gap-3 mt-1">
            <span className="border-2 border-black bg-[#131313] text-[#e5e2e1] px-2.5 py-1 font-mono-tech text-xs font-semibold uppercase">
              IP: {station.ip}
            </span>
            <span className="border-2 border-black bg-[#8B5CF6] text-white px-2.5 py-1 font-mono-tech text-xs font-bold uppercase">
              SRV_LOOKUP_ACTIVE
            </span>
          </div>
        </div>

        {/* Frequency Spectrum Visualizer */}
        <div className="w-full h-36 bg-[#0e0e0e] border-3 border-black p-4 flex items-center justify-center relative overflow-hidden">
          {/* Grid lines background */}
          <div
            className="absolute inset-0 opacity-20 pointer-events-none"
            style={{
              backgroundImage:
                'linear-gradient(to right, #334155 1px, transparent 1px), linear-gradient(to bottom, #334155 1px, transparent 1px)',
              backgroundSize: '16px 16px',
            }}
          />

          {/* Dynamic Equalizer Bars */}
          <div className="flex items-end justify-between w-full h-full gap-1.5 z-10">
            {barHeights.map((h, i) => (
              <div
                key={i}
                className="w-full bg-[#10B981] border-t-2 border-black transition-all duration-100 ease-out"
                style={{
                  height: `${h}%`,
                  opacity: 0.3 + (h / 100) * 0.7,
                }}
              />
            ))}
          </div>
        </div>

        {/* Technical Sub-info */}
        <div className="flex justify-between items-center text-xs font-mono-tech text-[#bbcabf] px-1">
          <span>CODEC: {station.format} / {station.bitrate} KBPS</span>
          <span>LOCATION: {station.country}</span>
        </div>

        {/* Cancel Button */}
        <div className="flex justify-center mt-2">
          <button
            onClick={onCancel}
            className="neo-button bg-[#EF4444] text-white font-mono-tech text-sm font-bold px-10 py-3.5 border-3 border-black uppercase tracking-wider hover:bg-[#dc2626]"
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
};
