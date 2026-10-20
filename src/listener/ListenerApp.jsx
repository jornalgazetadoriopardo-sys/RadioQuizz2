import { useEffect, useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Gift, History, LogOut, Medal, MessageSquareWarning, Play, RadioTower, Trophy, XCircle } from 'lucide-react'
import { RADIO } from '../config.js'
import { Carregando, TelaLogin, TelaNome, useAuth } from '../auth.jsx'
import { fmt, useDados, useRanking } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { Avatar, Card, Selo } from '../ui.jsx'
import Rodada from './Rodada.jsx'
import { DetalheParticipacao, SeloSituacao, fmtDataHora } from '../historico.jsx'

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

  return (
    <div className="flex h-full flex-col">
      <Cabecalho eu={eu} />
      {erro && <p className="bg-rose-50 px-5 py-2 text-xs text-rose-700">{mensagemDeErro(erro)}</p>}
      <div key={tela} className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-5 animate-fade-up">
        {tela === 'inicio' && <Inicio irPara={setTela} eu={eu} />}
        {tela === 'ranking' && <Ranking ranking={ranking} voltar={() => setTela('inicio')} />}
        {tela === 'grade' && <Grade voltar={() => setTela('inicio')} />}
        {tela === 'premios' && <Premios voltar={() => setTela('inicio')} />}
        {tela === 'feedback' && <Feedback voltar={() => setTela('inicio')} />}
        {tela === 'historico' && <MeuHistorico voltar={() => setTela('inicio')} />}
      </div>
    </div>
  )
}

function Cabecalho({ eu }) {
  const { perfil } = useAuth()
  return (
    <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-3.5">
      <Avatar nome={perfil.nome} destaque />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{perfil.nome}</p>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <Trophy size={13} className="text-amber-500" />
          <span className="font-bold text-amber-600">{fmt(eu?.pontos)} pts</span>
          <span className="text-slate-300">•</span>
          {eu ? `#${eu.posicao} Lugar` : 'Sem colocação'}
        </p>
      </div>
      <span className="flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-bold">
        <span className="flex h-2.5 items-end gap-[2px]">
          <span className="h-1 w-[3px] animate-pulse rounded-sm bg-rose-600" />
          <span className="h-1.5 w-[3px] animate-pulse rounded-sm bg-rose-600 [animation-delay:150ms]" />
          <span className="h-2.5 w-[3px] animate-pulse rounded-sm bg-rose-600 [animation-delay:300ms]" />
        </span>
        {RADIO.frequencia} FM
      </span>
    </header>
  )
}

function Inicio({ irPara, eu }) {
  const { rodadaNoAr, proximaRodada, minhasRespostas, premios } = useDados()
  const { sair } = useAuth()
  const resposta = rodadaNoAr && minhasRespostas[rodadaNoAr.id]
  const respondida = resposta?.respondida_em
  const premio = premios[0]

  return (
    <div className="space-y-4">
      {rodadaNoAr ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <Selo>
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              Pergunta das {rodadaNoAr.horario}
            </Selo>
            <Selo cor="amber" className="normal-case">+{fmt(rodadaNoAr.pontos)} Pts</Selo>
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Ao vivo no rádio</p>
          <h2 className="mt-1 font-display text-[17px] leading-snug">{rodadaNoAr.titulo}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{rodadaNoAr.descricao}</p>

          {respondida ? (
            <div className={`mt-5 flex items-center gap-3 rounded-xl p-3.5 ${resposta.acertou ? 'bg-emerald-50 text-emerald-700' : 'bg-slate-100 text-slate-600'}`}>
              {resposta.acertou ? <CheckCircle2 size={22} /> : <XCircle size={22} />}
              <div className="text-sm">
                <p className="font-bold">Você já respondeu esta rodada</p>
                <p className="text-xs">{resposta.acertou ? `+${fmt(resposta.pontos)} pontos garantidos!` : 'Fique ligado na próxima pergunta!'}</p>
              </div>
            </div>
          ) : (
            <button
              onClick={() => irPara('rodada')}
              className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl bg-rose-600 py-3.5 text-sm font-extrabold uppercase tracking-wide text-white shadow-lg shadow-rose-600/25 transition hover:bg-rose-700 active:scale-[.98]"
            >
              <Play size={17} fill="currentColor" /> Responder pergunta agora
            </button>
          )}
        </Card>
      ) : (
        <Card className="p-6 text-center">
          <div className="mx-auto grid h-12 w-12 place-items-center rounded-full bg-rose-50 text-rose-600">
            <RadioTower size={24} />
          </div>
          <p className="mt-3 font-display text-[15px]">Nenhuma pergunta no ar agora</p>
          <p className="mt-1 text-[13px] text-slate-500">
            Fique ligado na {RADIO.frequencia} FM: quando o locutor anunciar, a pergunta aparece aqui na hora.
          </p>
        </Card>
      )}

      <Card className="flex items-center gap-3.5 p-4">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-rose-600">
          <Clock size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Próxima Rodada</p>
          <p className="truncate text-xs text-slate-500">
            {proximaRodada ? `${proximaRodada.horario} • Nível ${proximaRodada.nivel} (+${fmt(proximaRodada.pontos)} pts)` : 'Encerradas por hoje'}
          </p>
        </div>
        <button onClick={() => irPara('grade')} className="flex items-center text-[13px] font-bold text-rose-600">
          Ver Grade <ChevronRight size={16} />
        </button>
      </Card>

      {premio && (
        <button onClick={() => irPara('premios')} className="block w-full rounded-2xl border border-amber-200 bg-amber-50/70 p-4 text-left shadow-sm">
          <div className="flex items-center justify-between">
            <p className="flex items-center gap-2 text-[13px] font-semibold text-amber-900">
              <Gift size={17} className="text-amber-600" /> Prêmio Principal da Semana
            </p>
            <span className="text-xs font-semibold text-amber-900">Ver Todos ({premios.length}) →</span>
          </div>
          <p className="mt-2 font-display text-[15px]">{premio.titulo}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Oferecido por: {premio.oferecido_por} para o {premio.colocacao}º Colocado
          </p>
        </button>
      )}

      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sua classificação</p>
          <p className="mt-0.5 font-display text-[15px]">
            {eu ? `#${eu.posicao} Lugar` : 'Ainda sem pontos'}{' '}
            <span className="font-sans text-sm font-normal text-slate-500">({fmt(eu?.pontos)} pts)</span>
          </p>
        </div>
        <button onClick={() => irPara('ranking')} className="rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] font-semibold hover:bg-slate-200">
          Abrir Ranking
        </button>
      </Card>

      <button onClick={() => irPara('historico')} className="flex w-full items-center gap-3.5 rounded-2xl border border-slate-200/80 bg-white p-4 text-left shadow-sm">
        <div className="grid h-11 w-11 place-items-center rounded-xl bg-slate-100 text-slate-600">
          <History size={22} />
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm font-semibold">Meu histórico</p>
          <p className="text-xs text-slate-500">Suas perguntas, respostas e pontos, com data e hora</p>
        </div>
        <ChevronRight size={18} className="text-slate-400" />
      </button>

      <div className="flex items-center justify-center gap-5 pt-2 text-xs text-slate-400">
        <button onClick={() => irPara('feedback')} className="flex items-center gap-1.5 hover:text-slate-600">
          <MessageSquareWarning size={14} /> Relatar problema
        </button>
        <button onClick={sair} className="flex items-center gap-1.5 hover:text-slate-600">
          <LogOut size={14} /> Sair
        </button>
      </div>
    </div>
  )
}

function Titulo({ voltar, children }) {
  return (
    <div className="mb-4 flex items-center gap-2">
      <button onClick={voltar} className="grid h-9 w-9 place-items-center rounded-full bg-white shadow-sm ring-1 ring-slate-200" aria-label="Voltar">
        <ChevronLeft size={18} />
      </button>
      <h2 className="font-display text-lg">{children}</h2>
    </div>
  )
}

function Ranking({ ranking, voltar }) {
  const medalha = ['text-amber-500', 'text-slate-400', 'text-orange-700']
  if (!ranking) return <Carregando />
  const top = ranking.filter((o) => o.posicao <= 10)
  const eu = ranking.find((o) => o.eu)
  return (
    <>
      <Titulo voltar={voltar}>Ranking da Semana</Titulo>
      {top.length ? (
        <Card className="divide-y divide-slate-100">
          {top.map((o) => (
            <LinhaRanking key={o.posicao} o={o} medalha={medalha[o.posicao - 1]} />
          ))}
        </Card>
      ) : (
        <Card className="p-6 text-center text-sm text-slate-500">Ninguém pontuou nesta semana ainda. Seja o primeiro!</Card>
      )}
      {eu && eu.posicao > 10 && (
        <Card className="mt-3">
          <LinhaRanking o={eu} />
        </Card>
      )}
      <p className="mt-4 text-center text-[11px] text-slate-400">O ranking recomeça toda segunda-feira à 0h.</p>
    </>
  )
}

function LinhaRanking({ o, medalha }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${o.eu ? 'bg-rose-50/70' : ''}`}>
      <span className="w-6 text-center text-sm font-bold text-slate-500">{medalha ? <Medal size={20} className={medalha} /> : o.posicao}</span>
      <Avatar nome={o.nome} tamanho="w-8 h-8" destaque={o.eu} />
      <span className={`flex-1 truncate text-sm ${o.eu ? 'font-bold text-rose-700' : 'font-medium'}`}>
        {o.nome}
        {o.eu && ' (você)'}
      </span>
      <span className="text-sm font-bold text-slate-700">{fmt(o.pontos)}</span>
    </div>
  )
}

function Grade({ voltar }) {
  const { rodadas, minhasRespostas } = useDados()
  return (
    <>
      <Titulo voltar={voltar}>Grade de Hoje</Titulo>
      <div className="space-y-2.5">
        {rodadas.map((r) => {
          const resp = minhasRespostas[r.id]?.respondida_em ? minhasRespostas[r.id] : null
          const noAr = r.status === 'no_ar'
          return (
            <Card key={r.id} className={`flex items-center gap-3 p-3.5 ${noAr && !resp ? 'ring-2 ring-rose-500' : ''}`}>
              <span className="w-12 font-display text-sm">{r.horario}</span>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-semibold">{r.titulo}</p>
                <p className="text-xs text-slate-500">
                  {r.nivel} • +{fmt(r.pontos)} pts
                </p>
              </div>
              {resp ? (
                <Selo cor={resp.acertou ? 'emerald' : 'slate'} className="normal-case">{resp.acertou ? 'Acertou' : 'Respondida'}</Selo>
              ) : noAr ? (
                <Selo>No ar</Selo>
              ) : r.status === 'encerrada' ? (
                <Selo cor="slate" className="normal-case">Encerrada</Selo>
              ) : (
                <Selo cor="slate" className="normal-case">Em breve</Selo>
              )}
            </Card>
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
      <Titulo voltar={voltar}>Prêmios da Semana</Titulo>
      <div className="space-y-3">
        {premios.map((p) => (
          <Card key={p.id} className="flex items-center gap-3.5 p-4">
            <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 font-display text-lg text-amber-600">{p.colocacao}º</div>
            <div className="min-w-0">
              <p className="font-display text-[15px]">{p.titulo}</p>
              <p className="text-xs text-slate-500">Oferecido por {p.oferecido_por}</p>
            </div>
          </Card>
        ))}
      </div>
      <p className="mt-4 text-center text-[11px] leading-relaxed text-slate-400">
        Os prêmios vão para os primeiros colocados do ranking semanal. Regulamento completo disponível na rádio.
      </p>
    </>
  )
}

function Feedback({ voltar }) {
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
      <Titulo voltar={voltar}>Relatar problema</Titulo>
      {estado === 'enviado' ? (
        <Card className="p-6 text-center">
          <CheckCircle2 className="mx-auto text-emerald-600" size={32} />
          <p className="mt-3 font-semibold">Obrigado! Recebemos sua mensagem.</p>
          <button onClick={voltar} className="mt-4 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold">
            Voltar ao início
          </button>
        </Card>
      ) : (
        <form onSubmit={enviar} className="space-y-3">
          <p className="text-[13px] text-slate-500">Conte o que aconteceu ou dê sua sugestão. A equipe recebe na hora.</p>
          <textarea
            value={mensagem}
            onChange={(e) => setMensagem(e.target.value)}
            rows={6}
            maxLength={2000}
            placeholder="Ex.: o cronômetro travou na pergunta das 11h…"
            className="w-full rounded-xl border border-slate-200 bg-white p-3 text-sm outline-none focus:border-rose-400"
          />
          {erro && <p className="text-sm text-rose-600">{erro}</p>}
          <button disabled={!mensagem.trim() || estado === 'enviando'} className="w-full rounded-xl bg-rose-600 py-3 text-sm font-bold text-white disabled:opacity-50">
            Enviar
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
      <p className="mb-3 rounded-xl bg-slate-100 p-3 text-[12px] leading-relaxed text-slate-600">
        Todas as suas participações ficam registradas com o horário do servidor. Em caso de dúvida ou reclamação,
        informe à produção o <b>protocolo</b> da participação.
      </p>
      {erro && <p className="text-sm text-rose-600">{erro}</p>}
      {!itens && !erro && <Carregando />}
      {itens?.length === 0 && <Card className="p-6 text-center text-sm text-slate-500">Você ainda não participou de nenhuma rodada.</Card>}
      <div className="space-y-2.5">
        {itens?.map((h) => (
          <Card key={h.protocolo} className="overflow-hidden">
            <button onClick={() => setAberto(aberto === h.protocolo ? null : h.protocolo)} className="block w-full p-3.5 text-left">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold">
                    {h.rodada_horario} • {h.rodada_titulo}
                  </p>
                  <p className="text-[11px] text-slate-500">{fmtDataHora(h.aberta_em)}</p>
                </div>
                <SeloSituacao h={h} />
              </div>
              <div className="mt-1.5 flex items-center justify-between text-[11px] text-slate-400">
                <span>
                  Protocolo <b className="font-mono text-slate-600">{h.protocolo}</b>
                </span>
                <span className="font-bold text-slate-700">{fmt(h.pontos)} pts</span>
              </div>
            </button>
            {aberto === h.protocolo && (
              <div className="border-t border-slate-100 bg-slate-50/60 p-3.5">
                <DetalheParticipacao h={h} />
              </div>
            )}
          </Card>
        ))}
      </div>
    </>
  )
}
