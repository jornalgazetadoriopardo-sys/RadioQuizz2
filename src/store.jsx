import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth.jsx'
import { supabase } from './supabase.js'

const DataContext = createContext(null)

// Tabelas carregadas por todos e atualizadas em tempo real quando o admin muda algo.
const CONSULTAS = {
  rodadas: () => supabase.from('rodadas').select('*').order('horario'),
  patrocinadores: () => supabase.from('patrocinadores').select('*').eq('ativo', true).order('criado_em'),
  premios: () => supabase.from('premios').select('*').order('colocacao'),
  configuracoes: () => supabase.from('configuracoes').select('*').eq('id', 1).maybeSingle(),
}

export function DataProvider({ children }) {
  const { sessao } = useAuth()
  const usuarioId = sessao?.user?.id
  const [dados, setDados] = useState({ rodadas: [], patrocinadores: [], premios: [], configuracoes: null })
  const [minhasRespostas, setMinhasRespostas] = useState({})
  const [carregando, setCarregando] = useState(true)
  const [erro, setErro] = useState(null)

  const recarregar = useCallback(async (tabela) => {
    const { data, error } = await CONSULTAS[tabela]()
    if (error) return setErro(error)
    setDados((d) => ({ ...d, [tabela]: data }))
  }, [])

  const recarregarMinhasRespostas = useCallback(async () => {
    if (!usuarioId) return
    const { data } = await supabase.from('respostas').select('*').eq('usuario_id', usuarioId)
    setMinhasRespostas(Object.fromEntries((data ?? []).map((r) => [r.rodada_id, r])))
  }, [usuarioId])

  useEffect(() => {
    if (!usuarioId) return
    let ativo = true
    setCarregando(true)
    Promise.all([...Object.keys(CONSULTAS).map(recarregar), recarregarMinhasRespostas()]).finally(() => ativo && setCarregando(false))

    // Tempo real: quando o admin solta uma pergunta, todos os celulares recebem na hora.
    const canal = supabase.channel('quiz')
    for (const tabela of Object.keys(CONSULTAS)) {
      canal.on('postgres_changes', { event: '*', schema: 'public', table: tabela }, () => {
        recarregar(tabela)
        // Ao recolocar uma rodada no ar, o admin pode ter apagado respostas antigas.
        if (tabela === 'rodadas') recarregarMinhasRespostas()
      })
    }
    canal.subscribe()

    // Rede de segurança: se o tempo real cair (celular em segundo plano), atualiza ao voltar para o app.
    const aoVoltar = () => document.visibilityState === 'visible' && recarregar('rodadas')
    document.addEventListener('visibilitychange', aoVoltar)

    return () => {
      ativo = false
      supabase.removeChannel(canal)
      document.removeEventListener('visibilitychange', aoVoltar)
    }
  }, [usuarioId, recarregar, recarregarMinhasRespostas])

  const value = useMemo(() => {
    const { rodadas } = dados
    const rodadaNoAr = rodadas.find((r) => r.status === 'no_ar') ?? null
    const agora = new Date().toTimeString().slice(0, 5)
    const agendadas = rodadas.filter((r) => r.status === 'agendada')
    const proximaRodada = agendadas.find((r) => r.horario > (rodadaNoAr?.horario ?? agora)) ?? agendadas[0] ?? null
    return {
      ...dados,
      modoApresentacao: dados.configuracoes?.modo_apresentacao ?? false,
      minhasRespostas,
      rodadaNoAr,
      proximaRodada,
      carregando,
      erro,
      recarregar,
      recarregarMinhasRespostas,
    }
  }, [dados, minhasRespostas, carregando, erro, recarregar, recarregarMinhasRespostas])

  return <DataContext.Provider value={value}>{children}</DataContext.Provider>
}

export const useDados = () => useContext(DataContext)

/** Ranking da semana, calculado no servidor. Atualiza a cada 20 s e quando `gatilho` muda. */
export function useRanking(limite = 10, gatilho) {
  const [ranking, setRanking] = useState(null)
  const carregar = useCallback(async () => {
    const { data } = await supabase.rpc('ranking_semana', { p_limite: limite })
    if (data) setRanking(data.map((l) => ({ ...l, pontos: Number(l.pontos), posicao: Number(l.posicao) })))
  }, [limite])

  useEffect(() => {
    carregar()
    const id = setInterval(carregar, 20000)
    return () => clearInterval(id)
  }, [carregar, gatilho])

  return { ranking, eu: ranking?.find((l) => l.eu) ?? null, recarregar: carregar }
}

// Pontos no formato brasileiro: 53,75
export const fmt = (n) => Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
