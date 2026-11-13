import { create } from 'zustand';

import { getPrinterDriver } from '../driver';
import { type BluetoothDevice, type PaperSize, type PrinterConnectionStatus } from '../types';

interface PrinterStoreState {
  status: PrinterConnectionStatus;
  connectedDevice: BluetoothDevice | null;
  devices: BluetoothDevice[];
  scanning: boolean;
  paperSize: PaperSize;
  error: string | null;

  scan: () => Promise<BluetoothDevice[]>;
  connect: (device: BluetoothDevice) => Promise<boolean>;
  disconnect: () => Promise<void>;
  setPaperSize: (paperSize: PaperSize) => void;
  printData: (data: Uint8Array) => Promise<boolean>;
}

export const usePrinterStore = create<PrinterStoreState>((set) => ({
  status: 'disconnected',
  connectedDevice: null,
  devices: [],
  scanning: false,
  paperSize: '58mm',
  error: null,

  scan: async () => {
    set({ scanning: true, error: null });
    try {
      const driver = getPrinterDriver();
      const devices = await driver.scan();
      set({ devices, scanning: false });
      return devices;
    } catch (err) {
      set({ scanning: false, error: (err as Error).message });
      return [];
    }
  },

  connect: async (device: BluetoothDevice) => {
    set({ status: 'connecting', error: null });
    try {
      const driver = getPrinterDriver();
      const success = await driver.connect(device);
      if (success) {
        set({ status: 'connected', connectedDevice: device });
        return true;
      } else {
        set({ status: 'error', error: 'Connection failed' });
        return false;
      }
    } catch (err) {
      set({ status: 'error', error: (err as Error).message });
      return false;
    }
  },

  disconnect: async () => {
    const driver = getPrinterDriver();
    await driver.disconnect();
    set({ status: 'disconnected', connectedDevice: null });
  },

  setPaperSize: (paperSize: PaperSize) => {
    set({ paperSize });
  },

  printData: async (data: Uint8Array) => {
    const driver = getPrinterDriver();
    if (!driver.isConnected()) {
      return false;
    }
    return driver.printEscPos(data);
  },
}));
