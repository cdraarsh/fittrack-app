/**
 * Minimal ZIP reader to pull the .fit out of Garmin's "original activity" download.
 * Handles stored (0) and deflate (8) entries via the central directory.
 */
import { inflateRawSync } from 'node:zlib';

const EOCD_SIG = 0x06054b50;
const CEN_SIG = 0x02014b50;
const LOC_SIG = 0x04034b50;

export function isZip(b: Uint8Array): boolean {
  return b.length >= 4 && b[0] === 0x50 && b[1] === 0x4b && b[2] === 0x03 && b[3] === 0x04;
}

/** True if bytes look like a raw FIT file (".FIT" at offset 8). */
export function isFitBytes(b: Uint8Array): boolean {
  return b.length >= 12 && b[8] === 0x2e && b[9] === 0x46 && b[10] === 0x49 && b[11] === 0x54;
}

export interface ZipEntry {
  name: string;
  data: Uint8Array;
}

export function readZip(buf: Uint8Array): ZipEntry[] {
  const dv = new DataView(buf.buffer, buf.byteOffset, buf.byteLength);
  let eocd = -1;
  for (let i = buf.length - 22; i >= Math.max(0, buf.length - 22 - 0xffff); i--) {
    if (dv.getUint32(i, true) === EOCD_SIG) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: end of central directory not found');
  const count = dv.getUint16(eocd + 10, true);
  let p = dv.getUint32(eocd + 16, true);
  const out: ZipEntry[] = [];
  for (let n = 0; n < count; n++) {
    if (dv.getUint32(p, true) !== CEN_SIG) throw new Error('ZIP: bad central directory');
    const method = dv.getUint16(p + 10, true);
    const compSize = dv.getUint32(p + 20, true);
    const nameLen = dv.getUint16(p + 28, true);
    const extraLen = dv.getUint16(p + 30, true);
    const commentLen = dv.getUint16(p + 32, true);
    const locOff = dv.getUint32(p + 42, true);
    const name = new TextDecoder().decode(buf.subarray(p + 46, p + 46 + nameLen));
    p += 46 + nameLen + extraLen + commentLen;

    if (dv.getUint32(locOff, true) !== LOC_SIG) throw new Error('ZIP: bad local header');
    const start = locOff + 30 + dv.getUint16(locOff + 26, true) + dv.getUint16(locOff + 28, true);
    const raw = buf.subarray(start, start + compSize);
    let data: Uint8Array;
    if (method === 0) data = raw;
    else if (method === 8) data = new Uint8Array(inflateRawSync(raw));
    else throw new Error(`ZIP: unsupported compression ${method}`);
    out.push({ name, data });
  }
  return out;
}

/** Return the FIT bytes from a download that is either a ZIP or a bare .fit. */
export function extractFit(bytes: Uint8Array): Uint8Array {
  if (isFitBytes(bytes)) return bytes;
  if (!isZip(bytes)) throw new Error('Download is neither a FIT file nor a ZIP');
  const entries = readZip(bytes);
  const fit = entries.find((e) => /\.fit$/i.test(e.name)) ?? entries.find((e) => isFitBytes(e.data));
  if (!fit) throw new Error('ZIP contains no .fit file');
  return fit.data;
}
