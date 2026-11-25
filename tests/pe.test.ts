import { expect, test } from 'vitest';
import { peArchitectureFromBuffer } from '../src/pe.js';

// Build a minimal 64-bit PE: one section holding the load config, optionally with CHPE metadata.
function makePe(machine: number, chpe: bigint, loadConfigSize = 0x140): Buffer {
  const buf = Buffer.alloc(0x600);
  buf.write('MZ', 0, 'latin1');
  buf.writeUInt32LE(0x40, 0x3c);
  const pe = 0x40;
  buf.write('PE\0\0', pe, 'latin1');
  buf.writeUInt16LE(machine, pe + 4);
  buf.writeUInt16LE(1, pe + 6); // one section
  buf.writeUInt16LE(0xf0, pe + 20); // optional header size
  const opt = pe + 24;
  buf.writeUInt16LE(0x20b, opt); // PE32+
  buf.writeUInt32LE(16, opt + 108); // data directory count
  buf.writeUInt32LE(0x1000, opt + 112 + 10 * 8); // load config RVA
  const section = opt + 0xf0;
  buf.writeUInt32LE(0x200, section + 8); // virtual size
  buf.writeUInt32LE(0x1000, section + 12); // virtual address
  buf.writeUInt32LE(0x200, section + 16); // raw size
  buf.writeUInt32LE(0x400, section + 20); // raw pointer
  buf.writeUInt32LE(loadConfigSize, 0x400);
  buf.writeBigUInt64LE(chpe, 0x400 + 0xc8);
  return buf;
}

test('peArchitectureFromBuffer tells plain and hybrid binaries apart', () => {
  expect(peArchitectureFromBuffer(makePe(0x8664, 0n))).toBe('x64');
  expect(peArchitectureFromBuffer(makePe(0x8664, 0x180001000n))).toBe('arm64ec');
  expect(peArchitectureFromBuffer(makePe(0xaa64, 0n))).toBe('arm64');
  expect(peArchitectureFromBuffer(makePe(0xaa64, 0x180001000n))).toBe('arm64x');
});

test('peArchitectureFromBuffer ignores CHPE bytes beyond an older, shorter load config', () => {
  expect(peArchitectureFromBuffer(makePe(0x8664, 0x180001000n, 0x70))).toBe('x64');
});

test('peArchitectureFromBuffer rejects non-PE and unsupported machines', () => {
  expect(peArchitectureFromBuffer(Buffer.from('not a binary'))).toBeNull();
  expect(peArchitectureFromBuffer(makePe(0x14c, 0n))).toBeNull(); // 32-bit x86
});
