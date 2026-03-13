/**
 * Receipt OCR Service
 * 用于识别和提取收据中的关键字信息
 */

export interface OCRProgress {
  status: 'downloading' | 'recognizing' | 'completed';
  progress: number;
}

export interface OCRResult {
  text: string;
  confidence: number;
  // 结构化数据
  keyValuePairs?: Record<string, string>;
  lineItems?: Array<{
    name?: string;
    price?: number;
    quantity?: number;
  }>;
  // 基于 Blocks 坐标解析的结果
  parsed?: {
    vendor?: string | null;
    date?: string | null;
    totalAmount?: number | null;
    subtotalAmount?: number | null;
    taxAmount?: number | null;
    cashAmount?: number | null;
    changeAmount?: number | null;
    phoneNumber?: string | null;
    address?: string | null;
    receiptId?: string | null;
    items?: Array<{
      name?: string;
      price?: number;
      quantity?: number;
    }>;
    // 所有识别到的字段
    allFields?: Array<{
      label: string;
      value: string;
    }>;
  };
}

export interface ReceiptData {
  date?: string;
  vendor?: string;
  amount?: number;
  subtotalAmount?: number;
  taxAmount?: number;
  items?: ReceiptItem[];
  rawText: string;
  lines?: ReceiptLine[];
  photoUri?: string;
}

export interface ReceiptLine {
  key: string;
  value?: string;
}

export interface ReceiptItem {
  name: string;
  price?: number;
  quantity?: number;
}

// 日期正则表达式集合
const DATE_PATTERNS = [
  /(\d{1,2}[\/\-]\d{1,2}[\/\-]\d{2,4})/,  // MM/DD/YYYY 或 DD/MM/YYYY
  /(\d{4}[\/\-]\d{1,2}[\/\-]\d{1,2})/,    // YYYY/MM/DD
  /(\w+\s+\d{1,2},?\s+\d{4})/,            // January 15, 2024
  /(\d{1,2}\s+\w+\s+\d{4})/,              // 15 January 2024
  // 移除简化的月.日格式，因为会误匹配 "35.00" 这样的价格
];

// 金额正则表达式集合
const AMOUNT_PATTERNS = [
  /total[:\s]*\$?\s*(\d+\.?\d{0,2})/gi,      // Total: $100.00
  /amount[:\s]*\$?\s*(\d+\.?\d{0,2})/gi,     // Amount: $100.00
  /subtotal[:\s]*\$?\s*(\d+\.?\d{0,2})/gi,   // Subtotal: $100.00
  /\$\s*(\d+\.?\d{0,2})/g,                   // $100.00
  /([0-9]+[.,][0-9]{2})/g,                  // 支持 1,20 或 1.20 格式
  /([0-9]{1,}(?:[.,][0-9]{2})?)/g,          // 数字格式
];

// 常见收据供应商关键词
const VENDOR_KEYWORDS = [
  'walmart', 'target', 'costco', 'safeway', 'kroger', 'whole foods',
  'amazon', 'bestbuy', 'apple', 'home depot', 'lowes', 'ikea',
  'trader joes', 'instacart', 'ubereats', 'doordash', 'grubhub',
  'starbucks', 'mcdonalds', 'chipotle', 'subway', 'pizza hut',
  'cvs', 'walgreens', 'rite aid', 'duane reade',
  'hotel', 'hilton', 'marriott', 'hyatt', 'delta', 'united', 'airline',
  'gas station', 'shell', 'chevron', 'exxon', 'bp',
];

// 金额相关关键词
const AMOUNT_KEYWORDS = ['total', 'subtotal', 'sub-total', 'amount', 'balance', 'cash', 'change', 'payment', 'due', 'tax', 'sales tax'];

// 税收相关关键词
const DEDUCTIBLE_KEYWORDS = [
  'office supplies', 'equipment', 'software', 'subscription',
  'conference', 'training', 'travel', 'hotel', 'flight',
  'rent', 'utilities', 'insurance', 'fuel', 'repairs',
  'maintenance', 'professional services', 'consulting',
];

// 需要过滤掉的 OCR 噪声关键词
const NOISE_KEYWORDS = ['receipt', 'thank you', 'thankyou', 'www.', 'http', 'download', 'free'];

// 需要过滤掉的单行数字（OCR 噪声）
const noiseNumberPattern = /^[\$\s]*(\d+|0|-|\+|\.)$/;

/**
 * 检查是否是金额关键词行
 */
function isAmountLine(line: string): boolean {
  const lower = line.toLowerCase().replace(/[^\w\s]/g, '').trim();
  return AMOUNT_KEYWORDS.some(kw => lower.includes(kw));
}

/**
 * 检查是否应该跳过此行（商家名、日期等非商品行）
 */
function shouldSkipLine(line: string): boolean {
  const trimmed = line.trim();
  const lower = trimmed.toLowerCase();

  // 跳过标题关键词
  if (NOISE_KEYWORDS.some(kw => lower.includes(kw))) return true;

  // 跳过模板噪声
  if (/difier|nodifier|modifier|template/i.test(trimmed)) return true;
  if (/shopping.*receipt|receipt.*template/i.test(lower)) return true;

  // 跳过日期格式
  for (const datePattern of DATE_PATTERNS) {
    if (datePattern.test(trimmed)) return true;
  }

  // 跳过纯数字行
  if (trimmed.match(/^[\d\.\$\-\+\s]+$/)) return true;

  // 跳过单字符
  if (trimmed.length <= 2 && !trimmed.match(/\d/)) return true;

  // 跳过噪声数字
  if (noiseNumberPattern.test(trimmed)) return true;

  return false;
}

/**
 * 尝试解析商品行
 * 返回: { quantity?, name, price? } 或 null
 */
function parseItemLine(line: string): ReceiptItem | null {
  const trimmed = line.trim();
  if (trimmed.length < 2) return null;

  // 跳过非商品行
  if (shouldSkipLine(trimmed)) return null;

  // 跳过金额关键词行
  if (isAmountLine(trimmed)) return null;

  // 格式1: "2x Lorem DSUB" 或 "2 X Lorem DSUB" 或 "2× Lorem DSUB"
  let match = trimmed.match(/^(\d+)\s*[xX×]\s+(.+)$/);
  if (match) {
    return {
      quantity: parseInt(match[1], 10),
      name: match[2].trim(),
    };
  }

  // 格式2: "Lorem DSUB 35.00" - 名称 + 价格
  match = trimmed.match(/^(.+?)\s+(\d+\.?\d{0,2})$/);
  if (match) {
    const potentialName = match[1].trim();
    const potentialPrice = parseFloat(match[2]);

    // 排除明显是关键词的行
    if (!isAmountLine(potentialName) && potentialName.length > 1) {
      return {
        name: potentialName,
        price: potentialPrice,
      };
    }
  }

  // 纯文本（无价格）- 只保留有意义的
  if (!trimmed.match(/^[\d\.\$\-\+\*]+$/) && trimmed.length > 2) {
    return {
      name: trimmed,
    };
  }

  return null;
}

/**
 * 从原始文本中提取日期
 */
export function extractDate(text: string): string | undefined {
  const lowerText = text.toLowerCase();

  for (const pattern of DATE_PATTERNS) {
    const match = lowerText.match(pattern);
    if (match) {
      return match[1];
    }
  }

  return undefined;
}

/**
 * 从原始文本中提取总金额
 */
export function extractAmount(text: string): number | undefined {
  // 优先从 TOTAL 关键词行提取
  const totalMatch = text.match(/(?:total|subtotal|amount|balance)\s*(?:amount)?[:\s]*\$?\s*(\d+\.?\d{0,2})/i);
  if (totalMatch) {
    return parseFloat(totalMatch[1]);
  }

  // 否则使用原来的逻辑，找最大金额
  let maxAmount = 0;

  for (const pattern of AMOUNT_PATTERNS) {
    const matches = text.matchAll(pattern);
    for (const match of matches) {
      // 把逗号替换成点（支持欧洲格式如 1,20）
      const amountStr = match[1].replace(',', '.');
      const amount = parseFloat(amountStr.replace(/[,$]/g, ''));

      // 合理的收据金额范围
      if (amount > 0 && amount < 10000) {
        maxAmount = Math.max(maxAmount, amount);
      }
    }
  }

  return maxAmount > 0 ? maxAmount : undefined;
}

/**
 * 从原始文本中提取供应商名称
 */
export function extractVendor(text: string): string | undefined {
  const lines = text.split('\n').map(l => l.trim()).filter(l => l.length > 0);

  // 跳过第一行如果是 RECEIPT
  let startIndex = 0;
  if (lines.length > 0 && lines[0].toLowerCase() === 'receipt') {
    startIndex = 1;
  }

  // 排除模板文字噪声
  const noisePatterns = [
    /difier/, /nodifier/, /modifier/, /template/i,
    /shopping.*receipt/i, /receipt.*template/i,
    /thank you/i, /welcome/i
  ];

  // 优先检查已知关键词
  for (const keyword of VENDOR_KEYWORDS) {
    for (let i = startIndex; i < lines.length; i++) {
      if (lines[i].toLowerCase().includes(keyword)) {
        return lines[i];
      }
    }
  }

  // 如果没有已知关键词，取第一行有意义的文本（排除日期和价格）
  for (let i = startIndex; i < lines.length; i++) {
    const line = lines[i];
    // 排除纯数字、价格格式、噪声模式
    if (line.match(/^[\d\.\$\-\s]+$/)) continue;
    if (line.match(/^\d+\.\d{2}$/)) continue;  // 排除 "35.00" 这样的价格
    if (noisePatterns.some(p => p.test(line))) continue;
    if (line.length > 2) {
      return line;
    }
  }

  return undefined;
}

/**
 * 从原始文本中提取商品项目
 * 使用智能解析来处理 OCR 噪声
 */
export function extractItems(text: string): ReceiptItem[] {
  const items: ReceiptItem[] = [];
  const rawLines = text.split('\n');

  // 提取商家名和日期用于过滤
  const vendor = extractVendor(text);
  const date = extractDate(text);

  // 存储所有解析到的商品和价格
  const parsedItems: { item: ReceiptItem; lineIndex: number }[] = [];

  // 第一遍: 解析所有可能的商品行
  for (let i = 0; i < rawLines.length; i++) {
    const line = rawLines[i];

    // 跳过商家名和日期行
    if (vendor && line.trim() === vendor) continue;
    if (date && line.trim() === date) continue;

    const item = parseItemLine(line);
    if (item) {
      parsedItems.push({ item, lineIndex: i });
    }
  }

  // 第二遍: 尝试关联价格到商品
  // OCR 中价格可能在商品名称的上一行或下一行
  for (let i = 0; i < parsedItems.length; i++) {
    const { item, lineIndex } = parsedItems[i];

    // 如果商品没有价格，尝试从相邻行获取
    if (!item.price) {
      // 检查上一行是否是价格
      if (lineIndex > 0) {
        const prevLine = rawLines[lineIndex - 1].trim();
        const priceMatch = prevLine.match(/^\$?\s*(\d+\.?\d{0,2})$/);
        if (priceMatch) {
          item.price = parseFloat(priceMatch[1]);
        }
      }
      // 检查下一行是否是价格
      if (!item.price && lineIndex < rawLines.length - 1) {
        const nextLine = rawLines[lineIndex + 1].trim();
        const priceMatch = nextLine.match(/^\$?\s*(\d+\.?\d{0,2})$/);
        if (priceMatch) {
          item.price = parseFloat(priceMatch[1]);
        }
      }
    }

    items.push(item);
  }

  return items;
}

/**
 * 识别收据是否包含可抵税项目
 */
export function identifyDeductibleItems(items: ReceiptItem[]): ReceiptItem[] {
  return items.filter(item => {
    const itemName = item.name.toLowerCase();
    return DEDUCTIBLE_KEYWORDS.some(keyword =>
      itemName.includes(keyword.toLowerCase())
    );
  });
}

/**
 * 从原始文本解析成 key-value 行（每行一个）
 * 使用智能正则解析，能更好地处理 OCR 噪声
 */
export function parseTextToLines(text: string): ReceiptLine[] {
  const lines: ReceiptLine[] = [];
  const rawLines = text.split('\n');

  for (const line of rawLines) {
    const trimmed = line.trim();
    const lower = trimmed.toLowerCase();
    if (trimmed.length < 1) continue;

    // 跳过无意义的 OCR 噪声
    if (NOISE_KEYWORDS.some(kw => lower.includes(kw))) continue;

    // 跳过模板噪声
    if (/difier|nodifier|modifier|template/i.test(trimmed)) continue;
    if (/shopping.*receipt|receipt.*template/i.test(lower)) continue;

    // 跳过纯单字符行（通常是 OCR 错误），但保留数字
    if (trimmed.length <= 2 && !trimmed.match(/\d/)) continue;

    // 跳过明显的 OCR 噪声数字行
    if (noiseNumberPattern.test(trimmed)) continue;

    // 格式1: "TOTAL AMOUNT $117.00" 或 "TOTAL: $117.00" - 关键词 + 金额
    const amountLineMatch = trimmed.match(/^(total|subtotal|amount|balance|cash|change|payment|due|tax)\s*(?:amount)?[:\s]*\$?\s*(\d+\.?\d{0,2})$/i);
    if (amountLineMatch) {
      lines.push({
        key: amountLineMatch[1].toUpperCase(),
        value: amountLineMatch[2],
      });
      continue;
    }

    // 格式2: "2x Lorem DSUB" - 数量 + 商品名
    const qtyItemMatch = trimmed.match(/^(\d+)\s*[xX×]\s+(.+)$/);
    if (qtyItemMatch) {
      lines.push({
        key: `${qtyItemMatch[1]}x`,
        value: qtyItemMatch[2].trim(),
      });
      continue;
    }

    // 格式3: "Lorem DSUB 35.00" - 名称 + 价格
    const itemPriceMatch = trimmed.match(/^(.+?)\s+(\d+\.?\d{0,2})$/);
    if (itemPriceMatch) {
      const potentialName = itemPriceMatch[1].trim();
      // 排除金额关键词行
      if (!isAmountLine(potentialName) && potentialName.length > 1) {
        lines.push({
          key: potentialName,
          value: itemPriceMatch[2],
        });
        continue;
      }
    }

    // 格式4: "key: value" 格式
    const kvMatch = trimmed.match(/^([^:]+):\s*(.+)$/);
    if (kvMatch) {
      lines.push({
        key: kvMatch[1].trim(),
        value: kvMatch[2].trim(),
      });
      continue;
    }

    // 格式5: 单独的价格行 "$ 117.00" 或 "$117.00"（非噪声）
    const standalonePrice = trimmed.match(/^\$?\s*(\d+\.?\d{0,2})$/);
    if (standalonePrice) {
      const price = parseFloat(standalonePrice[1]);
      // 只保留有意义的价格（> 1）
      if (price > 1) {
        // 检查上一行是否是关键词
        const lastLine = lines[lines.length - 1];
        if (lastLine && isAmountLine(lastLine.key || '')) {
          // 更新上一行的值
          lastLine.value = standalonePrice[1];
        } else {
          lines.push({
            key: 'Amount',
            value: standalonePrice[1],
          });
        }
      }
      continue;
    }

    // 格式6: 单独日期行
    let dateFound = false;
    for (const datePattern of DATE_PATTERNS) {
      const dateMatch = trimmed.match(datePattern);
      if (dateMatch) {
        lines.push({
          key: 'Date',
          value: dateMatch[1] || dateMatch[0],
        });
        dateFound = true;
        break;
      }
    }
    if (!dateFound && trimmed.length > 2) {
      // 其他有意义的文本行
      lines.push({
        key: trimmed,
      });
    }
  }

  return lines;
}

/**
 * 完整的收据识别流程（从纯文本解析）
 */
export function parseReceiptText(rawText: string): ReceiptData {
  // 清理文本 - 不要合并空格，保持换行
  const cleanText = rawText.trim();

  return {
    date: extractDate(cleanText),
    vendor: extractVendor(cleanText),
    amount: extractAmount(cleanText),
    items: extractItems(cleanText),
    rawText: cleanText,
    lines: parseTextToLines(cleanText),
  };
}

/**
 * 从 Textract 结构化数据中提取收据信息
 * 支持新的 parsed 字段（基于 Blocks 坐标解析的结果）
 */
export function parseStructuredReceiptData(
  keyValuePairs: Record<string, string> = {},
  lineItems: Array<{ name?: string; price?: number; quantity?: number }> = [],
  parsed?: {
    vendor?: string | null;
    date?: string | null;
    totalAmount?: number | null;
    subtotalAmount?: number | null;
    taxAmount?: number | null;
    cashAmount?: number | null;
    changeAmount?: number | null;
    phoneNumber?: string | null;
    address?: string | null;
    receiptId?: string | null;
    items?: Array<{ name?: string; price?: number; quantity?: number }>;
    allFields?: Array<{ label: string; value: string }>;
  }
): Partial<ReceiptData> {
  const result: Partial<ReceiptData> = {
    items: [],
  };

  // 优先使用 parsed 数据（基于 Blocks 坐标解析的结果）
  if (parsed) {
    if (parsed.vendor) result.vendor = parsed.vendor;
    if (parsed.date) result.date = parsed.date;
    if (parsed.totalAmount) result.amount = parsed.totalAmount;
    // 如果没有 total 但有 subtotal 和 tax，可以计算
    else if (parsed.subtotalAmount && parsed.taxAmount) {
      result.amount = parsed.subtotalAmount + parsed.taxAmount;
    }
    else if (parsed.subtotalAmount) {
      result.amount = parsed.subtotalAmount;
    }

    // 添加 LLM 返回的额外字段
    if (parsed.subtotalAmount) result.subtotalAmount = parsed.subtotalAmount;
    if (parsed.taxAmount) result.taxAmount = parsed.taxAmount;

    // 添加金额相关信息到 lines
    result.lines = result.lines || [];

    if (parsed.subtotalAmount) {
      result.lines.push({ key: 'SUBTOTAL', value: String(parsed.subtotalAmount) });
    }
    if (parsed.taxAmount) {
      result.lines.push({ key: 'TAX', value: String(parsed.taxAmount) });
    }
    if (parsed.cashAmount) {
      result.lines.push({ key: 'CASH', value: String(parsed.cashAmount) });
    }
    if (parsed.changeAmount) {
      result.lines.push({ key: 'CHANGE', value: String(parsed.changeAmount) });
    }
    if (parsed.phoneNumber) {
      result.lines.push({ key: 'PHONE', value: parsed.phoneNumber });
    }
    if (parsed.address) {
      result.lines.push({ key: 'ADDRESS', value: parsed.address });
    }
    if (parsed.receiptId) {
      result.lines.push({ key: 'RECEIPT ID', value: parsed.receiptId });
    }

    if (parsed.items && parsed.items.length > 0) {
      result.items = parsed.items.map(item => ({
        name: item.name || '',
        price: item.price,
        quantity: item.quantity,
      }));
      // 同时添加到 lines 中供前端显示
      result.items.forEach(item => {
        const lineText = item.quantity ? `${item.quantity}x ${item.name}` : item.name;
        result.lines = result.lines || [];
        result.lines.push({ key: lineText, value: item.price ? String(item.price) : undefined });
      });
    }

    // 添加所有动态字段（从 Expense API 返回的所有原始字段）
    if (parsed.allFields && parsed.allFields.length > 0) {
      for (const field of parsed.allFields) {
        // 过滤掉已经在 lines 中显示的字段
        const isAlreadyShown = result.lines?.some(
          line => line.key?.toUpperCase() === field.label.toUpperCase()
        );
        if (!isAlreadyShown) {
          result.lines = result.lines || [];
          result.lines.push({ key: field.label, value: field.value });
        }
      }
    }

    return result;
  }

  // 后备：使用 keyValuePairs 和 lineItems
  const kvLower: Record<string, string> = {};
  for (const [key, value] of Object.entries(keyValuePairs)) {
    kvLower[key.toLowerCase()] = value;
  }

  // 提取日期
  const dateKeys = ['date', '日期', 'time', '时间', 'datetime'];
  for (const key of dateKeys) {
    if (kvLower[key]) {
      result.date = kvLower[key];
      break;
    }
  }

  // 提取总金额
  const totalKeys = ['total', 'total amount', 'subtotal', 'amount due', 'balance'];
  for (const key of totalKeys) {
    if (kvLower[key]) {
      const amount = parseFloat(kvLower[key].replace(/[$,]/g, ''));
      if (!isNaN(amount)) {
        result.amount = amount;
        break;
      }
    }
  }

  // 提取商家
  const vendorKeys = ['vendor', 'store', 'merchant', 'name', '店名', '商家'];
  for (const key of vendorKeys) {
    if (kvLower[key]) {
      result.vendor = kvLower[key];
      break;
    }
  }

  // 提取支付信息
  const cashKeys = ['cash', 'payment', 'paid', '支付'];
  for (const key of cashKeys) {
    if (kvLower[key]) {
      result.lines = result.lines || [];
      result.lines.push({ key: key.toUpperCase(), value: kvLower[key] });
    }
  }

  // 提取找零
  const changeKeys = ['change', '找零'];
  for (const key of changeKeys) {
    if (kvLower[key]) {
      result.lines = result.lines || [];
      result.lines.push({ key: 'CHANGE', value: kvLower[key] });
    }
  }

  // 提取商品明细
  if (lineItems && lineItems.length > 0) {
    result.items = lineItems
      .filter(item => item.name && item.name.length > 1)
      .map(item => ({
        name: item.name!,
        price: item.price,
        quantity: item.quantity,
      }));
  }

  return result;
}

/**
 * 生成收据摘要
 */
export function generateReceiptSummary(data: ReceiptData): string {
  const parts: string[] = [];

  if (data.vendor) parts.push(`📍 ${data.vendor}`);
  if (data.date) parts.push(`📅 ${data.date}`);
  if (data.amount) parts.push(`💵 $${data.amount.toFixed(2)}`);

  const deductible = identifyDeductibleItems(data.items || []);
  if (deductible.length > 0) {
    parts.push(`✅ ${deductible.length} 个可抵税项目`);
  }

  return parts.join('\n');
}
