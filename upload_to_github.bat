@echo off
echo 🚀 Case Workflow App - GitHub Upload Script
echo.

echo Step 1: Configuring Git (first time only)
echo Enter your name for Git commits:
set /p USERNAME="Your Name: "
echo Enter your email for Git commits:
set /p EMAIL="Your Email: "

git config --global user.name "%USERNAME%"
git config --global user.email "%EMAIL%"

echo.
echo Step 2: Enter your GitHub repository URL
echo (Example: https://github.com/yourusername/case-workflow-app.git)
set /p REPO_URL="Repository URL: "

echo.
echo Step 3: Initializing Git and uploading to GitHub...

git init
git add .
git commit -m "Initial commit: Case workflow management system"
git remote add origin %REPO_URL%
git branch -M main
git push -u origin main

echo.
echo ✅ Upload complete! Check your GitHub repository.
echo Your app is now ready for deployment to Render/Railway.
pause
