## 1. Scaffolding

- [x] 1.1 Create the single HTML file at the repository root with `<!DOCTYPE html>`, `<head>` (title, `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no">`), and a `<body>` containing one `<canvas id="game" width="400" height="700">`. No external `<link>`, `<script src>`, `<img>`, or audio elements.
- [x] 1.2 Add inline CSS that centers the canvas, sets the page background to a dark space color, prevents scrolling (`overflow: hidden`), and sets `touch-action: none` and `user-select: none` on the canvas/container.
- [x] 1.3 Implement canvas display scaling that fits the 400×700 canvas to the viewport while preserving the 4:7 aspect ratio (letterboxed/centered) on both narrow mobile and wider desktop viewports.
- [x] 1.4 Implement the main loop skeleton using `requestAnimationFrame` with a delta-time accumulator; expose separate `update(dt)` and `render()` entry points so motion is frame-rate independent.
- [x] 1.5 Implement a minimal game-state machine (`START`, `PLAYING`, `GAME_OVER`) with `setState()` and stub update/render branches for each state.

## 2. Core gameplay — player, movement, firing

- [x] 2.1 Implement the player entity (position, velocity, target velocity, width/height, alive flag, lives, invulnerability timer) initialized at the bottom-center of the 400×700 area.
- [x] 2.2 Implement player movement using acceleration toward a target velocity with easing/decay; clamp the ship within the canvas bounds at all times.
- [x] 2.3 Render the player ship as a sleek animated blue ship using canvas primitives with neon glow (glowing outlines/gradient) and a subtle engine-flicker animation frame.
- [x] 2.4 Wire keyboard input (Left/Right/Up/Down or A/D/W/S sets target velocity; Space sets a fire-input flag) into the player; ignore input outside the `PLAYING` state.
- [x] 2.5 Wire touch input (touchstart/touchmove updates a target X the ship eases toward; tap sets the fire-input flag) into the player; prevent default touch behavior.
- [x] 2.6 Implement player auto-fire: while `PLAYING` and alive, emit a player projectile upward from the ship at a steady cadence using a fire-cooldown timer.
- [x] 2.7 Implement manual fire on Space/tap layered on top of auto-fire (resets/augments the cadence; does not block auto-fire).
- [x] 2.8 Implement the player projectile entity (upward velocity, active flag) and render it as a distinct neon laser; remove projectiles once they pass fully off the top edge.

## 3. Enemies, enemy projectiles, collisions

- [x] 3.1 Implement an enemy entity (position, velocity, health, maxHealth, movement pattern id, type flag for tougher enemies, active flag) entering from above the canvas.
- [x] 3.2 Implement a spawn/wave system that emits enemies in formations from above with a per-level spawn budget and timing.
- [x] 3.3 Implement at least three enemy movement patterns (e.g. straight descent, sine weave, diagonal sweep) selectable per enemy; ensure varied patterns are observable across a level.
- [x] 3.4 Implement a tougher enemy type that is visually distinct and has more `maxHealth` than standard enemies.
- [x] 3.5 Implement enemy projectiles (downward velocity, active flag, visually distinct from player lasers) and an enemy fire interval; remove enemy projectiles once they pass fully off the bottom edge.
- [x] 3.6 Implement collision detection with tight hitboxes (sized to the visible sprite, not grossly generous) for: player projectile vs enemy, enemy projectile vs player, enemy body vs player.
- [x] 3.7 On player-projectile-vs-enemy hit: consume the projectile, damage the enemy (flash on non-lethal hit), destroy the enemy when health reaches zero.
- [x] 3.8 On enemy-vs-player hit (projectile or body): if the player is not invulnerable, lose a life, start a brief invulnerability window with a blink render, and remove/destroy the colliding enemy projectile/enemy as appropriate. Transition to `GAME_OVER` when lives reach zero.

## 4. Power-ups, scoring, combos, levels

- [x] 4.1 Implement a power-up entity (position, type, active flag) that drops or spawns during play and drifts downward; remove it when it leaves the canvas.
- [x] 4.2 Implement at least three distinct power-up types (e.g. multi-shot, faster fire, shield, extra life), each visually distinguishable, with clearly different observable effects on collection.
- [x] 4.3 Implement power-up collection: when the player overlaps a power-up, remove it and apply its effect (multi-shot changes projectile count; faster fire reduces cadence; shield grants a one-hit absorb; extra life increments lives).
- [x] 4.4 Implement scoring: award points per enemy type on destruction; maintain a running score displayed in the HUD.
- [x] 4.5 Implement a combo system: consecutive kills within a combo window increase a multiplier; the multiplier resets when the window elapses without a kill; display the active combo in the HUD.
- [x] 4.6 Implement lives display in the HUD and confirm the start-life count and lose-a-life/invulnerability behavior from task 3.8 are reflected on screen.
- [x] 4.7 Implement level escalation: define a per-level clear condition; on clear, advance to the next level with increased difficulty (faster, denser, or tougher enemies) and show an observable level transition/label.
- [x] 4.8 Implement the HUD layout (score, lives, level, combo) so it does not overlap the play field badly and remains readable on the 400×700 layout.

## 5. Game feel & effects

- [x] 5.1 Implement laser recoil: each player shot nudges the ship (dip/nudge) and recovers within a fraction of a second without breaking steering control.
- [x] 5.2 Implement projectile trails: render a short fading streak behind each player and enemy projectile in its color.
- [x] 5.3 Implement hit flashes: enemies flash a bright color for a few frames when damaged; the player flashes briefly when hit.
- [x] 5.4 Implement hit-stop: on tougher-enemy destruction and on player hits, freeze world motion for a few frames before resuming; keep it short for standard kills.
- [x] 5.5 Implement screen shake: apply a subtle, fast-decaying canvas offset on player hits and big explosions; keep magnitude small enough not to obstruct play.
- [x] 5.6 Implement knockback: the player receives a small recoverable nudge on hit; explosions push particles/debris outward from the impact point.
- [x] 5.7 Implement layered glowing particle explosions for enemy destruction (multiple particle layers, e.g. bright sparks + soft glow + smoke) and a larger, more dramatic version for the player's final death.
- [x] 5.8 Implement animated power-up pickups (e.g. bob/rotate/pulse while drifting) and a distinct collection animation/flash that differs from enemy explosions.
- [x] 5.9 Implement floating score popups (rise and fade from each kill) and combo-milestone feedback (e.g. multiplier text or "COMBO!" popup) at higher tiers.
- [x] 5.10 Implement a multi-layer parallax starfield background with at least two layers scrolling downward at visibly different speeds, continuous and seam-free.
- [x] 5.11 Apply the neon sci-fi visual style (glowing outlines, additive glow, gradients, dark space background) consistently across the player, enemies, projectiles, power-ups, and HUD using canvas primitives only.
- [x] 5.12 Implement shared lightweight physics helpers (acceleration, easing/decay, velocity-based knockback, decaying shake) used by movement and effects to keep motion responsive; keep them computationally cheap.

## 6. Start / game-over screens & restartable flow

- [x] 6.1 Implement the start screen (neon styled) showing the title and start instructions covering both keyboard ("Press Space to start") and touch ("Tap to start"); render it in the `START` state.
- [x] 6.2 Implement the game-over screen (neon styled) showing the final score and restart instructions covering both keyboard ("Press Space to restart") and touch ("Tap to restart"); render it in the `GAME_OVER` state.
- [x] 6.3 Implement smooth transitions between `START` → `PLAYING` and `PLAYING` → `GAME_OVER` (e.g. fade or animated beat) rather than instant cuts.
- [x] 6.4 Implement start/restart input handling: Space/Enter or a tap on the start screen enters `PLAYING` with initial values; the same input on the game-over screen restarts.
- [x] 6.5 Implement full state reset on restart: clear all enemies, projectiles, power-ups, particles, score, lives, level, and timers to initial values so no leftover entities carry into the new run.

## 7. Polish & performance

- [x] 7.1 Audit and cap active entity/particle counts (and use object pooling where appropriate) so the loop stays visibly smooth during peak play with effects active.
- [x] 7.2 Verify motion is frame-rate independent by spot-testing at varying frame rates (e.g. throttling) and confirming consistent in-game speeds.
- [x] 7.3 Verify the page does not scroll, zoom, or trigger browser gestures on touch during play, and that the canvas scales without distortion across viewport sizes.
- [x] 7.4 Verify no external network requests are made by opening the file with network access disabled and confirming the game still runs.
- [x] 7.5 Manual play-through pass: walk through each requirement scenario in the specs and confirm it is observable in the running game, and that the result feels like a polished arcade showcase.

## 8. Review remediation

- [ ] 8.1 _(Placeholder for fixes arising from review of the implemented game against the specs. To be filled in during the apply/review phase.)_
