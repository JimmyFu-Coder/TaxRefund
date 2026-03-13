import AsyncStorage from '@react-native-async-storage/async-storage';
import { ReceiptData } from './receipt-ocr';

const STORAGE_KEY = 'receipt_scans';
const memoryFallbackStorage = new Map<string, string>();
let loggedFallbackWarning = false;

function shouldUseFallback(error: unknown): boolean {
  if (!error) return false;
  const message = error instanceof Error ? error.message : String(error);
  return message.includes('Native module is null') || message.includes('legacy storage');
}

function logFallbackOnce(error: unknown) {
  if (loggedFallbackWarning) return;
  loggedFallbackWarning = true;
  console.warn('AsyncStorage native module unavailable. Falling back to in-memory storage for this session.', error);
}

async function getStorageItem(key: string): Promise<string | null> {
  try {
    return await AsyncStorage.getItem(key);
  } catch (error) {
    if (shouldUseFallback(error)) {
      logFallbackOnce(error);
      return memoryFallbackStorage.get(key) ?? null;
    }
    throw error;
  }
}

async function setStorageItem(key: string, value: string): Promise<void> {
  try {
    await AsyncStorage.setItem(key, value);
  } catch (error) {
    if (shouldUseFallback(error)) {
      logFallbackOnce(error);
      memoryFallbackStorage.set(key, value);
      return;
    }
    throw error;
  }
}

async function removeStorageItem(key: string): Promise<void> {
  try {
    await AsyncStorage.removeItem(key);
  } catch (error) {
    if (shouldUseFallback(error)) {
      logFallbackOnce(error);
      memoryFallbackStorage.delete(key);
      return;
    }
    throw error;
  }
}

export interface StoredReceipt extends ReceiptData {
  id: string;
  timestamp: number;
}

/**
 * Save receipt to local storage.
 */
export async function saveReceipt(data: ReceiptData): Promise<StoredReceipt> {
  try {
    const storedReceipt: StoredReceipt = {
      ...data,
      id: Date.now().toString(),
      timestamp: Date.now(),
    };

    const existing = await getReceipts();
    const updated = [storedReceipt, ...existing];

    await setStorageItem(STORAGE_KEY, JSON.stringify(updated));

    return storedReceipt;
  } catch (error) {
    console.error('Failed to save receipt:', error);
    throw error;
  }
}

/**
 * Get all receipts.
 */
export async function getReceipts(): Promise<StoredReceipt[]> {
  try {
    const data = await getStorageItem(STORAGE_KEY);
    return data ? JSON.parse(data) : [];
  } catch (error) {
    console.error('Failed to fetch receipts:', error);
    return [];
  }
}

/**
 * Get one receipt by id.
 */
export async function getReceiptById(id: string): Promise<StoredReceipt | null> {
  try {
    const receipts = await getReceipts();
    return receipts.find((r) => r.id === id) || null;
  } catch (error) {
    console.error('Failed to fetch receipt:', error);
    return null;
  }
}

/**
 * Delete one receipt by id.
 */
export async function deleteReceipt(id: string): Promise<void> {
  try {
    const receipts = await getReceipts();
    const filtered = receipts.filter((r) => r.id !== id);
    await setStorageItem(STORAGE_KEY, JSON.stringify(filtered));
  } catch (error) {
    console.error('Failed to delete receipt:', error);
    throw error;
  }
}

/**
 * Calculate total amount from stored item prices.
 */
export async function calculateTotalDeductible(): Promise<number> {
  try {
    const receipts = await getReceipts();
    let total = 0;

    for (const receipt of receipts) {
      if (receipt.items) {
        for (const item of receipt.items) {
          if (item.price) {
            total += item.price;
          }
        }
      }
    }

    return total;
  } catch (error) {
    console.error('Failed to calculate total deductible amount:', error);
    return 0;
  }
}

/**
 * Get receipts in a date range.
 */
export async function getReceiptsByDateRange(
  startDate: Date,
  endDate: Date
): Promise<StoredReceipt[]> {
  try {
    const receipts = await getReceipts();
    const startTime = startDate.getTime();
    const endTime = endDate.getTime();

    return receipts.filter((r) => r.timestamp >= startTime && r.timestamp <= endTime);
  } catch (error) {
    console.error('Failed to filter receipts by date range:', error);
    return [];
  }
}

/**
 * Export receipts as JSON string.
 */
export async function exportReceipts(): Promise<string> {
  try {
    const receipts = await getReceipts();
    return JSON.stringify(receipts, null, 2);
  } catch (error) {
    console.error('Failed to export receipts:', error);
    throw error;
  }
}

/**
 * Clear all receipts from storage.
 */
export async function clearAllReceipts(): Promise<void> {
  try {
    await removeStorageItem(STORAGE_KEY);
  } catch (error) {
    console.error('Failed to clear receipts:', error);
    throw error;
  }
}
