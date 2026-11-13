import { type PaperSize } from '../types';

export const PAPER_COLUMNS: Record<PaperSize, number> = {
  '58mm': 32,
  '80mm': 48,
};

export class EscPosBuilder {
  private buffer: number[] = [];

  constructor() {
    this.init();
  }

  /** ESC @ - Initialize printer */
  init(): this {
    this.buffer.push(0x1b, 0x40);
    return this;
  }

  /** ESC a n - Select justification (0 = Left, 1 = Center, 2 = Right) */
  align(alignment: 'left' | 'center' | 'right'): this {
    const code = alignment === 'center' ? 1 : alignment === 'right' ? 2 : 0;
    this.buffer.push(0x1b, 0x61, code);
    return this;
  }

  /** ESC E n - Turn emphasized (bold) mode on/off */
  bold(enabled = true): this {
    this.buffer.push(0x1b, 0x45, enabled ? 1 : 0);
    return this;
  }

  /** GS ! n - Select character size (double height/width) */
  size(doubleWidth = false, doubleHeight = false): this {
    let n = 0;
    if (doubleWidth) n |= 0x10;
    if (doubleHeight) n |= 0x01;
    this.buffer.push(0x1d, 0x21, n);
    return this;
  }

  /** Appends raw text */
  text(str: string): this {
    const encoder = new TextEncoder();
    const bytes = encoder.encode(str);
    for (let i = 0; i < bytes.length; i++) {
      this.buffer.push(bytes[i]);
    }
    return this;
  }

  /** Appends text with a newline */
  line(str = ''): this {
    if (str.length > 0) {
      this.text(str);
    }
    this.buffer.push(0x0a);
    return this;
  }

  /** Appends n line feeds */
  feed(lines = 1): this {
    for (let i = 0; i < lines; i++) {
      this.buffer.push(0x0a);
    }
    return this;
  }

  /** Appends a horizontal divider line of specified or full paper width */
  divider(paper: PaperSize = '58mm', char = '-'): this {
    const cols = PAPER_COLUMNS[paper];
    return this.line(char.repeat(cols));
  }

  /** Appends a two-column row aligned left and right */
  twoColumns(left: string, right: string, paper: PaperSize = '58mm'): this {
    const totalCols = PAPER_COLUMNS[paper];
    const spacesNeeded = Math.max(1, totalCols - left.length - right.length);
    return this.line(left + ' '.repeat(spacesNeeded) + right);
  }

  /** GS v 0 m xL xH yL yH d1...dk - Print raster bit image */
  rasterImage(widthPx: number, heightPx: number, data: Uint8Array): this {
    const xL = (widthPx >> 3) & 0xff;
    const xH = ((widthPx >> 3) >> 8) & 0xff;
    const yL = heightPx & 0xff;
    const yH = (heightPx >> 8) & 0xff;

    this.buffer.push(0x1d, 0x76, 0x30, 0x00, xL, xH, yL, yH);
    for (let i = 0; i < data.length; i++) {
      this.buffer.push(data[i]);
    }
    return this;
  }

  /** GS V m - Cut paper (feed and partial cut) */
  cut(partial = true): this {
    this.feed(3);
    this.buffer.push(0x1d, 0x56, partial ? 0x42 : 0x41, 0x00);
    return this;
  }

  /** Return the assembled byte array */
  build(): Uint8Array {
    return new Uint8Array(this.buffer);
  }
}
