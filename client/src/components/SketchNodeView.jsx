import React, { useRef, useState, useEffect, useCallback } from 'react';
import { NodeViewWrapper } from '@tiptap/react';
import styled from 'styled-components';
import { getStroke } from 'perfect-freehand';
import SketchToolbar from './SketchToolbar';
import Icon from './Icons';
import {
  CANVAS_HEIGHT,
  DEFAULT_COLOR_ID,
  DEFAULT_SIZE_ID,
  ERASER_RADIUS,
  HIGHLIGHTER_OPACITY,
  resolveColor,
  resolveSize,
  canvasBg,
} from '../constants/sketchConfig';
import { useNoteFormContext } from '../contexts/NoteFormContext';
import ThemeManager from '../utils/ThemeManager';
import env from '../../env.js';

// ─── styled shells ───────────────────────────────────────────────────────────

const Wrapper = styled.div`
  position: relative;
  border: 1px solid var(--border-transparent);
  border-radius: 10px;
  overflow: hidden;
  margin: 8px 0;
  width: calc(100% - 8px);
  user-select: none;
  background: var(--note-bg-color, #fff);
`;

const Canvas = styled.canvas`
  display: block;
  width: 100%;
  height: ${CANVAS_HEIGHT}px;
  cursor: ${p => p.$tool === 'eraser' ? 'cell' : 'crosshair'};
  touch-action: none;
`;

const ViewCanvas = styled.canvas`
  display: block;
  width: 100%;
  height: ${CANVAS_HEIGHT}px;
  cursor: pointer;
`;

const EditBtn = styled.button.attrs(() => ({ type: 'button' }))`
  position: absolute;
  top: 8px;
  right: 8px;
  background: rgba(0, 0, 0, 0.55);
  color: white;
  border: none;
  border-radius: 50%;
  width: 32px;
  height: 32px;
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  z-index: 10;
  &:hover { background: rgba(0,0,0,0.75); }
`;

const DeleteBtn = styled(EditBtn)`
  right: 48px;
`;

// ─── stroke rendering helpers ────────────────────────────────────────────────

const toSvgPath = (pts) => {
  if (!pts.length) return '';
  return pts.reduce((d, [x, y], i, a) => {
    const [nx, ny] = a[(i + 1) % a.length];
    return d + (i === 0 ? `M ${x} ${y} ` : '') + `Q ${x} ${y} ${(x + nx) / 2} ${(y + ny) / 2} `;
  }, '') + 'Z';
};

const PEN_OPTS = (size) => ({ size, thinning: 0.5, smoothing: 0.5, streamline: 0.5, simulatePressure: true });
const HL_OPTS  = (size) => ({ size, thinning: 0,   smoothing: 0.5, streamline: 0.3, simulatePressure: false });

const drawStroke = (ctx, stroke, isDark) => {
  const size    = resolveSize(stroke.sizeId, stroke.tool);
  const color   = resolveColor(stroke.colorId, isDark);
  const opts    = stroke.tool === 'highlighter' ? HL_OPTS(size) : PEN_OPTS(size);
  const outline = getStroke(stroke.points, opts);
  if (!outline.length) return;
  const path = new Path2D(toSvgPath(outline));
  ctx.globalAlpha = stroke.tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1.0;
  ctx.fillStyle   = color;
  ctx.fill(path);
  ctx.globalAlpha = 1.0;
};

const renderAll = (ctx, W, H, strokes, isDark, pan = { x: 0, y: 0 }) => {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = canvasBg(isDark);
  ctx.fillRect(0, 0, W, H);
  ctx.save();
  ctx.translate(pan.x, pan.y);
  strokes.filter(s => s.tool === 'highlighter').forEach(s => drawStroke(ctx, s, isDark));
  strokes.filter(s => s.tool !== 'highlighter').forEach(s => drawStroke(ctx, s, isDark));
  ctx.restore();
};

// ─── thumbnail generation ────────────────────────────────────────────────────

const generateThumbnail = (strokes, isDark) =>
  new Promise(resolve => {
    if (!strokes.length) return resolve(null);

    // Bounding box of all stroke points, padded by half the largest stroke size
    let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
    let maxSize = 0;
    for (const stroke of strokes) {
      const sz = resolveSize(stroke.sizeId, stroke.tool);
      if (sz > maxSize) maxSize = sz;
      for (const [x, y] of stroke.points) {
        if (x < minX) minX = x;
        if (y < minY) minY = y;
        if (x > maxX) maxX = x;
        if (y > maxY) maxY = y;
      }
    }

    const pad  = Math.ceil(maxSize / 2) + 12;
    const srcX = Math.max(0, minX - pad);
    const srcY = Math.max(0, minY - pad);
    const srcW = Math.max(maxX - minX + pad * 2, 40);
    const srcH = Math.max(maxY - minY + pad * 2, 40);

    // Scale the cropped region to fit within 400px on the longest side
    const scale = Math.min(400 / srcW, 400 / srcH);
    const oc  = document.createElement('canvas');
    oc.width  = Math.round(srcW * scale);
    oc.height = Math.round(srcH * scale);

    const ctx = oc.getContext('2d');
    // Fill background first (before any transform)
    ctx.fillStyle = canvasBg(isDark);
    ctx.fillRect(0, 0, oc.width, oc.height);
    // Scale then translate so stroke coords map into the cropped region
    ctx.scale(scale, scale);
    ctx.translate(-srcX, -srcY);

    strokes.filter(s => s.tool === 'highlighter').forEach(s => drawStroke(ctx, s, isDark));
    strokes.filter(s => s.tool !== 'highlighter').forEach(s => drawStroke(ctx, s, isDark));

    oc.toBlob(blob => {
      if (!blob) return resolve(null);
      const r = new FileReader();
      r.onload = () => resolve(r.result);
      r.readAsDataURL(blob);
    }, 'image/webp', 0.8);
  });

// ─── main component ──────────────────────────────────────────────────────────

export default function SketchNodeView({ node, updateAttributes, deleteNode, editor }) {
  const sketchId  = node.attrs['data-sketch-id'];
  const isNew     = !sketchId;
  const isDark    = ThemeManager.getTheme();
  const ctx       = useNoteFormContext();
  const noteId    = ctx?.noteId ?? null;
  const token     = localStorage.getItem('authToken');
  const authHdr   = token ? { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' } : { 'Content-Type': 'application/json' };

  const [mode, setMode]             = useState(isNew ? 'edit' : 'view');
  const [strokes, setStrokes]       = useState([]);
  const [savedStrokes, setSaved]    = useState([]);
  const [undoStack, setUndo]        = useState([]);
  const [redoStack, setRedo]        = useState([]);
  const [tool, setTool]             = useState('pen');
  const [colorId, setColorId]       = useState(DEFAULT_COLOR_ID);
  const [sizeId, setSizeId]         = useState(DEFAULT_SIZE_ID);
  const [saving, setSaving]         = useState(false);

  const canvasRef      = useRef(null);
  const isDrawing      = useRef(false);
  const currentPts     = useRef([]);
  const erasedThisDrag = useRef([]);
  const eraserStartPt  = useRef(null);
  const eraserIsDrag   = useRef(false);
  const displaySize    = useRef({ w: 800, h: CANVAS_HEIGHT });
  const skipNextFetch  = useRef(false);
  // ── pan state ──────────────────────────────────────────────────────────────
  const panOffset      = useRef({ x: 0, y: 0 });
  const isPanning      = useRef(false);
  const lastMidpoint   = useRef(null);
  const activePointers = useRef(new Map()); // pointerId → { x, y }

  // ── fetch existing sketch data ─────────────────────────────────────────────
  useEffect(() => {
    if (!sketchId) return;
    if (skipNextFetch.current) { skipNextFetch.current = false; return; }
    fetch(`${env.SERVER_BASE_URL}/api/sketches/${sketchId}`, { headers: authHdr })
      .then(r => r.ok ? r.json() : null)
      .then(data => {
        if (data?.sketch?.strokes) {
          setStrokes(data.sketch.strokes);
          setSaved(data.sketch.strokes);
        }
      })
      .catch(() => {});
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sketchId]);

  // ── canvas sizing ──────────────────────────────────────────────────────────
  // Called both on mode switch and at the start of every pointer-down so we
  // always have the true layout dimensions before computing coordinates.
  const setupEditCanvas = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W    = rect.width  || 800;
    const H    = rect.height || CANVAS_HEIGHT;
    const bw   = Math.round(W * dpr);
    const bh   = Math.round(H * dpr);
    if (canvas.width !== bw || canvas.height !== bh) {
      canvas.width  = bw;
      canvas.height = bh;
      canvas.getContext('2d').scale(dpr, dpr);
    }
    displaySize.current = { w: W, h: H };
  }, []);

  useEffect(() => {
    if (mode === 'edit') setupEditCanvas();
  }, [mode, setupEditCanvas]);

  // ── imperative redraw (used both by effect and by live pointer drawing) ────
  const redrawCanvas = useCallback((livePts) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const c   = canvas.getContext('2d');
    const { w, h } = displaySize.current;
    const pan = panOffset.current;
    renderAll(c, w, h, strokes, isDark, pan);
    if (livePts && livePts.length > 1) {
      const size    = resolveSize(sizeId, tool);
      const opts    = tool === 'highlighter' ? HL_OPTS(size) : PEN_OPTS(size);
      const outline = getStroke(livePts, opts);
      if (outline.length) {
        const path = new Path2D(toSvgPath(outline));
        c.save();
        c.translate(pan.x, pan.y);
        c.globalAlpha = tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1.0;
        c.fillStyle   = resolveColor(colorId, isDark);
        c.fill(path);
        c.restore();
        c.globalAlpha = 1.0;
      }
    }
  }, [strokes, isDark, sizeId, tool, colorId]);

  // Redraw committed strokes when they change (undo/redo/erase/initial load)
  useEffect(() => {
    if (mode === 'edit') redrawCanvas(null);
  }, [mode, strokes, isDark, redrawCanvas]);

  // ── view mode canvas render ────────────────────────────────────────────────
  const viewRef = useRef(null);
  useEffect(() => {
    if (mode !== 'view') return;
    const canvas = viewRef.current;
    if (!canvas) return;
    const dpr  = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    const W    = rect.width  || 800;
    const H    = rect.height || CANVAS_HEIGHT;
    canvas.width  = Math.round(W * dpr);
    canvas.height = Math.round(H * dpr);
    canvas.getContext('2d').scale(dpr, dpr);
    renderAll(canvas.getContext('2d'), W, H, strokes, isDark);
  }, [mode, strokes, isDark]);

  // ── pointer helpers ────────────────────────────────────────────────────────
  const getCoords = useCallback((e) => {
    const canvas = canvasRef.current;
    const rect   = canvas.getBoundingClientRect();
    const src    = e.touches ? e.touches[0] : e;
    const pan    = panOffset.current;
    return [src.clientX - rect.left - pan.x, src.clientY - rect.top - pan.y, e.pressure ?? 0.5];
  }, []);

  const getMidpoint = useCallback(() => {
    const pts = [...activePointers.current.values()];
    if (pts.length < 2) return null;
    return { x: (pts[0].x + pts[1].x) / 2, y: (pts[0].y + pts[1].y) / 2 };
  }, []);

  const onPointerDown = useCallback((e) => {
    e.preventDefault();

    // Right-click drag → pan on desktop
    if (e.button === 2) {
      isPanning.current = true;
      lastMidpoint.current = { x: e.clientX, y: e.clientY };
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      canvasRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }

    // Track all active touch/pen pointers
    activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    // Two fingers → cancel any stroke in progress and pan instead
    if (activePointers.current.size >= 2) {
      isDrawing.current    = false;
      currentPts.current   = [];
      isPanning.current    = true;
      lastMidpoint.current = getMidpoint();
      if (canvasRef.current) canvasRef.current.style.cursor = 'grabbing';
      redrawCanvas(null); // clear live stroke
      canvasRef.current?.setPointerCapture?.(e.pointerId);
      return;
    }

    setupEditCanvas();
    isDrawing.current      = true;
    currentPts.current     = [getCoords(e)];
    erasedThisDrag.current = [];
    if (tool === 'eraser') {
      eraserStartPt.current = getCoords(e);
      eraserIsDrag.current  = false;
    }
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  }, [getCoords, getMidpoint, setupEditCanvas, redrawCanvas]);

  const onPointerMove = useCallback((e) => {
    e.preventDefault();

    // Update tracked position for this pointer
    if (activePointers.current.has(e.pointerId)) {
      activePointers.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    }

    if (isPanning.current) {
      const cur = activePointers.current.size >= 2
        ? getMidpoint()
        : { x: e.clientX, y: e.clientY };
      if (lastMidpoint.current && cur) {
        panOffset.current = {
          x: panOffset.current.x + cur.x - lastMidpoint.current.x,
          y: panOffset.current.y + cur.y - lastMidpoint.current.y,
        };
        redrawCanvas(null);
      }
      lastMidpoint.current = cur;
      return;
    }

    if (!isDrawing.current) return;
    const pt = getCoords(e);
    if (tool === 'eraser') {
      const [ex, ey] = pt;
      // Detect drag once pointer moves past threshold
      if (!eraserIsDrag.current && eraserStartPt.current) {
        const [sx, sy] = eraserStartPt.current;
        if (Math.hypot(ex - sx, ey - sy) > 8) eraserIsDrag.current = true;
      }
      if (eraserIsDrag.current) {
        setStrokes(prev => {
          const remaining = [];
          for (const s of prev) {
            if (s.points.some(([x, y]) => Math.hypot(x - ex, y - ey) < ERASER_RADIUS)) {
              erasedThisDrag.current.push(s);
            } else {
              remaining.push(s);
            }
          }
          return remaining;
        });
      }
    } else {
      currentPts.current = [...currentPts.current, pt];
      redrawCanvas(currentPts.current);
    }
  }, [tool, getCoords, getMidpoint, redrawCanvas]);

  const onPointerUp = useCallback((e) => {
    if (e?.pointerId !== undefined) {
      activePointers.current.delete(e.pointerId);
    }

    // Stop panning when all pan pointers lift
    if (isPanning.current && activePointers.current.size < 2) {
      isPanning.current    = false;
      lastMidpoint.current = null;
      if (canvasRef.current) canvasRef.current.style.cursor = '';
      return;
    }

    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'eraser') {
      if (!eraserIsDrag.current && eraserStartPt.current) {
        // Tap: remove only the topmost stroke at the tap point
        const [tx, ty] = eraserStartPt.current;
        setStrokes(prev => {
          let toRemoveIdx = -1;
          for (let i = prev.length - 1; i >= 0; i--) {
            if (prev[i].points.some(([x, y]) => Math.hypot(x - tx, y - ty) < ERASER_RADIUS)) {
              toRemoveIdx = i;
              break;
            }
          }
          if (toRemoveIdx === -1) return prev;
          const removed = prev[toRemoveIdx];
          setUndo(u => [...u, { type: 'erase', strokes: [{ stroke: removed, index: toRemoveIdx }] }]);
          setRedo([]);
          return prev.filter((_, i) => i !== toRemoveIdx);
        });
      } else if (erasedThisDrag.current.length) {
        const erased = erasedThisDrag.current.map((s, i) => ({ stroke: s, index: i }));
        setUndo(u => [...u, { type: 'erase', strokes: erased }]);
        setRedo([]);
      }
      erasedThisDrag.current = [];
    } else if (currentPts.current.length > 1) {
      const stroke = {
        id:      `s-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
        tool,
        colorId,
        sizeId,
        points: currentPts.current,
      };
      setStrokes(prev => [...prev, stroke]);
      setUndo(u => [...u, { type: 'add', stroke }]);
      setRedo([]);
    }
    currentPts.current = [];
  }, [tool, colorId, sizeId]);

  // ── undo / redo ────────────────────────────────────────────────────────────
  const undo = useCallback(() => {
    setUndo(u => {
      const action = u.at(-1);
      if (!action) return u;
      setRedo(r => [...r, action]);
      if (action.type === 'add') {
        setStrokes(s => s.filter(x => x.id !== action.stroke.id));
      } else {
        setStrokes(s => {
          const next = [...s];
          [...action.strokes]
            .sort((a, b) => a.index - b.index)
            .forEach(({ stroke, index }) => next.splice(index, 0, stroke));
          return next;
        });
      }
      return u.slice(0, -1);
    });
  }, []);

  const redo = useCallback(() => {
    setRedo(r => {
      const action = r.at(-1);
      if (!action) return r;
      setUndo(u => [...u, action]);
      if (action.type === 'add') {
        setStrokes(s => [...s, action.stroke]);
      } else {
        setStrokes(s => s.filter(x => !action.strokes.some(e => e.stroke.id === x.id)));
      }
      return r.slice(0, -1);
    });
  }, []);

  // ── save ───────────────────────────────────────────────────────────────────
  const handleDone = useCallback(async () => {
    if (saving) return;
    setSaving(true);
    try {
      const [thumbnail, thumbnailDark] = await Promise.all([
        generateThumbnail(strokes, false),
        generateThumbnail(strokes, true),
      ]);
      const { w, h } = displaySize.current;

      let id = sketchId;
      let isNewSketch = false;
      if (!id) {
        if (!noteId) { setSaving(false); return; }
        const res  = await fetch(`${env.SERVER_BASE_URL}/api/notes/${noteId}/sketches`, {
          method: 'POST',
          headers: authHdr,
          body: JSON.stringify({ width: Math.round(w), height: Math.round(h) }),
        });
        const data = await res.json();
        id = data.sketch.id;
        isNewSketch = true;
      }

      await fetch(`${env.SERVER_BASE_URL}/api/sketches/${id}`, {
        method: 'PUT',
        headers: authHdr,
        body: JSON.stringify({ strokes, thumbnail, thumbnail_dark: thumbnailDark }),
      });

      // Update the node attribute AFTER the PUT so that the sketchId-change
      // effect doesn't fetch from the server before strokes are written.
      if (isNewSketch) {
        skipNextFetch.current = true;
        updateAttributes({ 'data-sketch-id': String(id) });
      }

      setSaved(strokes);
      ctx?.onSketchSaved?.(id, thumbnail, thumbnailDark);
      setMode('view');
    } catch (err) {
      console.error('[SketchNodeView] save failed:', err);
    } finally {
      setSaving(false);
    }
  }, [saving, strokes, isDark, sketchId, noteId, authHdr, updateAttributes]);

  const handleCancel = useCallback(() => {
    if (isNew && !sketchId) {
      deleteNode();
    } else {
      setStrokes(savedStrokes);
      setUndo([]);
      setRedo([]);
      setMode('view');
    }
  }, [isNew, sketchId, savedStrokes, deleteNode]);

  // Register this sketch's save handler while it's in edit mode so the form
  // can flush it before closing.
  useEffect(() => {
    if (mode !== 'edit' || !ctx?.registerSketchSave) return;
    return ctx.registerSketchSave(() => handleDone());
  }, [mode, ctx, handleDone]);

  const handleDelete = useCallback(async () => {
    if (sketchId) {
      await fetch(`${env.SERVER_BASE_URL}/api/sketches/${sketchId}`, {
        method: 'DELETE', headers: authHdr,
      }).catch(() => {});
    }
    deleteNode();
  }, [sketchId, authHdr, deleteNode]);

  // ── render ─────────────────────────────────────────────────────────────────
  return (
    <NodeViewWrapper>
      <Wrapper contentEditable={false} onMouseDown={e => { e.preventDefault(); e.stopPropagation(); }}>
        {mode === 'edit' ? (
          <>
            <Canvas
              ref={canvasRef}
              $tool={tool}
              onPointerDown={onPointerDown}
              onPointerMove={onPointerMove}
              onPointerUp={onPointerUp}
              onPointerLeave={onPointerUp}
              onPointerCancel={onPointerUp}
              onContextMenu={e => e.preventDefault()}
            />
            <SketchToolbar
              tool={tool} colorId={colorId} sizeId={sizeId}
              canUndo={undoStack.length > 0} canRedo={redoStack.length > 0}
              onToolChange={setTool}
              onColorChange={setColorId}
              onSizeChange={setSizeId}
              onUndo={undo} onRedo={redo}
              onDone={handleDone}
              onCancel={handleCancel}
            />
          </>
        ) : (
          <>
            <ViewCanvas ref={viewRef} onClick={() => setMode('edit')} />
            <EditBtn onClick={() => setMode('edit')} title="Edit sketch">
              <Icon name="sketch" size={16} color="white" />
            </EditBtn>
            <DeleteBtn onClick={handleDelete} title="Delete sketch">
              <Icon name="trash" size={16} color="white" />
            </DeleteBtn>
          </>
        )}
      </Wrapper>
    </NodeViewWrapper>
  );
}
