/**
 * SQS 队列服务
 */

const { SQSClient, SendMessageCommand } = require('@aws-sdk/client-sqs');
const { SQS_QUEUE_URL, AWS_REGION } = require('../config');

// 创建 SQS 客户端
const sqsClient = new SQSClient({
  region: AWS_REGION
});

/**
 * 将 Job 加入处理队列
 * @param {string} jobId - 作业 ID
 * @param {string} imageS3Key - S3 中图像的键
 * @returns {Promise<string>} - 消息 ID
 */
async function enqueueJob(jobId, imageS3Key) {
  const messageBody = {
    jobId,
    imageS3Key,
    timestamp: new Date().toISOString()
  };

  const command = new SendMessageCommand({
    QueueUrl: SQS_QUEUE_URL,
    MessageBody: JSON.stringify(messageBody),
    // 可选：设置延迟秒数
    // DelaySeconds: 0,
    // 可选：设置消息属性
    // MessageAttributes: { ... }
  });

  const result = await sqsClient.send(command);
  return result.MessageId;
}

/**
 * 从队列消息中提取 Job 信息
 * @param {string} messageBody - SQS 消息体
 * @returns {object}
 */
function parseMessage(messageBody) {
  try {
    return JSON.parse(messageBody);
  } catch (error) {
    console.error('Failed to parse SQS message:', error);
    return null;
  }
}

module.exports = {
  sqsClient,
  enqueueJob,
  parseMessage
};
