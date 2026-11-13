import { useCallback, useEffect, useRef, useState } from 'react';

import { type AppLifecycleState, getCurrentAppState, onAppStateChange } from '@/core/platform';
import { useServices } from '@/core/services';

import { authenticateWithBiometrics, getSecurityLockEnabled } from '../service';

export function useBiometricLock(promptMessage: string) {
  const services = useServices();
  const [isLocked, setIsLocked] = useState(false);
  const [isLockEnabled, setIsLockEnabled] = useState(false);
  const appState = useRef<AppLifecycleState>(getCurrentAppState());

  const checkLockStatus = useCallback(async () => {
    try {
      const enabled = await getSecurityLockEnabled(services.db);
      setIsLockEnabled(enabled);
      if (enabled) {
        setIsLocked(true);
      }
    } catch {
      // Ignored if DB is not ready yet
    }
  }, [services.db]);

  useEffect(() => {
    let mounted = true;
    void getSecurityLockEnabled(services.db)
      .then((enabled) => {
        if (!mounted) return;
        setIsLockEnabled(enabled);
        if (enabled) {
          setIsLocked(true);
        }
      })
      .catch(() => {
        // Ignored if DB is not ready yet
      });
    return () => {
      mounted = false;
    };
  }, [services.db]);

  const unlock = useCallback(async (): Promise<boolean> => {
    const success = await authenticateWithBiometrics(promptMessage);
    if (success) {
      setIsLocked(false);
    }
    return success;
  }, [promptMessage]);

  useEffect(() => {
    return onAppStateChange((nextState) => {
      if (
        (appState.current === 'inactive' || appState.current === 'background') &&
        nextState === 'active' &&
        isLockEnabled
      ) {
        setIsLocked(true);
      }
      appState.current = nextState;
    });
  }, [isLockEnabled]);

  return {
    isLocked,
    isLockEnabled,
    unlock,
    refreshStatus: checkLockStatus,
  };
}
