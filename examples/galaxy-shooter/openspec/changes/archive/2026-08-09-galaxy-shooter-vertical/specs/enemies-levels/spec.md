## Purpose

Defines enemy variety (at least 3 movement patterns), spawn/entrance animations, formations, occasional tougher enemies and mini-bosses every few waves, and escalating level difficulty.

## ADDED Requirements

### Requirement: At least three enemy movement patterns
The game SHALL include at least three distinct enemy movement patterns: straight descent, sine-wave horizontal oscillation while descending, and dive (curving or accelerating toward the player / off-screen). Each pattern MUST be visually distinguishable in motion.

#### Scenario: Straight descent
- **WHEN** a straight-pattern enemy is spawned
- **THEN** it descends vertically at a steady speed
- **AND** it does not move horizontally except via formation offsets

#### Scenario: Sine-wave pattern
- **WHEN** a sine-wave enemy is spawned
- **THEN** it descends while oscillating horizontally in a sine pattern
- **AND** the oscillation amplitude and frequency are visually clear

#### Scenario: Dive pattern
- **WHEN** a dive-pattern enemy is spawned
- **THEN** it follows a diving trajectory (curving or accelerating, potentially toward the player's x-position)
- **AND** its motion is visually distinct from straight and sine patterns

### Requirement: Spawn and entrance animations
Enemies SHALL enter the play area with an entrance animation (e.g. fade-in, scale-in, or a brief non-collidable approach) so spawns do not pop in abruptly. During the entrance animation an enemy MAY be non-collidable or partially transparent until the animation completes.

#### Scenario: Entrance fade-in
- **WHEN** an enemy spawns
- **THEN** it plays a brief entrance animation (fade/scale-in)
- **AND** it becomes fully solid and collidable once the animation completes

### Requirement: Enemy formations
Enemies SHALL spawn in formations (e.g. rows, columns, V-shapes, clusters) rather than only as isolated singletons, giving the player recognizable group patterns to engage.

#### Scenario: Formation spawn
- **WHEN** a wave spawns
- **THEN** multiple enemies appear in a recognizable formation pattern
- **AND** the formation moves coherently until individual enemies diverge by their movement pattern

### Requirement: Tougher enemies and mini-bosses
The game SHALL include tougher enemies with more health and distinct visuals, and SHALL spawn a mini-boss every few waves. Mini-bosses MUST be noticeably tougher (more health, larger, distinct attack pattern) than regular enemies and reward the player appropriately on defeat.

#### Scenario: Tougher enemy
- **WHEN** a tougher enemy variant spawns
- **THEN** it has more health and a visually distinct (e.g. larger or differently colored) appearance than standard enemies
- **AND** it takes multiple laser hits to destroy

#### Scenario: Mini-boss wave
- **WHEN** a mini-boss wave triggers (every few waves)
- **THEN** a mini-boss spawns with substantially more health, a larger size, and a distinct attack pattern
- **AND** defeating the mini-boss grants a meaningful score reward and may drop a power-up

### Requirement: Escalating level difficulty
The game SHALL escalate difficulty per level by increasing spawn rate, enemy speed, and enemy toughness. Each level SHALL be reachable by clearing the prior level's wave(s) or surviving a duration, and the escalation MUST be perceptible to the player.

#### Scenario: Level progression
- **WHEN** the player clears a level's wave(s)
- **THEN** the game advances to the next level
- **AND** the HUD level indicator updates

#### Scenario: Difficulty escalation
- **WHEN** a new level begins
- **THEN** enemy spawn rate, enemy speed, and/or enemy toughness increase relative to the previous level
- **AND** the increase is perceptible to the player

### Requirement: Enemy projectiles
Tougher enemies and mini-bosses (and optionally some regular enemies) SHALL fire projectiles downward at the player. Enemy projectiles MUST be visually distinct from player lasers and subject to collision with the player.

#### Scenario: Enemy fires at player
- **WHEN** a firing-capable enemy is on screen
- **THEN** it periodically fires projectiles downward
- **AND** those projectiles are visually distinct from player lasers and can damage the player on collision
