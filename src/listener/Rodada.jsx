import { useMemo, useRef, useState } from 'react'
import { Check, PartyPopper, X } from 'lucide-react'
import { DURACOES } from '../config.js'
import { calcularPontos, fmt, useStore } from '../store.jsx'
import { CORES, Card, Icone, Selo, useContagem } from '../ui.jsx'

// Fluxo de uma rodada: anuncio1 → pergunta → anuncio2 → resultado
export default function Rodada({ aoSair }) {
  const { state, dispatch, rodadaAtual, rodadasOrdenadas } = useStore()
  // Fixa a rodada ao entrar: depois de responder, a "rodada atual" do store já passa para a próxima.
  const [rodada] = useState(rodadaAtual)
  const [etapa, setEtapa] = useState('anuncio1')
  const resultado = useRef(null)

  const [patrocinador1, patrocinador2] = useMemo(() => {
    const p = state.patrocinadores
    if (!p.length) return [null, null]
    const i = Math.max(0, rodadasOrdenadas.indexOf(rodada))
    return [p[i % p.length], p[(i + 1) % p.length]]
  }, [state.patrocinadores, rodadasOrdenadas, rodada])

  if (!rodada) return null

  const curto = state.modoApresentacao ? DURACOES.modoApresentacao : null

  const responder = (alternativa, tempoRestante) => {
    const acertou = alternativa === rodada.correta
    const pontos = acertou ? calcularPontos(rodada.pontos, tempoRestante, rodada.tempoResposta) : 0
    const tempoGasto = Math.round((rodada.tempoResposta - tempoRestante) * 10) / 10
    resultado.current = { alternativa, acertou, pontos }
    dispatch({ type: 'REGISTRAR_RESPOSTA', rodadaId: rodada.id, alternativa, acertou, pontos, tempoGasto })
    setEtapa(alternativa === null ? 'resultado' : 'anuncio2')
  }

  return (
    <div className="h-full overflow-y-auto bg-slate-50 px-5 pb-8 pt-6 no-scrollbar">
      {etapa === 'anuncio1' && (
        <Anuncio
          key="a1"
          rotulo="Patrocinador do Quiz (1/2)"
          seloCor="amber"
          segundos={curto ?? DURACOES.anuncioPergunta}
          patrocinador={patrocinador1}
          aoTerminar={() => setEtapa('pergunta')}
          aviso={
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-sm font-bold text-rose-700">Não saia desta tela</p>
              <p className="text-xs text-rose-600">Assista aos {curto ?? DURACOES.anuncioPergunta} segundos para liberar a pergunta.</p>
            </div>
          }
        />
      )}
      {etapa === 'pergunta' && <Pergunta rodada={rodada} aoResponder={responder} />}
      {etapa === 'anuncio2' && (
        <Anuncio
          key="a2"
          rotulo="Liberação de Gabarito (2/2)"
          seloCor="rose"
          segundos={curto ?? DURACOES.anuncioGabarito}
          patrocinador={patrocinador2}
          aoTerminar={() => setEtapa('resultado')}
          aviso={
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-center">
              <p className="text-sm font-bold text-amber-900">Resposta Enviada com Sucesso!</p>
              <p className="text-xs text-amber-900">
                Assista a este anúncio de {curto ?? DURACOES.anuncioGabarito}s para <b>revelar a resposta correta</b> e conferir seus{' '}
                <b>+{fmt(rodada.pontos)} pontos</b>!
              </p>
            </div>
          }
        />
      )}
      {etapa === 'resultado' && <Resultado rodada={rodada} resultado={resultado.current} aoSair={aoSair} />}
    </div>
  )
}

function Anuncio({ rotulo, seloCor, segundos, patrocinador, aviso, aoTerminar }) {
  const { segundos: s, fracao, oculto } = useContagem(segundos, aoTerminar, { pausarQuandoOculto: true })
  const cor = CORES[patrocinador?.cor] ?? CORES.amber
  return (
    <div className="flex min-h-full flex-col animate-fade-up">
      <div className="flex items-center justify-between">
        <Selo cor={seloCor} className="normal-case tracking-normal">{rotulo}</Selo>
        <span className="grid h-9 min-w-9 place-items-center rounded-full border border-slate-200 bg-white px-2 text-sm font-extrabold tabular-nums">{s}s</span>
      </div>
      <div className="mt-4">{aviso}</div>
      {oculto && <p className="mt-2 text-center text-xs font-semibold text-rose-600">Contagem pausada — volte para esta tela.</p>}

      <div className="flex flex-1 items-center py-8">
        <Card className="w-full p-6 text-center">
          {patrocinador ? (
            <>
              <div className={`mx-auto grid h-12 w-12 place-items-center rounded-xl ${cor.fundo} ${cor.texto}`}>
                <Icone nome={patrocinador.icone} size={24} />
              </div>
              <p className={`mt-4 text-[13px] font-bold uppercase tracking-wide ${cor.titulo}`}>{patrocinador.nome}</p>
              <p className="mt-3 font-display text-lg leading-snug">"{patrocinador.slogan}"</p>
              <p className="mt-3 text-[13px] leading-relaxed text-slate-500">{patrocinador.descricao}</p>
            </>
          ) : (
            <p className="text-sm text-slate-500">Espaço publicitário disponível</p>
          )}
          <div className="mt-5 h-1.5 overflow-hidden rounded-full bg-slate-100">
            <div className="h-full rounded-full bg-rose-600 transition-[width] duration-100 ease-linear" style={{ width: `${(1 - fracao) * 100}%` }} />
          </div>
        </Card>
      </div>
    </div>
  )
}

function Pergunta({ rodada, aoResponder }) {
  const respondido = useRef(false)
  const enviar = (alt, restanteMs) => {
    if (respondido.current) return
    respondido.current = true
    aoResponder(alt, restanteMs / 1000)
  }
  const { restante, segundos, fracao } = useContagem(rodada.tempoResposta, () => enviar(null, 0))
  const urgente = segundos <= 3

  return (
    <div className="flex min-h-full flex-col animate-fade-up">
      <div className="flex items-center justify-between">
        <Selo className="normal-case tracking-normal">Valendo +{fmt(rodada.pontos)} Pontos</Selo>
        <span
          className={`grid h-9 min-w-9 place-items-center rounded-full border px-2 text-sm font-extrabold tabular-nums ${
            urgente ? 'animate-pulse border-rose-200 bg-rose-50 text-rose-600' : 'border-slate-200 bg-white'
          }`}
        >
          {segundos}s
        </span>
      </div>
      <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-slate-200">
        <div className="h-full rounded-full bg-rose-600 transition-[width] duration-100 ease-linear" style={{ width: `${fracao * 100}%` }} />
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{rodada.categoria}</p>
      <h2 className="mt-1.5 text-lg font-bold leading-snug">{rodada.pergunta}</h2>

      <div className="mt-auto space-y-2.5 pt-10">
        {rodada.alternativas.map((alt, i) => (
          <button
            key={i}
            onClick={() => enviar(i, restante)}
            className="w-full rounded-xl border border-slate-200 bg-white px-4 py-3.5 text-left text-sm font-medium shadow-sm transition hover:border-rose-300 hover:bg-rose-50 active:scale-[.98]"
          >
            {String.fromCharCode(65 + i)}) {alt}
          </button>
        ))}
      </div>
    </div>
  )
}

function Resultado({ rodada, resultado, aoSair }) {
  const { state, rodadasOrdenadas } = useStore()
  const idx = rodadasOrdenadas.findIndex((r) => r.id === rodada.id)
  const proximaRodada = rodadasOrdenadas.slice(idx + 1).find((r) => !state.respostas[r.id])
  const tempoEsgotado = resultado?.alternativa === null
  const acertou = resultado?.acertou
  const titulo = acertou ? 'Você acertou!' : tempoEsgotado ? 'Tempo esgotado' : 'Resposta errada'

  return (
    <div className="flex min-h-full flex-col items-center justify-center text-center animate-fade-up">
      <div
        className={`grid h-14 w-14 place-items-center rounded-full border animate-pop ${
          acertou ? 'border-emerald-200 bg-emerald-50 text-emerald-600' : 'border-rose-200 bg-rose-50 text-rose-600'
        }`}
      >
        {acertou ? <Check size={28} /> : <X size={28} />}
      </div>
      <h2 className={`mt-4 font-display text-xl uppercase ${acertou ? 'text-emerald-600' : 'text-rose-700'}`}>{titulo}</h2>
      <span className="mt-3 rounded-full border border-slate-200 bg-slate-100 px-3 py-1 text-xs font-extrabold uppercase">
        {fmt(resultado?.pontos ?? 0)} pontos nesta rodada
      </span>
      {acertou && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
          <PartyPopper size={14} /> Quanto mais rápido, mais pontos!
        </p>
      )}

      <div className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[13px] leading-relaxed text-slate-600">
        <p className="mb-1 font-bold text-slate-900">Explicação:</p>
        A resposta correta era: <b className="text-slate-800">{rodada.alternativas[rodada.correta]}</b>. {rodada.explicacao}
        {proximaRodada && <> Às {proximaRodada.horario} tem mais um quiz no ar!</>}
      </div>

      <button onClick={aoSair} className="mt-6 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white">
        Voltar ao início
      </button>
    </div>
  )
}
