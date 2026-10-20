import { Check, Clock, X } from 'lucide-react'
import { fmt } from './store.jsx'

// Datas sempre no horário de Brasília, com segundos (importante para conferir reclamações).
export function fmtDataHora(ts) {
  if (!ts) return '—'
  return new Date(ts).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  })
}

export function situacao(h) {
  if (!h.respondida_em) return { texto: 'Abriu e não respondeu', cor: 'slate' }
  if (h.acertou) return { texto: 'Acertou', cor: 'emerald' }
  if (h.tempo_esgotado) return { texto: h.alternativa === null ? 'Tempo esgotado' : 'Respondeu fora do tempo', cor: 'amber' }
  return { texto: 'Errou', cor: 'rose' }
}

const CORES_SELO = {
  emerald: 'bg-emerald-100 text-emerald-800 border-emerald-300',
  rose: 'bg-rose-100 text-rose-800 border-rose-300',
  amber: 'bg-amber-100 text-amber-900 border-amber-300',
  slate: 'bg-slate-100 text-slate-700 border-slate-300',
}

/** `grande` = versão para o ouvinte (letras maiores); sem ele = versão compacta do Painel Admin. */
export function SeloSituacao({ h, grande = false }) {
  const s = situacao(h)
  return (
    <span className={`shrink-0 rounded-full border font-bold ${grande ? 'px-3 py-1 text-base' : 'px-2.5 py-0.5 text-[11px]'} ${CORES_SELO[s.cor]}`}>
      {s.texto}
    </span>
  )
}

/** Pergunta com as alternativas, marcando a escolhida e a correta. */
export function DetalheParticipacao({ h, grande = false }) {
  const t = grande
    ? { pergunta: 'text-xl font-bold', alt: 'px-3 py-3 text-lg', info: 'text-base text-slate-700 grid-cols-1', icone: 20 }
    : { pergunta: 'text-[13px] font-semibold', alt: 'px-2.5 py-1.5 text-xs', info: 'text-[11px] text-slate-500 grid-cols-2', icone: 14 }
  return (
    <div>
      <p className={`${t.pergunta} leading-snug text-slate-900`}>{h.pergunta}</p>
      <ul className="mt-2 space-y-1.5">
        {h.alternativas.map((alt, i) => {
          const escolhida = h.alternativa === i
          const correta = h.correta === i
          return (
            <li
              key={i}
              className={`flex items-center justify-between gap-2 rounded-xl border-2 ${t.alt} ${
                correta ? 'border-emerald-400 bg-emerald-50' : escolhida ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white'
              }`}
            >
              <span className="text-slate-900">
                {String.fromCharCode(65 + i)}) {alt}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-bold">
                {correta && <span className="text-emerald-700">{grande ? 'certa' : ''}</span>}
                {escolhida && <span className={correta ? 'text-emerald-700' : 'text-rose-700'}>{correta && grande ? '· ' : ''}sua resposta</span>}
                {correta ? <Check size={t.icone} className="text-emerald-600" /> : escolhida ? <X size={t.icone} className="text-rose-600" /> : null}
              </span>
            </li>
          )
        })}
      </ul>
      {h.correta === null && <p className={`mt-2 ${grande ? 'text-base' : 'text-[11px]'} text-slate-600`}>A resposta certa aparece aqui quando o tempo da pergunta terminar.</p>}
      <div className={`mt-3 grid gap-x-3 gap-y-1 ${t.info}`}>
        <span>Abriu: {fmtDataHora(h.aberta_em)}</span>
        <span>Respondeu: {fmtDataHora(h.respondida_em)}</span>
        <span className="flex items-center gap-1">
          <Clock size={grande ? 16 : 11} /> Levou {h.tempo_gasto != null ? `${String(h.tempo_gasto).replace('.', ',')} s` : '—'} (limite de {h.tempo_limite} s)
        </span>
        <span>
          Pontos: <b className="text-slate-900">{fmt(h.pontos)}</b> (valia {fmt(h.valor_pontos)})
        </span>
      </div>
    </div>
  )
}
