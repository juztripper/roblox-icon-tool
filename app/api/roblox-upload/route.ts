import { NextRequest, NextResponse } from 'next/server';
import { pollOperation } from '@/lib/robloxOperation';

export const maxDuration = 30;

// Roblox rejects display names over 50 characters and some punctuation.
function sanitizeDisplayName(raw: string): string {
  const cleaned = raw
    .replace(/[^\p{L}\p{N} _.'()-]/gu, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, 50)
    .trim();
  return cleaned || 'Uploaded Icon';
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const apiKey = formData.get('apiKey') as string;
    const creatorType = formData.get('creatorType') as string;
    const creatorId = formData.get('creatorId') as string;
    const assetName = sanitizeDisplayName((formData.get('assetName') as string) || '');
    const description = ((formData.get('description') as string) || 'Uploaded via Pixel Forge').slice(0, 1000);
    const imageEntry = formData.get('image');
    const imageFile = imageEntry instanceof Blob ? imageEntry : null;
    const imageName =
      imageEntry &&
      typeof imageEntry === 'object' &&
      'name' in imageEntry &&
      typeof (imageEntry as { name?: unknown }).name === 'string'
        ? ((imageEntry as { name: string }).name || 'icon.png')
        : 'icon.png';

    if (!apiKey || !creatorId || !imageFile) {
      return NextResponse.json({ error: 'Missing required fields: apiKey, creatorId, image' }, { status: 400 });
    }

    const creator =
      creatorType === 'group' ? { groupId: creatorId } : { userId: creatorId };

    const requestPayload = {
      assetType: 'Image',
      displayName: assetName,
      description,
      creationContext: { creator },
    };

    const robloxForm = new FormData();
    robloxForm.append('request', JSON.stringify(requestPayload));
    robloxForm.append('fileContent', imageFile, imageName);

    const uploadRes = await fetch('https://apis.roblox.com/assets/v1/assets', {
      method: 'POST',
      headers: { 'x-api-key': apiKey },
      body: robloxForm,
    });

    const uploadText = await uploadRes.text();

    if (!uploadRes.ok) {
      return NextResponse.json(
        { error: describeRobloxError(uploadRes.status, uploadText) },
        { status: uploadRes.status }
      );
    }

    let result: Record<string, unknown>;
    try {
      result = JSON.parse(uploadText);
    } catch {
      return NextResponse.json({ error: 'Unexpected response from Roblox API' }, { status: 502 });
    }

    // Synchronous success
    if (result.done === true && result.response) {
      const res = result.response as Record<string, unknown>;
      return NextResponse.json({ assetId: res.assetId, success: true });
    }

    // Long-running operation — poll
    if (result.path) {
      const assetId = await pollOperation(result.path as string, apiKey, 12);
      if (assetId) {
        return NextResponse.json({ assetId, success: true });
      }
      return NextResponse.json(
        {
          error: 'Asset is still processing on Roblox.',
          pending: true,
          operationPath: result.path,
        },
        { status: 202 }
      );
    }

    return NextResponse.json({ error: 'Unexpected response structure', raw: result }, { status: 502 });
  } catch (err) {
    console.error('[roblox-upload] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

function describeRobloxError(status: number, body: string): string {
  let message = body;
  try {
    const parsed = JSON.parse(body) as { message?: string; errors?: { message?: string }[] };
    message = parsed.message ?? parsed.errors?.[0]?.message ?? body;
  } catch { /* keep raw body */ }
  if (status === 401) return 'Roblox rejected the API key. Check it was copied fully and hasn\'t expired.';
  if (status === 403) return `API key is missing permission or isn't allowed for this creator: ${message}`;
  if (status === 429) return 'Roblox rate limit hit — wait a minute and publish again.';
  return `Roblox API error (${status}): ${message}`;
}
