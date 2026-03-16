/**
 * AWS SDK Mock - SQS
 */

const mockSend = jest.fn();

module.exports = {
  SQSClient: jest.fn(() => ({
    send: mockSend
  })),
  SendMessageCommand: jest.fn((params) => params),
  mockSend
};
