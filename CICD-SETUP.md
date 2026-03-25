# 🚀 CI/CD Setup Guide - UCAP & CGAP Application

## 📋 Overview
Your application now has **Continuous Integration/Continuous Deployment (CI/CD)** set up with GitHub Actions!

## 🔄 What CI/CD Does

### 🧪 Staging Environment
- **Trigger**: Push to `develop` or `staging` branches
- **Build**: Development mode with `/staging/` base path
- **Deploy**: Automatic to staging server
- **URL**: `https://yourdomain.com/staging`

### 🚀 Production Environment  
- **Trigger**: Push to `main` or `master` branches
- **Build**: Production mode with `/` base path
- **Deploy**: Automatic to production server
- **URL**: `https://yourdomain.com`

## 🔧 GitHub Secrets Required

### For Production Deployment
Go to **GitHub Repository → Settings → Secrets and variables → Actions** and add:

```
FTP_SERVER=your-cpanel-domain.com
FTP_USERNAME=your-cpanel-username
FTP_PASSWORD=your-cpanel-password
FTP_PORT=21
FTP_PATH=/public_html
```

### For Staging Deployment
```
STAGING_FTP_SERVER=your-cpanel-domain.com
STAGING_FTP_USERNAME=your-cpanel-username
STAGING_FTP_PASSWORD=your-cpanel-password
STAGING_FTP_PORT=21
STAGING_FTP_PATH=/public_html/staging
STAGING_URL=https://yourdomain.com/staging
```

## 🌐 Environment URLs

### Production
- **URL**: `https://yourdomain.com`
- **Login**: `aryan` / `nestnepal2024`
- **Features**: Full UCAP & CGAP functionality

### Staging
- **URL**: `https://yourdomain.com/staging`
- **Login**: `aryan` / `nestnepal2024`
- **Features**: Development testing environment

## 🔄 Workflow Triggers

### Automatic Triggers
1. **Push to main/master** → Production deployment
2. **Push to develop/staging** → Staging deployment
3. **Pull requests** → Staging deployment for testing

### Manual Triggers
- Trigger workflows from GitHub Actions tab
- Choose specific workflow and branch

## 📊 Workflow Steps

### Test & Build Phase
1. ✅ **Checkout code** from repository
2. ✅ **Setup Node.js** v20 with caching
3. ✅ **Install dependencies** with `npm ci`
4. ✅ **Run linting** for code quality
5. ✅ **Build application** for target environment
6. ✅ **Upload artifacts** for deployment

### Deployment Phase
1. ✅ **Download build artifacts**
2. ✅ **Deploy via FTP** to cPanel
3. ✅ **Notify success/failure** with details

## 🧪 Staging Workflow Benefits

### Development Testing
- **Test new features** before production
- **Get feedback** from stakeholders
- **Debug issues** in safe environment
- **Performance testing** with real data

### Quality Assurance
- **Automated testing** on every push
- **Code quality checks** with ESLint
- **Build verification** before deployment
- **Rollback capability** if issues found

## 🚀 Production Workflow Benefits

### Continuous Deployment
- **Zero-downtime** deployments
- **Automated testing** before release
- **Rollback safety** with build artifacts
- **Deployment history** and tracking

### Reliability
- **Consistent builds** every time
- **Environment parity** (staging → production)
- **Error notifications** for quick response
- **Manual override** capability when needed

## 📱 Available Scripts

### Development
```bash
npm run dev              # Local development server
npm run build:dev         # Development build
npm run build:staging      # Staging build with /staging/ base
npm run preview:staging    # Preview staging build locally
```

### Production
```bash
npm run build            # Production build
npm run build:cpanel     # Production build for cPanel
npm run preview          # Preview production build locally
```

### CI/CD
```bash
npm run ci               # CI pipeline (install + build)
npm run predeploy        # Pre-deployment checks (test + build)
npm run test             # Run linting and tests
```

## 🔍 Monitoring & Troubleshooting

### GitHub Actions Monitoring
1. Go to **Actions** tab in your repository
2. Monitor workflow runs in real-time
3. Check logs for any failures
4. Download artifacts for debugging

### Common Issues & Solutions

#### FTP Connection Failed
- **Check**: Server, username, password in secrets
- **Verify**: Port 21 is open
- **Test**: FTP connection manually

#### Build Failed
- **Check**: Linting errors in workflow logs
- **Verify**: All dependencies install correctly
- **Review**: Recent code changes

#### Deployment Failed
- **Check**: File permissions on server
- **Verify**: Target directory exists
- **Test**: Manual FTP upload

## 🔄 Branch Strategy

### Recommended Workflow
```
main (production) ←─── develop (staging) ←─── feature/your-feature
```

1. **Create feature branches** from `develop`
2. **Test features** in staging environment
3. **Merge to develop** after testing
4. **Deploy to production** by merging to `main`

### Branch Protection
- **Protect `main` branch** from direct pushes
- **Require pull requests** for production
- **Require status checks** to pass
- **Require review** from team members

## 📊 Deployment Analytics

### Track Performance
- **Build times**: Monitor build duration
- **Deploy frequency**: Track deployment rate
- **Success rate**: Monitor failed deployments
- **Rollback events**: Track production issues

### Quality Metrics
- **Test coverage**: Code quality metrics
- **Lint warnings**: Code consistency
- **Bundle size**: Performance optimization
- **Load times**: User experience metrics

## 🎯 Best Practices

### Before Deploying
1. **Test locally** with `npm run test`
2. **Check staging** environment thoroughly
3. **Review changes** in pull request
4. **Backup production** before major updates

### After Deployment
1. **Verify functionality** in production
2. **Check performance** metrics
3. **Monitor error rates** closely
4. **Gather user feedback** on changes

### Security Considerations
1. **Rotate FTP credentials** regularly
2. **Use GitHub secrets** (never commit passwords)
3. **Monitor access logs** on server
4. **Keep dependencies** up to date

## ✅ Success Checklist

### CI/CD Ready When:
- [ ] GitHub secrets configured correctly
- [ ] Workflows run without errors
- [ ] Staging environment accessible
- [ ] Production deployment successful
- [ ] Monitoring and notifications working
- [ ] Rollback procedures documented

---

## 🎉 You're All Set!

Your UCAP & CGAP application now has:
- ✅ **Automated testing** on every push
- ✅ **Staging environment** for development
- ✅ **Production deployment** automation
- ✅ **Quality gates** and code review
- ✅ **Monitoring** and notifications
- ✅ **Rollback capability** for safety

**Push to `develop` for staging, merge to `main` for production!** 🚀
