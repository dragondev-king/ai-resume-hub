import React, { useState, useEffect, useCallback } from 'react';
import { Toaster, ToastBar, toast } from 'react-hot-toast';
import type { Toast } from 'react-hot-toast';

const ERROR_DURATION_MS = 60 * 1000; // 1 min for errors only
const DEFAULT_DURATION_MS = 2000;    // 2s for success, loading, blank

function ToastProgressBar({ toast: t, onComplete }: { toast: Toast; onComplete: () => void }) {
  const duration = t.duration ?? DEFAULT_DURATION_MS;
  const createdAt = t.createdAt ?? Date.now();
  const [remainingPercent, setRemainingPercent] = useState(100);

  useEffect(() => {
    if (t.visible === false) return;
    let rafId: number;
    const tick = () => {
      const elapsed = Date.now() - createdAt;
      const remaining = Math.max(0, 100 - (elapsed / duration) * 100);
      setRemainingPercent(remaining);
      if (remaining <= 0) {
        onComplete();
        return;
      }
      rafId = requestAnimationFrame(tick);
    };
    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, [t.visible, duration, createdAt, onComplete]);

  return (
    <div
      className="absolute bottom-0 left-0 h-1 rounded-b-[8px] bg-primary-500/30 transition-none"
      style={{ width: `${remainingPercent}%` }}
      role="progressbar"
      aria-valuenow={100 - remainingPercent}
      aria-valuemin={0}
      aria-valuemax={100}
    />
  );
}

function SingleToastBar({ t }: { t: Toast }) {
  const handleDismiss = useCallback(() => {
    toast.remove(t.id);
  }, [t.id]);

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={handleDismiss}
      onKeyDown={(e) => e.key === 'Enter' && handleDismiss()}
      className="relative overflow-hidden rounded-lg cursor-pointer focus:outline-none focus-visible:ring-2 focus-visible:ring-primary-500 focus-visible:ring-offset-2"
      style={{ minWidth: '280px' }}
    >
      <ToastBar toast={t}>
        {({ icon, message }) => (
          <>
            <div className="flex items-center flex-1 min-w-0 pr-8">
              {icon}
              <div className="flex-1 min-w-0" {...t.ariaProps}>
                {message}
              </div>
            </div>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                handleDismiss();
              }}
              className="absolute top-2 right-2 p-1 rounded text-gray-400 hover:text-gray-600 hover:bg-gray-100 focus:outline-none"
              aria-label="Dismiss"
            >
              <span className="text-lg leading-none">×</span>
            </button>
          </>
        )}
      </ToastBar>
      <ToastProgressBar toast={t} onComplete={handleDismiss} />
    </div>
  );
}

export function CustomToaster() {
  return (
    <Toaster
      position="top-right"
      toastOptions={{
        duration: DEFAULT_DURATION_MS,
        removeDelay: 0,
        success: { duration: DEFAULT_DURATION_MS },
        error: { duration: ERROR_DURATION_MS },
        loading: { duration: DEFAULT_DURATION_MS },
        blank: { duration: DEFAULT_DURATION_MS },
      }}
    >
      {(t) => <SingleToastBar t={t} />}
    </Toaster>
  );
}
