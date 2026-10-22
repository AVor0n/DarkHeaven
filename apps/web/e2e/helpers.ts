import { expect, type Page } from '@playwright/test';

/** Собирает ошибки страницы и консоли; в конце теста их должно быть ноль. */
export function watchErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(String(e)));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(m.text());
  });
  return errors;
}

/** Открыть игру с чистым хранилищем: без звука и анимаций, камера неподвижна. */
export async function openFresh(page: Page): Promise<void> {
  await page.goto('./');
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'darkheaven.settings.v1',
      JSON.stringify({ muted: true, anim: 'off', followCamera: false, autoPlace: false }),
    );
  });
  await page.reload();
  await expect(page.getByRole('button', { name: 'Новая партия' })).toBeVisible();
}

export function fieldset(page: Page, legend: string) {
  return page.locator('fieldset', { has: page.locator('legend', { hasText: legend }) });
}

/**
 * Сделать один шаг партии детерминированно: первая подсвеченная клетка
 * (затем «Готово», если выбор нужно подтвердить) или первая кнопка решения.
 */
export async function step(page: Page): Promise<string> {
  const prompt = await page.evaluate(() => {
    const text = document.querySelector('.actionbar__prompt')?.textContent ?? '';
    const target = document.querySelector<HTMLElement>(
      '.cell:not(.cell--copy) .cell__target',
    )?.parentElement;
    if (target) {
      target.click();
      return text;
    }
    const choice = [
      ...document.querySelectorAll<HTMLButtonElement>('.actionbar__buttons button'),
    ].find((b) => !b.disabled && !/Сдаться|Готово|⟲|⟳/.test(b.textContent ?? ''));
    choice?.click();
    return text;
  });
  await page.evaluate(() => {
    const done = [
      ...document.querySelectorAll<HTMLButtonElement>('.actionbar__buttons button'),
    ].find((b) => b.textContent === 'Готово' && !b.disabled);
    done?.click();
  });
  return prompt;
}

/** Играть, пока не появится экран итогов. Возвращает число шагов. */
export async function playToEnd(page: Page, maxSteps = 1500): Promise<number> {
  for (let i = 0; i < maxSteps; i++) {
    if (await page.locator('.end__card').count()) return i;
    await step(page);
  }
  throw new Error(`Партия не закончилась за ${maxSteps} шагов`);
}
