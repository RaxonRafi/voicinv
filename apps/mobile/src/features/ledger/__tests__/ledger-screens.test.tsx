import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { createFormatters } from '@/core/i18n';
import { htmlToPdf, shareFile, shareText } from '@/core/platform';
import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';
import { createCustomer } from '@/features/customers';

import { buildStatementHtml, signedMoney } from '../document';
import { getBalance } from '../repository';
import { CustomerLedgerScreen } from '../screens/customer-ledger-screen';
import { PaymentFormScreen } from '../screens/payment-form-screen';
import { getStatement, recordInvoiceDue, recordPayment } from '../usecases';

describe('ledger screens', () => {
  let app: TestShopApp;
  let karim: string;

  beforeEach(async () => {
    app = await createTestShopApp();
    karim = (
      await createCustomer(app.ctx, {
        name: 'Karim',
        phone: '01712345678',
        notes: '',
        creditLimit: 200_000,
        aliases: [],
      })
    ).id;
  });

  afterEach(() => app.close());

  const owe = (amount: number) =>
    app.db.write((tx) =>
      recordInvoiceDue(tx, app.ctx, { customerId: karim, refId: app.ctx.newId(), amount }),
    );

  describe('PaymentFormScreen', () => {
    it('records a payment for the given customer and reports the new balance', async () => {
      await owe(250_000);
      await renderWithApp(<PaymentFormScreen customerId={karim} />, app.services);

      expect(await screen.findByText('Karim')).toBeOnTheScreen();
      expect(screen.getByText('Owes ৳2,500')).toBeOnTheScreen();
      await fireEvent.changeText(screen.getByTestId('payment-amount'), '1,000');
      await fireEvent.changeText(screen.getByTestId('payment-note'), 'cash');
      await fireEvent.press(screen.getByTestId('payment-save'));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      expect(await getBalance(app.db.orm, karim)).toBe(150_000);
      const statement = await getStatement(app.db.orm, karim);
      expect(statement.at(-1)?.entry).toMatchObject({ type: 'PAYMENT', amount: -100_000 });
    });

    it('does not save without an amount', async () => {
      await renderWithApp(<PaymentFormScreen customerId={karim} />, app.services);

      await fireEvent.press(await screen.findByTestId('payment-save'));

      expect(await screen.findByText('Enter a valid amount.')).toBeOnTheScreen();
      expect(await getBalance(app.db.orm, karim)).toBe(0);
      expect(router.back).not.toHaveBeenCalled();
    });

    it('asks for a customer when opened without one', async () => {
      await renderWithApp(<PaymentFormScreen />, app.services);

      expect(await screen.findByText('Choose customer')).toBeOnTheScreen();
      await fireEvent.changeText(screen.getByTestId('payment-amount'), '500');
      await fireEvent.press(screen.getByTestId('payment-save'));
      expect(await screen.findByText('This is required.')).toBeOnTheScreen();

      await fireEvent.press(screen.getByTestId('payment-customer'));
      await fireEvent.press(await screen.findByTestId(`customer-picker-${karim}`));
      await fireEvent.press(screen.getByTestId('payment-save'));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      expect(await getBalance(app.db.orm, karim)).toBe(-50_000);
    });

    it('starts with an amount that was spoken', async () => {
      await renderWithApp(
        <PaymentFormScreen customerId={karim} initialAmount={50_000} />,
        app.services,
      );
      expect(await screen.findByTestId('payment-amount')).toHaveDisplayValue('500');
    });
  });

  describe('CustomerLedgerScreen', () => {
    it('shows the balance in words, the credit limit warning and the history', async () => {
      await owe(250_000);
      app.clock.advance(1000);
      await recordPayment(app.ctx, {
        customerId: karim,
        amount: 30_000,
        note: '',
        invoiceId: null,
      });
      await renderWithApp(<CustomerLedgerScreen customerId={karim} />, app.services);

      expect(await screen.findByTestId('customer-balance')).toHaveTextContent('Owes ৳2,200');
      expect(screen.getByText('Over the credit limit of ৳2,000')).toBeOnTheScreen();
      expect(screen.getByText('Payment received')).toBeOnTheScreen();
      expect(screen.getByText('−৳300')).toBeOnTheScreen();
      expect(screen.getByText('+৳2,500')).toBeOnTheScreen();
    });

    it('updates as soon as a payment is recorded elsewhere', async () => {
      await owe(250_000);
      await renderWithApp(<CustomerLedgerScreen customerId={karim} />, app.services);
      expect(await screen.findByTestId('customer-balance')).toHaveTextContent('Owes ৳2,500');

      await recordPayment(app.ctx, {
        customerId: karim,
        amount: 250_000,
        note: '',
        invoiceId: null,
      });
      await waitFor(() =>
        expect(screen.getByTestId('customer-balance')).toHaveTextContent('Nothing due'),
      );
    });

    it('shares a reminder with the amount due through the share sheet', async () => {
      await owe(250_000);
      await renderWithApp(<CustomerLedgerScreen customerId={karim} />, app.services);

      await fireEvent.press(await screen.findByTestId('ledger-reminder'));

      await waitFor(() => expect(shareText).toHaveBeenCalledTimes(1));
      expect(shareText).toHaveBeenCalledWith(
        'Dear Karim, your due at Rahim Store is ৳2,500. Please pay when you can. Thank you.',
      );
    });

    it('does not send a reminder when nothing is due', async () => {
      await renderWithApp(<CustomerLedgerScreen customerId={karim} />, app.services);
      await fireEvent.press(await screen.findByTestId('ledger-reminder'));
      expect(shareText).not.toHaveBeenCalled();
    });

    it('shares the statement as a PDF', async () => {
      await owe(250_000);
      await renderWithApp(<CustomerLedgerScreen customerId={karim} />, app.services);

      await fireEvent.press(await screen.findByTestId('ledger-statement'));

      await waitFor(() => expect(shareFile).toHaveBeenCalledTimes(1));
      const [html] = jest.mocked(htmlToPdf).mock.calls[0] ?? [];
      expect(html).toContain('Karim');
      expect(html).toContain('Owes ৳2,500');
      expect(shareFile).toHaveBeenCalledWith(
        expect.stringContaining('.pdf'),
        'application/pdf',
        'Statement for Karim',
      );
    });

    it('explains a missing customer', async () => {
      await renderWithApp(<CustomerLedgerScreen customerId="missing" />, app.services);
      expect(await screen.findByText('This record no longer exists.')).toBeOnTheScreen();
    });
  });
});

describe('statement document', () => {
  const formatters = createFormatters('en', 'BDT');
  const labels = {
    title: 'Statement',
    date: 'Date',
    description: 'Description',
    amount: 'Amount',
    balance: 'Balance',
    closing: 'Balance now',
    phone: 'Phone',
    entries: {
      INVOICE_DUE: 'Invoice due',
      PAYMENT: 'Payment received',
      REVERSAL: 'Invoice cancelled',
      ADJUSTMENT: 'Invoice changed',
    },
  };
  const entry = (type: 'INVOICE_DUE' | 'PAYMENT', amount: number) => ({
    id: `e-${amount}`,
    shopId: 's',
    createdAt: Date.UTC(2026, 10, 12, 6),
    deviceId: 'd',
    isDirty: false,
    customerId: 'c',
    type,
    amount,
    refId: 'r',
  });

  it('lists every entry with a signed amount and the running balance', () => {
    const html = buildStatementHtml({
      language: 'en',
      shop: { name: 'Rahim Store', address: 'Station Road', phone: '01700000000' },
      customer: { name: 'Karim <b>', phone: '01712345678' },
      lines: [
        { entry: entry('INVOICE_DUE', 250_000), invoiceNumber: 'RS-A-000001', balance: 250_000 },
        { entry: entry('PAYMENT', -100_000), invoiceNumber: null, balance: 150_000 },
      ],
      closingText: 'Owes ৳1,500',
      labels,
      formatters,
    });

    expect(html).toContain('Invoice due · RS-A-000001');
    expect(html).toContain('+৳2,500');
    expect(html).toContain('−৳1,000');
    expect(html).toContain('৳1,500');
    expect(html).toContain('Owes ৳1,500');
    expect(html).toContain('Karim &lt;b&gt;');
    expect(html).not.toContain('Karim <b>');
  });

  it('writes amounts with an explicit sign', () => {
    expect(signedMoney(250_000, formatters)).toBe('+৳2,500');
    expect(signedMoney(-100_000, formatters)).toBe('−৳1,000');
    expect(signedMoney(0, formatters)).toBe('৳0');
  });
});
