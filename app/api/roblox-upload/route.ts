import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 30;

async function pollOperation(operationPath: string, apiKey: string): Promise<string | null> {
  const maxAttempts = 15;
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, 1500));

    const res = await fetch(`https://apis.roblox.com/assets/v1/${operationPath}`, {
      headers: { 'x-api-key': apiKey },
    });

    if (!res.ok) continue;

    const data = await res.json();
    if (data.done && data.response) {
      return data.response.assetId ?? null;
    }
  }
  return null;
}

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();

    const apiKey = formData.get('apiKey') as string;
    const creatorType = formData.get('creatorType') as string;
    const creatorId = formData.get('creatorId') as string;
    const assetName = (formData.get('assetName') as string) || 'Uploaded Icon';
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
      assetType: 'Decal',
      displayName: assetName,
      description: 'Uploaded via PIXEL FORGE',
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
        { error: `Roblox API error (${uploadRes.status}): ${uploadText}` },
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
      const assetId = await pollOperation(result.path as string, apiKey);
      if (assetId) {
        return NextResponse.json({ assetId, success: true });
      }
      return NextResponse.json(
        {
          error: 'Asset is still processing. Check Roblox Creator Hub for the uploaded asset.',
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
