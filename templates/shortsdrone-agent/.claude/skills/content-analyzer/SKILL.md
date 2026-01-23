---
name: content-analyzer
description: Analyze video/text content to identify highlights, key topics, and optimal clip points for short video creation.
---

# 内容分析器

分析视频/文字内容，识别精彩片段、关键话题，为短视频创作提供智能建议。

## 功能

1. **话题识别**: 提取内容的核心主题
2. **情绪分析**: 识别情感高潮点
3. **精彩定位**: 找出最适合做短视频的片段
4. **结构分析**: 分析内容结构，建议剪辑点

## 使用方法

```
分析这个视频的内容: ./output/downloads/video.mp4
```

```
帮我分析这段文案的亮点:
今天分享三个改变我人生的习惯...
```

## Instructions

### Step 1: 获取转录文本

```bash
# 如果输入是视频，先转录
INPUT="[USER_INPUT]"

if [[ -f "$INPUT" ]]; then
  # 检查是否已有转录
  TRANSCRIPT="${INPUT%.mp4}.txt"
  if [ ! -f "$TRANSCRIPT" ]; then
    echo "正在转录音频..."
    # 使用 Whisper 转录
    whisper "$INPUT" --model base --language zh --output_format txt --output_dir ./temp/
  fi
else
  # 直接处理文本输入
  echo "$INPUT" > ./temp/content.txt
  TRANSCRIPT="./temp/content.txt"
fi
```

### Step 2: 内容分析

```python
import re
from collections import Counter

# 读取文本
with open(TRANSCRIPT_PATH, 'r') as f:
    text = f.read()

# 基础分析
total_chars = len(text)
sentences = re.split(r'[。！？\n]', text)
sentences = [s.strip() for s in sentences if len(s.strip()) > 5]

print(f"=== 内容分析报告 ===\n")
print(f"总字数: {total_chars}")
print(f"句子数: {len(sentences)}")
print(f"预估阅读时间: {total_chars / 300:.1f} 分钟")
print(f"预估语音时长: {total_chars / 4:.0f} 秒\n")

# 关键词提取（简化版）
# 停用词
stopwords = set(['的', '是', '在', '和', '了', '有', '我', '你', '他', '她', '它', 
                 '这', '那', '就', '也', '都', '会', '能', '要', '可以', '一个'])

words = re.findall(r'[\u4e00-\u9fff]+', text)
word_freq = Counter(w for w in words if len(w) >= 2 and w not in stopwords)
top_keywords = word_freq.most_common(10)

print("## 核心关键词:")
for word, count in top_keywords:
    print(f"  - {word}: {count}次")

# 识别数字/列表内容（通常是亮点）
numbered_points = re.findall(r'[第一二三四五六七八九十\d][、:：].*?[。！？]', text)
if numbered_points:
    print(f"\n## 发现要点列表 ({len(numbered_points)}个):")
    for point in numbered_points[:5]:
        print(f"  → {point.strip()}")

# 识别情感高潮（感叹句）
exclamations = [s for s in sentences if '！' in s or '?' in s]
if exclamations:
    print(f"\n## 情感高潮点 ({len(exclamations)}处):")
    for ex in exclamations[:3]:
        print(f"  🔥 {ex}")

# 提取金句（包含引号或特殊表达）
quotes = re.findall(r'[「"'].*?[」"']', text)
if quotes:
    print(f"\n## 金句提取:")
    for q in quotes[:3]:
        print(f"  💬 {q}")
```

### Step 3: 精彩片段推荐

```python
# 基于规则的精彩片段识别
highlights = []

for i, sentence in enumerate(sentences):
    score = 0
    
    # 评分规则
    if '秘密' in sentence or '技巧' in sentence: score += 3
    if '推荐' in sentence or '必须' in sentence: score += 2
    if '震惊' in sentence or '惊讶' in sentence: score += 2
    if re.search(r'\d+[个种条]', sentence): score += 2
    if '！' in sentence: score += 1
    if len(sentence) > 20 and len(sentence) < 50: score += 1
    
    if score >= 3:
        highlights.append({
            'index': i,
            'text': sentence,
            'score': score
        })

highlights.sort(key=lambda x: x['score'], reverse=True)

print("\n## 推荐短视频片段:")
for h in highlights[:5]:
    print(f"\n### 推荐度: {'⭐' * min(h['score'], 5)}")
    print(f"内容: {h['text']}")
    print(f"位置: 第 {h['index'] + 1} 句")
```

### Step 4: 生成分析报告

```bash
cat > ./output/analysis_report.md << 'EOF'
# 内容分析报告

## 📊 基础统计
- 总字数: X
- 句子数: X  
- 预估时长: X 秒

## 🎯 核心话题
1. 话题 A
2. 话题 B
3. 话题 C

## 🔥 精彩片段推荐

### 片段 1 (推荐度: ⭐⭐⭐⭐⭐)
- 位置: 00:30 - 00:45
- 内容: "..."
- 原因: 包含数字要点、情感高潮

### 片段 2 (推荐度: ⭐⭐⭐⭐)
- 位置: 01:20 - 01:35
- 内容: "..."
- 原因: 实用技巧分享

## 💡 制作建议

1. **开场 Hook**: 使用片段 1 作为开场吸引注意
2. **核心内容**: 围绕核心话题展开
3. **结尾 CTA**: 添加互动引导

## 📝 短视频脚本建议

### 版本 A (15秒)
精简版，只保留核心金句

### 版本 B (30秒)  
标准版，包含完整观点

### 版本 C (60秒)
详细版，包含案例说明
EOF

echo "✅ 分析报告已生成: ./output/analysis_report.md"
```

## 输出

- 分析报告: `./output/analysis_report.md`
- 推荐片段列表
- 短视频脚本建议

## 与其他 Skills 配合

1. 分析完成后 → `highlight-finder` 精确定位时间点
2. 确定片段后 → `shorts-generator` 生成短视频
3. 基于建议 → `script-to-video` 生成优化版本
