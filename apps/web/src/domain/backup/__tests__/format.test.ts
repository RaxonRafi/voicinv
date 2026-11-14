import {
  BACKUP_HEADER_LENGTH,
  BACKUP_KDF_ITERATIONS,
  BACKUP_TAG_LENGTH,
  decodeBackupHeader,
  encodeBackupHeader,
  isEncryptedBackup,
} from '../format';

const salt = Uint8Array.from({ length: 16 }, (_unused, index) => index + 1);
const nonce = Uint8Array.from({ length: 12 }, (_unused, index) => 0xa0 + index);

function container(iterations = BACKUP_KDF_ITERATIONS, bodyLength = 64): Uint8Array {
  const header = encodeBackupHeader({ iterations, salt, nonce });
  const bytes = new Uint8Array(header.length + bodyLength);
  bytes.set(header, 0);
  return bytes;
}

describe('backup container format', () => {
  it('writes a 38-byte header that starts with the magic and version', () => {
    const header = encodeBackupHeader({ iterations: BACKUP_KDF_ITERATIONS, salt, nonce });

    expect(header).toHaveLength(BACKUP_HEADER_LENGTH);
    expect(String.fromCharCode(...header.slice(0, 4))).toBe('VLBK');
    expect(header[4]).toBe(1);
    expect(header[5]).toBe(1);
  });

  it('round-trips iterations, salt and nonce', () => {
    for (const iterations of [100_000, 210_000, 1_000_000, 5_000_000]) {
      expect(decodeBackupHeader(container(iterations))).toEqual({
        formatVersion: 1,
        iterations,
        salt,
        nonce,
      });
    }
  });

  it('recognizes a container and nothing else', () => {
    expect(isEncryptedBackup(container())).toBe(true);
    expect(isEncryptedBackup(new TextEncoder().encode('{"magic":"VOICELEDGER_BACKUP"}'))).toBe(
      false,
    );
    expect(isEncryptedBackup(new Uint8Array(200))).toBe(false);
    expect(isEncryptedBackup(new Uint8Array(0))).toBe(false);
  });

  it('rejects a container too short to hold an authentication tag', () => {
    expect(decodeBackupHeader(container(BACKUP_KDF_ITERATIONS, BACKUP_TAG_LENGTH - 1))).toBeNull();
    expect(decodeBackupHeader(container(BACKUP_KDF_ITERATIONS, BACKUP_TAG_LENGTH))).not.toBeNull();
  });

  it('rejects unknown versions, key derivations and implausible iteration counts', () => {
    const wrongVersion = container();
    wrongVersion[4] = 2;
    const wrongKdf = container();
    wrongKdf[5] = 9;
    const tooFewIterations = container();
    tooFewIterations.set([0, 0, 0, 1], 6);
    const tooManyIterations = container();
    tooManyIterations.set([0xff, 0xff, 0xff, 0xff], 6);

    for (const bytes of [wrongVersion, wrongKdf, tooFewIterations, tooManyIterations]) {
      expect(decodeBackupHeader(bytes)).toBeNull();
    }
  });

  it('refuses to write a header with wrong sizes or weak iterations', () => {
    expect(() => encodeBackupHeader({ iterations: 1000, salt, nonce })).toThrow(RangeError);
    expect(() =>
      encodeBackupHeader({ iterations: BACKUP_KDF_ITERATIONS, salt: salt.slice(1), nonce }),
    ).toThrow(RangeError);
    expect(() =>
      encodeBackupHeader({ iterations: BACKUP_KDF_ITERATIONS, salt, nonce: nonce.slice(1) }),
    ).toThrow(RangeError);
  });
});
