# 🚀 cPanel Deployment Guide - cPanel Branch

## 📋 Overview
This guide covers deployment from the `cpanel` branch to your cPanel hosting.

## 🔄 Branch Configuration
Your deployment is now configured to trigger from the `cpanel` branch:
- **Trigger**: Push to `cpanel` branch
- **Target**: Production cPanel server
- **Build**: Production optimized

## 🛠️ Step-by-Step Deployment

### Method 1: Automatic GitHub Actions (Recommended)

#### 1. Set Up GitHub Secrets
Go to **GitHub Repository → Settings → Secrets and variables → Actions** and add:

```
FTP_SERVER=your-cpanel-domain.com
FTP_USERNAME=your-cpanel-username  
FTP_PASSWORD=your-cpanel-password
FTP_PORT=21
FTP_PATH=/public_html
```

#### 2. Deploy Automatically
```bash
# Push to cpanel branch to trigger deployment
git push origin cpanel
```

The workflow will:
1. ✅ Build the application for production
2. ✅ Test and validate the build
3. ✅ Deploy to cPanel via FTP
4. ✅ Verify deployment health

### Method 2: Manual Deployment

#### 1. Build for Production
```bash
# Build the application
npm run build:cpanel
```

#### 2. Upload Files to cPanel
1. **Log in to cPanel**
2. **Go to File Manager → public_html**
3. **Backup existing files** (optional)
4. **Upload all files from `/dist` folder**:
   - `index.html`
   - `.htaccess` (critical for routing)
   - `assets/` folder with all JS/CSS files

#### 3. Set File Permissions
```bash
# Via File Manager or SSH:
chmod 755 public_html/
chmod 644 public_html/*.html
chmod 644 public_html/.htaccess
chmod 755 public_html/assets/
```

#### 4. Use Deployment Script (Alternative)
```bash
# Make script executable
chmod +x deploy-cpanel.sh

# Run deployment
./deploy-cpanel.sh [target_directory]
```

## 📁 Files to Deploy

### Essential Files
- ✅ `index.html` - Main application entry
- ✅ `.htaccess` - Apache routing configuration
- ✅ `assets/` folder - All JavaScript and CSS bundles

### Optional Files
- `cpanel.yml` - Deployment configuration
- `deploy-cpanel.sh` - Deployment script

## 🌐 After Deployment

### Test Your Application
1. **Visit your domain**: `https://yourdomain.com`
2. **Test login functionality**
3. **Verify all features work**:
   - UCAP Calculator
   - CGAP Contract Management
   - RFR & RFP modules
   - Mobile responsiveness

### Troubleshooting

#### Blank Screen
- Check browser console (F12) for errors
- Verify `.htaccess` is uploaded correctly
- Clear browser cache

#### 404 Errors on Page Refresh
- Ensure `.htaccess` is in root directory
- Check Apache configuration supports .htaccess

#### Login Issues
- Clear browser cache and cookies
- Test in incognito mode
- Check JavaScript loads correctly

## 🔧 Configuration Updates

### Update cpanel.yml
Edit `.cpanel.yml` with your actual domain:
```yaml
urls:
  production: "https://your-actual-domain.com"
```

### Environment Variables
If using Supabase or external services:
```yaml
environment_variables:
  VITE_SUPABASE_URL: "your-supabase-url"
  VITE_SUPABASE_PUBLISHABLE_KEY: "your-key"
```

## 📱 Features Available After Deployment

- ✅ **UCAP Calculator** - Hosting upgrade cost calculations
- ✅ **CGAP Management** - Contract lifecycle management  
- ✅ **RFR Tracking** - Right of First Refusal cases
- ✅ **RFP Processing** - Request for Payment handling
- ✅ **User Authentication** - Secure login system
- ✅ **Mobile Responsive** - Works on all devices
- ✅ **Production Optimized** - Fast loading and secure

## 🔄 Updates & Maintenance

### To Update Your Application
1. **Make changes** in your local project
2. **Test locally**: `npm run dev`
3. **Commit and push**: `git push origin cpanel`
4. **Automatic deployment** will handle the rest

### Manual Updates
```bash
# Build and deploy manually
npm run build:cpanel
./deploy-cpanel.sh
```

## 🚨 Important Notes

### Security
- **Never commit credentials** to repository
- **Use GitHub secrets** for FTP credentials
- **Keep software updated** on cPanel
- **Monitor access logs** regularly

### Performance
- **Assets are optimized** for production
- **Gzip compression** enabled via .htaccess
- **Browser caching** configured
- **Security headers** set

### Backup Strategy
- **Automatic backups** created by deployment script
- **Manual backup** before major updates
- **Rollback capability** if issues occur

## ✅ Success Checklist

Before going live, verify:
- [ ] GitHub secrets configured correctly
- [ ] Application builds without errors
- [ ] All files uploaded to cPanel
- [ ] Website loads correctly at your domain
- [ ] Login functionality works
- [ ] All UCAP/CGAP features operational
- [ ] Mobile responsive design works
- [ ] No console errors in browser

## 🎉 You're Ready!

Your UCAP & CGAP application is now configured for deployment from the `cpanel` branch. Push to this branch to deploy automatically, or use the manual deployment method when needed.

**For automatic deployment:**
```bash
git push origin cpanel
```

**For manual deployment:**
```bash
npm run build:cpanel
./deploy-cpanel.sh
```

Your application will be live and ready for users! 🚀
