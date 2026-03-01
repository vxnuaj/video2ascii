import { useEffect, useRef } from "react";
import type { AsciiContext, UseAsciiAudioOptions } from "../lib/webgl";

export type { UseAsciiAudioOptions };

// Hook Implementation
export function useAsciiAudio(
  ascii: AsciiContext,
  options: UseAsciiAudioOptions = {}
): void {
  const { enabled = false, reactivity = 50, sensitivity = 50 } = options;

  // Web Audio API refs - these persist across renders
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyzerRef = useRef<AnalyserNode | null>(null);
  const sourceRef = useRef<MediaElementAudioSourceNode | null>(null);
  const dataArrayRef = useRef<Uint8Array<ArrayBuffer> | null>(null);
  const volumeRef = useRef(0);
  const connectedVideoRef = useRef<HTMLVideoElement | null>(null);

  // Keep options in refs so the uniform setter closure always has fresh values
  const enabledRef = useRef(enabled);
  const reactivityRef = useRef(reactivity);
  const sensitivityRef = useRef(sensitivity);

  useEffect(() => {
    enabledRef.current = enabled;
    reactivityRef.current = reactivity;
    sensitivityRef.current = sensitivity;
  }, [enabled, reactivity, sensitivity]);

  // Reads frequency data from the analyzer and calculates average volume
  const updateVolume = () => {
    const analyzer = analyzerRef.current;
    const dataArray = dataArrayRef.current;
    if (!analyzer || !dataArray) return;

    // getByteFrequencyData fills the array with frequency values (0-255)
    analyzer.getByteFrequencyData(dataArray);

    // Average all frequency bins to get overall loudness
    let sum = 0;
    for (let i = 0; i < dataArray.length; i++) {
      sum += dataArray[i];
    }
    const average = sum / dataArray.length / 255; // normalize to 0-1

    // Smooth the volume so it doesn't jump around too much
    volumeRef.current = volumeRef.current * 0.7 + average * 0.3;
  };

  // Connect to video's audio stream
  useEffect(() => {
    if (!enabled) return;

    const video = ascii.videoRef.current;
    if (!video) return;

    const connectAudio = () => {
      // If we already connected this exact video element, just resume
      if (connectedVideoRef.current === video && audioContextRef.current) {
        audioContextRef.current.resume();
        return;
      }

      try {
        // AudioContext is the entry point to Web Audio API
        if (!audioContextRef.current) {
          audioContextRef.current = new AudioContext();
        }

        const ctx = audioContextRef.current;

        // AnalyserNode lets us extract frequency/time data from audio
        const analyzer = ctx.createAnalyser();
        analyzer.fftSize = 256; // smaller = faster, less detailed
        analyzer.smoothingTimeConstant = 0.8; // 0-1, higher = smoother
        analyzerRef.current = analyzer;

        // This array will hold the frequency data each frame
        dataArrayRef.current = new Uint8Array(
          analyzer.frequencyBinCount
        ) as Uint8Array<ArrayBuffer>;

        // createMediaElementSource connects our video element to the audio graph
        // IMPORTANT: a video can only be connected once, ever
        const source = ctx.createMediaElementSource(video);
        source.connect(analyzer);
        analyzer.connect(ctx.destination); // so we still hear the audio
        sourceRef.current = source;
        connectedVideoRef.current = video;

        ctx.resume();
      } catch (error) {
        console.warn("Failed to connect audio analyzer:", error);
      }
    };

    const handlePlay = () => {
      connectAudio();
    };

    video.addEventListener("play", handlePlay);

    // If video is already playing when this hook mounts
    if (!video.paused) {
      connectAudio();
    }

    return () => {
      video.removeEventListener("play", handlePlay);
    };
  }, [ascii.videoRef, enabled]);

  // Register our uniform setter - this gets called every frame by the core hook
  useEffect(() => {
    if (!enabled) return;

    const uniformSetter = (
      gl: WebGL2RenderingContext,
      _program: WebGLProgram,
      locations: NonNullable<typeof ascii.uniformLocationsRef.current>
    ) => {
      // Update volume from audio analyzer
      updateVolume();

      // Pass values to the shader
      gl.uniform1f(locations.u_audioLevel, volumeRef.current);
      gl.uniform1f(locations.u_audioReactivity, reactivityRef.current / 100);
      gl.uniform1f(locations.u_audioSensitivity, sensitivityRef.current / 100);
    };

    ascii.registerUniformSetter("audio", uniformSetter);

    return () => {
      ascii.unregisterUniformSetter("audio");
    };
  }, [ascii, enabled]);

  // Cleanup audio context when component unmounts
  useEffect(() => {
    return () => {
      if (audioContextRef.current) {
        audioContextRef.current.close();
      }
    };
  }, []);
}
