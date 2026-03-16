/**
 * SQS 服务测试
 */

jest.mock('@aws-sdk/client-sqs', () => require('../../__mocks__/@aws-sdk/client-sqs'));

const { SQSClient, SendMessageCommand, mockSend } = require('@aws-sdk/client-sqs');
const { enqueueJob, parseMessage } = require('../../services/sqs');

describe('SQS Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('enqueueJob', () => {
    it('应该成功将Job加入队列', async () => {
      mockSend.mockResolvedValue({ MessageId: 'msg-123' });

      const jobId = 'test-job-123';
      const imageS3Key = 'receipts/test.png';

      const result = await enqueueJob(jobId, imageS3Key);

      expect(result).toBe('msg-123');
      expect(SendMessageCommand).toHaveBeenCalledWith({
        QueueUrl: expect.any(String),
        MessageBody: expect.stringContaining(jobId)
      });
    });

    it('应该在发送失败时抛出错误', async () => {
      mockSend.mockRejectedValue(new Error('SQS send failed'));

      await expect(enqueueJob('job-1', 'key')).rejects.toThrow('SQS send failed');
    });
  });

  describe('parseMessage', () => {
    it('应该成功解析消息体', () => {
      const message = { jobId: 'test', imageS3Key: 'key' };
      const result = parseMessage(JSON.stringify(message));

      expect(result).toEqual(message);
    });

    it('应该在解析失败时返回null', () => {
      const result = parseMessage('invalid-json');

      expect(result).toBeNull();
    });
  });
});
