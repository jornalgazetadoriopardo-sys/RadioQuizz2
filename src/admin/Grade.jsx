import { useCallback, useEffect, useMemo, useState } from 'react'
import { ArrowRightLeft, CalendarDays, ChevronLeft, ChevronRight, Download, FileText, Loader2, Lock, Printer, Search, Sparkles, X } from 'lucide-react'
import { mensagemDeErro, supabase } from '../supabase.js'
import { hojeSP } from '../store.jsx'
import { Card, Vazio } from '../ui.jsx'
import { Carregando } from '../auth.jsx'
import { Botao, Campo, inputCls } from './comum.jsx'

// Grade de inserções: todos os dias, das 9h às 18h, de meia em meia hora, com 2 posições por horário
export const HORARIOS_GRADE = Array.from({ length: 19 }, (_, i) => {
  const m = 9 * 60 + i * 30
  return `${String(Math.floor(m / 60)).padStart(2, '0')}:${String(m % 60).padStart(2, '0')}`
})
const POSICOES = [
  { id: 'antes', nome: 'Antes de responder', curto: 'antes' },
  { id: 'depois', nome: 'Depois de responder', curto: 'depois' },
]
const MESES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro']
const SEMANA = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb']
const SEMANA_LONGA = ['Domingo', 'Segunda', 'Terça', 'Quarta', 'Quinta', 'Sexta', 'Sábado']
// Uma cor para cada anunciante (sempre a mesma)
const CORES = ['bg-sky-500', 'bg-emerald-500', 'bg-violet-500', 'bg-orange-500', 'bg-pink-500', 'bg-teal-500', 'bg-indigo-500', 'bg-lime-600', 'bg-rose-500', 'bg-amber-500', 'bg-cyan-600', 'bg-fuchsia-500']
const corDe = (id) => CORES[[...String(id)].reduce((t, c) => (t * 31 + c.charCodeAt(0)) >>> 0, 7) % CORES.length]

const fmtData = (d) => `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}`
const diaDaSemana = (d) => new Date(`${d}T12:00:00Z`).getUTCDay()
const diasDoMes = (mes) => {
  const [a, m] = mes.split('-').map(Number)
  const total = new Date(Date.UTC(a, m, 0)).getUTCDate()
  return Array.from({ length: total }, (_, i) => `${mes}-${String(i + 1).padStart(2, '0')}`)
}
const ultimo = (lista) => lista[lista.length - 1]
const somarMes = (mes, n) => {
  const d = new Date(`${mes}-01T12:00:00Z`)
  d.setUTCMonth(d.getUTCMonth() + n)
  return d.toISOString().slice(0, 7)
}
// Horário da grade já passou? (horário de Brasília, UTC−3)
const passou = (data, horario) => new Date(`${data}T${horario}:00-03:00`) <= new Date()

const SITUACAO = {
  veiculada: { nome: 'Veiculada', cor: 'bg-emerald-100 text-emerald-800' },
  nao_veiculada: { nome: 'Não veiculada', cor: 'bg-red-100 text-red-700' },
  programada: { nome: 'Programada', cor: 'bg-sky-100 text-sky-800' },
}
const ORIGEM = { auto: 'Automática', manual: 'Manual', fixo: 'Fixa' }

export default function Grade() {
  const [aba, setAba] = useState('grade')
  const [patrocinadores, setPatrocinadores] = useState(null)
  useEffect(() => {
    supabase
      .from('patrocinadores')
      .select('id, nome, ativo, inicio, fim, modalidade, espacos, horarios_fixos')
      .order('nome')
      .then(({ data }) => setPatrocinadores(data ?? []))
  }, [])
  if (!patrocinadores) return <Carregando />
  return (
    <div className="space-y-5">
      <div className="flex gap-2">
        {[
          { id: 'grade', nome: 'Grade do mês', icone: CalendarDays },
          { id: 'relatorios', nome: 'Relatórios de inserções', icone: FileText },
        ].map((a) => (
          <button
            key={a.id}
            type="button"
            onClick={() => setAba(a.id)}
            className={`flex items-center gap-2 rounded-2xl px-5 py-3 text-base font-semibold transition ${aba === a.id ? 'bg-marca-700 text-white shadow-md' : 'bg-white text-slate-600 ring-1 ring-slate-200 hover:bg-slate-50'}`}
          >
            <a.icone size={18} /> {a.nome}
          </button>
        ))}
      </div>
      {aba === 'grade' ? <GradeMes patrocinadores={patrocinadores} /> : <Relatorios patrocinadores={patrocinadores} />}
    </div>
  )
}

/* ---------- grade do mês ---------- */

function GradeMes({ patrocinadores }) {
  const [mes, setMes] = useState(() => hojeSP().slice(0, 7))
  const [itens, setItens] = useState(null)
  const [erro, setErro] = useState('')
  const [editando, setEditando] = useState(null) // { data, horario, posicao, item }
  const [programando, setProgramando] = useState(false)
  const [resultado, setResultado] = useState(null)
  const dias = diasDoMes(mes)
  const porId = useMemo(() => Object.fromEntries(patrocinadores.map((p) => [p.id, p])), [patrocinadores])

  const carregar = useCallback(async () => {
    const { data, error } = await supabase
      .from('grade_insercoes')
      .select('id, data, horario, posicao, patrocinador_id, origem, veiculada_em')
      .gte('data', `${mes}-01`)
      .lte('data', ultimo(diasDoMes(mes)))
    if (error) return setErro(mensagemDeErro(error))
    setErro('')
    setItens(data)
  }, [mes])
  useEffect(() => {
    setItens(null)
    carregar()
  }, [carregar])

  const celula = useMemo(() => {
    const m = new Map()
    for (const i of itens ?? []) m.set(`${i.data} ${i.horario} ${i.posicao}`, i)
    return m
  }, [itens])

  const programar = async () => {
    setProgramando(true)
    setResultado(null)
    const { data, error } = await supabase.rpc('programar_grade', { p_de: `${mes}-01`, p_ate: ultimo(dias) })
    setProgramando(false)
    if (error) return setErro(mensagemDeErro(error))
    setResultado(data)
    carregar()
  }

  const usados = [...new Set((itens ?? []).map((i) => i.patrocinador_id))].map((id) => porId[id]).filter(Boolean)
  const [ano, m] = mes.split('-').map(Number)

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-center gap-3 p-4">
        <div className="flex items-center gap-2">
          <Botao variante="secundario" className="px-3 py-3" onClick={() => setMes(somarMes(mes, -1))} title="Mês anterior">
            <ChevronLeft size={20} />
          </Botao>
          <p className="min-w-48 text-center font-display text-2xl text-marca-800">
            {MESES[m - 1]} {ano}
          </p>
          <Botao variante="secundario" className="px-3 py-3" onClick={() => setMes(somarMes(mes, 1))} title="Próximo mês">
            <ChevronRight size={20} />
          </Botao>
        </div>
        <Botao className="ml-auto" onClick={programar} disabled={programando}>
          {programando ? <Loader2 size={18} className="animate-spin" /> : <Sparkles size={18} />} Programar vagas do mês
        </Botao>
      </Card>

      <p className="text-sm leading-relaxed text-slate-600">
        Cada horário tem duas inserções: <b>antes</b> e <b>depois</b> de responder. Clique numa inserção para trocar o anunciante, mover para outro dia
        ou horário, ou deixar vaga. As <Lock size={13} className="inline" /> fixas seguem o cadastro do anunciante e não mudam por aqui. "Programar vagas"
        só preenche posições vazias: nada do que já está na grade muda sozinho.
      </p>

      {resultado && (
        <Card className="p-4 text-sm">
          <p className="font-semibold text-emerald-700">{resultado.inseridas} inserção(ões) novas programadas.</p>
          {resultado.pendencias?.length > 0 && (
            <div className="mt-2 text-ouro-800">
              <p className="font-semibold">Pendências ({resultado.pendencias.length}):</p>
              <ul className="mt-1 max-h-40 list-disc space-y-0.5 overflow-y-auto pl-5">
                {resultado.pendencias.map((x, i) => (
                  <li key={i}>
                    {x.patrocinador} · {fmtData(x.data)}
                    {x.horario ? ` às ${x.horario}` : ''} · {x.motivo}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Card>
      )}
      {erro && <p className="text-sm font-semibold text-red-600">{erro}</p>}

      {!itens ? (
        <Carregando />
      ) : (
        <Card className="overflow-hidden">
          <div className="overflow-x-auto">
            <table className="border-separate border-spacing-0 text-xs">
              <thead>
                <tr>
                  <th className="sticky left-0 top-0 z-20 border-b border-r border-slate-200 bg-slate-50 px-3 py-2 text-left text-sm font-bold text-slate-600">Horário</th>
                  {dias.map((d) => {
                    const hoje = d === hojeSP()
                    const fds = [0, 6].includes(diaDaSemana(d))
                    return (
                      <th key={d} className={`border-b border-slate-200 px-1 py-2 text-center ${hoje ? 'bg-marca-700 text-white' : fds ? 'bg-slate-100 text-slate-600' : 'bg-slate-50 text-slate-600'}`}>
                        <span className="block text-base font-bold leading-none">{Number(d.slice(8))}</span>
                        <span className="block text-[10px] uppercase">{SEMANA[diaDaSemana(d)]}</span>
                      </th>
                    )
                  })}
                </tr>
              </thead>
              <tbody>
                {HORARIOS_GRADE.map((h) => (
                  <tr key={h}>
                    <td className="sticky left-0 z-10 border-b border-r border-slate-200 bg-white px-3 py-1 text-sm font-bold text-marca-800">{h.replace(':', 'h')}</td>
                    {dias.map((d) => (
                      <td key={d} className={`border-b border-r border-slate-100 p-0.5 align-top ${passou(d, h) ? 'bg-slate-50' : ''}`}>
                        {POSICOES.map((pos) => {
                          const item = celula.get(`${d} ${h} ${pos.id}`)
                          const p = item && porId[item.patrocinador_id]
                          const antigo = passou(d, h)
                          return (
                            <button
                              key={pos.id}
                              type="button"
                              title={`${fmtData(d)} ${h} · ${pos.nome}${p ? ` · ${p.nome}` : ' · vago'}${item?.origem === 'fixo' ? ' (fixo)' : ''}`}
                              onClick={() => setEditando({ data: d, horario: h, posicao: pos.id, item })}
                              className={`mb-0.5 flex h-6 w-[68px] items-center gap-0.5 truncate rounded px-1 text-left text-[11px] font-semibold transition ${
                                p ? `${corDe(p.id)} text-white hover:brightness-110` : 'border border-dashed border-slate-200 text-slate-300 hover:border-marca-300 hover:text-marca-400'
                              } ${antigo ? 'opacity-50' : ''} ${p && (!p.ativo || (p.fim && p.fim < d)) ? 'line-through' : ''}`}
                            >
                              {item?.origem === 'fixo' && <Lock size={10} className="shrink-0" />}
                              <span className="truncate">{p ? p.nome : pos.curto}</span>
                            </button>
                          )
                        })}
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {usados.length > 0 && (
        <div className="flex flex-wrap gap-2">
          {usados.map((p) => (
            <span key={p.id} className="flex items-center gap-2 rounded-full bg-white px-3 py-1.5 text-sm ring-1 ring-slate-200">
              <span className={`h-3 w-3 rounded-full ${corDe(p.id)}`} /> {p.nome}
              {!p.ativo && <span className="text-xs text-slate-400">(pausado — não vai ao ar)</span>}
            </span>
          ))}
        </div>
      )}

      {editando && <EditarInsercao alvo={editando} patrocinadores={patrocinadores} fechar={() => setEditando(null)} aoSalvar={carregar} />}
    </div>
  )
}

function EditarInsercao({ alvo, patrocinadores, fechar, aoSalvar }) {
  const { data, horario, posicao, item } = alvo
  const [escolhido, setEscolhido] = useState(item?.patrocinador_id ?? '')
  const [destino, setDestino] = useState({ data, horario, posicao })
  const [ocupado, setOcupado] = useState(false)
  const [erro, setErro] = useState('')
  const fixo = item?.origem === 'fixo'
  const antigo = passou(data, horario)
  const espaco = posicao === 'antes' ? 'anuncio_pergunta' : 'anuncio_resultado'
  const opcoes = patrocinadores.filter((p) => p.id === item?.patrocinador_id || (p.ativo && (!p.fim || p.fim >= data) && (!p.espacos || p.espacos.includes(espaco))))
  const nome = (id) => patrocinadores.find((p) => p.id === id)?.nome ?? '—'

  const executar = async (fn) => {
    setOcupado(true)
    setErro('')
    const { error } = await fn()
    setOcupado(false)
    if (error) return setErro(mensagemDeErro(error))
    aoSalvar()
    fechar()
  }
  const salvar = () => executar(() => supabase.rpc('grade_definir', { p_data: data, p_horario: horario, p_posicao: posicao, p_patrocinador: escolhido || null }))
  const mover = () => executar(() => supabase.rpc('grade_mover', { p_id: item.id, p_data: destino.data, p_horario: destino.horario, p_posicao: destino.posicao }))

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4" onClick={fechar}>
      <div className="w-full max-w-lg rounded-3xl bg-white p-6 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-semibold uppercase tracking-wider text-slate-500">{SEMANA_LONGA[diaDaSemana(data)]}</p>
            <h3 className="font-display text-2xl text-marca-800">
              {fmtData(data)} · {horario.replace(':', 'h')}
            </h3>
            <p className="text-base text-slate-600">{POSICOES.find((p) => p.id === posicao).nome}</p>
          </div>
          <button type="button" onClick={fechar} className="grid h-10 w-10 place-items-center rounded-full hover:bg-slate-100" title="Fechar">
            <X size={20} />
          </button>
        </div>

        {fixo ? (
          <p className="mt-5 flex gap-2 rounded-2xl bg-slate-50 p-4 text-base text-slate-700">
            <Lock size={20} className="mt-0.5 shrink-0" /> <span><b>{nome(item.patrocinador_id)}</b> é fixo neste horário, pelo cadastro do anunciante. Para mudar, altere os horários fixos no cadastro dele.</span>
          </p>
        ) : antigo ? (
          <p className="mt-5 rounded-2xl bg-slate-50 p-4 text-base text-slate-700">
            Este horário já passou. {item ? <>Inserção de <b>{nome(item.patrocinador_id)}</b> ({item.veiculada_em ? 'veiculada' : 'não veiculada'}).</> : 'Ficou vago.'}
          </p>
        ) : (
          <div className="mt-5 space-y-5">
            <Campo rotulo="Anunciante nesta posição">
              <select value={escolhido} onChange={(e) => setEscolhido(e.target.value)} className={inputCls}>
                <option value="">— Deixar vago (sem anúncio) —</option>
                {opcoes.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.nome}
                    {p.modalidade === 'fixo' ? ' (fixo em outros horários)' : ''}
                  </option>
                ))}
              </select>
            </Campo>
            <Botao className="w-full" onClick={salvar} disabled={ocupado || escolhido === (item?.patrocinador_id ?? '')}>
              {ocupado ? <Loader2 size={18} className="animate-spin" /> : null} Salvar nesta posição
            </Botao>

            {item && (
              <div className="rounded-2xl bg-slate-50 p-4">
                <p className="mb-3 flex items-center gap-2 text-base font-semibold text-slate-800">
                  <ArrowRightLeft size={18} /> Mover esta inserção para outro dia ou horário
                </p>
                <div className="grid gap-3 sm:grid-cols-3">
                  <Campo rotulo="Dia">
                    <input type="date" value={destino.data} onChange={(e) => setDestino({ ...destino, data: e.target.value })} className={inputCls} />
                  </Campo>
                  <Campo rotulo="Horário">
                    <select value={destino.horario} onChange={(e) => setDestino({ ...destino, horario: e.target.value })} className={inputCls}>
                      {HORARIOS_GRADE.map((h) => (
                        <option key={h}>{h}</option>
                      ))}
                    </select>
                  </Campo>
                  <Campo rotulo="Posição">
                    <select value={destino.posicao} onChange={(e) => setDestino({ ...destino, posicao: e.target.value })} className={inputCls}>
                      {POSICOES.map((p) => (
                        <option key={p.id} value={p.id}>
                          {p.curto}
                        </option>
                      ))}
                    </select>
                  </Campo>
                </div>
                <p className="mt-2 text-sm text-slate-500">Se o destino já tiver outra inserção (não fixa), as duas trocam de lugar.</p>
                <Botao variante="escuro" className="mt-3 w-full" onClick={mover} disabled={ocupado || (destino.data === data && destino.horario === horario && destino.posicao === posicao)}>
                  <ArrowRightLeft size={18} /> Mover
                </Botao>
              </div>
            )}
          </div>
        )}
        {erro && <p className="mt-4 text-sm font-semibold text-red-600">{erro}</p>}
      </div>
    </div>
  )
}

/* ---------- relatórios ---------- */

function Relatorios({ patrocinadores }) {
  const mes = hojeSP().slice(0, 7)
  const [de, setDe] = useState(`${mes}-01`)
  const [ate, setAte] = useState(ultimo(diasDoMes(mes)))
  const [quem, setQuem] = useState('')
  const [linhas, setLinhas] = useState(null)
  const [erro, setErro] = useState('')
  const [carregando, setCarregando] = useState(false)

  const buscar = useCallback(async () => {
    setCarregando(true)
    setErro('')
    const { data, error } = await supabase.rpc('relatorio_insercoes', { p_de: de, p_ate: ate, p_patrocinador: quem || null })
    setCarregando(false)
    if (error) return setErro(mensagemDeErro(error))
    setLinhas(data)
  }, [de, ate, quem])
  useEffect(() => {
    buscar()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  const resumo = useMemo(() => {
    const r = {}
    for (const l of linhas ?? []) {
      const x = (r[l.patrocinador_id] ??= { nome: l.nome, total: 0, antes: 0, depois: 0, veiculada: 0, nao_veiculada: 0, programada: 0 })
      x.total++
      x[l.posicao]++
      x[l.situacao]++
    }
    return Object.values(r).sort((a, b) => a.nome.localeCompare(b.nome))
  }, [linhas])
  const total = resumo.reduce((t, x) => ({ total: t.total + x.total, veiculada: t.veiculada + x.veiculada, nao_veiculada: t.nao_veiculada + x.nao_veiculada, programada: t.programada + x.programada }), {
    total: 0,
    veiculada: 0,
    nao_veiculada: 0,
    programada: 0,
  })
  const nomeQuem = quem ? patrocinadores.find((p) => p.id === quem)?.nome : 'Todos os anunciantes'
  const periodo = `${fmtData(de)} a ${fmtData(ate)}`

  const colunasLista = ['Data', 'Dia', 'Horário', 'Posição', 'Anunciante', 'Tipo', 'Situação']
  const valoresLista = (l) => [fmtData(l.data), SEMANA_LONGA[diaDaSemana(l.data)], l.horario, l.posicao === 'antes' ? 'Antes de responder' : 'Depois de responder', l.nome, ORIGEM[l.origem], SITUACAO[l.situacao].nome]

  const exportar = () => {
    const csv = [colunasLista, ...(linhas ?? []).map(valoresLista)].map((r) => r.map((c) => `"${String(c ?? '').replace(/"/g, '""')}"`).join(';')).join('\r\n')
    const blob = new Blob(['﻿' + csv], { type: 'text/csv;charset=utf-8' })
    const a = document.createElement('a')
    a.href = URL.createObjectURL(blob)
    a.download = `insercoes-${quem ? nomeQuem.replace(/\W+/g, '-').toLowerCase() : 'todos'}-${de}-a-${ate}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  // Abre uma página limpa com o relatório e chama a impressão (dá para salvar em PDF)
  const imprimir = () => {
    const esc = (t) => String(t ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c])
    const tabResumo = `<table><tr><th>Anunciante</th><th>Total</th><th>Antes</th><th>Depois</th><th>Veiculadas</th><th>Não veiculadas</th><th>Programadas</th></tr>${resumo
      .map((x) => `<tr><td>${esc(x.nome)}</td><td>${x.total}</td><td>${x.antes}</td><td>${x.depois}</td><td>${x.veiculada}</td><td>${x.nao_veiculada}</td><td>${x.programada}</td></tr>`)
      .join('')}</table>`
    const tabLista = `<table><tr>${colunasLista.map((c) => `<th>${c}</th>`).join('')}</tr>${(linhas ?? [])
      .map((l) => `<tr>${valoresLista(l).map((v) => `<td>${esc(v)}</td>`).join('')}</tr>`)
      .join('')}</table>`
    const w = window.open('', '_blank')
    if (!w) return setErro('O navegador bloqueou a janela de impressão. Libere pop-ups para este site.')
    w.document.write(`<!doctype html><html lang="pt-BR"><head><meta charset="utf-8"><title>Relatório de inserções</title>
      <style>body{font:13px system-ui,sans-serif;color:#0f172a;margin:24px}h1{font-size:20px;color:#2b306a;margin:0}h2{font-size:15px;margin:22px 0 8px}
      p{margin:4px 0;color:#475569}table{border-collapse:collapse;width:100%}th,td{border:1px solid #cbd5e1;padding:4px 6px;text-align:left}th{background:#eef0fa}</style></head>
      <body><img src="${location.origin}/logo-difusora.png" style="height:40px"><h1>Relatório de inserções — ${esc(nomeQuem)}</h1><p>Período: ${periodo}</p>
      <p>Total: ${total.total} · Veiculadas: ${total.veiculada} · Não veiculadas: ${total.nao_veiculada} · Programadas: ${total.programada}</p>
      <h2>Resumo por anunciante</h2>${tabResumo}<h2>Inserções</h2>${tabLista}</body></html>`)
    w.document.close()
    w.onload = () => w.print()
  }

  return (
    <div className="space-y-5">
      <Card className="flex flex-wrap items-end gap-3 p-5">
        <Campo rotulo="Anunciante" className="min-w-56 flex-1">
          <select value={quem} onChange={(e) => setQuem(e.target.value)} className={inputCls}>
            <option value="">Todos (programação total)</option>
            {patrocinadores.map((p) => (
              <option key={p.id} value={p.id}>
                {p.nome}
              </option>
            ))}
          </select>
        </Campo>
        <Campo rotulo="De">
          <input type="date" value={de} onChange={(e) => setDe(e.target.value)} className={inputCls} />
        </Campo>
        <Campo rotulo="Até">
          <input type="date" value={ate} onChange={(e) => setAte(e.target.value)} className={inputCls} />
        </Campo>
        <Botao onClick={buscar} disabled={carregando || !de || !ate}>
          {carregando ? <Loader2 size={18} className="animate-spin" /> : <Search size={18} />} Gerar relatório
        </Botao>
      </Card>
      <p className="text-sm text-slate-600">
        Vale para períodos passados (o que foi veiculado) e futuros (o que está programado). <b>Veiculada</b>: foi ao ar com a pergunta.{' '}
        <b>Não veiculada</b>: o horário passou sem ir ao ar (por exemplo, a pergunta não foi feita ou o anunciante estava pausado). <b>Programada</b>: ainda vai acontecer.
      </p>
      {erro && <p className="text-sm font-semibold text-red-600">{erro}</p>}
      {!linhas && !erro && <Carregando />}
      {linhas && (
        <>
          <div className="grid gap-3 sm:grid-cols-4">
            {[
              { nome: 'Inserções no período', valor: total.total, cor: 'text-marca-800' },
              { nome: 'Veiculadas', valor: total.veiculada, cor: 'text-emerald-700' },
              { nome: 'Não veiculadas', valor: total.nao_veiculada, cor: 'text-red-600' },
              { nome: 'Programadas', valor: total.programada, cor: 'text-sky-700' },
            ].map((c) => (
              <Card key={c.nome} className="p-5">
                <p className="text-sm font-semibold text-slate-500">{c.nome}</p>
                <p className={`mt-1 font-display text-3xl ${c.cor}`}>{c.valor}</p>
              </Card>
            ))}
          </div>
          <div className="flex flex-wrap gap-3">
            <Botao variante="secundario" onClick={exportar} disabled={!linhas.length}>
              <Download size={18} /> Exportar planilha
            </Botao>
            <Botao variante="secundario" onClick={imprimir} disabled={!linhas.length}>
              <Printer size={18} /> Imprimir / salvar PDF
            </Botao>
          </div>
          {linhas.length === 0 ? (
            <Vazio icone={FileText} titulo="Nenhuma inserção no período" texto="Mude o período ou programe as vagas na grade." />
          ) : (
            <>
              {!quem && (
                <Card className="overflow-x-auto">
                  <table className="w-full min-w-[640px] text-base">
                    <thead>
                      <tr className="border-b border-slate-100 text-left text-sm text-slate-500">
                        <th className="px-5 py-3 font-semibold">Anunciante</th>
                        {['Total', 'Antes', 'Depois', 'Veiculadas', 'Não veiculadas', 'Programadas'].map((c) => (
                          <th key={c} className="px-4 py-3 text-right font-semibold">
                            {c}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {resumo.map((x) => (
                        <tr key={x.nome}>
                          <td className="px-5 py-3 font-semibold">{x.nome}</td>
                          {[x.total, x.antes, x.depois, x.veiculada, x.nao_veiculada, x.programada].map((v, i) => (
                            <td key={i} className="px-4 py-3 text-right tabular-nums">
                              {v}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </Card>
              )}
              <Card className="overflow-x-auto">
                <table className="w-full min-w-[720px] text-base">
                  <thead>
                    <tr className="border-b border-slate-100 text-left text-sm text-slate-500">
                      {colunasLista.map((c) => (
                        <th key={c} className="px-4 py-3 font-semibold">
                          {c}
                        </th>
                      ))}
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100">
                    {linhas.map((l, i) => {
                      const v = valoresLista(l)
                      return (
                        <tr key={i}>
                          {v.slice(0, 6).map((c, j) => (
                            <td key={j} className={`px-4 py-2.5 ${j === 4 ? 'font-semibold' : ''}`}>
                              {c}
                            </td>
                          ))}
                          <td className="px-4 py-2.5">
                            <span className={`rounded-full px-2.5 py-1 text-sm font-semibold ${SITUACAO[l.situacao].cor}`}>{SITUACAO[l.situacao].nome}</span>
                          </td>
                        </tr>
                      )
                    })}
                  </tbody>
                </table>
              </Card>
            </>
          )}
        </>
      )}
    </div>
  )
}
