# feedback-effects Specification

## Purpose
Defines the visual and game-feel effects: multi-layer parallax starfield, screen shake, hit-stop, hit flash, knockback, projectile trails, layered glowing particle explosions, combo/score popups, smooth screen transitions, and the neon sci-fi visual style.
## Requirements
### Requirement: Multi-layer parallax starfield
The background SHALL render a multi-layer (at least 3 layers) scrolling parallax starfield where layers at different depths scroll at different speeds and opacities, producing a sense of depth. The starfield MUST scroll continuously during gameplay and may slow or pause on non-gameplay screens.

#### Scenario: Parallax depth
- **WHEN** the game is in active play
- **THEN** at least three starfield layers scroll downward at different speeds
- **AND** deeper layers are dimmer/slower and nearer layers are brighter/faster, producing a parallax depth effect

#### Scenario: Continuous scroll
- **WHEN** the starfield scrolls
- **THEN** stars wrap continuously without visible seams or popping at the canvas edges

### Requirement: Screen shake
Impacts (player damage, enemy destruction, mini-boss events) SHALL trigger a subtle screen shake (small randomized offset to the render origin for a short duration). Screen shake MUST be capped in magnitude and duration so it never disorients the player or covers the HUD.

#### Scenario: Shake on damage
- **WHEN** the player takes damage
- **THEN** a subtle screen shake is applied for a short duration
- **AND** the shake magnitude and duration are capped so the play area remains readable

#### Scenario: Shake decay
- **WHEN** a screen shake begins
- **THEN** its magnitude decays to zero over its short duration
- **AND** the render origin returns to its resting position

### Requirement: Hit-stop, hit flash, knockback
Game-feel impacts SHALL apply a brief hit-stop (time freeze), a visible hit flash, and knockback as specified in the `combat` capability, coordinated so the three effects reinforce each other.

#### Scenario: Coordinated impact effects
- **WHEN** an impactful event (laser-on-enemy, player damage, enemy destruction) occurs
- **THEN** hit-stop, hit flash, and (where applicable) knockback are applied together
- **AND** the effects release and gameplay resumes normally

### Requirement: Projectile trails
Projectiles SHALL render with trails as specified in the `combat` capability, using additive or fade rendering so they glow against the starfield.

#### Scenario: Trail rendering
- **WHEN** any projectile is in flight
- **THEN** it renders with a fading trail
- **AND** the trail uses additive/glow rendering for a neon look

### Requirement: Layered glowing particle explosions
Enemy destruction and player death SHALL spawn layered glowing particle explosions (multiple particle types/sizes/colors with additive glow). Explosions MUST respect the global particle cap from `game-runtime` and recycle particles.

#### Scenario: Layered explosion
- **WHEN** an enemy is destroyed
- **THEN** a multi-layer glowing particle explosion is spawned (e.g. a bright core, mid glow, and trailing sparks)
- **AND** the total active particle count remains within the global cap

#### Scenario: Particle recycling
- **WHEN** particles expire
- **THEN** they are returned to the particle pool and reused
- **AND** the hot path does not allocate new particle objects per explosion

### Requirement: Combo and score popups
Score events (enemy destroyed, combos) SHALL emit floating score popups that rise and fade. Combos (consecutive rapid kills) SHALL produce escalating combo feedback (e.g. increasing multiplier or stylized "COMBO" text).

#### Scenario: Score popup
- **WHEN** an enemy is destroyed
- **THEN** a floating score popup with the awarded points rises and fades at the enemy's position
- **AND** the popup disappears once faded

#### Scenario: Combo feedback
- **WHEN** the player destroys multiple enemies in rapid succession
- **THEN** combo feedback is shown (e.g. escalating multiplier or combo text)
- **AND** the combo resets if the player stops destroying enemies for a short period

### Requirement: Smooth screen transitions
Transitions between screens (Start, gameplay, Pause, Game Over) SHALL be smooth (e.g. fade or quick wipe) rather than abrupt cuts.

#### Scenario: Transition to gameplay
- **WHEN** the player starts the game from the Start screen
- **THEN** the transition to gameplay is animated (e.g. fade)
- **AND** gameplay begins after the transition completes

#### Scenario: Transition to game over
- **WHEN** the player's lives reach zero
- **THEN** the transition to the Game Over screen is animated
- **AND** the Game Over screen displays after the transition

### Requirement: Neon sci-fi visual style
The overall visual style SHALL be neon sci-fi: glowing additive elements, dark space background, vibrant player (blue) and enemy colors, and consistent glowing rendering for lasers, particles, and power-ups. Visuals MUST be drawn procedurally (no external image assets).

#### Scenario: Neon glow rendering
- **WHEN** the game renders lasers, particle explosions, power-ups, and the player ship
- **THEN** they use additive/glow rendering for a neon appearance
- **AND** no raster image assets are loaded (all visuals are procedural Canvas drawing)

