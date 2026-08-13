# Design: galaxy-shooter-html-canvas

## Context

Greenfield repository with no existing source. The change delivers one self-contained HTML file (`galaxy-shooter.html` at the repository root) implementing a vertical arcade shooter on a 400×700 logical canvas. See `proposal.md` for motivation and the three capability specs (`core-gameplay`, `game-feel-and-effects`, `input-and-state`) for the authoritative requirements this design implements.

Hard constraints that shape every decision below:

- Exactly one `.html` file; all CSS/JS inline; no external URLs, fonts, images, audio, or libraries; must run from `file://` with no network.
- Canvas-only rendering; vanilla JS; touch + keyboard input.
- 400×700 internal resolution, aspect-preserving scale to viewport.
- Manual play-testing only — no test framework.
- No audio (out of scope per proposal).

## Goals / Non-Goals

**Goals:**

- A single-file architecture that keeps ~1,500 lines of inline JS navigable via strict sectioning and a central tuning object.
- Frame-rate-independent motion (delta time), smooth 60 fps on mid-range mobile with all effects active.
- Concrete, parameterized definitions for every game-feel effect (hit-stop, shake, knockback, explosions, trails, recoil) so the implementer never has to invent numbers.
- Pool-based entity management sized so steady-state play performs zero allocations per frame.
- A unified input layer where keyboard and touch produce the same semantic intents the player entity consumes.

**Non-Goals:**

- No audio system of any kind (proposal excludes it).
- No cross-reload persistence (no `localStorage` high scores); session state lives in memory only.
- No pause menu, settings screen, difficulty select, or additional game states beyond START / PLAYING / GAME_OVER (plus transition overlays).
- No build step, no modules, no second file, no DOM-based UI (HUD is canvas-drawn).
- No engine/physics library; integration is hand-rolled semi-implicit Euler.

## Decisions

### D1 — Single-file layout and script organization

The file is structured as:

1. `<head>`: `<meta charset>`, `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`, `<title>`, one inline `<style>` block.
2. `<body>`: exactly one element, `<canvas id="game">`. No other DOM.
3. One inline classic `<script>` (not `type="module"`) at the end of `<body>`, wrapped in a single IIFE (`(() => { ... })();`) so nothing leaks to `window`.

Inside the IIFE, code is organized into comment-banner sections in this order:

```
// == 1. Config (CFG) ==        // == 7. Spawner / waves ==
// == 2. Math utils ==          // == 8. FX (particles, shake,
// == 3. Canvas & scaling ==    //        hitstop, floating text) ==
// == 4. Input ==               // == 9. Starfield ==
// == 5. Entity pools ==        // == 10. States & screens ==
// == 6. Player ==              // == 11. HUD ==
                               // == 12. update/render + main loop ==
```

All tunables live in one `CFG` object literal at the top (speeds, radii, timers, pool sizes, palette), so balancing never requires hunting through logic.

**Rationale:** the single-file constraint rules out modules/imports; a classic script avoids any `file://` module-loading edge cases on older browsers. Section banners + `CFG` are the cheapest possible navigability aid with zero runtime cost.

**Alternatives considered:** inline ES module (`<script type="module">`) — rejected: no benefit inside one file and theoretical `file://` CORS quirks; multiple `<script>` blocks — rejected: shared scope without modules pollutes `window`.

### D2 — Coordinate and scaling model

- Logical game space is fixed at `W = 400`, `H = 700`. All gameplay math, entity positions, and tuning numbers are in logical units.
- The canvas backing store is sized `400 × dpr` by `700 × dpr` where `dpr = Math.min(window.devicePixelRatio || 1, 2)`. Each frame starts with `ctx.setTransform(dpr, 0, 0, dpr, 0, 0)`, so all drawing code uses logical coordinates and stays crisp on hi-DPI screens.
- CSS fits the canvas to the viewport preserving 4:7: `body` is a flex container centering the canvas; a `resize()` handler computes `scale = min(vw/400, vh/700)` and sets `canvas.style.width/height = 400*scale / 700*scale`. The page background is the same deep-space color as the game, so letterbox bars read as intentional frame, not artifacts. `resize` is bound to `window` `resize` and `orientationchange`.
- CSS also sets `overflow: hidden` on `html,body`, `touch-action: none` and `user-select: none` on the canvas, and `overscroll-behavior: none`.
- Input conversion: `logicalX = (clientX - rect.left) * (400 / rect.width)` (same for Y), using `canvas.getBoundingClientRect()` cached per touch event.

**Rationale:** a fixed logical space keeps all gameplay tuning resolution-independent; the DPR-scaled backing store keeps neon lines crisp on phones; capping DPR at 2 bounds fill-rate cost (3× would rasterize 1200×2100 px, which combined with additive blending is the main low-end GPU risk).

**Alternatives considered:** CSS-only scaling of a fixed 400×700 backing store — rejected: visibly blurry on retina/3× phones, unacceptable for a "polished showcase"; rendering in viewport coordinates with proportional speeds — rejected: all tuning numbers become scale-dependent and collision fairness drifts with screen size.

### D3 — Game loop and timestep

- `requestAnimationFrame` drives the loop. Each frame: `dt = clamp((now - last) / 1000, 0, 0.05)`, then `update(dt)`, then `render()`. Update and render are separate top-level functions (tasks 1.4).
- **Variable dt with clamp**, not a fixed-step accumulator. All physics are semi-implicit Euler (`v += a*dt; x += v*dt`) with rates chosen to be stable at any `dt ≤ 50 ms`, so interpolation machinery is unnecessary. The 50 ms clamp turns sub-20 fps hitches into brief slow-motion instead of teleport jumps, and also neutralizes the huge dt after a background-tab resume.
- **Bullet substepping for tunneling:** player bullets move 560 px/s; at the 50 ms clamp that is a 28 px step against a minimum target diameter of ~24 px — marginal. The bullet update/collision pass therefore runs in `n = clamp(ceil(dt / (1/60)), 1, 3)` substeps of `dt/n`. Everything else integrates once per frame.
- **Hit-stop** is a global `hitstopT` decremented by *real* dt each frame; while `hitstopT > 0`, world updates (entities, particles, spawner) are skipped but `render()` still runs, and the starfield and HUD animations continue at reduced rate. This freezes gameplay motion while keeping the frame alive, per the game-feel spec's "freeze of game-world motion."
- Frame budget target: update + render ≤ 8 ms at 60 fps on a mid-range phone, leaving headroom for browser compositing.

**Alternatives considered:** fixed 60 Hz accumulator with render interpolation — rejected: doubles integration bookkeeping for zero observable gain at these physics speeds; unclamped variable dt — rejected: tab-switch spikes break collision fairness.

### D4 — Entity model and pooling

Entities are plain objects from factory functions, stored in fixed-size arrays with an `active` boolean. `alloc(pool)` linear-scans for the first inactive slot; deactivation is `active = false`. Pools are preallocated once at boot.

| Pool          | Size | Rationale |
|---------------|------|-----------|
| `bullets`     | 64   | Auto-fire ~6.25/s × 3-way spread = ~19/s; at ~1.2 s on-screen lifetime → ~23 live; 64 gives ~2.5× headroom |
| `eBullets`    | 96   | Elites fire every 1.6 s + aimed basic fire from L3; generous cap for bullet-hell moments |
| `enemies`     | 48   | Max group 6 × ~3 groups in flight + stragglers |
| `powerUps`    | 12   | Cap of 2 concurrent on field + spawn margin |
| `particles`   | 512  | Standard explosion ≈ 30–40; 3–4 concurrent explosions + trails + ambient |
| `floatTexts`  | 24   | One per kill + combo popups |

Overflow policy: `particles` is a **ring buffer** (alloc always succeeds, overwriting the oldest particle — visual effects degrade gracefully under load); all other pools **drop the spawn** when full (a no-spawn is invisible to the player; a crash or GC storm is not). No pool ever grows after boot.

Entity field shapes (all numbers except where noted):

- `player`: `x, y, vx, vy, lives, invulnT, shield (bool), fireCd, manualCd, recoilT, flashT, engineT, spreadLv, rapidT, alive, r`
- `enemy`: `x, y, vx, vy, hp, maxHp, type (0=scout, 1=weaver, 2=diver, 3=elite), t (pattern clock), spawnT (0→1 entrance), fireT, flashT, r, score, baseX`
- `bullet`: `x, y, vx, vy, r, dmg`
- `eBullet`: `x, y, vx, vy, r`
- `powerUp`: `x, y, vy, type, t, r`
- `particle`: `x, y, vx, vy, life, maxLife, size, drag, colorIdx, kind (0=spark, 1=ember, 2=smoke, 3=flash, 4=ring)`
- `floatText`: `x, y, vy, life, maxLife, str, size, colorIdx, scale`

**Rationale:** fixed pools with ring/overwrite policies eliminate per-frame allocation in steady state — the primary GC-stutter risk on mobile (risk R2). Ring-buffering particles specifically guarantees explosion effects never silently vanish during peak chaos.

**Alternatives considered:** dynamic arrays with `push`/`splice` — rejected: churn and mid-frame GC on low-end devices; `Set` of live entities — rejected: iteration order and allocation overhead.

### D5 — Input system

One `input` object aggregates both devices into semantic intents:

```
input = {
  left, right, up, down,        // booleans (keyboard)
  fireHeld,                     // Space currently down
  touchActive, touchX, touchY,  // touch state in logical coords
  fireQueued                    // integer count of discrete fire presses/taps
}
```

- **Keyboard:** `keydown`/`keyup` on `window` for `ArrowLeft/Right/Up/Down`, `KeyA/D/W/S`, `Space`, `Enter`. `preventDefault()` on Space and arrows to stop page scroll. `Space` keydown (including OS auto-repeat) increments `fireQueued`.
- **Touch:** `touchstart`/`touchmove`/`touchend`/`touchcancel` on the canvas with `{ passive: false }` + `preventDefault()`. Only the *first* touch point is tracked (multi-touch ignored). A **tap** = `touchend` within 250 ms of `touchstart` and ≤ 12 logical px of movement → increments `fireQueued`. Anything longer/moved becomes a drag (steering only).
- The consumer (`player.update`) reads intents and zeroes `fireQueued` after acting; `setState()` clears all input so stale presses never leak across screens.
- Because the HUD is canvas-drawn (not DOM), touches over the HUD strip naturally steer like any other field touch — satisfying the "Touch does not block on-screen HUD" scenario with zero special-casing.

**Rationale:** auto-fire is always on (core spec), so touch needs no fire button — drag-anywhere steering + tap fire is the least occluding scheme on a 400 px-wide field.

**Alternatives considered:** virtual on-screen buttons/zones — rejected: consumes scarce portrait space and occludes play; relative-drag steering — rejected: the spec's example is "ship follows the touch position," which absolute drag implements directly; a tap-vs-drag threshold (250 ms / 12 px) resolves the one genuine conflict between the two touch intents.

### D6 — Player behavior

- Spawn: `x=200, y=600`, `lives=3`, collision radius `r=12` (tight against a ~28 px visual dart — grazing misses stay fair per the "Fair hitboxes" scenario).
- Movement bounds: `x ∈ [24, 376]`, `y ∈ [380, 664]` (lower ~55% band; vertical movement allowed per the spec's "optionally vertical within a defined lower band").
- **Keyboard model:** target velocity `tv = dir * 320 px/s`; `vx = approach(vx, tvx, 2600 * dt)` while a key is held, `approach(vx, 0, 3000 * dt)` on release — asymmetric accel/decel gives a snappy-but-eased feel (accelerates to full in ~120 ms, stops in ~105 ms).
- **Touch model:** while `touchActive`, target velocity is proportional control: `tvx = clamp((touchX - x) * 12, -360, 360)`, same for Y within the band. The ship eases into the finger position and naturally decelerates on arrival — "follows the touch position with smooth easing" per spec.
- **Firing:** auto cadence `0.16 s` (~6.25 shots/s). Manual fire (Space press / tap): fires immediately and sets `fireCd = max(fireCd, 0.05)` so manual presses layer onto auto-fire without resetting it into stutter; a `manualCd = 0.12 s` caps OS key-repeat rate deterministically across platforms.
- **Recoil:** each shot sets `recoilT = 0.09 s` and adds `+40 px/s` downward velocity (instantly absorbed by the 2600 px/s² accel — max ~2 px displacement, control never broken). Render adds `easeOut(recoilT/0.09) * 4 px` downward offset plus a muzzle flash dot for one frame. Punchy but harmless, per spec.
- **Hit response:** without shield → `lives--`, `invulnT = 2.0 s` (blink at ~8 Hz by skipping render on alternating 60 ms windows), knockback impulse `140 px/s` away from the source plus `80 px/s` downward (velocity add; the strong accel makes it instantly recoverable), `flashT = 0.2 s`, hit-stop 90 ms, shake +0.5. With shield → shield consumed instead, distinct cyan ring-burst effect, short 0.8 s invuln, no life lost.
- **Visual:** sleek blue dart built from 2 layered paths (dark blue gradient body `#0a3a8f → #4db8ff`, cyan neon outline via double-stroke), cockpit dot, twin engine flames that flicker (`size = 6 + 3*sin(engineT*40) + rand(-1,1)`), banking tilt `rotate(vx/320 * 0.1 rad)`. Engine flicker + banking = "animated" without sprite assets.

### D7 — Enemy system

Four types; HP and speed scale with level `L` (speed multiplier `m = min(1 + 0.07*(L-1), 1.8)`):

| Type | HP | r | Score | Pattern |
|------|----|---|-------|---------|
| Scout (0) | 1 + ⌊(L-1)/3⌋ | 12 | 100 | Straight descent 90–130 px/s × m |
| Weaver (1) | 2 + ⌊(L-1)/3⌋ | 13 | 150 | Descent 80×m; `x = baseX + sin(t*3) * 60` |
| Diver (2) | 2 + ⌊(L-1)/3⌋ | 12 | 200 | Descend to y≈140, hover 1.2 s, then dive at the player's x (captured at dive start) at 260×m px/s |
| Elite (3) | 6 + L | 20 | 500 | Slow sine descent 50×m; aimed shot every 1.6 s; visually distinct (larger magenta double-hulled ship) |

Elites are the spec's "tougher enemies": ≥6 HP, ~1.6× size, magenta/red palette vs the standard warm-orange hulls, and on death trigger 120 ms hit-stop, +0.45 shake, and a 35% power-up drop.

**Spawner/waves:** each level has a budget of `8 + 4L` enemies, emitted in groups of `min(3 + ⌊L/2⌋, 6)` every `max(2.4 - 0.12L, 1.4) s` while budget remains. Group archetypes: **row** (even x spread, same y), **V** (staggered x/y), **sine column** (weavers at one x), **diagonal sweep** (scouts entering corner-to-corner), **elite escort** (1 elite + 2 scouts, from L2). Pattern types are assigned per group so ≥3 movement patterns are visible each level (spec scenario). Members spawn 0.12 s apart.

**Entrance animation:** every enemy spawns at `y = -30` with `spawnT = 0→1` over 0.45 s — alpha and scale ease-out from 0.3→1 while sliding into formation; firing disabled until `spawnT ≥ 1`. This is the spec's choreographed entrance (fade + scale + sweep combined).

**Enemy fire:** elites always shoot aimed bolts; from L3, scouts/weavers on screen above the player each roll 20% every 2.2 s to fire one aimed bolt. Enemy bolts: speed 200–240×m px/s, `r=5`, magenta orb — round/warm vs the player's cyan bolt, satisfying the "visually distinct" scenario at a glance.

### D8 — Projectiles and collision

- Player bolt: `vy = -560 px/s` (spread shots rotate ±10°), `r = 4`, `dmg = 1`. Rendered as a 14 px capsule with white core + cyan outer stroke; **trail = a velocity-aligned gradient streak** from `(x, y)` to `(x - vx*0.03, y - vy*0.03)` fading to transparent — zero allocation, reads as motion. Removed when `y < -20`.
- Enemy bolt: `r = 5`, radial-gradient orb + glow ring; trail streak as above (0.025 s factor). Removed when `y > 720` or x outside ±20.
- **Collision:** circle-vs-circle, `dx² + dy² < (r1+r2)²`, checked in the bullet substep loop (D3). Pass order per substep: `bullets × enemies` → consume bullet on hit (no piercing), enemy `hp -= dmg`, `flashT = 0.12 s`; `hp ≤ 0` → kill flow (explosion, score × combo multiplier, drop roll, hit-stop/shake by type, floating score text). Then `eBullets × player` and `enemies × player` (body hits also destroy the enemy with an explosion), then `powerUps × player` (radius 12 + 14).
- Worst-case check count: 64×48 ≈ 3k circle tests per substep — trivial; no spatial partitioning needed.

**Alternatives considered:** AABB — rejected: corners feel unfair on round ships ("Fair hitboxes" scenario); swept/continuous collision — rejected: substepping at ≤ 1/60 slices bounds steps to ~9 px, below the smallest radius sum (16 px), so tunneling cannot occur; pixel-perfect — absurd cost for zero benefit at these sizes.

### D9 — Power-ups

Five types (spec requires ≥3 distinct; the goal lists these explicitly), each with unique hue, icon glyph, and effect:

| Type | Color | Effect |
|------|-------|--------|
| Spread ("S") | green | +2 angled bolts (3-way); re-pickup at max grants +500 pts. Lasts until death ("permanent-while-alive") |
| Rapid ("R") | yellow | fire cadence 0.16 → 0.09 s for 8 s |
| Shield (hex) | cyan | absorbs one hit; persists until consumed |
| Bomb ("B") | white/orange | destroys all on-screen enemies (flat base score, no combo increment, no drops) and clears all enemy bullets; single 140 ms hit-stop |
| 1UP ("+") | pink | +1 life, cap 5 |

- **Spawning:** 12% drop on any enemy kill, 35% on elite kill; hard cap 2 concurrent on field (extra rolls discarded).
- **Behavior:** drift down at 60 px/s with gentle sine sway; continuously animated — slow rotation, vertical bob, and pulsing glow (`0.7 + 0.3*sin(t*6)`) so pickups draw the eye (spec). **Magnet:** within 90 px of the player, accelerate toward the ship at 500 px/s² up to 300 px/s — pickups feel rewarding instead of punishing near-misses. **Expiry:** 9 s lifetime, blinking for the final 2 s, then fade; also removed off the bottom edge.
- **Pickup feedback (distinct from explosions):** an expanding thin ring in the type color + a short upward sparkle column + floating label ("SPREAD!", "SHIELD!", …) + a 0.15 s player-tint flash in the type color. Explosions are radial/fire-hued; pickups are ring+column/type-hued — visually unambiguous per the spec scenario.

### D10 — Levels and difficulty curve

- Level is fully derived from its number `L` (no hand-authored tables): budget `8+4L`, group size `min(3+⌊L/2⌋, 6)`, group interval `max(2.4-0.12L, 1.4) s`, speed multiplier `min(1+0.07(L-1), 1.8)`, elite probability `min(0.05+0.03L, 0.25)` per spawn slot, basic-enemy fire unlocked at L≥3.
- **Clear condition:** spawn budget exhausted **and** zero active enemies → level-clear beat: all remaining enemy bullets fade out, a centered "LEVEL L+1" banner zoom/fades over 1.2 s with a brief additive flash, `+250*L` bonus, then spawning resumes. This is the spec's observable transition.
- **Rationale:** budget-clear (vs timed survival) gives the player agency, guarantees a natural lull for the transition beat, and matches the spec's "spawn budget/pattern" language.
- **Alternatives considered:** timed survival levels — rejected: no satisfying "cleared" moment and contradicts the budget framing; boss every N levels — rejected: scope creep beyond the specs (elite already covers "tougher enemy").

### D11 — Game-feel effect parameters

- **Hit-stop** (world freeze, starfield/HUD continue): standard kill 35 ms, elite kill 120 ms, player hit 90 ms, bomb 140 ms, player final death 300 ms. Multiple requests take `max`, not sum.
- **Screen shake (trauma model):** `trauma ∈ [0,1]`, `trauma = max(0, trauma - 2.2*dt)`; per-frame offset `= trauma² * 12 px` in a smooth pseudo-random direction (`sin`/`cos` of large incommensurate time multiples). Adds: standard kill +0.12, elite +0.45, player hit +0.5, bomb +0.6. Quadratic falloff keeps small shakes truly subtle — the player can always track their ship (spec scenario).
- **Knockback:** player hit impulse 140 px/s away from source + 80 down (instantly recoverable, D6); non-lethal enemy hits nudge the enemy `vy -= 40`; explosion particles always get radial outward velocities (below).
- **Layered explosion** (`spawnExplosion(x, y, scale, hueIdx)`), standard enemy ≈ 30–40 particles in 5 layers:
  1. **Core flash** — 1 additive white circle, r 18→0 over 0.18 s.
  2. **Sparks** — 10–14 particles, 180–300 px/s radial, 1.5–2.5 px, enemy hue, life 0.25–0.45 s, rendered as short velocity-aligned lines.
  3. **Embers** — 8–12 particles, 60–140 px/s, 3–5 px glow sprites, additive, life 0.5–0.9 s, drag `v *= exp(-3*dt)`.
  4. **Smoke** — 4–6 particles, 20–50 px/s, 8→16 px expanding, alpha 0.25, normal composite, dark blue-gray, life 0.8–1.2 s.
  5. **Shockwave ring** — stroke circle r 4→34, alpha 0.8→0, 0.3 s, additive.
  Player final death: counts ×2.5, radii ×1.6, plus 300 ms hit-stop and +0.8 shake — "noticeably larger and more dramatic" per spec.
- **Glow strategy:** three tiers by cost — (1) pre-baked radial-gradient **glow sprites** (six 32×32 offscreen canvases tinted at boot, `drawImage` scaled per particle — cheap); (2) **double-stroke** neon outlines for ships/bolts (wide low-alpha stroke + narrow bright stroke); (3) `shadowBlur` reserved for ≤ ~10 entities/frame (player ship, power-ups, elites). All particles/trails/explosion layers draw in one batched `globalCompositeOperation = 'lighter'` pass per frame, wrapped in save/restore, to minimize state churn.
- **Palette (neon sci-fi):** background `#050512 → #0a0a1e` vertical gradient + two slow-drifting radial nebula blobs (pre-rendered offscreen); player/bolts cyan-blue family (`#4dd8ff`, `#aef`, `#fff` cores); enemies warm (`#ff6644`, `#ffaa22`); elites magenta `#ff33cc`; enemy bolts hot magenta `#ff4da6`; power-ups per D9; HUD cyan `#99ddff`.

### D12 — Starfield

Three layers, continuous downward scroll, running in all states (menus at 0.4× speed for ambience):

| Layer | Count | Speed | Size | Alpha |
|-------|-------|-------|------|-------|
| Far | 70 | 20 px/s | 1 px | 0.5 |
| Mid | 45 | 45 px/s | 1.5 px | 0.75 |
| Near | 25 | 90 px/s | 2 px + 4 px streak | 1.0 |

Stars are precomputed `(x, y, twinklePhase)` arrays; each frame `y = (y + speed*dt) mod 700` — seamless wrap by construction (no visible seams, per spec). Twinkle: `alpha *= 0.7 + 0.3*sin(t*2 + phase)`. Near-layer streaks reinforce downward motion parallax (faster = closer).

### D13 — State machine and transitions

States: `START`, `PLAYING`, `GAME_OVER`, managed by `setState(next)` with a **transition overlay**: 0.3 s fade-to-dark, state swap at the midpoint, 0.3 s fade-in. `START → PLAYING` additionally slides the title up and off during fade-out; `PLAYING → GAME_OVER` first lets the final explosion play in-world for 0.8 s (after its 300 ms hit-stop), then fades. No instant cuts anywhere (spec).

- **START:** pulsing neon "GALAXY SHOOTER" title, subtitle, "Press Space / Tap to Start", a two-line control legend (arrows/WASD + Space; drag + tap), animated starfield, and a slow ambient enemy silhouette drifting across for life. Space/Enter/tap → `resetGame()` → `PLAYING`.
- **GAME_OVER:** "GAME OVER" glow header, final score (counting up over 0.6 s for a small dopamine beat), "Press Space / Tap to Restart". Same input → `resetGame()` → `PLAYING`.
- **`resetGame()`:** every pool `active = false`, `score=0, lives=3, level=1`, combo/timers/shake/hitstop zeroed, player re-initialized. Full clean slate per the restart spec.
- Input is gated by state: movement/fire consumed only in `PLAYING`; start/restart intents only in `START`/`GAME_OVER` — satisfying "Input ignored outside playing state."
- Background tab: covered by the 50 ms dt clamp (D3); no explicit pause state (out of scope).

### D14 — UI / HUD

All HUD is canvas-drawn in logical coordinates (automatically responsive with D2), using system fonts only: headings `bold 26px system-ui, sans-serif`, HUD `bold 16px system-ui, sans-serif`, numbers `monospace`. Text glow via one cheap double-draw (low-alpha offset copy), not `shadowBlur` loops.

Layout (400×700):

- **Top strip (y 8–40):** score left (`000000`, monospace, zero-padded), `LV n` centered, lives right as mini ship icons ×N.
- **Combo:** under the score — `xN COMBO` label plus a 60 px shrink-bar showing window remaining; on each new multiplier tier the label pop-scales 1→1.4→1 over 0.25 s and a centered "COMBO xN!" floating text spawns (combo milestone feedback, spec).
- **Power-up status (bottom-left):** shield dot (cyan, present/absent), rapid-fire countdown bar, spread level pips.
- **Floating score text:** rises 40 px over 0.8 s while fading, spawned at kill position (`+100`, `+500`…).
- Combo model: window 2.5 s refreshed per kill; `multiplier = min(1 + ⌊combo/4⌋, 8)`; kill score = base × multiplier; window expiry resets combo and multiplier to baseline (spec scenarios).
- Overlays (start/game-over): translucent dark rect over the frozen/animating field + glow text; both screens always show keyboard **and** touch instructions (spec scenarios).

### D15 — Performance budget and verification hooks

- Per-frame draw estimate at peak: ~140 star primitives, ~50 entities × 2–3 primitives, ≤ 512 particles (mostly 1 `drawImage` each), ~10 HUD elements — well inside a mid-range mobile GPU budget with DPR ≤ 2.
- **Zero steady-state allocation:** pools preallocated (D4); glow sprites pre-baked (D11); score/HUD strings rebuilt only when values change (cached `scoreStr`); no closures or array literals created inside the frame loop.
- Composite-op batching: one `lighter` pass for all additive draws; `setTransform` once per frame; shake applied as a translate inside the saved world transform.
- Frame-rate independence is exercised by the dt-clamp + substep design (D3); task 7.2's throttling spot-test verifies it.

## Risks / Trade-offs

- [Additive blending + big smoke sprites overdraw low-end mobile GPUs] → DPR capped at 2 (D2), smoke count/size capped (D11), particles ring-buffered so overload degrades visuals instead of frame rate (D4).
- [GC stutter from per-frame allocation] → fixed pools, pre-baked sprites, cached HUD strings (D4/D15); trade-off: code carries pool-boilerplate instead of ergonomic dynamic arrays.
- [`shadowBlur` is notoriously slow on some mobile browsers] → restricted to ≤ ~10 entities/frame; all mass glow via pre-baked sprites and double-strokes (D11).
- [Bullet tunneling below ~30 fps] → dt clamp + bullet substepping (D3); residual risk below 20 fps accepted as graceful slow-motion rather than missed hits.
- [Tap-vs-drag misfires on touch] → 250 ms / 12 px tap threshold (D5); trade-off: a very slow deliberate drag under 12 px still registers as a tap — harmless, since auto-fire is always on anyway.
- [OS key-repeat rate varies, making held-Space fire rate platform-dependent] → manual fire cooldown 0.12 s caps it deterministically (D6).
- [System font metrics differ across platforms] → HUD layout uses anchor-based positioning (left/center/right) with generous gaps, never measured-text widths (D14).
- [Single-file scale (~1,500 lines JS) hurts maintainability] → accepted per constraints; mitigated by section banners and the central `CFG` object (D1).
- [50 ms dt clamp turns deep hitches into slow-motion, which a purist could call "incorrect"] → deliberate: for an arcade showcase, brief slow-motion is strictly better than teleporting entities and unfair deaths (D3).

## Migration Plan

Not applicable — greenfield addition of one new file with no existing code, users, or data. Rollback = delete `galaxy-shooter.html`.

## Open Questions

- Final per-enemy silhouettes and exact palette hex values: visual tuning during implementation within the palette families of D11; no impact on architecture, specs, or tasks.
- In-memory session best-score line on the game-over screen: the proposal permits it only if purely in-memory but does not require it. Adding it later is one variable + one HUD draw call, so it can be decided at polish time without changing this design.
- Touch vertical-follow band edges (`y ∈ [380, 664]`) may want ±20 px adjustment after real-device play-testing; tuning value in `CFG`, not a structural choice.
