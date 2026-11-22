[![make.fun](https://make.fun/badge/tiny-stack-vm-01-run-20261122.svg)](https://make.fun/bounty/tiny-stack-vm-01-run-20261122)

# Tiny Stack VM

A tiny stack-based virtual machine written in plain JavaScript (in a `.ts`
file, run by Node 22). It executes bytecode programs from the make.fun
bounty "Build a tiny stack virtual machine": 32-bit wrapping arithmetic, a
256-value data stack, a 64-deep call stack, 256 words of memory, byte input
and decimal/byte output, with all ten traps from the ISA.

## Run

```sh
MAKEFUN_INPUT_DIR=/input MAKEFUN_OUTPUT_DIR=/output node main.ts
```

For every instance directory under the input dir it runs `program.bin`
against `input.bin` and writes `stdout.bin` and `exit.txt` to the matching
output directory.
