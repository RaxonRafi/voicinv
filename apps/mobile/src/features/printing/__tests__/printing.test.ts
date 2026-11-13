import { type InvoiceItemRow, type InvoiceRow } from '@/features/invoices';
import { createFormatters } from '@/core/i18n';

import {
  convertToEscPosRaster,
  EscPosBuilder,
  FakePrinterDriver,
  formatInvoiceEscPos,
  PAPER_COLUMNS,
  setPrinterDriver,
  usePrinterStore,
} from '../index';

describe('printing feature', () => {
  describe('EscPosBuilder', () => {
    it('generates standard initialization and alignment commands', () => {
      const builder = new EscPosBuilder();
      builder.align('center');
      builder.bold(true);
      builder.text('TEST');
      builder.feed(1);
      builder.cut();

      const bytes = builder.build();
      // ESC @ (1b 40)
      expect(bytes[0]).toBe(0x1b);
      expect(bytes[1]).toBe(0x40);

      // ESC a 1 (center: 1b 61 01)
      expect(bytes[2]).toBe(0x1b);
      expect(bytes[3]).toBe(0x61);
      expect(bytes[4]).toBe(0x01);

      // Contains TEST
      const str = new TextDecoder().decode(bytes);
      expect(str).toContain('TEST');
    });

    it('formats two columns padded to paper width', () => {
      const builder58 = new EscPosBuilder();
      builder58.twoColumns('Total', '500', '58mm');
      const text58 = new TextDecoder().decode(builder58.build());
      // First line should be padded to 32 chars + newline (excluding 2-byte ESC @ prefix)
      const line58 = text58.split('\n')[0]?.substring(2) ?? '';
      expect(line58.length).toBe(PAPER_COLUMNS['58mm']);

      const builder80 = new EscPosBuilder();
      builder80.twoColumns('Total', '500', '80mm');
      const text80 = new TextDecoder().decode(builder80.build());
      const line80 = text80.split('\n')[0]?.substring(2) ?? '';
      expect(line80.length).toBe(PAPER_COLUMNS['80mm']);
    });
  });

  describe('convertToEscPosRaster', () => {
    it('converts pixel buffer into ESC/POS GS v 0 raster command', () => {
      // 8x2 pixels (1 byte wide, 2 lines high)
      const pixels = new Uint8Array([
        0,
        255,
        0,
        255,
        0,
        255,
        0,
        255, // line 1: black & white alternating
        255,
        255,
        255,
        255,
        255,
        255,
        255,
        255, // line 2: all white
      ]);

      const bytes = convertToEscPosRaster(
        { width: 8, height: 2, data: pixels, threshold: 128 },
        '58mm',
      );

      // GS v 0 (1d 76 30 00)
      expect(bytes).toContain(0x1d);
      expect(bytes).toContain(0x76);
      expect(bytes).toContain(0x30);
    });
  });

  describe('formatInvoiceEscPos', () => {
    it('formats invoice receipt with shop header, items, and totals', () => {
      const formatters = createFormatters('en', 'BDT');
      const invoice: InvoiceRow = {
        id: 'inv-1',
        shopId: 'shop-1',
        invoiceNumber: 'RS-A-000001',
        customerId: 'cust-1',
        date: Date.UTC(2026, 10, 12, 10, 0, 0),
        subtotal: 50000,
        discount: 5000,
        total: 45000,
        paidAmount: 45000,
        dueAmount: 0,
        status: 'ACTIVE',
        sourceText: 'test invoice',
        createdAt: Date.now(),
        updatedAt: Date.now(),
        deletedAt: null,
        deviceId: 'dev-1',
        isDirty: false,
      };

      const items: InvoiceItemRow[] = [
        {
          id: 'item-1',
          shopId: 'shop-1',
          invoiceId: 'inv-1',
          productId: 'prod-1',
          position: 0,
          nameSnapshot: 'Basmati Rice',
          qtyMilli: 2000,
          unit: 'kg',
          unitPrice: 25000,
          lineTotal: 50000,
          createdAt: Date.now(),
          updatedAt: Date.now(),
          deletedAt: null,
          deviceId: 'dev-1',
          isDirty: false,
        },
      ];

      const bytes = formatInvoiceEscPos({
        shop: { name: 'Rahim Store', address: 'Dhaka', phone: '01700000000' },
        invoice,
        items,
        customerName: 'Karim',
        paperSize: '58mm',
        formatters,
        watermark: true,
      });

      const decoded = new TextDecoder().decode(bytes);
      expect(decoded).toContain('Rahim Store');
      expect(decoded).toContain('RS-A-000001');
      expect(decoded).toContain('Basmati Rice');
      expect(decoded).toContain('Powered by VoiceLedger');
    });
  });

  describe('printer driver & store', () => {
    let fakeDriver: FakePrinterDriver;

    beforeEach(() => {
      fakeDriver = new FakePrinterDriver();
      setPrinterDriver(fakeDriver);
      usePrinterStore.setState({
        status: 'disconnected',
        connectedDevice: null,
        devices: [],
        scanning: false,
        paperSize: '58mm',
        error: null,
      });
    });

    it('scans and connects to a printer', async () => {
      const store = usePrinterStore.getState();
      const devices = await store.scan();
      expect(devices.length).toBeGreaterThan(0);

      const targetDevice = devices[0];
      expect(targetDevice).toBeDefined();
      if (!targetDevice) throw new Error('No devices returned');
      const connected = await store.connect(targetDevice);
      expect(connected).toBe(true);
      expect(usePrinterStore.getState().status).toBe('connected');
      expect(usePrinterStore.getState().connectedDevice).toEqual(targetDevice);

      // Print data
      const sample = new Uint8Array([0x1b, 0x40]);
      const printSuccess = await store.printData(sample);
      expect(printSuccess).toBe(true);
      expect(fakeDriver.lastPrintedBytes).toEqual(sample);

      // Disconnect
      await store.disconnect();
      expect(usePrinterStore.getState().status).toBe('disconnected');
      expect(usePrinterStore.getState().connectedDevice).toBeNull();
    });

    it('handles connection failure gracefully', async () => {
      fakeDriver.shouldFailConnect = true;
      const store = usePrinterStore.getState();

      const connected = await store.connect({ id: 'bad-device', name: 'Bad Printer' });
      expect(connected).toBe(false);
      expect(usePrinterStore.getState().status).toBe('error');
    });
  });
});
