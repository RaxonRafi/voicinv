'use client';

import { useSyncExternalStore } from 'react';

import { type KeyValueStorage } from '../api/browser';
import { PAGE_FORMATS, type PageFormat } from '../documents/print';

// The paper this browser prints invoices on. A device setting, like on the phone.

const KEY = 'vl.paperSize';
const listeners = new Set<() => void>();

function read(storage: KeyValueStorage): PageFormat {
  const value = storage.getItem(KEY);
  return PAGE_FORMATS.find((format) => format === value) ?? 'a4';
}

export function usePaperSize(storage: KeyValueStorage): [PageFormat, (format: PageFormat) => void] {
  const value = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => read(storage),
    (): PageFormat => 'a4',
  );
  const set = (format: PageFormat) => {
    storage.setItem(KEY, format);
    for (const listener of listeners) listener();
  };
  return [value, set];
}
