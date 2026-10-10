// Original layered-light shader. Coordinates are normalized by the short side
// so the bands keep their shape on narrow and wide screens.
export const AURORA_FRAGMENT_SHADER = `
precision mediump float;
uniform vec4 u_scene; // width, height, elapsed seconds, unused
uniform vec4 u_space; // pointer x/y, presence, unused

float glow(float distanceToLine, float width) {
  return exp(-pow(distanceToLine / width, 2.0));
}

void main() {
  vec2 resolution = max(u_scene.xy, vec2(1.0));
  vec2 p = (gl_FragCoord.xy - resolution * 0.5) / min(resolution.x, resolution.y);
  float time = u_scene.z;
  float pointer = u_space.z;
  float cursor = exp(-dot(p - u_space.xy * 0.42, p - u_space.xy * 0.42) * 7.0) * pointer;

  // Three soft ribbons rise and recede independently. Their shapes use simple
  // sine curves, which also work on devices with minimal WebGL precision.
  float a = p.y - (0.27 * sin(p.x * 2.8 + time * 0.18) - 0.10);
  float b = p.y - (0.22 * sin(p.x * 3.5 - time * 0.11 + 1.8) + 0.24);
  float c = p.y - (0.18 * sin(p.x * 2.1 + time * 0.14 + 3.2) - 0.35);
  float lightA = glow(a, 0.25);
  float lightB = glow(b, 0.20);
  float lightC = glow(c, 0.30);

  vec3 color = vec3(0.09, 0.08, 0.14);
  color += vec3(0.34, 0.42, 0.34) * lightA;
  color += vec3(0.40, 0.28, 0.39) * lightB;
  color += vec3(0.26, 0.34, 0.43) * lightC;
  color += vec3(0.12, 0.11, 0.09) * cursor;
  float edge = clamp(1.0 - 0.22 * dot(p, p), 0.65, 1.0);
  gl_FragColor = vec4(clamp(color * edge, 0.0, 1.0), 1.0);
}
`;
