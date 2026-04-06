import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 20;
const DEFAULT_VISION_MODEL = 'google/gemma-4-26b-a4b-it';

const OUTPUT_REGEX = /^[a-z]+(?:_[a-z]+)?$/;
const GENERIC_WORDS = new Set([
    'image',
    'icon',
    'asset',
    'picture',
    'thing',
    'object',
]);
const SUBTYPE_MAP: Record<string, string> = {
    bumblebee: 'bee',
    bunny: 'rabbit',
};

function sanitizeName(raw: string): string {
    const cleaned = raw
        .toLowerCase()
        .replace(/[^a-z\s_-]/g, ' ')
        .replace(/[\s-]+/g, '_')
        .replace(/_+/g, '_')
        .replace(/^_+|_+$/g, '');

    const parts = cleaned.split('_').filter(Boolean).slice(0, 2);
    if (parts.length === 0) return 'unknown_icon';
    if (parts.length === 1 && GENERIC_WORDS.has(parts[0])) return 'unknown_icon';
    return parts.join('_');
}

function normalizeSpecificity(name: string): string {
    const parts = name.split('_').filter(Boolean);
    if (parts.length === 0) return 'unknown_icon';

    const normalized = parts.map((part) => SUBTYPE_MAP[part] ?? part).slice(0, 2);
    return normalized.join('_');
}

function parseModelOutput(content: string): string {
    const firstLine = content.split(/\r?\n/)[0]?.trim() ?? '';
    const value = normalizeSpecificity(sanitizeName(firstLine));
    return OUTPUT_REGEX.test(value) ? value : 'unknown_icon';
}

export async function POST(request: NextRequest) {
    try {
        const apiKey = process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json({ error: 'OPENROUTER_API_KEY is not configured' }, { status: 500 });
        }

        const formData = await request.formData();
        const imageEntry = formData.get('image');
        const imageFile = imageEntry instanceof Blob ? imageEntry : null;
        if (!imageFile) {
            return NextResponse.json({ error: 'Missing image field' }, { status: 400 });
        }

        const arrayBuffer = await imageFile.arrayBuffer();
        const base64 = Buffer.from(arrayBuffer).toString('base64');
        const mimeType = imageFile.type || 'image/png';
        const requestedModel = process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_VISION_MODEL;

        const prompt = [
            'You are a strict image filename generator.',
            'Given one image, return a name for the main subject.',
            'Output contract (must follow exactly):',
            '- Return EXACTLY one line',
            '- Lowercase snake_case only',
            '- Regex must match: ^[a-z]+(?:_[a-z]+)?$',
            '- 1 or 2 words only',
            '- No extra text, no punctuation, no quotes, no JSON',
            'Naming rules:',
            '- Prefer concrete noun(s) for the main subject',
            '- Avoid generic words: image, icon, asset, picture, object, thing',
            '- Avoid brand names / copyrighted character names',
            '- Specificity policy:',
            '  - Prefer the simplest correct noun.',
            '  - For real-world animals/objects, avoid unnecessary adjectives (especially color).',
            '  - Do not use subtype labels unless visually unmistakable.',
            '  - Use "bee" over "bumblebee" unless it is unmistakably a bumblebee.',
            '  - Keep color/material only when it is clearly meaningful to identity.',
            '- If uncertain, output: unknown_icon',
            'Examples of valid outputs:',
            'dragon',
            'energy_orb',
            'wood_crate',
            'unknown_icon',
        ].join('\n');

        const callOpenRouter = async (model: string) => {
            const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
                method: 'POST',
                headers: {
                    Authorization: `Bearer ${apiKey}`,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    model,
                    temperature: 0.1,
                    max_tokens: 12,
                    messages: [
                        { role: 'system', content: prompt },
                        {
                            role: 'user',
                            content: [
                                { type: 'text', text: 'Name this image.' },
                                {
                                    type: 'image_url',
                                    image_url: {
                                        url: `data:${mimeType};base64,${base64}`,
                                    },
                                },
                            ],
                        },
                    ],
                }),
            });

            if (!response.ok) {
                const text = await response.text();
                return { ok: false as const, model, status: response.status, text };
            }

            const payload = (await response.json()) as {
                choices?: Array<{ message?: { content?: string } }>;
            };
            const content = payload.choices?.[0]?.message?.content ?? '';
            return { ok: true as const, model, content };
        };

        const first = await callOpenRouter(requestedModel);
        if (first.ok) {
            const name = parseModelOutput(first.content);
            return NextResponse.json({ name, success: true, model: first.model });
        }

        const shouldFallback =
            requestedModel !== DEFAULT_VISION_MODEL &&
            /image|vision|multimodal|input_image|image_url|unsupported/i.test(first.text);

        if (shouldFallback) {
            const second = await callOpenRouter(DEFAULT_VISION_MODEL);
            if (second.ok) {
                const name = parseModelOutput(second.content);
                return NextResponse.json({ name, success: true, model: second.model });
            }
            console.error('[auto-name] OpenRouter fallback failed:', second.status, second.text);
            return NextResponse.json(
                { error: `OpenRouter error (${second.status}): ${second.text}` },
                { status: 502 },
            );
        }

        console.error('[auto-name] OpenRouter request failed:', first.status, first.text);
        return NextResponse.json({ error: `OpenRouter error (${first.status}): ${first.text}` }, { status: 502 });
    } catch (err: unknown) {
        console.error('[auto-name] Error:', err);
        const msg = err instanceof Error ? err.message : 'Auto naming failed';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
