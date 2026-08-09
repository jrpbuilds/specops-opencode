## 1. Project skeleton and rendering setup

- [x] 1.1 Create `galaxy-shooter.html` with the HTML5 doctype, a `<canvas>` element sized 400x700, and an inline `<script>`/`<style>` block. No external assets, scripts, or stylesheets.
- [x] 1.2 Implement responsive CSS scaling that preserves the 400x700 aspect ratio and centers the canvas with letterboxing on mobile and desktop.
- [x] 1.3 Set up the canvas backing store at 400x700 logical pixels and implement an input-mapping helper that converts touch/mouse display coordinates to logical 400x700 coordinates (accounting for CSS scaling).
- [x] 1.4 Verify the file opens and renders an empty canvas with no console errors and no failed network requests (DevTools Network tab clean).

## 2. Game loop and runtime discipline

- [x] 2.1 Implement a `requestAnimationFrame`-driven loop with clamped delta-time so motion is frame-rate independent and recovers cleanly from pauses.
- [x] 2.2 Implement a global pause-on-blur/visibility handler that suspends the loop and shows the pause screen.
- [x] 2.3 Build an object-pool utility for projectiles, particles, and enemies (acquire/release/recycle) and ensure the hot loop allocates no new per-frame objects.
- [x] 2.4 Enforce a global active-particle cap that drops/recycles excess particles instead of allocating new ones.
- [x] 2.5 Verify the loop runs at ~60fps on a mid-range device with no visible stutter when idle (DevTools Performance).

## 3. Parallax starfield background

- [x] 3.1 Implement at least 3 scrolling starfield layers with different speeds, opacities, and star sizes for parallax depth.
- [x] 3.2 Implement seamless vertical wrap so stars never visibly pop or seam at canvas edges.
- [x] 3.3 Verify the starfield scrolls continuously during gameplay and looks layered and deep.

## 4. Player ship and movement

- [x] 4.1 Draw the blue player ship procedurally with an ongoing animation (engine thrust flicker and/or idle bob).
- [x] 4.2 Implement smooth acceleration/easing movement: velocity ramps toward the target and eases to a stop on release, clamped to [0,400]x[0,700].
- [x] 4.3 Implement keyboard input (Arrows and WASD, including diagonal combinations).
- [x] 4.4 Implement touch input: drag to move (ship eases toward touch position) and tap to fire.
- [x] 4.5 Verify the ship cannot leave the canvas and that keyboard and touch both work without conflict.

## 5. Combat: firing, lasers, recoil

- [x] 5.1 Implement auto-fire at the weapon's fire-rate cadence, plus Space/tap firing throttled to the same cadence.
- [x] 5.2 Spawn player lasers from a pool, traveling upward with a fading additive trail.
- [x] 5.3 Apply a brief downward recoil impulse to the ship on each shot, decaying over a few frames.
- [x] 5.4 Verify fire rate is capped (holding Space/tapping cannot exceed cadence) and recoil feels punchy.

## 6. Collision detection

- [x] 6.1 Define per-entity hitboxes (circle or AABB) tighter than visuals where appropriate for fairness.
- [x] 6.2 Check collisions each frame: player lasers vs enemies, enemy projectiles vs player, enemy bodies vs player.
- [x] 6.3 On laser-enemy overlap: consume the laser (unless piercing), apply damage, trigger enemy hit flash.
- [x] 6.4 On enemy-projectile/enemy-body overlap with a non-invulnerable player: lose a life, apply brief invulnerability with blink, apply knockback.
- [x] 6.5 Verify collisions feel accurate (no obvious phantom hits or near-misses that should have hit).

## 7. Enemies: types, patterns, formations

- [x] 7.1 Implement at least 3 movement patterns: straight descent, sine-wave horizontal oscillation, and dive (curve/accelerate toward player x).
- [x] 7.2 Implement a spawn/entrance animation (fade or scale-in) with the enemy becoming fully solid/collidable after it completes.
- [x] 7.3 Implement formation spawning (rows, columns, V-shapes, clusters).
- [x] 7.4 Implement tougher enemy variants with more health and a visually distinct appearance.
- [x] 7.5 Implement enemy projectiles for tougher enemies (visually distinct from player lasers, collide with player).
- [x] 7.6 Verify each movement pattern is visually distinguishable and entrances never pop in abruptly.

## 8. Levels, waves, and mini-bosses

- [x] 8.1 Implement wave/level progression: clearing a level's wave(s) advances to the next level and updates the HUD level.
- [x] 8.2 Escalate spawn rate, enemy speed, and/or enemy toughness per level (perceptible to the player).
- [x] 8.3 Implement a mini-boss that spawns every few waves with substantially more health, larger size, and a distinct attack pattern.
- [x] 8.4 Verify difficulty escalation is perceptible across several levels and mini-bosses feel meaningfully tougher.

## 9. Power-ups

- [x] 9.1 Implement at least 3 power-up types: spread shot (fan projectiles, timed), rapid fire (faster cadence, timed), and shield or extra life (defensive).
- [x] 9.2 Render power-ups with a continuous idle animation (rotation/pulse/glow) and a distinct icon/color per type.
- [x] 9.3 Implement drop behavior: regular enemies have a low drop chance, mini-bosses guarantee at least one drop; drops drift downward and expire after a duration.
- [x] 9.4 Implement pickup collection (overlap with player hitbox), a pickup animation/feedback at the collection point, and removal of the power-up.
- [x] 9.5 Implement timed/stacked effects and an HUD/visible indicator for active effects and remaining duration.
- [x] 9.6 Verify all three power-ups apply and expire correctly and the active-effect indicator is accurate.

## 10. Game-feel effects

- [x] 10.1 Implement a brief hit-stop (few-frame time freeze) on laser-enemy hits, player damage, and enemy destruction.
- [x] 10.2 Implement a visible hit flash on struck enemies and on the damaged player.
- [x] 10.3 Implement knockback on player damage (push away from impact, decays smoothly) and recoil on fire (already in 5.3).
- [x] 10.4 Implement subtle, capped, decaying screen shake on impacts (applied to the play area, not the HUD).
- [x] 10.5 Implement layered glowing particle explosions for enemy destruction and player death, using additive glow and respecting the particle cap.
- [x] 10.6 Implement floating score popups that rise and fade on enemy destruction.
- [x] 10.7 Implement combo feedback for rapid consecutive kills (escalating multiplier or combo text, resets after a pause).
- [x] 10.8 Implement smooth animated transitions between screens (Start, gameplay, Pause, Game Over).
- [x] 10.9 Apply a neon sci-fi visual style (additive glow, dark space background, vibrant colors) consistently across lasers, particles, power-ups, and the player.
- [x] 10.10 Verify effects coordinate (hit-stop + hit flash + knockback + shake fire together) and never make the play area unreadable.

## 11. UI screens

- [x] 11.1 Implement the Start screen (title + start control) as the initial state.
- [x] 11.2 Implement the in-game HUD (score, lives, level), rendered above the play area so it is not displaced by screen shake.
- [x] 11.3 Implement the Pause screen (resume + quit/restart) with smooth transitions in and out.
- [x] 11.4 Implement the Game Over screen (final score + level, restart option) with a smooth transition from gameplay.
- [x] 11.5 Implement restart-to-start and restart-to-gameplay flows that fully reset all game state (score, lives, level, enemies, projectiles, particles, power-ups).
- [x] 11.6 Verify all screens are reachable, restartable, and that no leftover entities survive a restart.

## 12. Performance and final verification

- [x] 12.1 Profile a busy session (many enemies, projectiles, explosions) and confirm ~60fps with no GC-induced jatter spikes.
- [x] 12.2 Confirm the particle cap holds under heavy explosions and projectiles are pooled (no per-frame allocations in the hot loop).
- [x] 12.3 Confirm the file is fully self-contained: open offline, check DevTools Network shows zero requests, and check for zero `<script src>`/`<link href>`/`<img src>` external URLs.
- [x] 12.4 Test on a mobile portrait viewport (touch controls, scaling, aspect ratio) and a desktop landscape viewport (keyboard, letterboxing).
- [x] 12.5 Final playthrough: verify start, gameplay across multiple levels, mini-boss, power-ups, pause/resume, game over, and restart all work as specified.
