## Why

The repository is an empty project with no deliverable. The goal is to produce a single, polished, self-contained `galaxy-shooter.html` — a vertical arcade shooter optimized for a 400x700 portrait mobile layout that delivers punchy game feel (recoil, hit-stop, screen shake, particle explosions, parallax starfield) while running smoothly at 60fps with no external assets, libraries, or network calls. This artifact set establishes the behavioral contract and implementation plan for that deliverable.

## What Changes

- Introduce a single self-contained HTML file (`galaxy-shooter.html`) containing all markup, CSS, and JavaScript inline. No external assets, no libraries, no fetch/network calls.
- Render to an HTML5 Canvas with a fixed 400x700 logical pixel portrait viewport, responsively scaled (preserving aspect ratio) to fit mobile and desktop screens.
- Implement a delta-time game loop targeting 60fps with low-GC patterns (object pooling, capped particle counts) and pause-on-blur.
- Implement an animated blue player ship with smooth acceleration/easing movement, keyboard (Arrows/WASD + Space) and touch (drag + tap) controls, and auto-fire.
- Implement a combat system: player lasers with recoil and trails, enemy projectiles, accurate collision detection, enemy destruction with feedback, player lives with brief invulnerability and knockback.
- Implement enemy variety: at least 3 movement patterns (straight, sine-wave, dive), spawn/entrance animations, formations, and occasional tougher enemies / mini-bosses every few waves.
- Implement escalating levels: spawn rate, enemy speed, and toughness increase per level.
- Implement at least 3 power-up types (spread shot, rapid fire, shield/extra life) with animated pickups dropped by destroyed enemies.
- Implement game-feel effects: multi-layer parallax starfield, subtle screen shake, brief hit-stop, hit flash, knockback, projectile trails, layered glowing particle explosions, combo/score popups, and smooth screen transitions.
- Implement screens: Start, HUD (score/lives/level), Pause, and Game Over — all restartable.

## Capabilities

### New Capabilities

- `game-runtime`: Single self-contained HTML file, 400x700 portrait Canvas with responsive aspect-preserving scaling, delta-time game loop targeting 60fps, low-GC/pooling discipline, pause-on-blur.
- `player-controls`: Animated blue player ship, smooth acceleration/easing movement, keyboard (Arrows/WASD + Space) and touch (drag + tap) input, auto-fire, ship bound to canvas.
- `combat`: Player lasers with recoil and trails, enemy projectiles, accurate collision detection, enemy destruction, player lives with brief invulnerability and knockback, hit-stop and hit flash.
- `enemies-levels`: At least 3 enemy movement patterns (straight, sine-wave, dive), spawn/entrance animations, formations, tougher enemies / mini-bosses every few waves, escalating level difficulty.
- `powerups`: At least 3 power-up types (spread shot, rapid fire, shield/extra life), animated pickups dropped by enemies, timed/stacked effects with pickup feedback.
- `feedback-effects`: Multi-layer parallax starfield, screen shake, hit-stop, hit flash, knockback, projectile trails, layered glowing particle explosions, combo/score popups, smooth screen transitions, neon sci-fi visual style.
- `ui-screens`: Start, HUD (score/lives/level), Pause, and Game Over screens — all restartable, with smooth transitions between them.

### Modified Capabilities

(None — this is a greenfield project with no existing specs.)

## Impact

- **Code**: Creates a single new file `galaxy-shooter.html` at the repository root. No other files are required.
- **Dependencies**: None. No external libraries, assets, fonts, or network resources. Pure HTML/CSS/Canvas/JS, runnable by opening the file in a browser.
- **Systems**: None affected. Browser-only deliverable.
- **Compatibility**: Must run on modern mobile and desktop browsers supporting HTML5 Canvas and requestAnimationFrame; touch input must work on mobile, keyboard on desktop.
- **Performance**: Must target a smooth 60fps with low GC pressure and capped particle counts to remain fluid on mid-range mobile devices.
