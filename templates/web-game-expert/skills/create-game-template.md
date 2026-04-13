---
name: create-game-template
description: 快速创建即开即用的单文件 HTML 游戏模板（无需构建工具）
---

# 创建游戏模板 Skill

快速创建完整的单文件 HTML 游戏，双击即可在浏览器中运行！

## 使用场景

当用户要求创建游戏时，使用此 skill 快速生成可运行的游戏模板。

## 模板选项

### 模板 1: Three.js 3D 游戏（推荐）

适用于：3D 游戏、太空射击、赛车、平台跳跃等

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Three.js 3D 游戏</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      font-family: Arial, sans-serif;
      overflow: hidden;
      background: #000;
    }
    canvas { display: block; }

    #hud {
      position: absolute;
      top: 20px;
      left: 20px;
      color: white;
      font-size: 18px;
      text-shadow: 2px 2px 4px rgba(0,0,0,0.8);
      z-index: 100;
    }

    #instructions {
      position: absolute;
      bottom: 20px;
      left: 50%;
      transform: translateX(-50%);
      color: white;
      text-align: center;
      font-size: 14px;
      background: rgba(0,0,0,0.7);
      padding: 15px 25px;
      border-radius: 8px;
    }
  </style>
</head>
<body>
  <!-- HUD 显示 -->
  <div id="hud">
    <div>分数: <span id="score">0</span></div>
    <div>生命: <span id="lives">3</span></div>
  </div>

  <!-- 操作说明 -->
  <div id="instructions">
    <div><strong>控制说明</strong></div>
    <div>WASD/方向键: 移动 | 空格: 动作 | ESC: 暂停</div>
  </div>

  <!-- Three.js CDN -->
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>

  <script>
    // ========== 游戏状态 ==========
    let scene, camera, renderer;
    let gameState = {
      score: 0,
      lives: 3,
      paused: false
    };

    // ========== 初始化 ==========
    function init() {
      // 场景
      scene = new THREE.Scene();
      scene.background = new THREE.Color(0x001020);
      scene.fog = new THREE.Fog(0x001020, 10, 50);

      // 相机
      camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
      );
      camera.position.set(0, 5, 10);
      camera.lookAt(0, 0, 0);

      // 渲染器
      renderer = new THREE.WebGLRenderer({ antialias: true });
      renderer.setSize(window.innerWidth, window.innerHeight);
      renderer.shadowMap.enabled = true;
      document.body.appendChild(renderer.domElement);

      // 光照
      const ambientLight = new THREE.AmbientLight(0x404040, 0.5);
      scene.add(ambientLight);

      const directionalLight = new THREE.DirectionalLight(0xffffff, 1);
      directionalLight.position.set(5, 10, 5);
      directionalLight.castShadow = true;
      scene.add(directionalLight);

      // 创建游戏对象
      createGameObjects();

      // 事件监听
      window.addEventListener('resize', onWindowResize);
      window.addEventListener('keydown', onKeyDown);
      window.addEventListener('keyup', onKeyUp);

      // 开始游戏循环
      animate();
    }

    // ========== 创建游戏对象 ==========
    function createGameObjects() {
      // 地面
      const groundGeometry = new THREE.PlaneGeometry(50, 50);
      const groundMaterial = new THREE.MeshStandardMaterial({
        color: 0x2a4a2a,
        roughness: 0.8
      });
      const ground = new THREE.Mesh(groundGeometry, groundMaterial);
      ground.rotation.x = -Math.PI / 2;
      ground.receiveShadow = true;
      scene.add(ground);

      // 玩家（示例立方体）
      const playerGeometry = new THREE.BoxGeometry(1, 1, 1);
      const playerMaterial = new THREE.MeshStandardMaterial({ color: 0x00ff88 });
      const player = new THREE.Mesh(playerGeometry, playerMaterial);
      player.position.y = 0.5;
      player.castShadow = true;
      scene.add(player);

      // 保存引用以便后续使用
      window.player = player;
    }

    // ========== 输入处理 ==========
    const keys = {};

    function onKeyDown(event) {
      keys[event.code] = true;

      if (event.code === 'Escape') {
        gameState.paused = !gameState.paused;
      }

      if (event.code === 'Space') {
        // 空格键动作
        console.log('空格键按下');
      }
    }

    function onKeyUp(event) {
      keys[event.code] = false;
    }

    // ========== 游戏更新 ==========
    function update(deltaTime) {
      if (gameState.paused) return;

      // 玩家移动
      if (window.player) {
        const moveSpeed = 5 * deltaTime;

        if (keys['KeyW'] || keys['ArrowUp']) {
          window.player.position.z -= moveSpeed;
        }
        if (keys['KeyS'] || keys['ArrowDown']) {
          window.player.position.z += moveSpeed;
        }
        if (keys['KeyA'] || keys['ArrowLeft']) {
          window.player.position.x -= moveSpeed;
        }
        if (keys['KeyD'] || keys['ArrowRight']) {
          window.player.position.x += moveSpeed;
        }
      }

      // 更新其他游戏逻辑
      // ...
    }

    // ========== 更新 UI ==========
    function updateUI() {
      document.getElementById('score').textContent = gameState.score;
      document.getElementById('lives').textContent = gameState.lives;
    }

    // ========== 游戏循环 ==========
    let lastTime = 0;

    function animate(currentTime = 0) {
      requestAnimationFrame(animate);

      const deltaTime = (currentTime - lastTime) / 1000;
      lastTime = currentTime;

      update(deltaTime);
      renderer.render(scene, camera);
    }

    // ========== 窗口大小调整 ==========
    function onWindowResize() {
      camera.aspect = window.innerWidth / window.innerHeight;
      camera.updateProjectionMatrix();
      renderer.setSize(window.innerWidth, window.innerHeight);
    }

    // ========== 启动游戏 ==========
    init();
    updateUI();
  </script>
</body>
</html>
```

### 模板 2: Phaser 3 2D 游戏

适用于：2D 游戏、平台游戏、射击游戏等

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Phaser 3 2D 游戏</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #222;
      font-family: Arial, sans-serif;
    }
  </style>
</head>
<body>
  <!-- Phaser 3 CDN -->
  <script src="https://cdn.jsdelivr.net/npm/phaser@3.70.0/dist/phaser.min.js"></script>

  <script>
    // 游戏配置
    const config = {
      type: Phaser.AUTO,
      width: 800,
      height: 600,
      backgroundColor: '#2d2d2d',
      physics: {
        default: 'arcade',
        arcade: {
          gravity: { y: 300 },
          debug: false
        }
      },
      scene: {
        preload: preload,
        create: create,
        update: update
      }
    };

    // 游戏变量
    let player;
    let cursors;
    let score = 0;
    let scoreText;

    // 创建游戏
    const game = new Phaser.Game(config);

    function preload() {
      // 这里可以加载资源
      // 由于是单文件示例，我们使用程序化图形
    }

    function create() {
      // 添加分数文本
      scoreText = this.add.text(16, 16, '分数: 0', {
        fontSize: '24px',
        fill: '#fff'
      });

      // 创建玩家（使用简单的矩形）
      player = this.add.rectangle(400, 300, 32, 48, 0x00ff88);
      this.physics.add.existing(player);
      player.body.setBounce(0.2);
      player.body.setCollideWorldBounds(true);

      // 创建平台
      const platforms = this.physics.add.staticGroup();
      platforms.create(400, 568, null).setDisplaySize(800, 32).refreshBody();
      platforms.children.entries.forEach(platform => {
        platform.setFillStyle(0x4a4a4a);
      });

      // 添加碰撞
      this.physics.add.collider(player, platforms);

      // 输入控制
      cursors = this.input.keyboard.createCursorKeys();
    }

    function update() {
      // 玩家移动
      if (cursors.left.isDown) {
        player.body.setVelocityX(-160);
      } else if (cursors.right.isDown) {
        player.body.setVelocityX(160);
      } else {
        player.body.setVelocityX(0);
      }

      // 跳跃
      if (cursors.up.isDown && player.body.touching.down) {
        player.body.setVelocityY(-330);
      }
    }
  </script>
</body>
</html>
```

### 模板 3: 纯 Canvas 2D 游戏

适用于：简单的 2D 游戏、像素游戏等

```html
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Canvas 2D 游戏</title>
  <style>
    * { margin: 0; padding: 0; }
    body {
      display: flex;
      justify-content: center;
      align-items: center;
      min-height: 100vh;
      background: #1a1a1a;
      font-family: Arial, sans-serif;
    }
    canvas {
      border: 2px solid #444;
      background: #000;
    }
  </style>
</head>
<body>
  <canvas id="gameCanvas" width="800" height="600"></canvas>

  <script>
    const canvas = document.getElementById('gameCanvas');
    const ctx = canvas.getContext('2d');

    // 游戏状态
    const game = {
      score: 0,
      running: true
    };

    // 玩家
    const player = {
      x: 400,
      y: 300,
      width: 32,
      height: 32,
      speed: 5,
      color: '#00ff88'
    };

    // 输入
    const keys = {};
    window.addEventListener('keydown', (e) => keys[e.code] = true);
    window.addEventListener('keyup', (e) => keys[e.code] = false);

    // 更新游戏
    function update() {
      // 玩家移动
      if (keys['ArrowLeft'] || keys['KeyA']) player.x -= player.speed;
      if (keys['ArrowRight'] || keys['KeyD']) player.x += player.speed;
      if (keys['ArrowUp'] || keys['KeyW']) player.y -= player.speed;
      if (keys['ArrowDown'] || keys['KeyS']) player.y += player.speed;

      // 边界检查
      player.x = Math.max(0, Math.min(canvas.width - player.width, player.x));
      player.y = Math.max(0, Math.min(canvas.height - player.height, player.y));
    }

    // 绘制游戏
    function draw() {
      // 清空画布
      ctx.fillStyle = '#000';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // 绘制玩家
      ctx.fillStyle = player.color;
      ctx.fillRect(player.x, player.y, player.width, player.height);

      // 绘制分数
      ctx.fillStyle = '#fff';
      ctx.font = '24px Arial';
      ctx.fillText('分数: ' + game.score, 20, 40);

      // 绘制控制说明
      ctx.font = '16px Arial';
      ctx.fillText('WASD/方向键: 移动', 20, canvas.height - 20);
    }

    // 游戏循环
    function gameLoop() {
      if (game.running) {
        update();
        draw();
      }
      requestAnimationFrame(gameLoop);
    }

    // 启动游戏
    gameLoop();
  </script>
</body>
</html>
```

## 使用指南

### 创建游戏的步骤

1. **选择合适的模板**
   - 3D 游戏 → Three.js 模板
   - 2D 游戏（需要物理）→ Phaser 3 模板
   - 简单 2D 游戏 → Canvas 模板

2. **创建游戏文件**
   ```bash
   # 选择上面某个模板的完整代码
   # 使用有意义的文件名，包含 .html 扩展名
   cat > "space-shooter.html" << 'EOF'
   <!-- 完整的游戏代码 -->
   EOF
   ```

3. **根据需求修改游戏逻辑**
   - 添加敌人、障碍物
   - 实现碰撞检测
   - 添加分数系统
   - 添加音效（可选）

4. **创建 artifact.json 清单**
   ```bash
   # 使用 /artifact skill 或手动创建
   mkdir -p "tasks/${CLAUDE_SESSION_ID}"
   cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
   {
     "artifacts": [
       {
         "id": "space-shooter-game",
         "path": "space-shooter.html",
         "mimeType": "text/html",
         "description": "太空射击游戏 - 双击即可运行"
       }
     ]
   }
   EOF
   ```

5. **告知用户查看 Artifact 面板**
   ```
   ✅ 游戏已生成完成！

   📦 游戏文件已添加到右侧 Artifact 面板

   🎮 如何游玩:
   1. 点击右侧面板中的 "space-shooter.html"
   2. 点击"Download"按钮下载到本地
   3. 双击下载的 .html 文件，在浏览器中打开即可游玩

   🎯 控制说明:
   - WASD: 移动
   - 空格: 射击
   - ESC: 暂停

   💡 提示: 这是单文件 HTML 游戏，无需安装任何工具！
   ```

## 常见游戏类型示例

### 太空射击游戏
- 使用 Three.js 模板
- 添加飞船控制
- 添加子弹发射
- 添加敌人生成

### 平台跳跃游戏
- 使用 Phaser 3 模板
- 添加平台和重力
- 添加跳跃机制
- 添加收集物品

### 贪吃蛇游戏
- 使用 Canvas 模板
- 实现蛇的移动
- 实现食物生成
- 实现碰撞检测

## 重要提示

### 代码规范
- **始终使用单文件 HTML**，除非用户明确要求复杂项目
- **通过 CDN 引入库**，不要使用 npm
- **所有代码都在一个文件中**
- **生成后立即可运行**，无需构建步骤
- **使用程序化生成的几何体和纹理**，避免外部资源文件

### Artifact 系统（非常重要！）
- **必须创建 artifact.json** - 否则用户看不到你的文件
- **文件名包含扩展名** - 使用 `game.html` 而不是 `game`
- **使用 text/html 作为 mimeType** - 确保下载时是 .html 文件
- **不要告诉用户内部路径** - 用户无法直接访问工作目录
- **告诉用户查看 Artifact 面板** - 这是获取文件的唯一方式

### 完整示例
```bash
# 1. 创建游戏文件
cat > "my-game.html" << 'EOF'
<!DOCTYPE html>
<!-- 完整游戏代码 -->
</html>
EOF

# 2. 创建 artifact.json
mkdir -p "tasks/${CLAUDE_SESSION_ID}"
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "my-game",
      "path": "my-game.html",
      "mimeType": "text/html",
      "description": "我的游戏"
    }
  ]
}
EOF

# 3. 告诉用户
echo "✅ 游戏文件已添加到右侧 Artifact 面板，点击 Download 下载！"
```
