## Why

The repository is empty of any game asset. We want a single, self-contained, polished arcade showcase: a vertical Galaxy Shooter built with vanilla HTML5 Canvas that runs by simply opening one `.html` file in a browser. The goal is to demonstrate that a complete, "game-feel"-rich experience can be delivered with no external assets, no libraries, and no build step, optimized for a 400×700 portrait mobile layout while remaining keyboard-playable on desktop.

## What Changes

- Introduce **one** new self-contained HTML file (e.g. `galaxy-shooter.html`) containing all markup, CSS, and JavaScript inline.
- Add a complete vertical shooter game loop: a sleek animated blue player ship with acceleration/easing movement, auto-fire plus manual Space/tap firing, projectiles, enemies with varied formations and movement patterns, occasional tougher enemies, power-ups, escalating levels, score, and lives.
- Add game-feel polish: punchy laser recoil, projectile trails, hit flashes, brief hit-stop, subtle screen shake, knockback, layered glowing particle explosions, animated power-up pickups, floating combo/score feedback, smooth screen transitions, a multi-layer parallax starfield, neon sci-fi glow effects, and enemy spawn/entrance animations.
- Add input + state management: responsive keyboard and touch controls, plus start, playing, and game-over screens with a restartable flow that fits the 400×700 portrait layout and scales to the viewport.
- Require no external assets, no external libraries, no build tooling, and no network calls — the file must run by being opened directly.

## Capabilities

### New Capabilities

- `core-gameplay`: The mechanical game systems — player ship movement and firing, projectiles, enemies and formations with varied movement, tougher enemies, power-up mechanics, collision detection, scoring and combos, lives and player death, level escalation, and the single-file runtime/performance contract.
- `game-feel-and-effects`: The visual and tactile polish — laser recoil, projectile trails, hit flashes, hit-stop, screen shake, knockback, layered glowing particle explosions, animated power-up pickups, combo/score feedback, smooth transitions, multi-layer parallax starfield, neon sci-fi glow, and enemy spawn/entrance animations that make movement and impacts feel responsive.
- `input-and-state`: The interaction and lifecycle layer — responsive keyboard controls, responsive touch controls, start/playing/game-over screens, restartable flow, and responsive layout for the 400×700 portrait canvas scaling to the viewport.

### Modified Capabilities

None — this is a greenfield change; no existing capabilities exist.

## Impact

- **Files added**: a single self-contained HTML file at the repository root (e.g. `galaxy-shooter.html`) and the OpenSpec artifacts for this change.
- **Dependencies**: none. The file must not reference any external URL, CDN, font, image, audio, or script.
- **Compatibility**: must run in a modern browser by opening the file directly (no server required). Must play correctly on both touch devices (portrait mobile) and desktop with keyboard.
- **Testing**: manual play-testing only — no automated test framework is introduced.
- **Out of scope**: no audio/sound assets (the goal does not require audio and external audio assets are disallowed), no high-score persistence across reloads unless expressible purely in-memory, no multiplayer, no server backend, no build tooling, no external libraries, and no separate non-HTML source files.
