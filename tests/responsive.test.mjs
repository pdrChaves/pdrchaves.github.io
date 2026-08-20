/**
 * Teste de responsividade e UX do portfolio.
 *
 *   npm test                roda tudo e escreve tests/screenshots/
 *   npm test -- --no-shot   pula as screenshots (mais rapido)
 *
 * Cada viewport da matriz em viewports.mjs passa pelas mesmas checagens.
 * A requisicao ao GitHub e interceptada e respondida com a fixture local,
 * entao o resultado nao depende de rede nem do conteudo real do repo.
 */
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { chromium } from 'playwright';
import { startServer } from './server.mjs';
import { VIEWPORTS } from './viewports.mjs';

const DIR = path.dirname(fileURLToPath(import.meta.url));
const SHOT_DIR = path.join(DIR, 'screenshots');
const FIXTURE = fs.readFileSync(path.join(DIR, 'fixtures', 'certificados.json'), 'utf-8');
const SHOOT = !process.argv.includes('--no-shot');

const MIN_FONT_PX = 10;   // abaixo disso vira ilegivel em tela pequena
const MIN_TAP_PX = 32;    // alvo de toque minimo confortavel em mobile
const MIN_SEC_PER_CARD = 8;  // ritmo minimo do carrossel no desktop
const TOUCH_SCALE = 2.2;     // em touch o mesmo card leva 2.2x mais tempo

const results = [];
let failures = 0;

function check(viewport, name, ok, detail = '') {
  results.push({ viewport, name, ok, detail });
  if (!ok) failures++;
}

// Contexto com a rota do GitHub ja interceptada
async function openPage(browser, base, opts = {}, body = FIXTURE, status = 200) {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 800 }, ...opts });
  const page = await ctx.newPage();
  await page.route('**/raw.githubusercontent.com/**', r =>
    r.fulfill({ status, contentType: 'application/json', body }));
  await page.goto(base, { waitUntil: 'networkidle' });
  return { ctx, page };
}

async function auditViewport(browser, base, vp) {
  const { ctx, page } = await openPage(browser, base, {
    viewport: { width: vp.width, height: vp.height },
    deviceScaleFactor: vp.dpr,
    hasTouch: vp.touch,
    isMobile: vp.touch,
    locale: 'pt-BR',
  });

  // Erro de JS passa despercebido no olho: aqui vira falha.
  const consoleErrors = [];
  page.on('pageerror', e => consoleErrors.push(String(e)));
  page.on('console', m => { if (m.type() === 'error') consoleErrors.push(m.text()); });

  await page.waitForSelector('.cert-card', { timeout: 5000 }).catch(() => {});

  // Revela os blocos com fade-in para medir o layout completo
  await page.evaluate(async () => {
    document.querySelectorAll('.fade-in').forEach(el => el.classList.add('visible'));
    window.scrollTo(0, document.body.scrollHeight);
    await new Promise(r => setTimeout(r, 250));
    window.scrollTo(0, 0);
    await new Promise(r => setTimeout(r, 250));
  });

  const m = await page.evaluate((minTap) => {
    const px = el => parseFloat(getComputedStyle(el).fontSize);
    const rows = [...document.querySelectorAll('.certs-row')];
    const ascii = document.querySelector('.ascii');

    const smallText = [...document.querySelectorAll('p, td, span, a, .tag, .log-text')]
      .filter(el => el.textContent.trim() && el.offsetParent !== null)
      .map(el => ({ px: px(el), text: el.textContent.trim().slice(0, 30) }))
      .filter(x => x.px < 10);

    // Elementos que vazam para fora da largura da janela.
    // Quem esta dentro de um container que recorta (o carrossel, por ex.)
    // transborda de proposito e nao conta como falha.
    const isClipped = el => {
      for (let p = el.parentElement; p && p !== document.body; p = p.parentElement) {
        const o = getComputedStyle(p).overflowX;
        if (o === 'hidden' || o === 'auto' || o === 'scroll') return true;
      }
      return false;
    };

    const overflowing = [...document.querySelectorAll('body *')]
      .filter(el => {
        const r = el.getBoundingClientRect();
        if (r.width === 0) return false;
        if (r.right <= window.innerWidth + 1 && r.left >= -1) return false;
        return !isClipped(el);
      })
      .map(el => (el.tagName.toLowerCase() + '.' + (el.className || '')).slice(0, 60));

    const taps = [...document.querySelectorAll('a')]
      .filter(el => el.offsetParent !== null)
      .map(el => {
        const r = el.getBoundingClientRect();
        return { h: r.height, text: el.textContent.trim().slice(0, 30) };
      });

    return {
      docScrollWidth: document.documentElement.scrollWidth,
      innerWidth: window.innerWidth,
      asciiOverflow: ascii ? ascii.scrollWidth - ascii.clientWidth : 0,
      rowCount: rows.length,
      rowCards: rows.map(r => r.querySelectorAll('.cert-card').length),
      rowDirection: rows.map(r => getComputedStyle(r).animationDirection),
      rowAnimName: rows.map(r => getComputedStyle(r).animationName),
      rowDuration: rows.map(r => parseFloat(getComputedStyle(r).animationDuration)),
      rowCardsUnique: rows.map(r => r.querySelectorAll('.cert-card').length / 2),
      statusGone: !document.getElementById('certsStatus'),
      smallText: smallText.slice(0, 5),
      overflowing: [...new Set(overflowing)].slice(0, 5),
      tinyTaps: taps.filter(t => t.h < minTap).map(t => t.text).slice(0, 5),
      titlebarPosition: getComputedStyle(document.querySelector('.titlebar')).position,
    };
  }, MIN_TAP_PX);

  const id = `${vp.name} (${vp.width}x${vp.height})`;

  check(id, 'sem scroll horizontal na pagina',
    m.docScrollWidth <= m.innerWidth + 1,
    `scrollWidth=${m.docScrollWidth} vs innerWidth=${m.innerWidth}`);

  check(id, 'nenhum elemento vaza da viewport',
    m.overflowing.length === 0, m.overflowing.join(' | '));

  check(id, 'ASCII art cabe sem corte',
    m.asciiOverflow <= 1, `sobra ${m.asciiOverflow}px`);

  check(id, 'certificados em 2 linhas preenchidas',
    m.rowCount === 2 && m.rowCards.every(n => n > 0),
    `linhas=${m.rowCount} cards=${m.rowCards.join('/')}`);

  check(id, 'linhas correm em direcoes opostas',
    m.rowDirection[0] !== m.rowDirection[1], m.rowDirection.join(' / '));

  // O carrossel tem que se mover em qualquer dispositivo, inclusive touch
  check(id, 'carrossel em movimento',
    m.rowAnimName.every(n => n === 'scroll-certs'), m.rowAnimName.join(' / '));

  // Em touch o movimento existe, mas mais lento que no desktop
  const perCard = m.rowDuration[0] / m.rowCardsUnique[0];
  const minPerCard = vp.touch ? MIN_SEC_PER_CARD * TOUCH_SCALE : MIN_SEC_PER_CARD;
  check(id, `ritmo >= ${minPerCard.toFixed(1)}s por card`,
    perCard >= minPerCard - 0.01, `${perCard.toFixed(1)}s por card`);

  check(id, 'status de carregamento sai apos sucesso', m.statusGone);

  check(id, `nenhum texto abaixo de ${MIN_FONT_PX}px`,
    m.smallText.length === 0,
    m.smallText.map(t => `${t.px}px "${t.text}"`).join(' | '));

  if (vp.touch) {
    check(id, `alvos de toque >= ${MIN_TAP_PX}px`,
      m.tinyTaps.length === 0, m.tinyTaps.join(' | '));
  }

  check(id, 'titlebar fixa no topo', m.titlebarPosition === 'sticky', m.titlebarPosition);

  check(id, 'sem erros de JS no console',
    consoleErrors.length === 0, consoleErrors.join(' | '));

  if (SHOOT) {
    fs.mkdirSync(SHOT_DIR, { recursive: true });
    await page.screenshot({ path: path.join(SHOT_DIR, `${vp.name}.png`), fullPage: true });
  }

  await ctx.close();
}

// Cenarios que nao dependem de viewport: rede, movimento, teclado, metadados
async function auditBehaviour(browser, base) {
  const id = 'comportamento';

  // GitHub fora do ar -> mensagem legivel, pagina nao quebra
  {
    const { ctx, page } = await openPage(browser, base, {}, 'boom', 500);
    const status = await page.locator('#certsStatus').textContent().catch(() => '');
    const isError = await page.locator('#certsStatus.error').count();
    check(id, 'falha de rede mostra mensagem de erro legivel',
      isError === 1 && /nao foi possivel|não foi possível/i.test(status || ''),
      status || '(sem status)');
    await ctx.close();
  }

  // JSON vazio -> estado de erro, nao carrossel vazio
  {
    const { ctx, page } = await openPage(browser, base, {}, '[]');
    check(id, 'JSON vazio cai no estado de erro',
      await page.locator('#certsStatus.error').count() === 1);
    await ctx.close();
  }

  // Um unico certificado -> segunda linha some em vez de ficar vazia
  {
    const one = JSON.stringify([{ issuer: 'Alura', name: 'Curso unico', date: '2026', file: 'a.pdf' }]);
    const { ctx, page } = await openPage(browser, base, {}, one);
    await page.waitForSelector('.cert-card');
    const hidden = await page.evaluate(() => document.getElementById('certsRow2').hidden);
    check(id, 'com 1 certificado a 2a linha fica oculta', hidden === true);
    await ctx.close();
  }

  // XSS: nome malicioso no JSON nao pode virar HTML
  {
    const evil = JSON.stringify([{ issuer: 'x', name: '<img src=x onerror=window.__xss=1>', date: '2026' }]);
    const { ctx, page } = await openPage(browser, base, {}, evil);
    await page.waitForTimeout(300);
    check(id, 'conteudo do JSON e escapado (sem XSS)',
      await page.evaluate(() => !window.__xss && !document.querySelector('.cert-card img')));
    await ctx.close();
  }

  // prefers-reduced-motion desliga a rotacao
  {
    const { ctx, page } = await openPage(browser, base, { reducedMotion: 'reduce' });
    await page.waitForSelector('.cert-card');
    const anim = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.certs-row')).animationName);
    check(id, 'reduced-motion desliga a rotacao automatica', anim === 'none', anim);
    await ctx.close();
  }

  // Velocidade constante: mais certificados nao podem acelerar o carrossel
  {
    const many = JSON.stringify(Array.from({ length: 20 }, (_, i) =>
      ({ issuer: 'Org', name: `Curso ${i}`, date: '2026', hours: '8h', file: `c${i}.pdf` })));
    const { ctx, page } = await openPage(browser, base, {}, many);
    await page.waitForSelector('.cert-card');
    const { dur, cards } = await page.evaluate(() => {
      const row = document.getElementById('certsRow1');
      return {
        dur: parseFloat(getComputedStyle(row).animationDuration),
        cards: row.querySelectorAll('.cert-card').length / 2,
      };
    });
    const perCard = dur / cards;
    check(id, `ritmo constante por card (>= ${MIN_SEC_PER_CARD}s)`,
      perCard >= MIN_SEC_PER_CARD, `${perCard.toFixed(1)}s por card com ${cards} cards`);
    await ctx.close();
  }

  // Hover pausa as duas linhas
  {
    const { ctx, page } = await openPage(browser, base);
    await page.waitForSelector('.cert-card');
    await page.locator('#certsWrapper').hover();
    const paused = await page.evaluate(() => [...document.querySelectorAll('.certs-row')]
      .every(r => getComputedStyle(r).animationPlayState === 'paused'));
    check(id, 'hover pausa as duas linhas', paused);
    await ctx.close();
  }

  // Touch: o carrossel continua andando, e o toque longo pausa/retoma
  {
    const { ctx, page } = await openPage(browser, base, {
      viewport: { width: 393, height: 852 }, hasTouch: true, isMobile: true,
    });
    await page.waitForSelector('.cert-card');

    const moving = await page.evaluate(() =>
      getComputedStyle(document.querySelector('.certs-row')).animationName === 'scroll-certs' &&
      getComputedStyle(document.querySelector('.certs-row')).animationPlayState === 'running');
    check(id, 'em touch o carrossel continua em movimento', moving);

    const box = await page.locator('#certsWrapper').boundingBox();
    const [x, y] = [box.x + box.width / 2, box.y + box.height / 2];

    await page.touchscreen.tap(x, y); // dispara pointerdown/up nao-mouse
    const resumed = await page.evaluate(() =>
      !document.getElementById('certsWrapper').classList.contains('is-paused'));
    check(id, 'toque curto nao deixa o carrossel travado', resumed);

    // Dedo apoiado: pausa enquanto durar o toque
    await page.evaluate(([px, py]) => {
      const w = document.getElementById('certsWrapper');
      w.dispatchEvent(new PointerEvent('pointerdown', {
        bubbles: true, pointerType: 'touch', clientX: px, clientY: py,
      }));
    }, [x, y]);
    const pausedOnHold = await page.evaluate(() =>
      [...document.querySelectorAll('.certs-row')]
        .every(r => getComputedStyle(r).animationPlayState === 'paused'));
    check(id, 'toque longo pausa as duas linhas', pausedOnHold);

    await page.evaluate(() => {
      document.getElementById('certsWrapper')
        .dispatchEvent(new PointerEvent('pointerup', { bubbles: true, pointerType: 'touch' }));
    });
    const back = await page.evaluate(() =>
      [...document.querySelectorAll('.certs-row')]
        .every(r => getComputedStyle(r).animationPlayState === 'running'));
    check(id, 'soltar o dedo retoma o movimento', back);
    await ctx.close();
  }

  // Teclado: foco alcanca os cards, pausa a rotacao, e clones ficam fora do tab
  {
    const { ctx, page } = await openPage(browser, base);
    await page.waitForSelector('.cert-card');
    await page.locator('.cert-card').first().focus();
    const ok = await page.evaluate(() =>
      document.activeElement.classList.contains('cert-card') &&
      [...document.querySelectorAll('.certs-row')]
        .every(r => getComputedStyle(r).animationPlayState === 'paused'));
    check(id, 'foco por teclado pausa a rotacao', ok);

    const clonesHidden = await page.evaluate(() =>
      [...document.querySelectorAll('.cert-card[aria-hidden="true"]')]
        .every(c => c.getAttribute('tabindex') === '-1'));
    check(id, 'clones do loop fora da ordem de tabulacao', clonesHidden);
    await ctx.close();
  }

  // Higiene de links, imagens e metadados
  {
    const { ctx, page } = await openPage(browser, base);
    const meta = await page.evaluate(() => ({
      lang: document.documentElement.lang,
      title: document.title,
      description: document.querySelector('meta[name="description"]') ? true : false,
      viewport: document.querySelector('meta[name="viewport"]') ? true : false,
      imgsSemAlt: [...document.images].filter(i => !i.alt).length,
      imgsQuebradas: [...document.images].filter(i => !i.complete || i.naturalWidth === 0).map(i => i.src),
      blankSemNoopener: [...document.querySelectorAll('a[target="_blank"]')]
        .filter(a => !/noopener/.test(a.rel)).map(a => a.href).slice(0, 5),
      h1: document.querySelectorAll('h1').length,
    }));

    check(id, 'lang definido', meta.lang === 'pt-br', meta.lang);
    check(id, 'title definido', !!meta.title, meta.title);
    check(id, 'meta viewport presente', meta.viewport);
    check(id, 'meta description presente (SEO)', meta.description, 'ausente');
    check(id, 'toda imagem tem alt', meta.imgsSemAlt === 0, `${meta.imgsSemAlt} sem alt`);
    check(id, 'nenhuma imagem quebrada', meta.imgsQuebradas.length === 0, meta.imgsQuebradas.join(' | '));
    check(id, 'target=_blank sempre com rel=noopener',
      meta.blankSemNoopener.length === 0, meta.blankSemNoopener.join(' | '));
    check(id, 'pagina tem exatamente um h1', meta.h1 === 1, `${meta.h1} encontrados`);
    await ctx.close();
  }
}

(async () => {
  const { server, url } = await startServer();
  const browser = await chromium.launch();

  console.log(`\nservindo ${url}\n`);

  for (const vp of VIEWPORTS) await auditViewport(browser, url, vp);
  await auditBehaviour(browser, url);

  await browser.close();
  server.close();

  let current = null;
  for (const r of results) {
    if (r.viewport !== current) {
      current = r.viewport;
      console.log(`\n-- ${current}`);
    }
    const detail = r.ok || !r.detail ? '' : `\n         -> ${r.detail}`;
    console.log(`  ${r.ok ? 'PASS' : 'FAIL'}  ${r.name}${detail}`);
  }

  const total = results.length;
  console.log(`\n${total - failures}/${total} checagens passaram`
    + (SHOOT ? ' | screenshots em tests/screenshots/' : ''));

  fs.writeFileSync(path.join(DIR, 'last-run.json'), JSON.stringify(results, null, 2));
  process.exit(failures ? 1 : 0);
})();
