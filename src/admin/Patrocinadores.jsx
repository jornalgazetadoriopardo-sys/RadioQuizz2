import { useEffect, useState } from 'react'
import { AlertTriangle, CalendarDays, Check, Clapperboard, Clock, ImagePlus, Images, LayoutTemplate, Loader2, Megaphone, Plus, Save, Search, Shuffle, Trash2, X } from 'lucide-react'
import { mensagemDeErro, supabase } from '../supabase.js'
import { CORES, Card, ICONES_PATROCINADOR, Icone, Vazio } from '../ui.jsx'
import { Carregando } from '../auth.jsx'
import { DURACOES } from '../config.js'
import { hojeSP } from '../store.jsx'
import { LAYOUTS, PecaAnuncio, PreviaBanner, ehArquivoVideo, ehShorts, youtubeId } from '../anuncios.jsx'
import { Botao, Campo, Secao, Texto, enviarImagem, enviarVideo, inputCls, reduzirFoto, useTabela } from './comum.jsx'

const TIPOS = [
  { id: 'video', nome: 'Vídeo', descricao: 'Vídeo do YouTube (de preferência vertical) ou arquivo MP4.', icone: Clapperboard, cor: 'bg-marca-100 text-marca-700' },
  { id: 'banners', nome: 'Banners', descricao: 'Até 3 imagens verticais (9:16) para os anúncios, que passam uma após a outra.', icone: Images, cor: 'bg-ouro-100 text-ouro-700' },
]
// Modelos antigos (continuam funcionando, mas não são mais oferecidos para cadastro novo)
const TIPOS_ANTIGOS = { simples: 'Simples (modelo antigo)', automatico: 'Montado pelo app (modelo antigo)' }

const PALETA = ['#e11d48', '#dc2626', '#ea580c', '#f59e0b', '#facc15', '#16a34a', '#0d9488', '#0284c7', '#2563eb', '#7c3aed', '#db2777', '#0f172a']

const novoPatrocinador = () => ({
  id: crypto.randomUUID(),
  tipo: 'video',
  nome: '',
  slogan: '',
  descricao: '',
  icone: 'Store',
  cor: 'amber',
  logo_url: null,
  ativo: true,
  duracao_segundos: null,
  video_url: '',
  video_vertical: true,
  layout: 'oferta',
  cor_primaria: '#e11d48',
  cor_secundaria: '#facc15',
  promo_titulo: '',
  promo_descricao: '',
  preco: '',
  preco_antigo: '',
  validade: '',
  telefone: '',
  whatsapp: '',
  endereco: '',
  instagram: '',
  site: '',
  imagens: [],
  espacos: ['anuncio_pergunta', 'anuncio_resultado', 'banner_inicio', 'banner_espera'],
  inicio: hojeSP(),
  fim: null,
  banner_url: null,
  banners: [],
  banners_horizontais: [],
  modalidade: 'rotativo',
  vezes_dia: 1,
  horarios_fixos: [],
})

// Colunas que existem na tabela (o resto do rascunho não vai para o banco).
const COLUNAS = Object.keys(novoPatrocinador())

function validar(p) {
  if (!p.nome.trim()) return 'Informe o nome do anunciante.'
  if (p.tipo === 'video' && !youtubeId(p.video_url) && !ehArquivoVideo(p.video_url)) return 'Cole o link do YouTube ou envie o arquivo do vídeo.'
  if (p.tipo === 'banners' && !p.banners?.length) return 'Envie pelo menos 1 banner vertical.'
  if (p.tipo === 'simples' && !p.slogan.trim()) return 'Escreva a frase do anúncio.'
  if (!p.inicio) return 'Informe a data de início da circulação.'
  if (p.fim && p.fim < p.inicio) return 'O fim da circulação está antes do início.'
  if (p.modalidade === 'fixo' && !p.horarios_fixos?.length) return 'Informe pelo menos um horário fixo.'
  if (!p.espacos?.length) return 'Marque pelo menos um espaço onde o patrocinador aparece.'
  return ''
}

/** Situação da circulação hoje. */
function situacao(p) {
  const hoje = hojeSP()
  if (!p.ativo) return { texto: 'Pausado', cor: 'bg-slate-100 text-slate-600' }
  if (p.inicio && p.inicio > hoje) return { texto: 'Agendado', cor: 'bg-sky-100 text-sky-700' }
  if (p.fim && p.fim < hoje) return { texto: 'Encerrado', cor: 'bg-red-100 text-red-700' }
  return { texto: 'Em circulação', cor: 'bg-emerald-100 text-emerald-700' }
}

const modalidadeTexto = (p) =>
  p.modalidade === 'fixo' ? `Fixo · ${(p.horarios_fixos ?? []).map((h) => h.replace(':00', 'h')).join(', ') || 'sem horário'}` : `Rotativo · ${p.vezes_dia || 1}×/dia`

const FILTROS = [
  { id: 'todos', nome: 'Todos' },
  { id: 'Em circulação', nome: 'Em circulação' },
  { id: 'Agendado', nome: 'Agendados' },
  { id: 'Pausado', nome: 'Pausados' },
  { id: 'Encerrado', nome: 'Encerrados' },
]

export default function Patrocinadores() {
  const { itens, recarregar } = useTabela(() => supabase.from('patrocinadores').select('*').order('nome'))
  const [rascunho, setRascunho] = useState(null)
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')
  const [busca, setBusca] = useState('')
  const [filtro, setFiltro] = useState('todos')

  useEffect(() => {
    if (!rascunho && itens?.length) setRascunho({ ...novoPatrocinador(), ...itens[0] })
  }, [itens, rascunho])

  if (!itens) return <Carregando />

  const set = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }))
  const existe = rascunho && itens.some((i) => i.id === rascunho.id)
  const problema = rascunho ? validar(rascunho) : ''
  const termo = busca.trim().toLowerCase()
  const lista = itens.filter((p) => (!termo || p.nome.toLowerCase().includes(termo)) && (filtro === 'todos' || situacao(p).texto === filtro))
  const contagem = (f) => (f === 'todos' ? itens.length : itens.filter((p) => situacao(p).texto === f).length)

  const salvar = async () => {
    setEstado('salvando')
    setErro('')
    const registro = Object.fromEntries(COLUNAS.map((k) => [k, rascunho[k]]))
    registro.duracao_segundos = registro.duracao_segundos || null
    registro.inicio = registro.inicio || null
    registro.fim = registro.fim || null
    registro.vezes_dia = Math.min(50, Math.max(1, Number(registro.vezes_dia) || 1))
    registro.horarios_fixos = registro.modalidade === 'fixo' ? [...new Set(registro.horarios_fixos)].sort() : []
    const { error } = await supabase.from('patrocinadores').upsert(registro)
    if (error) {
      setEstado('')
      return setErro(mensagemDeErro(error))
    }
    await recarregar()
    setEstado('salvo')
    setTimeout(() => setEstado(''), 2000)
  }

  const excluir = async () => {
    if (!confirm(`Excluir o patrocinador "${rascunho.nome}"? Para só parar de exibir, use "Pausar".`)) return
    const { error } = await supabase.from('patrocinadores').delete().eq('id', rascunho.id)
    if (error) return setErro(mensagemDeErro(error))
    await recarregar()
    setRascunho(null)
  }

  const antigo = rascunho && TIPOS_ANTIGOS[rascunho.tipo]
  // número da etapa dos banners horizontais: depois do conteúdo (vídeo, banners verticais ou modelos antigos)
  const passoBanners = { video: 4, banners: 4, simples: 4, automatico: 5 }[rascunho?.tipo] ?? 4

  return (
    <div className="grid gap-6 xl:grid-cols-[360px_minmax(0,1fr)]">
      {/* Lista com busca e filtro: rola sozinha, cabe qualquer quantidade de anunciantes */}
      <Card className="flex flex-col overflow-hidden xl:sticky xl:top-24 xl:max-h-[calc(100vh-7rem)] xl:self-start">
        <div className="space-y-3 border-b border-slate-100 p-4">
          <Botao className="w-full" onClick={() => setRascunho(novoPatrocinador())}>
            <Plus size={16} /> Novo patrocinador
          </Botao>
          <div className="relative">
            <Search size={16} className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
            <input value={busca} onChange={(e) => setBusca(e.target.value)} placeholder="Buscar anunciante" className={`${inputCls} pl-9`} />
          </div>
          <div className="flex flex-wrap gap-1.5">
            {FILTROS.map((f) => (
              <button
                key={f.id}
                type="button"
                onClick={() => setFiltro(f.id)}
                className={`rounded-full px-3.5 py-1.5 text-sm font-semibold transition ${filtro === f.id ? 'bg-marca-700 text-white' : 'bg-slate-100 text-slate-600 hover:bg-slate-200'}`}
              >
                {f.nome} ({contagem(f.id)})
              </button>
            ))}
          </div>
        </div>
        <div className="max-h-80 flex-1 divide-y divide-slate-100 overflow-y-auto xl:max-h-none">
          {lista.length === 0 && <p className="p-6 text-center text-sm text-slate-500">Nenhum anunciante encontrado.</p>}
          {lista.map((p) => {
            const sit = situacao(p)
            const ativo = rascunho?.id === p.id
            const Ic = p.tipo === 'video' ? Clapperboard : p.tipo === 'banners' ? Images : Megaphone
            return (
              <button
                key={p.id}
                onClick={() => setRascunho({ ...novoPatrocinador(), ...p })}
                className={`flex w-full items-center gap-3 border-l-4 px-4 py-4 text-left transition ${ativo ? 'border-marca-600 bg-marca-50' : 'border-transparent hover:bg-slate-50'}`}
              >
                <span className="grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl bg-slate-100 text-slate-500">
                  {p.logo_url ? <img src={p.logo_url} alt="" className="h-full w-full bg-white object-contain p-1" /> : <Ic size={20} />}
                </span>
                <span className="min-w-0 flex-1">
                  <span className={`block truncate text-base font-semibold ${ativo ? 'text-marca-800' : ''}`}>{p.nome || 'Sem nome'}</span>
                  <span className="block truncate text-sm text-slate-500">{modalidadeTexto(p)}</span>
                </span>
                <span className={`shrink-0 rounded-full px-2 py-0.5 text-[10px] font-bold ${sit.cor}`}>{sit.texto}</span>
              </button>
            )
          })}
        </div>
      </Card>

      {/* Formulário + prévia */}
      {rascunho ? (
        <div className="min-w-0">
          <div className="min-w-0 space-y-5">
            <Etapa numero={1} titulo="Tipo de anúncio">
              <div className="grid gap-4 md:grid-cols-2">
                {TIPOS.map((t) => (
                  <button
                    key={t.id}
                    type="button"
                    onClick={() => set('tipo', t.id)}
                    className={`relative rounded-2xl bg-white p-4 text-left ring-2 transition hover:shadow-md ${rascunho.tipo === t.id ? 'ring-marca-500' : 'ring-slate-200'}`}
                  >
                    {rascunho.tipo === t.id && (
                      <span className="absolute right-3 top-3 grid h-6 w-6 place-items-center rounded-full bg-marca-600 text-white">
                        <Check size={14} />
                      </span>
                    )}
                    <span className={`grid h-12 w-12 place-items-center rounded-2xl ${t.cor}`}>
                      <t.icone size={24} />
                    </span>
                    <span className="mt-3 block font-semibold">{t.nome}</span>
                    <span className="mt-1 block text-xs leading-relaxed text-slate-500">{t.descricao}</span>
                  </button>
                ))}
              </div>
              {antigo && (
                <p className="mt-4 flex gap-2 rounded-xl bg-ouro-50 p-3 text-sm text-ouro-900 ring-1 ring-ouro-200">
                  <AlertTriangle size={18} className="mt-0.5 shrink-0" />
                  Este anúncio usa um modelo antigo ({antigo}). Ele continua aparecendo como está; para trocar, escolha Vídeo ou Banners acima e envie o material.
                </p>
              )}
            </Etapa>

            <Etapa numero={2} titulo="Anunciante">
              <div className="grid gap-4 sm:grid-cols-2">
                <Campo rotulo="Nome do anunciante">
                  <Texto valor={rascunho.nome} onChange={(v) => set('nome', v)} placeholder="Supermercado Central" />
                </Campo>
                <EnvioImagem
                  rotulo="Logotipo (PNG de preferência, com fundo transparente)"
                  url={rascunho.logo_url}
                  pasta={rascunho.id}
                  aoEnviar={(url) => set('logo_url', url)}
                  aoRemover={() => set('logo_url', null)}
                />
              </div>
            </Etapa>

            {rascunho.tipo === 'video' && <ConteudoVideo p={rascunho} set={set} />}
            {rascunho.tipo === 'simples' && <ConteudoSimples p={rascunho} set={set} />}
            {rascunho.tipo === 'automatico' && <ConteudoAutomatico p={rascunho} set={set} />}
            {antigo && (
              <Secao titulo="Prévia do anúncio antigo">
                <PreviaCelular titulo="">
                  <PecaAnuncio p={rascunho} />
                </PreviaCelular>
              </Secao>
            )}
            {rascunho.tipo === 'banners' && (
              <Etapa numero={3} titulo="Banners verticais (anúncios de 15 s e 30 s)">
                <EditorBanners p={rascunho} set={set} formato="vertical" />
              </Etapa>
            )}
            <Etapa numero={passoBanners} titulo="Banners horizontais (outras posições)">
              <EditorBanners
                p={rascunho}
                set={set}
                formato="horizontal"
                aviso="Opcional. Sem banners horizontais, este anunciante não aparece na tela inicial nem nas telas de espera."
              />
            </Etapa>

            <Etapa numero={passoBanners + 1} titulo="Onde, quando e quantas vezes">
              <Circulacao p={rascunho} set={set} />
            </Etapa>

            <div className="sticky bottom-4 z-10 flex flex-wrap items-center gap-3 rounded-2xl bg-white/95 p-4 shadow-lg ring-1 ring-slate-200 backdrop-blur">
              <Botao onClick={salvar} disabled={!!problema || estado === 'salvando'}>
                {estado === 'salvando' ? <Loader2 size={15} className="animate-spin" /> : <Save size={15} />} Salvar patrocinador
              </Botao>
              {problema && <span className="text-sm font-semibold text-ouro-700">{problema}</span>}
              {estado === 'salvo' && <span className="text-sm font-semibold text-emerald-600">Salvo! Os celulares já foram atualizados.</span>}
              {erro && <span className="text-sm font-semibold text-red-600">{erro}</span>}
              {existe && (
                <Botao variante="perigo" className="ml-auto" onClick={excluir}>
                  <Trash2 size={15} /> Excluir
                </Botao>
              )}
            </div>
          </div>
        </div>
      ) : (
        <Vazio icone={Megaphone} titulo="Escolha um patrocinador" texto='Selecione na lista ou clique em "Novo patrocinador".' />
      )}
    </div>
  )
}

const FORMATOS = {
  vertical: {
    campo: 'banners',
    pasta: 'banners',
    proporcao: 9 / 16,
    nome: 'vertical 9:16',
    caixa: 'aspect-[9/16] w-32',
    especificacao: (
      <>
        Formato <b>9:16 (vertical, igual ao story do Instagram)</b>: de preferência <b>1080 × 1920 px</b> (ou 720 × 1280 px).
      </>
    ),
    onde: 'Aparecem nos anúncios de 15 s antes e 30 s depois de responder, ocupando a altura da tela.',
    margem: 'Deixe uma margem livre nas bordas e evite informação importante no topo e no rodapé.',
  },
  horizontal: {
    campo: 'banners_horizontais',
    pasta: 'banners-horizontais',
    proporcao: 16 / 9,
    nome: 'horizontal 16:9',
    caixa: 'aspect-video w-56',
    especificacao: (
      <>
        Formato <b>16:9 (horizontal)</b>: de preferência <b>1920 × 1080 px</b> (ou 1280 × 720 px).
      </>
    ),
    onde: 'Aparecem nas outras posições: tela inicial e telas de espera (abrindo, resposta enviada e resultado).',
    margem: 'O banner aparece pequeno no celular: use textos grandes e deixe uma margem livre nas bordas.',
  },
}

/** Até 3 banners do anunciante no formato pedido (vertical para os anúncios, horizontal para as outras posições). */
function EditorBanners({ p, set, formato = 'vertical', aviso: avisoVazio }) {
  const f = FORMATOS[formato]
  const [enviando, setEnviando] = useState(false)
  const [aviso, setAviso] = useState('')
  const banners = p[f.campo] ?? []

  const escolher = async (arquivo) => {
    if (!arquivo) return
    setAviso('')
    setEnviando(true)
    try {
      const proporcao = await new Promise((ok) => {
        const img = new Image()
        img.onload = () => ok(img.naturalWidth / img.naturalHeight)
        img.onerror = () => ok(null)
        img.src = URL.createObjectURL(arquivo)
      })
      const url = await enviarImagem(await reduzirFoto(arquivo, 1920), `${p.id}/${f.pasta}`)
      set(f.campo, [...banners, url].slice(0, 3))
      if (proporcao && Math.abs(proporcao - f.proporcao) / f.proporcao > 0.06)
        setAviso(`Atenção: essa imagem não está no formato ${f.nome}. Ela foi enviada, mas as bordas podem ser cortadas no app.`)
    } catch (e) {
      setAviso(e.message)
    }
    setEnviando(false)
  }

  return (
    <div className="space-y-4">
      <div className="rounded-xl bg-sky-50 p-4 text-xs leading-relaxed text-sky-900 ring-1 ring-sky-200">
        <p className="font-semibold">Especificações</p>
        <ul className="mt-1 list-disc space-y-0.5 pl-4">
          <li>{f.especificacao}</li>
          <li>JPG ou PNG, até 3 MB cada. Até 3 banners; eles passam um após o outro.</li>
          <li>Textos grandes e com bom contraste. {f.margem}</li>
          <li>{f.onde}</li>
        </ul>
      </div>
      <div className="flex flex-wrap gap-3">
        {banners.map((url, i) => (
          <div key={url} className={`relative overflow-hidden rounded-xl ring-1 ring-slate-200 ${f.caixa}`}>
            <img src={url} alt="" className="h-full w-full object-cover" />
            <span className="absolute left-2 top-2 rounded-full bg-black/60 px-2 py-0.5 text-[10px] font-bold text-white">{i + 1}º</span>
            <button
              type="button"
              onClick={() => set(f.campo, banners.filter((b) => b !== url))}
              title="Tirar este banner"
              className="absolute right-2 top-2 grid h-7 w-7 place-items-center rounded-full bg-white/90 text-red-600 shadow hover:bg-white"
            >
              <X size={15} />
            </button>
          </div>
        ))}
        {banners.length < 3 && (
          <label
            className={`grid cursor-pointer place-items-center rounded-xl border-2 border-dashed border-slate-300 bg-slate-50 text-center text-xs font-semibold text-slate-500 transition hover:border-marca-400 hover:text-marca-600 ${f.caixa}`}
          >
            {enviando ? (
              <Loader2 className="animate-spin text-marca-600" />
            ) : (
              <span className="flex flex-col items-center gap-1 px-2">
                <ImagePlus size={22} /> Adicionar banner ({banners.length}/3)
              </span>
            )}
            <input type="file" accept="image/png,image/jpeg,image/webp" className="hidden" disabled={enviando} onChange={(e) => escolher(e.target.files?.[0])} />
          </label>
        )}
      </div>
      {aviso && <p className="text-sm font-semibold text-ouro-700">{aviso}</p>}
      {!banners.length && avisoVazio && <p className="text-sm text-slate-500">{avisoVazio}</p>}
      {banners.length > 0 &&
        (formato === 'vertical' ? (
          <PreviaCelular titulo="Prévia: anúncio de banners no celular">
            <PecaAnuncio key={banners.join()} p={{ ...p, tipo: 'banners' }} alturaVertical="400px" />
          </PreviaCelular>
        ) : (
          <PreviaCelular titulo="Prévia: banner na tela inicial e nas telas de espera" rotulo="Patrocínio">
            <PreviaBanner p={p} />
          </PreviaCelular>
        ))}
    </div>
  )
}

/** Período de circulação, pausa, modalidade (rotativo/fixo), vezes por dia e espaços. */
function Circulacao({ p, set }) {
  const [novoHorario, setNovoHorario] = useState('17:00')
  const indeterminado = !p.fim
  const horarios = p.horarios_fixos ?? []

  return (
    <div className="space-y-6">
      <OndeMostrar p={p} set={set} />
      <div>
        <p className="mb-2 flex items-center gap-2 text-sm font-semibold">
          <CalendarDays size={16} className="text-marca-600" /> Período de circulação
        </p>
        <div className="grid gap-4 sm:grid-cols-3">
          <Campo rotulo="Início">
            <input type="date" value={p.inicio ?? ''} onChange={(e) => set('inicio', e.target.value || null)} className={inputCls} />
          </Campo>
          <Campo rotulo="Fim">
            <input type="date" value={p.fim ?? ''} disabled={indeterminado && !p.fim} onChange={(e) => set('fim', e.target.value || null)} className={`${inputCls} disabled:opacity-40`} />
          </Campo>
          <label className="flex cursor-pointer items-center gap-2 self-end rounded-xl bg-slate-50 px-3 py-2.5 text-sm ring-1 ring-slate-200">
            <input
              type="checkbox"
              checked={indeterminado}
              onChange={(e) => set('fim', e.target.checked ? null : p.inicio || hojeSP())}
              className="h-5 w-5 accent-marca-600"
            />
            Prazo indeterminado
          </label>
        </div>
        <label className="mt-3 flex cursor-pointer items-center gap-3 rounded-xl bg-slate-50 p-3 ring-1 ring-slate-200">
          <input type="checkbox" checked={!p.ativo} onChange={(e) => set('ativo', !e.target.checked)} className="h-5 w-5 accent-marca-600" />
          <span>
            <span className="block text-sm font-semibold">Pausar a exibição</span>
            <span className="block text-xs text-slate-500">Tira o anunciante de todos os espaços, sem apagar. Use para encerrar quem está com prazo indeterminado.</span>
          </span>
        </label>
      </div>

      <div>
        <p className="mb-2 text-sm font-semibold">Modalidade</p>
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: 'rotativo', nome: 'Rotativo', texto: 'Padrão. Aparece nos anúncios das rodadas as vezes por dia combinadas, sorteado entre os outros anunciantes.', icone: Shuffle },
            { id: 'fixo', nome: 'Fixo', texto: 'Aparece no anúncio da rodada do horário combinado (ex.: 17h → rodada das 17h).', icone: Clock },
          ].map((m) => (
            <button
              key={m.id}
              type="button"
              onClick={() => set('modalidade', m.id)}
              className={`flex gap-3 rounded-2xl p-4 text-left ring-2 transition ${p.modalidade === m.id ? 'bg-marca-50 ring-marca-500' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}
            >
              <m.icone size={20} className="mt-0.5 shrink-0 text-marca-600" />
              <span>
                <span className="block text-sm font-semibold">{m.nome}</span>
                <span className="mt-0.5 block text-xs leading-relaxed text-slate-500">{m.texto}</span>
              </span>
            </button>
          ))}
        </div>
        {p.modalidade === 'rotativo' ? (
          <Campo rotulo="Vezes por dia nos anúncios das rodadas" className="mt-4 max-w-xs">
            <input
              type="number"
              min="1"
              max="50"
              value={p.vezes_dia ?? 1}
              onChange={(e) => set('vezes_dia', e.target.value === '' ? 1 : Math.min(50, Math.max(1, Number(e.target.value))))}
              className={inputCls}
            />
            <span className="mt-1 block text-[11px] text-slate-500">Se não mudar, vale 1 vez ao dia. Nos banners, quem tem mais vezes também aparece mais.</span>
          </Campo>
        ) : (
          <div className="mt-4">
            <span className="mb-1.5 block text-xs font-semibold text-slate-600">Horários fixos</span>
            <div className="flex flex-wrap items-center gap-2">
              {horarios.map((h) => (
                <span key={h} className="inline-flex items-center gap-1 rounded-full bg-marca-100 py-1 pl-3 pr-1 text-sm font-semibold text-marca-800">
                  {h}
                  <button type="button" title="Tirar" onClick={() => set('horarios_fixos', horarios.filter((x) => x !== h))} className="grid h-6 w-6 place-items-center rounded-full hover:bg-white">
                    <X size={13} />
                  </button>
                </span>
              ))}
              <span className="w-36">
                <input type="time" value={novoHorario} onChange={(e) => setNovoHorario(e.target.value)} className={inputCls} />
              </span>
              <Botao type="button" variante="secundario" disabled={!novoHorario || horarios.includes(novoHorario)} onClick={() => set('horarios_fixos', [...horarios, novoHorario].sort())}>
                <Plus size={14} /> Adicionar
              </Botao>
            </div>
            <span className="mt-1 block text-[11px] text-slate-500">
              O anúncio aparece na rodada que começa nesse horário (até 29 min depois). Se dois fixos coincidirem, um vai para o anúncio antes da pergunta e o outro para o anúncio antes do resultado.
            </span>
          </div>
        )}
      </div>

    </div>
  )
}

// Onde o anúncio pode aparecer (os banners da tela inicial e das telas de espera andam juntos)
const ONDE_MOSTRAR = [
  {
    espacos: ['anuncio_pergunta'],
    nome: `${DURACOES.anuncioPergunta} segundos antes de responder`,
    texto: `Depois de "Vou participar", antes da pergunta. Vídeos com mais de ${DURACOES.anuncioPergunta} s são cortados.`,
  },
  {
    espacos: ['anuncio_resultado'],
    nome: `${DURACOES.anuncioGabarito} segundos depois de responder`,
    texto: `Depois de "Confira sua resposta", antes do resultado. Vídeos com mais de ${DURACOES.anuncioGabarito} s são cortados.`,
  },
  {
    espacos: ['banner_inicio', 'banner_espera'],
    nome: 'Banners em outras posições',
    texto: 'Tela inicial e telas de espera e do resultado. Usa os banners horizontais.',
  },
]

function OndeMostrar({ p, set }) {
  const marcado = (o) => o.espacos.every((e) => p.espacos?.includes(e))
  const marcar = (o, sim) => {
    const atuais = (p.espacos ?? []).filter((e) => !o.espacos.includes(e))
    set('espacos', sim ? [...atuais, ...o.espacos] : atuais)
  }
  return (
    <div>
      <p className="mb-2 text-sm font-semibold">Onde será mostrado</p>
      <div className="grid gap-3 md:grid-cols-3">
        {ONDE_MOSTRAR.map((o) => (
          <label key={o.nome} className={`flex cursor-pointer items-start gap-3 rounded-2xl p-3 ring-2 transition ${marcado(o) ? 'bg-marca-50 ring-marca-400' : 'bg-white ring-slate-200'}`}>
            <input type="checkbox" checked={marcado(o)} onChange={(ev) => marcar(o, ev.target.checked)} className="mt-0.5 h-5 w-5 accent-marca-600" />
            <span>
              <span className="block text-sm font-semibold">{o.nome}</span>
              <span className="block text-xs leading-relaxed text-slate-500">{o.texto}</span>
            </span>
          </label>
        ))}
      </div>
      {!p.banners_horizontais?.length && !p.banner_url && marcado(ONDE_MOSTRAR[2]) && (
        <p className="mt-2 text-xs font-semibold text-ouro-700">Este anunciante ainda não tem banners horizontais: ele não vai aparecer nas outras posições.</p>
      )}
    </div>
  )
}

function Etapa({ numero, titulo, children }) {
  return (
    <Secao numero={numero} titulo={titulo}>
      {children}
    </Secao>
  )
}

/** Celular pequeno com a prévia de como o anúncio aparece no app. */
function PreviaCelular({ titulo = 'Prévia no app', rotulo = 'Anúncio', children }) {
  return (
    <div className="mt-6">
      <p className="mb-3 text-center text-sm font-bold text-slate-700">{titulo}</p>
      <div className="mx-auto w-[280px] overflow-hidden rounded-[2.2rem] border-[9px] border-slate-800 bg-slate-50 shadow-xl">
        <div className="fundo-marca flex items-center justify-between px-3 py-2">
          <img src="/logo-difusora-branco.png" alt="" className="h-6 w-auto" />
          <span className="text-[9px] font-extrabold uppercase tracking-wider text-ouro-300">Pergunta da Hora</span>
        </div>
        <div className="p-3">
          <p className="mb-2 text-center text-[10px] font-bold uppercase tracking-widest text-slate-500">{rotulo}</p>
          {children}
        </div>
      </div>
    </div>
  )
}

function EnvioImagem({ rotulo, url, pasta, aoEnviar, aoRemover }) {
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')
  const escolher = async (arquivo) => {
    setErro('')
    setEnviando(true)
    try {
      aoEnviar(await enviarImagem(arquivo, pasta))
    } catch (e) {
      setErro(e.message)
    } finally {
      setEnviando(false)
    }
  }
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{rotulo}</span>
      <div className="flex items-center gap-3">
        <label className="group relative grid h-20 w-20 shrink-0 cursor-pointer place-items-center overflow-hidden rounded-2xl border-2 border-dashed border-slate-300 bg-slate-50 transition hover:border-marca-400">
          {url ? <img src={url} alt="" className="h-full w-full object-contain p-1" /> : enviando ? <Loader2 className="animate-spin text-marca-600" /> : <ImagePlus className="text-slate-400 group-hover:text-marca-500" />}
          <input type="file" accept="image/png,image/jpeg,image/webp,image/svg+xml" className="hidden" onChange={(e) => escolher(e.target.files[0])} />
        </label>
        <div className="text-xs text-slate-500">
          <p>{url ? 'Clique na imagem para trocar.' : 'Clique para enviar (até 3 MB).'}</p>
          {url && (
            <button type="button" onClick={aoRemover} className="mt-1 font-semibold text-marca-600 underline">
              Remover
            </button>
          )}
          {erro && <p className="mt-1 font-semibold text-red-600">{erro}</p>}
        </div>
      </div>
    </div>
  )
}

function ConteudoSimples({ p, set }) {
  const c = CORES[p.cor] ?? CORES.amber
  return (
    <Etapa numero={3} titulo="Conteúdo do anúncio">
      <div className="grid gap-4 sm:grid-cols-2">
        <Campo rotulo="Frase / oferta" className="sm:col-span-2">
          <Texto valor={p.slogan} onChange={(v) => set('slogan', v)} placeholder="Festival de Carnes Nobres & Bebidas" />
        </Campo>
        <Campo rotulo="Descrição" className="sm:col-span-2">
          <Texto multilinha valor={p.descricao} onChange={(v) => set('descricao', v)} />
        </Campo>
        <div className="sm:col-span-2">
          <span className="mb-1 block text-xs font-semibold text-slate-600">Ícone (aparece quando não há logotipo)</span>
          <div className="flex flex-wrap gap-2">
            {ICONES_PATROCINADOR.map((nome) => (
              <button
                type="button"
                key={nome}
                onClick={() => set('icone', nome)}
                className={`grid h-11 w-11 place-items-center rounded-xl ring-1 ${p.icone === nome ? `${c.fundo} ${c.texto} ring-current` : 'text-slate-500 ring-slate-200'}`}
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
                className={`h-9 w-9 rounded-full ${CORES[cor].fundo} ring-2 ${p.cor === cor ? 'ring-slate-900' : 'ring-slate-200'}`}
                aria-label={cor}
              >
                <span className={`mx-auto block h-3.5 w-3.5 rounded-full bg-current ${CORES[cor].texto}`} />
              </button>
            ))}
          </div>
        </div>
      </div>
    </Etapa>
  )
}

function ConteudoVideo({ p, set }) {
  const id = youtubeId(p.video_url)
  const [fonte, setFonte] = useState(ehArquivoVideo(p.video_url) ? 'arquivo' : 'youtube')
  const [enviando, setEnviando] = useState(false)
  const [erro, setErro] = useState('')

  const escolherArquivo = async (arquivo) => {
    if (!arquivo) return
    setErro('')
    setEnviando(true)
    try {
      // lê duração e formato do próprio arquivo
      const meta = await new Promise((ok) => {
        const v = document.createElement('video')
        v.preload = 'metadata'
        v.onloadedmetadata = () => ok({ duracao: v.duration, vertical: v.videoHeight > v.videoWidth })
        v.onerror = () => ok(null)
        v.src = URL.createObjectURL(arquivo)
      })
      const url = await enviarVideo(arquivo, 'videos')
      set('video_url', url)
      if (meta) {
        set('video_vertical', meta.vertical)
        if (Number.isFinite(meta.duracao)) set('duracao_segundos', Math.min(120, Math.max(5, Math.ceil(meta.duracao))))
      }
    } catch (e) {
      setErro(e.message)
    }
    setEnviando(false)
  }

  return (
    <Etapa numero={3} titulo="Vídeo">
      <div className="space-y-4">
        <div className="grid gap-3 sm:grid-cols-2">
          {[
            { id: 'youtube', nome: 'Link do YouTube', texto: 'Padrão. De preferência vídeo vertical (Shorts), que ocupa mais a tela do celular.' },
            { id: 'arquivo', nome: 'Arquivo de vídeo (MP4)', texto: 'Alternativa: o vídeo fica guardado no Supabase (até 20 MB).' },
          ].map((o) => (
            <button
              key={o.id}
              type="button"
              onClick={() => setFonte(o.id)}
              className={`rounded-2xl p-4 text-left ring-2 transition ${fonte === o.id ? 'bg-marca-50 ring-marca-500' : 'bg-white ring-slate-200 hover:ring-slate-300'}`}
            >
              <span className="block text-sm font-semibold">{o.nome}</span>
              <span className="mt-1 block text-xs leading-relaxed text-slate-500">{o.texto}</span>
            </button>
          ))}
        </div>
        {fonte === 'arquivo' && (
          <div className="space-y-3">
            <label className={`flex cursor-pointer items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-slate-300 p-6 text-sm font-semibold text-slate-700 hover:border-marca-400 ${enviando ? 'opacity-60' : ''}`}>
              {enviando ? <Loader2 size={18} className="animate-spin" /> : <Clapperboard size={18} />}
              {enviando ? 'Enviando o vídeo…' : ehArquivoVideo(p.video_url) ? 'Trocar o vídeo' : 'Escolher o arquivo do vídeo'}
              <input type="file" accept="video/mp4,video/quicktime" className="hidden" disabled={enviando} onChange={(e) => escolherArquivo(e.target.files?.[0])} />
            </label>
            {ehArquivoVideo(p.video_url) && !enviando && (
              <p className="rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">Vídeo enviado. Veja a prévia abaixo.</p>
            )}
            {erro && <p className="text-sm font-semibold text-red-600">{erro}</p>}
            <p className="text-xs leading-relaxed text-slate-500">
              MP4 de até 20 MB. Para carregar rápido no 4G e gastar pouco da internet do ouvinte, prefira vídeos curtos (15 a 30 s) em 720p ou menos.
            </p>
          </div>
        )}
        {fonte === 'youtube' && (
          <>
          <Campo rotulo="Link do vídeo">
            <Texto
              valor={p.video_url}
              onChange={(v) => {
                set('video_url', v.trim())
                if (ehShorts(v)) set('video_vertical', true)
              }}
              placeholder="https://youtu.be/... ou https://www.youtube.com/watch?v=..."
            />
          </Campo>
          {p.video_url && !id && <p className="text-sm font-semibold text-marca-600">Não reconheci esse link. Copie o endereço pelo botão "Compartilhar" do YouTube.</p>}
          {id && (
            <div className="flex items-center gap-3 rounded-xl bg-emerald-50 p-3 text-sm text-emerald-800">
              <img src={`https://i.ytimg.com/vi/${id}/mqdefault.jpg`} alt="" className="h-14 w-24 rounded-lg object-cover" />
              <span>Vídeo reconhecido. Veja a prévia abaixo.</span>
            </div>
          )}
          <div className="flex flex-wrap gap-3">
            {[
              { v: false, nome: 'Horizontal (16:9)' },
              { v: true, nome: 'Vertical (Shorts / 9:16)' },
            ].map((o) => (
              <label key={o.nome} className={`flex cursor-pointer items-center gap-2 rounded-xl px-4 py-2.5 text-sm font-semibold ring-2 ${p.video_vertical === o.v ? 'ring-marca-500' : 'ring-slate-200'}`}>
                <input type="radio" name="formato" checked={p.video_vertical === o.v} onChange={() => set('video_vertical', o.v)} className="accent-marca-600" />
                {o.nome}
              </label>
            ))}
          </div>
          <div className="rounded-xl bg-slate-50 p-4 text-xs leading-relaxed text-slate-600 ring-1 ring-slate-200">
            <p className="font-semibold text-slate-800">No YouTube, antes de colar o link:</p>
            <ul className="mt-1 list-disc space-y-0.5 pl-4">
              <li>
                Em <b>Visibilidade</b>, escolha <b>Não listado</b> (o vídeo não aparece nas buscas, mas toca no quiz).
              </li>
              <li>
                Em <b>Mais opções</b>, deixe marcado <b>Permitir incorporação</b>.
              </li>
              <li>Se o celular bloquear o som do YouTube, aparece o botão "Ouvir com som". Para som garantido, use o arquivo MP4.</li>
            </ul>
          </div>
          </>
        )}
      </div>
      {(id || ehArquivoVideo(p.video_url)) && (
        <PreviaCelular titulo="Prévia: assim o vídeo aparece no celular">
          <PecaAnuncio key={`${p.video_url}-${p.video_vertical}`} p={{ ...p, tipo: 'video' }} alturaVertical="400px" />
        </PreviaCelular>
      )}
    </Etapa>
  )
}

function ConteudoAutomatico({ p, set }) {
  const trocarImagem = (i, url) => {
    const nova = [...(p.imagens ?? [])]
    if (url) nova[i] = url
    else nova.splice(i, 1)
    set('imagens', nova.filter(Boolean).slice(0, 3))
  }
  return (
    <>
      <Etapa numero={3} titulo="Layout, cores e promoção">
        <div className="space-y-6">
          <div>
            <span className="mb-2 flex items-center gap-2 text-xs font-semibold text-slate-600">
              <LayoutTemplate size={14} /> Escolha um layout
            </span>
            <div className="grid gap-4 sm:grid-cols-2">
              {LAYOUTS.map((l) => (
                <button
                  key={l.id}
                  type="button"
                  onClick={() => set('layout', l.id)}
                  className={`overflow-hidden rounded-2xl bg-white text-left ring-2 transition hover:shadow-md ${p.layout === l.id ? 'ring-marca-500' : 'ring-slate-200'}`}
                >
                  <div className="pointer-events-none relative h-60 overflow-hidden bg-gradient-to-b from-slate-100 to-slate-50">
                    <div className="absolute left-1/2 top-4 w-[340px] origin-top -translate-x-1/2 scale-[0.62]">
                      <PecaAnuncio p={{ ...p, tipo: 'automatico', layout: l.id }} />
                    </div>
                  </div>
                  <div className="p-3">
                    <p className="flex items-center gap-1.5 text-sm font-semibold">
                      {p.layout === l.id && <Check size={14} className="text-marca-600" />} {l.nome}
                    </p>
                    <p className="text-[11px] leading-snug text-slate-500">{l.descricao}</p>
                  </div>
                </button>
              ))}
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <SeletorCor rotulo="Cor principal" valor={p.cor_primaria} aoMudar={(v) => set('cor_primaria', v)} />
            <SeletorCor rotulo="Cor de destaque" valor={p.cor_secundaria} aoMudar={(v) => set('cor_secundaria', v)} />
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="Título da promoção" className="sm:col-span-2">
              <Texto valor={p.promo_titulo} onChange={(v) => set('promo_titulo', v.slice(0, 60))} placeholder="Picanha especial" />
            </Campo>
            <Campo rotulo="Descrição" className="sm:col-span-2">
              <Texto multilinha valor={p.promo_descricao} onChange={(v) => set('promo_descricao', v.slice(0, 200))} placeholder="Corte nobre, embalado na hora. Leve 2 kg e ganhe o carvão." />
            </Campo>
            <Campo rotulo="Preço">
              <Texto valor={p.preco} onChange={(v) => set('preco', v.slice(0, 20))} placeholder="R$ 59,90" />
            </Campo>
            <Campo rotulo="Preço antigo (opcional, aparece riscado)">
              <Texto valor={p.preco_antigo} onChange={(v) => set('preco_antigo', v.slice(0, 20))} placeholder="R$ 79,90" />
            </Campo>
            <Campo rotulo="Validade / condição" className="sm:col-span-2">
              <Texto valor={p.validade} onChange={(v) => set('validade', v.slice(0, 60))} placeholder="Válido até domingo ou enquanto durar o estoque" />
            </Campo>
          </div>
        </div>
      </Etapa>

      <Etapa numero={4} titulo="Fotos e contatos">
        <div className="space-y-6">
          <div>
            <span className="mb-2 block text-xs font-semibold text-slate-600">Fotos dos produtos (até 3; a primeira é a principal)</span>
            <div className="flex flex-wrap gap-4">
              {[0, 1, 2].map((i) => {
                const url = p.imagens?.[i]
                if (!url && i > (p.imagens?.length ?? 0)) return null
                return (
                  <div key={i} className="relative">
                    <EnvioImagem rotulo={`Foto ${i + 1}`} url={url} pasta={p.id} aoEnviar={(u) => trocarImagem(i, u)} aoRemover={() => trocarImagem(i, null)} />
                  </div>
                )
              })}
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <Campo rotulo="WhatsApp">
              <Texto valor={p.whatsapp} onChange={(v) => set('whatsapp', v.slice(0, 30))} placeholder="(19) 99999-0000" />
            </Campo>
            <Campo rotulo="Telefone">
              <Texto valor={p.telefone} onChange={(v) => set('telefone', v.slice(0, 30))} placeholder="(19) 3671-0000" />
            </Campo>
            <Campo rotulo="Endereço" className="sm:col-span-2">
              <Texto valor={p.endereco} onChange={(v) => set('endereco', v.slice(0, 120))} placeholder="Rua Coronel Ferreira, 123 — Centro" />
            </Campo>
            <Campo rotulo="Instagram">
              <Texto valor={p.instagram} onChange={(v) => set('instagram', v.slice(0, 40))} placeholder="@supermercadocentral" />
            </Campo>
            <Campo rotulo="Site">
              <Texto valor={p.site} onChange={(v) => set('site', v.slice(0, 80))} placeholder="www.supercentral.com.br" />
            </Campo>
          </div>
        </div>
      </Etapa>
    </>
  )
}

function SeletorCor({ rotulo, valor, aoMudar }) {
  return (
    <div>
      <span className="mb-1 block text-xs font-semibold text-slate-600">{rotulo}</span>
      <div className="flex flex-wrap items-center gap-2">
        {PALETA.map((c) => (
          <button
            key={c}
            type="button"
            onClick={() => aoMudar(c)}
            aria-label={c}
            className={`h-8 w-8 rounded-full ring-2 ring-offset-2 transition ${valor?.toLowerCase() === c ? 'ring-slate-900' : 'ring-transparent hover:ring-slate-300'}`}
            style={{ background: c }}
          />
        ))}
        <label className="relative grid h-8 w-8 cursor-pointer place-items-center overflow-hidden rounded-full ring-1 ring-slate-300" title="Outra cor">
          <input type="color" value={valor} onChange={(e) => aoMudar(e.target.value)} className="absolute inset-0 h-full w-full cursor-pointer opacity-0" />
          <Plus size={14} className="text-slate-500" />
        </label>
        <span className="font-mono text-xs text-slate-500">{valor}</span>
      </div>
    </div>
  )
}
