#!/bin/bash
# Quick deployment script for Wildcat.chat homepage

set -e

PROJECT_ID="wildcat-home"

echo "🐱 Deploying Wildcat.chat Homepage to ${PROJECT_ID}..."

# Check if Firebase CLI is installed
if ! command -v firebase &> /dev/null; then
    echo "❌ Firebase CLI not found. Install it with: npm install -g firebase-tools"
    exit 1
fi

# Check if logged in to Firebase
if ! firebase projects:list &> /dev/null; then
    echo "❌ Not logged in to Firebase. Run: firebase login"
    exit 1
fi

# Explicitly set the Firebase project
echo "🔧 Setting Firebase project to ${PROJECT_ID}..."
if ! firebase use "${PROJECT_ID}" 2>&1 | grep -q "Now using project ${PROJECT_ID}"; then
    echo "❌ Error: Failed to set Firebase project to ${PROJECT_ID}"
    exit 1
fi
echo "✅ Confirmed using project: ${PROJECT_ID}"

# Deploy to Firebase Hosting
echo "📦 Deploying to Firebase Hosting..."
firebase deploy --only hosting

echo "✅ Deployment complete!"
echo "📄 Visit your homepage at: https://wildcat-home.web.app"

