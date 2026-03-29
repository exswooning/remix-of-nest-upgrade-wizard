# 🚀 Manual Deployment Guide

## Quick Manual Deployment

### Step 1: Build the Application
```bash
# Using Node.js portable
.\node-portable\node-v20.20.1-win-x64\node.exe .\node-portable\node-v20.20.1-win-x64\node_modules\vite\bin\vite.js build --mode production
```

### Step 2: Upload to cPanel
1. **Log in to cPanel** at `https://rdp.nishantbohara.com.np:2083`
2. **Go to File Manager**
3. **Navigate to public_html**
4. **Upload all files from dist/ folder**:
   - `index.html`
   - `assets/` folder
   - `.htaccess` (important for routing)

### Step 3: Set Permissions
- **Files**: 644
- **Directories**: 755

### Step 4: Test
Visit: `https://rdp.nishantbohara.com.np`

## Alternative: Use cPanel File Manager Upload

1. **Build locally** first
2. **Zip the dist/ folder**
3. **Upload and extract** in cPanel File Manager
4. **Move files to public_html**

## FTP Client Setup (FileZilla)
- **Host**: rdp.nishantbohara.com.np
- **Port**: 22 (SFTP) or 21 (FTP)
- **Username**: Your cPanel username
- **Password**: Your cPanel password
- **Protocol**: SFTP (if port 22) or FTP (if port 21)
