'use client';

import { CircleCheck, Info, TriangleAlert, X } from 'lucide-react';
import { type ReactNode, useEffect, useId, useRef, useSyncExternalStore } from 'react';

import { IconButton } from './controls';
import { cx } from './cx';

interface DialogProps {
  open: boolean;
  /** Called when the user dismisses the dialog (Escape, the close button, the backdrop). */
  onClose: () => void;
  title: string;
  /** Accessible name of the close button. */
  closeLabel: string;
  children: ReactNode;
  /** Buttons at the bottom, primary action last. */
  footer?: ReactNode;
}

/**
 * Modal dialog built on the native `<dialog>` element, which traps focus, closes on Escape and
 * returns focus to where it was. The content is only rendered while the dialog is open.
 */
export function Dialog({ open, onClose, title, closeLabel, children, footer }: DialogProps) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === ref.current) onClose();
      }}
      className="m-auto max-h-dvh w-full max-w-lg overflow-y-auto rounded-2xl bg-bg-surface p-0 text-text-primary shadow-lg backdrop:bg-bg-overlay print:hidden"
    >
      {open ? (
        <div className="flex flex-col gap-4 p-6">
          <div className="flex items-start justify-between gap-3">
            <h2 id={titleId} className="pt-2 text-title text-balance text-text-primary">
              {title}
            </h2>
            <IconButton label={closeLabel} onClick={onClose}>
              <X aria-hidden="true" className="size-6" />
            </IconButton>
          </div>
          {children}
          {footer ? <div className="flex flex-wrap justify-end gap-3 pt-2">{footer}</div> : null}
        </div>
      ) : null}
    </dialog>
  );
}

export type ToastTone = 'success' | 'danger' | 'info';

interface Toast {
  id: number;
  message: string;
  tone: ToastTone;
}

const TOAST_MS = 5000;
let toasts: readonly Toast[] = [];
let nextToastId = 0;
const toastListeners = new Set<() => void>();

function setToasts(next: readonly Toast[]): void {
  toasts = next;
  for (const listener of toastListeners) listener();
}

/** Shows a short message that goes away by itself. Safe to call from any event handler. */
export function showToast(message: string, tone: ToastTone = 'success'): void {
  nextToastId += 1;
  const id = nextToastId;
  setToasts([...toasts.slice(-2), { id, message, tone }]);
  setTimeout(() => setToasts(toasts.filter((toast) => toast.id !== id)), TOAST_MS);
}

const NO_TOASTS: readonly Toast[] = [];
const TOAST_ICON = { success: CircleCheck, danger: TriangleAlert, info: Info } as const;
const TOAST_TONE = {
  success: 'text-status-success',
  danger: 'text-status-danger',
  info: 'text-status-info',
} as const;

/**
 * Where toasts appear; render it once per page. It is a live region, so screen readers
 * announce each message. Tone is shown by an icon as well as color.
 */
export function ToastRegion() {
  const current = useSyncExternalStore(
    (listener) => {
      toastListeners.add(listener);
      return () => toastListeners.delete(listener);
    },
    () => toasts,
    () => NO_TOASTS,
  );
  return (
    <div
      role="status"
      aria-live="polite"
      className="pointer-events-none fixed inset-x-0 top-4 z-(--vl-z-toast) flex flex-col items-center gap-2 px-4 print:hidden"
    >
      {current.map((toast) => {
        const Glyph = TOAST_ICON[toast.tone];
        return (
          <div
            key={toast.id}
            className="pointer-events-auto flex max-w-md items-start gap-3 rounded-xl bg-bg-raised p-4 text-body text-text-primary shadow-lg"
          >
            <Glyph aria-hidden="true" className={cx('size-6 shrink-0', TOAST_TONE[toast.tone])} />
            {toast.message}
          </div>
        );
      })}
    </div>
  );
}
