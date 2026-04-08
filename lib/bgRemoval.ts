// `import type` is erased at compile time — webpack never sees it.
// The actual module is fetched from CDN at runtime (webpackIgnore below),
// which avoids Next.js trying to bundle .wasm files it can't resolve.
import type * as Transformers from '@huggingface/transformers';

const TRANSFORMERS_CDN = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3/+esm';

// RMBG-2.0 is gated (requires HF auth). RMBG-1.4 is Apache 2.0, open access,
// and uses the same API — still a significant upgrade over IS-Net.
const MODEL_ID = 'briaai/RMBG-1.4';

let transformersPromise: Promise<typeof Transformers> | null = null;

function getTransformers(): Promise<typeof Transformers> {
  if (!transformersPromise) {
    transformersPromise = import(
      /* webpackIgnore: true */
      // eslint-disable-next-line @typescript-eslint/ban-ts-comment
      // @ts-ignore — dynamic CDN URL, types provided by the import type above
      TRANSFORMERS_CDN
    ) as unknown as Promise<typeof Transformers>;
  }
  return transformersPromise;
}

type LoadedResources = {
  model: Transformers.PreTrainedModel;
  processor: Transformers.Processor;
};

let resourcesPromise: Promise<LoadedResources> | null = null;

function loadResources(): Promise<LoadedResources> {
  if (!resourcesPromise) {
    resourcesPromise = (async () => {
      const { AutoModel, AutoProcessor, env } = await getTransformers();

      env.allowLocalModels = false;
      // Run WASM inference in a background worker to keep the UI responsive.
      if (env.backends.onnx.wasm) env.backends.onnx.wasm.proxy = true;

      // Processor is small — kick it off while the model downloads.
      const processorPromise = AutoProcessor.from_pretrained(MODEL_ID);

      // Prefer WebGPU; fall back to WASM for browsers without it.
      let model: Transformers.PreTrainedModel;
      try {
        model = await AutoModel.from_pretrained(MODEL_ID, { device: 'webgpu' });
      } catch {
        model = await AutoModel.from_pretrained(MODEL_ID, { device: 'wasm' });
      }

      const processor = await processorPromise;
      return { model, processor };
    })();
  }
  return resourcesPromise;
}

export async function removeBackground(inputBlob: Blob): Promise<Blob> {
  const { RawImage } = await getTransformers();
  const { model, processor } = await loadResources();

  const blobUrl = URL.createObjectURL(inputBlob);
  let image: Transformers.RawImage;
  try {
    image = await RawImage.fromURL(blobUrl);
  } finally {
    URL.revokeObjectURL(blobUrl);
  }

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { pixel_values } = (await processor(image)) as any;
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  const { output } = (await model({ input: pixel_values })) as any;

  // output[0]: Tensor [1, 1, H, W] → scale to uint8, resize to original dimensions.
  const mask: Transformers.RawImage = await RawImage.fromTensor(
    output[0].mul(255).to('uint8'),
  ).resize(image.width, image.height);

  // Apply mask as the alpha channel of the original image.
  const canvas = document.createElement('canvas');
  canvas.width = image.width;
  canvas.height = image.height;
  const ctx = canvas.getContext('2d')!;

  const img = new window.Image();
  const srcUrl = URL.createObjectURL(inputBlob);
  await new Promise<void>((resolve, reject) => {
    img.onload = () => resolve();
    img.onerror = () => reject(new Error('Failed to load source image onto canvas'));
    img.src = srcUrl;
  });
  URL.revokeObjectURL(srcUrl);
  ctx.drawImage(img, 0, 0);

  const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
  const maskData = mask.data as Uint8Array;
  for (let i = 0; i < maskData.length; i++) {
    imageData.data[4 * i + 3] = maskData[i];
  }
  bleedAlpha(imageData);
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
}

/**
 * Alpha bleeding — fills transparent pixels bordering opaque ones with the
 * averaged colour of their opaque neighbours (alpha stays 0).
 * Prevents dark/bright fringing when Roblox (or any renderer) samples the
 * texture at mip-map boundaries.
 *
 * Algorithm: https://github.com/urraka/alpha-bleeding
 */
function bleedAlpha(imageData: ImageData): void {
  const { data, width, height } = imageData;

  // opaque[y][x]: -1 = fully opaque source pixel, 0xFE/0x7F/… = bled pixel,
  // 0 = not yet processed transparent pixel.
  const opaque = new Int32Array(width * height); // flat row-major
  const loose  = new Uint8Array(width * height); // boolean flat array

  const offsets = [-1, -1, 0, -1, 1, -1, -1, 0, 1, 0, -1, 1, 0, 1, 1, 1];

  let pending: { x: number; y: number }[] = [];

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      const a = data[(y * width + x) * 4 + 3];
      if (a === 0) {
        let isLoose = true;
        for (let k = 0; k < 16; k += 2) {
          const nx = x + offsets[k];
          const ny = y + offsets[k + 1];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (data[(ny * width + nx) * 4 + 3] !== 0) {
              isLoose = false;
              break;
            }
          }
        }
        if (!isLoose) {
          pending.push({ x, y });
        } else {
          loose[y * width + x] = 1;
        }
      } else {
        opaque[y * width + x] = -1;
      }
    }
  }

  while (pending.length > 0) {
    const pendingNext: { x: number; y: number }[] = [];

    for (const { x, y } of pending) {
      let r = 0, g = 0, b = 0, count = 0;

      for (let k = 0; k < 16; k += 2) {
        const nx = x + offsets[k];
        const ny = y + offsets[k + 1];
        if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
          if (opaque[ny * width + nx] & 1) {
            const idx = (ny * width + nx) * 4;
            r += data[idx];
            g += data[idx + 1];
            b += data[idx + 2];
            count++;
          }
        }
      }

      if (count > 0) {
        const idx = (y * width + x) * 4;
        data[idx]     = r / count;
        data[idx + 1] = g / count;
        data[idx + 2] = b / count;
        // alpha stays 0 — this is colour-only bleeding

        opaque[y * width + x] = 0xfe;

        for (let k = 0; k < 16; k += 2) {
          const nx = x + offsets[k];
          const ny = y + offsets[k + 1];
          if (nx >= 0 && nx < width && ny >= 0 && ny < height) {
            if (loose[ny * width + nx]) {
              pendingNext.push({ x: nx, y: ny });
              loose[ny * width + nx] = 0;
            }
          }
        }
      } else {
        pendingNext.push({ x, y });
      }
    }

    if (pendingNext.length > 0) {
      for (const { x, y } of pending) {
        opaque[y * width + x] >>= 1;
      }
    }

    pending = pendingNext;
  }
}
