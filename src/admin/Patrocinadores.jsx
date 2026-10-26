import { useEffect, useState } from 'react'
import { Check, Clapperboard, ImagePlus, LayoutTemplate, Loader2, Megaphone, Plus, Save, Sparkles, Trash2 } from 'lucide-react'
import { mensagemDeErro, supabase } from '../supabase.js'
import { CORES, Card, ICONES_PATROCINADOR, Icone, Vazio } from '../ui.jsx'
import { Carregando } from '../auth.jsx'
import { DURACOES } from '../config.js'
import { LAYOUTS, PecaAnuncio, ehShorts, youtubeId } from '../anuncios.jsx'
import { Botao, Campo, Texto, enviarImagem, inputCls, useTabela } from './comum.jsx'

const TIPOS = [
  { id: 'simples', nome: 'Simples', descricao: 'Logo ou ícone com uma frase. Rápido de cadastrar.', icone: Megaphone, cor: 'bg-ouro-100 text-ouro-700' },
  { id: 'video', nome: 'Vídeo do YouTube', descricao: 'Cole o link de um vídeo (pode ser "Não listado").', icone: Clapperboard, cor: 'bg-marca-100 text-marca-700' },
  { id: 'automatico', nome: 'Montado pelo app', descricao: 'Logo, contatos, cores e promoção num layout pronto.', icone: Sparkles, cor: 'bg-violet-100 text-violet-700' },
]

const PALETA = ['#e11d48', '#dc2626', '#ea580c', '#f59e0b', '#facc15', '#16a34a', '#0d9488', '#0284c7', '#2563eb', '#7c3aed', '#db2777', '#0f172a']

const novoPatrocinador = () => ({
  id: crypto.randomUUID(),
  tipo: 'automatico',
  nome: '',
  slogan: '',
  descricao: '',
  icone: 'Store',
  cor: 'amber',
  logo_url: null,
  ativo: true,
  duracao_segundos: null,
  video_url: '',
  video_vertical: false,
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
})

// Colunas que existem na tabela (o resto do rascunho não vai para o banco).
const COLUNAS = Object.keys(novoPatrocinador())

function validar(p) {
  if (!p.nome.trim()) return 'Informe o nome do anunciante.'
  if (p.tipo === 'simples' && !p.slogan.trim()) return 'Escreva a frase do anúncio.'
  if (p.tipo === 'video' && !youtubeId(p.video_url)) return 'Cole um link válido do YouTube.'
  if (p.tipo === 'automatico' && !p.promo_titulo.trim() && !p.logo_url) return 'Coloque pelo menos o logotipo ou o título da promoção.'
  return ''
}

const TIPO_TEXTO = { simples: 'Simples', video: 'Vídeo', automatico: 'Automático' }

export default function Patrocinadores() {
  const { itens, recarregar } = useTabela(() => supabase.from('patrocinadores').select('*').order('criado_em'))
  const [rascunho, setRascunho] = useState(null)
  const [estado, setEstado] = useState('')
  const [erro, setErro] = useState('')

  useEffect(() => {
    if (!rascunho && itens?.length) setRascunho({ ...novoPatrocinador(), ...itens[0] })
  }, [itens, rascunho])

  if (!itens) return <Carregando />

  const set = (campo, valor) => setRascunho((r) => ({ ...r, [campo]: valor }))
  const existe = rascunho && itens.some((i) => i.id === rascunho.id)
  const problema = rascunho ? validar(rascunho) : ''

  const salvar = async () => {
    setEstado('salvando')
    setErro('')
    const registro = Object.fromEntries(COLUNAS.map((k) => [k, rascunho[k]]))
    registro.duracao_segundos = registro.duracao_segundos || null
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
    if (!confirm(`Excluir o patrocinador "${rascunho.nome}"?`)) return
    const { error } = await supabase.from('patrocinadores').delete().eq('id', rascunho.id)
    if (error) return setErro(mensagemDeErro(error))
    await recarregar()
    setRascunho(null)
  }

  return (
    <div className="grid gap-8 xl:grid-cols-[minmax(0,1fr)_380px]">
      <div className="min-w-0 space-y-6">
      {/* Lista */}
      <div className="flex gap-3 overflow-x-auto pb-2 no-scrollbar">
        <button
          onClick={() => setRascunho(novoPatrocinador())}
          className="flex w-40 shrink-0 flex-col items-center justify-center gap-2 rounded-2xl border-2 border-dashed border-marca-300 bg-marca-50/60 p-4 text-sm font-semibold text-marca-700 transition hover:bg-marca-50"
        >
          <span className="grid h-11 w-11 place-items-center rounded-full bg-marca-600 text-white">
            <Plus size={20} />
          </span>
          Novo patrocinador
        </button>
        {itens.map((p) => {
          const tipo = TIPOS.find((t) => t.id === (p.tipo ?? 'simples')) ?? TIPOS[0]
          const ativo = rascunho?.id === p.id
          return (
            <button
              key={p.id}
              onClick={() => setRascunho({ ...novoPatrocinador(), ...p })}
              className={`flex w-56 shrink-0 items-center gap-3 rounded-2xl bg-white p-3 text-left shadow-sm ring-1 transition hover:shadow-md ${
                ativo ? 'ring-2 ring-marca-500' : 'ring-slate-200'
              } ${p.ativo ? '' : 'opacity-60'}`}
            >
              <span className={`grid h-12 w-12 shrink-0 place-items-center overflow-hidden rounded-xl ${tipo.cor}`}>
                {p.logo_url ? <img src={p.logo_url} alt="" className="h-full w-full bg-white object-contain p-1" /> : <tipo.icone size={22} />}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold">{p.nome || 'Sem nome'}</span>
                <span className="block truncate text-xs text-slate-500">
                  {TIPO_TEXTO[p.tipo ?? 'simples']} {p.ativo ? '' : '· inativo'}
                </span>
              </span>
            </button>
          )
        })}
      </div>

      {/* Formulário */}
      {rascunho ? (
        <div className="space-y-5">
          <Etapa numero={1} titulo="Tipo de anúncio">
            <div className="grid gap-4 md:grid-cols-3">
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

          {rascunho.tipo === 'simples' && <ConteudoSimples p={rascunho} set={set} />}
          {rascunho.tipo === 'video' && <ConteudoVideo p={rascunho} set={set} />}
          {rascunho.tipo === 'automatico' && <ConteudoAutomatico p={rascunho} set={set} />}

          <Etapa numero={rascunho.tipo === 'automatico' ? 5 : 4} titulo="Exibição">
            <div className="grid gap-4 sm:grid-cols-2">
              <Campo rotulo="Tempo na tela (segundos)">
                <input
                  type="number"
                  min="5"
                  max="120"
                  value={rascunho.duracao_segundos ?? ''}
                  onChange={(e) => set('duracao_segundos', e.target.value ? Math.min(120, Math.max(5, Number(e.target.value))) : null)}
                  placeholder={`Padrão: ${DURACOES.anuncioPergunta} s antes da pergunta, ${DURACOES.anuncioGabarito} s antes do gabarito`}
                  className={inputCls}
                />
                <span className="mt-1 block text-[11px] text-slate-500">
                  {rascunho.tipo === 'video' ? 'Para vídeo, use a duração do vídeo (até 120 s).' : 'Deixe vazio para usar o padrão.'}
                </span>
              </Campo>
              <label className="flex cursor-pointer items-center gap-3 self-start rounded-xl bg-slate-50 p-4 ring-1 ring-slate-200">
                <input type="checkbox" checked={rascunho.ativo} onChange={(e) => set('ativo', e.target.checked)} className="h-5 w-5 accent-marca-600" />
                <span>
                  <span className="block text-sm font-semibold">Anúncio ativo</span>
                  <span className="block text-xs text-slate-500">Aparece para os ouvintes antes das perguntas.</span>
                </span>
              </label>
            </div>
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
      ) : (
        <Vazio icone={Megaphone} titulo="Escolha um patrocinador" texto='Selecione na lista ou clique em "Novo patrocinador".' />
      )}

      </div>

      {/* Prévia */}
      <div className="xl:sticky xl:top-24 xl:self-start">
        <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-400">Prévia no celular</p>
        <div className="mx-auto w-full max-w-[360px] overflow-hidden rounded-[2.5rem] border-[10px] border-slate-800 bg-slate-50 shadow-2xl">
          <div className="max-h-[680px] min-h-[480px] overflow-y-auto p-4 no-scrollbar">
            <p className="mb-3 text-center text-xs font-bold uppercase tracking-widest text-slate-500">Anúncio</p>
            {rascunho ? <PecaAnuncio key={`${rascunho.tipo}-${rascunho.layout}`} p={rascunho} /> : <PecaAnuncio p={null} />}
          </div>
        </div>
      </div>
    </div>
  )
}

function Etapa({ numero, titulo, children }) {
  return (
    <Card className="p-6">
      <p className="mb-4 flex items-center gap-3 text-base font-semibold">
        <span className="grid h-8 w-8 place-items-center rounded-full bg-slate-900 text-sm text-white">{numero}</span>
        {titulo}
      </p>
      {children}
    </Card>
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
  return (
    <Etapa numero={3} titulo="Vídeo do YouTube">
      <div className="space-y-4">
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
            <span>Vídeo reconhecido. Veja a prévia ao lado.</span>
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
            <li>O vídeo começa sem som (regra dos celulares); o ouvinte toca em "Ouvir com som".</li>
          </ul>
        </div>
      </div>
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
