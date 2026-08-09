## Purpose

Defines the animated blue player ship, its smooth acceleration/easing movement, keyboard (Arrows/WASD + Space) and touch (drag + tap) input, auto-fire behavior, and confinement to the canvas.

## ADDED Requirements

### Requirement: Animated blue player ship
The player SHALL control a visually distinct blue ship rendered with animation (e.g. engine thrust flicker, subtle idle bob) drawn procedurally via Canvas. The ship MUST be clearly visible against the starfield and visually distinct from enemies.

#### Scenario: Ship rendering
- **WHEN** the game is in active play
- **THEN** a blue animated player ship is rendered at the player's position
- **AND** the ship shows ongoing animation (engine thrust flicker and/or subtle bob) while alive

### Requirement: Smooth acceleration/easing movement
The player ship SHALL move with smooth acceleration and deceleration (easing) rather than instant snapping, so velocity ramps up toward the target and settles smoothly when input stops. The ship MUST remain within the canvas bounds.

#### Scenario: Acceleration toward target
- **WHEN** the player holds a movement direction
- **THEN** the ship's velocity ramps up smoothly toward a maximum speed rather than instantly snapping to that speed
- **AND** the ship eases to a stop when the direction is released

#### Scenario: Canvas confinement
- **WHEN** the ship reaches any canvas edge
- **THEN** it is clamped to remain within [0,400] x [0,700]
- **AND** it cannot leave the visible play area

### Requirement: Keyboard movement controls
The game SHALL accept Arrow keys and WASD for movement (left/right/up/down, with diagonal combinations supported) and Space for firing. Movement MUST be responsive and simultaneous with firing.

#### Scenario: Arrow/WASD movement
- **WHEN** the player presses Arrow keys or WASD
- **THEN** the ship accelerates in the corresponding direction(s)
- **AND** simultaneous horizontal and vertical keys produce diagonal movement

#### Scenario: Space to fire
- **WHEN** the player presses and holds Space
- **THEN** the ship fires its weapon according to its current fire rate
- **AND** movement input continues to be honored while firing

### Requirement: Touch movement and fire controls
The game SHALL support touch input where dragging moves the ship (the ship follows the touch position with easing) and tapping fires a shot. Touch and keyboard input MUST both be active and not conflict.

#### Scenario: Drag to move
- **WHEN** the player touches and drags within the canvas
- **THEN** the ship eases toward the touch position (horizontal and/or vertical)
- **AND** the ship does not teleport but accelerates toward the touch point

#### Scenario: Tap to fire
- **WHEN** the player taps (brief touch) on the canvas
- **THEN** the ship fires its weapon
- **AND** a drag that begins does not prevent firing on the initial tap-down

### Requirement: Auto-fire
The game SHALL provide auto-fire so the player's weapon fires continuously at its current fire rate without requiring continuous input, while Space/tap MAY additionally trigger fire events consistent with the auto-fire cadence. Auto-fire MUST be active during normal play.

#### Scenario: Continuous auto-fire
- **WHEN** the game is in active play and the player provides no fire input
- **THEN** the ship still fires at its current fire-rate cadence
- **AND** holding Space or tapping does not exceed the weapon's fire-rate cap
