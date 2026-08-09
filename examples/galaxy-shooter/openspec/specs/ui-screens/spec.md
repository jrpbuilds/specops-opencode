# ui-screens Specification

## Purpose
Defines the Start screen, in-game HUD (score/lives/level), Pause screen, and Game Over screen, all of which are restartable, plus the smooth transitions and responsive interaction between them.
## Requirements
### Requirement: Start screen
The game SHALL show a Start screen on load with the game title and a clear way to begin play (button or tap/keypress). The Start screen MUST be the initial state and MUST transition smoothly into gameplay.

#### Scenario: Initial start screen
- **WHEN** the game loads
- **THEN** the Start screen is shown with the title and a start control
- **AND** gameplay does not begin until the player activates the start control

#### Scenario: Start to gameplay
- **WHEN** the player activates the start control (button, tap, or key)
- **THEN** the game transitions smoothly to gameplay
- **AND** the player ship, HUD, and first wave initialize

### Requirement: HUD with score, lives, and level
During gameplay the game SHALL render a HUD showing the current score, remaining lives, and current level. The HUD MUST remain visible and readable during gameplay and MUST NOT be obscured by screen shake or effects.

#### Scenario: HUD rendering
- **WHEN** the game is in active play
- **THEN** the HUD displays score, lives, and level
- **AND** the HUD stays readable and is not displaced by screen shake (shake applies to the play area, not the HUD)

#### Scenario: HUD updates
- **WHEN** the player scores, loses a life, or advances a level
- **THEN** the corresponding HUD value updates immediately
- **AND** the new value is shown without requiring a screen transition

### Requirement: Pause screen
The game SHALL provide a Pause screen that suspends gameplay and offers resume and quit/restart options. Pause SHALL be triggerable by an explicit control (key/button) and by visibility loss (see `game-runtime`).

#### Scenario: Pause entry
- **WHEN** the player triggers pause during gameplay (or the tab loses visibility)
- **THEN** the game pauses and shows the Pause screen
- **AND** gameplay updates do not advance

#### Scenario: Pause resume
- **WHEN** the player selects resume on the Pause screen
- **THEN** the game returns to gameplay smoothly
- **AND** the game resumes from where it was paused

### Requirement: Game Over screen
The game SHALL show a Game Over screen when the player's lives reach zero, displaying the final score and level and offering to restart. The transition from gameplay to Game Over SHALL be smooth.

#### Scenario: Game over entry
- **WHEN** the player's lives reach zero
- **THEN** the game transitions smoothly to the Game Over screen showing final score and level
- **AND** gameplay stops

### Requirement: Restartable screens
All screens (Start, Pause, Game Over) SHALL allow the player to start a new game or return to the Start screen. Restarting MUST reset all game state (score, lives, level, enemies, projectiles, particles, power-ups) to initial values.

#### Scenario: Restart from game over
- **WHEN** the player selects restart on the Game Over screen
- **THEN** all game state is reset to initial values and gameplay begins from level 1
- **AND** no leftover enemies, projectiles, particles, or power-ups from the previous run remain

#### Scenario: Quit to start
- **WHEN** the player selects quit/restart-to-start from the Pause or Game Over screen
- **THEN** the game returns to the Start screen
- **AND** the player can begin a fresh run from there

