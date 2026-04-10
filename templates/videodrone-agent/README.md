# VideoDrone Agent

AI video production agent template — a fully automated video production pipeline from character design to final output.

## Overview

VideoDrone Agent uses a **character-driven, scene-based** video production methodology: design character visuals (including three-view reference sheets), write scene scripts, generate AI stills from storyboards, then composite the final video with audio and subtitles.

## Six-Phase Workflow

```
Phase 0       Phase 1           Phase 2          Phase 3         Phase 4          Phase 5
Initialize → Character Design → Scene Script → Still Generation → Video Assembly → Audio & Post
    │              │                 │               │                │               │
Brand analysis  Character profile  Scene breakdown  Storyboard→prompt  Image→video   Voiceover/TTS
Website scrape  Three-view prompts  Dialogue writing  Character token   First/last    SRT/ASS subs
Project context Consistency tokens  Storyboard/B-Roll  Batch generation  frame control  BGM/SFX
                Costume variants    Audio notes                         Transitions    B-Roll mix
```

## 15 Specialized Skills

| Phase | Skill | Purpose |
|-------|-------|---------|
| 0 | `generate-project-context` | Interactive brand/project context collection |
| 0 | `analyze-website-content` | Website content scraping and analysis |
| 1 | `character-designer` | Character design: profile, three-view, consistency tokens |
| 2 | `script-planner` | Video outline planning |
| 2 | `scene-scriptwriter` | Scene scripts: characters, dialogue, storyboard markers |
| 2 | `storyboard-generator` | Storyboard: S01-C01 numbering, visual descriptions |
| 3 | `prompt-generator` | AI image prompts + character token injection |
| 3 | `batch-image-generator` | Batch generation of stills/three-view images |
| 3 | `broll-generator` | B-Roll supplementary shot planning and generation |
| 4 | `digital-human-integrator` | AI avatar talking-head video generation |
| 4 | `keyframe-extractor` | Reference video keyframe extraction |
| 5 | `audio-subtitle-manager` | Voiceover, subtitles, BGM, and SFX management |
| 5 | `video-analyzer` | Reference video style analysis |
| — | `script-writer` | General script writing (auxiliary) |

## Quick Start

### 1. Brand Talking-Head Video

```
Create a 2-minute brand introduction talking-head video:
- Website: https://example.com
- Style: Professional but approachable
- Character: 30-year-old female tech entrepreneur
```

### 2. AI Avatar Explainer

```
Create a product introduction video with an AI avatar:
- Product materials: [content]
- Duration: 90 seconds
- Platform: TikTok (9:16 vertical)
```

### 3. Multi-Character Story Short

```
Create a 3-minute brand story animation:
- Characters: Product Manager + User + Tech Expert
- Style: 3D cartoon (Pixar-style)
- Scenes: 5
```

## Output Directory Structure

```
./output/
├── context/                    # Project context
│   └── project-context.md
├── characters/                 # Character profiles
│   ├── character-index.md
│   └── [character-name]/
│       ├── profile.md          # Character profile
│       ├── three-view-prompts.md # Three-view prompts
│       ├── consistency-tokens.md # Consistency tokens
│       └── expressions.md      # Expression set
├── scripts/                    # Scripts
│   ├── outline.md              # Outline
│   └── scenes/                 # Scene scripts
│       ├── scene-overview.md
│       └── scene-001.md ...
├── storyboard/                 # Storyboard
│   ├── storyboard-full.md
│   └── photo-gen-tasks.md      # Image generation task list
├── prompts/                    # AI image prompts
│   ├── style-foundation.md
│   ├── character-shots/
│   └── broll-shots/
├── assets/                     # Generated image assets
│   ├── characters/             # Character three-view images
│   ├── stills/                 # Scene stills
│   └── broll/                  # B-Roll assets
├── broll/                      # B-Roll planning
├── subtitles/                  # Subtitle files
│   ├── [name].srt
│   └── [name].ass
├── audio/                      # Audio plan
│   ├── voiceover-guide.md
│   ├── bgm-timeline.md
│   └── sfx-list.md
└── video/                      # Final video
```

## Core Concepts

### Character Consistency Tokens

Identity keywords extracted from character three-view reference sheets, injected verbatim into every still prompt that includes that character, ensuring visual consistency across shots.

```
Token example:
30-year-old asian woman with shoulder-length black hair
and side bangs, wearing navy blazer over white blouse,
wire-rimmed glasses, slim build
```

### Shot Numbering System

```
S01-C01  →  Scene 1, Shot 1
S01-C02  →  Scene 1, Shot 2
S01-B01  →  Scene 1, B-Roll 1
S02-C01  →  Scene 2, Shot 1
```

## Based on SandAgent Default Template

This template is initialized from SandAgent's `default` template, following the skill organization structure of `seo-agent`.
