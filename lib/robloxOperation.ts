/**
 * Poll a Roblox Open Cloud long-running asset operation until it finishes.
 * Returns the asset ID, or null if it is still processing after `maxAttempts`.
 */
export async function pollOperation(
  operationPath: string,
  apiKey: string,
  maxAttempts = 12,
  delayMs = 1500,
): Promise<string | null> {
  for (let i = 0; i < maxAttempts; i++) {
    await new Promise((r) => setTimeout(r, delayMs));

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
