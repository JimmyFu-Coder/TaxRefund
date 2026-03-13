#!/bin/bash
# 更新 Lambda 函数的脚本

cd lambda

# 1. 确保依赖已安装
if [ ! -d "node_modules" ]; then
  echo "安装依赖..."
  npm install
fi

# 2. 创建部署包（排除 node_modules 外的所有文件）
echo "创建部署包..."
zip -r ../lambda-update.zip ocr.js package.json package-lock.json

# 3. 更新 Lambda 函数
echo "更新 Lambda 函数..."
aws lambda update-function-code \
  --function-name taxrefund-ocr \
  --zip-file fileb://../lambda-update.zip \
  --output json

# 4. 清理
rm ../lambda-update.zip

echo "✅ Lambda 更新完成！"
