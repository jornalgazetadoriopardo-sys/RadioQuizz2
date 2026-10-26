import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, Hand, Loader2, RadioTower, Send, Volume2, X } from 'lucide-react'
import { DURACOES } from '../config.js'
import { fmt, nomeRodada, proximaFalada, useDados } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { useContagem } from '../ui.jsx'
import { PecaAnuncio } from '../anuncios.jsx'
import { instanteRodada, useRelogio } from '../relogio.js'

// Fluxo de uma rodada:
//   confirmar ("Vou participar", com o relógio da rodada) → preparar (3, 2, 1) → anuncio1 → pergunta
//   → enviada ("Confira sua resposta") → anuncio2 → resultado
// Os toques em "Vou participar" e "Confira sua resposta" são o que permite ao navegador tocar o vídeo já com som.
// Ao confirmar, o servidor guarda a vaga: quem entrou com a rodada no ar responde mesmo que ela feche durante o anúncio.
// O servidor marca a hora em que a pergunta abriu e confere a resposta (ver supabase/migrations).
const SEGUNDOS_PREPARAR = 3

export default function Rodada({ aoSair }) {
  const { rodadaNoAr, rodadas, patrocinadores, modoApresentacao, recarregarMinhasRespostas } = useDados()
  // Fixa a rodada ao entrar, mesmo que o admin troque a rodada no ar no meio do caminho.
  const [rodada] = useState(rodadaNoAr)
  const [etapa, setEtapa] = useState('confirmar')
  const [entrada, setEntrada] = useState(null) // null → 'enviando' → 'ok'
  const [preparado, setPreparado] = useState(false)
  const [pergunta, setPergunta] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  const [patrocinador1, patrocinador2] = useMemo(() => {
    if (!patrocinadores.length) return [null, null]
    const i = Math.max(0, rodadas.findIndex((r) => r.id === rodada?.id))
    return [patrocinadores[i % patrocinadores.length], patrocinadores[(i + 1) % patrocinadores.length]]
  }, [patrocinadores, rodadas, rodada])

  // Fim da contagem 3, 2, 1 com a vaga confirmada → começa o anúncio
  useEffect(() => {
    if (etapa === 'preparar' && preparado && entrada === 'ok') setEtapa('anuncio1')
  }, [etapa, preparado, entrada])

  if (!rodada) return <Mensagem texto="Nenhuma pergunta no ar agora." aoSair={aoSair} />

  const curto = modoApresentacao ? DURACOES.modoApresentacao : null

  const responder = async (alternativa) => {
    const { data, error } = await supabase.rpc('responder', { p_rodada: rodada.id, p_alternativa: alternativa })
    if (error) return setErro(mensagemDeErro(error))
    setResultado(data)
    recarregarMinhasRespostas()
    return data
  }

  // "Vou participar": guarda a vaga no servidor enquanto a contagem 3, 2, 1 corre
  const participar = async () => {
    setEtapa('preparar')
    setEntrada('enviando')
    const { error } = await supabase.rpc('entrar_na_rodada', { p_rodada: rodada.id })
    if (error?.message.includes('ja_respondida')) return (await responder(null)) && setEtapa('resultado')
    // banco sem o 011 ainda: segue como antes
    if (error && !/entrar_na_rodada|schema cache|function/i.test(error.message)) return setErro(mensagemDeErro(error))
    setEntrada('ok')
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
      {etapa === 'confirmar' && <Confirmar rodada={rodada} aoParticipar={participar} aoSair={aoSair} />}
      {etapa === 'preparar' && <Preparar aoTerminar={() => setPreparado(true)} esperando={preparado && entrada !== 'ok'} />}
      {['confirmar', 'preparar', 'anuncio1'].includes(etapa) && (
        <Anuncio
          key="a1"
          ativo={etapa === 'anuncio1'}
          segundos={curto ?? patrocinador1?.duracao_segundos ?? DURACOES.anuncioPergunta}
          patrocinador={patrocinador1}
          aoTerminar={abrirPergunta}
          titulo="Fique nesta tela"
          texto="A pergunta aparece logo depois deste anúncio."
          cor="marca"
        />
      )}
      {etapa === 'abrindo' && (
        <div className="flex h-full flex-col items-center justify-center gap-3 text-xl font-semibold text-slate-700">
          <Loader2 className="animate-spin text-marca-600" size={44} /> Abrindo a pergunta…
        </div>
      )}
      {etapa === 'pergunta' && (
        <Pergunta
          rodada={rodada}
          pergunta={pergunta}
          aoResponder={async (alt) => {
            const r = await responder(alt)
            if (r) setEtapa(r.tempo_esgotado && alt === null ? 'resultado' : 'enviada')
          }}
        />
      )}
      {etapa === 'enviada' && <Enviada aoConferir={() => setEtapa('anuncio2')} />}
      {['pergunta', 'enviada', 'anuncio2'].includes(etapa) && (
        <Anuncio
          key="a2"
          ativo={etapa === 'anuncio2'}
          segundos={curto ?? patrocinador2?.duracao_segundos ?? DURACOES.anuncioGabarito}
          patrocinador={patrocinador2}
          aoTerminar={() => setEtapa('resultado')}
          titulo="Já vem o resultado!"
          texto="Depois deste anúncio você vê se acertou."
          cor="emerald"
        />
      )}
      {etapa === 'resultado' && <Resultado rodada={rodada} resultado={resultado} aoSair={aoSair} />}
    </div>
  )
}

/** Relógio grande da rodada + botão "Vou participar". */
function Confirmar({ rodada, aoParticipar, aoSair }) {
  const agora = useRelogio()
  const fimAgendado = rodada.modo === 'automatico' ? instanteRodada(rodada.data, rodada.horario_fim) : null
  // reaberta à mão depois do horário: não tem relógio
  const fim = fimAgendado && !(rodada.no_ar_em && new Date(rodada.no_ar_em) >= fimAgendado) ? fimAgendado : null
  const falta = fim ? Math.max(0, Math.ceil((fim - agora) / 1000)) : null
  const total = fim ? Math.max(1, (fim - instanteRodada(rodada.data, rodada.horario)) / 1000) : 1
  // fechou pelo relógio ou a produção encerrou antes de a pessoa confirmar
  const { rodadaNoAr } = useDados()
  const acabou = falta === 0 || rodadaNoAr?.id !== rodada.id

  if (acabou) return <Mensagem texto="O tempo para participar desta pergunta acabou. Fique ligado na próxima!" aoSair={aoSair} />

  return (
    <div className="flex min-h-full flex-col items-center justify-center text-center animate-fade-up">
      <p className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide text-marca-700">
        <span className="h-3 w-3 animate-pulse rounded-full bg-red-500" /> Pergunta no ar
      </p>
      <p className="mt-1 text-2xl font-extrabold leading-tight text-slate-900">{nomeRodada(rodada)}</p>
      <p className="mt-1 text-xl text-slate-700">
        Vale <b className="text-marca-700">{fmt(rodada.pontos)} pontos</b>
      </p>

      <Relogio
        valor={falta ?? <RadioTower size={72} strokeWidth={2.2} />}
        fracao={fim ? falta / total : 1}
        legenda={fim ? 'segundos para confirmar' : 'toque abaixo para entrar'}
        urgente={falta !== null && falta <= 5}
      />

      <button
        onClick={aoParticipar}
        className="mt-8 flex min-h-[76px] w-full items-center justify-center gap-3 rounded-3xl bg-ouro-400 text-2xl font-black text-marca-900 shadow-lg shadow-ouro-500/40 active:scale-[.98]"
      >
        <Hand size={30} /> VOU PARTICIPAR
      </button>
      <p className="mt-3 text-base text-slate-600">Ao tocar, o anúncio começa com som. Aumente o volume!</p>
      <button onClick={aoSair} className="mt-6 min-h-[48px] px-4 text-lg font-semibold text-slate-600 underline">
        Agora não, voltar ao início
      </button>
    </div>
  )
}

/** Contagem 3, 2, 1 antes do vídeo. */
function Preparar({ aoTerminar, esperando }) {
  const { segundos, fracao } = useContagem(SEGUNDOS_PREPARAR, aoTerminar)
  return (
    <div className="flex min-h-full flex-col items-center justify-center text-center animate-fade-up">
      <p className="text-2xl font-extrabold text-emerald-700">Você está participando!</p>
      <Relogio valor={esperando ? <Loader2 size={64} className="animate-spin" /> : segundos} fracao={fracao} legenda="o vídeo já vai começar" cor="emerald" />
      <p className="mt-6 flex items-center gap-2 text-lg text-slate-700">
        <Volume2 size={24} className="text-marca-700" /> Deixe o som do celular ligado
      </p>
    </div>
  )
}

/** Resposta enviada → botão "Confira sua resposta" (o toque libera o som do vídeo seguinte). */
function Enviada({ aoConferir }) {
  return (
    <div className="flex min-h-full flex-col items-center justify-center text-center animate-fade-up">
      <div className="grid h-28 w-28 place-items-center rounded-full bg-emerald-100 text-emerald-600 animate-pop">
        <Send size={52} />
      </div>
      <h2 className="mt-6 text-3xl font-extrabold text-slate-900">Resposta enviada!</h2>
      <p className="mt-2 text-xl text-slate-700">Toque abaixo para ver se você acertou.</p>
      <button
        onClick={aoConferir}
        className="mt-8 flex min-h-[76px] w-full items-center justify-center gap-2.5 rounded-3xl bg-ouro-400 px-3 text-xl font-black text-marca-900 shadow-lg shadow-ouro-500/40 active:scale-[.98]"
      >
        <Eye size={28} className="shrink-0" /> CONFIRA SUA RESPOSTA
      </button>
    </div>
  )
}

/** Relógio redondo grande, com o anel diminuindo. */
function Relogio({ valor, fracao, legenda, urgente = false, cor = 'marca' }) {
  const r = 88
  const volta = 2 * Math.PI * r
  const traco = urgente ? '#dc2626' : cor === 'emerald' ? '#059669' : '#363c80'
  return (
    <div className="relative mt-6 h-56 w-56">
      <svg viewBox="0 0 200 200" className="h-full w-full -rotate-90">
        <circle cx="100" cy="100" r={r} fill="#ffffff" stroke="#e2e8f0" strokeWidth="14" />
        <circle
          cx="100"
          cy="100"
          r={r}
          fill="none"
          stroke={traco}
          strokeWidth="14"
          strokeLinecap="round"
          strokeDasharray={volta}
          strokeDashoffset={volta * (1 - Math.max(0, Math.min(1, fracao)))}
          style={{ transition: 'stroke-dashoffset .25s linear' }}
        />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center" style={{ color: traco }}>
        <span className={`text-7xl font-black tabular-nums leading-none ${urgente ? 'animate-pulse' : ''}`}>{valor}</span>
        <span className="mt-2 max-w-[140px] text-sm font-bold leading-tight text-slate-600">{legenda}</span>
      </div>
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

/**
 * Anúncio entre as etapas. Fica montado (escondido) desde a etapa anterior para o vídeo já estar carregado
 * quando chegar a vez dele; a contagem só começa quando `ativo`.
 */
function Anuncio({ ativo, segundos, patrocinador, aoTerminar, titulo, texto, cor }) {
  // termina no fim da contagem ou quando o vídeo acabar, o que vier primeiro
  const terminou = useRef(false)
  const terminar = () => {
    if (terminou.current || !ativo) return
    terminou.current = true
    aoTerminar()
  }
  return (
    <div className={ativo ? 'flex min-h-full flex-col animate-fade-up' : 'hidden'} aria-hidden={!ativo}>
      {ativo && <ContagemAnuncio segundos={segundos} aoTerminar={terminar} titulo={titulo} texto={texto} cor={cor} />}
      <div className="flex flex-1 flex-col justify-center gap-4 py-6">
        <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">Anúncio</p>
        <PecaAnuncio p={patrocinador} comSom tocar={ativo} aoTerminarVideo={terminar} />
      </div>
    </div>
  )
}

function ContagemAnuncio({ segundos, aoTerminar, titulo, texto, cor }) {
  const { segundos: s, fracao, oculto } = useContagem(segundos, aoTerminar, { pausarQuandoOculto: true })
  const aviso = cor === 'emerald' ? 'bg-emerald-600' : 'bg-marca-600'
  return (
    <>
      <div className={`rounded-3xl p-4 text-white ${aviso}`}>
        <div className="flex items-center gap-4">
          <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white text-4xl font-extrabold tabular-nums text-slate-900">{s}</div>
          <div>
            <p className="text-2xl font-extrabold leading-tight">{titulo}</p>
            <p className="mt-1 text-lg leading-snug">{texto}</p>
          </div>
        </div>
        <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/25">
          <div className="h-full rounded-full bg-white transition-[width] duration-100 ease-linear" style={{ width: `${(1 - fracao) * 100}%` }} />
        </div>
      </div>
      {oculto && <p className="mt-3 rounded-xl bg-ouro-100 p-3 text-center text-lg font-bold text-ouro-900">Contagem parada. Volte para esta tela.</p>}
    </>
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
            urgente ? 'animate-pulse bg-red-600 text-white' : 'bg-white text-slate-900 ring-2 ring-slate-300'
          }`}
        >
          {segundos}
        </div>
        <div className="flex-1">
          <p className="text-lg font-bold text-slate-800">{urgente ? 'Rápido! O tempo está acabando' : 'Segundos para responder'}</p>
          <div className="mt-1.5 h-3 overflow-hidden rounded-full bg-slate-200">
            <div className={`h-full rounded-full transition-[width] duration-100 ease-linear ${urgente ? 'bg-red-600' : 'bg-marca-700'}`} style={{ width: `${fracaoTotal * 100}%` }} />
          </div>
        </div>
      </div>

      <p className="mt-5 text-lg font-bold text-marca-700">Vale {fmt(rodada.pontos)} pontos</p>
      <h2 className="mt-1 text-2xl font-extrabold leading-snug text-slate-900">{pergunta.pergunta}</h2>

      <p className="mt-5 text-lg text-slate-700">{enviando ? 'Enviando sua resposta…' : 'Toque na resposta certa:'}</p>
      <div className="mt-3 space-y-3">
        {pergunta.alternativas.map((alt, i) => {
          const marcada = escolhida === i
          const c = COR_ALTERNATIVA
          return (
            <button
              key={i}
              onClick={() => enviar(i)}
              disabled={enviando}
              aria-pressed={marcada}
              className={`flex min-h-[68px] w-full items-center gap-3 rounded-2xl border-b-[5px] bg-gradient-to-br px-3 py-2.5 text-left shadow-md transition active:translate-y-0.5 active:border-b-2 ${c.botao} ${
                marcada ? 'scale-[1.02] ring-4 ring-ouro-400 ring-offset-2' : enviando ? 'opacity-35' : ''
              }`}
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center rounded-xl text-2xl font-black ${c.letra}`}>
                {marcada ? <Loader2 size={26} className="animate-spin" /> : String.fromCharCode(65 + i)}
              </span>
              <span className={`text-xl font-bold leading-snug ${c.texto}`}>{alt}</span>
            </button>
          )
        })}
      </div>
    </div>
  )
}

// Todas as alternativas no azul da Difusora, com a letra em dourado
const COR_ALTERNATIVA = { botao: 'from-marca-600 to-marca-800 border-marca-900', letra: 'bg-ouro-400 text-marca-900', texto: 'text-white' }

function Resultado({ rodada, resultado, aoSair }) {
  const { proximaRodada } = useDados()
  const acertou = resultado?.acertou
  const titulo = acertou ? 'Você acertou!' : resultado?.tempo_esgotado ? 'O tempo acabou' : 'Não foi desta vez'

  return (
    <div className="flex min-h-full flex-col animate-fade-up">
      <div className={`rounded-3xl p-6 text-center text-white ${acertou ? 'bg-emerald-600' : 'bg-slate-800'}`}>
        <div className="mx-auto grid h-20 w-20 place-items-center rounded-full bg-white animate-pop">
          {acertou ? <Check size={48} className="text-emerald-600" /> : <X size={48} className="text-red-600" />}
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
          Aguarde a próxima pergunta, <b>{proximaFalada(proximaRodada)}</b>.
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
