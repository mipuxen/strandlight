/**
 * Minimal ICU MessageFormat: `{name}` and `{n, plural, one {...} other {...}}` with `#`.
 * Enough for Strandlight's strings, with no runtime dependency.
 */
export type Params = Record<string, string | number>;

function findClose(s: string, start: number): number {
  let depth = 0;
  for (let i = start; i < s.length; i++) {
    if (s[i] === '{') depth++;
    else if (s[i] === '}') {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

export function format(msg: string, params: Params, locale: string): string {
  let out = '';
  let i = 0;
  while (i < msg.length) {
    const ch = msg[i];
    if (ch !== '{') {
      out += ch;
      i++;
      continue;
    }
    const end = findClose(msg, i);
    if (end === -1) return out + msg.slice(i);
    const body = msg.slice(i + 1, end);
    const comma = body.indexOf(',');
    if (comma === -1) {
      const v = params[body.trim()];
      out += v === undefined ? `{${body}}` : String(v);
    } else {
      const name = body.slice(0, comma).trim();
      const rest = body.slice(comma + 1);
      const kind = rest.slice(0, rest.indexOf(',')).trim();
      if (kind === 'plural') {
        const n = Number(params[name] ?? 0);
        const options = parseOptions(rest.slice(rest.indexOf(',') + 1));
        const cat = new Intl.PluralRules(locale).select(n);
        const chosen = options[`=${n}`] ?? options[cat] ?? options.other ?? '';
        out += format(chosen, params, locale).replace(
          /#/g,
          new Intl.NumberFormat(locale).format(n),
        );
      } else {
        out += String(params[name] ?? '');
      }
    }
    i = end + 1;
  }
  return out;
}

function parseOptions(s: string): Record<string, string> {
  const opts: Record<string, string> = {};
  let i = 0;
  while (i < s.length) {
    while (i < s.length && /\s/.test(s[i] as string)) i++;
    const keyStart = i;
    while (i < s.length && s[i] !== '{' && !/\s/.test(s[i] as string)) i++;
    const key = s.slice(keyStart, i);
    while (i < s.length && s[i] !== '{') i++;
    const end = findClose(s, i);
    if (!key || end === -1) break;
    opts[key] = s.slice(i + 1, end);
    i = end + 1;
  }
  return opts;
}
