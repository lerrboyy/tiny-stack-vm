// Tiny stack virtual machine — a make.fun bounty entry.
// Reads MAKEFUN_INPUT_DIR (default /input) and MAKEFUN_OUTPUT_DIR
// (default /output). For every instance directory, sorted, it runs
// program.bin against input.bin and writes stdout.bin + exit.txt.
const fs = require('node:fs');
const path = require('node:path');

const inDir = process.env.MAKEFUN_INPUT_DIR || '/input';
const outDir = process.env.MAKEFUN_OUTPUT_DIR || '/output';

function run(prog, input) {
  const st = new Int32Array(256); // data stack
  const cs = new Int32Array(64); // call stack
  const mem = new Int32Array(256); // memory words
  const out = []; // output bytes
  let sp = 0, cp = 0, pc = 0, ip = 0, steps = 0;
  const n = prog.length;
  while (true) {
    if (steps >= 1000000) return [out, 10];
    if (pc < 0 || pc >= n) return [out, 9];
    const op = prog[pc];
    let imm = 0, len = 1;
    if (op === 0x01 || op === 0x02) len = op === 0x01 ? 2 : 5;
    else if (op === 0x30 || op === 0x31 || op === 0x32 || op === 0x33) len = 3;
    else if (
      !(op <= 0x07 || (op >= 0x10 && op <= 0x22 && op !== 0x1f) ||
        (op >= 0x30 && op <= 0x34) || op === 0x40 || op === 0x41 ||
        (op >= 0x50 && op <= 0x53))
    ) return [out, 5];
    if (pc + len > n) return [out, 9];
    steps++;
    let npc = pc + len;
    if (op === 0x01) { // PUSH8: sign-extended byte
      if (sp >= 256) return [out, 3];
      const b = prog[pc + 1];
      st[sp++] = b >= 128 ? b - 256 : b;
    } else if (op === 0x02) { // PUSH32: little-endian signed
      if (sp >= 256) return [out, 3];
      st[sp++] = prog[pc + 1] | (prog[pc + 2] << 8) | (prog[pc + 3] << 16) | (prog[pc + 4] << 24);
    } else if (op === 0x00) { // HALT
      return [out, 0];
    } else if (op === 0x03) { // POP
      if (sp < 1) return [out, 2];
      sp--;
    } else if (op === 0x04) { // DUP
      if (sp < 1) return [out, 2];
      if (sp >= 256) return [out, 3];
      st[sp] = st[sp - 1]; sp++;
    } else if (op === 0x05) { // SWAP
      if (sp < 2) return [out, 2];
      const t = st[sp - 1]; st[sp - 1] = st[sp - 2]; st[sp - 2] = t;
    } else if (op === 0x06) { // OVER
      if (sp < 2) return [out, 2];
      if (sp >= 256) return [out, 3];
      st[sp] = st[sp - 2]; sp++;
    } else if (op === 0x07) { // ROT
      if (sp < 3) return [out, 2];
      const t = st[sp - 3]; st[sp - 3] = st[sp - 2]; st[sp - 2] = st[sp - 1]; st[sp - 1] = t;
    } else if (op >= 0x10 && op <= 0x16) { // binary arithmetic
      if (sp < 2) return [out, 2];
      const b = st[--sp], a = st[sp - 1];
      let r;
      if (op === 0x10) r = (a + b) | 0;
      else if (op === 0x11) r = (a - b) | 0;
      else if (op === 0x12) r = Math.imul(a, b);
      else if (op === 0x13) { if (b === 0) return [out, 4]; r = (a / b) | 0; }
      else if (op === 0x14) { if (b === 0) return [out, 4]; r = (a % b) | 0; }
      else if (op === 0x15) { if (b === 0) return [out, 4]; r = ((a >>> 0) / (b >>> 0)) | 0; }
      else { if (b === 0) return [out, 4]; r = ((a >>> 0) % (b >>> 0)) | 0; }
      st[sp - 1] = r;
    } else if (op === 0x17) { // NEG
      if (sp < 1) return [out, 2];
      st[sp - 1] = (-st[sp - 1]) | 0;
    } else if (op >= 0x18 && op <= 0x1a) { // AND OR XOR
      if (sp < 2) return [out, 2];
      const b = st[--sp], a = st[sp - 1];
      st[sp - 1] = op === 0x18 ? a & b : op === 0x19 ? a | b : a ^ b;
    } else if (op === 0x1b) { // NOT
      if (sp < 1) return [out, 2];
      st[sp - 1] = ~st[sp - 1];
    } else if (op >= 0x1c && op <= 0x1e) { // shifts, count masked to 5 bits
      if (sp < 2) return [out, 2];
      const b = st[--sp] & 31, a = st[sp - 1];
      st[sp - 1] = op === 0x1c ? a << b : op === 0x1d ? a >> b : (a >>> b) | 0;
    } else if (op >= 0x20 && op <= 0x22) { // EQ LT LTU
      if (sp < 2) return [out, 2];
      const b = st[--sp], a = st[sp - 1];
      st[sp - 1] = op === 0x20 ? (a === b ? 1 : 0)
        : op === 0x21 ? (a < b ? 1 : 0)
        : ((a >>> 0) < (b >>> 0) ? 1 : 0);
    } else if (op === 0x30 || op === 0x31 || op === 0x32) { // jumps
      imm = prog[pc + 1] | (prog[pc + 2] << 8);
      if (imm >= 32768) imm -= 65536;
      if (op === 0x30) { npc = pc + 3 + imm; }
      else {
        if (sp < 1) return [out, 2];
        const v = st[--sp];
        if ((op === 0x31 && v === 0) || (op === 0x32 && v !== 0)) npc = pc + 3 + imm;
      }
    } else if (op === 0x33) { // CALL
      if (cp >= 64) return [out, 7];
      cs[cp++] = pc + 3;
      npc = prog[pc + 1] | (prog[pc + 2] << 8);
    } else if (op === 0x34) { // RET
      if (cp < 1) return [out, 8];
      npc = cs[--cp];
    } else if (op === 0x40) { // LOAD
      if (sp < 1) return [out, 2];
      const a = st[sp - 1];
      if (a < 0 || a > 255) return [out, 6];
      st[sp - 1] = mem[a];
    } else if (op === 0x41) { // STORE: address is the top, value below it
      if (sp < 2) return [out, 2];
      const a = st[--sp], v = st[--sp];
      if (a < 0 || a > 255) return [out, 6];
      mem[a] = v;
    } else if (op === 0x50) { // PRINT: decimal text, no newline
      if (sp < 1) return [out, 2];
      const s = String(st[--sp]);
      if (out.length + s.length > 65536) return [out, 11];
      for (let i = 0; i < s.length; i++) out.push(s.charCodeAt(i));
    } else if (op === 0x51) { // PUTC: low byte
      if (sp < 1) return [out, 2];
      if (out.length + 1 > 65536) return [out, 11];
      out.push(st[--sp] & 255);
    } else if (op === 0x52) { // IN: -1 past EOF
      if (sp >= 256) return [out, 3];
      st[sp++] = ip < input.length ? input[ip++] : -1;
    } else { // EXIT: low byte of the popped value
      if (sp < 1) return [out, 2];
      return [out, st[--sp] & 255];
    }
    pc = npc;
  }
}

const names = fs.readdirSync(inDir).sort();
for (const name of names) {
  const idir = path.join(inDir, name);
  if (!fs.statSync(idir).isDirectory()) continue;
  const prog = fs.readFileSync(path.join(idir, 'program.bin'));
  let input = Buffer.alloc(0);
  try { input = fs.readFileSync(path.join(idir, 'input.bin')); } catch (e) { /* no input */ }
  const [out, code] = run(prog, input);
  const odir = path.join(outDir, name);
  fs.mkdirSync(odir, { recursive: true });
  fs.writeFileSync(path.join(odir, 'stdout.bin'), Buffer.from(out));
  fs.writeFileSync(path.join(odir, 'exit.txt'), String(code) + '\n');
}
