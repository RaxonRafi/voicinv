import { fireEvent, screen, waitFor } from '@testing-library/react-native';
import { router } from 'expo-router';

import { htmlToPdf, shareFile } from '@/core/platform';
import { createTestShopApp, renderWithApp, type TestShopApp } from '@/core/testing/harness';
import { createCustomer } from '@/features/customers';
import { getBalance } from '@/features/ledger';
import { createProduct } from '@/features/products';

import { listInvoiceItems, listInvoices } from '../repository';
import { InvoiceDetailScreen } from '../screens/invoice-detail-screen';
import { InvoiceFormScreen } from '../screens/invoice-form-screen';
import { InvoiceListScreen } from '../screens/invoice-list-screen';
import { createInvoice, getInvoiceDetails } from '../usecases';

describe('invoice screens', () => {
  let app: TestShopApp;
  let karim: string;

  beforeEach(async () => {
    app = await createTestShopApp();
    karim = (
      await createCustomer(app.ctx, {
        name: 'Karim',
        phone: '',
        notes: '',
        creditLimit: 300_000,
        aliases: [],
      })
    ).id;
  });

  afterEach(() => app.close());

  const saveSale = () =>
    createInvoice(app.ctx, {
      customerId: karim,
      items: [{ productId: null, name: 'Rice', unit: 'bag', qtyMilli: 2000, unitPrice: 250_000 }],
      discount: 0,
      payment: { type: 'FRACTION', numerator: 1, denominator: 2 },
      sourceText: null,
    });

  describe('manual entry', () => {
    it('saves a typed walk-in sale and opens the new invoice', async () => {
      await renderWithApp(<InvoiceFormScreen />, app.services);

      await fireEvent.press(await screen.findByTestId('invoice-add-custom'));
      await fireEvent.changeText(screen.getByLabelText('Item name'), 'Sugar');
      await fireEvent.changeText(screen.getByLabelText('Unit'), 'kg');
      await fireEvent.changeText(screen.getByLabelText('Price per unit'), '140');
      await fireEvent.press(screen.getByRole('button', { name: 'Increase: Quantity' }));

      // 2 kg × ৳140, paid in full by default.
      expect(await screen.findByTestId('invoice-totals')).toHaveTextContent(/৳280/);
      await fireEvent.press(screen.getByTestId('invoice-save'));

      await waitFor(() => expect(router.replace).toHaveBeenCalled());
      const [row] = await listInvoices(app.db.orm);
      expect(row?.invoice).toMatchObject({
        invoiceNumber: 'RS-A-000001',
        customerId: null,
        total: 28_000,
        paidAmount: 28_000,
        dueAmount: 0,
      });
      expect(router.replace).toHaveBeenCalledWith({
        pathname: '/invoices/[id]',
        params: { id: row?.invoice.id },
      });
      const items = await listInvoiceItems(app.db.orm, row?.invoice.id ?? '');
      expect(items[0]).toMatchObject({
        nameSnapshot: 'Sugar',
        unit: 'kg',
        qtyMilli: 2000,
        unitPrice: 14_000,
      });
    });

    it('says what is missing instead of saving an empty invoice', async () => {
      await renderWithApp(<InvoiceFormScreen />, app.services);

      await fireEvent.press(await screen.findByTestId('invoice-save'));

      expect(await screen.findByText('Add at least one item.')).toBeOnTheScreen();
      expect(await listInvoices(app.db.orm)).toEqual([]);
      expect(router.replace).not.toHaveBeenCalled();
    });

    it('points at the line that has no price yet', async () => {
      await renderWithApp(<InvoiceFormScreen />, app.services);

      await fireEvent.press(await screen.findByTestId('invoice-add-custom'));
      await fireEvent.changeText(screen.getByLabelText('Item name'), 'Sugar');
      await fireEvent.changeText(screen.getByLabelText('Unit'), 'kg');
      await fireEvent.press(screen.getByTestId('invoice-save'));

      expect(await screen.findByText('Enter a valid amount.')).toBeOnTheScreen();
      expect(await listInvoices(app.db.orm)).toEqual([]);
    });

    it('starts for a given customer, adds a product from the list and warns about the credit limit', async () => {
      const rice = await createProduct(app.ctx, {
        name: 'Rice',
        unit: 'bag',
        defaultPrice: 250_000,
        aliases: [],
      });
      await renderWithApp(<InvoiceFormScreen customerId={karim} />, app.services);

      expect(await screen.findByText('Karim')).toBeOnTheScreen();
      await fireEvent.press(screen.getByTestId('invoice-add-product'));
      await fireEvent.press(await screen.findByTestId(`product-picker-${rice.id}`));
      await fireEvent.press(screen.getByRole('button', { name: 'Increase: Quantity' }));

      // Leave everything due: ৳5,000 is over Karim's ৳3,000 limit.
      await fireEvent.press(screen.getByTestId('invoice-payment-mode'));
      await fireEvent.press(await screen.findByText('Nothing paid'));
      expect(await screen.findByText(/over their credit limit of ৳3,000/)).toBeOnTheScreen();

      await fireEvent.press(screen.getByTestId('invoice-save'));
      await waitFor(() => expect(router.replace).toHaveBeenCalled());
      expect(await getBalance(app.db.orm, karim)).toBe(500_000);
      const [row] = await listInvoices(app.db.orm);
      const items = await listInvoiceItems(app.db.orm, row?.invoice.id ?? '');
      expect(items[0]).toMatchObject({ productId: rice.id, qtyMilli: 2000, lineTotal: 500_000 });
    });

    it('needs a customer before anything can be left due', async () => {
      const rice = await createProduct(app.ctx, {
        name: 'Rice',
        unit: 'bag',
        defaultPrice: 250_000,
        aliases: [],
      });
      await renderWithApp(<InvoiceFormScreen />, app.services);

      await fireEvent.press(await screen.findByTestId('invoice-add-product'));
      await fireEvent.press(await screen.findByTestId(`product-picker-${rice.id}`));
      await fireEvent.press(screen.getByTestId('invoice-payment-mode'));
      await fireEvent.press(await screen.findByText('Paid half'));
      await fireEvent.press(screen.getByTestId('invoice-save'));

      expect(await screen.findByText(/A walk-in sale must be paid in full/)).toBeOnTheScreen();
      expect(await listInvoices(app.db.orm)).toEqual([]);
    });

    it('requires a reason when editing and records it', async () => {
      const invoice = await saveSale();
      await renderWithApp(<InvoiceFormScreen invoiceId={invoice.id} />, app.services);

      await fireEvent.press(await screen.findByRole('button', { name: 'Increase: Quantity' }));
      await fireEvent.press(screen.getByTestId('invoice-save'));
      expect(await screen.findByText('This is required.')).toBeOnTheScreen();

      await fireEvent.changeText(screen.getByTestId('invoice-reason'), 'it was three bags');
      await fireEvent.press(screen.getByTestId('invoice-save'));

      await waitFor(() => expect(router.back).toHaveBeenCalled());
      const details = await getInvoiceDetails(app.db.orm, invoice.id);
      expect(details?.invoice.total).toBe(750_000);
      expect(details?.revisions[0]?.reason).toBe('it was three bags');
    });
  });

  describe('invoice details', () => {
    it('shows the lines, the totals and the payment status in words', async () => {
      const invoice = await saveSale();
      await renderWithApp(<InvoiceDetailScreen invoiceId={invoice.id} />, app.services);

      expect(await screen.findByText('RS-A-000001')).toBeOnTheScreen();
      expect(screen.getByText('Karim')).toBeOnTheScreen();
      expect(screen.getByText('Rice')).toBeOnTheScreen();
      expect(screen.getByText('2 bag × ৳2,500')).toBeOnTheScreen();
      expect(screen.getByText('Partly paid')).toBeOnTheScreen();
      expect(screen.getByTestId('invoice-detail-totals')).toHaveTextContent(
        /৳5,000.*৳2,500.*৳2,500/,
      );
    });

    it('creates a PDF and opens the share sheet', async () => {
      const invoice = await saveSale();
      await renderWithApp(<InvoiceDetailScreen invoiceId={invoice.id} />, app.services);

      await fireEvent.press(await screen.findByTestId('invoice-share'));

      await waitFor(() => expect(shareFile).toHaveBeenCalledTimes(1));
      const [html, fileName, format] = jest.mocked(htmlToPdf).mock.calls[0] ?? [];
      expect(fileName).toBe('RS-A-000001');
      expect(format).toBe('a4');
      expect(html).toContain('RS-A-000001');
      expect(html).toContain('Rahim Store');
      expect(html).toContain('Made with VoiceLedger'); // free plan watermark
      expect(shareFile).toHaveBeenCalledWith(
        'file:///cache/RS-A-000001.pdf',
        'application/pdf',
        'Invoice RS-A-000001',
      );
    });

    it('cancels only after a reason is given, and updates the balance', async () => {
      const invoice = await saveSale();
      await renderWithApp(<InvoiceDetailScreen invoiceId={invoice.id} />, app.services);

      await fireEvent.press(await screen.findByTestId('invoice-cancel'));
      await fireEvent.press(await screen.findByTestId('invoice-cancel-dialog-confirm'));
      // No reason yet: nothing happens.
      expect((await getInvoiceDetails(app.db.orm, invoice.id))?.invoice.status).toBe('ACTIVE');

      await fireEvent.changeText(screen.getByTestId('invoice-cancel-reason'), 'entered twice');
      await fireEvent.press(screen.getByTestId('invoice-cancel-dialog-confirm'));

      expect(await screen.findByText('Cancelled')).toBeOnTheScreen();
      expect((await getInvoiceDetails(app.db.orm, invoice.id))?.invoice.status).toBe('CANCELLED');
      expect(await getBalance(app.db.orm, karim)).toBe(0);
      // A cancelled invoice can no longer be edited or cancelled again.
      expect(screen.queryByTestId('invoice-edit')).toBeNull();
      expect(screen.queryByTestId('invoice-cancel')).toBeNull();
    });

    it('explains a missing invoice', async () => {
      await renderWithApp(<InvoiceDetailScreen invoiceId="missing" />, app.services);
      expect(await screen.findByText('This record no longer exists.')).toBeOnTheScreen();
    });
  });

  describe('invoice list', () => {
    it('lists invoices with customer, amount and status, and invites the first one', async () => {
      await renderWithApp(<InvoiceListScreen />, app.services);
      expect(await screen.findByText('No invoices yet')).toBeOnTheScreen();

      await saveSale();
      expect(await screen.findByText('Karim')).toBeOnTheScreen();
      expect(screen.getByText('৳5,000')).toBeOnTheScreen();
      expect(screen.getByText('Partly paid')).toBeOnTheScreen();
    });
  });
});
