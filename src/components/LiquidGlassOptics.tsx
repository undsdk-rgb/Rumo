import { useEffect, useState } from 'react';

interface OpticsMaps {
  cardUrl: string;
  chromeUrl: string;
}

export type GlassPerformanceTier = 'full' | 'balanced' | 'lite';

/**
 * Generates a physically inspired convex rounded-bezel normal/displacement map
 * using a signed-distance field (SDF).
 *
 * - Center plateau stays neutral (128, 128) so text, numbers, and charts remain razor-sharp.
 * - Outer curved bevel encodes smooth X (Red) and Y (Green) refraction vectors so
 *   SVG <feDisplacementMap> bends background content along the glass rim.
 */
function createRoundedBezelDisplacementMap(
  width: number,
  height: number,
  cornerRadius: number,
  bezelWidth: number
): string {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const imgData = ctx.createImageData(width, height);
  const data = imgData.data;

  const halfW = width * 0.5;
  const halfH = height * 0.5;
  const r = Math.min(cornerRadius, halfW - 1, halfH - 1);
  const boxHalfW = halfW - r;
  const boxHalfH = halfH - r;

  for (let y = 0; y < height; y++) {
    const py = y + 0.5 - halfH;
    const ay = Math.abs(py);
    const qy = ay - boxHalfH;

    for (let x = 0; x < width; x++) {
      const px = x + 0.5 - halfW;
      const ax = Math.abs(px);
      const qx = ax - boxHalfW;

      const outX = Math.max(qx, 0);
      const outY = Math.max(qy, 0);
      const outsideDist = Math.hypot(outX, outY);
      const insideDist = Math.min(Math.max(qx, qy), 0);
      const sdf = outsideDist + insideDist - r;

      const depth = -sdf;
      let red = 128;
      let green = 128;

      if (depth >= 0 && depth < bezelWidth) {
        let nx = 0;
        let ny = 0;

        if (qx > 0 && qy > 0) {
          const len = Math.hypot(qx, qy) || 1;
          nx = (px >= 0 ? -1 : 1) * (qx / len);
          ny = (py >= 0 ? -1 : 1) * (qy / len);
        } else if (qx > qy) {
          nx = px >= 0 ? -1 : 1;
          ny = 0;
        } else {
          nx = 0;
          ny = py >= 0 ? -1 : 1;
        }

        const normalized = 1 - depth / bezelWidth;
        const slope = Math.pow(Math.sin(normalized * Math.PI * 0.5), 1.65);

        red = Math.round(128 + nx * 124 * slope);
        green = Math.round(128 + ny * 124 * slope);
      }

      const idx = (y * width + x) * 4;
      data[idx] = Math.max(0, Math.min(255, red));
      data[idx + 1] = Math.max(0, Math.min(255, green));
      data[idx + 2] = 128;
      data[idx + 3] = 255;
    }
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas.toDataURL('image/png');
}

interface NavigatorWithDeviceHints extends Navigator {
  deviceMemory?: number;
  connection?: {
    saveData?: boolean;
  };
}

/**
 * Classifies runtime GPU/mobile capability into three adaptive glass tiers:
 * - 'lite': Low-power hardware (<= 2 CPU cores or <= 2GB RAM on any device; <= 4 cores, <= 3GB RAM,
 *           or reduced motion on mobile; Save-Data or reduced transparency). Disables backdrop-filter
 *           completely so scrolling stays locked at 60fps–120fps with zero framebuffer readbacks.
 * - 'balanced': Standard mobile / Safari / Firefox — compact GPU-composited CSS backdrop-filter
 *               with zero nested backdrop stacking.
 * - 'full': Desktop Chromium with capable hardware (>= 4 cores, >= 4GB RAM) — adds curved-bevel
 *           achromatic SVG <feDisplacementMap> lensing.
 */
export function detectGlassPerformanceTier(): {
  tier: GlassPerformanceTier;
  useSvgRefraction: boolean;
} {
  if (typeof window === 'undefined' || typeof navigator === 'undefined') {
    return { tier: 'balanced', useSvgRefraction: false };
  }

  const nav = navigator as NavigatorWithDeviceHints;
  const ua = nav.userAgent;
  const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)')?.matches;
  const reducedTransparency = window.matchMedia?.('(prefers-reduced-transparency: reduce)')?.matches;
  const isCoarsePointer = window.matchMedia?.('(pointer: coarse)')?.matches;
  const isMobileUa = /Android|iPhone|iPad|iPod|Mobile/i.test(ua);
  const isMobile = Boolean(isCoarsePointer || isMobileUa);

  const cores = typeof nav.hardwareConcurrency === 'number' ? nav.hardwareConcurrency : 6;
  const memoryGb = typeof nav.deviceMemory === 'number' ? nav.deviceMemory : 6;
  const saveData = Boolean(nav.connection?.saveData);

  if (
    reducedTransparency ||
    saveData ||
    cores <= 2 ||
    memoryGb <= 2 ||
    (isMobile && (cores <= 4 || memoryGb <= 3 || reducedMotion))
  ) {
    return { tier: 'lite', useSvgRefraction: false };
  }

  const isFirefox = /Firefox/i.test(ua);
  const isIOS = /iPad|iPhone|iPod/.test(ua);
  const isChromium = /Chrome|Chromium|Edg|OPR|Brave|CriOS/i.test(ua) && !isFirefox;

  // Reserve SVG backdrop displacement strictly for capable desktop Chromium GPUs
  if (!isMobile && !isIOS && isChromium && !reducedMotion && cores >= 4 && memoryGb >= 4) {
    return { tier: 'full', useSvgRefraction: true };
  }

  return { tier: 'balanced', useSvgRefraction: false };
}

/**
 * Adaptive Liquid Glass optical & performance controller.
 * - Detects hardwareConcurrency / deviceMemory to apply [data-glass-tier="lite"] dynamically on
 *   low-power devices, disabling backdrop-filter for consistent 60–120fps scrolling.
 * - Detects high-refresh-rate displays (90Hz / 120Hz ProMotion / LTPO) and keeps a passive scroll
 *   frame-budget watchdog that automatically falls back to "lite" if sustained frame drops occur.
 * - Mounts curved-bevel SVG displacement filters strictly on high-tier desktop Chromium.
 */
export function LiquidGlassOptics() {
  const [maps, setMaps] = useState<OpticsMaps | null>(null);

  useEffect(() => {
    if (typeof window === 'undefined' || typeof document === 'undefined') return;

    let demotedByFrameWatchdog = false;
    let cancelled = false;
    let probeRafId = 0;
    let scrollMonitorRafId = 0;
    let scrollStopTimer: number | null = null;
    let cachedMaps: OpticsMaps | null = null;

    const applyTier = () => {
      if (cancelled) return;

      const detected = detectGlassPerformanceTier();
      const effectiveTier: GlassPerformanceTier = demotedByFrameWatchdog ? 'lite' : detected.tier;
      const shouldUseSvg = !demotedByFrameWatchdog && detected.useSvgRefraction;

      document.documentElement.setAttribute('data-glass-tier', effectiveTier);

      if (!shouldUseSvg) {
        document.documentElement.removeAttribute('data-liquid-optics');
        setMaps(null);
        return;
      }

      if (!cachedMaps) {
        const cardUrl = createRoundedBezelDisplacementMap(256, 256, 44, 34);
        const chromeUrl = createRoundedBezelDisplacementMap(320, 88, 44, 24);
        if (cardUrl && chromeUrl) {
          cachedMaps = { cardUrl, chromeUrl };
        }
      }

      if (!cachedMaps) {
        document.documentElement.removeAttribute('data-liquid-optics');
        setMaps(null);
        return;
      }

      setMaps(cachedMaps);
      document.documentElement.setAttribute('data-liquid-optics', 'svg');
    };

    applyTier();

    // Probe native display refresh rate (detects 90Hz / 120Hz displays for tighter blur budget)
    const sampleDeltas: number[] = [];
    let lastProbeTime = 0;
    const probeRefreshRate = (now: number) => {
      if (cancelled) return;
      if (lastProbeTime > 0) {
        const delta = now - lastProbeTime;
        if (delta > 3 && delta < 40) {
          sampleDeltas.push(delta);
        }
      }
      lastProbeTime = now;

      if (sampleDeltas.length < 12) {
        probeRafId = window.requestAnimationFrame(probeRefreshRate);
      } else {
        const sorted = [...sampleDeltas].sort((a, b) => a - b);
        const medianDelta = sorted[Math.floor(sorted.length / 2)];
        // <= 12.5ms median frame interval corresponds to >= 80Hz (90Hz / 120Hz displays)
        if (medianDelta <= 12.5) {
          document.documentElement.setAttribute('data-refresh-rate', 'high');
        } else {
          document.documentElement.setAttribute('data-refresh-rate', 'standard');
        }
      }
    };
    probeRafId = window.requestAnimationFrame(probeRefreshRate);

    // Passive scroll frame-budget guard: auto-demotes borderline devices to [data-glass-tier="lite"]
    // if sustained jank (> 24ms frames, i.e., < 42fps) happens during active visible scrolling.
    let consecutiveSlowFrames = 0;
    let lastScrollFrameTime = 0;
    let monitoringScroll = false;

    const monitorScrollFrames = (now: number) => {
      if (cancelled || !monitoringScroll || demotedByFrameWatchdog) return;

      if (document.visibilityState === 'visible' && lastScrollFrameTime > 0) {
        const frameDelta = now - lastScrollFrameTime;
        if (frameDelta > 24 && frameDelta < 250) {
          consecutiveSlowFrames += 1;
        } else if (frameDelta <= 19) {
          consecutiveSlowFrames = Math.max(0, consecutiveSlowFrames - 1);
        }

        if (consecutiveSlowFrames >= 10) {
          demotedByFrameWatchdog = true;
          monitoringScroll = false;
          applyTier();
          return;
        }
      }

      lastScrollFrameTime = now;
      scrollMonitorRafId = window.requestAnimationFrame(monitorScrollFrames);
    };

    const handleScroll = () => {
      if (demotedByFrameWatchdog) return;
      if (document.documentElement.getAttribute('data-glass-tier') === 'lite') return;

      if (!monitoringScroll) {
        monitoringScroll = true;
        lastScrollFrameTime = 0;
        scrollMonitorRafId = window.requestAnimationFrame(monitorScrollFrames);
      }

      if (scrollStopTimer !== null) {
        window.clearTimeout(scrollStopTimer);
      }
      scrollStopTimer = window.setTimeout(() => {
        monitoringScroll = false;
        consecutiveSlowFrames = 0;
        if (scrollMonitorRafId) {
          window.cancelAnimationFrame(scrollMonitorRafId);
          scrollMonitorRafId = 0;
        }
      }, 220);
    };

    const mediaQueries = [
      window.matchMedia?.('(prefers-reduced-motion: reduce)'),
      window.matchMedia?.('(prefers-reduced-transparency: reduce)'),
      window.matchMedia?.('(pointer: coarse)'),
    ].filter((mq): mq is MediaQueryList => Boolean(mq));

    mediaQueries.forEach((mq) => mq.addEventListener?.('change', applyTier));
    window.addEventListener('scroll', handleScroll, { passive: true });

    return () => {
      cancelled = true;
      if (probeRafId) window.cancelAnimationFrame(probeRafId);
      if (scrollMonitorRafId) window.cancelAnimationFrame(scrollMonitorRafId);
      if (scrollStopTimer !== null) window.clearTimeout(scrollStopTimer);
      mediaQueries.forEach((mq) => mq.removeEventListener?.('change', applyTier));
      window.removeEventListener('scroll', handleScroll);
      document.documentElement.removeAttribute('data-liquid-optics');
      document.documentElement.removeAttribute('data-refresh-rate');
    };
  }, []);

  if (!maps) return null;

  return (
    <svg
      aria-hidden="true"
      width="0"
      height="0"
      style={{
        position: 'fixed',
        width: 0,
        height: 0,
        overflow: 'hidden',
        pointerEvents: 'none',
      }}
    >
      <defs>
        {/* Clean Achromatic Curved-Bevel Optical Refraction for Content Cards */}
        <filter
          id="liquid-glass-refract-card"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={maps.cardUrl}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="cardMap"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="cardMap"
            scale="18"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>

        {/* Clean Achromatic Curved-Bevel Optical Refraction for Floating Chrome Capsules */}
        <filter
          id="liquid-glass-refract-chrome"
          x="0%"
          y="0%"
          width="100%"
          height="100%"
          filterUnits="objectBoundingBox"
          colorInterpolationFilters="sRGB"
        >
          <feImage
            href={maps.chromeUrl}
            x="0%"
            y="0%"
            width="100%"
            height="100%"
            preserveAspectRatio="none"
            result="chromeMap"
          />
          <feDisplacementMap
            in="SourceGraphic"
            in2="chromeMap"
            scale="22"
            xChannelSelector="R"
            yChannelSelector="G"
          />
        </filter>
      </defs>
    </svg>
  );
}
