// Minimal OSC 1.0 encoder: addresses plus int32 / float32 arguments. No dependencies.

const pad4 = (n) => (4 - (n % 4)) % 4;

function oscString(s) {
  const bytes = Buffer.from(s, 'ascii');
  return Buffer.concat([bytes, Buffer.alloc(1 + pad4(bytes.length + 1))]);
}

/** Integers are sent as int32 ('i'), everything else as float32 ('f'). */
export function encodeMessage(address, args) {
  const tags = ',' + args.map((a) => (Number.isInteger(a) ? 'i' : 'f')).join('');
  const data = args.map((a) => {
    const b = Buffer.alloc(4);
    if (Number.isInteger(a)) b.writeInt32BE(a);
    else b.writeFloatBE(a);
    return b;
  });
  return Buffer.concat([oscString(address), oscString(tags), ...data]);
}
