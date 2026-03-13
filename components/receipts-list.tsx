import React, { useEffect, useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  Pressable,
  FlatList,
  RefreshControl,
} from 'react-native';
import { Image } from 'expo-image';
import { getReceipts, StoredReceipt } from '@/services/receipt-storage';
import { identifyDeductibleItems } from '@/services/receipt-ocr';

export function ReceiptsList() {
  const [receipts, setReceipts] = useState<StoredReceipt[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedReceipt, setSelectedReceipt] = useState<StoredReceipt | null>(null);

  useEffect(() => {
    loadReceipts();
  }, []);

  const loadReceipts = async () => {
    try {
      const data = await getReceipts();
      setReceipts(data);
    } catch (error) {
      console.error('加载收据失败:', error);
    }
  };

  const onRefresh = async () => {
    setRefreshing(true);
    await loadReceipts();
    setRefreshing(false);
  };

  const formatDate = (timestamp: number) => {
    const date = new Date(timestamp);
    return date.toLocaleDateString('zh-CN', {
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
    });
  };

  const calculateTotalAmount = () => {
    return receipts.reduce((sum, receipt) => sum + (receipt.amount || 0), 0);
  };

  const calculateDeductibleAmount = () => {
    let total = 0;
    for (const receipt of receipts) {
      const deductible = identifyDeductibleItems(receipt.items || []);
      total += deductible.reduce((sum, item) => sum + (item.price || 0), 0);
    }
    return total;
  };

  if (receipts.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyIcon}>📭</Text>
        <Text style={styles.emptyTitle}>还没有收据</Text>
        <Text style={styles.emptySubtitle}>开始扫描您的第一张收据吧</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* 统计卡片 */}
      <View style={styles.statsContainer}>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>总收据数</Text>
          <Text style={styles.statValue}>{receipts.length}</Text>
        </View>
        <View style={styles.statCard}>
          <Text style={styles.statLabel}>总金额</Text>
          <Text style={styles.statValue}>${calculateTotalAmount().toFixed(2)}</Text>
        </View>
                <View style={styles.statCard}>
                  <Text style={styles.statLabel}>可抵税</Text>
                  <Text style={[styles.statValue, { color: '#16a34a' }]}>
                    ${calculateDeductibleAmount().toFixed(2)}
                  </Text>
                </View>
      </View>

      {/* 收据列表 */}
      <FlatList
        data={receipts}
        keyExtractor={(item) => item.id}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
        renderItem={({ item }) => (
          <Pressable
            style={({ pressed }) => [
              styles.receiptItem,
              pressed && styles.receiptItemPressed,
            ]}
            onPress={() => setSelectedReceipt(item)}
          >
            <View style={styles.receiptContent}>
              <Text style={styles.receiptVendor} numberOfLines={1}>
                {item.vendor || '未知商家'}
              </Text>
              <View style={styles.receiptMeta}>
                <Text style={styles.receiptDate}>
                  📅 {item.date || formatDate(item.timestamp)}
                </Text>
                {identifyDeductibleItems(item.items || []).length > 0 && (
                  <Text style={styles.deductibleBadge}>✅ 可抵税</Text>
                )}
              </View>
            </View>
            <View style={styles.receiptAmount}>
              <Text style={styles.amount}>${item.amount?.toFixed(2) || '0.00'}</Text>
            </View>
          </Pressable>
        )}
      />

      {/* 详情模态 */}
      {selectedReceipt && (
        <View style={styles.modal}>
          <Pressable
            style={styles.modalBackground}
            onPress={() => setSelectedReceipt(null)}
          />
          <View style={styles.modalContent}>
            <View style={styles.modalHeader}>
              <Text style={styles.modalTitle}>{selectedReceipt.vendor || '收据详情'}</Text>
              <Pressable onPress={() => setSelectedReceipt(null)}>
                <Text style={styles.modalClose}>✕</Text>
              </Pressable>
            </View>

            <ScrollView style={styles.modalBody}>
              {/* 照片显示 */}
              {selectedReceipt.photoUri ? (
                <View style={styles.imageContainer}>
                  <Image
                    source={{ uri: selectedReceipt.photoUri }}
                    style={styles.receiptImage}
                    contentFit="contain"
                    transition={200}
                  />
                  <Text style={styles.debugText}>📷 {selectedReceipt.photoUri}</Text>
                </View>
              ) : (
                <Text style={styles.noPhotoText}>无照片</Text>
              )}

              {selectedReceipt.date && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>日期:</Text>
                  <Text style={styles.detailValue}>{selectedReceipt.date}</Text>
                </View>
              )}
              {selectedReceipt.amount && (
                <View style={styles.detailRow}>
                  <Text style={styles.detailLabel}>金额:</Text>
                  <Text style={styles.detailValue}>
                    ${selectedReceipt.amount.toFixed(2)}
                  </Text>
                </View>
              )}
            </ScrollView>
          </View>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
    paddingBottom: 60,
  },
  statsContainer: {
    flexDirection: 'row',
    paddingHorizontal: 16,
    paddingVertical: 16,
    gap: 12,
  },
  statCard: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 12,
    paddingVertical: 12,
    paddingHorizontal: 8,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  statLabel: {
    fontSize: 12,
    color: '#6b7280',
    marginBottom: 4,
  },
  statValue: {
    fontSize: 18,
    fontWeight: '700',
    color: '#15803d',
  },
  receiptItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginHorizontal: 16,
    marginVertical: 6,
    backgroundColor: '#fff',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  receiptItemPressed: {
    backgroundColor: '#f9fafb',
  },
  receiptContent: {
    flex: 1,
  },
  receiptVendor: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 4,
  },
  receiptMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  receiptDate: {
    fontSize: 12,
    color: '#6b7280',
  },
  deductibleBadge: {
    fontSize: 11,
    color: '#16a34a',
    fontWeight: '600',
    backgroundColor: '#f0fdf4',
    paddingHorizontal: 6,
    paddingVertical: 2,
    borderRadius: 4,
  },
  receiptAmount: {
    marginLeft: 12,
  },
  amount: {
    fontSize: 16,
    fontWeight: '700',
    color: '#16a34a',
  },
  emptyContainer: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f0fdf4',
  },
  emptyIcon: {
    fontSize: 64,
    marginBottom: 16,
  },
  emptyTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 14,
    color: '#6b7280',
  },
  modal: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    justifyContent: 'flex-end',
  },
  modalBackground: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  modalContent: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    paddingHorizontal: 20,
    maxHeight: '80%',
  },
  modalHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#1f2937',
  },
  modalClose: {
    fontSize: 24,
    color: '#6b7280',
  },
  modalBody: {
    paddingVertical: 16,
  },
  detailRow: {
    marginBottom: 16,
  },
  detailLabel: {
    fontSize: 13,
    fontWeight: '600',
    color: '#6b7280',
    marginBottom: 4,
  },
  detailValue: {
    fontSize: 14,
    color: '#1f2937',
    fontWeight: '500',
  },
  itemsList: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  itemText: {
    fontSize: 13,
    color: '#4b5563',
    marginVertical: 4,
  },
  imageContainer: {
    marginBottom: 16,
    borderRadius: 12,
    overflow: 'hidden',
    backgroundColor: '#f3f4f6',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  receiptImage: {
    width: '100%',
    height: 300,
  },
  debugText: {
    fontSize: 10,
    color: '#9ca3af',
    marginTop: 8,
    textAlign: 'center',
  },
  noPhotoText: {
    fontSize: 14,
    color: '#9ca3af',
    textAlign: 'center',
    paddingVertical: 20,
  },
});

