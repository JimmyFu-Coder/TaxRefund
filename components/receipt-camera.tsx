import React, { useEffect, useState, useRef } from 'react';
import {
  View,
  Text,
  Pressable,
  StyleSheet,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { CameraView, useCameraPermissions } from 'expo-camera';
import * as MediaLibrary from 'expo-media-library';
import Animated, { FadeIn } from 'react-native-reanimated';
import { parseReceiptText, parseStructuredReceiptData, ReceiptData } from '@/services/receipt-ocr';
import { recognizeText } from '@/services/tesseract-ocr';

interface ReceiptCameraProps {
  onReceiptScanned: (data: ReceiptData) => void;
  onCancel: () => void;
}

export function ReceiptCamera({ onReceiptScanned, onCancel }: ReceiptCameraProps) {
  const [permission, requestPermission] = useCameraPermissions();
  const [mediaPermission, requestMediaPermission] = MediaLibrary.usePermissions();
  const [isLoading, setIsLoading] = useState(false);
  const [ocrProgress, setOcrProgress] = useState(0);
  const cameraRef = useRef<CameraView>(null);
  const [facing] = useState<'front' | 'back'>('back');

  useEffect(() => {
    if (!permission?.granted) {
      requestPermission();
    }
  }, [permission, requestPermission]);

  // Request media library permission on mount
  useEffect(() => {
    if (!mediaPermission?.granted) {
      requestMediaPermission();
    }
  }, [mediaPermission, requestMediaPermission]);

  const handleTakePicture = async () => {
    if (!cameraRef.current) return;

    setIsLoading(true);
    setOcrProgress(0);
    try {
      // Capture photo from camera
      const photo = await cameraRef.current.takePictureAsync({
        quality: 0.8,
        base64: false,
      });

      if (!photo?.uri) {
        Alert.alert('Capture Failed', 'No image was captured. Please try again.');
        setIsLoading(false);
        return;
      }

      console.log('📷 Original Photo URI:', photo.uri);

      // 保存原始的文件 URI（ph:// 协议无法在 UI 中显示）
      const originalPhotoUri = photo.uri;

      // Save photo to device gallery (后台保存，不影响显示)
      try {
        if (!mediaPermission?.granted) {
          const { granted } = await requestMediaPermission();
          if (!granted) {
            console.log('Media library permission not granted');
          }
        }

        if (mediaPermission?.granted) {
          const asset = await MediaLibrary.createAssetAsync(photo.uri);
          console.log('📷 Saved to gallery:', asset.uri);
          // 不更新 photoUri，继续使用原始文件 URI
        }
      } catch (mediaError) {
        console.log('Failed to save to gallery:', mediaError);
      }

      // Use Tesseract.js for real OCR recognition
      const ocrResult = await recognizeText(photo.uri, (progress) => {
        setOcrProgress(Math.round(progress.progress * 100));
      });

      console.log('🔍 OCR Result:', JSON.stringify(ocrResult, null, 2));

      // 检查 LLM 是否被使用
      console.log('🔍 LLM Used:', ocrResult.llmUsed);
      console.log('🔍 Confidence:', ocrResult.confidence);

      // 检查是否有至少一个核心字段（商家、日期、总金额）
      const hasAtLeastOneField = ocrResult?.parsed?.vendor ||
                                ocrResult?.parsed?.date ||
                                ocrResult?.parsed?.totalAmount;

      // 即使没有核心字段，只要有文本（LLM 可能已处理），就继续
      const hasText = ocrResult?.text?.trim();

      if (!hasAtLeastOneField && !hasText) {
        Alert.alert(
          '识别失败',
          '无法识别收据信息，请确保：\n• 收据清晰完整\n• 包含商家名称、日期和金额\n\n请重新拍摄',
          [{ text: '重新扫描', onPress: () => { setIsLoading(false); } }]
        );
        return;
      }

      // 有文本或核心字段，继续处理
      if (ocrResult && hasAtLeastOneField) {
        let receiptData: ReceiptData;

        // 优先使用 parsed 数据（基于 Blocks 坐标解析）
        if (ocrResult.parsed && (ocrResult.parsed.vendor || ocrResult.parsed.date || ocrResult.parsed.totalAmount)) {
          console.log('🔍 Using Blocks-based parsed data');
          const structuredData = parseStructuredReceiptData(
            ocrResult.keyValuePairs || {},
            ocrResult.lineItems || [],
            ocrResult.parsed
          );
          receiptData = {
            ...structuredData,
            rawText: ocrResult.text,
            lines: structuredData.lines || [],
            photoUri: originalPhotoUri,
          } as ReceiptData;
        }
        // 后备：使用 keyValuePairs
        else if (ocrResult.keyValuePairs && Object.keys(ocrResult.keyValuePairs).length > 0) {
          console.log('🔍 Using keyValuePairs from Textract');
          const structuredData = parseStructuredReceiptData(
            ocrResult.keyValuePairs,
            ocrResult.lineItems || []
          );
          receiptData = {
            ...structuredData,
            rawText: ocrResult.text,
            lines: structuredData.lines || [],
            photoUri: originalPhotoUri,
          } as ReceiptData;
        } else {
          // 最后后备：使用正则解析纯文本
          console.log('🔍 Using text-based parsing');
          receiptData = parseReceiptText(ocrResult.text);
          receiptData.photoUri = originalPhotoUri;
        }

        console.log('📋 Parsed Receipt Data:', JSON.stringify(receiptData, null, 2));
        onReceiptScanned(receiptData);
      } else {
        Alert.alert('Recognition Failed', 'No text detected. Please try again.');
      }
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error('OCR Error:', message);
      Alert.alert('Error', `Operation failed: ${message}`);
    } finally {
      setIsLoading(false);
      setOcrProgress(0);
    }
  };

  if (permission === null) {
    return (
      <View style={styles.container}>
        <Text>Requesting camera permission...</Text>
      </View>
    );
  }

  if (!permission?.granted) {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Camera permission is required to scan receipts</Text>
        <Pressable style={styles.button} onPress={onCancel}>
          <Text style={styles.buttonText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <CameraView
        ref={cameraRef}
        style={styles.camera}
        facing={facing}
      >
        {/* Camera viewfinder decoration */}
        <View style={styles.viewfinder}>
          <View style={styles.corner} />
          <View style={[styles.corner, styles.cornerTopRight]} />
          <View style={[styles.corner, styles.cornerBottomLeft]} />
          <View style={[styles.corner, styles.cornerBottomRight]} />
        </View>

        {/* Hint text */}
        <View style={styles.hint}>
          <Text style={styles.hintText}>📸 Align receipt for scanning</Text>
        </View>
      </CameraView>

      {/* Bottom controls */}
      <View style={styles.controls}>
        <Pressable
          style={({pressed}) => [{
            opacity: pressed ? 0.7 : 1,
          }, styles.cancelButton]}
          onPress={onCancel}
        >
          <Text style={styles.cancelButtonText}>Cancel</Text>
        </Pressable>

        <Pressable
          style={({pressed}) => [{
            opacity: pressed ? 0.7 : 1,
            transform: [{scale: pressed ? 0.95 : 1}],
          }, styles.captureButton]}
          onPress={handleTakePicture}
          disabled={isLoading}
        >
          {isLoading ? (
            <ActivityIndicator color="#fff" size="large" />
          ) : (
            <Text style={styles.captureButtonText}>📷</Text>
          )}
        </Pressable>

        <Pressable
          style={({pressed}) => [{
            opacity: pressed ? 0.7 : 1,
          }, styles.cancelButton]}
          disabled
        >
          <Text style={styles.cancelButtonText}>Gallery</Text>
        </Pressable>
      </View>

      {isLoading && (
        <Animated.View entering={FadeIn} style={styles.loadingOverlay}>
          <View style={styles.loadingContent}>
            <ActivityIndicator color="#16a34a" size="large" />
            <Text style={styles.loadingText}>Processing...</Text>
            <Text style={styles.progressText}>{ocrProgress}%</Text>
          </View>
        </Animated.View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#000',
  },
  camera: {
    flex: 1,
    justifyContent: 'space-between',
  },
  viewfinder: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  corner: {
    position: 'absolute',
    width: 50,
    height: 50,
    borderWidth: 3,
    borderColor: '#16a34a',
    borderRightWidth: 0,
    borderBottomWidth: 0,
    top: '35%',
    left: '15%',
  },
  cornerTopRight: {
    borderRightWidth: 3,
    borderLeftWidth: 0,
    left: 'auto',
    right: '15%',
  },
  cornerBottomLeft: {
    borderBottomWidth: 3,
    borderTopWidth: 0,
    top: 'auto',
    bottom: '35%',
  },
  cornerBottomRight: {
    borderRightWidth: 3,
    borderBottomWidth: 3,
    borderLeftWidth: 0,
    borderTopWidth: 0,
    top: 'auto',
    left: 'auto',
    right: '15%',
    bottom: '35%',
  },
  hint: {
    position: 'absolute',
    top: 60,
    width: '100%',
    alignItems: 'center',
  },
  hintText: {
    color: '#fff',
    fontSize: 16,
    fontWeight: '600',
    textShadowColor: '#000',
    textShadowOffset: { width: 0, height: 2 },
    textShadowRadius: 4,
  },
  controls: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    alignItems: 'center',
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    paddingVertical: 20,
    paddingBottom: 30,
  },
  captureButton: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: '#16a34a',
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 4,
    borderColor: '#fff',
  },
  captureButtonText: {
    fontSize: 32,
  },
  cancelButton: {
    paddingHorizontal: 16,
    paddingVertical: 10,
    borderRadius: 8,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  cancelButtonText: {
    color: '#fff',
    fontSize: 14,
    fontWeight: '600',
  },
  errorText: {
    color: '#fff',
    fontSize: 16,
    marginBottom: 20,
  },
  button: {
    backgroundColor: '#16a34a',
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  buttonText: {
    color: '#fff',
    fontWeight: '600',
  },
  loadingOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.8)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingContent: {
    alignItems: 'center',
  },
  loadingText: {
    color: '#fff',
    marginTop: 16,
    fontSize: 16,
    fontWeight: '600',
  },
  progressText: {
    color: '#16a34a',
    marginTop: 8,
    fontSize: 14,
    fontWeight: '500',
  },
});
