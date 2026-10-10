// Original Alquimia particle renderer. Geometry is generated once; WebGL rotates it on the GPU.
export type OrbitalSphereOptions = { hue: number; speed: number };
export const ORBITAL_SPHERE_DEFAULTS: OrbitalSphereOptions = { hue: 0, speed: 1 };

const VERTEX = `
attribute vec3 a_position;
attribute vec3 a_detail;
uniform vec2 u_scale;
uniform float u_time;
uniform float u_pixelRatio;
varying vec3 v_color;
varying float v_alpha;
varying float v_node;
mat2 rotate(float a) { return mat2(cos(a), -sin(a), sin(a), cos(a)); }
void main() {
  vec3 p = a_position;
  float kind = a_detail.x;
  float phase = a_detail.z;
  if (kind < 0.5) {
    p.xz = rotate(u_time * 0.13) * p.xz;
    p.xy = rotate(0.35) * p.xy;
    float light = clamp(0.58 + p.y * 0.4 + p.z * 0.35, 0.0, 1.0);
    v_color = mix(vec3(0.38,0.32,1.0), vec3(0.59,1.0,0.95), light);
    v_alpha = mix(0.18,0.85,smoothstep(-0.65,0.65,p.z));
  } else {
    p.xz = rotate(u_time * (kind > 2.5 ? -0.09 : 0.16)) * p.xz;
    p.yz = rotate(kind > 2.5 ? 1.05 : 0.43) * p.yz;
    p.xy = rotate(kind > 2.5 ? -0.7 : 0.36) * p.xy;
    v_color = mix(vec3(0.52,0.43,1.0),vec3(0.45,0.94,1.0),0.5 + 0.5*sin(phase));
    v_alpha = kind > 1.5 && kind < 2.5 ? 0.98 : 0.38;
    // Back halves of the rings recede behind the particle globe.
    if (length(p.xy) < 0.62 && p.z < 0.0) v_alpha *= 0.18;
  }
  float perspective = 4.5 / (4.5 - p.z);
  p.y += sin(u_time * 0.35) * 0.025;
  gl_Position = vec4(p.xy * u_scale * perspective, 0.0, 1.0);
  gl_PointSize = a_detail.y * u_pixelRatio * perspective;
  v_node = kind > 1.5 && kind < 2.5 ? 1.0 : 0.0;
  v_alpha *= 0.88 + 0.12*sin(u_time*0.6 + phase);
}
`;
const FRAGMENT = `
precision mediump float;
varying vec3 v_color;
varying float v_alpha;
varying float v_node;
void main() {
  float d = length(gl_PointCoord - 0.5) * 2.0;
  if (d > 1.0) discard;
  float core = 1.0-smoothstep(0.0,1.0,d);
  float alpha = core * v_alpha;
  vec3 color = mix(v_color,vec3(0.9,1.0,1.0),v_node * core * 0.75);
  gl_FragColor = vec4(color * alpha,alpha);
}
`;

export function createOrbitalSphereRenderer(canvas: HTMLCanvasElement, options: () => OrbitalSphereOptions) {
  const gl = canvas.getContext("webgl", { alpha: true, antialias: false, depth: false, stencil: false, powerPreference: "low-power" });
  if (!gl) throw new Error("WebGL unavailable");
  const shaders: WebGLShader[] = [];
  let program: WebGLProgram | null = null;
  let buffer: WebGLBuffer | null = null;
  let pixelRatio = 1;
  const dispose = () => {
    if (buffer) gl.deleteBuffer(buffer);
    if (program) gl.deleteProgram(program);
    shaders.forEach(shader => gl.deleteShader(shader));
    buffer = null; program = null; shaders.length = 0;
  };
  try {
    const compile = (type: number, source: string) => {
      const shader = gl.createShader(type);
      if (!shader) throw new Error("Orbital shader unavailable");
      shaders.push(shader);
      gl.shaderSource(shader, source); gl.compileShader(shader);
      if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) throw new Error("Orbital shader compilation failed");
      return shader;
    };
    const vertex = compile(gl.VERTEX_SHADER, VERTEX);
    const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
    program = gl.createProgram();
    if (!program) throw new Error("Orbital program unavailable");
    gl.attachShader(program, vertex); gl.attachShader(program, fragment); gl.linkProgram(program);
    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) throw new Error("Orbital program link failed");
    gl.useProgram(program);
    const particles: number[] = [];
    const count = 1900;
    const goldenAngle = Math.PI * (3 - Math.sqrt(5));
    for (let i = 0; i < count; i++) {
      const y = 1 - (i / (count - 1)) * 2;
      const radius = Math.sqrt(1 - y * y);
      const theta = goldenAngle * i;
      particles.push(Math.cos(theta) * radius * 0.65, y * 0.65, Math.sin(theta) * radius * 0.65,
        0, 1.6 + (i % 5) * 0.18, theta);
    }
    for (let ring = 0; ring < 7; ring++) {
      const radius = 1.06 + ring * 0.039;
      for (let i = 0; i < 280; i++) {
        const angle = i / 280 * Math.PI * 2;
        particles.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius, 1, 1.35, angle + ring);
      }
    }
    for (let i = 0; i < 330; i++) {
      const angle = i / 330 * Math.PI * 2;
      particles.push(Math.cos(angle) * 1.47, 0, Math.sin(angle) * 1.47, 3, 1.2, angle);
    }
    for (let i = 0; i < 10; i++) {
      const angle = i / 10 * Math.PI * 2;
      const radius = 1.1 + (i % 3) * 0.072;
      particles.push(Math.cos(angle) * radius, 0, Math.sin(angle) * radius, 2, i % 3 === 0 ? 8 : 5.5, angle);
    }
    buffer = gl.createBuffer();
    if (!buffer) throw new Error("Orbital buffer unavailable");
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(particles), gl.STATIC_DRAW);
    for (const [name, offset] of [["a_position", 0], ["a_detail", 12]] as const) {
      const attribute = gl.getAttribLocation(program, name);
      gl.enableVertexAttribArray(attribute);
      gl.vertexAttribPointer(attribute, 3, gl.FLOAT, false, 24, offset);
    }
    const uniforms = {
      time: gl.getUniformLocation(program, "u_time"),
      scale: gl.getUniformLocation(program, "u_scale"),
      pixelRatio: gl.getUniformLocation(program, "u_pixelRatio"),
    };
    gl.enable(gl.BLEND);
    gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
    gl.disable(gl.DEPTH_TEST);
    gl.clearColor(0, 0, 0, 0);
    const pointCount = particles.length / 6;
    return {
      resize(width: number, height: number) {
        width = Math.max(1, width); height = Math.max(1, height);
        pixelRatio = Math.min(window.devicePixelRatio || 1, 1.5, Math.sqrt(400_000 / (width * height)));
        canvas.width = Math.max(1, Math.floor(width * pixelRatio));
        canvas.height = Math.max(1, Math.floor(height * pixelRatio));
        gl.viewport(0, 0, canvas.width, canvas.height);
        const scale = Math.min(width / 3.25, height / 2.85);
        gl.uniform2f(uniforms.scale, scale * 2 / width, scale * 2 / height);
        gl.uniform1f(uniforms.pixelRatio, pixelRatio);
      },
      render(seconds = 0) {
        if (!program || gl.isContextLost()) return;
        const speed = options().speed;
        gl.clear(gl.COLOR_BUFFER_BIT);
        gl.uniform1f(uniforms.time, seconds * (Number.isFinite(speed) ? Math.max(0, Math.min(speed, 3)) : 1));
        gl.drawArrays(gl.POINTS, 0, pointCount);
      },
      dispose,
    };
  } catch (error) { dispose(); throw error; }
}
export type OrbitalSphereRenderer = ReturnType<typeof createOrbitalSphereRenderer>;
