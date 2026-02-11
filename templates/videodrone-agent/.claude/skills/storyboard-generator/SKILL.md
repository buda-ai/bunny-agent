---
name: storyboard-generator
description: Creates visual storyboards from scripts with shot descriptions, frame sketches, timing, and production notes for video planning.
---

# Storyboard Generator

This skill transforms video scripts into detailed visual storyboards, planning each shot with descriptions, timing, camera angles, and visual elements.

## When to Use This Skill

- Visualizing script before production
- Planning shot composition and sequence
- Communicating vision to team or client
- Preparing for video production
- Creating shot lists from scripts
- Planning B-roll and visual assets needed

## What This Skill Does

1. **Shot Breakdown**: Divides script into individual shots
2. **Visual Description**: Describes what appears in each frame
3. **Camera Planning**: Specifies angles, movements, framing
4. **Timing Management**: Maps timing for each shot
5. **Asset Identification**: Lists visual elements needed
6. **Transition Planning**: Documents how shots connect
7. **Production Notes**: Adds technical and creative guidance

## How to Use

### From Script

```
Create storyboard from this script: [filename or paste]
```

### From Outline

```
Generate storyboard for video outline: [outline filename]
```

### With Specifications

```
Create storyboard for:
- Script: [filename]
- Style: [Cinematic/Dynamic/Simple]
- Shot count: [Approximate number]
```

## Instructions

When user requests storyboard generation:

1. **Gather Input**

   ```markdown
   I'll create a visual storyboard for your video.
   
   **Script Source**:
   [ ] Full script (filename or paste)
   [ ] Script outline
   [ ] Topic description (I'll create script first)
   
   **Storyboard Detail Level**:
   [ ] Basic (shot descriptions and timing)
   [ ] Standard (+ camera angles and framing)
   [ ] Detailed (+ visual elements and production notes)
   [ ] Production-ready (+ lighting, props, full technical specs)
   
   **Visual Style**:
   - Reference video: [URL if available]
   - Aesthetic: [Cinematic/Corporate/Minimal/Dynamic/etc.]
   - Color mood: [From brand or specify]
   ```

2. **Analyze Script Structure**

   ```markdown
   ## Script Analysis
   
   **Video Details**:
   - Total duration: [X:XX]
   - Sections: [Number of main sections]
   - Scene changes: [Estimated number]
   - Speaking parts: [Presenter/VO/Multiple]
   
   **Content Breakdown**:
   | Section | Timestamp | Content | Visual Needs |
   |---------|-----------|---------|--------------|
   | Opening | 0:00-0:XX | [Hook] | [Type of shot] |
   | Intro | 0:XX-0:XX | [Introduction] | [Type of shot] |
   | Main 1 | 0:XX-X:XX | [Content] | [Type of shot] |
   | ... | ... | ... | ... |
   ```

3. **Create Storyboard Template**

   ```markdown
   # Storyboard: [Video Title]
   
   **Project**: [Project name]
   **Duration**: [Total duration]
   **Shots**: [Total number of shots]
   **Date**: [Date]
   **Version**: 1.0
   
   ---
   
   ## Production Summary
   
   **Visual Style**: [Style description]
   **Primary Locations**: [List]
   **Digital Human**: [Yes/No - details if yes]
   **B-Roll Requirements**: [Summary]
   **Special Effects**: [Any needed]
   
   ---
   
   ## Shot List
   
   ### Shot 001 - Opening Hook
   
   **Timestamp**: 0:00 - 0:05 (5 seconds)
   
   **Visual Description**:
   [Detailed description of what appears on screen]
   
   **Frame Sketch**:
   ```
   ┌─────────────────────────────────┐
   │                                 │
   │    [ASCII art representation    │
   │     or detailed description     │
   │     of frame composition]       │
   │                                 │
   └─────────────────────────────────┘
   ```
   
   **Camera**:
   - Shot type: [Wide/Medium/Close-up/ECU]
   - Angle: [Eye-level/High/Low/Dutch]
   - Movement: [Static/Pan/Tilt/Dolly/Zoom]
   - Lens: [Wide/Normal/Telephoto]
   
   **Subject/Content**:
   - Main subject: [What's the focus]
   - Action: [What's happening]
   - Position: [Where in frame]
   
   **Background/Setting**:
   - Location: [Environment description]
   - Depth: [Foreground/midground/background elements]
   - Props: [Items visible]
   
   **Lighting**:
   - Style: [Natural/Studio/Dramatic]
   - Quality: [Soft/Hard/Balanced]
   - Mood: [Bright/Moody/Neutral]
   
   **Audio**:
   - Dialogue: "[Script line]"
   - Music: [Type/mood if any]
   - SFX: [Sound effects needed]
   
   **Text/Graphics**:
   - On-screen text: "[Exact text]"
   - Graphics: [Any overlays, animations]
   - Position: [Where on screen]
   
   **Transition In**: [How shot begins]
   **Transition Out**: [How shot ends]
   
   **Production Notes**:
   - [Any special requirements]
   - [Technical considerations]
   - [Alternative options]
   
   **Assets Needed**:
   - [ ] Digital human render
   - [ ] B-roll footage: [Type]
   - [ ] Graphics: [Type]
   - [ ] Stock footage: [Type]
   - [ ] Product shots: [Type]
   
   **Reference**: [Similar shot or style reference if applicable]
   
   ---
   
   ### Shot 002 - [Description]
   
   [Same structure as Shot 001]
   
   ---
   
   [Continue for all shots...]
   ```

4. **Visual Frame Representations**

   For each shot, create ASCII or detailed description:

   ```markdown
   ## Frame Composition Examples
   
   ### Wide Shot Example:
   ```
   ┌────────────────────────────────────────┐
   │         [Sky/Background]              │
   │  ┌──────────────────┐                │
   │  │   Building/Set   │                │
   │  │                  │   [Person]     │
   │  └──────────────────┘   [small]     │
   │      [Foreground elements]           │
   └────────────────────────────────────────┘
   Wide shot - establishes setting
   ```
   
   ### Medium Shot Example:
   ```
   ┌────────────────────────────────────────┐
   │    [Background - out of focus]        │
   │                                       │
   │        ┌─────────────┐               │
   │        │   Person    │               │
   │        │ (waist up)  │               │
   │        │             │               │
   │        └─────────────┘               │
   └────────────────────────────────────────┘
   Medium shot - dialogue/presentation
   ```
   
   ### Close-Up Example:
   ```
   ┌────────────────────────────────────────┐
   │                                       │
   │         ┌─────────────┐              │
   │         │    Face     │              │
   │         │   (head &   │              │
   │         │ shoulders)  │              │
   │         └─────────────┘              │
   │                                       │
   └────────────────────────────────────────┘
   Close-up - emotion/emphasis
   ```
   
   ### Insert/Detail Shot:
   ```
   ┌────────────────────────────────────────┐
   │                                       │
   │                                       │
   │        [Product Detail]               │
   │         [Hands using]                 │
   │          [Product]                    │
   │                                       │
   │                                       │
   └────────────────────────────────────────┘
   Insert - product detail/demo
   ```
   ```

5. **Shot Sequence Overview**

   ```markdown
   ## Shot Sequence Flow
   
   ```
   [Shot 001] → [Shot 002] → [Shot 003] → [Shot 004] → ...
     Wide        Medium       Close-up      B-roll
   (5 sec)      (10 sec)     (8 sec)       (5 sec)
   ```
   
   **Pacing Pattern**:
   - Slow opening: Long shots to establish
   - Medium pace: Mix of medium and close-ups
   - Fast finale: Quick cuts, energetic
   
   **Visual Rhythm**:
   - Average shot length: [X] seconds
   - Shortest shot: [X] seconds
   - Longest shot: [X] seconds
   - Total cuts: [X] transitions
   ```

6. **Asset Production List**

   ```markdown
   ## Production Requirements
   
   ### Digital Human Shots
   | Shot # | Duration | Script | Setting |
   |--------|----------|--------|---------|
   | 001 | 0:05 | "[Line]" | [Background] |
   | 003 | 0:15 | "[Line]" | [Background] |
   | ... | ... | ... | ... |
   
   **Total DH footage needed**: [X:XX]
   
   ### B-Roll Footage
   | Shot # | Type | Description | Duration |
   |--------|------|-------------|----------|
   | 002 | Product | [Description] | 0:05 |
   | 004 | Action | [Description] | 0:08 |
   | ... | ... | ... | ... |
   
   ### Graphics & Animations
   | Shot # | Type | Content | Style |
   |--------|------|---------|-------|
   | 005 | Text overlay | "[Text]" | [Style] |
   | 007 | Animated graph | [Data] | [Style] |
   | ... | ... | ... | ... |
   
   ### Stock Footage/Images Needed
   - [Description 1] - [Duration]
   - [Description 2] - [Duration]
   - [Description 3] - [Duration]
   ```

7. **Camera Shot List**

   ```markdown
   ## Camera Shot List (For Production Day)
   
   **Setup 1: [Location/Setting]**
   - Shot 001: [Description] - [Duration]
   - Shot 003: [Description] - [Duration]
   - Shot 007: [Description] - [Duration]
   
   **Setup 2: [Location/Setting]**
   - Shot 002: [Description] - [Duration]
   - Shot 005: [Description] - [Duration]
   
   **Setup 3: [Location/Setting]**
   - Shot 004: [Description] - [Duration]
   - Shot 006: [Description] - [Duration]
   
   [Organized by location/setup for efficient shooting]
   ```

8. **Technical Specifications**

   ```markdown
   ## Technical Specs
   
   **Video Format**:
   - Resolution: [1080p/4K]
   - Aspect Ratio: [16:9/9:16/1:1]
   - Frame Rate: [24/30/60 fps]
   - Codec: [H.264/H.265]
   
   **Camera Settings** (if real camera):
   - Primary camera: [Model/type]
   - Backup camera: [Model/type]
   - Lenses needed: [List]
   
   **Lighting Requirements**:
   - Key light: [Type and position]
   - Fill light: [Type and position]
   - Back/rim light: [Type and position]
   - Practical lights: [Any on-set lights]
   
   **Audio Gear**:
   - Microphone: [Type]
   - Recorder: [Type]
   - Backup: [Type]
   ```

9. **Timing Breakdown Chart**

   ```markdown
   ## Visual Timeline
   
   ```
   0:00 ────────────── 0:30 ────────────── 1:00 ────────────── 1:30 ────────────── 2:00
    │                    │                    │                    │                    │
   S01                 S05                 S10                 S15                 S20
   Wide                Med                 CU                  B-roll              Wide
   Hook                Intro               Content             Demo                CTA
   ```
   
   **Key Moments**:
   - 0:03 - Hook reveal
   - 0:15 - Value proposition
   - 0:45 - Feature #1
   - 1:15 - Feature #2
   - 1:45 - Call-to-action
   ```

10. **Alternative Versions** (if requested)

    ```markdown
    ## Alternative Shot Options
    
    ### Shot 001 Alternatives
    
    **Option A** (Recommended): [Description]
    - Pros: [Benefits]
    - Cons: [Drawbacks]
    
    **Option B**: [Description]
    - Pros: [Benefits]
    - Cons: [Drawbacks]
    
    **Option C**: [Description]
    - Pros: [Benefits]
    - Cons: [Drawbacks]
    
    [Provide alternatives for key shots]
    ```

11. **Production Schedule**

    ```markdown
    ## Suggested Production Timeline
    
    **Pre-Production** (Day 1-2):
    - [ ] Finalize storyboard
    - [ ] Gather props and assets
    - [ ] Confirm locations/settings
    - [ ] Generate digital human scripts
    
    **Production** (Day 3-4):
    - [ ] Shoot A-roll (presenter/main content)
    - [ ] Shoot B-roll (supplementary footage)
    - [ ] Capture graphics/screen recordings
    
    **Post-Production** (Day 5-7):
    - [ ] Edit rough cut
    - [ ] Add graphics and text
    - [ ] Color grade
    - [ ] Mix audio
    - [ ] Final export
    ```

12. **Save Storyboard**

    Save to `./output/scripts/storyboard-[video-title]-[date].md`

13. **Provide Summary**

    ```markdown
    ✅ Storyboard created!
    
    **Saved to**: `./output/scripts/storyboard-[filename].md`
    
    **Storyboard Summary**:
    - Total shots: [N]
    - Total duration: [X:XX]
    - Scene count: [N]
    - Setup locations: [N]
    
    **Production Requirements**:
    - Digital human shots: [N]
    - B-roll shots: [N]
    - Graphics needed: [N]
    - Stock footage: [N]
    
    **Shot Breakdown**:
    - Wide shots: [N]
    - Medium shots: [N]
    - Close-ups: [N]
    - Insert/detail shots: [N]
    
    **Next Steps**:
    1. Review storyboard and approve
    2. Request changes: "Adjust shot [N] to [change]"
    3. Generate assets: "Create images for shots [list]"
    4. Start production: "Generate video from this storyboard"
    5. Export shot list: "Create production shot list"
    
    **Quick Actions**:
    - Modify shot: "Change shot [N] camera angle to [angle]"
    - Add shot: "Add a close-up after shot [N]"
    - Remove shot: "Remove shot [N] and adjust timing"
    - Alternative: "Show me alternative options for shot [N]"
    
    Ready to proceed with production?
    ```

## Output Format

Storyboards should be:
- **Comprehensive**: Every shot documented
- **Visual**: Clear descriptions or sketches
- **Actionable**: Production-ready information
- **Organized**: Logical flow and grouping
- **Flexible**: Easy to modify and update

## Tips

- **Shot variety**: Mix wide, medium, and close-ups
- **Rule of thirds**: Note composition guidelines
- **Continuity**: Ensure logical visual flow
- **Coverage**: Plan for editing flexibility
- **Time budget**: Realistic duration per shot
- **Asset planning**: Identify all needed materials early

## Related Skills

- Use `script-writer` to create script first
- Use `keyframe-extractor` for reference shots
- Use `video-analyzer` to study similar videos
- Input for `batch-image-generator` or `video-segment-creator`
