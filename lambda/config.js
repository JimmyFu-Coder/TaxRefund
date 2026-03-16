/**
 * AWS 配置和常量
 */

const AWS_REGION = process.env.AWS_REGION || 'us-east-1';

// S3 配置
const S3_BUCKET = process.env.S3_BUCKET || 'taxrefund-receipts';
const S3_KEY_PREFIX = 'receipts/';

// DynamoDB 配置
const DYNAMODB_TABLE = process.env.DYNAMODB_TABLE || 'ReceiptJobs';
const JOB_STATUS_INDEX = 'JobStatusIndex';

// SQS 配置
const SQS_QUEUE_URL = process.env.SQS_QUEUE_URL || '';
const SQS_QUEUE_NAME = process.env.SQS_QUEUE_NAME || 'ReceiptProcessingQueue';

// Job 状态枚举
const JobStatus = {
  PENDING: 'PENDING',
  PROCESSING: 'PROCESSING',
  COMPLETED: 'COMPLETED',
  FAILED: 'FAILED'
};

module.exports = {
  AWS_REGION,
  S3_BUCKET,
  S3_KEY_PREFIX,
  DYNAMODB_TABLE,
  JOB_STATUS_INDEX,
  SQS_QUEUE_URL,
  SQS_QUEUE_NAME,
  JobStatus
};
