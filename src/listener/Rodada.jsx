import { useEffect, useMemo, useRef, useState } from 'react'
import { Check, Eye, Hand, Loader2, RadioTower, Send, X } from 'lucide-react'
import { DURACOES } from '../config.js'
import { fmt, nomeRodada, useDados } from '../store.jsx'
import { TextoProxima } from './TextoProxima.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { useContagem } from '../ui.jsx'
import { BannerPatrocinadores, PecaAnuncio, liberarVideos, patrocinadoresDoEspaco, sequenciaPonderada } from '../anuncios.jsx'
import { contarExibicao } from '../exibicoes.js'
import { agoraServidor, instanteRodada, useRelogio } from '../relogio.js'

// Fluxo de uma rodada:
//   confirmar ("Vou participar", com o relógio da rodada) → anuncio1 (começa no toque; a contagem vai até a
//   hora em que a pergunta abre para todos) → pergunta
//   → enviada ("Confira sua resposta") → anuncio2 → resultado
// Os toques em "Vou participar" e "Confira sua resposta" são o que permite ao navegador tocar o vídeo já com som.
// Ao confirmar, o servidor guarda a vaga: quem entrou com a rodada no ar responde mesmo que ela feche durante o anúncio.
// O servidor marca a hora em que a pergunta abriu e confere a resposta (ver supabase/migrations).

/** Fim do tempo para confirmar: o encerramento da rodada automática (null se não tiver relógio). */
function fimDaEntrada(rodada) {
  const fim = rodada.modo === 'automatico' ? instanteRodada(rodada.data, rodada.horario_fim) : null
  // reaberta à mão depois do horário: não tem relógio
  return fim && !(rodada.no_ar_em && new Date(rodada.no_ar_em) >= fim) ? fim : null
}

export default function Rodada({ aoSair }) {
  const { rodadaNoAr, rodadas, patrocinadores, modoApresentacao, recarregarMinhasRespostas } = useDados()
  // Fixa a rodada ao entrar, mesmo que o admin troque a rodada no ar no meio do caminho.
  const [rodada] = useState(rodadaNoAr)
  const [etapa, setEtapa] = useState('confirmar')
  const [abrePergunta, setAbrePergunta] = useState(null) // instante em que a pergunta abre para todos
  const entrada = useRef(null) // pedido da vaga ao servidor (a pergunta só abre depois dele)
  const [pergunta, setPergunta] = useState(null)
  const [resultado, setResultado] = useState(null)
  const [erro, setErro] = useState('')

  // Patrocinadores dos dois anúncios: escolhidos pelo servidor quando a rodada entrou no ar (rodízio com peso,
  // iguais para todos os ouvintes). Sem essa escolha (banco antigo), usa a posição da rodada no rodízio.
  const [patrocinador1, patrocinador2] = useMemo(() => {
    const porId = (id) => patrocinadores.find((p) => p.id === id) ?? null
    const reserva = (espaco, desloca) => {
      const seq = sequenciaPonderada(patrocinadoresDoEspaco(patrocinadores, espaco))
      const i = Math.max(0, rodadas.findIndex((r) => r.id === rodada?.id))
      return seq.length ? seq[(i + desloca) % seq.length] : null
    }
    return [
      rodada?.patrocinador_pergunta ? porId(rodada.patrocinador_pergunta) : reserva('anuncio_pergunta', 0),
      rodada?.patrocinador_resultado ? porId(rodada.patrocinador_resultado) : reserva('anuncio_resultado', 1),
    ]
  }, [patrocinadores, rodadas, rodada])

  if (!rodada)
    return (
      <Moldura banner>
        <Mensagem texto="Nenhuma pergunta no ar agora." aoSair={aoSair} />
      </Moldura>
    )

  const curto = modoApresentacao ? DURACOES.modoApresentacao : null

  const responder = async (alternativa) => {
    const { data, error } = await supabase.rpc('responder', { p_rodada: rodada.id, p_alternativa: alternativa })
    if (error) return setErro(mensagemDeErro(error))
    setResultado(data)
    recarregarMinhasRespostas()
    return data
  }

  // "Vou participar": o anúncio começa no próprio toque (é o que libera o som, inclusive no iPhone).
  // A pergunta abre para todos no mesmo instante: fim do tempo da rodada + duração do anúncio.
  // Tempos fixos dos espaços: 15 s antes de responder e 30 s depois (o vídeo mais longo é cortado)
  const segundosAnuncio1 = curto ?? DURACOES.anuncioPergunta
  const participar = () => {
    liberarVideos() // precisa ser no próprio toque, antes de qualquer espera
    const agora = agoraServidor().getTime()
    const fim = fimDaEntrada(rodada)
    const base = fim && fim.getTime() > agora ? fim.getTime() : agora
    setAbrePergunta(new Date(base + segundosAnuncio1 * 1000))
    setEtapa('anuncio1')
    entrada.current = supabase.rpc('entrar_na_rodada', { p_rodada: rodada.id }).then(async ({ error }) => {
      if (error?.message.includes('ja_respondida')) {
        if (await responder(null)) setEtapa('resultado')
        return false
      }
      // banco sem o 011 ainda: segue como antes
      if (error && !/entrar_na_rodada|schema cache|function/i.test(error.message)) {
        setErro(mensagemDeErro(error))
        return false
      }
      return true
    })
  }

  const abrirPergunta = async () => {
    setEtapa('abrindo')
    if (entrada.current && !(await entrada.current)) return
    const { data, error } = await supabase.rpc('abrir_pergunta', { p_rodada: rodada.id })
    if (error) {
      // Já respondeu (ex.: fechou o app no meio): mostra o resultado que ficou registrado.
      if (error.message.includes('ja_respondida') && (await responder(null))) return setEtapa('resultado')
      return setErro(mensagemDeErro(error))
    }
    setPergunta(data)
    setEtapa('pergunta')
  }

  if (erro)
    return (
      <Moldura banner>
        <Mensagem texto={erro} aoSair={aoSair} />
      </Moldura>
    )

  // Telas de espera levam o banner dos patrocinadores embaixo (menos "Vou participar", que precisa do espaço para o botão)
  return (
    <Moldura banner={['abrindo', 'enviada', 'resultado'].includes(etapa)}>
      {etapa === 'confirmar' && <Confirmar rodada={rodada} aoParticipar={participar} aoSair={aoSair} />}
      {['confirmar', 'anuncio1'].includes(etapa) && (
        <Anuncio
          key="a1"
          ativo={etapa === 'anuncio1'}
          ate={abrePergunta}
          espaco="anuncio_pergunta"
          patrocinador={patrocinador1}
          aoTerminar={abrirPergunta}
          titulo="Fique nesta tela"
          texto="A pergunta abre para todos ao mesmo tempo."
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
      {etapa === 'enviada' && (
        <Enviada
          aoConferir={() => {
            liberarVideos()
            setEtapa('anuncio2')
          }}
        />
      )}
      {['pergunta', 'enviada', 'anuncio2'].includes(etapa) && (
        <Anuncio
          key="a2"
          ativo={etapa === 'anuncio2'}
          segundos={curto ?? DURACOES.anuncioGabarito}
          espaco="anuncio_resultado"
          patrocinador={patrocinador2}
          aoTerminar={() => setEtapa('resultado')}
          titulo="Já vem o resultado!"
          texto="Depois deste anúncio você vê se acertou."
          cor="emerald"
        />
      )}
      {etapa === 'resultado' && <Resultado rodada={rodada} resultado={resultado} imagem={pergunta?.imagem_url} aoSair={aoSair} />}
    </Moldura>
  )
}

/** Moldura das telas da rodada: faixa com o logotipo da Difusora no topo e, nas telas de espera, banner embaixo. */
function Moldura({ banner = false, children }) {
  const { patrocinadores } = useDados()
  return (
    <div className="flex h-full flex-col bg-slate-50">
      <div className="fundo-marca flex shrink-0 items-center justify-between px-4 py-2.5">
        <img src="/logo-difusora-branco.png" alt="Difusora 107,3 FM" className="h-9 w-auto" />
        <span className="text-sm font-extrabold uppercase tracking-wider text-ouro-300">Pergunta da Hora</span>
      </div>
      <div className="no-scrollbar flex-1 overflow-y-auto px-4 pb-6 pt-4">{children}</div>
      {/* banner vertical (9:16) pequeno, para não tomar a tela de espera */}
      {banner && (
        <BannerPatrocinadores
          patrocinadores={patrocinadores}
          espaco="banner_espera"
          className="mx-auto mb-3 aspect-[9/16] shrink-0 rounded-2xl shadow-md ring-1 ring-slate-200"
          style={{ height: 'min(26vh, 230px)' }}
          mostrarSelo={false}
        />
      )}
    </div>
  )
}

/** Relógio grande da rodada + botão "Vou participar". */
function Confirmar({ rodada, aoParticipar, aoSair }) {
  const agora = useRelogio()
  const fim = fimDaEntrada(rodada)
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
        className="mt-6 flex min-h-[76px] w-full items-center justify-center gap-3 rounded-3xl bg-ouro-400 text-2xl font-black text-marca-900 shadow-lg shadow-ouro-500/40 active:scale-[.98]"
      >
        <Hand size={30} /> VOU PARTICIPAR
      </button>
      <p className="mt-3 text-base text-slate-600">Ao tocar, o anúncio começa com som. Aumente o volume!</p>
      <button onClick={aoSair} className="mt-3 min-h-[48px] px-4 text-lg font-semibold text-slate-600 underline">
        Agora não, voltar ao início
      </button>
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
        className="mt-6 flex min-h-[76px] w-full items-center justify-center gap-2.5 rounded-3xl bg-ouro-400 px-3 text-xl font-black text-marca-900 shadow-lg shadow-ouro-500/40 active:scale-[.98]"
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
    <div className="relative mt-4 h-48 w-48">
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
        <span className={`text-6xl font-black tabular-nums leading-none ${urgente ? 'animate-pulse' : ''}`}>{valor}</span>
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

function BotaoGrande({ className = 'bg-marca-700 text-white', children, ...props }) {
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
function Anuncio({ ativo, espaco, segundos, ate, patrocinador, aoTerminar, titulo, texto, cor }) {
  useEffect(() => {
    if (ativo) contarExibicao(patrocinador?.id, espaco)
  }, [ativo, patrocinador?.id, espaco])
  // Com `segundos`: termina no fim da contagem ou quando o vídeo acabar, o que vier primeiro.
  // Com `ate`: termina na hora marcada (relógio do servidor), igual para todos; se o vídeo acabar antes, aguarda.
  const terminou = useRef(false)
  const [videoAcabou, setVideoAcabou] = useState(false)
  const terminar = () => {
    if (terminou.current || !ativo) return
    terminou.current = true
    aoTerminar()
  }
  return (
    <div className={ativo ? 'flex min-h-full flex-col animate-fade-up' : 'hidden'} aria-hidden={!ativo}>
      {ativo &&
        (ate ? (
          <ContagemAte ate={ate} aoTerminar={terminar} titulo={titulo} texto={texto} cor={cor} />
        ) : (
          <ContagemAnuncio segundos={segundos} aoTerminar={terminar} titulo={titulo} texto={texto} cor={cor} />
        ))}
      <div className="flex flex-1 flex-col justify-center gap-2 py-3">
        {videoAcabou ? (
          <div className="rounded-3xl bg-white p-8 text-center ring-2 ring-slate-200">
            <Loader2 className="mx-auto animate-spin text-marca-600" size={40} />
            <p className="mt-4 text-2xl font-extrabold text-slate-900">Prepare-se!</p>
            <p className="mt-1 text-lg text-slate-700">A pergunta já vai abrir.</p>
            <BannerEspera />
          </div>
        ) : (
          <>
            <p className="text-center text-sm font-bold uppercase tracking-widest text-slate-500">Anúncio</p>
            <PecaAnuncio p={patrocinador} comSom tocar={ativo} aoTerminarVideo={ate ? () => ativo && setVideoAcabou(true) : terminar} />
          </>
        )}
      </div>
    </div>
  )
}

function BannerEspera() {
  const { patrocinadores } = useDados()
  return (
    <BannerPatrocinadores
      patrocinadores={patrocinadores}
      espaco="banner_espera"
      className="mx-auto mt-6 aspect-[9/16] rounded-2xl text-left shadow-md"
      style={{ height: 'min(34vh, 300px)' }}
      mostrarSelo={false}
    />
  )
}

/** Contagem até um instante (relógio do servidor), para todos os celulares virarem juntos. */
function ContagemAte({ ate, aoTerminar, titulo, texto, cor }) {
  const [agora, setAgora] = useState(agoraServidor)
  const total = useRef(Math.max(1, ate - agoraServidor()))
  useEffect(() => {
    const t = setInterval(() => setAgora(agoraServidor()), 200)
    return () => clearInterval(t)
  }, [])
  const falta = ate - agora
  useEffect(() => {
    if (falta <= 0) aoTerminar()
  }, [falta, aoTerminar])
  const fracao = Math.max(0, falta) / total.current
  const aviso = cor === 'emerald' ? 'bg-emerald-600' : 'bg-marca-600'
  return (
    <div className={`rounded-3xl p-4 text-white ${aviso}`}>
      <div className="flex items-center gap-4">
        <div className="grid h-20 w-20 shrink-0 place-items-center rounded-full bg-white text-4xl font-extrabold tabular-nums text-slate-900">
          {Math.max(0, Math.ceil(falta / 1000))}
        </div>
        <div>
          <p className="text-2xl font-extrabold leading-tight">{titulo}</p>
          <p className="mt-1 text-lg leading-snug">{texto}</p>
        </div>
      </div>
      <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-white/25">
        <div className="h-full rounded-full bg-white transition-[width] duration-200 ease-linear" style={{ width: `${(1 - fracao) * 100}%` }} />
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
      {pergunta.imagem_url && <ImagemPergunta url={pergunta.imagem_url} />}
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

/** Imagem da pergunta. Tocar abre em tela cheia (para ver os detalhes); tocar de novo fecha. */
function ImagemPergunta({ url }) {
  const [carregou, setCarregou] = useState(false)
  const [cheia, setCheia] = useState(false)
  return (
    <>
      <button type="button" onClick={() => setCheia(true)} className="relative mt-3 block w-full overflow-hidden rounded-2xl bg-slate-200">
        <img src={url} alt="Imagem da pergunta" onLoad={() => setCarregou(true)} className="mx-auto max-h-[28vh] w-full object-contain" />
        {!carregou && (
          <span className="absolute inset-0 grid min-h-[160px] place-items-center">
            <Loader2 className="animate-spin text-marca-600" size={36} />
          </span>
        )}
        {carregou && <span className="absolute bottom-2 right-2 rounded-full bg-black/60 px-3 py-1 text-sm font-semibold text-white">Toque para ampliar</span>}
      </button>
      {cheia && (
        <button type="button" onClick={() => setCheia(false)} className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-4 bg-black/90 p-4">
          <img src={url} alt="Imagem da pergunta" className="max-h-[80vh] w-full object-contain" />
          <span className="rounded-full bg-white px-6 py-3 text-lg font-bold text-slate-900">Voltar para a pergunta</span>
        </button>
      )}
    </>
  )
}

function Resultado({ rodada, resultado, imagem, aoSair }) {
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
        {imagem && <img src={imagem} alt="" className="mb-3 max-h-40 w-full rounded-2xl bg-slate-100 object-contain" />}
        <p className="text-lg text-slate-700">A resposta certa era:</p>
        <p className="mt-1 text-2xl font-extrabold leading-snug text-emerald-700">{resultado?.resposta_correta}</p>
        {resultado?.explicacao && <p className="mt-3 text-lg leading-relaxed text-slate-800">{resultado.explicacao}</p>}
      </div>

      {proximaRodada && proximaRodada.id !== rodada.id && (
        <p className="mt-4 rounded-2xl bg-slate-100 px-4 py-3 text-center text-xl text-slate-800">
          <TextoProxima rodada={proximaRodada} />
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
