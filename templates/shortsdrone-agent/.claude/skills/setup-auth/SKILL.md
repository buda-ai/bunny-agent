---
name: setup-auth
description: Configure authentication for various video platforms (YouTube, Bilibili, Instagram, Xiaohongshu).
---

# 平台认证配置

配置各视频平台的认证信息，解决下载限制问题。

## 支持的平台

| 平台 | 认证方式 | 是否必需 |
|------|----------|----------|
| YouTube | Cookies | 强烈推荐 |
| Bilibili | Cookies | 高清需要 |
| Instagram | Cookies | 必需 |
| 小红书 | Cookies | 必需 |
| 抖音 | 无需 | - |
| TikTok | 无需 | - |

## 使用方法

```
帮我配置 YouTube 的认证
```

```
设置 B站 cookies
```

## Instructions

### 方法 1: 浏览器导出 Cookies

#### Chrome 用户

```bash
# 1. 安装 "Get cookies.txt LOCALLY" 扩展
# https://chrome.google.com/webstore/detail/get-cookiestxt-locally/cclelndahbckbenkjhflpdbgdldlbecc

# 2. 登录目标网站 (如 youtube.com)

# 3. 点击扩展图标，导出 cookies

# 4. 保存到配置目录
mkdir -p ./config
# 将导出的 cookies 内容保存到 ./config/cookies.txt
```

#### Firefox 用户

```bash
# 1. 安装 "cookies.txt" 扩展
# https://addons.mozilla.org/en-US/firefox/addon/cookies-txt/

# 2. 登录目标网站

# 3. 点击扩展图标导出

# 4. 保存文件
mv ~/Downloads/cookies.txt ./config/cookies.txt
```

### 方法 2: 使用 yt-dlp 直接提取

```bash
# 从 Chrome 提取
yt-dlp --cookies-from-browser chrome --cookies ./config/cookies.txt --version

# 从 Firefox 提取
yt-dlp --cookies-from-browser firefox --cookies ./config/cookies.txt --version

# 从 Safari 提取
yt-dlp --cookies-from-browser safari --cookies ./config/cookies.txt --version

# 从 Edge 提取
yt-dlp --cookies-from-browser edge --cookies ./config/cookies.txt --version
```

### 方法 3: 平台专用配置

#### YouTube

```bash
# 创建 YouTube cookies 配置
mkdir -p ./config

cat > ./config/cookies.txt << 'EOF'
# Netscape HTTP Cookie File
# 从浏览器导出的 cookies 粘贴到这里
# 示例格式:
# .youtube.com	TRUE	/	TRUE	1234567890	GPS	1
# .youtube.com	TRUE	/	FALSE	1234567890	VISITOR_INFO1_LIVE	xxxxx
# .youtube.com	TRUE	/	FALSE	1234567890	YSC	xxxxx
EOF

echo "请将 YouTube cookies 粘贴到 ./config/cookies.txt"
```

#### Bilibili

```bash
# B站 cookies 配置
cat > ./config/bilibili_cookies.txt << 'EOF'
# Netscape HTTP Cookie File
# 从浏览器导出 bilibili.com 的 cookies
# 必需的 cookies: SESSDATA, bili_jct, DedeUserID
EOF

# 使用时指定:
# yt-dlp --cookies ./config/bilibili_cookies.txt "https://bilibili.com/video/xxx"
```

#### Instagram

```bash
# Instagram 需要登录 cookies
cat > ./config/instagram_cookies.txt << 'EOF'
# Netscape HTTP Cookie File
# Instagram cookies
# 必需: sessionid, csrftoken, ds_user_id
EOF
```

### 方法 4: 使用 Cobalt（无需 Cookies）

```bash
# 设置 Cobalt API 地址
# 公共实例 (可能不稳定)
export COBALT_API="https://api.cobalt.tools"

# 或自建实例
export COBALT_API="http://localhost:9000"

# 写入环境配置
echo "COBALT_API=$COBALT_API" >> ./config/.env
```

### 验证配置

```bash
# 验证 cookies 文件格式
if [ -f "./config/cookies.txt" ]; then
  echo "✅ Cookies 文件存在"
  head -5 ./config/cookies.txt
  
  # 验证格式
  if grep -q "# Netscape HTTP Cookie File\|# HTTP Cookie File" ./config/cookies.txt; then
    echo "✅ 格式正确"
  else
    echo "⚠️ 格式可能不正确，请确保是 Netscape 格式"
  fi
else
  echo "❌ Cookies 文件不存在"
fi

# 测试下载
echo "测试 YouTube 下载..."
yt-dlp --cookies ./config/cookies.txt \
  --simulate \
  "https://www.youtube.com/watch?v=dQw4w9WgXcQ"
```

## 配置文件结构

```
./config/
├── cookies.txt           # 通用 cookies (YouTube 默认使用)
├── bilibili_cookies.txt  # B站专用
├── instagram_cookies.txt # Instagram 专用
├── xiaohongshu_cookies.txt # 小红书专用
└── .env                  # 环境变量 (API 密钥等)
```

## 环境变量

```bash
# ./config/.env
COBALT_API=https://api.cobalt.tools
OPENAI_API_KEY=sk-xxx
RAPIDAPI_KEY=xxx
```

## 常见问题

### Q: Cookies 过期怎么办？
A: 重新登录网站并导出新的 cookies

### Q: Chrome 无法导出 cookies
A: 尝试使用 Firefox，或使用 yt-dlp 的 `--cookies-from-browser` 选项

### Q: YouTube 仍然报 bot 检测
A: 
1. 确保 cookies 来自已登录的账号
2. 尝试使用 Cobalt API
3. 考虑使用 RapidAPI 付费服务

## 安全提示

⚠️ **Cookies 包含登录凭证，请勿分享！**

- 不要上传到公开仓库
- 添加到 .gitignore
- 定期更换

```bash
echo "config/cookies*.txt" >> .gitignore
echo "config/.env" >> .gitignore
```
