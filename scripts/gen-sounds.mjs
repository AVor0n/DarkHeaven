// Генерация звуков и музыки через kie.ai (docs/spec/05-assets.md §5).
// Запуск: KIE_API_KEY=... node scripts/gen-sounds.mjs [имя ...]
// Сырые файлы складываются в assets-raw/audio/, обработка — scripts/process-assets.py.
import { existsSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { createTask, credits, download, waitTask } from './kie.mjs';

const spec = JSON.parse(await readFile(new URL('./prompts/sounds.json', import.meta.url), 'utf8'));
const only = process.argv.slice(2);
const force = process.env.FORCE === '1';

console.log('Кредитов до:', await credits());
const jobs = Object.entries(spec.items).filter(([name]) => !only.length || only.includes(name));
await Promise.all(
  jobs.map(async ([name, item], i) => {
    const first = `assets-raw/audio/${name}-1.mp3`;
    if (existsSync(first) && !force) return console.log(`${name}: уже есть`);
    await new Promise((r) => setTimeout(r, i * 700));
    const taskId =
      item.kind === 'music'
        ? await createTask('ai-music-api/generate', {
            custom_mode: false,
            instrumental: true,
            model: spec.model,
            prompt: item.prompt,
          })
        : await createTask('ai-music-api/sounds', {
            prompt: item.prompt,
            model: spec.model,
            sound_loop: item.loop ?? false,
            sound_key: 'Any',
            grab_lyrics: false,
          });
    const urls = await waitTask(taskId);
    for (let k = 0; k < urls.length; k++)
      await download(urls[k], `assets-raw/audio/${name}-${k + 1}.mp3`);
    console.log(`${name}: ${urls.length} вариант(а)`);
  }),
);
console.log('Кредитов после:', await credits());
