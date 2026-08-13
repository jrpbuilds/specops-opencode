# core-gameplay Specification

## Purpose
Defines the core mechanical systems of the vertical Galaxy Shooter: the player ship, firing, projectiles, enemies and formations, power-up mechanics, collision detection, scoring and combos, lives and death, level escalation, and the single self-contained runtime that must run with no external assets or libraries.
## Requirements
### Requirement: Single self-contained runtime

The game SHALL be delivered as exactly one HTML file containing all markup, CSS, and JavaScript inline. The file SHALL run by being opened directly in a modern browser with no server, build step, network access, external libraries, or external assets (images, fonts, audio, scripts).

#### Scenario: Opens and runs offline

- **WHEN** a user opens the HTML file directly in a modern browser with network access disabled
- **THEN** the start screen renders without errors and no external resource requests are made

#### Scenario: No external dependencies

- **WHEN** the HTML source is inspected
- **THEN** it contains no `<script src>`, `<link>` stylesheet, `<img>`, or audio element referencing any URL, CDN, or file outside the single HTML file

### Requirement: Player ship movement

The player ship SHALL be a sleek, animated, blue ship rendered on the canvas. Horizontal (and optionally vertical within a defined lower band) movement SHALL use acceleration with easing toward the input target velocity so motion feels smooth rather than instant-start/stop. The ship SHALL remain clamped within the canvas bounds at all times.

#### Scenario: Smooth acceleration toward touch/keyboard target

- **WHEN** the player holds a movement input in one direction and then releases it
- **THEN** the ship visibly accelerates toward the target speed while held and eases to a stop after release, not snapping to zero velocity instantly

#### Scenario: Clamped to canvas bounds

- **WHEN** the player steers the ship toward any canvas edge
- **THEN** the ship stops at the edge and never leaves the visible canvas area

### Requirement: Player firing

The player SHALL auto-fire projectiles upward at a steady cadence while the game is in the playing state. The player SHALL also be able to fire manually by pressing Space or tapping the play field, layered on top of auto-fire. Firing SHALL produce visible laser projectiles that travel upward off-screen.

#### Scenario: Auto-fire while playing

- **WHEN** the game is in the playing state and the player is alive
- **THEN** projectiles are emitted from the ship at a regular cadence without any input

#### Scenario: Manual fire input

- **WHEN** the player presses Space or taps the play field while playing
- **THEN** an additional projectile (or burst, if a power-up grants it) is emitted from the ship on that input

#### Scenario: No firing outside playing state

- **WHEN** the game is on the start screen or game-over screen
- **THEN** no player projectiles are emitted regardless of input

### Requirement: Projectiles

The system SHALL maintain player projectiles that travel upward and enemy projectiles that travel downward. Projectiles SHALL be visually distinct (player lasers vs enemy shots) and SHALL be removed once they leave the canvas. Projectiles SHALL support per-power-up variants (e.g. multi-shot or upgraded shots).

#### Scenario: Off-screen projectiles are removed

- **WHEN** a projectile travels fully past the top or bottom edge of the canvas
- **THEN** it is removed from the active projectile set and stops being updated or rendered

#### Scenario: Player and enemy shots are distinguishable

- **WHEN** a player projectile and an enemy projectile are both on screen
- **THEN** they are visually distinct (different color/shape) so the player can tell them apart at a glance

### Requirement: Enemies and formations

The system SHALL spawn enemies that enter from above the canvas. Enemies SHALL appear in formations and exhibit varied movement patterns (e.g. straight descent, sine weave, diagonal sweep, hovering, diving). The system SHALL occasionally spawn tougher enemies that are visibly distinct and require more hits to destroy.

#### Scenario: Formation entry

- **WHEN** a wave spawns
- **THEN** multiple enemies enter in a recognizable formation rather than appearing instantly on the play field

#### Scenario: Varied movement patterns

- **WHEN** a level is played through
- **THEN** at least three distinct enemy movement patterns are observable across the enemies on screen over the course of the level

#### Scenario: Tougher enemies

- **WHEN** a tougher enemy type spawns
- **THEN** it is visually distinct from standard enemies and survives more than one player projectile hit before being destroyed

### Requirement: Enemy spawning and escalation

Enemy spawn rate and difficulty SHALL escalate as levels increase. Each level SHALL define or imply a spawn budget/pattern. When a level's enemies are cleared (or a level objective is met), the system SHALL advance to the next level with increased difficulty.

#### Scenario: Levels escalate

- **WHEN** the player clears a level and advances to the next
- **THEN** the next level is observably harder (faster, denser, or tougher enemies) than the previous one

#### Scenario: Level transition is observable

- **WHEN** a level is completed
- **THEN** the player is given a clear indication that the next level has begun (e.g. an on-screen level label or transition beat)

### Requirement: Collision detection

The system SHALL detect collisions between: player projectiles and enemies, enemy projectiles and the player, and enemy bodies and the player. Collision detection SHALL be accurate to the rendered shapes (using bounding boxes/circles sized to the visible sprites, not grossly generous rectangles) so hits feel fair.

#### Scenario: Player laser hits an enemy

- **WHEN** a player projectile overlaps an enemy's collision shape
- **THEN** the enemy takes damage (and is destroyed if its health is exhausted) and the projectile is consumed

#### Scenario: Enemy hits the player

- **WHEN** an enemy projectile or enemy body overlaps the player's collision shape and the player is not invulnerable
- **THEN** the player loses a life (subject to invulnerability windows after a hit) and the colliding enemy projectile/enemy is removed or destroyed as appropriate

#### Scenario: Fair hitboxes

- **WHEN** a projectile passes through the gap between an enemy's sprite edge and a loosely drawn box
- **THEN** no collision is registered unless the projectile actually overlaps the visible shape, so grazing misses feel fair

### Requirement: Power-ups

The system SHALL include power-ups that drop or spawn during play and grant temporary or permanent-while-alive upgrades when collected by the player (e.g. multi-shot, faster fire, shield/extra hit, extra life). Each power-up SHALL have a clearly visible type and a clear effect.

#### Scenario: Power-up collection

- **WHEN** the player ship overlaps a power-up pickup
- **THEN** the power-up is collected, removed from the field, and its effect is applied to the player

#### Scenario: Distinct power-up types

- **WHEN** multiple power-up types exist
- **THEN** each type is visually distinguishable and applies a different, observable effect (e.g. multi-shot produces more projectiles, shield absorbs a hit)

#### Scenario: Shield power-up absorbs a hit

- **WHEN** the player has an active shield power-up and would otherwise lose a life
- **THEN** the shield absorbs the hit instead, the shield is consumed, and the player does not lose a life

### Requirement: Scoring and combos

The system SHALL award score for destroying enemies and SHALL reward consecutive destructions with a combo system that increases the score multiplier or bonus. The current score and any active combo SHALL be displayed on screen during play.

#### Scenario: Score awarded for a kill

- **WHEN** the player destroys an enemy
- **THEN** the score increases by an amount appropriate to the enemy type

#### Scenario: Combo builds with rapid kills

- **WHEN** the player destroys several enemies in quick succession within a combo window
- **THEN** the combo counter/multiplier increases and the per-kill score reward is multiplied accordingly

#### Scenario: Combo resets after a gap

- **WHEN** the player stops destroying enemies for longer than the combo window
- **THEN** the combo resets to its baseline

### Requirement: Lives and player death

The player SHALL start with a fixed number of lives. Each time the player is hit (with no shield), the player loses a life, gains a brief invulnerability window, and the game continues. When lives reach zero, the game transitions to the game-over state. The remaining lives SHALL be displayed on screen during play.

#### Scenario: Losing a life on hit

- **WHEN** the player is hit by an enemy projectile or body without a shield
- **THEN** the player loses one life and becomes briefly invulnerable so consecutive hits do not instantly end the run

#### Scenario: Game over on zero lives

- **WHEN** the player's lives reach zero
- **THEN** the game transitions to the game-over screen

### Requirement: Performance and loop

The game SHALL run a smooth main loop (e.g. requestAnimationFrame with delta time) that maintains visibly smooth motion under normal play on a modern device. The loop SHALL use delta-time-based updates so motion speed is consistent regardless of frame rate variation.

#### Scenario: Smooth motion under load

- **WHEN** many enemies, projectiles, and particles are on screen simultaneously during normal peak play
- **THEN** the game remains visibly smooth without stuttering or freezing

#### Scenario: Frame-rate-independent motion

- **WHEN** the device frame rate varies (e.g. 30 fps vs 60 fps)
- **THEN** ships, projectiles, and enemies travel at consistent in-game speeds rather than faster or slower per device

