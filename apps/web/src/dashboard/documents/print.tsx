'use client';

import { type ReactNode, useEffect, useSyncExternalStore } from 'react';
import { createPortal } from 'react-dom';

// Printing from the browser, which also covers "save as PDF": the document is rendered into a
// print-only area at the end of <body>, everything else is hidden while it prints, and the
// browser's own print dialog does the rest. Nothing leaves the computer.

export type PageFormat = 'a4' | 'thermal58' | 'thermal80';

export const PAGE_FORMATS: readonly PageFormat[] = ['a4', 'thermal58', 'thermal80'];

/** CSS `@page` size and margin per paper. Thermal paper is a roll, so its page is long. */
const PAGE_RULE: Readonly<Record<PageFormat, string>> = {
  a4: 'size: A4; margin: 14mm;',
  thermal58: 'size: 58mm 500mm; margin: 2mm;',
  thermal80: 'size: 80mm 500mm; margin: 3mm;',
};

interface PrintJob {
  id: number;
  format: PageFormat;
  content: ReactNode;
}

let job: PrintJob | null = null;
let nextJobId = 0;
const listeners = new Set<() => void>();

function setJob(next: PrintJob | null): void {
  job = next;
  for (const listener of listeners) listener();
}

/** Opens the browser's print dialog for `content` on the given paper. */
export function printDocument(content: ReactNode, format: PageFormat = 'a4'): void {
  nextJobId += 1;
  setJob({ id: nextJobId, format, content });
}

export const PRINT_ROOT_ID = 'vl-print-root';
/** Class on <html> while a document prints; globals.css hides the rest of the page then. */
export const PRINTING_CLASS = 'vl-printing';

/** Render once per page. Holds the document being printed. */
export function PrintHost() {
  const current = useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => job,
    () => null,
  );
  // Portals need document.body, which only exists in the browser.
  const mounted = useSyncExternalStore(
    () => () => undefined,
    () => true,
    () => false,
  );

  useEffect(() => {
    if (!current) return;
    const root = document.documentElement;
    const theme = root.getAttribute('data-theme');
    // Documents are printed on white paper, whatever the screen theme is.
    root.setAttribute('data-theme', 'light');
    root.classList.add(PRINTING_CLASS);
    const style = document.createElement('style');
    style.textContent = `@page { ${PAGE_RULE[current.format]} }`;
    document.head.appendChild(style);

    let finished = false;
    const finish = () => {
      if (finished) return;
      finished = true;
      style.remove();
      root.classList.remove(PRINTING_CLASS);
      if (theme === null) root.removeAttribute('data-theme');
      else root.setAttribute('data-theme', theme);
      setJob(null);
    };
    window.addEventListener('afterprint', finish, { once: true });
    // Let the document paint first, then open the dialog.
    const timer = window.setTimeout(() => window.print(), 50);
    return () => {
      window.clearTimeout(timer);
      window.removeEventListener('afterprint', finish);
    };
  }, [current]);

  if (!mounted) return null;
  return createPortal(
    <div id={PRINT_ROOT_ID} className="hidden bg-bg-surface text-text-primary print:block">
      {current?.content}
    </div>,
    document.body,
  );
}
