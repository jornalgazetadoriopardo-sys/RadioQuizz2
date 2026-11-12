# Configurar o Supabase (uma vez só)

Projeto: `sxhwkkplxaotpxtgbzqe` — painel em https://supabase.com/dashboard/project/sxhwkkplxaotpxtgbzqe

## 1. Criar o banco de dados
1. No menu lateral, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de [`supabase/migrations/001_esquema.sql`](supabase/migrations/001_esquema.sql) e clique em **Run**.
   Deve aparecer "Success. No rows returned".
3. Abra outra **New query**, cole [`supabase/migrations/002_dados_exemplo.sql`](supabase/migrations/002_dados_exemplo.sql) e clique em **Run**
   (cria 6 rodadas, 4 patrocinadores e 3 prêmios de exemplo — tudo editável depois pelo Painel Admin).

### Atualizações do banco
**Jeito mais fácil:** rode o arquivo [`supabase/ATUALIZAR-BANCO.sql`](supabase/ATUALIZAR-BANCO.sql), que junta
todas as atualizações de 005 a 018 e pode ser rodado mais de uma vez. No fim ele mostra uma tabela com OK em cada parte.
Pelo celular, abra o link "raw" do arquivo no GitHub, selecione tudo, copie e cole no SQL Editor.

Ou rode cada arquivo novo, na ordem do número:
Quando o projeto ganhar um arquivo novo em `supabase/migrations/`, rode só esse arquivo no **SQL Editor**, na ordem do número:
- `003_pontuacao_fixa.sql` — quem acerta ganha o valor cheio da rodada (sem bônus por velocidade).
- `004_historico.sql` — histórico de participações com protocolo (auditoria para reclamações).
- `005_agendamento.sql` — data, horário de início e de encerramento e modo manual ou automático em cada rodada.
  No fim ele mostra se o agendador ficou ativo. Se aparecer "ATENÇÃO", ative a extensão **pg_cron** em
  **Database → Extensions** e rode o arquivo de novo (pode rodar mais de uma vez).
- `006_relogio.sql` — hora oficial do servidor, mostrada no app e no Painel Admin (sem ele, o app usa a hora do aparelho).
- `007_notificacoes.sql` — notificações no celular. Depois dele é preciso publicar a função `enviar-push`
  (veja a seção **Notificações** abaixo).
- `008_anuncios.sql` — anúncios de patrocinador em vídeo do YouTube e montados automaticamente (layouts prontos).
- `009_segundos.sql` — horários das rodadas com segundos e agendador conferindo a cada segundo. Depois dele,
  **publique de novo a função `enviar-push`** (Edge Functions → enviar-push → cole o arquivo atualizado → Deploy).
- `010_corrige_agendamento.sql` — corrige rodadas automáticas que não abriam: uma rodada que já tinha sido
  encerrada (num teste ou porque o horário passou) agora volta a ficar "agendada" quando você muda a data ou o
  horário dela, e encerrar à mão antes do horário não cancela mais o agendamento. Cria também o
  **Diagnóstico do agendamento** (Painel Admin → Ao vivo). No fim ele mostra se o agendador está ATIVO e
  quantas vezes conferiu no último minuto.
- `011_entrada_na_rodada.sql` — o tempo no ar passa a ser o prazo para **entrar** (tocar em Responder). Quem
  entrou a tempo vê o anúncio e depois responde normalmente, mesmo que a rodada feche durante o anúncio.
- `012_todos_juntos.sql` — depois do "Vou participar", o relógio continua até o fim do tempo da rodada e todos
  começam o anúncio e a pergunta juntos. Precisa do 010 e do 011.
- `013_imagem_pergunta.sql` — imagem opcional em cada pergunta (ex.: "Quem é este cantor?"). Precisa do 012.
- `014_permissoes_arquivos.sql` — permissões para o painel enviar imagens e vídeos (corrige o erro
  "new row violates row-level security policy" ao enviar arquivos).
- `015_cadastro.sql` — cadastro do ouvinte com CPF (conferido e um por conta) e WhatsApp, e a aba **Cadastros**
  do painel. Antes de rodar, avise a equipe de testes: quem entrou com e-mail vai precisar completar o cadastro.
- `016_patrocinio.sql` — espaços de patrocínio (anúncio antes da pergunta e do resultado, banner da tela inicial e
  das telas de espera), rodízio com peso, período de veiculação, patrocinador fixo por rodada e aba **Exibições**.
- `017_modalidades_patrocinio.sql` — anunciante com até 3 banners verticais (9:16), modalidade rotativo (vezes por dia) ou fixo
  (horário), período de circulação e data da pergunta final em cada prêmio.
- `018_banners_horizontais.sql` — banners horizontais (16:9) para a tela inicial e as telas de espera; os verticais
  (9:16) ficam para os anúncios de 15 s e 30 s.

## 2. Ligar as formas de login
O ouvinte entra com **Google** ou com **e-mail e código**, e na primeira vez completa o cadastro (nome, CPF e
WhatsApp, rode antes o `015_cadastro.sql`). O botão discreto "Entrar só com o nome (teste)" continua para a equipe.

### Endereço do site
Em **Authentication → URL Configuration**:
- **Site URL**: `https://quiz.difusora.fm.br`
- **Redirect URLs**: adicione `https://quiz.difusora.fm.br/**` (e `http://localhost:5173/**` para desenvolvimento).

### Google (uma vez só)
1. Entre em **console.cloud.google.com** com o Gmail da rádio e crie um projeto (ex.: "Quiz Difusora").
2. **APIs e serviços → Tela de consentimento OAuth** (ou "Google Auth Platform → Branding"):
   - Tipo de usuário **Externo**; nome do app **Pergunta da Hora – Difusora**; e-mail de suporte da rádio; logotipo.
   - Página inicial: `https://quiz.difusora.fm.br`
   - Política de privacidade: `https://quiz.difusora.fm.br/privacidade.html` (revise e complete o texto desse
     arquivo, em `public/privacidade.html`, com o e-mail e o telefone da rádio).
   - Domínio autorizado: `difusora.fm.br`
   - Permissões (escopos): só os básicos — `email`, `profile`, `openid`.
   - Em **Público-alvo / Publishing status**, clique em **Publicar app** (sai do modo "Teste"; sem isso só
     entram os e-mails cadastrados como testadores).
3. **APIs e serviços → Credenciais → Criar credenciais → ID do cliente OAuth**:
   - Tipo: **Aplicativo da Web**.
   - Origens JavaScript autorizadas: `https://quiz.difusora.fm.br`
   - URIs de redirecionamento autorizados: `https://sxhwkkplxaotpxtgbzqe.supabase.co/auth/v1/callback`
   - Copie o **ID do cliente** e a **Chave secreta do cliente**.
4. No Supabase, **Authentication → Sign In / Providers → Google**: ligue, cole o ID do cliente e a chave secreta e salve.
   (A chave secreta fica só no Supabase; nunca coloque no código.)

O Google não deixa fazer login dentro do navegador do Facebook, Instagram ou WhatsApp. O app percebe isso e mostra
"Abrir no Chrome" (Android) ou a instrução para abrir no Safari (iPhone).

### E-mail com código
- **Email** já vem ligado em **Sign In / Providers**.
- Em **Authentication → Emails → Magic Link**, troque o texto do e-mail para mostrar o código, por exemplo:
  `<h2>Seu código de acesso ao quiz</h2><p style="font-size:28px"><b>{{ .Token }}</b></p><p>Ou toque: <a href="{{ .ConfirmationURL }}">entrar no quiz</a></p>`
  Faça o mesmo em **Confirm signup** (primeiro acesso de um e-mail novo).
- O envio padrão do Supabase só entrega para membros da equipe do projeto e poucos e-mails por hora. Para liberar
  para todos, configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (ex.: Resend, plano gratuito,
  com o domínio `difusora.fm.br`).

### Teste
- **Allow anonymous sign-ins** ligado: é o "Entrar só com o nome (teste)". Essas contas não pedem CPF e não
  aparecem em **Painel Admin → Cadastros**. Desligue quando não precisar mais.

## 3. Tornar alguém administrador
**Jeito recomendado (não depende de envio de e-mail):**
1. Em **Authentication → Users → Add user → Create new user**, informe o e-mail e uma senha da pessoa
   e marque **Auto Confirm User**.
2. No **SQL Editor**, rode trocando o e-mail:
   ```sql
   update public.perfis set admin = true, nome = 'Nome da Pessoa'
   where id = (select id from auth.users where email = 'email.do.admin@exemplo.com');
   ```
3. A pessoa abre o **Painel Admin → Entrar com e-mail**, digita e-mail **e senha** e clica em **Entrar**.

Também funciona entrar primeiro pelo link enviado por e-mail e depois rodar o mesmo `update`,
desde que o envio de e-mail esteja funcionando (veja o item 2).

## Se aparecer "Error sending magic link email"
O Supabase não conseguiu enviar o e-mail. Para ver o motivo exato: **Logs → Auth** (ou **Authentication → Logs**)
e procure a linha com erro no horário da tentativa. Causas comuns:
- o endereço não é membro da equipe do projeto (limitação do e-mail padrão);
- limite de envios por hora atingido;
- SMTP próprio configurado com usuário/senha errados.

## Como a equipe testa
1. A produção abre o **Painel Admin → Ao vivo** no computador.
2. Os testadores abrem o link no celular e entram.
3. A produção clica em **No ar** numa rodada: a pergunta aparece na hora em todos os celulares.
4. O placar ao vivo mostra quantos abriram, responderam e acertaram.
5. Problemas encontrados: botão **Relatar problema** no app → aparecem na aba **Feedback** do painel.

## Rodadas manuais e automáticas
- **Manual:** a produção clica em **No ar** e em **Encerrar rodada** (aba Ao vivo). Data e horários são só informativos.
- **Automático:** a rodada abre e fecha sozinha na data e nos horários cadastrados, com segundos (horário de Brasília).
  Use **Fica no ar por (segundos)** para a rodada ficar aberta só alguns segundos — o encerramento é calculado sozinho.
  O agendador confere a cada 1 segundo (ou a cada 15 s / 1 min, conforme a versão do Supabase; o resultado do
  `009_segundos.sql` mostra qual ficou).
- Enquanto a rodada está no ar, o ouvinte pode **tocar em Responder** (o app mostra "Toque em até X s"). Quem entrou
  a tempo vê o anúncio e depois tem o **tempo para responder** da pergunta, mesmo que a rodada já tenha fechado.
  Ex.: 10 s no ar + anúncio de 15 s + 20 s para responder. A vaga vale só pelo tempo do anúncio mais longo
  + 20 s, para ninguém esperar o locutor dar a resposta antes de abrir a pergunta.
- Numa rodada automática o botão manual continua valendo: **No ar** adianta ou reabre, **Encerrar** fecha antes.
  Se reabrir depois do horário de encerramento, quem fecha é a produção.
- Abrir uma rodada (manual ou automática) tira do ar a que estava no ar antes.
- Testou uma rodada automática com **No ar** e **Encerrar** antes do horário dela? Ela continua agendada e abre
  no horário. Se encerrar durante o horário dela, ela fica encerrada (para reabrir, mude o horário ou use **No ar**).
- **Diagnóstico do agendamento** (aba Ao vivo): mostra se o agendador do banco está rodando, a última conferência,
  erros e como o banco vê cada rodada automática. **Conferir agenda agora** abre/fecha na hora o que estiver no
  horário.
- O **Horário oficial** no topo do Painel Admin é a hora do servidor, a mesma usada pelo agendador. Se o relógio do
  computador estiver diferente, aparece um aviso ("Este computador está 2 min adiantado"). Na aba **Ao vivo** há a
  contagem para a rodada no ar fechar e para a próxima automática abrir.

## Notificações no celular
**1. Banco:** rode `supabase/migrations/007_notificacoes.sql` no SQL Editor. A última linha deve dizer
"OK: banco pronto". Se disser "ATENÇÃO", ative a extensão indicada (**pg_net** ou **pg_cron**) em
**Database → Extensions** e rode o arquivo de novo.

**2. Função de envio** (uma vez só; repita quando a função for atualizada no GitHub):
1. No Supabase, abra **Edge Functions → Deploy a new function → Via Editor**.
2. Dê o nome exato **`enviar-push`**.
3. Apague o exemplo, cole todo o conteúdo de [`supabase/functions/enviar-push/index.ts`](supabase/functions/enviar-push/index.ts)
   e clique em **Deploy**.
4. Nos detalhes da função, **desligue a verificação de JWT** ("Verify JWT" / "Enforce JWT verification").
   O banco chama a função sem login; ela se protege sozinha (só avisa rodada que está no ar, cada aviso sai
   uma vez, e mensagens do painel exigem login de admin).

Quem usa a linha de comando pode, em vez disso, rodar:
`supabase functions deploy enviar-push --no-verify-jwt --project-ref sxhwkkplxaotpxtgbzqe`

Não é preciso criar nenhuma chave: na primeira vez que alguém toca em "Quero ser avisado", a função gera as
chaves de envio e guarda no banco, num lugar que só o servidor lê.

**3. Teste:**
1. Num celular **Android**, abra o link no **Chrome** (aba normal, não anônima), entre e toque em
   **Quero ser avisado** → **Permitir**.
2. No **Painel Admin → Avisos**, "Celulares inscritos" passa a mostrar 1. Envie uma **mensagem avulsa** de teste.
3. **iPhone:** só funciona no iOS 16.4 ou mais novo, e a pessoa precisa antes tocar em **Compartilhar →
   Adicionar à Tela de Início** e abrir o quiz pelo ícone novo. O app mostra essas instruções sozinho.

**O que o admin controla (aba Avisos):**
- **Aviso "no ar"**: liga/desliga e edita o texto. Sai quando a rodada entra no ar (botão ou agendamento).
- **Lembrete**: liga/desliga, quantos minutos antes e o texto. Vale para rodadas com data e horário.
- Nos textos, `{horario}`, `{titulo}`, `{pontos}` e `{minutos}` são trocados pelos dados da rodada.
- **Mensagem avulsa**: texto livre, enviada na hora ou **agendada** para data e hora (dá para cancelar).
- **Disparo manual**: escolhe a rodada e clica em **Avisar agora** (também há o botão **Avisar** em cada rodada
  na aba Ao vivo).
- **Últimos envios**: quantos celulares receberam cada aviso. Celulares que desinstalaram ou bloquearam são
  removidos sozinhos.

## Anúncios dos patrocinadores
Em **Painel Admin → Patrocinadores**, cada anunciante tem um tipo de anúncio:
- **Simples:** logotipo (ou ícone), frase e descrição.
- **Vídeo — arquivo MP4 (recomendado):** envie o arquivo (até 20 MB). O app toca o vídeo ele mesmo, e o toque do
  ouvinte em "Vou participar" / "Confira sua resposta" libera o som em qualquer celular, inclusive iPhone. O tempo na
  tela é ajustado sozinho para a duração do vídeo. Prefira vídeos curtos em 720p: cada ouvinte baixa o vídeo, e isso
  conta no limite de transferência do plano do Supabase (5 GB/mês no plano gratuito).
- **Vídeo — link do YouTube:** cole o link do vídeo. Em alguns celulares (principalmente iPhone) o YouTube não deixa
  começar com som; aí aparece o botão "Ouvir com som". No YouTube, deixe a visibilidade como **Não listado** e marque
  **Permitir incorporação**. O vídeo começa sem som (regra dos celulares) e o ouvinte toca em "Ouvir com som".
  Escolha horizontal ou vertical (Shorts) e ajuste o **tempo na tela** para a duração do vídeo (até 120 s).
- **Montado pelo app:** logotipo em PNG, cores, título e descrição da promoção, preço (e preço antigo riscado),
  validade, até 3 fotos e contatos (WhatsApp, telefone, endereço, Instagram, site). O app monta o anúncio num dos
  4 layouts prontos: **Oferta em destaque**, **Cartão da loja**, **Promoção relâmpago** e **Vitrine**.
A prévia ao lado mostra o anúncio como o ouvinte vai ver. Nada disso usa API paga.

## Reclamações e conferência
- O ouvinte vê tudo o que respondeu em **Meu histórico** (tela inicial do app), com data, hora e **protocolo**.
- A produção consulta todos em **Painel Admin → Histórico**: busca por nome, e-mail, protocolo ou rodada,
  filtro por período e **Exportar planilha** (abre no Excel).
- O registro guarda a pergunta e o gabarito **como estavam no momento** e não é apagado ao zerar o ranking,
  reabrir ou excluir uma rodada. Os horários são os do servidor (não dá para alterar pelo celular).

Dica: ligue o **Modo apresentação** no painel para os anúncios durarem 5 s em vez de 15 s e 30 s.

## Segurança
- A chave `sb_publishable_...` que está em `src/config.js` é pública por natureza (vai no navegador).
- **Nunca** coloque no código nem compartilhe a chave **secret** / `service_role`.
- Quem protege os dados são as regras do banco (Row Level Security): o ouvinte não vê o gabarito,
  não consegue alterar pontos e só lê as próprias respostas. A resposta é conferida e o tempo é medido no servidor.
