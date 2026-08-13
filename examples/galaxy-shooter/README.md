# Galaxy Shooter

A polished vertical arcade shooter generated in a single SpecOps run.

## Demo

[Play Galaxy Shooter](https://jrpbuilds.github.io/specops-opencode/galaxy-shooter/)

## Original Prompt

> Create a polished vertical Galaxy Shooter as a **single self-contained HTML file using Canvas**, optimized for a **400×700 portrait mobile layout**. Build a visually striking arcade shooter with a sleek animated blue player ship, smooth acceleration/easing movement, auto-fire plus Space/tap firing, enemy formations with varied movement patterns, projectiles, power-ups, escalating levels, score, lives, and restartable start/game-over screens. Prioritize **excellent game feel**: punchy laser recoil, projectile trails, hit flashes, brief hit-stop, subtle screen shake, knockback, accurate collision detection, satisfying enemy destruction, layered glowing particle explosions, animated power-up pickups, combo/score feedback, and smooth transitions. Add a multi-layer scrolling/parallax starfield, neon sci-fi effects, enemy spawn/entrance animations, occasional tougher enemies, and lightweight physics so movement and impacts feel responsive rather than static. Include responsive touch controls and keyboard controls. Keep performance smooth, code clean, no external assets or libraries, and make the finished result feel like a small polished arcade game suitable for a showcase. **Output only the complete HTML code.**

## Model Mapping

| SpecOps Role | Model                | Variant  |
| ------------ | -------------------- | -------- |
| Coordinator  | MiniMax-M3           | thinking |
| Explorer     | Qwen3.7 Plus         | high     |
| Planner      | GLM-5.2              | high     |
| Designer     | Kimi K3              | default  |
| Implementer  | GPT-5.6 Luna         | high     |
| Reviewer     | DeepSeek-V4-Pro-0813 | max      |

Frontier escalation was enabled but **not invoked** for this run (no qualifying blocker arose). Run cost: approximately **$1.64**.

## Workflow

The request was processed through the standard SpecOps workflow:

```text
Prompt
  ↓
Explorer
  ↓
Planner
  ↓
Designer
  ↓
Planner (implementation tasks)
  ↓
Implementer
  ↓
Reviewer
  ↓
Final result
```

## OpenSpec Artifacts

The complete OpenSpec artifacts produced during the run are included with this example:

- [`proposal.md`](openspec/changes/archive/2026-08-13-galaxy-shooter-html-canvas/proposal.md)
- [`design.md`](openspec/changes/archive/2026-08-13-galaxy-shooter-html-canvas/design.md)
- [`tasks.md`](openspec/changes/archive/2026-08-13-galaxy-shooter-html-canvas/tasks.md)
- [`specs/`](openspec/specs/)

These show the requirements, design decisions, and implementation plan used to produce the final game.

## Result

The final implementation is a single self-contained `index.html` using the Canvas API with no external assets or libraries.

- [Play the game](https://jrpbuilds.github.io/specops-opencode/galaxy-shooter/)
- [View the source](index.html)

## Human Intervention

No manual source-code changes were made to the generated game after the SpecOps workflow completed.
