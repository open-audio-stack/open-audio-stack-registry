import { closeSync, openSync, readSync } from 'fs';

// Windows on Arm has three plugin ABIs (#190):
// - arm64:   machine ARM64, no hybrid metadata. Loads only in a pure-native ARM64 host.
// - arm64ec: machine AMD64 *with* hybrid (CHPE) metadata. Loads in x64 and ARM64EC hosts.
//            `file` reports these as plain x86-64, so the header alone would mislabel them as x64.
// - arm64x:  machine ARM64 *with* hybrid metadata, a "fat" binary holding both arm64 and arm64ec
//            code. `file` reports these as plain Aarch64.
// The difference is the CHPEMetadataPointer in the PE load config directory, read here.

const MACHINE_AMD64 = 0x8664;
const MACHINE_ARM64 = 0xaa64;
const PE32_PLUS_MAGIC = 0x20b;
const LOAD_CONFIG_DIRECTORY_INDEX = 10;
// Offset of CHPEMetadataPointer in IMAGE_LOAD_CONFIG_DIRECTORY64.
const CHPE_METADATA_POINTER_OFFSET = 0xc8;

export type PeArchitecture = 'x64' | 'arm64' | 'arm64ec' | 'arm64x';

type ReadAt = (offset: number, length: number) => Buffer;

// Classify a 64-bit Windows PE file, reading only the header bytes needed. Returns null if it isn't one.
export function peArchitectureFromReader(readAt: ReadAt): PeArchitecture | null {
  const dos = readAt(0, 0x40);
  if (dos.length < 0x40 || dos.toString('latin1', 0, 2) !== 'MZ') return null;
  const pe = dos.readUInt32LE(0x3c);
  const coff = readAt(pe, 24);
  if (coff.length < 24 || coff.toString('latin1', 0, 4) !== 'PE\0\0') return null;
  const machine = coff.readUInt16LE(4);
  if (machine !== MACHINE_AMD64 && machine !== MACHINE_ARM64) return null;
  const base: PeArchitecture = machine === MACHINE_ARM64 ? 'arm64' : 'x64';
  const sectionCount = coff.readUInt16LE(6);
  const optionalHeaderSize = coff.readUInt16LE(20);
  const opt = readAt(pe + 24, optionalHeaderSize);
  if (opt.length < 112 || opt.readUInt16LE(0) !== PE32_PLUS_MAGIC) return base;

  const dirCount = opt.readUInt32LE(108);
  const dir = 112 + LOAD_CONFIG_DIRECTORY_INDEX * 8;
  if (dirCount <= LOAD_CONFIG_DIRECTORY_INDEX || dir + 8 > opt.length) return base;
  const loadConfigRva = opt.readUInt32LE(dir);
  if (!loadConfigRva) return base;

  // Map the load config RVA to a file offset using the section table.
  const sections = readAt(pe + 24 + optionalHeaderSize, sectionCount * 40);
  let loadConfig = -1;
  for (let s = 0; s + 40 <= sections.length; s += 40) {
    const virtualSize = sections.readUInt32LE(s + 8);
    const virtualAddress = sections.readUInt32LE(s + 12);
    const rawSize = sections.readUInt32LE(s + 16);
    const rawPointer = sections.readUInt32LE(s + 20);
    if (loadConfigRva >= virtualAddress && loadConfigRva < virtualAddress + Math.max(virtualSize, rawSize)) {
      loadConfig = rawPointer + (loadConfigRva - virtualAddress);
      break;
    }
  }
  if (loadConfig < 0) return base;
  const config = readAt(loadConfig, CHPE_METADATA_POINTER_OFFSET + 8);
  if (config.length < CHPE_METADATA_POINTER_OFFSET + 8) return base;
  if (config.readUInt32LE(0) < CHPE_METADATA_POINTER_OFFSET + 8) return base;
  if (config.readBigUInt64LE(CHPE_METADATA_POINTER_OFFSET) === 0n) return base;
  return machine === MACHINE_ARM64 ? 'arm64x' : 'arm64ec';
}

export function peArchitectureFromBuffer(buf: Buffer): PeArchitecture | null {
  return peArchitectureFromReader((offset, length) => buf.subarray(offset, offset + length));
}

// Registry architectures for a PE file. An arm64x binary loads as both arm64 and arm64ec.
export function peArchitectures(filePath: string): string[] | null {
  let fd: number | undefined;
  try {
    const handle = openSync(filePath, 'r');
    fd = handle;
    const arch = peArchitectureFromReader((offset, length) => {
      const buf = Buffer.alloc(length);
      return buf.subarray(0, readSync(handle, buf, 0, length, offset));
    });
    if (!arch) return null;
    return arch === 'arm64x' ? ['arm64', 'arm64ec'] : [arch];
  } catch {
    return null;
  } finally {
    if (fd !== undefined) closeSync(fd);
  }
}
