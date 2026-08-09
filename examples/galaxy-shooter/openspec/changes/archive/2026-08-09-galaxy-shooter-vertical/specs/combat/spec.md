## Purpose

Defines player lasers with recoil and trails, enemy projectiles, accurate collision detection, enemy destruction feedback, player lives with brief invulnerability and knockback, and the hit-stop and hit-flash effects that make combat feel punchy.

## ADDED Requirements

### Requirement: Player lasers with recoil
The player's weapon SHALL fire laser projectiles upward. Each shot SHALL apply a brief downward recoil to the player ship (a small impulse that decays) so firing feels punchy. Fire rate SHALL respect the weapon's current cadence and not exceed it.

#### Scenario: Recoil on fire
- **WHEN** the player fires a laser
- **THEN** a projectile is spawned traveling upward
- **AND** the player ship receives a brief downward impulse that decays over a few frames

#### Scenario: Fire-rate cap
- **WHEN** the player attempts to fire faster than the current fire rate
- **THEN** shots are throttled to the fire-rate cadence
- **AND** no extra projectiles are spawned beyond that cadence

### Requirement: Projectile trails
Projectiles (player lasers and enemy projectiles) SHALL render with a trailing visual effect (e.g. a fading tail or additive glow trail) so they read clearly against the starfield.

#### Scenario: Laser trail
- **WHEN** a player laser is in flight
- **THEN** it renders with a fading trail behind it
- **AND** the trail dissipates as the projectile moves

### Requirement: Accurate collision detection
Collisions SHALL be detected using accurate per-entity hitboxes (e.g. circle or AABB with reasonable radii/bounds, tighter than visual sprites where appropriate for fairness). Collisions MUST be checked each frame between: player lasers vs enemies, enemy projectiles vs player, enemies vs player.

#### Scenario: Laser hits enemy
- **WHEN** a player laser's hitbox overlaps an enemy's hitbox
- **THEN** the laser is consumed (or pierces if the weapon grants piercing) and the enemy takes damage
- **AND** hit feedback (hit flash) is triggered on the enemy

#### Scenario: Enemy projectile hits player
- **WHEN** an enemy projectile's hitbox overlaps the player's hitbox and the player is not invulnerable
- **THEN** the player loses a life and brief invulnerability plus knockback are applied

#### Scenario: Enemy body collides with player
- **WHEN** an enemy's hitbox overlaps the player's hitbox and the player is not invulnerable
- **THEN** the player loses a life, the enemy is destroyed, and brief invulnerability plus knockback are applied

### Requirement: Enemy destruction feedback
When an enemy is destroyed, it SHALL produce a layered glowing particle explosion and a score popup. Destroyed enemies MUST be removed from play and recycled.

#### Scenario: Enemy destroyed
- **WHEN** an enemy's health reaches zero
- **THEN** a layered glowing particle explosion is spawned at its position
- **AND** a score popup is emitted
- **AND** the enemy entity is recycled to its pool

### Requirement: Player lives and invulnerability
The player SHALL start with a fixed number of lives. On taking a hit, the player SHALL lose one life, become briefly invulnerable (with a visible blinking/flash effect), and receive knockback. When lives reach zero, the game transitions to Game Over.

#### Scenario: Player hit
- **WHEN** the player is hit by an enemy projectile or enemy body and is not invulnerable
- **THEN** the player loses one life, becomes invulnerable for a brief duration with a visible blinking effect, and receives knockback
- **AND** the HUD life count updates immediately

#### Scenario: Player death
- **WHEN** the player's lives reach zero after a hit
- **THEN** the game transitions to the Game Over screen

### Requirement: Hit-stop on impact
Brief hit-stop (a few-frame freeze of gameplay time) SHALL be applied on impactful events — player laser hitting an enemy, player taking damage, and enemy destruction — to add weight. Hit-stop MUST be short enough not to disrupt flow.

#### Scenario: Laser hit freeze
- **WHEN** a player laser hits an enemy
- **THEN** gameplay time is briefly frozen for a few frames
- **AND** the freeze releases and normal motion resumes

#### Scenario: Player damage freeze
- **WHEN** the player takes damage
- **THEN** a brief hit-stop is applied
- **AND** the screen shake and knockback accompany the freeze

### Requirement: Hit flash
A brief visual hit flash SHALL be applied to enemies when struck by a laser and to the player when damaged, signaling the impact.

#### Scenario: Enemy hit flash
- **WHEN** an enemy is struck by a player laser
- **THEN** the enemy renders with a brief bright flash for a few frames
- **AND** the flash decays back to normal rendering

### Requirement: Knockback
Impacts SHALL apply knockback: enemy hits push the player ship briefly in the opposite direction of the impact, and player laser recoil pushes the ship downward. Knockback MUST decay smoothly.

#### Scenario: Player knockback on damage
- **WHEN** the player is damaged by an enemy projectile or body collision
- **THEN** the player ship is pushed briefly away from the impact source
- **AND** the knockback velocity decays smoothly back to normal control
