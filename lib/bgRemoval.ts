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
  ctx.putImageData(imageData, 0, 0);

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('canvas.toBlob returned null'))),
      'image/png',
    );
  });
}
