import * as THREE from "three";
// Vite-plugin-singlefile inlines the PNG as a base64 data URL at build.
// The same URL works for THREE.TextureLoader at runtime in both dev
// (file URL) and production (data URL). Picking BEDROOM-3 as the canonical
// "Level 1 Backrooms" reference image — swap to another BEDROOM-N.png if
// the user wants a different angle.
import levelImgUrl from "../../BEDROOM-3.png";

/**
 * IntroScene — the cinematic 3D mini-stage shown for the first ~9 s of
 * each playthrough. Replaces the previous "▶ PLAY" VHS overlay (which was
 * pure HTML) with a narrative sequence: dim bedroom → silhouette picks up
 * a cardboard box → walks to a CRT TV → places box against the screen →
 * TV flashes chromatic → camera dives INTO the screen (FOV widens) and
 * the gameplay corridor takes over.
 *
 * Animation is time-driven: every visible element linearly interpolates
 * its position/rotation/color between timed keyframes during update(dt).
 * No meshes are added/removed at runtime; the scene is fully built in
 * the constructor and torn down in dispose().
 *
 * Each instance owns its own `THREE.Scene` + `THREE.PerspectiveCamera`.
 * BackroomsGame bypasses `postfx.composer` while phase === "intro" and
 * calls `scene.render(renderer)` directly — the bedroom is dim enough
 * that bloom/chromatic aren't needed, and we keep the gameplay composer's
 * scene+camera pair immutable (PostFX doesn't expose setScene/setCamera).
 */
export class IntroScene {
  readonly scene: THREE.Scene;
  readonly camera: THREE.PerspectiveCamera;
  /** Accumulated cinematic time in seconds since constructor (clamped dt). */
  time = 0;
  /** True once t >= INTRO_DURATION_S — caller can use this to swap render path. */
  finished = false;
  /** Total cinematic length — choreography is anchored to this. */
  static readonly INTRO_DURATION_S = 9.0;

  // Animated handles (kept typed) — each one is built once and re-positioned
  // every frame during update() based on time.
  private character!: THREE.Group;
  private characterPos = new THREE.Vector3();
  private box!: THREE.Group;
  private tvScreen!: THREE.Mesh;
  private table!: THREE.Group;
  // TV CRT static state — owned by the IntroScene so the noise canvas
  // refreshes independently of the gameplay canvas/AudioContext. Updated
  // every ~80 ms inside update() so the screen reads as "live noise"
  // even before the chromatic reactor kicks in at t=6. The HTMLCanvasElement
  // is local to buildTV() — we never reference it after the CanvasTexture
  // is created (the texture holds its own canvas ref).
  private staticCtx!: CanvasRenderingContext2D;
  private staticImg!: ImageData;
  private staticTex!: THREE.CanvasTexture;
  private lastStaticUpdate = -1;
  // Level 1 photo loaded async from BEDROOM-3.png. Swapped onto
  // tvScreen.material.map once available, at the post-insert moment (t≈7s).
  // Held nullable because the load callback fires after construction —
  // the truthy check `this.levelTexture && !this.tvLevelSwapDone` is the
  // single source of truth for whether the swap has occurred.
  private levelTexture: THREE.Texture | null = null;
  // Guarded flag so the map swap fires exactly once.
  private tvLevelSwapDone = false;
  // VCR slot mesh — kept as a handle so dispose() can free it explicitly
  // and so future debugging can introspect its position.
  private vcrSlot!: THREE.Mesh;

  constructor(width: number, height: number) {
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x0c0806); // pitch-dark bedroom
    // Fog so the room fades to black at the back, reinforcing the depth.
    this.scene.fog = new THREE.Fog(0x0c0806, 4, 14);

    this.camera = new THREE.PerspectiveCamera(50, width / height, 0.05, 60);
    this.camera.position.set(0, 1.6, -3.5);
    // Initial wide shot looks at the character+TV region.
    this.camera.lookAt(0.5, 1.1, -2.0);

    this.buildLights();
    this.buildRoom();
    this.buildTable();
    this.buildBox();
    this.buildCharacter();
    this.buildTV();

    // Async-load the "Level 1" photo. Until it arrives we keep showing
    // the procedural noise texture; the post-insert update() checkkeys off
    // `levelTextureLoaded` so vinylLetter-skipping the cinematic still
    // works (texture just never gets swapped).
    const loader = new THREE.TextureLoader();
    loader.load(
      levelImgUrl,
      (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        this.levelTexture = tex;
      },
      undefined,
      (err) => {
        // Graceful fallback: log once and continue with static noise.
        if (typeof console !== "undefined") console.warn("[IntroScene] BEDROOM-3.png load failed — staying on procedural noise", err);
      },
    );
  }

  // ──────────────────────────────────────────────────────────── Lights
  private buildLights() {
    // Warm ambient — bumped intensity 0.85 → 1.4 and shifted tint from
    // 0x402a1c → 0x6a523a so the bedroom reads on dim / compressed screens.
    // The candle + TV still dominate the falloff; this is just enough
    // rim light to keep the floor, walls, and silhouette readable.
    const ambient = new THREE.AmbientLight(0x6a523a, 1.4);
    this.scene.add(ambient);
    // Candle bumped 1.8 → 2.8 + range 10 → 12 so the halo reaches the
    // table edge AND the character's torso as they walk past.
    const candle = new THREE.PointLight(0xff9a3c, 2.8, 12, 1.6);
    candle.position.set(-1.4, 0.85, 0);
    this.scene.add(candle);
    // TV screen glow bumped 1.1 → 2.4 so the cabinet is readable from
    // the wide shot's z=-3.7 anchor. The pre-flash and reactor branches
    // in update() modulate this further as the cinematic ramps up.
    const tvGlow = new THREE.PointLight(0xe6e1d2, 2.4, 10, 1.8);
    tvGlow.position.set(1.5, 0.95, -2.4);
    this.scene.add(tvGlow);
    this.tvGlow = tvGlow;
    // Cool moon light — directional fill from upper-left, casts dim
    // blue rim-light across the character + box on the side opposite to
    // the candle. Adds depth so the silhouette doesn't merge with the
    // dark wallpaper.
    const moon = new THREE.DirectionalLight(0xa0bcd4, 0.9);
    moon.position.set(-3.8, 3.5, 1.6);
    // Aim past the character (target x=−0.2, y=1.0) so the directional
    // light grazes the silhouette from the back-left as a rim light rather
    // than washing the back wall.
    moon.target.position.set(-0.2, 1.0, -1.5);
    this.scene.add(moon);
    this.scene.add(moon.target);
  }
  private tvGlow!: THREE.PointLight;

  // ──────────────────────────────────────────────────────────── Room
  private buildRoom() {
    // Wooden floor.
    const floor = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x3a2614, roughness: 0.9, metalness: 0.05 }),
    );
    floor.position.y = -0.1;
    this.scene.add(floor);

    // Walls (back/left/right) — a single dark wallpaper shade so the room
    // reads as a small chamber even with the camera moving.
    const wallMat = new THREE.MeshStandardMaterial({ color: 0x2a1c12, roughness: 0.95 });
    const back = new THREE.Mesh(new THREE.BoxGeometry(8, 4, 0.2), wallMat);
    back.position.set(0, 2, -4);
    this.scene.add(back);
    const left = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    left.position.set(-4, 2, 0);
    this.scene.add(left);
    const right = new THREE.Mesh(new THREE.BoxGeometry(0.2, 4, 8), wallMat);
    right.position.set(4, 2, 0);
    this.scene.add(right);

    // Ceiling.
    const ceil = new THREE.Mesh(
      new THREE.BoxGeometry(8, 0.2, 8),
      new THREE.MeshStandardMaterial({ color: 0x1a120c, roughness: 0.95 }),
    );
    ceil.position.y = 4;
    this.scene.add(ceil);
  }

  // ──────────────────────────────────────────────────────────── Table
  private buildTable() {
    this.table = new THREE.Group();
    // Top.
    const top = new THREE.Mesh(
      new THREE.BoxGeometry(1.1, 0.05, 0.6),
      new THREE.MeshStandardMaterial({ color: 0x2a1810, roughness: 0.85 }),
    );
    top.position.y = 0.55;
    this.table.add(top);
    // Four legs.
    const legMat = new THREE.MeshStandardMaterial({ color: 0x181008, roughness: 0.9 });
    const legGeo = new THREE.BoxGeometry(0.05, 0.55, 0.05);
    for (const x of [-0.5, 0.5]) {
      for (const z of [-0.27, 0.27]) {
        const leg = new THREE.Mesh(legGeo, legMat);
        leg.position.set(x, 0.275, z);
        this.table.add(leg);
      }
    }
    this.table.position.set(-1.55, 0, 0.1);
    this.scene.add(this.table);
  }

  // ──────────────────────────────────────────────────────────── Box
  private buildBox() {
    this.box = new THREE.Group();
    // VHS cassette tape (replaces the cardboard-box concept). Real-world
    // 18 × 10 × 2.4 cm, modeled slightly oversized (0.20 × 0.024 × 0.11)
    // so it reads as a tape from the wide-shot camera at distance ~2.8 m
    // with the 60° FOV, not as a coin. Held horizontally (long axis
    // parallel to character facing) so the VCR slot below the screen can
    // accept it.
    const plasticMat = new THREE.MeshStandardMaterial({
      color: 0x16161a,
      roughness: 0.65,
      metalness: 0.05,
    });
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(0.20, 0.024, 0.11),
      plasticMat,
    );
    this.box.add(body);

    // White sticker label on top — gives a recognizable "borrowed VHS"
    // silhouette without a texture. Wide-stroke scrawl cuts across it so
    // it reads as a hand-written title.
    const labelMat = new THREE.MeshStandardMaterial({ color: 0xeaddb2, roughness: 0.95 });
    const label = new THREE.Mesh(
      new THREE.BoxGeometry(0.13, 0.005, 0.075),
      labelMat,
    );
    label.position.y = 0.0145;
    this.box.add(label);
    const scrawl = new THREE.Mesh(
      new THREE.BoxGeometry(0.075, 0.006, 0.014),
      new THREE.MeshStandardMaterial({ color: 0x222018, roughness: 0.9 }),
    );
    scrawl.position.set(0.015, 0.0155, -0.005);
    this.box.add(scrawl);

    // Two reel holes visible from the +Z face (the side that faces the
    // camera when the character holds the tape in front of their chest).
    const reelMat = new THREE.MeshStandardMaterial({ color: 0x080808, roughness: 0.4, metalness: 0.1 });
    const reelGeo = new THREE.CylinderGeometry(0.024, 0.024, 0.006, 18);
    const reelL = new THREE.Mesh(reelGeo, reelMat);
    reelL.rotation.x = Math.PI / 2;
    reelL.position.set(-0.05, 0, 0.012);
    this.box.add(reelL);
    const reelR = reelL.clone();
    reelR.position.x = 0.05;
    this.box.add(reelR);

    // Finger-grip notch on the bottom face — silhouette detail only.
    const notch = new THREE.Mesh(
      new THREE.BoxGeometry(0.06, 0.005, 0.018),
      new THREE.MeshStandardMaterial({ color: 0x050505, roughness: 0.9 }),
    );
    notch.position.set(0.0, -0.0145, 0.045);
    this.box.add(notch);

    // Initial placement: lying flat on the table at y=0.5875 (table top
    // 0.575 + half-h 0.012). Slight π/7 yaw gives the "drafted tape
    // left behind" reading.
    this.box.position.set(-1.55, 0.5875, 0.1);
    this.box.rotation.y = Math.PI / 7;
    this.scene.add(this.box);
  }

  // ──────────────────────────────────────────────────────────── TV cabinet + screen
  private buildTV() {
    const tv = new THREE.Group();
    // Wooden cabinet body (housing).
    const cabinet = new THREE.Mesh(
      new THREE.BoxGeometry(1.45, 1.50, 1.30),
      new THREE.MeshStandardMaterial({ color: 0x251710, roughness: 0.85 }),
    );
    cabinet.position.y = 0.75;
    tv.add(cabinet);
    // Bezel (slightly darker, behind the screen plate).
    const bezel = new THREE.Mesh(
      new THREE.PlaneGeometry(1.35, 1.18),
      new THREE.MeshStandardMaterial({ color: 0x100a06, roughness: 0.7 }),
    );
    bezel.position.set(0, 0.95, -0.652);
    tv.add(bezel);

    // Seed an initial 96×80 grayscale noise canvas. update() rewrites the
    // pixel array every ~80 ms so even before the chromatic reactor at t=6
    // the screen reads as a live CRT displaying analog noise rather than a
    // solid dark plate. The texture is also flipped DoubleSide below so it
    // renders from BOTH the wide-shot camera (south of the cabinet) AND the
    // dive camera (approaching from the +Z side) — see comment on
    // this.tvScreen below.
    const staticCanvas = document.createElement("canvas");
    staticCanvas.width = 96;
    staticCanvas.height = 80;
    const staticCtx = staticCanvas.getContext("2d")!;
    const staticImg = staticCtx.createImageData(96, 80);
    for (let i = 0; i < staticImg.data.length; i += 4) {
      const v = 90 + Math.random() * 90;
      staticImg.data[i] = v;
      staticImg.data[i + 1] = v;
      staticImg.data[i + 2] = v;
      staticImg.data[i + 3] = 255;
    }
    staticCtx.putImageData(staticImg, 0, 0);
    const staticTex = new THREE.CanvasTexture(staticCanvas);
    staticTex.magFilter = THREE.NearestFilter;
    staticTex.minFilter = THREE.NearestFilter;
    staticTex.colorSpace = THREE.SRGBColorSpace;
    this.staticCtx = staticCtx;
    this.staticImg = staticImg;
    this.staticTex = staticTex;
    this.lastStaticUpdate = -1;

    // Screen plate. DoubleSide because PlaneGeometry's default single-sided
    // material makes the screen invisible from the back — i.e. the wide
    // shot camera at world z=−3.7 sits south of the cabinet and would
    // otherwise see a culled back-face. DoubleSide is essentially free
    // for one plane and the only safe choice given that the cabinet
    // bounding volume is reached from both sides during the cinematic.
    this.tvScreen = new THREE.Mesh(
      new THREE.PlaneGeometry(1.18, 1.00),
      new THREE.MeshBasicMaterial({
        map: staticTex,
        color: 0xffffff, // tint is driven by update(); start neutral white.
        side: THREE.DoubleSide,
      }),
    );
    this.tvScreen.position.set(0, 0.95, -0.651);
    tv.add(this.tvScreen);

    // Two dials / knobs on the right side (tiny details so the cabinet
    // reads as a TV rather than a generic box).
    const dialMat = new THREE.MeshStandardMaterial({ color: 0x8a7050, roughness: 0.6, metalness: 0.4 });
    const dialGeo = new THREE.CylinderGeometry(0.04, 0.04, 0.05, 12);
    const dial1 = new THREE.Mesh(dialGeo, dialMat);
    dial1.rotation.x = Math.PI / 2;
    dial1.position.set(0.55, 0.55, -0.66);
    tv.add(dial1);
    const dial2 = new THREE.Mesh(dialGeo, dialMat);
    dial2.rotation.x = Math.PI / 2;
    dial2.position.set(0.55, 0.95, -0.66);
    tv.add(dial2);

    // VCR cassette slot — recessed dark plate on the front face of the
    // cabinet, below the screen (local y=0.42 vs screen at local y=0.95).
    // Centered horizontally and pushed slightly forward of the cabinet
    // front so it reads as a slot opening, not a stripe. The character
    // walks toward it during the cinematic and inserts the VHS tape.
    this.vcrSlot = new THREE.Mesh(
      new THREE.BoxGeometry(0.24, 0.035, 0.025),
      new THREE.MeshStandardMaterial({ color: 0x050403, roughness: 0.85 }),
    );
    this.vcrSlot.position.set(0, 0.42, 0.65); // local; world ≈ (1.55, 0.42, −2.30) — flush w/ cabinet front
    tv.add(this.vcrSlot);
    // Thin metallic lip framing the slot — reads as a bezel around the
    // opening without z-fighting the slot itself.
    const slotLip = new THREE.Mesh(
      new THREE.PlaneGeometry(0.27, 0.06),
      new THREE.MeshStandardMaterial({ color: 0x2a2118, roughness: 0.6, metalness: 0.3 }),
    );
    slotLip.position.set(0, 0.42, 0.664);
    tv.add(slotLip);

    tv.position.set(1.55, 0, -2.95);
    this.scene.add(tv);
  }

  // ──────────────────────────────────────────────────────────── Character (silhouette)
  private buildCharacter() {
    this.character = new THREE.Group();
    // Fabric color nudged 0x100c08 → 0x1c1410 (still dark, but slightly
    // raised) so the silhouette reads against the brighter ambient.
    // Pants nudged 0x080604 → 0x100c08 for the same reason; the legs remain
    // visually distinct from the torso but no longer crushed to black.
    const fabric = new THREE.MeshStandardMaterial({ color: 0x1c1410, roughness: 0.95 });
    const pants = new THREE.MeshStandardMaterial({ color: 0x100c08, roughness: 0.95 });

    // Torso / hoodie.
    const torso = new THREE.Mesh(new THREE.BoxGeometry(0.46, 0.70, 0.24), fabric);
    torso.position.y = 1.05;
    this.character.add(torso);
    // Hood bump on top of shoulders.
    const hood = new THREE.Mesh(new THREE.SphereGeometry(0.20, 12, 8), fabric);
    hood.position.set(0, 1.32, 0);
    hood.scale.set(1.05, 0.85, 1.05);
    this.character.add(hood);
    // Head (slightly forward of hood).
    const head = new THREE.Mesh(new THREE.SphereGeometry(0.13, 12, 10), fabric);
    head.position.set(0, 1.55, 0.02);
    this.character.add(head);

    // Arms (slightly angled forward to give the silhouette some volume).
    const armGeo = new THREE.BoxGeometry(0.10, 0.62, 0.11);
    const leftArm = new THREE.Mesh(armGeo, fabric);
    leftArm.position.set(-0.30, 1.04, 0);
    leftArm.rotation.z = -0.05;
    this.character.add(leftArm);
    const rightArm = new THREE.Mesh(armGeo, fabric);
    rightArm.position.set(0.30, 1.04, 0);
    rightArm.rotation.z = 0.05;
    this.character.add(rightArm);

    // Legs.
    const legGeo = new THREE.BoxGeometry(0.13, 0.78, 0.14);
    const leftLeg = new THREE.Mesh(legGeo, pants);
    leftLeg.position.set(-0.10, 0.39, 0);
    this.character.add(leftLeg);
    const rightLeg = new THREE.Mesh(legGeo, pants);
    rightLeg.position.set(0.10, 0.39, 0);
    this.character.add(rightLeg);

    // Start at the center of the room, slightly behind the camera's start
    // position so it reads as "behind the TV operator".
    this.characterPos.set(0.05, 0, -1.5);
    this.character.position.copy(this.characterPos);
    // Rotate the whole group to face the TV initially (camera-side view).
    this.character.rotation.y = -Math.PI / 6;
    this.scene.add(this.character);
  }

  // ──────────────────────────────────────────────────────────── Update (animation driver)
  update(dt: number) {
    if (this.time >= IntroScene.INTRO_DURATION_S) {
      this.finished = true;
      return;
    }
    this.time += dt;

    // TV static — refresh the noise canvas every ~80 ms. Runs every frame
    // (regardless of which phase branch is active below) so the screen
    // reads as live analog noise even before the chromatic reactor at t=6.
    if (this.lastStaticUpdate < 0 || this.time - this.lastStaticUpdate > 0.08) {
      this.lastStaticUpdate = this.time;
      const d = this.staticImg.data;
      for (let i = 0; i < d.length; i += 4) {
        const v = Math.random() * 255;
        d[i] = v;
        d[i + 1] = v;
        d[i + 2] = v;
        d[i + 3] = 255;
      }
      this.staticCtx.putImageData(this.staticImg, 0, 0);
      this.staticTex.needsUpdate = true;
    }

    // Pre-flash TV content gating — staged across the cinematic:
    //   t < 6           → dreamy gray-blue flicker on the procedural noise
    //                      (CRT on, no signal — warm "waiting" reading)
    //   6 ≤ t < 7       → static burst (the tape is in the VCR — strong
    //                      "no signal" reading; pre-LOAD snow)
    //   t ≥ 7           → swap to the loaded BEDROOM-3.png frame (the
    //                      "Level 1 Backrooms" tape plays); chrome tint
    //                      drops to neutral white so the photo colors are
    //                      faithful. If `levelTexture` hasn't loaded yet
    //                      (slow first-render mount), we stay on the
    //                      static burst as a graceful fallback.
    const mat = this.tvScreen.material as THREE.MeshBasicMaterial;
    if (this.time < 6.0) {
      const dreamyFlick = Math.sin(this.time * 5.5) * 0.04 + Math.sin(this.time * 13) * 0.025;
      const base = 0.42 + dreamyFlick;
      mat.color.setRGB(base, base + 0.04, base + 0.08);
      this.tvGlow.intensity = 2.4 + dreamyFlick * 4.0;
    } else if (this.time < 7.0) {
      // Static burst: vivid high-frequency flicker that biases toward
      // bright white-blue, no magenta. The procedural noise map carries
      // the texture — the color tint just cranks brightness + flicker.
      const flicker = 0.5 + 0.5 * Math.sin(this.time * 28.0);
      mat.color.setRGB(0.78 + flicker * 0.18, 0.82 + flicker * 0.12, 0.85 + flicker * 0.10);
      this.tvGlow.intensity = 4.0 + flicker * 0.6;
    } else if (this.levelTexture && !this.tvLevelSwapDone) {
      // Post-insert reveal: swap to the Level 1 photo exactly once.
      // Pure white tint so the photo isn't graded.
      this.tvLevelSwapDone = true;
      mat.map = this.levelTexture;
      mat.color.setRGB(1, 1, 1);
      this.tvGlow.intensity = 4.0;
    } else if (this.time >= 7.0) {
      // Photo still on screen during dive — keep tint neutral white
      // (the static map is no longer referenced after the swap above).
      mat.color.setRGB(1, 1, 1);
      this.tvGlow.intensity = 4.0;
    }

    // Reusable easing helpers — ease-out cubic for movements, ease-in for
    // the camera dive, sine for bob/chromatic flicker.
    const clampT = (lo: number, hi: number, v: number) => Math.max(lo, Math.min(hi, v));
    const easeOut = (t: number) => 1 - Math.pow(1 - t, 3);
    const easeIn = (t: number) => t * t * t;

    // Walk segments — slow, deliberate, two-step. Each segment is 2 s long.
    // Step 1 (2 → 4 s): walk from center to table.
    // Step 2 (4 → 6 s): walk from table to TV.
    const TABLE_X = -1.55, TABLE_Z = 0.10;
    const TV_X = 1.55, TV_Z = -2.0;
    // Box lifted to chest height when held; raised 0.92 → 1.05 so the
    // bigger box (half-h 0.18) sits centered on the torso without
    // clipping through the legs.
    const CARRY_OFFSET_Y = 1.05;

    if (this.time >= 2.0 && this.time <= 4.0) {
      const k = (this.time - 2.0) / 2.0;
      this.characterPos.x = 0.05 + (TABLE_X - 0.05) * easeOut(k);
      this.characterPos.z = -1.5 + (TABLE_Z - -1.5) * easeOut(k);
      // Face the table as the character approaches it.
      this.character.rotation.y = -Math.PI / 2;
      // Pick up the box around t=3.3 s — it lifts from the table to
      // a position offset against the character's chest.
      if (this.time > 3.2) {
        const pk = clampT(0, 1, (this.time - 3.2) / 0.5);
        // VHS resting y on table is 0.5875 (half-h 0.012 + table top
        // y=0.575). Lerp from there to chest carry height (1.05) over
        // 0.5 s without dipping into the table.
        this.box.position.set(
          this.characterPos.x + 0.05,
          0.5875 + (CARRY_OFFSET_Y - 0.5875) * easeOut(pk),
          this.characterPos.z + 0.05,
        );
        this.box.rotation.set(0, Math.PI / 7, 0);
      }
    } else if (this.time >= 4.0 && this.time <= 6.0) {
      const k = (this.time - 4.0) / 2.0;
      this.characterPos.x = TABLE_X + (TV_X + 0.0 - TABLE_X) * easeOut(k);
      this.characterPos.z = TABLE_Z + (TV_Z - TABLE_Z) * easeOut(k);
      this.character.rotation.y = Math.PI / 2;
      // Box follows character (carried).
      this.box.position.set(
        this.characterPos.x + 0.0,
        CARRY_OFFSET_Y + Math.sin(this.time * 5.0) * 0.015,
        this.characterPos.z + 0.30,
      );
    } else if (this.time >= 6.0 && this.time <= 7.0) {
      // VHS insert choreography, replacing the old "place box on screen"
      // branch. Two sub-phases:
      //   6.0 – 6.4: approach — tape lerps x/z toward the VCR slot
      //     entrance while character takes final position.
      //   6.4 – 7.0: insert — tape slides forward (z increases) and
      //     downward (y decreases to the slot's midpoint 0.42) easing
      //     INTO the slot. At ik ≥ 0.85 the tape becomes invisible so it
      //     doesn't appear floating inside the cabinet solid.
      // The post-insert content staging at the top of update() handles the
      //      TV screen content (static burst → BEDROOM photo swap).
      this.characterPos.set(TV_X - 0.5, 0, TV_Z + 0.6);
      this.character.rotation.y = Math.PI / 3;
      if (this.time < 6.4) {
        // Approach: tape glides from carried position toward slot center.
        const ak = easeOut(clampT(0, 1, (this.time - 6.0) / 0.4));
        const tx = this.characterPos.x + (TV_X - this.characterPos.x) * ak;
        const tz = this.characterPos.z + (-1.95 - this.characterPos.z) * ak;
        this.box.position.set(tx + 0.05, CARRY_OFFSET_Y, tz);
        this.box.rotation.set(0, 0, 0);
        this.box.visible = true;
      } else {
        // Insert: slide into the slot cavity at z=-2.32. easeIn gives the
        // "final push" feeling — the tape accelerates as it disappears.
        const ik = clampT(0, 1, (this.time - 6.4) / 0.6);
        const e = easeIn(ik);
        this.box.position.set(
          TV_X + 0.0,
          CARRY_OFFSET_Y + (0.42 - CARRY_OFFSET_Y) * e,
          -1.95 + (-2.32 - -1.95) * e,
        );
        this.box.rotation.set(0, 0, 0);
        if (ik >= 0.85) this.box.visible = false;
      }
      // Character fades just before the swap so the silhouette isn't
      // standing there staring at the camera during the dive.
      if (this.time > 6.85) this.character.visible = false;
    }

    // Apply the position (only the "outside `if`"-style update would race;
    // branches above are exclusive).
    this.character.position.copy(this.characterPos);

    // Walking bob — gentle vertical sine, scaled by whether the character
    // is moving (steps 1+2). Visual step syncopated onto ~0.5 s period.
    const walking = (this.time >= 2.0 && this.time <= 6.0);
    if (walking) {
      // Amplitude bumped 0.04 → 0.06 so the bob is visible against the
      // wider-FOV camera (60° → character frames smaller). Period stays
      // at ~0.7s so it reads as a slow carpet-step cadence.
      this.character.position.y = Math.sin(this.time * 9.0) * 0.06;
    } else {
      this.character.position.y = 0;
    }

    // Camera choreography: 0-2 s wide shot holds, 2-6 s drift toward the
    // action (no aggressive cuts), 6-8 s gentle dilation, 8-9 s HARD dive
    // into the TV screen with FOV widening.
    //
    // FOV bumped 50° → 60° during the establishing + drift phases so the
    // 8m-wide bedroom reads as a real room, not a corridor; the dive phase
    // widens 68° → 105° for the "going through a portal" walloping distortion.
    if (this.time < 2.0) {
      // Wide establishing shot — pulled back to z=−3.7 and slightly higher
      // (y=1.8) so the table, character, and TV all fit in frame with the
      // wider 60° FOV. lookAt targets the character's chest at z=−1.0
      // (slightly to the left of center so the brighter TV cabinet reads
      // on the right side of the frame).
      this.camera.position.set(0.0, 1.8, -3.7);
      this.camera.lookAt(0.0, 1.0, -1.0);
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
    } else if (this.time >= 2.0 && this.time < 6.0) {
      // Slow drift — focus follows the action. Camera slides left as the
      // character approaches the table (2-4 s), then reverses to right and
      // forward as they walk to the TV (4-6 s).
      const k = (this.time - 2.0) / 4.0;
      const camX = 0.0 + (-0.4 - 0.0) * easeOut(k);
      const camY = 1.8 + (1.55 - 1.8) * easeOut(k);
      const camZ = -3.7 + (-2.9 - -3.7) * easeOut(k);
      this.camera.position.set(camX, camY, camZ);
      const lookX = this.time < 4.0
        ? 0.0 + (-1.0 - 0.0) * easeOut((this.time - 2.0) / 2.0)
        : -1.0 + (1.0 - -1.0) * easeOut((this.time - 4.0) / 2.0);
      const lookY = 1.0 + (0.95 - 1.0) * easeOut((this.time - 2.0) / 4.0);
      const lookZ = this.time < 4.0
        ? -1.0 + (0.0 - -1.0) * easeOut((this.time - 2.0) / 2.0)
        : 0.0 + (-2.5 - 0.0) * easeOut((this.time - 4.0) / 2.0);
      this.camera.lookAt(lookX, lookY, lookZ);
      this.camera.fov = 60;
      this.camera.updateProjectionMatrix();
    } else if (this.time >= 6.0 && this.time < 8.0) {
      // Pull closer to the TV as the reactor flashes.
      const k = (this.time - 6.0) / 2.0;
      this.camera.position.set(
        -0.4 + (1.05 - -0.4) * easeOut(k),
        1.55 + (1.30 - 1.55) * easeOut(k),
        -2.9 + (-2.55 - -2.9) * easeOut(k),
      );
      this.camera.lookAt(1.55, 0.95, -3.0);
      this.camera.fov = 60 + 8 * easeOut(k); // 60 → 68
      this.camera.updateProjectionMatrix();
    } else {
      // Hard dive: 8 → 9 s. Position interpolates from a side angle into
      // the TV screen plane; FOV widens aggressively.
      const k = clampT(0, 1, (this.time - 8.0) / 1.0);
      const e = easeIn(k);
      this.camera.position.set(
        1.05 + (1.55 - 1.05) * e,
        1.30 + (0.95 - 1.30) * e,
        -2.55 + (-2.0 - -2.55) * e,
      );
      this.camera.lookAt(1.55, 0.95, -3.4);
      // FOV widens 68° → 105° over the dive — produces the "going through
      // a portal" walloping distortion that's tunably disorienting.
      this.camera.fov = 68 + 37 * e;
      this.camera.updateProjectionMatrix();
    }
  }

  render(renderer: THREE.WebGLRenderer) {
    renderer.setRenderTarget(null);
    renderer.render(this.scene, this.camera);
  }

  resize(_width: number, _height: number) {
    // Width/height are intentionally unused — kept as part of the
    // public signature so BackroomsGame.onResize can call into this
    // scene without branching on whether a resize handler is present.
    this.camera.aspect = _width / _height;
    this.camera.updateProjectionMatrix();
  }

  dispose() {
    // Texture resources aren't Mesh descendants — dispose them explicitly
    // before the scene traverse tears down the meshes that reference them.
    this.levelTexture?.dispose();
    this.staticTex.dispose();
    // Walk the scene tree and dispose any geometry/material we own. Any
    // shared geometry/material between meshes is intentionally NOT shared
    // here (each mesh has its own), so this is safe to do all at once.
    this.scene.traverse((obj) => {
      if (obj instanceof THREE.Mesh) {
        obj.geometry.dispose();
        const m = obj.material;
        if (Array.isArray(m)) m.forEach((mm) => mm.dispose());
        else m.dispose();
      }
    });
  }
}
