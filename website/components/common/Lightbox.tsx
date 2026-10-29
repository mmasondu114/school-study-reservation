import { useEffect, useState } from 'react';
import { X, ChevronLeft, ChevronRight, ZoomIn, ZoomOut, RotateCw } from 'lucide-react';

interface LightboxProps {
  images: string[];
  initialIndex?: number;
  onClose: () => void;
}

export function Lightbox({ images, initialIndex = 0, onClose }: LightboxProps) {
  const [index, setIndex] = useState(initialIndex);
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      if (e.key === 'ArrowLeft') prev();
      if (e.key === 'ArrowRight') next();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [index, images.length]);

  const prev = () => {
    setScale(1);
    setRotation(0);
    setIndex((i) => (i > 0 ? i - 1 : images.length - 1));
  };

  const next = () => {
    setScale(1);
    setRotation(0);
    setIndex((i) => (i < images.length - 1 ? i + 1 : 0));
  };

  if (!images.length) return null;

  return (
    <div className="lightbox-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div className="lightbox-content" onClick={(e) => e.stopPropagation()}>
        <div className="lightbox-toolbar">
          <span className="lightbox-counter">
            {index + 1} / {images.length}
          </span>
          <div className="lightbox-actions">
            <button
              onClick={() => setScale((s) => Math.min(3, s + 0.25))}
              title="放大"
              aria-label="放大照片"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={() => setScale((s) => Math.max(0.5, s - 0.25))}
              title="缩小"
              aria-label="缩小照片"
            >
              <ZoomOut size={18} />
            </button>
            <button
              onClick={() => setRotation((r) => (r + 90) % 360)}
              title="顺时针旋转90度"
              aria-label="旋转照片"
            >
              <RotateCw size={18} />
            </button>
            <button onClick={onClose} title="关闭预览" aria-label="关闭预览">
              <X size={20} />
            </button>
          </div>
        </div>

        <div className="lightbox-stage">
          {images.length > 1 && (
            <button className="lightbox-nav prev" onClick={prev} aria-label="上一张">
              <ChevronLeft size={28} />
            </button>
          )}

          <div className="lightbox-image-wrap">
            <img
              src={images[index]}
              alt={`凭证照片 ${index + 1}`}
              style={{
                transform: `scale(${scale}) rotate(${rotation}deg)`,
                transition: 'transform 0.2s cubic-bezier(0.2, 0, 0, 1)',
              }}
            />
          </div>

          {images.length > 1 && (
            <button className="lightbox-nav next" onClick={next} aria-label="下一张">
              <ChevronRight size={28} />
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
