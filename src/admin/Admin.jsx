import { useCallback, useEffect, useState } from 'react'
import {
  BarChart3, Dices, Download, Gift, History, Search, ImagePlus, ListChecks, Loader2, LogOut, Megaphone, MessageSquare, Plus, Radio, RadioTower, RotateCcw, Save,
  ShieldAlert, Square, Trash2, Trophy, Zap,
} from 'lucide-react'
import { NIVEIS } from '../config.js'
import { Carregando, TelaLogin, useAuth } from '../auth.jsx'
import { diaMes, fmt, hojeSP, useDados, useRanking } from '../store.jsx'
import { mensagemDeErro, supabase } from '../supabase.js'
import { DetalheParticipacao, SeloSituacao, fmtDataHora, situacao } from '../historico.jsx'
import { Avatar, CORES, Card, ICONES_PATROCINADOR, Icone, Selo } from '../ui.jsx'

const ABAS = [
  { id: 'aovivo', nome: 'Ao vivo', icone: RadioTower },
  { id: 'rodadas', nome: 'Rodadas', icone: ListChecks },
  { id: 'patrocinadores', nome: 'Patrocinadores', icone: Megaphone },
  { id: 'premios', nome: 'Prêmios', icone: Gift },
  { id: 'ranking', nome: 'Ranking', icone: Trophy },
  { id: 'historico', nome: 'Histórico', icone: History },
  { id: 'feedback', nome: 'Feedback', icone: MessageSquare },
]

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
        <ShieldAlert className="mx-auto text-rose-600" size={36} />
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

  const alternarApresentacao = async () => {
    const { error } = await supabase.from('configuracoes').update({ modo_apresentacao: !modoApresentacao }).eq('id', 1)
    setErroConfig(error ? mensagemDeErro(error) : '')
  }

  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl">
            <BarChart3 className="text-rose-600" /> Painel do Quiz
          </h1>
          <p className="text-sm text-slate-500">
            Olá, {perfil.nome || 'admin'}. Solte as perguntas, acompanhe as respostas e gerencie o conteúdo.
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200">
            <Zap size={16} className="text-amber-500" />
            <span className="text-sm font-semibold">Modo apresentação</span>
            <span className="text-xs text-slate-500">(anúncios de 5s para todos)</span>
            <input type="checkbox" checked={modoApresentacao} onChange={alternarApresentacao} className="h-4 w-4 accent-rose-600" />
          </label>
          <Botao variante="secundario" onClick={sair}>
            <LogOut size={15} /> Sair
          </Botao>
        </div>
      </div>
      {erroConfig && <p className="mt-2 text-sm text-rose-600">{erroConfig}</p>}

      <div className="mt-6 flex gap-1 overflow-x-auto rounded-xl bg-white p-1 shadow-sm ring-1 ring-slate-200 no-scrollbar">
        {ABAS.map(({ id, nome, icone: I }) => (
          <button
            key={id}
            onClick={() => setAba(id)}
            className={`flex shrink-0 items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition ${
              aba === id ? 'bg-rose-50 text-rose-700' : 'text-slate-500 hover:bg-slate-50'
            }`}
          >
            <I size={16} /> {nome}
          </button>
        ))}
      </div>
      <div className="mt-4 animate-fade-up" key={aba}>
        {aba === 'aovivo' && <AoVivo />}
        {aba === 'rodadas' && <Rodadas />}
        {aba === 'patrocinadores' && <Patrocinadores />}
        {aba === 'premios' && <Premios />}
        {aba === 'ranking' && <RankingAdmin />}
        {aba === 'historico' && <HistoricoAdmin />}
        {aba === 'feedback' && <FeedbackAdmin />}
      </div>
    </div>
  )
}

/* ---------- dados do admin ---------- */

function useTabela(consulta, { tempoReal } = {}) {
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState('')
  const recarregar = useCallback(async () => {
    const { data, error } = await consulta()
    if (error) return setErro(mensagemDeErro(error))
    setItens(data)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    recarregar()
    if (!tempoReal) return
    const canal = supabase
      .channel(`admin-${tempoReal}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: tempoReal }, recarregar)
      .subscribe()
    return () => supabase.removeChannel(canal)
  }, [recarregar, tempoReal])

  return { itens, erro, recarregar }
}

/* ---------- aba Ao vivo ---------- */

function AoVivo() {
  const { rodadas, rodadaNoAr } = useDados()
  const respostas = useTabela(() => supabase.from('respostas').select('rodada_id, alternativa, acertou, respondida_em, pontos'), { tempoReal: 'respostas' })
  const conteudos = useTabela(() => supabase.from('rodadas_conteudo').select('rodada_id, alternativas, correta'))
  const [ocupado, setOcupado] = useState(null)
  const [erro, setErro] = useState('')

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

  const zerarTudo = () => {
    if (!confirm('Apagar TODAS as respostas e zerar o ranking? Use só na fase de testes.')) return
    executar('zerar', () => supabase.rpc('apagar_todas_respostas'))
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[1fr_380px]">
      <div className="space-y-4">
        {rodadaNoAr ? (
          <PlacarAoVivo
            rodada={rodadaNoAr}
            respostas={daRodada(rodadaNoAr.id)}
            conteudo={conteudos.itens?.find((c) => c.rodada_id === rodadaNoAr.id)}
            encerrar={() => executar('encerrar', () => supabase.rpc('encerrar_rodada', { p_rodada: rodadaNoAr.id }))}
            ocupado={ocupado === 'encerrar'}
          />
        ) : (
          <Card className="p-8 text-center">
            <RadioTower className="mx-auto text-slate-300" size={40} />
            <p className="mt-3 font-display text-lg">Nenhuma rodada no ar</p>
            <p className="mt-1 text-sm text-slate-500">Escolha uma rodada ao lado e clique em "Colocar no ar" quando o locutor anunciar.</p>
          </Card>
        )}
        {erro && <p className="text-sm font-semibold text-rose-600">{erro}</p>}
        {respostas.erro && <p className="text-sm text-rose-600">{respostas.erro}</p>}
      </div>

      <Card className="flex flex-col">
        <div className="border-b border-slate-100 p-3 text-sm font-semibold text-slate-600">Rodadas (as automáticas abrem e fecham sozinhas)</div>
        <div className="flex-1 divide-y divide-slate-100">
          {rodadas.map((r) => {
            const n = daRodada(r.id).filter((x) => x.respondida_em).length
            return (
              <div key={r.id} className={`flex items-center gap-3 px-3 py-2.5 ${r.status === 'no_ar' ? 'bg-rose-50/70' : ''}`}>
                <span className="w-11 shrink-0 text-center">
                  <span className="block font-display text-sm">{r.horario}</span>
                  {r.data && <span className="block text-[10px] text-slate-500">{diaMes(r.data)}</span>}
                </span>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-semibold">{r.titulo}</p>
                  <p className="truncate text-xs text-slate-500">
                    {r.status === 'no_ar' ? 'No ar' : r.status === 'encerrada' ? 'Encerrada' : 'Agendada'} • {agendaTexto(r)} • {n} resposta(s)
                  </p>
                </div>
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

function PlacarAoVivo({ rodada, respostas, conteudo, encerrar, ocupado }) {
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
            <span className="h-2 w-2 animate-pulse rounded-full bg-rose-500" /> No ar desde{' '}
            {new Date(rodada.no_ar_em).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
          </Selo>
          <h2 className="mt-2 font-display text-xl">
            {rodada.horario} • {rodada.titulo}
          </h2>
          <p className="text-sm text-slate-500">
            {rodada.nivel} • vale {fmt(rodada.pontos)} pts • {rodada.tempo_resposta}s para responder
          </p>
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

function Campo({ rotulo, className = '', children }) {
  return (
    <label className={`block ${className}`}>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{rotulo}</span>
      {children}
    </label>
  )
}

const inputCls = 'w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-rose-400 focus:ring-2 focus:ring-rose-100'

function Texto({ valor, onChange, multilinha, ...props }) {
  return multilinha ? (
    <textarea rows={3} value={valor ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} {...props} />
  ) : (
    <input value={valor ?? ''} onChange={(e) => onChange(e.target.value)} className={inputCls} {...props} />
  )
}

function Numero({ valor, onChange, ...props }) {
  return <input type="number" value={valor} onChange={(e) => onChange(Number(e.target.value))} className={inputCls} {...props} />
}

function Botao({ variante = 'primario', className = '', children, ...props }) {
  const v = {
    primario: 'bg-rose-600 text-white hover:bg-rose-700',
    secundario: 'bg-slate-100 text-slate-700 hover:bg-slate-200',
    perigo: 'bg-white text-rose-600 ring-1 ring-rose-200 hover:bg-rose-50',
    escuro: 'bg-slate-900 text-white hover:bg-slate-800',
  }
  return (
    <button className={`inline-flex items-center justify-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition disabled:opacity-40 ${v[variante]} ${className}`} {...props}>
      {children}
    </button>
  )
}

/** Lista à esquerda + formulário de edição à direita. */
function Editor({ tabela, itens, novo, renderItem, renderForm, validar = () => true, salvar, recarregar }) {
  const [rascunho, setRascunho] = useState(null)
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')
  const set = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }))

  useEffect(() => {
    if (!rascunho && itens?.length) setRascunho(itens[0])
  }, [itens, rascunho])

  if (!itens) return <Carregando />
  const existe = rascunho && itens.some((i) => i.id === rascunho.id)

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
      setTimeout(() => setEstado(''), 2000)
    } catch (err) {
      setErro(mensagemDeErro(err))
      setEstado('')
    }
  }

  const excluir = async () => {
    if (!confirm('Excluir este item?')) return
    const { error } = await supabase.from(tabela).delete().eq('id', rascunho.id)
    if (error) return setErro(mensagemDeErro(error))
    await recarregar()
    setRascunho(null)
  }

  return (
    <div className="grid gap-4 lg:grid-cols-[minmax(0,340px)_1fr]">
      <Card className="flex max-h-[640px] flex-col">
        <div className="flex items-center justify-between border-b border-slate-100 p-3">
          <span className="text-sm font-semibold text-slate-600">{itens.length} cadastrados</span>
          <Botao onClick={() => setRascunho(novo())} className="px-3 py-1.5">
            <Plus size={15} /> Novo
          </Botao>
        </div>
        <div className="flex-1 divide-y divide-slate-100 overflow-y-auto">
          {itens.map((item) => (
            <button
              key={item.id}
              onClick={() => setRascunho(item)}
              className={`block w-full px-3 py-2.5 text-left transition hover:bg-slate-50 ${rascunho?.id === item.id ? 'bg-rose-50/70' : ''}`}
            >
              {renderItem(item)}
            </button>
          ))}
        </div>
      </Card>

      <Card className="p-5">
        {rascunho ? (
          <form onSubmit={enviar}>
            {renderForm(rascunho, set)}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Botao type="submit" disabled={!validar(rascunho) || estado === 'salvando'}>
                {estado === 'salvando' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar
              </Botao>
              {existe && (
                <Botao type="button" variante="perigo" className="ml-auto" onClick={excluir}>
                  <Trash2 size={15} /> Excluir
                </Botao>
              )}
              {estado === 'salvo' && <span className="text-sm font-semibold text-emerald-600">Salvo! Os celulares já foram atualizados.</span>}
              {erro && <span className="text-sm font-semibold text-rose-600">{erro}</span>}
            </div>
          </form>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Selecione um item ou clique em "Novo".</p>
        )}
      </Card>
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

const CAMPOS_RODADA = ['id', 'data', 'horario', 'horario_fim', 'modo', 'categoria', 'titulo', 'descricao', 'nivel', 'pontos', 'tempo_resposta']
const HORA = /^\d{2}:\d{2}$/

/** Texto curto do agendamento: "Automático · 21/10 · 10:30 às 10:40" ou "Manual · 10:30". */
function agendaTexto(r) {
  const dia = r.data ? `${diaMes(r.data)} · ` : ''
  const fim = r.horario_fim ? ` às ${r.horario_fim}` : ''
  return `${r.modo === 'automatico' ? 'Automático' : 'Manual'} · ${dia}${r.horario}${fim}`
}

function validarRodada(r) {
  if (!r.titulo.trim()) return 'Preencha o título do card.'
  if (!r.pergunta.trim()) return 'Preencha a pergunta.'
  if (!r.alternativas.every((a) => a.trim())) return 'Preencha as quatro alternativas.'
  return validarAgenda(r)
}

function validarAgenda(r) {
  if (!HORA.test(r.horario ?? '')) return 'Informe o horário.'
  if (r.horario_fim && !HORA.test(r.horario_fim)) return 'Horário de encerramento inválido.'
  if (r.horario_fim && r.horario_fim <= r.horario) return 'O encerramento precisa ser depois do início (no mesmo dia).'
  if (r.modo === 'automatico' && !r.data) return 'Rodada automática precisa de data.'
  if (r.modo === 'automatico' && !r.horario_fim) return 'Rodada automática precisa do horário de encerramento.'
  return ''
}

function Rodadas() {
  const { itens, recarregar } = useTabela(() => supabase.from('rodadas').select('*, rodadas_conteudo(*)').order('data', { ascending: true, nullsFirst: true }).order('horario'))
  // Junta a parte pública e a secreta da rodada num único formulário.
  const lista = itens?.map(({ rodadas_conteudo: emb, ...r }) => {
    const c = Array.isArray(emb) ? emb[0] : emb
    return {
    ...r,
    pergunta: c?.pergunta ?? '',
    alternativas: c?.alternativas ?? ['', '', '', ''],
    correta: c?.correta ?? 0,
    explicacao: c?.explicacao ?? '',
    }
  })

  const salvar = async (r) => {
    const rodada = Object.fromEntries(CAMPOS_RODADA.map((k) => [k, r[k]]))
    // Campos vazios vão como "sem valor" (o banco recusa texto vazio em data e horário)
    rodada.data = rodada.data || null
    rodada.horario_fim = rodada.horario_fim || null
    const { error } = await supabase.from('rodadas').upsert(rodada)
    if (error) throw error
    const { error: e2 } = await supabase
      .from('rodadas_conteudo')
      .upsert({ rodada_id: r.id, pergunta: r.pergunta, alternativas: r.alternativas, correta: r.correta, explicacao: r.explicacao })
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
        modo: 'manual',
        data: hojeSP(),
        horario: '14:00',
        horario_fim: '14:10',
        categoria: '',
        titulo: '',
        descricao: '',
        nivel: 'Médio',
        pontos: 50,
        tempo_resposta: 15,
        pergunta: '',
        alternativas: ['', '', '', ''],
        correta: 0,
        explicacao: '',
      })}
      validar={(r) => validarRodada(r) === ''}
      renderItem={(r) => (
        <div className="flex items-center gap-3">
          <span className="w-11 shrink-0 text-center">
            <span className="block font-display text-sm">{r.horario}</span>
            {r.data && <span className="block text-[10px] text-slate-500">{diaMes(r.data)}</span>}
          </span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.titulo || 'Sem título'}</p>
            <p className="truncate text-xs text-slate-500">{agendaTexto(r)} • +{fmt(r.pontos)} pts</p>
          </div>
          {r.status === 'no_ar' ? <Selo>No ar</Selo> : r.modo === 'automatico' && <Selo cor="slate" className="normal-case">Auto</Selo>}
        </div>
      )}
      renderForm={(r, set) => (
        <div className="grid gap-4 sm:grid-cols-6">
          <div className="space-y-3 rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200 sm:col-span-6">
            <span className="block text-xs font-semibold text-slate-600">Como a rodada entra no ar</span>
            <div className="grid gap-2 sm:grid-cols-2">
              {[
                { id: 'manual', titulo: 'Manual', texto: 'A produção clica em "No ar" e em "Encerrar" no Ao vivo.' },
                { id: 'automatico', titulo: 'Automático (agendado)', texto: 'Abre e fecha sozinha na data e nos horários abaixo.' },
              ].map((m) => (
                <label key={m.id} className={`flex cursor-pointer gap-3 rounded-lg bg-white p-3 ring-2 ${r.modo === m.id ? 'ring-rose-500' : 'ring-slate-200'}`}>
                  <input type="radio" name="modo" checked={r.modo === m.id} onChange={() => set('modo', m.id)} className="mt-1 h-4 w-4 accent-rose-600" />
                  <span>
                    <span className="block text-sm font-semibold">{m.titulo}</span>
                    <span className="block text-xs text-slate-500">{m.texto}</span>
                  </span>
                </label>
              ))}
            </div>
            <div className="grid gap-3 sm:grid-cols-3">
              <Campo rotulo={r.modo === 'automatico' ? 'Data' : 'Data (opcional)'}>
                <input type="date" value={r.data ?? ''} onChange={(e) => set('data', e.target.value)} className={inputCls} />
              </Campo>
              <Campo rotulo={r.modo === 'automatico' ? 'Abre às' : 'Horário previsto'}>
                <input type="time" value={r.horario ?? ''} onChange={(e) => set('horario', e.target.value)} className={inputCls} />
              </Campo>
              <Campo rotulo={r.modo === 'automatico' ? 'Encerra às' : 'Encerramento previsto (opcional)'}>
                <input type="time" value={r.horario_fim ?? ''} onChange={(e) => set('horario_fim', e.target.value)} className={inputCls} />
              </Campo>
            </div>
            <p className="text-xs text-slate-500">
              {r.modo === 'automatico'
                ? 'Horário de Brasília. O agendador confere a cada 15 segundos. O botão "No ar" continua valendo para adiantar ou reabrir, e "Encerrar" para fechar antes.'
                : 'Nas rodadas manuais, a data e os horários só aparecem para o ouvinte como informação.'}
            </p>
            {validarAgenda(r) && <p className="text-xs font-semibold text-rose-600">{validarAgenda(r)}</p>}
          </div>
          <Campo rotulo="Nível" className="sm:col-span-2">
            <select value={r.nivel} onChange={(e) => set('nivel', e.target.value)} className={inputCls}>
              {NIVEIS.map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Tempo para responder (segundos)" className="sm:col-span-2">
            <Numero valor={r.tempo_resposta} onChange={(v) => set('tempo_resposta', v)} min="5" max="120" />
          </Campo>
          <div className="sm:col-span-3">
            <span className="mb-1 block text-xs font-semibold text-slate-600">Pontos para quem acertar</span>
            <div className="flex gap-2">
              <Numero valor={r.pontos} onChange={(v) => set('pontos', v)} step="0.01" min="0" />
              <Botao type="button" variante="secundario" title="Sortear um valor quebrado conforme o nível" onClick={() => set('pontos', sortearPontos(r.nivel))}>
                <Dices size={15} /> Sortear
              </Botao>
            </div>
            <span className="mt-1 block text-[11px] text-slate-400">Use valores quebrados (ex.: 53,75) para evitar empates no ranking.</span>
          </div>
          <Campo rotulo="Categoria" className="sm:col-span-3">
            <Texto valor={r.categoria} onChange={(v) => set('categoria', v)} />
          </Campo>
          <Campo rotulo="Título do card" className="sm:col-span-6">
            <Texto valor={r.titulo} onChange={(v) => set('titulo', v)} />
          </Campo>
          <Campo rotulo="Descrição (aparece na tela inicial)" className="sm:col-span-6">
            <Texto valor={r.descricao} onChange={(v) => set('descricao', v)} />
          </Campo>
          <Campo rotulo="Pergunta (só aparece depois do anúncio)" className="sm:col-span-6">
            <Texto multilinha valor={r.pergunta} onChange={(v) => set('pergunta', v)} />
          </Campo>
          <div className="space-y-2 sm:col-span-6">
            <span className="block text-xs font-semibold text-slate-600">Alternativas (marque a correta)</span>
            {r.alternativas.map((alt, i) => (
              <div key={i} className="flex items-center gap-2">
                <input type="radio" name="correta" checked={r.correta === i} onChange={() => set('correta', i)} className="h-4 w-4 accent-emerald-600" />
                <span className="w-5 text-sm font-bold text-slate-500">{String.fromCharCode(65 + i)})</span>
                <Texto valor={alt} onChange={(v) => set('alternativas', r.alternativas.map((a, j) => (j === i ? v : a)))} />
              </div>
            ))}
          </div>
          <Campo rotulo="Explicação (mostrada no resultado)" className="sm:col-span-6">
            <Texto multilinha valor={r.explicacao} onChange={(v) => set('explicacao', v)} />
          </Campo>
        </div>
      )}
    />
  )
}

function Patrocinadores() {
  const { itens, recarregar } = useTabela(() => supabase.from('patrocinadores').select('*').order('criado_em'))
  const [enviandoLogo, setEnviandoLogo] = useState(false)
  const [erroLogo, setErroLogo] = useState('')

  const enviarLogo = async (arquivo, id, set) => {
    if (!arquivo) return
    if (arquivo.size > 2 * 1024 * 1024) return setErroLogo('A imagem deve ter no máximo 2 MB.')
    setEnviandoLogo(true)
    setErroLogo('')
    const caminho = `${id}/${Date.now()}-${arquivo.name.replace(/[^\w.-]/g, '_')}`
    const { error } = await supabase.storage.from('patrocinadores').upload(caminho, arquivo, { upsert: true })
    setEnviandoLogo(false)
    if (error) return setErroLogo(mensagemDeErro(error))
    set('logo_url', supabase.storage.from('patrocinadores').getPublicUrl(caminho).data.publicUrl)
  }

  return (
    <Editor
      tabela="patrocinadores"
      itens={itens}
      recarregar={recarregar}
      novo={() => ({ id: crypto.randomUUID(), nome: '', slogan: '', descricao: '', icone: 'Store', cor: 'amber', logo_url: null, ativo: true })}
      validar={(p) => p.nome.trim() && p.slogan.trim()}
      renderItem={(p) => {
        const c = CORES[p.cor] ?? CORES.amber
        return (
          <div className={`flex items-center gap-3 ${p.ativo ? '' : 'opacity-50'}`}>
            <div className={`grid h-9 w-9 place-items-center overflow-hidden rounded-lg ${c.fundo} ${c.texto}`}>
              {p.logo_url ? <img src={p.logo_url} alt="" className="h-full w-full object-contain" /> : <Icone nome={p.icone} size={18} />}
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{p.nome || 'Sem nome'}</p>
              <p className="truncate text-xs text-slate-500">{p.ativo ? p.slogan : 'Inativo'}</p>
            </div>
          </div>
        )
      }}
      renderForm={(p, set) => {
        const c = CORES[p.cor] ?? CORES.amber
        return (
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Nome do anunciante">
              <Texto valor={p.nome} onChange={(v) => set('nome', v)} />
            </Campo>
            <Campo rotulo="Slogan / oferta">
              <Texto valor={p.slogan} onChange={(v) => set('slogan', v)} />
            </Campo>
            <Campo rotulo="Descrição" className="sm:col-span-2">
              <Texto multilinha valor={p.descricao} onChange={(v) => set('descricao', v)} />
            </Campo>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Logo (opcional — substitui o ícone)</span>
              <div className="flex items-center gap-3">
                {p.logo_url && <img src={p.logo_url} alt="" className="h-14 w-24 rounded-lg bg-slate-50 object-contain ring-1 ring-slate-200" />}
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold hover:bg-slate-200">
                  {enviandoLogo ? <Loader2 size={15} className="animate-spin" /> : <ImagePlus size={15} />}
                  {p.logo_url ? 'Trocar imagem' : 'Enviar imagem'}
                  <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => enviarLogo(e.target.files[0], p.id, set)} />
                </label>
                {p.logo_url && (
                  <button type="button" className="text-xs text-rose-600 underline" onClick={() => set('logo_url', null)}>
                    Remover
                  </button>
                )}
              </div>
              {erroLogo && <p className="mt-1 text-xs text-rose-600">{erroLogo}</p>}
            </div>
            <div className="sm:col-span-2">
              <span className="mb-1 block text-xs font-semibold text-slate-600">Ícone</span>
              <div className="flex flex-wrap gap-2">
                {ICONES_PATROCINADOR.map((nome) => (
                  <button
                    type="button"
                    key={nome}
                    onClick={() => set('icone', nome)}
                    className={`grid h-10 w-10 place-items-center rounded-lg ring-1 ${p.icone === nome ? `${c.fundo} ${c.texto} ring-current` : 'text-slate-500 ring-slate-200'}`}
                  >
                    <Icone nome={nome} size={18} />
                  </button>
                ))}
              </div>
            </div>
            <div>
              <span className="mb-1 block text-xs font-semibold text-slate-600">Cor</span>
              <div className="flex gap-2">
                {Object.keys(CORES).map((cor) => (
                  <button
                    type="button"
                    key={cor}
                    onClick={() => set('cor', cor)}
                    className={`h-8 w-8 rounded-full ${CORES[cor].fundo} ring-2 ${p.cor === cor ? 'ring-slate-900' : 'ring-slate-200'}`}
                    aria-label={cor}
                  >
                    <span className={`mx-auto block h-3 w-3 rounded-full bg-current ${CORES[cor].texto}`} />
                  </button>
                ))}
              </div>
            </div>
            <label className="flex items-center gap-2 self-end text-sm font-semibold">
              <input type="checkbox" checked={p.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-4 w-4 accent-rose-600" />
              Ativo (aparece nos anúncios)
            </label>
          </div>
        )
      }}
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
      novo={() => ({ id: crypto.randomUUID(), colocacao: (itens?.length ?? 0) + 1, titulo: '', oferecido_por: '' })}
      validar={(p) => p.titulo.trim() && p.colocacao > 0}
      renderItem={(p) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 font-display text-sm text-amber-600">{p.colocacao}º</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{p.titulo || 'Sem título'}</p>
            <p className="truncate text-xs text-slate-500">{p.oferecido_por}</p>
          </div>
        </div>
      )}
      renderForm={(p, set) => (
        <div className="grid gap-4 sm:grid-cols-4">
          <Campo rotulo="Colocação">
            <Numero valor={p.colocacao} onChange={(v) => set('colocacao', v)} min="1" />
          </Campo>
          <Campo rotulo="Prêmio" className="sm:col-span-3">
            <Texto valor={p.titulo} onChange={(v) => set('titulo', v)} />
          </Campo>
          <Campo rotulo="Oferecido por" className="sm:col-span-4">
            <select value={p.oferecido_por} onChange={(e) => set('oferecido_por', e.target.value)} className={inputCls}>
              <option value="">— Selecione um patrocinador —</option>
              {patrocinadores.map((pt) => (
                <option key={pt.id}>{pt.nome}</option>
              ))}
            </select>
          </Campo>
        </div>
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
        <p className="font-semibold">Ranking da semana</p>
        <p className="text-xs text-slate-500">Recomeça automaticamente toda segunda-feira à 0h (horário de Brasília).</p>
      </div>
      {ranking.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Ninguém pontuou nesta semana ainda.</p>}
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
  if (erro) return <p className="text-sm text-rose-600">{erro}</p>
  if (!itens) return <Carregando />
  return (
    <Card className="divide-y divide-slate-100">
      {itens.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhum relato recebido ainda.</p>}
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

      {erro && <p className="p-4 text-sm text-rose-600">{erro}</p>}
      {!itens && !erro && <Carregando />}
      {itens && (
        <>
          <p className="border-b border-slate-100 px-4 py-2 text-xs text-slate-500">
            {itens.length} participação(ões) encontrada(s). O registro guarda a pergunta como estava no momento e não é apagado ao zerar o ranking.
          </p>
          {itens.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhuma participação no período.</p>}
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
                    {h.rodada_horario} • {h.rodada_titulo}
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
