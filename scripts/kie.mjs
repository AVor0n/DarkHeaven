// Минимальный клиент kie.ai: создать задачу, дождаться результата, скачать файлы.
// Ключ берётся только из переменной окружения KIE_API_KEY и никуда не пишется.
import { mkdir, writeFile } from 'node:fs/promises';
import { dirname } from 'node:path';

const BASE = 'https://api.kie.ai';

function key() {
  const k = process.env.KIE_API_KEY;
  if (!k) throw new Error('Нужна переменная окружения KIE_API_KEY');
  return k;
}

async function call(path, init = {}) {
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${key()}`,
      'Content-Type': 'application/json',
      ...(init.headers ?? {}),
    },
  });
  const body = await res.json();
  if (body.code !== 200) throw new Error(`${path}: ${body.code} ${body.msg}`);
  return body.data;
}

export async function credits() {
  return call('/api/v1/chat/credit');
}

export async function createTask(model, input) {
  const data = await call('/api/v1/jobs/createTask', {
    method: 'POST',
    body: JSON.stringify({ model, input }),
  });
  return data.taskId;
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

/** Ждёт завершения задачи и возвращает ссылки на результаты. */
export async function waitTask(taskId, { timeoutMs = 10 * 60_000 } = {}) {
  const start = Date.now();
  for (;;) {
    const d = await call(`/api/v1/jobs/recordInfo?taskId=${encodeURIComponent(taskId)}`);
    const state = d.state ?? d.status;
    if (state === 'success' || state === 'SUCCESS') return resultUrls(d);
    if (state === 'fail' || state === 'FAILED' || state === 'failed') {
      throw new Error(
        `Задача ${taskId} не удалась: ${d.failMsg ?? d.errorMessage ?? JSON.stringify(d)}`,
      );
    }
    if (Date.now() - start > timeoutMs) throw new Error(`Задача ${taskId}: таймаут`);
    await sleep(5000);
  }
}

function resultUrls(d) {
  const urls = [];
  if (d.resultJson) {
    const r = typeof d.resultJson === 'string' ? JSON.parse(d.resultJson) : d.resultJson;
    urls.push(...(r.resultUrls ?? []));
    for (const c of r.data ?? []) if (c.audio_url) urls.push(c.audio_url);
  }
  for (const c of d.response?.data ?? []) if (c.audio_url) urls.push(c.audio_url);
  if (!urls.length) throw new Error(`Нет ссылок в ответе: ${JSON.stringify(d).slice(0, 500)}`);
  return [...new Set(urls)];
}

export async function download(url, path) {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Скачивание ${url}: ${res.status}`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, Buffer.from(await res.arrayBuffer()));
}
