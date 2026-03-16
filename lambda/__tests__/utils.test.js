/**
 * utils.js 单元测试
 */

const {
  generateJobId,
  validateBase64Image,
  extractBase64Data,
  generateS3Key,
  apiResponse,
  handleCorsPreflight
} = require('../utils');

describe('utils', () => {
  describe('generateJobId', () => {
    it('应该生成唯一的UUID', () => {
      const id1 = generateJobId();
      const id2 = generateJobId();

      expect(id1).toBeDefined();
      expect(id2).toBeDefined();
      expect(id1).not.toEqual(id2);
      // UUID格式: xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx
      expect(id1).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    });
  });

  describe('validateBase64Image', () => {
    it('应该拒绝空输入', () => {
      const result = validateBase64Image('');
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing imageBase64');
    });

    it('应该拒绝undefined', () => {
      const result = validateBase64Image(undefined);
      expect(result.valid).toBe(false);
      expect(result.error).toBe('Missing imageBase64');
    });

    it('应该接受有效的base64数据（无前缀）', () => {
      const validBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = validateBase64Image(validBase64);
      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('image/png');
    });

    it('应该识别jpeg格式', () => {
      const jpegBase64 = 'data:image/jpeg;base64,/9j/4AAQSkZJRg==';
      const result = validateBase64Image(jpegBase64);
      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('jpeg');
    });

    it('应该识别png格式', () => {
      const pngBase64 = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const result = validateBase64Image(pngBase64);
      expect(result.valid).toBe(true);
      expect(result.mimeType).toBe('png');
    });

    it('应该拒绝无效的base64数据', () => {
      const invalidBase64 = 'not-valid-base64!!!';
      const result = validateBase64Image(invalidBase64);
      expect(result.valid).toBe(false);
    });
  });

  describe('extractBase64Data', () => {
    it('应该移除data URL前缀并返回Buffer', () => {
      const dataUrl = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buffer = extractBase64Data(dataUrl);

      expect(Buffer.isBuffer(buffer)).toBe(true);
      // 验证是有效的PNG字节 (PNG signature: 137 80 78 71 13 10 26 10)
      expect(buffer[0]).toBe(0x89);
    });

    it('应该处理不带前缀的base64', () => {
      const plainBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==';
      const buffer = extractBase64Data(plainBase64);

      expect(Buffer.isBuffer(buffer)).toBe(true);
    });
  });

  describe('generateS3Key', () => {
    it('应该生成正确的S3键名格式', () => {
      const jobId = 'test-uuid-1234';
      const key = generateS3Key(jobId);

      expect(key).toMatch(/^receipts\/test-uuid-1234-\d+\.png$/);
    });
  });

  describe('apiResponse', () => {
    it('应该生成正确的API响应格式', () => {
      const response = apiResponse(200, { message: 'OK' });

      expect(response.statusCode).toBe(200);
      expect(response.headers['Content-Type']).toBe('application/json');
      expect(response.headers['Access-Control-Allow-Origin']).toBe('*');
      expect(JSON.parse(response.body)).toEqual({ message: 'OK' });
    });

    it('应该包含CORS头', () => {
      const response = apiResponse(400, { error: 'Bad request' });

      expect(response.headers['Access-Control-Allow-Methods']).toBe('GET,POST,OPTIONS');
      expect(response.headers['Access-Control-Allow-Headers']).toBe('Content-Type');
    });
  });

  describe('handleCorsPreflight', () => {
    it('应该返回200状态码的CORS预检响应', () => {
      const response = handleCorsPreflight();

      expect(response.statusCode).toBe(200);
      expect(response.body).toBe(JSON.stringify({ ok: true }));
    });
  });
});
