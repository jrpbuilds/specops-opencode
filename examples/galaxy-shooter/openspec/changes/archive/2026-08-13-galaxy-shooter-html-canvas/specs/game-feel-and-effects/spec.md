## Purpose

Defines the visual and tactile polish that makes the Galaxy Shooter feel responsive and satisfying: laser recoil, projectile trails, hit flashes, hit-stop, screen shake, knockback, layered glowing particle explosions, animated power-up pickups, combo/score feedback, smooth transitions, a multi-layer parallax starfield, neon sci-fi glow, and enemy spawn/entrance animations.

## ADDED Requirements

### Requirement: Laser recoil

Each player shot SHALL produce a small, snappy recoil animation on the player ship (e.g. the ship dips or nudges briefly) that recovers quickly so firing feels punchy without harming control.

#### Scenario: Recoil on every shot

- **WHEN** the player fires a projectile
- **THEN** the player ship performs a brief recoil motion and snaps back to its normal pose within a fraction of a second

#### Scenario: Recoil does not break control

- **WHEN** the player fires continuously while steering
- **THEN** the recoil animation does not prevent the player from continuing to steer the ship to its target position

### Requirement: Projectile trails

Player and enemy projectiles SHALL render a short trailing motion behind them so fast shots read as streaks rather than static dots.

#### Scenario: Visible trail behind moving shots

- **WHEN** a projectile is traveling across the canvas
- **THEN** a short fading trail is rendered behind it in the projectile's color, giving a sense of motion

### Requirement: Hit flashes

When a projectile hits an enemy, or an enemy/player is hit, the target SHALL briefly flash (e.g. white or bright color) for a few frames to register the impact.

#### Scenario: Enemy flashes on being hit

- **WHEN** a player projectile damages an enemy that is not yet destroyed
- **THEN** the enemy briefly flashes a bright color over its normal sprite for a few frames

#### Scenario: Player flashes on taking damage

- **WHEN** the player loses a life
- **THEN** the player ship briefly flashes to signal the hit

### Requirement: Hit-stop

On significant impacts (e.g. destroying an enemy, the player taking a hit, or tougher-enemy deaths) the game SHALL apply a brief hit-stop — a very short freeze of game-world motion — to add weight to the impact. The hit-stop SHALL be short enough not to disrupt play feel.

#### Scenario: Brief freeze on enemy destruction

- **WHEN** a tougher enemy is destroyed or the player takes a hit
- **THEN** game-world motion pauses for a few frames before resuming, adding impact weight

#### Scenario: Hit-stop is non-disruptive

- **WHEN** a standard enemy is destroyed
- **THEN** any hit-stop is brief enough that the player perceives a punchy beat, not a stutter or hang

### Requirement: Screen shake

On impactful events (player hit, big explosions, tougher-enemy deaths) the canvas SHALL apply a subtle, short-lived screen shake that decays quickly. The shake SHALL be subtle so it does not cause discomfort or obscure gameplay.

#### Scenario: Shake on player damage

- **WHEN** the player loses a life
- **THEN** a subtle screen shake occurs and decays back to normal within a short duration

#### Scenario: Shake does not obstruct play

- **WHEN** the screen shakes during normal intense play
- **THEN** the shake magnitude is small enough that the player can still track their ship and incoming shots

### Requirement: Knockback

Impacts SHALL produce knockback: destroying an enemy near the player, or the player being hit, SHALL nudge the affected entity slightly, and explosions SHALL feel like they push outward. Knockback SHALL be small enough not to break control of the player.

#### Scenario: Player knockback on hit is controllable

- **WHEN** the player is hit by an enemy projectile or body
- **THEN** the player ship receives a small knockback nudge that the player can immediately recover from by steering

#### Scenario: Explosions push outward visually

- **WHEN** an enemy is destroyed
- **THEN** the resulting explosion particles and any nearby loose debris radiate outward from the impact point, conveying force

### Requirement: Layered glowing particle explosions

Enemy destruction SHALL produce a layered, glowing particle explosion with multiple particle types/layers (e.g. bright core sparks, glowing embers, smoke) rather than a single flat burst. The player's death SHALL produce a larger, more dramatic version.

#### Scenario: Layered explosion on enemy death

- **WHEN** an enemy is destroyed
- **THEN** multiple layers of glowing particles (e.g. bright sparks plus softer glow) burst from the enemy's position and fade out over time

#### Scenario: Larger explosion on player death

- **WHEN** the player loses their last life
- **THEN** a noticeably larger and more dramatic layered explosion is produced than for a standard enemy

### Requirement: Animated power-up pickups

Power-up pickups SHALL be animated (e.g. bobbing, rotating, pulsing glow) while on the field, and collecting one SHALL play a distinct pickup animation/feedback distinct from a normal enemy explosion.

#### Scenario: Power-ups animate while drifting

- **WHEN** a power-up is on the play field awaiting collection
- **THEN** it visibly animates (e.g. rotates, pulses, or bobs) so it draws the player's attention

#### Scenario: Pickup collection feedback

- **WHEN** the player collects a power-up
- **THEN** a distinct collection animation/flash plays that is visibly different from an enemy explosion

### Requirement: Combo and score feedback

Score gains and combo milestones SHALL produce floating on-screen feedback (e.g. rising score numbers, combo multiplier popups) so the player feels rewarded for streaks.

#### Scenario: Score popup on kill

- **WHEN** the player destroys an enemy
- **THEN** a short-lived floating score number rises from the enemy's position and fades

#### Scenario: Combo milestone feedback

- **WHEN** the player reaches a higher combo tier
- **THEN** a combo indicator (e.g. multiplier text or "COMBO!" popup) is displayed on screen with visible emphasis

### Requirement: Smooth transitions

Screen-state changes (start → playing, playing → game-over, game-over → start) SHALL transition smoothly (e.g. fade or animated beat) rather than cutting instantly between static screens.

#### Scenario: Smooth start-to-play transition

- **WHEN** the player starts the game from the start screen
- **THEN** the start screen transitions into gameplay with a visible animated transition rather than an instant cut

#### Scenario: Smooth play-to-game-over transition

- **WHEN** the player runs out of lives
- **THEN** the gameplay transitions to the game-over screen with a visible animated transition rather than an instant cut

### Requirement: Multi-layer parallax starfield

The background SHALL be a multi-layer scrolling starfield with at least two layers moving at different speeds to create a parallax depth effect. The starfield SHALL scroll continuously during play to convey downward motion.

#### Scenario: Parallax layers move at different speeds

- **WHEN** the game is in the playing state
- **THEN** at least two starfield layers scroll downward at visibly different speeds, with the faster layer appearing closer

#### Scenario: Continuous background motion

- **WHEN** the starfield scrolls during play
- **THEN** the background conveys continuous downward motion without visible wrapping seams or obvious gaps

### Requirement: Neon sci-fi visual style

The game SHALL render a neon sci-fi aesthetic: glowing neon outlines, additive glow/bloom-style effects, gradient fills, and dark space background, drawn entirely with canvas primitives (no external images).

#### Scenario: Neon glow on key elements

- **WHEN** the player ship, enemies, projectiles, and power-ups are rendered
- **THEN** they exhibit neon glow styling (glowing outlines/gradients) consistent with a sci-fi aesthetic, all drawn with canvas primitives

### Requirement: Enemy spawn and entrance animations

Enemies SHALL animate into the play field on spawn (e.g. fade-in, scale-in, or a sweeping entrance) rather than popping in fully formed, so waves feel choreographed.

#### Scenario: Enemies animate in on spawn

- **WHEN** an enemy spawns at the top of the canvas
- **THEN** it plays a brief entrance animation (e.g. fading/scaling in) rather than appearing at full opacity instantly

### Requirement: Lightweight physics for responsive feel

Movement and impacts SHALL use lightweight physics (acceleration, easing, velocity-based knockback, decaying shake) so motion feels responsive rather than static or scripted. The physics SHALL remain computationally cheap enough to maintain smooth performance.

#### Scenario: Motion eases rather than snaps

- **WHEN** the player steers, knocks back, or an explosion pushes debris
- **THEN** motion eases toward its target/destination (acceleration and decay) rather than moving at a constant instant rate

#### Scenario: Performance stays smooth with effects on

- **WHEN** particles, trails, shake, and parallax are all active during peak play
- **THEN** the game remains visibly smooth, demonstrating the effects are lightweight
