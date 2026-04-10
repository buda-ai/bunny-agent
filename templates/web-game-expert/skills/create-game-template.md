---
name: create-game-template
description: Quickly create a ready-to-run single-file HTML game template (no build tools required)
---

# Create Game Template Skill

Quickly create a complete single-file HTML game — double-click to run in the browser!

## When to Use

Use this skill when the user asks to create a game to quickly generate a runnable game template.

## Template Options

### Template 1: Three.js 3D Game (recommended)

Suitable for: 3D games, space shooters, racing, platformers, etc.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Three.js 3D Game</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body { font-family: Arial, sans-serif; overflow: hidden; background: #000; }
    canvas { display: block; }
    #hud {
      position: absolute; top: 20px; left: 20px;
      color: white; font-size: 18px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8); z-index: 100;
    }
    #instructions {
      position: absolute; bottom: 20px; left: 50%;
      transform: translateX(-50%); color: white; text-align: center;
      font-size: 14px; background: rgba(0,0,0,0.7);
      padding: 15px 25px; border-radius: 8px;
    }
  </style>
</head>
<body>
  <div id="hud">
    <div>Score: <span id="score">0</span></div>
    <div>Lives: <span id="lives">3</span></div>
  </div>
  <div id="instructions">
    <div><strong>Controls</strong></div>
    <div>WASD / Arrow keys: Move | Space: Action | ESC: Pause</div>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script>
    let scene, camera, renderer;
    let gameState = { score: 0, lives: 3, paused: false };

    function init() {
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x001020);
      scene.fog = new THREE.Fog(0x001020, 10, 50);

      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      document.body.appendChild(renderer.domElement);

      const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
      scene.add(ambientLight);
      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      createGameObjects();

      window.addEventListener('resize', onWindowResize);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      animate();
    }

    function createGameObjects() {
      const groundGeometry = new THREE.PlaneGeometry(50, 50);
      const groundMaterial = new THREE.MeshStandardMaterial({ color: 0x2a4a2a, roughness: 0.8 });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
      const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
      const player = new THREE.Mesh(playerGeometry, playerMaterial);
      player.position.y = 0.5;
      player.castShadow = true;
      scene.add(player);
      window.player = player;
    }

    const keys = {};
    function onKeyDown(event) {
      keys[event.code] = true;
      if (event.code === 'Escape') gameState.paused = !gameState.paused;
    }
    function onKeyUp(event) { keys[event.code] = false; }

    function update(deltaTime) {
      if (gameState.paused) return;
      if (window.player) {
        const moveSpeed = 5 * deltaTime;
        if (keys['KeyW'] || keys['ArrowUp'])    window.player.position.z -= moveSpeed;
        if (keys['KeyS'] || keys['ArrowDown'])  window.player.position.z += moveSpeed;
        if (keys['KeyA'] || keys['ArrowLeft'])  window.player.position.x -= moveSpeed;
        if (keys['KeyD'] || keys['ArrowRight']) window.player.position.x += moveSpeed;
      }
    }

    function updateUI() {
      document.getElementById('score').textContent = gameState.score;
      document.getElementById('lives').textContent = gameState.lives;
    }

    let lastTime = 0;
    function animate(currentTime = 0) {
      requestAnimationFrame(animate);
      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;
      update(deltaTime);
      renderer.render(scene, camera);
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    init();
    updateUI();
  </script>
</body>
</html>
```

### Template 2: Phaser 3 2D Game

Suitable for: 2D games, platformers, shooters, etc.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phaser 3 2D Game</title>
  <style>
    * { margin: 0; padding: 0; }
    body { display: flex; justify-content: center; align-items: center;
           min-height: 100vh; background: #222; font-family: Arial, sans-serif; }
  </style>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js"></script>
  <script>
    const config = {
      type: Phaser.AUTO, width: 800, height: 600,
      backgroundColor: '#2d2d2d',
      physics: { default: 'arcade', arcade: { gravity: { y: 300 }, debug: false } },
      scene: { preload, create, update }
    };

    let player, cursors, score = 0, scoreText;
    const game = new Phaser.Game(config);

    function preload() {}

    function create() {
      scoreText = this.add.text(16, 16, 'Score: 0', { fontSize: '24px', fill: '#fff' });
      player = this.add.rectangle(400, 300, 32, 48, 0x00ff88);
      this.physics.add.existing(player);
      player.body.setBounce(0.2);
      player.body.setCollideWorldBounds(true);

      const platforms = this.physics.add.staticGroup();
      platforms.create(400, 568, null).setDisplaySize(800, 32).refreshBody();
      this.physics.add.collider(player, platforms);
      cursors = this.input.keyboard.createCursorKeys();
    }

    function update() {
      if (cursors.left.isDown)       player.body.setVelocityX(-160);
      else if (cursors.right.isDown) player.body.setVelocityX(160);
      else                           player.body.setVelocityX(0);
      if (cursors.up.isDown && player.body.touching.down) player.body.setVelocityY(-330);
    }
  </script>
</body>
</html>
```

### Template 3: Pure Canvas 2D Game

Suitable for: simple 2D games, pixel games, etc.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canvas 2D Game</title>
  <style>
    * { margin: 0; padding: 0; }
    body { display: flex; justify-content: center; align-items: center;
           min-height: 100vh; background: #1a1a1a; font-family: Arial, sans-serif; }
    canvas { border: 2px solid #444; background: #000; }
  </style>
</head>
<body>
  <canvas id="gameCanvas" width="800" height="600"></canvas>
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const game = { score: 0, running: true };
    const player = { x: 400, y: 300, width: 32, height: 32, speed: 5, color: '#00ff88' };
    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup',   (e) => keys[e.code] = false);

    function update() {
      if (keys['ArrowLeft']  || keys['KeyA']) player.x -= player.speed;
      if (keys['ArrowRight'] || keys['KeyD']) player.x += player.speed;
      if (keys['ArrowUp']    || keys['KeyW']) player.y -= player.speed;
      if (keys['ArrowDown']  || keys['KeyS']) player.y += player.speed;
      player.x = Math.max(0, Math.min(canvas.width  - player.width,  player.x));
      player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
    }

    function draw() {
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      ctx.fillStyle = player.color;
      ctx.fillRect(player.x, player.y, player.width, player.height);
      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.fillText('Score: ' + game.score, 20, 40);
      ctx.font = '16px Arial';
      ctx.fillText('WASD / Arrow keys: Move', 20, canvas.height - 20);
    }

    function gameLoop() {
      if (game.running) { update(); draw(); }
      requestAnimationFrame(gameLoop);
    }
    gameLoop();
  </script>
</body>
</html>
```

## Usage Guide

1. **Choose the right template**
   - 3D game → Three.js template
   - 2D game (with physics) → Phaser 3 template
   - Simple 2D game → Canvas template

2. **Create the game file**
   ```bash
   cat > "space-shooter.html" << 'EOF'
   <!-- Full game code -->
   EOF
   ```

3. **Modify game logic as needed** — add enemies, obstacles, scoring, sound effects

4. **Create artifact.json manifest**
   ```bash
   mkdir -p "tasks/${CLAUDE_SESSION_ID}"
   cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
   {
     "artifacts": [
       {
         "id": "space-shooter-game",
         "path": "space-shooter.html",
         "mimeType": "text/html",
         "description": "Space shooter game — double-click to run"
       }
     ]
   }
   EOF
   ```

5. **Tell the user to check the Artifact panel**

## Important Notes

- **Always use single-file HTML** unless the user explicitly requests a complex project
- **Import libraries via CDN** — do not use npm
- **Must create artifact.json** — otherwise the user cannot see the file
- **Do not tell the user internal sandbox paths** — direct them to the Artifact panel instead
