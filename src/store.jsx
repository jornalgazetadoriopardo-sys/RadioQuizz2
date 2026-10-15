import { createContext, useContext, useEffect, useMemo, useReducer } from 'react'
import { STORAGE_KEY } from './config.js'
import { ouvintesSeed, patrocinadoresSeed, premiosSeed, rodadasSeed } from './data/seed.js'

const estadoInicial = () => ({
  usuario: null, // { nome, pontos }
  rodadas: rodadasSeed,
  patrocinadores: patrocinadoresSeed,
  premios: premiosSeed,
  ouvintes: ouvintesSeed,
  respostas: {}, // { [rodadaId]: { alternativa, acertou, pontos, tempoGasto } }
  rodadaNoAr: null, // id escolhido pelo admin; null = próxima não respondida
  modoApresentacao: false,
})

function carregar() {
  try {
    const salvo = localStorage.getItem(STORAGE_KEY)
    if (salvo) return { ...estadoInicial(), ...JSON.parse(salvo) }
  } catch {
    // localStorage indisponível (aba anônima, etc.) — segue com o estado padrão
  }
  return estadoInicial()
}

const arred = (n) => Math.round(n * 100) / 100

function reducer(state, action) {
  switch (action.type) {
    case 'SET_USUARIO':
      return { ...state, usuario: { nome: action.nome, pontos: state.usuario?.pontos ?? 0 } }

    case 'REGISTRAR_RESPOSTA': {
      if (state.respostas[action.rodadaId]) return state
      const resposta = { alternativa: action.alternativa, acertou: action.acertou, pontos: action.pontos, tempoGasto: action.tempoGasto }
      return {
        ...state,
        respostas: { ...state.respostas, [action.rodadaId]: resposta },
        usuario: { ...state.usuario, pontos: arred((state.usuario?.pontos ?? 0) + action.pontos) },
      }
    }

    case 'UPSERT': {
      const lista = state[action.colecao]
      const existe = lista.some((i) => i.id === action.item.id)
      return {
        ...state,
        [action.colecao]: existe ? lista.map((i) => (i.id === action.item.id ? action.item : i)) : [...lista, action.item],
      }
    }

    case 'REMOVER':
      return {
        ...state,
        [action.colecao]: state[action.colecao].filter((i) => i.id !== action.id),
        rodadaNoAr: state.rodadaNoAr === action.id ? null : state.rodadaNoAr,
      }

    case 'SET_NO_AR': {
      // Colocar uma rodada no ar libera a resposta de novo (útil para repetir no demo).
      const { [action.id]: _, ...respostas } = state.respostas
      const pontosRemovidos = state.respostas[action.id]?.pontos ?? 0
      return {
        ...state,
        rodadaNoAr: action.id,
        respostas,
        usuario: state.usuario && { ...state.usuario, pontos: arred(state.usuario.pontos - pontosRemovidos) },
      }
    }

    case 'TOGGLE_APRESENTACAO':
      return { ...state, modoApresentacao: !state.modoApresentacao }

    case 'ZERAR_SEMANA':
      return {
        ...state,
        respostas: {},
        rodadaNoAr: null,
        ouvintes: state.ouvintes.map((o) => ({ ...o, pontos: 0 })),
        usuario: state.usuario && { ...state.usuario, pontos: 0 },
      }

    case 'RESET':
      return estadoInicial()

    default:
      return state
  }
}

const StoreContext = createContext(null)

export function StoreProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, undefined, carregar)

  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state))
    } catch {
      // ignora: o demo funciona sem persistência
    }
  }, [state])

  const derivados = useMemo(() => {
    const { rodadas, respostas, rodadaNoAr, ouvintes, usuario } = state
    const ordenadas = [...rodadas].sort((a, b) => a.horario.localeCompare(b.horario))
    const atual =
      ordenadas.find((r) => r.id === rodadaNoAr) ??
      ordenadas.find((r) => !respostas[r.id]) ??
      ordenadas[ordenadas.length - 1] ??
      null
    const idx = atual ? ordenadas.indexOf(atual) : -1
    const proxima = ordenadas.slice(idx + 1).find((r) => !respostas[r.id]) ?? null

    const ranking = [...ouvintes, ...(usuario ? [{ id: 'eu', nome: usuario.nome, pontos: usuario.pontos, eu: true }] : [])]
      .sort((a, b) => b.pontos - a.pontos)
      .map((o, i) => ({ ...o, posicao: i + 1 }))
    const minhaPosicao = ranking.find((o) => o.eu)?.posicao ?? null

    return { rodadasOrdenadas: ordenadas, rodadaAtual: atual, proximaRodada: proxima, ranking, minhaPosicao }
  }, [state])

  const value = useMemo(() => ({ state, dispatch, ...derivados }), [state, derivados])
  return <StoreContext.Provider value={value}>{children}</StoreContext.Provider>
}

export function useStore() {
  return useContext(StoreContext)
}

export function calcularPontos(valorMaximo, tempoRestante, tempoTotal) {
  // Acertou rápido = valor cheio; acertou no último segundo = metade.
  return arred(valorMaximo * (0.5 + 0.5 * (tempoRestante / tempoTotal)))
}

export const fmt = (n) => Number(n).toFixed(2)
