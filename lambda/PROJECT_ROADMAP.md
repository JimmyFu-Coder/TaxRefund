# TaxRefund Lambda Architecture - Project Roadmap

## Document Information
- **Project**: TaxRefund Receipt Processing System
- **Version**: 1.0
- **Last Updated**: 2026-03-20
- **Language**: English

---

## 1. Current Project Status

### 1.1 Completed Work

| Item | Status | Notes |
|------|--------|-------|
| Lambda Functions Code | ✅ Done | createJob.js, worker.js, ocr.js |
| Deployment Script | ✅ Done | deploy.sh |
| Unit Tests | ✅ Done | Jest tests in `__tests__/` |
| AWS CLI Configuration | ✅ Done | User: lambda-deploy (Account: 445021790750) |
| Existing Lambda | ✅ Deployed | taxrefund-ocr (runtime: nodejs20.x) |
| IAM Role | ✅ Available | TaxReturn role exists |

### 1.2 Blockers / Issues

| Issue | Severity | Resolution |
|-------|----------|-------------|
| IAM permissions insufficient | High | User lacks iam:CreateRole and iam:PutRolePolicy |
| deploy.sh creates new role | Medium | Should use existing TaxReturn role |
| Missing resources | Medium | S3 bucket, DynamoDB table, SQS queue may not exist |

---

## 2. Architecture Overview

### 2.1 System Architecture

```
┌─────────────────┐     ┌──────────────────┐     ┌─────────────────┐
│   Mobile App    │────▶│  API Gateway     │────▶│  CreateJob Lambda │
└─────────────────┘     └──────────────────┘     └────────┬────────┘
                                                          │
                                                          ▼
                                                  ┌───────────────┐
                                                  │     SQS       │
                                                  │  (Queue)      │
                                                  └───────┬───────┘
                                                          │
                                                          ▼
                                                  ┌───────────────┐
                                                  │  Worker Lambda│
                                                  │ (SQS Trigger) │
                                                  └───────┬───────┘
                                                          │
                              ┌───────────────────────────┬┴───────────────────────────┐
                              ▼                           ▼                           ▼
                        ┌─────────┐                ┌─────────────┐           ┌─────────────┐
                        │   S3    │                │  DynamoDB   │           │   Textract  │
                        │ (Files) │                │ (Jobs Meta) │           │    (OCR)    │
                        └─────────┘                └─────────────┘           └─────────────┘
                                                                                  │
                                                                                  ▼
                                                                         ┌─────────────┐
                                                                         │   Bedrock   │
                                                                         │  (Claude)   │
                                                                         └─────────────┘
```

### 2.2 Lambda Functions

| Function | Handler | Trigger | Purpose |
|----------|---------|---------|---------|
| taxrefund-create-job | createJob.handler | API Gateway | Accept receipt image, create job, enqueue to SQS |
| taxrefund-worker | worker.handler | SQS Event | Process receipt: OCR + LLM parsing |
| taxrefund-ocr | ocr.handler | API Gateway (legacy) | Direct OCR processing |

### 2.3 AWS Resources

| Resource | Name | Region | Purpose |
|----------|------|--------|---------|
| S3 Bucket | taxrefund-receipts | us-east-1 | Store receipt images |
| DynamoDB Table | ReceiptJobs | us-east-1 | Store job metadata |
| SQS Queue | ReceiptProcessingQueue | us-east-1 | Job queue for worker |

### 2.4 Processing Flow

1. **CreateJob Lambda**:
   - Receive base64 image from mobile app
   - Upload to S3
   - Create job record in DynamoDB (status: PENDING)
   - Send message to SQS
   - Return jobId to client

2. **Worker Lambda** (triggered by SQS):
   - Read message from SQS
   - Get image from S3
   - Call AWS Textract (AnalyzeExpense API)
   - Call AWS Bedrock (Claude 3 Sonnet) for parsing
   - Update DynamoDB with results (status: COMPLETED/FAILED)

---

## 3. Technical Implementation Details

### 3.1 Function Specifications

**CreateJob Lambda:**
- Runtime: nodejs20.x
- Timeout: 30s
- Memory: 512MB
- Environment: AWS_REGION, S3_BUCKET, DYNAMODB_TABLE, SQS_QUEUE_URL

**Worker Lambda:**
- Runtime: nodejs20.x
- Timeout: 120s
- Memory: 1024MB
- Environment: AWS_REGION, S3_BUCKET, DYNAMODB_TABLE

**OCR Lambda:**
- Runtime: nodejs20.x
- Timeout: 120s
- Memory: 1024MB

### 3.2 Dependencies

```json
{
  "@aws-sdk/client-s3": "^3.370.0",
  "@aws-sdk/client-dynamodb": "^3.370.0",
  "@aws-sdk/client-sqs": "^3.370.0",
  "@aws-sdk/client-textract": "^3.370.0",
  "@aws-sdk/client-bedrock-runtime": "^3.370.0"
}
```

### 3.3 Test Coverage

| Test File | Coverage |
|-----------|----------|
| utils.test.js | generateJobId, validateBase64Image, apiResponse |
| config.test.js | Environment variables |
| createJob.test.js | POST/GET/OPTIONS handlers |
| worker.test.js | SQS trigger, API Gateway |

---

## 4. Roadmap - Next Steps

### Phase 1: Fix Deployment Issues (Priority: High)

| Step | Description | Status |
|------|-------------|--------|
| 1.1 | Grant IAM permissions to lambda-deploy user | ⏳ Pending |
| 1.2 | Create/update IAM policy for TaxReturn role | ⏳ Pending |
| 1.3 | Create AWS resources (S3, DynamoDB, SQS) | ⏳ Pending |
| 1.4 | Deploy/CreateJob Lambda | ⏳ Pending |
| 1.5 | Deploy Worker Lambda | ⏳ Pending |
| 1.6 | Configure SQS event source mapping | ⏳ Pending |

### Phase 2: Testing (Priority: High)

| Step | Description | Status |
|------|-------------|--------|
| 2.1 | Run existing unit tests | ⏳ Pending |
| 2.2 | Integration test - CreateJob via API | ⏳ Pending |
| 2.3 | Integration test - End-to-end flow | ⏳ Pending |
| 2.4 | Test error handling | ⏳ Pending |

### Phase 3: Performance Testing (Priority: Medium)

| Step | Description | Status |
|------|-------------|--------|
| 3.1 | Measure cold start time | ⏳ Pending |
| 3.2 | Measure warm execution time | ⏳ Pending |
| 3.3 | Concurrent request testing | ⏳ Pending |
| 3.4 | Throughput testing (requests/sec) | ⏳ Pending |
| 3.5 | Cost analysis | ⏳ Pending |

### Phase 4: Optimization (Priority: Low)

| Step | Description | Status |
|------|-------------|--------|
| 4.1 | Optimize memory allocation | ⏳ Pending |
| 4.2 | Add response caching | ⏳ Pending |
| 4.3 | Implement dead letter queue | ⏳ Pending |

---

## 5. Testing Plan

### 5.1 Unit Tests

```bash
cd lambda
npm test
```

**Expected Output:**
- All tests pass
- Coverage report generated

### 5.2 Integration Tests

**Test 1: Health Check**
```bash
# Test CreateJob health
aws lambda invoke --function-name taxrefund-create-job \
  --payload '{"httpMethod":"GET"}' response.json
```

**Test 2: Create Job via API**
```bash
# Note: Requires API Gateway setup
curl -X POST https://{api-id}.execute-api.us-east-1.amazonaws.com/prod/jobs \
  -H "Content-Type: application/json" \
  -d '{"imageBase64":"...","metadata":{}}'
```

### 5.3 Throughput Testing

**Scenario: Concurrent Job Creation**

```javascript
// Test script: test-throughput.js
const AWS = require('aws-sdk');
const lambda = new AWS.Lambda({ region: 'us-east-1' });

async function createJob(base64Image) {
  return lambda.invoke({
    FunctionName: 'taxrefund-create-job',
    InvocationType: 'RequestResponse',
    Payload: JSON.stringify({
      httpMethod: 'POST',
      body: JSON.stringify({ imageBase64 })
    })
  }).promise();
}

async function runConcurrentTest(count) {
  const startTime = Date.now();
  const promises = [];
  for (let i = 0; i < count; i++) {
    promises.push(createJob(sampleBase64));
  }
  const results = await Promise.allSettled(promises);
  const endTime = Date.now();

  const successCount = results.filter(r => r.status === 'fulfilled').length;
  const duration = (endTime - startTime) / 1000;
  const throughput = successCount / duration;

  return { total: count, success: successCount, duration, throughput };
}
```

**Metrics to Collect:**
- Total requests
- Successful responses
- Failed responses
- Average latency (ms)
- Throughput (requests/second)
- Cold start frequency

---

## 6. Performance Baseline

### 6.1 Expected Performance

| Metric | Expected Value |
|--------|----------------|
| Cold Start Time | 2-5 seconds |
| Warm Execution Time | 500ms - 2s |
| Max Concurrent Executions | 100 (Lambda default) |
| Memory Cost | ~$0.0000166667 per GB-second |
| Textract Cost | $0.015 per page |
| Bedrock Cost | $0.003 per 1K tokens (Claude 3 Sonnet) |

### 6.2 Throughput Targets

| Scenario | Target |
|----------|--------|
| Single user, sequential | 10 jobs/minute |
| 10 concurrent users | 50 jobs/minute |
| 100 concurrent users | 200 jobs/minute |

---

## 7. Action Items

### Immediate Actions Required

1. **Grant IAM Permissions**
   - Contact AWS admin to add iam:PutRolePolicy to lambda-deploy user
   - Or manually add policy to TaxReturn role

2. **Create AWS Resources**
   - S3 Bucket: taxrefund-receipts
   - DynamoDB Table: ReceiptJobs
   - SQS Queue: ReceiptProcessingQueue

3. **Deploy Lambda Functions**
   - Run: `bash lambda/deploy.sh` after permissions fixed

4. **Run Tests**
   - Execute: `cd lambda && npm test`

5. **Performance Benchmark**
   - Create test images
   - Run throughput tests
   - Document results

---

## 8. Appendix

### A. Deployment Commands (Manual)

```bash
# Check Lambda functions
aws lambda list-functions --query 'Functions[].FunctionName'

# Check IAM role
aws iam get-role --role-name TaxReturn

# Check existing resources
aws s3 ls | grep taxrefund
aws dynamodb list-tables --query 'TableNames'
aws sqs list-queues --query 'QueueUrls'
```

### B. Environment Variables

```
AWS_REGION=us-east-1
S3_BUCKET=taxrefund-receipts
DYNAMODB_TABLE=ReceiptJobs
SQS_QUEUE_URL=https://sqs.us-east-1.amazonaws.com/445021790750/ReceiptProcessingQueue
```

### C. Test Image Generation

```javascript
// Generate a small test image (1x1 pixel PNG)
const testImageBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
```

---

*Document created for TaxRefund Lambda Architecture Testing Roadmap*