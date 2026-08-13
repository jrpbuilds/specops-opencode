## Purpose

Defines how the player interacts with the Galaxy Shooter and how the game's lifecycle states (start, playing, game-over) are presented and restarted. Covers responsive keyboard controls, responsive touch controls, the three game screens, the restartable flow, and the responsive 400×700 portrait layout that scales to the viewport.

## ADDED Requirements

### Requirement: Keyboard controls

The game SHALL support keyboard controls for movement and firing on desktop. Movement SHALL be controllable with arrow keys and/or WASD, and firing SHALL be controllable with Space in addition to auto-fire.

#### Scenario: Keyboard movement

- **WHEN** the player presses Left/Right or A/D (and optionally Up/Down or W/S) during play
- **THEN** the player ship moves in the corresponding direction with the smooth acceleration/easing defined by core-gameplay

#### Scenario: Keyboard fire

- **WHEN** the player presses Space during play
- **THEN** the player fires a projectile (or burst) on that input, layered on top of auto-fire

### Requirement: Touch controls

The game SHALL support touch controls that work on portrait mobile devices. The player SHALL be able to steer the ship by touching/dragging on the play field (e.g. the ship follows the touch position horizontally), and tapping SHALL trigger manual fire layered on auto-fire. Touch controls SHALL not lag visibly during normal play.

#### Scenario: Touch-drag steering

- **WHEN** the player touches and drags on the play field during play
- **THEN** the player ship follows the touch position (at least horizontally) with smooth easing

#### Scenario: Tap to fire

- **WHEN** the player taps the play field during play
- **THEN** a manual fire input is registered, layered on top of auto-fire

#### Scenario: Touch does not block on-screen HUD

- **WHEN** the player touches over the HUD area (score/lives) during play
- **THEN** the touch does not corrupt the HUD or prevent steering elsewhere on the field

### Requirement: Start screen

The game SHALL present a start screen when first opened that introduces the game and prompts the player to begin. The start screen SHALL be visually styled consistently with the neon sci-fi aesthetic and SHALL instruct the player how to start (keyboard and touch).

#### Scenario: Start screen on load

- **WHEN** the file is opened and the game initializes
- **THEN** a start screen is shown rather than dropping the player straight into gameplay

#### Scenario: Start instructions visible

- **WHEN** the start screen is displayed
- **THEN** the player can see how to begin (e.g. "Press Space / tap to start") covering both keyboard and touch

### Requirement: Playing state

The game SHALL have a playing state during which the main loop runs, enemies spawn, the player can move and fire, and the HUD (score, lives, level, combo) is visible. Input SHALL only affect gameplay during the playing state.

#### Scenario: Gameplay active in playing state

- **WHEN** the game is in the playing state
- **THEN** enemies spawn, the player can move and fire, and the HUD is rendered

#### Scenario: Input ignored outside playing state

- **WHEN** the game is on the start or game-over screen
- **THEN** movement and fire inputs do not affect any in-game entity

### Requirement: Game-over screen

When the player runs out of lives, the game SHALL present a game-over screen showing the final score and a prompt to restart. The game-over screen SHALL be styled consistently with the neon sci-fi aesthetic.

#### Scenario: Game-over screen shows final score

- **WHEN** the player's lives reach zero and the game transitions to game-over
- **THEN** the game-over screen displays the player's final score

#### Scenario: Restart prompt visible

- **WHEN** the game-over screen is displayed
- **THEN** the player can see how to restart (e.g. "Press Space / tap to restart") covering both keyboard and touch

### Requirement: Restartable flow

The game SHALL allow restarting from the game-over screen back into a fresh game (and from the start screen into a first game) using either keyboard (Space/Enter) or a touch tap. Restarting SHALL reset all gameplay state (score, lives, level, enemies, projectiles, power-ups, particles) to initial values.

#### Scenario: Restart from game-over

- **WHEN** the player presses the start/restart input on the game-over screen
- **THEN** a fresh game begins with the initial score, lives, and level, and no leftover enemies/projectiles from the previous run

#### Scenario: Start from start screen

- **WHEN** the player presses the start input on the start screen
- **THEN** the game enters the playing state with initial values

#### Scenario: Full state reset on restart

- **WHEN** the player restarts after a busy run with many enemies, projectiles, power-ups, and particles on screen
- **THEN** all of those entities are cleared and the new run starts from a clean, initial state

### Requirement: Responsive 400×700 portrait layout

The canvas SHALL have an internal resolution of 400×700 pixels in portrait orientation. The canvas SHALL scale to fit the viewport while preserving aspect ratio, so the game is playable on both narrow mobile portrait screens and larger desktop viewports without distortion. The page SHALL prevent default browser scrolling/zooming gestures from interfering with play (e.g. appropriate viewport meta and touch-action handling).

#### Scenario: Fixed internal resolution

- **WHEN** the game is rendered
- **THEN** the logical play area is 400 pixels wide and 700 pixels tall regardless of the displayed size

#### Scenario: Scales without distortion

- **WHEN** the viewport is narrower or wider than 400×700 (e.g. a phone in portrait or a desktop browser)
- **THEN** the canvas scales to fit while preserving its 4:7 aspect ratio, with no stretching or distortion

#### Scenario: Touch gestures do not scroll the page

- **WHEN** the player drags on the play field on a touch device
- **THEN** the page does not scroll, zoom, or trigger browser gestures that interfere with steering
