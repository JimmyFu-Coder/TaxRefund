/**
 * AWS Lambda 函数 - 使用 Textract 进行 OCR
 * 支持基于 Blocks 坐标的后处理
 * 后处理使用 Bedrock Claude
 */

const { TextractClient, AnalyzeExpenseCommand, AnalyzeDocumentCommand } = require("@aws-sdk/client-textract");
const { BedrockRuntimeClient, InvokeModelCommand } = require("@aws-sdk/client-bedrock-runtime");

const textractClient = new TextractClient({
  region: "us-east-1",
});

const bedrockClient = new BedrockRuntimeClient({
  region: "us-east-1",
});

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
      modelId: "anthropic.claude-3-sonnet-20240229-v1:0",
      contentType: "application/json",
      accept: "application/json",
      body: JSON.stringify({
        anthropic_version: "bedrock-2023-05-31",
        max_tokens: 2048,
        temperature: 0.1,
        messages: [
          {
            role: "user",
            content: prompt
          }
        ]
      })
    });

    const response = await bedrockClient.send(command);
    const responseBody = JSON.parse(new TextDecoder().decode(response.body));

    // 解析 Claude 的响应
    const content = responseBody.content?.[0]?.text || "";
    console.log("🤖 LLM Raw Response:", content);

    // 提取 JSON 部分
    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (jsonMatch) {
      const parsed = JSON.parse(jsonMatch[0]);
      console.log("🤖 LLM Parsed Result:", JSON.stringify(parsed, null, 2));
      return parsed;
    }

    return null;
  } catch (error) {
    console.error("🤖 LLM Error:", error.message);
    return null;
  }
}

/**
 * 从 Textract 响应中提取纯文本
 */
function extractPlainText(blocks) {
  if (!blocks) return "";
  return blocks
    .filter((block) => block.BlockType === "LINE")
    .map((block) => block.Text)
    .join("\n");
}

/**
 * 从 Textract 响应中提取 Key-Value 对
 */
function extractKeyValuePairs(blocks) {
  const keyValuePairs = {};

  if (!blocks) return keyValuePairs;

  // 找到所有 KEY_VALUE_SET 类型的块
  const kvBlocks = blocks.filter((block) => block.BlockType === "KEY_VALUE_SET");

  for (const block of kvBlocks) {
    // 如果有 Key 属性
    if (block.Key) {
      const keyId = block.Key.Id;
      const keyBlock = blocks.find((b) => b.Id === keyId);
      const keyText = keyBlock?.Text || "";

      // 如果有 Value 属性
      if (block.Value) {
        const valueId = block.Value.Id;
        const valueBlock = blocks.find((b) => b.Id === valueId);
        const valueText = valueBlock?.Text || "";

        // 存储 key-value 对
        keyValuePairs[keyText] = valueText;
      }
    }
  }

  return keyValuePairs;
}

/**
 * 从 Textract Expense API 响应中提取关键信息
 * Expense API 直接返回结构化的收据信息
 */
function extractExpenseData(summaryFields) {
  const result = {
    vendor: null,
    date: null,
    totalAmount: null,
  };

  // Expense API 的类型标签 - 只保留核心字段
  const fieldTypeMap = {
    // 商家相关
    'VENDOR': 'vendor',
    'MERCHANT_NAME': 'vendor',
    'SUPPLIER_NAME': 'vendor',
    'STORE_NAME': 'vendor',
    'NAME': 'vendor',

    // 日期相关
    'DATE': 'date',
    'INVOICE_RECEIPT_DATE': 'date',
    'RECEIPT_DATE': 'date',
    'TRANSACTION_DATE': 'date',

    // 金额相关
    'TOTAL': 'totalAmount',
    'TOTAL_AMOUNT': 'totalAmount',
    'AMOUNT_DUE': 'totalAmount',
    'BALANCE_DUE': 'totalAmount',
  };

  for (const field of summaryFields) {
    // 优先使用 Type.Text（更准确），其次使用 LabelDetection.Text
    const label = field.Type?.Text?.toUpperCase() || field.LabelDetection?.Text?.toUpperCase();
    const value = field.ValueDetection?.Text || null;

    if (!label || !value) {
      continue;
    }

    const mappedKey = fieldTypeMap[label];

    if (mappedKey && !result[mappedKey]) {
      // 清理金额值
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

      // 提取商品名称 - Expense API 使用 Type.Text 和 ValueDetection.Text
      for (const expenseField of lineItem.LineItemExpenseFields || []) {
        const label = expenseField.Type?.Text?.toUpperCase();
        const value = expenseField.ValueDetection?.Text || null;

        console.log(`LineItem field: ${label} = ${value}`);

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

  console.log("Extracted line items:", items);
  return items;
}

/**
 * 基于 Blocks 坐标解析收据
 * 核心思路：
 * 1. 按 Y 坐标分行
 * 2. 按 X 坐标排序每行的元素
 * 3. 识别商品-价格对
 * 4. 同时用原始文本做关键词匹配
 */
function parseReceiptByBlocks(blocks) {
  if (!blocks || !blocks.length) return null;

  // 1. 提取所有 LINE 类型的块
  const lineBlocks = blocks.filter(b => b.BlockType === "LINE" && b.Text);

  if (!lineBlocks.length) return null;

  // 2. 清理 OCR 噪声 - 移到前面定义
  const cleanText = (text) => {
    return text
      // 常见 OCR 错误替换
      .replace(/S/g, '$')      // S -> $
      .replace(/O/g, '0')      // O -> 0
      .replace(/l/g, '1')      // l -> 1
      .replace(/I/g, '1')      // I -> 1
      .replace(/B/g, '8')      // B -> 8
      .replace(/o/g, '0')      // o -> 0
      // 特殊字符
      .replace(/=/g, 'x')     // = -> x (数量)
      .replace(/×/g, 'x')     // × -> x
      // 清理多余空格
      .replace(/\s+/g, ' ')
      .trim();
  };

  // 3. 提取原始纯文本（用于关键词匹配）
  const rawText = lineBlocks.map(b => b.Text).join('\n');
  const cleanedRawText = cleanText(rawText).toUpperCase();

  // 4. 按 Y 坐标（Top）分组 - 同一行的元素 Y 坐标相近
  const Y_TOLERANCE = 0.015; // Y 坐标容差
  const lines = [];
  let currentLine = [lineBlocks[0]];

  for (let i = 1; i < lineBlocks.length; i++) {
    const block = lineBlocks[i];
    const prevBlock = currentLine[0];
    const yDiff = Math.abs(block.Geometry.BoundingBox.Top - prevBlock.Geometry.BoundingBox.Top);

    if (yDiff < Y_TOLERANCE) {
      // 同一行
      currentLine.push(block);
    } else {
      // 新行
      lines.push(currentLine);
      currentLine = [block];
    }
  }
  lines.push(currentLine);

  // 5. 按 X 坐标排序每行元素
  const sortedLines = lines.map(line => {
    return line.sort((a, b) => a.Geometry.BoundingBox.Left - b.Geometry.BoundingBox.Left);
  });

  // 6. 解析每行内容
  const result = {
    vendor: null,
    date: null,
    totalAmount: null,
    cashAmount: null,
    changeAmount: null,
    items: [],
    rawLines: [],
  };

  // 7. 首先从原始文本中提取关键词（更可靠）
  // 提取总金额
  const totalMatch = cleanedRawText.match(/(?:TOTAL|SUBTOTAL|AMOUNT|BALANCE)[\s\S]*?(\d+\.?\d{0,2})/);
  if (totalMatch) {
    result.totalAmount = parseFloat(totalMatch[1]);
  }

  // 提取现金
  const cashMatch = cleanedRawText.match(/(?:CASH|PAYMENT|PAID)[\s\S]*?(\d+\.?\d{0,2})/);
  if (cashMatch) {
    result.cashAmount = parseFloat(cashMatch[1]);
  }

  // 提取找零
  const changeMatch = cleanedRawText.match(/CHANGE[\s\S]*?(\d+\.?\d{0,2})/);
  if (changeMatch) {
    result.changeAmount = parseFloat(changeMatch[1]);
  }

  // 提取日期
  const dateMatch = rawText.match(/(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/);
  if (dateMatch) {
    result.date = dateMatch[1];
  }

  // 提取商家（从第一行）
  const textLines = rawText.split('\n').filter(l => l.trim());
  for (const line of textLines.slice(0, 3)) {
    const cleaned = cleanText(line);
    if (cleaned.length > 2 && cleaned.length < 30 && !/\d/.test(cleaned)) {
      if (!/receipt|thank|cash|change|total/i.test(cleaned) && !/ifier|difier/i.test(cleaned)) {
        result.vendor = cleaned;
        break;
      }
    }
  }

  const amountKeywords = {
    'total': 'totalAmount',
    'subtotal': 'totalAmount',
    'amount': 'totalAmount',
    'balance': 'totalAmount',
    'cash': 'cashAmount',
    'payment': 'cashAmount',
    'change': 'changeAmount',
  };

  // 标准化关键词（处理 OCR 错误）
  const normalizeKeyword = (text) => {
    // 先清理，再转大写
    return cleanText(text).toUpperCase();
  };

  // 检查是否是金额关键词行
  const isAmountLine = (text) => {
    const normalized = normalizeKeyword(text);
    return Object.keys(amountKeywords).some(kw => normalized.includes(kw));
  };

  // 获取金额字段名
  const getAmountField = (text) => {
    const normalized = normalizeKeyword(text);
    for (const [kw, field] of Object.entries(amountKeywords)) {
      if (normalized.includes(kw)) {
        return field;
      }
    }
    return null;
  };

  // 提取金额 - 改进版
  const extractAmount = (text) => {
    const cleaned = cleanText(text);
    // 匹配 $ 数字 或 纯数字
    const match = cleaned.match(/\$?\s*(\d+\.?\d{0,2})/);
    if (match) {
      const amount = parseFloat(match[1]);
      // 过滤不合理的金额
      if (amount > 0 && amount < 10000) {
        return amount;
      }
    }
    return null;
  };

  // 8. 遍历每一行，识别商品
  for (let lineIndex = 0; lineIndex < sortedLines.length; lineIndex++) {
    const line = sortedLines[lineIndex];
    const texts = line.map(b => b.Text);

    // 合并行文本
    let combinedText = texts.join(' ');
    combinedText = cleanText(combinedText);
    result.rawLines.push(combinedText);

    // 跳过空行和噪声行
    if (!combinedText || combinedText.length < 2) continue;
    if (/difier|nodifier|modifier|template|shopping receipt/i.test(combinedText)) continue;

    // 检测商品行
    // 格式1: "2x 商品名 价格" 或 "2 商品名 价格"
    let itemMatch = combinedText.match(/^(\d+)\s*[xX×]?\s+(.+?)\s+\$?(\d+\.?\d{0,2})$/);
    if (itemMatch) {
      const price = parseFloat(itemMatch[3]);
      // 过滤不合理的价格
      if (price > 0 && price < 1000) {  // 单品价格不超过 1000
        result.items.push({
          quantity: parseInt(itemMatch[1], 10),
          name: itemMatch[2].trim(),
          price: price,
        });
      }
      continue;
    }

    // 格式2: "商品 $35.00" - 商品名 + 价格
    itemMatch = combinedText.match(/^(.+?)\s+\$(\d+\.?\d{0,2})$/);
    if (itemMatch && !isAmountLine(itemMatch[1])) {
      const name = itemMatch[1].trim();
      const price = parseFloat(itemMatch[2]);
      if (price > 0 && price < 1000 && name.length > 1) {
        result.items.push({
          name,
          price,
        });
      }
    }
  }

  return result;
}

/**
 * 从 Textract 响应中提取表格/商品明细（备用方法）
 */
function extractLineItems(blocks) {
  const lineItems = [];

  if (!blocks) return lineItems;

  // 找到所有 TABLE 类型的块
  const tableBlocks = blocks.filter((block) => block.BlockType === "TABLE");

  for (const table of tableBlocks) {
    // 尝试提取表格单元格内容
    if (table.CellIndex) {
      // 简单的表格行提取
      const rowCells = [];
      for (const cellId of table.CellIndex) {
        const cellBlock = blocks.find((b) => b.Id === cellId);
        if (cellBlock?.Text) {
          rowCells.push(cellBlock.Text);
        }
      }
      if (rowCells.length > 0) {
        lineItems.push(rowCells);
      }
    }
  }

  // 如果没有表格，尝试从 LINE 中提取商品
  const lines = blocks.filter((block) => block.BlockType === "LINE");
  for (const line of lines) {
    const text = line.Text;
    // 清理 OCR 噪声
    const cleanedText = text.replace(/\$/g, 'S').replace(/\s+/g, ' ').trim();

    // 匹配商品行：数量 x 商品名 价格 或 商品名 价格
    const itemMatch = cleanedText.match(/^(\d+)\s*[xX×]\s+(.+?)\s+(\d+\.?\d{0,2})$/);
    if (itemMatch) {
      lineItems.push({
        quantity: parseInt(itemMatch[1], 10),
        name: itemMatch[2],
        price: parseFloat(itemMatch[3]),
      });
      continue;
    }

    // 匹配 商品名 + 价格 格式
    const simpleMatch = cleanedText.match(/^(.+?)\s+(\d+\.?\d{0,2})$/);
    if (simpleMatch && simpleMatch[1].length > 2) {
      lineItems.push({
        name: simpleMatch[1],
        price: parseFloat(simpleMatch[2]),
      });
    }
  }

  return lineItems;
}

exports.handler = async (event) => {
  try {
    console.log("Event:", JSON.stringify(event));

    const httpMethod = event.httpMethod;

    // 处理 OPTIONS 预检请求
    if (httpMethod === "OPTIONS") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
          "Access-Control-Allow-Methods": "GET,POST,OPTIONS",
          "Access-Control-Allow-Headers": "Content-Type",
        },
        body: JSON.stringify({ ok: true }),
      };
    }

    // 健康检查
    if (httpMethod === "GET") {
      return {
        statusCode: 200,
        headers: {
          "Content-Type": "application/json",
          "Access-Control-Allow-Origin": "*",
        },
        body: JSON.stringify({ status: "OK" }),
      };
    }

    if (httpMethod === "POST") {
      // 解析请求体 - API Gateway 会把 body 作为字符串传递
      let body;
      try {
        body = typeof event.body === "string" ? JSON.parse(event.body) : event.body;
      } catch (e) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Invalid JSON body" }),
        };
      }

      const { imageBase64 } = body;

      if (!imageBase64) {
        return {
          statusCode: 400,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: "Missing imageBase64" }),
        };
      }

      // 调用 Textract AnalyzeExpense (专为收据/发票设计)
      // 同时也调用 AnalyzeDocument 作为后备
      try {
        // 首先尝试 Expense API
        const expenseCommand = new AnalyzeExpenseCommand({
          Document: {
            Bytes: Buffer.from(imageBase64, "base64"),
          },
        });

        const expenseResponse = await textractClient.send(expenseCommand);

        console.log("Expense API called, documents:", expenseResponse.ExpenseDocuments?.length);

        // 检查 Expense API 是否有数据
        const expenseDocuments = expenseResponse.ExpenseDocuments || [];
        const hasExpenseData = expenseDocuments.some(doc =>
          (doc.SummaryFields && doc.SummaryFields.length > 0) ||
          (doc.LineItemGroups && doc.LineItemGroups.length > 0)
        );

        if (hasExpenseData) {
          console.log("Using Expense API data");
          const firstDoc = expenseDocuments[0] || {};
          const summaryFields = firstDoc.SummaryFields || [];
          const lineItemGroups = firstDoc.LineItemGroups || [];

          const expenseData = extractExpenseData(summaryFields);
          const expenseItems = extractExpenseLineItems(lineItemGroups);

          // 检查是否至少有一个核心字段识别到了
          const hasAtLeastOneField = !!(expenseData.vendor || expenseData.date || expenseData.totalAmount);
          console.log("Core fields check:", { vendor: expenseData.vendor, date: expenseData.date, totalAmount: expenseData.totalAmount, hasAtLeastOneField });

          // 如果没有核心字段，回退到 AnalyzeDocument
          if (!hasAtLeastOneField) {
            console.log("No core fields found, falling back to AnalyzeDocument...");
            throw new Error("INCOMPLETE_FIELDS");  // 触发回退
          }

          let plainText = "";
          if (expenseItems.length > 0) {
            plainText = expenseItems.map(i => `${i.name} ${i.price}`).join('\n');
          }
          if (summaryFields.length > 0) {
            const summaryText = summaryFields
              .map(f => `${f.Label || ''} ${f.Value?.Text || f.Value?.Value || ''}`)
              .join('\n');
            plainText = summaryText + (plainText ? '\n' + plainText : '');
          }

          // 使用 LLM 进行后处理
          let llmResult = null;
          try {
            if (plainText && plainText.trim().length > 0) {
              llmResult = await parseReceiptWithLLM(plainText);
            }
          } catch (llmError) {
            console.log("LLM processing failed, using Textract result only");
          }

          // 合并 Textract 和 LLM 的结果，LLM 结果作为后备
          const mergedParsed = {
            vendor: expenseData.vendor || llmResult?.vendor || null,
            date: expenseData.date || llmResult?.date || null,
            totalAmount: expenseData.totalAmount || llmResult?.totalAmount || null,
            subtotalAmount: llmResult?.subtotalAmount || null,
            taxAmount: llmResult?.taxAmount || null,
            items: expenseItems.length > 0 ? expenseItems : (llmResult?.items || []),
          };

          const result = {
            text: plainText,
            keyValuePairs: {},
            lineItems: expenseItems,
            parsed: mergedParsed,
            llmUsed: !!llmResult,
            confidence: llmResult ? 95 : 90,
            blocksCount: expenseDocuments.length,
          };

          console.log("Textract Result:", JSON.stringify(result, null, 2));

          return {
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(result),
          };
        } else {
          console.log("Expense API returned empty, trying AnalyzeDocument...");

          // 后备：使用 AnalyzeDocument
          const docCommand = new AnalyzeDocumentCommand({
            Document: {
              Bytes: Buffer.from(imageBase64, "base64"),
            },
            FeatureTypes: ["FORMS", "TABLES"],
          });

          const docResponse = await textractClient.send(docCommand);
          console.log("AnalyzeDocument blocks:", docResponse.Blocks?.length);

          // 使用 AnalyzeDocument 的响应
          const blocks = docResponse.Blocks || [];
          const plainText = extractPlainText(blocks);
          const keyValuePairs = extractKeyValuePairs(blocks);
          const lineItems = extractLineItems(blocks);

          // 使用 LLM 进行后处理
          let llmResult = null;
          try {
            if (plainText && plainText.trim().length > 0) {
              llmResult = await parseReceiptWithLLM(plainText);
            }
          } catch (llmError) {
            console.log("LLM processing failed, using Textract result only");
          }

          const parsedFromBlocks = parseReceiptByBlocks(blocks);

          // 合并 Textract 和 LLM 的结果
          const mergedParsed = {
            vendor: parsedFromBlocks?.vendor || llmResult?.vendor || null,
            date: parsedFromBlocks?.date || llmResult?.date || null,
            totalAmount: parsedFromBlocks?.totalAmount || llmResult?.totalAmount || null,
            subtotalAmount: llmResult?.subtotalAmount || null,
            taxAmount: llmResult?.taxAmount || null,
            items: lineItems.length > 0 ? lineItems : (llmResult?.items || []),
          };

          const result = {
            text: plainText,
            keyValuePairs,
            lineItems,
            parsed: mergedParsed,
            llmUsed: !!llmResult,
            confidence: llmResult ? 95 : 90,
            blocksCount: blocks.length,
          };

          console.log("Textract Result:", JSON.stringify(result, null, 2));

          return {
            statusCode: 200,
            headers: {
              "Content-Type": "application/json",
              "Access-Control-Allow-Origin": "*",
            },
            body: JSON.stringify(result),
          };
        }
      } catch (textractError) {
        console.error("Textract Error:", textractError);

        // 如果是核心字段不完整，尝试 AnalyzeDocument
        if (textractError.message === "INCOMPLETE_FIELDS") {
          console.log("Falling back to AnalyzeDocument...");

          try {
            const docCommand = new AnalyzeDocumentCommand({
              Document: {
                Bytes: Buffer.from(imageBase64, "base64"),
              },
              FeatureTypes: ["FORMS", "TABLES"],
            });

            const docResponse = await textractClient.send(docCommand);
            console.log("AnalyzeDocument blocks:", docResponse.Blocks?.length);

            const blocks = docResponse.Blocks || [];
            const plainText = extractPlainText(blocks);
            const keyValuePairs = extractKeyValuePairs(blocks);
            const lineItems = extractLineItems(blocks);

            // 使用 LLM 进行后处理
            let llmResult = null;
            try {
              if (plainText && plainText.trim().length > 0) {
                llmResult = await parseReceiptWithLLM(plainText);
              }
            } catch (llmError) {
              console.log("LLM processing failed, using Textract result only");
            }

            const parsedFromBlocks = parseReceiptByBlocks(blocks);

            // 合并 Textract 和 LLM 的结果
            const mergedParsed = {
              vendor: parsedFromBlocks?.vendor || llmResult?.vendor || null,
              date: parsedFromBlocks?.date || llmResult?.date || null,
              totalAmount: parsedFromBlocks?.totalAmount || llmResult?.totalAmount || null,
              subtotalAmount: llmResult?.subtotalAmount || null,
              taxAmount: llmResult?.taxAmount || null,
              items: lineItems.length > 0 ? lineItems : (llmResult?.items || []),
            };

            const result = {
              text: plainText,
              keyValuePairs,
              lineItems,
              parsed: mergedParsed,
              llmUsed: !!llmResult,
              confidence: llmResult ? 95 : 90,
              blocksCount: blocks.length,
            };

            console.log("Textract Result:", JSON.stringify(result, null, 2));

            return {
              statusCode: 200,
              headers: {
                "Content-Type": "application/json",
                "Access-Control-Allow-Origin": "*",
              },
              body: JSON.stringify(result),
            };
          } catch (docError) {
            console.error("AnalyzeDocument Error:", docError);
            return {
              statusCode: 500,
              headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
              body: JSON.stringify({ error: `OCR failed: ${docError.message}` }),
            };
          }
        }

        return {
          statusCode: 500,
          headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
          body: JSON.stringify({ error: `Textract error: ${textractError.message}` }),
        };
      }
    }

    return {
      statusCode: 405,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: "Method not allowed" }),
    };
  } catch (error) {
    console.error("Error:", error);
    return {
      statusCode: 500,
      headers: { "Content-Type": "application/json", "Access-Control-Allow-Origin": "*" },
      body: JSON.stringify({ error: error.message }),
    };
  }
};
