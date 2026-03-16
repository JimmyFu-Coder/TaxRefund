/**
 * DynamoDB 服务测试
 */

jest.mock('@aws-sdk/client-dynamodb', () => require('../../__mocks__/@aws-sdk/client-dynamodb'));
jest.mock('@aws-sdk/lib-dynamodb', () => require('../../__mocks__/@aws-sdk/lib-dynamodb'));

const { mockSend } = require('../../__mocks__/@aws-sdk/lib-dynamodb');
const { createJob, getJob, updateJobStatus, JobStatus } = require('../../services/dynamodb');

describe('DynamoDB Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('createJob', () => {
    it('应该成功创建Job记录', async () => {
      mockSend.mockResolvedValue({});

      const jobId = 'test-job-123';
      const imageS3Key = 'receipts/test-123.png';
      const imageS3Url = 'https://bucket.s3.amazonaws.com/receipts/test-123.png';

      const result = await createJob(jobId, imageS3Key, imageS3Url);

      expect(result.jobId).toBe(jobId);
      expect(result.status).toBe(JobStatus.PENDING);
      expect(result.imageS3Key).toBe(imageS3Key);
      expect(result.imageS3Url).toBe(imageS3Url);
      expect(result.createdAt).toBeDefined();
    });

    it('应该包含额外的元数据', async () => {
      mockSend.mockResolvedValue({});

      const jobId = 'test-job-123';
      const metadata = { userId: 'user-456', source: 'mobile' };

      const result = await createJob(jobId, 'key', 'url', metadata);

      expect(result.userId).toBe('user-456');
      expect(result.source).toBe('mobile');
    });
  });

  describe('getJob', () => {
    it('应该返回Job记录', async () => {
      const mockJob = { jobId: 'test-123', status: 'PENDING' };
      mockSend.mockResolvedValue({ Item: mockJob });

      const result = await getJob('test-123');

      expect(result).toEqual(mockJob);
    });

    it('应该返回null当Job不存在', async () => {
      mockSend.mockResolvedValue({});

      const result = await getJob('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('updateJobStatus', () => {
    it('应该更新Job状态为完成', async () => {
      const updatedJob = { jobId: 'test-123', status: 'COMPLETED', result: { text: 'test' } };
      mockSend.mockResolvedValue({ Attributes: updatedJob });

      const result = await updateJobStatus('test-123', 'COMPLETED', {
        ocrResult: { text: 'test' }
      });

      expect(result.status).toBe('COMPLETED');
      expect(result.result).toEqual({ text: 'test' });
    });

    it('应该更新Job状态为失败', async () => {
      const failedJob = { jobId: 'test-123', status: 'FAILED', errorMessage: 'OCR failed' };
      mockSend.mockResolvedValue({ Attributes: failedJob });

      const result = await updateJobStatus('test-123', 'FAILED', {
        errorMessage: 'OCR failed'
      });

      expect(result.status).toBe('FAILED');
      expect(result.errorMessage).toBe('OCR failed');
    });
  });
});
