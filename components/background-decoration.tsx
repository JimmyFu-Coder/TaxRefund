import { View, StyleSheet } from 'react-native';

export function BackgroundDecoration() {
  return (
    <View style={styles.container}>
      {/* Top gradient blob */}
      <View style={[styles.blob, styles.blobTop]} />
      
      {/* Bottom gradient blob */}
      <View style={[styles.blob, styles.blobBottom]} />
      
      {/* Center accent circle */}
      <View style={[styles.blob, styles.blobCenter]} />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    overflow: 'hidden',
    zIndex: -1,
  },
  blob: {
    position: 'absolute',
    borderRadius: 999,
  },
  blobTop: {
    top: -50,
    right: -100,
    width: 400,
    height: 400,
    backgroundColor: 'rgba(22, 163, 74, 0.08)',
  },
  blobBottom: {
    bottom: -80,
    left: -120,
    width: 350,
    height: 350,
    backgroundColor: 'rgba(34, 197, 94, 0.06)',
  },
  blobCenter: {
    top: '40%',
    right: '-15%',
    width: 300,
    height: 300,
    backgroundColor: 'rgba(134, 239, 172, 0.04)',
  },
});

