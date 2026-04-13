# ShortsDrone Agent 🎬

多平台短视频生成 Agent - 将长视频、文案转换为口播短视频。

## ✨ 功能特点

### 多数据源支持
- 🌐 **网络视频**: YouTube, B站, 抖音, TikTok, Instagram, Twitter/X, 小红书, 快手
- 📝 **文案输入**: 直接输入文字，自动生成口播视频
- 📁 **本地文件**: 导入本地视频/音频文件处理
- 📦 **批量处理**: 支持批量 URL 或文件处理

### 核心能力
- 语音转录 (Whisper)
- 精彩片段识别
- 竖屏格式转换 (9:16)
- 字幕生成与烧录
- TTS 语音合成
- 封面自动生成
- 视频片段合并

## 🚀 快速开始

### 1. 从网络视频创建短视频

```
下载这个视频并创建短视频: https://www.youtube.com/watch?v=xxxxx
```

```
从这个B站视频提取精彩片段: https://www.bilibili.com/video/BVxxxxx
```

### 2. 从文案创建口播视频

```
用这段文案生成口播短视频:

大家好，今天分享三个改变我人生的习惯...
```

### 3. 从本地文件创建

```
处理这个本地视频: ./input/my-video.mp4
```

## 📁 目录结构

```
./
├── input/          # 用户输入文件
│   ├── videos/     # 本地视频
│   ├── audios/     # 本地音频
│   └── scripts/    # 文案脚本
├── output/         # 输出目录
│   ├── downloads/  # 下载的视频
│   ├── shorts/     # 生成的短视频
│   ├── transcripts/# 转录文本
│   ├── thumbnails/ # 封面图
│   └── merged/     # 合并的视频
├── temp/           # 临时文件
├── config/         # 配置文件
│   ├── cookies.txt # 平台认证
│   └── .env        # 环境变量
└── assets/         # 素材资源
    ├── bgm/        # 背景音乐
    ├── intro.mp4   # 片头
    └── outro.mp4   # 片尾
```

## 🔧 配置

### 平台认证 (可选)

某些平台需要认证才能下载:

```bash
# YouTube (强烈推荐)
# 将 cookies 导出到 ./config/cookies.txt

# 或使用 Cobalt API (无需认证)
echo "COBALT_API=https://api.cobalt.tools" > ./config/.env
```

### 安装依赖

```bash
# macOS
brew install yt-dlp ffmpeg

# TTS 功能
pip install edge-tts

# 转录功能 (可选)
pip install openai-whisper
```

## 📚 Skills 列表

### 视频获取
| Skill | 说明 |
|-------|------|
| video-downloader | 通用视频下载器 |
| cobalt-downloader | Cobalt API 下载 |
| rapidapi-downloader | RapidAPI 下载 |
| local-video-import | 本地文件导入 |
| setup-auth | 认证配置 |

### 内容分析
| Skill | 说明 |
|-------|------|
| speech-transcriber | 语音转录 |
| highlight-finder | 精彩片段识别 |
| content-analyzer | 内容分析 |

### 视频生成
| Skill | 说明 |
|-------|------|
| shorts-generator | 短视频生成 |
| script-to-video | 文案转视频 |
| tts-generator | TTS 语音合成 |
| thumbnail-creator | 封面生成 |
| video-merger | 视频合并 |

### 辅助工具
| Skill | 说明 |
|-------|------|
| audio-extractor | 音频提取 |
| video-info-extractor | 视频信息提取 |

## 🎯 使用场景

### 场景 1: 知识博主二创
```
从这个 YouTube 教程视频提取 3 个最有价值的知识点，做成短视频:
https://youtube.com/watch?v=xxx
```

### 场景 2: 影视解说搬运
```
下载这个 B站 视频，提取精彩片段，加上字幕:
https://bilibili.com/video/BVxxx
```

### 场景 3: 文案口播
```
用这个产品介绍文案生成口播视频:
...文案内容...

要求: 女声、语速稍快、简约背景
```

### 场景 4: 批量处理
```
批量处理这些视频链接:
- https://youtube.com/xxx
- https://youtube.com/yyy
- https://bilibili.com/xxx

每个视频提取 1 个精彩片段
```

## ⚠️ 注意事项

1. **版权合规**: 请确保有权使用源视频内容
2. **平台规则**: 遵守各平台的使用条款
3. **Cookies 安全**: 不要分享你的 cookies 文件
4. **存储空间**: 视频处理需要较大临时空间

## 📄 License

MIT
