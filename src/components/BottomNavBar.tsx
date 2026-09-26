import React from 'react';
import { TabType } from '../types/radio';

interface BottomNavBarProps {
  currentTab: TabType;
  onSelectTab: (tab: TabType) => void;
}

export const BottomNavBar: React.FC<BottomNavBarProps> = ({ currentTab, onSelectTab }) => {
  const tabs: { id: TabType; label: string; icon: string }[] = [
    { id: 'descubrir', label: 'RADIO', icon: 'radio' },
    { id: 'favoritas', label: 'FAVORITAS', icon: 'favorite' },
    { id: 'drive', label: 'MUSIC', icon: 'folder_open' },
    { id: 'coche', label: 'COCHE', icon: 'directions_car' },
  ];

  return (
    <nav className="md:hidden fixed bottom-0 left-0 right-0 z-40 border-t-3 border-black bg-[#201f1f] flex justify-around items-center h-18 px-1 pb-safe shadow-[0px_-4px_0px_0px_rgba(0,0,0,1)]">
      {tabs.map(tab => {
        const isActive = currentTab === tab.id;
        return (
          <button
            key={tab.id}
            onClick={() => onSelectTab(tab.id)}
            className={`flex flex-col items-center justify-center pt-1.5 pb-1 flex-1 transition-all relative ${
              isActive
                ? 'border-t-3 -mt-[3px] font-bold'
                : 'text-[#bbcabf] hover:text-white'
            }`}
            style={
              isActive
                ? {
                    color: 'var(--color-accent, #4edea3)',
                    borderColor: 'var(--color-accent, #4edea3)',
                  }
                : {}
            }
          >
            <span
              className="material-symbols-outlined text-2xl mb-0.5"
              style={isActive ? { fontVariationSettings: "'FILL' 1" } : {}}
            >
              {tab.icon}
            </span>
            <span className="font-mono-tech text-[10px] uppercase truncate w-full text-center">
              {tab.label}
            </span>
          </button>
        );
      })}
    </nav>
  );
};
