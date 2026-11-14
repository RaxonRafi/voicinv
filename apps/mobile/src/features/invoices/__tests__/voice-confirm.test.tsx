import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { invoices } from '@/core/db';
import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';
import { createCustomer } from '@/features/customers';

import { type InvoiceDraft } from '../draft';
import { InvoiceFormScreen } from '../screens/invoice-form-screen';

// A spoken invoice opens on a summary with one Save button (AGENTS.md §2 core loop: speak →
// review → save). Uncertain values are highlighted; anything missing goes to the editor.

describe('confirming a spoken invoice', () => {
  let app: TestShopApp;
  let karim: string;

  beforeEach(async () => {
    app = await createTestShopApp();
    karim = (
      await createCustomer(app.ctx, {
        name: 'Karim',
        phone: '',
        notes: '',
        creditLimit: 100_000,
        aliases: [],
      })
    ).id;
  });

  afterEach(() => app.close());

  function spoken(overrides: Partial<InvoiceDraft> = {}): InvoiceDraft {
    return {
      customerId: karim,
      customerName: 'Karim',
      customerConfidence: 1,
      items: [
        {
          key: 'parsed-1',
          productId: null,
          name: 'Sugar',
          unit: 'kg',
          qtyMilli: 2000,
          unitPrice: 15_000,
          confidence: 1,
        },
      ],
      discount: 0,
      payment: { type: 'NONE' },
      paymentConfidence: 1,
      sourceText: 'karim 2 kg sugar 300 taka',
      ...overrides,
    };
  }

  it('shows what was heard and saves it with one tap', async () => {
    await renderWithApp(<InvoiceFormScreen initialDraft={spoken()} />, app.services);

    expect(await screen.findByTestId('invoice-confirm-screen')).toBeOnTheScreen();
    expect(screen.getByTestId('voice-summary-customer')).toHaveTextContent(/Karim/);
    expect(screen.getByTestId('voice-summary-line-0')).toHaveTextContent(/Sugar/);
    expect(screen.getByTestId('voice-summary-total')).toHaveTextContent(/300/);
    expect(screen.getByTestId('voice-summary-due')).toHaveTextContent(/300/);
    expect(screen.queryByText('Please check this')).toBeNull();

    await fireEvent.press(screen.getByTestId('invoice-save'));

    await waitFor(() => expect(router.replace).toHaveBeenCalled());
    const [saved] = await app.db.orm.select().from(invoices);
    expect(saved).toMatchObject({ total: 30_000, dueAmount: 30_000, customerId: karim });
    expect(saved?.sourceText).toBe('karim 2 kg sugar 300 taka');
  });

  it('highlights a value the parser was unsure about', async () => {
    const draft = spoken();
    const [line] = draft.items;
    if (!line) throw new Error('line missing');
    await renderWithApp(
      <InvoiceFormScreen initialDraft={{ ...draft, items: [{ ...line, confidence: 0.5 }] }} />,
      app.services,
    );

    expect(await screen.findByText('Please check this')).toBeOnTheScreen();
  });

  it('opens the full editor on Edit', async () => {
    await renderWithApp(<InvoiceFormScreen initialDraft={spoken()} />, app.services);

    await fireEvent.press(await screen.findByTestId('invoice-edit-details'));

    expect(screen.getByTestId('invoice-form-screen')).toBeOnTheScreen();
  });

  it('goes straight to the editor, showing what is missing, when a price was not heard', async () => {
    const draft = spoken();
    const [line] = draft.items;
    if (!line) throw new Error('line missing');
    await renderWithApp(
      <InvoiceFormScreen initialDraft={{ ...draft, items: [{ ...line, unitPrice: null }] }} />,
      app.services,
    );

    expect(await screen.findByTestId('invoice-form-screen')).toBeOnTheScreen();
    // The price field of the line is marked, without the user having to press Save first.
    expect(screen.getByText('Enter a valid amount.')).toBeOnTheScreen();
  });

  it('still warns when the sale takes the customer over their credit limit', async () => {
    const draft = spoken();
    const [line] = draft.items;
    if (!line) throw new Error('line missing');
    await renderWithApp(
      <InvoiceFormScreen initialDraft={{ ...draft, items: [{ ...line, unitPrice: 60_000 }] }} />,
      app.services,
    );

    expect(await screen.findByText(/over their credit limit/)).toBeOnTheScreen();
  });
});
