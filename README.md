# Pixel Forge — Roblox Icon Tool

A browser workbench for getting images into Roblox: cut out backgrounds, name them with AI, size them for icons and thumbnails, and publish them straight to Roblox through Open Cloud — then copy the asset IDs into your game as a Luau table.

## What it does

- **Batch queue** — drop, paste (Ctrl/Cmd+V) or browse for any number of images. Filter by not cut out, unpublished or published.
- **Background removal in the browser** — RMBG-1.4 via `@huggingface/transformers` (WebGPU with WASM fallback). Nothing is uploaded. Includes alpha bleeding so edges don't get dark halos on Roblox, plus a touch-up brush with smart colour-aware erase/restore.
- **AI naming** — a vision model on OpenRouter names each image and suggests alternatives. Choose snake_case, PascalCase, camelCase, kebab-case or Title Case, word count, prefix/suffix, and give it context about your game.
- **Export controls** — size presets (1024, 512, 256, 128, 1920×1080, original), aspect lock, padding, brightness, solid background fill, PNG/JPG/WebP.
- **Preview on a cutting mat** — the export frame is drawn on the mat at its real size. Switch to checker, dark or light backgrounds, and hold Compare (or C) to see the original.
- **Publish to Roblox** — user or group uploads, saved accounts, skip already-published images, automatic follow-up for uploads Roblox is still processing.
- **Copy IDs** as a Luau module, JSON or a plain list. Download everything as one ZIP (includes `asset_ids.lua` when images are published).
- **Drafts and library** — saved locally in the browser (localStorage + IndexedDB). Import any Roblox image by asset ID.
- Light/dark/system appearance, accent colours, keyboard shortcuts (press `?`), mobile layout.

## Setup

Requires Node.js 18+.

```bash
npm install
npm run dev
```

Create `.env.local`:

```bash
# AI naming (https://openrouter.ai/keys). Optional — users can also paste
# their own key in Naming settings instead.
OPENROUTER_API_KEY=sk-or-...

# Optional: override the default vision model
# OPENROUTER_IMAGE_MODEL=google/gemini-3.5-flash-lite
```

Roblox credentials are **not** environment variables — each user enters their Open Cloud API key and user/group ID in the app's publish settings, and they're stored only in their browser.

### AI naming model

The default model is `google/gemini-3.5-flash-lite`, with `qwen/qwen3.7-flash` and `google/gemma-4-26b-a4b-it` as automatic OpenRouter fallbacks. You can change the model per-browser in Naming settings → Model and API key, or server-wide with `OPENROUTER_IMAGE_MODEL`. Any OpenRouter model that accepts image input works.

Naming previously broke because the old default was a reasoning model called with `max_tokens: 12` — the reasoning used up the budget and the answer came back empty. The route now disables reasoning where possible, allows a larger budget, and parses JSON, code fences and plain-text answers.

### Roblox API key

1. Go to [Creator Hub → Credentials](https://create.roblox.com/dashboard/credentials) and create an API key.
2. Add the **Assets** API with read and write access, for your account or the group you upload to.
3. Allow the IP addresses your site runs from (`0.0.0.0/0` for a hosted deployment).
4. Paste the key and your user or group ID into the app's publish settings.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| ↑ / ↓ | Previous / next image |
| B | Remove background |
| N | AI name selected image |
| R or F2 | Rename |
| D | Download selected |
| C (hold) | Compare with original |
| Delete | Remove from queue |
| Ctrl/Cmd+Z | Undo touch-up stroke (Shift to redo) |
| Space + drag | Pan |
| ? | Show shortcuts |

## Project structure

```
app/
  api/auto-name/route.ts          AI naming via OpenRouter (GET reports whether a key is configured)
  api/roblox-upload/route.ts      Uploads to Roblox Open Cloud Assets v1
  api/roblox-operation/route.ts   Follow-up check for uploads still processing
  api/roblox-fetch-image/route.ts Fetches an existing Roblox image by asset ID
  globals.css                     Theme tokens (light/dark, accent)
components/
  ImageTool.tsx                   The whole app UI and client logic
  ImageTool.module.css            Workbench styles
lib/
  bgRemoval.ts                    In-browser background removal
  naming.ts                       Name parsing and formatting (shared client/server)
  robloxOperation.ts              Open Cloud operation polling
  zip.ts                          Dependency-free ZIP writer
```

## Deploying to Vercel

Import the repo in Vercel and set `OPENROUTER_API_KEY` (and optionally `OPENROUTER_IMAGE_MODEL`). Images are downscaled to 512px before naming so requests stay well under Vercel's 4.5MB body limit.

## License

MIT
