import { StyleSheet, View } from 'react-native';
import { ReceiptsList } from '@/components/receipts-list';

export default function ExploreScreen() {
  return (
    <View style={styles.container}>
      <ReceiptsList />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
});
