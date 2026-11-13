export { AppLockOverlay } from './components/app-lock-overlay';
export { SecuritySettingsSection } from './components/security-settings-section';
export { useBiometricLock } from './hooks/use-biometric-lock';
export {
  applyLockSetting,
  authenticate,
  changeLockSetting,
  handleAppStateChange,
  unlock,
  useLockStore,
} from './lock-store';
export {
  authenticateWithBiometrics,
  getSecurityLockEnabled,
  isBiometricSupported,
  setSecurityLockEnabled,
} from './service';
