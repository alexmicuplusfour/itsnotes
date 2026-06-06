import React, { useState, useEffect, useRef } from 'react';
import ReactDOM from 'react-dom';
import { useAuth } from '../contexts/AuthContext';
import './DemoBanner.css';

function formatTimeLeft(targetIso) {
  const diff = new Date(targetIso) - Date.now();
  if (diff <= 0) return 'resetting…';
  const h = Math.floor(diff / 3600000);
  const m = Math.floor((diff % 3600000) / 60000);
  const s = Math.floor((diff % 60000) / 1000);
  if (h > 0) return `${h}h ${m}m`;
  if (m > 0) return `${m}m ${s}s`;
  return `${s}s`;
}

const DemoBanner = () => {
  const { isDemoMode, nextResetAt } = useAuth();
  const [timeLeft, setTimeLeft] = useState('');
  const [position, setPosition] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const bannerRef = useRef(null);
  const dragStartRef = useRef(null);

  useEffect(() => {
    if (!nextResetAt) return;
    setTimeLeft(formatTimeLeft(nextResetAt));
    const id = setInterval(() => setTimeLeft(formatTimeLeft(nextResetAt)), 1000);
    return () => clearInterval(id);
  }, [nextResetAt]);

  const startDrag = (clientX, clientY) => {
    const rect = bannerRef.current.getBoundingClientRect();
    dragStartRef.current = { clientX, clientY, elX: rect.left, elY: rect.top };
    setIsDragging(true);
  };

  useEffect(() => {
    if (!isDragging) return;

    const onMove = (clientX, clientY) => {
      const { clientX: startX, clientY: startY, elX, elY } = dragStartRef.current;
      setPosition({ left: elX + (clientX - startX), top: elY + (clientY - startY) });
    };

    const handleMouseMove = (e) => onMove(e.clientX, e.clientY);
    const handleTouchMove = (e) => { e.preventDefault(); onMove(e.touches[0].clientX, e.touches[0].clientY); };
    const handleEnd = () => setIsDragging(false);

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleEnd);
    document.addEventListener('touchmove', handleTouchMove, { passive: false });
    document.addEventListener('touchend', handleEnd);
    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleEnd);
      document.removeEventListener('touchmove', handleTouchMove);
      document.removeEventListener('touchend', handleEnd);
    };
  }, [isDragging]);

  if (!isDemoMode) return null;

  const style = position
    ? { left: position.left, top: position.top, bottom: 'auto', transform: 'none' }
    : {};

  return ReactDOM.createPortal(
    <div
      ref={bannerRef}
      className={`demo-banner${isDragging ? ' demo-banner--dragging' : ''}`}
      style={style}
      onMouseDown={(e) => { e.preventDefault(); startDrag(e.clientX, e.clientY); }}
      onTouchStart={(e) => { startDrag(e.touches[0].clientX, e.touches[0].clientY); }}
    >
      Demo · resets in <span className="demo-banner__countdown">{timeLeft}</span>
    </div>,
    document.body
  );
};

export default DemoBanner;
