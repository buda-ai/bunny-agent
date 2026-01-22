---
name: artifact
description: 将生成的游戏文件展示在用户界面的 Artifact 面板中，供用户查看和下载
---

# Artifact Management Skill

**重要**: 这个 skill 让你生成的游戏文件显示在用户的浏览器界面中，用户可以直接下载！

## Artifact 系统的作用

当你创建游戏文件后，用户**无法直接访问沙箱内的文件**。你必须通过 artifact 系统将文件内容发送到前端 UI：

1. 你在沙箱中生成游戏文件（如 `space-shooter.html`）
2. 你创建 `artifact.json` 清单，列出要展示的文件
3. 系统自动读取这些文件内容并发送到前端
4. 用户在右侧 Artifact 面板看到文件，可以下载

**没有 artifact.json = 用户看不到你生成的文件！**

## Session Information

- **Current Session ID**: `${CLAUDE_SESSION_ID}`
- **Artifact 清单路径**: `tasks/${CLAUDE_SESSION_ID}/artifact.json`

## 完整工作流程（单文件 HTML 游戏）

### 第 1 步：创建游戏文件

```bash
# 创建单文件 HTML 游戏
cat > "space-shooter.html" << 'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>太空射击游戏</title>
  <style>
    /* CSS 样式 */
  </style>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script>
    // 所有游戏代码
  </script>
</body>
</html>
EOF
```

**关键点**：
- 文件名必须包含 `.html` 扩展名
- 使用有意义的文件名（如 `space-shooter.html`，而不是 `game.html`）
- 单文件包含所有代码

### 第 2 步：创建 Task 目录

```bash
# 创建 task 目录（如果还不存在）
mkdir -p "tasks/${CLAUDE_SESSION_ID}"
```

### 第 3 步：创建 artifact.json 清单

```bash
# 创建 artifact.json，列出游戏文件
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "space-shooter-game",
      "path": "space-shooter.html",
      "mimeType": "text/html",
      "description": "太空射击游戏 - 双击即可在浏览器中运行"
    }
  ]
}
EOF
```

**重要字段说明**：
- `id`: 唯一标识符（可选，通常用文件名）
- `path`: 文件路径，**相对于当前工作目录**
- `mimeType`: **必须是 `text/html`** 用于 HTML 游戏
- `description`: 显示在 UI 中的描述文字

### 第 4 步：告诉用户

```
✅ 游戏已生成完成！

📦 游戏文件已添加到右侧 Artifact 面板

🎮 如何游玩:
1. 点击右侧面板中的 "space-shooter.html"
2. 点击"Download"按钮下载到本地
3. 双击下载的文件，在浏览器中打开即可游玩

🎯 控制说明:
- WASD: 移动飞船
- 空格: 发射子弹
- ESC: 暂停游戏

💡 提示: 这是单文件 HTML 游戏，无需安装任何工具！
```

## 单文件 HTML 游戏的 Artifact.json 模板

```json
{
  "artifacts": [
    {
      "id": "game-html",
      "path": "my-game.html",
      "mimeType": "text/html",
      "description": "完整的单文件 HTML 游戏，双击即可运行"
    }
  ]
}
```

**关键点**：
- 只需一个 artifact 条目（单文件游戏）
- `mimeType` 必须是 `text/html`
- `path` 是相对于当前工作目录的路径
- `description` 应该说明这是可以直接运行的游戏

## 添加多个文件（可选）

如果你还想包含其他文件（如 README、截图等）：

```json
{
  "artifacts": [
    {
      "id": "game-html",
      "path": "space-shooter.html",
      "mimeType": "text/html",
      "description": "太空射击游戏"
    },
    {
      "id": "readme",
      "path": "tasks/${CLAUDE_SESSION_ID}/README.md",
      "mimeType": "text/markdown",
      "description": "游戏说明文档"
    }
  ]
}
```

## 常见 MIME 类型

| 文件类型 | MIME Type | 说明 |
|---------|-----------|------|
| HTML 游戏 | `text/html` | **最重要** - 单文件游戏 |
| JavaScript | `text/javascript` | JS 代码文件 |
| Markdown | `text/markdown` | 说明文档 |
| JSON | `application/json` | 配置文件 |
| 纯文本 | `text/plain` | 文本文件 |

## 常见错误

### ❌ 错误 1：文件名没有扩展名
```json
{
  "artifacts": [
    {
      "path": "game",  // 错误！
      "mimeType": "text/html"
    }
  ]
}
```

✅ **正确**：
```json
{
  "path": "space-shooter.html",  // 包含 .html
  "mimeType": "text/html"
}
```

### ❌ 错误 2：告诉用户内部路径
```
❌ "文件保存在 /workspace/game.html"
❌ "您可以在工作目录找到游戏文件"
```

✅ **正确**：
```
✅ "游戏文件已添加到右侧 Artifact 面板"
✅ "点击右侧面板的 Download 按钮下载游戏"
```

### ❌ 错误 3：忘记创建 artifact.json
如果你只创建了游戏文件但没有 artifact.json，用户将**无法看到或下载**你的文件！

## 完整示例脚本

```bash
#!/bin/bash

# 1. 创建游戏文件
cat > "my-awesome-game.html" << 'EOF'
<!DOCTYPE html>
<html lang="zh-CN">
<head>
  <meta charset="UTF-8">
  <title>我的游戏</title>
  <style>
    body { margin: 0; overflow: hidden; }
  </style>
</head>
<body>
  <script src="https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.min.js"></script>
  <script>
    // 完整的游戏代码
    console.log('游戏启动！');
  </script>
</body>
</html>
EOF

# 2. 创建 task 目录
mkdir -p "tasks/${CLAUDE_SESSION_ID}"

# 3. 创建 artifact.json
cat > "tasks/${CLAUDE_SESSION_ID}/artifact.json" << 'EOF'
{
  "artifacts": [
    {
      "id": "awesome-game",
      "path": "my-awesome-game.html",
      "mimeType": "text/html",
      "description": "我的超棒游戏 - 双击即可运行"
    }
  ]
}
EOF

echo "✅ 游戏文件已添加到 Artifact 系统"
```

## 重要提醒

1. **始终使用 artifact 系统** - 这是用户获取文件的唯一方式
2. **文件名包含扩展名** - `game.html` 而不是 `game`
3. **使用正确的 MIME type** - HTML 游戏用 `text/html`
4. **告诉用户查看 Artifact 面板** - 不要说沙箱路径
5. **先写文件，再写 artifact.json** - 顺序很重要

遵循这些步骤，用户就能在 UI 中看到你的游戏文件并下载游玩！🎮
