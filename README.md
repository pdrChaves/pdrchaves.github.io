# Portfólio — Pedro Chaves

Site pessoal em HTML/CSS/JS puro, com estética de terminal. Sem build step:
o `index.html` na raiz é servido como está (GitHub Pages).

## Estrutura

```
.
├── index.html              página única (precisa ficar na raiz p/ GitHub Pages)
├── assets/
│   └── img/avatar.jpeg     foto do header
├── src/
│   ├── css/styles.css      estilos
│   └── js/script.js        fade-in ao scroll + carrossel de certificados
└── tests/
    ├── responsive.test.mjs suíte de responsividade e UX (Playwright)
    ├── viewports.mjs       matriz de dispositivos testados
    ├── server.mjs          servidor estático usado só pelos testes
    ├── fixtures/           JSON de certificados usado no lugar da rede
    └── screenshots/        saída visual do último run (não versionado)
```

## Certificados

Os cards são carregados em runtime de
`raw.githubusercontent.com/pdrChaves/Certificates-of-Completion/master/certificados.json`.

Formato esperado de cada item:

```json
{ "issuer": "Alura", "name": "Node.js: criando uma API REST", "date": "2026", "hours": "10h", "file": "alura-node-api.pdf" }
```

O carrossel tem **duas linhas** que correm em sentidos opostos. A duração da
animação é calculada em `SECONDS_PER_CARD` (`src/js/script.js`): aumentar o
número de certificados alonga a animação em vez de acelerá-la, então o ritmo
percebido não muda. Para deixar mais lento ainda, aumente essa constante.

Em telas sem hover (`@media (hover: none)`) a rotação automática é desligada e
o bloco vira scroll horizontal manual — dedo no lugar do mouse.

## Testes

```bash
npm install
npx playwright install chromium   # uma vez
npm test            # roda tudo + gera tests/screenshots/
npm run test:fast   # sem screenshots
```

A suíte sobe um servidor estático local, intercepta a chamada ao GitHub com a
fixture de `tests/fixtures/` e roda o mesmo conjunto de checagens em 13
viewports (de 280px a 2560px), mais um bloco de cenários de comportamento:
falha de rede, JSON vazio, XSS no JSON, `prefers-reduced-motion`, ritmo do
carrossel, pausa por hover e por foco de teclado, e higiene de metadados.

Falhas saem no console com o detalhe da medição, e o resultado bruto fica em
`tests/last-run.json`