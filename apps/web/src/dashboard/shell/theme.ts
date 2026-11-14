'use client';

import { useEffect, useSyncExternalStore } from 'react';

import { type KeyValueStorage } from '../api/browser';

// Light / dark / follow the device. The design tokens already switch on the OS setting; a
// chosen theme pins it with `data-theme` on <html> (see design-tokens/generated/tokens.css).

export type ThemeChoice = 'light' | 'dark' | 'system';

const KEY = 'vl.theme';
const listeners = new Set<() => void>();

function read(storage: KeyValueStorage): ThemeChoice {
  const value = storage.getItem(KEY);
  return value === 'light' || value === 'dark' ? value : 'system';
}

/** Puts the choice on the page. */
export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (choice === 'system') root.removeAttribute('data-theme');
  else root.setAttribute('data-theme', choice);
}

export function useTheme(storage: KeyValueStorage): [ThemeChoice, (choice: ThemeChoice) => void] {
  const choice = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(storage),
    (): ThemeChoice => 'system',
  );

  useEffect(() => applyTheme(choice), [choice]);

  const set = (next: ThemeChoice) => {
    if (next === 'system') storage.removeItem(KEY);
    else storage.setItem(KEY, next);
    for (const listener of listeners) listener();
  };
  return [choice, set];
}
