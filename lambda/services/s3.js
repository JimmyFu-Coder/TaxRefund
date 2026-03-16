/**
 * S3 存储服务
 */

const { S3Client, PutObjectCommand } = require('@aws-sdk/client-s3');
const { S3_BUCKET, AWS_REGION } = require('../config');

// 创建 S3 客户端
const s3Client = new S3Client({
  region: AWS_REGION
});

/**
 * 上传图像到 S3
 * @param {string} key - S3 对象键
 * @param {Buffer} data - 图像二进制数据
 * @param {string} contentType - 内容类型
 * @returns {Promise<{location: string}>}
 */
async function uploadImage(key, data, contentType = 'image/png') {
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key,
    Body: data,
    ContentType: contentType,
    // 可选：设置存储类或生命周期
    // StorageClass: 'STANDARD_IA'
  });

  await s3Client.send(command);

  // 返回 S3 对象 URL
  const location = `https://${S3_BUCKET}.s3.${AWS_REGION}.amazonaws.com/${key}`;

  return { location };
}

/**
 * 获取预签名的上传 URL（如果需要客户端直接上传）
 * @param {string} key - S3 对象键
 * @param {number} expiresIn - 过期时间（秒）
 */
async function getPresignedUploadUrl(key, expiresIn = 300) {
  const { getSignedUrl } = require('@aws-sdk/s3-request-presigner');
  const command = new PutObjectCommand({
    Bucket: S3_BUCKET,
    Key: key
  });

  const signedUrl = await getSignedUrl(s3Client, command, { expiresIn });
  return signedUrl;
}

module.exports = {
  s3Client,
  uploadImage,
  getPresignedUploadUrl
};
