#!/bin/bash

# 🚀 UCAP & CGAP - GitHub Repository Setup Script
# Run this script to initialize your Git repository and set up CI/CD

echo "🎯 Setting up UCAP & CGAP GitHub Repository..."

# Check if git is initialized
if [ ! -d ".git" ]; then
    echo "📥 Initializing Git repository..."
    git init
    git branch -M main
else
    echo "✅ Git repository already exists"
fi

# Add all files to git
echo "📁 Adding files to Git..."
git add .

# Create initial commit
echo "💾 Creating initial commit..."
git commit -m "🚀 Initial commit: UCAP & CGAP Application

✅ Features:
- UCAP Calculator with wide desktop forms
- CGAP Contract Management with 7 tabs
- RFR (Right of First Refusal) tracking
- RFP (Request for Payment) processing
- Mobile responsive design
- Production-optimized build
- CI/CD workflows for automated deployment

🛠️ Technical Stack:
- React 18.3.1 with TypeScript
- Vite 5.4.1 build system
- Tailwind CSS with dark mode
- Shadcn/ui components
- React Router DOM for navigation
- React Query for state management

📱 Ready for:
- cPanel deployment with .htaccess
- GitHub Actions CI/CD automation
- Staging and production environments
- Mobile and desktop responsive design"

# Add remote origin (replace with your repository URL)
echo "🔗 Adding remote origin..."
read -p "Enter your GitHub repository URL (https://github.com/username/repo.git): " repo_url

if [ ! -z "$repo_url" ]; then
    git remote add origin $repo_url
    echo "✅ Remote origin added: $repo_url"
else
    echo "⚠️  No repository URL provided. Add it later with:"
    echo "git remote add origin YOUR_REPO_URL"
fi

# Create develop branch for staging
echo "🌿 Creating develop branch..."
git checkout -b develop
git push -u origin main
git push -u origin develop

echo "✅ Repository setup complete!"
echo ""
echo "🎯 Next Steps:"
echo "1. 📥 Push to GitHub: git push origin main"
echo "2. 🔧 Configure GitHub Secrets in repository settings"
echo "3. 🚀 Enable GitHub Actions workflows"
echo "4. 🌐 Set up staging and production environments"
echo ""
echo "📋 Required GitHub Secrets:"
echo "- FTP_SERVER"
echo "- FTP_USERNAME" 
echo "- FTP_PASSWORD"
echo "- FTP_PORT"
echo "- FTP_PATH"
echo "- STAGING_FTP_SERVER (optional)"
echo "- STAGING_FTP_USERNAME (optional)"
echo "- STAGING_FTP_PASSWORD (optional)"
echo "- STAGING_FTP_PATH (optional)"
echo "- STAGING_URL (optional)"
echo ""
echo "🎉 Your UCAP & CGAP app is ready for CI/CD!"
