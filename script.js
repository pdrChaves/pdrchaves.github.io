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

(async function loadCerts() {
  const track = document.getElementById('certsTrack');
  const status = document.getElementById('certsStatus');
  if (!track || !status) return;

  // Monta URL do raw content do GitHub (sem CORS issues, sem rate limit pesado)
  const url = `https://raw.githubusercontent.com/${GITHUB_USER}/${GITHUB_REPO}/${GITHUB_BRANCH}/${JSON_PATH}`;

  try {
    const res = await fetch(url, { cache: 'no-cache' });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);

    const certs = await res.json();
    if (!Array.isArray(certs) || certs.length === 0) {
      throw new Error('lista vazia ou inválida');
    }

    // Limpa o status e popula os cards
    track.innerHTML = '';

    certs.forEach(cert => {
      // Monta URL do PDF (também via raw.githubusercontent)
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
      track.appendChild(card);
    });

    // Duplica os cards pro loop infinito do carrossel
    const originalCards = Array.from(track.querySelectorAll('.cert-card'));
    originalCards.forEach(card => {
      const clone = card.cloneNode(true);
      clone.setAttribute('aria-hidden', 'true');
      clone.setAttribute('tabindex', '-1');
      track.appendChild(clone);
    });

  } catch (err) {
    console.error('Erro ao carregar certificados:', err);
    status.textContent = `não foi possível carregar certificados (${err.message}). verifique a configuração do GitHub.`;
    status.classList.add('error');
  }
})();

// Sanitiza strings antes de inserir no HTML (evita XSS se alguém editar o JSON)
function escapeHtml(str) {
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}
