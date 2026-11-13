export type PaperSize = '58mm' | '80mm';

export type PrinterConnectionStatus =
  | 'disconnected'
  | 'connecting'
  | 'connected'
  | 'error';

export interface BluetoothDevice {
  id: string;
  name: string;
  address?: string;
}

export interface PrinterDriver {
  scan(): Promise<BluetoothDevice[]>;
  connect(device: BluetoothDevice): Promise<boolean>;
  disconnect(): Promise<void>;
  printEscPos(data: Uint8Array): Promise<boolean>;
  isConnected(): boolean;
  getConnectedDevice(): BluetoothDevice | null;
}

export interface PrinterSettings {
  preferredDeviceId: string | null;
  preferredDeviceName: string | null;
  paperSize: PaperSize;
}
