import { useEffect, useRef, useState } from 'react'
import { Bell, BellOff, Hand, CalendarClock, CheckCircle2, Clock, ChevronLeft, ChevronRight, Gift, History, LifeBuoy, LogOut, Radio, Trophy, XCircle } from 'lucide-react'
import { RADIO } from '../config.js'
import { Carregando, TelaLogin, TelaNome, useAuth } from '../auth.jsx'
import { fmt, fmtHorario, hojeSP, nomeRodada, useDados, useRanking } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { Avatar } from '../ui.jsx'
import { fmtFalta, fmtHora, instanteRodada, useRelogio } from '../relogio.js'
import { usePush } from '../push.js'
import Rodada from './Rodada.jsx'
import { TextoProxima } from './TextoProxima.jsx'
import { DetalheParticipacao, SeloSituacao, fmtDataHora } from '../historico.jsx'

// Telas pensadas para um público mais velho: letras grandes, alto contraste,
// uma ação principal por tela e botões com texto (não só ícone).

export default function ListenerApp() {
  const { carregando: carregandoAuth, sessao, perfil } = useAuth()
  if (carregandoAuth) return <Carregando />
  if (!sessao) return <TelaLogin />
  if (!perfil?.nome) return <TelaNome />
  return <AppLogado />
}

function AppLogado() {
  const { carregando, erro, minhasRespostas, rodadaNoAr } = useDados()
  const [tela, setTela] = useState('inicio')
  const [saiuDe, setSaiuDe] = useState(null)
  const { ranking, eu } = useRanking(10, minhasRespostas)

  // Pergunta entrou no ar (no horário ou pelo botão da produção): abre sozinha a tela "Vou participar",
  // de qualquer tela do app. Se a pessoa voltar ao início, não abre de novo para a mesma vez no ar.
  const chaveNoAr = rodadaNoAr ? `${rodadaNoAr.id}:${rodadaNoAr.no_ar_em}` : null
  const jaRespondeu = rodadaNoAr && minhasRespostas[rodadaNoAr.id]?.respondida_em
  const emRodada = useRef(null) // qual vez no ar a tela da rodada está mostrando
  const abrirRodada = () => {
    emRodada.current = chaveNoAr
    setTela('rodada')
  }
  useEffect(() => {
    if (tela !== 'rodada' && chaveNoAr && !jaRespondeu && chaveNoAr !== saiuDe && !carregando) abrirRodada()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [chaveNoAr, jaRespondeu, saiuDe, carregando, tela])

  if (carregando) return <Carregando texto="Sintonizando…" />
  if (tela === 'rodada')
    return (
      <Rodada
        aoSair={() => {
          setSaiuDe(emRodada.current)
          setTela('inicio')
        }}
      />
    )

  const voltar = () => setTela('inicio')
  return (
    <div className="flex h-full flex-col bg-slate-50">
      {erro && <p className="bg-red-100 px-5 py-3 text-base font-semibold text-red-800">{mensagemDeErro(erro)}</p>}
      <div key={tela} className="no-scrollbar flex-1 overflow-y-auto px-4 pb-10 pt-4 animate-fade-up">
        {tela === 'inicio' && <Inicio irPara={(t) => (t === 'rodada' ? abrirRodada() : setTela(t))} eu={eu} />}
        {tela === 'ranking' && <Ranking ranking={ranking} voltar={voltar} />}
        {tela === 'grade' && <Grade voltar={voltar} />}
        {tela === 'premios' && <Premios voltar={voltar} />}
        {tela === 'ajuda' && <Ajuda voltar={voltar} />}
        {tela === 'historico' && <MeuHistorico voltar={voltar} />}
      </div>
    </div>
  )
}

const posicaoTexto = (eu) => (eu ? `${eu.posicao}º lugar` : 'Sem colocação ainda')

function Inicio({ irPara, eu }) {
  const { perfil, sair } = useAuth()
  const { rodadaNoAr, proximaRodada, minhasRespostas } = useDados()
  const resposta = rodadaNoAr && minhasRespostas[rodadaNoAr.id]
  const respondida = resposta?.respondida_em

  return (
    <div className="space-y-4">
      <RelogioOuvinte />
      {/* Saudação e pontos */}
      <div className="flex items-center gap-3 px-1 pt-1">
        <Avatar nome={perfil.nome} destaque tamanho="w-14 h-14" />
        <div className="min-w-0">
          <p className="truncate text-2xl font-extrabold text-slate-900">Olá, {perfil.nome.split(' ')[0]}!</p>
          <p className="text-lg text-slate-700">
            {eu ? (
              <>
                <b className="text-ouro-700">{fmt(eu.pontos)} pontos</b> · {eu.posicao}º lugar
              </>
            ) : (
              'Acerte uma pergunta para entrar no ranking'
            )}
          </p>
        </div>
      </div>

      {/* Cartão principal: o que fazer agora */}
      {rodadaNoAr && !respondida && (
        <div className="fundo-marca rounded-3xl p-5 text-white shadow-lg shadow-marca-700/30">
          <p className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide text-ouro-300">
            <span className="h-3 w-3 animate-pulse rounded-full bg-ouro-300" /> Pergunta no ar!
          </p>
          <p className="mt-2 text-2xl font-extrabold leading-tight">{nomeRodada(rodadaNoAr)}</p>
          <p className="mt-2 text-xl">
            Vale <b className="text-ouro-300">{fmt(rodadaNoAr.pontos)} pontos</b>
          </p>
          <FechaEm rodada={rodadaNoAr} />
          <button
            onClick={() => irPara('rodada')}
            className="mt-5 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-ouro-400 text-xl font-extrabold text-marca-900 shadow-md shadow-black/20 active:scale-[.98]"
          >
            <Hand size={28} /> VOU PARTICIPAR
          </button>
        </div>
      )}

      {rodadaNoAr && respondida && (
        <div className={`rounded-3xl p-5 ${resposta.acertou ? 'bg-emerald-600 text-white' : 'bg-white text-slate-900 ring-2 ring-slate-200'}`}>
          <p className="flex items-center gap-2 text-2xl font-extrabold">
            {resposta.acertou ? <CheckCircle2 size={30} /> : <XCircle size={30} className="text-red-600" />}
            {resposta.acertou ? 'Você acertou!' : 'Você já respondeu'}
          </p>
          <p className="mt-2 text-xl">
            {resposta.acertou ? `Ganhou ${fmt(resposta.pontos)} pontos nesta pergunta.` : 'Desta vez não deu. Fique ligado na próxima!'}
          </p>
          <ProximaPergunta rodada={proximaRodada} claro={resposta.acertou} />
        </div>
      )}

      {!rodadaNoAr && (
        <div className="rounded-3xl bg-white p-5 ring-2 ring-slate-200">
          <div className="flex items-center gap-3">
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-marca-100 text-marca-700">
              <Radio size={30} />
            </div>
            <p className="text-xl font-semibold leading-snug text-slate-900">
              {proximaRodada ? <TextoProxima rodada={proximaRodada} /> : <b className="text-2xl">Aguarde a próxima pergunta.</b>}
            </p>
          </div>
          <p className="mt-3 text-lg leading-relaxed text-slate-700">
            Ouça a <b>{RADIO.frequencia} FM</b>. Quando o locutor anunciar, a pergunta aparece aqui sozinha.
          </p>
        </div>
      )}

      <AvisosCelular />

      {/* Menu com botões grandes */}
      <div className="grid grid-cols-2 gap-3">
        <BotaoMenu icone={Trophy} cor="text-ouro-600 bg-ouro-100" titulo="Ranking" detalhe={posicaoTexto(eu)} onClick={() => irPara('ranking')} />
        <BotaoMenu icone={Gift} cor="text-marca-700 bg-marca-100" titulo="Prêmios" detalhe="Da semana" onClick={() => irPara('premios')} />
        <BotaoMenu icone={History} cor="text-sky-700 bg-sky-100" titulo="Meu histórico" detalhe="Minhas respostas" onClick={() => irPara('historico')} />
        <BotaoMenu icone={CalendarClock} cor="text-violet-700 bg-violet-100" titulo="Horários" detalhe="Perguntas de hoje" onClick={() => irPara('grade')} />
      </div>

      <div className="grid grid-cols-2 gap-3 pt-1">
        <button onClick={() => irPara('ajuda')} className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-slate-800 ring-2 ring-slate-200">
          <LifeBuoy size={22} /> Ajuda
        </button>
        <button onClick={sair} className="flex min-h-[56px] items-center justify-center gap-2 rounded-2xl bg-white text-lg font-bold text-slate-800 ring-2 ring-slate-200">
          <LogOut size={22} /> Sair
        </button>
      </div>
    </div>
  )
}

const CHAVE_AGORA_NAO = 'pergunta-da-hora:avisos-agora-nao'
const lerAgoraNao = () => {
  try {
    return localStorage.getItem(CHAVE_AGORA_NAO) === '1'
  } catch {
    return false
  }
}

/** Convite para ligar as notificações (aviso quando a pergunta entra no ar). */
function AvisosCelular() {
  const { estado, erro, ativar, desativar } = usePush()
  const [agoraNao, setAgoraNao] = useState(lerAgoraNao)
  const esconder = () => {
    setAgoraNao(true)
    try {
      localStorage.setItem(CHAVE_AGORA_NAO, '1')
    } catch {
      // sem armazenamento, o cartão volta na próxima visita
    }
  }

  if (estado === 'carregando') return null
  if (estado === 'ativo')
    return (
      <div className="flex items-center justify-between rounded-2xl bg-emerald-50 px-4 py-3 ring-2 ring-emerald-200">
        <span className="flex items-center gap-2 text-lg font-semibold text-emerald-800">
          <Bell size={22} /> Avisos ligados neste celular
        </span>
        <button onClick={desativar} className="min-h-[44px] px-2 text-base font-semibold text-slate-600 underline">
          Desligar
        </button>
      </div>
    )
  if (agoraNao) return null

  return (
    <div className="rounded-3xl bg-ouro-50 p-5 ring-2 ring-ouro-200">
      <p className="flex items-center gap-2 text-xl font-extrabold text-slate-900">
        <Bell size={26} className="text-ouro-600" /> Quer ser avisado?
      </p>
      <p className="mt-2 text-lg leading-relaxed text-slate-800">O celular toca um aviso na hora em que a pergunta entrar no ar.</p>

      {estado === 'inativo' && (
        <>
          <button onClick={ativar} className="mt-4 flex min-h-[60px] w-full items-center justify-center gap-2 rounded-2xl bg-marca-700 text-xl font-extrabold text-white active:scale-[.98]">
            <Bell size={24} /> QUERO SER AVISADO
          </button>
          <p className="mt-2 text-base text-slate-700">
            Depois, toque em <b>Permitir</b> na mensagem que vai aparecer.
          </p>
        </>
      )}
      {estado === 'ios-instalar' && (
        <ol className="mt-3 list-decimal space-y-1 pl-6 text-lg leading-relaxed text-slate-800">
          <li>
            Toque no botão <b>Compartilhar</b> do Safari (o quadrado com a seta para cima).
          </li>
          <li>
            Escolha <b>Adicionar à Tela de Início</b>.
          </li>
          <li>Abra o quiz pelo ícone novo e toque em "Quero ser avisado".</li>
          <li className="list-none text-base text-slate-600">Funciona no iPhone com iOS 16.4 ou mais novo.</li>
        </ol>
      )}
      {estado === 'bloqueado' && (
        <p className="mt-3 flex gap-2 text-lg leading-relaxed text-slate-800">
          <BellOff size={22} className="mt-1 shrink-0 text-marca-600" />
          Os avisos estão bloqueados neste celular. Para liberar, toque no cadeado ao lado do endereço do site, depois em
          Notificações e escolha Permitir.
        </p>
      )}
      {estado === 'nao-suportado' && (
        <p className="mt-3 text-lg leading-relaxed text-slate-800">Este navegador não recebe avisos. Abra o link no Chrome (Android) ou no Safari (iPhone).</p>
      )}
      {erro && <p className="mt-2 text-base font-semibold text-red-700">{erro}</p>}
      <button onClick={esconder} className="mt-3 min-h-[44px] w-full text-center text-base font-semibold text-slate-600 underline">
        Agora não
      </button>
    </div>
  )
}

/** Hora oficial (do servidor), para o ouvinte conferir com a hora falada no rádio. */
function RelogioOuvinte() {
  const agora = useRelogio()
  return (
    <div className="flex items-center justify-between gap-3 rounded-3xl bg-white px-4 py-3 ring-2 ring-slate-200">
      <img src="/logo-difusora.png" alt={`${RADIO.nome} ${RADIO.frequencia}`} className="h-12 w-auto" />
      <span className="text-right">
        <span className="flex items-center justify-end gap-1.5 text-sm font-semibold text-slate-600">
          <Clock size={16} /> Agora são
        </span>
        <span className="block text-2xl font-extrabold tabular-nums text-marca-800">{fmtHora(agora)}</span>
      </span>
    </div>
  )
}

/** Rodada automática: quanto tempo falta para fechar (pelo relógio do servidor). */
function FechaEm({ rodada }) {
  const agora = useRelogio()
  const fim = rodada.modo === 'automatico' ? instanteRodada(rodada.data, rodada.horario_fim) : null
  if (!fim || fim <= agora) return null
  return (
    <p className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/20 px-4 py-1.5 text-lg font-bold tabular-nums">
      <Clock size={20} /> Toque em até {fmtFalta(fim - agora)}
    </p>
  )
}

function ProximaPergunta({ rodada, claro = false }) {
  if (!rodada) return null
  return (
    <p className={`mt-4 rounded-2xl px-4 py-3 text-lg ${claro ? 'bg-white/20' : 'bg-slate-100 text-slate-800'}`}>
      <TextoProxima rodada={rodada} />
    </p>
  )
}

function BotaoMenu({ icone: I, cor, titulo, detalhe, onClick }) {
  return (
    <button onClick={onClick} className="flex min-h-[120px] flex-col items-start justify-between rounded-2xl bg-white p-4 text-left ring-2 ring-slate-200 active:scale-[.98]">
      <span className={`grid h-12 w-12 place-items-center rounded-xl ${cor}`}>
        <I size={26} />
      </span>
      <span>
        <span className="block text-xl font-extrabold leading-tight text-slate-900">{titulo}</span>
        <span className="block text-base text-slate-600">{detalhe}</span>
      </span>
    </button>
  )
}

function Titulo({ voltar, children }) {
  return (
    <div className="mb-4">
      <button onClick={voltar} className="flex min-h-[48px] items-center gap-1 rounded-xl bg-white pl-2 pr-4 text-lg font-bold text-slate-800 ring-2 ring-slate-200">
        <ChevronLeft size={24} /> Voltar
      </button>
      <h2 className="mt-4 text-3xl font-extrabold text-slate-900">{children}</h2>
    </div>
  )
}

function Caixa({ className = '', children }) {
  return <div className={`rounded-2xl bg-white ring-2 ring-slate-200 ${className}`}>{children}</div>
}

function Ranking({ ranking, voltar }) {
  if (!ranking) return <Carregando />
  const top = ranking.filter((o) => o.posicao <= 10)
  const eu = ranking.find((o) => o.eu)
  const medalha = { 1: '🥇', 2: '🥈', 3: '🥉' }
  return (
    <>
      <Titulo voltar={voltar}>Ranking da semana</Titulo>
      {eu && (
        <div className="mb-4 rounded-2xl bg-marca-600 p-4 text-white">
          <p className="text-lg">Sua posição</p>
          <p className="text-3xl font-extrabold">{eu.posicao}º lugar</p>
          <p className="text-xl">{fmt(eu.pontos)} pontos</p>
        </div>
      )}
      {top.length ? (
        <Caixa className="divide-y-2 divide-slate-100">
          {top.map((o) => (
            <div key={o.posicao} className={`flex items-center gap-3 px-4 py-4 ${o.eu ? 'bg-marca-50' : ''}`}>
              <span className="w-10 text-center text-2xl font-extrabold text-slate-700">{medalha[o.posicao] ?? `${o.posicao}º`}</span>
              <span className={`min-w-0 flex-1 truncate text-xl ${o.eu ? 'font-extrabold text-marca-700' : 'font-semibold text-slate-900'}`}>
                {o.nome}
                {o.eu && ' (você)'}
              </span>
              <span className="text-lg font-bold text-slate-800">{fmt(o.pontos)}</span>
            </div>
          ))}
        </Caixa>
      ) : (
        <Caixa className="p-6 text-center text-xl text-slate-700">Ninguém pontuou nesta semana ainda. Seja o primeiro!</Caixa>
      )}
      <p className="mt-4 text-center text-base text-slate-600">O ranking recomeça toda segunda-feira.</p>
    </>
  )
}

function Grade({ voltar }) {
  const { rodadas, minhasRespostas } = useDados()
  const hoje = hojeSP()
  const deHoje = rodadas.filter((r) => !r.data || r.data === hoje)
  return (
    <>
      <Titulo voltar={voltar}>Perguntas de hoje</Titulo>
      {deHoje.length === 0 && <Caixa className="p-6 text-center text-xl text-slate-700">Não há perguntas marcadas para hoje.</Caixa>}
      <div className="space-y-3">
        {deHoje.map((r) => {
          const resp = minhasRespostas[r.id]?.respondida_em ? minhasRespostas[r.id] : null
          const noAr = r.status === 'no_ar'
          const situacao = resp ? (resp.acertou ? 'Você acertou' : 'Você respondeu') : noAr ? 'No ar agora!' : r.status === 'encerrada' ? 'Encerrada' : 'Ainda vai começar'
          return (
            <Caixa key={r.id} className={`flex items-center gap-4 p-4 ${noAr && !resp ? 'ring-marca-500' : ''}`}>
              <span className="text-2xl font-extrabold text-slate-900">{fmtHorario(r.horario)}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-snug text-slate-900">{nomeRodada(r)}</p>
                <p className={`text-base font-semibold ${noAr && !resp ? 'text-marca-700' : resp?.acertou ? 'text-emerald-700' : 'text-slate-600'}`}>
                  {situacao} · {fmt(r.pontos)} pontos
                </p>
              </div>
            </Caixa>
          )
        })}
      </div>
    </>
  )
}

function Premios({ voltar }) {
  const { premios } = useDados()
  return (
    <>
      <Titulo voltar={voltar}>Prêmios da semana</Titulo>
      <div className="space-y-3">
        {premios.map((p) => (
          <Caixa key={p.id} className="flex items-center gap-4 p-4">
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-ouro-100 text-2xl font-extrabold text-ouro-700">{p.colocacao}º</div>
            <div className="min-w-0">
              <p className="text-xl font-extrabold leading-snug text-slate-900">{p.titulo}</p>
              <p className="text-base text-slate-700">Oferecido por {p.oferecido_por}</p>
            </div>
          </Caixa>
        ))}
      </div>
      <p className="mt-4 text-center text-base leading-relaxed text-slate-600">
        Os prêmios vão para os primeiros colocados do ranking da semana. Regulamento disponível na rádio.
      </p>
    </>
  )
}

function Ajuda({ voltar }) {
  const { perfil } = useAuth()
  const [mensagem, setMensagem] = useState('')
  const [estado, setEstado] = useState('editando') // editando | enviando | enviado
  const [erro, setErro] = useState('')

  const enviar = async (e) => {
    e.preventDefault()
    setEstado('enviando')
    const { error } = await supabase.from('feedback').insert({
      usuario_id: perfil.id,
      mensagem: mensagem.trim(),
      tela: 'app-ouvinte',
      navegador: navigator.userAgent.slice(0, 300),
    })
    if (error) {
      setErro(mensagemDeErro(error))
      return setEstado('editando')
    }
    setEstado('enviado')
  }

  return (
    <>
      <Titulo voltar={voltar}>Ajuda</Titulo>
      <Caixa className="mb-4 space-y-3 p-4 text-lg leading-relaxed text-slate-800">
        <p>
          <b>Como participar:</b> ouça a {RADIO.frequencia} FM. Quando o locutor anunciar, toque em <b>Responder agora</b>.
        </p>
        <p>
          Depois de um anúncio rápido, a pergunta aparece. <b>Toque na resposta certa</b> antes do tempo acabar: ela é enviada na hora.
        </p>
      </Caixa>
      {estado === 'enviado' ? (
        <Caixa className="p-6 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={44} />
          <p className="mt-3 text-xl font-bold text-slate-900">Recebemos sua mensagem. Obrigado!</p>
        </Caixa>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <label htmlFor="msg" className="block text-xl font-bold text-slate-900">
            Teve algum problema? Escreva para a rádio:
          </label>
          <textarea
            id="msg"
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={5}
            maxLength={2000}
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg outline-none focus:border-marca-500"
          />
          {erro && <p className="text-lg text-red-700">{erro}</p>}
          <button disabled={!mensagem.trim() || estado === 'enviando'} className="min-h-[60px] w-full rounded-2xl bg-marca-600 text-xl font-extrabold text-white disabled:opacity-50">
            Enviar mensagem
          </button>
        </form>
      )}
      <p className="pt-4 text-center text-sm text-slate-400">Versão {__VERSAO__}</p>
    </>
  )
}

function MeuHistorico({ voltar }) {
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState('')
  const [aberto, setAberto] = useState(null)

  useEffect(() => {
    supabase.rpc('meu_historico', { p_limite: 200 }).then(({ data, error }) => {
      if (error) setErro(mensagemDeErro(error))
      else setItens(data)
    })
  }, [])

  return (
    <>
      <Titulo voltar={voltar}>Meu histórico</Titulo>
      <p className="mb-4 text-lg leading-relaxed text-slate-700">
        Aqui ficam todas as suas respostas. Se precisar reclamar de algo, informe à rádio o <b>número do protocolo</b>.
      </p>
      {erro && <p className="text-lg text-red-700">{erro}</p>}
      {!itens && !erro && <Carregando />}
      {itens?.length === 0 && <Caixa className="p-6 text-center text-xl text-slate-700">Você ainda não respondeu nenhuma pergunta.</Caixa>}
      <div className="space-y-3">
        {itens?.map((h) => (
          <Caixa key={h.protocolo} className="overflow-hidden">
            <button onClick={() => setAberto(aberto === h.protocolo ? null : h.protocolo)} className="block w-full p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-bold leading-snug text-slate-900">
                  {fmtHorario(h.rodada_horario)} · {h.rodada_titulo}
                </p>
                <SeloSituacao h={h} grande />
              </div>
              <p className="mt-1 text-base text-slate-700">{fmtDataHora(h.aberta_em)}</p>
              <div className="mt-2 flex items-center justify-between text-base">
                <span className="text-slate-700">
                  Protocolo <b className="font-mono text-slate-900">{h.protocolo}</b>
                </span>
                <span className="text-lg font-extrabold text-slate-900">{fmt(h.pontos)} pts</span>
              </div>
              <p className="mt-2 flex items-center gap-1 text-base font-semibold text-marca-700">
                {aberto === h.protocolo ? 'Esconder detalhes' : 'Ver a pergunta e a resposta'} <ChevronRight size={18} className={aberto === h.protocolo ? 'rotate-90' : ''} />
              </p>
            </button>
            {aberto === h.protocolo && (
              <div className="border-t-2 border-slate-100 bg-slate-50 p-4">
                <DetalheParticipacao h={h} grande />
              </div>
            )}
          </Caixa>
        ))}
      </div>
    </>
  )
}
