// Compiles a GLSL shader from source code
export function compileShader(
  gl: WebGL2RenderingContext,
  source: string,
  type: number
): WebGLShader | null {
  const shader = gl.createShader(type);
  if (!shader) {
    console.error("Failed to create shader");
    return null;
  }

  gl.shaderSource(shader, source);
  gl.compileShader(shader);

  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.error("Shader compile error:", gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }

  return shader;
}

// Links vertex and fragment shaders into a program
export function createProgram(
  gl: WebGL2RenderingContext,
  vertexShader: WebGLShader,
  fragmentShader: WebGLShader
): WebGLProgram | null {
  const program = gl.createProgram();
  if (!program) {
    console.error("Failed to create program");
    return null;
  }

  gl.attachShader(program, vertexShader);
  gl.attachShader(program, fragmentShader);
  gl.linkProgram(program);

  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.error("Program link error:", gl.getProgramInfoLog(program));
    gl.deleteProgram(program);
    return null;
  }

  return program;
}

// Creates a fullscreen quad (two triangles covering the viewport)
export function createFullscreenQuad(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): void {
  // Vertex positions in clip space (-1 to 1)
  const positions = new Float32Array([
    -1,
    -1, // bottom-left
    1,
    -1, // bottom-right
    -1,
    1, // top-left
    -1,
    1, // top-left
    1,
    -1, // bottom-right
    1,
    1, // top-right
  ]);

  // Texture coords (0 to 1), Y flipped because video origin is top-left
  const texCoords = new Float32Array([0, 1, 1, 1, 0, 0, 0, 0, 1, 1, 1, 0]);

  // Position attribute
  const posBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, posBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, positions, gl.STATIC_DRAW);
  const posLoc = gl.getAttribLocation(program, "a_position");
  gl.enableVertexAttribArray(posLoc);
  gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

  // Texture coordinate attribute
  const texBuffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, texBuffer);
  gl.bufferData(gl.ARRAY_BUFFER, texCoords, gl.STATIC_DRAW);
  const texLoc = gl.getAttribLocation(program, "a_texCoord");
  gl.enableVertexAttribArray(texLoc);
  gl.vertexAttribPointer(texLoc, 2, gl.FLOAT, false, 0, 0);
}

// Creates a texture for video frames with mipmapping for quality
export function createVideoTexture(
  gl: WebGL2RenderingContext
): WebGLTexture | null {
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);

  // Mipmapping gives better quality when sampling large areas
  gl.texParameteri(
    gl.TEXTURE_2D,
    gl.TEXTURE_MIN_FILTER,
    gl.LINEAR_MIPMAP_LINEAR
  );
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);

  return texture;
}

// Renders ASCII characters to a horizontal strip texture
export function createAsciiAtlas(
  gl: WebGL2RenderingContext,
  chars: string[],
  charSize: number = 64
): WebGLTexture | null {
  // Draw characters to an offscreen canvas - render at 4x resolution for sharper text
  const scale = 4;
  const scaledSize = charSize * scale;
  const canvas = document.createElement("canvas");
  canvas.width = scaledSize * chars.length;
  canvas.height = scaledSize;

  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  // Enable high-quality font rendering
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";

  // Black background, white text (shader colorizes)
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#fff";
  
  // Use a high-quality font stack
  ctx.font = `bold ${scaledSize * 0.8}px "SF Mono", "Fira Code", "JetBrains Mono", "Consolas", monospace`;
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  
  // Add slight letter spacing for clarity
  ctx.letterSpacing = "0px";

  // Draw each character centered in its cell
  ctx.save();
  for (let i = 0; i < chars.length; i++) {
    const x = i * scaledSize + scaledSize / 2;
    const y = scaledSize / 2;
    ctx.fillText(chars[i], x, y);
  }
  ctx.restore();

  // Upload canvas to GPU
  const texture = gl.createTexture();
  if (!texture) return null;

  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, canvas);
  
  // Use LINEAR_MIPMAP_LINEAR for smooth scaling, with anisotropic filtering if available
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR_MIPMAP_LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  
  // Generate mipmaps for better quality at different scales
  gl.generateMipmap(gl.TEXTURE_2D);

  return texture;
}

// Helper to set uniforms with cached locations
export type UniformSetter = {
  set1f: (name: string, value: number) => void;
  set2f: (name: string, x: number, y: number) => void;
  set1i: (name: string, value: number) => void;
};

export function createUniformSetter(
  gl: WebGL2RenderingContext,
  program: WebGLProgram
): UniformSetter {
  const cache = new Map<string, WebGLUniformLocation | null>();

  const getLocation = (name: string) => {
    if (!cache.has(name)) {
      cache.set(name, gl.getUniformLocation(program, name));
    }
    return cache.get(name)!;
  };

  return {
    set1f: (name, value) => gl.uniform1f(getLocation(name), value),
    set2f: (name, x, y) => gl.uniform2f(getLocation(name), x, y),
    set1i: (name, value) => gl.uniform1i(getLocation(name), value),
  };
}

// Calculates ASCII grid dimensions from video aspect ratio
export function calculateGridDimensions(
  videoWidth: number,
  videoHeight: number,
  cols: number
): { cols: number; rows: number } {
  const aspectRatio = videoWidth / videoHeight;
  // Divide by 2 because chars are ~2x taller than wide
  const rows = Math.round(cols / aspectRatio / 2);
  return { cols, rows };
}
