import { useState, useEffect, useRef, useCallback } from 'react';
import type { WalletIcon } from '@/lib/walletIcons';

interface Props {
  icon: WalletIcon;
  size?: number;
}

type IconType = 'white-edge' | 'square-non-white' | 'normal';

const ICON_TYPE_CACHE = new Map<string, IconType>();

function isColorWhite(r: number, g: number, b: number, threshold = 240): boolean {
  return r >= threshold && g >= threshold && b >= threshold;
}

function getAverageColor(pixels: { r: number; g: number; b: number }[]): { r: number; g: number; b: number } {
  const sum = pixels.reduce((acc, p) => ({ r: acc.r + p.r, g: acc.g + p.g, b: acc.b + p.b }), { r: 0, g: 0, b: 0 });
  return { r: sum.r / pixels.length, g: sum.g / pixels.length, b: sum.b / pixels.length };
}

function colorsSimilar(c1: { r: number; g: number; b: number }, c2: { r: number; g: number; b: number }, threshold = 30): boolean {
  return Math.abs(c1.r - c2.r) < threshold && Math.abs(c1.g - c2.g) < threshold && Math.abs(c1.b - c2.b) < threshold;
}

async function checkIconType(imageUrl: string): Promise<IconType> {
  if (ICON_TYPE_CACHE.has(imageUrl)) {
    return ICON_TYPE_CACHE.get(imageUrl)!;
  }

  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = 'anonymous';
    
    img.onload = () => {
      try {
        const canvas = document.createElement('canvas');
        const ctx = canvas.getContext('2d');
        
        if (!ctx) {
          resolve('normal');
          return;
        }
        
        canvas.width = img.width;
        canvas.height = img.height;
        ctx.drawImage(img, 0, 0);
        
        const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = imageData.data;
        const width = canvas.width;
        const height = canvas.height;
        
        const topEdge: { r: number; g: number; b: number }[] = [];
        const bottomEdge: { r: number; g: number; b: number }[] = [];
        const leftEdge: { r: number; g: number; b: number }[] = [];
        const rightEdge: { r: number; g: number; b: number }[] = [];
        
        for (let x = 0; x < width; x++) {
          const topIdx = (0 * width + x) * 4;
          const bottomIdx = ((height - 1) * width + x) * 4;
          topEdge.push({ r: data[topIdx], g: data[topIdx + 1], b: data[topIdx + 2] });
          bottomEdge.push({ r: data[bottomIdx], g: data[bottomIdx + 1], b: data[bottomIdx + 2] });
        }
        
        for (let y = 0; y < height; y++) {
          const leftIdx = (y * width + 0) * 4;
          const rightIdx = (y * width + (width - 1)) * 4;
          leftEdge.push({ r: data[leftIdx], g: data[leftIdx + 1], b: data[leftIdx + 2] });
          rightEdge.push({ r: data[rightIdx], g: data[rightIdx + 1], b: data[rightIdx + 2] });
        }
        
        const allEdges = [...topEdge, ...bottomEdge, ...leftEdge, ...rightEdge];
        const whiteCount = allEdges.filter(p => isColorWhite(p.r, p.g, p.b)).length;
        const whiteRatio = whiteCount / allEdges.length;
        
        if (whiteRatio > 0.8) {
          ICON_TYPE_CACHE.set(imageUrl, 'white-edge');
          resolve('white-edge');
          return;
        }
        
        const topAvg = getAverageColor(topEdge);
        const bottomAvg = getAverageColor(bottomEdge);
        const leftAvg = getAverageColor(leftEdge);
        const rightAvg = getAverageColor(rightEdge);
        
        const edgesSimilar = 
          colorsSimilar(topAvg, bottomAvg) && 
          colorsSimilar(leftAvg, rightAvg) && 
          colorsSimilar(topAvg, leftAvg);
        
        const aspectRatio = width / height;
        const isSquare = aspectRatio > 0.9 && aspectRatio < 1.1;
        
        if (edgesSimilar && isSquare) {
          ICON_TYPE_CACHE.set(imageUrl, 'square-non-white');
          resolve('square-non-white');
          return;
        }
        
        ICON_TYPE_CACHE.set(imageUrl, 'normal');
        resolve('normal');
      } catch {
        resolve('normal');
      }
    };
    
    img.onerror = () => {
      resolve('normal');
    };
    
    img.src = imageUrl;
  });
}

function getIconSources(icon: WalletIcon): string[] {
  const sources: string[] = [];
  
  if (icon.logoBrandfetch) {
    sources.push(icon.logoBrandfetch);
  }
  
  if (icon.logoClearbit) {
    sources.push(icon.logoClearbit);
  }
  
  if (icon.domain) {
    sources.push(`https://www.google.com/s2/favicons?domain=${icon.domain}&sz=64`);
    sources.push(`https://favicon.im/${icon.domain}?larger=true`);
    sources.push(`https://icons.duckduckgo.com/ip3/${icon.domain}.ico`);
  }
  
  if (icon.logoSvgl) {
    sources.push(icon.logoSvgl);
  }
  
  return sources;
}

export default function WalletIconImg({ icon, size = 32 }: Props) {
  const [sourceIndex, setSourceIndex] = useState(0);
  const [failed, setFailed] = useState(false);
  const [iconType, setIconType] = useState<IconType | null>(null);
  const mountedRef = useRef(true);

  const sources = getIconSources(icon);
  const currentUrl = sources[sourceIndex];

  const checkIcon = useCallback(async (url: string) => {
    const result = await checkIconType(url);
    if (mountedRef.current) {
      setIconType(result);
    }
  }, []);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (currentUrl && !failed) {
      checkIcon(currentUrl);
    }
  }, [currentUrl, failed, checkIcon]);

  if (failed || sources.length === 0) {
    return (
      <span 
        className="font-bold text-primary flex items-center justify-center rounded"
        style={{ 
          fontSize: size * 0.5, 
          width: size, 
          height: size, 
          backgroundColor: icon.brandColor || '#f3f4f6',
          color: icon.brandColor ? '#ffffff' : undefined
        }}
      >
        {icon.name.charAt(0).toUpperCase()}
      </span>
    );
  }

  const handleError = () => {
    if (sourceIndex < sources.length - 1) {
      setSourceIndex(sourceIndex + 1);
      setIconType(null);
    } else {
      setFailed(true);
    }
  };

  const getScale = () => {
    if (iconType === 'white-edge') return 1.3;
    if (iconType === 'square-non-white') return 1.5;
    return 1;
  };

  const scale = getScale();
  const shouldStretch = scale > 1;

  return (
    <img 
      src={currentUrl} 
      alt={icon.name}
      className={shouldStretch ? "object-cover" : "object-contain"}
      style={{ 
        width: size, 
        height: size,
        transform: scale > 1 ? `scale(${scale})` : 'none',
        transformOrigin: 'center center'
      }}
      crossOrigin="anonymous"
      onError={handleError}
    />
  );
}
