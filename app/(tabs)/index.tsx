import { StyleSheet } from 'react-native';
import { ScrollView, View } from 'react-native';

import { MoneySavingAnimation } from '@/components/money-saving-animation';
import { ThemedView } from '@/components/themed-view';
import { BackgroundDecoration } from '@/components/background-decoration';

export default function HomeScreen() {
  return (
    <View style={styles.background}>
      <BackgroundDecoration />
      <ThemedView style={styles.container}>
        <ScrollView
          contentContainerStyle={styles.scrollContent}
          showsVerticalScrollIndicator={false}
        >
          <MoneySavingAnimation />
        </ScrollView>
      </ThemedView>
    </View>
  );
}

const styles = StyleSheet.create({
  background: {
    flex: 1,
    backgroundColor: '#f0fdf4',
  },
  container: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  scrollContent: {
    flexGrow: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 20,
  },
});
