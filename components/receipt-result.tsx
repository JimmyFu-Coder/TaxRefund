import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Pressable,
  TextInput,
  Keyboard,
} from 'react-native';
import Animated, { FadeIn, SlideInUp } from 'react-native-reanimated';
import { ReceiptData } from '@/services/receipt-ocr';
import { saveReceipt } from '@/services/receipt-storage';

interface ReceiptResultProps {
  data: ReceiptData;
  onSave: (data: ReceiptData) => void;
  onCancel: () => void;
}

export function ReceiptResult({ data, onSave, onCancel }: ReceiptResultProps) {
  const [vendor, setVendor] = useState(data.vendor || '');
  const [date, setDate] = useState(data.date || '');
  const [amount, setAmount] = useState(data.amount?.toString() || '');
  const [subtotal, setSubtotal] = useState(data.subtotalAmount?.toString() || '');
  const [tax, setTax] = useState(data.taxAmount?.toString() || '');

  const handleSave = async () => {
    try {
      const updatedData = {
        ...data,
        vendor: vendor || undefined,
        date: date || undefined,
        amount: amount ? parseFloat(amount) : undefined,
        subtotalAmount: subtotal ? parseFloat(subtotal) : undefined,
        taxAmount: tax ? parseFloat(tax) : undefined,
      };
      await saveReceipt(updatedData);
      onSave(updatedData);
    } catch (error) {
      console.error('Save failed:', error);
    }
  };

  // 关闭键盘
  const dismissKeyboard = () => {
    Keyboard.dismiss();
  };

  return (
    <Pressable style={styles.container} onPress={dismissKeyboard}>
      {/* Background */}
      <Animated.View entering={FadeIn} style={styles.background} />

      {/* Content card - stopPropagation 防止点击卡片时关闭键盘 */}
      <Pressable onPress={(e) => e.stopPropagation()}>
        <Animated.View
          entering={SlideInUp.springify()}
          style={styles.card}
        >
          {/* 可编辑的核心字段 */}
          <View style={styles.editSection}>
            <Text style={styles.sectionTitle}>📝 确认收据信息</Text>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>商家名称</Text>
              <TextInput
                style={styles.input}
                value={vendor}
                onChangeText={setVendor}
                placeholder="点击输入商家名称"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                onSubmitEditing={dismissKeyboard}
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>日期</Text>
              <TextInput
                style={styles.input}
                value={date}
                onChangeText={setDate}
                placeholder="点击输入日期"
                placeholderTextColor="#9ca3af"
                returnKeyType="done"
                onSubmitEditing={dismissKeyboard}
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>金额</Text>
              <TextInput
                style={styles.input}
                value={amount}
                onChangeText={setAmount}
                placeholder="点击输入金额"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={dismissKeyboard}
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>小计</Text>
              <TextInput
                style={styles.input}
                value={subtotal}
                onChangeText={setSubtotal}
                placeholder="点击输入小计"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={dismissKeyboard}
              />
            </View>

            <View style={styles.inputRow}>
              <Text style={styles.inputLabel}>税额</Text>
              <TextInput
                style={styles.input}
                value={tax}
                onChangeText={setTax}
                placeholder="点击输入税额"
                placeholderTextColor="#9ca3af"
                keyboardType="decimal-pad"
                returnKeyType="done"
                onSubmitEditing={dismissKeyboard}
              />
            </View>
          </View>

          {/* 按钮 */}
          <View style={styles.buttonContainer}>
            <Pressable
            style={({pressed}) => [{
              opacity: pressed ? 0.7 : 1,
            }, styles.cancelBtn]}
            onPress={onCancel}
          >
            <Text style={styles.cancelBtnText}>不保存</Text>
          </Pressable>

          <Pressable
            style={({pressed}) => [{
              opacity: pressed ? 0.85 : 1,
              transform: [{scale: pressed ? 0.97 : 1}],
            }, styles.saveBtn]}
            onPress={handleSave}
          >
            <Text style={styles.saveBtnText}>💾 保存收据</Text>
          </Pressable>
        </View>
        </Animated.View>
      </Pressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  background: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.5)',
  },
  card: {
    backgroundColor: '#fff',
    borderTopLeftRadius: 24,
    borderTopRightRadius: 24,
    maxHeight: '85%',
    paddingHorizontal: 16,
    paddingTop: 20,
    paddingBottom: 24,
  },
  editSection: {
    backgroundColor: '#f0f9ff',
    borderRadius: 12,
    padding: 16,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: '#bae6fd',
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  inputLabel: {
    fontSize: 14,
    fontWeight: '600',
    color: '#1e40af',
    width: 70,
  },
  input: {
    flex: 1,
    backgroundColor: '#fff',
    borderRadius: 8,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 15,
    color: '#1f2937',
    borderWidth: 1,
    borderColor: '#e5e7eb',
  },
  summary: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: '#16a34a',
  },
  summaryText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#15803d',
    lineHeight: 24,
  },
  detailsContainer: {
    maxHeight: 300,
    marginBottom: 16,
  },
  section: {
    marginBottom: 16,
    paddingBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#1f2937',
    marginBottom: 8,
  },
  sectionContent: {
    fontSize: 13,
    color: '#4b5563',
    lineHeight: 20,
  },
  rawText: {
    fontSize: 12,
    color: '#1f2937',
    lineHeight: 20,
    fontFamily: 'monospace',
    backgroundColor: '#f3f4f6',
    padding: 12,
    borderRadius: 8,
  },
  lineRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 8,
    paddingHorizontal: 12,
    backgroundColor: '#f9fafb',
    borderRadius: 6,
    marginBottom: 6,
  },
  lineKey: {
    fontSize: 13,
    color: '#1f2937',
    fontWeight: '500',
    flex: 1,
  },
  lineValue: {
    fontSize: 13,
    color: '#16a34a',
    fontWeight: '600',
    marginLeft: 8,
  },
  amountText: {
    fontSize: 28,
    fontWeight: '900',
    color: '#16a34a',
    marginTop: 4,
  },
  itemsList: {
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    padding: 12,
  },
  itemRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
    marginBottom: 4,
    borderRadius: 6,
  },
  itemRowDeductible: {
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
    borderLeftWidth: 3,
    borderLeftColor: '#16a34a',
  },
  itemInfo: {
    flex: 1,
    marginRight: 8,
  },
  itemName: {
    fontSize: 12,
    color: '#4b5563',
    fontWeight: '500',
  },
  itemNameDeductible: {
    color: '#16a34a',
    fontWeight: '600',
  },
  itemPrice: {
    fontSize: 12,
    fontWeight: '600',
    color: '#1f2937',
  },
  itemPriceDeductible: {
    color: '#16a34a',
  },
  deductibleSection: {
    backgroundColor: '#f0fdf4',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 12,
    marginTop: 12,
    borderWidth: 1,
    borderColor: '#86efac',
  },
  deductibleTitle: {
    fontSize: 14,
    fontWeight: '700',
    color: '#15803d',
    marginBottom: 4,
  },
  deductibleSubtitle: {
    fontSize: 12,
    color: '#65a30d',
    fontWeight: '500',
  },
  buttonContainer: {
    flexDirection: 'row',
    gap: 12,
    marginTop: 16,
  },
  cancelBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#e5e7eb',
    alignItems: 'center',
  },
  cancelBtnText: {
    fontSize: 14,
    fontWeight: '600',
    color: '#6b7280',
  },
  saveBtn: {
    flex: 1,
    paddingVertical: 12,
    borderRadius: 12,
    backgroundColor: '#16a34a',
    alignItems: 'center',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.2,
    shadowRadius: 8,
    elevation: 4,
  },
  saveBtnText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
});
