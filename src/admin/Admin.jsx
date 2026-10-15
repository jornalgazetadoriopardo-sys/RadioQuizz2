import { useState } from 'react'
import { BarChart3, Gift, ListChecks, Megaphone, Plus, Radio, RotateCcw, Save, Trash2, Users, Zap } from 'lucide-react'
import { NIVEIS } from '../config.js'
import { fmt, useStore } from '../store.jsx'
import { Avatar, CORES, Card, ICONES_PATROCINADOR, Icone, Selo } from '../ui.jsx'

const ABAS = [
  { id: 'rodadas', nome: 'Rodadas', icone: ListChecks },
  { id: 'patrocinadores', nome: 'Patrocinadores', icone: Megaphone },
  { id: 'premios', nome: 'Prêmios', icone: Gift },
  { id: 'ouvintes', nome: 'Ouvintes', icone: Users },
]

const novoId = (prefixo) => `${prefixo}${Date.now().toString(36)}`

export default function Admin() {
  const [aba, setAba] = useState('rodadas')
  return (
    <div className="mx-auto w-full max-w-6xl px-4 py-6 sm:px-6">
      <Resumo />
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
        {aba === 'rodadas' && <Rodadas />}
        {aba === 'patrocinadores' && <Patrocinadores />}
        {aba === 'premios' && <Premios />}
        {aba === 'ouvintes' && <Ouvintes />}
      </div>
    </div>
  )
}

function Resumo() {
  const { state, dispatch, rodadaAtual, ranking } = useStore()
  const respostas = Object.values(state.respostas)
  const acertos = respostas.filter((r) => r.acertou).length
  const stats = [
    { rotulo: 'No ar agora', valor: rodadaAtual ? rodadaAtual.horario : '—', detalhe: rodadaAtual?.titulo ?? 'Nenhuma rodada' },
    { rotulo: 'Rodadas cadastradas', valor: state.rodadas.length, detalhe: `${state.patrocinadores.length} patrocinadores` },
    { rotulo: 'Ouvintes no ranking', valor: ranking.length, detalhe: `Líder: ${ranking[0]?.nome ?? '—'}` },
    { rotulo: 'Taxa de acerto (demo)', valor: respostas.length ? `${Math.round((acertos / respostas.length) * 100)}%` : '—', detalhe: `${respostas.length} respostas registradas` },
  ]
  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 font-display text-2xl">
            <BarChart3 className="text-rose-600" /> Painel do Quiz
          </h1>
          <p className="text-sm text-slate-500">Cadastre as perguntas, coloque rodadas no ar e acompanhe o ranking.</p>
        </div>
        <label className="flex cursor-pointer items-center gap-3 rounded-xl bg-white px-4 py-2.5 shadow-sm ring-1 ring-slate-200">
          <Zap size={16} className="text-amber-500" />
          <span className="text-sm font-semibold">Modo apresentação</span>
          <span className="text-xs text-slate-500">(anúncios de 5s)</span>
          <input type="checkbox" checked={state.modoApresentacao} onChange={() => dispatch({ type: 'TOGGLE_APRESENTACAO' })} className="h-4 w-4 accent-rose-600" />
        </label>
      </div>
      <div className="mt-5 grid grid-cols-2 gap-3 lg:grid-cols-4">
        {stats.map((s) => (
          <Card key={s.rotulo} className="p-4">
            <p className="text-[11px] font-bold uppercase tracking-wider text-slate-400">{s.rotulo}</p>
            <p className="mt-1 font-display text-2xl">{s.valor}</p>
            <p className="truncate text-xs text-slate-500">{s.detalhe}</p>
          </Card>
        ))}
      </div>
    </>
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
    <textarea rows={3} value={valor} onChange={(e) => onChange(e.target.value)} className={inputCls} {...props} />
  ) : (
    <input value={valor} onChange={(e) => onChange(e.target.value)} className={inputCls} {...props} />
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
function Editor({ colecao, itens, novo, renderItem, renderForm, validar = () => true, acoesExtras, ordenar = (x) => x }) {
  const { dispatch } = useStore()
  const [rascunho, setRascunho] = useState(itens[0] ?? null)
  const [salvo, setSalvo] = useState(false)
  const set = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }))
  const existe = rascunho && itens.some((i) => i.id === rascunho.id)

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
          {ordenar(itens).map((item) => (
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
          <form
            onSubmit={(e) => {
              e.preventDefault()
              dispatch({ type: 'UPSERT', colecao, item: rascunho })
              setSalvo(true)
              setTimeout(() => setSalvo(false), 1800)
            }}
          >
            {renderForm(rascunho, set)}
            <div className="mt-5 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-4">
              <Botao type="submit" disabled={!validar(rascunho)}>
                <Save size={15} /> Salvar
              </Botao>
              {acoesExtras?.(rascunho, existe)}
              {existe && (
                <Botao
                  type="button"
                  variante="perigo"
                  className="ml-auto"
                  onClick={() => {
                    if (!confirm('Excluir este item?')) return
                    dispatch({ type: 'REMOVER', colecao, id: rascunho.id })
                    setRascunho(itens.find((i) => i.id !== rascunho.id) ?? null)
                  }}
                >
                  <Trash2 size={15} /> Excluir
                </Botao>
              )}
              {salvo && <span className="text-sm font-semibold text-emerald-600">Salvo! O app do ouvinte já foi atualizado.</span>}
            </div>
          </form>
        ) : (
          <p className="py-10 text-center text-sm text-slate-500">Selecione um item ou clique em "Novo".</p>
        )}
      </Card>
    </div>
  )
}

/* ---------- abas ---------- */

function Rodadas() {
  const { state, dispatch, rodadaAtual } = useStore()
  return (
    <Editor
      colecao="rodadas"
      itens={state.rodadas}
      ordenar={(l) => [...l].sort((a, b) => a.horario.localeCompare(b.horario))}
      novo={() => ({
        id: novoId('r'),
        horario: '14:00',
        categoria: '',
        titulo: '',
        descricao: '',
        nivel: 'Médio',
        pontos: 50,
        tempoResposta: 15,
        pergunta: '',
        alternativas: ['', '', '', ''],
        correta: 0,
        explicacao: '',
      })}
      validar={(r) => r.pergunta.trim() && r.titulo.trim() && r.alternativas.every((a) => a.trim()) && /^\d{2}:\d{2}$/.test(r.horario)}
      renderItem={(r) => (
        <div className="flex items-center gap-3">
          <span className="w-11 font-display text-sm">{r.horario}</span>
          <div className="min-w-0 flex-1">
            <p className="truncate text-sm font-semibold">{r.titulo || 'Sem título'}</p>
            <p className="text-xs text-slate-500">
              {r.nivel} • +{fmt(r.pontos)} pts {state.respostas[r.id] && '• respondida'}
            </p>
          </div>
          {r.id === rodadaAtual?.id && <Selo>No ar</Selo>}
        </div>
      )}
      acoesExtras={(r, existe) =>
        existe && (
          <Botao type="button" variante="escuro" onClick={() => dispatch({ type: 'SET_NO_AR', id: r.id })}>
            <Radio size={15} /> Colocar no ar agora
          </Botao>
        )
      }
      renderForm={(r, set) => (
        <div className="grid gap-4 sm:grid-cols-6">
          <Campo rotulo="Horário" className="sm:col-span-2">
            <Texto valor={r.horario} onChange={(v) => set('horario', v)} placeholder="10:30" />
          </Campo>
          <Campo rotulo="Nível" className="sm:col-span-2">
            <select value={r.nivel} onChange={(e) => set('nivel', e.target.value)} className={inputCls}>
              {Object.keys(NIVEIS).map((n) => (
                <option key={n}>{n}</option>
              ))}
            </select>
          </Campo>
          <Campo rotulo="Pontos (máximo)" className="sm:col-span-1">
            <Numero valor={r.pontos} onChange={(v) => set('pontos', v)} step="0.05" min="0" />
          </Campo>
          <Campo rotulo="Tempo (s)" className="sm:col-span-1">
            <Numero valor={r.tempoResposta} onChange={(v) => set('tempoResposta', Math.max(5, v))} min="5" max="60" />
          </Campo>
          <Campo rotulo="Título do card" className="sm:col-span-3">
            <Texto valor={r.titulo} onChange={(v) => set('titulo', v)} />
          </Campo>
          <Campo rotulo="Categoria" className="sm:col-span-3">
            <Texto valor={r.categoria} onChange={(v) => set('categoria', v)} />
          </Campo>
          <Campo rotulo="Descrição (aparece na tela inicial)" className="sm:col-span-6">
            <Texto valor={r.descricao} onChange={(v) => set('descricao', v)} />
          </Campo>
          <Campo rotulo="Pergunta" className="sm:col-span-6">
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
  const { state } = useStore()
  return (
    <Editor
      colecao="patrocinadores"
      itens={state.patrocinadores}
      novo={() => ({ id: novoId('p'), nome: '', slogan: '', descricao: '', icone: 'Store', cor: 'amber' })}
      validar={(p) => p.nome.trim() && p.slogan.trim()}
      renderItem={(p) => {
        const c = CORES[p.cor] ?? CORES.amber
        return (
          <div className="flex items-center gap-3">
            <div className={`grid h-9 w-9 place-items-center rounded-lg ${c.fundo} ${c.texto}`}>
              <Icone nome={p.icone} size={18} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">{p.nome || 'Sem nome'}</p>
              <p className="truncate text-xs text-slate-500">{p.slogan}</p>
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
              <span className="mb-1 block text-xs font-semibold text-slate-600">Ícone</span>
              <div className="flex flex-wrap gap-2">
                {ICONES_PATROCINADOR.map((nome) => (
                  <button
                    type="button"
                    key={nome}
                    onClick={() => set('icone', nome)}
                    className={`grid h-10 w-10 place-items-center rounded-lg ring-1 ${p.icone === nome ? `${c.fundo} ${c.texto} ring-current` : 'ring-slate-200 text-slate-500'}`}
                  >
                    <Icone nome={nome} size={18} />
                  </button>
                ))}
              </div>
            </div>
            <div className="sm:col-span-2">
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
          </div>
        )
      }}
    />
  )
}

function Premios() {
  const { state } = useStore()
  return (
    <Editor
      colecao="premios"
      itens={state.premios}
      ordenar={(l) => [...l].sort((a, b) => a.colocacao - b.colocacao)}
      novo={() => ({ id: novoId('pr'), colocacao: state.premios.length + 1, titulo: '', oferecidoPor: '' })}
      validar={(p) => p.titulo.trim() && p.colocacao > 0}
      renderItem={(p) => (
        <div className="flex items-center gap-3">
          <span className="grid h-9 w-9 place-items-center rounded-lg bg-amber-50 font-display text-sm text-amber-600">{p.colocacao}º</span>
          <div className="min-w-0">
            <p className="truncate text-sm font-semibold">{p.titulo || 'Sem título'}</p>
            <p className="truncate text-xs text-slate-500">{p.oferecidoPor}</p>
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
            <select value={p.oferecidoPor} onChange={(e) => set('oferecidoPor', e.target.value)} className={inputCls}>
              <option value="">— Selecione um patrocinador —</option>
              {state.patrocinadores.map((pt) => (
                <option key={pt.id}>{pt.nome}</option>
              ))}
            </select>
          </Campo>
        </div>
      )}
    />
  )
}

function Ouvintes() {
  const { ranking, dispatch } = useStore()
  return (
    <Card>
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 p-4">
        <div>
          <p className="font-semibold">Ranking da semana</p>
          <p className="text-xs text-slate-500">No demo, os outros ouvintes são fictícios. Na versão final virão do banco de dados.</p>
        </div>
        <Botao
          variante="perigo"
          onClick={() => confirm('Zerar a pontuação de todos e começar uma nova semana?') && dispatch({ type: 'ZERAR_SEMANA' })}
        >
          <RotateCcw size={15} /> Zerar semana
        </Botao>
      </div>
      <div className="divide-y divide-slate-100">
        {ranking.map((o) => (
          <div key={o.id} className={`flex items-center gap-3 px-4 py-2.5 ${o.eu ? 'bg-rose-50/70' : ''}`}>
            <span className="w-8 text-center font-display text-sm text-slate-500">{o.posicao}º</span>
            <Avatar nome={o.nome} tamanho="w-8 h-8" destaque={o.eu} />
            <span className="flex-1 truncate text-sm font-medium">
              {o.nome} {o.eu && <Selo className="ml-1 normal-case">você (demo)</Selo>}
            </span>
            <span className="text-sm font-bold">{fmt(o.pontos)} pts</span>
          </div>
        ))}
      </div>
    </Card>
  )
}
