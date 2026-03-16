/**
 * CreateJob Lambda 测试
 */

// Mock 所有依赖
jest.mock('../services/s3');
jest.mock('../services/dynamodb');
jest.mock('../services/sqs');

const { uploadImage } = require('../services/s3');
const { createJob } = require('../services/dynamodb');
const { enqueueJob } = require('../services/sqs');

const handler = require('../createJob').handler;

describe('CreateJob Lambda', () => {
  beforeEach(() => {
    jest.clearAllMocks();

    // Mock 服务返回值
    uploadImage.mockResolvedValue({ location: 'https://s3.url/image.png' });
    createJob.mockResolvedValue({
      jobId: 'test-job-123',
      status: 'PENDING',
      createdAt: '2024-01-01T00:00:00.000Z'
    });
    enqueueJob.mockResolvedValue('msg-123');
  });

  describe('Handler', () => {
    it('应该处理OPTIONS预检请求', async () => {
      const event = { httpMethod: 'OPTIONS' };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      expect(JSON.parse(result.body)).toEqual({ ok: true });
    });

    it('应该处理健康检查GET请求', async () => {
      const event = { httpMethod: 'GET' };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('OK');
    });

    it('应该拒绝无效的JSON body', async () => {
      const event = {
        httpMethod: 'POST',
        body: 'not-valid-json'
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toContain('Invalid JSON');
    });

    it('应该拒绝缺少imageBase64的请求', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({})
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Missing imageBase64');
    });

    it('应该成功创建Job', async () => {
      const validBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ imageBase64: validBase64 })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(202);
      const body = JSON.parse(result.body);

      expect(body.jobId).toBeDefined();
      expect(body.status).toBe('PENDING');
      expect(body.message).toBeDefined();

      // 验证服务被调用
      expect(uploadImage).toHaveBeenCalled();
      expect(createJob).toHaveBeenCalled();
      expect(enqueueJob).toHaveBeenCalled();
    });

    it('应该处理无效的base64数据', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ imageBase64: 'invalid-base64!!!' })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
    });

    it('应该返回405对于不支持的方法', async () => {
      const event = { httpMethod: 'DELETE' };

      const result = await handler(event);

      expect(result.statusCode).toBe(405);
    });

    it('应该处理服务器错误', async () => {
      uploadImage.mockRejectedValue(new Error('S3 error'));

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ imageBase64: 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(500);
      expect(JSON.parse(result.body).error).toBe('S3 error');
    });
  });
});
