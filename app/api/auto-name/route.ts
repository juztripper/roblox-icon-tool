import { NextRequest, NextResponse } from 'next/server';
import { DEFAULT_VISION_MODEL, FALLBACK_VISION_MODELS, parseModelNames } from '@/lib/naming';

export const maxDuration = 30;

const MODEL_ID_REGEX = /^[a-z0-9._~:/-]{3,120}$/i;

function buildPrompt(maxWords: number, context: string): string {
    return [
        'You name image assets for a Roblox game so developers can find them later.',
        'Look at the image and name its main subject.',
        '',
        'Reply with ONLY a JSON object, no prose, no code fences:',
        '{"name": "<best name>", "alternatives": ["<alt 1>", "<alt 2>", "<alt 3>"]}',
        '',
        'Rules for every name:',
        `- 1 to ${maxWords} plain lowercase English words separated by spaces`,
        '- Concrete nouns for the subject (e.g. "dragon", "energy orb", "wood crate", "gold coin")',
        '- Add a descriptive word only when it matters for telling assets apart (material, element, state)',
        '- Skip colour unless colour is the main thing that identifies it',
        '- Never use generic words: image, icon, asset, picture, object, thing, illustration',
        '- No brand names, game names or copyrighted character names',
        '- Alternatives should be genuinely different useful names, not reorderings',
        context ? `\nContext from the developer: ${context}` : '',
    ].join('\n');
}

type CallResult =
    | { ok: true; model: string; content: string }
    | { ok: false; status: number; text: string };

async function callOpenRouter(opts: {
    apiKey: string;
    models: string[];
    prompt: string;
    dataUrl: string;
    disableReasoning: boolean;
    referer: string;
}): Promise<CallResult> {
    const body: Record<string, unknown> = {
        model: opts.models[0],
        // OpenRouter tries these in order if the primary model or its providers fail.
        models: opts.models,
        temperature: 0.2,
        // Generous budget: reasoning models burn tokens before answering, and a
        // tiny max_tokens was the reason naming silently returned nothing.
        max_tokens: 400,
        messages: [
            { role: 'system', content: opts.prompt },
            {
                role: 'user',
                content: [
                    { type: 'text', text: 'Name this asset.' },
                    { type: 'image_url', image_url: { url: opts.dataUrl } },
                ],
            },
        ],
    };
    if (opts.disableReasoning) body.reasoning = { enabled: false, exclude: true };

    const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
            Authorization: `Bearer ${opts.apiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': opts.referer,
            'X-Title': 'Pixel Forge',
        },
        body: JSON.stringify(body),
    });

    const text = await response.text();
    if (!response.ok) return { ok: false, status: response.status, text };

    let payload: {
        model?: string;
        error?: { message?: string };
        choices?: Array<{ message?: { content?: unknown } }>;
    };
    try {
        payload = JSON.parse(text);
    } catch {
        return { ok: false, status: 502, text: 'OpenRouter returned invalid JSON' };
    }
    if (payload.error) return { ok: false, status: 502, text: payload.error.message ?? 'OpenRouter error' };

    const raw = payload.choices?.[0]?.message?.content;
    // Some providers return content as an array of parts.
    const content = Array.isArray(raw)
        ? raw.map((p) => (typeof p === 'object' && p && 'text' in p ? String((p as { text: unknown }).text) : '')).join('')
        : typeof raw === 'string' ? raw : '';
    return { ok: true, model: payload.model ?? opts.models[0], content };
}

/** Lets the UI show whether naming is set up on the server. */
export async function GET() {
    return NextResponse.json({
        configured: Boolean(process.env.OPENROUTER_API_KEY),
        defaultModel: process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_VISION_MODEL,
    });
}

export async function POST(request: NextRequest) {
    try {
        const formData = await request.formData();

        const userKey = String(formData.get('apiKey') ?? '').trim();
        const apiKey = userKey || process.env.OPENROUTER_API_KEY;
        if (!apiKey) {
            return NextResponse.json(
                { error: 'No OpenRouter key. Add OPENROUTER_API_KEY to the server env, or paste your own key in Naming settings.' },
                { status: 400 },
            );
        }

        const imageEntry = formData.get('image');
        const imageFile = imageEntry instanceof Blob ? imageEntry : null;
        if (!imageFile) {
            return NextResponse.json({ error: 'Missing image field' }, { status: 400 });
        }
        if (imageFile.size > 4 * 1024 * 1024) {
            return NextResponse.json({ error: 'Image too large for naming (max 4MB)' }, { status: 413 });
        }

        const maxWords = Math.min(4, Math.max(1, Number(formData.get('maxWords')) || 2));
        const context = String(formData.get('context') ?? '').slice(0, 300).trim();
        const requestedModel = String(formData.get('model') ?? '').trim();

        const primary = MODEL_ID_REGEX.test(requestedModel)
            ? requestedModel
            : process.env.OPENROUTER_IMAGE_MODEL || DEFAULT_VISION_MODEL;
        // OpenRouter accepts at most 3 fallback models alongside the primary.
        const models = [primary, ...FALLBACK_VISION_MODELS.filter((m) => m !== primary)].slice(0, 3);

        const base64 = Buffer.from(await imageFile.arrayBuffer()).toString('base64');
        const dataUrl = `data:${imageFile.type || 'image/png'};base64,${base64}`;
        const prompt = buildPrompt(maxWords, context);
        const referer = request.headers.get('origin') || 'https://pixel-forge.local';

        let result = await callOpenRouter({ apiKey, models, prompt, dataUrl, disableReasoning: true, referer });

        // Models that can't turn reasoning off reject the flag — retry without it.
        if (!result.ok && result.status === 400 && /reason/i.test(result.text)) {
            result = await callOpenRouter({ apiKey, models, prompt, dataUrl, disableReasoning: false, referer });
        }

        if (!result.ok) {
            console.error('[auto-name] OpenRouter request failed:', result.status, result.text);
            const status = result.status === 401 || result.status === 402 || result.status === 429 ? result.status : 502;
            const hint =
                result.status === 401 ? 'OpenRouter rejected the API key.'
                : result.status === 402 ? 'OpenRouter account is out of credits.'
                : result.status === 429 ? 'Rate limited by OpenRouter — try again in a moment.'
                : `OpenRouter error (${result.status}).`;
            return NextResponse.json({ error: hint, detail: result.text.slice(0, 500) }, { status });
        }

        const { name, alternatives } = parseModelNames(result.content, maxWords);
        if (name.length === 0) {
            return NextResponse.json(
                { error: 'The model did not return a usable name', detail: result.content.slice(0, 200), model: result.model },
                { status: 422 },
            );
        }

        return NextResponse.json({ success: true, words: name, alternatives, model: result.model });
    } catch (err: unknown) {
        console.error('[auto-name] Error:', err);
        const msg = err instanceof Error ? err.message : 'Auto naming failed';
        return NextResponse.json({ error: msg }, { status: 500 });
    }
}
