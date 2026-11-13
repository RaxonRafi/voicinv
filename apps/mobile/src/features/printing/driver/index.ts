import { type PrinterDriver } from '../types';
import { FakePrinterDriver } from './fake-driver';
import { PlatformPrinterDriver } from './platform-driver';

let activeDriver: PrinterDriver = new PlatformPrinterDriver();

export function getPrinterDriver(): PrinterDriver {
  return activeDriver;
}

export function setPrinterDriver(driver: PrinterDriver): void {
  activeDriver = driver;
}

export { FakePrinterDriver, PlatformPrinterDriver };
