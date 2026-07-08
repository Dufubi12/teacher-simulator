// Простой in-memory rate-limit по IP для serverless-функций.
// Оговорка: Vercel может держать несколько инстансов, поэтому лимит приблизительный —
// он отсекает залётный/ботовый трафик на публичной демо-ссылке, но не является строгой квотой.

const WINDOW_MS = 60_000;   // окно 1 минута
const MAX_HITS = 30;        // не больше 30 запросов с одного IP в минуту

const hits = new Map(); // ip -> { count, resetAt }

function clientIp(req) {
    const xff = req.headers['x-forwarded-for'];
    if (typeof xff === 'string' && xff.length) return xff.split(',')[0].trim();
    return req.socket?.remoteAddress || 'unknown';
}

// Возвращает true, если запрос НАДО заблокировать (лимит превышен).
export function rateLimited(req, res) {
    const ip = clientIp(req);
    const now = Date.now();
    const rec = hits.get(ip);

    if (!rec || now > rec.resetAt) {
        hits.set(ip, { count: 1, resetAt: now + WINDOW_MS });
        // редкая чистка старых записей, чтобы Map не рос бесконечно
        if (hits.size > 5000) {
            for (const [k, v] of hits) if (now > v.resetAt) hits.delete(k);
        }
        return false;
    }

    rec.count++;
    if (rec.count > MAX_HITS) {
        const retry = Math.ceil((rec.resetAt - now) / 1000);
        res.setHeader('Retry-After', String(retry));
        res.status(429).json({
            error: 'Too many requests',
            message: `Слишком много запросов. Попробуйте через ${retry} сек.`
        });
        return true;
    }
    return false;
}
