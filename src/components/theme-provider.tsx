
'use client';

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';

type Theme = 'light' | 'dark' | 'system';

interface ThemeProviderState {
  theme: Theme;
  setTheme: (theme: Theme) => void;
}

const ThemeProviderContext = createContext<ThemeProviderState | undefined>(undefined);

export function ThemeProvider({
  children,
  defaultTheme = 'system',
  storageKey = 'vericourt-theme',
}: {
  children: ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
}) {
  const [theme, setThemeState] = useState<Theme>(() => {
    if (typeof window !== 'undefined') {
      try {
        return (localStorage.getItem(storageKey) as Theme) || defaultTheme;
      } catch (e) {
        console.error('Failed to read theme from localStorage', e);
        return defaultTheme;
      }
    }
    return defaultTheme;
  });

  useEffect(() => {
    const root = window.document.documentElement;

    const applyThemePreference = (currentThemePreference: Theme) => {
      root.classList.remove('light', 'dark');
      if (currentThemePreference === 'system') {
        const systemPrefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
        root.classList.add(systemPrefersDark ? 'dark' : 'light');
      } else {
        root.classList.add(currentThemePreference);
      }
    };

    applyThemePreference(theme);

    // Listener for system theme changes when 'system' is selected
    let mediaQueryListener: ((this: MediaQueryList, ev: MediaQueryListEvent) => any) | undefined;
    if (theme === 'system') {
      const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
      mediaQueryListener = (e: MediaQueryListEvent) => {
        root.classList.remove('light', 'dark'); // Clear previous
        root.classList.add(e.matches ? 'dark' : 'light'); // Add current system preference
      };
      mediaQuery.addEventListener('change', mediaQueryListener);

      return () => {
        if (mediaQueryListener) {
          mediaQuery.removeEventListener('change', mediaQueryListener);
        }
      };
    }
  }, [theme]);

  const setTheme = (newTheme: Theme) => {
    if (typeof window !== 'undefined') {
      try {
        localStorage.setItem(storageKey, newTheme);
      } catch (e) {
        console.error('Failed to save theme to localStorage', e);
      }
    }
    setThemeState(newTheme);
  };

  const value = {
    theme,
    setTheme,
  };

  return (
    <ThemeProviderContext.Provider value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}

export const useTheme = () => {
  const context = useContext(ThemeProviderContext);
  if (context === undefined) {
    throw new Error('useTheme must be used within a ThemeProvider');
  }
  return context;
};
