import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Bell, Clock, Dices, Send, Download, Gift, History, Search, ImagePlus, ListChecks, Loader2, LogOut, Megaphone, MessageSquare, Plus, Radio, RadioTower, RotateCcw, Save,
  Check, ShieldAlert, Square, Trash2, Trophy, Users, Eye, EyeOff, MessageCircle, Zap,
} from 'lucide-react'
import { NIVEIS } from '../config.js'
import { Carregando, TelaLogin, useAuth } from '../auth.jsx'
import { comSegundos, diaMes, fmt, fmtHorario, hojeSP, horaFalada, horaSP, segundosEntre, somarSegundos, useDados, useRanking } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { diferencaDoAparelhoMs, fmtFalta, fmtHora, instanteRodada, relogioSincronizado, useRelogio } from '../relogio.js'
import { DetalheParticipacao, SeloSituacao, fmtDataHora, situacao } from '../historico.jsx'
import { Avatar, Card, Selo, Vazio } from '../ui.jsx'
import { Botao, Campo, Numero, Secao, Texto, enviarImagem, inputCls, reduzirFoto, useTabela } from './comum.jsx'
import Patrocinadores from './Patrocinadores.jsx'
import { ESPACOS } from '../anuncios.jsx'

const ABAS = [
  { id: 'aovivo', grupo: 'Programa', nome: 'Ao vivo', icone: RadioTower, descricao: 'Solte as perguntas no ar e acompanhe as respostas em tempo real.', cor: 'bg-marca-100 text-marca-600' },
  { id: 'rodadas', grupo: 'Conteúdo', nome: 'Rodadas', icone: ListChecks, descricao: 'Perguntas, horários, pontos e agendamento de cada rodada.', cor: 'bg-violet-100 text-violet-600' },
  { id: 'patrocinadores', grupo: 'Conteúdo', nome: 'Patrocinadores', icone: Megaphone, descricao: 'Vídeos do YouTube e banners, com rodízio ou horário fixo e período de circulação.', cor: 'bg-ouro-100 text-ouro-600' },
  { id: 'exibicoes', grupo: 'Conteúdo', nome: 'Exibições', icone: BarChart3, descricao: 'Quantas vezes cada patrocinador apareceu em cada espaço.', cor: 'bg-sky-100 text-sky-600' },
  { id: 'premios', grupo: 'Conteúdo', nome: 'Prêmios', icone: Gift, descricao: 'O que os primeiros colocados do ranking ganham.', cor: 'bg-emerald-100 text-emerald-600' },
  { id: 'ranking', grupo: 'Ouvintes', nome: 'Ranking', icone: Trophy, descricao: 'Classificação dos ouvintes pelos pontos.', cor: 'bg-ouro-100 text-ouro-600' },
  { id: 'cadastros', grupo: 'Ouvintes', nome: 'Cadastros', icone: Users, descricao: 'Ouvintes cadastrados: nome, e-mail, CPF e WhatsApp.', cor: 'bg-violet-100 text-violet-600' },
  { id: 'historico', grupo: 'Ouvintes', nome: 'Histórico', icone: History, descricao: 'Todas as participações, para conferir reclamações.', cor: 'bg-sky-100 text-sky-600' },
  { id: 'feedback', grupo: 'Ouvintes', nome: 'Feedback', icone: MessageSquare, descricao: 'Problemas e sugestões enviados pelo app.', cor: 'bg-slate-100 text-slate-600' },
  { id: 'avisos', grupo: 'Comunicação', nome: 'Avisos', icone: Bell, descricao: 'Notificações no celular: automáticas, agendadas e avulsas.', cor: 'bg-marca-100 text-marca-600' },
]
const GRUPOS = ['Programa', 'Conteúdo', 'Ouvintes', 'Comunicação']

export default function Admin() {
  const { carregando, sessao, perfil, sair } = useAuth()
  if (carregando) return <Carregando />
  if (!sessao) {
    return (
      <div className="mx-auto my-8 h-[620px] w-full max-w-sm overflow-hidden rounded-3xl shadow-xl">
        <TelaLogin admin />
      </div>
    )
  }
  if (!perfil?.admin) return <AcessoRestrito email={sessao.user.email} sair={sair} />
  return <Painel />
}

function AcessoRestrito({ email, sair }) {
  return (
    <div className="mx-auto mt-12 max-w-md px-4">
      <Card className="p-6 text-center">
        <ShieldAlert className="mx-auto text-red-600" size={36} />
        <h1 className="mt-3 font-display text-xl">Acesso restrito</h1>
        <p className="mt-2 text-sm text-slate-500">
          {email ? (
            <>
              A conta <b>{email}</b> ainda não é administradora.
            </>
          ) : (
            'Você entrou sem e-mail (modo teste). O painel exige uma conta com e-mail.'
          )}
        </p>
        <p className="mt-2 text-xs text-slate-400">Um administrador libera o acesso pelo Supabase (veja o arquivo LEIA-ME-SUPABASE.md do projeto).</p>
        <button onClick={sair} className="mt-5 inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold">
          <LogOut size={15} /> Sair e entrar com outra conta
        </button>
      </Card>
    </div>
  )
}

function Painel() {
  const [aba, setAba] = useState('aovivo')
  const { sair, perfil } = useAuth()
  const { modoApresentacao } = useDados()
  const [erroConfig, setErroConfig] = useState('')
  const atual = ABAS.find((a) => a.id === aba)

  const alternarApresentacao = async () => {
    const { error } = await supabase.from('configuracoes').update({ modo_apresentacao: !modoApresentacao }).eq('id', 1)
    setErroConfig(error ? mensagemDeErro(error) : '')
  }

  const ModoApresentacao = ({ className = '' }) => (
    <label className={`flex cursor-pointer items-center gap-3 rounded-2xl bg-white px-4 py-3 ring-1 ring-slate-200 ${className}`}>
      <Zap size={18} className="shrink-0 text-ouro-500" />
      <span className="min-w-0 flex-1">
        <span className="block text-sm font-semibold">Modo apresentação</span>
        <span className="block text-[11px] text-slate-500">Anúncios de 5 s para todos</span>
      </span>
      <input type="checkbox" checked={modoApresentacao} onChange={alternarApresentacao} className="h-5 w-5 accent-marca-600" />
    </label>
  )

  return (
    <div className="flex min-h-[calc(100vh-70px)] bg-slate-50">
      {/* Menu lateral (computador) */}
      <aside className="sticky top-[70px] hidden h-[calc(100vh-70px)] w-72 shrink-0 flex-col border-r border-slate-200 bg-white px-5 py-6 lg:flex">
        <div className="flex items-center gap-3 px-2">
          <div className="grid h-11 w-11 place-items-center rounded-2xl bg-gradient-to-br from-ouro-300 to-ouro-500 text-marca-800 shadow-md shadow-ouro-500/30">
            <BarChart3 size={22} />
          </div>
          <div className="min-w-0">
            <p className="font-display text-lg leading-tight text-marca-800">Painel do Quiz</p>
            <p className="truncate text-xs text-slate-500">Olá, {perfil.nome || 'admin'}</p>
          </div>
        </div>
        <nav className="mt-8 flex-1 space-y-6 overflow-y-auto no-scrollbar">
          {GRUPOS.map((g) => (
            <div key={g}>
              <p className="mb-2 px-3 text-[11px] font-bold uppercase tracking-widest text-slate-400">{g}</p>
              <div className="space-y-1">
                {ABAS.filter((a) => a.grupo === g).map(({ id, nome, icone: I, cor }) => (
                  <button
                    key={id}
                    onClick={() => setAba(id)}
                    className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold transition ${
                      aba === id ? 'bg-marca-700 text-white shadow-md shadow-marca-700/25' : 'text-slate-600 hover:bg-slate-100'
                    }`}
                  >
                    <span className={`grid h-8 w-8 place-items-center rounded-lg ${aba === id ? 'bg-white/15 text-white' : cor}`}>
                      <I size={17} />
                    </span>
                    {nome}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </nav>
        <div className="space-y-3 border-t border-slate-100 pt-5">
          <ModoApresentacao />
          <button onClick={sair} className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-sm font-semibold text-slate-600 hover:bg-slate-100">
            <LogOut size={17} /> Sair
          </button>
          <p className="px-3 text-[11px] text-slate-400">Versão {__VERSAO__}</p>
        </div>
      </aside>

      <main className="min-w-0 flex-1 px-4 py-6 sm:px-8 lg:px-10 lg:py-8">
        {/* Menu (celular e tablet) */}
        <div className="-mx-4 mb-5 flex gap-2 overflow-x-auto px-4 pb-1 no-scrollbar lg:hidden">
          {ABAS.map(({ id, nome, icone: I }) => (
            <button
              key={id}
              onClick={() => setAba(id)}
              className={`flex shrink-0 items-center gap-2 rounded-full px-4 py-2 text-sm font-semibold ring-1 transition ${
                aba === id ? 'bg-marca-700 text-white ring-marca-700' : 'bg-white text-slate-600 ring-slate-200'
              }`}
            >
              <I size={15} /> {nome}
            </button>
          ))}
        </div>

        {/* Cabeçalho da página */}
        <div className="mb-8 flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-4">
            <div className={`grid h-14 w-14 place-items-center rounded-2xl ${atual.cor}`}>
              <atual.icone size={28} />
            </div>
            <div>
              <h1 className="font-display text-2xl leading-tight sm:text-3xl">{atual.nome}</h1>
              <p className="mt-1 text-sm text-slate-500">{atual.descricao}</p>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-3">
            <RelogioOficial />
            <ModoApresentacao className="lg:hidden" />
            <Botao variante="secundario" className="lg:hidden" onClick={sair}>
              <LogOut size={15} /> Sair
            </Botao>
          </div>
        </div>
        {erroConfig && <p className="-mt-4 mb-4 text-sm text-red-600">{erroConfig}</p>}
        <p className="-mt-6 mb-4 text-[11px] text-slate-400 lg:hidden">Versão {__VERSAO__}</p>

        <div className="animate-fade-up" key={aba}>
          {aba === 'aovivo' && <AoVivo />}
          {aba === 'rodadas' && <Rodadas />}
          {aba === 'patrocinadores' && <Patrocinadores />}
          {aba === 'premios' && <Premios />}
          {aba === 'ranking' && <RankingAdmin />}
          {aba === 'historico' && <HistoricoAdmin />}
          {aba === 'cadastros' && <CadastrosAdmin />}
          {aba === 'exibicoes' && <ExibicoesAdmin />}
          {aba === 'avisos' && <AvisosAdmin />}
          {aba === 'feedback' && <FeedbackAdmin />}
        </div>
      </main>
    </div>
  )
}

/* ---------- relógio oficial ---------- */

function RelogioOficial() {
  const agora = useRelogio()
  const dif = diferencaDoAparelhoMs()
  const errado = relogioSincronizado() && Math.abs(dif) >= 5000
  return (
    <div className={`rounded-xl bg-white px-4 py-1.5 shadow-sm ring-1 ${errado ? 'ring-ouro-400' : 'ring-slate-200'}`} title="Hora do servidor, a mesma usada pelo agendamento das rodadas">
      <p className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
        <Clock size={12} /> Horário oficial (Brasília)
      </p>
      <p className="font-display text-2xl leading-tight tabular-nums">{fmtHora(agora)}</p>
      {!relogioSincronizado() && <p className="text-[11px] text-slate-500">Usando o relógio deste computador</p>}
      {errado && (
        <p className="text-[11px] font-semibold text-ouro-700">
          Este computador está {fmtFalta(Math.abs(dif))} {dif < 0 ? 'adiantado' : 'atrasado'}
        </p>
      )}
    </div>
  )
}

/** Contagem para a próxima mudança automática: a rodada no ar fechar ou a próxima automática abrir. */
function ProximoAgendamento({ rodadas, rodadaNoAr }) {
  const agora = useRelogio()
  const fimNoAr = rodadaNoAr?.modo === 'automatico' ? instanteRodada(rodadaNoAr.data, rodadaNoAr.horario_fim) : null
  const proxima = rodadas
    .filter((r) => r.modo === 'automatico' && r.status === 'agendada')
    .map((r) => ({ r, inicio: instanteRodada(r.data, r.horario) }))
    .filter((x) => x.inicio && x.inicio > agora)
    .sort((a, b) => a.inicio - b.inicio)[0]
  if (!(fimNoAr && fimNoAr > agora) && !proxima) return null
  return (
    <Card className="flex flex-wrap gap-x-8 gap-y-2 p-4">
      {fimNoAr && fimNoAr > agora && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">A rodada no ar fecha sozinha em</p>
          <p className="font-display text-2xl tabular-nums text-marca-700">{fmtFalta(fimNoAr - agora)}</p>
          <p className="text-xs text-slate-500">às {fmtHorario(rodadaNoAr.horario_fim)}</p>
        </div>
      )}
      {proxima && (
        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Próxima automática abre em</p>
          <p className="font-display text-2xl tabular-nums">{fmtFalta(proxima.inicio - agora)}</p>
          <p className="text-xs text-slate-500">
            {proxima.r.titulo} · {diaMes(proxima.r.data)} às {fmtHorario(proxima.r.horario)}
          </p>
        </div>
      )}
    </Card>
  )
}

/* ---------- dados do admin ---------- */

/* ---------- aba Ao vivo ---------- */

function AoVivo() {
  const { rodadas, rodadaNoAr } = useDados()
  const respostas = useTabela(() => supabase.from('respostas').select('rodada_id, alternativa, acertou, respondida_em, pontos'), { tempoReal: 'respostas' })
  const conteudos = useTabela(() => supabase.from('rodadas_conteudo').select('rodada_id, alternativas, correta'))
  const [ocupado, setOcupado] = useState(null)
  const [erro, setErro] = useState('')
  const [avisoMsg, setAvisoMsg] = useState('')

  const executar = async (chave, fn) => {
    setOcupado(chave)
    setErro('')
    const { error } = await fn()
    setOcupado(null)
    if (error) setErro(mensagemDeErro(error))
  }

  const lista = respostas.itens ?? []
  const daRodada = (id) => lista.filter((r) => r.rodada_id === id)

  const colocarNoAr = (r) => {
    const jaTem = daRodada(r.id).length
    const limpar = jaTem > 0 && confirm(`Esta rodada já tem ${jaTem} resposta(s). Apagar essas respostas para todos poderem responder de novo?\n\nOK = apagar e reabrir · Cancelar = reabrir mantendo as respostas`)
    executar(r.id, () => supabase.rpc('colocar_no_ar', { p_rodada: r.id, p_limpar: limpar }))
  }

  const avisar = async (r) => {
    if (!confirm(`Mandar agora a notificação da rodada "${r.titulo}" para todos os inscritos?`)) return
    setOcupado(`aviso-${r.id}`)
    setErro('')
    const resultado = await avisarRodada(r)
    setOcupado(null)
    setErro(resultado.erro ? resultado.erro : '')
    setAvisoMsg(resultado.erro ? '' : textoResultado(resultado))
  }

  const zerarTudo = () => {
    if (!confirm('Apagar TODAS as respostas e zerar o ranking? Use só na fase de testes.')) return
    executar('zerar', () => supabase.rpc('apagar_todas_respostas'))
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_460px]">
      <div className="space-y-4">
        <ProximoAgendamento rodadas={rodadas} rodadaNoAr={rodadaNoAr} />
        {rodadaNoAr ? (
          <PlacarAoVivo
            rodada={rodadaNoAr}
            respostas={daRodada(rodadaNoAr.id)}
            conteudo={conteudos.itens?.find((c) => c.rodada_id === rodadaNoAr.id)}
            encerrar={() => executar('encerrar', () => supabase.rpc('encerrar_rodada', { p_rodada: rodadaNoAr.id }))}
            ocupado={ocupado === 'encerrar'}
          />
        ) : (
          <Vazio icone={RadioTower} titulo="Nenhuma rodada no ar" texto='Escolha uma rodada ao lado e clique em "No ar", ou deixe o agendamento abrir sozinho.' />
        )}
        {erro && <p className="text-sm font-semibold text-red-600">{erro}</p>}
        {avisoMsg && <p className="text-sm font-semibold text-emerald-700">Aviso: {avisoMsg}</p>}
        {respostas.erro && <p className="text-sm text-red-600">{respostas.erro}</p>}
        <DiagnosticoAgendamento />
      </div>

      <Card className="flex flex-col">
        <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-600">Rodadas (as automáticas abrem e fecham sozinhas)</div>
        <div className="flex-1 divide-y divide-slate-100">
          {rodadas.map((r) => {
            const n = daRodada(r.id).filter((x) => x.respondida_em).length
            return (
              <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${r.status === 'no_ar' ? 'bg-marca-50/70' : ''}`}>
                <span className="w-11 shrink-0 text-center">
                  <span className="block font-display text-sm">{fmtHorario(r.horario)}</span>
                  {r.data && <span className="block text-[10px] text-slate-500">{diaMes(r.data)}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.titulo}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.status === 'no_ar' ? 'No ar' : r.status === 'encerrada' ? 'Encerrada' : 'Agendada'} • {agendaTexto(r)} • {n} resposta(s)
                  </p>
                </div>
                {r.status !== 'encerrada' && (
                  <Botao variante="secundario" className="px-2.5 py-1.5 text-xs" title="Mandar agora a notificação desta rodada" disabled={ocupado !== null} onClick={() => avisar(r)}>
                    {ocupado === `aviso-${r.id}` ? <Loader2 size={14} className="animate-spin" /> : <Bell size={14} />} Avisar
                  </Botao>
                )}
                {r.status !== 'no_ar' && (
                  <Botao variante="escuro" className="px-3 py-1.5 text-xs" disabled={ocupado !== null} onClick={() => colocarNoAr(r)}>
                    {ocupado === r.id ? <Loader2 size={14} className="animate-spin" /> : <Radio size={14} />} No ar
                  </Botao>
                )}
              </div>
            )
          })}
        </div>
        <div className="border-t border-slate-100 p-3">
          <Botao variante="perigo" className="w-full" disabled={ocupado !== null} onClick={zerarTudo}>
            <RotateCcw size={15} /> Zerar respostas e ranking (testes)
          </Botao>
        </div>
      </Card>
    </div>
  )
}

/** Mostra se o agendador do banco está rodando e como o banco vê as rodadas automáticas. */
function DiagnosticoAgendamento() {
  const [d, setD] = useState(null)
  const [erro, setErro] = useState('')
  const [ocupado, setOcupado] = useState(false)
  const agora = useRelogio()

  const carregar = useCallback(async () => {
    const { data, error } = await supabase.rpc('diagnostico_agendamento')
    setErro(error ? mensagemDeErro(error) : '')
    if (!error) setD(data)
  }, [])

  useEffect(() => {
    carregar()
    const t = setInterval(carregar, 15000)
    return () => clearInterval(t)
  }, [carregar])

  const conferir = async () => {
    setOcupado(true)
    const { error } = await supabase.rpc('conferir_agenda_agora')
    setOcupado(false)
    if (error) return setErro(mensagemDeErro(error))
    carregar()
  }

  const ultima = d?.ultimas_execucoes?.[0]
  const ultimaHa = ultima ? agora - new Date(ultima.inicio) : null
  const falhou = d?.ultimas_execucoes?.find((x) => x.status === 'failed')
  let estado = { cor: 'emerald', texto: 'Agendador funcionando' }
  if (!d) estado = null
  else if (!d.pg_cron) estado = { cor: 'rose', texto: 'Agendador não instalado: ative a extensão pg_cron e rode o 009_segundos.sql' }
  else if (!d.job) estado = { cor: 'rose', texto: 'Agendador não encontrado: rode o 009_segundos.sql' }
  else if (!d.job.ativo) estado = { cor: 'rose', texto: 'Agendador desligado no banco' }
  else if (!ultima || ultimaHa > 3 * 60_000) estado = { cor: 'amber', texto: 'O agendador não está rodando (sem conferências recentes)' }
  else if (ultima.status === 'failed') estado = { cor: 'rose', texto: 'O agendador está dando erro' }
  const corCls = { emerald: 'bg-emerald-50 text-emerald-800 ring-emerald-200', amber: 'bg-ouro-50 text-ouro-800 ring-ouro-200', rose: 'bg-marca-50 text-marca-800 ring-marca-200' }
  const status = { no_ar: 'No ar', encerrada: 'Encerrada', agendada: 'Agendada' }

  return (
    <Card className="p-4">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <p className="text-sm font-semibold text-slate-700">Diagnóstico do agendamento</p>
        <div className="flex gap-2">
          <Botao variante="secundario" className="px-2.5 py-1.5 text-xs" onClick={carregar}>
            <RotateCcw size={14} /> Atualizar
          </Botao>
          <Botao variante="escuro" className="px-2.5 py-1.5 text-xs" disabled={ocupado} onClick={conferir} title="Abre ou fecha agora as rodadas automáticas conforme o horário">
            {ocupado ? <Loader2 size={14} className="animate-spin" /> : <Clock size={14} />} Conferir agenda agora
          </Botao>
        </div>
      </div>
      {erro && (
        <p className="mt-2 text-sm text-marca-600">
          {erro} {/schema cache|diagnostico/i.test(erro) && '— rode o arquivo 010_corrige_agendamento.sql no SQL Editor.'}
        </p>
      )}
      {estado && (
        <div className={`mt-3 rounded-xl px-3 py-2 text-sm ring-1 ${corCls[estado.cor]}`}>
          <p className="font-semibold">{estado.texto}</p>
          {d.job && (
            <p className="text-xs">
              Confere a cada {d.job.frequencia.replace('* * * * *', '1 minuto').replace('seconds', 's')}
              {ultima && ` · última conferência há ${fmtFalta(Math.max(0, ultimaHa))}`}
              {d.erros_recentes > 0 && ` · ${d.erros_recentes} erro(s) na última hora`}
            </p>
          )}
          {falhou?.mensagem && <p className="mt-1 break-words font-mono text-[11px]">{falhou.mensagem}</p>}
        </div>
      )}
      {d?.rodadas?.length > 0 && (
        <div className="mt-3 divide-y divide-slate-100 text-xs">
          {d.rodadas.map((r, i) => {
            const abre = r.abre_em && new Date(r.abre_em)
            const fecha = r.fecha_em && new Date(r.fecha_em)
            const presa = (r.status === 'encerrada' && fecha > agora && abre > agora) || (r.status === 'agendada' && abre <= agora && fecha > agora)
            return (
              <div key={i} className="flex flex-wrap items-center gap-x-3 gap-y-0.5 py-1.5">
                <span className="min-w-0 flex-1 truncate font-semibold">{r.titulo}</span>
                <span className="tabular-nums text-slate-500">
                  {diaMes(r.data)} {fmtHorario(r.horario)} → {fmtHorario(r.horario_fim)}
                </span>
                <span className={`font-semibold ${r.status === 'no_ar' ? 'text-marca-600' : 'text-slate-600'}`}>{status[r.status] ?? r.status}</span>
                {presa && <span className="font-semibold text-ouro-700">⚠ deveria estar {r.status === 'agendada' ? 'no ar' : 'agendada'}</span>}
              </div>
            )
          })}
        </div>
      )}
    </Card>
  )
}

function PlacarAoVivo({ rodada, respostas, conteudo, encerrar, ocupado }) {
  const { patrocinadores } = useDados()
  const nomePatrocinador = (id) => patrocinadores.find((p) => p.id === id)?.nome
  const abriram = respostas.length
  const responderam = respostas.filter((r) => r.respondida_em)
  const acertos = responderam.filter((r) => r.acertou).length
  const esgotados = responderam.filter((r) => r.alternativa === null).length
  const porAlternativa = (conteudo?.alternativas ?? []).map((alt, i) => ({ alt, i, n: responderam.filter((r) => r.alternativa === i).length }))
  const maior = Math.max(1, ...porAlternativa.map((a) => a.n))

  return (
    <Card className="p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <Selo>
            <span className="h-2 w-2 animate-pulse rounded-full bg-red-500" /> No ar desde{' '}
            {new Date(rodada.no_ar_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Selo>
          <h2 className="mt-2 font-display text-xl">
            {fmtHorario(rodada.horario)} • {rodada.titulo}
          </h2>
          <p className="text-sm text-slate-500">
            {rodada.nivel} • vale {fmt(rodada.pontos)} pts • {rodada.tempo_resposta}s para responder
          </p>
          {(rodada.patrocinador_pergunta || rodada.patrocinador_resultado) && (
            <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-600">
              <Megaphone size={14} className="text-ouro-600" /> Anúncios: <b>{nomePatrocinador(rodada.patrocinador_pergunta) ?? '—'}</b> antes da pergunta e{' '}
              <b>{nomePatrocinador(rodada.patrocinador_resultado) ?? '—'}</b> antes do resultado
            </p>
          )}
        </div>
        <Botao variante="perigo" onClick={encerrar} disabled={ocupado}>
          <Square size={14} /> Encerrar rodada
        </Botao>
      </div>

      <div className="mt-5 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          ['Abriram a pergunta', abriram],
          ['Responderam', responderam.length],
          ['Acertaram', acertos],
          ['Taxa de acerto', responderam.length ? `${Math.round((acertos / responderam.length) * 100)}%` : '—'],
        ].map(([rotulo, valor]) => (
          <div key={rotulo} className="rounded-xl bg-slate-50 p-3">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{rotulo}</p>
            <p className="mt-1 font-display text-2xl tabular-nums">{valor}</p>
          </div>
        ))}
      </div>

      {porAlternativa.length > 0 && (
        <div className="mt-5 space-y-2">
          <p className="text-xs font-semibold text-slate-600">Respostas por alternativa</p>
          {porAlternativa.map(({ alt, i, n }) => (
            <div key={i} className="flex items-center gap-3 text-sm">
              <span className={`w-48 truncate ${i === conteudo.correta ? 'font-bold text-emerald-700' : ''}`}>
                {String.fromCharCode(65 + i)}) {alt}
              </span>
              <div className="h-5 flex-1 overflow-hidden rounded bg-slate-100">
                <div className={`h-full rounded ${i === conteudo.correta ? 'bg-emerald-500' : 'bg-slate-400'}`} style={{ width: `${(n / maior) * 100}%` }} />
              </div>
              <span className="w-8 text-right font-semibold tabular-nums">{n}</span>
            </div>
          ))}
          {esgotados > 0 && <p className="text-xs text-slate-500">{esgotados} deixaram o tempo esgotar.</p>}
        </div>
      )}
    </Card>
  )
}

/* ---------- componentes de formulário ---------- */

/** Lista à esquerda + formulário de edição à direita. */
/**
 * Lista + formulário dos cadastros do painel (rodadas, prêmios).
 * agrupar(item) → título do grupo na lista (ex.: o dia); filtros: [{ id, nome, teste(item) }].
 * O formulário vem em blocos (renderForm) e o botão Salvar fica preso no rodapé da tela.
 */
function Editor({ tabela, itens, novo, renderItem, renderForm, validar = () => true, salvar, recarregar, agrupar, filtros, textoNovo = 'Novo', nomeItem = 'item', problema }) {
  const [rascunho, setRascunho] = useState(null)
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')
  const [filtro, setFiltro] = useState(filtros?.[0]?.id)
  const set = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }))

  useEffect(() => {
    if (!rascunho && itens?.length) setRascunho(itens[0])
  }, [itens, rascunho])

  if (!itens) return <Carregando />
  const existe = rascunho && itens.some((i) => i.id === rascunho.id)
  const f = filtros?.find((x) => x.id === filtro)
  const visiveis = f ? itens.filter(f.teste) : itens
  const grupos = []
  for (const item of visiveis) {
    const g = agrupar ? agrupar(item) : ''
    if (!grupos.length || grupos[grupos.length - 1].nome !== g) grupos.push({ nome: g, itens: [] })
    grupos[grupos.length - 1].itens.push(item)
  }
  const aviso = rascunho && problema ? problema(rascunho) : ''

  const enviar = async (e) => {
    e.preventDefault()
    setEstado('salvando')
    setErro('')
    try {
      if (salvar) await salvar(rascunho)
      else {
        const { error } = await supabase.from(tabela).upsert(rascunho)
        if (error) throw error
      }
      await recarregar()
      setEstado('salvo')
      setTimeout(() => setEstado(''), 2500)
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEstado('')
    }
  }

  const excluir = async () => {
    if (!confirm(`Excluir ${nomeItem}?`)) return
    const { error } = await supabase.from(tabela).delete().eq('id', rascunho.id)
    if (error) return setErro(mensagemDeErro(error))
    await recarregar()
    setRascunho(null)
  }

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      <Card className="flex flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <Botao className="w-full" onClick={() => setRascunho(novo())}>
            <Plus size={18} /> {textoNovo}
          </Botao>
          {filtros && (
            <div className="flex flex-wrap gap-1.5">
              {filtros.map((x) => (
                <button
                  key={x.id}
                  type="button"
                  onClick={() => setFiltro(x.id)}
                  className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filtro === x.id ? 'bg-marca-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
                >
                  {x.nome} ({itens.filter(x.teste).length})
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="max-h-96 flex-1 overflow-y-auto xl:max-h-none">
          {visiveis.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nada por aqui.</p>}
          {grupos.map((g) => (
            <div key={g.nome}>
              {g.nome && <p className="sticky top-0 z-[1] bg-slate-50 px-4 py-2 text-xs font-bold uppercase tracking-wider text-slate-500">{g.nome}</p>}
              <div className="divide-y divide-slate-100">
                {g.itens.map((item) => (
                  <button
                    key={item.id}
                    onClick={() => setRascunho(item)}
                    className={`block w-full border-l-4 px-4 py-3.5 text-left transition hover:bg-slate-50 ${rascunho?.id === item.id ? 'border-marca-600 bg-marca-50/70' : 'border-transparent'}`}
                  >
                    {renderItem(item)}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      </Card>

      {rascunho ? (
        <form onSubmit={enviar} className="min-w-0 space-y-5">
          {renderForm(rascunho, set)}
          <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-slate-200 backdrop-blur">
            <Botao type="submit" disabled={!validar(rascunho) || estado === 'salvando'}>
              {estado === 'salvando' ? <Loader2 size={18} className="animate-spin" /> : <Save size={18} />} Salvar
            </Botao>
            {aviso && <span className="text-sm font-semibold text-ouro-700">{aviso}</span>}
            {estado === 'salvo' && <span className="text-sm font-semibold text-emerald-600">Salvo! Os celulares já foram atualizados.</span>}
            {erro && <span className="text-sm font-semibold text-red-600">{erro}</span>}
            {existe && (
              <Botao type="button" variante="perigo" className="ml-auto" onClick={excluir}>
                <Trash2 size={18} /> Excluir
              </Botao>
            )}
          </div>
        </form>
      ) : (
        <Vazio icone={ListChecks} titulo="Nada selecionado" texto={`Escolha na lista ou clique em "${textoNovo}".`} />
      )}
    </div>
  )
}

/* ---------- abas de cadastro ---------- */

// Faixa de pontos por nível; o sorteio gera centavos para reduzir empates.
const FAIXA_PONTOS = { 'Fácil': [20, 40], 'Médio': [40, 70], 'Difícil': [70, 100], 'Extremo': [100, 150] }
function sortearPontos(nivel) {
  const [min, max] = FAIXA_PONTOS[nivel] ?? [30, 80]
  return Math.round((min + Math.random() * (max - min)) * 100) / 100
}

const CAMPOS_RODADA = ['id', 'data', 'horario', 'horario_fim', 'modo', 'categoria', 'nivel', 'pontos', 'tempo_resposta', 'patrocinador_fixo']
const HORA = /^\d{2}:\d{2}(:\d{2})?$/

/** Texto curto do agendamento: "Automático · 21/10 · 10:30 às 10:40" ou "Manual · 10:30". */
function agendaTexto(r) {
  const dia = r.data ? `${diaMes(r.data)} · ` : ''
  const fim = r.horario_fim ? ` às ${fmtHorario(r.horario_fim)}` : ''
  const dura = r.horario_fim ? segundosEntre(comSegundos(r.horario), comSegundos(r.horario_fim)) : NaN
  const noAr = dura > 0 && dura < 600 ? ` (${dura} s no ar)` : ''
  return `${r.modo === 'automatico' ? 'Automático' : 'Manual'} · ${dia}${fmtHorario(r.horario)}${fim}${noAr}`
}

/** "Hoje · 12/11", "Amanhã · 13/11", "Sexta · 14/11" */
function nomeDoDia(data) {
  const hoje = hojeSP()
  const d = new Date(`${data}T12:00:00Z`)
  const dias = Math.round((d - new Date(`${hoje}T12:00:00Z`)) / 86400000)
  const nome = dias === 0 ? 'Hoje' : dias === 1 ? 'Amanhã' : dias === -1 ? 'Ontem' : ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado'][d.getUTCDay()]
  return `${nome} · ${diaMes(data)}`
}

function validarRodada(r) {
  if (!r.pergunta.trim()) return 'Preencha a pergunta.'
  if (!r.alternativas.every((a) => a.trim())) return 'Preencha as quatro alternativas.'
  return validarAgenda(r)
}

function validarAgenda(r) {
  if (!HORA.test(r.horario ?? '')) return 'Informe o horário.'
  if (r.horario_fim && !HORA.test(r.horario_fim)) return 'Horário de encerramento inválido.'
  if (r.horario_fim && segundosEntre(comSegundos(r.horario), comSegundos(r.horario_fim)) <= 0) return 'O encerramento precisa ser depois do início (no mesmo dia).'
  if (r.modo === 'automatico' && !r.data) return 'Rodada automática precisa de data.'
  if (r.modo === 'automatico' && !r.horario_fim) return 'Rodada automática precisa do horário de encerramento.'
  return ''
}

/** Imagem opcional da pergunta (ex.: "Quem é este cantor?"). Só chega ao ouvinte junto com a pergunta. */
function ImagemPergunta({ url, aoMudar }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const escolher = async (arquivo) => {
    if (!arquivo) return
    setErro('')
    setEnviando(true)
    try {
      aoMudar(await enviarImagem(await reduzirFoto(arquivo), 'perguntas'))
    } catch (e) {
      setErro(e.message)
    }
    setEnviando(false)
  }
  return (
    <div className="sm:col-span-6">
      <span className="mb-1.5 block text-xs font-semibold text-slate-600">Imagem da pergunta (opcional)</span>
      <div className="flex flex-wrap items-center gap-4">
        <label className="group relative grid h-28 w-40 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-marca-400">
          {enviando ? (
            <Loader2 className="animate-spin text-marca-600" />
          ) : url ? (
            <img src={url} alt="" className="h-full w-full object-contain" />
          ) : (
            <span className="flex flex-col items-center gap-1 text-xs font-semibold text-slate-500 group-hover:text-marca-600">
              <ImagePlus size={26} /> Escolher imagem
            </span>
          )}
          <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviando} onChange={(e) => escolher(e.target.files?.[0])} />
        </label>
        <div className="min-w-0 flex-1 space-y-2 text-xs leading-relaxed text-slate-500">
          <p>Para perguntas como "Quem é este cantor?" ou "Que lugar é este?". A imagem só aparece para o ouvinte junto com a pergunta.</p>
          <p>Fotos grandes são diminuídas sozinhas para carregar rápido no celular.</p>
          {url && !enviando && (
            <Botao type="button" variante="perigo" className="px-3 py-1.5 text-xs" onClick={() => aoMudar(null)}>
              <Trash2 size={14} /> Tirar a imagem
            </Botao>
          )}
          {erro && <p className="font-semibold text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  )
}

// As perguntas são diárias, a cada meia hora, a partir das 9h
const PRIMEIRA_RODADA = '09:00:00'
const INTERVALO_RODADAS_MIN = 30

/** Próximo horário livre na grade (9h, 9h30, 10h…), de hoje em diante, com o mesmo tempo no ar da última rodada. */
function proximaVaga(rodadas = []) {
  const ocupados = new Set(rodadas.map((r) => `${r.data} ${comSegundos(r.horario)}`))
  const ultima = [...rodadas].filter((r) => r.data && r.horario_fim).sort((a, b) => `${b.data}${b.horario}`.localeCompare(`${a.data}${a.horario}`))[0]
  const noAr = ultima ? segundosEntre(comSegundos(ultima.horario), comSegundos(ultima.horario_fim)) : 45
  const agora = horaSP()
  let dia = hojeSP()
  for (let d = 0; d < 60; d++) {
    for (let m = 0; segundosEntre('00:00:00', PRIMEIRA_RODADA) + m * 60 < 24 * 3600; m += INTERVALO_RODADAS_MIN) {
      const horario = somarSegundos(PRIMEIRA_RODADA, m * 60)
      if (d === 0 && horario.slice(0, 5) <= agora) continue
      if (!ocupados.has(`${dia} ${horario}`)) return { data: dia, horario, horario_fim: somarSegundos(horario, noAr > 0 ? noAr : 45) }
    }
    const amanha = new Date(`${dia}T12:00:00Z`)
    amanha.setUTCDate(amanha.getUTCDate() + 1)
    dia = amanha.toISOString().slice(0, 10)
  }
  return { data: hojeSP(), horario: PRIMEIRA_RODADA, horario_fim: somarSegundos(PRIMEIRA_RODADA, 45) }
}

function Rodadas() {
  const { itens, recarregar } = useTabela(() => supabase.from('rodadas').select('*, rodadas_conteudo(*)').order('data', { ascending: true, nullsFirst: true }).order('horario'))
  // Junta a parte pública e a secreta da rodada num único formulário.
  const lista = itens?.map(({ rodadas_conteudo: emb, ...r }) => {
    const c = Array.isArray(emb) ? emb[0] : emb
    return {
    ...r,
    pergunta: c?.pergunta ?? '',
    imagem_url: c?.imagem_url ?? null,
    alternativas: c?.alternativas ?? ['', '', '', ''],
    correta: c?.correta ?? 0,
    explicacao: c?.explicacao ?? '',
    }
  })

  const salvar = async (r) => {
    const rodada = Object.fromEntries(CAMPOS_RODADA.map((k) => [k, r[k]]))
    // Campos vazios vão como "sem valor" (o banco recusa texto vazio em data e horário)
    rodada.data = rodada.data || null
    rodada.horario = comSegundos(rodada.horario)
    rodada.horario_fim = comSegundos(rodada.horario_fim) || null
    rodada.patrocinador_fixo = rodada.patrocinador_fixo || null
    // O nome da rodada (painel, histórico e notificações) é o horário: "Pergunta das 9h30"
    rodada.categoria = ''
    rodada.titulo = `Pergunta das ${horaFalada(rodada.horario)}`
    rodada.descricao = ''
    const { error } = await supabase.from('rodadas').upsert(rodada)
    if (error) throw error
    const { error: e2 } = await supabase
      .from('rodadas_conteudo')
      .upsert({ rodada_id: r.id, pergunta: r.pergunta, imagem_url: r.imagem_url || null, alternativas: r.alternativas, correta: r.correta, explicacao: r.explicacao })
    if (e2) throw e2
  }

  return (
    <Editor
      tabela="rodadas"
      itens={lista}
      recarregar={recarregar}
      salvar={salvar}
      novo={() => ({
        id: crypto.randomUUID(),
        modo: 'automatico',
        patrocinador_fixo: null,
        ...proximaVaga(lista),
        categoria: '',
        titulo: '',
        descricao: '',
        nivel: 'Médio',
        pontos: 50,
        tempo_resposta: 15,
        pergunta: '',
        imagem_url: null,
        alternativas: ['', '', '', ''],
        correta: 0,
        explicacao: '',
      })}
      validar={(r) => validarRodada(r) === ''}
      problema={validarRodada}
      textoNovo="Nova pergunta"
      nomeItem="esta pergunta"
      agrupar={(r) => (r.data ? nomeDoDia(r.data) : 'Sem data')}
      filtros={[
        { id: 'proximas', nome: 'Próximas', teste: (r) => !r.data || r.data >= hojeSP() },
        { id: 'anteriores', nome: 'Anteriores', teste: (r) => r.data && r.data < hojeSP() },
        { id: 'todas', nome: 'Todas', teste: () => true },
      ]}
      renderItem={(r) => (
        <div className="flex items-center gap-4">
          <span className="w-16 shrink-0 text-center font-display text-xl text-marca-800">{fmtHorario(r.horario).slice(0, 5)}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-slate-900">{r.pergunta || <span className="text-slate-400">Sem pergunta ainda</span>}</p>
            <p className="truncate text-sm text-slate-500">
              {r.modo === 'automatico' ? 'Automática' : 'Manual'} · {fmt(r.pontos)} pts
            </p>
          </div>
          {r.status === 'no_ar' ? (
            <Selo>No ar</Selo>
          ) : r.status === 'encerrada' ? (
            <Selo cor="slate" className="normal-case">
              Encerrada
            </Selo>
          ) : !r.pergunta ? (
            <Selo cor="amber" className="normal-case">
              Falta pergunta
            </Selo>
          ) : null}
        </div>
      )}
      renderForm={(r, set) => (
        <>
          <Secao numero={1} titulo="Quando" descricao={`Pergunta das ${horaFalada(r.horario)}${r.data ? ` · ${nomeDoDia(r.data).toLowerCase()}` : ''}`}>
            <div className="grid gap-3 sm:grid-cols-2">
              {[
                { id: 'automatico', titulo: 'Automática (agendada)', texto: 'Abre e fecha sozinha na data e nos horários abaixo.' },
                { id: 'manual', titulo: 'Manual', texto: 'A produção clica em "No ar" e em "Encerrar" na aba Ao vivo.' },
              ].map((m) => (
                <label key={m.id} className={`flex cursor-pointer gap-3 rounded-2xl p-4 ring-2 transition ${r.modo === m.id ? 'bg-marca-50 ring-marca-500' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}>
                  <input type="radio" name="modo" checked={r.modo === m.id} onChange={() => set('modo', m.id)} className="mt-1 h-5 w-5 accent-marca-600" />
                  <span>
                    <span className="block text-base font-semibold">{m.titulo}</span>
                    <span className="mt-0.5 block text-sm text-slate-500">{m.texto}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <Campo rotulo={r.modo === 'automatico' ? 'Data' : 'Data (opcional)'}>
                <input type="date" value={r.data ?? ''} onChange={(e) => set('data', e.target.value)} className={inputCls} />
              </Campo>
              <Campo rotulo={r.modo === 'automatico' ? 'Abre às' : 'Horário previsto'}>
                <input
                  type="time"
                  step="1"
                  value={comSegundos(r.horario) ?? ''}
                  onChange={(e) => {
                    const ini = comSegundos(e.target.value)
                    // mantém o mesmo tempo no ar quando o início muda
                    const dura = segundosEntre(comSegundos(r.horario), comSegundos(r.horario_fim))
                    set('horario', ini)
                    if (dura > 0 && ini) set('horario_fim', somarSegundos(ini, dura))
                  }}
                  className={inputCls}
                />
              </Campo>
              <Campo rotulo="Fica no ar por (segundos)">
                <input
                  type="number"
                  min="1"
                  max="86399"
                  value={(() => {
                    const d = segundosEntre(comSegundos(r.horario), comSegundos(r.horario_fim))
                    return d > 0 ? d : ''
                  })()}
                  onChange={(e) => {
                    const n = Number(e.target.value)
                    set('horario_fim', n > 0 && r.horario ? somarSegundos(r.horario, n) : '')
                  }}
                  placeholder="ex.: 45"
                  className={inputCls}
                />
              </Campo>
              <Campo rotulo={r.modo === 'automatico' ? 'Fecha às' : 'Encerramento previsto'}>
                <input type="time" step="1" value={comSegundos(r.horario_fim) ?? ''} onChange={(e) => set('horario_fim', comSegundos(e.target.value))} className={inputCls} />
              </Campo>
            </div>
            <p className="mt-4 rounded-xl bg-slate-50 p-4 text-sm leading-relaxed text-slate-600">
              O tempo no ar é o prazo para o ouvinte tocar em <b>Vou participar</b>. Quem entrou a tempo vê o anúncio e depois tem o <b>tempo para
              responder</b> (bloco 4).{' '}
              {r.modo === 'automatico'
                ? 'Horário de Brasília, pelo relógio do servidor. Na aba Ao vivo, "No ar" adianta ou reabre e "Encerrar" fecha antes.'
                : 'Nas rodadas manuais, a data e os horários só aparecem para o ouvinte como informação.'}
            </p>
            {validarAgenda(r) && <p className="mt-3 text-sm font-semibold text-red-600">{validarAgenda(r)}</p>}
          </Secao>

          <Secao numero={2} titulo="Pergunta" descricao="Só aparece para o ouvinte depois do anúncio.">
            <Texto multilinha valor={r.pergunta} onChange={(v) => set('pergunta', v)} placeholder="Ex.: Quem é a cantora da foto?" />
            <div className="mt-5">
              <ImagemPergunta url={r.imagem_url} aoMudar={(v) => set('imagem_url', v)} />
            </div>
          </Secao>

          <Secao numero={3} titulo="Alternativas" descricao='Escreva as quatro e toque em "Correta" na resposta certa.'>
            <div className="space-y-3">
              {r.alternativas.map((alt, i) => {
                const certa = r.correta === i
                return (
                  <div key={i} className={`flex items-center gap-3 rounded-2xl p-2 pr-3 ring-2 transition ${certa ? 'bg-emerald-50 ring-emerald-400' : 'bg-white ring-slate-200'}`}>
                    <span className={`grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-black ${certa ? 'bg-emerald-600 text-white' : 'bg-ouro-400 text-marca-900'}`}>
                      {String.fromCharCode(65 + i)}
                    </span>
                    <div className="min-w-0 flex-1">
                      <Texto valor={alt} onChange={(v) => set('alternativas', r.alternativas.map((a, j) => (j === i ? v : a)))} placeholder={`Alternativa ${String.fromCharCode(65 + i)}`} />
                    </div>
                    <button
                      type="button"
                      onClick={() => set('correta', i)}
                      className={`flex shrink-0 items-center gap-1.5 rounded-xl px-3 py-2.5 text-sm font-bold transition ${certa ? 'bg-emerald-600 text-white' : 'bg-slate-100 text-slate-500 hover:bg-slate-200'}`}
                    >
                      <Check size={16} /> {certa ? 'Correta' : 'Marcar'}
                    </button>
                  </div>
                )
              })}
            </div>
            <Campo rotulo="Explicação (aparece no resultado, opcional)" className="mt-5">
              <Texto multilinha valor={r.explicacao} onChange={(v) => set('explicacao', v)} placeholder="Ex.: Ela gravou o primeiro disco em 1965." />
            </Campo>
          </Secao>

          <Secao numero={4} titulo="Pontos e tempo">
            <div className="grid gap-4 sm:grid-cols-3">
              <Campo rotulo="Nível">
                <select value={r.nivel} onChange={(e) => set('nivel', e.target.value)} className={inputCls}>
                  {NIVEIS.map((n) => (
                    <option key={n}>{n}</option>
                  ))}
                </select>
              </Campo>
              <Campo rotulo="Tempo para responder (segundos)">
                <Numero valor={r.tempo_resposta} onChange={(v) => set('tempo_resposta', v)} min="5" max="120" />
              </Campo>
              <div>
                <span className="mb-2 block text-sm font-semibold text-slate-700">Pontos para quem acertar</span>
                <div className="flex gap-2">
                  <Numero valor={r.pontos} onChange={(v) => set('pontos', v)} step="0.01" min="0" />
                  <Botao type="button" variante="secundario" title="Sortear um valor quebrado conforme o nível" onClick={() => set('pontos', sortearPontos(r.nivel))}>
                    <Dices size={18} />
                  </Botao>
                </div>
                <span className="mt-1 block text-xs text-slate-500">Use valores quebrados (ex.: 53,75) para evitar empates.</span>
              </div>
            </div>
          </Secao>
        </>
      )}
    />
  )
}

function Premios() {
  const { itens, recarregar } = useTabela(() => supabase.from('premios').select('*').order('colocacao'))
  const { patrocinadores } = useDados()
  return (
    <Editor
      tabela="premios"
      itens={itens}
      recarregar={recarregar}
      novo={() => ({ id: crypto.randomUUID(), colocacao: (itens?.length ?? 0) + 1, titulo: '', oferecido_por: '', data_final: null })}
      validar={(p) => p.titulo.trim() && p.colocacao > 0}
      renderItem={(p) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-ouro-50 font-display text-sm text-ouro-600">{p.colocacao}º</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{p.titulo || 'Sem título'}</p>
            <p className="truncate text-xs text-slate-500">
              {p.oferecido_por}
              {p.data_final ? ` · final em ${diaMes(p.data_final)}/${p.data_final.slice(0, 4)}` : ''}
            </p>
          </div>
        </div>
      )}
      textoNovo="Novo prêmio"
      nomeItem="este prêmio"
      renderForm={(p, set) => (
        <Secao titulo="Prêmio">
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo rotulo="Colocação">
            <Numero valor={p.colocacao} onChange={(v) => set('colocacao', v)} min="1" />
          </Campo>
          <Campo rotulo="Prêmio" className="sm:col-span-3">
            <Texto valor={p.titulo} onChange={(v) => set('titulo', v)} />
          </Campo>
          <Campo rotulo="Data da pergunta final" className="sm:col-span-2">
            <input type="date" value={p.data_final ?? ''} onChange={(e) => set('data_final', e.target.value || null)} className={inputCls} />
            <span className="mt-1 block text-[11px] text-slate-500">O ouvinte vê: "A pergunta final será dia 15/12/2026".</span>
          </Campo>
          <Campo rotulo="Oferecido por" className="sm:col-span-2">
            <select value={p.oferecido_por} onChange={(e) => set('oferecido_por', e.target.value)} className={inputCls}>
              <option value="">— Selecione um patrocinador —</option>
              {patrocinadores.map((pt) => (
                <option key={pt.id}>{pt.nome}</option>
              ))}
            </select>
          </Campo>
        </div>
        </Secao>
      )}
    />
  )
}

function RankingAdmin() {
  const { ranking } = useRanking(100)
  if (!ranking) return <Carregando />
  return (
    <Card>
      <div className="border-b border-slate-100 p-4">
        <p className="font-semibold">Ranking</p>
      </div>
      {ranking.length === 0 && <Vazio icone={Trophy} titulo="Ninguém pontuou ainda" texto="O ranking aparece aqui assim que alguém acertar uma pergunta." className="m-4 shadow-none ring-0" />}
      <div className="divide-y divide-slate-100">
        {ranking.map((o) => (
          <div key={o.posicao} className="flex items-center gap-3 px-4 py-2.5">
            <span className="w-8 text-center font-display text-sm text-slate-500">{o.posicao}º</span>
            <Avatar nome={o.nome} tamanho="w-8 h-8" />
            <span className="flex-1 truncate text-sm font-medium">{o.nome}</span>
            <span className="text-sm font-bold">{fmt(o.pontos)} pts</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

function FeedbackAdmin() {
  const { itens, erro } = useTabela(() => supabase.from('feedback').select('*, perfis(nome)').order('criado_em', { ascending: false }).limit(200))
  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!itens) return <Carregando />
  return (
    <Card className="divide-y divide-slate-100">
      {itens.length === 0 && <Vazio icone={MessageSquare} titulo="Nenhum relato recebido" texto='Quando um ouvinte tocar em "Ajuda" e mandar uma mensagem, ela aparece aqui.' className="m-4 shadow-none ring-0" />}
      {itens.map((f) => (
        <div key={f.id} className="p-4">
          <div className="flex flex-wrap items-center gap-2 text-xs text-slate-500">
            <b className="text-slate-800">{f.perfis?.nome || 'Ouvinte'}</b>
            <span>{new Date(f.criado_em).toLocaleString('pt-BR')}</span>
          </div>
          <p className="mt-1 whitespace-pre-wrap text-sm">{f.mensagem}</p>
          {f.navegador && <p className="mt-1 truncate text-[11px] text-slate-400">{f.navegador}</p>}
        </div>
      ))}
    </Card>
  )
}

/* ---------- aba Exibições (relatório dos patrocinadores) ---------- */

function ExibicoesAdmin() {
  const hoje = hojeBR()
  const [de, setDe] = useState(`${hoje.slice(0, 8)}01`)
  const [ate, setAte] = useState(hoje)
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    const { data, error } = await supabase.rpc('relatorio_exibicoes', { p_de: de, p_ate: ate })
    setCarregando(false)
    if (error) return setErro(mensagemDeErro(error))
    setItens(data)
  }, [de, ate])

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // uma linha por patrocinador, uma coluna por espaço
  const linhas = Object.values(
    (itens ?? []).reduce((acc, i) => {
      const l = (acc[i.patrocinador_id] ??= { nome: i.nome, total: 0, rodadas: 0 })
      l[i.espaco] = Number(i.exibicoes)
      l[`${i.espaco}_rodadas`] = Number(i.rodadas)
      l.total += Number(i.exibicoes)
      l.rodadas += Number(i.rodadas)
      return acc
    }, {}),
  ).sort((a, b) => b.total - a.total)
  const n = (v) => (v ?? 0).toLocaleString('pt-BR')

  const exportar = () => {
    const cab = ['Patrocinador', ...ESPACOS.map((e) => e.nome), 'Total de exibições', 'Rodadas (antes da pergunta)', 'Rodadas (antes do resultado)']
    const corpo = linhas.map((l) => [l.nome, ...ESPACOS.map((e) => l[e.id] ?? 0), l.total, l.anuncio_pergunta_rodadas ?? 0, l.anuncio_resultado_rodadas ?? 0])
    const csv = [cab, ...corpo].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `exibicoes-patrocinadores-${de}-a-${ate}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Campo rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
        </Campo>
        <Botao onClick={buscar} disabled={carregando || !de || !ate}>
          {carregando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Ver período
        </Botao>
        <Botao variante="secundario" disabled={!linhas.length} onClick={exportar}>
          <Download size={15} /> Exportar planilha
        </Botao>
      </div>
      <p className="border-b border-slate-100 px-4 py-2 text-xs leading-relaxed text-slate-500">
        <b>Exibições</b>: quantas vezes o anúncio ou banner apareceu na tela de um ouvinte. <b>Rodadas</b>: em quantas rodadas o
        patrocinador foi o escolhido do anúncio (igual para todos os ouvintes da rodada).
      </p>
      {erro && <p className="p-4 text-sm text-red-600">{erro}</p>}
      {!itens && !erro && <Carregando />}
      {itens && linhas.length === 0 && <Vazio icone={BarChart3} titulo="Nenhuma exibição no período" texto="As exibições aparecem aqui conforme os ouvintes usam o app." className="m-4 shadow-none ring-0" />}
      {linhas.length > 0 && (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs text-slate-500">
                <th className="px-4 py-2 font-semibold">Patrocinador</th>
                {ESPACOS.map((e) => (
                  <th key={e.id} className="px-3 py-2 text-right font-semibold">
                    {e.nome}
                  </th>
                ))}
                <th className="px-4 py-2 text-right font-semibold">Total</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {linhas.map((l) => (
                <tr key={l.nome}>
                  <td className="px-4 py-2.5 font-semibold">{l.nome}</td>
                  {ESPACOS.map((e) => (
                    <td key={e.id} className="px-3 py-2.5 text-right tabular-nums">
                      {n(l[e.id])}
                      {e.id.startsWith('anuncio') && <span className="block text-[11px] text-slate-400">{n(l[`${e.id}_rodadas`])} rodada(s)</span>}
                    </td>
                  ))}
                  <td className="px-4 py-2.5 text-right font-bold tabular-nums">{n(l.total)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </Card>
  )
}

/* ---------- aba Cadastros ---------- */

const fmtCpf = (c) => (c ? `${c.slice(0, 3)}.${c.slice(3, 6)}.${c.slice(6, 9)}-${c.slice(9)}` : '')
const cpfEscondido = (c) => (c ? `***.${c.slice(3, 6)}.${c.slice(6, 9)}-**` : '')
const fmtZap = (z) => (z ? (z.length === 11 ? `(${z.slice(0, 2)}) ${z.slice(2, 7)}-${z.slice(7)}` : `(${z.slice(0, 2)}) ${z.slice(2, 6)}-${z.slice(6)}`) : '')

/** Lista dos ouvintes cadastrados. O CPF aparece escondido; o olho mostra o número inteiro (ex.: entrega de prêmio). */
function CadastrosAdmin() {
  const { itens, erro } = useTabela(() =>
    supabase.from('perfis').select('id, nome, email, cpf, whatsapp, cadastro_em, criado_em').eq('admin', false).not('cadastro_em', 'is', null).order('cadastro_em', { ascending: false }),
  )
  const [busca, setBusca] = useState('')
  const [visivel, setVisivel] = useState(null)
  if (erro) return <p className="text-sm text-red-600">{erro}</p>
  if (!itens) return <Carregando />

  const termo = busca.trim().toLowerCase()
  const numeros = termo.replace(/\D/g, '')
  const lista = termo
    ? itens.filter((p) => p.nome.toLowerCase().includes(termo) || (p.email ?? '').toLowerCase().includes(termo) || (numeros.length >= 3 && ((p.cpf ?? '').includes(numeros) || (p.whatsapp ?? '').includes(numeros))))
    : itens

  const exportar = () => {
    const linhas = [['Nome', 'E-mail', 'CPF', 'WhatsApp', 'Cadastrado em'], ...itens.map((p) => [p.nome, p.email ?? '', fmtCpf(p.cpf), fmtZap(p.whatsapp), fmtDataHora(p.cadastro_em)])]
    const csv = linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `cadastros-quiz-${hojeBR()}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card>
      <div className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Campo rotulo="Buscar (nome, e-mail, CPF ou WhatsApp)" className="min-w-56 flex-1">
          <Texto valor={busca} onChange={setBusca} placeholder="Ex.: Maria ou 19999" />
        </Campo>
        <Botao type="button" variante="secundario" disabled={!itens.length} onClick={exportar}>
          <Download size={15} /> Exportar planilha
        </Botao>
      </div>
      <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
        {itens.length} ouvinte(s) cadastrado(s). Dados pessoais (LGPD): use só para o quiz e a entrega de prêmios. Contas de teste não aparecem aqui.
      </p>
      {lista.length === 0 && <Vazio icone={Users} titulo="Nenhum cadastro encontrado" texto="Os ouvintes aparecem aqui depois de completar o cadastro no app." className="m-4 shadow-none ring-0" />}
      <div className="divide-y divide-slate-100">
        {lista.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-x-6 gap-y-1 px-4 py-3 text-sm">
            <div className="min-w-48 flex-1">
              <p className="font-semibold">{p.nome}</p>
              <p className="text-xs text-slate-500">{p.email}</p>
            </div>
            <span className="flex items-center gap-1.5 font-mono text-xs text-slate-700">
              {visivel === p.id ? fmtCpf(p.cpf) : cpfEscondido(p.cpf)}
              <button type="button" title={visivel === p.id ? 'Esconder CPF' : 'Mostrar CPF'} onClick={() => setVisivel(visivel === p.id ? null : p.id)} className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700">
                {visivel === p.id ? <EyeOff size={14} /> : <Eye size={14} />}
              </button>
            </span>
            <a href={`https://wa.me/55${p.whatsapp}`} target="_blank" rel="noreferrer" className="flex items-center gap-1.5 text-xs font-semibold text-emerald-700 hover:underline">
              <MessageCircle size={14} /> {fmtZap(p.whatsapp)}
            </a>
            <span className="text-xs text-slate-400">desde {fmtDataHora(p.cadastro_em)}</span>
          </div>
        ))}
      </div>
    </Card>
  )
}

/* ---------- aba Histórico (auditoria) ---------- */

const hojeBR = () => new Date().toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })

function HistoricoAdmin() {
  const [busca, setBusca] = useState('')
  const [de, setDe] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 7)
    return d.toLocaleDateString('en-CA', { timeZone: 'America/Sao_Paulo' })
  })
  const [ate, setAte] = useState(hojeBR)
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)
  const [aberto, setAberto] = useState(null)

  const buscar = async (e) => {
    e?.preventDefault()
    setCarregando(true)
    setErro('')
    const { data, error } = await supabase.rpc('historico_admin', {
      p_busca: busca.trim() || null,
      p_de: de || null,
      p_ate: ate || null,
      p_limite: 2000,
    })
    setCarregando(false)
    if (error) return setErro(mensagemDeErro(error))
    setItens(data)
  }

  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const exportar = () => {
    const num = (v) => (v == null ? '' : String(v).replace('.', ','))
    const linhas = [
      ['Protocolo', 'Abriu em', 'Respondeu em', 'Nome', 'E-mail', 'Conta de teste', 'Rodada', 'Título', 'Pergunta', 'Resposta dada',
        'Resposta correta', 'Situação', 'Pontos', 'Valor da rodada', 'Tempo gasto (s)', 'Tempo limite (s)', 'Navegador'],
      ...itens.map((h) => [
        h.protocolo, fmtDataHora(h.aberta_em), fmtDataHora(h.respondida_em), h.nome, h.email ?? '', h.anonimo ? 'sim' : 'não',
        h.rodada_horario, h.rodada_titulo, h.pergunta, h.alternativa != null ? h.alternativas[h.alternativa] : '',
        h.alternativas[h.correta], situacao(h).texto, num(h.pontos), num(h.valor_pontos), num(h.tempo_gasto), h.tempo_limite, h.navegador ?? '',
      ]),
    ]
    const csv = linhas.map((l) => l.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    // BOM para o Excel abrir os acentos corretamente
    const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `historico-quiz-${de || 'inicio'}-a-${ate || 'hoje'}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <Card>
      <form onSubmit={buscar} className="flex flex-wrap items-end gap-3 border-b border-slate-100 p-4">
        <Campo rotulo="Buscar (nome, e-mail, protocolo ou rodada)" className="min-w-56 flex-1">
          <Texto valor={busca} onChange={setBusca} placeholder="Ex.: Juliana ou 7F3A-91C2" />
        </Campo>
        <Campo rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
        </Campo>
        <Botao type="submit" disabled={carregando}>
          {carregando ? <Loader2 size={15} className="animate-spin" /> : <Search size={15} />} Buscar
        </Botao>
        <Botao type="button" variante="secundario" disabled={!itens?.length} onClick={exportar}>
          <Download size={15} /> Exportar planilha
        </Botao>
      </form>

      {erro && <p className="p-4 text-sm text-red-600">{erro}</p>}
      {!itens && !erro && <Carregando />}
      {itens && (
        <>
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            {itens.length} participação(ões) encontrada(s). O registro guarda a pergunta como estava no momento e não é apagado ao zerar o ranking.
          </p>
          {itens.length === 0 && <Vazio icone={History} titulo="Nenhuma participação no período" texto="Mude as datas ou a busca para ver outras participações." className="m-4 shadow-none ring-0" />}
          <div className="divide-y divide-slate-100">
            {itens.map((h) => (
              <div key={h.protocolo}>
                <button
                  onClick={() => setAberto(aberto === h.protocolo ? null : h.protocolo)}
                  className={`grid w-full grid-cols-[110px_1fr_auto] items-center gap-3 px-4 py-2.5 text-left text-sm hover:bg-slate-50 sm:grid-cols-[160px_180px_1fr_auto_80px] ${aberto === h.protocolo ? 'bg-slate-50' : ''}`}
                >
                  <span className="text-xs tabular-nums text-slate-500">{fmtDataHora(h.aberta_em)}</span>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold">{h.nome || 'Ouvinte'}</span>
                    <span className="block truncate text-[11px] text-slate-400">{h.email ?? (h.anonimo ? 'conta de teste (sem e-mail)' : '')}</span>
                  </span>
                  <span className="hidden min-w-0 truncate text-slate-600 sm:block">
                    {fmtHorario(h.rodada_horario)} • {h.rodada_titulo}
                  </span>
                  <SeloSituacao h={h} />
                  <span className="hidden text-right font-bold tabular-nums sm:block">{fmt(h.pontos)}</span>
                </button>
                {aberto === h.protocolo && (
                  <div className="grid gap-4 bg-slate-50 px-4 pb-4 pt-1 sm:grid-cols-[1fr_260px]">
                    <DetalheParticipacao h={h} />
                    <div className="space-y-1 text-[11px] text-slate-500">
                      <p>
                        Protocolo: <b className="font-mono text-slate-700">{h.protocolo}</b>
                      </p>
                      <p className="break-all">ID do ouvinte: {h.usuario_id}</p>
                      {h.navegador && <p className="break-words">Aparelho/navegador: {h.navegador}</p>}
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        </>
      )}
    </Card>
  )
}

/* ---------- aba Avisos (notificações no celular) ---------- */

const MOTIVOS = { rodada: 'No ar', lembrete: 'Lembrete', manual: 'Manual', avulsa: 'Avulsa', agendada: 'Agendada' }
const ERRO_FUNCAO = 'A função enviar-push não respondeu. Confira se ela foi publicada (LEIA-ME-SUPABASE.md → Notificações).'

/** Disparo manual do aviso de uma rodada ("está no ar" se estiver no ar; senão, "daqui a X minutos"). */
async function avisarRodada(r) {
  const { data, error } = await supabase.functions.invoke('enviar-push', { body: { tipo: 'manual', rodada_id: r.id } })
  if (error || data?.erro) return { erro: data?.erro ?? ERRO_FUNCAO }
  return data
}

const textoResultado = (r) =>
  r.erro
    ? r.erro
    : `Enviado para ${r.enviados} celular(es)${r.falhas ? ` · ${r.falhas} falha(s)` : ''}${r.removidas ? ` · ${r.removidas} desinstalado(s) removido(s)` : ''}`

// Exemplo para a prévia dos textos
const RODADA_EXEMPLO = { horario: '10:30', titulo: 'Clássicos da Música', pontos: 53.75 }
const preencherModelo = (modelo, r, minutos) =>
  (modelo ?? '')
    .replaceAll('{horario}', r.horario)
    .replaceAll('{titulo}', r.titulo)
    .replaceAll('{pontos}', fmt(r.pontos))
    .replaceAll('{minutos}', String(minutos))

function PreviaNotificacao({ titulo, corpo }) {
  return (
    <div className="flex gap-3 rounded-xl bg-slate-100 p-3">
      <img src="/icone-192.png" alt="" className="h-10 w-10 shrink-0 rounded-lg" />
      <div className="min-w-0">
        <p className="truncate text-sm font-semibold">{titulo || 'Título'}</p>
        <p className="text-sm text-slate-600">{corpo || 'Mensagem'}</p>
      </div>
    </div>
  )
}

function AvisosAdmin() {
  const { configuracoes, rodadas } = useDados()
  const { perfil } = useAuth()
  const [resumo, setResumo] = useState(null)
  const [erroResumo, setErroResumo] = useState('')
  const envios = useTabela(() => supabase.from('push_envios').select('*').order('criado_em', { ascending: false }).limit(50))
  const agendados = useTabela(() => supabase.from('push_agendados').select('*').eq('status', 'pendente').order('enviar_em'))

  const carregarResumo = useCallback(async () => {
    const { data, error } = await supabase.rpc('push_resumo')
    if (error) return setErroResumo(mensagemDeErro(error))
    setResumo(data)
  }, [])

  useEffect(() => {
    carregarResumo()
  }, [carregarResumo])

  const atualizarTudo = () => {
    envios.recarregar()
    agendados.recarregar()
    carregarResumo()
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-3">
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Celulares inscritos</p>
            <p className="mt-1 font-display text-3xl tabular-nums">{resumo?.inscritos ?? '—'}</p>
            <p className="text-xs text-slate-500">{resumo ? `${resumo.ouvintes} ouvinte(s)` : erroResumo || 'carregando…'}</p>
          </Card>
          <Card className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">Função de envio</p>
            <p className={`mt-1 font-display text-xl ${resumo?.funcao_pronta ? 'text-emerald-700' : 'text-ouro-700'}`}>{resumo?.funcao_pronta ? 'Pronta' : 'Ainda não usada'}</p>
            <p className="text-xs text-slate-500">{resumo?.funcao_pronta ? 'Chaves geradas e guardadas' : 'Fica pronta no primeiro "Quero ser avisado"'}</p>
          </Card>
        </div>

        {configuracoes && <AvisosAutomaticos configuracoes={configuracoes} />}
        <MensagemAvulsa perfil={perfil} inscritos={resumo?.inscritos ?? 0} aoEnviar={atualizarTudo} />
        <DisparoManual rodadas={rodadas} aoEnviar={atualizarTudo} />
      </div>

      <div className="space-y-4">
        <Card className="flex flex-col">
          <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-600">Mensagens agendadas</div>
          {agendados.itens?.length === 0 && <p className="p-4 text-center text-sm text-slate-500">Nenhuma mensagem agendada.</p>}
          <div className="divide-y divide-slate-100">
            {agendados.itens?.map((a) => (
              <div key={a.id} className="flex items-start gap-2 px-3 py-2.5">
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{a.titulo}</p>
                  <p className="truncate text-xs text-slate-500">{a.corpo}</p>
                  <p className="text-[11px] text-slate-400">Sai em {fmtDataHora(a.enviar_em)}</p>
                </div>
                <button
                  className="text-xs font-semibold text-marca-600 underline"
                  onClick={async () => {
                    if (!confirm('Cancelar esta mensagem agendada?')) return
                    await supabase.from('push_agendados').update({ status: 'cancelado' }).eq('id', a.id).eq('status', 'pendente')
                    agendados.recarregar()
                  }}
                >
                  Cancelar
                </button>
              </div>
            ))}
          </div>
        </Card>

        <Card className="flex flex-col">
          <div className="flex items-center justify-between border-b border-slate-100 p-3">
            <span className="text-sm font-semibold text-slate-600">Últimos envios</span>
            <button onClick={atualizarTudo} className="text-xs font-semibold text-slate-500 underline">
              Atualizar
            </button>
          </div>
          {!envios.itens && <Carregando />}
          {envios.itens?.length === 0 && <Vazio icone={Bell} titulo="Nenhum aviso enviado" texto="Os envios automáticos e avulsos aparecem aqui." className="m-3 py-8 shadow-none ring-0" />}
          <div className="divide-y divide-slate-100">
            {envios.itens?.map((e) => (
              <div key={e.id} className="px-3 py-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="truncate text-sm font-semibold">{e.titulo}</p>
                  <Selo cor={e.motivo === 'rodada' || e.motivo === 'lembrete' ? 'rose' : 'slate'} className="normal-case">
                    {MOTIVOS[e.motivo] ?? e.motivo}
                  </Selo>
                </div>
                <p className="truncate text-xs text-slate-500">{e.corpo}</p>
                <p className="text-[11px] text-slate-400">
                  {fmtDataHora(e.criado_em)} · {e.concluido_em ? `${e.enviados} enviados${e.falhas ? `, ${e.falhas} falhas` : ''}` : 'enviando…'}
                </p>
              </div>
            ))}
          </div>
        </Card>
      </div>
    </div>
  )
}

const CAMPOS_AVISO = ['aviso_automatico', 'lembrete_ativo', 'lembrete_minutos', 'modelo_no_ar_titulo', 'modelo_no_ar_corpo', 'modelo_lembrete_titulo', 'modelo_lembrete_corpo']

function AvisosAutomaticos({ configuracoes }) {
  const [form, setForm] = useState(() => Object.fromEntries(CAMPOS_AVISO.map((k) => [k, configuracoes[k]])))
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }))
  const alterado = CAMPOS_AVISO.some((k) => form[k] !== configuracoes[k])

  const salvar = async () => {
    setEstado('salvando')
    setErro('')
    const { error } = await supabase.from('configuracoes').update(form).eq('id', 1)
    setEstado(error ? '' : 'salvo')
    if (error) setErro(mensagemDeErro(error))
    else setTimeout(() => setEstado(''), 2000)
  }

  return (
    <Card className="space-y-5 p-5">
      <div>
        <p className="font-semibold">Avisos automáticos</p>
        <p className="text-xs text-slate-500">
          Nos textos, use <b>{'{horario}'}</b>, <b>{'{titulo}'}</b>, <b>{'{pontos}'}</b> e, no lembrete, <b>{'{minutos}'}</b>: são trocados pelos dados da rodada.
        </p>
      </div>

      <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={form.aviso_automatico} onChange={(e) => set('aviso_automatico', e.target.checked)} className="mt-1 h-4 w-4 accent-marca-600" />
          <span>
            <span className="block text-sm font-semibold">Avisar quando a rodada entrar no ar</span>
            <span className="block text-xs text-slate-500">Vale para o botão "No ar" e para o agendamento automático.</span>
          </span>
        </label>
        <div className={`grid gap-3 ${form.aviso_automatico ? '' : 'opacity-50'}`}>
          <Campo rotulo="Título">
            <Texto valor={form.modelo_no_ar_titulo} onChange={(v) => set('modelo_no_ar_titulo', v.slice(0, 80))} />
          </Campo>
          <Campo rotulo="Mensagem">
            <Texto valor={form.modelo_no_ar_corpo} onChange={(v) => set('modelo_no_ar_corpo', v.slice(0, 240))} />
          </Campo>
          <PreviaNotificacao titulo={preencherModelo(form.modelo_no_ar_titulo, RODADA_EXEMPLO)} corpo={preencherModelo(form.modelo_no_ar_corpo, RODADA_EXEMPLO)} />
        </div>
      </div>

      <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
        <label className="flex cursor-pointer items-start gap-3">
          <input type="checkbox" checked={form.lembrete_ativo} onChange={(e) => set('lembrete_ativo', e.target.checked)} className="mt-1 h-4 w-4 accent-marca-600" />
          <span>
            <span className="block text-sm font-semibold">Lembrete antes da pergunta</span>
            <span className="block text-xs text-slate-500">Para rodadas com data e horário cadastrados (manuais ou automáticas).</span>
          </span>
        </label>
        <div className={`grid gap-3 ${form.lembrete_ativo ? '' : 'opacity-50'}`}>
          <Campo rotulo="Quantos minutos antes">
            <Numero valor={form.lembrete_minutos} onChange={(v) => set('lembrete_minutos', Math.min(240, Math.max(1, v || 1)))} min="1" max="240" />
          </Campo>
          <Campo rotulo="Título">
            <Texto valor={form.modelo_lembrete_titulo} onChange={(v) => set('modelo_lembrete_titulo', v.slice(0, 80))} />
          </Campo>
          <Campo rotulo="Mensagem">
            <Texto valor={form.modelo_lembrete_corpo} onChange={(v) => set('modelo_lembrete_corpo', v.slice(0, 240))} />
          </Campo>
          <PreviaNotificacao
            titulo={preencherModelo(form.modelo_lembrete_titulo, RODADA_EXEMPLO, form.lembrete_minutos)}
            corpo={preencherModelo(form.modelo_lembrete_corpo, RODADA_EXEMPLO, form.lembrete_minutos)}
          />
        </div>
      </div>

      <div className="flex items-center gap-3">
        <Botao onClick={salvar} disabled={!alterado || estado === 'salvando'}>
          {estado === 'salvando' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar avisos automáticos
        </Botao>
        {estado === 'salvo' && <span className="text-sm font-semibold text-emerald-600">Salvo!</span>}
        {erro && <span className="text-sm font-semibold text-red-600">{erro}</span>}
      </div>
    </Card>
  )
}

function MensagemAvulsa({ perfil, inscritos, aoEnviar }) {
  const [titulo, setTitulo] = useState('')
  const [corpo, setCorpo] = useState('')
  const [quando, setQuando] = useState('agora')
  const [data, setData] = useState(hojeSP)
  const [hora, setHora] = useState('')
  const [estado, setEstado] = useState('')
  const [retorno, setRetorno] = useState(null)
  const instante = quando === 'agendar' && data && hora ? instanteRodada(data, hora) : null
  const valido = titulo.trim() && corpo.trim() && (quando === 'agora' || (instante && instante > new Date()))

  const enviar = async (e) => {
    e.preventDefault()
    setRetorno(null)
    if (quando === 'agora') {
      if (!confirm(`Enviar agora para ${inscritos} celular(es)?\n\n${titulo}\n${corpo}`)) return
      setEstado('enviando')
      const { data: r, error } = await supabase.functions.invoke('enviar-push', { body: { tipo: 'avulsa', titulo: titulo.trim(), corpo: corpo.trim() } })
      setEstado('')
      setRetorno(error || r?.erro ? { erro: r?.erro ?? ERRO_FUNCAO } : r)
      if (!error && !r?.erro) {
        setTitulo('')
        setCorpo('')
      }
    } else {
      setEstado('enviando')
      const { error } = await supabase.from('push_agendados').insert({ titulo: titulo.trim(), corpo: corpo.trim(), enviar_em: instante.toISOString(), criado_por: perfil.id })
      setEstado('')
      if (error) setRetorno({ erro: mensagemDeErro(error) })
      else {
        setRetorno({ texto: `Agendada para ${diaMes(data)} às ${hora}.` })
        setTitulo('')
        setCorpo('')
      }
    }
    aoEnviar()
  }

  return (
    <Card className="p-5">
      <p className="font-semibold">Mensagem avulsa</p>
      <p className="text-xs text-slate-500">Texto livre, enviado na hora ou agendado. Ex.: "Saiu o ranking!", "Hoje tem pergunta especial às 11h".</p>
      <form onSubmit={enviar} className="mt-4 space-y-3">
        <Campo rotulo={`Título (${titulo.length}/80)`}>
          <Texto valor={titulo} onChange={(v) => setTitulo(v.slice(0, 80))} placeholder="Saiu o ranking!" />
        </Campo>
        <Campo rotulo={`Mensagem (${corpo.length}/240)`}>
          <Texto multilinha valor={corpo} onChange={(v) => setCorpo(v.slice(0, 240))} placeholder="Abra o quiz e veja quem está concorrendo à Smart TV." />
        </Campo>
        {(titulo || corpo) && <PreviaNotificacao titulo={titulo} corpo={corpo} />}
        <div className="flex flex-wrap items-end gap-4">
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="radio" name="quando" checked={quando === 'agora'} onChange={() => setQuando('agora')} className="h-4 w-4 accent-marca-600" /> Enviar agora
          </label>
          <label className="flex items-center gap-2 text-sm font-semibold">
            <input type="radio" name="quando" checked={quando === 'agendar'} onChange={() => setQuando('agendar')} className="h-4 w-4 accent-marca-600" /> Agendar
          </label>
          {quando === 'agendar' && (
            <>
              <Campo rotulo="Data">
                <input type="date" value={data} onChange={(e) => setData(e.target.value)} className={inputCls} />
              </Campo>
              <Campo rotulo="Hora (Brasília)">
                <input type="time" value={hora} onChange={(e) => setHora(e.target.value)} className={inputCls} />
              </Campo>
            </>
          )}
        </div>
        {quando === 'agendar' && instante && instante <= new Date() && <p className="text-xs font-semibold text-marca-600">Escolha um horário no futuro.</p>}
        <div className="flex flex-wrap items-center gap-3">
          <Botao type="submit" disabled={!valido || estado === 'enviando'}>
            {estado === 'enviando' ? <Loader2 size={15} className="animate-spin" /> : <Send size={15} />} {quando === 'agora' ? 'Enviar para todos' : 'Agendar mensagem'}
          </Botao>
          {retorno && <span className={`text-sm font-semibold ${retorno.erro ? 'text-red-600' : 'text-emerald-700'}`}>{retorno.texto ?? textoResultado(retorno)}</span>}
        </div>
      </form>
    </Card>
  )
}

function DisparoManual({ rodadas, aoEnviar }) {
  const candidatas = rodadas.filter((r) => r.status !== 'encerrada')
  const [rodadaId, setRodadaId] = useState('')
  const [estado, setEstado] = useState('')
  const [retorno, setRetorno] = useState(null)
  const escolhida = candidatas.find((r) => r.id === rodadaId) ?? candidatas.find((r) => r.status === 'no_ar') ?? candidatas[0]

  const disparar = async () => {
    if (!escolhida || !confirm(`Avisar agora sobre "${escolhida.titulo}"?`)) return
    setEstado('enviando')
    setRetorno(await avisarRodada(escolhida))
    setEstado('')
    aoEnviar()
  }

  return (
    <Card className="p-5">
      <p className="font-semibold">Disparo manual de uma rodada</p>
      <p className="text-xs text-slate-500">
        Manda agora o aviso da rodada escolhida: o texto "no ar" se ela estiver no ar, ou o do lembrete se ainda vai começar. Também há o botão "Avisar" em cada
        rodada da aba Ao vivo.
      </p>
      <div className="mt-4 flex flex-wrap items-end gap-3">
        <Campo rotulo="Rodada" className="min-w-64 flex-1">
          <select value={escolhida?.id ?? ''} onChange={(e) => setRodadaId(e.target.value)} className={inputCls}>
            {candidatas.map((r) => (
              <option key={r.id} value={r.id}>
                {r.data ? `${diaMes(r.data)} ` : ''}
                {fmtHorario(r.horario)} · {r.titulo} {r.status === 'no_ar' ? '(no ar)' : ''}
              </option>
            ))}
          </select>
        </Campo>
        <Botao variante="escuro" onClick={disparar} disabled={!escolhida || estado === 'enviando'}>
          {estado === 'enviando' ? <Loader2 size={15} className="animate-spin" /> : <Bell size={15} />} Avisar agora
        </Botao>
      </div>
      {retorno && <p className={`mt-2 text-sm font-semibold ${retorno.erro ? 'text-red-600' : 'text-emerald-700'}`}>{textoResultado(retorno)}</p>}
    </Card>
  )
}
