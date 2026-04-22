import { NextRequest, NextResponse } from 'next/server';

export const maxDuration = 15;

export async function GET(request: NextRequest) {
  try {
    const assetId = request.nextUrl.searchParams.get('assetId');
    if (!assetId || !/^\d+$/.test(assetId)) {
      return NextResponse.json(
        { error: 'Missing or invalid assetId (must be numeric)' },
        { status: 400 },
      );
    }

    // Strategy 1: Thumbnails API → fetch CDN image at max resolution
    const thumbImage = await tryThumbnailsApi(assetId);
    if (thumbImage) return thumbImage;

    // Strategy 2: Asset delivery (legacy decals return XML with an image URL inside)
    const deliveryImage = await tryAssetDelivery(assetId);
    if (deliveryImage) return deliveryImage;

    return NextResponse.json(
      { error: 'Could not resolve image. Asset may be private or not an image.' },
      { status: 404 },
    );
  } catch (err) {
    console.error('[roblox-fetch-image] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

/** Fetch via the public Thumbnails API and then upscale the CDN URL to 1024. */
async function tryThumbnailsApi(assetId: string): Promise<NextResponse | null> {
  try {
    // Roblox often returns state: 'Pending' on the first request while it generates
    // the thumbnail server-side. Poll a few times before giving up so the user
    // doesn't have to re-submit the asset ID manually.
    const maxAttempts = 5;
    const delayMs = 600;
    let entry: { state?: string; imageUrl?: string } | undefined;

    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const res = await fetch(
        `https://thumbnails.roblox.com/v1/assets?assetIds=${assetId}&returnPolicy=PlaceHolder&size=420x420&format=Png`,
      );
      if (!res.ok) return null;

      const json = await res.json() as {
        data?: { state?: string; imageUrl?: string }[];
      };

      entry = json.data?.[0];
      if (entry?.state === 'Completed' && entry.imageUrl) break;

      // Terminal error states — don't bother retrying.
      if (entry?.state === 'Blocked' || entry?.state === 'Error' || entry?.state === 'TemporarilyUnavailable') {
        return null;
      }

      if (attempt < maxAttempts - 1) {
        await new Promise((r) => setTimeout(r, delayMs));
      }
    }

    if (!entry?.imageUrl || entry.state !== 'Completed') return null;

    // The CDN URL embeds the size (e.g. /420/420/). Replace with 1024 for max quality.
    const hiResUrl = entry.imageUrl.replace(/\/\d+\/\d+\//, '/1024/1024/');

    const imageRes = await fetch(hiResUrl, { redirect: 'follow' });
    if (!imageRes.ok) {
      // Fall back to the original 420 URL if 1024 fails
      const fallbackRes = await fetch(entry.imageUrl, { redirect: 'follow' });
      if (!fallbackRes.ok) return null;
      return imageResponse(fallbackRes);
    }

    return imageResponse(imageRes);
  } catch {
    return null;
  }
}

/** Legacy decal assets: asset delivery returns XML with a <url> to the real image. */
async function tryAssetDelivery(assetId: string): Promise<NextResponse | null> {
  try {
    const res = await fetch(
      `https://assetdelivery.roblox.com/v1/asset/?id=${assetId}`,
      { redirect: 'follow' },
    );
    if (!res.ok) return null;

    const ct = res.headers.get('content-type') ?? '';

    // If the response is already an image, return it directly
    if (ct.startsWith('image/')) {
      return imageResponse(res);
    }

    // Parse XML to extract the actual CDN image URL
    const xml = await res.text();
    const imageUrl = extractImageUrl(xml);
    if (!imageUrl) return null;

    const imageRes = await fetch(imageUrl, { redirect: 'follow' });
    if (!imageRes.ok) return null;

    return imageResponse(imageRes);
  } catch {
    return null;
  }
}

/** Wrap a fetch Response as a NextResponse with correct image headers. */
async function imageResponse(res: Response): Promise<NextResponse> {
  const ct = res.headers.get('content-type') ?? 'image/png';
  const buffer = await res.arrayBuffer();
  return new NextResponse(buffer, {
    status: 200,
    headers: {
      'Content-Type': ct.startsWith('image/') ? ct : 'image/png',
      'Cache-Control': 'public, max-age=3600',
    },
  });
}

/** Extract image URL from Roblox decal XML descriptor. */
function extractImageUrl(xml: string): string | null {
  const urlMatch = xml.match(/<url>([^<]+)<\/url>/i);
  if (urlMatch?.[1]) {
    const url = urlMatch[1].trim();
    if (url.startsWith('http')) return url;
    const idMatch = url.match(/(\d+)/);
    if (idMatch) return `https://assetdelivery.roblox.com/v1/asset/?id=${idMatch[1]}`;
  }
  return null;
}
