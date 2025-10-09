import { View, Text, TouchableOpacity, StyleSheet, TextInput, ScrollView, ActivityIndicator } from 'react-native';
import { useRouter } from 'expo-router';
import { useAppStore } from '@/lib/store';
import { validateAndNormalizeRoute } from '@/lib/validation';
import { useState } from 'react';

export default function ImportScreen() {
  const router = useRouter();
  const pontos = useAppStore((state) => state.pontos);
  const setPontos = useAppStore((state) => state.setPontos);
  const setIndiceAtual = useAppStore((state) => state.setIndiceAtual);

  const [jsonInput, setJsonInput] = useState('');
  const [errors, setErrors] = useState<string[]>([]);
  const [success, setSuccess] = useState<string>('');
  const [loading, setLoading] = useState(false);

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
          setErrors(['JSON inválido.']);
          setLoading(false);
          return;
        }

        const { pontos: validatedPontos } = validateAndNormalizeRoute(data);

        setPontos(validatedPontos);
        setIndiceAtual(0);
        setSuccess(`Rota válida: ${validatedPontos.length} pontos. Prosseguindo para Navegação…`);

        setTimeout(() => {
          router.push('/navigate');
        }, 800);
      } catch (e) {
        if (e instanceof Error) {
          const errorMessages = e.message.split('\n').filter((msg) => msg.trim());
          setErrors(errorMessages);
        } else {
          setErrors(['Erro desconhecido ao validar a rota.']);
        }
        setLoading(false);
      }
    }, 350);
  };

  return (
    <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
      <View style={styles.container}>
        <Text style={styles.title}>Importar Rota GPS</Text>

        <Text style={styles.description}>
          Cole abaixo o JSON dos pontos GPS no formato especificado.
        </Text>

        <View style={styles.card}>
          <Text style={styles.cardTitle}>Regras de Validação</Text>
          <Text style={styles.cardText}>• numPonto: sequência 1, 2, 3... (sem duplicados)</Text>
          <Text style={styles.cardText}>• lat ∈ [-90, 90]</Text>
          <Text style={styles.cardText}>• lng ∈ [-180, 180]</Text>
          <Text style={styles.cardText}>• Sem duplicados de numPonto</Text>
        </View>

        <TextInput
          style={styles.textArea}
          multiline
          numberOfLines={10}
          value={jsonInput}
          onChangeText={setJsonInput}
          placeholder='[{"numPonto": 1, "lat": -23.5505, "lng": -46.6333}, {"numPonto": 2, "lat": -23.5506, "lng": -46.6334}]'
          placeholderTextColor="#666"
        />

        {errors.length > 0 && (
          <View style={styles.errorContainer}>
            <Text style={styles.errorTitle}>Erros encontrados:</Text>
            {errors.map((error, index) => (
              <Text key={index} style={styles.errorText}>
                {index + 1}. {error}
              </Text>
            ))}
          </View>
        )}

        {success && (
          <View style={styles.successContainer}>
            <Text style={styles.successText}>{success}</Text>
          </View>
        )}

        {pontos.length > 0 && !success && (
          <Text style={styles.info}>Pontos carregados: {pontos.length}</Text>
        )}

        <TouchableOpacity
          style={[styles.button, (loading || !jsonInput.trim()) && styles.buttonDisabled]}
          onPress={handleValidateAndNavigate}
          disabled={loading || !jsonInput.trim()}
          activeOpacity={0.7}
        >
          {loading ? (
            <View style={styles.buttonContent}>
              <ActivityIndicator size="small" color="#FFFFFF" style={styles.spinner} />
              <Text style={styles.buttonText}>Validando...</Text>
            </View>
          ) : (
            <Text style={styles.buttonText}>Validar & Navegar</Text>
          )}
        </TouchableOpacity>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
    backgroundColor: '#121212',
  },
  scrollContent: {
    flexGrow: 1,
  },
  container: {
    flex: 1,
    padding: 20,
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 16,
    textAlign: 'center',
  },
  description: {
    fontSize: 16,
    color: '#B0B0B0',
    textAlign: 'center',
    marginBottom: 24,
    lineHeight: 22,
  },
  card: {
    backgroundColor: '#1E1E1E',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#FFFFFF',
    marginBottom: 10,
  },
  cardText: {
    fontSize: 14,
    color: '#B0B0B0',
    marginBottom: 4,
  },
  textArea: {
    backgroundColor: '#1E1E1E',
    color: '#FFFFFF',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 8,
    padding: 12,
    fontSize: 14,
    minHeight: 200,
    textAlignVertical: 'top',
    marginBottom: 20,
    fontFamily: 'monospace',
  },
  errorContainer: {
    backgroundColor: '#2C1111',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#F44336',
  },
  errorTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#F44336',
    marginBottom: 10,
  },
  errorText: {
    fontSize: 14,
    color: '#FFCDD2',
    marginBottom: 4,
  },
  successContainer: {
    backgroundColor: '#1B2E1B',
    padding: 16,
    borderRadius: 8,
    marginBottom: 20,
    borderLeftWidth: 4,
    borderLeftColor: '#4CAF50',
  },
  successText: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  info: {
    fontSize: 16,
    color: '#B0B0B0',
    marginBottom: 20,
    textAlign: 'center',
  },
  button: {
    backgroundColor: '#4CAF50',
    paddingHorizontal: 30,
    paddingVertical: 15,
    borderRadius: 8,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 48,
  },
  buttonDisabled: {
    backgroundColor: '#333',
    opacity: 0.6,
  },
  buttonContent: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
  },
  spinner: {
    marginRight: 8,
  },
  buttonText: {
    color: '#FFFFFF',
    fontSize: 16,
    fontWeight: '600',
  },
});
