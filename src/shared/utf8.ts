export function* utf8Bytes(text: string): Generator<number> {
  for (const char of text) {
    let code = char.codePointAt(0) ?? 0;
    if (code >= 0xd800 && code <= 0xdfff) code = 0xfffd;
    if (code < 0x80) yield code;
    else if (code < 0x800) { yield 0xc0 | (code >>> 6); yield 0x80 | (code & 63); }
    else if (code < 0x10000) { yield 0xe0 | (code >>> 12); yield 0x80 | ((code >>> 6) & 63); yield 0x80 | (code & 63); }
    else { yield 0xf0 | (code >>> 18); yield 0x80 | ((code >>> 12) & 63); yield 0x80 | ((code >>> 6) & 63); yield 0x80 | (code & 63); }
  }
}
