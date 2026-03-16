/**
 * DynamoDB 作业服务
 */

const { DynamoDBClient } = require('@aws-sdk/client-dynamodb');
const { DynamoDBDocumentClient, PutCommand, GetCommand, UpdateCommand, QueryCommand } = require('@aws-sdk/lib-dynamodb');
const { DYNAMODB_TABLE, JOB_STATUS_INDEX, AWS_REGION, JobStatus } = require('../config');

// 创建 DynamoDB 客户端
const client = new DynamoDBClient({ region: AWS_REGION });
const docClient = DynamoDBDocumentClient.from(client);

/**
 * 创建新的 Job 记录
 * @param {string} jobId - 作业 ID
 * @param {string} imageS3Key - S3 中图像的键
 * @param {string} imageS3Url - S3 中图像的 URL
 * @param {object} metadata - 额外的元数据
 * @returns {Promise<object>}
 */
async function createJob(jobId, imageS3Key, imageS3Url, metadata = {}) {
  const now = new Date().toISOString();

  const jobRecord = {
    jobId,
    status: JobStatus.PENDING,
    imageS3Key,
    imageS3Url,
    createdAt: now,
    updatedAt: now,
    // 可选的元数据
    ...metadata
  };

  const command = new PutCommand({
    TableName: DYNAMODB_TABLE,
    Item: jobRecord
  });

  await docClient.send(command);

  return jobRecord;
}

/**
 * 获取 Job 记录
 * @param {string} jobId - 作业 ID
 * @returns {Promise<object|null>}
 */
async function getJob(jobId) {
  const command = new GetCommand({
    TableName: DYNAMODB_TABLE,
    Key: { jobId }
  });

  const result = await docClient.send(command);
  return result.Item || null;
}

/**
 * 更新 Job 状态
 * @param {string} jobId - 作业 ID
 * @param {string} status - 新状态
 * @param {object} result - 处理结果（可选）
 * @returns {Promise<object>}
 */
async function updateJobStatus(jobId, status, result = {}) {
  const updateExpression = result.ocrResult
    ? 'SET #status = :status, updatedAt = :updatedAt, result = :result, completedAt = :completedAt'
    : 'SET #status = :status, updatedAt = :updatedAt, errorMessage = :errorMessage';

  const expressionAttributeNames = {
    '#status': 'status'
  };

  const expressionAttributeValues = {
    ':status': status,
    ':updatedAt': new Date().toISOString()
  };

  if (result.ocrResult) {
    expressionAttributeValues[':result'] = result.ocrResult;
    expressionAttributeValues[':completedAt'] = new Date().toISOString();
  } else if (result.errorMessage) {
    expressionAttributeValues[':errorMessage'] = result.errorMessage;
  }

  const command = new UpdateCommand({
    TableName: DYNAMODB_TABLE,
    Key: { jobId },
    UpdateExpression: updateExpression,
    ExpressionAttributeNames: expressionAttributeNames,
    ExpressionAttributeValues: expressionAttributeValues,
    ReturnValues: 'ALL_NEW'
  });

  const result_data = await docClient.send(command);
  return result_data.Attributes;
}

/**
 * 根据状态查询 Job 列表
 * @param {string} status - 作业状态
 * @returns {Promise<object[]>}
 */
async function getJobsByStatus(status) {
  const command = new QueryCommand({
    TableName: DYNAMODB_TABLE,
    IndexName: JOB_STATUS_INDEX,
    KeyConditionExpression: '#status = :status',
    ExpressionAttributeNames: {
      '#status': 'status'
    },
    ExpressionAttributeValues: {
      ':status': status
    }
  });

  const result = await docClient.send(command);
  return result.Items || [];
}

module.exports = {
  docClient,
  createJob,
  getJob,
  updateJobStatus,
  getJobsByStatus,
  JobStatus
};
