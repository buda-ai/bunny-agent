---
name: quick-games
description: 快速生成完整可玩的经典游戏（贪吃蛇、打砖块、太空射击等）
---

# 快速游戏生成 Skill

提供多个完整的、立即可玩的经典游戏，每个都是单文件 HTML，双击即可运行！

## 游戏列表

1. **贪吃蛇** - 经典的贪吃蛇游戏
2. **打砖块** - Breakout 风格的打砖块游戏
3. **太空射击** - 简单的太空射击游戏（2D）
4. **3D 飞行** - Three.js 3D 飞行游戏
5. **跳跃方块** - 无尽跳跃游戏

## 使用方法

选择下面任意一个完整的游戏代码，使用 write_file 保存为 .html 文件即可。

---

## 1. 贪吃蛇游戏

经典贪吃蛇，使用方向键控制。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>贪吃蛇游戏</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
      font-family: 'Arial', sans-serif;
      color: white;
    }
    h1 {
      margin-bottom: 20px;
      font-size: 48px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    #score {
      font-size: 24px;
      margin-bottom: 10px;
    }
    canvas {
      border: 4px solid white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      border-radius: 8px;
    }
    #gameOver {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      padding: 40px;
      border-radius: 15px;
      text-align: center;
      z-index: 1000;
    }
    #gameOver button {
      margin-top: 20px;
      padding: 15px 30px;
      font-size: 18px;
      background: #667eea;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
      transition: all 0.3s;
    }
    #gameOver button:hover {
      background: #764ba2;
      transform: scale(1.05);
    }
  </style>
</head>
<body>
  <h1>🐍 贪吃蛇</h1>
  <div id="score">分数: 0</div>
  <canvas id="gameCanvas" width="400" height="400"></canvas>

  <div id="gameOver">
    <h2>游戏结束！</h2>
    <p id="finalScore" style="font-size: 24px; margin: 20px 0;"></p>
    <button onclick="location.reload()">重新开始</button>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');
    const gridSize = 20;
    const tileCount = canvas.width / gridSize;

    let snake = [{ x: 10, y: 10 }];
    let food = { x: 15, y: 15 };
    let dx = 0, dy = 0;
    let score = 0;
    let gameRunning = true;

    // 键盘控制
    document.addEventListener('keydown', changeDirection);

    function changeDirection(event) {
      const key = event.key;
      if (key === 'ArrowUp' && dy === 0) { dx = 0; dy = -1; }
      else if (key === 'ArrowDown' && dy === 0) { dx = 0; dy = 1; }
      else if (key === 'ArrowLeft' && dx === 0) { dx = -1; dy = 0; }
      else if (key === 'ArrowRight' && dx === 0) { dx = 1; dy = 0; }
    }

    function gameLoop() {
      if (!gameRunning) return;

      // 移动蛇
      if (dx !== 0 || dy !== 0) {
        const head = { x: snake[0].x + dx, y: snake[0].y + dy };

        // 检查碰撞
        if (head.x < 0 || head.x >= tileCount || head.y < 0 || head.y >= tileCount ||
            snake.some(segment => segment.x === head.x && segment.y === head.y)) {
          gameOver();
          return;
        }

        snake.unshift(head);

        // 检查是否吃到食物
        if (head.x === food.x && head.y === food.y) {
          score += 10;
          document.getElementById('score').textContent = '分数: ' + score;
          placeFood();
        } else {
          snake.pop();
        }
      }

      draw();
      setTimeout(gameLoop, 100);
    }

    function draw() {
      // 背景
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 网格
      ctx.strokeStyle = '#16213e';
      for (let i = 0; i < tileCount; i++) {
        ctx.beginPath();
        ctx.moveTo(i * gridSize, 0);
        ctx.lineTo(i * gridSize, canvas.height);
        ctx.stroke();
        ctx.beginPath();
        ctx.moveTo(0, i * gridSize);
        ctx.lineTo(canvas.width, i * gridSize);
        ctx.stroke();
      }

      // 蛇
      snake.forEach((segment, index) => {
        ctx.fillStyle = index === 0 ? '#0eff00' : '#00d900';
        ctx.fillRect(
          segment.x * gridSize + 1,
          segment.y * gridSize + 1,
          gridSize - 2,
          gridSize - 2
        );
      });

      // 食物
      ctx.fillStyle = '#ff0055';
      ctx.beginPath();
      ctx.arc(
        food.x * gridSize + gridSize / 2,
        food.y * gridSize + gridSize / 2,
        gridSize / 2 - 2,
        0,
        Math.PI * 2
      );
      ctx.fill();
    }

    function placeFood() {
      food.x = Math.floor(Math.random() * tileCount);
      food.y = Math.floor(Math.random() * tileCount);

      // 确保食物不在蛇身上
      if (snake.some(segment => segment.x === food.x && segment.y === food.y)) {
        placeFood();
      }
    }

    function gameOver() {
      gameRunning = false;
      document.getElementById('gameOver').style.display = 'block';
      document.getElementById('finalScore').textContent = '最终分数: ' + score;
    }

    gameLoop();
  </script>
</body>
</html>
```

---

## 2. 打砖块游戏

经典的 Breakout 游戏，使用鼠标或键盘控制挡板。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>打砖块游戏</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: linear-gradient(135deg, #f093fb 0%, #f5576c 100%);
      font-family: Arial, sans-serif;
      color: white;
    }
    h1 {
      margin-bottom: 20px;
      font-size: 48px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.3);
    }
    #gameInfo {
      display: flex;
      gap: 30px;
      margin-bottom: 10px;
      font-size: 20px;
    }
    canvas {
      border: 4px solid white;
      box-shadow: 0 10px 30px rgba(0,0,0,0.3);
      border-radius: 8px;
      cursor: none;
    }
    #gameOver {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.9);
      padding: 40px;
      border-radius: 15px;
      text-align: center;
    }
    button {
      margin-top: 20px;
      padding: 15px 30px;
      font-size: 18px;
      background: #f5576c;
      border: none;
      border-radius: 8px;
      color: white;
      cursor: pointer;
    }
  </style>
</head>
<body>
  <h1>🧱 打砖块</h1>
  <div id="gameInfo">
    <div>分数: <span id="score">0</span></div>
    <div>生命: <span id="lives">3</span></div>
  </div>
  <canvas id="gameCanvas" width="800" height="600"></canvas>

  <div id="gameOver">
    <h2 id="endMessage"></h2>
    <p id="finalScore"></p>
    <button onclick="location.reload()">重新开始</button>
  </div>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // 游戏状态
    let score = 0;
    let lives = 3;
    let gameRunning = true;

    // 挡板
    const paddle = {
      x: canvas.width / 2 - 50,
      y: canvas.height - 30,
      width: 100,
      height: 15,
      speed: 8
    };

    // 球
    const ball = {
      x: canvas.width / 2,
      y: canvas.height / 2,
      radius: 8,
      dx: 4,
      dy: -4
    };

    // 砖块
    const brickRowCount = 5;
    const brickColumnCount = 10;
    const brickWidth = 70;
    const brickHeight = 20;
    const brickPadding = 5;
    const brickOffsetTop = 50;
    const brickOffsetLeft = 35;

    const bricks = [];
    for (let c = 0; c < brickColumnCount; c++) {
      bricks[c] = [];
      for (let r = 0; r < brickRowCount; r++) {
        bricks[c][r] = { x: 0, y: 0, status: 1, color: getColor(r) };
      }
    }

    function getColor(row) {
      const colors = ['#ff6b6b', '#4ecdc4', '#ffe66d', '#95e1d3', '#f38181'];
      return colors[row % colors.length];
    }

    // 控制
    const keys = {};
    document.addEventListener('keydown', e => keys[e.key] = true);
    document.addEventListener('keyup', e => keys[e.key] = false);
    canvas.addEventListener('mousemove', e => {
      const rect = canvas.getBoundingClientRect();
      paddle.x = e.clientX - rect.left - paddle.width / 2;
      paddle.x = Math.max(0, Math.min(canvas.width - paddle.width, paddle.x));
    });

    function drawBall() {
      ctx.beginPath();
      ctx.arc(ball.x, ball.y, ball.radius, 0, Math.PI * 2);
      ctx.fillStyle = '#fff';
      ctx.fill();
      ctx.closePath();
    }

    function drawPaddle() {
      ctx.fillStyle = '#fff';
      ctx.fillRect(paddle.x, paddle.y, paddle.width, paddle.height);
    }

    function drawBricks() {
      for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
          if (bricks[c][r].status === 1) {
            const brickX = c * (brickWidth + brickPadding) + brickOffsetLeft;
            const brickY = r * (brickHeight + brickPadding) + brickOffsetTop;
            bricks[c][r].x = brickX;
            bricks[c][r].y = brickY;
            ctx.fillStyle = bricks[c][r].color;
            ctx.fillRect(brickX, brickY, brickWidth, brickHeight);
          }
        }
      }
    }

    function collisionDetection() {
      for (let c = 0; c < brickColumnCount; c++) {
        for (let r = 0; r < brickRowCount; r++) {
          const b = bricks[c][r];
          if (b.status === 1) {
            if (ball.x > b.x && ball.x < b.x + brickWidth &&
                ball.y > b.y && ball.y < b.y + brickHeight) {
              ball.dy = -ball.dy;
              b.status = 0;
              score += 10;
              document.getElementById('score').textContent = score;

              // 检查胜利
              if (score === brickRowCount * brickColumnCount * 10) {
                endGame('胜利！🎉', true);
              }
            }
          }
        }
      }
    }

    function update() {
      if (!gameRunning) return;

      // 键盘控制挡板
      if (keys['ArrowLeft'] && paddle.x > 0) {
        paddle.x -= paddle.speed;
      }
      if (keys['ArrowRight'] && paddle.x < canvas.width - paddle.width) {
        paddle.x += paddle.speed;
      }

      // 移动球
      ball.x += ball.dx;
      ball.y += ball.dy;

      // 墙壁碰撞
      if (ball.x + ball.radius > canvas.width || ball.x - ball.radius < 0) {
        ball.dx = -ball.dx;
      }
      if (ball.y - ball.radius < 0) {
        ball.dy = -ball.dy;
      }

      // 挡板碰撞
      if (ball.y + ball.radius > paddle.y &&
          ball.x > paddle.x && ball.x < paddle.x + paddle.width) {
        ball.dy = -ball.dy;
        // 根据击球位置改变角度
        const hitPos = (ball.x - paddle.x) / paddle.width;
        ball.dx = (hitPos - 0.5) * 8;
      }

      // 球掉落
      if (ball.y + ball.radius > canvas.height) {
        lives--;
        document.getElementById('lives').textContent = lives;
        if (lives === 0) {
          endGame('游戏结束', false);
        } else {
          ball.x = canvas.width / 2;
          ball.y = canvas.height / 2;
          ball.dx = 4;
          ball.dy = -4;
        }
      }

      collisionDetection();
    }

    function draw() {
      ctx.fillStyle = '#1a1a2e';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      drawBricks();
      drawBall();
      drawPaddle();
    }

    function gameLoop() {
      update();
      draw();
      if (gameRunning) {
        requestAnimationFrame(gameLoop);
      }
    }

    function endGame(message, won) {
      gameRunning = false;
      document.getElementById('endMessage').textContent = message;
      document.getElementById('finalScore').textContent = '最终分数: ' + score;
      document.getElementById('gameOver').style.display = 'block';
    }

    gameLoop();
  </script>
</body>
</html>
```

---

## 3. 3D 太空飞行游戏

使用 Three.js 的 3D 太空飞行游戏，躲避障碍物。

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>3D 太空飞行</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      overflow: hidden;
      font-family: Arial, sans-serif;
      background: #000;
    }
    canvas { display: block; }
    #hud {
      position: absolute;
      top: 20px;
      left: 20px;
      color: white;
      font-size: 24px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      z-index: 100;
    }
    #instructions {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      background: rgba(0,0,0,0.7);
      padding: 15px 25px;
      border-radius: 8px;
      text-align: center;
    }
    #gameOver {
      display: none;
      position: fixed;
      top: 50%;
      left: 50%;
      transform: translate(-50%, -50%);
      background: rgba(0,0,0,0.95);
      padding: 40px;
      border-radius: 15px;
      text-align: center;
      color: white;
      z-index: 1000;
    }
    button {
      margin-top: 20px;
      padding: 15px 30px;
      font-size: 18px;
      background: #00ff88;
      border: none;
      border-radius: 8px;
      color: black;
      cursor: pointer;
      font-weight: bold;
    }
  </style>
</head>
<body>
  <div id="hud">
    <div>分数: <span id="score">0</span></div>
    <div>速度: <span id="speed">1.0x</span></div>
  </div>

  <div id="instructions">
    <strong>控制</strong><br>
    鼠标移动/触摸: 控制飞船 | 空格: 加速
  </div>

  <div id="gameOver">
    <h1>💥 游戏结束</h1>
    <p id="finalScore" style="font-size: 24px; margin: 20px 0;"></p>
    <button onclick="location.reload()">重新开始</button>
  </div>

  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script>
    let scene, camera, renderer, player;
    let obstacles = [];
    let score = 0;
    let speed = 0.1;
    let gameRunning = true;

    const mouse = { x: 0, y: 0 };

    function init() {
      // 场景
      scene = new THREE.Scene();
      scene.fog = new THREE.Fog(0x000510, 10, 100);

      // 相机
      camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
      camera.position.z = 10;

      // 渲染器
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      document.body.appendChild(renderer.domElement);

      // 星空背景
      createStars();

      // 玩家飞船
      const geometry = new THREE.ConeGeometry(0.5, 2, 4);
      const material = new THREE.MeshBasicMaterial({ color: 0x00ff88 });
      player = new THREE.Mesh(geometry, material);
      player.rotation.x = Math.PI / 2;
      scene.add(player);

      // 光照
      const light = new THREE.PointLight(0xffffff, 1, 100);
      light.position.copy(camera.position);
      scene.add(light);

      // 事件
      window.addEventListener('resize', onWindowResize);
      document.addEventListener('mousemove', onMouseMove);
      document.addEventListener('touchmove', onTouchMove);
      document.addEventListener('keydown', onKeyDown);

      animate();
    }

    function createStars() {
      const geometry = new THREE.BufferGeometry();
      const vertices = [];
      for (let i = 0; i < 1000; i++) {
        vertices.push(
          Math.random() * 200 - 100,
          Math.random() * 200 - 100,
          Math.random() * 200 - 100
        );
      }
      geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
      const material = new THREE.PointsMaterial({ color: 0xffffff, size: 0.1 });
      const stars = new THREE.Points(geometry, material);
      scene.add(stars);
    }

    function createObstacle() {
      const geometry = new THREE.BoxGeometry(
        Math.random() * 2 + 1,
        Math.random() * 2 + 1,
        Math.random() * 2 + 1
      );
      const material = new THREE.MeshBasicMaterial({
        color: Math.random() * 0xffffff,
        wireframe: true
      });
      const obstacle = new THREE.Mesh(geometry, material);
      obstacle.position.set(
        (Math.random() - 0.5) * 20,
        (Math.random() - 0.5) * 15,
        -50
      );
      obstacle.userData.speed = speed;
      scene.add(obstacle);
      obstacles.push(obstacle);
    }

    function onMouseMove(event) {
      mouse.x = (event.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(event.clientY / window.innerHeight) * 2 + 1;
    }

    function onTouchMove(event) {
      if (event.touches.length > 0) {
        mouse.x = (event.touches[0].clientX / window.innerWidth) * 2 - 1;
        mouse.y = -(event.touches[0].clientY / window.innerHeight) * 2 + 1;
      }
    }

    function onKeyDown(event) {
      if (event.code === 'Space') {
        speed = Math.min(speed + 0.02, 0.5);
        document.getElementById('speed').textContent = (speed * 10).toFixed(1) + 'x';
      }
    }

    function checkCollision() {
      obstacles.forEach(obstacle => {
        const distance = player.position.distanceTo(obstacle.position);
        if (distance < 1.5) {
          gameOver();
        }
      });
    }

    function update() {
      if (!gameRunning) return;

      // 移动玩家
      player.position.x += (mouse.x * 8 - player.position.x) * 0.1;
      player.position.y += (mouse.y * 6 - player.position.y) * 0.1;

      // 移动障碍物
      obstacles.forEach((obstacle, index) => {
        obstacle.position.z += speed * 5;
        obstacle.rotation.x += 0.01;
        obstacle.rotation.y += 0.01;

        if (obstacle.position.z > 10) {
          scene.remove(obstacle);
          obstacles.splice(index, 1);
          score += 10;
          document.getElementById('score').textContent = score;

          // 增加难度
          if (score % 100 === 0) {
            speed += 0.01;
            document.getElementById('speed').textContent = (speed * 10).toFixed(1) + 'x';
          }
        }
      });

      // 生成新障碍物
      if (Math.random() < 0.02) {
        createObstacle();
      }

      checkCollision();
    }

    function animate() {
      requestAnimationFrame(animate);
      update();
      renderer.render(scene, camera);
    }

    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    function gameOver() {
      gameRunning = false;
      document.getElementById('gameOver').style.display = 'block';
      document.getElementById('finalScore').textContent = '最终分数: ' + score;
    }

    init();
  </script>
</body>
</html>
```

---

## 使用建议

1. **选择合适的游戏**：根据用户需求选择对应的游戏类型
2. **保存游戏文件**：使用有意义的文件名（如 `snake-game.html`）
3. **创建 artifact.json**：让用户可以在 UI 中下载
4. **告知用户**：指引用户查看 Artifact 面板

## 修改建议

- 调整游戏难度：修改速度、生成频率等参数
- 更改颜色方案：修改 CSS 和游戏对象的颜色
- 添加新功能：比如音效、粒子效果、新的游戏机制
- 优化UI：改进 HUD 显示和游戏结束界面

所有游戏都使用简单的 JavaScript 编写，易于理解和修改！

## 完整使用流程

### 步骤 1：创建游戏文件
```bash
# 选择上面任意一个游戏的完整代码
# 使用描述性的文件名，包含 .html 扩展名
cat > "snake-game.html" << 'EOF'
<!-- 粘贴完整的游戏代码 -->
EOF
```

### 步骤 2：创建 artifact.json
```bash
# 创建清单文件
mkdir -p "tasks/${CLAUDE_SESSION_ID}"
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "snake-game",
      "path": "snake-game.html",
      "mimeType": "text/html",
      "description": "贪吃蛇游戏 - 使用方向键控制"
    }
  ]
}
EOF
```

### 步骤 3：告知用户
```
✅ 贪吃蛇游戏已生成完成！

📦 游戏文件已添加到右侧 Artifact 面板

🎮 如何游玩:
1. 点击右侧面板中的 "snake-game.html"
2. 点击"Download"按钮下载到本地
3. 双击下载的 .html 文件即可开始游戏

🎯 控制说明:
- 方向键: 控制蛇的移动方向
- 目标: 吃到红色食物，避免撞到自己

💡 提示: 这是单文件 HTML 游戏，可以分享给朋友直接游玩！
```

## 重要提醒

- **必须创建 artifact.json** - 这是用户获取游戏的唯一方式
- **文件名包含 .html** - 确保下载后可以直接打开
- **使用 text/html 作为 mimeType** - 浏览器能正确识别文件类型
- **不要告诉用户沙箱路径** - 改为指引查看 Artifact 面板
- **每个游戏使用独特的文件名** - 如 `snake-game.html`、`breakout-game.html`
