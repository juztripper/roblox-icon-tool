'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './ImageTool.module.css';
import {
  DEFAULT_NAMING_OPTIONS,
  DEFAULT_VISION_MODEL,
  NAME_STYLE_LABELS,
  buildName,
  type NameStyle,
  type NamingOptions,
} from '../lib/naming';
import { createZip, type ZipEntry } from '../lib/zip';

// ── Types ─────────────────────────────────────────────────────────────────────

type Format = 'png' | 'jpeg' | 'webp';
type CreatorType = 'user' | 'group';
type BgStatus = 'idle' | 'processing' | 'done' | 'error';
type PubStatus = 'idle' | 'queued' | 'publishing' | 'done' | 'error';
type NameStatus = 'idle' | 'loading' | 'done' | 'error' | 'manual';
type ToastKind = 'ok' | 'err' | 'info';
type TouchToolMode = 'erase' | 'restore';
type ActiveTab = 'tool' | 'library' | 'drafts' | 'colors';
type SampleSize = 1 | 3 | 5;
type BgActionType = 'one' | 'all';
type PreviewBg = 'checker' | 'grid' | 'dark' | 'light';
type QueueFilter = 'all' | 'todo' | 'unpublished' | 'published';
type IdFormat = 'lua' | 'json' | 'list';
type InspectorSection = 'name' | 'size' | 'look' | 'cutout' | 'publish' | 'export';
const RBLX_SETTINGS_STORAGE_KEY = 'pixel_forge_publish_settings_v1';
const RBLX_PRESETS_STORAGE_KEY = 'pixel_forge_publish_presets_v1';
const RBLX_LIBRARY_STORAGE_KEY = 'pixel_forge_image_library_v1';
const DRAFTS_STORAGE_KEY = 'pixel_forge_drafts_v1';
const BG_MODEL_NOTICE_ACK_KEY = 'pixel_forge_bg_model_notice_ack_v1';
const BG_MODEL_ESTIMATED_SIZE = '~170MB';
const APP_VERSION = '5.1';
const NAMING_STORAGE_KEY = 'pixel_forge_naming_v1';
const OPENROUTER_KEY_STORAGE_KEY = 'pixel_forge_openrouter_key_v1';
const UI_PREFS_STORAGE_KEY = 'pixel_forge_ui_prefs_v1';
const PICKED_COLORS_STORAGE_KEY = 'pixel_forge_picked_colors_v1';
const LAST_SEEN_VERSION_KEY = 'pixel_forge_last_seen_version';
const THEME_STORAGE_KEY = 'pixel_forge_accent_theme_v1';
const COLOR_MODE_STORAGE_KEY = 'pixel_forge_color_mode_v1';

type ColorMode = 'system' | 'dark' | 'light';

interface AccentTheme {
  id: string;
  label: string;
  ink: string;
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
    ink: '#ffffff',
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
    ink: '#ffffff',
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
    ink: '#ffffff',
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
    ink: '#ffffff',
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
    ink: '#ffffff',
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
    ink: '#1f1600',
    label: 'Honey',
    base: '#fbbf24',
    dim: '#c89612',
    hover: '#fccb4a',
    light: '#fdd775',
    glow: 'rgba(251, 191, 36, 0.15)',
    glowStrong: 'rgba(251, 191, 36, 0.3)',
  },
];

const DEFAULT_ACCENT = ACCENT_THEMES[0];

function applyAccentTheme(theme: AccentTheme) {
  if (typeof document === 'undefined') return;
  const root = document.documentElement;
  root.style.setProperty('--orange', theme.base);
  root.style.setProperty('--orange-dim', theme.dim);
  root.style.setProperty('--orange-hover', theme.hover);
  root.style.setProperty('--orange-light', theme.light);
  root.style.setProperty('--orange-glow', theme.glow);
  root.style.setProperty('--orange-glow-strong', theme.glowStrong);
  root.style.setProperty('--accent-ink', theme.ink);
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
    version: '5.1',
    date: 'Nov 18, 2026',
    title: 'Colour Picker',
    features: [
      'New Colors tab — drop, paste or browse an image (or send over the workbench image), hover with a magnifier and click to pick a colour',
      'Copy any colour as HEX, RGB, Color3.fromRGB, Color3.fromHex or CSS',
      'Sample a single pixel or average a 3×3 / 5×5 area',
      'Picked colours are saved in your browser and can be copied as a Luau table or a hex list',
      'Main colours of the image are detected automatically — click one to add it',
    ],
  },
  {
    version: '5.0',
    date: 'Nov 18, 2026',
    title: 'Workbench Layout & Working AI Naming',
    features: [
      'Reworked workbench layout — preview with a live export frame, a two-column queue with filters, and a collapsible inspector',
      'Naming settings — pick snake_case, PascalCase, camelCase, kebab-case or Title Case, word count, prefix/suffix and a context hint for your game',
      'AI naming now suggests alternatives you can swap in with one click, plus an AI Name All button',
      'Download all as a single ZIP, with an asset_ids.lua module included when images are published',
      'Copy published IDs as a Luau table, JSON or a plain list — from the workbench or the library',
      'Size presets for common Roblox uses, padding around the subject and an optional background fill',
      'Preview on checkerboard, dot grid, dark or light backgrounds, and hold Compare to see the original',
      'Keyboard shortcuts — press ? to see them',
      'Library search and filtering',
    ],
    fixes: [
      'AI naming works again — new default vision model with automatic fallbacks, reasoning turned off so answers aren’t cut off, and much more forgiving output parsing',
      'Images are shrunk before being sent for naming, so large files no longer fail on Vercel’s upload limit',
      'Naming requests are throttled so big batches don’t hit rate limits',
      'Publish All skips images that are already published instead of uploading duplicates',
      'Uploads that are still processing on Roblox are re-checked automatically instead of showing as failed',
      'Asset names are trimmed to Roblox’s 50-character limit before upload',
      'Pasted and imported images get unique names instead of all being called pasted.png',
      'Downloads no longer occasionally fail in Firefox and Safari',
      'Undo/redo in touch-up now works with Cmd on macOS',
    ],
  },
  {
    version: '4.4',
    date: 'May 13, 2026',
    title: 'Manual Image Naming',
    features: [
      'Rename any image manually — click the Rename button or double-click the filename in the preview bar (or queue thumbnail) to edit it inline',
      'Re-run AI naming on demand with the new AI Name button, useful after a failed request or when you want a different suggestion',
    ],
    improvements: [
      'AI auto-naming still runs by default on every import',
      'Manual edits are sticky — an in-flight AI request won’t overwrite a name you’ve already typed',
      'File extensions and unique-name handling are preserved automatically while editing',
    ],
  },
  {
    version: '4.3.1',
    date: 'May 7, 2026',
    title: 'Background Removal Aspect Fix',
    fixes: [
      'Removing the background no longer distorts the subject on export — the auto-crop now pads the result back to the source aspect ratio so letterbox and stretch exports both scale uniformly',
    ],
  },
  {
    version: '4.3',
    date: 'May 3, 2026',
    title: 'Mobile Support & Smarter Sizing',
    features: [
      'Mobile layout (≤900px) — Queue and Tools panels become slide-in drawers triggered by FABs, with backdrop dismiss and auto-close on tab change or image select',
      'Single-finger pan on the preview image for touchscreens',
      'New imports now seed the export width/height from the source image’s natural dimensions instead of the 512×512 default',
    ],
    improvements: [
      'Disabling the aspect-ratio lock now stretches the image to fill the export canvas instead of fitting it with letterboxing',
      'Aspect lock starts unlocked when the imported image isn’t square so editing one dimension no longer snaps to a square',
      'Dialog, library, and import bar reflow for narrow viewports; 16px form inputs suppress iOS auto-zoom; 100dvh + safe-area-aware FAB/toast positioning for iOS Safari',
    ],
  },
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
    padding?: number; fill?: string | null; locked?: boolean;
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
  // Empty space around the subject, as a percentage of the shorter side.
  padding: number;
  // Solid background colour behind the subject, or null for transparent.
  fill: string | null;
}

interface ImageItem {
  id: string;
  originalBlob: Blob;
  processedBlob: Blob | null;
  previewUrl: string;
  fileName: string;
  originalFileName: string;
  nameStatus: NameStatus;
  // Raw words from the AI so the name can be re-styled without another request.
  nameWords?: string[];
  nameAlts?: string[][];
  nameError?: string;
  dims: { w: number; h: number } | null;
  cropRect?: {
    // Source rect of the subject within the original image.
    x: number; y: number; w: number; h: number;
    // Where the subject sits within the (possibly padded) processed canvas
    // and the canvas's full dimensions. When omitted (legacy items) the
    // subject is assumed to fill the processed canvas: destX=destY=0,
    // destW=w, destH=h.
    destX?: number; destY?: number; destW?: number; destH?: number;
  } | null;
  bgStatus: BgStatus;
  bgError?: string;
  pubStatus: PubStatus;
  pubAssetId?: string;
  pubError?: string;
  pubOperationPath?: string;
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
  tw: 512, th: 512, format: 'png', quality: 90, brightness: 100, locked: true, padding: 0, fill: null,
};

interface SizePreset {
  label: string;
  hint: string;
  w: number;
  h: number;
}

const SIZE_PRESETS: SizePreset[] = [
  { label: '1024', hint: 'Max decal size', w: 1024, h: 1024 },
  { label: '512', hint: 'Game icon, badge, pass', w: 512, h: 512 },
  { label: '256', hint: 'UI icon', w: 256, h: 256 },
  { label: '128', hint: 'Small UI icon', w: 128, h: 128 },
  { label: '1920×1080', hint: 'Game thumbnail', w: 1920, h: 1080 },
];

const FILL_SWATCHES = ['#ffffff', '#000000', '#1e2129', '#ffd166', '#5ec2ff', '#ff6b8b'];

const PREVIEW_BGS: { id: PreviewBg; label: string }[] = [
  { id: 'checker', label: 'Checker' },
  { id: 'grid', label: 'Grid' },
  { id: 'dark', label: 'Dark' },
  { id: 'light', label: 'Light' },
];

const SHORTCUTS: { keys: string; action: string }[] = [
  { keys: '↑ / ↓', action: 'Previous / next image' },
  { keys: 'B', action: 'Remove background' },
  { keys: 'N', action: 'AI name selected image' },
  { keys: 'R or F2', action: 'Rename selected image' },
  { keys: 'D', action: 'Download selected image' },
  { keys: 'C (hold)', action: 'Compare with original' },
  { keys: 'Delete', action: 'Remove from queue' },
  { keys: 'Ctrl/Cmd + Z', action: 'Undo touch-up stroke (Shift to redo)' },
  { keys: 'Space + drag', action: 'Pan the preview' },
  { keys: '?', action: 'Show shortcuts' },
];

// ── AI naming throttle ────────────────────────────────────────────────────────
// Large batches used to fire every request at once and get rate limited.

const NAME_CONCURRENCY = 3;
let nameActive = 0;
const nameWaiters: (() => void)[] = [];

async function withNameSlot<T>(fn: () => Promise<T>): Promise<T> {
  if (nameActive >= NAME_CONCURRENCY) {
    await new Promise<void>((resolve) => nameWaiters.push(resolve));
  }
  nameActive++;
  try {
    return await fn();
  } finally {
    nameActive--;
    nameWaiters.shift()?.();
  }
}

/** Shrink an image before sending it for naming — keeps requests small and fast. */
async function downscaleForNaming(source: Blob, maxSide = 512): Promise<Blob> {
  const img = await blobToImage(source);
  const scale = Math.min(1, maxSide / Math.max(img.naturalWidth, img.naturalHeight));
  const w = Math.max(1, Math.round(img.naturalWidth * scale));
  const h = Math.max(1, Math.round(img.naturalHeight * scale));
  const canvas = document.createElement('canvas');
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext('2d');
  if (!ctx) return source;
  // Vision models see transparency as black; a neutral grey keeps both dark
  // and light subjects readable.
  ctx.fillStyle = '#d9d9d9';
  ctx.fillRect(0, 0, w, h);
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(img, 0, 0, w, h);
  return new Promise((resolve) => {
    canvas.toBlob((b) => resolve(b ?? source), 'image/jpeg', 0.9);
  });
}

function luaKey(name: string): string {
  return /^[A-Za-z_][A-Za-z0-9_]*$/.test(name) ? name : `["${name.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"]`;
}

/** Build a Luau module mapping asset names to rbxassetid strings. */
function buildLuaIdTable(entries: { name: string; assetId: string }[]): string {
  const lines = entries.map((e) => `\t${luaKey(e.name)} = "rbxassetid://${e.assetId}",`);
  return `-- Generated by Pixel Forge\nreturn {\n${lines.join('\n')}\n}\n`;
}

function triggerDownload(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = fileName;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoking right away cancels the download in some browsers.
  setTimeout(() => URL.revokeObjectURL(url), 4000);
}

// ── Colour picker helpers ─────────────────────────────────────────────────────

interface RGBA {
  r: number;
  g: number;
  b: number;
  a: number;
}

interface PickedColor extends RGBA {
  id: string;
  source: string;
}

function toHex({ r, g, b }: RGBA): string {
  return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('').toUpperCase()}`;
}

function colorFormats(c: RGBA): { label: string; value: string }[] {
  const hex = toHex(c);
  return [
    { label: 'HEX', value: hex },
    { label: 'RGB', value: `${c.r}, ${c.g}, ${c.b}` },
    { label: 'Color3', value: `Color3.fromRGB(${c.r}, ${c.g}, ${c.b})` },
    { label: 'Hex Color3', value: `Color3.fromHex("${hex}")` },
    { label: 'CSS', value: c.a < 255 ? `rgba(${c.r}, ${c.g}, ${c.b}, ${(c.a / 255).toFixed(2)})` : `rgb(${c.r}, ${c.g}, ${c.b})` },
  ];
}

/** Dark text on light swatches, light text on dark ones. */
function inkFor({ r, g, b }: RGBA): string {
  return 0.2126 * r + 0.7152 * g + 0.0722 * b > 150 ? '#111111' : '#ffffff';
}

/** Most common colours in an image — 4-bit buckets, merged when close, ignoring transparent pixels. */
function extractPalette(img: ImageData, count = 10): RGBA[] {
  const { data, width, height } = img;
  const total = width * height;
  const step = Math.max(1, Math.floor(total / 200_000));
  const buckets = new Map<number, { r: number; g: number; b: number; n: number }>();
  for (let i = 0; i < total; i += step) {
    const o = i * 4;
    if (data[o + 3] < 128) continue;
    const key = ((data[o] >> 4) << 8) | ((data[o + 1] >> 4) << 4) | (data[o + 2] >> 4);
    const bucket = buckets.get(key);
    if (bucket) {
      bucket.r += data[o]; bucket.g += data[o + 1]; bucket.b += data[o + 2]; bucket.n++;
    } else {
      buckets.set(key, { r: data[o], g: data[o + 1], b: data[o + 2], n: 1 });
    }
  }
  const sorted = Array.from(buckets.values()).sort((a, b) => b.n - a.n);
  const out: RGBA[] = [];
  for (const bucket of sorted) {
    const c = { r: Math.round(bucket.r / bucket.n), g: Math.round(bucket.g / bucket.n), b: Math.round(bucket.b / bucket.n), a: 255 };
    const tooClose = out.some((o) => (o.r - c.r) ** 2 + (o.g - c.g) ** 2 + (o.b - c.b) ** 2 < 900);
    if (!tooClose) out.push(c);
    if (out.length >= count) break;
  }
  return out;
}

async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

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
  padding: number = 0,
  fill: string | null = null,
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
      const inset = Math.round(Math.min(w, h) * clamp(padding, 0, 45) / 100);
      const boxW = Math.max(1, w - inset * 2);
      const boxH = Math.max(1, h - inset * 2);
      if (stretch) {
        dx = inset;
        dy = inset;
        dw = boxW;
        dh = boxH;
      } else {
        const scale = Math.min(boxW / srcW, boxH / srcH);
        dw = srcW * scale;
        dh = srcH * scale;
        dx = (w - dw) / 2;
        dy = (h - dh) / 2;
      }
      // JPEG has no alpha; give it a predictable background.
      if (fill || fmt === 'jpeg') {
        ctx.fillStyle = fill ?? '#ffffff';
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
): Promise<{
  blob: Blob;
  rect: {
    x: number; y: number; w: number; h: number;
    destX: number; destY: number; destW: number; destH: number;
  } | null;
}> {
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

  // Pad the cropped result back to the source aspect ratio. Without this the
  // tight bounding box (e.g. 200×280 on a 256×256 source) gets stretched when
  // the user later exports without aspect-lock, distorting the subject.
  // Centering the subject in an aspect-matched canvas means subsequent export
  // resizing is uniform regardless of lock state.
  const srcAspect = srcW / srcH;
  let outW = cropW;
  let outH = cropH;
  if (cropW / cropH > srcAspect) {
    outH = Math.max(cropH, Math.round(cropW / srcAspect));
  } else if (cropW / cropH < srcAspect) {
    outW = Math.max(cropW, Math.round(cropH * srcAspect));
  }
  const destX = Math.round((outW - cropW) / 2);
  const destY = Math.round((outH - cropH) / 2);

  const cropCanvas = document.createElement('canvas');
  cropCanvas.width = outW;
  cropCanvas.height = outH;
  const cropCtx = cropCanvas.getContext('2d');
  if (!cropCtx) return { blob: source, rect: null };

  cropCtx.clearRect(0, 0, outW, outH);
  cropCtx.drawImage(canvas, sx0, sy0, cropW, cropH, destX, destY, cropW, cropH);
  const blob = await canvasToPngBlob(cropCanvas);
  return {
    blob,
    rect: { x: sx0, y: sy0, w: cropW, h: cropH, destX, destY, destW: outW, destH: outH },
  };
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

// ── Inspector section ───────────────────────────────────────────────────────

function Section({ num, title, aside, open, onToggle, children }: {
  num: string;
  title: string;
  aside?: React.ReactNode;
  open: boolean;
  onToggle: () => void;
  children: React.ReactNode;
}) {
  return (
    <section className={`${styles.section}${open ? ` ${styles.sectionOpen}` : ''}`}>
      <button type="button" className={styles.sectionHead} onClick={onToggle} aria-expanded={open}>
        <span className={styles.sectionChevron} aria-hidden="true" />
        <span className={styles.sectionNum}>{num}</span>
        <span className={styles.sectionTitle}>{title}</span>
        {aside && <span className={styles.sectionAside}>{aside}</span>}
      </button>
      {open && <div className={styles.sectionBody}>{children}</div>}
    </section>
  );
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

  // AI naming settings
  const [namingOptions, setNamingOptions] = useState<NamingOptions>(DEFAULT_NAMING_OPTIONS);
  const [openRouterKey, setOpenRouterKey] = useState('');
  const [namingServer, setNamingServer] = useState<{ configured: boolean; defaultModel: string } | null>(null);
  const [namingDialogOpen, setNamingDialogOpen] = useState(false);
  const namingRef = useRef(namingOptions);
  const openRouterKeyRef = useRef(openRouterKey);
  useEffect(() => { namingRef.current = namingOptions; }, [namingOptions]);
  useEffect(() => { openRouterKeyRef.current = openRouterKey; }, [openRouterKey]);

  // Workbench UI
  const [previewBg, setPreviewBg] = useState<PreviewBg>('checker');
  const [comparing, setComparing] = useState(false);
  const [queueFilter, setQueueFilter] = useState<QueueFilter>('all');
  const [openSections, setOpenSections] = useState<Record<InspectorSection, boolean>>({
    name: true, size: true, look: false, cutout: true, publish: true, export: true,
  });
  const [skipPublished, setSkipPublished] = useState(true);
  const [shortcutsOpen, setShortcutsOpen] = useState(false);
  const [librarySearch, setLibrarySearch] = useState('');
  const [zipBusy, setZipBusy] = useState(false);

  // Colour picker tab
  const [pickerImage, setPickerImage] = useState<{ url: string; name: string; w: number; h: number } | null>(null);
  const [hoverColor, setHoverColor] = useState<(RGBA & { x: number; y: number }) | null>(null);
  const [loupePos, setLoupePos] = useState<{ x: number; y: number } | null>(null);
  const [pickedColors, setPickedColors] = useState<PickedColor[]>([]);
  const [activeColorId, setActiveColorId] = useState<string | null>(null);
  const [sampleSize, setSampleSize] = useState<SampleSize>(1);
  const [palette, setPalette] = useState<RGBA[]>([]);
  const [pickerDragging, setPickerDragging] = useState(false);
  const pickerCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const pickerDataRef = useRef<ImageData | null>(null);
  const loupeRef = useRef<HTMLCanvasElement | null>(null);
  const activeTabRef = useRef<ActiveTab>('tool');

  // Manual name editing — only one item is editable at a time, keyed by id.
  const [editingNameId, setEditingNameId] = useState<string | null>(null);
  const [editingNameDraft, setEditingNameDraft] = useState('');
  const nameInputRef = useRef<HTMLInputElement | null>(null);

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

  // If the item being renamed disappears (deleted, swapped tab, etc.), drop
  // the editing state instead of stranding the input on a missing item.
  useEffect(() => {
    if (!editingNameId) return;
    if (!items.some((i) => i.id === editingNameId)) {
      setEditingNameId(null);
      setEditingNameDraft('');
    }
  }, [items, editingNameId]);

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
      if (!touchUpOpenRef.current || !(e.ctrlKey || e.metaKey) || e.altKey || e.key.toLowerCase() !== 'z') return;
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

    try {
      const rawNaming = window.localStorage.getItem(NAMING_STORAGE_KEY);
      if (rawNaming) {
        const parsed = JSON.parse(rawNaming) as Partial<NamingOptions>;
        setNamingOptions({
          ...DEFAULT_NAMING_OPTIONS,
          ...parsed,
          style: parsed.style && parsed.style in NAME_STYLE_LABELS ? parsed.style : DEFAULT_NAMING_OPTIONS.style,
          maxWords: clamp(Number(parsed.maxWords) || 2, 1, 4),
        });
      }
      const storedKey = window.localStorage.getItem(OPENROUTER_KEY_STORAGE_KEY);
      if (storedKey) setOpenRouterKey(storedKey);
    } catch { /* ignore */ }

    try {
      const rawUi = window.localStorage.getItem(UI_PREFS_STORAGE_KEY);
      if (rawUi) {
        const parsed = JSON.parse(rawUi) as Partial<{
          previewBg: PreviewBg;
          openSections: Record<InspectorSection, boolean>;
          skipPublished: boolean;
        }>;
        if (parsed.previewBg && PREVIEW_BGS.some((b) => b.id === parsed.previewBg)) setPreviewBg(parsed.previewBg);
        if (parsed.openSections) setOpenSections((prev) => ({ ...prev, ...parsed.openSections }));
        if (typeof parsed.skipPublished === 'boolean') setSkipPublished(parsed.skipPublished);
      }
    } catch { /* ignore */ }

    try {
      const rawColors = window.localStorage.getItem(PICKED_COLORS_STORAGE_KEY);
      if (rawColors) {
        const parsed = JSON.parse(rawColors) as unknown;
        if (Array.isArray(parsed)) {
          setPickedColors(parsed.filter((c): c is PickedColor =>
            typeof (c as PickedColor).id === 'string' &&
            [(c as PickedColor).r, (c as PickedColor).g, (c as PickedColor).b].every((v) => typeof v === 'number'),
          ).map((c) => ({ ...c, a: typeof c.a === 'number' ? c.a : 255, source: c.source ?? '' })).slice(0, 48));
        }
      }
    } catch { /* ignore */ }

    setStorageHydrated(true);
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(PICKED_COLORS_STORAGE_KEY, JSON.stringify(pickedColors));
    } catch { /* ignore */ }
  }, [pickedColors, storageHydrated]);

  useEffect(() => { activeTabRef.current = activeTab; }, [activeTab]);

  // Ask the server whether naming has a key configured.
  useEffect(() => {
    let cancelled = false;
    fetch('/api/auto-name')
      .then((r) => (r.ok ? r.json() : null))
      .then((data: { configured?: boolean; defaultModel?: string } | null) => {
        if (cancelled || !data) return;
        setNamingServer({ configured: Boolean(data.configured), defaultModel: data.defaultModel ?? DEFAULT_VISION_MODEL });
      })
      .catch(() => { /* offline or route missing — leave unknown */ });
    return () => { cancelled = true; };
  }, []);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(NAMING_STORAGE_KEY, JSON.stringify(namingOptions));
      if (openRouterKey.trim()) window.localStorage.setItem(OPENROUTER_KEY_STORAGE_KEY, openRouterKey.trim());
      else window.localStorage.removeItem(OPENROUTER_KEY_STORAGE_KEY);
    } catch { /* ignore */ }
  }, [namingOptions, openRouterKey, storageHydrated]);

  useEffect(() => {
    if (!storageHydrated) return;
    try {
      window.localStorage.setItem(UI_PREFS_STORAGE_KEY, JSON.stringify({ previewBg, openSections, skipPublished }));
    } catch { /* ignore */ }
  }, [previewBg, openSections, skipPublished, storageHydrated]);

  // Apply accent theme whenever it changes
  useEffect(() => {
    const theme = ACCENT_THEMES.find((t) => t.id === accentThemeId) ?? DEFAULT_ACCENT;
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
    const { tw: sTw, th: sTh, brightness: sBr, locked: sLocked, padding: sPad, fill: sFill } = selectedItem.exportSettings;
    canvasExport(src, sTw, sTh, 'png', 100, sBr, !sLocked, sPad ?? 0, sFill ?? null).then((blob) => {
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

  // Turn AI words into a filename using the current naming style, keeping the
  // original extension and making sure no two queue items share a name.
  const applyWordsToItem = useCallback((id: string, words: string[], alts?: string[][]) => {
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (!target) return prev;
      const base = buildName(words, namingRef.current) || splitNameAndExt(target.originalFileName).base;
      const ext = splitNameAndExt(target.originalFileName).ext || '.png';
      const existing = prev.filter((i) => i.id !== id).map((i) => i.fileName);
      const unique = ensureUniqueFileName(`${base}${ext}`, existing);
      return prev.map((i) =>
        i.id === id
          ? {
              ...i,
              fileName: unique,
              nameStatus: 'done' as NameStatus,
              nameWords: words,
              nameAlts: alts ?? i.nameAlts,
              nameError: undefined,
            }
          : i,
      );
    });
  }, []);

  const autoNameOne = useCallback(async (id: string, source: Blob) => {
    // Don't clobber a name the user has typed themselves. If they renamed
    // before the API call even starts, bail out completely.
    let skipped = false;
    setItems((prev) =>
      prev.map((i) => {
        if (i.id !== id) return i;
        if (i.nameStatus === 'manual') { skipped = true; return i; }
        return { ...i, nameStatus: 'loading' as NameStatus, nameError: undefined };
      }),
    );
    if (skipped) return;

    const applyFailure = (message: string) => {
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          if (i.nameStatus === 'manual') return i;
          return { ...i, nameStatus: 'error' as NameStatus, nameError: message };
        }),
      );
    };

    try {
      const data = await withNameSlot(async () => {
        const opts = namingRef.current;
        const small = await downscaleForNaming(source).catch(() => source);
        const fd = new FormData();
        fd.append('image', small, 'source.jpg');
        fd.append('maxWords', String(opts.maxWords));
        if (opts.context.trim()) fd.append('context', opts.context.trim());
        if (opts.model.trim()) fd.append('model', opts.model.trim());
        if (openRouterKeyRef.current.trim()) fd.append('apiKey', openRouterKeyRef.current.trim());
        const res = await fetch('/api/auto-name', { method: 'POST', body: fd });
        const json = (await res.json().catch(() => ({}))) as {
          words?: string[];
          alternatives?: string[][];
          error?: string;
        };
        if (!res.ok) throw new Error(json.error ?? `Naming failed (HTTP ${res.status})`);
        return json;
      });

      const words = (data.words ?? []).filter(Boolean);
      if (words.length === 0) { applyFailure('No name returned'); return; }

      // User manually renamed while we were waiting — keep their name.
      const current = itemsRef.current.find((i) => i.id === id);
      if (!current || current.nameStatus === 'manual') return;
      applyWordsToItem(id, words, data.alternatives ?? []);
    } catch (err: unknown) {
      applyFailure(err instanceof Error ? err.message : 'Naming failed');
    }
  }, [applyWordsToItem]);

  // Swap the current name with one of the AI's alternative suggestions.
  const pickAlternativeName = useCallback((id: string, words: string[]) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    const others = (item.nameAlts ?? []).filter((a) => a.join(' ') !== words.join(' '));
    if (item.nameWords && item.nameWords.length > 0) others.unshift(item.nameWords);
    applyWordsToItem(id, words, others.slice(0, 3));
  }, [applyWordsToItem]);

  // Re-style every AI-named image after the naming style changes.
  const restyleAllNames = useCallback(() => {
    const targets = itemsRef.current.filter((i) => i.nameStatus === 'done' && i.nameWords && i.nameWords.length > 0);
    for (const item of targets) applyWordsToItem(item.id, item.nameWords as string[]);
    return targets.length;
  }, [applyWordsToItem]);

  // Apply a user-typed name. Preserves the existing extension and de-dupes
  // against other items so two images can't share a name.
  const renameItem = useCallback((id: string, rawBase: string) => {
    const trimmed = rawBase.trim();
    if (!trimmed) return false;
    // Strip any extension the user typed so it can't shadow the real one.
    const typedBase = splitNameAndExt(trimmed).base || trimmed;
    setItems((prev) => {
      const target = prev.find((i) => i.id === id);
      if (!target) return prev;
      const ext = splitNameAndExt(target.fileName).ext || splitNameAndExt(target.originalFileName).ext;
      const candidate = `${typedBase}${ext}`;
      if (candidate === target.fileName && target.nameStatus === 'manual') return prev;
      const existing = prev.filter((i) => i.id !== id).map((i) => i.fileName);
      const unique = ensureUniqueFileName(candidate, existing);
      return prev.map((i) =>
        i.id === id ? { ...i, fileName: unique, nameStatus: 'manual' as NameStatus } : i,
      );
    });
    return true;
  }, []);

  const beginEditName = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    const source = item.nameStatus === 'loading' ? item.originalFileName : item.fileName;
    setEditingNameId(id);
    setEditingNameDraft(splitNameAndExt(source).base || source);
    // Focus + select once the input renders.
    requestAnimationFrame(() => {
      const el = nameInputRef.current;
      if (el) { el.focus(); el.select(); }
    });
  }, []);

  const cancelEditName = useCallback(() => {
    setEditingNameId(null);
    setEditingNameDraft('');
  }, []);

  const commitEditName = useCallback(() => {
    if (!editingNameId) return;
    const applied = renameItem(editingNameId, editingNameDraft);
    if (!applied) {
      // Empty input — treat as cancel rather than blanking the name.
      cancelEditName();
      return;
    }
    setEditingNameId(null);
    setEditingNameDraft('');
  }, [editingNameId, editingNameDraft, renameItem, cancelEditName]);

  // Re-run AI naming for one item (used when the user wants to try again
  // after a failure or wants to replace their manual name).
  const retryAutoName = useCallback((id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    // Clear the 'manual' status so autoNameOne is willing to overwrite.
    setItems((prev) =>
      prev.map((i) =>
        i.id === id ? { ...i, nameStatus: 'idle' as NameStatus } : i,
      ),
    );
    void autoNameOne(id, activeBlob(item));
  }, [autoNameOne]);

  const autoNameAll = useCallback(() => {
    const targets = itemsRef.current.filter((i) => i.nameStatus !== 'manual' && i.nameStatus !== 'loading');
    if (targets.length === 0) { showToast('Nothing to name — renamed images are left alone', 'info'); return; }
    for (const item of targets) void autoNameOne(item.id, activeBlob(item));
    showToast(`Naming ${targets.length} image${targets.length === 1 ? '' : 's'}…`, 'info');
  }, [autoNameOne, showToast]);

  // ── Add images ────────────────────────────────────────────────────────────────

  const addImages = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (arr.length === 0) return;

    const autoName = namingRef.current.autoOnImport;
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
          nameStatus: (autoName ? 'loading' : 'idle') as NameStatus,
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
      const names = prev.map((i) => i.fileName);
      const unique = newItems.map((item) => {
        const fileName = ensureUniqueFileName(item.fileName, names);
        names.push(fileName);
        return { ...item, fileName, originalFileName: fileName };
      });
      return [...prev, ...unique];
    });

    // Auto-select the first newly added item if nothing selected
    setSelectedId((prev) => prev ?? newItems[0].id);

    // Best-effort AI naming in background.
    if (autoName) {
      for (const item of newItems) void autoNameOne(item.id, item.originalBlob);
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
      const current = itemsRef.current;
      const idx = current.findIndex((i) => i.id === id);
      const remaining = current.filter((i) => i.id !== id);
      if (remaining.length === 0) return null;
      return remaining[Math.max(0, idx - 1)].id;
    });
  }, []);

  const clearQueue = useCallback(() => {
    if (itemsRef.current.length === 0) return;
    if (!window.confirm(`Remove all ${itemsRef.current.length} images from the queue?`)) return;
    for (const item of itemsRef.current) URL.revokeObjectURL(item.previewUrl);
    setItems([]);
    setSelectedId(null);
  }, []);

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
        if (activeTabRef.current === 'colors') {
          void loadPickerImage(files[0], 'Pasted image');
          return;
        }
        addImages(files);
        showToast(`${files.length} image${files.length > 1 ? 's' : ''} pasted`, 'ok');
      }
    };
    window.addEventListener('paste', handler);
    return () => window.removeEventListener('paste', handler);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [addImages, showToast]);

  // ── Colour picker ─────────────────────────────────────────────────────────────

  const loadPickerImage = useCallback(async (blob: Blob, name: string) => {
    try {
      const img = await blobToImage(blob);
      const url = URL.createObjectURL(blob);
      setPickerImage((prev) => {
        if (prev) URL.revokeObjectURL(prev.url);
        return { url, name, w: img.naturalWidth, h: img.naturalHeight };
      });
      setHoverColor(null);
      setActiveTab('colors');
    } catch {
      showToast('Could not read that image', 'err');
    }
  }, [showToast]);

  // Draw the picker image to its canvas and keep the pixels around for sampling.
  useEffect(() => {
    if (!pickerImage || activeTab !== 'colors') return;
    let cancelled = false;
    const img = new Image();
    img.onload = () => {
      const canvas = pickerCanvasRef.current;
      if (cancelled || !canvas) return;
      canvas.width = img.naturalWidth;
      canvas.height = img.naturalHeight;
      const ctx = canvas.getContext('2d', { willReadFrequently: true });
      if (!ctx) return;
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      ctx.drawImage(img, 0, 0);
      const data = ctx.getImageData(0, 0, canvas.width, canvas.height);
      pickerDataRef.current = data;
      setPalette(extractPalette(data));
    };
    img.src = pickerImage.url;
    return () => { cancelled = true; };
  }, [pickerImage, activeTab]);

  useEffect(() => () => {
    if (pickerImage) URL.revokeObjectURL(pickerImage.url);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const sampleAt = useCallback((clientX: number, clientY: number): (RGBA & { x: number; y: number }) | null => {
    const canvas = pickerCanvasRef.current;
    const data = pickerDataRef.current;
    if (!canvas || !data) return null;
    const rect = canvas.getBoundingClientRect();
    if (rect.width <= 0 || rect.height <= 0) return null;
    const x = Math.floor(((clientX - rect.left) / rect.width) * data.width);
    const y = Math.floor(((clientY - rect.top) / rect.height) * data.height);
    if (x < 0 || y < 0 || x >= data.width || y >= data.height) return null;
    const half = Math.floor(sampleSize / 2);
    let r = 0, g = 0, b = 0, a = 0, n = 0;
    for (let dy = -half; dy <= half; dy++) {
      for (let dx = -half; dx <= half; dx++) {
        const sx = x + dx;
        const sy = y + dy;
        if (sx < 0 || sy < 0 || sx >= data.width || sy >= data.height) continue;
        const o = (sy * data.width + sx) * 4;
        r += data.data[o]; g += data.data[o + 1]; b += data.data[o + 2]; a += data.data[o + 3];
        n++;
      }
    }
    return { r: Math.round(r / n), g: Math.round(g / n), b: Math.round(b / n), a: Math.round(a / n), x, y };
  }, [sampleSize]);

  const drawLoupe = useCallback((x: number, y: number) => {
    const loupe = loupeRef.current;
    const canvas = pickerCanvasRef.current;
    if (!loupe || !canvas) return;
    const ctx = loupe.getContext('2d');
    if (!ctx) return;
    const cells = 11;
    const cell = loupe.width / cells;
    const half = Math.floor(cells / 2);
    ctx.imageSmoothingEnabled = false;
    ctx.clearRect(0, 0, loupe.width, loupe.height);
    ctx.drawImage(canvas, x - half, y - half, cells, cells, 0, 0, loupe.width, loupe.height);
    ctx.strokeStyle = 'rgba(255,255,255,0.9)';
    ctx.lineWidth = 2;
    const box = cell * sampleSize;
    const start = (half - Math.floor(sampleSize / 2)) * cell;
    ctx.strokeRect(start, start, box, box);
    ctx.strokeStyle = 'rgba(0,0,0,0.6)';
    ctx.lineWidth = 1;
    ctx.strokeRect(start - 1.5, start - 1.5, box + 3, box + 3);
  }, [sampleSize]);

  const handlePickerMove = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sampleAt(e.clientX, e.clientY);
    setHoverColor(c);
    const stage = (e.currentTarget.parentElement as HTMLElement | null)?.getBoundingClientRect();
    if (c && stage) {
      setLoupePos({ x: e.clientX - stage.left, y: e.clientY - stage.top });
      drawLoupe(c.x, c.y);
    } else {
      setLoupePos(null);
    }
  }, [sampleAt, drawLoupe]);

  const addPickedColor = useCallback((c: RGBA, source: string) => {
    const id = uid();
    setPickedColors((prev) => {
      // Don't stack the same colour twice in a row.
      if (prev[0] && toHex(prev[0]) === toHex(c)) {
        setActiveColorId(prev[0].id);
        return prev;
      }
      setActiveColorId(id);
      return [{ id, r: c.r, g: c.g, b: c.b, a: c.a, source }, ...prev].slice(0, 48);
    });
  }, []);

  const handlePickerClick = useCallback((e: React.PointerEvent<HTMLCanvasElement>) => {
    const c = sampleAt(e.clientX, e.clientY);
    if (!c) return;
    addPickedColor(c, pickerImage?.name ?? '');
  }, [sampleAt, addPickedColor, pickerImage]);

  const copyColorValue = useCallback(async (value: string) => {
    const ok = await copyText(value);
    showToast(ok ? `Copied ${value}` : 'Clipboard blocked by the browser', ok ? 'ok' : 'err');
  }, [showToast]);

  const copyAllColors = useCallback(async (fmt: 'lua' | 'hex') => {
    if (pickedColors.length === 0) return;
    const text = fmt === 'lua'
      ? `return {\n${pickedColors.map((c) => `\tColor3.fromRGB(${c.r}, ${c.g}, ${c.b}), -- ${toHex(c)}`).join('\n')}\n}\n`
      : pickedColors.map((c) => toHex(c)).join('\n');
    const ok = await copyText(text);
    showToast(ok ? `Copied ${pickedColors.length} colour${pickedColors.length === 1 ? '' : 's'}` : 'Clipboard blocked by the browser', ok ? 'ok' : 'err');
  }, [pickedColors, showToast]);

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
      // Source canvas must match the touch (processed) canvas dimensions so
      // smart-refine and restore index pixels by the same coords.
      const sourceW = crop ? (crop.destW ?? crop.w) : originalImg.naturalWidth;
      const sourceH = crop ? (crop.destH ?? crop.h) : originalImg.naturalHeight;
      sourceCanvas.width = sourceW;
      sourceCanvas.height = sourceH;
      const sourceCtx = sourceCanvas.getContext('2d');
      if (!sourceCtx) throw new Error('Canvas 2D context unavailable');
      if (crop) {
        // Place the original-image subject at the same offset it occupies in
        // the processed canvas (legacy crops without aspect padding default to
        // (0, 0) and fully cover the canvas).
        sourceCtx.clearRect(0, 0, sourceW, sourceH);
        sourceCtx.drawImage(
          originalImg,
          crop.x,
          crop.y,
          crop.w,
          crop.h,
          crop.destX ?? 0,
          crop.destY ?? 0,
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
    return canvasExport(activeBlob(item), s.tw, s.th, s.format, s.quality, s.brightness, !s.locked, s.padding ?? 0, s.fill ?? null);
  }, []);

  // ── Download ──────────────────────────────────────────────────────────────────

  const exportFileName = (item: ImageItem) => {
    const s = item.exportSettings;
    const base = item.fileName.replace(/\.[^.]+$/, '') || 'image';
    return `${base}_${s.tw}x${s.th}.${s.format === 'jpeg' ? 'jpg' : s.format}`;
  };

  const downloadOne = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    try {
      const blob = await getExportBlob(item);
      triggerDownload(blob, exportFileName(item));
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Download failed', 'err');
    }
  }, [getExportBlob, showToast]);

  // Everything in the queue as one ZIP, plus a Luau ID module if anything is published.
  const downloadAllZip = useCallback(async () => {
    const current = itemsRef.current;
    if (current.length === 0) return;
    setZipBusy(true);
    try {
      const entries: ZipEntry[] = [];
      const used: string[] = [];
      for (const item of current) {
        const blob = await getExportBlob(item);
        const name = ensureUniqueFileName(exportFileName(item), used);
        used.push(name);
        entries.push({ name, data: blob });
      }
      const published = current.filter((i) => i.pubAssetId);
      if (published.length > 0) {
        entries.push({
          name: 'asset_ids.lua',
          data: buildLuaIdTable(published.map((i) => ({
            name: i.fileName.replace(/\.[^.]+$/, ''),
            assetId: i.pubAssetId as string,
          }))),
        });
      }
      const zip = await createZip(entries);
      const stamp = new Date().toISOString().slice(0, 10);
      triggerDownload(zip, `pixel-forge_${stamp}.zip`);
      showToast(`Downloaded ${current.length} image${current.length > 1 ? 's' : ''} as ZIP`, 'ok');
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'ZIP export failed', 'err');
    } finally {
      setZipBusy(false);
    }
  }, [getExportBlob, showToast]);

  // ── Per-item export setting helpers ─────────────────────────────────────────

  const setExport = (patch: Partial<ExportSettings>) => {
    if (!selectedId) return;
    setItems((prev) => prev.map((i) =>
      i.id === selectedId ? { ...i, exportSettings: { ...i.exportSettings, ...patch } } : i,
    ));
  };
  // When locked, keep the current aspect ratio instead of forcing a square.
  const changeW = (v: number) => {
    if (!selectedId) return;
    const item = itemsRef.current.find((i) => i.id === selectedId);
    if (!item) return;
    const w = clamp(Math.round(v) || 1, 1, 4096);
    const { tw: cw, th: ch, locked: lk } = item.exportSettings;
    setExport(lk ? { tw: w, th: clamp(Math.round(w * (ch / Math.max(cw, 1))), 1, 4096) } : { tw: w });
  };
  const changeH = (v: number) => {
    if (!selectedId) return;
    const item = itemsRef.current.find((i) => i.id === selectedId);
    if (!item) return;
    const h = clamp(Math.round(v) || 1, 1, 4096);
    const { tw: cw, th: ch, locked: lk } = item.exportSettings;
    setExport(lk ? { th: h, tw: clamp(Math.round(h * (cw / Math.max(ch, 1))), 1, 4096) } : { th: h });
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

  // Copy every export setting (size, format, look) from the selected image to the rest.
  const applyAllSettingsToAll = useCallback(() => {
    if (!selectedId) return;
    const source = itemsRef.current.find((i) => i.id === selectedId);
    if (!source) return;
    const count = itemsRef.current.length;
    setItems((prev) => prev.map((i) => ({ ...i, exportSettings: { ...source.exportSettings } })));
    showToast(`Copied settings to ${count} image${count === 1 ? '' : 's'}`, 'ok');
  }, [selectedId, showToast]);

  const applyPresetSize = (preset: SizePreset) => {
    setExport({ tw: preset.w, th: preset.h, locked: preset.w === preset.h });
  };

  const resetToOriginalSize = () => {
    const item = itemsRef.current.find((i) => i.id === selectedId);
    if (!item?.dims) return;
    setExport({ tw: item.dims.w, th: item.dims.h, locked: item.dims.w === item.dims.h });
  };

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

  const copyLibraryId = useCallback(async (assetId: string) => {
    const ok = await copyText(assetId);
    showToast(ok ? `Copied ${assetId}` : 'Clipboard blocked by the browser', ok ? 'ok' : 'err');
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

      if (namingRef.current.autoOnImport) void autoNameOne(newItem.id, newItem.originalBlob);
      else updateItem(newItem.id, { nameStatus: 'idle' });
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
      triggerDownload(blob, `${entry.name}_${entry.assetId}.png`);
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
        exportSettings: {
          tw: s.tw, th: s.th, format: s.format, quality: s.quality, brightness: s.brightness,
          padding: s.padding, fill: s.fill, locked: s.locked,
        },
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
        exportSettings: {
          ...DEFAULT_EXPORT_SETTINGS,
          ...draft.exportSettings,
          padding: draft.exportSettings.padding ?? 0,
          fill: draft.exportSettings.fill ?? null,
          locked: draft.exportSettings.locked ?? draft.exportSettings.tw === draft.exportSettings.th,
        },
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

  // Upload one item and resolve to its asset ID. Follows up on uploads Roblox
  // is still processing instead of reporting them as failures.
  const uploadItem = useCallback(async (item: ImageItem): Promise<{ assetId: string; blob: Blob }> => {
    const blob = await getExportBlob(item);
    const assetName = item.fileName.replace(/\.[^.]+$/, '') || 'Uploaded Icon';
    const fd = new FormData();
    fd.append('apiKey', apiKey.trim());
    fd.append('creatorType', creatorType);
    fd.append('creatorId', creatorId.trim());
    fd.append('assetName', assetName);
    fd.append('image', blob, `icon.${item.exportSettings.format}`);

    const res = await fetch('/api/roblox-upload', { method: 'POST', body: fd });
    const data = (await res.json().catch(() => ({ error: `Upload failed (HTTP ${res.status})` }))) as {
      assetId?: string | number; error?: string; success?: boolean; pending?: boolean; operationPath?: string;
    };
    if (data.success && data.assetId) return { assetId: String(data.assetId), blob };

    if (data.pending && data.operationPath) {
      updateItem(item.id, { pubOperationPath: data.operationPath });
      for (let attempt = 0; attempt < 3; attempt++) {
        const follow = await fetch('/api/roblox-operation', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ apiKey: apiKey.trim(), operationPath: data.operationPath }),
        });
        const fdata = (await follow.json().catch(() => ({}))) as { assetId?: string | number; success?: boolean };
        if (fdata.success && fdata.assetId) return { assetId: String(fdata.assetId), blob };
      }
      throw new Error('Still processing on Roblox — check Creator Hub in a minute');
    }
    throw new Error(data.error ?? 'Unknown error');
  }, [apiKey, creatorId, creatorType, getExportBlob]);

  const publishOne = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    if (!apiKey.trim()) { showToast('Add your Roblox API key in publish settings', 'err'); setPublishDialogOpen(true); return; }
    if (!creatorId.trim()) { showToast('Add a creator ID in publish settings', 'err'); setPublishDialogOpen(true); return; }

    setPublishing(true);
    updateItem(id, { pubStatus: 'publishing', pubAssetId: undefined, pubError: undefined });

    try {
      const { assetId, blob } = await uploadItem(item);
      updateItem(id, { pubStatus: 'done', pubAssetId: assetId, pubOperationPath: undefined });
      void addToLibrary(item, assetId, blob);
      showToast(`Published ${assetId}`, 'ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Publish failed';
      updateItem(id, { pubStatus: 'error', pubError: msg });
      showToast(msg, 'err');
    } finally {
      setPublishing(false);
    }
  }, [apiKey, creatorId, uploadItem, showToast, addToLibrary]);

  const publishAll = useCallback(async () => {
    if (itemsRef.current.length === 0) return;
    if (!apiKey.trim()) { showToast('Add your Roblox API key in publish settings', 'err'); setPublishDialogOpen(true); return; }
    if (!creatorId.trim()) { showToast('Add a creator ID in publish settings', 'err'); setPublishDialogOpen(true); return; }

    const targets = itemsRef.current.filter((i) => !(skipPublished && i.pubStatus === 'done' && i.pubAssetId));
    if (targets.length === 0) { showToast('Everything is already published', 'info'); return; }
    const targetIds = new Set(targets.map((t) => t.id));

    setPublishing(true);
    let successCount = 0;
    let errorCount = 0;

    // Mark targets as queued first
    setItems((prev) => prev.map((i) => (
      targetIds.has(i.id) ? { ...i, pubStatus: 'queued' as PubStatus, pubAssetId: undefined, pubError: undefined } : i
    )));

    for (const target of targets) {
      // Use the latest version of the item (it may have been renamed while queued).
      const item = itemsRef.current.find((i) => i.id === target.id);
      if (!item) continue;
      updateItem(item.id, { pubStatus: 'publishing' });
      try {
        const { assetId, blob } = await uploadItem(item);
        successCount += 1;
        updateItem(item.id, { pubStatus: 'done', pubAssetId: assetId, pubOperationPath: undefined });
        void addToLibrary(item, assetId, blob);
      } catch (err: unknown) {
        errorCount += 1;
        updateItem(item.id, { pubStatus: 'error', pubError: err instanceof Error ? err.message : 'Publish failed' });
      }
    }

    setPublishing(false);
    if (errorCount === 0) {
      showToast(`Published ${successCount} image${successCount === 1 ? '' : 's'}`, 'ok');
    } else if (successCount > 0) {
      showToast(`Published ${successCount}, ${errorCount} failed — check the red items`, 'info');
    } else {
      showToast(`Publish failed for ${errorCount} image${errorCount === 1 ? '' : 's'}`, 'err');
    }
  }, [apiKey, creatorId, skipPublished, uploadItem, showToast, addToLibrary]);

  const copyAssetId = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item?.pubAssetId) return;
    const ok = await copyText(item.pubAssetId);
    showToast(ok ? `Copied ${item.pubAssetId}` : 'Clipboard blocked by the browser', ok ? 'ok' : 'err');
  }, [showToast]);

  const formatIds = (entries: { name: string; assetId: string }[], fmt: IdFormat): string => {
    // Keep keys unique even if two assets share a name.
    const used: string[] = [];
    const unique = entries.map((e) => {
      const name = ensureUniqueFileName(e.name, used);
      used.push(name);
      return { ...e, name };
    });
    if (fmt === 'lua') return buildLuaIdTable(unique);
    if (fmt === 'json') {
      return JSON.stringify(Object.fromEntries(unique.map((e) => [e.name, `rbxassetid://${e.assetId}`])), null, 2);
    }
    return unique.map((e) => e.assetId).join('\n');
  };

  const copyAllIds = useCallback(async (fmt: IdFormat = 'list') => {
    const published = itemsRef.current
      .filter((i) => i.pubAssetId)
      .map((i) => ({ name: i.fileName.replace(/\.[^.]+$/, ''), assetId: i.pubAssetId as string }));
    if (published.length === 0) return;
    const ok = await copyText(formatIds(published, fmt));
    const label = fmt === 'lua' ? 'Luau table' : fmt === 'json' ? 'JSON' : 'list';
    showToast(ok ? `Copied ${published.length} ID${published.length > 1 ? 's' : ''} as ${label}` : 'Clipboard blocked by the browser', ok ? 'ok' : 'err');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

  const copyLibraryIds = useCallback(async (entries: CachedImage[], fmt: IdFormat) => {
    if (entries.length === 0) return;
    const ok = await copyText(formatIds(entries.map((e) => ({ name: e.name, assetId: e.assetId })), fmt));
    showToast(ok ? `Copied ${entries.length} ID${entries.length > 1 ? 's' : ''}` : 'Clipboard blocked by the browser', ok ? 'ok' : 'err');
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showToast]);

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


  // ── Derived view state ──────────────────────────────────────────────────────

  const publishedItems = items.filter((i) => i.pubAssetId);
  const hasSomeAssetId = publishedItems.length > 0;
  const selectedBg = selectedItem?.processedBlob != null;
  const finishedCount = publishedItems.length;
  const unpublishedCount = items.length - finishedCount;
  const closePublishDialog = useCallback(() => setPublishDialogOpen(false), []);
  const publishReady = Boolean(apiKey.trim() && creatorId.trim());
  const namingReady = Boolean(openRouterKey.trim()) || namingServer?.configured !== false;

  const visibleItems = useMemo(() => items.filter((i) => {
    switch (queueFilter) {
      case 'todo': return i.bgStatus !== 'done';
      case 'unpublished': return i.pubStatus !== 'done';
      case 'published': return i.pubStatus === 'done';
      default: return true;
    }
  }), [items, queueFilter]);

  const filteredLibrary = useMemo(() => {
    const q = librarySearch.trim().toLowerCase();
    if (!q) return imageLibrary;
    return imageLibrary.filter((e) => e.name.toLowerCase().includes(q) || e.assetId.includes(q));
  }, [imageLibrary, librarySearch]);

  // Object URL for the untouched original, used by hold-to-compare.
  const [originalUrl, setOriginalUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!selectedItem) { setOriginalUrl(null); return; }
    const url = URL.createObjectURL(selectedItem.originalBlob);
    setOriginalUrl(url);
    return () => URL.revokeObjectURL(url);
  }, [selectedItem?.id, selectedItem?.originalBlob]); // eslint-disable-line react-hooks/exhaustive-deps

  const toggleSection = (id: InspectorSection) => setOpenSections((prev) => ({ ...prev, [id]: !prev[id] }));

  // ── Keyboard shortcuts ──────────────────────────────────────────────────────
  // The handler lives in a ref so the listener always sees the latest state.

  const shortcutHandlerRef = useRef<(e: KeyboardEvent) => void>(() => {});
  shortcutHandlerRef.current = (e: KeyboardEvent) => {
    const target = e.target as HTMLElement | null;
    if (target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.tagName === 'SELECT' || target.isContentEditable)) return;
    if (e.ctrlKey || e.metaKey || e.altKey) return;
    if (e.key === '?') { e.preventDefault(); setShortcutsOpen((v) => !v); return; }
    if (e.key === 'Escape') { setShortcutsOpen(false); setNamingDialogOpen(false); return; }
    if (activeTab !== 'tool' || editingNameId) return;

    const list = visibleItems.length > 0 ? visibleItems : items;
    const idx = list.findIndex((i) => i.id === selectedId);
    const key = e.key.toLowerCase();

    if (e.key === 'ArrowDown' || e.key === 'ArrowRight') {
      if (list.length === 0) return;
      e.preventDefault();
      setSelectedId(list[Math.min(list.length - 1, idx + 1)].id);
    } else if (e.key === 'ArrowUp' || e.key === 'ArrowLeft') {
      if (list.length === 0) return;
      e.preventDefault();
      setSelectedId(list[Math.max(0, idx - 1)].id);
    } else if (!selectedItem) {
      return;
    } else if (e.key === 'Delete' || e.key === 'Backspace') {
      if (touchUpOpen) return;
      e.preventDefault();
      removeItem(selectedItem.id);
    } else if (key === 'b' && !bgBusy && selectedItem.bgStatus !== 'processing') {
      requestBgAction('one');
    } else if (key === 'n' && selectedItem.nameStatus !== 'loading') {
      retryAutoName(selectedItem.id);
    } else if (key === 'r' || e.key === 'F2') {
      e.preventDefault();
      beginEditName(selectedItem.id);
    } else if (key === 'd') {
      void downloadOne(selectedItem.id);
    } else if (key === 'c' && !touchUpOpen) {
      setComparing(true);
    }
  };

  useEffect(() => {
    const onDown = (e: KeyboardEvent) => shortcutHandlerRef.current(e);
    const onUp = (e: KeyboardEvent) => { if (e.key.toLowerCase() === 'c') setComparing(false); };
    const onBlur = () => setComparing(false);
    window.addEventListener('keydown', onDown);
    window.addEventListener('keyup', onUp);
    window.addEventListener('blur', onBlur);
    return () => {
      window.removeEventListener('keydown', onDown);
      window.removeEventListener('keyup', onUp);
      window.removeEventListener('blur', onBlur);
    };
  }, []);

  const cx = (...classes: (string | false | null | undefined)[]) => classes.filter(Boolean).join(' ');

  function statusLine(item: ImageItem): { text: string; tone: 'ok' | 'err' | 'busy' | 'idle' } {
    if (item.pubStatus === 'publishing') return { text: 'Publishing…', tone: 'busy' };
    if (item.pubStatus === 'queued') return { text: 'Waiting to publish', tone: 'busy' };
    if (item.pubStatus === 'error') return { text: 'Publish failed', tone: 'err' };
    if (item.pubStatus === 'done' && item.pubAssetId) return { text: item.pubAssetId, tone: 'ok' };
    if (item.bgStatus === 'processing') return { text: 'Cutting out…', tone: 'busy' };
    if (item.bgStatus === 'error') return { text: 'Cut-out failed', tone: 'err' };
    if (item.nameStatus === 'loading') return { text: 'Naming…', tone: 'busy' };
    if (item.bgStatus === 'done') return { text: 'Cut out', tone: 'idle' };
    return { text: `${item.dims?.w ?? '?'}×${item.dims?.h ?? '?'}`, tone: 'idle' };
  }

  const frameW = (previewDims?.w ?? 0) * viewBase.finalScale;
  const frameH = (previewDims?.h ?? 0) * viewBase.finalScale;
  const frameX = viewBase.offsetX + viewPanX;
  const frameY = viewBase.offsetY + viewPanY;
  const accent = ACCENT_THEMES.find((t) => t.id === accentThemeId) ?? DEFAULT_ACCENT;

  // ── Render ──────────────────────────────────────────────────────────────────

  return (
    <main className={styles.app}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.brand}>
          <span className={styles.brandMark} aria-hidden="true" />
          <span className={styles.brandName}>Pixel Forge</span>
        </div>
        <nav className={styles.tabs} aria-label="Sections">
          {([
            { id: 'tool', label: 'Workbench', count: items.length },
            { id: 'drafts', label: 'Drafts', count: drafts.length },
            { id: 'library', label: 'Library', count: imageLibrary.length },
            { id: 'colors', label: 'Colors', count: pickedColors.length },
          ] as { id: ActiveTab; label: string; count: number }[]).map((t) => (
            <button
              key={t.id}
              className={cx(styles.tab, activeTab === t.id && styles.tabActive)}
              onClick={() => setActiveTab(t.id)}
              aria-current={activeTab === t.id ? 'page' : undefined}
            >
              {t.label}
              {t.count > 0 && <span className={styles.tabCount}>{t.count}</span>}
            </button>
          ))}
        </nav>
        <div className={styles.headerTools}>
          <button
            className={cx(styles.statusPill, !namingReady && styles.statusPillWarn)}
            onClick={() => setNamingDialogOpen(true)}
            title="AI naming settings"
          >
            <span className={styles.statusDot} />
            {namingReady ? 'AI naming' : 'Set up AI naming'}
          </button>
          <button
            className={cx(styles.statusPill, !publishReady && styles.statusPillWarn)}
            onClick={() => setPublishDialogOpen(true)}
            title="Roblox publish settings"
          >
            <span className={styles.statusDot} />
            {publishReady ? (creatorType === 'group' ? `Group ${creatorId}` : `User ${creatorId}`) : 'Connect Roblox'}
          </button>
          <div className={styles.themePickerWrap}>
            <button
              className={styles.iconBtn}
              onClick={() => setThemePickerOpen((v) => !v)}
              title="Appearance"
              aria-label="Appearance"
              aria-expanded={themePickerOpen}
            >
              <span className={styles.themeSwatchDot} style={{ background: accent.base }} />
            </button>
            {themePickerOpen && (
              <>
                <div className={styles.popoverBackdrop} onClick={() => setThemePickerOpen(false)} />
                <div className={styles.popover}>
                  <div className={styles.popoverTitle}>Accent</div>
                  <div className={styles.swatchGrid}>
                    {ACCENT_THEMES.map((t) => (
                      <button
                        key={t.id}
                        className={cx(styles.swatch, accentThemeId === t.id && styles.swatchActive)}
                        onClick={() => setAccentThemeId(t.id)}
                        title={t.label}
                      >
                        <span className={styles.swatchChip} style={{ background: t.base }} />
                        <span>{t.label}</span>
                      </button>
                    ))}
                  </div>
                  <div className={styles.popoverTitle}>Appearance</div>
                  <div className={styles.segmented}>
                    {(['system', 'dark', 'light'] as ColorMode[]).map((m) => (
                      <button
                        key={m}
                        className={cx(styles.segment, colorMode === m && styles.segmentActive)}
                        onClick={() => setColorMode(m)}
                        aria-pressed={colorMode === m}
                      >
                        {m === 'system' ? 'System' : m === 'dark' ? 'Dark' : 'Light'}
                      </button>
                    ))}
                  </div>
                </div>
              </>
            )}
          </div>
          <button className={styles.iconBtn} onClick={() => setShortcutsOpen(true)} title="Keyboard shortcuts (?)" aria-label="Keyboard shortcuts">
            ?
          </button>
          <button className={styles.versionBtn} onClick={() => setChangelogOpen(true)} title="What's new">
            v{APP_VERSION}
          </button>
        </div>
      </header>

      {/* ── Drafts ── */}
      {activeTab === 'drafts' && (
        <div className={styles.page}>
          <div className={styles.pageHead}>
            <div>
              <h1 className={styles.pageTitle}>Drafts</h1>
              <p className={styles.pageSub}>Work in progress, saved in this browser.</p>
            </div>
            {drafts.length > 0 && (
              <button
                className={cx(styles.btn, styles.btnQuiet)}
                onClick={() => {
                  if (window.confirm('Remove all saved drafts?')) {
                    drafts.forEach((d) => void deleteDraftBlobsFromIdb(d.id));
                    setDrafts([]);
                  }
                }}
              >
                Clear drafts
              </button>
            )}
          </div>
          {drafts.length === 0 ? (
            <div className={styles.pageEmpty}>
              <span className={styles.pageEmptyTitle}>No drafts yet</span>
              <span className={styles.pageEmptySub}>Select an image on the workbench and choose Save draft to keep it here.</span>
              <button className={cx(styles.btn, styles.btnPrimary)} onClick={() => setActiveTab('tool')}>Go to workbench</button>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {drafts.map((draft) => (
                <article key={draft.id} className={styles.card}>
                  <button className={styles.cardThumb} onClick={() => void loadDraft(draft)} title="Open on workbench">
                    <img src={draft.previewDataUrl} alt={draft.name} />
                  </button>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName} title={draft.name}>{draft.name}</span>
                    <span className={styles.cardMeta}>
                      {draft.exportSettings.tw}×{draft.exportSettings.th} {draft.exportSettings.format.toUpperCase()}
                      {draft.hasBgRemoved ? ', cut out' : ''}
                    </span>
                    <span className={styles.cardMeta}>
                      {new Date(draft.savedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void loadDraft(draft)}>Open</button>
                    <button className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)} onClick={() => deleteDraft(draft.id)}>Delete</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Library ── */}
      {activeTab === 'library' && (
        <div className={styles.page}>
          <div className={styles.pageHead}>
            <div>
              <h1 className={styles.pageTitle}>Library</h1>
              <p className={styles.pageSub}>Everything you’ve published, cached in this browser.</p>
            </div>
            <div className={styles.importBox}>
              <input
                type="text"
                className={styles.input}
                placeholder="Asset ID or rbxassetid://…"
                value={importAssetInput}
                onChange={(e) => setImportAssetInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && importAssetInput.trim() && !importBusy) void importFromAssetId(importAssetInput);
                }}
                disabled={importBusy}
                aria-label="Roblox asset ID to import"
              />
              <button
                className={cx(styles.btn, styles.btnPrimary)}
                onClick={() => void importFromAssetId(importAssetInput)}
                disabled={!importAssetInput.trim() || importBusy}
              >
                {importBusy ? 'Importing…' : 'Import from Roblox'}
              </button>
            </div>
          </div>

          {imageLibrary.length > 0 && (
            <div className={styles.libraryTools}>
              <input
                type="search"
                className={cx(styles.input, styles.searchInput)}
                placeholder={`Search ${imageLibrary.length} assets by name or ID`}
                value={librarySearch}
                onChange={(e) => setLibrarySearch(e.target.value)}
                aria-label="Search library"
              />
              <div className={styles.btnRow}>
                <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void copyLibraryIds(filteredLibrary, 'lua')} disabled={filteredLibrary.length === 0}>
                  Copy as Luau
                </button>
                <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void copyLibraryIds(filteredLibrary, 'json')} disabled={filteredLibrary.length === 0}>
                  Copy as JSON
                </button>
                <button
                  className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)}
                  onClick={() => {
                    if (window.confirm('Remove all cached images from the library? Your assets stay on Roblox.')) {
                      imageLibrary.forEach((e) => void deleteBlobFromIdb(e.assetId));
                      setImageLibrary([]);
                    }
                  }}
                >
                  Clear library
                </button>
              </div>
            </div>
          )}

          {imageLibrary.length === 0 ? (
            <div className={styles.pageEmpty}>
              <span className={styles.pageEmptyTitle}>Nothing published yet</span>
              <span className={styles.pageEmptySub}>Images you publish show up here with their asset IDs. You can also import any Roblox image by ID above.</span>
            </div>
          ) : filteredLibrary.length === 0 ? (
            <div className={styles.pageEmpty}>
              <span className={styles.pageEmptyTitle}>No matches for “{librarySearch}”</span>
              <button className={cx(styles.btn, styles.btnQuiet)} onClick={() => setLibrarySearch('')}>Clear search</button>
            </div>
          ) : (
            <div className={styles.cardGrid}>
              {filteredLibrary.map((entry) => (
                <article key={entry.id} className={styles.card}>
                  <button className={styles.cardThumb} onClick={() => void importLibraryEntry(entry)} disabled={importBusy} title="Open on workbench">
                    <img src={entry.previewDataUrl} alt={entry.name} />
                  </button>
                  <div className={styles.cardInfo}>
                    <span className={styles.cardName} title={entry.name}>{entry.name}</span>
                    <button className={styles.assetId} onClick={() => void copyLibraryId(entry.assetId)} title="Copy asset ID">
                      {entry.assetId}
                    </button>
                    <span className={styles.cardMeta}>
                      {new Date(entry.publishedAt).toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })}
                    </span>
                  </div>
                  <div className={styles.cardActions}>
                    <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void importLibraryEntry(entry)} disabled={importBusy}>Edit</button>
                    <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void downloadLibraryEntry(entry)}>Download</button>
                    <button className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)} onClick={() => deleteFromLibrary(entry.id)} title="Remove from library" aria-label={`Remove ${entry.name} from library`}>×</button>
                  </div>
                </article>
              ))}
            </div>
          )}
        </div>
      )}

      {/* ── Colour picker ── */}
      {activeTab === 'colors' && (() => {
        const activeColor = pickedColors.find((c) => c.id === activeColorId) ?? pickedColors[0] ?? null;
        return (
          <div className={styles.body}>
            <div className={cx(styles.stagePanel, styles.pickerStagePanel)}>
              <div
                className={cx(styles.stage, styles.stage_checker, pickerDragging && styles.dragging)}
                onDragOver={(e) => { e.preventDefault(); setPickerDragging(true); }}
                onDragLeave={() => setPickerDragging(false)}
                onDrop={(e) => {
                  e.preventDefault();
                  setPickerDragging(false);
                  const file = Array.from(e.dataTransfer.files).find((f) => f.type.startsWith('image/'));
                  if (file) void loadPickerImage(file, file.name);
                }}
              >
                {pickerImage ? (
                  <div className={styles.pickerWrap}>
                    <canvas
                      ref={pickerCanvasRef}
                      className={styles.pickerCanvas}
                      onPointerMove={handlePickerMove}
                      onPointerLeave={() => { setHoverColor(null); setLoupePos(null); }}
                      onPointerUp={handlePickerClick}
                      aria-label={`Image to pick colours from: ${pickerImage.name}`}
                    />
                    <canvas
                      ref={loupeRef}
                      width={132}
                      height={132}
                      className={styles.loupe}
                      style={{
                        left: loupePos ? loupePos.x + 18 : 0,
                        top: loupePos ? loupePos.y + 18 : 0,
                        opacity: loupePos ? 1 : 0,
                      }}
                      aria-hidden="true"
                    />
                  </div>
                ) : (
                  <label className={styles.stageEmpty}>
                    <span className={styles.stageEmptyTitle}>Drop an image to pick colours</span>
                    <span className={styles.stageEmptySub}>Or paste a screenshot with Ctrl+V. Hover to inspect, click to pick.</span>
                    <span className={cx(styles.btn, styles.btnPrimary)}>Browse files</span>
                    <input
                      type="file"
                      accept="image/*"
                      className={styles.hiddenInput}
                      onChange={(e) => {
                        const f = e.target.files?.[0];
                        if (f) void loadPickerImage(f, f.name);
                        e.target.value = '';
                      }}
                    />
                  </label>
                )}
              </div>
              <div className={styles.stageBar}>
                <div className={styles.segmented} role="group" aria-label="Sample size">
                  {([1, 3, 5] as SampleSize[]).map((n) => (
                    <button
                      key={n}
                      className={cx(styles.segment, sampleSize === n && styles.segmentActive)}
                      onClick={() => setSampleSize(n)}
                      aria-pressed={sampleSize === n}
                      title={n === 1 ? 'Exact pixel' : `Average of a ${n}×${n} area`}
                    >
                      {n === 1 ? '1 px' : `${n}×${n} avg`}
                    </button>
                  ))}
                </div>
                <label className={cx(styles.btn, styles.btnSmall)}>
                  {pickerImage ? 'Change image' : 'Browse'}
                  <input
                    type="file"
                    accept="image/*"
                    className={styles.hiddenInput}
                    onChange={(e) => {
                      const f = e.target.files?.[0];
                      if (f) void loadPickerImage(f, f.name);
                      e.target.value = '';
                    }}
                  />
                </label>
                {selectedItem && (
                  <button
                    className={cx(styles.btn, styles.btnSmall)}
                    onClick={() => void loadPickerImage(activeBlob(selectedItem), selectedItem.fileName)}
                    title="Pick colours from the image selected on the workbench"
                  >
                    Use workbench image
                  </button>
                )}
                <span className={styles.stageBarMeta}>
                  {hoverColor
                    ? `x ${hoverColor.x}  y ${hoverColor.y}  ${toHex(hoverColor)}${hoverColor.a < 255 ? `  α ${hoverColor.a}` : ''}`
                    : pickerImage ? `${pickerImage.name}  ${pickerImage.w}×${pickerImage.h}` : ''}
                </span>
              </div>
            </div>

            <aside className={styles.inspector}>
              <div className={styles.pickerLive}>
                <div
                  className={styles.pickerLiveSwatch}
                  style={{ background: hoverColor ? `rgba(${hoverColor.r}, ${hoverColor.g}, ${hoverColor.b}, ${hoverColor.a / 255})` : undefined }}
                />
                <div className={styles.pickerLiveText}>
                  <span className={styles.label}>Under cursor</span>
                  <span className={styles.pickerLiveHex}>{hoverColor ? toHex(hoverColor) : '—'}</span>
                  <span className={styles.mutedText}>{hoverColor ? `RGB ${hoverColor.r}, ${hoverColor.g}, ${hoverColor.b}` : 'Hover over the image'}</span>
                </div>
              </div>

              <Section num="01" title="Selected" open onToggle={() => {}} aside={activeColor ? toHex(activeColor) : undefined}>
                {activeColor ? (
                  <>
                    <div
                      className={styles.pickerBigSwatch}
                      style={{ background: toHex(activeColor), color: inkFor(activeColor) }}
                    >
                      {toHex(activeColor)}
                    </div>
                    <div className={styles.formatList}>
                      {colorFormats(activeColor).map((f) => (
                        <button key={f.label} className={styles.formatRow} onClick={() => void copyColorValue(f.value)} title="Copy">
                          <span className={styles.formatLabel}>{f.label}</span>
                          <span className={styles.formatValue}>{f.value}</span>
                          <span className={styles.formatCopy}>Copy</span>
                        </button>
                      ))}
                    </div>
                  </>
                ) : (
                  <p className={styles.mutedText}>Click anywhere on the image to pick a colour.</p>
                )}
              </Section>

              <Section num="02" title="Picked" open onToggle={() => {}} aside={pickedColors.length ? `${pickedColors.length}` : undefined}>
                {pickedColors.length === 0 ? (
                  <p className={styles.mutedText}>Colours you pick are saved here in this browser.</p>
                ) : (
                  <>
                    <div className={styles.colorGrid}>
                      {pickedColors.map((c) => (
                        <div key={c.id} className={styles.colorCell}>
                          <button
                            className={cx(styles.colorSwatch, activeColor?.id === c.id && styles.colorSwatchActive)}
                            style={{ background: toHex(c) }}
                            onClick={() => setActiveColorId(c.id)}
                            title={`${toHex(c)}${c.source ? ` from ${c.source}` : ''}`}
                            aria-label={`Select ${toHex(c)}`}
                          />
                          <button
                            className={styles.colorRemove}
                            onClick={() => setPickedColors((prev) => prev.filter((p) => p.id !== c.id))}
                            aria-label={`Remove ${toHex(c)}`}
                          >
                            ×
                          </button>
                        </div>
                      ))}
                    </div>
                    <div className={styles.btnRow}>
                      <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void copyAllColors('lua')}>Copy as Luau</button>
                      <button className={cx(styles.btn, styles.btnSmall)} onClick={() => void copyAllColors('hex')}>Copy hex list</button>
                      <button
                        className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)}
                        onClick={() => { setPickedColors([]); setActiveColorId(null); }}
                      >
                        Clear
                      </button>
                    </div>
                  </>
                )}
              </Section>

              {pickerImage && palette.length > 0 && (
                <Section num="03" title="Main colours" open onToggle={() => {}}>
                  <div className={styles.colorGrid}>
                    {palette.map((c) => (
                      <button
                        key={toHex(c)}
                        className={styles.colorSwatch}
                        style={{ background: toHex(c) }}
                        onClick={() => addPickedColor(c, `${pickerImage.name} palette`)}
                        title={`${toHex(c)} — click to add`}
                        aria-label={`Add ${toHex(c)}`}
                      />
                    ))}
                  </div>
                  <p className={styles.mutedText}>The most common colours in this image. Click one to add it.</p>
                </Section>
              )}
            </aside>
          </div>
        );
      })()}

      {/* ── Workbench ── */}
      {activeTab === 'tool' && <div className={styles.body}>

        {(mobileQueueOpen || mobileControlsOpen) && (
          <div
            className={styles.mobileDrawerBackdrop}
            onClick={() => { setMobileQueueOpen(false); setMobileControlsOpen(false); }}
          />
        )}

        {/* ── Queue ── */}
        <div className={cx(styles.queuePanel, mobileQueueOpen && styles.queuePanelMobileOpen)}>
          <div className={styles.panelHead}>
            <span className={styles.panelTitle}>Queue</span>
            <div className={styles.panelHeadActions}>
              <label className={cx(styles.btn, styles.btnSmall, styles.btnPrimary)} title="Add images">
                Add
                <input type="file" accept="image/*" multiple className={styles.hiddenInput} onChange={handleFileChange} />
              </label>
            </div>
          </div>

          {hasItems && (
            <div className={styles.filterRow} role="tablist" aria-label="Filter queue">
              {([
                { id: 'all', label: 'All', n: items.length },
                { id: 'todo', label: 'Not cut out', n: items.filter((i) => i.bgStatus !== 'done').length },
                { id: 'unpublished', label: 'Unpublished', n: unpublishedCount },
                { id: 'published', label: 'Published', n: finishedCount },
              ] as { id: QueueFilter; label: string; n: number }[]).map((f) => (
                <button
                  key={f.id}
                  role="tab"
                  aria-selected={queueFilter === f.id}
                  className={cx(styles.filterChip, queueFilter === f.id && styles.filterChipActive)}
                  onClick={() => setQueueFilter(f.id)}
                >
                  {f.label} <span className={styles.filterCount}>{f.n}</span>
                </button>
              ))}
            </div>
          )}

          <div className={styles.queueList}>
            {!hasItems && (
              <label className={styles.queueEmpty}>
                <span className={styles.queueEmptyTitle}>Add images to start</span>
                <span className={styles.queueEmptySub}>Drop files anywhere, paste with Ctrl+V, or click here to browse.</span>
                <input type="file" accept="image/*" multiple className={styles.hiddenInput} onChange={handleFileChange} />
              </label>
            )}
            {hasItems && visibleItems.length === 0 && (
              <p className={styles.queueNone}>No images match this filter.</p>
            )}
            {visibleItems.map((item) => {
              const st = statusLine(item);
              return (
                <div
                  key={item.id}
                  className={cx(styles.thumbCard, selectedId === item.id && styles.selected)}
                  onClick={() => setSelectedId(item.id)}
                  role="button"
                  tabIndex={0}
                  aria-pressed={selectedId === item.id}
                  onKeyDown={(e) => { if (e.key === 'Enter') setSelectedId(item.id); }}
                >
                  <div className={styles.thumbImgWrap}>
                    <img src={item.previewUrl} alt="" className={styles.thumbImgEl} />
                    {item.bgStatus === 'done' && <span className={styles.thumbCutBadge} title="Background removed" />}
                    <button
                      className={styles.thumbRemoveBtn}
                      onClick={(e) => { e.stopPropagation(); removeItem(item.id); }}
                      title="Remove from queue"
                      aria-label={`Remove ${item.fileName}`}
                    >
                      ×
                    </button>
                  </div>
                  <span
                    className={cx(styles.thumbFileName, nameClassForItem(item))}
                    onDoubleClick={(e) => {
                      e.stopPropagation();
                      setSelectedId(item.id);
                      beginEditName(item.id);
                    }}
                    title={`${displayNameForItem(item)} — double-click to rename`}
                  >
                    {displayNameForItem(item)}
                  </span>
                  <span className={cx(styles.thumbStatus, styles[`tone_${st.tone}`])}>{st.text}</span>
                </div>
              );
            })}
          </div>

          {hasItems && (
            <div className={styles.queueFoot}>
              <button className={cx(styles.btn, styles.btnSmall)} onClick={autoNameAll} title="Ask the AI to name every image you haven't renamed">
                AI name all
              </button>
              <button className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)} onClick={clearQueue}>
                Clear queue
              </button>
            </div>
          )}
        </div>

        {/* ── Stage ── */}
        <div className={styles.stagePanel}>
          <div
            className={cx(styles.stage, styles[`stage_${previewBg}`], isDragging && styles.dragging)}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {selectedItem ? (
              <div
                ref={touchViewportRef}
                className={cx(styles.touchWrap, spaceDown && styles.spacePan)}
                onWheel={handleTouchWheel}
                onContextMenu={(e) => e.preventDefault()}
              >
                {!touchUpOpen && previewDims && (
                  <div
                    className={styles.exportFrame}
                    style={{ left: frameX, top: frameY, width: frameW, height: frameH }}
                    aria-hidden="true"
                  >
                    <span className={styles.exportFrameLabel}>
                      {comparing ? 'Original' : `${previewDims.w} × ${previewDims.h}`}
                    </span>
                  </div>
                )}
                {touchUpOpen ? (
                  <>
                    <canvas
                      ref={touchCanvasRef}
                      className={styles.touchCanvas}
                      style={{
                        transform: `translate(${frameX}px, ${frameY}px) scale(${viewBase.finalScale})`,
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
                    key={comparing ? 'original' : selectedItem.previewUrl}
                    src={(comparing ? originalUrl : null) ?? exportPreviewUrl ?? selectedItem.previewUrl}
                    alt={`Preview of ${selectedItem.fileName}`}
                    className={styles.previewNavImg}
                    style={{
                      width: previewDims?.w,
                      height: previewDims?.h,
                      objectFit: 'contain',
                      transform: `translate(${frameX}px, ${frameY}px) scale(${viewBase.finalScale})`,
                      transformOrigin: 'top left',
                      // Crisp pixels only when zoomed well past 1:1, so small icons read honestly.
                      imageRendering: exportPreviewUrl && !comparing && viewBase.finalScale >= 2.5 ? 'pixelated' : undefined,
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
              <label className={styles.stageEmpty}>
                <span className={styles.stageEmptyTitle}>Drop images here</span>
                <span className={styles.stageEmptySub}>PNG, JPG or WebP. Paste screenshots straight from your clipboard.</span>
                <span className={cx(styles.btn, styles.btnPrimary)}>Browse files</span>
                <input type="file" accept="image/*" multiple className={styles.hiddenInput} onChange={handleFileChange} />
              </label>
            )}

            {bgBusy && !bgBatchInfo && selectedItem?.bgStatus === 'processing' && (
              <div className={styles.overlay}>
                <span className={styles.overlayStatus}>Cutting out the background…</span>
                <div className={styles.progressTrack}>
                  <div className={styles.progressFill} style={{ width: `${bgPct}%` }} />
                </div>
              </div>
            )}

            {isDragging && <div className={styles.dropHint}>Drop to add to the queue</div>}
          </div>

          {selectedItem && (
            <div className={styles.stageBar}>
              <div className={styles.segmented} role="group" aria-label="Preview background">
                {PREVIEW_BGS.map((b) => (
                  <button
                    key={b.id}
                    className={cx(styles.segment, previewBg === b.id && styles.segmentActive)}
                    onClick={() => setPreviewBg(b.id)}
                    aria-pressed={previewBg === b.id}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
              <div className={styles.stageBarGroup}>
                <button className={styles.iconBtn} onClick={() => zoomAt(1 / 1.25)} aria-label="Zoom out">−</button>
                <button
                  className={styles.zoomReadout}
                  onClick={() => { setViewZoom(1); setViewPanX(0); setViewPanY(0); }}
                  title="Fit to view"
                >
                  {Math.round(viewZoom * 100)}%
                </button>
                <button className={styles.iconBtn} onClick={() => zoomAt(1.25)} aria-label="Zoom in">+</button>
              </div>
              {!touchUpOpen && (
                <button
                  className={cx(styles.btn, styles.btnSmall, comparing && styles.btnPressed)}
                  onPointerDown={() => setComparing(true)}
                  onPointerUp={() => setComparing(false)}
                  onPointerLeave={() => setComparing(false)}
                  title="Hold to see the original (or hold C)"
                >
                  Hold to compare
                </button>
              )}
              <span className={styles.stageBarMeta}>
                {selectedItem.dims ? `Source ${selectedItem.dims.w}×${selectedItem.dims.h}` : ''}
                {' '}{fmtBytes(activeBlob(selectedItem).size)}
              </span>
            </div>
          )}
        </div>

        {/* ── Inspector ── */}
        <aside className={cx(styles.inspector, mobileControlsOpen && styles.inspectorMobileOpen)}>
          {!selectedItem ? (
            <div className={styles.inspectorEmpty}>
              <p>Select an image to edit its name, size and cut-out.</p>
              {hasItems && <p className={styles.mutedText}>{items.length} in the queue, {finishedCount} published.</p>}
            </div>
          ) : (
            <>
              <Section num="01" open={openSections.name} onToggle={() => toggleSection('name')} title="Name" aside={selectedItem.nameStatus === 'manual' ? 'Edited' : selectedItem.nameStatus === 'done' ? 'AI' : undefined}>
                {editingNameId === selectedItem.id ? (
                  <div className={styles.nameEditRow}>
                    <input
                      ref={nameInputRef}
                      className={cx(styles.input, styles.nameEditInput)}
                      value={editingNameDraft}
                      onChange={(e) => setEditingNameDraft(e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter') { e.preventDefault(); commitEditName(); }
                        else if (e.key === 'Escape') { e.preventDefault(); cancelEditName(); }
                      }}
                      onBlur={commitEditName}
                      spellCheck={false}
                      aria-label="Image name"
                    />
                    <span className={styles.nameEditExt}>
                      {splitNameAndExt(selectedItem.fileName).ext || splitNameAndExt(selectedItem.originalFileName).ext}
                    </span>
                  </div>
                ) : (
                  <button
                    className={cx(styles.nameDisplay, nameClassForItem(selectedItem))}
                    onClick={() => beginEditName(selectedItem.id)}
                    title="Click to rename"
                  >
                    {selectedItem.nameStatus === 'loading' ? 'Naming…' : selectedItem.fileName}
                  </button>
                )}
                {selectedItem.nameStatus === 'error' && (
                  <p className={styles.errorText}>
                    {selectedItem.nameError ?? 'AI naming failed.'}{' '}
                    <button className={styles.linkBtn} onClick={() => setNamingDialogOpen(true)}>Naming settings</button>
                  </p>
                )}
                {selectedItem.nameAlts && selectedItem.nameAlts.length > 0 && selectedItem.nameStatus !== 'loading' && (
                  <div className={styles.altRow}>
                    <span className={styles.mutedText}>Or try</span>
                    {selectedItem.nameAlts.map((alt) => (
                      <button
                        key={alt.join(' ')}
                        className={styles.altChip}
                        onClick={() => pickAlternativeName(selectedItem.id, alt)}
                      >
                        {buildName(alt, namingOptions)}
                      </button>
                    ))}
                  </div>
                )}
                <div className={styles.btnRow}>
                  <button
                    className={cx(styles.btn, styles.btnSmall)}
                    onClick={() => retryAutoName(selectedItem.id)}
                    disabled={selectedItem.nameStatus === 'loading'}
                  >
                    {selectedItem.nameStatus === 'loading' ? 'Naming…' : selectedItem.nameStatus === 'done' ? 'New AI name' : 'AI name'}
                  </button>
                  <button className={cx(styles.btn, styles.btnSmall)} onClick={() => beginEditName(selectedItem.id)}>Rename</button>
                  <button className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)} onClick={() => setNamingDialogOpen(true)}>
                    {NAME_STYLE_LABELS[namingOptions.style]}
                  </button>
                </div>
              </Section>

              <Section num="02" open={openSections.size} onToggle={() => toggleSection('size')} title="Size" aside={`${tw}×${th}`}>
                <div className={styles.presetRow}>
                  {SIZE_PRESETS.map((p) => (
                    <button
                      key={p.label}
                      className={cx(styles.presetChip, tw === p.w && th === p.h && styles.presetChipActive)}
                      onClick={() => applyPresetSize(p)}
                      title={p.hint}
                    >
                      {p.label}
                    </button>
                  ))}
                  {selectedItem.dims && (
                    <button
                      className={cx(styles.presetChip, tw === selectedItem.dims.w && th === selectedItem.dims.h && styles.presetChipActive)}
                      onClick={resetToOriginalSize}
                      title="Source image size"
                    >
                      Original
                    </button>
                  )}
                </div>
                <div className={styles.dimRow}>
                  <label className={styles.dimField}>
                    <span>W</span>
                    <input type="number" className={styles.input} value={tw} min={1} max={4096} onChange={(e) => changeW(Number(e.target.value))} />
                  </label>
                  <button
                    className={cx(styles.lockBtn, locked && styles.locked)}
                    onClick={() => setExport({ locked: !locked })}
                    title={locked ? 'Aspect ratio locked — click to stretch freely' : 'Aspect ratio unlocked — image stretches to fill'}
                    aria-pressed={locked}
                  >
                    {locked ? 'Locked' : 'Free'}
                  </button>
                  <label className={styles.dimField}>
                    <span>H</span>
                    <input type="number" className={styles.input} value={th} min={1} max={4096} onChange={(e) => changeH(Number(e.target.value))} />
                  </label>
                </div>
                {items.length > 1 && (
                  <button className={cx(styles.linkBtn)} onClick={applyDimensionsToAll}>
                    Use {tw}×{th} for all {items.length} images
                  </button>
                )}
              </Section>

              <Section num="03" open={openSections.look} onToggle={() => toggleSection('look')} title="Look" aside={es.fill || es.padding || brightness !== 100 ? 'Adjusted' : undefined}>
                <div className={styles.field}>
                  <div className={styles.fieldRow}>
                    <span className={styles.label}>Padding</span>
                    <span className={styles.fieldValue}>{es.padding ?? 0}%</span>
                  </div>
                  <input type="range" className={styles.slider} min={0} max={40} value={es.padding ?? 0} onChange={(e) => setExport({ padding: Number(e.target.value) })} />
                </div>
                <div className={styles.field}>
                  <div className={styles.fieldRow}>
                    <span className={styles.label}>Brightness</span>
                    <span className={styles.fieldValue}>{brightness}%</span>
                  </div>
                  <input type="range" className={styles.slider} min={0} max={200} value={brightness} onChange={(e) => setExport({ brightness: Number(e.target.value) })} />
                </div>
                <div className={styles.field}>
                  <span className={styles.label}>Background</span>
                  <div className={styles.fillRow}>
                    <button
                      className={cx(styles.fillSwatch, styles.fillNone, !es.fill && styles.fillSwatchActive)}
                      onClick={() => setExport({ fill: null })}
                      title="Transparent"
                      aria-label="Transparent background"
                    />
                    {FILL_SWATCHES.map((c) => (
                      <button
                        key={c}
                        className={cx(styles.fillSwatch, es.fill === c && styles.fillSwatchActive)}
                        style={{ background: c }}
                        onClick={() => setExport({ fill: c })}
                        title={c}
                        aria-label={`Fill ${c}`}
                      />
                    ))}
                    <label className={cx(styles.fillSwatch, styles.fillCustom)} title="Custom colour">
                      <input
                        type="color"
                        value={es.fill ?? '#ffffff'}
                        onChange={(e) => setExport({ fill: e.target.value })}
                        aria-label="Custom background colour"
                      />
                    </label>
                  </div>
                </div>
                {items.length > 1 && (
                  <button className={styles.linkBtn} onClick={applyAllSettingsToAll}>Copy all settings to every image</button>
                )}
              </Section>

              <Section num="04" open={openSections.cutout} onToggle={() => toggleSection('cutout')} title="Cut out" aside={selectedBg ? 'Done' : undefined}>
                {!touchUpOpen ? (
                  <>
                    <div className={styles.btnRow}>
                      <button
                        className={cx(styles.btn, styles.btnPrimary, styles.btnGrow)}
                        onClick={() => requestBgAction('one')}
                        disabled={bgBusy || selectedItem.bgStatus === 'processing'}
                      >
                        {selectedItem.bgStatus === 'processing' ? 'Cutting out…' : selectedBg ? 'Cut out again' : 'Remove background'}
                      </button>
                      <button
                        className={styles.btn}
                        onClick={openTouchUp}
                        disabled={!selectedItem.processedBlob || bgBusy || touchUpBusy}
                        title="Erase leftovers or paint back missing bits"
                      >
                        {touchUpBusy ? 'Opening…' : 'Touch up'}
                      </button>
                    </div>
                    {items.length > 1 && (
                      <button className={styles.linkBtn} onClick={() => requestBgAction('all')} disabled={bgBusy}>
                        {bgBusy && bgBatchInfo ? `Cutting out ${bgBatchInfo.current} of ${bgBatchInfo.total}…` : 'Remove background from every image'}
                      </button>
                    )}
                    {selectedItem.bgStatus === 'error' && <p className={styles.errorText}>{selectedItem.bgError}</p>}
                    <p className={styles.mutedText}>Runs in your browser. The first run downloads a {BG_MODEL_ESTIMATED_SIZE} model once.</p>
                  </>
                ) : (
                  <div className={styles.touchTools}>
                    <div className={styles.segmented}>
                      <button className={cx(styles.segment, touchToolMode === 'erase' && styles.segmentActive)} onClick={() => setTouchToolMode('erase')}>Erase</button>
                      <button className={cx(styles.segment, touchToolMode === 'restore' && styles.segmentActive)} onClick={() => setTouchToolMode('restore')}>Restore</button>
                    </div>
                    <div className={styles.field}>
                      <div className={styles.fieldRow}>
                        <span className={styles.label}>Brush size</span>
                        <span className={styles.fieldValue}>{brushSize}px</span>
                      </div>
                      <input type="range" className={styles.slider} min={1} max={80} value={brushSize} onChange={(e) => setBrushSize(Number(e.target.value))} />
                    </div>
                    <label className={styles.checkRow}>
                      <input type="checkbox" checked={smartRefine} onChange={(e) => setSmartRefine(e.target.checked)} />
                      <span>Smart refine — only affect similar colours under the brush</span>
                    </label>
                    {smartRefine && (
                      <div className={styles.field}>
                        <div className={styles.fieldRow}>
                          <span className={styles.label}>Colour tolerance</span>
                          <span className={styles.fieldValue}>{smartTolerance}</span>
                        </div>
                        <input type="range" className={styles.slider} min={8} max={96} value={smartTolerance} onChange={(e) => setSmartTolerance(Number(e.target.value))} />
                      </div>
                    )}
                    <div className={styles.btnRow}>
                      <button className={cx(styles.btn, styles.btnPrimary, styles.btnGrow)} onClick={applyTouchUp}>Apply touch-up</button>
                      <button className={styles.btn} onClick={cancelTouchUp}>Cancel</button>
                    </div>
                    <p className={styles.mutedText}>Scroll to zoom, hold Space to pan, Ctrl/Cmd+Z to undo.</p>
                  </div>
                )}
              </Section>

              <Section num="05" open={openSections.publish} onToggle={() => toggleSection('publish')} title="Publish to Roblox" aside={finishedCount > 0 ? `${finishedCount}/${items.length}` : undefined}>
                {!publishReady && (
                  <p className={styles.mutedText}>
                    Connect a Roblox API key first.{' '}
                    <button className={styles.linkBtn} onClick={() => setPublishDialogOpen(true)}>Publish settings</button>
                  </p>
                )}
                {selectedItem.pubAssetId && (
                  <button className={styles.assetIdLarge} onClick={() => void copyAssetId(selectedItem.id)} title="Copy asset ID">
                    <span className={styles.mutedText}>rbxassetid://</span>{selectedItem.pubAssetId}
                  </button>
                )}
                {selectedItem.pubStatus === 'error' && <p className={styles.errorText}>{selectedItem.pubError}</p>}
                <div className={styles.btnRow}>
                  <button
                    className={cx(styles.btn, styles.btnPrimary, styles.btnGrow)}
                    onClick={() => void publishOne(selectedItem.id)}
                    disabled={publishing || !publishReady}
                  >
                    {selectedItem.pubStatus === 'publishing' ? 'Publishing…' : selectedItem.pubAssetId ? 'Publish again' : 'Publish'}
                  </button>
                  {items.length > 1 && (
                    <button
                      className={styles.btn}
                      onClick={() => void publishAll()}
                      disabled={publishing || !publishReady}
                      title={skipPublished ? 'Publishes images that don’t have an asset ID yet' : 'Publishes every image'}
                    >
                      {publishing ? 'Publishing…' : `Publish all (${skipPublished ? unpublishedCount : items.length})`}
                    </button>
                  )}
                </div>
                {items.length > 1 && (
                  <label className={styles.checkRow}>
                    <input type="checkbox" checked={skipPublished} onChange={(e) => setSkipPublished(e.target.checked)} />
                    <span>Skip images that are already published</span>
                  </label>
                )}
                {hasSomeAssetId && (
                  <div className={styles.copyIds}>
                    <span className={styles.mutedText}>Copy {finishedCount} ID{finishedCount === 1 ? '' : 's'} as</span>
                    <button className={styles.altChip} onClick={() => void copyAllIds('lua')}>Luau table</button>
                    <button className={styles.altChip} onClick={() => void copyAllIds('json')}>JSON</button>
                    <button className={styles.altChip} onClick={() => void copyAllIds('list')}>List</button>
                  </div>
                )}
              </Section>

              <Section num="06" open={openSections.export} onToggle={() => toggleSection('export')} title="Export" aside={format.toUpperCase()}>
                <div className={styles.segmented}>
                  {(['png', 'jpeg', 'webp'] as Format[]).map((f) => (
                    <button key={f} className={cx(styles.segment, format === f && styles.segmentActive)} onClick={() => setExport({ format: f })}>
                      {f === 'jpeg' ? 'JPG' : f.toUpperCase()}
                    </button>
                  ))}
                </div>
                {format !== 'png' && (
                  <div className={styles.field}>
                    <div className={styles.fieldRow}>
                      <span className={styles.label}>Quality</span>
                      <span className={styles.fieldValue}>{quality}%</span>
                    </div>
                    <input type="range" className={styles.slider} min={1} max={100} value={quality} onChange={(e) => setExport({ quality: Number(e.target.value) })} />
                  </div>
                )}
                {format === 'jpeg' && !es.fill && <p className={styles.mutedText}>JPG has no transparency, so it gets a white background.</p>}
                <div className={styles.btnRow}>
                  <button className={cx(styles.btn, styles.btnGrow)} onClick={() => void downloadOne(selectedItem.id)}>Download</button>
                  <button className={styles.btn} onClick={() => void saveDraft(selectedItem)}>Save draft</button>
                </div>
                {items.length > 1 && (
                  <button className={styles.linkBtn} onClick={() => void downloadAllZip()} disabled={zipBusy}>
                    {zipBusy ? 'Building ZIP…' : `Download all ${items.length} as ZIP`}
                  </button>
                )}
              </Section>
            </>
          )}
        </aside>

        <button
          type="button"
          className={cx(styles.mobileFab, styles.mobileFabQueue)}
          onClick={() => { setMobileQueueOpen((v) => !v); setMobileControlsOpen(false); }}
          aria-label="Toggle queue"
        >
          Queue{hasItems && <span className={styles.mobileFabBadge}>{items.length}</span>}
        </button>
        <button
          type="button"
          className={cx(styles.mobileFab, styles.mobileFabControls)}
          onClick={() => { setMobileControlsOpen((v) => !v); setMobileQueueOpen(false); }}
          aria-label="Toggle inspector"
        >
          Edit
        </button>
      </div>}

      {/* Toast */}
      {toast && (
        <div
          role="status"
          className={cx(styles.toast, toast.kind === 'ok' ? styles.toastOk : toast.kind === 'err' ? styles.toastErr : styles.toastInfo)}
        >
          {toast.msg}
        </div>
      )}

      {bgNoticeDialogOpen && (
        <div className={cx(styles.dialogBackdrop, styles.open)} onClick={closeBgNoticeDialog}>
          <div className={styles.dialogPanel} role="dialog" aria-modal="true" aria-label="Download background model" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>Download the cut-out model?</span>
              <button className={styles.dialogClose} onClick={closeBgNoticeDialog} aria-label="Close">×</button>
            </div>
            <div className={styles.dialogBody}>
              <p>Background removal runs in your browser, so the model ({BG_MODEL_ESTIMATED_SIZE}) downloads once. Keep this tab open until it finishes.</p>
              <p className={styles.mutedText}>After that it’s cached and starts much faster.</p>
              <div className={styles.dialogActions}>
                <button className={cx(styles.btn, styles.btnQuiet)} onClick={closeBgNoticeDialog}>Not now</button>
                <button className={cx(styles.btn, styles.btnPrimary)} onClick={confirmBgNoticeDialog}>Download and cut out</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {namingDialogOpen && (
        <div className={cx(styles.dialogBackdrop, styles.open)} onClick={() => setNamingDialogOpen(false)}>
          <div className={styles.dialogPanel} role="dialog" aria-modal="true" aria-label="AI naming settings" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>AI naming</span>
              <button className={styles.dialogClose} onClick={() => setNamingDialogOpen(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.dialogBody}>
              <div className={styles.field}>
                <span className={styles.label}>Style</span>
                <div className={styles.styleGrid}>
                  {(Object.keys(NAME_STYLE_LABELS) as NameStyle[]).map((st) => (
                    <button
                      key={st}
                      className={cx(styles.styleOption, namingOptions.style === st && styles.styleOptionActive)}
                      onClick={() => setNamingOptions((o) => ({ ...o, style: st }))}
                      aria-pressed={namingOptions.style === st}
                    >
                      {buildName(['gold', 'coin'], { style: st, prefix: '', suffix: '' })}
                    </button>
                  ))}
                </div>
              </div>
              <div className={styles.field}>
                <div className={styles.fieldRow}>
                  <span className={styles.label}>Max words</span>
                  <span className={styles.fieldValue}>{namingOptions.maxWords}</span>
                </div>
                <input
                  type="range"
                  className={styles.slider}
                  min={1}
                  max={4}
                  value={namingOptions.maxWords}
                  onChange={(e) => setNamingOptions((o) => ({ ...o, maxWords: Number(e.target.value) }))}
                />
              </div>
              <div className={styles.twoCol}>
                <label className={styles.field}>
                  <span className={styles.label}>Prefix</span>
                  <input className={styles.input} value={namingOptions.prefix} placeholder="e.g. ui" onChange={(e) => setNamingOptions((o) => ({ ...o, prefix: e.target.value }))} />
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Suffix</span>
                  <input className={styles.input} value={namingOptions.suffix} placeholder="e.g. icon" onChange={(e) => setNamingOptions((o) => ({ ...o, suffix: e.target.value }))} />
                </label>
              </div>
              <p className={styles.mutedText}>
                Preview: <strong>{buildName(['energy', 'orb'], namingOptions)}.png</strong>
              </p>
              <label className={styles.field}>
                <span className={styles.label}>What are these images for?</span>
                <textarea
                  className={cx(styles.input, styles.textarea)}
                  rows={2}
                  maxLength={300}
                  value={namingOptions.context}
                  placeholder="e.g. Pet items for a tycoon game — name pets by species, food by type"
                  onChange={(e) => setNamingOptions((o) => ({ ...o, context: e.target.value }))}
                />
              </label>
              <label className={styles.checkRow}>
                <input
                  type="checkbox"
                  checked={namingOptions.autoOnImport}
                  onChange={(e) => setNamingOptions((o) => ({ ...o, autoOnImport: e.target.checked }))}
                />
                <span>Name images automatically when they’re added</span>
              </label>

              <details className={styles.advanced}>
                <summary>Model and API key</summary>
                <label className={styles.field}>
                  <span className={styles.label}>OpenRouter model</span>
                  <input
                    className={cx(styles.input, styles.mono)}
                    value={namingOptions.model}
                    placeholder={namingServer?.defaultModel ?? DEFAULT_VISION_MODEL}
                    spellCheck={false}
                    onChange={(e) => setNamingOptions((o) => ({ ...o, model: e.target.value }))}
                  />
                  <span className={styles.mutedText}>Any OpenRouter model that accepts images. Leave blank for the default; fallbacks kick in automatically.</span>
                </label>
                <label className={styles.field}>
                  <span className={styles.label}>Your OpenRouter key (optional)</span>
                  <input
                    type="password"
                    className={cx(styles.input, styles.mono)}
                    value={openRouterKey}
                    placeholder={namingServer?.configured ? 'Using the server’s key' : 'sk-or-…'}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(e) => setOpenRouterKey(e.target.value)}
                  />
                  <span className={styles.mutedText}>
                    {namingServer?.configured === false
                      ? 'The server has no key set, so naming needs one here.'
                      : 'Only needed if you want to use your own credits. Saved in this browser.'}
                  </span>
                </label>
              </details>

              <div className={styles.dialogActions}>
                {items.some((i) => i.nameStatus === 'done' && i.nameWords) && (
                  <button
                    className={cx(styles.btn, styles.btnQuiet)}
                    onClick={() => {
                      const n = restyleAllNames();
                      showToast(`Updated ${n} name${n === 1 ? '' : 's'}`, 'ok');
                    }}
                  >
                    Apply to AI-named images
                  </button>
                )}
                <button className={cx(styles.btn, styles.btnPrimary)} onClick={() => setNamingDialogOpen(false)}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {publishDialogMounted && (
        <div className={cx(styles.dialogBackdrop, publishDialogVisible && styles.open)} onClick={closePublishDialog}>
          <div className={styles.dialogPanel} role="dialog" aria-modal="true" aria-label="Publish settings" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>Publish settings</span>
              <button className={styles.dialogClose} onClick={closePublishDialog} aria-label="Close">×</button>
            </div>

            <div className={styles.dialogBody}>
              {presets.length > 0 && (
                <label className={styles.field}>
                  <span className={styles.label}>Saved accounts</span>
                  <select className={styles.input} value={selectedPresetId} onChange={(e) => applyPreset(e.target.value)}>
                    <option value="">Choose one…</option>
                    {presets.map((preset) => (
                      <option key={preset.id} value={preset.id}>{preset.name}</option>
                    ))}
                  </select>
                </label>
              )}

              <label className={styles.field}>
                <span className={styles.label}>Open Cloud API key</span>
                <div className={styles.passWrap}>
                  <input
                    type={showKey ? 'text' : 'password'}
                    className={cx(styles.input, styles.mono)}
                    value={apiKey}
                    onChange={(e) => setApiKey(e.target.value)}
                    placeholder="Paste your key"
                    autoComplete="off"
                    spellCheck={false}
                  />
                  <button type="button" className={styles.eyeBtn} onClick={() => setShowKey(!showKey)}>
                    {showKey ? 'Hide' : 'Show'}
                  </button>
                </div>
              </label>

              <div className={styles.field}>
                <span className={styles.label}>Upload to</span>
                <div className={styles.segmented}>
                  {(['user', 'group'] as CreatorType[]).map((t) => (
                    <button key={t} className={cx(styles.segment, creatorType === t && styles.segmentActive)} onClick={() => setCreatorType(t)}>
                      {t === 'user' ? 'My account' : 'A group'}
                    </button>
                  ))}
                </div>
              </div>

              <label className={styles.field}>
                <span className={styles.label}>{creatorType === 'user' ? 'User ID' : 'Group ID'}</span>
                <input
                  type="text"
                  inputMode="numeric"
                  className={cx(styles.input, styles.mono)}
                  value={creatorId}
                  onChange={(e) => setCreatorId(e.target.value.replace(/\D/g, ''))}
                  placeholder={creatorType === 'user' ? 'From roblox.com/users/ID/profile' : 'From roblox.com/communities/ID'}
                />
              </label>

              <details className={styles.advanced} open={showHelp} onToggle={(e) => setShowHelp((e.target as HTMLDetailsElement).open)}>
                <summary>How to get an API key</summary>
                <ol className={styles.helpList}>
                  <li>
                    Open{' '}
                    <a href="https://create.roblox.com/dashboard/credentials" target="_blank" rel="noreferrer">Creator Hub credentials</a>{' '}
                    and create an API key.
                  </li>
                  <li>Add the <strong>Assets</strong> API with read and write access, for your account or the group you upload to.</li>
                  <li>Allow your IP (or 0.0.0.0/0 for a hosted site), then copy the key here.</li>
                </ol>
              </details>

              <div className={styles.presetBox}>
                <span className={styles.label}>Save these as an account</span>
                <div className={styles.inlineForm}>
                  <input
                    type="text"
                    className={styles.input}
                    value={presetName}
                    onChange={(e) => setPresetName(e.target.value)}
                    onKeyDown={(e) => { if (e.key === 'Enter') saveNewPreset(); }}
                    placeholder="e.g. Whimsy group"
                  />
                  <button className={cx(styles.btn, styles.btnSmall)} onClick={saveNewPreset} disabled={!presetName.trim() || !publishReady}>Save</button>
                </div>
                {selectedPresetId && (
                  <div className={styles.btnRow}>
                    <button className={cx(styles.btn, styles.btnSmall)} onClick={updatePreset} disabled={!presetName.trim() || !publishReady}>Update selected</button>
                    <button className={cx(styles.btn, styles.btnSmall, styles.btnQuiet)} onClick={deletePreset}>Delete selected</button>
                  </div>
                )}
              </div>
              <p className={styles.mutedText}>Keys are stored only in this browser and sent to Roblox through this site’s server.</p>

              <div className={styles.dialogActions}>
                <button className={cx(styles.btn, styles.btnPrimary)} onClick={closePublishDialog}>Done</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {shortcutsOpen && (
        <div className={cx(styles.dialogBackdrop, styles.open)} onClick={() => setShortcutsOpen(false)}>
          <div className={styles.dialogPanel} role="dialog" aria-modal="true" aria-label="Keyboard shortcuts" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>Keyboard shortcuts</span>
              <button className={styles.dialogClose} onClick={() => setShortcutsOpen(false)} aria-label="Close">×</button>
            </div>
            <div className={styles.dialogBody}>
              <dl className={styles.shortcutList}>
                {SHORTCUTS.map((sc) => (
                  <div key={sc.keys} className={styles.shortcutRow}>
                    <dt><kbd>{sc.keys}</kbd></dt>
                    <dd>{sc.action}</dd>
                  </div>
                ))}
              </dl>
            </div>
          </div>
        </div>
      )}

      {changelogOpen && (
        <div
          className={cx(styles.dialogBackdrop, styles.open)}
          onClick={() => {
            setChangelogOpen(false);
            try { window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch { /* ignore */ }
          }}
        >
          <div className={cx(styles.dialogPanel, styles.changelogPanel)} role="dialog" aria-modal="true" aria-label="What's new" onClick={(e) => e.stopPropagation()}>
            <div className={styles.dialogHead}>
              <span className={styles.dialogTitle}>What’s new</span>
              <button
                className={styles.dialogClose}
                onClick={() => {
                  setChangelogOpen(false);
                  try { window.localStorage.setItem(LAST_SEEN_VERSION_KEY, APP_VERSION); } catch { /* ignore */ }
                }}
                aria-label="Close"
              >
                ×
              </button>
            </div>
            <div className={styles.changelogBody}>
              {CHANGELOG.map((entry, idx) => (
                <div key={entry.version} className={styles.changelogVersion}>
                  <div className={styles.changelogVersionHead}>
                    <span className={cx(styles.changelogTag, idx === 0 && styles.changelogTagLatest)}>v{entry.version}</span>
                    <span className={styles.mutedText}>{entry.date}</span>
                  </div>
                  <h3 className={styles.changelogTitle}>{entry.title}</h3>
                  {([['New', entry.features], ['Better', entry.improvements], ['Fixed', entry.fixes]] as [string, string[] | undefined][]).map(([label, list]) =>
                    list && list.length > 0 ? (
                      <div key={label} className={styles.changelogSection}>
                        <span className={styles.changelogSectionLabel}>{label}</span>
                        <ul className={styles.changelogList}>
                          {list.map((f, i) => <li key={i}>{f}</li>)}
                        </ul>
                      </div>
                    ) : null,
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
