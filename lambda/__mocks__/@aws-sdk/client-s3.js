/**
 * AWS SDK Mock - S3
 */

const mockSend = jest.fn();

module.exports = {
  S3Client: jest.fn(() => ({
    send: mockSend
  })),
  PutObjectCommand: jest.fn((params) => params),
  GetObjectCommand: jest.fn((params) => params),
  mockSend
};
