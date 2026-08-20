// Fade-in sutil ao entrar no viewport
const observer = new IntersectionObserver((entries) => {
  entries.forEach(entry => {
    if (entry.isIntersecting) {
      entry.target.classList.add('visible');
      observer.unobserve(entry.target);
    }
  });
}, { threshold: 0.1 });

document.querySelectorAll('.fade-in').forEach(el => observer.observe(el));

// ===== CARREGADOR DE CERTIFICADOS DO GITHUB =====
const GITHUB_USER = 'pdrChaves';
const GITHUB_REPO = 'Certificates-of-Completion';
const GITHUB_BRANCH = 'master';
const JSON_PATH = 'certificados.json';

// Segundos que um card leva para percorrer a propria largura.
// Quanto maior, mais lenta a rotacao. A duracao total da animacao e
// derivada disso, entao adicionar certificados nao acelera o carrossel.
const SECONDS_PER_CARD = 9;

(async function loadCerts() {
  const row1 = document.getElementById('certsRow1');
  const row2 = document.getElementById('certsRow2');
  const status = document.getElementById('certsStatus');
  if (!row1 || !row2 || !status) return;

  // Monta URL do raw content do GitHub (sem CORS issues, sem rate limit pesado)
  const url = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${JSON_PATH}`;

  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const certs = await res.json();
    if (!Array.isArray(certs) || certs.length === 0) {
      throw new Error('lista vazia ou inválida');
    }

    renderCerts(certs, row1, row2);
    enableTouchPause(document.getElementById('certsWrapper'));
    status.remove();

  } catch (err) {
    console.error('Erro ao carregar certificados:', err);
    status.textContent = `não foi possível carregar certificados (${err.message}). verifique a configuração do GitHub.`;
    status.classList.add('error');
  }
})();

// Distribui os certificados em duas linhas e prepara o loop infinito de cada uma
function renderCerts(certs, row1, row2) {
  row1.innerHTML = '';
  row2.innerHTML = '';

  // Alterna os itens entre as linhas para as duas ficarem equilibradas
  // mesmo com um numero impar de certificados.
  const rows = [row1, row2];
  certs.forEach((cert, i) => rows[i % 2].appendChild(buildCertCard(cert)));

  rows.forEach(row => {
    const count = row.childElementCount;
    if (count === 0) {
      // Com um unico certificado a segunda linha fica vazia: some com ela.
      row.hidden = true;
      return;
    }

    // Clones garantem que o translateX(-50%) recomece sem salto visivel
    Array.from(row.children).forEach(card => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      row.appendChild(clone);
    });

    row.style.setProperty('--dur', `${count * SECONDS_PER_CARD}s`);
  });
}

// Em telas sem mouse nao existe hover para pausar o carrossel.
// O equivalente e segurar o dedo: pausa enquanto o toque durar.
function enableTouchPause(wrapper) {
  if (!wrapper) return;

  const pause = () => wrapper.classList.add('is-paused');
  const resume = () => wrapper.classList.remove('is-paused');

  // pointerdown cobre dedo e caneta; o toque no card ainda abre o link
  // normalmente porque nao ha preventDefault aqui.
  wrapper.addEventListener('pointerdown', e => {
    if (e.pointerType !== 'mouse') pause();
  });

  ['pointerup', 'pointercancel', 'pointerleave'].forEach(evt =>
    wrapper.addEventListener(evt, resume)
  );

  // Sai da aba com o dedo apoiado: nao pode voltar travado
  document.addEventListener('visibilitychange', () => {
    if (document.hidden) resume();
  });
}

function buildCertCard(cert) {
  // Monta URL do PDF (tambem via github.com/blob)
  const pdfUrl = cert.file
    ? `https://github.com/${GITHUB_USER}/${GITHUB_REPO}/blob/${GITHUB_BRANCH}/${cert.file}`
    : (cert.url || '#');

  const card = document.createElement('a');
  card.className = 'cert-card';
  card.href = pdfUrl;
  card.target = '_blank';
  card.rel = 'noopener';
  card.innerHTML = `
    <span class="cert-issuer">${escapeHtml(cert.issuer || '')}</span>
    <span class="cert-name">${escapeHtml(cert.name || '')}</span>
    <span class="cert-meta">
      <span>${escapeHtml(cert.date || '')}${cert.hours ? ' · ' + escapeHtml(cert.hours) : ''}</span>
      <span class="cert-link">ver ↗</span>
    </span>
  `;
  return card;
}

// Sanitiza strings antes de inserir no HTML (evita XSS se alguém editar o JSON)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
