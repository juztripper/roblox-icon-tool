# PIXEL FORGE — Roblox Batch Image Tool

A modern web application for batch processing game icons and images for Roblox. Upload multiple images, remove backgrounds, resize with quality control, and publish directly to Roblox using the Open Cloud API—all with a sleek, dark industrial UI.

## Features

- **Batch Image Processing** — Upload multiple images and process them together
- **AI Background Removal** — Remove backgrounds using on-device ONNX Runtime (no external API calls)
- **Smart Resizing** — Scale images with adjustable dimensions and quality settings
- **Roblox Publishing** — Publish images directly to Roblox as Decal assets and retrieve asset IDs
- **Format Control** — Choose output format (PNG, JPEG) and quality levels
- **Download Support** — Export processed images to your computer
- **Clipboard Paste** — Paste images directly from clipboard (Ctrl+V / Cmd+V)
- **Dark Industrial UI** — JetBrains Mono typography, orange accents, dot-grid backgrounds

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** CSS Modules with CSS variables
- **Background Removal:** `@imgly/background-removal-node` (server-side ONNX Runtime)
- **Image Processing:** HTML5 Canvas API
- **API Integration:** Roblox Open Cloud Assets v1 API
- **Deployment:** Vercel

## Quick Start

### Prerequisites

- Node.js 18+
- npm or yarn

### Installation

1. Clone the repository:
   ```bash
   git clone https://github.com/juztripper/roblox-icon-tool.git
   cd roblox-icon-tool
   ```

2. Install dependencies:
   ```bash
   npm install
   ```

3. Set up environment variables:
   Create a `.env.local` file in the root directory:
   ```
   # Roblox Open Cloud API credentials
   NEXT_PUBLIC_ROBLOX_UNIVERSE_ID=your_universe_id
   ROBLOX_API_KEY=your_api_key
   ```

4. Start the development server:
   ```bash
   npm run dev
   ```

5. Open [http://localhost:3000](http://localhost:3000) in your browser

## Roblox Setup

To use the publishing feature, you'll need to configure Roblox Open Cloud:

1. Go to [Creator Dashboard](https://create.roblox.com/)
2. Create or select your experience
3. Navigate to **Settings → Open Cloud Keys**
4. Create a new API key with scope: **Asset:Read, Asset:Create**
5. Copy your Universe ID and API key
6. Add them to `.env.local` (see Installation step 3)

## Usage

### Batch Workflow

1. **Add Images** — Click the **+** button in the queue panel or drag-and-drop multiple files
2. **Preview** — Click any thumbnail to preview the full image
3. **Remove Backgrounds** — Click "REMOVE BG FROM ALL" to process all images sequentially
4. **Adjust Settings** — Set export dimensions, quality, and format in the right panel
5. **Publish** — Click "PUBLISH ALL" to upload to Roblox and retrieve asset IDs
6. **Copy & Download** — Copy asset IDs or download processed images locally

### Keyboard Shortcuts

- **Ctrl+V / Cmd+V** — Paste images from clipboard
- **Drag & Drop** — Drop files onto the preview panel to add to queue

## Architecture

### Project Structure

```
roblox-icon-tool/
├── app/
│   ├── api/
│   │   ├── remove-background/route.ts    # Background removal API
│   │   └── roblox-upload/route.ts        # Roblox publishing API
│   ├── globals.css                       # Global styles & CSS variables
│   ├── layout.tsx                        # Root layout
│   └── page.tsx                          # Main page
├── components/
│   ├── ImageTool.tsx                     # Main component (batch processing)
│   └── ImageTool.module.css              # Component styles
├── next.config.js                        # Next.js configuration
├── tsconfig.json                         # TypeScript configuration
└── package.json
```

### Key Components

**ImageTool.tsx** — Core component managing:
- Image queue state (multiple items)
- Per-item background removal progress
- Per-item Roblox publishing status
- Batch operations (remove BG all, publish all)
- Object URL lifecycle management

**API Routes:**
- `/api/remove-background` — Server-side ONNX-based background removal
- `/api/roblox-upload` — Proxies image uploads to Roblox Open Cloud

### Design System

The UI uses a cohesive dark industrial aesthetic:
- **Color Variables:** Orange (#FF5A1F) for primary actions, green (#00E87B) for success, red (#FF4444) for errors
- **Typography:** JetBrains Mono for consistent monospace styling
- **Animations:** Dot-grid backgrounds, spin/shimmer animations, smooth transitions
- **Layout:** 3-panel design (queue, preview, controls)

## Build & Deployment

### Local Build

```bash
npm run build
npm start
```

### Deploy to Vercel

1. Push your code to GitHub:
   ```bash
   git add .
   git commit -m "Deploy PIXEL FORGE"
   git push origin main
   ```

2. Connect your repository to Vercel:
   - Go to [vercel.com](https://vercel.com)
   - Click "New Project" and import your GitHub repository
   - Set environment variables in Vercel dashboard:
     - `NEXT_PUBLIC_ROBLOX_UNIVERSE_ID`
     - `ROBLOX_API_KEY`

3. Deploy (automatic on push to main, or manual via Vercel dashboard)

## API Reference

### POST /api/remove-background

Removes the background from an image using ONNX Runtime.

**Request:**
- Form data with `image` field (Blob/File)

**Response:**
- 200: PNG image with transparent background
- 400: Missing image field
- 500: Processing error

**Example:**
```javascript
const formData = new FormData();
formData.append('image', imageBlob);
const response = await fetch('/api/remove-background', { method: 'POST', body: formData });
const resultBlob = await response.blob();
```

### POST /api/roblox-upload

Publishes an image to Roblox as a Decal asset.

**Request:**
```json
{
  "image": "base64-encoded-png",
  "assetName": "MyIcon",
  "creatorType": "User",
  "creatorId": 123456
}
```

**Response:**
```json
{
  "assetId": "123456789",
  "name": "MyIcon",
  "status": "Published"
}
```

## Troubleshooting

### "Unsupported format" Error

This occurs when the background removal API can't detect the image format. Ensure:
- Image is a valid PNG, JPG, or JPEG
- File is passed as Blob (not Buffer) to preserve MIME type
- The server and client agree on image format

### "Missing environment variables"

Make sure `.env.local` contains:
```
NEXT_PUBLIC_ROBLOX_UNIVERSE_ID=your_id
ROBLOX_API_KEY=your_key
```

Restart the dev server after updating environment variables.

### Background Removal is Slow (First Run)

On first use, the ONNX model (~40MB) downloads from imgly's CDN and is cached. Subsequent runs are faster.

## Performance Notes

- Batch processing is sequential (not parallel) to prevent timeouts on Vercel
- Maximum 45s per operation on Vercel Pro (due to function timeout)
- Large batches (10+ images) may take several minutes total
- Background removal model is cached locally per deployment

## Development

### Testing Locally

1. Create test images or download samples
2. Use the UI to test batch workflows
3. Monitor the browser console and Network tab for API calls
4. Check server logs: `npm run dev` outputs API route logs

### Debugging

Enable verbose logging by adding to `.env.local`:
```
DEBUG=*
```

### Code Style

- TypeScript for type safety
- CSS Modules for scoped styling
- React hooks for state management
- Server-side API routes for sensitive operations

## License

MIT

## Author

Created for efficient Roblox game icon management.

---

**Questions?** Check the [Roblox Creator Hub](https://create.roblox.com/) or review this project's inline code comments for implementation details.
