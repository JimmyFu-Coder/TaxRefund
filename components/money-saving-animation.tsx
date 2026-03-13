import { useEffect, useState } from 'react';
import { View, Text, Pressable, StyleSheet } from 'react-native';
import { useRouter } from 'expo-router';
import Animated, { useSharedValue, withTiming, withDelay, Easing, FadeIn, useAnimatedStyle } from 'react-native-reanimated';

const COINS = [
  { id: 1, startX: -30, delay: 0 },
  { id: 2, startX: 0, delay: 200 },
  { id: 3, startX: 30, delay: 400 },
  { id: 4, startX: -15, delay: 600 },
  { id: 5, startX: 15, delay: 800 },
];

const styles = StyleSheet.create({
  container: {
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 500,
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 60,
    backgroundColor: '#f0fdf4',
  },
  header: {
    marginBottom: 32,
    alignItems: 'center',
    paddingTop: 20,
  },
  headerTitle: {
    fontSize: 30,
    fontWeight: '800',
    color: '#15803d',
    marginBottom: 8,
  },
  headerSubtitle: {
    color: '#65a30d',
    textAlign: 'center',
    fontSize: 16,
    fontWeight: '500',
  },
  coinContainer: {
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.7)',
    paddingVertical: 24,
    paddingHorizontal: 20,
    borderRadius: 20,
    borderWidth: 2,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  coinAnimationView: {
    position: 'relative',
    width: 100,
    height: 200,
    alignItems: 'center',
  },
  amountContainer: {
    alignItems: 'center',
    marginTop: 20,
    backgroundColor: 'rgba(22, 163, 74, 0.05)',
    paddingVertical: 16,
    paddingHorizontal: 24,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: 'rgba(22, 163, 74, 0.15)',
  },
  amount: {
    fontSize: 56,
    fontWeight: '900',
    color: '#15803d',
    letterSpacing: -1,
  },
  amountSubtext: {
    color: '#65a30d',
    fontSize: 15,
    marginTop: 6,
    fontWeight: '600',
  },
  coin: {
    position: 'absolute',
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: '#fbbf24',
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#b45309',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.3,
    shadowRadius: 8,
    elevation: 8,
  },
  coinText: {
    fontSize: 20,
    fontWeight: 'bold',
    color: '#78350f',
  },
  dialogContainer: {
    width: '100%',
    paddingHorizontal: 16,
    marginTop: 32,
  },
  chatBubbles: {
    borderRadius: 20,
    backgroundColor: '#ffffff',
    padding: 16,
    marginBottom: 16,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.08,
    shadowRadius: 12,
    elevation: 4,
    borderWidth: 1,
    borderColor: '#e0e7ff',
  },
  messageOtherContainer: {
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  messageOther: {
    backgroundColor: '#f3f4f6',
    borderRadius: 24,
    borderTopLeftRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    maxWidth: '85%',
    borderLeftWidth: 3,
    borderLeftColor: '#65a30d',
  },
  messageOtherText: {
    fontSize: 15,
    color: '#1f2937',
    lineHeight: 20,
    fontWeight: '500',
  },
  messageUserContainer: {
    alignItems: 'flex-end',
  },
  messageUser: {
    backgroundColor: '#16a34a',
    borderRadius: 24,
    borderTopRightRadius: 4,
    paddingHorizontal: 16,
    paddingVertical: 10,
    flexDirection: 'row',
    alignItems: 'center',
    maxWidth: '85%',
    shadowColor: '#15803d',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.2,
    shadowRadius: 4,
    elevation: 3,
  },
  messageUserEmoji: {
    fontSize: 24,
    marginRight: 8,
  },
  messageUserText: {
    fontSize: 15,
    color: '#fff',
    fontWeight: '700',
  },
  buttonContainer: {
    alignItems: 'center',
    marginTop: 24,
    width: '100%',
    paddingBottom: 16,
  },
  ctaCard: {
    width: '100%',
    backgroundColor: 'rgba(255, 255, 255, 0.92)',
    borderRadius: 16,
    padding: 10,
    borderWidth: 1,
    borderColor: '#d9f99d',
  },
  button: {
    backgroundColor: '#047857',
    paddingVertical: 16,
    paddingHorizontal: 32,
    borderRadius: 28,
    width: '100%',
    minHeight: 56,
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#14532d',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.25,
    shadowRadius: 12,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#065f46',
  },
  buttonPressed: {
    backgroundColor: '#065f46',
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '800',
    textAlign: 'center',
    letterSpacing: 0.3,
    textShadowColor: 'rgba(0, 0, 0, 0.2)',
    textShadowOffset: { width: 0, height: 1 },
    textShadowRadius: 2,
  },
  buttonSubtext: {
    color: '#365314',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 10,
    fontWeight: '600',
    backgroundColor: 'rgba(255, 255, 255, 0.8)',
    paddingVertical: 4,
    paddingHorizontal: 10,
    borderRadius: 8,
    alignSelf: 'center',
    overflow: 'hidden',
  },
});

export function MoneySavingAnimation() {
  const [showDialog, setShowDialog] = useState(false);
  const [showCoins, setShowCoins] = useState(true);

  const handleDialogShown = () => {
    setShowDialog(true);
    setTimeout(() => setShowCoins(false), 2000);
  };

  return (
    <View style={styles.container}>
      {/* Header */}
      <View style={styles.header}>
        <Text
          style={styles.headerTitle}
          numberOfLines={1}
          adjustsFontSizeToFit
        >
          💵 Start Saving Today
        </Text>
        <Text style={styles.headerSubtitle}>Average user saves</Text>
      </View>

      {showCoins && <CoinAnimation onComplete={handleDialogShown} />}
      {showDialog && <DialogAnimation />}
    </View>
  );
}

function CoinAnimation({ onComplete }: { onComplete: () => void }) {
  const opacity = useSharedValue(0);
  const scale = useSharedValue(0.5);
  const amountOpacity = useSharedValue(0);
  const amountScale = useSharedValue(0.8);

  useEffect(() => {
    opacity.value = withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) });
    scale.value = withDelay(300, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }));
    amountOpacity.value = withDelay(800, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }));
    amountScale.value = withDelay(800, withTiming(1, { duration: 400, easing: Easing.out(Easing.quad) }));
    setTimeout(() => onComplete(), 2500);
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    opacity: opacity.value,
    transform: [{ scale: scale.value }],
  }));

  const amountStyle = useAnimatedStyle(() => ({
    opacity: amountOpacity.value,
    transform: [{ scale: amountScale.value }],
  }));

  return (
    <View style={styles.coinContainer}>
      <Animated.View
        style={[styles.coinAnimationView, animatedStyle]}
      >
        {COINS.map((coin) => (
          <Coin key={coin.id} startX={coin.startX} delay={coin.delay} />
        ))}
      </Animated.View>

      {/* Amount display */}
      <Animated.View style={[styles.amountContainer, amountStyle]}>
        <Text style={styles.amount}>$500+</Text>
        <Text style={styles.amountSubtext}>per year in tax refunds</Text>
      </Animated.View>
    </View>
  );
}

function Coin({ startX, delay }: { startX: number; delay: number }) {
  const translateY = useSharedValue(-100);
  const opacity = useSharedValue(0);

  useEffect(() => {
    opacity.value = withDelay(delay, withTiming(1, { duration: 600, easing: Easing.out(Easing.quad) }));
    translateY.value = withDelay(delay, withTiming(150, { duration: 600, easing: Easing.out(Easing.quad) }));
  }, []);

  const animatedStyle = useAnimatedStyle(() => ({
    transform: [{ translateY: translateY.value }, { translateX: startX }],
    opacity: opacity.value,
  }));

  return (
    <Animated.View
      style={[styles.coin, animatedStyle]}
    >
      <Text style={styles.coinText}>$</Text>
    </Animated.View>
  );
}

function DialogAnimation() {
  const router = useRouter();
  const [dialogStep, setDialogStep] = useState(0);

  useEffect(() => {
    const t1 = setTimeout(() => setDialogStep(1), 500);
    const t2 = setTimeout(() => setDialogStep(2), 2500);
    return () => { clearTimeout(t1); clearTimeout(t2); };
  }, []);

  const handleStart = () => {
    // 导航到收据扫描器
    router.push('/receipt-scanner');
  };

  return (
    <View style={styles.dialogContainer}>
      {/* Chat bubble container - WhatsApp style */}
      <View style={styles.chatBubbles}>
        {/* Message from other */}
        <View style={styles.messageOtherContainer}>
          {dialogStep >= 1 && (
            <Animated.View entering={FadeIn.duration(400)} style={styles.messageOther}>
              <Text style={styles.messageOtherText}>💡 97% of people leave money on the table by not tracking receipts properly!</Text>
            </Animated.View>
          )}
        </View>

        {/* Message from user */}
        <View style={styles.messageUserContainer}>
          {dialogStep >= 2 && (
            <Animated.View entering={FadeIn.duration(400).delay(200)} style={styles.messageUser}>
              <Text style={styles.messageUserEmoji}>🤑</Text>
              <Text style={styles.messageUserText}>Not me! Let&apos;s track!</Text>
            </Animated.View>
          )}
        </View>
      </View>

      {/* Action button */}
      <View style={styles.buttonContainer}>
        {dialogStep >= 2 && (
          <Animated.View entering={FadeIn.duration(400).delay(500)} style={{ width: '100%' }}>
            <View style={styles.ctaCard}>
              <Pressable
                style={({ pressed }) => [
                  styles.button,
                  pressed && styles.buttonPressed,
                  { transform: [{ scale: pressed ? 0.97 : 1 }] },
                ]}
                onPress={handleStart}
              >
                <Text style={styles.buttonText}>📸 Start Scanning Receipts</Text>
              </Pressable>
              <Text style={styles.buttonSubtext}>No credit card required • Start saving today</Text>
            </View>
          </Animated.View>
        )}
      </View>
    </View>
  );
}
