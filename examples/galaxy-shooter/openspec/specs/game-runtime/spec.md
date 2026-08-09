# game-runtime Specification

## Purpose
Defines the single self-contained HTML deliverable, the 400x700 portrait Canvas viewport with responsive aspect-preserving scaling, the delta-time game loop targeting 60fps, low-GC/pooling discipline, and pause-on-blur behavior that the rest of the game builds on.
## Requirements
### Requirement: Single self-contained HTML file
The entire game SHALL be delivered as one file named `galaxy-shooter.html` containing all HTML, CSS, and JavaScript inline. The game MUST NOT load any external assets (images, fonts, audio files), any external libraries or scripts, and MUST NOT make any network calls (fetch, XHR, WebSocket, CDN). The game MUST be fully playable by opening the file directly in a browser without a server.

#### Scenario: Offline play
- **WHEN** the user opens `galaxy-shooter.html` directly from the filesystem with no network connection
- **THEN** the game loads and is fully playable
- **AND** no console errors about failed resource loads or blocked requests are emitted

#### Scenario: No external dependencies
- **WHEN** the HTML file is inspected
- **THEN** it contains zero `<script src>`, `<link rel="stylesheet" href>`, or `<img src>` tags pointing to external URLs
- **AND** all rendering is performed procedurally via Canvas drawing APIs

### Requirement: Fixed 400x700 portrait logical canvas
The game SHALL render to an HTML5 Canvas with a fixed logical resolution of 400 pixels wide by 700 pixels tall in portrait orientation. All gameplay, layout, and collision coordinates SHALL be expressed in this logical coordinate space, independent of the displayed size.

#### Scenario: Logical coordinate space
- **WHEN** the game initializes
- **THEN** the canvas backing store and all gameplay logic use a 400x700 logical pixel space
- **AND** the player ship, enemies, projectiles, and effects are positioned and collide within [0,400] x [0,700]

### Requirement: Responsive aspect-preserving scaling
The canvas SHALL be displayed scaled to fit the viewport while preserving the 400x700 aspect ratio (letterboxing/pillarboxing as needed). The scaling MUST NOT distort the gameplay. Input coordinates from touch and mouse MUST be mapped back to the 400x700 logical space.

#### Scenario: Mobile portrait fit
- **WHEN** the game is opened on a portrait mobile viewport narrower than the 400x700 aspect ratio
- **THEN** the canvas is scaled to fit the viewport width with height adjusted to preserve aspect ratio
- **AND** the gameplay appears undistorted and centered

#### Scenario: Desktop fit
- **WHEN** the game is opened on a desktop landscape viewport
- **THEN** the canvas is scaled to fit while preserving the 400x700 aspect ratio
- **AND** letterboxing is applied so the gameplay area is centered and undistorted

#### Scenario: Input mapping under scaling
- **WHEN** a touch or mouse event occurs at a displayed pixel position
- **THEN** the event coordinates are mapped to the corresponding 400x700 logical coordinates
- **AND** gameplay responds as if the event occurred at that logical position

### Requirement: Delta-time game loop targeting 60fps
The game SHALL run a single animation loop driven by `requestAnimationFrame` using delta-time (clamped to avoid spiral-of-death on frame drops) so motion is frame-rate independent and smooth at the target 60fps. The loop MUST update then render each frame and SHALL cap delta-time to prevent large jumps after pauses.

#### Scenario: Frame-rate independent motion
- **WHEN** the display refreshes at 60Hz
- **THEN** gameplay advances at the intended speed
- **AND** when the display refreshes at a different rate (e.g. 120Hz), gameplay advances at the same intended speed via delta-time scaling

#### Scenario: Recovery from frame drop
- **WHEN** a frame takes longer than expected (e.g. background tab returns to focus)
- **THEN** the delta-time is clamped to a maximum value
- **AND** gameplay does not jump forward by an exploitable or jarring amount

### Requirement: Low-GC runtime discipline
The game loop SHALL minimize garbage-collection pressure by reusing objects via pooling for frequently allocated entities (projectiles, particles, enemies) and by capping the maximum number of simultaneously active particles. The game MUST NOT allocate new per-frame objects in hot paths.

#### Scenario: Particle cap
- **WHEN** many explosions occur simultaneously
- **THEN** the total active particle count is capped at a fixed maximum
- **AND** excess particles are dropped or recycled rather than allocated unboundedly

#### Scenario: Projectile reuse
- **WHEN** a projectile expires or collides
- **THEN** it is returned to a pool and reused for subsequent projectiles
- **AND** the hot loop does not allocate new projectile objects per shot

### Requirement: Pause on visibility loss
The game SHALL automatically pause when the page loses visibility (tab hidden or window blurred) and remain paused until the user explicitly resumes, so gameplay does not advance while the player is away.

#### Scenario: Tab hidden
- **WHEN** the browser tab becomes hidden or the window loses focus during active gameplay
- **THEN** the game pauses and shows the pause screen
- **AND** gameplay updates do not advance until the user resumes

