import { useState } from 'react'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, Gift, Medal, Play, Radio, Trophy, XCircle } from 'lucide-react'
import { RADIO } from '../config.js'
import { fmt, useStore } from '../store.jsx'
import { Avatar, Card, Selo } from '../ui.jsx'
import Rodada from './Rodada.jsx'

export default function ListenerApp() {
  const { state } = useStore()
  const [tela, setTela] = useState('inicio')

  if (!state.usuario) return <Boasvindas />
  if (tela === 'rodada') return <Rodada aoSair={() => setTela('inicio')} />

  return (
    <div className="flex h-full flex-col">
      <Cabecalho />
      <div key={tela} className="no-scrollbar flex-1 overflow-y-auto px-5 pb-8 pt-5 animate-fade-up">
        {tela === 'inicio' && <Inicio irPara={setTela} />}
        {tela === 'ranking' && <Ranking voltar={() => setTela('inicio')} />}
        {tela === 'grade' && <Grade voltar={() => setTela('inicio')} />}
        {tela === 'premios' && <Premios voltar={() => setTela('inicio')} />}
      </div>
    </div>
  )
}

function Cabecalho() {
  const { state, minhaPosicao } = useStore()
  return (
    <header className="flex items-center gap-3 border-b border-slate-100 bg-white px-5 py-3.5">
      <Avatar nome={state.usuario.nome} destaque />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold">{state.usuario.nome}</p>
        <p className="flex items-center gap-1 text-xs text-slate-500">
          <Trophy size={13} className="text-amber-500" />
          <span className="font-bold text-amber-600">{fmt(state.usuario.pontos)} pts</span>
          <span className="text-slate-300">•</span>#{minhaPosicao} Lugar
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

function Inicio({ irPara }) {
  const { state, rodadaAtual, proximaRodada, minhaPosicao } = useStore()
  const resposta = rodadaAtual && state.respostas[rodadaAtual.id]
  const premio = [...state.premios].sort((a, b) => a.colocacao - b.colocacao)[0]

  return (
    <div className="space-y-4">
      {rodadaAtual ? (
        <Card className="p-5">
          <div className="flex items-center justify-between">
            <Selo>
              <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" />
              Pergunta das {rodadaAtual.horario}
            </Selo>
            <Selo cor="amber" className="normal-case">+{fmt(rodadaAtual.pontos)} Pts</Selo>
          </div>
          <p className="mt-4 text-[11px] font-bold uppercase tracking-wider text-slate-400">Ao vivo no rádio</p>
          <h2 className="mt-1 font-display text-[17px] leading-snug">{rodadaAtual.titulo}</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-slate-500">{rodadaAtual.descricao}</p>

          {resposta ? (
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
        <Card className="p-5 text-center text-sm text-slate-500">Nenhuma rodada cadastrada.</Card>
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
            <span className="text-xs font-semibold text-amber-900">Ver Todos ({state.premios.length}) →</span>
          </div>
          <p className="mt-2 font-display text-[15px]">{premio.titulo}</p>
          <p className="mt-0.5 text-xs text-slate-600">
            Oferecido por: {premio.oferecidoPor} para o {premio.colocacao}º Colocado
          </p>
        </button>
      )}

      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Sua classificação</p>
          <p className="mt-0.5 font-display text-[15px]">
            #{minhaPosicao} Lugar <span className="font-sans text-sm font-normal text-slate-500">({fmt(state.usuario.pontos)} pts)</span>
          </p>
        </div>
        <button onClick={() => irPara('ranking')} className="rounded-lg bg-slate-100 px-3.5 py-2 text-[13px] font-semibold hover:bg-slate-200">
          Abrir Ranking
        </button>
      </Card>
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

function Ranking({ voltar }) {
  const { ranking } = useStore()
  const medalha = ['text-amber-500', 'text-slate-400', 'text-orange-700']
  const top = ranking.slice(0, 10)
  const eu = ranking.find((o) => o.eu)
  return (
    <>
      <Titulo voltar={voltar}>Ranking da Semana</Titulo>
      <Card className="divide-y divide-slate-100">
        {top.map((o) => (
          <LinhaRanking key={o.id} o={o} medalha={medalha[o.posicao - 1]} />
        ))}
      </Card>
      {eu && eu.posicao > 10 && (
        <Card className="mt-3">
          <LinhaRanking o={eu} />
        </Card>
      )}
    </>
  )
}

function LinhaRanking({ o, medalha }) {
  return (
    <div className={`flex items-center gap-3 px-4 py-3 ${o.eu ? 'bg-rose-50/70' : ''}`}>
      <span className="w-6 text-center text-sm font-bold text-slate-500">
        {medalha ? <Medal size={20} className={medalha} /> : o.posicao}
      </span>
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
  const { state, rodadasOrdenadas, rodadaAtual } = useStore()
  return (
    <>
      <Titulo voltar={voltar}>Grade de Hoje</Titulo>
      <div className="space-y-2.5">
        {rodadasOrdenadas.map((r) => {
          const resp = state.respostas[r.id]
          const noAr = r.id === rodadaAtual?.id && !resp
          return (
            <Card key={r.id} className={`flex items-center gap-3 p-3.5 ${noAr ? 'ring-2 ring-rose-500' : ''}`}>
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
  const { state } = useStore()
  return (
    <>
      <Titulo voltar={voltar}>Prêmios da Semana</Titulo>
      <div className="space-y-3">
        {[...state.premios]
          .sort((a, b) => a.colocacao - b.colocacao)
          .map((p) => (
            <Card key={p.id} className="flex items-center gap-3.5 p-4">
              <div className="grid h-12 w-12 place-items-center rounded-xl bg-amber-50 font-display text-lg text-amber-600">{p.colocacao}º</div>
              <div className="min-w-0">
                <p className="font-display text-[15px]">{p.titulo}</p>
                <p className="text-xs text-slate-500">Oferecido por {p.oferecidoPor}</p>
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

function Boasvindas() {
  const { dispatch } = useStore()
  const [nome, setNome] = useState('')
  const valido = nome.trim().length >= 3
  return (
    <div className="flex h-full flex-col justify-center bg-gradient-to-b from-rose-600 to-rose-700 px-7 text-white">
      <div className="grid h-16 w-16 place-items-center rounded-2xl bg-white/15 animate-pop">
        <Radio size={32} />
      </div>
      <h1 className="mt-6 font-display text-3xl leading-tight">Pergunta da Hora</h1>
      <p className="mt-2 text-sm text-rose-100">
        Ouça a {RADIO.nome} {RADIO.frequencia}, responda as perguntas do locutor e concorra a prêmios toda semana!
      </p>
      <form
        className="mt-8 space-y-3"
        onSubmit={(e) => {
          e.preventDefault()
          if (valido) dispatch({ type: 'SET_USUARIO', nome: nome.trim() })
        }}
      >
        <label className="block text-xs font-semibold uppercase tracking-wider text-rose-100" htmlFor="nome">
          Como podemos te chamar?
        </label>
        <input
          id="nome"
          value={nome}
          onChange={(e) => setNome(e.target.value)}
          placeholder="Seu nome"
          autoComplete="name"
          className="w-full rounded-xl bg-white px-4 py-3.5 text-slate-900 outline-none ring-4 ring-transparent focus:ring-white/30"
        />
        <button
          disabled={!valido}
          className="w-full rounded-xl bg-slate-900 py-3.5 text-sm font-extrabold uppercase tracking-wide transition disabled:opacity-40"
        >
          Começar a jogar
        </button>
        <p className="text-center text-[11px] text-rose-200">Demo: na versão final, o login será feito pela conta Google/Apple do celular.</p>
      </form>
    </div>
  )
}
