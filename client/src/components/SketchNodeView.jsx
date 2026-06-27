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

const renderAll = (ctx, W, H, strokes, isDark) => {
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = canvasBg(isDark);
  ctx.fillRect(0, 0, W, H);
  // highlights under pens
  strokes.filter(s => s.tool === 'highlighter').forEach(s => drawStroke(ctx, s, isDark));
  strokes.filter(s => s.tool !== 'highlighter').forEach(s => drawStroke(ctx, s, isDark));
};

// ─── thumbnail generation ────────────────────────────────────────────────────

const generateThumbnail = (strokes, isDark) =>
  new Promise(resolve => {
    const oc = document.createElement('canvas');
    oc.width  = 400;
    oc.height = Math.round(400 * (CANVAS_HEIGHT / 800));
    const ctx = oc.getContext('2d');
    ctx.scale(oc.width / 800, oc.height / CANVAS_HEIGHT);
    renderAll(ctx, 800, CANVAS_HEIGHT, strokes, isDark);
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
  const displaySize    = useRef({ w: 800, h: CANVAS_HEIGHT });

  // ── fetch existing sketch data ─────────────────────────────────────────────
  useEffect(() => {
    if (!sketchId) return;
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
    const c = canvas.getContext('2d');
    const { w, h } = displaySize.current;
    renderAll(c, w, h, strokes, isDark);
    if (livePts && livePts.length > 1) {
      const size    = resolveSize(sizeId, tool);
      const opts    = tool === 'highlighter' ? HL_OPTS(size) : PEN_OPTS(size);
      const outline = getStroke(livePts, opts);
      if (outline.length) {
        const path = new Path2D(toSvgPath(outline));
        c.globalAlpha = tool === 'highlighter' ? HIGHLIGHTER_OPACITY : 1.0;
        c.fillStyle   = resolveColor(colorId, isDark);
        c.fill(path);
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
    return [src.clientX - rect.left, src.clientY - rect.top, e.pressure ?? 0.5];
  }, []);

  const onPointerDown = useCallback((e) => {
    if (e.button !== undefined && e.button !== 0) return;
    e.preventDefault();
    // Re-measure canvas here — guaranteed to have final layout by first touch.
    setupEditCanvas();
    isDrawing.current      = true;
    currentPts.current     = [getCoords(e)];
    erasedThisDrag.current = [];
    canvasRef.current?.setPointerCapture?.(e.pointerId);
  }, [getCoords, setupEditCanvas]);

  const onPointerMove = useCallback((e) => {
    if (!isDrawing.current) return;
    e.preventDefault();
    const pt = getCoords(e);
    if (tool === 'eraser') {
      const [ex, ey] = pt;
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
    } else {
      currentPts.current = [...currentPts.current, pt];
      // Draw live — imperative, no React re-render needed
      redrawCanvas(currentPts.current);
    }
  }, [tool, getCoords, redrawCanvas]);

  const onPointerUp = useCallback(() => {
    if (!isDrawing.current) return;
    isDrawing.current = false;

    if (tool === 'eraser') {
      if (erasedThisDrag.current.length) {
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
      const thumbnail = await generateThumbnail(strokes, isDark);
      const { w, h }  = displaySize.current;

      let id = sketchId;
      if (!id) {
        if (!noteId) { setSaving(false); return; }
        const res  = await fetch(`${env.SERVER_BASE_URL}/api/notes/${noteId}/sketches`, {
          method: 'POST',
          headers: authHdr,
          body: JSON.stringify({ width: Math.round(w), height: Math.round(h) }),
        });
        const data = await res.json();
        id = data.sketch.id;
        updateAttributes({ 'data-sketch-id': String(id) });
      }

      await fetch(`${env.SERVER_BASE_URL}/api/sketches/${id}`, {
        method: 'PUT',
        headers: authHdr,
        body: JSON.stringify({ strokes, thumbnail }),
      });

      setSaved(strokes);
      ctx?.onSketchSaved?.(id, thumbnail);
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
