# 🚀 cPanel Deployment Guide - UCAP & CGAP Application

## 📋 Prerequisites
- cPanel hosting account with access to File Manager
- Domain or subdomain ready for the application
- FTP/SFTP access (optional but recommended)

## 🎯 Quick Setup Overview
1. Build the application for production
2. Create environment variables (if needed)
3. Upload files to cPanel
4. Configure domain settings
5. Test the deployment

---

## 🛠️ Step 1: Build for Production

### Run the Build Command
```bash
# In your project directory
npm run build:cpanel
```

This creates a `/dist` folder with all optimized files.

### What Gets Built
- ✅ Optimized JavaScript bundles
- ✅ Minified CSS files
- ✅ Compressed assets
- ✅ Production-ready HTML
- ✅ .htaccess for routing

---

## 📁 Step 2: Prepare Files for Upload

### Files to Upload (from `/dist` folder)
```
dist/
├── index.html              # Main entry point
├── .htaccess               # Apache configuration (CRITICAL!)
├── assets/
│   ├── index-*.js          # JavaScript bundles
│   ├── index-*.css         # CSS files
│   └── [other assets]      # Images, fonts, icons
```

### Important Notes
- **DO NOT** upload `src/` folder
- **DO NOT** upload `package.json` or other dev files
- **ONLY** upload the `/dist` folder contents

---

## 🌐 Step 3: Upload to cPanel

### Method A: Using File Manager (Recommended)
1. **Log in to cPanel**
2. **Go to File Manager**
3. **Navigate to `public_html`**
4. **Create a folder** (optional) or use root:
   - For main site: `public_html/`
   - For subdirectory: `public_html/ucap/`
5. **Upload all files** from `/dist` folder:
   - Click "Upload"
   - Select all files from `/dist`
   - Upload and overwrite if prompted

### Method B: Using FTP/SFTP
1. **Connect to your server** using FTP client
2. **Navigate to `public_html`**
3. **Upload entire `/dist` contents**
4. **Verify file permissions** (755 for folders, 644 for files)

---

## ⚙️ Step 4: Critical cPanel Configuration

### 1. File Permissions
```bash
# Set correct permissions (via File Manager or SSH)
chmod 755 public_html/
chmod 644 public_html/*.html
chmod 644 public_html/.htaccess
chmod 755 public_html/assets/
```

### 2. Apache Configuration (.htaccess)
The included `.htaccess` file handles:
- ✅ React Router SPA routing
- ✅ Gzip compression
- ✅ Browser caching
- ✅ Security headers

### 3. Domain Settings (if using subdirectory)
If deploying to `yourdomain.com/ucap/`:
1. Update `vite.config.ts` base path:
```typescript
base: '/ucap/'
```
2. Rebuild: `npm run build:cpanel`
3. Re-upload files

---

## 🔧 Step 5: Domain & SSL Setup

### For Main Domain
1. **Point DNS** to your cPanel server
2. **Enable SSL** (Let's Encrypt is free in cPanel)
3. **Verify HTTPS redirect**

### For Subdomain
1. **Create subdomain** in cPanel: `ucap.yourdomain.com`
2. **Document Root**: `public_html/ucap`
3. **Upload files** to that folder

---

## 🧪 Step 6: Test Deployment

### Basic Tests
1. **Visit your domain**: `https://yourdomain.com`
2. **Check login page** loads
3. **Test login credentials**:
   - Username: `aryan`
   - Password: `nestnepal2024`
4. **Verify all tabs work** (UCAP, CGAP, RFR, RFP)

### Troubleshooting Checklist
- [ ] Blank screen? Check browser console (F12)
- [ ] 404 errors? Verify `.htaccess` is uploaded
- [ ] Login issues? Clear browser cache
- [ ] Forms not working? Check JavaScript loads

---

## 📱 Step 7: Mobile & Performance

### Responsive Design
- ✅ Works on desktop, tablet, mobile
- ✅ Touch-friendly interface
- ✅ Optimized for all screen sizes

### Performance Features
- ✅ Gzip compression enabled
- ✅ Browser caching configured
- ✅ Minified assets
- ✅ Lazy loading for images

---

## 🔄 Step 8: Ongoing Maintenance

### Updates & Changes
1. **Make changes** in your local project
2. **Test locally**: `npm run dev`
3. **Build for production**: `npm run build:cpanel`
4. **Re-upload** `/dist` contents
5. **Clear cache** if needed

### Backup Strategy
- **Download current files** before updates
- **Keep local copy** of your project
- **Test changes** locally first

---

## 🆘 Common Issues & Solutions

### Issue: Blank White Screen
**Cause**: Missing `.htaccess` or routing issues
**Solution**: 
1. Upload `.htaccess` file
2. Check browser console for errors
3. Clear browser cache

### Issue: Login Not Working
**Cause**: JavaScript errors or localStorage issues
**Solution**:
1. Check browser console
2. Clear browser cache and cookies
3. Try incognito mode

### Issue: 404 on Page Refresh
**Cause**: Apache not configured for SPA routing
**Solution**: Ensure `.htaccess` is in root directory

### Issue: CSS Not Loading
**Cause**: File permissions or incorrect paths
**Solution**:
1. Check file permissions (644)
2. Verify CSS files exist in `/assets/`
3. Clear browser cache

---

## 📞 Support & Help

### What to Include in Support Requests
1. **URL** where the app is deployed
2. **Browser console** errors (F12 screenshot)
3. **cPanel version** and hosting provider
4. **Specific error** description

### Quick Debug Commands
```javascript
// In browser console
console.log('App loaded:', !!document.querySelector('#root'));
console.log('CSS loaded:', !!document.querySelector('link[href*="index"]'));
console.log('JS loaded:', !!window.React);
```

---

## ✅ Success Checklist

Before going live, verify:
- [ ] All files uploaded correctly
- [ ] Login page loads and works
- [ ] All tabs (UCAP, CGAP, RFR, RFP) function
- [ ] Mobile responsive design works
- [ ] SSL certificate installed
- [ ] Performance is acceptable
- [ ] No console errors

---

## 🎉 You're Live!

Your UCAP & CGAP application is now running on cPanel! Users can:
- Calculate hosting upgrade costs (UCAP)
- Manage contracts and agreements (CGAP)
- Track RFR (Right of First Refusal) cases
- Process RFP (Request for Payment) requests
- Access all features on desktop and mobile

**Bookmark this guide** for future updates and maintenance!
