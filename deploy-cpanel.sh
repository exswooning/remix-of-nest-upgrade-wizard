#!/bin/bash

# 🚀 UCAP & CGAP - cPanel Deployment Script
# This script handles deployment using cPanel.yml configuration

set -e  # Exit on any error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Cleanup function for rollback
cleanup_on_error() {
    echo -e "${RED}❌ Deployment failed! Rolling back...${NC}"
    if [ -d "$BACKUP_DIR" ]; then
        rm -rf "$TARGET_DIR"/*
        cp -r "$BACKUP_DIR"/* "$TARGET_DIR/"
        echo -e "${GREEN}✅ Rollback completed${NC}"
    fi
    # Clean up temporary files
    rm -f "/tmp/.htaccess_backup"
    exit 1
}

# Set error trap immediately
trap cleanup_on_error ERR

# Configuration
DEPLOY_CONFIG="cpanel.yml"
BUILD_DIR="dist"
TARGET_DIR="${1:-public_html}"
BACKUP_DIR="backup_$(date +%Y%m%d_%H%M%S)"

echo -e "${BLUE}🚀 UCAP & CGAP - cPanel Deployment${NC}"
echo -e "${BLUE}=====================================${NC}"

# Check if cpanel.yml exists
if [ ! -f "$DEPLOY_CONFIG" ]; then
    echo -e "${RED}❌ Error: $DEPLOY_CONFIG not found!${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Found deployment configuration: $DEPLOY_CONFIG${NC}"

# Check if build directory exists
if [ ! -d "$BUILD_DIR" ]; then
    echo -e "${RED}❌ Error: Build directory '$BUILD_DIR' not found!${NC}"
    echo -e "${YELLOW}🔧 Please run 'npm run build:cpanel' first${NC}"
    exit 1
fi

echo -e "${GREEN}✅ Build directory found: $BUILD_DIR${NC}"

# Parse cpanel.yml for configuration
echo -e "${BLUE}📋 Reading deployment configuration...${NC}"

# Extract target directory from cpanel.yml (fallback to parameter)
TARGET_DIR=$(grep -A 5 "deploy:" "$DEPLOY_CONFIG" | grep "target:" | cut -d: -f2 | xargs || echo "$TARGET_DIR")

echo -e "${GREEN}🎯 Target directory: $TARGET_DIR${NC}"

# Create backup of existing deployment
if [ -d "$TARGET_DIR" ] && [ "$(ls -A $TARGET_DIR)" ]; then
    echo -e "${YELLOW}📦 Creating backup of existing deployment...${NC}"
    mkdir -p "$BACKUP_DIR"
    if cp -r "$TARGET_DIR"/* "$BACKUP_DIR/"; then
        echo -e "${GREEN}✅ Backup created: $BACKUP_DIR${NC}"
    else
        echo -e "${RED}❌ Backup creation failed!${NC}"
        exit 1
    fi
fi

# Clear target directory (but keep .htaccess if it exists)
echo -e "${BLUE}🧹 Cleaning target directory...${NC}"
if [ -f "$TARGET_DIR/.htaccess" ]; then
    cp "$TARGET_DIR/.htaccess" "/tmp/.htaccess_backup"
fi
rm -rf "$TARGET_DIR"/*
mkdir -p "$TARGET_DIR"

# Restore .htaccess if it existed
if [ -f "/tmp/.htaccess_backup" ]; then
    cp "/tmp/.htaccess_backup" "$TARGET_DIR/.htaccess"
    rm "/tmp/.htaccess_backup"
fi

# Copy built files to target directory
echo -e "${BLUE}📁 Copying built files to target directory...${NC}"
cp -r "$BUILD_DIR"/* "$TARGET_DIR/"

# Set file permissions
echo -e "${BLUE}🔧 Setting file permissions...${NC}"
find "$TARGET_DIR" -type d -exec chmod 755 {} \;
find "$TARGET_DIR" -type f -exec chmod 644 {} \;
chmod 644 "$TARGET_DIR/.htaccess" 2>/dev/null || true

echo -e "${GREEN}✅ File permissions set${NC}"

# Verify deployment
echo -e "${BLUE}🔍 Verifying deployment...${NC}"

# Check essential files
ESSENTIAL_FILES=("index.html" ".htaccess")
for file in "${ESSENTIAL_FILES[@]}"; do
    if [ -f "$TARGET_DIR/$file" ]; then
        echo -e "${GREEN}✅ $file exists${NC}"
    else
        echo -e "${RED}❌ $file missing!${NC}"
        exit 1
    fi
done

# Check assets directory
if [ -d "$TARGET_DIR/assets" ]; then
    ASSET_COUNT=$(find "$TARGET_DIR/assets" -type f | wc -l)
    echo -e "${GREEN}✅ Assets directory found with $ASSET_COUNT files${NC}"
else
    echo -e "${RED}❌ Assets directory missing!${NC}"
    exit 1
fi

# Health check (if curl is available)
if command -v curl &> /dev/null; then
    echo -e "${BLUE}🏥 Performing health check...${NC}"
    
    # Extract production URL from cpanel.yml
    PROD_URL=$(grep -A 10 "urls:" "$DEPLOY_CONFIG" | grep "production:" | cut -d: -f2 | xargs || echo "")
    
    if [ ! -z "$PROD_URL" ]; then
        HTTP_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$PROD_URL" || echo "000")
        if [ "$HTTP_STATUS" = "200" ]; then
            echo -e "${GREEN}✅ Health check passed (HTTP $HTTP_STATUS)${NC}"
        else
            echo -e "${RED}❌ Health check failed (HTTP $HTTP_STATUS)${NC}"
            echo -e "${YELLOW}🔧 Check your deployment and try again${NC}"
            exit 1
        fi
    fi
fi

# Show deployment summary
echo -e "${BLUE}📊 Deployment Summary${NC}"
echo -e "${BLUE}===================${NC}"
echo -e "${GREEN}🎯 Target: $TARGET_DIR${NC}"
echo -e "${GREEN}📁 Source: $BUILD_DIR${NC}"
echo -e "${GREEN}📦 Backup: $BACKUP_DIR${NC}"
echo -e "${GREEN}🌐 Status: Deployed${NC}"

# Show file sizes
echo -e "${BLUE}📏 Deployment Size:${NC}"
du -sh "$TARGET_DIR" | cut -f1

echo -e ""
echo -e "${GREEN}🎉 UCAP & CGAP Application deployed successfully!${NC}"
echo -e "${BLUE}🌐 Your application is now live!${NC}"

echo -e "${GREEN}✅ Deployment completed at $(date)${NC}"
