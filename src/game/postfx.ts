import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";

/**
 * Custom shader: subtle chromatic aberration for atmospheric effect.
 * Intensity is driven by sanity — drops below baseline 0.0015 give a
 * barely-perceptible micro-shift; at sanity = 0 the offset becomes
 * aggressive enough to read as "the world is fraying at the edges".
 */
const ChromaticShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uIntensity: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    varying vec2 vUv;
    void main() {
      vec2 center = vec2(0.5, 0.5);
      vec2 dir = vUv - center;
      float dist = length(dir);
      vec2 offset = dir * uIntensity * (0.6 + dist * 1.8);
      float r = texture2D(tDiffuse, vUv + offset).r;
      float g = texture2D(tDiffuse, vUv).g;
      float b = texture2D(tDiffuse, vUv - offset).b;
      float a = texture2D(tDiffuse, vUv).a;
      gl_FragColor = vec4(r, g, b, a);
    }
  `,
};

/**
 * Procedural film-grain pass. Off at full sanity; ramps up linearly below
 * sanity 0.5 so the screen "breathes" with dust/CRT noise as the player
 * loses their mind. Cheap (single texture lookup + hash21) so it's safe
 * to leave enabled the whole time.
 */
const GrainShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uIntensity: { value: 0 },
    uTime: { value: 0 },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }
  `,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float uIntensity;
    uniform float uTime;
    varying vec2 vUv;
    // hash21: cheap deterministic 2D → 1D hash, no trig texture lookup.
    float hash21(vec2 p) {
      p = fract(p * vec2(123.34, 456.21));
      p += dot(p, p + 45.32);
      return fract(p.x * p.y);
    }
    void main() {
      vec4 col = texture2D(tDiffuse, vUv);
      // Time-modulated seed so the grain keeps moving (otherwise it freezes
      // onto a fixed speckle pattern that the eye latches onto).
      float n = hash21(vUv * (1000.0 + uTime * 100.0)) - 0.5;
      col.rgb += n * uIntensity;
      gl_FragColor = col;
    }
  `,
};

/**
 * Post-processing pipeline. The composer replaces the renderer's frame output.
 */
export class PostFX {
  readonly composer: EffectComposer;
  private chroma: ShaderPass;
  private grain: ShaderPass;

  constructor(renderer: THREE.WebGLRenderer, scene: THREE.Scene, camera: THREE.Camera, w: number, h: number) {
    this.composer = new EffectComposer(renderer);
    this.composer.setPixelRatio(renderer.getPixelRatio());
    this.composer.setSize(w, h);

    const render = new RenderPass(scene, camera);
    this.composer.addPass(render);

    const bloom = new UnrealBloomPass(new THREE.Vector2(w, h), 0.55, 0.55, 0.85);
    this.composer.addPass(bloom);

    this.chroma = new ShaderPass(ChromaticShader);
    this.chroma.uniforms.uIntensity.value = 0.0015;
    this.composer.addPass(this.chroma);

    this.grain = new ShaderPass(GrainShader);
    this.grain.uniforms.uIntensity.value = 0;
    this.grain.uniforms.uTime.value = 0;
    this.composer.addPass(this.grain);

    // OutputPass handles tone-mapping + colorspace conversion correctly for SRGB output.
    this.composer.addPass(new OutputPass());
  }

  /**
   * Drive both chromatic aberration and film grain from the player's sanity
   * (0 = critical, 1 = full). Chromatic scales linearly with fear; grain
   * only kicks in below 0.5 so high-sanity play isn't visually noisy.
   */
  setSanity(sanityNormalized: number) {
    const sanity = Math.max(0, Math.min(1, sanityNormalized));
    const fear = 1 - sanity;
    // Chromatic: 0.0015 baseline → ~0.013 at zero sanity (~9× baseline).
    this.chroma.uniforms.uIntensity.value = 0.0015 + fear * 0.012;
    // Grain: 0 above 0.5 sanity → ~0.06 at zero sanity.
    this.grain.uniforms.uIntensity.value = Math.max(0, (0.5 - sanity) * 0.12);
  }

  /** Update the grain animation seed. Call once per frame from the game loop. */
  updateTime(t: number) {
    this.grain.uniforms.uTime.value = t;
  }

  setSize(w: number, h: number) {
    this.composer.setSize(w, h);
  }

  dispose() {
    this.composer.dispose();
  }
}
