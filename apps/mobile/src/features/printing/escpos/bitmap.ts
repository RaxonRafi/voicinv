import { type PaperSize } from '../types';
import { EscPosBuilder } from './encoder';

export const PAPER_DOT_WIDTH: Record<PaperSize, number> = {
  '58mm': 384,
  '80mm': 576,
};

export interface BitmapRasterInput {
  width: number;
  height: number;
  /** RGBA or single-channel luminance data. */
  data: Uint8Array | number[];
  /** Threshold for binarization (0-255). Pixels darker than threshold become black dots. */
  threshold?: number;
}

/**
 * Converts a pixel buffer into an 1-bit monochrome ESC/POS raster bit image.
 * In thermal printing, 1 = dot/black, 0 = white.
 */
export function convertToEscPosRaster(
  input: BitmapRasterInput,
  _paper: PaperSize = '58mm',
): Uint8Array {
  const { width, height, data, threshold = 128 } = input;
  const isRgba = data.length >= width * height * 4;
  const widthBytes = Math.ceil(width / 8);
  const rasterBytes = new Uint8Array(widthBytes * height);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let luminance: number;
      if (isRgba) {
        const offset = (y * width + x) * 4;
        const r = data[offset] ?? 0;
        const g = data[offset + 1] ?? 0;
        const b = data[offset + 2] ?? 0;
        const a = data[offset + 3] ?? 255;
        // Treat transparent pixels as white
        luminance = a < 128 ? 255 : (r * 299 + g * 587 + b * 114) / 1000;
      } else {
        luminance = data[y * width + x] ?? 255;
      }

      // If darker than threshold, mark bit as 1 (black)
      if (luminance < threshold) {
        const byteIndex = y * widthBytes + (x >> 3);
        const bitIndex = 7 - (x & 7);
        const currentByte = rasterBytes[byteIndex] ?? 0;
        rasterBytes[byteIndex] = currentByte | (1 << bitIndex);
      }
    }
  }

  const builder = new EscPosBuilder();
  builder.align('center');
  builder.rasterImage(width, height, rasterBytes);
  builder.cut();
  return builder.build();
}
