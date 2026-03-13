import { OCRResult, OCRProgress } from './receipt-ocr';

const AWS_LAMBDA_API_URL = process.env.EXPO_PUBLIC_OCR_API_URL;

/**
 * 使用 AWS Textract 进行 OCR 识别
 * @param imagePath - 图片路径 (URI)
 * @param onProgress - 进度回调
 * @returns 识别结果
 */
export async function recognizeText(
  imagePath: string,
  onProgress?: (progress: OCRProgress) => void
): Promise<OCRResult> {
  try {
    if (!AWS_LAMBDA_API_URL) {
      throw new Error('Missing EXPO_PUBLIC_OCR_API_URL');
    }

    if (onProgress) {
      onProgress({ status: 'downloading', progress: 10 });
    }

    // 获取图片并转为 base64
    const response = await fetch(imagePath);
    const blob = await response.blob();
    const base64 = await blobToBase64(blob);

    console.log('📷 Image info:', {
      size: blob.size,
      type: blob.type,
      base64Length: base64.length,
      firstChars: base64.substring(0, 50)
    });

    if (onProgress) {
      onProgress({ status: 'recognizing', progress: 30 });
    }

    // 调用 AWS Lambda API
    const apiResponse = await fetch(AWS_LAMBDA_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ imageBase64: base64 }),
    });

    if (!apiResponse.ok) {
      throw new Error(`API request failed: ${apiResponse.status}`);
    }

    const result = await apiResponse.json();

    console.log('🔍 API Response:', JSON.stringify(result, null, 2));

    if (onProgress) {
      onProgress({ status: 'completed', progress: 100 });
    }

    // 返回完整的结构化数据
    return {
      text: result.text || '',
      confidence: result.confidence || 0,
      keyValuePairs: result.keyValuePairs || {},
      lineItems: result.lineItems || [],
      parsed: result.parsed || null,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`OCR识别失败: ${message}`);
  }
}

// 将 blob 转为 base64
function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onloadend = () => {
      const base64 = (reader.result as string).split(',')[1];
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
}
