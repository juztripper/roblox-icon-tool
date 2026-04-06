'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import styles from './ImageTool.module.css';

// ── Types ─────────────────────────────────────────────────────────────────────

type Format = 'png' | 'jpeg' | 'webp';
type CreatorType = 'user' | 'group';
type BgStatus = 'idle' | 'processing' | 'done' | 'error';
type PubStatus = 'idle' | 'queued' | 'publishing' | 'done' | 'error';
type ToastKind = 'ok' | 'err' | 'info';

interface ImageItem {
  id: string;
  originalBlob: Blob;
  processedBlob: Blob | null;
  previewUrl: string;
  fileName: string;
  dims: { w: number; h: number } | null;
  bgStatus: BgStatus;
  bgError?: string;
  pubStatus: PubStatus;
  pubAssetId?: string;
  pubError?: string;
}

interface ToastState {
  msg: string;
  kind: ToastKind;
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
      ctx.drawImage(img, 0, 0, w, h);
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

// ── Component ─────────────────────────────────────────────────────────────────

export default function ImageTool() {
  // Queue state
  const [items, setItems] = useState<ImageItem[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Export settings
  const [tw, setTw] = useState(512);
  const [th, setTh] = useState(512);
  const [locked, setLocked] = useState(true);
  const [quality, setQuality] = useState(90);
  const [format, setFormat] = useState<Format>('png');

  // BG removal
  const [bgBusy, setBgBusy] = useState(false);
  const [bgBatchInfo, setBgBatchInfo] = useState<{ current: number; total: number } | null>(null);

  // Single-item BG progress (fake ticker)
  const [bgPct, setBgPct] = useState(0);

  // Roblox publish
  const [apiKey, setApiKey] = useState('');
  const [showKey, setShowKey] = useState(false);
  const [creatorType, setCreatorType] = useState<CreatorType>('user');
  const [creatorId, setCreatorId] = useState('');
  const [publishing, setPublishing] = useState(false);
  const [showHelp, setShowHelp] = useState(false);

  // Toast
  const [toast, setToast] = useState<ToastState | null>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

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

  // ── Derived ──────────────────────────────────────────────────────────────────

  const selectedItem = items.find((i) => i.id === selectedId) ?? null;
  const hasItems = items.length > 0;

  function activeBlob(item: ImageItem): Blob {
    return item.processedBlob ?? item.originalBlob;
  }

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
          dims,
          bgStatus: 'idle' as BgStatus,
          pubStatus: 'idle' as PubStatus,
        };
      }),
    );

    setItems((prev) => {
      const updated = [...prev, ...newItems];
      return updated;
    });

    // Auto-select the first newly added item if nothing selected
    setSelectedId((prev) => prev ?? newItems[0].id);
  }, []);

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

    try {
      const fd = new FormData();
      fd.append('image', activeBlob(item), 'source.png');

      let fakeProgress = 0;
      const ticker = setInterval(() => {
        fakeProgress = Math.min(fakeProgress + 3, 90);
        setBgPct(fakeProgress);
      }, 400);

      const res = await fetch('/api/remove-background', { method: 'POST', body: fd });
      clearInterval(ticker);
      setBgPct(100);

      if (!res.ok) {
        const err = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
        throw new Error((err as { error?: string }).error ?? `HTTP ${res.status}`);
      }

      const result = await res.blob();

      // Revoke old preview URL and create new one
      setItems((prev) =>
        prev.map((i) => {
          if (i.id !== id) return i;
          URL.revokeObjectURL(i.previewUrl);
          const newUrl = URL.createObjectURL(result);
          return { ...i, processedBlob: result, previewUrl: newUrl, bgStatus: 'done' };
        }),
      );

      if (standalone) showToast('Background removed', 'ok');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Background removal failed';
      updateItem(id, { bgStatus: 'error', bgError: msg });
      if (standalone) showToast(msg, 'err');
    } finally {
      if (standalone) { setBgBusy(false); setBgPct(0); }
    }
  }, [showToast]);

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

  // ── Export ────────────────────────────────────────────────────────────────────

  const getExportBlob = useCallback(async (item: ImageItem): Promise<Blob> => {
    const exportFmt: Format = item.processedBlob ? 'png' : format;
    return canvasExport(activeBlob(item), tw, th, exportFmt, quality);
  }, [format, tw, th, quality]);

  // ── Download ──────────────────────────────────────────────────────────────────

  const downloadOne = useCallback(async (id: string) => {
    const item = itemsRef.current.find((i) => i.id === id);
    if (!item) return;
    try {
      const blob = await getExportBlob(item);
      const ext = item.processedBlob ? 'png' : format;
      const base = item.fileName.replace(/\.[^.]+$/, '') || 'image';
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `${base}_${tw}x${th}.${ext}`;
      a.click();
      URL.revokeObjectURL(url);
    } catch (err: unknown) {
      showToast(err instanceof Error ? err.message : 'Download failed', 'err');
    }
  }, [getExportBlob, format, tw, th, showToast]);

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

  // ── Aspect lock helpers ───────────────────────────────────────────────────────

  const changeW = (v: number) => {
    setTw(v);
    if (locked) setTh(v); // square by default; if we had per-item dims we'd use ratio
  };
  const changeH = (v: number) => {
    setTh(v);
    if (locked) setTw(v);
  };

  // ── Publish ───────────────────────────────────────────────────────────────────

  const publishAll = useCallback(async () => {
    if (items.length === 0) return;
    if (!apiKey.trim()) { showToast('Enter your Roblox API key', 'err'); return; }
    if (!creatorId.trim()) { showToast('Enter a creator ID', 'err'); return; }

    setPublishing(true);

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
        fd.append('image', blob, 'icon.png');

        const res = await fetch('/api/roblox-upload', { method: 'POST', body: fd });
        const data: { assetId?: string | number; error?: string; success?: boolean } = await res.json();

        if (data.success && data.assetId) {
          const id = String(data.assetId);
          setItems((prev) =>
            prev.map((i) =>
              i.id === item.id ? { ...i, pubStatus: 'done' as PubStatus, pubAssetId: id } : i,
            ),
          );
        } else {
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
        setItems((prev) =>
          prev.map((i) =>
            i.id === item.id ? { ...i, pubStatus: 'error' as PubStatus, pubError: msg } : i,
          ),
        );
      }
    }

    setPublishing(false);
    showToast('Publish complete', 'ok');
  }, [items, apiKey, creatorType, creatorId, getExportBlob, showToast]);

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

  // ── Render ────────────────────────────────────────────────────────────────────

  return (
    <main className={styles.app}>

      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.headerLeft}>
          <span className={styles.logoMark}>PIXEL FORGE</span>
          <span className={styles.logoDivider} />
          <span className={styles.logoSub}>Roblox Image Tool</span>
        </div>
        <div className={styles.headerRight}>
          {hasItems && (
            <span className={styles.headerMeta}>
              {items.length} image{items.length > 1 ? 's' : ''}
            </span>
          )}
          {selectedItem && (
            <span className={styles.headerMeta}>
              {fmtBytes(activeBlob(selectedItem).size)}
            </span>
          )}
          <span className={styles.vBadge}>v2.0</span>
        </div>
      </header>

      {/* ── Body ── */}
      <div className={styles.body}>

        {/* ── Queue Panel ── */}
        <div className={styles.queuePanel}>
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
                    alt={item.fileName}
                    className={styles.thumbImgEl}
                  />
                </div>
                <div className={styles.thumbFooter}>
                  <span className={styles.thumbFileName}>{item.fileName}</span>
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
            <span className={styles.barLabel}>
              {selectedItem ? selectedItem.fileName : 'Preview'}
            </span>
            {selectedBg && (
              <span className={styles.bgRemovedTag}>● BG Removed</span>
            )}
          </div>
          <div
            className={`${styles.previewArea}${isDragging ? ` ${styles.dragging}` : ''}`}
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
          >
            {selectedItem ? (
              <img
                key={selectedItem.previewUrl}
                src={selectedItem.previewUrl}
                alt="Preview"
                className={styles.previewImg}
              />
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
        <aside className={styles.controls}>

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
                    onClick={() => setLocked(!locked)}
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
                  onChange={(e) => setQuality(Number(e.target.value))}
                />
              </div>

              <div>
                <label className={styles.label}>Format</label>
                <div className={styles.toggleGroup}>
                  {(['png', 'jpeg', 'webp'] as Format[]).map((f) => (
                    <button
                      key={f}
                      className={`${styles.toggleBtn}${format === f ? ` ${styles.active}` : ''}`}
                      onClick={() => setFormat(f)}
                    >
                      {f.toUpperCase()}
                    </button>
                  ))}
                </div>
              </div>

            </div>
          </div>

          {/* 02 — Background Removal */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>02</span>
              <span className={styles.sectionTitle}>Remove Background</span>
            </div>
            <div className={styles.sectionBody}>

              <div className={styles.btnGroup}>
                <button
                  className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}
                  onClick={removeBgAll}
                  disabled={!hasItems || bgBusy}
                >
                  {bgBusy && bgBatchInfo ? '◌ Processing…' : '⬡ Remove BG from All'}
                </button>
                <button
                  className={styles.btn}
                  onClick={() => selectedId && removeBgOne(selectedId)}
                  disabled={
                    !selectedItem ||
                    bgBusy ||
                    selectedItem.bgStatus === 'processing'
                  }
                  title="Process only the selected image"
                >
                  Selected
                </button>
              </div>

              {bgBatchInfo && (
                <div className={styles.batchInfo}>
                  <div className={styles.batchSpinner} />
                  <span className={styles.batchInfoText}>
                    Processing {bgBatchInfo.current} / {bgBatchInfo.total}…
                  </span>
                </div>
              )}

              <p className={styles.hint}>
                Processed server-side. Results appear per image in the queue.
              </p>

            </div>
          </div>

          {/* 03 — Publish to Roblox */}
          <div className={styles.section}>
            <div className={styles.sectionHead}>
              <span className={styles.sectionNum}>03</span>
              <span className={styles.sectionTitle}>Publish to Roblox</span>
            </div>

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

            <div className={styles.sectionBody}>

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

              <button
                className={`${styles.btn} ${styles.btnPrimary} ${styles.btnFull}`}
                onClick={publishAll}
                disabled={!hasItems || publishing || !apiKey.trim() || !creatorId.trim()}
              >
                {publishing
                  ? '◌ Publishing…'
                  : `▶ Publish All (${items.length} image${items.length !== 1 ? 's' : ''})`}
              </button>

              {/* Per-item publish results */}
              {items.some((i) => i.pubStatus !== 'idle') && (
                <div className={styles.pubResultsList}>
                  {items.map((item) => (
                    <div key={item.id} className={styles.pubResultRow}>
                      <span className={styles.pubResultName}>{item.fileName}</span>
                      <span className={`${styles.pubStatusPill} ${pubStatusClass(item.pubStatus)}`}>
                        {item.pubStatus}
                      </span>
                      {item.pubAssetId && (
                        <span className={styles.pubAssetId}>{item.pubAssetId}</span>
                      )}
                      {item.pubAssetId && (
                        <button
                          className={styles.pubCopyBtn}
                          onClick={() => copyAssetId(item.id)}
                          title="Copy asset ID"
                        >
                          Copy
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}

              {hasSomeAssetId && (
                <button className={styles.copyAllBtn} onClick={copyAllIds}>
                  ↳ Copy All IDs
                </button>
              )}

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
                {tw}×{th}px · {selectedItem?.processedBlob ? 'PNG' : format.toUpperCase()} · {quality}% quality
              </p>

            </div>
          </div>

        </aside>
      </div>

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

    </main>
  );
}
