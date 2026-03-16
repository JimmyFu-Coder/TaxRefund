#!/bin/bash
# 部署 Lambda 函数（分层架构）

set -e

echo "=== 开始部署 Lambda 函数 ==="

# 获取当前 AWS 账户 ID
AWS_ACCOUNT=$(aws sts get-caller-identity --query 'Account' --output text)
AWS_REGION=${AWS_REGION:-us-east-1}

# 配置变量
S3_BUCKET="taxrefund-receipts"
DYNAMODB_TABLE="ReceiptJobs"
SQS_QUEUE_NAME="ReceiptProcessingQueue"
ROLE_NAME="lambda-taxrefund-role"

echo "AWS Account: $AWS_ACCOUNT"
echo "AWS Region: $AWS_REGION"

# 1. 创建 IAM 角色
echo ">>> 创建 IAM 角色..."
aws iam create-role --role-name $ROLE_NAME \
  --assume-role-policy-document '{"Version":"2012-10-17","Statement":[{"Effect":"Allow","Principal":{"Service":"lambda.amazonaws.com"},"Action":"sts:AssumeRole"}]}' \
  2>/dev/null || echo "Role already exists"

# 2. 创建 IAM 策略（包含 S3, DynamoDB, SQS, Textract, Bedrock 权限）
echo ">>> 创建 IAM 策略..."
POLICY_ARN=$(aws iam create-policy \
  --policy-name lambda-taxrefund-policy \
  --policy-document '{
    "Version": "2012-10-17",
    "Statement": [
      {
        "Effect": "Allow",
        "Action": [
          "s3:GetObject",
          "s3:PutObject"
        ],
        "Resource": "arn:aws:s3:::'"$S3_BUCKET"'/*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "dynamodb:PutItem",
          "dynamodb:GetItem",
          "dynamodb:UpdateItem",
          "dynamodb:Query"
        ],
        "Resource": "arn:aws:dynamodb:'"$AWS_REGION"':'"$AWS_ACCOUNT"':table/'"$DYNAMODB_TABLE"'"
      },
      {
        "Effect": "Allow",
        "Action": [
          "sqs:SendMessage",
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage"
        ],
        "Resource": "arn:aws:sqs:'"$AWS_REGION"':'"$AWS_ACCOUNT"':'"$SQS_QUEUE_NAME"'"
      },
      {
        "Effect": "Allow",
        "Action": [
          "textract:AnalyzeDocument",
          "textract:AnalyzeExpense"
        ],
        "Resource": "*"
      },
      {
        "Effect": "Allow",
        "Action": [
          "bedrock:InvokeModel"
        ],
        "Resource": "arn:aws:bedrock:'"$AWS_REGION"':'"$AWS_ACCOUNT"':model/anthropic.claude-3-sonnet-20240229-v1:0"
      }
    ]
  }' \
  --query 'Policy.Arn' --output text 2>/dev/null) || POLICY_ARN=$(aws iam get-policy --policy-name lambda-taxrefund-policy --query 'Policy.Arn' --output text)

echo "Policy ARN: $POLICY_ARN"

# 3. 将策略附加到角色
aws iam attach-role-policy --role-name $ROLE_NAME --policy-arn $POLICY_ARN

# 4. 等待角色传播
echo ">>> 等待角色生效..."
sleep 5

ROLE_ARN="arn:aws:iam::${AWS_ACCOUNT}:role/${ROLE_NAME}"

# 5. 创建 S3 Bucket（如果不存在）
echo ">>> 创建 S3 Bucket..."
aws s3 mb s3://$S3_BUCKET --region $AWS_REGION 2>/dev/null || echo "S3 bucket already exists"

# 6. 创建 DynamoDB 表
echo ">>> 创建 DynamoDB 表..."
aws dynamodb create-table \
  --table-name $DYNAMODB_TABLE \
  --attribute-definitions AttributeName=jobId,AttributeType=S AttributeName=status,AttributeType=S \
  --key-schema AttributeName=jobId,KeyType=HASH \
  --global-secondary-indexes '[{"IndexName":"JobStatusIndex","KeySchema":[{"AttributeName":"status","KeyType":"HASH"}],"Projection":{"ProjectionType":"ALL"}}]' \
  --billing-mode PAY_PER_REQUEST \
  --region $AWS_REGION 2>/dev/null || echo "DynamoDB table already exists"

# 7. 创建 SQS 队列
echo ">>> 创建 SQS 队列..."
SQS_QUEUE_URL=$(aws sqs create-queue \
  --queue-name $SQS_QUEUE_NAME \
  --attributes '{"ReceiveMessageWaitTimeSeconds":"0","VisibilityTimeout":"300"}' \
  --query 'QueueUrl' --output text 2>/dev/null) || SQS_QUEUE_URL=$(aws sqs get-queue-url --queue-name $SQS_QUEUE_NAME --query 'QueueUrl' --output text)

echo "SQS Queue URL: $SQS_QUEUE_URL"

# 8. 安装依赖
echo ">>> 安装依赖..."
cd lambda
npm install
cd ..

# 9. 创建部署包（排除 node_modules，使用 bundle）
echo ">>> 创建部署包..."
cd lambda

# 创建临时目录
mkdir -p dist
cp -r *.js config.js utils.js services/ dist/
cp -r node_modules dist/

cd dist
zip -r ../lambda-deployment.zip *
cd ..
rm -rf dist
cd ..

# 10. 部署 CreateJob Lambda
echo ">>> 部署 CreateJob Lambda..."
aws lambda create-function \
  --function-name taxrefund-create-job \
  --runtime nodejs20.x \
  --role $ROLE_ARN \
  --handler createJob.handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 30 \
  --memory-size 512 \
  --environment "Variables={AWS_REGION=$AWS_REGION,S3_BUCKET=$S3_BUCKET,DYNAMODB_TABLE=$DYNAMODB_TABLE,SQS_QUEUE_URL=$SQS_QUEUE_URL}" \
  2>/dev/null || aws lambda update-function-code \
  --function-name taxrefund-create-job \
  --zip-file fileb://lambda-deployment.zip

# 11. 部署 Worker Lambda
echo ">>> 部署 Worker Lambda..."
aws lambda create-function \
  --function-name taxrefund-worker \
  --runtime nodejs20.x \
  --role $ROLE_ARN \
  --handler worker.handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 120 \
  --memory-size 1024 \
  --environment "Variables={AWS_REGION=$AWS_REGION,S3_BUCKET=$S3_BUCKET,DYNAMODB_TABLE=$DYNAMODB_TABLE}" \
  2>/dev/null || aws lambda update-function-code \
  --function-name taxrefund-worker \
  --zip-file fileb://lambda-deployment.zip

# 12. 配置 SQS 触发 Worker Lambda
echo ">>> 配置 SQS 触发 Worker Lambda..."
aws lambda create-event-source-mapping \
  --function-name taxrefund-worker \
  --event-source-arn $(aws sqs get-queue-attributes --queue-url $SQS_QUEUE_URL --attribute-names QueueArn --query 'Attributes.QueueArn' --output text) \
  --batch-size 1 \
  2>/dev/null || echo "Event source mapping already exists"

# 13. 部署原始 OCR Lambda（保留用于直接调用）
echo ">>> 部署 OCR Lambda (直接调用)..."
aws lambda create-function \
  --function-name taxrefund-ocr \
  --runtime nodejs20.x \
  --role $ROLE_ARN \
  --handler ocr.handler \
  --zip-file fileb://lambda-deployment.zip \
  --timeout 120 \
  --memory-size 1024 \
  --environment "Variables={AWS_REGION=$AWS_REGION}" \
  2>/dev/null || aws lambda update-function-code \
  --function-name taxrefund-ocr \
  --zip-file fileb://lambda-deployment.zip

echo "=== 部署完成 ==="
echo ""
echo "Lambda 函数:"
echo "  - taxrefund-create-job: 创建作业（推荐使用）"
echo "  - taxrefund-worker: 处理 OCR（由 SQS 触发）"
echo "  - taxrefund-ocr: 直接 OCR 处理（保留兼容性）"
echo ""
echo "需要手动在 AWS Console 创建 API Gateway 来暴露这些函数"
