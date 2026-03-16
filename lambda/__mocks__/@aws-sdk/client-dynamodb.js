/**
 * AWS SDK Mock - DynamoDB
 */

const mockSend = jest.fn();

module.exports = {
  DynamoDBClient: jest.fn(() => ({
    send: mockSend
  })),
  mockSend
};
