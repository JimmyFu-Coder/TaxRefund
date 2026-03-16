/**
 * AWS SDK Mock - DynamoDB Document
 */

const mockSend = jest.fn();

module.exports = {
  DynamoDBDocumentClient: {
    from: jest.fn(() => ({
      send: mockSend
    }))
  },
  PutCommand: jest.fn((params) => params),
  GetCommand: jest.fn((params) => params),
  UpdateCommand: jest.fn((params) => params),
  QueryCommand: jest.fn((params) => params),
  mockSend
};
