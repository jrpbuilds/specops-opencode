## Context

The repository is a greenfield project. This change produces exactly one offline-capable browser artifact, `galaxy-shooter.html`; it has no existing runtime, build system, assets, dependencies, or migration consumers. See `proposal.md` for motivation and the capability specifications for behavioral requirements.

The implementation must keep all gameplay in a 400x700 logical portrait coordinate system while remaining playable through direct-file opening on mobile and desktop. The primary technical constraints are low-GC animation on mid-range mobile hardware, responsive coordinate mapping, and preserving a readable HUD while applying high-impact visual effects.

## Goals / Non-Goals

**Goals:**

- Establish a self-contained Canvas architecture whose update, rendering, input, pooling, and UI responsibilities are explicit within one HTML file.
- Make game-feel effects composable: collision events can consistently drive hit flash, hit-stop, particles, screen shake, score/combo feedback, and knockback without coupling entity code to rendering order.
- Keep the hot update/render path bounded and allocation-free in JavaScript while retaining neon visual depth.

**Non-Goals:**

- A reusable engine, external configuration format, asset pipeline, persistence/high scores, networking, analytics, or accessibility system beyond native keyboard and pointer controls.
- Pixel-identical rendering across GPUs/browsers; procedural gradients and additive blending may vary subtly.
- Audio, multiplayer, procedural level persistence, or enemy patterns beyond those needed by the approved capabilities.

## Decisions

### Architecture and in-file layout

`galaxy-shooter.html` will contain one `<style>` block, a centered viewport wrapper with `<canvas id="game">`, and one inline `<script>`. CSS provides the black letterboxed page, disables browser touch gestures over the game (`touch-action: none`), and positions/scales the viewport. Rendering, including menus and HUD, remains procedural Canvas drawing; no DOM UI assets or external URLs are needed.

The script will be arranged in these logical sections, kept in dependency order:

```js
// === Config ===
// === Math/Util ===
// === Pooling / State ===
// === Input ===
// === Starfield ===
// === Player ===
// === Bullets ===
// === Enemies ===
// === PowerUps ===
// === Particles / Popups ===
// === Effects (shake, hitstop, flash, transitions) ===
// === Levels / Wave Director ===
// === HUD / Screens ===
// === Main Loop ===
// === Boot ===
```

Entities are compact mutable records acquired from prebuilt pools. The `GameState` owns run state (screen, score, lives, level/wave, combo, timers), active entity lists/pool cursors, and effect state; systems receive that state rather than communicating through browser events. The event boundary is explicit: collision/destruction code calls small effect helpers such as `damageEnemy`, `damagePlayer`, `explode`, `addTrauma`, and `addPopup`. This centralizes feedback tuning and lets update logic remain separate from draw logic.

### Tech stack, canvas, and coordinate space

Use browser-standard HTML, CSS, ES JavaScript, Canvas 2D, Pointer Events, `requestAnimationFrame`, and `document.visibilitychange`; there are no libraries or network APIs. This directly satisfies the offline constraint in `game-runtime/spec.md` and avoids a build/runtime dependency.

`LOGICAL_W = 400` and `LOGICAL_H = 700` are the sole gameplay, layout, hitbox, and culling bounds. Coordinates use an origin at top-left and positive Y downward. The player is clamped using its hitbox-aware play rectangle, and all other moving entities are released after a small off-screen margin so effects can exit naturally.

The canvas CSS size stays at 400x700 logical CSS pixels. On resize, a scale `min(innerWidth / 400, innerHeight / 700)` is calculated and applied with a centered CSS `translate(...) scale(...)` transform, producing letterboxing/pillarboxing without distorting gameplay. Its backing store uses `400 * dpr` by `700 * dpr`, where `dpr = min(devicePixelRatio || 1, 2)`; the 2D context is initially scaled by `dpr`, so all draw calls still use logical coordinates. Pointer coordinates are converted by the displayed canvas `getBoundingClientRect()` to `((clientX - rect.left) * 400 / rect.width, (clientY - rect.top) * 700 / rect.height)`. This is more robust than assuming a viewport scale and covers both CSS transforms and HiDPI displays.

Alternatives considered: drawing directly at viewport resolution would spread scale logic through collision/layout; rendering a low-resolution 400x700 backing canvas avoids that complexity but makes high-density displays visibly soft. A DPR-capped backing store preserves the fixed logical simulation and practical mobile fill-rate.

### Loop, pause, and state transitions

One `requestAnimationFrame` loop records the previous timestamp and computes `dt = min((now - previous) / 1000, 1 / 30)`. It uses a direct, accumulator-free update followed by render; movement and timers are expressed in seconds and are therefore refresh-rate independent while keeping the arcade feel stable. No catch-up simulation is performed after a slow frame.

`active` gameplay runs normal simulation. When `hitStopRemaining > 0`, the loop decrements effect timers and updates/renders only particles and visual effects; player, bullets, enemies, power-ups, spawning, and game progression remain frozen for the requested 40–80 ms. This makes the freeze visible without extending particle lifetimes or causing later simulation jumps. Start, pause, and game-over screens update only their ambient/starfield and transition state.

`visibilitychange` and `blur` move an active run to `PAUSE`, canceling fire/drag state; the loop may continue rendering the pause overlay but does not advance gameplay. Resume is explicit. A single transition controller holds `fromScreen`, `toScreen`, elapsed time, and a 250 ms ease-in-out fade-to-black. It commits the target screen/reset only at the opaque midpoint, avoiding exposed partially reset state. Start uses the live demo starfield behind its title.

### Input and player control

Keyboard input is a preallocated key-state map for Arrow/WASD, Space, and a pause key. Movement derives a normalized desired direction from simultaneous keys. Pointer state holds only `activePointerId`, logical start/current coordinates, `isDown`, and `firedThisTap`; `pointerdown` captures the active pointer, maps it to logical coordinates, records the initial shot request, and marks it fired only if the shared weapon cadence accepts it. `pointermove` updates the drag target for that pointer; up/cancel clears it. A held pointer, Space, and normal no-input play all request firing through the same cadence gate, so they cannot produce an extra burst.

Player movement blends desired velocity (keyboard direction or normalized direction toward the active touch target) with acceleration and damping, then adds separately decaying recoil/knockback velocity before hitbox-aware clamping. The ship is layered procedural geometry: neon-blue body and wings, cyan glow/core, and a pulsing engine flame; engine particles follow its thrust. A hit starts a short invulnerability timer and alternating visibility/white flash, while recoil is a small downward impulse per shot.

This hybrid target-velocity model was chosen over pointer teleporting for both control schemes because it fulfills smooth touch following and gives keyboard movement equivalent inertia. It also keeps effect impulses independent from player intent.

### Combat, collision, and feedback

Projectile records carry owner, position, velocity, radius, damage, lifetime, and a fixed 8-sample trail buffer allocated when the pool is built. Player shots render as slim capsules with six to eight faded trailing segments; enemy shots use a contrasting magenta/red capsule. Glow passes use `globalCompositeOperation = 'lighter'`, followed by a normal-composite crisp core. Collision is a bounded per-frame pass using circle-vs-circle for rounded entities and simple AABB where it better fits the projectile; visual glows are deliberately larger than hitboxes for fairness.

Player bullets are tested against eligible enemies, then enemy bullets and enemy bodies against a non-invulnerable player. A laser hit consumes the shot, reduces enemy HP, applies a one-to-two-render-frame white flash, and gives the enemy a short, decaying velocity push. Player damage applies a directionally opposite knockback, invulnerability, hit flash, trauma, and hit-stop; body collision also destroys the enemy. HP reaching zero routes through one destruction routine: recycle the enemy, create its explosion/drop decision, update the combo window and multiplier, add score, and acquire a floating `+N` popup. The combo timer resets after its short no-kill window; score is multiplied by the consecutive-hit multiplier before the popup is made.

### Enemies, waves, and power-ups

The enemy pool supports a pattern discriminator and per-spawn parameters. Straight enemies descend at a configured speed. Sine enemies retain their spawn X and phase, then add a phase-offset sinusoidal X displacement while descending. Dive enemies complete their 300 ms alpha/scale/flash entrance, pause briefly, capture the player's current X, then accelerate/curve toward that snapshot so their trajectory is readable rather than homing continuously. Entrance entities are non-collidable until their tween completes.

The wave director predefines formation descriptors (row, column, V, and cluster) and instantiates their members through the same pool. It maintains a level/wave timer, spawn queue, clear check, and score-derived difficulty tier. Each level's spawn interval decreases and base speed/tough-enemy chance increase with both level and score tier; the next level starts after its queued wave is cleared (with the wave timer providing pacing/fallback progression). A smooth slide-in/out level banner is driven by the director. Every third wave is a mini-boss wave: a large, high-HP pooled enemy with a distinct multi-shot cadence and a guaranteed power-up on destruction. Tough enemies use more HP, larger glow, and faster firing before the mini-boss threshold.

Power-up records are bounded/poolable. Spread and rapid fire are independent timed effects; repeat pickups extend their remaining duration up to a cap rather than create ambiguous concurrent copies. Shield is the defensive third type: it grants one visible cyan aura charge that consumes the next hit without costing a life. Pickups rotate/pulse with type-specific colors/icons, drift downward, expire, and, within a magnet radius, accelerate toward the player. The HUD draws active spread/rapid icons with remaining-duration bars and a shield indicator. Regular drops use a low probability, tougher enemy probability is higher, and mini-boss destruction forces one drop.

### Rendering, effects, and performance

Each frame draws `#04060f`, then the starfield, then the shaken play world, and finally unshaken HUD/screen text. Starfield data is initialized once into three fixed layers: far (small, dim, slow), mid, and near (larger, brighter, faster), with blue/cyan/violet variation. Each star wraps by adding the field height when it crosses the lower bound, preventing seams.

Screen shake is stored as trauma in `[0, 1]`, decays each frame, and yields a small randomized logical X/Y translation. A context `save/translate/restore` encloses only the world draw; HUD and screen overlays render after restoration and therefore remain readable. Effects use a deep-space palette: neon blue/cyan for player, magenta/red for enemies, yellow/green power-ups, and white-hot impacts. Cached radial gradients created at boot provide soft glow, while `lighter` composition is restricted to glow passes rather than applying costly filters each frame.

The particle pool is preallocated to approximately 500 records with a hard active cap. Explosion helpers acquire layered core, mid-glow, and outer-spark particles; engine flames, impacts, and sparse ambient nebula puffs use the same records with different size/color/drag/lifetime presets. Particles have no gravity (or only slight drag) and fade by normalized lifetime. Fixed-cap popup records, star arrays, trail storage, power-up records, and enemy/projectile/particle pools are initialized at boot; expired objects are swapped/released rather than spliced. Hot paths avoid array/object literals, closures, gradients, filters, and string construction per frame.

## Risks / Trade-offs

- [Additive particle and glow passes can overdraw heavily on low-end mobile GPUs] → Cap particles at about 500, keep glow geometry simple, cache radial gradients, cap DPR at 2, and limit `lighter` to effects.
- [CSS-transformed canvas and high-DPI backing stores can misalign touch input] → Map every pointer through the current canvas bounding rectangle into logical coordinates and recalculate sizing on resize/orientation change.
- [Direct delta-time integration can vary slightly on an unusually slow frame] → Clamp `dt` to 1/30 s and avoid catch-up; this trades perfect real-time simulation for predictable play and prevents resume jumps.
- [Always-on auto-fire plus touch tap/hold can create duplicate shots] → Route all firing sources through one cooldown/cadence gate and clear pointer state on pause/visibility loss.
- [Hit-stop, shake, and layered explosions may obscure threats] → Use short capped hit-stop/trauma values, keep HUD outside the shaken transform, and bound glow/particle density.
- [A one-file implementation can become hard to navigate] → Preserve the declared logical section order, small system APIs, and centralized configuration/preset tables rather than introducing external modules that violate the delivery constraint.
