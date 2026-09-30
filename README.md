# Sistema de cadastro — Render + Neon

O app usa PostgreSQL no Neon. Ele cria a tabela `usuarios` na primeira inicialização. A página continua sendo servida pelos mesmos arquivos `public/index.html` e `public/style.css`.

## Variáveis necessárias

- `DATABASE_URL`: connection string pooled do Neon, que contém `-pooler` no host e `sslmode=require`.
- `ADMIN_USER`: usuário que protege `/registros` e `/baixar-relatorio`.
- `ADMIN_PASSWORD`: senha longa e exclusiva para essas rotas.
- `NODE_ENV=production` no Render.

O SQLite antigo não é usado nem enviado ao deploy. Configure uma base Neon vazia; a tabela será criada ao iniciar o serviço.

## Publicar

1. Crie um repositório **privado e vazio** no GitHub.
2. No terminal, dentro desta pasta, inicialize e envie o projeto. Troque `SEU_USUARIO` pelo seu usuário do GitHub:

   ```bash
   git init
   git add .
   git commit -m "Deploy cadastro no Render e Neon"
   git branch -M main
   git remote add origin https://github.com/SEU_USUARIO/sistema-cadastro.git
   git push -u origin main
   ```

3. No Neon, crie um projeto e use **Connect** para copiar a connection string **pooled**. Ela deve usar o host com `-pooler` e incluir `sslmode=require`.
4. No Render, escolha **New > Blueprint**, conecte o repositório e aplique o `render.yaml`.
5. No serviço do Render, em **Environment**, preencha `DATABASE_URL`, `ADMIN_USER` e `ADMIN_PASSWORD` com os valores do Neon e uma credencial sua. Salve e faça o deploy.
6. Abra a URL `*.onrender.com` que aparece no serviço. A página de cadastro fica em `/`; os registros e o relatório pedem usuário e senha do administrador.

O `render.yaml` configura `npm install --omit=dev`, `npm start` e o health check `/health`. O Render fornece a porta em `PORT`.
