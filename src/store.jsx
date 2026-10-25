import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { useAuth } from './auth.jsx'
import { supabase } from './supabase.js'
import { agoraServidor } from './relogio.js'

const DataContext = createContext(null)

// Tabelas carregadas por todos e atualizadas em tempo real quando o admin muda algo.
const CONSULTAS = {
  rodadas: () => supabase.from('rodadas').select('*').order('data', { ascending: true, nullsFirst: true }).order('horario'),
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
    // Próxima = primeira agendada depois de agora (rodada sem data conta como de hoje).
    const hoje = hojeSP()
    const agora = `${hoje} ${horaSP()}`
    const quando = (r) => `${r.data ?? hoje} ${r.horario}`
    const proximaRodada = rodadas.filter((r) => r.status === 'agendada' && quando(r) > agora).sort((a, b) => quando(a).localeCompare(quando(b)))[0] ?? null
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

// Data e hora de Brasília pelo relógio do servidor (o celular pode estar em outro fuso ou com a hora errada).
export const hojeSP = () => agoraServidor().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
export const horaSP = () => agoraServidor().toLocaleTimeString('pt-BR', { timeZone: 'America/Sao_Paulo', hour: '2-digit', minute: '2-digit', hour12: false })
// '2026-10-21' → '21/10'
export const diaMes = (data) => (data ? `${data.slice(8, 10)}/${data.slice(5, 7)}` : '')
/** "10:30" se for hoje (ou sem data), "22/10 às 10:30" se for outro dia. */
export const quandoTexto = (r) => (r.data && r.data !== hojeSP() ? `${diaMes(r.data)} às ${r.horario}` : r.horario)

// Pontos no formato brasileiro: 53,75
export const fmt = (n) => Number(n ?? 0).toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
