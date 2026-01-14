import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Alert, TouchableOpacity, ScrollView, Animated, ActivityIndicator, Dimensions } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/lib/store';
import { bearingBetween, deltaHeading, haversineMeters, formatDistance } from '@/lib/geo';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polyline, Region } from '@/lib/MapView';
import { LinearGradient } from 'expo-linear-gradient';
import { Navigation, MapPin, Compass, Target, CheckCircle2, XCircle, ArrowRight, RotateCcw, Crosshair, Signal, Smartphone, Globe, ChevronRight, Loader2, ArrowLeft, Play } from 'lucide-react-native';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

type GpsStatus = 'aguardando' | 'permitido' | 'negado';
type PrecisionStatus = 'green' | 'yellow' | 'red' | 'gray';

const SPEED_THRESHOLD = 1.5;
const RAIO_CHEGADA_METROS = 20;
const RAIO_SAIDA_METROS = 25;

export default function NavigateScreen() {
  const router = useRouter();
  const pontos = useAppStore((state) => state.pontos);
  const posAtual = useAppStore((state) => state.posAtual);
  const setPosAtual = useAppStore((state) => state.setPosAtual);
  const indiceAtual = useAppStore((state) => state.indiceAtual);
  const setIndiceAtual = useAppStore((state) => state.setIndiceAtual);
  const resetRota = useAppStore((state) => state.resetRota);
  const setPontos = useAppStore((state) => state.setPontos);
  const coletasConcluidas = useAppStore((state) => state.coletasConcluidas);
  const addColetaConcluida = useAppStore((state) => state.addColetaConcluida);

  const mapRef = useRef<MapView>(null);
  const deltaBufferRef = useRef<number[]>([]);
  const lastDeltaRef = useRef<number | null>(null);
  const lastUpdateRef = useRef<number>(0);

  const [gpsStatus, setGpsStatus] = useState<GpsStatus>('aguardando');
  const [watchSubscription, setWatchSubscription] = useState<Location.LocationSubscription | null>(null);
  const [heading, setHeading] = useState<number | null>(null);
  const [headingSubscription, setHeadingSubscription] = useState<Location.LocationSubscription | null>(null);
  const [speed, setSpeed] = useState<number | null>(null);
  const [course, setCourse] = useState<number | null>(null);
  const [mode, setMode] = useState<'GPS' | 'Bússola'>('Bússola');
  const [deltaSuavizado, setDeltaSuavizado] = useState<number | null>(null);
  const [accuracy, setAccuracy] = useState<number | null>(null);
  const [precisionStatus, setPrecisionStatus] = useState<PrecisionStatus>('gray');
  const [showPrecisionTooltip, setShowPrecisionTooltip] = useState<boolean>(false);
  const [insideRadius, setInsideRadius] = useState<boolean>(false);
  const [arrivalNotified, setArrivalNotified] = useState<boolean>(false);
  const [toastMessage, setToastMessage] = useState<string>('');
  const [showCollectionModal, setShowCollectionModal] = useState<boolean>(false);
  const [alignmentState, setAlignmentState] = useState<'aligned' | 'adjust' | 'off' | 'waiting'>('waiting');
  const [mapType, setMapType] = useState<'standard' | 'satellite'>('standard');
  const [isMapInteracting, setIsMapInteracting] = useState<boolean>(false);
  const precisionDebounceRef = useRef<NodeJS.Timeout | null>(null);
  const toastTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const arrivalTimeRef = useRef<number | null>(null);
  const compassRotation = useRef(new Animated.Value(0)).current;
  const pointerColorAnim = useRef(new Animated.Value(0)).current;
  const ringOpacityAnim = useRef(new Animated.Value(0)).current;

  const webFadeAnim = useRef(new Animated.Value(0)).current;
  const webSlideAnim = useRef(new Animated.Value(20)).current;

  const isWeb = Platform.OS === 'web';

  useEffect(() => {
    if (isWeb) {
      Animated.parallel([
        Animated.timing(webFadeAnim, { toValue: 1, duration: 500, useNativeDriver: true }),
        Animated.timing(webSlideAnim, { toValue: 0, duration: 500, useNativeDriver: true }),
      ]).start();
    }
  }, [isWeb]);

  const updatePrecisionStatus = (newAccuracy: number | null) => {
    if (precisionDebounceRef.current) {
      clearTimeout(precisionDebounceRef.current);
    }

    precisionDebounceRef.current = setTimeout(() => {
      setAccuracy(newAccuracy);

      if (newAccuracy === null) {
        setPrecisionStatus('gray');
      } else if (newAccuracy < 5) {
        setPrecisionStatus('green');
      } else if (newAccuracy <= 15) {
        setPrecisionStatus('yellow');
      } else {
        setPrecisionStatus('red');
      }
    }, 400);
  };

  useEffect(() => {
    let isMounted = true;
    let pollingInterval: NodeJS.Timeout | null = null;

    const requestLocationPermission = async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();

        if (!isMounted) return;

        if (status !== 'granted') {
          setGpsStatus('negado');
          Alert.alert(
            'Permissão Negada',
            'O app precisa de acesso à localização para funcionar corretamente.'
          );
          return;
        }

        setGpsStatus('permitido');

        const subscription = await Location.watchPositionAsync(
          {
            accuracy: Location.Accuracy.High,
            timeInterval: 1000,
            distanceInterval: 1,
          },
          (location) => {
            if (isMounted) {
              const locationAccuracy = location.coords.accuracy ?? null;
              updatePrecisionStatus(locationAccuracy);

              setPosAtual({
                lat: location.coords.latitude,
                lng: location.coords.longitude,
              });
              setSpeed(location.coords.speed ?? null);
              setCourse(location.coords.heading ?? null);
            }
          }
        );

        if (isMounted) {
          setWatchSubscription(subscription);
        } else {
          subscription.remove();
        }
      } catch (error) {
        if (isMounted) {
          setGpsStatus('negado');
          Alert.alert('Erro', 'Não foi possível acessar a localização.');
        }
      }
    };

    const startWebGeolocationPolling = () => {
      if (typeof navigator === 'undefined' || !navigator.geolocation) {
        setGpsStatus('negado');
        return;
      }

      const updatePosition = () => {
        navigator.geolocation.getCurrentPosition(
          (pos) => {
            if (isMounted) {
              const locationAccuracy = pos.coords.accuracy ?? null;
              updatePrecisionStatus(locationAccuracy);

              setPosAtual({
                lat: pos.coords.latitude,
                lng: pos.coords.longitude,
              });
              setGpsStatus('permitido');
            }
          },
          (err) => {
            if (isMounted) {
              setGpsStatus('negado');
              updatePrecisionStatus(null);
            }
          },
          {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 0,
          }
        );
      };

      updatePosition();

      pollingInterval = setInterval(() => {
        updatePosition();
      }, 5000);
    };

    if (Platform.OS === 'web') {
      startWebGeolocationPolling();
    } else {
      requestLocationPermission();
    }

    return () => {
      isMounted = false;
      if (watchSubscription) {
        watchSubscription.remove();
      }
      if (pollingInterval) {
        clearInterval(pollingInterval);
      }
    };
  }, [setPosAtual]);

  useEffect(() => {
    let isMounted = true;
    let subscription: Location.LocationSubscription | null = null;

    async function startHeading() {
      if (Platform.OS === 'web') {
        return;
      }

      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;

        subscription = await Location.watchHeadingAsync((data) => {
          if (isMounted) {
            if (data.trueHeading >= 0) {
              setHeading(data.trueHeading);
            } else {
              setHeading(data.magHeading);
            }
          }
        });

        if (isMounted) {
          setHeadingSubscription(subscription);
        } else {
          subscription.remove();
        }
      } catch (error) {
        console.warn('Erro ao iniciar heading:', error);
      }
    }

    startHeading();

    return () => {
      isMounted = false;
      if (subscription) {
        subscription.remove();
      }
    };
  }, []);

  const destino = pontos[indiceAtual] ?? null;
  const rotaConcluida = indiceAtual >= pontos.length;

  const usingGps = speed !== null && speed >= SPEED_THRESHOLD && course !== null && course >= 0;
  const rumoAtivo = usingGps ? course : (heading ?? null);

  useEffect(() => {
    const newMode = usingGps ? 'GPS' : 'Bússola';
    if (__DEV__ && mode && mode !== newMode) {
      console.log(`[Mode Change] ${mode} → ${newMode}`);
    }
    setMode(newMode);
  }, [usingGps, mode]);

  const bearing =
    posAtual && destino
      ? bearingBetween(posAtual.lat, posAtual.lng, destino.lat, destino.lng)
      : null;

  const distanciaM =
    posAtual && destino
      ? haversineMeters(posAtual.lat, posAtual.lng, destino.lat, destino.lng)
      : null;

  const distanciaFmt = distanciaM !== null ? formatDistance(distanciaM) : '--';

  useEffect(() => {
    if (distanciaM === null || rotaConcluida) {
      setInsideRadius(false);
      setArrivalNotified(false);
      return;
    }

    const wasInside = insideRadius;
    const nowInside = insideRadius
      ? distanciaM < RAIO_SAIDA_METROS
      : distanciaM <= RAIO_CHEGADA_METROS;

    setInsideRadius(nowInside);

    if (__DEV__ && wasInside !== nowInside) {
      console.log(`[Inside State] ${wasInside} → ${nowInside} | Distance: ${distanciaM.toFixed(1)}m | Time: ${new Date().toISOString()}`);
    }

    if (!wasInside && nowInside && !arrivalNotified) {
      if (!isWeb) {
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      }

      const msg = `Ponto ${indiceAtual + 1} alcançado. Toque em "Próximo Ponto" para continuar.`;
      setToastMessage(msg);
      setArrivalNotified(true);
      arrivalTimeRef.current = Date.now();

      if (toastTimeoutRef.current) {
        clearTimeout(toastTimeoutRef.current);
      }
      toastTimeoutRef.current = setTimeout(() => {
        setToastMessage('');
      }, 4000);

      if (__DEV__) {
        console.log(`[Arrival] Ponto ${indiceAtual + 1} alcançado. Distância: ${distanciaM.toFixed(1)}m`);
      }
    }
  }, [distanciaM, insideRadius, rotaConcluida, arrivalNotified, indiceAtual, isWeb]);

  useEffect(() => {
    setArrivalNotified(false);
    arrivalTimeRef.current = null;

    if (__DEV__) {
      console.log(`[Navigation] Mudança para ponto ${indiceAtual + 1}`);
    }
  }, [indiceAtual]);

  const deltaRaw =
    bearing !== null && rumoAtivo !== null ? deltaHeading(bearing, rumoAtivo) : null;

  useEffect(() => {
    if (deltaRaw === null) {
      setDeltaSuavizado(null);
      deltaBufferRef.current = [];
      lastDeltaRef.current = null;
      return;
    }

    const now = Date.now();
    if (now - lastUpdateRef.current < 100) {
      return;
    }

    deltaBufferRef.current.push(deltaRaw);
    if (deltaBufferRef.current.length > 5) {
      deltaBufferRef.current.shift();
    }

    const average =
      deltaBufferRef.current.reduce((sum, val) => sum + val, 0) /
      deltaBufferRef.current.length;

    if (
      lastDeltaRef.current === null ||
      Math.abs(average - lastDeltaRef.current) >= 2
    ) {
      lastDeltaRef.current = average;
      setDeltaSuavizado(average);
      lastUpdateRef.current = now;
    }
  }, [deltaRaw]);

  useEffect(() => {
    if (deltaSuavizado !== null) {
      Animated.timing(compassRotation, {
        toValue: deltaSuavizado,
        duration: 200,
        useNativeDriver: true,
      }).start();

      const absDelta = Math.abs(deltaSuavizado);
      let newState: 'aligned' | 'adjust' | 'off' | 'waiting' = 'waiting';
      let colorValue = 0;
      let ringOpacity = 0;

      if (absDelta <= 10) {
        newState = 'aligned';
        colorValue = 0;
        ringOpacity = 0.4;
      } else if (absDelta <= 45) {
        newState = 'adjust';
        colorValue = 1;
        ringOpacity = 0.3;
      } else {
        newState = 'off';
        colorValue = 2;
        ringOpacity = 0.2;
      }

      setAlignmentState(newState);

      Animated.parallel([
        Animated.timing(pointerColorAnim, {
          toValue: colorValue,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.timing(ringOpacityAnim, {
          toValue: ringOpacity,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    } else {
      setAlignmentState('waiting');
      Animated.parallel([
        Animated.timing(pointerColorAnim, {
          toValue: 3,
          duration: 250,
          useNativeDriver: false,
        }),
        Animated.timing(ringOpacityAnim, {
          toValue: 0,
          duration: 250,
          useNativeDriver: false,
        }),
      ]).start();
    }
  }, [deltaSuavizado, compassRotation, pointerColorAnim, ringOpacityAnim]);

  const pointerColor = pointerColorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['#2ecc71', '#f1c40f', '#e74c3c', '#8e8e8e'],
  });

  const ringColor = pointerColorAnim.interpolate({
    inputRange: [0, 1, 2, 3],
    outputRange: ['#2ecc71', '#f1c40f', '#e74c3c', '#8e8e8e'],
  });

  const alignmentMessage = {
    aligned: '🟢 Na direção certa',
    adjust: '🟡 Ajuste pequeno',
    off: '🔴 Vire na direção do ponto',
    waiting: '⚪ Aguardando bússola',
  };

  const initialRegion: Region | null = posAtual
    ? {
        latitude: posAtual.lat,
        longitude: posAtual.lng,
        latitudeDelta: 0.01,
        longitudeDelta: 0.01,
      }
    : null;

  const polylineCoordinates =
    posAtual && destino
      ? [
          { latitude: posAtual.lat, longitude: posAtual.lng },
          { latitude: destino.lat, longitude: destino.lng },
        ]
      : [];

  const handleCentralizar = () => {
    if (posAtual) {
      mapRef.current?.animateToRegion(
        {
          latitude: posAtual.lat,
          longitude: posAtual.lng,
          latitudeDelta: 0.003,
          longitudeDelta: 0.003,
        },
        500
      );
    }
  };

  const handleEnquadrar = () => {
    if (posAtual && destino) {
      const coords = [
        { latitude: posAtual.lat, longitude: posAtual.lng },
        { latitude: destino.lat, longitude: destino.lng },
      ];
      mapRef.current?.fitToCoordinates(coords, {
        edgePadding: { top: 60, right: 60, bottom: 60, left: 60 },
        animated: true,
      });
    }
  };

  const handleVoltarPonto = () => {
    if (indiceAtual > 0) {
      if (__DEV__) {
        console.log(`[Control] Voltar Ponto: ${indiceAtual + 1} → ${indiceAtual}`);
      }
      setIndiceAtual(indiceAtual - 1);
    }
  };

  const handleProximoPonto = () => {
    if (indiceAtual < pontos.length - 1) {
      if (__DEV__) {
        console.log(`[Control] Próximo Ponto clicked | Current: ${indiceAtual + 1} | Inside: ${insideRadius}`);
      }
      setShowCollectionModal(true);
    }
  };

  const handleConfirmCollection = () => {
    addColetaConcluida(pontos[indiceAtual].numPonto);

    if (!isWeb) {
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    }

    const msg = `Ponto ${indiceAtual + 1} registrado como coletado.`;
    setToastMessage(msg);

    if (toastTimeoutRef.current) {
      clearTimeout(toastTimeoutRef.current);
    }
    toastTimeoutRef.current = setTimeout(() => {
      setToastMessage('');
    }, 3000);

    setShowCollectionModal(false);
    setIndiceAtual(indiceAtual + 1);

    if (__DEV__) {
      console.log(`[Collection] Ponto ${pontos[indiceAtual].numPonto} confirmado e registrado`);
    }
  };

  const handleCancelCollection = () => {
    setShowCollectionModal(false);
  };

  const handleLogDiagnostics = () => {
    if (__DEV__) {
      console.log('[Diagnostics Snapshot]', {
        platform: Platform.OS,
        gpsStatus,
        precisionStatus,
        accuracy,
        speed,
        course,
        heading,
        bearing,
        deltaSuavizado,
        distanciaM,
        insideRadius,
        indiceAtual,
        totalPontos: pontos.length,
        destino,
        posAtual,
        alignmentState,
      });
    }
  };

  const handleZerarRota = () => {
    if (__DEV__) {
      console.log('[Control] Zerar Rota clicked');
    }
    Alert.alert('Confirmar', 'Deseja realmente zerar a rota?', [
      { text: 'Cancelar', style: 'cancel' },
      {
        text: 'Zerar',
        style: 'destructive',
        onPress: () => {
          if (__DEV__) {
            console.log('[Control] Zerar Rota confirmed - resetting state');
          }
          resetRota();
          setPontos([]);
          router.replace('/');
        },
      },
    ]);
  };

  const handleToggleMapType = () => {
    setMapType(prevType => prevType === 'standard' ? 'satellite' : 'standard');
  };

  if (isWeb) {
    return (
      <LinearGradient colors={['#0a0a0f', '#121218', '#1a1a24']} style={styles.webGradient}>
        <ScrollView style={styles.webScrollView} contentContainerStyle={styles.webScrollContent} showsVerticalScrollIndicator={false}>
          <Animated.View style={[styles.webContainer, { opacity: webFadeAnim, transform: [{ translateY: webSlideAnim }] }]}>
            <View style={styles.webHeaderSection}>
              <LinearGradient colors={['#3b82f6', '#2563eb']} style={styles.webHeaderIcon}>
                <Navigation size={28} color="#fff" strokeWidth={2.5} />
              </LinearGradient>
              <Text style={styles.webTitle}>Navegação GPS</Text>
              <Text style={styles.webSubtitle}>Versão Web Preview</Text>
              {pontos.length > 0 && (
                <View style={styles.webRouteBadge}>
                  <MapPin size={14} color="#22c55e" />
                  <Text style={styles.webRouteBadgeText}>{pontos.length} pontos na rota</Text>
                </View>
              )}
            </View>

            <View style={styles.webInfoCard}>
              <View style={styles.webInfoCardHeader}>
                <View style={styles.webInfoIconWrapper}>
                  <Smartphone size={18} color="#f59e0b" />
                </View>
                <Text style={styles.webInfoCardTitle}>Use no Mobile</Text>
              </View>
              <Text style={styles.webInfoCardText}>
                Para navegação completa com mapa e bússola, use o app no celular através do Expo Go.
              </Text>
              <View style={styles.webInfoCardFeatures}>
                <View style={styles.webFeatureItem}>
                  <CheckCircle2 size={14} color="#22c55e" />
                  <Text style={styles.webFeatureText}>Mapa interativo</Text>
                </View>
                <View style={styles.webFeatureItem}>
                  <CheckCircle2 size={14} color="#22c55e" />
                  <Text style={styles.webFeatureText}>Bússola digital</Text>
                </View>
                <View style={styles.webFeatureItem}>
                  <CheckCircle2 size={14} color="#22c55e" />
                  <Text style={styles.webFeatureText}>GPS de alta precisão</Text>
                </View>
              </View>
            </View>

            <View style={styles.webLocationCard}>
              <View style={styles.webLocationCardHeader}>
                <View style={[styles.webInfoIconWrapper, { backgroundColor: 'rgba(34, 197, 94, 0.15)' }]}>
                  <Crosshair size={18} color="#22c55e" />
                </View>
                <Text style={styles.webLocationCardTitle}>Sua Localização</Text>
                <View style={[styles.webStatusDot, gpsStatus === 'permitido' ? styles.webStatusDotActive : gpsStatus === 'aguardando' ? styles.webStatusDotWaiting : styles.webStatusDotError]} />
              </View>

              {gpsStatus === 'aguardando' && (
                <View style={styles.webLocationLoading}>
                  <ActivityIndicator size="small" color="#3b82f6" />
                  <Text style={styles.webLocationLoadingText}>Obtendo localização...</Text>
                </View>
              )}

              {gpsStatus === 'negado' && (
                <View style={styles.webLocationError}>
                  <XCircle size={20} color="#ef4444" />
                  <Text style={styles.webLocationErrorText}>Permissão de localização negada</Text>
                  <Text style={styles.webLocationErrorHint}>Habilite a localização nas configurações do navegador</Text>
                </View>
              )}

              {gpsStatus === 'permitido' && posAtual && (
                <View style={styles.webLocationData}>
                  <View style={styles.webLocationRow}>
                    <Text style={styles.webLocationLabel}>Latitude</Text>
                    <Text style={styles.webLocationValue}>{posAtual.lat.toFixed(6)}°</Text>
                  </View>
                  <View style={styles.webLocationDivider} />
                  <View style={styles.webLocationRow}>
                    <Text style={styles.webLocationLabel}>Longitude</Text>
                    <Text style={styles.webLocationValue}>{posAtual.lng.toFixed(6)}°</Text>
                  </View>
                  {destino && (
                    <>
                      <View style={styles.webLocationDivider} />
                      <View style={styles.webLocationRow}>
                        <Text style={styles.webLocationLabel}>Distância ao Próx.</Text>
                        <Text style={[styles.webLocationValue, { color: '#22c55e' }]}>{distanciaFmt}</Text>
                      </View>
                    </>
                  )}
                </View>
              )}
            </View>

            {destino && (
              <View style={styles.webDestinationCard}>
                <View style={styles.webDestinationHeader}>
                  <View style={[styles.webInfoIconWrapper, { backgroundColor: 'rgba(167, 139, 250, 0.15)' }]}>
                    <Target size={18} color="#a78bfa" />
                  </View>
                  <View style={styles.webDestinationHeaderText}>
                    <Text style={styles.webDestinationTitle}>Destino Atual</Text>
                    <Text style={styles.webDestinationSubtitle}>Ponto {indiceAtual + 1} de {pontos.length}</Text>
                  </View>
                </View>
                <View style={styles.webDestinationCoords}>
                  <Text style={styles.webDestinationCoordsText}>
                    {destino.lat.toFixed(6)}°, {destino.lng.toFixed(6)}°
                  </Text>
                </View>
              </View>
            )}

            <View style={styles.webButtonsRow}>
              <TouchableOpacity style={styles.webBackButton} onPress={() => router.replace('/')}>
                <ArrowLeft size={18} color="#fff" />
                <Text style={styles.webBackButtonText}>Voltar</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.webFooter}>
              <Globe size={14} color="#52525b" />
              <Text style={styles.webFooterText}>Preview Web - Funcionalidades limitadas</Text>
            </View>
          </Animated.View>
        </ScrollView>
      </LinearGradient>
    );
  }

  if (gpsStatus === 'aguardando') {
    return (
      <LinearGradient colors={['#0a0a0a', '#0d1a10', '#0f2818']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Obtendo permissão de GPS...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (gpsStatus === 'negado') {
    return (
      <LinearGradient colors={['#0a0a0a', '#1a0d0d', '#280f0f']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <XCircle size={48} color="#ef4444" />
          <Text style={styles.errorText}>Permissão de localização negada</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!posAtual) {
    return (
      <LinearGradient colors={['#0a0a0a', '#0d1a10', '#0f2818']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Obtendo localização...</Text>
        </View>
      </LinearGradient>
    );
  }

  if (pontos.length === 0) {
    return (
      <LinearGradient colors={['#0a0a0a', '#0d1a10', '#0f2818']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <MapPin size={48} color="#71717a" />
          <Text style={styles.loadingText}>Nenhum ponto carregado</Text>
        </View>
      </LinearGradient>
    );
  }

  if (!initialRegion) {
    return (
      <LinearGradient colors={['#0a0a0a', '#0d1a10', '#0f2818']} style={styles.container}>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color="#22c55e" />
          <Text style={styles.loadingText}>Aguardando coordenadas...</Text>
        </View>
      </LinearGradient>
    );
  }

  return (
    <LinearGradient colors={['#0a0a0a', '#0d1a10', '#0f2818']} style={styles.container}>
      <View style={styles.header}>
        <View style={styles.headerTop}>
          <TouchableOpacity style={styles.backButton} onPress={() => router.replace('/')}>
            <ArrowLeft size={20} color="#fff" />
          </TouchableOpacity>
          <View style={styles.headerCenter}>
            <Navigation size={20} color="#22c55e" />
            <Text style={styles.headerTitle}>Navegação</Text>
          </View>
          <TouchableOpacity
            style={styles.precisionIndicator}
            onPress={() => setShowPrecisionTooltip(!showPrecisionTooltip)}
          >
            <View
              style={[
                styles.precisionDot,
                precisionStatus === 'green' && styles.precisionDotGreen,
                precisionStatus === 'yellow' && styles.precisionDotYellow,
                precisionStatus === 'red' && styles.precisionDotRed,
                precisionStatus === 'gray' && styles.precisionDotGray,
              ]}
            />
          </TouchableOpacity>
        </View>

        <View style={styles.statusRow}>
          <View style={styles.statusChip}>
            <Target size={12} color="#22c55e" />
            <Text style={styles.statusChipText}>
              {rotaConcluida ? 'Concluída' : `${indiceAtual + 1}/${pontos.length}`}
            </Text>
          </View>
          <View style={styles.statusChip}>
            <CheckCircle2 size={12} color="#f59e0b" />
            <Text style={styles.statusChipText}>{coletasConcluidas.length} coletados</Text>
          </View>
          <View style={styles.statusChip}>
            <Compass size={12} color="#3b82f6" />
            <Text style={styles.statusChipText}>{mode}</Text>
          </View>
        </View>
      </View>

      {showPrecisionTooltip && (
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setShowPrecisionTooltip(false)}
        >
          <View style={styles.tooltipContainer}>
            <Text style={styles.tooltipTitle}>Precisão do GPS</Text>
            <Text style={styles.tooltipText}>
              {precisionStatus === 'green' && 'Alta (< 5m)'}
              {precisionStatus === 'yellow' && 'Média (5-15m)'}
              {precisionStatus === 'red' && 'Baixa (> 15m)'}
              {precisionStatus === 'gray' && 'Indisponível'}
            </Text>
            {accuracy !== null && (
              <Text style={styles.tooltipValue}>{accuracy.toFixed(1)}m</Text>
            )}
          </View>
        </TouchableOpacity>
      )}

      <View style={styles.mapZone}>
        <MapView
          ref={mapRef}
          style={styles.map}
          initialRegion={initialRegion}
          mapType={mapType}
          showsUserLocation={true}
          showsMyLocationButton={false}
          followsUserLocation={false}
        >
          {destino && (
            <Marker
              coordinate={{ latitude: destino.lat, longitude: destino.lng }}
              title={`Ponto ${destino.numPonto}`}
              pinColor="#22c55e"
            />
          )}
          {polylineCoordinates.length === 2 && (
            <Polyline
              coordinates={polylineCoordinates}
              strokeColor="#3b82f6"
              strokeWidth={3}
            />
          )}
        </MapView>

        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fab} onPress={handleCentralizar}>
            <Crosshair size={20} color="#fff" />
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, !destino && styles.fabDisabled]}
            onPress={handleEnquadrar}
            disabled={!destino}
          >
            <Target size={20} color={destino ? '#fff' : '#666'} />
          </TouchableOpacity>
          <TouchableOpacity style={[styles.fab, styles.mapTypeFab]} onPress={handleToggleMapType}>
            <Globe size={20} color="#fff" />
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.bottomPanel} contentContainerStyle={styles.bottomPanelContent} showsVerticalScrollIndicator={false}>
        {!rotaConcluida && destino && (
          <View style={styles.distanceCard}>
            <Text style={styles.distanceLabel}>Distância</Text>
            <Text style={styles.distanceValue}>{distanciaFmt}</Text>
          </View>
        )}

        <View style={styles.compassCard}>
          {rotaConcluida ? (
            <View style={styles.completedContainer}>
              <CheckCircle2 size={48} color="#22c55e" />
              <Text style={styles.completedText}>Rota Concluída!</Text>
            </View>
          ) : !destino ? (
            <Text style={styles.compassMessage}>Nenhum destino ativo</Text>
          ) : (
            <>
              <View style={styles.compassCircle}>
                <Animated.View
                  style={[
                    styles.compassRingGlow,
                    {
                      opacity: ringOpacityAnim,
                      borderColor: ringColor,
                      shadowColor: ringColor,
                    },
                  ]}
                />
                <View style={styles.compassRing}>
                  {[0, 45, 90, 135, 180, 225, 270, 315].map((deg) => (
                    <View
                      key={deg}
                      style={[styles.compassMark, { transform: [{ rotate: `${deg}deg` }] }]}
                    >
                      <View style={styles.compassMarkLine} />
                    </View>
                  ))}
                  <Text style={[styles.compassCardinal, styles.compassN]}>N</Text>
                  <Text style={[styles.compassCardinal, styles.compassE]}>E</Text>
                  <Text style={[styles.compassCardinal, styles.compassS]}>S</Text>
                  <Text style={[styles.compassCardinal, styles.compassW]}>W</Text>
                </View>
                {deltaSuavizado !== null && (
                  <Animated.View
                    style={[
                      styles.compassPointer,
                      {
                        transform: [
                          {
                            rotate: compassRotation.interpolate({
                              inputRange: [-360, 360],
                              outputRange: ['-360deg', '360deg'],
                            }),
                          },
                        ],
                      },
                    ]}
                  >
                    <Animated.View style={[styles.compassArrow, { borderBottomColor: pointerColor }]} />
                  </Animated.View>
                )}
              </View>

              <Text style={[
                styles.alignmentFeedback,
                alignmentState === 'aligned' && styles.alignmentGreen,
                alignmentState === 'adjust' && styles.alignmentYellow,
                alignmentState === 'off' && styles.alignmentRed,
              ]}>
                {alignmentMessage[alignmentState]}
              </Text>
            </>
          )}
        </View>

        <View style={styles.navigationControls}>
          <TouchableOpacity
            style={[styles.navButton, styles.navButtonSecondary, indiceAtual === 0 && styles.navButtonDisabled]}
            onPress={handleVoltarPonto}
            disabled={indiceAtual === 0}
          >
            <ArrowLeft size={18} color={indiceAtual === 0 ? '#666' : '#fff'} />
            <Text style={[styles.navButtonText, indiceAtual === 0 && styles.navButtonTextDisabled]}>Voltar</Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navButton,
              styles.navButtonPrimary,
              insideRadius && indiceAtual < pontos.length - 1 && styles.navButtonHighlighted,
              indiceAtual >= pontos.length - 1 && styles.navButtonDisabled,
            ]}
            onPress={handleProximoPonto}
            disabled={indiceAtual >= pontos.length - 1}
          >
            <Text style={[styles.navButtonText, indiceAtual >= pontos.length - 1 && styles.navButtonTextDisabled]}>
              Próximo
            </Text>
            <Play size={16} color={indiceAtual >= pontos.length - 1 ? '#666' : '#fff'} />
          </TouchableOpacity>

          <TouchableOpacity style={[styles.navButton, styles.navButtonDanger]} onPress={handleZerarRota}>
            <RotateCcw size={18} color="#fff" />
            <Text style={styles.navButtonText}>Zerar</Text>
          </TouchableOpacity>
        </View>

        {__DEV__ && (
          <View style={styles.diagnosticsCard}>
            <Text style={styles.diagnosticsTitle}>Diagnóstico (dev-only)</Text>
            <View style={styles.diagnosticsGrid}>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Plataforma:</Text>
                <Text style={styles.diagnosticsValue}>{Platform.OS}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>GPS Status:</Text>
                <Text style={styles.diagnosticsValue}>{gpsStatus}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Precisão:</Text>
                <Text style={styles.diagnosticsValue}>
                  {precisionStatus === 'green' ? 'Alta' : precisionStatus === 'yellow' ? 'Média' : precisionStatus === 'red' ? 'Baixa' : 'Indisp.'}
                  {accuracy !== null ? ` (${accuracy.toFixed(1)}m)` : ''}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Speed:</Text>
                <Text style={styles.diagnosticsValue}>{speed !== null ? `${speed.toFixed(2)} m/s` : '—'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Course:</Text>
                <Text style={styles.diagnosticsValue}>{course !== null && course >= 0 ? `${course.toFixed(1)}°` : '—'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Heading:</Text>
                <Text style={styles.diagnosticsValue}>{heading !== null ? `${heading.toFixed(1)}°` : '—'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Bearing:</Text>
                <Text style={styles.diagnosticsValue}>{bearing !== null ? `${bearing.toFixed(1)}°` : '—'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Delta:</Text>
                <Text style={styles.diagnosticsValue}>{deltaSuavizado !== null ? `${deltaSuavizado.toFixed(1)}°` : '—'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Distância:</Text>
                <Text style={styles.diagnosticsValue}>{distanciaM !== null ? formatDistance(distanciaM) : '—'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Inside raio:</Text>
                <Text style={styles.diagnosticsValue}>{insideRadius ? 'true' : 'false'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Ponto atual:</Text>
                <Text style={styles.diagnosticsValue}>{indiceAtual + 1} de {pontos.length}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Alignment:</Text>
                <Text style={styles.diagnosticsValue}>{alignmentState}</Text>
              </View>
            </View>
            <View style={styles.diagnosticsActions}>
              <TouchableOpacity style={styles.diagnosticsButton} onPress={handleCentralizar}>
                <Text style={styles.diagnosticsButtonText}>Center</Text>
              </TouchableOpacity>
              <TouchableOpacity
                style={[styles.diagnosticsButton, !destino && styles.diagnosticsButtonDisabled]}
                onPress={handleEnquadrar}
                disabled={!destino}
              >
                <Text style={[styles.diagnosticsButtonText, !destino && styles.buttonDisabled]}>Fit</Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.diagnosticsButton} onPress={handleLogDiagnostics}>
                <Text style={styles.diagnosticsButtonText}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}
      </ScrollView>

      {showCollectionModal && (
        <TouchableOpacity
          style={styles.modalOverlay}
          activeOpacity={1}
          onPress={handleCancelCollection}
        >
          <TouchableOpacity activeOpacity={1} onPress={(e) => e.stopPropagation()}>
            <View style={styles.modalContainer}>
              <Text style={styles.modalTitle}>Confirmar Coleta</Text>
              <Text style={styles.modalText}>
                Você concluiu a coleta no Ponto {indiceAtual + 1}?
              </Text>
              <View style={styles.modalButtons}>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonCancel]}
                  onPress={handleCancelCollection}
                >
                  <Text style={styles.modalButtonText}>❌ Cancelar</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[styles.modalButton, styles.modalButtonConfirm]}
                  onPress={handleConfirmCollection}
                >
                  <Text style={styles.modalButtonText}>✅ Confirmar</Text>
                </TouchableOpacity>
              </View>
            </View>
          </TouchableOpacity>
        </TouchableOpacity>
      )}

      {toastMessage && (
        <View style={styles.toastContainer}>
          <View style={styles.toast}>
            <Text style={styles.toastText}>{toastMessage}</Text>
          </View>
        </View>
      )}
    </LinearGradient>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    gap: 16,
  },
  loadingText: {
    fontSize: 16,
    color: '#a1a1aa',
    textAlign: 'center',
  },
  header: {
    paddingTop: 52,
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  headerTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  backButton: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  headerCenter: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  headerTitle: {
    fontSize: 18,
    fontWeight: '700',
    color: '#fff',
  },
  precisionIndicator: {
    width: 40,
    height: 40,
    borderRadius: 12,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  statusRow: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: 8,
  },
  statusChip: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(255, 255, 255, 0.08)',
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 20,
    gap: 6,
  },
  statusChipText: {
    fontSize: 11,
    color: '#d4d4d8',
    fontWeight: '600',
  },
  mapZone: {
    height: 240,
    marginHorizontal: 16,
    marginTop: 12,
    borderRadius: 16,
    overflow: 'hidden',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  map: {
    flex: 1,
  },
  fabContainer: {
    position: 'absolute',
    top: 10,
    right: 10,
    gap: 8,
  },
  fab: {
    width: 44,
    height: 44,
    borderRadius: 12,
    backgroundColor: 'rgba(59, 130, 246, 0.9)',
    justifyContent: 'center',
    alignItems: 'center',
  },
  fabDisabled: {
    backgroundColor: 'rgba(30, 30, 30, 0.8)',
  },
  mapTypeFab: {
    backgroundColor: 'rgba(245, 158, 11, 0.9)',
  },
  bottomPanel: {
    flex: 1,
  },
  bottomPanelContent: {
    padding: 16,
    paddingBottom: 32,
  },
  distanceCard: {
    backgroundColor: 'rgba(34, 197, 94, 0.15)',
    borderRadius: 16,
    padding: 16,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.3)',
  },
  distanceLabel: {
    fontSize: 12,
    color: '#86efac',
    fontWeight: '600',
    marginBottom: 4,
  },
  distanceValue: {
    fontSize: 32,
    fontWeight: '800',
    color: '#22c55e',
  },
  compassCard: {
    backgroundColor: 'rgba(30, 30, 40, 0.6)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255, 255, 255, 0.08)',
  },
  completedContainer: {
    alignItems: 'center',
    paddingVertical: 24,
    gap: 12,
  },
  completedText: {
    fontSize: 20,
    fontWeight: '700',
    color: '#22c55e',
  },
  compassMessage: {
    fontSize: 14,
    color: '#71717a',
    textAlign: 'center',
    paddingVertical: 32,
  },
  alignmentFeedback: {
    fontSize: 14,
    fontWeight: '600',
    marginTop: 16,
    color: '#a1a1aa',
  },
  alignmentGreen: {
    color: '#22c55e',
  },
  alignmentYellow: {
    color: '#f59e0b',
  },
  alignmentRed: {
    color: '#ef4444',
  },
  navigationControls: {
    flexDirection: 'row',
    gap: 10,
    marginBottom: 16,
  },
  navButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 14,
    borderRadius: 14,
    gap: 6,
  },
  navButtonSecondary: {
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
  },
  navButtonPrimary: {
    backgroundColor: '#22c55e',
  },
  navButtonDanger: {
    backgroundColor: 'rgba(239, 68, 68, 0.8)',
  },
  navButtonHighlighted: {
    backgroundColor: '#16a34a',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 6,
  },
  navButtonDisabled: {
    backgroundColor: 'rgba(30, 30, 30, 0.5)',
  },
  navButtonText: {
    fontSize: 14,
    fontWeight: '700',
    color: '#fff',
  },
  navButtonTextDisabled: {
    color: '#666',
  },
  errorText: {
    fontSize: 16,
    color: '#ef4444',
    textAlign: 'center',
    marginTop: 8,
  },
  webGradient: {
    flex: 1,
  },
  webScrollView: {
    flex: 1,
  },
  webScrollContent: {
    flexGrow: 1,
    paddingBottom: 40,
  },
  webContainer: {
    flex: 1,
    padding: 24,
  },
  webHeaderSection: {
    alignItems: 'center',
    marginBottom: 28,
    marginTop: 16,
  },
  webHeaderIcon: {
    width: 64,
    height: 64,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: 16,
    shadowColor: '#3b82f6',
    shadowOffset: { width: 0, height: 6 },
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 10,
  },
  webTitle: {
    fontSize: 28,
    fontWeight: '800',
    color: '#FFFFFF',
    letterSpacing: -0.5,
  },
  webSubtitle: {
    fontSize: 14,
    color: '#71717a',
    marginTop: 6,
    letterSpacing: 0.3,
  },
  webRouteBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: 'rgba(34, 197, 94, 0.1)',
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: 20,
    marginTop: 16,
    gap: 6,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  webRouteBadgeText: {
    fontSize: 13,
    color: '#22c55e',
    fontWeight: '600',
  },
  webInfoCard: {
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(245, 158, 11, 0.2)',
  },
  webInfoCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  webInfoIconWrapper: {
    width: 36,
    height: 36,
    borderRadius: 12,
    backgroundColor: 'rgba(245, 158, 11, 0.15)',
    alignItems: 'center',
    justifyContent: 'center',
    marginRight: 12,
  },
  webInfoCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  webInfoCardText: {
    fontSize: 14,
    color: '#a1a1aa',
    lineHeight: 20,
    marginBottom: 16,
  },
  webInfoCardFeatures: {
    gap: 10,
  },
  webFeatureItem: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
  },
  webFeatureText: {
    fontSize: 13,
    color: '#d4d4d8',
  },
  webLocationCard: {
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 16,
    borderWidth: 1,
    borderColor: 'rgba(34, 197, 94, 0.2)',
  },
  webLocationCardHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  webLocationCardTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
    flex: 1,
    marginLeft: 12,
  },
  webStatusDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  webStatusDotActive: {
    backgroundColor: '#22c55e',
    shadowColor: '#22c55e',
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 6,
  },
  webStatusDotWaiting: {
    backgroundColor: '#f59e0b',
  },
  webStatusDotError: {
    backgroundColor: '#ef4444',
  },
  webLocationLoading: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 16,
    gap: 12,
  },
  webLocationLoadingText: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  webLocationError: {
    alignItems: 'center',
    padding: 16,
    gap: 8,
  },
  webLocationErrorText: {
    fontSize: 14,
    color: '#ef4444',
    fontWeight: '600',
  },
  webLocationErrorHint: {
    fontSize: 12,
    color: '#71717a',
    textAlign: 'center',
  },
  webLocationData: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 12,
    padding: 16,
  },
  webLocationRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  webLocationLabel: {
    fontSize: 14,
    color: '#a1a1aa',
  },
  webLocationValue: {
    fontSize: 15,
    color: '#3b82f6',
    fontWeight: '600',
    fontFamily: 'monospace',
  },
  webLocationDivider: {
    height: 1,
    backgroundColor: 'rgba(255, 255, 255, 0.06)',
    marginVertical: 4,
  },
  webDestinationCard: {
    backgroundColor: 'rgba(30, 30, 40, 0.8)',
    borderRadius: 20,
    padding: 20,
    marginBottom: 20,
    borderWidth: 1,
    borderColor: 'rgba(167, 139, 250, 0.2)',
  },
  webDestinationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  webDestinationHeaderText: {
    marginLeft: 12,
    flex: 1,
  },
  webDestinationTitle: {
    fontSize: 16,
    fontWeight: '700',
    color: '#FFFFFF',
  },
  webDestinationSubtitle: {
    fontSize: 12,
    color: '#a78bfa',
    marginTop: 2,
  },
  webDestinationCoords: {
    backgroundColor: 'rgba(0, 0, 0, 0.2)',
    borderRadius: 10,
    padding: 12,
    alignItems: 'center',
  },
  webDestinationCoordsText: {
    fontSize: 14,
    color: '#a78bfa',
    fontFamily: 'monospace',
    fontWeight: '500',
  },
  webButtonsRow: {
    flexDirection: 'row',
    gap: 12,
    marginBottom: 24,
  },
  webBackButton: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(59, 130, 246, 0.15)',
    paddingVertical: 14,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(59, 130, 246, 0.3)',
    gap: 8,
  },
  webBackButtonText: {
    fontSize: 15,
    fontWeight: '600',
    color: '#3b82f6',
  },
  webFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 8,
    marginTop: 16,
  },
  webFooterText: {
    fontSize: 12,
    color: '#52525b',
  },
  webHeader: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 16,
    backgroundColor: '#1E1E1E',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  webContent: {
    flex: 1,
    padding: 24,
  },
  webCard: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 12,
    marginBottom: 24,
    borderLeftWidth: 4,
    borderLeftColor: '#FFA726',
  },
  webCardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  webCardText: {
    fontSize: 14,
    color: '#B0B0B0',
    lineHeight: 20,
  },
  webPositionCard: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 12,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
    marginBottom: 24,
  },
  webPositionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
  },
  webPositionWaiting: {
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
  },
  webPositionError: {
    fontSize: 14,
    color: '#F44336',
    marginBottom: 8,
  },
  webPositionErrorHint: {
    fontSize: 12,
    color: '#FFCDD2',
    fontStyle: 'italic',
  },
  webPositionCoords: {
    fontSize: 14,
    color: '#4CAF50',
    fontFamily: 'monospace',
    textAlign: 'center',
  },
  webHeadingText: {
    fontSize: 12,
    color: '#B0B0B0',
    fontStyle: 'italic',
    textAlign: 'center',
  },
  badgeCompleted: {
    borderColor: '#FFC107',
  },
  badgeCompletedText: {
    fontSize: 12,
    color: '#FFC107',
    fontWeight: '600',
  },
  precisionBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#333',
    gap: 6,
  },
  precisionDot: {
    width: 10,
    height: 10,
    borderRadius: 5,
    borderWidth: 2,
  },
  precisionDotGreen: {
    backgroundColor: '#2ecc71',
    borderColor: '#27ae60',
  },
  precisionDotYellow: {
    backgroundColor: '#f1c40f',
    borderColor: '#f39c12',
  },
  precisionDotRed: {
    backgroundColor: '#e74c3c',
    borderColor: '#c0392b',
  },
  precisionDotGray: {
    backgroundColor: '#8e8e8e',
    borderColor: '#666',
  },
  precisionLabel: {
    fontSize: 11,
    color: '#BDBDBD',
    fontWeight: '600',
  },
  tooltipOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.7)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1000,
  },
  tooltipContainer: {
    backgroundColor: '#1E1E1E',
    padding: 20,
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#333',
    maxWidth: '80%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.4,
    shadowRadius: 8,
    elevation: 10,
  },
  tooltipTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 12,
    textAlign: 'center',
  },
  tooltipText: {
    fontSize: 15,
    color: '#B0B0B0',
    textAlign: 'center',
    marginBottom: 8,
  },
  tooltipValue: {
    fontSize: 13,
    color: '#4CAF50',
    textAlign: 'center',
    fontFamily: 'monospace',
    fontWeight: '700',
  },
  navigationControls: {
    flexDirection: 'row',
    gap: 8,
    paddingHorizontal: 16,
    paddingVertical: 16,
  },
  navButton: {
    flex: 1,
    backgroundColor: '#4DA3FF',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#5AB2FF',
  },
  navButtonDisabled: {
    backgroundColor: '#1E1E1E',
    borderColor: '#333',
  },
  navButtonHighlighted: {
    backgroundColor: '#2ecc71',
    borderWidth: 2,
    borderColor: '#27ae60',
    shadowColor: '#2ecc71',
    shadowOffset: { width: 0, height: 3 },
    shadowOpacity: 0.5,
    shadowRadius: 6,
    elevation: 8,
  },
  navButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  resetButton: {
    flex: 1,
    backgroundColor: '#e74c3c',
    paddingHorizontal: 12,
    paddingVertical: 12,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    borderWidth: 1,
    borderColor: '#c0392b',
  },
  resetButtonText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '700',
    textAlign: 'center',
  },
  buttonDisabled: {
    color: '#666',
  },
  compassContainer: {
    backgroundColor: '#141414',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#242424',
  },
  compassTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 12,
  },
  compassMessage: {
    fontSize: 14,
    color: '#BDBDBD',
    textAlign: 'center',
    paddingVertical: 16,
  },
  compassData: {
    marginBottom: 16,
    gap: 4,
  },
  compassDataGrid: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
    gap: 16,
  },
  compassDataColumn: {
    flex: 1,
    gap: 8,
  },
  compassDataText: {
    fontSize: 12,
    color: '#BDBDBD',
    fontFamily: 'monospace',
  },
  compassCircle: {
    width: 200,
    height: 200,
    alignSelf: 'center',
    position: 'relative',
    marginVertical: 16,
  },
  compassRingGlow: {
    position: 'absolute',
    width: 210,
    height: 210,
    borderRadius: 105,
    borderWidth: 5,
    top: -5,
    left: -5,
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.8,
    shadowRadius: 12,
    elevation: 10,
  },
  compassRing: {
    width: 200,
    height: 200,
    borderRadius: 100,
    borderWidth: 2,
    borderColor: '#333',
    backgroundColor: '#0E0E0E',
    position: 'relative',
  },
  compassMark: {
    position: 'absolute',
    width: 200,
    height: 200,
    alignItems: 'center',
  },
  compassMarkLine: {
    width: 2,
    height: 12,
    backgroundColor: '#4DA3FF',
    marginTop: 4,
  },
  compassMarkText: {
    fontSize: 9,
    color: '#666',
    marginTop: 2,
    fontWeight: '600',
  },
  compassMinorMark: {
    position: 'absolute',
    width: 200,
    height: 200,
    alignItems: 'center',
  },
  compassMinorMarkLine: {
    width: 1,
    height: 6,
    backgroundColor: '#444',
    marginTop: 4,
  },
  compassCardinal: {
    position: 'absolute',
    fontSize: 18,
    fontWeight: '700',
    color: '#4DA3FF',
  },
  compassN: {
    top: 12,
    left: '50%',
    transform: [{ translateX: -9 }],
  },
  compassE: {
    right: 16,
    top: '50%',
    transform: [{ translateY: -9 }],
    color: '#666',
    fontSize: 14,
  },
  compassS: {
    bottom: 12,
    left: '50%',
    transform: [{ translateX: -9 }],
    color: '#666',
    fontSize: 14,
  },
  compassW: {
    left: 16,
    top: '50%',
    transform: [{ translateY: -9 }],
    color: '#666',
    fontSize: 14,
  },
  compassPointer: {
    position: 'absolute',
    width: 200,
    height: 200,
    justifyContent: 'center',
    alignItems: 'center',
  },
  compassArrow: {
    width: 0,
    height: 0,
    borderLeftWidth: 12,
    borderRightWidth: 12,
    borderBottomWidth: 70,
    borderLeftColor: 'transparent',
    borderRightColor: 'transparent',
    marginBottom: 50,
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.6,
    shadowRadius: 4,
    elevation: 4,
  },
  alignmentFeedback: {
    fontSize: 16,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
  },
  progressCard: {
    backgroundColor: '#141414',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#242424',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  progressTitle: {
    fontSize: 17,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 16,
  },
  progressMessage: {
    fontSize: 14,
    color: '#B0B0B0',
    textAlign: 'center',
    paddingVertical: 8,
  },
  progressData: {
    gap: 8,
  },
  progressRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    flexWrap: 'wrap',
  },
  progressLabel: {
    fontSize: 13,
    color: '#BDBDBD',
    fontWeight: '600',
  },
  progressValue: {
    fontSize: 16,
    color: '#4DA3FF',
    fontWeight: '700',
  },
  progressValueCoords: {
    fontSize: 11,
    color: '#BDBDBD',
    fontFamily: 'monospace',
    flex: 1,
    textAlign: 'right',
    opacity: 0.8,
  },
  toastContainer: {
    position: 'absolute',
    bottom: 100,
    left: 16,
    right: 16,
    alignItems: 'center',
    zIndex: 999,
  },
  toast: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 20,
    paddingVertical: 14,
    borderRadius: 8,
    maxWidth: '90%',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 8,
    borderWidth: 1,
    borderColor: '#81C784',
  },
  toastText: {
    color: '#FFFFFF',
    fontSize: 14,
    fontWeight: '600',
    textAlign: 'center',
  },
  modalOverlay: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    bottom: 0,
    backgroundColor: 'rgba(0, 0, 0, 0.75)',
    justifyContent: 'center',
    alignItems: 'center',
    zIndex: 1001,
  },
  modalContainer: {
    backgroundColor: '#1E1E1E',
    padding: 24,
    borderRadius: 16,
    width: '85%',
    maxWidth: 400,
    borderWidth: 2,
    borderColor: '#4CAF50',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 4 },
    shadowOpacity: 0.5,
    shadowRadius: 12,
    elevation: 15,
  },
  modalTitle: {
    fontSize: 22,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  modalText: {
    fontSize: 16,
    color: '#B0B0B0',
    marginBottom: 24,
    textAlign: 'center',
    lineHeight: 22,
  },
  modalButtons: {
    flexDirection: 'row',
    gap: 12,
  },
  modalButton: {
    flex: 1,
    paddingVertical: 14,
    paddingHorizontal: 16,
    borderRadius: 8,
    minHeight: 48,
    justifyContent: 'center',
    alignItems: 'center',
  },
  modalButtonCancel: {
    backgroundColor: '#F44336',
    borderWidth: 1,
    borderColor: '#E57373',
  },
  modalButtonConfirm: {
    backgroundColor: '#4CAF50',
    borderWidth: 1,
    borderColor: '#81C784',
  },
  modalButtonText: {
    color: '#FFFFFF',
    fontSize: 15,
    fontWeight: '700',
    textAlign: 'center',
  },
  diagnosticsCard: {
    backgroundColor: '#1A1A1A',
    paddingVertical: 16,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#333',
    borderBottomWidth: 1,
    borderBottomColor: '#333',
  },
  diagnosticsTitle: {
    fontSize: 15,
    fontWeight: '600',
    color: '#FFC107',
    textAlign: 'center',
    marginBottom: 12,
  },
  diagnosticsGrid: {
    gap: 8,
    marginBottom: 16,
  },
  diagnosticsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  diagnosticsLabel: {
    fontSize: 12,
    color: '#999',
    fontWeight: '600',
  },
  diagnosticsValue: {
    fontSize: 12,
    color: '#4DA3FF',
    fontFamily: 'monospace',
    fontWeight: '600',
  },
  diagnosticsActions: {
    flexDirection: 'row',
    gap: 8,
    justifyContent: 'center',
  },
  diagnosticsButton: {
    backgroundColor: '#333',
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
    minWidth: 70,
    alignItems: 'center',
  },
  diagnosticsButtonDisabled: {
    backgroundColor: '#1E1E1E',
  },
  diagnosticsButtonText: {
    color: '#FFFFFF',
    fontSize: 12,
    fontWeight: '600',
  },
});
