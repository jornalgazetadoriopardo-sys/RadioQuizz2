import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Loader2, X } from 'lucide-react'
import { DURACOES } from '../config.js'
import { fmt, quandoTexto, useDados } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { useContagem } from '../ui.jsx'
import { PecaAnuncio } from '../anuncios.jsx'

// Fluxo de uma rodada: entrando → anuncio1 → pergunta → anuncio2 → resultado
// Ao entrar, o servidor guarda a vaga: quem entrou com a rodada no ar responde mesmo que ela feche durante o anúncio.
// O servidor marca a hora em que a pergunta abriu e confere a resposta (ver supabase/migrations).
export default function Rodada({ aoSair }) {
  const { rodadaNoAr, rodadas, patrocinadores, modoApresentacao, recarregarMinhasRespostas } = useDados()
  // Fixa a rodada ao entrar, mesmo que o admin troque a rodada no ar no meio do caminho.
  const [rodada] = useState(rodadaNoAr)
  const [etapa, setEtapa] = useState('entrando')
  const [pergunta, setPergunta] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  const [patrocinador1, patrocinador2] = useMemo(() => {
    if (!patrocinadores.length) return [null, null]
    const i = Math.max(0, rodadas.findIndex((r) => r.id === rodada?.id))
    return [patrocinadores[i % patrocinadores.length], patrocinadores[(i + 1) % patrocinadores.length]]
  }, [patrocinadores, rodadas, rodada])

  // Guarda a vaga na hora em que o ouvinte tocou em "Responder"
  useEffect(() => {
    if (!rodada) return
    let ativo = true
    supabase.rpc('entrar_na_rodada', { p_rodada: rodada.id }).then(async ({ error }) => {
      if (!ativo) return
      if (error?.message.includes('ja_respondida')) return (await responder(null)) && setEtapa('resultado')
      // banco sem o 011 ainda: segue como antes
      if (error && !/entrar_na_rodada|schema cache|function/i.test(error.message)) return setErro(mensagemDeErro(error))
      setEtapa('anuncio1')
    })
    return () => {
      ativo = false
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  if (!rodada) return <Mensagem texto="Nenhuma pergunta no ar agora." aoSair={aoSair} />

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

  if (erro) return <Mensagem texto={erro} aoSair={aoSair} />

  return (
    <div className="no-scrollbar h-full overflow-y-auto bg-slate-50 px-4 pb-8 pt-5">
      {etapa === 'anuncio1' && (
        <Anuncio
          key="a1"
          segundos={curto ?? patrocinador1?.duracao_segundos ?? DURACOES.anuncioPergunta}
          patrocinador={patrocinador1}
          aoTerminar={abrirPergunta}
          titulo="Fique nesta tela"
          texto="A pergunta aparece logo depois deste anúncio."
          cor="rose"
        />
      )}
      {(etapa === 'abrindo' || etapa === 'entrando') && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-xl font-semibold text-slate-700">
          <Loader2 className="animate-spin text-rose-600" size={44} /> {etapa === 'entrando' ? 'Entrando na rodada…' : 'Abrindo a pergunta…'}
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
          segundos={curto ?? patrocinador2?.duracao_segundos ?? DURACOES.anuncioGabarito}
          patrocinador={patrocinador2}
          aoTerminar={() => setEtapa('resultado')}
          titulo="Resposta enviada!"
          texto="Depois deste anúncio você vê se acertou."
          cor="emerald"
        />
      )}
      {etapa === 'resultado' && <Resultado rodada={rodada} resultado={resultado} aoSair={aoSair} />}
    </div>
  )
}

function Mensagem({ texto, aoSair }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-6 px-6 text-center">
      <p className="text-2xl font-bold text-slate-900">{texto}</p>
      <BotaoGrande onClick={aoSair}>Voltar ao início</BotaoGrande>
    </div>
  )
}

function BotaoGrande({ className = 'bg-slate-900 text-white', children, ...props }) {
  return (
    <button className={`flex min-h-[64px] w-full items-center justify-center gap-2 rounded-2xl px-4 text-xl font-extrabold active:scale-[.98] disabled:opacity-40 ${className}`} {...props}>
      {children}
    </button>
  )
}

function Anuncio({ segundos, patrocinador, aoTerminar, titulo, texto, cor }) {
  const { segundos: s, fracao, oculto } = useContagem(segundos, aoTerminar, { pausarQuandoOculto: true })
  const aviso = cor === 'emerald' ? 'bg-emerald-600' : 'bg-rose-600'
  return (
    <div className="flex min-h-full flex-col animate-fade-up">
      <div className={`flex items-center gap-4 rounded-3xl p-4 text-white ${aviso}`}>
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white text-4xl font-extrabold tabular-nums text-slate-900">{s}</div>
        <div>
          <p className="text-2xl font-extrabold leading-tight">{titulo}</p>
          <p className="mt-1 text-lg leading-snug">{texto}</p>
        </div>
      </div>
      {oculto && <p className="mt-3 rounded-xl bg-amber-100 p-3 text-center text-lg font-bold text-amber-900">Contagem parada. Volte para esta tela.</p>}

      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">Anúncio</p>
        <PecaAnuncio p={patrocinador} />
        <div className="h-3 overflow-hidden rounded-full bg-slate-200">
          <div className="h-full rounded-full bg-rose-600 transition-[width] duration-100 ease-linear" style={{ width: `${(1 - fracao) * 100}%` }} />
        </div>
      </div>
    </div>
  )
}

function Pergunta({ rodada, pergunta, aoResponder }) {
  const [escolhida, setEscolhida] = useState(null)
  const enviado = useRef(false)

  // Um toque na alternativa já envia a resposta.
  const enviar = (alt) => {
    if (enviado.current) return
    enviado.current = true
    setEscolhida(alt)
    aoResponder(alt)
  }
  // O tempo restante vem do servidor (se o ouvinte saiu e voltou, não recomeça do zero).
  const { segundos, fracao } = useContagem(Number(pergunta.segundos_restantes), () => enviar(null))
  const fracaoTotal = (fracao * Number(pergunta.segundos_restantes)) / pergunta.tempo_resposta
  const urgente = segundos <= 5
  const enviando = enviado.current

  return (
    <div className="flex min-h-full flex-col animate-fade-up">
      <div className="flex items-center gap-3">
        <div
          className={`grid h-16 w-16 shrink-0 place-items-center rounded-full text-3xl font-extrabold tabular-nums ${
            urgente ? 'animate-pulse bg-rose-600 text-white' : 'bg-white text-slate-900 ring-2 ring-slate-300'
          }`}
        >
          {segundos}
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold text-slate-800">{urgente ? 'Rápido! O tempo está acabando' : 'Segundos para responder'}</p>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgente ? 'bg-rose-600' : 'bg-slate-800'}`} style={{ width: `${fracaoTotal * 100}%` }} />
          </div>
        </div>
      </div>

      <p className="mt-5 text-lg font-bold text-rose-700">Vale {fmt(rodada.pontos)} pontos</p>
      <h2 className="mt-1 text-2xl font-extrabold leading-snug text-slate-900">{pergunta.pergunta}</h2>

      <p className="mt-5 text-lg text-slate-700">{enviando ? 'Enviando sua resposta…' : 'Toque na resposta certa:'}</p>
      <div className="mt-2 space-y-3">
        {pergunta.alternativas.map((alt, i) => {
          const marcada = escolhida === i
          return (
            <button
              key={i}
              onClick={() => enviar(i)}
              disabled={enviando}
              aria-pressed={marcada}
              className={`flex min-h-[64px] w-full items-center gap-3 rounded-2xl border-[3px] px-3 py-2 text-left transition active:scale-[.98] ${
                marcada ? 'border-rose-600 bg-rose-50' : enviando ? 'border-slate-200 bg-white opacity-50' : 'border-slate-200 bg-white'
              }`}
            >
              <span
                className={`grid h-11 w-11 shrink-0 place-items-center rounded-full text-xl font-extrabold ${
                  marcada ? 'bg-rose-600 text-white' : 'bg-slate-100 text-slate-800'
                }`}
              >
                {marcada ? <Loader2 size={24} className="animate-spin" /> : String.fromCharCode(65 + i)}
              </span>
              <span className="text-xl font-semibold leading-snug text-slate-900">{alt}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

function Resultado({ rodada, resultado, aoSair }) {
  const { proximaRodada } = useDados()
  const acertou = resultado?.acertou
  const titulo = acertou ? 'Você acertou!' : resultado?.tempo_esgotado ? 'O tempo acabou' : 'Não foi desta vez'

  return (
    <div className="flex min-h-full flex-col animate-fade-up">
      <div className={`rounded-3xl p-6 text-center text-white ${acertou ? 'bg-emerald-600' : 'bg-slate-800'}`}>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white animate-pop">
          {acertou ? <Check size={48} className="text-emerald-600" /> : <X size={48} className="text-rose-600" />}
        </div>
        <h2 className="mt-4 text-3xl font-extrabold">{titulo}</h2>
        <p className="mt-2 text-2xl">
          {acertou ? (
            <>
              Ganhou <b>{fmt(resultado?.pontos)} pontos</b>
            </>
          ) : (
            'Nenhum ponto nesta pergunta'
          )}
        </p>
      </div>

      <div className="mt-4 rounded-3xl bg-white p-5 ring-2 ring-slate-200">
        <p className="text-lg text-slate-700">A resposta certa era:</p>
        <p className="mt-1 text-2xl font-extrabold leading-snug text-emerald-700">{resultado?.resposta_correta}</p>
        {resultado?.explicacao && <p className="mt-3 text-lg leading-relaxed text-slate-800">{resultado.explicacao}</p>}
      </div>

      {proximaRodada && proximaRodada.id !== rodada.id && (
        <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-center text-xl text-slate-800">
          Próxima pergunta: <b>{quandoTexto(proximaRodada)}</b>
        </p>
      )}

      {resultado?.protocolo && (
        <p className="mt-4 text-center text-base text-slate-600">
          Protocolo: <b className="font-mono text-slate-900">{resultado.protocolo}</b> (fica no seu histórico)
        </p>
      )}

      <div className="mt-auto pt-6">
        <BotaoGrande onClick={aoSair}>Voltar ao início</BotaoGrande>
      </div>
    </div>
  )
}
