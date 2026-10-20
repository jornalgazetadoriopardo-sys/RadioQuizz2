import { useMemo, useRef, useState } from 'react'
import { Check, Loader2, PartyPopper, X } from 'lucide-react'
import { DURACOES } from '../config.js'
import { fmt, useDados } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { CORES, Card, Icone, Selo, useContagem } from '../ui.jsx'

// Fluxo de uma rodada: anuncio1 → pergunta → anuncio2 → resultado
// O servidor marca a hora em que a pergunta abriu e confere a resposta (ver supabase/migrations).
export default function Rodada({ aoSair }) {
  const { rodadaNoAr, rodadas, patrocinadores, modoApresentacao, recarregarMinhasRespostas } = useDados()
  // Fixa a rodada ao entrar, mesmo que o admin troque a rodada no ar no meio do caminho.
  const [rodada] = useState(rodadaNoAr)
  const [etapa, setEtapa] = useState('anuncio1')
  const [pergunta, setPergunta] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  const [patrocinador1, patrocinador2] = useMemo(() => {
    if (!patrocinadores.length) return [null, null]
    const i = Math.max(0, rodadas.findIndex((r) => r.id === rodada?.id))
    return [patrocinadores[i % patrocinadores.length], patrocinadores[(i + 1) % patrocinadores.length]]
  }, [patrocinadores, rodadas, rodada])

  if (!rodada) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-sm font-semibold text-slate-600">Nenhuma pergunta no ar agora.</p>
        <button onClick={aoSair} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">
          Voltar ao início
        </button>
      </div>
    )
  }

  const curto = modoApresentacao ? DURACOES.modoApresentacao : null

  const responder = async (alternativa) => {
    const { data, error } = await supabase.rpc('responder', { p_rodada: rodada.id, p_alternativa: alternativa })
    if (error) return setErro(mensagemDeErro(error))
    setResultado(data)
    recarregarMinhasRespostas()
    return data
  }

  const abrirPergunta = async () => {
    setEtapa('abrindo')
    const { data, error } = await supabase.rpc('abrir_pergunta', { p_rodada: rodada.id })
    if (error) {
      // Já respondeu (ex.: fechou o app no meio): mostra o resultado que ficou registrado.
      if (error.message.includes('ja_respondida') && (await responder(null))) return setEtapa('resultado')
      return setErro(mensagemDeErro(error))
    }
    setPergunta(data)
    setEtapa('pergunta')
  }

  if (erro) {
    return (
      <div className="flex h-full flex-col items-center justify-center gap-4 px-8 text-center">
        <p className="text-sm font-semibold text-rose-700">{erro}</p>
        <button onClick={aoSair} className="rounded-xl bg-slate-900 px-5 py-3 text-sm font-bold text-white">
          Voltar ao início
        </button>
      </div>
    )
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
          aoTerminar={abrirPergunta}
          aviso={
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-center">
              <p className="text-sm font-bold text-rose-700">Não saia desta tela</p>
              <p className="text-xs text-rose-600">Assista aos {curto ?? DURACOES.anuncioPergunta} segundos para liberar a pergunta.</p>
            </div>
          }
        />
      )}
      {etapa === 'abrindo' && (
        <div className="flex h-full items-center justify-center">
          <Loader2 className="animate-spin text-rose-600" size={32} />
        </div>
      )}
      {etapa === 'pergunta' && (
        <Pergunta
          rodada={rodada}
          pergunta={pergunta}
          aoResponder={async (alt) => {
            const r = await responder(alt)
            if (r) setEtapa(r.tempo_esgotado && alt === null ? 'resultado' : 'anuncio2')
          }}
        />
      )}
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
      {etapa === 'resultado' && <Resultado rodada={rodada} resultado={resultado} aoSair={aoSair} />}
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
              {patrocinador.logo_url ? (
                <img src={patrocinador.logo_url} alt={patrocinador.nome} className="mx-auto h-20 max-w-[70%] object-contain" />
              ) : (
                <div className={`mx-auto grid h-12 w-12 place-items-center rounded-xl ${cor.fundo} ${cor.texto}`}>
                  <Icone nome={patrocinador.icone} size={24} />
                </div>
              )}
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

function Pergunta({ rodada, pergunta, aoResponder }) {
  const [enviando, setEnviando] = useState(null)
  const respondido = useRef(false)
  const enviar = (alt) => {
    if (respondido.current) return
    respondido.current = true
    setEnviando(alt ?? 'tempo')
    aoResponder(alt)
  }
  // O tempo restante vem do servidor (se o ouvinte saiu e voltou, não recomeça do zero).
  const { segundos, fracao } = useContagem(Number(pergunta.segundos_restantes), () => enviar(null))
  const fracaoTotal = (fracao * Number(pergunta.segundos_restantes)) / pergunta.tempo_resposta
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
        <div className="h-full rounded-full bg-rose-600 transition-[width] duration-100 ease-linear" style={{ width: `${fracaoTotal * 100}%` }} />
      </div>
      <p className="mt-5 text-[11px] font-bold uppercase tracking-wider text-slate-400">{rodada.categoria}</p>
      <h2 className="mt-1.5 text-lg font-bold leading-snug">{pergunta.pergunta}</h2>

      <div className="mt-auto space-y-2.5 pt-10">
        {pergunta.alternativas.map((alt, i) => (
          <button
            key={i}
            disabled={enviando !== null}
            onClick={() => enviar(i)}
            className={`flex w-full items-center justify-between rounded-xl border px-4 py-3.5 text-left text-sm font-medium shadow-sm transition active:scale-[.98] ${
              enviando === i ? 'border-rose-400 bg-rose-50' : 'border-slate-200 bg-white hover:border-rose-300 hover:bg-rose-50'
            } disabled:cursor-default`}
          >
            {String.fromCharCode(65 + i)}) {alt}
            {enviando === i && <Loader2 size={16} className="animate-spin text-rose-600" />}
          </button>
        ))}
      </div>
    </div>
  )
}

function Resultado({ rodada, resultado, aoSair }) {
  const { proximaRodada } = useDados()
  const acertou = resultado?.acertou
  const titulo = acertou ? 'Você acertou!' : resultado?.tempo_esgotado ? 'Tempo esgotado' : 'Resposta errada'

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
        {fmt(resultado?.pontos)} pontos nesta rodada
      </span>
      {acertou && (
        <p className="mt-2 flex items-center gap-1 text-xs text-emerald-700">
          <PartyPopper size={14} /> Pontos somados ao seu ranking da semana!
        </p>
      )}

      <div className="mt-6 w-full rounded-xl border border-slate-200 bg-slate-50 p-4 text-left text-[13px] leading-relaxed text-slate-600">
        <p className="mb-1 font-bold text-slate-900">Explicação:</p>
        A resposta correta era: <b className="text-slate-800">{resultado?.resposta_correta}</b>. {resultado?.explicacao}
        {proximaRodada && proximaRodada.id !== rodada.id && <> Às {proximaRodada.horario} tem mais um quiz no ar!</>}
      </div>

      {resultado?.protocolo && (
        <p className="mt-3 text-[11px] text-slate-400">
          Protocolo da participação: <b className="font-mono text-slate-600">{resultado.protocolo}</b> (fica no seu histórico)
        </p>
      )}

      <button onClick={aoSair} className="mt-6 w-full rounded-xl bg-slate-900 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white">
        Voltar ao início
      </button>
    </div>
  )
}
