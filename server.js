const fs = require('fs');
const fsp = require('fs/promises');
const path = require('path');
const express = require('express');
const nodemailer = require('nodemailer');

loadEnvFile();

const HOST = process.env.HOST || '0.0.0.0';
const PORT = Number(process.env.PORT || 3000);
const ROOT_DIR = __dirname;
const DATA_DIR = path.join(ROOT_DIR, 'data');
const SUBMISSIONS_FILE = path.join(DATA_DIR, 'contact-submissions.ndjson');
const CONTACT_TO = process.env.CONTACT_TO || 'contacto@yixsolutions.com';
const CONTACT_FROM = process.env.CONTACT_FROM || 'YixSolutions <contacto@yixsolutions.com>';
const MIN_SUBMISSION_TIME_MS = 3_000;
const RATE_LIMIT_WINDOW_MS = 10 * 60 * 1000;
const RATE_LIMIT_MAX_ATTEMPTS = 5;
const rateLimitStore = new Map();

const smtpConfigured = Boolean(
    process.env.SMTP_HOST &&
    process.env.SMTP_PORT &&
    process.env.SMTP_USER &&
    process.env.SMTP_PASS
);

const mailTransport = smtpConfigured
    ? nodemailer.createTransport({
        host: process.env.SMTP_HOST,
        port: Number(process.env.SMTP_PORT),
        secure: String(process.env.SMTP_SECURE || 'false').toLowerCase() === 'true',
        auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS
        }
    })
    : null;

function loadEnvFile() {
    const envPath = path.join(__dirname, '.env');

    if (!fs.existsSync(envPath)) {
        return;
    }

    const lines = fs.readFileSync(envPath, 'utf8').split(/\r?\n/);

    for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) {
            continue;
        }

        const separatorIndex = trimmed.indexOf('=');
        if (separatorIndex === -1) {
            continue;
        }

        const key = trimmed.slice(0, separatorIndex).trim();
        const rawValue = trimmed.slice(separatorIndex + 1).trim();
        const normalizedValue = rawValue.replace(/^['"]|['"]$/g, '');

        if (!process.env[key]) {
            process.env[key] = normalizedValue;
        }
    }
}

function isRateLimited(identifier) {
    const now = Date.now();
    const entries = rateLimitStore.get(identifier) || [];
    const recentEntries = entries.filter((timestamp) => now - timestamp < RATE_LIMIT_WINDOW_MS);

    if (recentEntries.length >= RATE_LIMIT_MAX_ATTEMPTS) {
        rateLimitStore.set(identifier, recentEntries);
        return true;
    }

    recentEntries.push(now);
    rateLimitStore.set(identifier, recentEntries);
    return false;
}

async function forwardSubmissionByEmail(submission) {
    if (!mailTransport) {
        return false;
    }

    const mailText = [
        'Nuevo mensaje desde el formulario de YixSolutions',
        '',
        `Nombre: ${submission.name}`,
        `Email: ${submission.email}`,
        `Teléfono: ${submission.phone || 'No indicado'}`,
        '',
        'Mensaje:',
        submission.message,
        '',
        `Fecha: ${submission.createdAt}`,
        `IP: ${submission.ip || 'No disponible'}`,
        `User-Agent: ${submission.userAgent || 'No disponible'}`
    ].join('\n');

    await mailTransport.sendMail({
        from: CONTACT_FROM,
        to: CONTACT_TO,
        replyTo: submission.email,
        subject: `Nuevo contacto web: ${submission.name}`,
        text: mailText
    });

    return true;
}

async function handleContactRequest(request, response) {
    try {
        const payload = request.body || {};
        const submission = {
            name: String(payload.name || '').trim(),
            email: String(payload.email || '').trim(),
            phone: String(payload.phone || '').trim(),
            message: String(payload.message || '').trim(),
            company: String(payload.company || '').trim(),
            formStartedAt: Number(payload.formStartedAt || 0)
        };

        if (submission.company) {
            return response.status(400).json({
                ok: false,
                message: 'No se pudo validar el envío.'
            });
        }

        if (!submission.formStartedAt || Date.now() - submission.formStartedAt < MIN_SUBMISSION_TIME_MS) {
            return response.status(400).json({
                ok: false,
                message: 'Espera un momento antes de enviar el formulario.'
            });
        }

        if (!submission.name || !submission.email || !submission.message) {
            return response.status(400).json({
                ok: false,
                message: 'Nombre, correo y mensaje son obligatorios.'
            });
        }

        const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        if (!emailPattern.test(submission.email)) {
            return response.status(400).json({
                ok: false,
                message: 'Introduce un correo válido.'
            });
        }

        const clientIp = request.ip || request.socket.remoteAddress || 'unknown';
        if (isRateLimited(clientIp) || isRateLimited(submission.email.toLowerCase())) {
            return response.status(429).json({
                ok: false,
                message: 'Has enviado demasiadas solicitudes. Inténtalo de nuevo más tarde.'
            });
        }

        await fsp.mkdir(DATA_DIR, { recursive: true });

        const record = {
            name: submission.name,
            email: submission.email,
            phone: submission.phone,
            message: submission.message,
            createdAt: new Date().toISOString(),
            ip: clientIp,
            userAgent: request.get('user-agent') || null
        };

        await fsp.appendFile(SUBMISSIONS_FILE, `${JSON.stringify(record)}\n`, 'utf8');

        let emailForwarded = false;
        try {
            emailForwarded = await forwardSubmissionByEmail(record);
        } catch (error) {
            console.error('Email forwarding error:', error);
        }

        return response.status(200).json({
            ok: true,
            message: emailForwarded
                ? 'Hemos recibido tu mensaje y te responderemos pronto.'
                : 'Hemos recibido tu mensaje. Te responderemos pronto.'
        });
    } catch (error) {
        console.error('Contact form error:', error);
        return response.status(500).json({
            ok: false,
            message: 'Ha ocurrido un error al enviar el formulario.'
        });
    }
}

function createApp() {
    const app = express();

    app.use(express.json({ limit: '1mb' }));

    app.post('/api/contact', handleContactRequest);

    app.use((error, request, response, next) => {
        if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
            return response.status(400).json({
                ok: false,
                message: 'No se pudo procesar la solicitud.'
            });
        }

        return next(error);
    });

    app.use(express.static(ROOT_DIR));

    app.use((request, response) => {
        response.status(404).type('text/plain; charset=utf-8').send('Not found');
    });

    return app;
}

function startServer() {
    const app = createApp();

    const server = app.listen(PORT, HOST, () => {
        const address = server.address();
        const actualPort = address && typeof address === 'object' ? address.port : PORT;

        console.log(`YixSolutions available at http://localhost:${actualPort}`);
        if (!mailTransport) {
            console.log('SMTP no configurado: las solicitudes se guardan localmente, pero no se reenvían por email.');
        }
    });

    return server;
}

module.exports = {
    createApp,
    startServer
};

if (require.main === module) {
    startServer();
}