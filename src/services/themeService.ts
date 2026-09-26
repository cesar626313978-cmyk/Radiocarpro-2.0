import { ThemeId, THEMES } from '../types/theme';

export class ThemeService {
  private static readonly STORAGE_KEY = 'myradiopro_active_theme';
  private static listeners: ((themeId: ThemeId) => void)[] = [];

  public static getInitialTheme(): ThemeId {
    if (typeof window === 'undefined') return 'space';
    try {
      const saved = localStorage.getItem(this.STORAGE_KEY) as ThemeId;
      if (saved && THEMES[saved]) {
        return saved;
      }
    } catch {}
    return 'space';
  }

  public static applyTheme(themeId: ThemeId): void {
    const config = THEMES[themeId] || THEMES.space;
    if (typeof document === 'undefined') return;

    const root = document.documentElement;
    root.setAttribute('data-theme', themeId);

    root.style.setProperty('--color-theme-bg', config.colors.background);
    root.style.setProperty('--color-hud-border', config.colors.hudBorder);
    root.style.setProperty('--color-hud-center', config.colors.hudCenter);
    root.style.setProperty('--color-accent', config.colors.accent);
    root.style.setProperty('--color-text-primary', config.colors.textPrimary);
    root.style.setProperty('--color-text-secondary', config.colors.textSecondary);
    root.style.setProperty('--color-accent-glow', config.colors.glow);

    // Update body background for smooth bounce
    document.body.style.backgroundColor = config.colors.background;

    // Update PWA / mobile browser status bar theme color
    const themeColorMeta = document.querySelector('meta[name="theme-color"]');
    if (themeColorMeta) {
      themeColorMeta.setAttribute('content', config.colors.background);
    }

    try {
      localStorage.setItem(this.STORAGE_KEY, themeId);
    } catch {}

    // Notify registered listeners
    this.listeners.forEach((listener) => {
      try {
        listener(themeId);
      } catch {}
    });
  }

  public static onThemeChange(listener: (themeId: ThemeId) => void): () => void {
    this.listeners.push(listener);
    return () => {
      this.listeners = this.listeners.filter((l) => l !== listener);
    };
  }
}
