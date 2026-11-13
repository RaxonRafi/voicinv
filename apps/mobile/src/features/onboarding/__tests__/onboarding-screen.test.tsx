import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { products } from '@/core/db';
import { findCurrentShop } from '@/core/services';
import { createTestApp, renderWithApp, type TestApp } from '@/core/testing/harness';

import { OnboardingScreen } from '../screens/onboarding-screen';

describe('OnboardingScreen', () => {
  let app: TestApp;

  beforeEach(async () => {
    app = await createTestApp();
  });

  afterEach(() => app.close());

  it('creates the shop from the form and goes to the home screen', async () => {
    await renderWithApp(<OnboardingScreen />, app.services);

    await fireEvent.changeText(screen.getByTestId('onboarding-shop-name'), 'Rahim Store');
    await fireEvent.changeText(screen.getByTestId('onboarding-phone'), '01712345678');
    await fireEvent.press(screen.getByTestId('onboarding-submit'));

    await waitFor(() => expect(router.replace).toHaveBeenCalledWith('/'));
    expect(await findCurrentShop(app.db.orm)).toMatchObject({
      name: 'Rahim Store',
      phone: '01712345678',
      invoicePrefix: 'RS',
      currencyCode: 'BDT',
    });
    // The default shop type (grocery) seeds starter products.
    expect((await app.db.orm.select().from(products)).length).toBeGreaterThan(0);
  });

  it('asks for a shop name instead of creating a nameless shop', async () => {
    await renderWithApp(<OnboardingScreen />, app.services);

    await fireEvent.press(screen.getByTestId('onboarding-submit'));

    expect(await screen.findByText('This is required.')).toBeOnTheScreen();
    expect(await findCurrentShop(app.db.orm)).toBeNull();
    expect(router.replace).not.toHaveBeenCalled();
  });

  it('shows a phone number problem on the phone field', async () => {
    await renderWithApp(<OnboardingScreen />, app.services);

    await fireEvent.changeText(screen.getByTestId('onboarding-shop-name'), 'Rahim Store');
    await fireEvent.changeText(screen.getByTestId('onboarding-phone'), '12ab');
    await fireEvent.press(screen.getByTestId('onboarding-submit'));

    expect(await screen.findByText('Enter a valid phone number.')).toBeOnTheScreen();
    expect(await findCurrentShop(app.db.orm)).toBeNull();
  });
});
