# 🚀 Vercel Deployment Guide

## Подготовка завершена! ✅

Проект готов к деплою на Vercel:

**Созданные файлы:**
- ✅ `vercel.json` - конфигурация Vercel
- ✅ `package.json` - зависимости (OpenAI SDK)
- ✅ `api/analyze-message.js` - serverless function
- ✅ `api/generate-hint.js` - serverless function
- ✅ `api/session-analysis.js` - serverless function
- ✅ `ai-client.js` (обновлен) - автоопределение URL

---

## Шаги для деплоя

### 1. Установите Vercel CLI (если еще нет)

```bash
npm install -g vercel
```

### 2. Войдите в Vercel

```bash
vercel login
```

Выберите метод входа (GitHub, GitLab, Bitbucket, Email)

### 3. Деплой!

```bash
cd "c:\Users\777\Desktop\Идея для бизнеса\startup-ideas\teacher-simulator\concept-site"
vercel
```

Vercel спросит:
- **Set up and deploy?** → Yes
- **Which scope?** → Ваш аккаунт
- **Link to existing project?** → No (первый раз) / Yes (если уже деплоили)
- **Project name?** → `virtual-pedagogue` (или любое имя)
- **Directory?** → `.` (текущая)
- **Override settings?** → No

### 4. Настройте Environment Variable (OpenAI API ключ)

**Способ 1: Через CLI (быстрее)**
```bash
vercel env add OPENAI_API_KEY
```
Вставьте ваш API ключ (начинается с `sk-proj-...`)

Выберите:
- **Environment:** Production, Preview, Development (выберите все 3)

**Способ 2: Через Dashboard**
1. Откройте: https://vercel.com/
2. Перейдите в Settings → Environment Variables
3. Добавьте:
   - **Name:** `OPENAI_API_KEY`
   - **Value:** (ваш ключ)
   - **Environments:** Production ✓ Preview ✓ Development ✓

### 5. Редеплой (чтобы применить env variable)

```bash
vercel --prod
```

---

## После деплоя

Vercel выдаст вам URL, например:
```
https://virtual-pedagogue.vercel.app
```

### Что будет работать:

✅ **Главная страница:** `https://your-project.vercel.app/index.html`
✅ **Сценарии:** `https://your-project.vercel.app/scenarios.html`
✅ **Симулятор:** `https://your-project.vercel.app/simulator_v4_avatar.html`
✅ **AI тест:** `https://your-project.vercel.app/ai-test.html`
✅ **Auth:** `https://your-project.vercel.app/auth.html`
✅ **Profile:** `https://your-project.vercel.app/profile.html`

✅ **AI API:**
- `https://your-project.vercel.app/api/analyze-message`
- `https://your-project.vercel.app/api/generate-hint`
- `https://your-project.vercel.app/api/session-analysis`

---

## Тестирование после деплоя

### 1. Проверьте AI Backend

Откройте: `https://your-project.vercel.app/ai-test.html`

Должно показать: ✅ **"Running on production, skipping health check"** в консоли

### 2. Протестируйте анализ сообщения

1. Введите текст учителя
2. Нажмите "Анализировать"
3. Должны получить ответ от AI ✅

### 3. Проверьте Firebase (если настроили)

Откройте: `https://your-project.vercel.app/auth.html`

1. Зарегистрируйтесь
2. Перейдите в профиль
3. Все должно работать ✅

---

## Troubleshooting

### ❌ Ошибка: "Missing API key"
**Решение:**
1. Проверьте что добавили `OPENAI_API_KEY` в Environment Variables
2. Редеплойте: `vercel --prod`

### ❌ Ошибка: "Module not found: openai"
**Решение:**
1. Проверьте что `package.json` есть в корне
2. Удалите `.vercel` папку и деплойте заново

### ❌ AI test показывает ошибки
**Решение:**
1. Откройте консоль браузера (F12)
2. Посмотрите детали ошибки
3. Проверьте что API ключ правильный

---

## Преимущества Vercel деплоя

✅ **Бесплатный SSL** - `https://` из коробки
✅ **CDN** - быстрая загрузка по всему миру
✅ **Serverless Functions** - AI backend работает автоматически
✅ **Auto-deploy** - при пуше в Git автоматически деплоится
✅ **Preview URLs** - для каждой ветки свой URL

---

## Локальная разработка

Если хотите тестировать локально:

```bash
vercel dev
```

Это запустит локальный сервер на `http://localhost:3000` с serverless functions!

---

**Готово к деплою!** 🚀

Просто выполните:
```bash
vercel
```

И через минуту всё будет онлайн!
