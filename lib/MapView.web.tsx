import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const MapView = React.forwardRef((_props: any, _ref: any) => {
  return (
    <View style={styles.container}>
      <Text style={styles.text}>Map not available on web</Text>
    </View>
  );
});

export const Marker = (_props: any) => null;
export const Polyline = (_props: any) => null;
export type Region = {
  latitude: number;
  longitude: number;
  latitudeDelta: number;
  longitudeDelta: number;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#1a1a2e',
  },
  text: {
    color: '#ffffff',
    fontSize: 16,
  },
});

export default MapView;
