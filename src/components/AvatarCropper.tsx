import { useState, useRef, useCallback, useEffect } from 'react';
import { X, ZoomIn, ZoomOut, RotateCw, Check, Move } from 'lucide-react';

interface Props {
  image: string;
  onCrop: (croppedImage: string) => void;
  onCancel: () => void;
}

export default function AvatarCropper({ image, onCrop, onCancel }: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [scale, setScale] = useState(1);
  const [rotation, setRotation] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [imageSize, setImageSize] = useState({ width: 0, height: 0 });
  const [containerSize, setContainerSize] = useState({ width: 300, height: 300 });
  const [imageLoaded, setImageLoaded] = useState(false);

  useEffect(() => {
    const img = new Image();
    img.onload = () => {
      setImageSize({ width: img.width, height: img.height });
      setImageLoaded(true);
    };
    img.src = image;
  }, [image]);

  useEffect(() => {
    if (!imageLoaded) return;
    
    const containerWidth = containerSize.width;
    const containerHeight = containerSize.height;
    
    const maxDim = Math.max(imageSize.width, imageSize.height);
    const initialScale = Math.max(containerWidth, containerHeight) / maxDim;
    
    setScale(initialScale);
    setPosition({ x: 0, y: 0 });
  }, [imageLoaded, imageSize, containerSize]);

  useEffect(() => {
    const updateContainerSize = () => {
      if (containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        setContainerSize({ width: rect.width, height: rect.height });
      }
    };
    updateContainerSize();
    window.addEventListener('resize', updateContainerSize);
    return () => window.removeEventListener('resize', updateContainerSize);
  }, []);

  const handleMouseDown = (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    
    const newX = e.clientX - dragStart.x;
    const newY = e.clientY - dragStart.y;
    
    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;
    
    const maxX = Math.max(0, (scaledWidth - containerSize.width) / 2);
    const maxY = Math.max(0, (scaledHeight - containerSize.height) / 2);
    
    setPosition({
      x: Math.max(-maxX, Math.min(maxX, newX)),
      y: Math.max(-maxY, Math.min(maxY, newY)),
    });
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleTouchStart = (e: React.TouchEvent) => {
    if (e.touches.length === 1) {
      setIsDragging(true);
      setDragStart({ 
        x: e.touches[0].clientX - position.x, 
        y: e.touches[0].clientY - position.y 
      });
    }
  };

  const handleTouchMove = (e: React.TouchEvent) => {
    if (!isDragging || e.touches.length !== 1) return;
    
    const newX = e.touches[0].clientX - dragStart.x;
    const newY = e.touches[0].clientY - dragStart.y;
    
    const scaledWidth = imageSize.width * scale;
    const scaledHeight = imageSize.height * scale;
    
    const maxX = Math.max(0, (scaledWidth - containerSize.width) / 2);
    const maxY = Math.max(0, (scaledHeight - containerSize.height) / 2);
    
    setPosition({
      x: Math.max(-maxX, Math.min(maxX, newX)),
      y: Math.max(-maxY, Math.min(maxY, newY)),
    });
  };

  const handleTouchEnd = () => {
    setIsDragging(false);
  };

  const handleZoomIn = () => {
    setScale(prev => Math.min(prev * 1.2, 5));
  };

  const handleZoomOut = () => {
    setScale(prev => Math.max(prev / 1.2, 0.5));
  };

  const handleRotate = () => {
    setRotation(prev => (prev + 90) % 360);
  };

  const handleCrop = useCallback(() => {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const outputSize = 200;
    canvas.width = outputSize;
    canvas.height = outputSize;

    const img = new Image();
    img.crossOrigin = 'anonymous';
    img.onload = () => {
      ctx.save();
      
      ctx.beginPath();
      ctx.arc(outputSize / 2, outputSize / 2, outputSize / 2, 0, Math.PI * 2);
      ctx.clip();

      const centerX = containerSize.width / 2;
      const centerY = containerSize.height / 2;

      const sourceX = (centerX - position.x) / scale - outputSize / 2 / scale;
      const sourceY = (centerY - position.y) / scale - outputSize / 2 / scale;
      const sourceSize = outputSize / scale;

      ctx.translate(outputSize / 2, outputSize / 2);
      ctx.rotate((rotation * Math.PI) / 180);
      ctx.translate(-outputSize / 2, -outputSize / 2);

      ctx.drawImage(
        img,
        sourceX,
        sourceY,
        sourceSize,
        sourceSize,
        0,
        0,
        outputSize,
        outputSize
      );

      ctx.restore();

      const croppedImage = canvas.toDataURL('image/jpeg', 0.9);
      onCrop(croppedImage);
    };
    img.src = image;
  }, [image, position, scale, rotation, containerSize, onCrop]);

  return (
    <div className="fixed inset-0 z-[200] flex items-center justify-center bg-black/80">
      <div className="bg-background rounded-3xl shadow-2xl max-w-md w-full mx-4 overflow-hidden">
        <div className="flex items-center justify-between px-5 py-4 border-b border-border">
          <h3 className="text-lg font-semibold text-foreground">调整头像</h3>
          <button
            onClick={onCancel}
            className="p-2 rounded-full hover:bg-secondary transition-colors"
          >
            <X className="w-5 h-5 text-muted-foreground" />
          </button>
        </div>

        <div className="p-5">
          <div
            ref={containerRef}
            className="relative w-full aspect-square rounded-full overflow-hidden bg-black cursor-move select-none mx-auto"
            style={{ maxWidth: '300px' }}
            onMouseDown={handleMouseDown}
            onMouseMove={handleMouseMove}
            onMouseUp={handleMouseUp}
            onMouseLeave={handleMouseUp}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
          >
            {imageLoaded && (
              <img
                src={image}
                alt="Crop preview"
                className="absolute pointer-events-none"
                style={{
                  transform: `translate(calc(-50% + ${position.x}px), calc(-50% + ${position.y}px)) scale(${scale}) rotate(${rotation}deg)`,
                  left: '50%',
                  top: '50%',
                  maxWidth: 'none',
                  minWidth: 'auto',
                }}
                draggable={false}
              />
            )}
            <div className="absolute inset-0 pointer-events-none rounded-full border-4 border-white/50 shadow-inner" />
            <div className="absolute inset-4 pointer-events-none rounded-full border-2 border-white/30" />
          </div>

          <div className="flex items-center justify-center gap-2 mt-4 text-xs text-muted-foreground">
            <Move className="w-4 h-4" />
            <span>拖动图片调整位置</span>
          </div>

          <div className="flex items-center justify-center gap-3 mt-5">
            <button
              onClick={handleZoomOut}
              className="p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
              title="缩小"
            >
              <ZoomOut className="w-5 h-5 text-foreground" />
            </button>
            <button
              onClick={handleRotate}
              className="p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
              title="旋转"
            >
              <RotateCw className="w-5 h-5 text-foreground" />
            </button>
            <button
              onClick={handleZoomIn}
              className="p-3 rounded-xl bg-secondary hover:bg-secondary/80 transition-colors"
              title="放大"
            >
              <ZoomIn className="w-5 h-5 text-foreground" />
            </button>
          </div>

          <div className="mt-4">
            <input
              type="range"
              min="0.5"
              max="5"
              step="0.1"
              value={scale}
              onChange={(e) => setScale(parseFloat(e.target.value))}
              className="w-full h-2 bg-secondary rounded-lg appearance-none cursor-pointer accent-primary"
            />
          </div>
        </div>

        <div className="flex gap-3 px-5 pb-5">
          <button
            onClick={onCancel}
            className="flex-1 py-3 rounded-xl bg-secondary text-muted-foreground font-medium hover:bg-secondary/80 transition-colors"
          >
            取消
          </button>
          <button
            onClick={handleCrop}
            className="flex-1 py-3 rounded-xl bg-primary text-primary-foreground font-medium hover:bg-primary/90 transition-colors flex items-center justify-center gap-2"
          >
            <Check className="w-4 h-4" />
            确认
          </button>
        </div>
      </div>
    </div>
  );
}
