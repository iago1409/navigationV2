import React, { useEffect, useState, useRef } from 'react';
import { View, Text, StyleSheet, Platform, Alert, TouchableOpacity, ScrollView, Animated } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/lib/store';
import { bearingBetween, deltaHeading, haversineMeters, formatDistance } from '@/lib/geo';
import * as Location from 'expo-location';
import * as Haptics from 'expo-haptics';
import MapView, { Marker, Polyline, Region } from 'react-native-maps';

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

  const isWeb = Platform.OS === 'web';

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
      <View style={styles.container}>
        <View style={styles.webHeader}>
          <Text style={styles.title}>Navegação GPS</Text>
          {pontos.length > 0 && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>Rota: {pontos.length} pontos</Text>
            </View>
          )}
        </View>

        <View style={styles.webContent}>
          <View style={styles.webCard}>
            <Text style={styles.webCardTitle}>Mapa indisponível no Web</Text>
            <Text style={styles.webCardText}>
              O mapa nativo está disponível no mobile (Expo Go). No navegador, apenas as
              coordenadas de localização são exibidas.
            </Text>
          </View>

          <View style={styles.webPositionCard}>
            <Text style={styles.webPositionTitle}>Sua posição (Web)</Text>
            {gpsStatus === 'aguardando' && (
              <Text style={styles.webPositionWaiting}>Aguardando posição…</Text>
            )}
            {gpsStatus === 'negado' && (
              <View>
                <Text style={styles.webPositionError}>
                  Permissão negada ou indisponível no navegador.
                </Text>
                <Text style={styles.webPositionErrorHint}>
                  Tente novamente e verifique permissões de localização do site.
                </Text>
              </View>
            )}
            {gpsStatus === 'permitido' && posAtual && (
              <View>
                <Text style={styles.webPositionCoords}>
                  Lat: {posAtual.lat.toFixed(8)} | Lng: {posAtual.lng.toFixed(8)}
                </Text>
              </View>
            )}
          </View>

          <View style={styles.webPositionCard}>
            <Text style={styles.webPositionTitle}>Bússola (Web)</Text>
            <Text style={styles.webHeadingText}>Direção híbrida indisponível no Web</Text>
          </View>
        </View>
      </View>
    );
  }

  if (gpsStatus === 'aguardando') {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Obtendo permissão de GPS…</Text>
      </View>
    );
  }

  if (gpsStatus === 'negado') {
    return (
      <View style={styles.container}>
        <Text style={styles.errorText}>Permissão de localização negada.</Text>
      </View>
    );
  }

  if (!posAtual) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Localização ainda não disponível.</Text>
      </View>
    );
  }

  if (pontos.length === 0) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Nenhum ponto carregado.</Text>
      </View>
    );
  }

  if (!initialRegion) {
    return (
      <View style={styles.container}>
        <Text style={styles.statusText}>Aguardando coordenadas…</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Navegação GPS</Text>
        <View style={styles.badgeContainer}>
          {!rotaConcluida && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>
                Ponto {indiceAtual + 1} de {pontos.length}
              </Text>
            </View>
          )}
          {rotaConcluida && (
            <View style={[styles.badge, styles.badgeCompleted]}>
              <Text style={styles.badgeCompletedText}>Rota concluída!</Text>
            </View>
          )}
          <View style={[styles.badge, styles.collectedBadge]}>
            <Text style={styles.badgeText}>
              Coletados: {coletasConcluidas.length} / {pontos.length}
            </Text>
          </View>
          <View style={[styles.badge, styles.modeBadge]}>
            <Text style={styles.badgeText}>Modo: {mode}</Text>
          </View>
          <View style={styles.badge}>
            <Text style={styles.badgeText}>
              GPS: {gpsStatus === 'permitido' ? 'Ativo' : gpsStatus === 'aguardando' ? 'Aguardando' : 'Negado'}
            </Text>
          </View>
          {!isWeb && (
            <TouchableOpacity
              style={styles.precisionBadge}
              onPress={() => setShowPrecisionTooltip(!showPrecisionTooltip)}
              accessibilityLabel={`Precisão do GPS: ${
                precisionStatus === 'green'
                  ? 'alta'
                  : precisionStatus === 'yellow'
                  ? 'moderada'
                  : precisionStatus === 'red'
                  ? 'baixa'
                  : 'indisponível'
              }`}
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
              <Text style={styles.precisionLabel}>Precisão</Text>
            </TouchableOpacity>
          )}
        </View>
      </View>

      {showPrecisionTooltip && !isWeb && (
        <TouchableOpacity
          style={styles.tooltipOverlay}
          activeOpacity={1}
          onPress={() => setShowPrecisionTooltip(false)}
        >
          <View style={styles.tooltipContainer}>
            <Text style={styles.tooltipTitle}>Precisão do GPS</Text>
            <Text style={styles.tooltipText}>
              {precisionStatus === 'green' && '🟢 Precisão alta (< 5 m)'}
              {precisionStatus === 'yellow' && '🟡 Precisão moderada (5–15 m)'}
              {precisionStatus === 'red' && '🔴 Precisão baixa (> 15 m)'}
              {precisionStatus === 'gray' && '⚪ Precisão indisponível'}
            </Text>
            {accuracy !== null && (
              <Text style={styles.tooltipValue}>Atual: {accuracy.toFixed(1)} m</Text>
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
              pinColor="#4CAF50"
            />
          )}

          {polylineCoordinates.length === 2 && (
            <Polyline
              coordinates={polylineCoordinates}
              strokeColor="#2196F3"
              strokeWidth={3}
            />
          )}
        </MapView>

        <View style={styles.fabContainer}>
          <TouchableOpacity style={styles.fab} onPress={handleCentralizar}>
            <Text style={styles.fabText}>⊙</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.fab, !destino && styles.fabDisabled]}
            onPress={handleEnquadrar}
            disabled={!destino}
          >
            <Text style={[styles.fabText, !destino && styles.fabTextDisabled]}>⊡</Text>
          </TouchableOpacity>
          <TouchableOpacity 
            style={[styles.fab, styles.mapTypeFab]} 
            onPress={handleToggleMapType}
          >
            <Text style={styles.fabText}>
              {mapType === 'standard' ? '🛰️' : '🗺️'}
            </Text>
          </TouchableOpacity>
        </View>
      </View>

      <ScrollView style={styles.bottomPanel} contentContainerStyle={styles.bottomPanelContent}>
        <View style={styles.progressCard}>
        <Text style={styles.progressTitle}>Progresso da Navegação</Text>
        {rotaConcluida ? (
          <Text style={styles.progressMessage}>Rota concluída!</Text>
        ) : !destino ? (
          <Text style={styles.progressMessage}>Nenhum destino ativo.</Text>
        ) : (
          <View style={styles.progressData}>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Progresso:</Text>
              <Text style={styles.progressValue}>
                Ponto {indiceAtual + 1} de {pontos.length}
              </Text>
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Distância até o destino:</Text>
              <Text style={styles.progressValue}>{distanciaFmt}</Text>
            </View>
            <View style={styles.progressRow}>
              <Text style={styles.progressLabel}>Destino:</Text>
              <Text style={styles.progressValueCoords}>
                Lat {destino.lat.toFixed(8)} | Lng {destino.lng.toFixed(8)}
              </Text>
            </View>
          </View>
        )}
      </View>

        <View style={styles.compassContainer}>
          <Text style={styles.compassTitle}>Bússola de Navegação</Text>

          {rotaConcluida ? (
            <Text style={styles.compassMessage}>Rota concluída!</Text>
          ) : !destino ? (
            <Text style={styles.compassMessage}>Rota ou posição indisponível.</Text>
          ) : isWeb ? (
            <Text style={styles.compassMessage}>Indisponível no navegador</Text>
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
                  {[0, 30, 60, 90, 120, 150, 180, 210, 240, 270, 300, 330].map((deg) => (
                    <View
                      key={deg}
                      style={[
                        styles.compassMark,
                        { transform: [{ rotate: `${deg}deg` }] },
                      ]}
                    >
                      <View style={styles.compassMarkLine} />
                      <Text style={styles.compassMarkText}>{deg}</Text>
                    </View>
                  ))}
                  {[10, 20, 40, 50, 70, 80, 100, 110, 130, 140, 160, 170, 190, 200, 220, 230, 250, 260, 280, 290, 310, 320, 340, 350].map((deg) => (
                    <View
                      key={deg}
                      style={[
                        styles.compassMinorMark,
                        { transform: [{ rotate: `${deg}deg` }] },
                      ]}
                    >
                      <View style={styles.compassMinorMarkLine} />
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
                    <Animated.View
                      style={[
                        styles.compassArrow,
                        {
                          borderBottomColor: pointerColor,
                        },
                      ]}
                    />
                  </Animated.View>
                )}
              </View>

              <Text style={styles.alignmentFeedback}>
                {alignmentMessage[alignmentState]}
              </Text>
            </>
          )}
        </View>

        <View style={styles.navigationControls}>
          <TouchableOpacity
            style={[styles.navButton, indiceAtual === 0 && styles.navButtonDisabled]}
            onPress={handleVoltarPonto}
            disabled={indiceAtual === 0}
          >
            <Text style={[styles.navButtonText, indiceAtual === 0 && styles.buttonDisabled]}>
              ⬅ Voltar
            </Text>
          </TouchableOpacity>

          <TouchableOpacity
            style={[
              styles.navButton,
              insideRadius && indiceAtual < pontos.length - 1 && styles.navButtonHighlighted,
              indiceAtual >= pontos.length - 1 && styles.navButtonDisabled,
            ]}
            onPress={handleProximoPonto}
            disabled={indiceAtual >= pontos.length - 1}
          >
            <Text
              style={[
                styles.navButtonText,
                indiceAtual >= pontos.length - 1 && styles.buttonDisabled,
              ]}
            >
              Próximo ➡
            </Text>
          </TouchableOpacity>

          <TouchableOpacity style={styles.resetButton} onPress={handleZerarRota}>
            <Text style={styles.resetButtonText}>🔁 Zerar</Text>
          </TouchableOpacity>
        </View>

        {__DEV__ && (
          <View style={styles.diagnosticsCard}>
            <Text style={styles.diagnosticsTitle}>🔧 Diagnóstico (dev-only)</Text>

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
                <Text style={styles.diagnosticsValue}>
                  {speed !== null ? `${speed.toFixed(2)} m/s` : '—'}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Course:</Text>
                <Text style={styles.diagnosticsValue}>
                  {course !== null && course >= 0 ? `${course.toFixed(1)}°` : '—'}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Heading:</Text>
                <Text style={styles.diagnosticsValue}>
                  {heading !== null ? `${heading.toFixed(1)}°` : '—'}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Bearing:</Text>
                <Text style={styles.diagnosticsValue}>
                  {bearing !== null ? `${bearing.toFixed(1)}°` : '—'}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Delta:</Text>
                <Text style={styles.diagnosticsValue}>
                  {deltaSuavizado !== null ? `${deltaSuavizado.toFixed(1)}°` : '—'}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Distância:</Text>
                <Text style={styles.diagnosticsValue}>
                  {distanciaM !== null ? formatDistance(distanciaM) : '—'}
                </Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Inside raio:</Text>
                <Text style={styles.diagnosticsValue}>{insideRadius ? 'true' : 'false'}</Text>
              </View>
              <View style={styles.diagnosticsRow}>
                <Text style={styles.diagnosticsLabel}>Ponto atual:</Text>
                <Text style={styles.diagnosticsValue}>
                  {indiceAtual + 1} de {pontos.length}
                </Text>
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
                <Text style={[styles.diagnosticsButtonText, !destino && styles.buttonDisabled]}>
                  Fit
                </Text>
              </TouchableOpacity>
              <TouchableOpacity style={styles.diagnosticsButton} onPress={handleLogDiagnostics}>
                <Text style={styles.diagnosticsButtonText}>Log</Text>
              </TouchableOpacity>
            </View>
          </View>
        )}

        <View style={styles.footer}>
          <Text style={styles.coordsText}>
            Lat: {posAtual.lat.toFixed(8)} | Lng: {posAtual.lng.toFixed(8)}
          </Text>
        </View>
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
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#0E0E0E',
  },
  header: {
    paddingTop: 48,
    paddingHorizontal: 16,
    paddingBottom: 12,
    backgroundColor: '#141414',
    borderBottomWidth: 1,
    borderBottomColor: '#242424',
  },
  title: {
    fontSize: 18,
    fontWeight: '600',
    color: '#FFFFFF',
    textAlign: 'center',
    marginBottom: 8,
  },
  badgeContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: 8,
  },
  badge: {
    backgroundColor: '#1E1E1E',
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: '#2ecc71',
  },
  badgeText: {
    fontSize: 11,
    color: '#FFFFFF',
    fontWeight: '600',
  },
  modeBadge: {
    borderColor: '#4DA3FF',
  },
  collectedBadge: {
    borderColor: '#f1c40f',
  },
  mapZone: {
    height: 280,
    marginHorizontal: 20,
    marginTop: 16,
    backgroundColor: '#000',
    borderRadius: 12,
    borderWidth: 2,
    borderColor: '#888888',
    overflow: 'hidden',
  },
  map: {
    flex: 1,
    borderRadius: 10,
  },
  fabContainer: {
    position: 'absolute',
    top: 12,
    right: 12,
    gap: 8,
  },
  fab: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: '#2196F3',
    justifyContent: 'center',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 2 },
    shadowOpacity: 0.3,
    shadowRadius: 4,
    elevation: 5,
  },
  fabDisabled: {
    backgroundColor: '#2E2E2E',
  },
  fabText: {
    fontSize: 24,
    color: '#FFFFFF',
    fontWeight: 'bold',
  },
  fabTextDisabled: {
    color: '#666',
  },
  mapTypeFab: {
    backgroundColor: '#FF9500',
  },
  bottomPanel: {
    flex: 1,
    backgroundColor: '#121212',
  },
  bottomPanelContent: {
    flexGrow: 1,
    paddingBottom: 20,
  },
  footer: {
    backgroundColor: '#141414',
    paddingVertical: 12,
    paddingHorizontal: 16,
    borderTopWidth: 1,
    borderTopColor: '#242424',
  },
  coordsText: {
    fontSize: 11,
    color: '#666',
    textAlign: 'center',
    fontFamily: 'monospace',
    opacity: 0.8,
  },
  statusText: {
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
  },
  errorText: {
    fontSize: 16,
    color: '#F44336',
    textAlign: 'center',
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
