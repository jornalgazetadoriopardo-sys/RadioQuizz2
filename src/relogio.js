import { useEffect, useState } from 'react'
import { supabase } from './supabase.js'

// Hora oficial = hora do servidor. Medimos a diferença para o relógio do aparelho
// e corrigimos tudo o que mostra ou compara horário.
let diferencaMs = 0
let sincronizado = false
let ultimaSincronia = 0
let emAndamento = null

// Várias telas pedem a sincronia ao mesmo tempo: todas esperam a mesma consulta.
export function sincronizarRelogio() {
  if (emAndamento) return emAndamento
  if (Date.now() - ultimaSincronia < 60_000) return Promise.resolve()
  ultimaSincronia = Date.now()
  emAndamento = consultarServidor().finally(() => {
    emAndamento = null
  })
  return emAndamento
}

async function consultarServidor() {
  const antes = Date.now()
  const { data, error } = await supabase.rpc('agora_servidor')
  const depois = Date.now()
  if (error || !data) return
  // a resposta saiu do servidor mais ou menos no meio da ida e volta
  diferencaMs = new Date(data).getTime() - (antes + depois) / 2
  sincronizado = true
}

export const agoraServidor = () => new Date(Date.now() + diferencaMs)
export const relogioSincronizado = () => sincronizado
export const diferencaDoAparelhoMs = () => diferencaMs

export const fmtHora = (d, segundos = true) =>
  d.toLocaleTimeString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    hour: '2-digit',
    minute: '2-digit',
    ...(segundos ? { second: '2-digit' } : {}),
    hour12: false,
  })

/** Hora oficial atualizada a cada segundo (ressincroniza a cada 5 minutos). */
export function useRelogio() {
  const [agora, setAgora] = useState(agoraServidor)
  useEffect(() => {
    sincronizarRelogio().then(() => setAgora(agoraServidor()))
    const tique = setInterval(() => setAgora(agoraServidor()), 1000)
    const sync = setInterval(sincronizarRelogio, 5 * 60_000)
    return () => {
      clearInterval(tique)
      clearInterval(sync)
    }
  }, [])
  return agora
}

/** Instante de início/fim de uma rodada (data + "HH:MM", horário de Brasília). */
export function instanteRodada(data, hora) {
  if (!data || !hora) return null
  // Brasília está em UTC−3 o ano todo (sem horário de verão desde 2019).
  return new Date(`${data}T${hora}:00-03:00`)
}

/** "2 min 05 s" / "45 s" */
export function fmtFalta(ms) {
  const s = Math.max(0, Math.round(ms / 1000))
  const h = Math.floor(s / 3600)
  const m = Math.floor((s % 3600) / 60)
  const seg = s % 60
  if (h) return `${h} h ${String(m).padStart(2, '0')} min`
  if (m) return `${m} min ${String(seg).padStart(2, '0')} s`
  return `${seg} s`
}
