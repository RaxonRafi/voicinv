import { type BluetoothDevice, type PrinterDriver } from '../types';

export class FakePrinterDriver implements PrinterDriver {
  private connectedDevice: BluetoothDevice | null = null;
  public lastPrintedBytes: Uint8Array | null = null;
  public mockDevices: BluetoothDevice[] = [
    { id: 'bt-58mm-01', name: 'MPT-II Thermal (58mm)', address: '00:11:22:33:44:55' },
    { id: 'bt-80mm-01', name: 'RPP02N Thermal (80mm)', address: '66:77:88:99:AA:BB' },
  ];
  public shouldFailConnect = false;
  public shouldFailPrint = false;

  async scan(): Promise<BluetoothDevice[]> {
    return [...this.mockDevices];
  }

  async connect(device: BluetoothDevice): Promise<boolean> {
    if (this.shouldFailConnect) {
      this.connectedDevice = null;
      return false;
    }
    this.connectedDevice = device;
    return true;
  }

  async disconnect(): Promise<void> {
    this.connectedDevice = null;
  }

  async printEscPos(data: Uint8Array): Promise<boolean> {
    if (!this.connectedDevice || this.shouldFailPrint) {
      return false;
    }
    this.lastPrintedBytes = data;
    return true;
  }

  isConnected(): boolean {
    return this.connectedDevice !== null;
  }

  getConnectedDevice(): BluetoothDevice | null {
    return this.connectedDevice;
  }
}
