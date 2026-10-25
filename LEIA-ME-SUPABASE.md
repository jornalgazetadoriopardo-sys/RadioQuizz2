# Configurar o Supabase (uma vez só)

Projeto: `sxhwkkplxaotpxtgbzqe` — painel em https://supabase.com/dashboard/project/sxhwkkplxaotpxtgbzqe

## 1. Criar o banco de dados
1. No menu lateral, abra **SQL Editor** → **New query**.
2. Cole todo o conteúdo de [`supabase/migrations/001_esquema.sql`](supabase/migrations/001_esquema.sql) e clique em **Run**.
   Deve aparecer "Success. No rows returned".
3. Abra outra **New query**, cole [`supabase/migrations/002_dados_exemplo.sql`](supabase/migrations/002_dados_exemplo.sql) e clique em **Run**
   (cria 6 rodadas, 4 patrocinadores e 3 prêmios de exemplo — tudo editável depois pelo Painel Admin).

### Atualizações do banco
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

## 2. Ligar as formas de login
Em **Authentication → Sign In / Providers**:
- **Allow anonymous sign-ins**: ligue. É o botão "Entrar só com o nome (teste)" — o jeito mais rápido para a equipe testar.
- **Email**: já vem ligado. Atenção: o envio de e-mail padrão do Supabase só entrega para membros da equipe
  do projeto no Supabase e tem limite de poucos e-mails por hora. Para liberar o login por e-mail para qualquer pessoa,
  configure um SMTP próprio em **Authentication → Emails → SMTP Settings** (ex.: Resend, que tem plano gratuito).
- (Opcional) Para o login também aceitar um **código de 6 dígitos**, em **Authentication → Emails → Magic Link**
  acrescente `{{ .Token }}` no texto do e-mail.

Em **Authentication → URL Configuration**:
- **Site URL**: o endereço do Netlify (ex.: `https://quiz-difusora.netlify.app`).
- **Redirect URLs**: adicione o mesmo endereço e também `http://localhost:5173` (para desenvolvimento).

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
- Enquanto a rodada está no ar, o ouvinte pode **abrir** a pergunta; quem abriu a tempo ainda tem o **tempo para
  responder** da pergunta para enviar a resposta. O app mostra ao ouvinte "Fecha em X s".
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
- **Vídeo do YouTube:** cole o link do vídeo. No YouTube, deixe a visibilidade como **Não listado** e marque
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
