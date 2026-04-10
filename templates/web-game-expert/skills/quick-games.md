---
name: quick-games
description: Quickly generate complete playable classic games (Snake, Breakout, Space Shooter, etc.)
---

# Quick Game Generation Skill

Provides multiple complete, immediately playable classic games — each is a single-file HTML, double-click to run!

## Game List

1. **Snake** - Classic snake game
2. **Breakout** - Breakout-style brick-breaking game
3. **3D Space Flight** - Three.js 3D space flight game

## Usage

Pick any complete game code below and save it as a `.html` file using `write_file`.

---

## 1. Snake Game

Classic snake, controlled with arrow keys.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Snake Game</title>
  <style>
    * { margin: 0; padding: 0; }
    body { display: flex; flex-direction: column; justify-content: center; align-items: center;
           min-height: 100vh; background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
           font-family: Arial, sans-serif; color: white; }
    h1 { margin-bottom: 20px; font-size: 48px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
    #score { font-size: 24px; margin-bottom: 10px; }
    canvas { border: 4px solid white; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border-radius: 8px; }
    #gameOver { display: none; position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%); background: rgba(0,0,0,0.9);
                padding: 40px; border-radius: 15px; text-align: center; z-index: 1000; }
    #gameOver button { margin-top: 20px; padding: 15px 30px; font-size: 18px;
                       background: #667eea; border: none; border-radius: 8px;
                       color: white; cursor: pointer; }
  </style>
</head>
<body>
  <h1>🐍 Snake</h1>
  <div id="score">Score: 0</div>
  <canvas id="gameCanvas" width="400" height="400"></canvas>
  <div id="gameOver">
    <h2>Game Over!</h2>
    <p id="finalScore" style="font-size: 24px; margin: 20px 0;"></p>
    <button onclick="location.reload()">Play Again</button>
  </div>
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const gridSize = 20, tileCount = canvas.width / gridSize;
    let snake = [{ x: 10, y: 10 }], food = { x: 15, y: 15 };
    let dx = 0, dy = 0, score = 0, gameRunning = true;

    document.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowUp'    && dy === 0) { dx = 0;  dy = -1; }
      if (event.key === 'ArrowDown'  && dy === 0) { dx = 0;  dy =  1; }
      if (event.key === 'ArrowLeft'  && dx === 0) { dx = -1; dy =  0; }
      if (event.key === 'ArrowRight' && dx === 0) { dx =  1; dy =  0; }
    });

    function gameLoop() {
      if (!gameRunning) return;
      if (dx !== 0 || dy !== 0) {
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };
        if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount ||
            snake.some(s => s.x === head.x && s.y === head.y)) {
          gameRunning = false;
          document.getElementById('gameOver').style.display = 'block';
          document.getElementById('finalScore').textContent = 'Final Score: ' + score;
          return;
        }
        snake.unshift(head);
        if (head.x === food.x && head.y === food.y) {
          score += 10;
          document.getElementById('score').textContent = 'Score: ' + score;
          do { food.x = Math.floor(Math.random() * tileCount);
               food.y = Math.floor(Math.random() * tileCount); }
          while (snake.some(s => s.x === food.x && s.y === food.y));
        } else { snake.pop(); }
      }
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);
      snake.forEach((seg, i) => {
        ctx.fillStyle = i === 0 ? '#0eff00' : '#00d900';
        ctx.fillRect(seg.x * gridSize + 1, seg.y * gridSize + 1, gridSize - 2, gridSize - 2);
      });
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(food.x * gridSize + gridSize / 2, food.y * gridSize + gridSize / 2, gridSize / 2 - 2, 0, Math.PI * 2);
      ctx.fill();
      setTimeout(gameLoop, 100);
    }
    gameLoop();
  </script>
</body>
</html>
```

---

## 2. Breakout Game

Classic Breakout — use mouse or keyboard to control the paddle.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Breakout Game</title>
  <style>
    * { margin: 0; padding: 0; }
    body { display: flex; flex-direction: column; justify-content: center; align-items: center;
           min-height: 100vh; background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
           font-family: Arial, sans-serif; color: white; }
    h1 { margin-bottom: 20px; font-size: 48px; text-shadow: 2px 2px 4px rgba(0,0,0,0.3); }
    #gameInfo { display: flex; gap: 30px; margin-bottom: 10px; font-size: 20px; }
    canvas { border: 4px solid white; box-shadow: 0 10px 30px rgba(0,0,0,0.3); border-radius: 8px; cursor: none; }
    #gameOver { display: none; position: fixed; top: 50%; left: 50%;
                transform: translate(-50%, -50%); background: rgba(0,0,0,0.9);
                padding: 40px; border-radius: 15px; text-align: center; }
    button { margin-top: 20px; padding: 15px 30px; font-size: 18px;
             background: #f5576c; border: none; border-radius: 8px; color: white; cursor: pointer; }
  </style>
</head>
<body>
  <h1>🧱 Breakout</h1>
  <div id="gameInfo">
    <div>Score: <span id="score">0</span></div>
    <div>Lives: <span id="lives">3</span></div>
  </div>
  <canvas id="gameCanvas" width="800" height="600"></canvas>
  <div id="gameOver">
    <h2 id="endMessage"></h2>
    <p id="finalScore"></p>
    <button onclick="location.reload()">Play Again</button>
  </div>
  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    let score = 0, lives = 3, gameRunning = true;
    const paddle = { x: canvas.width / 2 - 50, y: canvas.height - 30, width: 100, height: 15, speed: 8 };
    const ball = { x: canvas.width / 2, y: canvas.height / 2, radius: 8, dx: 4, dy: -4 };
    const brickRowCount = 5, brickColumnCount = 10;
    const brickWidth = 70, brickHeight = 20, brickPadding = 5;
    const brickOffsetTop = 50, brickOffsetLeft = 35;
    const colors = ['#ff6b6b','#4ecdc4','#ffe66d','#95e1d3','#f38181'];
    const bricks = Array.from({ length: brickColumnCount }, (_, c) =>
      Array.from({ length: brickRowCount }, (_, r) => ({ x: 0, y: 0, status: 1, color: colors[r % colors.length] }))
    );
    const keys = {};
    document.addEventListener('keydown', e => keys[e.key] = true);
    document.addEventListener('keyup',   e => keys[e.key] = false);
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, e.clientX - rect.left - paddle.width / 2));
    });
    function update() {
      if (!gameRunning) return;
      if (keys['ArrowLeft']  && paddle.x > 0)                        paddle.x -= paddle.speed;
      if (keys['ArrowRight'] && paddle.x < canvas.width - paddle.width) paddle.x += paddle.speed;
      ball.x += ball.dx; ball.y += ball.dy;
      if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) ball.dx = -ball.dx;
      if (ball.y - ball.radius < 0) ball.dy = -ball.dy;
      if (ball.y + ball.radius > paddle.y && ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
        ball.dy = -ball.dy;
        ball.dx = ((ball.x - paddle.x) / paddle.width - 0.5) * 8;
      }
      if (ball.y + ball.radius > canvas.height) {
        lives--;
        document.getElementById('lives').textContent = lives;
        if (lives === 0) { gameRunning = false; document.getElementById('endMessage').textContent = 'Game Over';
          document.getElementById('finalScore').textContent = 'Final Score: ' + score;
          document.getElementById('gameOver').style.display = 'block'; return; }
        ball.x = canvas.width / 2; ball.y = canvas.height / 2; ball.dx = 4; ball.dy = -4;
      }
      for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
          const b = bricks[c][r];
          if (b.status !== 1) continue;
          const bx = c * (brickWidth + brickPadding) + brickOffsetLeft;
          const by = r * (brickHeight + brickPadding) + brickOffsetTop;
          b.x = bx; b.y = by;
          if (ball.x > bx && ball.x < bx + brickWidth && ball.y > by && ball.y < by + brickHeight) {
            ball.dy = -ball.dy; b.status = 0; score += 10;
            document.getElementById('score').textContent = score;
            if (score === brickRowCount * brickColumnCount * 10) {
              gameRunning = false; document.getElementById('endMessage').textContent = 'You Win! 🎉';
              document.getElementById('finalScore').textContent = 'Final Score: ' + score;
              document.getElementById('gameOver').style.display = 'block';
            }
          }
        }
      }
    }
    function draw() {
      ctx.fillStyle = '#1a1a2e'; ctx.fillRect(0, 0, canvas.width, canvas.height);
      for (let c = 0; c < brickColumnCount; c++)
        for (let r = 0; r < brickRowCount; r++)
          if (bricks[c][r].status === 1) {
            ctx.fillStyle = bricks[c][r].color;
            ctx.fillRect(bricks[c][r].x, bricks[c][r].y, brickWidth, brickHeight);
          }
      ctx.beginPath(); ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#fff'; ctx.fill();
      ctx.fillStyle = '#fff'; ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    }
    function gameLoop() { update(); draw(); if (gameRunning) requestAnimationFrame(gameLoop); }
    gameLoop();
  </script>
</body>
</html>
```

---

## 3. 3D Space Flight Game

Three.js 3D space flight — dodge obstacles.

```html
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D Space Flight</title>
  <style>
    * { margin: 0; padding: 0; }
    body { overflow: hidden; font-family: Arial, sans-serif; background: #000; }
    canvas { display: block; }
    #hud { position: absolute; top: 20px; left: 20px; color: white; font-size: 24px;
           text-shadow: 2px 2px 4px rgba(0,0,0,0.8); z-index: 100; }
    #instructions { position: absolute; bottom: 20px; left: 50%; transform: translateX(-50%);
                    color: white; background: rgba(0,0,0,0.7); padding: 15px 25px; border-radius: 8px; text-align: center; }
    #gameOver { display: none; position: fixed; top: 50%; left: 50%; transform: translate(-50%, -50%);
                background: rgba(0,0,0,0.95); padding: 40px; border-radius: 15px;
                text-align: center; color: white; z-index: 1000; }
    button { margin-top: 20px; padding: 15px 30px; font-size: 18px; background: #00ff88;
             border: none; border-radius: 8px; color: black; cursor: pointer; font-weight: bold; }
  </style>
</head>
<body>
  <div id="hud">
    <div>Score: <span id="score">0</span></div>
    <div>Speed: <span id="speed">1.0x</span></div>
  </div>
  <div id="instructions"><strong>Controls</strong><br>Mouse / Touch: steer | Space: boost</div>
  <div id="gameOver">
    <h1>💥 Game Over</h1>
    <p id="finalScore" style="font-size: 24px; margin: 20px 0;"></p>
    <button onclick="location.reload()">Play Again</button>
  </div>
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script>
    let scene, camera, renderer, player;
    let obstacles = [], score = 0, speed = 0.1, gameRunning = true;
    const mouse = { x: 0, y: 0 };

    function init() {
      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000510, 10, 100);
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 10;
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      document.body.appendChild(renderer.domElement);

      const vertices = [];
      for (let i = 0; i < 1000; i++) vertices.push((Math.random()-0.5)*200, (Math.random()-0.5)*200, (Math.random()-0.5)*200);
      const geo = new THREE.BufferGeometry();
      geo.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      scene.add(new THREE.Points(geo, new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 })));

      const playerGeo = new THREE.ConeGeometry(0.5, 2, 4);
      const playerMat = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      player = new THREE.Mesh(playerGeo, playerMat);
      player.rotation.x = Math.PI / 2;
      scene.add(player);
      scene.add(new THREE.PointLight(0xffffff, 1, 100));

      window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
      });
      document.addEventListener('mousemove', e => {
        mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
      });
      document.addEventListener('touchmove', e => {
        if (e.touches.length > 0) {
          mouse.x = (e.touches[0].clientX / window.innerWidth) * 2 - 1;
          mouse.y = -(e.touches[0].clientY / window.innerHeight) * 2 + 1;
        }
      });
      document.addEventListener('keydown', e => {
        if (e.code === 'Space') {
          speed = Math.min(speed + 0.02, 0.5);
          document.getElementById('speed').textContent = (speed * 10).toFixed(1) + 'x';
        }
      });
      animate();
    }

    function spawnObstacle() {
      const geo = new THREE.BoxGeometry(Math.random()*2+1, Math.random()*2+1, Math.random()*2+1);
      const mat = new THREE.MeshBasicMaterial({ color: Math.random()*0xffffff, wireframe: true });
      const obs = new THREE.Mesh(geo, mat);
      obs.position.set((Math.random()-0.5)*20, (Math.random()-0.5)*15, -50);
      scene.add(obs); obstacles.push(obs);
    }

    function animate() {
      requestAnimationFrame(animate);
      if (!gameRunning) return;
      player.position.x += (mouse.x * 8 - player.position.x) * 0.1;
      player.position.y += (mouse.y * 6 - player.position.y) * 0.1;
      obstacles.forEach((obs, i) => {
        obs.position.z += speed * 5;
        obs.rotation.x += 0.01; obs.rotation.y += 0.01;
        if (obs.position.z > 10) {
          scene.remove(obs); obstacles.splice(i, 1); score += 10;
          document.getElementById('score').textContent = score;
          if (score % 100 === 0) { speed += 0.01; document.getElementById('speed').textContent = (speed*10).toFixed(1)+'x'; }
        }
        if (player.position.distanceTo(obs.position) < 1.5) {
          gameRunning = false;
          document.getElementById('gameOver').style.display = 'block';
          document.getElementById('finalScore').textContent = 'Final Score: ' + score;
        }
      });
      if (Math.random() < 0.02) spawnObstacle();
      renderer.render(scene, camera);
    }
    init();
  </script>
</body>
</html>
```

---

## Usage Flow

### Step 1: Create the game file
```bash
cat > "snake-game.html" << 'EOF'
<!-- Paste the full game code here -->
EOF
```

### Step 2: Create artifact.json
```bash
mkdir -p "tasks/${CLAUDE_SESSION_ID}"
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "snake-game",
      "path": "snake-game.html",
      "mimeType": "text/html",
      "description": "Snake game — use arrow keys to control"
    }
  ]
}
EOF
```

### Step 3: Tell the user
```
Snake game generated!

The game file has been added to the Artifact panel on the right.

How to play:
1. Click "snake-game.html" in the right panel
2. Click "Download" to download it locally
3. Double-click the downloaded .html file to start playing

Controls: Arrow keys to change direction. Eat the red food, avoid hitting yourself!
```

## Important Reminders

- **Must create artifact.json** — this is the only way for the user to get the file
- **File name must include .html** — so it can be opened directly after download
- **Use text/html as mimeType** — so the browser recognizes the file type
- **Do not tell the user sandbox paths** — direct them to the Artifact panel instead
