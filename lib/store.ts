import { create } from 'zustand';

export interface Ponto {
  numPonto: number;
  lat: number;
  lng: number;
}

export interface PosicaoAtual {
  lat: number;
  lng: number;
}

export interface ColetaConcluida {
  numPonto: number;
  timestamp: number;
}

export type GpsStatus = 'aguardando' | 'permitido' | 'negado';
export type HeadingStatus = 'ativo' | 'indisponivel';
export type Mode = 'GPS' | 'BUSSOLA';

interface AppState {
  pontos: Ponto[];
  indiceAtual: number;
  rotaConcluida: boolean;
  posAtual?: PosicaoAtual;
  heading?: number;
  mode?: Mode;
  gpsStatus: GpsStatus;
  headingStatus: HeadingStatus;
  coletasConcluidas: ColetaConcluida[];

  setPontos: (p: Ponto[]) => void;
  setIndiceAtual: (i: number) => void;
  setRotaConcluida: (b: boolean) => void;
  setPosAtual: (pos?: PosicaoAtual) => void;
  setHeading: (h?: number) => void;
  setMode: (m?: Mode) => void;
  setGpsStatus: (s: GpsStatus) => void;
  setHeadingStatus: (s: HeadingStatus) => void;
  addColetaConcluida: (numPonto: number) => void;
  resetRota: () => void;
}

export const useAppStore = create<AppState>((set) => ({
  pontos: [],
  indiceAtual: 0,
  rotaConcluida: false,
  posAtual: undefined,
  heading: undefined,
  mode: undefined,
  gpsStatus: 'aguardando',
  headingStatus: 'indisponivel',
  coletasConcluidas: [],

  setPontos: (p) => set({ pontos: p }),
  setIndiceAtual: (i) => set({ indiceAtual: i }),
  setRotaConcluida: (b) => set({ rotaConcluida: b }),
  setPosAtual: (pos) => set({ posAtual: pos }),
  setHeading: (h) => set({ heading: h }),
  setMode: (m) => set({ mode: m }),
  setGpsStatus: (s) => set({ gpsStatus: s }),
  setHeadingStatus: (s) => set({ headingStatus: s }),
  addColetaConcluida: (numPonto) =>
    set((state) => ({
      coletasConcluidas: [...state.coletasConcluidas, { numPonto, timestamp: Date.now() }],
    })),

  resetRota: () =>
    set({
      indiceAtual: 0,
      rotaConcluida: false,
      coletasConcluidas: [],
    }),
}));
