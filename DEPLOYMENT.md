# cPanel Deployment Guide for UCAP & CGAP Application

## 🚀 Quick Deployment Steps

### 1. Build for Production
```bash
npm run build:cpanel
```

### 2. Upload to cPanel
1. Connect to your cPanel account
2. Go to **File Manager** → **public_html**
3. Backup existing files (optional but recommended)
4. Upload the entire `/dist` folder contents to `public_html`
5. Make sure `.htaccess` is uploaded to the root

### 3. Verify Deployment
- Visit your domain: `https://yourdomain.com`
- Check that all pages load correctly
- Test login functionality with credentials:
  - Username: `aryan`
  - Password: `nestnepal2024`

## 📁 What Gets Uploaded

Upload these files from the `/dist` folder:
```
dist/
├── index.html          # Main HTML file
├── .htaccess           # Apache configuration (critical!)
├── assets/
│   ├── index-*.js      # JavaScript bundles
│   ├── index-*.css      # CSS files
│   └── [other assets]  # Images, fonts, etc.
```

## ⚙️ Important cPanel Settings

### File Permissions
- Ensure `public_html` and all subdirectories have **755** permissions
- Ensure files have **644** permissions

### Apache Configuration
The included `.htaccess` file handles:
- ✅ React Router (SPA routing)
- ✅ Gzip compression
- ✅ Static asset caching
- ✅ Security headers

## 🔧 Troubleshooting

### Blank Screen Issues
1. Check browser console (F12) for JavaScript errors
2. Verify all files uploaded correctly
3. Check that `.htaccess` is in the root directory
4. Clear browser cache and test again

### Login Issues
- Default credentials: `aryan` / `nestnepal2024`
- Check if localStorage is working
- Verify auth context is properly initialized

### Performance Optimization
- The build is optimized for production
- Assets are minified and gzipped
- Browser caching is configured via `.htaccess`

## 🌐 Features Available

### UCAP (Upgrade Cost Calculator)
- Hosting upgrade cost calculations
- Pro-rata billing support
- Multiple billing cycles (monthly, annual, triennial)
- User management system
- Calculation history

### CGAP (Contract Management)
- Contract lifecycle management
- Addendum tracking
- Amendment processing
- **NEW**: RFR (Right of First Refusal) tracking
- **NEW**: RFP (Request for Payment) processing
- Database of all contracts
- Admin settings and configurations

## 📱 Mobile Responsive
The application is fully responsive and works on:
- Desktop computers
- Tablets
- Mobile devices (iOS/Android)

## 🔐 Security Features
- Authentication system with role-based access
- Secure headers configured
- Input validation and sanitization
- Session management

## 📊 Data Storage
- All data stored in browser localStorage
- No server-side database required for basic functionality
- Optional Supabase integration available

## 🚀 Going Live

Once deployed, your application will be fully functional with:
- ✅ Complete UCAP calculator
- ✅ Full CGAP contract management
- ✅ User authentication and management
- ✅ Responsive design
- ✅ Production optimization

---

**Need help?** Check the browser console for any errors and ensure all files are uploaded correctly to your cPanel hosting.
