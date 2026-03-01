import { useCallback, useEffect, useRef } from "react";
import type {
  AsciiContext,
  UseAsciiMouseEffectOptions,
  MouseEffectHandlers,
} from "../lib/webgl";

export type { UseAsciiMouseEffectOptions, MouseEffectHandlers };

const MAX_TRAIL_LENGTH = 24;

interface MousePosition {
  x: number;
  y: number;
}

// Hook Implementation
export function useAsciiMouseEffect(
  ascii: AsciiContext,
  options: UseAsciiMouseEffectOptions = {}
): MouseEffectHandlers {
  const { enabled = true, trailLength = 24 } = options;

  // Current mouse position in normalized coords (0-1)
  const mouseRef = useRef<MousePosition>({ x: -1, y: -1 });
  // Array of previous positions for the trail effect
  const trailRef = useRef<MousePosition[]>([]);
  // Keep options in refs so event handlers have fresh values
  const enabledRef = useRef(enabled);
  const trailLengthRef = useRef(trailLength);

  useEffect(() => {
    enabledRef.current = enabled;
    trailLengthRef.current = trailLength;
  }, [enabled, trailLength]);

  // Register uniform setter - called every frame by core hook
  useEffect(() => {
    if (!enabled) return;

    const uniformSetter = (
      gl: WebGL2RenderingContext,
      _program: WebGLProgram,
      locations: NonNullable<typeof ascii.uniformLocationsRef.current>
    ) => {
      // Pass current mouse position to shader
      gl.uniform2f(locations.u_mouse, mouseRef.current.x, mouseRef.current.y);

      // Pass trail array to shader
      const trail = trailRef.current;
      gl.uniform1i(locations.u_trailLength, trail.length);

      // Fill all trail uniform slots (unused ones get -1,-1)
      for (let i = 0; i < MAX_TRAIL_LENGTH; i++) {
        const loc = locations.u_trail[i];
        if (loc) {
          const pos = trail[i] || { x: -1, y: -1 };
          gl.uniform2f(loc, pos.x, pos.y);
        }
      }
    };

    ascii.registerUniformSetter("mouse", uniformSetter);

    return () => {
      ascii.unregisterUniformSetter("mouse");
    };
  }, [ascii, enabled]);

  // Called when mouse moves over the container
  const onMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
    if (!enabledRef.current) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const newPos: MousePosition = {
      // Convert pixel coords to 0-1 range
      x: (e.clientX - rect.left) / rect.width,
      y: (e.clientY - rect.top) / rect.height,
    };

    // Add old position to the front of the trail
    if (mouseRef.current.x >= 0) {
      trailRef.current.unshift({ ...mouseRef.current });
      // Keep trail at max length
      if (trailRef.current.length > trailLengthRef.current) {
        trailRef.current.pop();
      }
    }

    mouseRef.current = newPos;
  }, []);

  // Reset when mouse leaves
  const onMouseLeave = useCallback(() => {
    mouseRef.current = { x: -1, y: -1 };
    trailRef.current = [];
  }, []);

  return { onMouseMove, onMouseLeave };
}
