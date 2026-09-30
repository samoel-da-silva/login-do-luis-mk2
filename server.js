const express = require('express');
const path = require('path');
const { Pool } = require('pg');

const app = express();
const PORT = Number(process.env.PORT) || 3000;
const DATABASE_URL = process.env.DATABASE_URL;

if (!DATABASE_URL) {
    console.error('DATABASE_URL não está configurada.');
    process.exit(1);
}

if (!process.env.ADMIN_USER || !process.env.ADMIN_PASSWORD) {
    console.error('Configure ADMIN_USER e ADMIN_PASSWORD antes de iniciar.');
    process.exit(1);
}

const pool = new Pool({
    connectionString: DATABASE_URL,
    max: 5,
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
});

app.use(express.urlencoded({ extended: true }));
app.use(express.static(path.join(__dirname, 'public')));

function escapeHtml(value) {
    return String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#39;',
    })[character]);
}

function adminOnly(req, res, next) {
    const header = req.headers.authorization || '';
    const [scheme, encoded] = header.split(' ');

    if (scheme === 'Basic' && encoded) {
        const decoded = Buffer.from(encoded, 'base64').toString('utf8');
        const separator = decoded.indexOf(':');
        const user = separator >= 0 ? decoded.slice(0, separator) : '';
        const password = separator >= 0 ? decoded.slice(separator + 1) : '';

        if (user === process.env.ADMIN_USER && password === process.env.ADMIN_PASSWORD) {
            return next();
        }
    }

    res.set('WWW-Authenticate', 'Basic realm="Registros de cadastro", charset="UTF-8"');
    return res.status(401).send('Acesso restrito. Informe as credenciais de administrador.');
}

function formatDate(value) {
    return new Intl.DateTimeFormat('pt-BR', {
        dateStyle: 'short',
        timeStyle: 'short',
        timeZone: 'America/Sao_Paulo',
    }).format(new Date(value));
}

app.get('/health', async (req, res) => {
    try {
        await pool.query('SELECT 1');
        res.status(200).json({ status: 'ok' });
    } catch (error) {
        console.error('Health check falhou:', error.message);
        res.status(503).json({ status: 'unavailable' });
    }
});

app.post('/cadastrar', async (req, res) => {
    const { nome, cpf, telefone, descAutoridade, observacao } = req.body;
    let vinculos = req.body.vinculo;

    if (!nome?.trim() || !cpf?.trim() || !telefone?.trim()) {
        return res.status(400).send('Preencha nome, CPF ou RG e telefone.');
    }

    if (!vinculos) vinculos = [];
    else if (!Array.isArray(vinculos)) vinculos = [vinculos];

    if (vinculos.includes('Autoridade') && !descAutoridade?.trim()) {
        return res.status(400).send('O campo “Qual autoridade?” é obrigatório.');
    }

    try {
        await pool.query(
            `INSERT INTO usuarios (nome, cpf, telefone, vinculos, desc_autoridade, observacao)
             VALUES ($1, $2, $3, $4, $5, $6)`,
            [nome.trim(), cpf.trim(), telefone.trim(), vinculos.join(', '), descAutoridade?.trim() || null, observacao?.trim() || null],
        );

        return res.send(`
            <!doctype html><html lang="pt-BR"><meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1">
            <title>Cadastro realizado</title>
            <body style="font-family:Arial,sans-serif;text-align:center;margin:50px;color:#102a56">
                <h2>Cadastro realizado com sucesso!</h2>
                <a href="/">Fazer novo cadastro</a>
            </body></html>
        `);
    } catch (error) {
        console.error('Erro ao salvar cadastro:', error.message);
        return res.status(500).send('Erro ao salvar no banco de dados. Tente novamente.');
    }
});

app.get('/registros', adminOnly, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY data_cadastro DESC');
        const body = rows.map((row) => `
            <tr>
                <td>${escapeHtml(row.id)}</td>
                <td>${escapeHtml(row.nome)}</td>
                <td>${escapeHtml(row.cpf)}</td>
                <td>${escapeHtml(row.telefone)}</td>
                <td>${escapeHtml(row.vinculos || '-')}</td>
                <td>${escapeHtml(row.desc_autoridade || '-')}</td>
                <td>${escapeHtml(row.observacao || '-')}</td>
                <td>${escapeHtml(formatDate(row.data_cadastro))}</td>
            </tr>`).join('');

        return res.send(`
            <!doctype html>
            <html lang="pt-BR">
            <head>
                <meta charset="UTF-8">
                <meta name="viewport" content="width=device-width, initial-scale=1.0">
                <title>Registros de Entrada</title>
                <style>
                    body{font-family:Arial,sans-serif;background:#f2f6fb;color:#19283d;padding:20px}
                    .header{display:flex;justify-content:space-between;align-items:center;gap:12px;flex-wrap:wrap}
                    table{width:100%;border-collapse:collapse;margin-top:20px;background:white}
                    th,td{padding:12px;border:1px solid #d6e0eb;text-align:left}
                    th{background:#1769aa;color:white} tr:nth-child(even){background:#f3f7fc}
                    a{display:inline-block;padding:10px 14px;margin:4px;background:#1769aa;color:white;text-decoration:none;border-radius:6px}
                    a.download{background:#c83d4b}
                </style>
            </head>
            <body>
                <div class="header"><h2>Registros de Entrada</h2><div>
                    <a class="download" href="/baixar-relatorio">Baixar relatório (TXT)</a>
                    <a href="/">Novo cadastro</a>
                </div></div>
                <table><thead><tr>
                    <th>ID</th><th>Nome</th><th>CPF/RG</th><th>Telefone</th><th>Vínculo</th>
                    <th>Autoridade</th><th>Observação</th><th>Data e hora</th>
                </tr></thead><tbody>${body}</tbody></table>
            </body></html>
        `);
    } catch (error) {
        console.error('Erro ao consultar registros:', error.message);
        return res.status(500).send('Erro ao consultar os registros.');
    }
});

app.get('/baixar-relatorio', adminOnly, async (req, res) => {
    try {
        const { rows } = await pool.query('SELECT * FROM usuarios ORDER BY data_cadastro DESC');
        const linhas = rows.map((row) => [
            row.id, row.nome, row.cpf, row.telefone, row.vinculos || '',
            row.desc_autoridade || '', row.observacao || '', formatDate(row.data_cadastro),
        ].map((value) => String(value).replace(/[;\r\n]/g, ' ')).join(';'));

        res.setHeader('Content-Disposition', 'attachment; filename="relatorio_portaria.txt"');
        res.type('text/plain; charset=utf-8');
        return res.send(['ID;NOME;CPF/RG;TELEFONE;VINCULO;QUAL_AUTORIDADE;OBSERVACAO;DATA_HORA', ...linhas].join('\n'));
    } catch (error) {
        console.error('Erro ao gerar relatório:', error.message);
        return res.status(500).send('Erro ao gerar o relatório.');
    }
});

async function start() {
    await pool.query(`
        CREATE TABLE IF NOT EXISTS usuarios (
            id BIGINT GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
            nome TEXT NOT NULL,
            cpf TEXT NOT NULL,
            telefone TEXT NOT NULL,
            vinculos TEXT,
            desc_autoridade TEXT,
            observacao TEXT,
            data_cadastro TIMESTAMPTZ NOT NULL DEFAULT NOW()
        )
    `);

    app.listen(PORT, '0.0.0.0', () => {
        console.log(`Servidor iniciado na porta ${PORT}.`);
    });
}

start().catch((error) => {
    console.error('Não foi possível iniciar o sistema:', error.message);
    process.exit(1);
});

process.on('SIGTERM', async () => {
    await pool.end();
    process.exit(0);
});
