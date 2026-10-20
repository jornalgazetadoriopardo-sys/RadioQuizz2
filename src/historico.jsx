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
  emerald: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  rose: 'bg-rose-50 text-rose-700 border-rose-200',
  amber: 'bg-amber-50 text-amber-800 border-amber-200',
  slate: 'bg-slate-100 text-slate-600 border-slate-200',
}

export function SeloSituacao({ h }) {
  const s = situacao(h)
  return <span className={`rounded-full border px-2.5 py-0.5 text-[11px] font-bold ${CORES_SELO[s.cor]}`}>{s.texto}</span>
}

/** Pergunta com as alternativas, marcando a escolhida e a correta. */
export function DetalheParticipacao({ h }) {
  return (
    <div>
      <p className="text-[13px] font-semibold leading-snug text-slate-800">{h.pergunta}</p>
      <ul className="mt-2 space-y-1">
        {h.alternativas.map((alt, i) => {
          const escolhida = h.alternativa === i
          const correta = h.correta === i
          return (
            <li
              key={i}
              className={`flex items-center justify-between gap-2 rounded-lg border px-2.5 py-1.5 text-xs ${
                correta ? 'border-emerald-300 bg-emerald-50' : escolhida ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-white'
              }`}
            >
              <span>
                {String.fromCharCode(65 + i)}) {alt}
              </span>
              <span className="flex shrink-0 items-center gap-1 font-semibold">
                {escolhida && <span className={correta ? 'text-emerald-700' : 'text-rose-700'}>sua resposta</span>}
                {correta ? <Check size={14} className="text-emerald-600" /> : escolhida ? <X size={14} className="text-rose-600" /> : null}
              </span>
            </li>
          )
        })}
      </ul>
      {h.correta === null && <p className="mt-1.5 text-[11px] text-slate-400">O gabarito aparece aqui quando o tempo da pergunta terminar.</p>}
      <div className="mt-2 grid grid-cols-2 gap-x-3 gap-y-0.5 text-[11px] text-slate-500">
        <span>Abriu: {fmtDataHora(h.aberta_em)}</span>
        <span>Respondeu: {fmtDataHora(h.respondida_em)}</span>
        <span className="flex items-center gap-1">
          <Clock size={11} /> {h.tempo_gasto != null ? `${String(h.tempo_gasto).replace('.', ',')} s` : '—'} de {h.tempo_limite} s
        </span>
        <span>
          Pontos: <b className="text-slate-700">{fmt(h.pontos)}</b> (valia {fmt(h.valor_pontos)})
        </span>
      </div>
    </div>
  )
}
