import { useCallback, useEffect, useRef } from "react";
import type {
  AsciiContext,
  UseAsciiRippleOptions,
  RippleHandlers,
} from "../lib/webgl";

export type { UseAsciiRippleOptions, RippleHandlers };

const MAX_RIPPLES = 8;

interface Ripple {
  x: number;
  y: number;
  startTime: number;
}

// Hook Implementation
export function useAsciiRipple(
  ascii: AsciiContext,
  options: UseAsciiRippleOptions = {}
): RippleHandlers {
  const { enabled = false, speed = 40 } = options;

  // Active ripples - each has position and start time
  const ripplesRef = useRef<Ripple[]>([]);
  const enabledRef = useRef(enabled);
  const speedRef = useRef(speed);

  useEffect(() => {
    enabledRef.current = enabled;
    speedRef.current = speed;
  }, [enabled, speed]);

  // Register uniform setter - runs every frame
  useEffect(() => {
    if (!enabled) return;

    const uniformSetter = (
      gl: WebGL2RenderingContext,
      _program: WebGLProgram,
      locations: NonNullable<typeof ascii.uniformLocationsRef.current>
    ) => {
      const currentTime = performance.now() / 1000; // convert to seconds

      gl.uniform1f(locations.u_time, currentTime);
      gl.uniform1f(locations.u_rippleEnabled, 1.0);
      gl.uniform1f(locations.u_rippleSpeed, speedRef.current);

      // Remove old ripples that have expanded past the screen
      const maxDist = Math.sqrt(
        ascii.dimensions.cols ** 2 + ascii.dimensions.rows ** 2
      );
      const maxLifetime = maxDist / speedRef.current + 1.0;
      ripplesRef.current = ripplesRef.current.filter(
        (r) => currentTime - r.startTime < maxLifetime
      );

      // Pass ripple data to shader (vec4: x, y, startTime, enabled)
      for (let i = 0; i < MAX_RIPPLES; i++) {
        const loc = locations.u_ripples[i];
        if (loc) {
          const ripple = ripplesRef.current[i];
          if (ripple) {
            gl.uniform4f(loc, ripple.x, ripple.y, ripple.startTime, 1.0);
          } else {
            gl.uniform4f(loc, 0, 0, 0, 0.0); // disabled
          }
        }
      }
    };

    ascii.registerUniformSetter("ripple", uniformSetter);

    return () => {
      ascii.unregisterUniformSetter("ripple");
    };
  }, [ascii, enabled]);

  // Spawn a new ripple where the user clicks
  const onClick = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabledRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = (e.clientX - rect.left) / rect.width;
    const y = (e.clientY - rect.top) / rect.height;

    // Add new ripple at the front
    ripplesRef.current.unshift({
      x,
      y,
      startTime: performance.now() / 1000,
    });

    // Cap at max ripples
    if (ripplesRef.current.length > MAX_RIPPLES) {
      ripplesRef.current.pop();
    }
  }, []);

  return { onClick };
}
