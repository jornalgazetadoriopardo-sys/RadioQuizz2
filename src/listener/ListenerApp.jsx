import { useEffect, useState } from 'react'
import { CalendarClock, CheckCircle2, Clock, ChevronLeft, ChevronRight, Gift, History, LifeBuoy, LogOut, Play, Radio, Trophy, XCircle } from 'lucide-react'
import { RADIO } from '../config.js'
import { Carregando, TelaLogin, TelaNome, useAuth } from '../auth.jsx'
import { fmt, hojeSP, quandoTexto, useDados, useRanking } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { Avatar } from '../ui.jsx'
import { fmtHora, useRelogio } from '../relogio.js'
import Rodada from './Rodada.jsx'
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
  const { carregando, erro, minhasRespostas } = useDados()
  const [tela, setTela] = useState('inicio')
  const { ranking, eu } = useRanking(10, minhasRespostas)

  if (carregando) return <Carregando texto="Sintonizando…" />
  if (tela === 'rodada') return <Rodada aoSair={() => setTela('inicio')} />

  const voltar = () => setTela('inicio')
  return (
    <div className="flex h-full flex-col bg-slate-50">
      {erro && <p className="bg-rose-100 px-5 py-3 text-base font-semibold text-rose-800">{mensagemDeErro(erro)}</p>}
      <div key={tela} className="no-scrollbar flex-1 overflow-y-auto px-4 pb-10 pt-4 animate-fade-up">
        {tela === 'inicio' && <Inicio irPara={setTela} eu={eu} />}
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
                <b className="text-amber-700">{fmt(eu.pontos)} pontos</b> · {eu.posicao}º lugar
              </>
            ) : (
              'Acerte uma pergunta para entrar no ranking'
            )}
          </p>
        </div>
      </div>

      {/* Cartão principal: o que fazer agora */}
      {rodadaNoAr && !respondida && (
        <div className="rounded-3xl bg-rose-600 p-5 text-white shadow-lg shadow-rose-600/30">
          <p className="flex items-center gap-2 text-lg font-extrabold uppercase tracking-wide">
            <span className="h-3 w-3 animate-pulse rounded-full bg-white" /> Pergunta no ar!
          </p>
          <p className="mt-2 text-2xl font-extrabold leading-tight">{rodadaNoAr.titulo}</p>
          <p className="mt-2 text-xl">
            Vale <b>{fmt(rodadaNoAr.pontos)} pontos</b>
          </p>
          <button
            onClick={() => irPara('rodada')}
            className="mt-5 flex min-h-[64px] w-full items-center justify-center gap-3 rounded-2xl bg-white text-xl font-extrabold text-rose-700 shadow-md active:scale-[.98]"
          >
            <Play size={26} fill="currentColor" /> RESPONDER AGORA
          </button>
        </div>
      )}

      {rodadaNoAr && respondida && (
        <div className={`rounded-3xl p-5 ${resposta.acertou ? 'bg-emerald-600 text-white' : 'bg-white text-slate-900 ring-2 ring-slate-200'}`}>
          <p className="flex items-center gap-2 text-2xl font-extrabold">
            {resposta.acertou ? <CheckCircle2 size={30} /> : <XCircle size={30} className="text-rose-600" />}
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
            <div className="grid h-14 w-14 shrink-0 place-items-center rounded-2xl bg-rose-100 text-rose-700">
              <Radio size={30} />
            </div>
            <p className="text-2xl font-extrabold leading-tight text-slate-900">Aguarde a próxima pergunta</p>
          </div>
          <p className="mt-3 text-lg leading-relaxed text-slate-700">
            Ouça a <b>{RADIO.frequencia} FM</b>. Quando o locutor anunciar, a pergunta aparece aqui sozinha.
          </p>
          <ProximaPergunta rodada={proximaRodada} />
        </div>
      )}

      {/* Menu com botões grandes */}
      <div className="grid grid-cols-2 gap-3">
        <BotaoMenu icone={Trophy} cor="text-amber-600 bg-amber-100" titulo="Ranking" detalhe={posicaoTexto(eu)} onClick={() => irPara('ranking')} />
        <BotaoMenu icone={Gift} cor="text-rose-700 bg-rose-100" titulo="Prêmios" detalhe="Da semana" onClick={() => irPara('premios')} />
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

/** Hora oficial (do servidor), para o ouvinte conferir com a hora falada no rádio. */
function RelogioOuvinte() {
  const agora = useRelogio()
  return (
    <div className="flex items-center justify-between rounded-2xl bg-slate-900 px-4 py-2.5 text-white">
      <span className="flex items-center gap-2 text-base font-semibold">
        <Clock size={20} /> Agora são
      </span>
      <span className="text-2xl font-extrabold tabular-nums">{fmtHora(agora)}</span>
    </div>
  )
}

function ProximaPergunta({ rodada, claro = false }) {
  if (!rodada) return null
  return (
    <p className={`mt-4 rounded-2xl px-4 py-3 text-lg ${claro ? 'bg-white/20' : 'bg-slate-100 text-slate-800'}`}>
      Próxima pergunta: <b className="text-xl">{quandoTexto(rodada)}</b>
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
        <div className="mb-4 rounded-2xl bg-rose-600 p-4 text-white">
          <p className="text-lg">Sua posição</p>
          <p className="text-3xl font-extrabold">{eu.posicao}º lugar</p>
          <p className="text-xl">{fmt(eu.pontos)} pontos</p>
        </div>
      )}
      {top.length ? (
        <Caixa className="divide-y-2 divide-slate-100">
          {top.map((o) => (
            <div key={o.posicao} className={`flex items-center gap-3 px-4 py-4 ${o.eu ? 'bg-rose-50' : ''}`}>
              <span className="w-10 text-center text-2xl font-extrabold text-slate-700">{medalha[o.posicao] ?? `${o.posicao}º`}</span>
              <span className={`min-w-0 flex-1 truncate text-xl ${o.eu ? 'font-extrabold text-rose-700' : 'font-semibold text-slate-900'}`}>
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
            <Caixa key={r.id} className={`flex items-center gap-4 p-4 ${noAr && !resp ? 'ring-rose-500' : ''}`}>
              <span className="text-2xl font-extrabold text-slate-900">{r.horario}</span>
              <div className="min-w-0 flex-1">
                <p className="text-lg font-semibold leading-snug text-slate-900">{r.titulo}</p>
                <p className={`text-base font-semibold ${noAr && !resp ? 'text-rose-700' : resp?.acertou ? 'text-emerald-700' : 'text-slate-600'}`}>
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
            <div className="grid h-16 w-16 shrink-0 place-items-center rounded-2xl bg-amber-100 text-2xl font-extrabold text-amber-700">{p.colocacao}º</div>
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
            className="w-full rounded-2xl border-2 border-slate-300 bg-white p-4 text-lg outline-none focus:border-rose-500"
          />
          {erro && <p className="text-lg text-rose-700">{erro}</p>}
          <button disabled={!mensagem.trim() || estado === 'enviando'} className="min-h-[60px] w-full rounded-2xl bg-rose-600 text-xl font-extrabold text-white disabled:opacity-50">
            Enviar mensagem
          </button>
        </form>
      )}
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
      {erro && <p className="text-lg text-rose-700">{erro}</p>}
      {!itens && !erro && <Carregando />}
      {itens?.length === 0 && <Caixa className="p-6 text-center text-xl text-slate-700">Você ainda não respondeu nenhuma pergunta.</Caixa>}
      <div className="space-y-3">
        {itens?.map((h) => (
          <Caixa key={h.protocolo} className="overflow-hidden">
            <button onClick={() => setAberto(aberto === h.protocolo ? null : h.protocolo)} className="block w-full p-4 text-left">
              <div className="flex items-start justify-between gap-2">
                <p className="text-lg font-bold leading-snug text-slate-900">
                  {h.rodada_horario} · {h.rodada_titulo}
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
              <p className="mt-2 flex items-center gap-1 text-base font-semibold text-rose-700">
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
