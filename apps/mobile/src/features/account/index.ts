// Public API of the account feature (optional accounts and sync status, AGENTS.md §1 rule 5).
export { AccountSettingsSection } from './components/account-settings-section';
export { AccountScreen, accountErrorCode } from './screens/account-screen';
export { AccountError, type AccountErrorCode } from './types';
export { createAccount, type Credentials, recoverPassword, signIn, signOut } from './usecases';
