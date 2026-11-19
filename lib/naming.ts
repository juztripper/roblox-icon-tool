// Shared naming helpers — used by the /api/auto-name route (to clean model
// output) and the client (to format words into the user's chosen style).

export type NameStyle = 'snake' | 'pascal' | 'camel' | 'kebab' | 'title';

export interface NamingOptions {
  style: NameStyle;
  maxWords: number;
  prefix: string;
  suffix: string;
  context: string;
  model: string;
  autoOnImport: boolean;
}

// Vision models on OpenRouter, tried in order. The first one is the default;
// the rest are passed as OpenRouter fallbacks so a provider outage or a
// delisted model doesn't break naming again.
export const DEFAULT_VISION_MODEL = 'google/gemini-3.5-flash-lite';
export const FALLBACK_VISION_MODELS = [
  'qwen/qwen3.7-flash',
  'google/gemma-4-26b-a4b-it',
];

export const DEFAULT_NAMING_OPTIONS: NamingOptions = {
  style: 'snake',
  maxWords: 2,
  prefix: '',
  suffix: '',
  context: '',
  model: '',
  autoOnImport: true,
};

export const NAME_STYLE_LABELS: Record<NameStyle, string> = {
  snake: 'snake_case',
  pascal: 'PascalCase',
  camel: 'camelCase',
  kebab: 'kebab-case',
  title: 'Title Case',
};

const GENERIC_WORDS = new Set([
  'image', 'icon', 'asset', 'picture', 'thing', 'object', 'png', 'jpg', 'graphic', 'illustration',
]);

const SUBTYPE_MAP: Record<string, string> = {
  bumblebee: 'bee',
  bunny: 'rabbit',
};

/** Split arbitrary text (snake, camel, spaces, punctuation) into lowercase words. */
export function toWords(raw: string): string[] {
  return raw
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim()
    .split(' ')
    .filter(Boolean);
}

/** Clean a candidate name from the model into a short list of useful words. */
export function cleanWords(raw: string, maxWords: number): string[] {
  const words = toWords(raw)
    .filter((w) => !/^\d+$/.test(w))
    .map((w) => SUBTYPE_MAP[w] ?? w);
  const meaningful = words.filter((w) => !GENERIC_WORDS.has(w));
  return (meaningful.length > 0 ? meaningful : []).slice(0, Math.max(1, maxWords));
}

export function formatWords(words: string[], style: NameStyle): string {
  if (words.length === 0) return '';
  const cap = (w: string) => w.charAt(0).toUpperCase() + w.slice(1);
  switch (style) {
    case 'snake': return words.join('_');
    case 'kebab': return words.join('-');
    case 'pascal': return words.map(cap).join('');
    case 'camel': return words[0] + words.slice(1).map(cap).join('');
    case 'title': return words.map(cap).join(' ');
  }
}

/** Format words + prefix/suffix into a final base name (no extension). */
export function buildName(words: string[], opts: Pick<NamingOptions, 'style' | 'prefix' | 'suffix'>): string {
  const joiner = opts.style === 'snake' ? '_' : opts.style === 'kebab' ? '-' : opts.style === 'title' ? ' ' : '';
  const core = formatWords(words, opts.style);
  const prefix = opts.prefix.trim();
  const suffix = opts.suffix.trim();
  return [prefix, core, suffix].filter(Boolean).join(joiner);
}

/**
 * Pull a name + alternatives out of whatever the model returned. Handles
 * plain JSON, JSON in code fences, <think> blocks, and bare one-line answers.
 */
export function parseModelNames(content: string, maxWords: number): { name: string[]; alternatives: string[][] } {
  const stripped = content
    .replace(/<think>[\s\S]*?<\/think>/gi, '')
    .replace(/```(?:json)?/gi, '')
    .trim();

  let candidates: string[] = [];
  const jsonMatch = stripped.match(/\{[\s\S]*\}/);
  if (jsonMatch) {
    try {
      const parsed = JSON.parse(jsonMatch[0]) as { name?: unknown; alternatives?: unknown };
      if (typeof parsed.name === 'string') candidates.push(parsed.name);
      if (Array.isArray(parsed.alternatives)) {
        for (const a of parsed.alternatives) if (typeof a === 'string') candidates.push(a);
      }
    } catch {
      // fall through to line parsing
    }
  }
  if (candidates.length === 0) {
    candidates = stripped
      .split(/\r?\n|,/)
      .map((l) => l.replace(/^[\s\-*\d.)"']+|["']+$/g, '').trim())
      .filter(Boolean)
      .slice(0, 4);
  }

  const seen = new Set<string>();
  const cleaned: string[][] = [];
  for (const c of candidates) {
    const words = cleanWords(c, maxWords);
    const key = words.join(' ');
    if (!key || seen.has(key)) continue;
    seen.add(key);
    cleaned.push(words);
  }
  return { name: cleaned[0] ?? [], alternatives: cleaned.slice(1, 4) };
}
