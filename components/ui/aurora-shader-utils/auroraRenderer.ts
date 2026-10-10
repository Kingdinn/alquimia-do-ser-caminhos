import { AURORA_FRAGMENT_SHADER } from "./auroraFragmentShader";

const VERTEX_SHADER = `
attribute vec2 a_position;
void main() {
  gl_Position = vec4(a_position, 0.0, 1.0);
}
`;

// Limit the fill rate so the animated light stays inexpensive on mobile.
const MAX_DRAWING_PIXELS = 750_000;
const MAX_DRAWING_DIMENSION = 2048;

export type AuroraPointer = { x: number; y: number; presence: number };

export function createAuroraRenderer(canvas: HTMLCanvasElement) {
  const gl = canvas.getContext("webgl", {
    alpha: false,
    antialias: false,
    depth: false,
    stencil: false,
    preserveDrawingBuffer: false,
    powerPreference: "low-power",
  });
  if (!gl) throw new Error("WebGL is unavailable");

  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;

  const dispose = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    for (const shader of shaders) gl.deleteShader(shader);
    buffer = null;
    program = null;
    shaders.length = 0;
  };

  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Unable to create Aurora shader");
      shaders.push(shader);
      gl.shaderSource(shader, source);
      gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
        throw new Error("Unable to compile Aurora shader");
      }
      return shader;
    };

    const vertex = compile(gl.VERTEX_SHADER, VERTEX_SHADER);
    const fragment = compile(gl.FRAGMENT_SHADER, AURORA_FRAGMENT_SHADER);
    program = gl.createProgram();
    if (!program) throw new Error("Unable to create Aurora program");
    gl.attachShader(program, vertex);
    gl.attachShader(program, fragment);
    gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
      throw new Error("Unable to link Aurora program");
    }
    gl.useProgram(program);

    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Unable to create Aurora triangle");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(
      gl.ARRAY_BUFFER,
      new Float32Array([-1, -1, 3, -1, -1, 3]),
      gl.STATIC_DRAW,
    );
    const position = gl.getAttribLocation(program, "a_position");
    gl.enableVertexAttribArray(position);
    gl.vertexAttribPointer(position, 2, gl.FLOAT, false, 0, 0);
    gl.disable(gl.DEPTH_TEST);
    gl.disable(gl.BLEND);

    const scene = gl.getUniformLocation(program, "u_scene");
    const space = gl.getUniformLocation(program, "u_space");

    return {
      resize(cssWidth: number, cssHeight: number) {
        const width = Math.max(1, cssWidth);
        const height = Math.max(1, cssHeight);
        const requestedRatio = Math.min(window.devicePixelRatio || 1, 2);
        const ratio = Math.min(
          requestedRatio,
          Math.sqrt(MAX_DRAWING_PIXELS / (width * height)),
          MAX_DRAWING_DIMENSION / Math.max(width, height),
        );
        const bufferWidth = Math.max(1, Math.floor(width * ratio));
        const bufferHeight = Math.max(1, Math.floor(height * ratio));
        if (canvas.width !== bufferWidth || canvas.height !== bufferHeight) {
          canvas.width = bufferWidth;
          canvas.height = bufferHeight;
        }
        gl.viewport(0, 0, canvas.width, canvas.height);
      },
      render(seconds: number, pointer: AuroraPointer) {
        if (!program || gl.isContextLost()) return;
        gl.useProgram(program);
        gl.uniform4f(scene, canvas.width, canvas.height, seconds, 0);
        gl.uniform4f(space, pointer.x, pointer.y, pointer.presence, 0);
        gl.drawArrays(gl.TRIANGLES, 0, 3);
      },
      dispose,
    };
  } catch (error) {
    dispose();
    throw error;
  }
}

export type AuroraRenderer = ReturnType<typeof createAuroraRenderer>;
