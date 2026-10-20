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
