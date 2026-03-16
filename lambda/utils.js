/**
 * 通用工具函数
 */

const { v4: uuidv4 } = require('uuid');

/**
 * 生成唯一 Job ID
 */
function generateJobId() {
  return uuidv4();
}

/**
 * 验证 base64 图像数据
 */
function validateBase64Image(imageBase64) {
  if (!imageBase64) {
    return { valid: false, error: 'Missing imageBase64' };
  }

  // 检查是否是有效的 base64
  const base64Regex = /^data:image\/(\w+);base64,/.exec(imageBase64);
  let mimeType = 'image/png';

  if (base64Regex) {
    mimeType = base64Regex[1];
  } else {
    // 尝试解码验证
    try {
      Buffer.from(imageBase64, 'base64');
    } catch (e) {
      return { valid: false, error: 'Invalid base64 data' };
    }
  }

  return { valid: true, mimeType };
}

/**
 * 从 base64 数据提取实际二进制内容
 */
function extractBase64Data(imageBase64) {
  // 处理 data:image/xxx;base64, 前缀
  const base64Data = imageBase64.replace(/^data:image\/\w+;base64,/, '');
  return Buffer.from(base64Data, 'base64');
}

/**
 * 生成 S3 对象键
 */
function generateS3Key(jobId) {
  const timestamp = Date.now();
  return `receipts/${jobId}-${timestamp}.png`;
}

/**
 * 构造 API 响应
 */
function apiResponse(statusCode, body) {
  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify(body)
  };
}

/**
 * 处理 OPTIONS 预检请求
 */
function handleCorsPreflight() {
  return {
    statusCode: 200,
    headers: {
      'Content-Type': 'application/json',
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET,POST,OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type',
    },
    body: JSON.stringify({ ok: true })
  };
}

module.exports = {
  generateJobId,
  validateBase64Image,
  extractBase64Data,
  generateS3Key,
  apiResponse,
  handleCorsPreflight
};
