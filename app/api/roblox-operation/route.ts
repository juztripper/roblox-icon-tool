import { NextRequest, NextResponse } from 'next/server';
import { pollOperation } from '@/lib/robloxOperation';

export const maxDuration = 20;

// Follow-up check for uploads that were still processing when /api/roblox-upload returned.
export async function POST(request: NextRequest) {
  try {
    const { apiKey, operationPath } = (await request.json()) as { apiKey?: string; operationPath?: string };
    if (!apiKey || !operationPath || !/^operations\/[\w-]+$/.test(operationPath)) {
      return NextResponse.json({ error: 'Missing or invalid apiKey / operationPath' }, { status: 400 });
    }
    const assetId = await pollOperation(operationPath, apiKey, 8);
    if (assetId) return NextResponse.json({ success: true, assetId });
    return NextResponse.json({ pending: true, error: 'Still processing on Roblox' }, { status: 202 });
  } catch (err) {
    console.error('[roblox-operation] Error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
