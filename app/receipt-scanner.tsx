import React, { useState } from 'react';
import { View, StyleSheet, Alert } from 'react-native';
import { ReceiptCamera } from '@/components/receipt-camera';
import { ReceiptResult } from '@/components/receipt-result';
import { ReceiptData } from '@/services/receipt-ocr';

type ScreenState = 'idle' | 'scanning' | 'result';

export default function ReceiptScannerScreen() {
  const [screenState, setScreenState] = useState<ScreenState>('scanning');
  const [currentReceipt, setCurrentReceipt] = useState<ReceiptData | null>(null);

  const handleReceiptScanned = (data: ReceiptData) => {
    setCurrentReceipt(data);
    setScreenState('result');
  };

  const handleSaveReceipt = (data: ReceiptData) => {
    // 这里应该保存到数据库或本地存储
    Alert.alert('成功', '收据已保存！', [
      {
        text: '继续扫描',
        onPress: () => {
          setCurrentReceipt(null);
          setScreenState('scanning');
        },
      },
      {
        text: '返回',
        onPress: () => setScreenState('idle'),
      },
    ]);
  };

  const handleCancel = () => {
    setCurrentReceipt(null);
    setScreenState('idle');
  };

  return (
    <View style={styles.container}>
      {screenState === 'scanning' && (
        <ReceiptCamera
          onReceiptScanned={handleReceiptScanned}
          onCancel={handleCancel}
        />
      )}

      {screenState === 'result' && currentReceipt && (
        <ReceiptResult
          data={currentReceipt}
          onSave={handleSaveReceipt}
          onCancel={() => {
            setCurrentReceipt(null);
            setScreenState('scanning');
          }}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
});

