import { Tabs } from 'expo-router/js-tabs';

import { useTranslation } from '@/core/i18n';
import { type IconName, TabBar } from '@/core/ui';

/** The top-level areas of the app, in tab bar order. */
const TABS = [
  { name: 'index', icon: 'home', label: 'home.home' },
  { name: 'invoices', icon: 'invoice', label: 'home.invoices' },
  { name: 'customers', icon: 'customers', label: 'home.customers' },
  { name: 'products', icon: 'product', label: 'home.products' },
  { name: 'reports', icon: 'chart', label: 'home.reports' },
] as const satisfies readonly { name: string; icon: IconName; label: string }[];

export default function TabsLayout() {
  const { t } = useTranslation();
  return (
    <Tabs
      // Each screen draws its own header through ScreenHeader.
      screenOptions={{ headerShown: false }}
      tabBar={({ state, navigateToTab }) => (
        <TabBar
          items={TABS.flatMap((tab) => {
            const index = state.routes.findIndex((route) => route.name === tab.name);
            const route = state.routes[index];
            if (!route) return [];
            return [
              {
                key: route.key,
                label: t(tab.label),
                icon: tab.icon,
                active: index === state.index,
                onPress: () => navigateToTab(route.key),
                testID: `tab-${tab.name}`,
              },
            ];
          })}
        />
      )}
    >
      {TABS.map((tab) => (
        <Tabs.Screen key={tab.name} name={tab.name} />
      ))}
    </Tabs>
  );
}
