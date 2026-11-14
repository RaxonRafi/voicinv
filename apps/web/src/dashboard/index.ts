// Public API of the dashboard module: the signed-in web app (AGENTS.md M12b). Route files in
// `app/[locale]/app/` import from here only.
export { DashboardProvider } from './app-context';
export { APP_SCREENS, appPath, type AppScreen } from './routes';
export {
  CustomerDetailScreen,
  CustomerFormScreen,
  CustomerListScreen,
  PaymentFormScreen,
} from './screens/customer-screens';
export { HomeScreen } from './screens/home-screen';
export { InvoiceDetailScreen } from './screens/invoice-detail-screen';
export { InvoiceFormScreen } from './screens/invoice-form-screen';
export { InvoiceListScreen } from './screens/invoice-list-screen';
export { ProductFormScreen, ProductListScreen } from './screens/product-screens';
export { ReportsScreen } from './screens/reports-screen';
export { SettingsScreen, ShopProfileScreen } from './screens/settings-screens';
export { AppShell } from './shell/app-shell';
