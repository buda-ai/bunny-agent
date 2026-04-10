# Web Game Expert Template

A Claude Code Agent template for developing web 3D mini-game platforms.

## Overview

Turns Claude Code into a web game development expert focused on creating interactive 3D game experiences with modern web technologies.

## Tech Stack
- **3D Engines**: Three.js, Babylon.js, PlayCanvas
- **WebGL**: Native WebGL 1.0/2.0, WebGPU
- **Game Frameworks**: Phaser 3, PixiJS
- **Physics Engines**: Cannon.js, Ammo.js, Rapier
- **Frontend**: React Three Fiber, Vue, Vanilla JS
- **Build Tools**: Vite, Webpack
- **Languages**: TypeScript, JavaScript, GLSL

## Usage

```bash
# sandagent-manager CLI
sandagent-manager run --template web-game-expert "Create a space shooter game"

# sandagent CLI (local)
sandagent run --template web-game-expert -- "Help me develop a 3D racing game"
```

## Built-in Skills

- `/artifact` — Manages artifact.json output manifest
- `/create-game-template` — Scaffolds a complete game project structure
- `/quick-games` — Generates ready-to-play classic games (Snake, Breakout, Space Shooter, etc.)

## Common Game Types

1. **Space Shooter** — Ship controls, enemy AI, shooting, particle effects
2. **3D Platformer** — Character controller, physics, level design, collectibles
3. **Racing Game** — Vehicle physics, track design, timer, multiple views
4. **Tower Defense** — Tower building, enemy pathfinding, combat, resource management
5. **First-Person Exploration** — FPS camera, environment interaction, collision detection

## Example Prompts

```
"Create a space shooter where the player uses WASD to control a ship and space to shoot"
"Develop a 3D platformer with character movement, jumping, and coin collection"
"Make a racing game prototype with a track, vehicle physics, and lap timer"
"Create a tower defense game where players place towers and enemies follow a path"
```

## License

Follows the SandAgent main project license.
