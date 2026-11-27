/**
 * WebGL2 post-processing on two layers: the base (background + camera) is shown as
 * it is, while only the light layer (strings, sparks, fingertips) gets the bloom
 * and a touch of chromatic aberration. A bright camera picture therefore never glows.
 */
const VS = `#version 300 es
in vec2 p; out vec2 uv;
void main(){ uv = p*0.5+0.5; gl_Position = vec4(p,0.,1.); }`;

const BRIGHT = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o; uniform sampler2D t;
void main(){ vec3 c = texture(t, uv).rgb; float l = max(c.r, max(c.g, c.b));
  o = vec4(c * smoothstep(0.2, 0.8, l), 1.); }`;

const BLUR = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o; uniform sampler2D t; uniform vec2 d;
void main(){
  vec3 c = texture(t, uv).rgb * 0.227027;
  c += texture(t, uv + d*1.3846).rgb * 0.3162162; c += texture(t, uv - d*1.3846).rgb * 0.3162162;
  c += texture(t, uv + d*3.2308).rgb * 0.0702703; c += texture(t, uv - d*3.2308).rgb * 0.0702703;
  o = vec4(c, 1.); }`;

const COMPOSE = `#version 300 es
precision mediump float; in vec2 uv; out vec4 o;
uniform sampler2D base; uniform sampler2D fx; uniform sampler2D b1; uniform sampler2D b2;
uniform float k; uniform float ca;
void main(){
  vec2 off = (uv - 0.5) * ca;
  vec4 f = texture(fx, uv);
  // Light layer is premultiplied: composite it over the base, then add the glow.
  vec3 light = vec3(texture(fx, uv + off).r, f.g, texture(fx, uv - off).b);
  vec3 b = texture(b1, uv).rgb * 1.1 + texture(b2, uv).rgb * 1.6;
  vec3 add = light + b * k;
  add = add / (1. + add * 0.12);
  vec3 c = texture(base, uv).rgb * (1. - f.a) + add;
  o = vec4(min(c, vec3(1.)), 1.); }`;

interface Target {
  fb: WebGLFramebuffer;
  tex: WebGLTexture;
  w: number;
  h: number;
}

export class Bloom {
  private gl: WebGL2RenderingContext;
  private progs: Record<'bright' | 'blur' | 'compose', WebGLProgram>;
  private sceneTex: WebGLTexture;
  private baseTex: WebGLTexture;
  private targets: Target[] = [];
  private w = 0;
  private h = 0;

  static create(canvas: HTMLCanvasElement): Bloom | null {
    const gl = canvas.getContext('webgl2', {
      alpha: false,
      antialias: false,
      preserveDrawingBuffer: false,
    });
    if (!gl) return null;
    try {
      return new Bloom(gl);
    } catch {
      return null;
    }
  }

  private constructor(gl: WebGL2RenderingContext) {
    this.gl = gl;
    const buf = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, buf);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    this.progs = {
      bright: this.program(BRIGHT),
      blur: this.program(BLUR),
      compose: this.program(COMPOSE),
    };
    this.sceneTex = this.texture();
    this.baseTex = this.texture();
  }

  private program(fs: string): WebGLProgram {
    const gl = this.gl;
    const p = gl.createProgram() as WebGLProgram;
    for (const [type, src] of [
      [gl.VERTEX_SHADER, VS],
      [gl.FRAGMENT_SHADER, fs],
    ] as const) {
      const s = gl.createShader(type) as WebGLShader;
      gl.shaderSource(s, src);
      gl.compileShader(s);
      if (!gl.getShaderParameter(s, gl.COMPILE_STATUS))
        throw new Error(gl.getShaderInfoLog(s) ?? 'shader');
      gl.attachShader(p, s);
    }
    gl.bindAttribLocation(p, 0, 'p');
    gl.linkProgram(p);
    if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error('link');
    return p;
  }

  private texture(): WebGLTexture {
    const gl = this.gl;
    const t = gl.createTexture() as WebGLTexture;
    gl.bindTexture(gl.TEXTURE_2D, t);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    return t;
  }

  private target(w: number, h: number): Target {
    const gl = this.gl;
    const tex = this.texture();
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
    const fb = gl.createFramebuffer() as WebGLFramebuffer;
    gl.bindFramebuffer(gl.FRAMEBUFFER, fb);
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
    return { fb, tex, w, h };
  }

  private resize(w: number, h: number): void {
    if (w === this.w && h === this.h) return;
    this.w = w;
    this.h = h;
    const gl = this.gl;
    for (const t of this.targets) {
      gl.deleteFramebuffer(t.fb);
      gl.deleteTexture(t.tex);
    }
    const s2 = [Math.max(1, w >> 1), Math.max(1, h >> 1)] as const;
    const s4 = [Math.max(1, w >> 2), Math.max(1, h >> 2)] as const;
    // [bright, blurA, blurB (half), blurC, blurD (quarter)]
    this.targets = [
      this.target(...s2),
      this.target(...s2),
      this.target(...s2),
      this.target(...s4),
      this.target(...s4),
    ];
  }

  private pass(prog: WebGLProgram, target: Target | null, bind: () => void): void {
    const gl = this.gl;
    gl.useProgram(prog);
    gl.bindFramebuffer(gl.FRAMEBUFFER, target?.fb ?? null);
    gl.viewport(0, 0, target?.w ?? this.w, target?.h ?? this.h);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    bind();
    gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
  }

  private blur(src: Target, tmp: Target, dst: Target): void {
    const gl = this.gl;
    const p = this.progs.blur;
    for (const [from, to, dx, dy] of [
      [src, tmp, 1 / src.w, 0],
      [tmp, dst, 0, 1 / src.h],
    ] as const) {
      this.pass(p, to, () => {
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, from.tex);
        gl.uniform1i(gl.getUniformLocation(p, 't'), 0);
        gl.uniform2f(gl.getUniformLocation(p, 'd'), dx, dy);
      });
    }
  }

  render(base: HTMLCanvasElement, scene: HTMLCanvasElement, strength: number): void {
    const gl = this.gl;
    this.resize(gl.canvas.width, gl.canvas.height);
    gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, true);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, false);
    gl.bindTexture(gl.TEXTURE_2D, this.baseTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, base);
    gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
    gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
    gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, scene);
    const [bright, a, b, c, d] = this.targets as [Target, Target, Target, Target, Target];

    this.pass(this.progs.bright, bright, () => {
      gl.activeTexture(gl.TEXTURE0);
      gl.bindTexture(gl.TEXTURE_2D, this.sceneTex);
      gl.uniform1i(gl.getUniformLocation(this.progs.bright, 't'), 0);
    });
    this.blur(bright, a, b);
    // Second, wider level: blur the half-res result into the quarter-res targets.
    this.blur(b, c, d);
    this.blur(d, c, d);

    const p = this.progs.compose;
    this.pass(p, null, () => {
      const units: [string, WebGLTexture][] = [
        ['base', this.baseTex],
        ['fx', this.sceneTex],
        ['b1', b.tex],
        ['b2', d.tex],
      ];
      units.forEach(([name, tex], i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, tex);
        gl.uniform1i(gl.getUniformLocation(p, name), i);
      });
      gl.uniform1f(gl.getUniformLocation(p, 'k'), strength);
      gl.uniform1f(gl.getUniformLocation(p, 'ca'), 0.0012);
    });
  }
}
