/**
 * Lambda: Create Job
 * 处理流程:
 * 1. 接收客户端提交的图像 (base64)
 * 2. 生成唯一 Job ID
 * 3. 存储原始图像到 S3
 * 4. 写入 Job 元数据到 DynamoDB
 * 5. 将工作加入 SQS 队列
 * 6. 返回 Job ID 给客户端
 */

const {
  generateJobId,
  validateBase64Image,
  extractBase64Data,
  generateS3Key,
  apiResponse,
  handleCorsPreflight
} = require('./utils');

const { uploadImage } = require('./services/s3');
const { createJob } = require('./services/dynamodb');
const { enqueueJob } = require('./services/sqs');

exports.handler = async (event) => {
  try {
    console.log('Event:', JSON.stringify(event));

    const httpMethod = event.httpMethod;

    // 处理 OPTIONS 预检请求
    if (httpMethod === 'OPTIONS') {
      return handleCorsPreflight();
    }

    // 健康检查
    if (httpMethod === 'GET') {
      return apiResponse(200, {
        status: 'OK',
        service: 'CreateJob'
      });
    }

    // 处理 POST 请求
    if (httpMethod === 'POST') {
      // 解析请求体
      let body;
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch (e) {
        return apiResponse(400, { error: 'Invalid JSON body' });
      }

      const { imageBase64, metadata } = body;

      // 验证图像数据
      const validation = validateBase64Image(imageBase64);
      if (!validation.valid) {
        return apiResponse(400, { error: validation.error });
      }

      // 1. 生成唯一 Job ID
      const jobId = generateJobId();
      console.log('Generated Job ID:', jobId);

      // 2. 提取并准备图像数据
      const imageData = extractBase64Data(imageBase64);
      const s3Key = generateS3Key(jobId);

      // 3. 存储图像到 S3
      console.log('Uploading image to S3...');
      const { location: imageS3Url } = await uploadImage(s3Key, imageData, `image/${validation.mimeType}`);
      console.log('Image uploaded to:', imageS3Url);

      // 4. 写入 Job 元数据到 DynamoDB
      console.log('Creating job record in DynamoDB...');
      const jobRecord = await createJob(jobId, s3Key, imageS3Url, metadata);
      console.log('Job record created:', jobRecord.jobId);

      // 5. 将工作加入 SQS 队列
      console.log('Enqueuing job to SQS...');
      const messageId = await enqueueJob(jobId, s3Key);
      console.log('Job enqueued with message ID:', messageId);

      // 6. 返回结果给客户端
      return apiResponse(202, {
        jobId: jobRecord.jobId,
        status: jobRecord.status,
        createdAt: jobRecord.createdAt,
        message: 'Job created successfully. Processing will begin shortly.'
      });
    }

    // 不支持的方法
    return apiResponse(405, { error: 'Method not allowed' });

  } catch (error) {
    console.error('Error:', error);
    return apiResponse(500, { error: error.message });
  }
};
