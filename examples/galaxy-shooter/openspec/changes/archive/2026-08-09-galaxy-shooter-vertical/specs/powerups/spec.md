## Purpose

Defines at least three power-up types, their animated pickups, drop behavior from destroyed enemies, and the gameplay effects they grant.

## ADDED Requirements

### Requirement: At least three power-up types
The game SHALL include at least three distinct power-up types. The set SHALL include: spread shot (multi-projectile fan), rapid fire (increased fire rate), and shield or extra life (defensive). Each power-up MUST have a visually distinct icon/color and a clear gameplay effect.

#### Scenario: Spread shot
- **WHEN** the player collects a spread-shot power-up
- **THEN** the player's weapon fires multiple projectiles in a fan pattern for a timed duration
- **AND** the effect expires after the duration, reverting to the standard weapon

#### Scenario: Rapid fire
- **WHEN** the player collects a rapid-fire power-up
- **THEN** the player's fire rate increases for a timed duration
- **AND** the effect expires after the duration, reverting to the standard fire rate

#### Scenario: Shield or extra life
- **WHEN** the player collects a shield/extra-life power-up
- **THEN** the player either gains a shield that absorbs the next hit without losing a life, or gains one additional life (as appropriate to the variant)
- **AND** the effect is visibly indicated (shield aura around the ship, or HUD lives count increases)

### Requirement: Animated power-up pickups
Power-ups SHALL render with a continuous animation (e.g. rotation, pulse, glow) while on screen so they are visually attractive and clearly collectible. Collecting a power-up SHALL play a pickup animation/feedback at the collection point.

#### Scenario: Idle pickup animation
- **WHEN** a power-up is on screen and not yet collected
- **THEN** it renders with a continuous animation (rotation/pulse/glow)
- **AND** it is visually distinguishable from enemies, projectiles, and the player

#### Scenario: Collection animation
- **WHEN** the player's hitbox overlaps a power-up
- **THEN** the power-up is collected, a pickup animation/feedback plays at the collection point, and the power-up is removed from play

### Requirement: Power-up drops from enemies
Destroyed enemies SHALL have a chance to drop a power-up. Mini-bosses and tougher enemies SHALL have a higher drop chance (or guaranteed drop for mini-bosses). Dropped power-ups SHALL fall/drift downward and expire after a duration if not collected.

#### Scenario: Drop on enemy destruction
- **WHEN** a regular enemy is destroyed
- **THEN** it has a low probability of dropping a power-up
- **AND** the dropped power-up drifts downward and expires after a duration if not collected

#### Scenario: Guaranteed mini-boss drop
- **WHEN** a mini-boss is destroyed
- **THEN** it drops at least one power-up
- **AND** the drop is visible and collectible

### Requirement: Timed or stacked effects with feedback
Power-up effects SHALL either be timed (expire after a duration) or stacked (e.g. extra life adds to the lives counter). The HUD or a visible indicator SHALL show the active power-up and, for timed effects, the remaining duration.

#### Scenario: Active power-up indication
- **WHEN** a timed power-up (spread shot or rapid fire) is active
- **THEN** the HUD or a visible indicator shows the active effect and its remaining duration
- **AND** the player can see when the effect is about to expire
