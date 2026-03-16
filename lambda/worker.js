/**
 * Lambda: Worker
 * 处理流程:
 * 1. 从 SQS 接收 Job 消息 或 API Gateway 直接调用
 * 2. 从 S3 获取图像
 * 3. 调用 Textract 进行 OCR
 * 4. 使用 Bedrock Claude 进行后处理
 * 5. 更新 DynamoDB 中的 Job 状态和结果
 */

const { TextractClient, AnalyzeExpenseCommand, AnalyzeDocumentCommand } = require('@aws-sdk/client-textract');
const { BedrockRuntimeClient, InvokeModelCommand } = require('@aws-sdk/client-bedrock-runtime');

const { getJob, updateJobStatus, JobStatus } = require('./services/dynamodb');
const { parseMessage } = require('./services/sqs');
const { apiResponse, handleCorsPreflight } = require('./utils');

// AWS 客户端
const textractClient = new TextractClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

const bedrockClient = new BedrockRuntimeClient({
  region: process.env.AWS_REGION || 'us-east-1'
});

// ==================== OCR 逻辑（从 ocr.js 迁移）====================

/**
 * 使用 Bedrock Claude 解析收据文本
 */
async function parseReceiptWithLLM(plainText) {
  const prompt = `你是一个专业的收据解析助手。请从以下收据文本中提取关键信息。

请严格按照以下 JSON 格式返回，不要添加任何其他内容：
{
  "vendor": "商家名称，如果没有则返回 null",
  "date": "日期，格式化为 YYYY-MM-DD 或 MM/DD/YYYY，如果没有则返回 null",
  "totalAmount": 总金额数字，如果没有则返回 null,
  "subtotalAmount": 小计金额，如果没有则返回 null,
  "taxAmount": 税额，如果没有则返回 null,
  "items": [{"name": "商品名称", "price": 价格, "quantity": 数量}] // 如果没有商品则返回空数组 []
}

注意事项：
1. 如果 OCR 识别错误（如 "2B" 应该是 "28"），请尝试推断并修正
2. 如果无法确定某个字段，返回 null
3. 只返回 JSON，不要有任何解释

收据文本：
${plainText}`;

  try {
    const command = new InvokeModelCommand({
      modelId: 'anthropic.claude-3-sonnet-20240229-v1:0',
      contentType: 'application/json',
      accept: 'application/json',
      body: JSON.stringify({
        anthropic_version: 'bedrock-2023-05-31',
        max_tokens: 2048,
        temperature: 0.1,
        messages: [
          {
            role: 'user',
            content: prompt
          }
        ]
      })
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    const content = responseBody.content?.[0]?.text || '';
    console.log('🤖 LLM Raw Response:', content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log('🤖 LLM Parsed Result:', JSON.stringify(parsed, null, 2));
      return parsed;
    }

    return null;
  } catch (error) {
    console.error('🤖 LLM Error:', error.message);
    return null;
  }
}

/**
 * 从 Textract 响应中提取纯文本
 */
function extractPlainText(blocks) {
  if (!blocks) return '';
  return blocks
    .filter((block) => block.BlockType === 'LINE')
    .map((block) => block.Text)
    .join('\n');
}

/**
 * 从 Textract Expense API 响应中提取关键信息
 */
function extractExpenseData(summaryFields) {
  const result = {
    vendor: null,
    date: null,
    totalAmount: null,
  };

  const fieldTypeMap = {
    'VENDOR': 'vendor',
    'MERCHANT_NAME': 'vendor',
    'SUPPLIER_NAME': 'vendor',
    'STORE_NAME': 'vendor',
    'NAME': 'vendor',
    'DATE': 'date',
    'INVOICE_RECEIPT_DATE': 'date',
    'RECEIPT_DATE': 'date',
    'TRANSACTION_DATE': 'date',
    'TOTAL': 'totalAmount',
    'TOTAL_AMOUNT': 'totalAmount',
    'AMOUNT_DUE': 'totalAmount',
    'BALANCE_DUE': 'totalAmount',
  };

  for (const field of summaryFields) {
    const label = field.Type?.Text?.toUpperCase() || field.LabelDetection?.Text?.toUpperCase();
    const value = field.ValueDetection?.Text || null;

    if (!label || !value) continue;

    const mappedKey = fieldTypeMap[label];

    if (mappedKey && !result[mappedKey]) {
      if (mappedKey === 'totalAmount') {
        const numValue = parseFloat(value.replace(/[$,]/g, ''));
        if (!isNaN(numValue)) {
          result[mappedKey] = numValue;
        }
      } else {
        result[mappedKey] = value;
      }
    }
  }

  return result;
}

/**
 * 从 Textract Expense API 响应中提取商品明细
 */
function extractExpenseLineItems(lineItemGroups) {
  const items = [];

  for (const group of lineItemGroups) {
    for (const lineItem of group.LineItems || []) {
      const item = {
        name: '',
        price: null,
        quantity: null,
      };

      for (const expenseField of lineItem.LineItemExpenseFields || []) {
        const label = expenseField.Type?.Text?.toUpperCase();
        const value = expenseField.ValueDetection?.Text || null;

        if (!value) continue;

        if (label === 'ITEM' || label === 'PRODUCT' || label === 'DESCRIPTION' || label === 'EXPENSE_ITEM') {
          item.name = value;
        } else if (label === 'PRICE' || label === 'AMOUNT' || label === 'UNIT_PRICE') {
          item.price = parseFloat(value.replace(/[$,]/g, '')) || null;
        } else if (label === 'QUANTITY') {
          item.quantity = parseInt(value, 10) || null;
        }
      }

      if (item.name || item.price) {
        items.push(item);
      }
    }
  }

  return items;
}

/**
 * 处理 OCR 并返回结果
 */
async function processOCR(imageBase64) {
  // 首先尝试 Expense API
  const expenseCommand = new AnalyzeExpenseCommand({
    Document: {
      Bytes: Buffer.from(imageBase64, 'base64'),
    },
  });

  const expenseResponse = await textractClient.send(expenseCommand);
  const expenseDocuments = expenseResponse.ExpenseDocuments || [];

  const hasExpenseData = expenseDocuments.some(doc =>
    (doc.SummaryFields && doc.SummaryFields.length > 0) ||
    (doc.LineItemGroups && doc.LineItemGroups.length > 0)
  );

  if (hasExpenseData) {
    console.log('Using Expense API data');
    const firstDoc = expenseDocuments[0] || {};
    const summaryFields = firstDoc.SummaryFields || [];
    const lineItemGroups = firstDoc.LineItemGroups || [];

    const expenseData = extractExpenseData(summaryFields);
    const expenseItems = extractExpenseLineItems(lineItemGroups);

    const hasAtLeastOneField = !!(expenseData.vendor || expenseData.date || expenseData.totalAmount);

    if (!hasAtLeastOneField) {
      throw new Error('INCOMPLETE_FIELDS');
    }

    let plainText = '';
    if (expenseItems.length > 0) {
      plainText = expenseItems.map(i => `${i.name} ${i.price}`).join('\n');
    }
    if (summaryFields.length > 0) {
      const summaryText = summaryFields
        .map(f => `${f.Label || ''} ${f.Value?.Text || f.Value?.Value || ''}`)
        .join('\n');
      plainText = summaryText + (plainText ? '\n' + plainText : '');
    }

    let llmResult = null;
    if (plainText && plainText.trim().length > 0) {
      llmResult = await parseReceiptWithLLM(plainText);
    }

    const mergedParsed = {
      vendor: expenseData.vendor || llmResult?.vendor || null,
      date: expenseData.date || llmResult?.date || null,
      totalAmount: expenseData.totalAmount || llmResult?.totalAmount || null,
      subtotalAmount: llmResult?.subtotalAmount || null,
      taxAmount: llmResult?.taxAmount || null,
      items: expenseItems.length > 0 ? expenseItems : (llmResult?.items || []),
    };

    return {
      text: plainText,
      parsed: mergedParsed,
      llmUsed: !!llmResult,
      confidence: llmResult ? 95 : 90,
    };
  } else {
    console.log('Expense API returned empty, falling back to AnalyzeDocument...');

    const docCommand = new AnalyzeDocumentCommand({
      Document: {
        Bytes: Buffer.from(imageBase64, 'base64'),
      },
      FeatureTypes: ['FORMS', 'TABLES'],
    });

    const docResponse = await textractClient.send(docCommand);
    const blocks = docResponse.Blocks || [];
    const plainText = extractPlainText(blocks);

    let llmResult = null;
    if (plainText && plainText.trim().length > 0) {
      llmResult = await parseReceiptWithLLM(plainText);
    }

    const mergedParsed = {
      vendor: llmResult?.vendor || null,
      date: llmResult?.date || null,
      totalAmount: llmResult?.totalAmount || null,
      subtotalAmount: llmResult?.subtotalAmount || null,
      taxAmount: llmResult?.taxAmount || null,
      items: llmResult?.items || [],
    };

    return {
      text: plainText,
      parsed: mergedParsed,
      llmUsed: !!llmResult,
      confidence: llmResult ? 95 : 90,
    };
  }
}

// ==================== Lambda Handler ====================

exports.handler = async (event) => {
  try {
    console.log('Worker Event:', JSON.stringify(event));

    // 处理 SQS 事件（SQS 触发）
    if (event.Records && event.Records[0] && event.Records[0].eventSource === 'aws:sqs') {
      const results = [];

      for (const record of event.Records) {
        const message = parseMessage(record.body);

        if (!message || !message.jobId || !message.imageS3Key) {
          console.error('Invalid SQS message:', record.body);
          results.push({ error: 'Invalid message format' });
          continue;
        }

        const { jobId, imageS3Key } = message;
        console.log('Processing job:', jobId);

        try {
          // 获取 Job 记录
          const job = await getJob(jobId);

          if (!job) {
            console.error('Job not found:', jobId);
            continue;
          }

          // 更新状态为处理中
          await updateJobStatus(jobId, JobStatus.PROCESSING);

          // 从 S3 获取图像（这里简化处理，实际需要从 S3 下载）
          // 由于 OCR 函数目前接收 base64，我们需要从 S3 获取
          // 这里假设图像已经在某个地方可用，或者使用 S3 GetObject
          const { S3Client, GetObjectCommand } = require('@aws-sdk/client-s3');
          const s3Client = new S3Client({ region: process.env.AWS_REGION || 'us-east-1' });

          const s3Response = await s3Client.send(new GetObjectCommand({
            Bucket: process.env.S3_BUCKET || 'taxrefund-receipts',
            Key: imageS3Key
          }));

          // 将 S3 流转换为 base64
          const chunks = [];
          for await (const chunk of s3Response.Body) {
            chunks.push(chunk);
          }
          const imageBase64 = Buffer.concat(chunks).toString('base64');

          // 处理 OCR
          const ocrResult = await processOCR(imageBase64);

          // 更新 Job 状态为完成
          await updateJobStatus(jobId, JobStatus.COMPLETED, { ocrResult });

          results.push({ jobId, status: 'completed', result: ocrResult });

        } catch (error) {
          console.error('Error processing job:', jobId, error);

          // 更新 Job 状态为失败
          await updateJobStatus(jobId, JobStatus.FAILED, {
            errorMessage: error.message
          });

          results.push({ jobId, status: 'failed', error: error.message });
        }
      }

      return { processed: results.length, results };
    }

    // 处理 API Gateway 直接调用（保留兼容性）
    const httpMethod = event.httpMethod;

    if (httpMethod === 'OPTIONS') {
      return handleCorsPreflight();
    }

    if (httpMethod === 'GET') {
      return apiResponse(200, {
        status: 'OK',
        service: 'Worker'
      });
    }

    if (httpMethod === 'POST') {
      let body;
      try {
        body = typeof event.body === 'string' ? JSON.parse(event.body) : event.body;
      } catch (e) {
        return apiResponse(400, { error: 'Invalid JSON body' });
      }

      const { imageBase64 } = body;

      if (!imageBase64) {
        return apiResponse(400, { error: 'Missing imageBase64' });
      }

      const ocrResult = await processOCR(imageBase64);

      return apiResponse(200, ocrResult);
    }

    return apiResponse(405, { error: 'Method not allowed' });

  } catch (error) {
    console.error('Worker Error:', error);
    return apiResponse(500, { error: error.message });
  }
};
