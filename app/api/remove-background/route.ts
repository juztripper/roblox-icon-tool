import { NextRequest, NextResponse } from 'next/server';

export const runtime = 'nodejs';
// Allow up to 45 s on Vercel Pro; free tier caps at 10 s.
export const maxDuration = 45;

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const imageEntry = formData.get('image');
    const imageFile = imageEntry instanceof Blob ? imageEntry : null;

    if (!imageFile) {
      return NextResponse.json({ error: 'Missing image field' }, { status: 400 });
    }

    // Server-side background removal — no webpack/WASM browser issues.
    // Pass the Blob directly (not a Buffer) so the package can read blob.type
    // for image format detection. Converting to Buffer loses the MIME type and
    // causes "Unsupported format: " errors inside imageDecode.
    const { removeBackground } = await import('@imgly/background-removal-node');

    const resultBlob: Blob = await removeBackground(imageFile, {
      model: 'medium',
      output: { format: 'image/png' },
    });

    const resultBuffer = Buffer.from(await resultBlob.arrayBuffer());
    return new NextResponse(resultBuffer, {
      status: 200,
      headers: {
        'Content-Type': 'image/png',
        'Content-Length': String(resultBuffer.byteLength),
      },
    });
  } catch (err: unknown) {
    console.error('[remove-background] Error:', err);
    const msg = err instanceof Error ? err.message : 'Background removal failed';
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
