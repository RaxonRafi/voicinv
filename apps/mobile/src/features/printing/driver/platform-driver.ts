import { type BluetoothDevice, type PrinterDriver } from '../types';
import { FakePrinterDriver } from './fake-driver';

export class PlatformPrinterDriver implements PrinterDriver {
  private fallback: FakePrinterDriver;
  private connectedDevice: BluetoothDevice | null = null;

  constructor(fallback = new FakePrinterDriver()) {
    this.fallback = fallback;
  }

  async scan(): Promise<BluetoothDevice[]> {
    return this.fallback.scan();
  }

  async connect(device: BluetoothDevice): Promise<boolean> {
    const success = await this.fallback.connect(device);
    if (success) {
      this.connectedDevice = device;
    }
    return success;
  }

  async disconnect(): Promise<void> {
    await this.fallback.disconnect();
    this.connectedDevice = null;
  }

  async printEscPos(data: Uint8Array): Promise<boolean> {
    return this.fallback.printEscPos(data);
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.connectedDevice;
  }
}
