# 部署 Lambda 函数的脚本

# 1. 创建 IAM 角色（如果还没有）
aws iam create-role --role-name lambda-textract-role \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}'

# 2. 给角色添加 Textract 权限
aws iam attach-role-policy --role-name lambda-textract-role \
  --policy-arn arn:aws:iam::aws:policy/AmazonTextractFullAccess

# 3. 安装依赖
cd lambda
npm init -y
npm install @aws-sdk/client-textract
cd ..

# 4. 创建部署包
cd lambda
zip -r ../lambda-deployment.zip *
cd ..

# 5. 创建 Lambda 函数
aws lambda create-function \
  --function-name taxrefund-ocr \
  --runtime nodejs20.x \
  --role arn:aws:iam::$(aws sts get-caller-identity --query 'Account' --output text):role/lambda-textract-role \
  --handler ocr.handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 512

# 6. 创建 API Gateway（可选，需要 aws apigatewayv2）
echo "Lambda 创建完成！现在需要手动在 AWS Console 创建 API Gateway"
