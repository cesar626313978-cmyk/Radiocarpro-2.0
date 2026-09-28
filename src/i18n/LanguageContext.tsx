import React, { createContext, useContext, useState, useEffect } from 'react';
import { Language, translations, Translations } from './translations';

interface LanguageContextType {
  lang: Language;
  setLang: (lang: Language) => void;
  toggleLang: () => void;
  t: Translations;
}

const LanguageContext = createContext<LanguageContextType | undefined>(undefined);

export const LanguageProvider: React.FC<{
  children: React.ReactNode;
  initialLang?: Language;
  onLanguageChange?: (lang: Language) => void;
}> = ({ children, initialLang, onLanguageChange }) => {
  const [lang, setLangState] = useState<Language>(() => {
    if (initialLang) return initialLang;
    try {
      const saved = localStorage.getItem('radiostream_lang');
      if (saved === 'ES' || saved === 'EN') return saved;
      const navLang = typeof navigator !== 'undefined' ? navigator.language?.toLowerCase() : '';
      if (navLang?.startsWith('en')) return 'EN';
    } catch {}
    return 'ES';
  });

  const setLang = (newLang: Language) => {
    setLangState(newLang);
    try {
      localStorage.setItem('radiostream_lang', newLang);
    } catch {}
    if (onLanguageChange) {
      onLanguageChange(newLang);
    }
  };

  const toggleLang = () => {
    setLangState(prev => {
      const next: Language = prev === 'ES' ? 'EN' : 'ES';
      try {
        localStorage.setItem('radiostream_lang', next);
      } catch {}
      if (onLanguageChange) {
        onLanguageChange(next);
      }
      return next;
    });
  };

  // Sync if initialLang changes externally
  useEffect(() => {
    if (initialLang && (initialLang === 'ES' || initialLang === 'EN') && initialLang !== lang) {
      setLangState(initialLang);
    }
  }, [initialLang]);

  return (
    <LanguageContext.Provider value={{ lang, setLang, toggleLang, t: translations[lang] || translations.ES }}>
      {children}
    </LanguageContext.Provider>
  );
};

export const useTranslation = (): LanguageContextType => {
  const context = useContext(LanguageContext);
  if (!context) {
    return {
      lang: 'ES',
      setLang: () => {},
      toggleLang: () => {},
      t: translations.ES,
    };
  }
  return context;
};
