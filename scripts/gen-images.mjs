// Генерация иллюстраций через kie.ai (docs/spec/05-assets.md §4).
// Запуск: KIE_API_KEY=... node scripts/gen-images.mjs [имя ...]
// Сырые картинки складываются в assets-raw/images/, обработка — scripts/process-assets.py.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createTask, credits, download, waitTask } from './kie.mjs';

const spec = JSON.parse(await readFile(new URL('./prompts/images.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const force = process.env.FORCE === '1';

console.log('Кредитов до:', await credits());
const jobs = Object.entries(spec.items).filter(([name]) => !only.length || only.includes(name));
await Promise.all(
  jobs.map(async ([name, item], i) => {
    const out = `assets-raw/images/${name}.png`;
    if (existsSync(out) && !force) return console.log(`${name}: уже есть`);
    await new Promise((r) => setTimeout(r, i * 600));
    const prompt = `${item.prompt}. ${spec.style}`;
    const taskId = await createTask(spec.model, {
      prompt,
      image_input: [],
      aspect_ratio: item.aspect ?? '1:1',
      resolution: '1K',
      output_format: 'png',
    });
    const [url] = await waitTask(taskId);
    await download(url, out);
    console.log(`${name}: готово`);
  }),
);
console.log('Кредитов после:', await credits());
