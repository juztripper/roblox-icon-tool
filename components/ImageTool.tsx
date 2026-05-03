'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './ImageTool.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type Format = 'png' | 'jpeg' | 'webp';
type CreatorType = 'user' | 'group';
type BgStatus = 'idle' | 'processing' | 'done' | 'error';
type PubStatus = 'idle' | 'queued' | 'publishing' | 'done' | 'error';
type NameStatus = 'idle' | 'loading' | 'done' | 'error';
type ToastKind = 'ok' | 'err' | 'info';
type TouchToolMode = 'erase' | 'restore';
type ActiveTab = 'tool' | 'library' | 'drafts';
type BgActionType = 'one' | 'all';
const RBLX_SETTINGS_STORAGE_KEY = 'pixel_forge_publish_settings_v1';
const RBLX_PRESETS_STORAGE_KEY = 'pixel_forge_publish_presets_v1';
const RBLX_LIBRARY_STORAGE_KEY = 'pixel_forge_image_library_v1';
const DRAFTS_STORAGE_KEY = 'pixel_forge_drafts_v1';
const BG_MODEL_NOTICE_ACK_KEY = 'pixel_forge_bg_model_notice_ack_v1';
const BG_MODEL_ESTIMATED_SIZE = '~170MB';
const APP_VERSION = '4.2';
const LAST_SEEN_VERSION_KEY = 'pixel_forge_last_seen_version';
const THEME_STORAGE_KEY = 'pixel_forge_accent_theme_v1';
const COLOR_MODE_STORAGE_KEY = 'pixel_forge_color_mode_v1';

type ColorMode = 'system' | 'dark' | 'light';

interface AccentTheme {
  id: string;
  label: string;
  base: string;
  dim: string;
  hover: string;
  light: string;
  glow: string;
  glowStrong: string;
}

const ACCENT_THEMES: AccentTheme[] = [
  {
    id: 'orange',
    label: 'Forge',
    base: '#ff5a1f',
    dim: '#c44416',
    hover: '#ff6e3a',
    light: '#ff7b50',
    glow: 'rgba(255, 90, 31, 0.15)',
    glowStrong: 'rgba(255, 90, 31, 0.3)',
  },
  {
    id: 'pink',
    label: 'Adopt',
    base: '#ff4aa3',
    dim: '#c43778',
    hover: '#ff63b4',
    light: '#ff80c2',
    glow: 'rgba(255, 74, 163, 0.15)',
    glowStrong: 'rgba(255, 74, 163, 0.3)',
  },
  {
    id: 'purple',
    label: 'Nova',
    base: '#a855f7',
    dim: '#7e3fbd',
    hover: '#b36bff',
    light: '#c587ff',
    glow: 'rgba(168, 85, 247, 0.15)',
    glowStrong: 'rgba(168, 85, 247, 0.3)',
  },
  {
    id: 'blue',
    label: 'Cobalt',
    base: '#4488ff',
    dim: '#2a66cc',
    hover: '#5e9aff',
    light: '#7aaeff',
    glow: 'rgba(68, 136, 255, 0.15)',
    glowStrong: 'rgba(68, 136, 255, 0.3)',
  },
  {
    id: 'green',
    label: 'Slime',
    base: '#00c853',
    dim: '#009640',
    hover: '#1fd96a',
    light: '#4de88a',
    glow: 'rgba(0, 200, 83, 0.15)',
    glowStrong: 'rgba(0, 200, 83, 0.3)',
  },
  {
    id: 'yellow',
    label: 'Honey',
    base: '#fbbf24',
    dim: '#c89612',
    hover: '#fccb4a',
    light: '#fdd775',
    glow: 'rgba(251, 191, 36, 0.15)',
    glowStrong: 'rgba(251, 191, 36, 0.3)',
  },
];

function applyAccentTheme(theme: AccentTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--orange', theme.base);
  root.style.setProperty('--orange-dim', theme.dim);
  root.style.setProperty('--orange-hover', theme.hover);
  root.style.setProperty('--orange-light', theme.light);
  root.style.setProperty('--orange-glow', theme.glow);
  root.style.setProperty('--orange-glow-strong', theme.glowStrong);
}

function resolveColorMode(mode: ColorMode): 'dark' | 'light' {
  if (mode === 'system') {
    if (typeof window === 'undefined' || !window.matchMedia) return 'dark';
    return window.matchMedia('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
  }
  return mode;
}

function applyColorMode(mode: ColorMode) {
  if (typeof document === 'undefined') return;
  const resolved = resolveColorMode(mode);
  document.documentElement.setAttribute('data-theme', resolved);
}

interface ChangelogEntry {
  version: string;
  date: string;
  title: string;
  features?: string[];
  fixes?: string[];
  improvements?: string[];
}

const CHANGELOG: ChangelogEntry[] = [
  {
    version: '4.2',
    date: 'Apr 22, 2026',
    title: 'Light Mode & Appearance Toggle',
    features: [
      'Light mode support — every panel, control, and checker background has a matching light palette',
      'Appearance toggle inside the theme modal with System, Dark, and Light options',
      'System mode follows your OS preference and updates live when you switch your device theme',
    ],
    improvements: [
      'Selected appearance persists across sessions via localStorage alongside the accent color',
      'Hardcoded panel and overlay shades refactored into theme-aware CSS variables',
    ],
  },
  {
    version: '4.1',
    date: 'Apr 22, 2026',
    title: 'Theme Picker, Dimensions Display & Import Fixes',
    features: [
      'Accent theme picker in the header — choose between Forge, Adopt, Nova, Cobalt, Slime, and Honey presets',
      'Original image dimensions now show on the preview bar for every imported or uploaded image',
      'Apply-to-all dimensions button copies the selected image’s width, height, and aspect lock to every image in the queue',
    ],
    fixes: [
      'Roblox asset import no longer fails on the first attempt — the fetch route now polls the Thumbnails API while Roblox generates the image server-side',
    ],
    improvements: [
      'Theme choice persists across sessions via localStorage',
      'Hardcoded accent shades refactored into CSS variables so theme switches update every accented element',
    ],
  },
  {
    version: '4.0',
    date: 'Apr 12, 2026',
    title: 'Drafts Gallery & Per-Image Settings',
    features: [
      'Drafts gallery — save work-in-progress images for later, persisted across sessions',
      'Per-image export settings — each image has independent dimensions, format, quality, and brightness',
    ],
    improvements: [
      'Save Draft button in the preview bar for quick, non-intrusive access',
      'Drafts tab with grid view, load/delete actions, and export settings summary',
      'Loading a draft restores both original and processed image data with saved settings',
    ],
  },
  {
    version: '3.0',
    date: 'Apr 12, 2026',
    title: 'Roblox Import & WYSIWYG Preview',
    features: [
      'Import images from Roblox by asset ID or rbxassetid:// URL',
      'Re-edit published images from the library back into the editor',
      'Download full-resolution images from the library',
      'WYSIWYG export preview — preview now shows actual export quality and dimensions',
    ],
    improvements: [
      'Library images cached locally via IndexedDB for instant access',
      'Higher quality library thumbnails (200px, up from 80px)',
      'Small exports render with crisp pixelated scaling in previews',
    ],
  },
  {
    version: '2.0',
    date: 'Apr 8, 2026',
    title: 'Touch-Up, AI Naming & Library',
    features: [
      'Touch-up brush editor with erase/restore tools',
      'Smart refine brush with flood-fill color matching',
      'AI-powered auto-naming via vision model',
      'Image library — published assets saved with thumbnails and IDs',
      'Publish presets for quick API key / creator switching',
      'Single-image publish (alongside batch)',
      'Brightness adjustment slider',
    ],
    improvements: [
      'Switched to RMBG-1.4 (client-side, no server needed)',
      'Alpha bleeding to fix dark edge fringing on Roblox textures',
      'Undo/redo support in touch-up editor (Ctrl+Z / Ctrl+Shift+Z)',
      'Zoom and pan in preview and touch-up canvases',
    ],
    fixes: [
      'Fixed transformers runtime/version mismatch',
      'Fixed retry behavior for model loading',
    ],
  },
  {
    version: '1.0',
    date: 'Apr 6, 2026',
    title: 'Initial Release',
    features: [
      'Multi-image queue with drag-and-drop and paste support',
      'Background removal powered by browser AI',
      'Batch publish to Roblox via Open Cloud API',
      'Export with custom dimensions, format (PNG/JPEG/WebP), and quality',
      'Batch download all processed images',
      'Copy asset IDs to clipboard',
    ],
  },
];

interface CachedImage {
  id: string;
  previewDataUrl: string;
  assetId: string;
  name: string;
  publishedAt: number;
}

interface DraftImage {
  id: string;
  name: string;
  previewDataUrl: string;
  savedAt: number;
  exportSettings: {
    tw: number; th: number;
    format: Format; quality: number; brightness: number;
  };
  hasBgRemoved: boolean;
}

interface ExportSettings {
  tw: number;
  th: number;
  format: Format;
  quality: number;
  brightness: number;
  locked: boolean;
}

interface ImageItem {
  id: string;
  originalBlob: Blob;
  processedBlob: Blob | null;
  previewUrl: string;
  fileName: string;
  originalFileName: string;
  nameStatus: NameStatus;
  dims: { w: number; h: number } | null;
  cropRect?: { x: number; y: number; w: number; h: number } | null;
  bgStatus: BgStatus;
  bgError?: string;
  pubStatus: PubStatus;
  pubAssetId?: string;
  pubError?: string;
  exportSettings: ExportSettings;
}

interface ToastState {
  msg: string;
  kind: ToastKind;
}

interface PublishPreset {
  id: string;
  name: string;
  apiKey: string;
  creatorType: CreatorType;
  creatorId: string;
}

const DEFAULT_EXPORT_SETTINGS: ExportSettings = {
  tw: 512, th: 512, format: 'png', quality: 90, brightness: 100, locked: true,
};

// ── Utilities ─────────────────────────────────────────────────────────────────

function uid(): string {
  return Math.random().toString(36).slice(2);
}

function fmtBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1_048_576) return `${(n / 1024).toFixed(1)}KB`;
  return `${(n / 1_048_576).toFixed(1)}MB`;
}

function imgDims(blob: Blob): Promise<{ w: number; h: number }> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      res({ w: img.naturalWidth, h: img.naturalHeight });
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      rej(new Error('Cannot read image dimensions'));
    };
    img.src = url;
  });
}

function canvasExport(
  source: Blob,
  w: number,
  h: number,
  fmt: Format,
  quality: number,
  brightness: number = 100,
  stretch: boolean = false,
): Promise<Blob> {
  return new Promise((res, rej) => {
    const img = new Image();
    const url = URL.createObjectURL(source);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = w;
      canvas.height = h;
      const ctx = canvas.getContext('2d');
      if (!ctx) { rej(new Error('Canvas 2D context unavailable')); return; }
      ctx.imageSmoothingEnabled = true;
      ctx.imageSmoothingQuality = 'high';
      const srcW = img.naturalWidth;
      const srcH = img.naturalHeight;
      if (!srcW || !srcH) {
        rej(new Error('Image has invalid dimensions'));
        return;
      }
      let dx: number;
      let dy: number;
      let dw: number;
      let dh: number;
      if (stretch) {
        dx = 0;
        dy = 0;
        dw = w;
        dh = h;
      } else {
        const scale = Math.min(w / srcW, h / srcH);
        dw = srcW * scale;
        dh = srcH * scale;
        dx = (w - dw) / 2;
        dy = (h - dh) / 2;
      }
      // JPEG has no alpha; give it a predictable background.
      if (fmt === 'jpeg') {
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, w, h);
      } else {
        ctx.clearRect(0, 0, w, h);
      }
      if (brightness !== 100) ctx.filter = `brightness(${brightness / 100})`;
      ctx.drawImage(img, dx, dy, dw, dh);
      ctx.filter = 'none';
      const mime = fmt === 'jpeg' ? 'image/jpeg' : `image/${fmt}`;
      canvas.toBlob(
        (b) => { b ? res(b) : rej(new Error('canvas.toBlob returned null')); },
        mime,
        quality / 100,
      );
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('Image load failed')); };
    img.src = url;
  });
}

function blobToImage(blob: Blob): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };
    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to decode image'));
    };
    img.src = url;
  });
}

function canvasToPngBlob(canvas: HTMLCanvasElement): Promise<Blob> {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error('Unable to encode image'));
        return;
      }
      resolve(blob);
    }, 'image/png');
  });
}

async function autoCropTransparent(source: Blob, alphaThreshold = 16): Promise<Blob> {
  // Crops fully transparent borders based on alpha channel so the subject fills the frame.
  // This prevents "empty" transparent padding from making the subject look smaller after BG removal.
  const img = await blobToImage(source);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (!srcW || !srcH) return source;

  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.clearRect(0, 0, srcW, srcH);
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imgData.data;

  let minX = srcW;
  let minY = srcH;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const a = data[(y * srcW + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  // If everything is transparent (or alpha is too strict), keep original.
  if (maxX < 0 || maxY < 0) return source;

  const pad = clamp(Math.round(Math.min(srcW, srcH) * 0.02), 1, 12);
  const sx0 = Math.max(0, minX - pad);
  const sy0 = Math.max(0, minY - pad);
  const sx1 = Math.min(srcW - 1, maxX + pad);
  const sy1 = Math.min(srcH - 1, maxY + pad);
  const cropW = sx1 - sx0 + 1;
  const cropH = sy1 - sy0 + 1;

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return source;

  cropCtx.clearRect(0, 0, cropW, cropH);
  cropCtx.drawImage(canvas, sx0, sy0, cropW, cropH, 0, 0, cropW, cropH);
  return canvasToPngBlob(cropCanvas);
}

async function autoCropTransparentWithRect(
  source: Blob,
  alphaThreshold = 16,
): Promise<{ blob: Blob; rect: { x: number; y: number; w: number; h: number } | null }> {
  const img = await blobToImage(source);
  const srcW = img.naturalWidth;
  const srcH = img.naturalHeight;
  if (!srcW || !srcH) return { blob: source, rect: null };

  const canvas = document.createElement('canvas');
  canvas.width = srcW;
  canvas.height = srcH;
  const ctx = canvas.getContext('2d');
  if (!ctx) return { blob: source, rect: null };

  ctx.clearRect(0, 0, srcW, srcH);
  ctx.drawImage(img, 0, 0);

  const imgData = ctx.getImageData(0, 0, srcW, srcH);
  const data = imgData.data;

  let minX = srcW;
  let minY = srcH;
  let maxX = -1;
  let maxY = -1;

  for (let y = 0; y < srcH; y++) {
    for (let x = 0; x < srcW; x++) {
      const a = data[(y * srcW + x) * 4 + 3];
      if (a > alphaThreshold) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }
  }

  if (maxX < 0 || maxY < 0) return { blob: source, rect: null };

  const pad = clamp(Math.round(Math.min(srcW, srcH) * 0.02), 1, 12);
  const sx0 = Math.max(0, minX - pad);
  const sy0 = Math.max(0, minY - pad);
  const sx1 = Math.min(srcW - 1, maxX + pad);
  const sy1 = Math.min(srcH - 1, maxY + pad);
  const cropW = sx1 - sx0 + 1;
  const cropH = sy1 - sy0 + 1;

  if (cropW === srcW && cropH === srcH && sx0 === 0 && sy0 === 0) {
    return { blob: source, rect: null };
  }

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = cropW;
  cropCanvas.height = cropH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return { blob: source, rect: null };

  cropCtx.clearRect(0, 0, cropW, cropH);
  cropCtx.drawImage(canvas, sx0, sy0, cropW, cropH, 0, 0, cropW, cropH);
  const blob = await canvasToPngBlob(cropCanvas);
  return { blob, rect: { x: sx0, y: sy0, w: cropW, h: cropH } };
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function splitNameAndExt(fileName: string): { base: string; ext: string } {
  const idx = fileName.lastIndexOf('.');
  if (idx <= 0 || idx === fileName.length - 1) {
    return { base: fileName, ext: '' };
  }
  return {
    base: fileName.slice(0, idx),
    ext: fileName.slice(idx),
  };
}

function ensureUniqueFileName(candidate: string, existing: string[]): string {
  if (!existing.includes(candidate)) return candidate;
  const { base, ext } = splitNameAndExt(candidate);
  let n = 2;
  let next = `${base}_${n}${ext}`;
  while (existing.includes(next)) {
    n += 1;
    next = `${base}_${n}${ext}`;
  }
  return next;
}

function displayNameForItem(item: ImageItem): string {
  if (item.nameStatus === 'loading') return item.originalFileName;
  return item.fileName;
}

function nameClassForItem(item: ImageItem): string {
  return item.nameStatus === 'loading' ? styles.ghostName : '';
}

async function defringeAlpha(source: Blob): Promise<Blob> {
  // Replace the RGB of every non-fully-opaque pixel with the average color of its
  // fully-opaque neighbors. This eliminates the dark "halo" that appears at edges
  // when a background-removed image is scaled down, because the transparent pixels
  // will carry the subject's color instead of the original dark background color.
  const img = await blobToImage(source);
  const w = img.naturalWidth;
  const h = img.naturalHeight;
  if (!w || !h) return source;

  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;

  ctx.drawImage(img, 0, 0);
  const src = ctx.getImageData(0, 0, w, h);
  const d = src.data;
  const out = new Uint8ClampedArray(d);

  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      if (d[i + 3] === 255) continue; // fully opaque — nothing to fix

      let rSum = 0, gSum = 0, bSum = 0, wSum = 0;
      for (let dy = -2; dy <= 2; dy++) {
        for (let dx = -2; dx <= 2; dx++) {
          const nx = x + dx;
          const ny = y + dy;
          if (nx < 0 || ny < 0 || nx >= w || ny >= h) continue;
          const ni = (ny * w + nx) * 4;
          if (d[ni + 3] === 255) {
            rSum += d[ni]; gSum += d[ni + 1]; bSum += d[ni + 2];
            wSum++;
          }
        }
      }

      if (wSum > 0) {
        out[i]     = Math.round(rSum / wSum);
        out[i + 1] = Math.round(gSum / wSum);
        out[i + 2] = Math.round(bSum / wSum);
        // alpha is intentionally unchanged
      }
    }
  }

  ctx.putImageData(new ImageData(out, w, h), 0, 0);
  return canvasToPngBlob(canvas);
}

function blobToThumbnailDataUrl(blob: Blob, size = 80): Promise<string> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(blob);
    img.onload = () => {
      URL.revokeObjectURL(url);
      const canvas = document.createElement('canvas');
      canvas.width = size;
      canvas.height = size;
      const ctx = canvas.getContext('2d');
      if (!ctx) { reject(new Error('No canvas context')); return; }
      // Disable smoothing so small images upscale with crisp pixels
      ctx.imageSmoothingEnabled = false;
      const scale = Math.min(size / img.naturalWidth, size / img.naturalHeight);
      const dw = img.naturalWidth * scale;
      const dh = img.naturalHeight * scale;
      const dx = (size - dw) / 2;
      const dy = (size - dh) / 2;
      ctx.clearRect(0, 0, size, size);
      ctx.drawImage(img, dx, dy, dw, dh);
      resolve(canvas.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); reject(new Error('Image load failed')); };
    img.src = url;
  });
}

// ── IndexedDB blob cache (for library images) ───────────────────────────────

const IDB_NAME = 'pixel_forge_blobs';
const IDB_STORE = 'library_images';
const IDB_DRAFT_STORE = 'draft_images';

function openBlobDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(IDB_NAME, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(IDB_STORE)) db.createObjectStore(IDB_STORE);
      if (!db.objectStoreNames.contains(IDB_DRAFT_STORE)) db.createObjectStore(IDB_DRAFT_STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function saveBlobToIdb(assetId: string, blob: Blob): Promise<void> {
  try {
    const db = await openBlobDb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).put(blob, assetId);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* best-effort */ }
}

async function loadBlobFromIdb(assetId: string): Promise<Blob | null> {
  try {
    const db = await openBlobDb();
    const tx = db.transaction(IDB_STORE, 'readonly');
    const req = tx.objectStore(IDB_STORE).get(assetId);
    const result = await new Promise<Blob | null>((res, rej) => {
      req.onsuccess = () => res(req.result instanceof Blob ? req.result : null);
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch { return null; }
}

async function deleteBlobFromIdb(assetId: string): Promise<void> {
  try {
    const db = await openBlobDb();
    const tx = db.transaction(IDB_STORE, 'readwrite');
    tx.objectStore(IDB_STORE).delete(assetId);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* best-effort */ }
}

// ── Draft blob helpers ────────────────────────────────────────────────────────

async function saveDraftBlobsToIdb(draftId: string, original: Blob, processed: Blob | null): Promise<void> {
  try {
    const db = await openBlobDb();
    const tx = db.transaction(IDB_DRAFT_STORE, 'readwrite');
    tx.objectStore(IDB_DRAFT_STORE).put({ original, processed }, draftId);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* best-effort */ }
}

async function loadDraftBlobsFromIdb(draftId: string): Promise<{ original: Blob; processed: Blob | null } | null> {
  try {
    const db = await openBlobDb();
    const tx = db.transaction(IDB_DRAFT_STORE, 'readonly');
    const req = tx.objectStore(IDB_DRAFT_STORE).get(draftId);
    const result = await new Promise<{ original: Blob; processed: Blob | null } | null>((res, rej) => {
      req.onsuccess = () => {
        const val = req.result;
        if (val && val.original instanceof Blob) {
          res({ original: val.original, processed: val.processed instanceof Blob ? val.processed : null });
        } else { res(null); }
      };
      req.onerror = () => rej(req.error);
    });
    db.close();
    return result;
  } catch { return null; }
}

async function deleteDraftBlobsFromIdb(draftId: string): Promise<void> {
  try {
    const db = await openBlobDb();
    const tx = db.transaction(IDB_DRAFT_STORE, 'readwrite');
    tx.objectStore(IDB_DRAFT_STORE).delete(draftId);
    await new Promise<void>((res, rej) => { tx.oncomplete = () => res(); tx.onerror = () => rej(tx.error); });
    db.close();
  } catch { /* best-effort */ }
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageTool() {
  // Queue state
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // BG removal
  const [bgBusy, setBgBusy] = useState(false);
  const [bgBatchInfo, setBgBatchInfo] = useState<{ current: number; total: number } | null>(null);
  const [touchUpOpen, setTouchUpOpen] = useState(false);
  const [touchUpBusy, setTouchUpBusy] = useState(false);
  const [touchToolMode, setTouchToolMode] = useState<TouchToolMode>('erase');
  const [brushSize, setBrushSize] = useState(24);
  const [smartRefine, setSmartRefine] = useState(true);
  const [smartTolerance, setSmartTolerance] = useState(42);
  const [spaceDown, setSpaceDown] = useState(false);
  const [brushPreview, setBrushPreview] = useState<{ x: number; y: number; visible: boolean }>({
    x: 0,
    y: 0,
    visible: false,
  });
  const [viewZoom, setViewZoom] = useState(1);
  const [viewPanX, setViewPanX] = useState(0);
  const [viewPanY, setViewPanY] = useState(0);
  const [viewSize, setViewSize] = useState<{ w: number; h: number }>({ w: 0, h: 0 });
  const [previewDims, setPreviewDims] = useState<{ w: number; h: number } | null>(null);

  // Export-resolution preview
  const [exportPreviewUrl, setExportPreviewUrl] = useState<string | null>(null);

  // Single-item BG progress (fake ticker)
  const [bgPct, setBgPct] = useState(0);

  // Roblox publish
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [creatorType, setCreatorType] = useState<CreatorType>('user');
  const [creatorId, setCreatorId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);
  const [publishDialogOpen, setPublishDialogOpen] = useState(false);
  const [publishDialogMounted, setPublishDialogMounted] = useState(false);
  const [publishDialogVisible, setPublishDialogVisible] = useState(false);
  const [bgNoticeDialogOpen, setBgNoticeDialogOpen] = useState(false);
  const [bgNoticeAction, setBgNoticeAction] = useState<BgActionType | null>(null);
  const [presetName, setPresetName] = useState('');
  const [presets, setPresets] = useState<PublishPreset[]>([]);
  const [selectedPresetId, setSelectedPresetId] = useState('');
  const [storageHydrated, setStorageHydrated] = useState(false);
  const [imageLibrary, setImageLibrary] = useState<CachedImage[]>([]);
  const [drafts, setDrafts] = useState<DraftImage[]>([]);
  const [activeTab, setActiveTab] = useState<ActiveTab>('tool');

  // Import from Roblox
  const [importAssetInput, setImportAssetInput] = useState('');
  const [importBusy, setImportBusy] = useState(false);

  // Changelog
  const [changelogOpen, setChangelogOpen] = useState(false);

  // Accent theme
  const [accentThemeId, setAccentThemeId] = useState<string>(ACCENT_THEMES[0].id);
  const [themePickerOpen, setThemePickerOpen] = useState(false);
  const [colorMode, setColorMode] = useState<ColorMode>('system');

  // Mobile drawers (toggled via FABs; controlled by CSS @media rules to no-op on desktop)
  const [mobileQueueOpen, setMobileQueueOpen] = useState(false);
  const [mobileControlsOpen, setMobileControlsOpen] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const publishDialogTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const touchCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchViewportRef = useRef<HTMLDivElement | null>(null);
  const touchActiveRef = useRef(false);
  const touchOriginalRef = useRef<HTMLImageElement | null>(null);
  const touchOriginalDataRef = useRef<ImageData | null>(null);
  const touchPanRef = useRef<{ active: boolean; x: number; y: number }>({ active: false, x: 0, y: 0 });
  const touchUndoRef = useRef<ImageData[]>([]);
  const touchRedoRef = useRef<ImageData[]>([]);
  const touchUpOpenRef = useRef(false);

  // Ref that always reflects current items (for cleanup without stale closures)
  const itemsRef = useRef<ImageItem[]>(items);
  useEffect(() => { itemsRef.current = items; }, [items]);

  // Cleanup all object URLs on unmount
  useEffect(() => {
    return () => {
      for (const item of itemsRef.current) {
        URL.revokeObjectURL(item.previewUrl);
      }
    };
  }, []);

  useEffect(() => {
    setTouchUpOpen(false);
    touchOriginalRef.current = null;
    touchOriginalDataRef.current = null;
    touchActiveRef.current = false;
    touchPanRef.current.active = false;
    setViewZoom(1);
    setViewPanX(0);
    setViewPanY(0);
    touchUndoRef.current = [];
    touchRedoRef.current = [];
    setBrushPreview({ x: 0, y: 0, visible: false });
  }, [selectedId]);

  // Close mobile drawers when switching tabs or selecting an image so the preview is unobstructed.
  useEffect(() => {
    setMobileQueueOpen(false);
    setMobileControlsOpen(false);
  }, [activeTab]);

  useEffect(() => {
    if (selectedId) setMobileQueueOpen(false);
  }, [selectedId]);

  useEffect(() => {
    touchUpOpenRef.current = touchUpOpen;
  }, [touchUpOpen]);

  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(true);
      const target = e.target as HTMLElement | null;
      if (
        target &&
        (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable)
      ) {
        return;
      }
      if (!touchUpOpenRef.current || !e.ctrlKey || e.altKey || e.key.toLowerCase() !== 'z') return;
      const canvas = touchCanvasRef.current;
      if (!canvas) return;
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      e.preventDefault();
      const current = ctx.getImageData(0, 0, canvas.width, canvas.height);
      if (e.shiftKey) {
        const next = touchRedoRef.current.pop();
        if (!next) return;
        touchUndoRef.current.push(current);
        ctx.putImageData(next, 0, 0);
        return;
      }
      const prev = touchUndoRef.current.pop();
      if (!prev) return;
      touchRedoRef.current.push(current);
      ctx.putImageData(prev, 0, 0);
    };
    const onKeyUp = (e: KeyboardEvent) => {
      if (e.code === 'Space') setSpaceDown(false);
    };
    const onBlur = () => setSpaceDown(false);
    window.addEventListener('keydown', onKeyDown);
    window.addEventListener('keyup', onKeyUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('keyup', onKeyUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  useEffect(() => {
    const el = touchViewportRef.current;
    if (!el) return;
    const applySize = () => setViewSize({ w: el.clientWidth, h: el.clientHeight });
    applySize();
    const ro = new ResizeObserver(applySize);
    ro.observe(el);
    return () => ro.disconnect();
  }, [touchUpOpen, selectedId]);

  useEffect(() => {
    let cancelled = false;
    const item = items.find((i) => i.id === selectedId) ?? null;
    if (!item) {
      setPreviewDims(null);
      return;
    }
    if (touchUpOpen) {
      // Touch-up mode uses the source image dimensions
      const currentBlob = item.processedBlob ?? item.originalBlob;
      imgDims(currentBlob)
        .then((d) => { if (!cancelled) setPreviewDims(d); })
        .catch(() => { if (!cancelled) setPreviewDims(item.dims ?? null); });
    } else {
      // Normal mode: use export dimensions so preview fits the export-resolution image
      setPreviewDims({ w: item.exportSettings.tw, h: item.exportSettings.th });
    }
    return () => { cancelled = true; };
  }, [items, selectedId, touchUpOpen]);

  useEffect(() => {
    if (!touchUpOpen || spaceDown) {
      setBrushPreview((prev) => (prev.visible ? { ...prev, visible: false } : prev));
    }
  }, [spaceDown, touchUpOpen]);

  useEffect(() => {
    return () => {
      if (publishDialogTimer.current) clearTimeout(publishDialogTimer.current);
    };
  }, []);

  useEffect(() => {
    if (publishDialogTimer.current) {
      clearTimeout(publishDialogTimer.current);
      publishDialogTimer.current = null;
    }
    if (publishDialogOpen) {
      setPublishDialogMounted(true);
      requestAnimationFrame(() => setPublishDialogVisible(true));
      return;
    }
    setPublishDialogVisible(false);
    publishDialogTimer.current = setTimeout(() => setPublishDialogMounted(false), 180);
  }, [publishDialogOpen]);

  useEffect(() => {
    try {
      const rawSettings = window.localStorage.getItem(RBLX_SETTINGS_STORAGE_KEY);
      if (rawSettings) {
        const parsed = JSON.parse(rawSettings) as Partial<{
          apiKey: string;
          creatorType: CreatorType;
          creatorId: string;
        }>;
        if (typeof parsed.apiKey === 'string') setApiKey(parsed.apiKey);
        if (parsed.creatorType === 'user' || parsed.creatorType === 'group') setCreatorType(parsed.creatorType);
        if (typeof parsed.creatorId === 'string') setCreatorId(parsed.creatorId);
      }
    } catch {
      // Ignore invalid local storage payloads.
    }

    try {
      const rawPresets = window.localStorage.getItem(RBLX_PRESETS_STORAGE_KEY);
      if (rawPresets) {
        const parsed = JSON.parse(rawPresets) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed
            .map((p) => (p as Partial<PublishPreset>))
            .filter((p): p is PublishPreset =>
              typeof p.id === 'string' &&
              typeof p.name === 'string' &&
              typeof p.apiKey === 'string' &&
              (p.creatorType === 'user' || p.creatorType === 'group') &&
              typeof p.creatorId === 'string',
            );
          setPresets(valid);
        }
      }
    } catch {
      // Ignore invalid local storage payloads.
    }

    try {
      const rawLib = window.localStorage.getItem(RBLX_LIBRARY_STORAGE_KEY);
      if (rawLib) {
        const parsed = JSON.parse(rawLib) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((e): e is CachedImage =>
            typeof (e as CachedImage).id === 'string' &&
            typeof (e as CachedImage).previewDataUrl === 'string' &&
            typeof (e as CachedImage).assetId === 'string' &&
            typeof (e as CachedImage).name === 'string' &&
            typeof (e as CachedImage).publishedAt === 'number',
          );
          setImageLibrary(valid);
        }
      }
    } catch {
      // Ignore invalid local storage payloads.
    }

    try {
      const rawDrafts = window.localStorage.getItem(DRAFTS_STORAGE_KEY);
      if (rawDrafts) {
        const parsed = JSON.parse(rawDrafts) as unknown;
        if (Array.isArray(parsed)) {
          const valid = parsed.filter((e): e is DraftImage =>
            typeof (e as DraftImage).id === 'string' &&
            typeof (e as DraftImage).previewDataUrl === 'string' &&
            typeof (e as DraftImage).name === 'string' &&
            typeof (e as DraftImage).savedAt === 'number',
          );
          setDrafts(valid);
        }
      }
    } catch {
      // Ignore invalid local storage payloads.
    }

    // Show changelog if version changed since last visit
    try {
      const lastSeen = window.localStorage.getItem(LAST_SEEN_VERSION_KEY);
      if (lastSeen !== APP_VERSION) {
        setChangelogOpen(true);
      }
    } catch { /* ignore */ }

    // Accent theme
    try {
      const stored = window.localStorage.getItem(THEME_STORAGE_KEY);
      if (stored && ACCENT_THEMES.some((t) => t.id === stored)) {
        setAccentThemeId(stored);
      }
    } catch { /* ignore */ }

    // Color mode (dark/light/system)
    try {
      const storedMode = window.localStorage.getItem(COLOR_MODE_STORAGE_KEY);
      if (storedMode === 'dark' || storedMode === 'light' || storedMode === 'system') {
        setColorMode(storedMode);
      }
    } catch { /* ignore */ }

    setStorageHydrated(true);
  }, []);

  // Apply accent theme whenever it changes
  useEffect(() => {
    const theme = ACCENT_THEMES.find((t) => t.id === accentThemeId) ?? ACCENT_THEMES[0];
    applyAccentTheme(theme);
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(THEME_STORAGE_KEY, accentThemeId);
    } catch { /* ignore */ }
  }, [accentThemeId, storageHydrated]);

  // Apply color mode and follow system changes when mode is 'system'
  useEffect(() => {
    applyColorMode(colorMode);
    if (storageHydrated) {
      try {
        window.localStorage.setItem(COLOR_MODE_STORAGE_KEY, colorMode);
      } catch { /* ignore */ }
    }
    if (colorMode !== 'system' || typeof window === 'undefined' || !window.matchMedia) return;
    const mql = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyColorMode('system');
    if (mql.addEventListener) mql.addEventListener('change', onChange);
    else mql.addListener(onChange);
    return () => {
      if (mql.removeEventListener) mql.removeEventListener('change', onChange);
      else mql.removeListener(onChange);
    };
  }, [colorMode, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(
        RBLX_SETTINGS_STORAGE_KEY,
        JSON.stringify({ apiKey, creatorType, creatorId }),
      );
    } catch {
      // Ignore localStorage write errors (private mode / quota).
    }
  }, [apiKey, creatorType, creatorId, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(RBLX_PRESETS_STORAGE_KEY, JSON.stringify(presets));
    } catch {
      // Ignore localStorage write errors (private mode / quota).
    }
  }, [presets, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(RBLX_LIBRARY_STORAGE_KEY, JSON.stringify(imageLibrary));
    } catch {
      // Ignore localStorage write errors (private mode / quota).
    }
  }, [imageLibrary, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(DRAFTS_STORAGE_KEY, JSON.stringify(drafts));
    } catch {
      // Ignore localStorage write errors (private mode / quota).
    }
  }, [drafts, storageHydrated]);

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const es = selectedItem?.exportSettings ?? DEFAULT_EXPORT_SETTINGS;
  const { tw, th, format, quality, brightness, locked } = es;
  const hasItems = items.length > 0;
  const viewBase = useMemo(() => {
    const w = previewDims?.w ?? 0;
    const h = previewDims?.h ?? 0;
    if (w <= 0 || h <= 0 || viewSize.w <= 0 || viewSize.h <= 0) {
      return { fitScale: 1, offsetX: 0, offsetY: 0, finalScale: viewZoom };
    }
    const fitScale = Math.min(viewSize.w / w, viewSize.h / h);
    const offsetX = (viewSize.w - w * fitScale) / 2;
    const offsetY = (viewSize.h - h * fitScale) / 2;
    return {
      fitScale,
      offsetX,
      offsetY,
      finalScale: fitScale * viewZoom,
    };
  }, [previewDims, viewSize.h, viewSize.w, viewZoom]);

  const brushPx = Math.max(1, Math.round(brushSize * viewBase.finalScale * 100) / 100);

  function activeBlob(item: ImageItem): Blob {
    return item.processedBlob ?? item.originalBlob;
  }

  // ── Export-resolution preview ─────────────────────────────────────────────────

  useEffect(() => {
    if (!selectedItem || touchUpOpen) {
      setExportPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
      return;
    }
    let cancelled = false;
    const src = activeBlob(selectedItem);
    const { tw: sTw, th: sTh, brightness: sBr, locked: sLocked } = selectedItem.exportSettings;
    canvasExport(src, sTw, sTh, 'png', 100, sBr, !sLocked).then((blob) => {
      if (cancelled) return;
      setExportPreviewUrl((prev) => {
        if (prev) URL.revokeObjectURL(prev);
        return URL.createObjectURL(blob);
      });
    }).catch(() => {
      if (!cancelled) setExportPreviewUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return null; });
    });
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedItem?.id, selectedItem?.processedBlob, selectedItem?.previewUrl, selectedItem?.exportSettings, touchUpOpen]);

  // ── Toast ─────────────────────────────────────────────────────────────────────

  const showToast = useCallback((msg: string, kind: ToastKind = 'info') => {
    setToast({ msg, kind });
    if (toastTimer.current) clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(null), 3000);
  }, []);

  // ── Item helpers ──────────────────────────────────────────────────────────────

  function updateItem(id: string, patch: Partial<ImageItem>) {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, ...patch } : i)));
  }

  const autoNameOne = useCallback(async (id: string, source: Blob, originalName: string) => {
    setItems((prev) => prev.map((i) => (i.id === id ? { ...i, nameStatus: 'loading' as NameStatus } : i)));
    try {
      const fd = new FormData();
      fd.append('image', source, 'source.png');
      const res = await fetch('/api/auto-name', { method: 'POST', body: fd });
      if (!res.ok) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, fileName: i.originalFileName, nameStatus: 'error' as NameStatus } : i,
          ),
        );
        return;
      }
      const data = (await res.json()) as { name?: string };
      const name = (data.name ?? '').trim();
      if (!name) {
        setItems((prev) =>
          prev.map((i) =>
            i.id === id ? { ...i, fileName: i.originalFileName, nameStatus: 'error' as NameStatus } : i,
          ),
        );
        return;
      }

      setItems((prev) => {
        const target = prev.find((i) => i.id === id);
        if (!target) return prev;

        const ext = splitNameAndExt(originalName).ext;
        const nextBase = name;
        const candidate = `${nextBase}${ext}`;
        const existing = prev.filter((i) => i.id !== id).map((i) => i.fileName);
        const unique = ensureUniqueFileName(candidate, existing);
        return prev.map((i) =>
          i.id === id ? { ...i, fileName: unique, nameStatus: 'done' as NameStatus } : i,
        );
      });
    } catch {
      setItems((prev) =>
        prev.map((i) =>
          i.id === id ? { ...i, fileName: i.originalFileName, nameStatus: 'error' as NameStatus } : i,
        ),
      );
    }
  }, []);

  // ── Add images ────────────────────────────────────────────────────────────────

  const addImages = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;

    const newItems: ImageItem[] = await Promise.all(
      arr.map(async (f) => {
        const id = uid();
        const previewUrl = URL.createObjectURL(f);
        let dims: { w: number; h: number } | null = null;
        try { dims = await imgDims(f); } catch { /* ignore */ }
        return {
          id,
          originalBlob: f,
          processedBlob: null,
          previewUrl,
          fileName: f.name,
          originalFileName: f.name,
          nameStatus: 'loading' as NameStatus,
          dims,
          bgStatus: 'idle' as BgStatus,
          pubStatus: 'idle' as PubStatus,
          exportSettings: dims
            ? { ...DEFAULT_EXPORT_SETTINGS, tw: dims.w, th: dims.h, locked: dims.w === dims.h }
            : { ...DEFAULT_EXPORT_SETTINGS },
        };
      }),
    );

    setItems((prev) => {
      const updated = [...prev, ...newItems];
      return updated;
    });

    // Auto-select the first newly added item if nothing selected
    setSelectedId((prev) => prev ?? newItems[0].id);

    // Best-effort AI naming in background.
    for (const item of newItems) {
      void autoNameOne(item.id, item.originalBlob, item.fileName);
    }
  }, [autoNameOne]);

  // ── Remove item ───────────────────────────────────────────────────────────────

  const removeItem = useCallback((id: string) => {
    setItems((prev) => {
      const item = prev.find((i) => i.id === id);
      if (item) URL.revokeObjectURL(item.previewUrl);
      const next = prev.filter((i) => i.id !== id);
      return next;
    });
    setSelectedId((prev) => {
      if (prev !== id) return prev;
      // Select a neighbour
      const idx = items.findIndex((i) => i.id === id);
      const remaining = items.filter((i) => i.id !== id);
      if (remaining.length === 0) return null;
      return remaining[Math.max(0, idx - 1)].id;
    });
  }, [items]);

  // ── File input ────────────────────────────────────────────────────────────────

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      addImages(e.target.files);
    }
    e.target.value = '';
  };

  // ── Paste ─────────────────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: ClipboardEvent) => {
      const clipItems = e.clipboardData?.items;
      if (!clipItems) return;
      const files: File[] = [];
      for (const item of clipItems) {
        if (item.type.startsWith('image/')) {
          const b = item.getAsFile();
          if (b) files.push(new File([b], `pasted.${item.type.split('/')[1] ?? 'png'}`, { type: item.type }));
        }
      }
      if (files.length > 0) {
        addImages(files);
        showToast(`${files.length} image${files.length > 1 ? 's' : ''} pasted`, 'ok');
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
  }, [addImages, showToast]);

  // ── Drag & drop ───────────────────────────────────────────────────────────────

  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDragging(true); };
  const onDragLeave = () => setIsDragging(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const files = Array.from(e.dataTransfer.files).filter((f) => f.type.startsWith('image/'));
    if (files.length > 0) addImages(files);
  };

  // ── BG Removal ────────────────────────────────────────────────────────────────

  // Internal: process one item. `standalone` controls whether it manages bgBusy/bgPct.
  const removeBgOne = useCallback(async (id: string, standalone = true) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;

    updateItem(id, { bgStatus: 'processing', bgError: undefined });
    if (standalone) { setBgBusy(true); setBgPct(0); }

    let fakeProgress = 0;
    const ticker = setInterval(() => {
      fakeProgress = Math.min(fakeProgress + 3, 90);
      setBgPct(fakeProgress);
    }, 400);

    try {
      const { removeBackground } = await import('../lib/bgRemoval');
      const res = await removeBackground(activeBlob(item));
      clearInterval(ticker);
      setBgPct(100);
      const result = res;

      // Fix alpha bleeding: replace edge pixel colors with nearest opaque neighbor color
      // so scaling doesn't produce a dark halo around the subject.
      let defringed = result;
      try { defringed = await defringeAlpha(result); } catch { /* keep original */ }

      // After BG removal, crop transparent borders so the subject fits the frame.
      // Also keeps the subject proportions stable through export.
      let processed = defringed;
      let cropRect: ImageItem['cropRect'] = null;
      try {
        const cropped = await autoCropTransparentWithRect(defringed);
        processed = cropped.blob;
        cropRect = cropped.rect;
      } catch {
        processed = defringed;
        cropRect = null;
      }

      // Revoke old preview URL and create new one
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          URL.revokeObjectURL(i.previewUrl);
          const newUrl = URL.createObjectURL(processed);
          return { ...i, processedBlob: processed, previewUrl: newUrl, bgStatus: 'done', cropRect };
        }),
      );

      if (standalone) showToast('Background removed', 'ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Background removal failed';
      updateItem(id, { bgStatus: 'error', bgError: msg });
      if (standalone) showToast(msg, 'err');
    } finally {
      clearInterval(ticker);
      if (standalone) { setBgBusy(false); setBgPct(0); }
    }
  }, [showToast]);

  const openTouchUp = useCallback(async () => {
    const item = selectedItem;
    if (!item) return;
    if (!item.processedBlob) {
      showToast('Run Remove BG first, then use touch-up brush', 'info');
      return;
    }
    setTouchUpBusy(true);
    try {
      const [processedImg, originalImg] = await Promise.all([
        blobToImage(item.processedBlob),
        blobToImage(item.originalBlob),
      ]);
      setTouchUpOpen(true);
      await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
      const canvas = touchCanvasRef.current;
      if (!canvas) throw new Error('Touch-up canvas unavailable');
      canvas.width = processedImg.naturalWidth;
      canvas.height = processedImg.naturalHeight;
      const ctx = canvas.getContext('2d');
      if (!ctx) throw new Error('Canvas 2D context unavailable');
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(processedImg, 0, 0);
      touchOriginalRef.current = originalImg;
      const sourceCanvas = document.createElement('canvas');
      const crop = item.cropRect ?? null;
      const sourceW = crop ? crop.w : originalImg.naturalWidth;
      const sourceH = crop ? crop.h : originalImg.naturalHeight;
      sourceCanvas.width = sourceW;
      sourceCanvas.height = sourceH;
      const sourceCtx = sourceCanvas.getContext('2d');
      if (!sourceCtx) throw new Error('Canvas 2D context unavailable');
      if (crop) {
        // Keep original pixel buffer aligned with the *cropped* processed canvas.
        // Smart refine + restore assume canvas coords match originalData coords.
        sourceCtx.drawImage(
          originalImg,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
          0,
          0,
          crop.w,
          crop.h,
        );
      } else {
        sourceCtx.drawImage(originalImg, 0, 0);
      }
      touchOriginalDataRef.current = sourceCtx.getImageData(0, 0, sourceCanvas.width, sourceCanvas.height);
      setTouchToolMode('erase');
      setViewZoom(1);
      setViewPanX(0);
      setViewPanY(0);
      touchUndoRef.current = [];
      touchRedoRef.current = [];
      setBrushPreview({ x: 0, y: 0, visible: false });
      setTouchUpOpen(true);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Unable to open touch-up editor', 'err');
    } finally {
      setTouchUpBusy(false);
    }
  }, [selectedItem, showToast]);

  const screenToCanvas = useCallback((clientX: number, clientY: number) => {
    const viewport = touchViewportRef.current;
    const canvas = touchCanvasRef.current;
    if (!viewport || !canvas) return null;
    const rect = viewport.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = (clientX - rect.left - (viewBase.offsetX + viewPanX)) / viewBase.finalScale;
    const y = (clientY - rect.top - (viewBase.offsetY + viewPanY)) / viewBase.finalScale;
    return { x, y };
  }, [viewBase.finalScale, viewBase.offsetX, viewBase.offsetY, viewPanX, viewPanY]);

  const updateBrushPreview = useCallback((clientX: number, clientY: number) => {
    const viewport = touchViewportRef.current;
    if (!viewport || !touchUpOpen || spaceDown) {
      setBrushPreview((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    const rect = viewport.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    if (x < 0 || y < 0 || x > rect.width || y > rect.height) {
      setBrushPreview((prev) => (prev.visible ? { ...prev, visible: false } : prev));
      return;
    }
    setBrushPreview({ x, y, visible: true });
  }, [spaceDown, touchUpOpen]);

  const paintAt = useCallback((clientX: number, clientY: number) => {
    const canvas = touchCanvasRef.current;
    if (!canvas) return;
    const point = screenToCanvas(clientX, clientY);
    if (!point) return;
    const x = point.x;
    const y = point.y;
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return;

    const radius = Math.max(0.5, brushSize / 2);
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    const originalImg = touchOriginalRef.current;
    const originalData = touchOriginalDataRef.current;

    if (!smartRefine || !originalData || !originalImg) {
      ctx.save();
      ctx.beginPath();
      ctx.arc(x, y, radius, 0, Math.PI * 2);
      ctx.closePath();
      ctx.clip();
      if (touchToolMode === 'erase') {
        ctx.globalCompositeOperation = 'destination-out';
        ctx.fillStyle = '#000';
        ctx.fillRect(x - radius, y - radius, radius * 2, radius * 2);
      } else if (touchToolMode === 'restore') {
        // Keep manual restore soft so tiny fixes blend with existing antialiasing.
        if (!originalData) {
          // Without the original pixel buffer we can't restore colors; fall back to no-op.
        } else {
        const bx = clamp(Math.floor(x - radius - 1), 0, canvas.width - 1);
        const by = clamp(Math.floor(y - radius - 1), 0, canvas.height - 1);
        const ex = clamp(Math.ceil(x + radius + 1), 0, canvas.width - 1);
        const ey = clamp(Math.ceil(y + radius + 1), 0, canvas.height - 1);
        const bw = ex - bx + 1;
        const bh = ey - by + 1;
        const patch = ctx.getImageData(bx, by, bw, bh);
        const p = patch.data;
        const source = originalData.data;
        const invRadius = 1 / Math.max(radius, 0.0001);
        for (let py = 0; py < bh; py++) {
          for (let px = 0; px < bw; px++) {
            const gx = bx + px;
            const gy = by + py;
            const dx = gx - x;
            const dy = gy - y;
            const d = Math.sqrt(dx * dx + dy * dy);
            if (d > radius) continue;
            const t = 1 - d * invRadius;
            const strength = t * t;
            const gi = (gy * canvas.width + gx) * 4;
            const pi = (py * bw + px) * 4;
            const mix = 0.72 * strength;
            p[pi] = Math.round(p[pi] + (source[gi] - p[pi]) * mix);
            p[pi + 1] = Math.round(p[pi + 1] + (source[gi + 1] - p[pi + 1]) * mix);
            p[pi + 2] = Math.round(p[pi + 2] + (source[gi + 2] - p[pi + 2]) * mix);
            p[pi + 3] = clamp(Math.round(p[pi + 3] + (source[gi + 3] - p[pi + 3]) * mix), 0, 255);
          }
        }
        ctx.putImageData(patch, bx, by);
        }
      }
      ctx.restore();
      return;
    }

    const bx = clamp(Math.floor(x - radius - 1), 0, canvas.width - 1);
    const by = clamp(Math.floor(y - radius - 1), 0, canvas.height - 1);
    const ex = clamp(Math.ceil(x + radius + 1), 0, canvas.width - 1);
    const ey = clamp(Math.ceil(y + radius + 1), 0, canvas.height - 1);
    const bw = ex - bx + 1;
    const bh = ey - by + 1;
    const patch = ctx.getImageData(bx, by, bw, bh);
    const p = patch.data;
    const source = originalData.data;
    const cx = Math.round(x);
    const cy = Math.round(y);
    const seedX = clamp(cx - bx, 0, bw - 1);
    const seedY = clamp(cy - by, 0, bh - 1);
    const seedGlobalIdx = (cy * canvas.width + cx) * 4;
    const seedR = source[seedGlobalIdx];
    const seedG = source[seedGlobalIdx + 1];
    const seedB = source[seedGlobalIdx + 2];
    const tol = clamp(smartTolerance, 8, 96);
    const tol2 = tol * tol;

    const visited = new Uint8Array(bw * bh);
    const qx = new Int32Array(bw * bh);
    const qy = new Int32Array(bw * bh);
    let head = 0;
    let tail = 0;
    qx[tail] = seedX;
    qy[tail] = seedY;
    tail++;

    while (head < tail) {
      const px = qx[head];
      const py = qy[head];
      head++;
      const local = py * bw + px;
      if (visited[local]) continue;
      visited[local] = 1;

      const gx = bx + px;
      const gy = by + py;
      const dx = gx - x;
      const dy = gy - y;
      if ((dx * dx + dy * dy) > radius * radius) continue;

      const globalIdx = (gy * canvas.width + gx) * 4;
      const dr = source[globalIdx] - seedR;
      const dg = source[globalIdx + 1] - seedG;
      const db = source[globalIdx + 2] - seedB;
      if ((dr * dr + dg * dg + db * db) > tol2) continue;

      const pi = local * 4;
      const radial = 1 - Math.sqrt(dx * dx + dy * dy) / Math.max(radius, 0.0001);
      const colorSim = 1 - Math.min(1, Math.sqrt(dr * dr + dg * dg + db * db) / Math.max(tol, 1));
      const strength = clamp(radial * radial * (0.35 + colorSim * 0.65), 0, 1);

      if (touchToolMode === 'erase') {
        // Soften alpha edits near the selection edge to avoid hard cut lines.
        const keep = 1 - 0.82 * strength;
        p[pi + 3] = clamp(Math.round(p[pi + 3] * keep), 0, 255);
      } else if (touchToolMode === 'restore') {
        const mix = 0.78 * strength;
        p[pi] = Math.round(p[pi] + (source[globalIdx] - p[pi]) * mix);
        p[pi + 1] = Math.round(p[pi + 1] + (source[globalIdx + 1] - p[pi + 1]) * mix);
        p[pi + 2] = Math.round(p[pi + 2] + (source[globalIdx + 2] - p[pi + 2]) * mix);
        p[pi + 3] = clamp(
          Math.round(p[pi + 3] + (source[globalIdx + 3] - p[pi + 3]) * (0.9 * mix)),
          0,
          255,
        );
      }

      if (px > 0) { qx[tail] = px - 1; qy[tail] = py; tail++; }
      if (px < bw - 1) { qx[tail] = px + 1; qy[tail] = py; tail++; }
      if (py > 0) { qx[tail] = px; qy[tail] = py - 1; tail++; }
      if (py < bh - 1) { qx[tail] = px; qy[tail] = py + 1; tail++; }
    }

    ctx.putImageData(patch, bx, by);
  }, [brushSize, screenToCanvas, smartRefine, smartTolerance, touchToolMode]);

  const zoomAt = useCallback((factor: number, clientX?: number, clientY?: number) => {
    const viewport = touchViewportRef.current;
    if (!viewport) return;
    const rect = viewport.getBoundingClientRect();
    const anchorX = clientX ?? rect.left + rect.width / 2;
    const anchorY = clientY ?? rect.top + rect.height / 2;
    const newZoom = clamp(viewZoom * factor, 0.3, 8);
    const canvasX = (anchorX - rect.left - (viewBase.offsetX + viewPanX)) / viewBase.finalScale;
    const canvasY = (anchorY - rect.top - (viewBase.offsetY + viewPanY)) / viewBase.finalScale;
    setViewZoom(newZoom);
    setViewPanX(anchorX - rect.left - viewBase.offsetX - canvasX * (viewBase.fitScale * newZoom));
    setViewPanY(anchorY - rect.top - viewBase.offsetY - canvasY * (viewBase.fitScale * newZoom));
  }, [viewBase.finalScale, viewBase.fitScale, viewBase.offsetX, viewBase.offsetY, viewPanX, viewPanY, viewZoom]);

  const startPan = useCallback((clientX: number, clientY: number) => {
    touchPanRef.current = { active: true, x: clientX, y: clientY };
  }, []);

  const movePan = useCallback((clientX: number, clientY: number) => {
    if (!touchPanRef.current.active) return;
    const dx = clientX - touchPanRef.current.x;
    const dy = clientY - touchPanRef.current.y;
    touchPanRef.current.x = clientX;
    touchPanRef.current.y = clientY;
    setViewPanX((v) => v + dx);
    setViewPanY((v) => v + dy);
  }, []);

  const stopPan = useCallback(() => {
    touchPanRef.current.active = false;
  }, []);

  const snapshotTouchCanvas = useCallback(() => {
    const canvas = touchCanvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    touchUndoRef.current.push(ctx.getImageData(0, 0, canvas.width, canvas.height));
    if (touchUndoRef.current.length > 25) {
      touchUndoRef.current.shift();
    }
    touchRedoRef.current = [];
  }, []);

  const handleTouchWheel = useCallback((e: React.WheelEvent<HTMLDivElement>) => {
    e.preventDefault();
    if (spaceDown) {
      setViewPanX((v) => v - e.deltaX);
      setViewPanY((v) => v - e.deltaY);
      return;
    }
    zoomAt(e.deltaY > 0 ? 0.9 : 1.1, e.clientX, e.clientY);
  }, [spaceDown, zoomAt]);

  const handleTouchPointerDown = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).setPointerCapture(e.pointerId);
    updateBrushPreview(e.clientX, e.clientY);
    if (spaceDown || e.button === 1 || e.button === 2) {
      startPan(e.clientX, e.clientY);
      return;
    }
    snapshotTouchCanvas();
    touchActiveRef.current = true;
    paintAt(e.clientX, e.clientY);
  }, [paintAt, snapshotTouchCanvas, spaceDown, startPan, updateBrushPreview]);

  const handleTouchPointerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    updateBrushPreview(e.clientX, e.clientY);
    if (touchPanRef.current.active) {
      movePan(e.clientX, e.clientY);
      return;
    }
    if (!touchActiveRef.current) return;
    paintAt(e.clientX, e.clientY);
  }, [movePan, paintAt, updateBrushPreview]);

  const handleTouchPointerUp = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    (e.target as HTMLCanvasElement).releasePointerCapture(e.pointerId);
    touchActiveRef.current = false;
    stopPan();
  }, [stopPan]);

  const handleTouchPointerLeave = useCallback(() => {
    touchActiveRef.current = false;
    stopPan();
    setBrushPreview({ x: 0, y: 0, visible: false });
  }, [stopPan]);

  const applyTouchUp = useCallback(async () => {
    if (!selectedItem) return;
    const canvas = touchCanvasRef.current;
    if (!canvas) return;
    try {
      const result = await canvasToPngBlob(canvas);
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== selectedItem.id) return i;
          URL.revokeObjectURL(i.previewUrl);
          return {
            ...i,
            processedBlob: result,
            previewUrl: URL.createObjectURL(result),
            bgStatus: 'done',
          };
        }),
      );
      setTouchUpOpen(false);
      touchUndoRef.current = [];
      touchRedoRef.current = [];
      setBrushPreview({ x: 0, y: 0, visible: false });
      showToast('Touch-up applied', 'ok');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to apply touch-up', 'err');
    }
  }, [selectedItem, showToast]);

  const cancelTouchUp = useCallback(() => {
    setTouchUpOpen(false);
    touchOriginalRef.current = null;
    touchOriginalDataRef.current = null;
    touchActiveRef.current = false;
    stopPan();
    touchUndoRef.current = [];
    touchRedoRef.current = [];
    setBrushPreview({ x: 0, y: 0, visible: false });
  }, [stopPan]);

  const removeBgAll = useCallback(async () => {
    const toProcess = itemsRef.current.filter((i) => i.bgStatus === 'idle' || i.bgStatus === 'error');
    if (toProcess.length === 0) { showToast('No idle images to process', 'info'); return; }

    setBgBusy(true);
    setBgBatchInfo({ current: 0, total: toProcess.length });

    for (let idx = 0; idx < toProcess.length; idx++) {
      setBgBatchInfo({ current: idx + 1, total: toProcess.length });
      await removeBgOne(toProcess[idx].id, false);
    }

    setBgBusy(false);
    setBgBatchInfo(null);
    showToast('Batch processing complete', 'ok');
  }, [showToast, removeBgOne]);

  const runBgAction = useCallback((action: BgActionType) => {
    if (action === 'one') {
      if (!selectedId) return;
      void removeBgOne(selectedId);
      return;
    }
    void removeBgAll();
  }, [selectedId, removeBgOne, removeBgAll]);

  const requestBgAction = useCallback((action: BgActionType) => {
    if (typeof window === 'undefined') {
      runBgAction(action);
      return;
    }
    const alreadyAccepted = window.localStorage.getItem(BG_MODEL_NOTICE_ACK_KEY) === '1';
    if (alreadyAccepted) {
      runBgAction(action);
      return;
    }
    setBgNoticeAction(action);
    setBgNoticeDialogOpen(true);
  }, [runBgAction]);

  const closeBgNoticeDialog = useCallback(() => {
    setBgNoticeDialogOpen(false);
    setBgNoticeAction(null);
  }, []);

  const confirmBgNoticeDialog = useCallback(() => {
    if (typeof window !== 'undefined') {
      window.localStorage.setItem(BG_MODEL_NOTICE_ACK_KEY, '1');
    }
    const action = bgNoticeAction;
    setBgNoticeDialogOpen(false);
    setBgNoticeAction(null);
    showToast(`Downloading browser model (${BG_MODEL_ESTIMATED_SIZE}) on first run...`, 'info');
    if (action) runBgAction(action);
  }, [bgNoticeAction, runBgAction, showToast]);

  // ── Export ────────────────────────────────────────────────────────────────────

  const getExportBlob = useCallback(async (item: ImageItem): Promise<Blob> => {
    const s = item.exportSettings;
    return canvasExport(activeBlob(item), s.tw, s.th, s.format, s.quality, s.brightness, !s.locked);
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────────

  const downloadOne = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    try {
      const blob = await getExportBlob(item);
      const s = item.exportSettings;
      const base = item.fileName.replace(/\.[^.]+$/, '') || 'image';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}_${s.tw}x${s.th}.${s.format}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Download failed', 'err');
    }
  }, [getExportBlob, showToast]);

  const downloadAll = useCallback(async () => {
    if (items.length === 0) return;
    for (let i = 0; i < items.length; i++) {
      await downloadOne(items[i].id);
      if (i < items.length - 1) {
        await new Promise<void>((r) => setTimeout(r, 80));
      }
    }
    showToast(`Downloaded ${items.length} image${items.length > 1 ? 's' : ''}`, 'ok');
  }, [items, downloadOne, showToast]);

  // ── Per-item export setting helpers ─────────────────────────────────────────

  const setExport = (patch: Partial<ExportSettings>) => {
    if (!selectedId) return;
    setItems((prev) => prev.map((i) =>
      i.id === selectedId ? { ...i, exportSettings: { ...i.exportSettings, ...patch } } : i,
    ));
  };
  const changeW = (v: number) => {
    if (!selectedId) return;
    const item = itemsRef.current.find((i) => i.id === selectedId);
    if (!item) return;
    setExport(item.exportSettings.locked ? { tw: v, th: v } : { tw: v });
  };
  const changeH = (v: number) => {
    if (!selectedId) return;
    const item = itemsRef.current.find((i) => i.id === selectedId);
    if (!item) return;
    setExport(item.exportSettings.locked ? { tw: v, th: v } : { th: v });
  };

  const applyDimensionsToAll = useCallback(() => {
    if (!selectedId) return;
    const source = itemsRef.current.find((i) => i.id === selectedId);
    if (!source) return;
    const { tw, th, locked } = source.exportSettings;
    const count = itemsRef.current.length;
    setItems((prev) => prev.map((i) => ({
      ...i,
      exportSettings: { ...i.exportSettings, tw, th, locked },
    })));
    showToast(`Applied ${tw}×${th} to ${count} image${count === 1 ? '' : 's'}`, 'ok');
  }, [selectedId, showToast]);

  // ── Image Library ─────────────────────────────────────────────────────────────

  const addToLibrary = useCallback(async (item: ImageItem, assetId: string, exportBlob: Blob) => {
    try {
      // Use the export blob for the thumbnail so it reflects the actual published quality
      const previewDataUrl = await blobToThumbnailDataUrl(exportBlob, 200);
      const entry: CachedImage = {
        id: uid(),
        previewDataUrl,
        assetId,
        name: item.fileName.replace(/\.[^.]+$/, '') || 'image',
        publishedAt: Date.now(),
      };
      setImageLibrary((prev) => {
        if (prev.some((e) => e.assetId === assetId)) return prev;
        return [entry, ...prev];
      });
      // Store full export blob in IndexedDB for instant re-edit / download
      void saveBlobToIdb(assetId, exportBlob);
    } catch {
      // Best-effort — never block publish on a thumbnail failure.
    }
  }, []);

  const deleteFromLibrary = useCallback((id: string) => {
    setImageLibrary((prev) => {
      const entry = prev.find((e) => e.id === id);
      if (entry) void deleteBlobFromIdb(entry.assetId);
      return prev.filter((e) => e.id !== id);
    });
  }, []);

  const copyLibraryId = useCallback((assetId: string) => {
    navigator.clipboard.writeText(assetId);
    showToast('Copied!', 'ok');
  }, [showToast]);

  // ── Import from Roblox ─────────────────────────────────────────────────────────

  /** Parse an asset ID from various input formats: raw number, rbxassetid://123, full URL, etc. */
  const parseAssetId = useCallback((raw: string): string | null => {
    const trimmed = raw.trim();
    // rbxassetid://123456
    const rbxMatch = trimmed.match(/rbxassetid:\/\/(\d+)/i);
    if (rbxMatch) return rbxMatch[1];
    // Plain number
    if (/^\d+$/.test(trimmed)) return trimmed;
    // URL with id= param
    const urlMatch = trimmed.match(/[?&]id=(\d+)/i);
    if (urlMatch) return urlMatch[1];
    return null;
  }, []);

  const fetchRobloxImage = useCallback(async (assetId: string): Promise<Blob> => {
    const res = await fetch(`/api/roblox-fetch-image?assetId=${encodeURIComponent(assetId)}`);
    if (!res.ok) {
      const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
      throw new Error(data.error ?? `Failed to fetch asset ${assetId}`);
    }
    return res.blob();
  }, []);

  const importFromAssetId = useCallback(async (raw: string) => {
    const assetId = parseAssetId(raw);
    if (!assetId) {
      showToast('Enter a valid asset ID or rbxassetid:// URL', 'err');
      return;
    }

    setImportBusy(true);
    try {
      const blob = await fetchRobloxImage(assetId);
      const file = new File([blob], `roblox_${assetId}.png`, { type: blob.type || 'image/png' });
      const id = uid();
      const previewUrl = URL.createObjectURL(file);
      let dims: { w: number; h: number } | null = null;
      try { dims = await imgDims(file); } catch { /* ignore */ }

      const newItem: ImageItem = {
        id,
        originalBlob: file,
        processedBlob: null,
        previewUrl,
        fileName: `roblox_${assetId}.png`,
        originalFileName: `roblox_${assetId}.png`,
        nameStatus: 'loading' as NameStatus,
        dims,
        bgStatus: 'idle' as BgStatus,
        pubStatus: 'idle' as PubStatus,
        exportSettings: dims
          ? { ...DEFAULT_EXPORT_SETTINGS, tw: dims.w, th: dims.h, locked: dims.w === dims.h }
          : { ...DEFAULT_EXPORT_SETTINGS },
      };

      setItems((prev) => [...prev, newItem]);
      setSelectedId(newItem.id);
      setActiveTab('tool');
      setImportAssetInput('');
      showToast(`Imported asset ${assetId}`, 'ok');

      void autoNameOne(newItem.id, newItem.originalBlob, newItem.fileName);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'err');
    } finally {
      setImportBusy(false);
    }
  }, [parseAssetId, fetchRobloxImage, showToast, autoNameOne]);

  /** Resolve a library entry's image: try local IndexedDB cache first, then Roblox. */
  const resolveLibraryBlob = useCallback(async (entry: CachedImage): Promise<Blob> => {
    const cached = await loadBlobFromIdb(entry.assetId);
    if (cached) return cached;
    return fetchRobloxImage(entry.assetId);
  }, [fetchRobloxImage]);

  const importLibraryEntry = useCallback(async (entry: CachedImage) => {
    setImportBusy(true);
    try {
      const blob = await resolveLibraryBlob(entry);
      const file = new File([blob], `${entry.name}.png`, { type: blob.type || 'image/png' });
      const id = uid();
      const previewUrl = URL.createObjectURL(file);
      let dims: { w: number; h: number } | null = null;
      try { dims = await imgDims(file); } catch { /* ignore */ }

      const newItem: ImageItem = {
        id,
        originalBlob: file,
        processedBlob: null,
        previewUrl,
        fileName: `${entry.name}.png`,
        originalFileName: `${entry.name}.png`,
        nameStatus: 'done' as NameStatus,
        dims,
        bgStatus: 'idle' as BgStatus,
        pubStatus: 'idle' as PubStatus,
        exportSettings: dims
          ? { ...DEFAULT_EXPORT_SETTINGS, tw: dims.w, th: dims.h, locked: dims.w === dims.h }
          : { ...DEFAULT_EXPORT_SETTINGS },
      };

      setItems((prev) => [...prev, newItem]);
      setSelectedId(newItem.id);
      setActiveTab('tool');
      showToast(`Imported "${entry.name}" to editor`, 'ok');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Import failed', 'err');
    } finally {
      setImportBusy(false);
    }
  }, [resolveLibraryBlob, showToast]);

  const downloadLibraryEntry = useCallback(async (entry: CachedImage) => {
    try {
      const blob = await resolveLibraryBlob(entry);
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${entry.name}_${entry.assetId}.png`;
      a.click();
      URL.revokeObjectURL(url);
      showToast('Download started', 'ok');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Download failed', 'err');
    }
  }, [resolveLibraryBlob, showToast]);

  // ── Drafts ────────────────────────────────────────────────────────────────────

  const saveDraft = useCallback(async (item: ImageItem) => {
    try {
      const blob = activeBlob(item);
      const previewDataUrl = await blobToThumbnailDataUrl(blob, 200);
      const s = item.exportSettings;
      const draft: DraftImage = {
        id: uid(),
        name: item.fileName.replace(/\.[^.]+$/, '') || 'image',
        previewDataUrl,
        savedAt: Date.now(),
        exportSettings: { tw: s.tw, th: s.th, format: s.format, quality: s.quality, brightness: s.brightness },
        hasBgRemoved: item.processedBlob != null,
      };
      setDrafts((prev) => [draft, ...prev]);
      void saveDraftBlobsToIdb(draft.id, item.originalBlob, item.processedBlob);
      showToast('Saved to drafts', 'ok');
    } catch {
      showToast('Failed to save draft', 'err');
    }
  }, [showToast]);

  const deleteDraft = useCallback((id: string) => {
    setDrafts((prev) => prev.filter((d) => d.id !== id));
    void deleteDraftBlobsFromIdb(id);
  }, []);

  const loadDraft = useCallback(async (draft: DraftImage) => {
    try {
      const blobs = await loadDraftBlobsFromIdb(draft.id);
      if (!blobs) {
        showToast('Draft data not found — it may have been cleared by the browser', 'err');
        return;
      }

      const file = new File([blobs.original], `${draft.name}.png`, { type: blobs.original.type || 'image/png' });
      const id = uid();
      const previewUrl = blobs.processed
        ? URL.createObjectURL(blobs.processed)
        : URL.createObjectURL(file);
      let dims: { w: number; h: number } | null = null;
      try { dims = await imgDims(file); } catch { /* ignore */ }

      const newItem: ImageItem = {
        id,
        originalBlob: file,
        processedBlob: blobs.processed,
        previewUrl,
        fileName: `${draft.name}.png`,
        originalFileName: `${draft.name}.png`,
        nameStatus: 'done' as NameStatus,
        dims,
        bgStatus: blobs.processed ? 'done' as BgStatus : 'idle' as BgStatus,
        pubStatus: 'idle' as PubStatus,
        exportSettings: { ...DEFAULT_EXPORT_SETTINGS, ...draft.exportSettings, locked: DEFAULT_EXPORT_SETTINGS.locked },
      };

      setItems((prev) => [...prev, newItem]);
      setSelectedId(newItem.id);
      setActiveTab('tool');
      showToast(`Loaded draft "${draft.name}"`, 'ok');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Failed to load draft', 'err');
    }
  }, [showToast]);

  // ── Publish ───────────────────────────────────────────────────────────────────

  const publishOne = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    if (!apiKey.trim()) { showToast('Enter your Roblox API key', 'err'); return; }
    if (!creatorId.trim()) { showToast('Enter a creator ID', 'err'); return; }

    setPublishing(true);
    updateItem(id, { pubStatus: 'publishing', pubAssetId: undefined, pubError: undefined });

    try {
      const blob = await getExportBlob(item);
      const assetName = item.fileName.replace(/\.[^.]+$/, '') || 'Uploaded Icon';
      const fd = new FormData();
      fd.append('apiKey', apiKey.trim());
      fd.append('creatorType', creatorType);
      fd.append('creatorId', creatorId.trim());
      fd.append('assetName', assetName);
      fd.append('image', blob, `icon.${item.exportSettings.format}`);

      const res = await fetch('/api/roblox-upload', { method: 'POST', body: fd });
      const data: { assetId?: string | number; error?: string; success?: boolean } = await res.json();

      if (data.success && data.assetId) {
        const assetId = String(data.assetId);
        updateItem(id, { pubStatus: 'done', pubAssetId: assetId });
        void addToLibrary(item, assetId, blob);
        showToast('Published!', 'ok');
      } else {
        updateItem(id, { pubStatus: 'error', pubError: data.error ?? 'Unknown error' });
        showToast(data.error ?? 'Publish failed', 'err');
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      updateItem(id, { pubStatus: 'error', pubError: msg });
      showToast(msg, 'err');
    } finally {
      setPublishing(false);
    }
  }, [apiKey, creatorId, creatorType, getExportBlob, showToast, addToLibrary]);

  const publishAll = useCallback(async () => {
    if (items.length === 0) return;
    if (!apiKey.trim()) { showToast('Enter your Roblox API key', 'err'); return; }
    if (!creatorId.trim()) { showToast('Enter a creator ID', 'err'); return; }

    setPublishing(true);
    let successCount = 0;
    let errorCount = 0;

    // Mark all as queued first
    setItems((prev) => prev.map((i) => ({ ...i, pubStatus: 'queued' as PubStatus, pubAssetId: undefined, pubError: undefined })));

    for (const item of itemsRef.current) {
      // Mark as publishing
      setItems((prev) => prev.map((i) => (i.id === item.id ? { ...i, pubStatus: 'publishing' as PubStatus } : i)));

      try {
        const blob = await getExportBlob(item);
        const assetName = item.fileName.replace(/\.[^.]+$/, '') || 'Uploaded Icon';
        const fd = new FormData();
        fd.append('apiKey', apiKey.trim());
        fd.append('creatorType', creatorType);
        fd.append('creatorId', creatorId.trim());
        fd.append('assetName', assetName);
        fd.append('image', blob, `icon.${item.exportSettings.format}`);

        const res = await fetch('/api/roblox-upload', { method: 'POST', body: fd });
        const data: { assetId?: string | number; error?: string; success?: boolean } = await res.json();

        if (data.success && data.assetId) {
          const id = String(data.assetId);
          successCount += 1;
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, pubStatus: 'done' as PubStatus, pubAssetId: id } : i,
            ),
          );
          void addToLibrary(item, id, blob);
        } else {
          errorCount += 1;
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id
                ? { ...i, pubStatus: 'error' as PubStatus, pubError: data.error ?? 'Unknown error' }
                : i,
            ),
          );
        }
      } catch (err: unknown) {
        const msg = err instanceof Error ? err.message : 'Publish failed';
        errorCount += 1;
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, pubStatus: 'error' as PubStatus, pubError: msg } : i,
          ),
        );
      }
    }

    setPublishing(false);
    if (successCount > 0 && errorCount === 0) {
      showToast(`Publish complete: ${successCount}/${items.length} succeeded`, 'ok');
      return;
    }
    if (successCount > 0 && errorCount > 0) {
      showToast(`Publish finished: ${successCount} succeeded, ${errorCount} failed`, 'info');
      return;
    }
    showToast(`Publish failed: ${errorCount}/${items.length} failed`, 'err');
  }, [items, apiKey, creatorType, creatorId, getExportBlob, showToast, addToLibrary]);

  const copyAssetId = useCallback((id: string) => {
    const item = items.find((i) => i.id === id);
    if (item?.pubAssetId) {
      navigator.clipboard.writeText(item.pubAssetId);
      showToast('Copied!', 'ok');
    }
  }, [items, showToast]);

  const copyAllIds = useCallback(() => {
    const ids = items.filter((i) => i.pubAssetId).map((i) => i.pubAssetId as string);
    if (ids.length > 0) {
      navigator.clipboard.writeText(ids.join('\n'));
      showToast(`Copied ${ids.length} ID${ids.length > 1 ? 's' : ''}`, 'ok');
    }
  }, [items, showToast]);

  const applyPreset = useCallback((presetId: string) => {
    setSelectedPresetId(presetId);
    if (!presetId) {
      setPresetName('');
      return;
    }
    const preset = presets.find((p) => p.id === presetId);
    if (!preset) return;
    setApiKey(preset.apiKey);
    setCreatorType(preset.creatorType);
    setCreatorId(preset.creatorId);
    setPresetName(preset.name);
    showToast(`Loaded preset: ${preset.name}`, 'ok');
  }, [presets, showToast]);

  const saveNewPreset = useCallback(() => {
    const name = presetName.trim();
    if (!name) {
      showToast('Enter a preset name', 'err');
      return;
    }
    if (!apiKey.trim()) {
      showToast('Enter an API key first', 'err');
      return;
    }
    if (!creatorId.trim()) {
      showToast('Enter a creator ID first', 'err');
      return;
    }

    const nextPreset: PublishPreset = {
      id: uid(),
      name,
      apiKey: apiKey.trim(),
      creatorType,
      creatorId: creatorId.trim(),
    };
    setPresets((prev) => [...prev, nextPreset]);
    setSelectedPresetId(nextPreset.id);
    setPresetName('');
    showToast(`Preset saved: ${name}`, 'ok');
  }, [presetName, apiKey, creatorType, creatorId, showToast]);

  const updatePreset = useCallback(() => {
    if (!selectedPresetId) {
      showToast('Select a preset to update', 'info');
      return;
    }
    const name = presetName.trim();
    if (!name) {
      showToast('Enter a preset name', 'err');
      return;
    }
    if (!apiKey.trim()) {
      showToast('Enter an API key first', 'err');
      return;
    }
    if (!creatorId.trim()) {
      showToast('Enter a creator ID first', 'err');
      return;
    }
    setPresets((prev) =>
      prev.map((preset) =>
        preset.id === selectedPresetId
          ? {
              ...preset,
              name,
              apiKey: apiKey.trim(),
              creatorType,
              creatorId: creatorId.trim(),
            }
          : preset,
      ),
    );
    showToast(`Updated preset: ${name}`, 'ok');
  }, [selectedPresetId, presetName, apiKey, creatorType, creatorId, showToast]);

  const deletePreset = useCallback(() => {
    if (!selectedPresetId) {
      showToast('Select a preset to delete', 'info');
      return;
    }
    const target = presets.find((p) => p.id === selectedPresetId);
    setPresets((prev) => prev.filter((p) => p.id !== selectedPresetId));
    setSelectedPresetId('');
    if (target) showToast(`Deleted preset: ${target.name}`, 'ok');
  }, [presets, selectedPresetId, showToast]);

  // ── Helpers ───────────────────────────────────────────────────────────────────

  function pubStatusClass(s: PubStatus): string {
    switch (s) {
      case 'idle': return styles.pubStatusIdle;
      case 'queued': return styles.pubStatusQueued;
      case 'publishing': return styles.pubStatusPublishing;
      case 'done': return styles.pubStatusDone;
      case 'error': return styles.pubStatusError;
    }
  }

  const hasSomeAssetId = items.some((i) => i.pubAssetId);
  const selectedBg = selectedItem?.processedBlob != null;
  const finishedCount = items.filter((i) => i.pubStatus === 'done').length;
  const closePublishDialog = useCallback(() => setPublishDialogOpen(false), []);

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className={styles.app}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logoMark}>PIXEL FORGE</span>
          <span className={styles.logoDivider} />
          <nav className={styles.headerTabs}>
            <button
              className={`${styles.headerTab}${activeTab === 'tool' ? ` ${styles.headerTabActive}` : ''}`}
              onClick={() => setActiveTab('tool')}
            >
              Tool
            </button>
            <button
              className={`${styles.headerTab}${activeTab === 'drafts' ? ` ${styles.headerTabActive}` : ''}`}
              onClick={() => setActiveTab('drafts')}
            >
              Drafts
              {drafts.length > 0 && (
                <span className={styles.headerTabBadge}>{drafts.length}</span>
              )}
            </button>
            <button
              className={`${styles.headerTab}${activeTab === 'library' ? ` ${styles.headerTabActive}` : ''}`}
              onClick={() => setActiveTab('library')}
            >
              Library
              {imageLibrary.length > 0 && (
                <span className={styles.headerTabBadge}>{imageLibrary.length}</span>
              )}
            </button>
          </nav>
        </div>
        <div className={styles.headerRight}>
          {activeTab === 'tool' && hasItems && (
            <span className={styles.headerMeta}>
              {items.length} image{items.length > 1 ? 's' : ''}
            </span>
          )}
          {activeTab === 'tool' && selectedItem && (
            <span className={styles.headerMeta}>
              {fmtBytes(activeBlob(selectedItem).size)}
            </span>
          )}
          {activeTab === 'drafts' && drafts.length > 0 && (
            <button
              className={styles.libClearBtn}
              onClick={() => {
                if (window.confirm('Remove all saved drafts?')) {
                  drafts.forEach((d) => void deleteDraftBlobsFromIdb(d.id));
                  setDrafts([]);
                }
              }}
            >
              Clear All
            </button>
          )}
          {activeTab === 'library' && imageLibrary.length > 0 && (
            <button
              className={styles.libClearBtn}
              onClick={() => { if (window.confirm('Remove all cached images from the library?')) setImageLibrary([]); }}
            >
              Clear All
            </button>
          )}
          <div className={styles.themePickerWrap}>
            <button
              className={styles.themePickerBtn}
              onClick={() => setThemePickerOpen((v) => !v)}
              title="Change accent color"
              aria-label="Change accent color"
            >
              <span
                className={styles.themeSwatchDot}
                style={{ background: (ACCENT_THEMES.find((t) => t.id === accentThemeId) ?? ACCENT_THEMES[0]).base }}
              />
              Theme
            </button>
            {themePickerOpen && (
              <>
                <div
                  className={styles.themePickerBackdrop}
                  onClick={() => setThemePickerOpen(false)}
                />
                <div className={styles.themePickerMenu}>
                  <div className={styles.themePickerTitle}>Accent color</div>
                  <div className={styles.themePickerGrid}>
                    {ACCENT_THEMES.map((t) => (
                      <button
                        key={t.id}
                        className={`${styles.themeSwatch}${accentThemeId === t.id ? ` ${styles.themeSwatchActive}` : ''}`}
                        onClick={() => {
                          setAccentThemeId(t.id);
                          setThemePickerOpen(false);
                        }}
                        title={t.label}
                      >
                        <span className={styles.themeSwatchChip} style={{ background: t.base }} />
                        <span className={styles.themeSwatchLabel}>{t.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.themePickerDivider} />
                  <div className={styles.themePickerTitle}>Appearance</div>
                  <div className={styles.themeModeGrid}>
                    {([
                      { id: 'system', label: 'System', icon: '⌁' },
                      { id: 'dark', label: 'Dark', icon: '◐' },
                      { id: 'light', label: 'Light', icon: '☀' },
                    ] as { id: ColorMode; label: string; icon: string }[]).map((m) => (
                      <button
                        key={m.id}
                        className={`${styles.themeModeBtn}${colorMode === m.id ? ` ${styles.themeModeBtnActive}` : ''}`}
                        onClick={() => setColorMode(m.id)}
                        title={`${m.label} appearance`}
                        aria-pressed={colorMode === m.id}
                      >
                        <span className={styles.themeModeIcon} aria-hidden="true">{m.icon}</span>
                        <span className={styles.themeModeLabel}>{m.label}</span>
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button
            className={styles.vBadge}
            onClick={() => setChangelogOpen(true)}
            title="View changelog"
          >
            v{APP_VERSION}
          </button>
        </div>
      </header>

      {/* ── Drafts Page ── */}
      {activeTab === 'drafts' && (
        <div className={styles.libraryPage}>
          {drafts.length === 0 ? (
            <div className={styles.libraryPageEmpty}>
              <div className={styles.libraryPageEmptyIcon}>⬡</div>
              <span className={styles.libraryPageEmptyTitle}>No saved drafts</span>
              <span className={styles.libraryPageEmptySub}>
                Use the &quot;Save Draft&quot; button in the preview bar to save your work-in-progress images here.
              </span>
            </div>
          ) : (
            <div className={styles.libraryPageGrid}>
              {drafts.map((draft) => (
                <div key={draft.id} className={styles.libraryPageCard}>
                  <div className={styles.libraryPageThumb}>
                    <img src={draft.previewDataUrl} alt={draft.name} className={styles.libraryPageThumbImg} />
                    <div className={styles.libraryPageOverlay}>
                      <button
                        className={styles.libraryPageActionBtn}
                        onClick={() => void loadDraft(draft)}
                        title="Load into editor"
                      >
                        Load
                      </button>
                    </div>
                    <button
                      className={styles.libraryPageDeleteBtn}
                      onClick={() => deleteDraft(draft.id)}
                      title="Remove draft"
                    >
                      ✕
                    </button>
                  </div>
                  <div className={styles.libraryPageInfo}>
                    <span className={styles.libraryPageName} title={draft.name}>{draft.name}</span>
                    <span className={styles.draftSettingsTag}>
                      {draft.exportSettings.tw}×{draft.exportSettings.th} · {draft.exportSettings.format.toUpperCase()}
                    </span>
                    {draft.hasBgRemoved && (
                      <span className={styles.draftBgTag}>BG Removed</span>
                    )}
                    <span className={styles.libraryPageDate}>
                      {new Date(draft.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Library Page ── */}
      {activeTab === 'library' && (
        <div className={styles.libraryPage}>
          {/* ── Import Bar ── */}
          <div className={styles.libraryImportBar}>
            <label className={styles.libraryImportLabel}>Import from Roblox</label>
            <div className={styles.libraryImportRow}>
              <input
                type="text"
                className={styles.libraryImportInput}
                placeholder="Asset ID or rbxassetid://..."
                value={importAssetInput}
                onChange={(e) => setImportAssetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && importAssetInput.trim() && !importBusy) {
                    void importFromAssetId(importAssetInput);
                  }
                }}
                disabled={importBusy}
              />
              <button
                className={styles.libraryImportBtn}
                onClick={() => void importFromAssetId(importAssetInput)}
                disabled={!importAssetInput.trim() || importBusy}
              >
                {importBusy ? 'Importing...' : 'Import'}
              </button>
            </div>
            <span className={styles.libraryImportHint}>
              Paste an asset ID to fetch and load it into the editor.
            </span>
          </div>

          {imageLibrary.length === 0 ? (
            <div className={styles.libraryPageEmpty}>
              <div className={styles.libraryPageEmptyIcon}>⬡</div>
              <span className={styles.libraryPageEmptyTitle}>No published images yet</span>
              <span className={styles.libraryPageEmptySub}>
                Images published to Roblox appear here. You can also import any Roblox image above.
              </span>
            </div>
          ) : (
            <div className={styles.libraryPageGrid}>
              {imageLibrary.map((entry) => (
                <div key={entry.id} className={styles.libraryPageCard}>
                  <div className={styles.libraryPageThumb}>
                    <img src={entry.previewDataUrl} alt={entry.name} className={styles.libraryPageThumbImg} />
                    <div className={styles.libraryPageOverlay}>
                      <button
                        className={styles.libraryPageActionBtn}
                        onClick={() => void importLibraryEntry(entry)}
                        disabled={importBusy}
                        title="Import to editor"
                      >
                        Edit
                      </button>
                      <button
                        className={styles.libraryPageActionBtn}
                        onClick={() => void downloadLibraryEntry(entry)}
                        title="Download original"
                      >
                        Save
                      </button>
                    </div>
                    <button
                      className={styles.libraryPageDeleteBtn}
                      onClick={() => deleteFromLibrary(entry.id)}
                      title="Remove from library"
                    >
                      ✕
                    </button>
                  </div>
                  <div className={styles.libraryPageInfo}>
                    <span className={styles.libraryPageName} title={entry.name}>{entry.name}</span>
                    <button
                      className={styles.libraryPageIdBtn}
                      onClick={() => copyLibraryId(entry.assetId)}
                      title={`Copy: ${entry.assetId}`}
                    >
                      <span className={styles.libraryPageIdLabel}>rbxassetid://</span>
                      <span className={styles.libraryPageIdVal}>{entry.assetId}</span>
                    </button>
                    <span className={styles.libraryPageDate}>
                      {new Date(entry.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Body ── */}
      {activeTab === 'tool' && <div className={styles.body}>

        {/* Mobile drawer backdrop — hidden on desktop via CSS */}
        {(mobileQueueOpen || mobileControlsOpen) && (
          <div
            className={styles.mobileDrawerBackdrop}
            onClick={() => { setMobileQueueOpen(false); setMobileControlsOpen(false); }}
          />
        )}

        {/* ── Queue Panel ── */}
        <div className={`${styles.queuePanel}${mobileQueueOpen ? ` ${styles.queuePanelMobileOpen}` : ''}`}>
          <div className={styles.queueHeader}>
            <span className={styles.queueHeaderLabel}>Queue</span>
            {hasItems && (
              <span className={styles.queueCountBadge}>{items.length}</span>
            )}
          </div>

          <div className={styles.queueList}>
            {items.map((item) => (
              <div
                key={item.id}
                className={`${styles.thumbCard}${selectedId === item.id ? ` ${styles.selected}` : ''}`}
                onClick={() => setSelectedId(item.id)}
              >
                <div className={styles.thumbImgWrap}>
                  <img
                    src={item.previewUrl}
                    alt={displayNameForItem(item)}
                    className={styles.thumbImgEl}
                  />
                </div>
                <div className={styles.thumbFooter}>
                  <span
                    className={`${styles.thumbFileName}${
                      nameClassForItem(item) ? ` ${nameClassForItem(item)}` : ''
                    }`}
                  >
                    {displayNameForItem(item)}
                  </span>
                  <span
                    className={
                      item.bgStatus === 'done'
                        ? styles.thumbBgDotDone
                        : item.bgStatus === 'processing'
                        ? styles.thumbBgDotProcessing
                        : item.bgStatus === 'error'
                        ? styles.thumbBgDotError
                        : styles.thumbBgDotIdle
                    }
                  />
                  <button
                    className={styles.thumbRemoveBtn}
                    onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                    title="Remove"
                  >
                    ✕
                  </button>
                </div>
              </div>
            ))}
          </div>

          {/* Add button */}
          <label className={styles.thumbAddBtn} title="Add images">
            +
            <input
              type="file"
              accept="image/*"
              multiple
              className={styles.thumbAddInput}
              onChange={handleFileChange}
            />
          </label>
        </div>

        {/* ── Preview Panel ── */}
        <div className={styles.previewPanel}>
          <div className={styles.previewBar}>
            <span
              className={`${styles.barLabel}${
                selectedItem && nameClassForItem(selectedItem) ? ` ${nameClassForItem(selectedItem)}` : ''
              }`}
            >
              {selectedItem ? displayNameForItem(selectedItem) : 'Preview'}
            </span>
            <div className={styles.previewMeta}>
              {selectedItem && (
                <button
                  className={styles.saveDraftBtn}
                  onClick={() => void saveDraft(selectedItem)}
                  title="Save to drafts"
                >
                  Save Draft
                </button>
              )}
              {selectedItem?.dims && (
                <span className={styles.dimsTag} title="Original image dimensions">
                  {selectedItem.dims.w}×{selectedItem.dims.h}
                </span>
              )}
              {selectedItem && (
                <span className={styles.zoomTag}>{Math.round(viewZoom * 100)}%</span>
              )}
              {selectedBg && (
                <span className={styles.bgRemovedTag}>● BG Removed</span>
              )}
            </div>
          </div>
          <div
            className={`${styles.previewArea}${isDragging ? ` ${styles.dragging}` : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {selectedItem ? (
              <div
                ref={touchViewportRef}
                className={`${styles.touchWrap}${spaceDown ? ` ${styles.spacePan}` : ''}`}
                onWheel={handleTouchWheel}
                onContextMenu={(e) => e.preventDefault()}
              >
                {touchUpOpen ? (
                  <>
                    <canvas
                      ref={touchCanvasRef}
                      className={styles.touchCanvas}
                      style={{
                        transform: `translate(${viewBase.offsetX + viewPanX}px, ${viewBase.offsetY + viewPanY}px) scale(${viewBase.finalScale})`,
                        transformOrigin: 'top left',
                      }}
                      onPointerDown={handleTouchPointerDown}
                      onPointerMove={handleTouchPointerMove}
                      onPointerUp={handleTouchPointerUp}
                      onPointerLeave={handleTouchPointerLeave}
                    />
                    <div
                      className={styles.brushPreview}
                      style={{
                        left: `${brushPreview.x}px`,
                        top: `${brushPreview.y}px`,
                        width: `${brushPx}px`,
                        height: `${brushPx}px`,
                        opacity: brushPreview.visible ? 1 : 0,
                      }}
                    />
                  </>
                ) : (
                  <img
                    key={selectedItem.previewUrl}
                    src={exportPreviewUrl ?? selectedItem.previewUrl}
                    alt="Preview"
                    className={styles.previewNavImg}
                    style={{
                      transform: `translate(${viewBase.offsetX + viewPanX}px, ${viewBase.offsetY + viewPanY}px) scale(${viewBase.finalScale})`,
                      transformOrigin: 'top left',
                      imageRendering: exportPreviewUrl ? 'pixelated' : undefined,
                    }}
                    onPointerDown={(e) => {
                      const isTouch = e.pointerType === 'touch' || e.pointerType === 'pen';
                      if (!spaceDown && !isTouch && e.button !== 1 && e.button !== 2) return;
                      (e.target as HTMLImageElement).setPointerCapture(e.pointerId);
                      startPan(e.clientX, e.clientY);
                    }}
                    onPointerMove={(e) => {
                      if (!touchPanRef.current.active) return;
                      movePan(e.clientX, e.clientY);
                    }}
                    onPointerUp={(e) => {
                      (e.target as HTMLImageElement).releasePointerCapture(e.pointerId);
                      stopPan();
                    }}
                    onPointerLeave={stopPan}
                  />
                )}
              </div>
            ) : (
              <div className={styles.emptyState}>
                <div className={styles.emptyIcon}>⬡</div>
                <span className={styles.emptyTitle}>Drop images here</span>
                <span className={styles.emptySub}>or use the + button →</span>
              </div>
            )}

            {/* Overlay for single-item bg processing */}
            {bgBusy && !bgBatchInfo && selectedItem?.bgStatus === 'processing' && (
              <div className={styles.overlay}>
                <div className={styles.spinner} />
                <span className={styles.overlayStatus}>Processing…</span>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${bgPct}%` }} />
                </div>
                <span className={styles.overlayPct}>{bgPct}%</span>
              </div>
            )}
          </div>
        </div>

        {/* ── Controls ── */}
        <aside className={`${styles.controls}${mobileControlsOpen ? ` ${styles.controlsMobileOpen}` : ''}`}>

          {/* 01 — Export Settings */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>01</span>
              <span className={styles.sectionTitle}>Export Settings</span>
            </div>
            <div className={styles.sectionBody}>

              <div>
                <label className={styles.label}>Dimensions (px)</label>
                <div className={styles.inputRow}>
                  <input
                    type="number"
                    className={`${styles.input} ${styles.inputFlex}`}
                    value={tw}
                    min={1}
                    max={4096}
                    onChange={(e) => changeW(Number(e.target.value))}
                    placeholder="W"
                  />
                  <button
                    className={`${styles.lockBtn}${locked ? ` ${styles.locked}` : ''}`}
                    onClick={() => setExport({ locked: !locked })}
                    title={locked ? 'Unlock aspect ratio' : 'Lock aspect ratio'}
                  >
                    {locked ? '⊟' : '⊞'}
                  </button>
                  <input
                    type="number"
                    className={`${styles.input} ${styles.inputFlex}`}
                    value={th}
                    min={1}
                    max={4096}
                    onChange={(e) => changeH(Number(e.target.value))}
                    placeholder="H"
                  />
                </div>
                {items.length > 1 && (
                  <button
                    className={styles.applyAllBtn}
                    onClick={applyDimensionsToAll}
                    title={`Apply ${tw}×${th} to all ${items.length} images`}
                  >
                    Apply to all ({items.length})
                  </button>
                )}
              </div>

              <div className={styles.sliderGroup}>
                <div className={styles.sliderLabelRow}>
                  <label className={styles.label} style={{ marginBottom: 0 }}>Quality</label>
                  <span className={styles.sliderVal}>{quality}%</span>
                </div>
                <input
                  type="range"
                  className={styles.slider}
                  min={1}
                  max={100}
                  value={quality}
                  disabled={format === 'png'}
                  onChange={(e) => setExport({ quality: Number(e.target.value) })}
                />
              </div>

              <div>
                <label className={styles.label}>Format</label>
                <div className={styles.toggleGroup}>
                  {(['png', 'jpeg', 'webp'] as Format[]).map((f) => (
                    <button
                      key={f}
                      className={`${styles.toggleBtn}${format === f ? ` ${styles.active}` : ''}`}
                      onClick={() => setExport({ format: f })}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* 01.5 — Adjustments */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>01.5</span>
              <span className={styles.sectionTitle}>Adjustments</span>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.sliderGroup}>
                <div className={styles.sliderLabelRow}>
                  <label className={styles.label} style={{ marginBottom: 0 }}>Brightness</label>
                  <span className={styles.sliderVal}>{brightness}%</span>
                </div>
                <input
                  type="range"
                  className={styles.slider}
                  min={0}
                  max={200}
                  value={brightness}
                  onChange={(e) => setExport({ brightness: Number(e.target.value) })}
                />
              </div>
            </div>
          </div>

          {/* 02 — Background Removal */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>02</span>
              <span className={styles.sectionTitle}>Remove Background</span>
            </div>
            <div className={`${styles.sectionBody} ${styles.sectionBodyComfort}`}>

              <div className={`${styles.btnGroup} ${styles.btnGroupLoose}`}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}
                  onClick={() => {
                    if (!selectedId) return;
                    requestBgAction('one');
                  }}
                  disabled={!selectedItem || bgBusy || selectedItem.bgStatus === 'processing'}
                  title="Process only the selected image"
                >
                  {selectedItem?.bgStatus === 'processing' ? '◌ Processing…' : '⬡ Remove BG'}
                </button>
                <button
                  className={`${styles.btn} ${styles.btnFull}`}
                  onClick={() => {
                    requestBgAction('all');
                  }}
                  disabled={
                    !hasItems ||
                    bgBusy
                  }
                  title="Batch process all queued images"
                >
                  {bgBusy && bgBatchInfo ? '◌ Processing All…' : 'Remove BG from All'}
                </button>
              </div>
              <p className={styles.subtleHint}>
                First run downloads a browser AI model ({BG_MODEL_ESTIMATED_SIZE}) one time.
              </p>

              {!touchUpOpen ? (
                <button
                  className={`${styles.btn} ${styles.btnFull}`}
                  onClick={openTouchUp}
                  disabled={!selectedItem || !selectedItem.processedBlob || bgBusy || touchUpBusy}
                  title="Manually erase leftovers or restore missing spots"
                >
                  {touchUpBusy ? '◌ Opening Brush…' : '✎ Touch Up (Brush)'}
                </button>
              ) : (
                <div className={styles.touchToolsCard}>
                  <div className={styles.touchCardHead}>
                    <span className={styles.touchCardTitle}>Touch-up</span>
                    <span className={styles.touchCardSub}>Erase or restore on the preview</span>
                  </div>
                  <div className={styles.touchTools}>
                    <div className={styles.touchField}>
                      <label className={styles.label}>Tool</label>
                      <div className={styles.toggleGroup}>
                        <button
                          className={`${styles.toggleBtn}${touchToolMode === 'erase' ? ` ${styles.active}` : ''}`}
                          onClick={() => setTouchToolMode('erase')}
                        >
                          Erase
                        </button>
                        <button
                          className={`${styles.toggleBtn}${touchToolMode === 'restore' ? ` ${styles.active}` : ''}`}
                          onClick={() => setTouchToolMode('restore')}
                        >
                          Restore
                        </button>
                      </div>
                    </div>
                    <div className={`${styles.sliderGroup} ${styles.sliderGroupComfort}`}>
                      <div className={styles.sliderLabelRowComfort}>
                        <label className={styles.labelComfort}>Brush size</label>
                        <span className={styles.sliderValPill}>{brushSize}px</span>
                      </div>
                      <input
                        type="range"
                        className={`${styles.slider} ${styles.sliderComfort}`}
                        min={1}
                        max={80}
                        value={brushSize}
                        onChange={(e) => setBrushSize(Number(e.target.value))}
                      />
                    </div>
                    <label className={styles.smartToggleComfort}>
                      <input
                        type="checkbox"
                        checked={smartRefine}
                        onChange={(e) => setSmartRefine(e.target.checked)}
                      />
                      <span>Smart area refine</span>
                    </label>
                    <div className={`${styles.sliderGroup} ${styles.sliderGroupComfort}`}>
                      <div className={styles.sliderLabelRowComfort}>
                        <label className={styles.labelComfort}>Select tolerance</label>
                        <span className={styles.sliderValPill}>{smartTolerance}</span>
                      </div>
                      <input
                        type="range"
                        className={`${styles.slider} ${styles.sliderComfort}`}
                        min={8}
                        max={96}
                        value={smartTolerance}
                        disabled={!smartRefine}
                        onChange={(e) => setSmartTolerance(Number(e.target.value))}
                      />
                    </div>
                    <div className={styles.touchActionsRow}>
                      <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} onClick={applyTouchUp}>
                        Apply Touch-Up
                      </button>
                      <button className={`${styles.btn} ${styles.btnFull}`} onClick={cancelTouchUp}>
                        Cancel
                      </button>
                    </div>
                  </div>
                </div>
              )}

              {bgBatchInfo && (
                <div className={styles.batchInfo}>
                  <div className={styles.batchSpinner} />
                  <span className={styles.batchInfoText}>
                    Processing {bgBatchInfo.current} / {bgBatchInfo.total}…
                  </span>
                </div>
              )}

              {touchUpOpen && (
                <p className={styles.hintComfort}>
                  Smart refine grows the edit to similar colors inside the brush. Use smaller tolerance for precise edges.
                </p>
              )}

            </div>
          </div>

          {/* 03 — Publish to Roblox */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>03</span>
              <span className={styles.sectionTitle}>Publish to Roblox</span>
            </div>
            <div className={styles.sectionBody}>
              <div className={styles.publishRow}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}
                  onClick={publishAll}
                  disabled={!hasItems || publishing || !apiKey.trim() || !creatorId.trim()}
                >
                  {publishing
                    ? '◌ Publishing…'
                    : `▶ Publish All (${items.length} image${items.length !== 1 ? 's' : ''})`}
                </button>
                <button
                  className={styles.configGearBtn}
                  onClick={() => setPublishDialogOpen(true)}
                  disabled={!hasItems}
                  title="Open publish config"
                  aria-label="Open publish config"
                >
                  ⚙
                </button>
              </div>
              {selectedItem && (
                <button
                  className={`${styles.btn} ${styles.btnFull}`}
                  onClick={() => publishOne(selectedItem.id)}
                  disabled={publishing || !apiKey.trim() || !creatorId.trim()}
                >
                  {selectedItem.pubStatus === 'publishing' ? '◌ Publishing…' : '▶ Publish Selected'}
                </button>
              )}
              <p className={styles.hint}>
                {finishedCount > 0
                  ? `${finishedCount} / ${items.length} published`
                  : 'Configure once in modal, publish from sidebar.'}
              </p>
            </div>
          </div>

          {/* 04 — Download */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>04</span>
              <span className={styles.sectionTitle}>Download</span>
            </div>
            <div className={styles.sectionBody}>

              <button
                className={`${styles.btn} ${styles.btnGreen} ${styles.btnFull}`}
                onClick={downloadAll}
                disabled={!hasItems}
              >
                ↓ Download All ({items.length})
              </button>

              {selectedItem && (
                <button
                  className={`${styles.btn} ${styles.btnFull}`}
                  onClick={() => downloadOne(selectedItem.id)}
                >
                  ↓ Download Selected
                </button>
              )}

              <p className={styles.hint}>
                {tw}×{th}px · {format.toUpperCase()} · {quality}% quality
              </p>

            </div>
          </div>

        </aside>

        {/* Mobile FABs — hidden on desktop via CSS */}
        <button
          type="button"
          className={`${styles.mobileFab} ${styles.mobileFabQueue}`}
          onClick={() => { setMobileQueueOpen((v) => !v); setMobileControlsOpen(false); }}
          aria-label="Toggle queue panel"
        >
          <span className={styles.mobileFabIcon} aria-hidden="true">⬡</span>
          <span>Queue</span>
          {hasItems && <span className={styles.mobileFabBadge}>{items.length}</span>}
        </button>
        <button
          type="button"
          className={`${styles.mobileFab} ${styles.mobileFabControls}`}
          onClick={() => { setMobileControlsOpen((v) => !v); setMobileQueueOpen(false); }}
          aria-label="Toggle tools panel"
        >
          <span className={styles.mobileFabIcon} aria-hidden="true">⚙</span>
          <span>Tools</span>
        </button>
      </div>}

      {/* Toast */}
      {toast && (
        <div
          className={`${styles.toast} ${
            toast.kind === 'ok'
              ? styles.toastOk
              : toast.kind === 'err'
              ? styles.toastErr
              : styles.toastInfo
          }`}
        >
          {toast.msg}
        </div>
      )}

      {bgNoticeDialogOpen && (
        <div className={`${styles.dialogBackdrop} ${styles.open}`} onClick={closeBgNoticeDialog}>
          <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>First-time AI model download</span>
              <button className={styles.dialogClose} onClick={closeBgNoticeDialog} title="Close dialog">
                ✕
              </button>
            </div>
            <div className={styles.dialogBody}>
              <p className={styles.subtleHint}>
                Pixel Forge will download the browser AI model ({BG_MODEL_ESTIMATED_SIZE}) one time.
                Keep this tab open during the initial download.
              </p>
              <p className={styles.subtleHint}>
                Later Remove BG runs will use the cached model and start much faster.
              </p>
              <div className={`${styles.btnGroup} ${styles.btnGroupLoose}`}>
                <button className={`${styles.btn} ${styles.btnFull}`} onClick={closeBgNoticeDialog}>
                  Cancel
                </button>
                <button className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`} onClick={confirmBgNoticeDialog}>
                  Continue
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {publishDialogMounted && (
        <div
          className={`${styles.dialogBackdrop}${publishDialogVisible ? ` ${styles.open}` : ''}`}
          onClick={closePublishDialog}
        >
          <div className={styles.dialogPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>Publish to Roblox</span>
              <button
                className={styles.dialogClose}
                onClick={closePublishDialog}
                title="Close publish dialog"
              >
                ✕
              </button>
            </div>

            <div className={styles.dialogBody}>
              {/* Help toggle */}
              <button
                className={styles.helpToggle}
                onClick={() => setShowHelp(!showHelp)}
              >
                <span>How does this work?</span>
                <span className={`${styles.helpToggleChevron}${showHelp ? ` ${styles.open}` : ''}`}>▾</span>
              </button>

              {showHelp && (
                <div className={styles.helpCard}>
                  <div className={styles.helpStepRow}>
                    <span className={styles.helpStepNum}>1.</span>
                    <span>
                      Create an API key at{' '}
                      <button
                        className={styles.helpLinkBtn}
                        onClick={() => window.open('https://create.roblox.com/dashboard/credentials', '_blank')}
                      >
                        Creator Hub
                      </button>
                      . Enable <strong>Assets: Write</strong> permission.
                    </span>
                  </div>
                  <div className={styles.helpStepRow}>
                    <span className={styles.helpStepNum}>2.</span>
                    <span>
                      Find your User ID in your Roblox profile URL:{' '}
                      <em>roblox.com/users/[YOUR_ID]/profile</em>. Or use a Group ID for group assets.
                    </span>
                  </div>
                  <div className={styles.helpStepRow}>
                    <span className={styles.helpStepNum}>3.</span>
                    <span>Fill in the fields below and click <strong>Publish All</strong>.</span>
                  </div>
                </div>
              )}

              <div>
                <label className={styles.label}>API Key</label>
                <div className={styles.passWrap}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    className={styles.input}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="rblx_••••••••••••••••••••"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button className={styles.eyeBtn} onClick={() => setShowKey(!showKey)} tabIndex={-1}>
                    {showKey ? '○' : '●'}
                  </button>
                </div>
                <p className={styles.subtleHint}>Saved locally in your browser on this device.</p>
              </div>

              <div className={styles.presetBox}>
                <label className={styles.label}>Presets</label>
                <select
                  className={styles.input}
                  value={selectedPresetId}
                  onChange={(e) => applyPreset(e.target.value)}
                >
                  <option value="">Select preset...</option>
                  {presets.map((preset) => (
                    <option key={preset.id} value={preset.id}>
                      {preset.name}
                    </option>
                  ))}
                </select>
                <input
                  type="text"
                  className={styles.input}
                  value={presetName}
                  onChange={(e) => setPresetName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') saveNewPreset();
                  }}
                  placeholder="Preset name"
                />
                <div className={styles.presetActions}>
                  <button
                    className={styles.smallBtn}
                    onClick={saveNewPreset}
                    disabled={!presetName.trim() || !apiKey.trim() || !creatorId.trim()}
                    title="Save as a new preset"
                  >
                    Save New
                  </button>
                  <button
                    className={styles.smallBtn}
                    onClick={updatePreset}
                    disabled={!selectedPresetId || !presetName.trim() || !apiKey.trim() || !creatorId.trim()}
                    title="Update selected preset with current fields"
                  >
                    Update
                  </button>
                  <button
                    className={styles.smallBtn}
                    onClick={deletePreset}
                    disabled={!selectedPresetId}
                    title="Delete selected preset"
                  >
                    Delete
                  </button>
                </div>
                <p className={styles.subtleHint}>Pick one to load instantly, then Save New or Update as needed.</p>
              </div>

              <div>
                <label className={styles.label}>Creator Type</label>
                <div className={styles.toggleGroup}>
                  {(['user', 'group'] as CreatorType[]).map((t) => (
                    <button
                      key={t}
                      className={`${styles.toggleBtn}${creatorType === t ? ` ${styles.active}` : ''}`}
                      onClick={() => setCreatorType(t)}
                    >
                      {t === 'user' ? 'User' : 'Group'}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className={styles.label}>
                  {creatorType === 'user' ? 'User ID' : 'Group ID'}
                </label>
                <input
                  type="text"
                  className={styles.input}
                  value={creatorId}
                  onChange={(e) => setCreatorId(e.target.value)}
                  placeholder={creatorType === 'user' ? '12345678' : '87654321'}
                />
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ── Changelog Modal ── */}
      {changelogOpen && (
        <div
          className={`${styles.dialogBackdrop} ${styles.open}`}
          onClick={() => {
            setChangelogOpen(false);
            try { window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch { /* ignore */ }
          }}
        >
          <div className={styles.changelogPanel} onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>What&apos;s New</span>
              <button
                className={styles.dialogClose}
                onClick={() => {
                  setChangelogOpen(false);
                  try { window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch { /* ignore */ }
                }}
                title="Close changelog"
              >
                ✕
              </button>
            </div>
            <div className={styles.changelogBody}>
              {CHANGELOG.map((entry, idx) => (
                <div key={entry.version} className={styles.changelogVersion}>
                  <div className={styles.changelogVersionHead}>
                    <span className={`${styles.changelogTag}${idx === 0 ? ` ${styles.changelogTagLatest}` : ''}`}>
                      v{entry.version}
                    </span>
                    <span className={styles.changelogDate}>{entry.date}</span>
                  </div>
                  <span className={styles.changelogTitle}>{entry.title}</span>
                  {entry.features && (
                    <div className={styles.changelogSection}>
                      <span className={styles.changelogSectionLabel}>Features</span>
                      <ul className={styles.changelogList}>
                        {entry.features.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  {entry.improvements && (
                    <div className={styles.changelogSection}>
                      <span className={styles.changelogSectionLabel}>Improvements</span>
                      <ul className={styles.changelogList}>
                        {entry.improvements.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                  {entry.fixes && (
                    <div className={styles.changelogSection}>
                      <span className={styles.changelogSectionLabel}>Fixes</span>
                      <ul className={styles.changelogList}>
                        {entry.fixes.map((f, i) => <li key={i}>{f}</li>)}
                      </ul>
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

    </main>
  );
}
