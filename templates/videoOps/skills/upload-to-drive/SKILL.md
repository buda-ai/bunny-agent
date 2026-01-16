---
name: upload-to-drive
description: Uploads completed videos and related files to Google Drive with organized folder structure
---

# Upload to Google Drive

## When to Use This Skill

- Need to store completed videos in cloud storage
- Want to share videos with team members or clients
- Require organized video asset management
- Need to backup production files
- Want accessible storage for distribution

## What This Skill Does

1. Connects to Google Drive via MCP server
2. Creates organized folder structure for video projects
3. Uploads completed videos to designated folders
4. Uploads related assets (scripts, thumbnails, metadata)
5. Sets appropriate sharing permissions
6. Generates shareable links for distribution
7. Maintains organized video library

## How to Use

**Upload Single Video:**
```
Upload the completed video to Google Drive
Folder: Product Videos
Share: Public link
```

**Upload Project Bundle:**
```
Upload all project files to Google Drive
- Final video
- Script
- Thumbnail
- Metadata
Folder: Projects/TeamSync Campaign
```

**Organize Existing Videos:**
```
Organize these videos in Google Drive:
- teamsync_intro.mp4 → Product Videos/TeamSync/
- teamsync_demo.mp4 → Product Videos/TeamSync/
- teamsync_testimonial.mp4 → Product Videos/TeamSync/
```

## Instructions

### Prerequisites Check
1. Verify Google Drive MCP server is configured
2. Check Google Drive authentication is valid
3. Verify sufficient storage space available
4. Test connection before upload
5. If unavailable, provide manual upload instructions

### Folder Structure Planning
1. **Recommended folder structure:**
   ```
   Video Projects/
   ├── Product Videos/
   │   ├── [Product Name]/
   │   │   ├── Finals/
   │   │   ├── Drafts/
   │   │   └── Assets/
   ├── Shorts/
   │   ├── YouTube Shorts/
   │   ├── Instagram Reels/
   │   └── TikTok/
   ├── Scripts/
   ├── Raw Footage/
   └── Archives/
   ```

2. Create folders as needed:
   ```
   Tool: google-drive (via MCP)
   Method: create_folder

   Parameters:
   {
     "name": "Product Videos",
     "parent_id": "root" or specific folder ID
   }
   ```

### File Preparation Phase
1. Verify file exists and is ready for upload:
   - Check file size
   - Verify file format (MP4, MOV, etc.)
   - Confirm file is not corrupted
   - Calculate upload time estimate

2. Prepare metadata:
   - Original filename
   - Project name
   - Creation date
   - Duration
   - Resolution
   - File size
   - Description/notes

3. Generate thumbnail (if not exists):
   ```bash
   # Extract thumbnail from video
   ffmpeg -i video.mp4 -ss 00:00:03 -vframes 1 -vf "scale=1280:-1" thumbnail.jpg
   ```

### Upload Execution Phase

**Using Google Drive MCP:**

1. **Upload file to Google Drive:**
   ```
   Tool: google-drive
   Method: upload_file

   Parameters:
   {
     "file_path": "/path/to/video.mp4",
     "destination_folder_id": "folder_id_here",
     "name": "teamsync_product_video_v1.mp4",
     "description": "TeamSync product introduction video - 60s version"
   }
   ```

2. **Set file permissions:**
   ```
   Tool: google-drive
   Method: set_permissions

   Parameters:
   {
     "file_id": "uploaded_file_id",
     "permission_type": "anyone",  // or "user", "group", "domain"
     "role": "reader"  // or "writer", "commenter"
   }
   ```

3. **Generate shareable link:**
   ```
   Tool: google-drive
   Method: get_share_link

   Parameters:
   {
     "file_id": "uploaded_file_id"
   }
   ```

### Batch Upload (Multiple Files)
1. Upload all project files in sequence:
   ```
   For each file in project:
   1. Upload final video → Finals/
   2. Upload draft versions → Drafts/
   3. Upload thumbnail → Assets/
   4. Upload script → Assets/
   5. Upload metadata.txt → Assets/
   ```

2. Create project README in Drive:
   ```
   File: PROJECT_INFO.txt
   Content:
   Project: TeamSync Product Video
   Created: 2026-01-07
   Duration: 60 seconds
   Resolution: 1920x1080
   Files:
   - teamsync_product_video_final.mp4 (Final version)
   - teamsync_product_video_draft1.mp4 (Draft)
   - script.txt (Video script)
   - thumbnail.jpg (Video thumbnail)
   ```

### Post-Upload Verification
1. Verify upload completed successfully
2. Check file is accessible via link
3. Confirm file plays correctly in Drive
4. Verify sharing permissions are correct
5. Test download (if applicable)
6. Confirm file appears in correct folder

### Share Link Generation
1. Generate appropriate sharing link type:
   - **Public link**: Anyone with link can view
   - **Domain link**: Anyone in organization
   - **Specific users**: Share with email addresses

2. Provide link with context:
   ```
   ✓ Video uploaded successfully

   **Google Drive Link:**
   https://drive.google.com/file/d/FILE_ID/view

   **Quick Access:**
   - View: Click link above
   - Download: File → Download
   - Share: Share button → Copy link

   **Permissions:** Anyone with link can view
   **File Size:** 24.5 MB
   **Storage Used:** 24.5 MB of 15 GB
   ```

### Fallback Mode (Manual Upload)
When Google Drive MCP is unavailable:

1. **Provide manual upload instructions:**
   ```
   # Manual Google Drive Upload Instructions

   ## Step 1: Access Google Drive
   1. Go to https://drive.google.com
   2. Sign in with your Google account

   ## Step 2: Create Folder Structure
   1. Click "New" → "Folder"
   2. Create: "Video Projects"
   3. Inside, create: "Product Videos"
   4. Inside, create: "[Your Product Name]"

   ## Step 3: Upload Files
   1. Navigate to destination folder
   2. Click "New" → "File upload"
   3. Select your video file: [filename]
   4. Wait for upload to complete
   5. Verify video plays in Drive preview

   ## Step 4: Generate Share Link
   1. Right-click uploaded file
   2. Click "Get link"
   3. Set to "Anyone with the link"
   4. Set permission to "Viewer"
   5. Click "Copy link"
   6. Share link as needed

   ## Files to Upload:
   - teamsync_product_video_final.mp4 (Main video)
   - script.txt (Video script)
   - thumbnail.jpg (Video thumbnail)
   ```

2. **Alternative cloud storage options:**
   - **Dropbox**: https://www.dropbox.com
   - **OneDrive**: https://onedrive.live.com
   - **Vimeo**: https://vimeo.com (video-specific)
   - **YouTube**: https://youtube.com (unlisted for sharing)

## Example

**User Request:**
> Upload the TeamSync product video to Google Drive
> Make it shareable with anyone

**Agent Response:**

✓ Checking Google Drive connection...
✓ Google Drive MCP available

**Preparing upload:**
- File: teamsync_product_video_final.mp4
- Size: 24.5 MB
- Duration: 60 seconds
- Resolution: 1920x1080

**Creating folder structure:**
✓ Checking for "Video Projects" folder...
✓ Creating "Product Videos/TeamSync/Finals/"...

**Uploading file:**
[Progress: 0%... 25%... 50%... 75%... 100%]
✓ Upload complete (8.3 seconds)

**Setting permissions:**
✓ Share link: Anyone with link can view
✓ Permission: Viewer (read-only)

**Upload Complete!**

📁 **Location:** Video Projects/Product Videos/TeamSync/Finals/

🔗 **Share Link:**
https://drive.google.com/file/d/1a2b3c4d5e6f7g8h9i0j/view?usp=sharing

**File Details:**
- Filename: teamsync_product_video_final.mp4
- Size: 24.5 MB
- Uploaded: 2026-01-07 10:32 AM
- Permissions: Public (view only)

**Quick Actions:**
- View in browser: [Link above]
- Download: Right-click → Download
- Embed: File → Embed item
- Share: Copy link above

**Storage Status:**
- Used: 156.8 MB of 15 GB (1.02%)
- Remaining: 14.84 GB

## Advanced Features

- **Batch folder creation**: Set up complete project structure
- **Automatic organization**: Date-based or project-based filing
- **Version control**: Maintain v1, v2, v3 versions
- **Thumbnail generation**: Auto-create and upload thumbnails
- **Metadata files**: Upload companion info files
- **Team folder sharing**: Share entire folders with teams

## Tips for Success

1. **Organized structure**: Maintain consistent folder hierarchy
2. **Clear naming**: Use descriptive, dated filenames
3. **Include metadata**: Upload project info with videos
4. **Regular cleanup**: Archive old projects periodically
5. **Storage monitoring**: Track storage usage
6. **Backup originals**: Keep copies of raw footage
7. **Version control**: Number versions clearly (v1, v2, v3)

## Google Drive Best Practices

### File Naming Conventions
```
[project]_[type]_[version]_[date].mp4

Examples:
- teamsync_product_video_v1_2026-01-07.mp4
- teamsync_demo_short_final_2026-01-07.mp4
- teamsync_testimonial_draft2_2026-01-06.mp4
```

### Folder Organization
```
Video Projects/
├── Active Projects/
│   └── [Current projects being worked on]
├── Completed/
│   └── [Finished and delivered projects]
├── Archives/
│   └── [Old projects, drafts, unused footage]
└── Assets/
    ├── Music/
    ├── Graphics/
    └── Stock Footage/
```

### Permission Management
- **Public sharing**: Use for marketing videos, public content
- **Link sharing**: Use for client reviews, team collaboration
- **Specific users**: Use for confidential or internal content
- **Domain restricted**: Use for company-internal videos

## Troubleshooting

### Upload Failures
- **Connection timeout**: Retry upload, check internet connection
- **File too large**: Compress video or use chunked upload
- **Insufficient storage**: Clean up old files or upgrade plan
- **Authentication expired**: Re-authenticate Google Drive

### Permission Issues
- **Can't share publicly**: Check organization settings
- **Link not working**: Verify permissions are set correctly
- **Can't access file**: Check if file was moved or deleted

### Performance Optimization
- **Slow uploads**: Compress video to reduce file size
- **Large batches**: Upload during off-peak hours
- **Frequent uploads**: Use desktop sync client

## Integration with Other Skills

- **script-generation**: Upload generated scripts to Assets folder
- **video-generation**: Upload Veo-generated videos automatically
- **heygen-avatar**: Upload HeyGen videos and organize by avatar type
- **shorts-creation**: Upload shorts in batch to Shorts folder

## Related Skills

- **script-generation**: Scripts can be uploaded alongside videos
- **video-generation**: Completed videos ready for upload
- **heygen-avatar**: Avatar videos ready for cloud storage
- **shorts-creation**: Batch shorts upload and organization
