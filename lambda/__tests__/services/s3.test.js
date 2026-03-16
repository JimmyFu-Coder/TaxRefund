/**
 * S3 服务测试
 */

jest.mock('@aws-sdk/client-s3', () => require('../../__mocks__/@aws-sdk/client-s3'));

const { S3Client, PutObjectCommand, mockSend } = require('@aws-sdk/client-s3');
const { uploadImage } = require('../../services/s3');

describe('S3 Service', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('uploadImage', () => {
    it('应该成功上传图像到S3', async () => {
      // Mock S3上传成功响应
      mockSend.mockResolvedValue({});

      const key = 'receipts/test-123.png';
      const imageData = Buffer.from('fake image data');
      const contentType = 'image/png';

      const result = await uploadImage(key, imageData, contentType);

      expect(PutObjectCommand).toHaveBeenCalledWith({
        Bucket: expect.any(String),
        Key: key,
        Body: imageData,
        ContentType: contentType
      });

      expect(result.location).toContain(key);
    });

    it('应该使用默认的contentType', async () => {
      mockSend.mockResolvedValue({});

      const key = 'receipts/test-123.png';
      const imageData = Buffer.from('fake image data');

      await uploadImage(key, imageData);

      const callArgs = mockSend.mock.calls[0][0];
      expect(callArgs.ContentType).toBe('image/png');
    });

    it('应该在上传失败时抛出错误', async () => {
      mockSend.mockRejectedValue(new Error('S3 upload failed'));

      const key = 'receipts/test-123.png';
      const imageData = Buffer.from('fake image data');

      await expect(uploadImage(key, imageData)).rejects.toThrow('S3 upload failed');
    });
  });
});
