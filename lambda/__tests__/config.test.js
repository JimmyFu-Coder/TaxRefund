/**
 * config.js 单元测试
 */

const config = require('../config');

describe('config', () => {
  describe('AWS_REGION', () => {
    it('应该有默认区域', () => {
      expect(config.AWS_REGION).toBeDefined();
      expect(config.AWS_REGION).toBe('us-east-1');
    });
  });

  describe('S3 配置', () => {
    it('应该有S3 bucket配置', () => {
      expect(config.S3_BUCKET).toBeDefined();
      expect(config.S3_KEY_PREFIX).toBe('receipts/');
    });
  });

  describe('DynamoDB 配置', () => {
    it('应该有DynamoDB表配置', () => {
      expect(config.DYNAMODB_TABLE).toBeDefined();
      expect(config.JOB_STATUS_INDEX).toBeDefined();
    });
  });

  describe('SQS 配置', () => {
    it('应该有SQS队列配置', () => {
      expect(config.SQS_QUEUE_URL).toBeDefined();
      expect(config.SQS_QUEUE_NAME).toBeDefined();
    });
  });

  describe('JobStatus 枚举', () => {
    it('应该包含所有作业状态', () => {
      expect(config.JobStatus.PENDING).toBe('PENDING');
      expect(config.JobStatus.PROCESSING).toBe('PROCESSING');
      expect(config.JobStatus.COMPLETED).toBe('COMPLETED');
      expect(config.JobStatus.FAILED).toBe('FAILED');
    });
  });
});
