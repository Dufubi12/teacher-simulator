# Подключение Google Таблиц — пошаговая инструкция

## Шаг 1. Создай проект в Google Cloud

1. Открой [Google Cloud Console](https://console.cloud.google.com)
2. Войди в свой Google-аккаунт
3. Вверху нажми **Select a project** → **New Project**
4. Введи название: `teacher-simulator` (или любое другое)
5. Нажми **Create**
6. Убедись, что новый проект выбран в верхней панели

---

## Шаг 2. Включи Google Sheets API

1. В левом меню нажми **APIs & Services** → **Library**
2. В поиске набери **Google Sheets API**
3. Кликни на него → нажми **Enable**
4. Вернись в Library, найди **Google Drive API**
5. Кликни на него → нажми **Enable**

> Нужны оба API: Sheets — для чтения/записи ячеек, Drive — для доступа к файлу таблицы.

---

## Шаг 3. Создай сервисный аккаунт (Service Account)

1. В левом меню: **APIs & Services** → **Credentials**
2. Нажми **+ Create Credentials** → **Service Account**
3. Заполни форму:
   - **Service account name**: `sheets-bot`
   - **Service account ID**: заполнится автоматически
4. Нажми **Create and Continue**
5. В разделе **Grant this service account access** — пропусти, нажми **Continue**
6. В разделе **Grant users access** — пропусти, нажми **Done**

---

## Шаг 4. Скачай файл с ключами (credentials.json)

1. В списке **Service Accounts** кликни на только что созданный аккаунт (`sheets-bot@...`)
2. Перейди на вкладку **Keys**
3. Нажми **Add Key** → **Create new key**
4. Выбери формат **JSON**
5. Нажми **Create**
6. Файл `credentials.json` скачается автоматически
7. **Перемести его в папку проекта** `teacher-simulator/`

> ВАЖНО: Этот файл — секретный! Никогда не публикуй его и не коммить в git.

---

## Шаг 5. Добавь credentials.json в .gitignore

Открой файл `.gitignore` в проекте и добавь строку:

```
credentials.json
```

Если файла `.gitignore` нет — создай его.

---

## Шаг 6. Скопируй email сервисного аккаунта

1. Открой скачанный файл `credentials.json`
2. Найди поле `"client_email"` — это будет что-то вроде:

```
sheets-bot@teacher-simulator-12345.iam.gserviceaccount.com
```

3. **Скопируй этот email** — он понадобится на следующем шаге

---

## Шаг 7. Расшарь таблицу на сервисный аккаунт

1. Открой Google Таблицу, с которой нужно работать
2. Нажми кнопку **"Поделиться"** (справа вверху)
3. В поле "Добавить людей" вставь скопированный `client_email`
4. Установи роль: **Редактор**
5. Сними галку **"Уведомить людей"**
6. Нажми **"Поделиться"**

---

## Шаг 8. Скопируй ID таблицы

Из URL таблицы скопируй ID — это длинная строка между `/d/` и `/edit`:

```
https://docs.google.com/spreadsheets/d/1aBcDeFgHiJkLmNoPqRsTuVwXyZ/edit
                                       ^^^^^^^^^^^^^^^^^^^^^^^^^^^^^^
                                       ЭТО ID ТАБЛИЦЫ
```

---

## Шаг 9. Установи библиотеку

В терминале, в папке проекта, выполни:

```bash
npm install googleapis
```

---

## Шаг 10. Используй в коде

Пример файла `google-sheets.js`:

```javascript
const { google } = require('googleapis');
const path = require('path');

// ID твоей таблицы (из шага 8)
const SPREADSHEET_ID = 'ВСТАВЬ_ID_ТАБЛИЦЫ_СЮДА';

// Путь к файлу credentials.json
const CREDENTIALS_PATH = path.join(__dirname, 'credentials.json');

async function getAuthClient() {
  const auth = new google.auth.GoogleAuth({
    keyFile: CREDENTIALS_PATH,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  return auth;
}

// Чтение данных из таблицы
async function readSheet(range) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const response = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: range, // например: 'Sheet1!A1:D10'
  });

  return response.data.values;
}

// Запись данных в таблицу
async function writeSheet(range, values) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: values },
  });
}

// Обновление конкретных ячеек
async function updateSheet(range, values) {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: range,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: values },
  });
}

module.exports = { readSheet, writeSheet, updateSheet };
```

---

## Шаг 11. Проверь подключение

Создай тестовый скрипт `test-sheets.js`:

```javascript
const { readSheet, writeSheet } = require('./google-sheets');

async function test() {
  try {
    // Запись тестовой строки
    await writeSheet('Sheet1!A1', [['Тест', 'подключения', 'успешен!']]);
    console.log('Запись прошла успешно!');

    // Чтение данных
    const data = await readSheet('Sheet1!A1:C1');
    console.log('Прочитанные данные:', data);
  } catch (error) {
    console.error('Ошибка:', error.message);
  }
}

test();
```

Запусти:

```bash
node test-sheets.js
```

Если видишь `Запись прошла успешно!` — всё работает.

---

## Возможные ошибки

| Ошибка | Причина | Решение |
|--------|---------|---------|
| `PERMISSION_DENIED` | Таблица не расшарена | Повтори шаг 7 |
| `NOT_FOUND` | Неверный ID таблицы | Проверь шаг 8 |
| `UNAUTHENTICATED` | Неверный credentials.json | Проверь путь к файлу и пересоздай ключ (шаг 4) |
| `API not enabled` | API не включен | Повтори шаг 2 |
| `Module not found: googleapis` | Библиотека не установлена | Выполни `npm install googleapis` |

---

## Итого: что у тебя должно быть

- [x] Проект в Google Cloud Console
- [x] Включены Google Sheets API + Google Drive API
- [x] Сервисный аккаунт создан
- [x] Файл `credentials.json` скачан и лежит в папке проекта
- [x] `credentials.json` добавлен в `.gitignore`
- [x] Таблица расшарена на email сервисного аккаунта
- [x] Библиотека `googleapis` установлена
- [x] Код работает, данные читаются/пишутся
