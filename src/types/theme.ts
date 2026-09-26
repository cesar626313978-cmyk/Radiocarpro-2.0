export type ThemeId = 'space' | 'ocean' | 'lunar' | 'canyon' | 'savanna' | 'jungle';

export interface ThemeConfig {
  id: ThemeId;
  name: string;
  subtitle: string;
  description: string;
  colors: {
    background: string;
    hudBorder: string;
    hudCenter: string;
    accent: string;
    textPrimary: string;
    textSecondary: string;
    glow: string;
  };
}

export const THEMES: Record<ThemeId, ThemeConfig> = {
  space: {
    id: 'space',
    name: 'Espacio Exterior',
    subtitle: 'Cosmos & Supernovas',
    description: 'Estrellas titilantes, polvo cósmico estelar y profundidad infinita del universo.',
    colors: {
      background: '#040711',
      hudBorder: 'rgba(0, 229, 255, 0.35)',
      hudCenter: '#081326',
      accent: '#00e5ff',
      textPrimary: '#ffffff',
      textSecondary: '#64748b',
      glow: 'rgba(0, 229, 255, 0.45)',
    },
  },
  ocean: {
    id: 'ocean',
    name: 'Fondo Marino',
    subtitle: 'Abismo Bioluminiscente',
    description: 'Bosque de algas kelp articuladas, cardumen de peces elástico, tiburón predador abisal y microburbujas.',
    colors: {
      background: '#01121e',
      hudBorder: 'rgba(0, 250, 200, 0.4)',
      hudCenter: 'rgba(2, 24, 38, 0.85)',
      accent: '#00fac8',
      textPrimary: '#e2fcf7',
      textSecondary: '#5294a8',
      glow: 'rgba(0, 250, 200, 0.45)',
    },
  },
  lunar: {
    id: 'lunar',
    name: 'Paisaje Lunar',
    subtitle: 'Regolito, Cráteres & Rover',
    description: 'Corteza lunar con cráteres de impacto, Tierra en el horizonte, sonda orbital y vehículo Lunar Rover en exploración activa.',
    colors: {
      background: '#06070a',
      hudBorder: 'rgba(226, 232, 240, 0.35)',
      hudCenter: 'rgba(15, 18, 28, 0.9)',
      accent: '#38bdf8',
      textPrimary: '#f8fafc',
      textSecondary: '#94a3b8',
      glow: 'rgba(56, 189, 248, 0.35)',
    },
  },
  canyon: {
    id: 'canyon',
    name: 'Gran Cañón',
    subtitle: 'Crepúsculo Colorado & Águilas',
    description: 'Bóveda celeste en atardecer, mesetas y buttes sedimentarias, sol poniente, calima desértica y águilas en planeo térmico.',
    colors: {
      background: '#1a0808',
      hudBorder: 'rgba(232, 120, 35, 0.4)',
      hudCenter: 'rgba(26, 8, 8, 0.92)',
      accent: '#e87823',
      textPrimary: '#fff2e0',
      textSecondary: '#c26929',
      glow: 'rgba(232, 120, 35, 0.45)',
    },
  },
  savanna: {
    id: 'savanna',
    name: 'Sabana Africana',
    subtitle: 'Atardecer Dorado',
    description: 'Horizonte dorado cálido con bruma térmica, ascuas doradas y polen en suave ascenso.',
    colors: {
      background: '#191203',
      hudBorder: 'rgba(245, 158, 11, 0.35)',
      hudCenter: '#261b05',
      accent: '#f59e0b',
      textPrimary: '#fef3c7',
      textSecondary: '#a16207',
      glow: 'rgba(245, 158, 11, 0.45)',
    },
  },
  jungle: {
    id: 'jungle',
    name: 'Selva Amazónica',
    subtitle: 'Dosel, Lianas & Luciérnagas',
    description: 'Lianas colgantes oscilantes, follaje de monstera y helechos, garúa tropical, guacamayos en vuelo y luciérnagas bioluminiscentes.',
    colors: {
      background: '#010804',
      hudBorder: 'rgba(34, 197, 94, 0.4)',
      hudCenter: 'rgba(4, 28, 14, 0.9)',
      accent: '#22c55e',
      textPrimary: '#f0fdf4',
      textSecondary: '#4ade80',
      glow: 'rgba(34, 197, 94, 0.45)',
    },
  },
};
