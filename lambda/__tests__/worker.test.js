/**
 * Worker Lambda 测试
 */

// Mock AWS SDK
jest.mock('@aws-sdk/client-textract');
jest.mock('@aws-sdk/client-bedrock-runtime');
jest.mock('@aws-sdk/client-s3');

const { TextractClient, AnalyzeExpenseCommand, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');
const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');

// Mock 服务
jest.mock('../services/dynamodb', () => ({
  getJob: jest.fn(),
  updateJobStatus: jest.fn(),
  JobStatus: {
    PENDING: 'PENDING',
    PROCESSING: 'PROCESSING',
    COMPLETED: 'COMPLETED',
    FAILED: 'FAILED'
  }
}));

jest.mock('../services/sqs', () => ({
  parseMessage: jest.fn()
}));

const { getJob, updateJobStatus } = require('../services/dynamodb');
const { parseMessage } = require('../services/sqs');

const handler = require('../worker').handler;

describe('Worker Lambda', () => {
  let mockTextractClient;
  let mockBedrockClient;
  let mockS3Client;

  beforeEach(() => {
    jest.clearAllMocks();

    // 创建模拟客户端
    mockTextractClient = {
      send: jest.fn()
    };
    mockBedrockClient = {
      send: jest.fn()
    };
    mockS3Client = {
      send: jest.fn()
    };

    // 注入模拟客户端
    TextractClient.mockImplementation(() => mockTextractClient);
    BedrockRuntimeClient.mockImplementation(() => mockBedrockClient);
    S3Client.mockImplementation(() => mockS3Client);

    // Mock 服务返回值
    getJob.mockResolvedValue({
      jobId: 'test-123',
      status: 'PENDING',
      imageS3Key: 'receipts/test.png',
      imageS3Url: 'https://s3.url/test.png'
    });
    updateJobStatus.mockResolvedValue({});
    parseMessage.mockReturnValue({ jobId: 'test-123', imageS3Key: 'receipts/test.png' });
  });

  describe('Handler - SQS 触发', () => {
    it('应该处理SQS消息并更新Job状态', async () => {
      // Mock S3返回图像数据
      const mockImageBuffer = Buffer.from('fake image data');
      mockS3Client.send.mockResolvedValue({
        Body: {
          [Symbol.asyncIterator]: async function* () {
            yield mockImageBuffer;
          }
        }
      });

      // Mock Textract返回空数据（触发fallback）
      mockTextractClient.send.mockRejectedValueOnce({ name: 'NoSuchElementException' });
      // Mock AnalyzeDocument
      mockTextractClient.send.mockResolvedValueOnce({
        Blocks: [
          { BlockType: 'LINE', Text: 'Test Store', Geometry: { BoundingBox: { Top: 0.1, Left: 0.1 } } },
          { BlockType: 'LINE', Text: '$10.00', Geometry: { BoundingBox: { Top: 0.2, Left: 0.8 } } }
        ]
      });

      // Mock Bedrock
      mockBedrockClient.send.mockResolvedValue({
        body: {
          toString: () => JSON.stringify({
            content: [{ text: '{"vendor":"Test Store","date":"2024-01-01","totalAmount":10.00}' }]
          })
        }
      });

      const event = {
        Records: [{
          eventSource: 'aws:sqs',
          body: JSON.stringify({ jobId: 'test-123', imageS3Key: 'receipts/test.png' })
        }]
      };

      const result = await handler(event);

      expect(result).toBeDefined();
      expect(getJob).toHaveBeenCalledWith('test-123');
      expect(updateJobStatus).toHaveBeenCalledWith('test-123', 'PROCESSING');
    });

    it('应该处理无效的SQS消息', async () => {
      parseMessage.mockReturnValue(null);

      const event = {
        Records: [{
          eventSource: 'aws:sqs',
          body: 'invalid-message'
        }]
      };

      const result = await handler(event);

      expect(result.results[0].error).toBeDefined();
    });
  });

  describe('Handler - API Gateway', () => {
    it('应该处理OPTIONS预检请求', async () => {
      const event = { httpMethod: 'OPTIONS' };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
    });

    it('应该处理健康检查GET请求', async () => {
      const event = { httpMethod: 'GET' };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.status).toBe('OK');
    });

    it('应该拒绝缺少imageBase64的POST请求', async () => {
      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({})
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(400);
      expect(JSON.parse(result.body).error).toBe('Missing imageBase64');
    });

    it('应该处理直接OCR请求', async () => {
      // Mock Textract返回数据
      mockTextractClient.send.mockResolvedValue({
        ExpenseDocuments: [{
          SummaryFields: [
            { Type: { Text: 'TOTAL' }, ValueDetection: { Text: '$25.00' } }
          ],
          LineItemGroups: []
        }]
      });

      // Mock Bedrock
      mockBedrockClient.send.mockResolvedValue({
        body: {
          toString: () => JSON.stringify({
            content: [{ text: '{"vendor":"Test","totalAmount":25.00}' }]
          })
        }
      });

      const event = {
        httpMethod: 'POST',
        body: JSON.stringify({ imageBase64: 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==' })
      };

      const result = await handler(event);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);
      expect(body.parsed).toBeDefined();
    });
  });
});
