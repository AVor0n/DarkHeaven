import AxeBuilder from '@axe-core/playwright';
import { expect, type Page, test } from '@playwright/test';
import { fieldset, openFresh, playToEnd, step, watchErrors } from './helpers';

/** Никаких нарушений доступности по axe на текущем экране. */
async function noA11yViolations(page: Page) {
  const result = await new AxeBuilder({ page }).analyze();
  const found = result.violations.map((v) => `${v.impact} ${v.id}: ${v.help} (${v.nodes.length})`);
  expect(found).toEqual([]);
}

async function noHorizontalScroll(page: Page) {
  const overflow = await page.evaluate(
    () => document.documentElement.scrollWidth - document.documentElement.clientWidth,
  );
  expect(overflow).toBeLessThanOrEqual(0);
}

test('меню, правила и настройки открываются без ошибок', async ({ page }) => {
  const errors = watchErrors(page);
  await openFresh(page);
  await noA11yViolations(page);
  await page.getByRole('button', { name: 'Как играть' }).click();
  await expect(page.getByRole('heading', { name: 'Расширенные правила' })).toBeVisible();
  await noHorizontalScroll(page);
  await noA11yViolations(page);
  await page.getByRole('button', { name: '← Назад' }).click();
  await page.getByRole('button', { name: 'Настройки' }).click();
  await expect(page.getByRole('heading', { name: 'Настройки' })).toBeVisible();
  await noA11yViolations(page);
  expect(errors).toEqual([]);
});

test('соло-партия: расстановка, ход и продолжение после перезагрузки', async ({ page }) => {
  const errors = watchErrors(page);
  await openFresh(page);
  await page.getByRole('button', { name: 'Новая партия' }).click();
  await noA11yViolations(page);
  await page.getByPlaceholder('случайный').fill('e2e-соло');
  await page.getByRole('button', { name: 'Зажечь свечи' }).click();

  // Расстановка четырёх узников и начального окружения.
  for (let i = 0; i < 60; i++) {
    const prompt = await page.locator('.actionbar__prompt').textContent();
    if (prompt?.startsWith('Куда идти')) break;
    await step(page);
  }
  await expect(page.locator('.actionbar__prompt')).toHaveText(/Куда идти/);
  await noHorizontalScroll(page);
  await noA11yViolations(page);

  // Первый ход красного: шаг по подсвеченной клетке.
  const move = page.locator('.cell:not(.cell--copy) .cell__target--move').first();
  await move.click({ force: true });
  await expect(page.locator('.actionbar__preview')).toBeVisible();
  await page.getByRole('button', { name: 'Готово' }).click();
  await expect(page.locator('.log__list')).toContainText('Красный идёт');

  await page.reload();
  await page.getByRole('button', { name: 'Продолжить' }).click();
  await expect(page.locator('.log__list')).toContainText('Красный идёт');
  expect(errors).toEqual([]);
});

test('расширенная партия со всеми боссами и набором монстров доигрывается', async ({ page }) => {
  const errors = watchErrors(page);
  await openFresh(page);
  await page.getByRole('button', { name: 'Новая партия' }).click();
  await fieldset(page, 'Правила').getByRole('button', { name: 'Расширенные' }).click();
  await fieldset(page, 'Боссы').getByRole('button', { name: 'Два' }).click();
  await fieldset(page, 'Боссы').getByText('Плакальщик').click();
  await fieldset(page, 'Боссы').getByText('Несущий Конец').click();
  await fieldset(page, 'Набор монстров')
    .getByRole('button', { name: '2', exact: true })
    .first()
    .click();
  await fieldset(page, 'Набор монстров')
    .getByRole('button', { name: '1', exact: true })
    .last()
    .click();
  await expect(page.locator('.form__summary')).toContainText('предвестник ×5');
  await page.getByPlaceholder('случайный').fill('e2e-всё');
  await page.getByRole('button', { name: 'Зажечь свечи' }).click();

  await playToEnd(page);
  await expect(page.getByRole('dialog')).toContainText(/Врата открыты|Тьма победила/);
  await noA11yViolations(page);
  expect(errors).toEqual([]);
});
