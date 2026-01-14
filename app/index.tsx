import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, ActivityIndicator, Animated, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/lib/store';
import { validateAndNormalizeRoute } from '@/lib/validation';
import { useState, useRef, useEffect, useMemo } from 'react';
import { LinearGradient } from 'expo-linear-gradient';
import { MapPin, Navigation, CheckCircle2, AlertCircle, FileJson, Sparkles, ChevronRight, Info } from 'lucide-react-native';

const { width, height } = Dimensions.get('window');

const NUM_PARTICLES = 15;

function Particle({ delay, startX }: { delay: number; startX: number }) {
  const translateY = useRef(new Animated.Value(height + 50)).current;
  const opacity = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    const animate = () => {
      translateY.setValue(height + 50);
      opacity.setValue(0);

      Animated.sequence([
        Animated.delay(delay),
        Animated.parallel([
          Animated.timing(translateY, {
            toValue: -50,
            duration: 4000 + Math.random() * 3000,
            useNativeDriver: true,
          }),
          Animated.sequence([
            Animated.timing(opacity, {
              toValue: 1,
              duration: 300,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0.8,
              duration: 3500,
              useNativeDriver: true,
            }),
            Animated.timing(opacity, {
              toValue: 0,
              duration: 300,
              useNativeDriver: true,
            }),
          ]),
        ]),
      ]).start(() => animate());
    };
    animate();
  }, []);

  const size = 2 + Math.random() * 3;

  return (
    <Animated.View
      style={{
        position: 'absolute',
        left: startX,
        width: size,
        height: size * 12,
        borderRadius: size,
        backgroundColor: '#22c55e',
        opacity,
        transform: [{ translateY }],
      }}
    />
  );
}

function ParticlesBackground() {
  const particles = useMemo(() => {
    return Array.from({ length: NUM_PARTICLES }, (_, i) => ({
      id: i,
      delay: Math.random() * 3000,
      startX: Math.random() * width,
    }));
  }, []);

  return (
    <View style={StyleSheet.absoluteFill} pointerEvents="none">
      {particles.map((p) => (
        <Particle key={p.id} delay={p.delay} startX={p.startX} />
      ))}
    </View>
  );
}

export default function ImportScreen() {
  const router = useRouter();
  const pontos = useAppStore((state) => state.pontos);
  const setPontos = useAppStore((state) => state.setPontos);
  const setIndiceAtual = useAppStore((state) => state.setIndiceAtual);

  const [jsonInput, setJsonInput] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const fadeAnim = useRef(new Animated.Value(0)).current;
  const slideAnim = useRef(new Animated.Value(30)).current;
  const scaleAnim = useRef(new Animated.Value(0.95)).current;
  const buttonScale = useRef(new Animated.Value(1)).current;
  const pulseAnim = useRef(new Animated.Value(1)).current;

  useEffect(() => {
    Animated.parallel([
      Animated.timing(fadeAnim, {
        toValue: 1,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.timing(slideAnim, {
        toValue: 0,
        duration: 600,
        useNativeDriver: true,
      }),
      Animated.spring(scaleAnim, {
        toValue: 1,
        friction: 8,
        tension: 40,
        useNativeDriver: true,
      }),
    ]).start();

    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, {
          toValue: 1.05,
          duration: 1500,
          useNativeDriver: true,
        }),
        Animated.timing(pulseAnim, {
          toValue: 1,
          duration: 1500,
          useNativeDriver: true,
        }),
      ])
    );
    pulse.start();

    return () => pulse.stop();
  }, []);

  const handlePressIn = () => {
    Animated.spring(buttonScale, {
      toValue: 0.95,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const handlePressOut = () => {
    Animated.spring(buttonScale, {
      toValue: 1,
      friction: 8,
      useNativeDriver: true,
    }).start();
  };

  const handleValidateAndNavigate = () => {
    if (loading) return;

    setErrors([]);
    setSuccess('');
    setLoading(true);

    setTimeout(() => {
      try {
        let data: unknown;
        try {
          data = JSON.parse(jsonInput);
        } catch {
          setErrors(['JSON inválido. Verifique a sintaxe.']);
          setLoading(false);
          return;
        }

        const { pontos: validatedPontos } = validateAndNormalizeRoute(data);

        setPontos(validatedPontos);
        setIndiceAtual(0);
        setSuccess(`Rota válida com ${validatedPontos.length} pontos!`);

        setTimeout(() => {
          router.push('/navigate');
        }, 1000);
      } catch (e) {
        if (e instanceof Error) {
          const errorMessages = e.message.split('\n').filter((msg) => msg.trim());
          setErrors(errorMessages);
        } else {
          setErrors(['Erro desconhecido ao validar a rota.']);
        }
        setLoading(false);
      }
    }, 400);
  };

  return (
    <LinearGradient
      colors={['#0a0a0f', '#0d0d12', '#111116']}
      style={styles.gradient}
    >
      <ParticlesBackground />
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent} showsVerticalScrollIndicator={false} keyboardShouldPersistTaps="handled">
        <Animated.View style={[styles.container, { opacity: fadeAnim, transform: [{ translateY: slideAnim }] }]}>
          <View style={styles.headerSection}>
            <Animated.View style={[styles.iconContainer, { transform: [{ scale: pulseAnim }] }]}>
              <LinearGradient
                colors={['#22c55e', '#16a34a']}
                style={styles.iconGradient}
              >
                <Navigation size={32} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
            </Animated.View>
            <Text style={styles.title}>AvanteHub GPS</Text>
            <Text style={styles.subtitle}>Sistema de Navegação Inteligente</Text>
          </View>

          <Animated.View style={[styles.card, styles.infoCard, { transform: [{ scale: scaleAnim }] }]}>
            <View style={styles.cardHeader}>
              <View style={styles.cardIconWrapper}>
                <Info size={18} color="#60a5fa" />
              </View>
              <Text style={styles.cardTitle}>Formato do JSON</Text>
            </View>
            <View style={styles.rulesList}>
              <View style={styles.ruleItem}>
                <View style={styles.ruleDot} />
                <Text style={styles.ruleText}>numPonto: sequência 1, 2, 3...</Text>
              </View>
              <View style={styles.ruleItem}>
                <View style={styles.ruleDot} />
                <Text style={styles.ruleText}>lat: entre -90 e 90</Text>
              </View>
              <View style={styles.ruleItem}>
                <View style={styles.ruleDot} />
                <Text style={styles.ruleText}>lng: entre -180 e 180</Text>
              </View>
            </View>
          </Animated.View>

          <View style={styles.inputSection}>
            <View style={styles.inputHeader}>
              <FileJson size={20} color="#a78bfa" />
              <Text style={styles.inputLabel}>Cole seu JSON aqui</Text>
            </View>
            <View style={styles.textAreaWrapper}>
              <TextInput
                style={styles.textArea}
                multiline
                numberOfLines={8}
                value={jsonInput}
                onChangeText={setJsonInput}
                placeholder='[{"numPonto": 1, "lat": -23.5505, "lng": -46.6333}]'
                placeholderTextColor="#4a4a5a"
              />
              <LinearGradient
                colors={['transparent', 'rgba(167, 139, 250, 0.1)']}
                style={styles.inputGlow}
                pointerEvents="none"
              />
            </View>
          </View>

          {errors.length > 0 && (
            <Animated.View style={[styles.card, styles.errorCard]}>
              <View style={styles.cardHeader}>
                <View style={[styles.cardIconWrapper, styles.errorIconWrapper]}>
                  <AlertCircle size={18} color="#f87171" />
                </View>
                <Text style={styles.errorTitle}>Erros Encontrados</Text>
              </View>
              {errors.map((error, index) => (
                <View key={index} style={styles.errorItem}>
                  <Text style={styles.errorNumber}>{index + 1}.</Text>
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              ))}
            </Animated.View>
          )}

          {success && (
            <Animated.View style={[styles.card, styles.successCard]}>
              <View style={styles.successContent}>
                <View style={[styles.cardIconWrapper, styles.successIconWrapper]}>
                  <CheckCircle2 size={24} color="#22c55e" />
                </View>
                <View style={styles.successTextContainer}>
                  <Text style={styles.successTitle}>Sucesso!</Text>
                  <Text style={styles.successText}>{success}</Text>
                </View>
              </View>
              <View style={styles.successLoader}>
                <ActivityIndicator size="small" color="#22c55e" />
                <Text style={styles.successLoaderText}>Iniciando navegação...</Text>
              </View>
            </Animated.View>
          )}

          {pontos.length > 0 && !success && (
            <View style={styles.loadedInfo}>
              <MapPin size={16} color="#a78bfa" />
              <Text style={styles.loadedText}>{pontos.length} pontos carregados anteriormente</Text>
            </View>
          )}

          <Animated.View style={{ transform: [{ scale: buttonScale }] }}>
            <TouchableOpacity
              onPress={handleValidateAndNavigate}
              onPressIn={handlePressIn}
              onPressOut={handlePressOut}
              disabled={loading || !jsonInput.trim()}
              activeOpacity={1}
              style={styles.buttonWrapper}
            >
              <LinearGradient
                colors={loading || !jsonInput.trim() ? ['#2a2a35', '#252530'] : ['#22c55e', '#16a34a']}
                start={{ x: 0, y: 0 }}
                end={{ x: 1, y: 1 }}
                style={[styles.button, (loading || !jsonInput.trim()) && styles.buttonDisabled]}
              >
                {loading ? (
                  <View style={styles.buttonContent}>
                    <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
                    <Text style={styles.buttonText}>Validando...</Text>
                  </View>
                ) : (
                  <View style={styles.buttonContent}>
                    <Sparkles size={20} color="#fff" style={styles.buttonIcon} />
                    <Text style={styles.buttonText}>Validar & Navegar</Text>
                    <ChevronRight size={20} color="#fff" />
                  </View>
                )}
              </LinearGradient>
            </TouchableOpacity>
          </Animated.View>

          <View style={styles.footer}>
            <Text style={styles.footerText}>v1.0.0</Text>
          </View>
        </Animated.View>
      </ScrollView>
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  gradient: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  container: {
    flex: 1,
    padding: 24,
  },
  headerSection: {
    alignItems: 'center',
    marginBottom: 32,
    marginTop: 20,
  },
  iconContainer: {
    marginBottom: 16,
  },
  iconGradient: {
    width: 72,
    height: 72,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 8 },
    shadowOpacity: 0.4,
    shadowRadius: 16,
    elevation: 12,
  },
  title: {
    fontSize: 32,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  subtitle: {
    fontSize: 16,
    color: '#71717a',
    marginTop: 8,
    letterSpacing: 0.5,
  },
  card: {
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.06)',
  },
  infoCard: {
    borderColor: 'rgba(96, 165, 250, 0.2)',
  },
  cardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  cardIconWrapper: {
    width: 32,
    height: 32,
    borderRadius: 10,
    backgroundColor: 'rgba(96, 165, 250, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  rulesList: {
    gap: 10,
  },
  ruleItem: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  ruleDot: {
    width: 6,
    height: 6,
    borderRadius: 3,
    backgroundColor: '#60a5fa',
    marginRight: 12,
  },
  ruleText: {
    fontSize: 14,
    color: '#a1a1aa',
    fontFamily: 'monospace',
  },
  inputSection: {
    marginBottom: 20,
  },
  inputHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
    gap: 8,
  },
  inputLabel: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFFFFF',
  },
  textAreaWrapper: {
    position: 'relative',
    borderRadius: 16,
    overflow: 'hidden',
  },
  textArea: {
    backgroundColor: 'rgba(20, 20, 28, 0.9)',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
    borderRadius: 16,
    padding: 16,
    fontSize: 13,
    minHeight: 160,
    textAlignVertical: 'top',
    fontFamily: 'monospace',
  },
  inputGlow: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    height: 60,
    borderBottomLeftRadius: 16,
    borderBottomRightRadius: 16,
  },
  errorCard: {
    borderColor: 'rgba(248, 113, 113, 0.3)',
    backgroundColor: 'rgba(40, 20, 20, 0.8)',
  },
  errorIconWrapper: {
    backgroundColor: 'rgba(248, 113, 113, 0.15)',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#f87171',
  },
  errorItem: {
    flexDirection: 'row',
    marginBottom: 8,
    paddingLeft: 4,
  },
  errorNumber: {
    fontSize: 14,
    color: '#f87171',
    fontWeight: '600',
    marginRight: 8,
    width: 20,
  },
  errorText: {
    fontSize: 14,
    color: '#fca5a5',
    flex: 1,
  },
  successCard: {
    borderColor: 'rgba(34, 197, 94, 0.3)',
    backgroundColor: 'rgba(20, 40, 25, 0.8)',
  },
  successContent: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  successIconWrapper: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    width: 40,
    height: 40,
    borderRadius: 12,
  },
  successTextContainer: {
    marginLeft: 12,
    flex: 1,
  },
  successTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#22c55e',
  },
  successText: {
    fontSize: 14,
    color: '#86efac',
    marginTop: 2,
  },
  successLoader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: 'rgba(34, 197, 94, 0.2)',
    gap: 8,
  },
  successLoaderText: {
    fontSize: 14,
    color: '#4ade80',
  },
  loadedInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 20,
    gap: 8,
  },
  loadedText: {
    fontSize: 14,
    color: '#a78bfa',
  },
  buttonWrapper: {
    borderRadius: 16,
    overflow: 'hidden',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.3,
    shadowRadius: 12,
    elevation: 8,
  },
  button: {
    paddingHorizontal: 28,
    paddingVertical: 18,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  buttonDisabled: {
    shadowOpacity: 0,
    elevation: 0,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 10,
  },
  buttonIcon: {
    marginRight: 4,
  },
  spinner: {
    marginRight: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 17,
    fontWeight: '700',
    letterSpacing: 0.3,
  },
  footer: {
    alignItems: 'center',
    marginTop: 32,
  },
  footerText: {
    fontSize: 12,
    color: '#52525b',
  },
});
