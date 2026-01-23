---
name: video-downloader
description: Universal video downloader supporting multiple platforms (YouTube, Bilibili, TikTok, Douyin, Instagram, Twitter/X). Automatically detects platform and uses best download method.
---

# 通用视频下载器

支持多平台视频下载的通用工具，自动识别平台并选择最佳下载方式。

## 支持的平台

| 平台 | URL 特征 | 认证需求 |
|------|----------|----------|
| YouTube | youtube.com, youtu.be | Cookies 推荐 |
| Bilibili | bilibili.com, b23.tv | 可选（高清需要） |
| 抖音 | douyin.com | 无需 |
| TikTok | tiktok.com | 无需 |
| Instagram | instagram.com | Cookies |
| Twitter/X | twitter.com, x.com | 无需 |
| 小红书 | xiaohongshu.com | Cookies |
| 快手 | kuaishou.com | 无需 |

## 使用方法

```
下载视频: [任意平台URL]
```

```
Download video from: https://www.bilibili.com/video/BVxxxxx
```

## Instructions

### Step 1: 识别平台

```bash
VIDEO_URL="[USER_INPUT_URL]"

# 识别平台类型
detect_platform() {
  local url="$1"
  case "$url" in
    *youtube.com*|*youtu.be*)
      echo "youtube"
      ;;
    *bilibili.com*|*b23.tv*)
      echo "bilibili"
      ;;
    *douyin.com*)
      echo "douyin"
      ;;
    *tiktok.com*)
      echo "tiktok"
      ;;
    *instagram.com*)
      echo "instagram"
      ;;
    *twitter.com*|*x.com*)
      echo "twitter"
      ;;
    *xiaohongshu.com*|*xhslink.com*)
      echo "xiaohongshu"
      ;;
    *kuaishou.com*)
      echo "kuaishou"
      ;;
    *)
      echo "unknown"
      ;;
  esac
}

PLATFORM=$(detect_platform "$VIDEO_URL")
echo "检测到平台: $PLATFORM"
```

### Step 2: 配置下载参数

```bash
# 创建目录
mkdir -p ./output/downloads ./temp ./config

# 加载 cookies（如果存在）
COOKIES_OPT=""
if [ -f "./config/cookies.txt" ]; then
  COOKIES_OPT="--cookies ./config/cookies.txt"
fi

# 平台特定配置
case "$PLATFORM" in
  youtube)
    # YouTube 需要 cookies 避免 bot 检测
    if [ -z "$COOKIES_OPT" ] && [ -n "$COBALT_API" ]; then
      echo "YouTube: 将使用 Cobalt API"
      USE_COBALT=true
    fi
    ;;
  bilibili)
    # B站通常不需要 cookies，但高清需要
    EXTRA_OPTS="--referer https://www.bilibili.com"
    ;;
  douyin|tiktok)
    # 抖音/TikTok 通常不需要认证
    EXTRA_OPTS=""
    ;;
  instagram)
    # Instagram 需要 cookies
    if [ -z "$COOKIES_OPT" ]; then
      echo "⚠️ Instagram 需要 cookies，请配置 ./config/cookies.txt"
    fi
    ;;
esac
```

### Step 3: 尝试 Cobalt（如果配置）

```bash
if [ -n "$COBALT_API" ]; then
  echo "尝试使用 Cobalt API..."
  
  RESPONSE=$(curl -s -X POST "$COBALT_API/api/json" \
    -H "Content-Type: application/json" \
    -d "{\"url\": \"$VIDEO_URL\", \"vQuality\": \"1080\"}")
  
  STATUS=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('status',''))" 2>/dev/null)
  
  if [ "$STATUS" = "stream" ] || [ "$STATUS" = "redirect" ]; then
    DOWNLOAD_URL=$(echo "$RESPONSE" | python3 -c "import sys,json; print(json.load(sys.stdin).get('url',''))")
    VIDEO_ID=$(echo "$VIDEO_URL" | md5sum | cut -c1-12)
    curl -L -o "./output/downloads/${VIDEO_ID}.mp4" "$DOWNLOAD_URL"
    echo "✅ 通过 Cobalt 下载成功"
    exit 0
  fi
  
  echo "Cobalt 失败，回退到 yt-dlp"
fi
```

### Step 4: 使用 yt-dlp 下载

```bash
# 检查 yt-dlp
which yt-dlp || { echo "请安装 yt-dlp: brew install yt-dlp"; exit 1; }

# 下载视频
echo "使用 yt-dlp 下载..."
yt-dlp $COOKIES_OPT $EXTRA_OPTS \
  -f "bestvideo[height<=1080]+bestaudio/best[height<=1080]" \
  -o "./output/downloads/%(id)s.%(ext)s" \
  --merge-output-format mp4 \
  --write-info-json \
  "$VIDEO_URL"

if [ $? -eq 0 ]; then
  echo "✅ 下载成功"
  ls -la ./output/downloads/
else
  echo "❌ 下载失败，请检查 URL 或认证配置"
fi
```

### Step 5: 获取视频信息

```bash
# 查找下载的文件
DOWNLOADED_FILE=$(ls -t ./output/downloads/*.mp4 2>/dev/null | head -1)
INFO_FILE="${DOWNLOADED_FILE%.mp4}.info.json"

if [ -f "$INFO_FILE" ]; then
  python3 << EOF
import json
with open("$INFO_FILE") as f:
    info = json.load(f)
print(f"""
## 📹 视频信息

**标题**: {info.get('title', 'N/A')}
**时长**: {info.get('duration', 0) // 60}分{info.get('duration', 0) % 60}秒
**平台**: {info.get('extractor', 'N/A')}
**上传者**: {info.get('uploader', 'N/A')}
**文件**: $DOWNLOADED_FILE
""")
EOF
fi
```

## 平台特殊说明

### YouTube
- 强烈建议配置 cookies 或使用 Cobalt
- 支持播放列表下载
- 支持自动字幕下载

### Bilibili
- 无需登录可下载 480p
- 登录后可下载 1080p
- 支持分P视频

### 抖音
- 无需登录
- 自动去水印
- 支持图集下载

### TikTok
- 无需登录
- 自动去水印
- 部分地区可能需要代理

### Instagram
- 需要登录 cookies
- 支持 Reels/Posts/Stories
- 私密账号需要关注

## 错误处理

| 错误 | 可能原因 | 解决方案 |
|------|----------|----------|
| 403 Forbidden | 需要认证 | 配置 cookies |
| Video unavailable | 私密/删除 | 检查 URL |
| Rate limit | 请求过多 | 等待或换 IP |
| Bot detection | YouTube 反爬 | 使用 Cobalt |

## 输出

- 视频文件: `./output/downloads/{video_id}.mp4`
- 信息文件: `./output/downloads/{video_id}.info.json`
