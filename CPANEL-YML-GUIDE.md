# 🚀 cPanel.yml Setup Guide - UCAP & CGAP Application

## 📋 Overview
Your application now includes a complete `cpanel.yml` configuration file that ensures seamless deployment and optimal performance on cPanel hosting.

## 🎯 What cPanel.yml Provides

### 🛠️ Deployment Configuration
- **Target directory**: `public_html` (configurable)
- **Source directory**: `dist` (built files)
- **Build mode**: Production optimized
- **Environment**: Production-ready settings

### 🌐 Web Server Setup
- **Apache configuration**: Optimized for React SPA
- **.htaccess processing**: Enabled for routing
- **Gzip compression**: Enabled for performance
- **Browser caching**: Optimized cache headers
- **Security headers**: Comprehensive security setup

### 🔧 File Management
- **Automatic permissions**: 755 for directories, 644 for files
- **Backup creation**: Automatic backup before deployment
- **Rollback capability**: Easy rollback if issues occur
- **Health checks**: Post-deployment verification

## 📁 Files Created

### 1. cpanel.yml
Complete cPanel deployment configuration with:
- Application metadata
- Deployment settings
- Web server configuration
- Security and performance optimization
- Monitoring and logging setup
- Backup and rollback procedures

### 2. deploy-cpanel.sh
Automated deployment script that:
- Validates cPanel.yml configuration
- Creates backups of existing deployment
- Copies built files to target directory
- Sets proper file permissions
- Performs health checks
- Provides rollback functionality

### 3. Updated GitHub Actions
Enhanced workflows that:
- Verify cPanel.yml exists
- Upload configuration files to server
- Provide detailed deployment information
- Include comprehensive error handling

## 🚀 Deployment Methods

### Method 1: GitHub Actions (Recommended)
**Automatic deployment on push to main branch:**
1. Push code to GitHub
2. GitHub Actions builds and tests
3. Automatically deploys to cPanel using cPanel.yml
4. Sends deployment notifications

### Method 2: Manual Deployment Script
**Deploy from your local machine:**
```bash
# Build the application
npm run build:cpanel

# Run deployment script
chmod +x deploy-cpanel.sh
./deploy-cpanel.sh [target_directory]
```

### Method 3: cPanel Git Integration
**Direct Git deployment:**
```bash
# In cPanel Terminal
cd ~/public_html
git pull origin main
chmod +x deploy-cpanel.sh
./deploy-cpanel.sh
```

## ⚙️ cPanel.yml Configuration Details

### Application Settings
```yaml
name: "UCAP & CGAP Application"
version: "1.0.0"
description: "UCAP Calculator and CGAP Contract Management System"
```

### Deployment Configuration
```yaml
deploy:
  target: public_html          # cPanel target directory
  source: dist                # Build output directory
  type: static               # Static site deployment
  build_command: "echo 'Deploying...'"
```

### Web Server Optimization
```yaml
webserver:
  apache:
    htaccess: true           # Enable .htaccess processing
    gzip: true              # Enable gzip compression
    cache: true             # Enable browser caching
    security_headers: true # Enable security headers
  routing:
    spa_routing: true       # React Router support
    fallback: index.html    # SPA fallback
    clean_urls: true        # Clean URL support
```

### Security Configuration
```yaml
security:
  https_only: true          # Force HTTPS
  headers:
    X-Frame-Options: "DENY"
    X-Content-Type-Options: "nosniff"
    X-XSS-Protection: "1; mode=block"
    Content-Security-Policy: "default-src 'self'..."
```

### Performance Optimization
```yaml
performance:
  cache:
    static_assets: 31536000  # 1 year cache for assets
    html: 3600             # 1 hour cache for HTML
  compression:
    gzip: true
    brotli: true
    level: 6
```

## 🔧 Customization Options

### Change Target Directory
Edit `cpanel.yml`:
```yaml
deploy:
  target: public_html/ucap  # Deploy to subdirectory
```

### Modify Cache Settings
```yaml
performance:
  cache:
    static_assets: 2592000  # 30 days instead of 1 year
    html: 1800             # 30 minutes instead of 1 hour
```

### Custom Security Headers
```yaml
security:
  headers:
    Custom-Header: "Custom-Value"
```

## 📊 Monitoring and Health Checks

### Built-in Health Checks
- **File verification**: Essential files present
- **Asset verification**: Assets directory exists
- **HTTP status**: 200 OK response
- **Performance metrics**: File sizes and load times

### Logging Configuration
```yaml
monitoring:
  error_logging: true
  access_logging: true
  log_level: info
  log_retention: 30
```

## 🔄 Backup and Rollback

### Automatic Backup
- Created before each deployment
- Stored in `backup_YYYYMMDD_HHMMSS` directory
- Includes all application files
- Retained for manual rollback

### Manual Rollback
```bash
# List available backups
ls -la backup_*

# Rollback to specific backup
cp -r backup_20240325_120000/* public_html/
```

### Rollback Script
```bash
# Automatic rollback using deployment script
./deploy-cpanel.sh --rollback backup_20240325_120000
```

## 🌐 Environment Variables

### cPanel.yml Variables
```yaml
environment_variables:
  NODE_ENV: production
  PUBLIC_URL: "/"
  VITE_SUPABASE_URL: ""
  VITE_SUPABASE_PUBLISHABLE_KEY: ""
```

### GitHub Secrets Required
```
FTP_SERVER=your-cpanel-domain.com
FTP_USERNAME=your-cpanel-username
FTP_PASSWORD=your-cpanel-password
FTP_PORT=21
FTP_PATH=/public_html
```

## 📱 Application URLs

### Production URL
```yaml
urls:
  production: "https://yourdomain.com"
  staging: "https://yourdomain.com/staging"
  development: "http://localhost:8080"
```

## 🎯 Deployment Workflow

### Pre-Deployment
1. **Code validation**: Linting and testing
2. **Build verification**: Production build successful
3. **Configuration check**: cPanel.yml exists and valid
4. **Backup creation**: Current deployment backed up

### Deployment
1. **File transfer**: Built files copied to target
2. **Permission setting**: Proper file permissions applied
3. **Configuration**: cPanel.yml processed
4. **Health check**: Application verified

### Post-Deployment
1. **Verification**: All files present and accessible
2. **Performance check**: Load times acceptable
3. **Functionality test**: Features working correctly
4. **Notification**: Deployment success reported

## 🔍 Troubleshooting

### Common Issues

#### cPanel.yml Not Found
```bash
# Verify file exists
ls -la cpanel.yml

# Recreate if missing
# Copy from repository or backup
```

#### Permission Denied
```bash
# Fix permissions manually
find public_html -type d -exec chmod 755 {} \;
find public_html -type f -exec chmod 644 {} \;
chmod 644 public_html/.htaccess
```

#### Health Check Failed
```bash
# Check HTTP status manually
curl -I https://yourdomain.com

# Verify index.html exists
ls -la public_html/index.html
```

#### Rollback Needed
```bash
# Find latest backup
ls -la backup_* | tail -1

# Perform rollback
cp -r backup_latest/* public_html/
```

## 📋 Deployment Checklist

### Before Deployment
- [ ] cPanel.yml exists and is valid
- [ ] Build completed successfully (`npm run build:cpanel`)
- [ ] Essential files present (index.html, .htaccess)
- [ ] FTP credentials configured in GitHub secrets
- [ ] Backup of current deployment available

### After Deployment
- [ ] Website loads correctly
- [ ] Login functionality works
- [ ] All UCAP features operational
- [ ] All CGAP tabs functional
- [ ] Mobile responsive design works
- [ ] No console errors
- [ ] Performance acceptable

### Monitoring
- [ ] Error logs checked
- [ ] Access logs reviewed
- [ ] Performance metrics monitored
- [ ] Security headers verified
- [ ] SSL certificate valid

## ✅ Success Indicators

Your cPanel deployment is successful when:
- ✅ Application loads at your domain
- ✅ All features work correctly
- ✅ Mobile responsive design functions
- ✅ No console errors
- ✅ Performance is optimized
- ✅ Security headers are active
- ✅ Backups are created
- ✅ Health checks pass

## 🎉 Benefits of cPanel.yml

### 🚀 Automated Deployment
- Zero-configuration deployment
- Consistent builds every time
- Automatic optimization
- Error prevention

### 🔧 Enhanced Performance
- Optimized caching strategies
- Compression enabled
- Security headers configured
- File permissions managed

### 📊 Monitoring & Safety
- Built-in health checks
- Automatic backups
- Rollback capability
- Comprehensive logging

### 🌱 Scalability
- Environment-specific configurations
- Easy customization
- Multi-environment support
- Future-proof setup

---

## 🎯 Ready for Production!

Your UCAP & CGAP application now has:
- ✅ **Complete cPanel.yml configuration**
- ✅ **Automated deployment script**
- ✅ **Enhanced GitHub Actions**
- ✅ **Backup and rollback capability**
- ✅ **Performance optimization**
- ✅ **Security hardening**
- ✅ **Monitoring and logging**

**Push to main branch and watch the automatic deployment!** 🚀
