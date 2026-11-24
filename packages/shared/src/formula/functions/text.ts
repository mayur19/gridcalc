import { toInteger, toText } from '../coercion.js';
import { flatten, isError, makeError, type ErrorValue, type EvalValue } from '../values.js';
import { VARIADIC, type FunctionSpec } from './types.js';

function textArg(value: EvalValue | undefined): string | ErrorValue {
  return toText(value ?? null);
}

function unaryText(name: string, description: string, op: (s: string) => EvalValue): FunctionSpec {
  return {
    name,
    category: 'text',
    kind: 'eager',
    minArgs: 1,
    maxArgs: 1,
    signature: `${name}(text)`,
    description,
    impl: ([arg]) => {
      const text = textArg(arg);
      return isError(text) ? text : op(text);
    },
  };
}

function concatenation(name: string, description: string): FunctionSpec {
  return {
    name,
    category: 'text',
    kind: 'eager',
    minArgs: 1,
    maxArgs: VARIADIC,
    signature: `${name}(text1, [text2], ...)`,
    description,
    impl: (args) => {
      let out = '';
      for (const arg of args) {
        for (const value of flatten(arg)) {
          const text = toText(value);
          if (isError(text)) return text;
          out += text;
        }
      }
      return out.length > 32_767 ? makeError('#VALUE!', 'Text result too long') : out;
    },
  };
}

function sideSlice(name: 'LEFT' | 'RIGHT'): FunctionSpec {
  return {
    name,
    category: 'text',
    kind: 'eager',
    minArgs: 1,
    maxArgs: 2,
    signature: `${name}(text, [num_chars])`,
    description: `Returns the ${name === 'LEFT' ? 'first' : 'last'} num_chars characters (default 1).`,
    impl: ([textValue, countValue = 1]) => {
      const text = textArg(textValue);
      if (isError(text)) return text;
      const count = toInteger(countValue);
      if (isError(count)) return count;
      if (count < 0) return makeError('#VALUE!', 'num_chars must be >= 0');
      const chars = Array.from(text);
      return name === 'LEFT'
        ? chars.slice(0, count).join('')
        : chars.slice(Math.max(0, chars.length - count)).join('');
    },
  };
}

const mid: FunctionSpec = {
  name: 'MID',
  category: 'text',
  kind: 'eager',
  minArgs: 3,
  maxArgs: 3,
  signature: 'MID(text, start_num, num_chars)',
  description: 'Returns num_chars characters starting at the 1-based position start_num.',
  impl: ([textValue, startValue, countValue]) => {
    const text = textArg(textValue);
    if (isError(text)) return text;
    const start = toInteger(startValue as EvalValue);
    if (isError(start)) return start;
    const count = toInteger(countValue as EvalValue);
    if (isError(count)) return count;
    if (start < 1 || count < 0)
      return makeError('#VALUE!', 'start_num must be >= 1, num_chars >= 0');
    return Array.from(text)
      .slice(start - 1, start - 1 + count)
      .join('');
  },
};

export const textFunctions: readonly FunctionSpec[] = [
  concatenation('CONCAT', 'Joins text from values and ranges.'),
  concatenation('CONCATENATE', 'Joins text values (legacy name of CONCAT).'),
  sideSlice('LEFT'),
  sideSlice('RIGHT'),
  mid,
  unaryText('LEN', 'Number of characters in the text.', (s) => Array.from(s).length),
  unaryText('UPPER', 'Converts text to upper case.', (s) => s.toUpperCase()),
  unaryText('LOWER', 'Converts text to lower case.', (s) => s.toLowerCase()),
  unaryText('TRIM', 'Removes leading/trailing spaces and collapses inner runs of spaces.', (s) =>
    s.replace(/ +/g, ' ').trim(),
  ),
];
