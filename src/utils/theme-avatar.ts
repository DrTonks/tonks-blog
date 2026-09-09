import {
	AVATAR_MOBILE_QUERY, AVATAR_PARTICLES_CHANGE, REDUCED_MOTION_QUERY,
	canUseAvatarParticles, reportAvatarParticlesUnavailable,
} from "./setting-utils";

// Immutable particle paths + image textures. Only shared motion changes per frame.
const VERTEX = `
precision highp float;
attribute vec2 aUV;
attribute vec2 aOffset;
attribute vec2 aPhase;
uniform vec4 uMotion;
// Avatar-local UV center, radius and inverse band width; shared by all points.
uniform vec4 uWave;
uniform float uWaveGain;
uniform float uSize;
varying vec2 vUV;
varying float vMix;
void main() {
  float scatter = uMotion.x;
  vec2 pos = (aUV - .5) * 2.0;
  float wave = uMotion.y * aPhase.y + uMotion.z * aPhase.x;
  pos += aOffset * scatter + vec2(.06*wave, .12*scatter) * scatter;
  // Uniform branch: every vertex takes the same path, and the wave work stops
  // after its short fade into morph (rather than running for the whole 850ms).
  if (uWaveGain > 0.0) {
    vec2 radial = aUV - uWave.xy;
    float distance = max(length(radial), .0001);
    float age = (uWave.z - distance) * uWave.w;
    // One crest and a small returning trough, entirely behind the reveal edge.
    float crest = smoothstep(0.0, .18, age) * (1.0-smoothstep(.18, .55, age));
    float trough = smoothstep(.35, .62, age) * (1.0-smoothstep(.62, 1.0, age));
    pos += radial / distance * (.045 * (crest-.28*trough) * uWaveGain);
  }
  gl_Position = vec4(pos.x, -pos.y, 0.0, 1.0);
  gl_PointSize = uSize * (1.0 - .42*scatter);
  vUV = aUV;
  vMix = uMotion.w;
}`;
const FRAGMENT = `
precision mediump float;
uniform sampler2D uFrom;
uniform sampler2D uTo;
varying vec2 vUV;
varying float vMix;
void main() {
  vec4 a = texture2D(uFrom,vUV);
  vec4 b = texture2D(uTo,vUV);
  // Premultiplied interpolation prevents transparent black halos.
  gl_FragColor = mix(vec4(a.rgb*a.a,a.a), vec4(b.rgb*b.a,b.a), vMix);
}`;

// Invert the reveal's y(t), then evaluate x(t), once per click (not per frame).
export function revealArrival(fraction: number): number {
	const bezier = (t: number, a: number, b: number) =>
		3 * (1 - t) * (1 - t) * t * a + 3 * (1 - t) * t * t * b + t * t * t;
	let low = 0,
		high = 1;
	for (let i = 0; i < 20; i++) {
		const mid = (low + high) / 2;
		if (bezier(mid, 0.75, 1) < fraction) low = mid;
		else high = mid;
	}
	return bezier((low + high) / 2, 0.22, 0.18);
}

// Same curve as the two compositor clips; once per frame, not per particle.
export function revealProgress(fraction: number): number {
	if (fraction <= 0) return 0;
	if (fraction >= 1) return 1;
	const bezier = (t: number, a: number, b: number) =>
		3 * (1-t) * (1-t) * t * a + 3 * (1-t) * t * t * b + t*t*t;
	let low = 0, high = 1;
	for (let i = 0; i < 16; i++) {
		const mid = (low + high) / 2;
		if (bezier(mid, .22, .18) < fraction) low = mid;
		else high = mid;
	}
	return bezier((low + high) / 2, .75, 1);
}

export class ThemeAvatarElement extends HTMLElement {
	private gl: WebGLRenderingContext | null = null;
	private program: WebGLProgram | null = null;
	private buffer: WebGLBuffer | null = null;
	private textures: WebGLTexture[] = [];
	private grid = 128;
	private motion: WebGLUniformLocation | null = null;
	private wave: WebGLUniformLocation | null = null;
	private waveGain: WebGLUniformLocation | null = null;
	private waveX = 0;
	private waveY = 0;
	private waveLimit = 0;
	private lastWaveRadius = -1;
	private lastProgress = -1;
	private frame = 0;
	private idleTimer = 0;
	private idleCallback = 0;
	private ready = false;
	private complete: (() => void) | null = null;
	private generation = 0;
	private preparing = false;
	private mobileQuery: MediaQueryList | null = null;
	private motionQuery: MediaQueryList | null = null;
	private snapshotComposite: HTMLElement | null = null;

	connectedCallback() {
		this.mobileQuery = window.matchMedia(AVATAR_MOBILE_QUERY);
		this.motionQuery = window.matchMedia(REDUCED_MOTION_QUERY);
		this.mobileQuery.addEventListener("change", this.syncAvailability);
		this.motionQuery.addEventListener("change", this.syncAvailability);
		window.addEventListener(AVATAR_PARTICLES_CHANGE, this.syncAvailability);
		document.addEventListener("visibilitychange", this.onVisibility);
		window.addEventListener("theme-change", this.cancel);
		window.addEventListener("resize", this.cancel);
		window.addEventListener("scroll", this.cancel, { passive: true });
		this.syncAvailability();
	}

	private syncAvailability = () => {
		if (!this.isConnected || !canUseAvatarParticles()) {
			this.stopPreparing();
			this.cancel();
			this.dispose();
			return;
		}
		if (this.ready || this.preparing || this.idleTimer || this.idleCallback) return;
		// Keep shader compilation and texture upload outside the theme-click frame.
		this.idleTimer = window.setTimeout(() => {
			this.idleTimer = 0;
			if ("requestIdleCallback" in window)
				this.idleCallback = window.requestIdleCallback(() => {
					this.idleCallback = 0;
					void this.prepare();
				});
			else void this.prepare();
		}, 1200);
	};

	private stopPreparing() {
		++this.generation;
		if (this.idleCallback) window.cancelIdleCallback(this.idleCallback);
		clearTimeout(this.idleTimer);
		this.idleTimer = this.idleCallback = 0;
		this.preparing = false;
	}

	private async prepare() {
		if (!this.isConnected || !canUseAvatarParticles() || this.ready || this.preparing) return;
		const generation = ++this.generation;
		this.preparing = true;
		const shaders: WebGLShader[] = [];
		let context: WebGLRenderingContext | null = null;
		try {
			const images = [...this.querySelectorAll("img")];
			await Promise.all(images.map((image) => image.decode()));
			if (!this.isConnected || generation !== this.generation || !canUseAvatarParticles()) return;
			const canvas = this.querySelector("canvas")!;
			const gl = canvas.getContext("webgl", {
				alpha: true,
				antialias: false,
				depth: false,
				stencil: false,
				powerPreference: "low-power",
				failIfMajorPerformanceCaveat: true,
			});
			if (!gl) throw new Error("Avatar WebGL unavailable");
			this.gl = gl;
			context = gl;
			canvas.addEventListener("webglcontextlost", this.onContextLost);
			const compile = (type: number, source: string) => {
				const shader = gl.createShader(type);
				if (!shader) throw new Error("Avatar shader allocation failed");
				shaders.push(shader);
				gl.shaderSource(shader, source);
				gl.compileShader(shader);
				if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
					throw new Error("Avatar shader unavailable");
				}
				return shader;
			};
			const vertex = compile(gl.VERTEX_SHADER, VERTEX);
			const fragment = compile(gl.FRAGMENT_SHADER, FRAGMENT);
			const program = gl.createProgram();
			if (!program) throw new Error("Avatar program allocation failed");
			this.program = program;
			gl.attachShader(program, vertex);
			gl.attachShader(program, fragment);
			gl.linkProgram(program);
			if (!gl.getProgramParameter(program, gl.LINK_STATUS))
				throw new Error("Avatar shader link failed");
			gl.useProgram(program);
			const precomputeStart = import.meta.env.DEV ? performance.now() : 0;
			// Compute image-independent paths once, not once per particle per frame.
			// sin(a+b) = sin(a)cos(b) + cos(a)sin(b) keeps the motion analytic.
			const particles = new Float32Array(this.grid * this.grid * 6);
			for (let i = 0; i < this.grid * this.grid; i++) {
				const x = ((i % this.grid) + 0.5) / this.grid;
				const y = (Math.floor(i / this.grid) + 0.5) / this.grid;
				const hash = Math.sin(x * 127.1 + y * 311.7) * 43758.5453;
				const seed = hash - Math.floor(hash);
				const offset = i * 6;
				particles[offset] = x;
				particles[offset + 1] = y;
				particles[offset + 2] = Math.cos(seed * 6.283) * (0.06 + seed * 0.13);
				particles[offset + 3] = Math.sin(seed * 6.283) * (0.06 + seed * 0.13);
				particles[offset + 4] = Math.sin(seed * 4);
				particles[offset + 5] = Math.cos(seed * 4);
			}
			if (import.meta.env.DEV) {
				this.dataset.precomputeMs = (performance.now() - precomputeStart).toFixed(2);
				this.dataset.particleBytes = String(particles.byteLength);
			}
			this.buffer = gl.createBuffer();
			if (!this.buffer) throw new Error("Avatar buffer allocation failed");
			gl.bindBuffer(gl.ARRAY_BUFFER, this.buffer);
			gl.bufferData(gl.ARRAY_BUFFER, particles, gl.STATIC_DRAW);
			for (const [index, name] of ["aUV", "aOffset", "aPhase"].entries()) {
				const attribute = gl.getAttribLocation(program, name);
				gl.enableVertexAttribArray(attribute);
				gl.vertexAttribPointer(attribute, 2, gl.FLOAT, false, 24, index * 8);
			}
			// Match object-fit: contain, including non-square replacement images.
			for (const image of images) {
				const source = document.createElement("canvas");
				source.width = source.height = 256;
				const context = source.getContext("2d")!;
				const scale = 256 / Math.max(image.naturalWidth, image.naturalHeight);
				const w = image.naturalWidth * scale,
					h = image.naturalHeight * scale;
				context.drawImage(image, (256 - w) / 2, (256 - h) / 2, w, h);
				const texture = gl.createTexture();
				if (!texture) throw new Error("Avatar texture allocation failed");
				this.textures.push(texture);
				gl.bindTexture(gl.TEXTURE_2D, texture);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
				gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
				gl.texImage2D(
					gl.TEXTURE_2D,
					0,
					gl.RGBA,
					gl.RGBA,
					gl.UNSIGNED_BYTE,
					source,
				);
			}
			gl.uniform1i(gl.getUniformLocation(program, "uFrom"), 0);
			gl.uniform1i(gl.getUniformLocation(program, "uTo"), 1);
			this.motion = gl.getUniformLocation(program, "uMotion");
			this.wave = gl.getUniformLocation(program, "uWave");
			this.waveGain = gl.getUniformLocation(program, "uWaveGain");
			gl.enable(gl.BLEND);
			gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
			if (gl.isContextLost() || gl.getError() !== gl.NO_ERROR)
				throw new Error("Avatar GPU initialization failed");
			this.ready = true;
			if (import.meta.env.DEV) this.dataset.gpuReady = "true";
		} catch {
			// A stale decode rejection must not destroy a newer preparation.
			if (generation === this.generation) {
				this.dispose();
				reportAvatarParticlesUnavailable();
			}
		} finally {
			for (const shader of shaders) context?.deleteShader(shader);
			if (generation === this.generation) this.preparing = false;
		}
	}

	begin(
		dark: boolean,
		x: number,
		y: number,
		radius: number,
		revealDuration: number,
	) {
		const rect = this.getBoundingClientRect();
		if (
			!this.isConnected || !canUseAvatarParticles() ||
			!this.ready ||
			!this.gl ||
			!this.program ||
			document.hidden ||
			rect.bottom <= 0 ||
			rect.top >= innerHeight ||
			rect.right <= 0 ||
			rect.left >= innerWidth ||
			rect.width === 0
		)
			return null;
		this.cancel();
		const gl = this.gl;
		const canvas = this.querySelector("canvas")!;
		const size = Math.round(rect.width * Math.min(devicePixelRatio, 2));
		canvas.width = canvas.height = size;
		this.lastProgress = -1;
		this.lastWaveRadius = -1;
		this.waveX = (x - rect.left) / rect.width;
		this.waveY = (y - rect.top) / rect.width;
		gl.viewport(0, 0, size, size);
		gl.useProgram(this.program);
		gl.uniform1f(
			gl.getUniformLocation(this.program, "uSize"),
			size / this.grid + 0.1,
		);
		[this.textures[dark ? 0 : 1], this.textures[dark ? 1 : 0]].forEach(
			(texture, i) => {
				gl.activeTexture(gl.TEXTURE0 + i);
				gl.bindTexture(gl.TEXTURE_2D, texture);
			},
		);
		// Morph only after the wave reaches the farthest avatar corner.
		const distance = Math.max(...[rect.left, rect.right].flatMap(px =>
			[rect.top, rect.bottom].map(py => Math.hypot(px-x, py-y))));
		// 28% of the avatar width: a narrow, bounded wake, no new particle buffer.
		this.waveLimit = distance / rect.width + .28;
		const nearest = Math.hypot(Math.max(rect.left-x, 0, x-rect.right),
			Math.max(rect.top-y, 0, y-rect.bottom));
		const waveArrival = revealArrival(Math.min(1, nearest / radius)) * revealDuration;
		const delay =
			revealArrival(Math.min(1, distance / radius)) * revealDuration;
		const duration = 850;
		// Capture avatar, its gradient overlay and signature as ONE composite.
		// A child-only snapshot would escape the signature's normal stacking order.
		const composite = this.closest<HTMLElement>("[data-avatar-composite]") ?? this;
		const box = composite.getBoundingClientRect();
		const cx = (x - box.left) / box.width * 100, cy = (y - box.top) / box.height * 100;
		const percentRadius = radius * Math.SQRT2 / Math.hypot(box.width, box.height) * 100;
		const clips: Animation[] = [];
		let active = true;
		const done = new Promise<void>((resolve) => {
			this.complete = () => { active = false; resolve(); };
		});
		return {
			done,
			// Called INSIDE the view transition update. The old ROOT snapshot must
			// capture the untouched img, signature and mask, not a cleared GL buffer.
			capture: () => {
				if (!active) return;
				if (!canUseAvatarParticles()) { this.syncAvailability(); return; }
				this.snapshotComposite = composite;
				composite.style.viewTransitionName = "theme-avatar";
				this.dataset.state = "particles";
				this.draw(0);
			},
			cleanup: () => { for (const animation of clips) animation.cancel(); },
			start: (startTime: number) => {
				if (!active) return;
				const root = document.documentElement;
				for (const [pseudoElement, clipPath] of [
					["::view-transition-new(theme-avatar)", [`circle(0% at ${cx}% ${cy}%)`, `circle(${percentRadius}% at ${cx}% ${cy}%)`]],
				] as const) {
					const animation = root.animate({ clipPath: [...clipPath] }, {
						duration: revealDuration, easing: "cubic-bezier(.22,.75,.18,1)", fill: "both", pseudoElement,
					});
					animation.startTime = startTime;
					clips.push(animation);
				}
				const start = startTime + delay;
				const intervals: number[] = [];
				let previous = 0,
					cpu = 0,
					draws = 0,
					frames = 0;
				const tick = (now: number) => {
					if (!active) return;
					if (import.meta.env.DEV && previous) intervals.push(now - previous);
					previous = now;
					const before = import.meta.env.DEV ? performance.now() : 0;
					const t = Math.max(0, Math.min(1, (now - start) / duration));
					const elapsed = now - startTime;
					// Before the wave touches the avatar, reuse the initial canvas.
					const waveRadius = elapsed < waveArrival ? 0 : Math.min(this.waveLimit,
						revealProgress(elapsed / revealDuration) * radius / rect.width);
					const drawn = this.draw(t, waveRadius);
					if (import.meta.env.DEV) {
						if (drawn) draws++;
						cpu += performance.now() - before;
						frames++;
					}
					if (t >= 1) {
						if (import.meta.env.DEV) {
							intervals.sort((a, b) => a - b);
							this.dataset.lastRun = JSON.stringify({
								frames,
								draws: draws + 1, // Includes the initial capture draw.
								delay: Math.round(delay),
								cpuMs: +(cpu / frames).toFixed(3),
								frameP95: intervals[Math.floor(intervals.length * 0.95)],
								maxFrame: intervals.at(-1),
							});
						}
						this.cancel();
					} else this.frame = requestAnimationFrame(tick);
				};
				this.frame = requestAnimationFrame(tick);
			},
			cancel: () => { if (active) this.cancel(); },
		};
	}

	private draw(t: number, waveRadius = 0) {
		if (t === this.lastProgress && waveRadius === this.lastWaveRadius) return false;
		this.lastProgress = t;
		this.lastWaveRadius = waveRadius;
		const gl = this.gl!;
		gl.clearColor(0, 0, 0, 0);
		gl.clear(gl.COLOR_BUFFER_BIT);
		const eased = t * t * (3 - 2 * t);
		const scatter = 0.22 * (1 - eased) + 0.78 * Math.sin(eased * Math.PI);
		const mix = Math.max(0, Math.min(1, (eased - 0.28) / 0.44));
		gl.uniform4f(this.motion, scatter, Math.sin(eased * 6.283),
			Math.cos(eased * 6.283), mix * mix * (3 - 2 * mix));
		const fade = Math.min(1, t / .18);
		gl.uniform4f(this.wave, this.waveX, this.waveY, waveRadius, 1 / .28);
		gl.uniform1f(this.waveGain, 1 - fade * fade * (3 - 2 * fade));
		gl.drawArrays(gl.POINTS, 0, this.grid * this.grid);
		return true;
	}

	readonly cancel = () => {
		cancelAnimationFrame(this.frame);
		this.frame = 0;
		this.dataset.state = "static";
		this.snapshotComposite?.style.removeProperty("view-transition-name");
		this.snapshotComposite = null;
		this.complete?.();
		this.complete = null;
	};
	private onVisibility = () => {
		if (document.hidden) this.cancel();
	};
	private onContextLost = () => {
		this.stopPreparing();
		this.cancel();
		this.dispose();
		reportAvatarParticlesUnavailable();
	};
	private dispose() {
		this.ready = false;
		const canvas = this.querySelector("canvas");
		canvas?.removeEventListener("webglcontextlost", this.onContextLost);
		for (const texture of this.textures) this.gl?.deleteTexture(texture);
		this.gl?.deleteBuffer(this.buffer);
		this.gl?.deleteProgram(this.program);
		this.gl?.getExtension("WEBGL_lose_context")?.loseContext();
		this.textures = [];
		this.buffer = this.program = null;
		this.motion = this.wave = this.waveGain = null;
		if (this.gl && canvas) {
			// A deliberately lost context cannot be reused. A fresh empty canvas
			// permits re-enabling and drops the old drawing buffer on mobile/off.
			const replacement = canvas.cloneNode(false) as HTMLCanvasElement;
			replacement.width = replacement.height = 0;
			canvas.replaceWith(replacement);
		}
		this.gl = null;
		delete this.dataset.gpuReady;
		delete this.dataset.particleBytes;
		delete this.dataset.precomputeMs;
	}
	disconnectedCallback() {
		this.stopPreparing();
		this.cancel();
		this.dispose();
		document.removeEventListener("visibilitychange", this.onVisibility);
		window.removeEventListener("theme-change", this.cancel);
		window.removeEventListener("resize", this.cancel);
		window.removeEventListener("scroll", this.cancel);
		window.removeEventListener(AVATAR_PARTICLES_CHANGE, this.syncAvailability);
		this.mobileQuery?.removeEventListener("change", this.syncAvailability);
		this.motionQuery?.removeEventListener("change", this.syncAvailability);
		this.mobileQuery = this.motionQuery = null;
		this.querySelector("canvas")?.removeEventListener(
			"webglcontextlost",
			this.onContextLost,
		);
	}
}
