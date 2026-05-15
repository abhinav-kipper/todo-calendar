// --- Undo system ---
let undoStack = [];
let undoTimeout = null;

export function pushUndo(msg, undoFn) {
  undoStack = [{ msg, fn: undoFn }];
  const toast = document.getElementById('undoToast');
  document.getElementById('undoMsg').textContent = msg;
  toast.classList.add('show');
  const fill = document.getElementById('undoTimerFill');
  fill.style.transition = 'none';
  fill.style.width = '100%';
  requestAnimationFrame(() => {
    fill.style.transition = 'width 5s linear';
    fill.style.width = '0%';
  });
  clearTimeout(undoTimeout);
  undoTimeout = setTimeout(() => { toast.classList.remove('show'); undoStack = []; }, 5000);
}

export function performUndo() {
  if (undoStack.length === 0) return false;
  const action = undoStack.pop();
  action.fn();
  document.getElementById('undoToast').classList.remove('show');
  clearTimeout(undoTimeout);
  return true;
}

// --- Confetti ---
let confettiPieces = [];
let canvas, ctx;

export function initConfetti() {
  canvas = document.getElementById('confetti');
  ctx = canvas.getContext('2d');
  function resize() { canvas.width = window.innerWidth; canvas.height = window.innerHeight; }
  resize();
  window.addEventListener('resize', resize);
}

export function launchConfetti() {
  const colors = ['#6ea8fe', '#5cdb7f', '#b88cff', '#ffb347', '#ff6b6b', '#47d4a0'];
  for (let i = 0; i < 50; i++) {
    confettiPieces.push({
      x: canvas.width / 2 + (Math.random() - 0.5) * 200,
      y: canvas.height / 2,
      vx: (Math.random() - 0.5) * 12,
      vy: -(Math.random() * 14 + 6),
      size: Math.random() * 6 + 3,
      color: colors[Math.floor(Math.random() * colors.length)],
      rotation: Math.random() * 360,
      rotSpeed: (Math.random() - 0.5) * 10,
      life: 1
    });
  }
  if (confettiPieces.length <= 50) animateConfetti();
}

function animateConfetti() {
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  confettiPieces = confettiPieces.filter(p => {
    p.x += p.vx; p.y += p.vy; p.vy += 0.4; p.rotation += p.rotSpeed; p.life -= 0.015;
    if (p.life <= 0) return false;
    ctx.save(); ctx.translate(p.x, p.y); ctx.rotate(p.rotation * Math.PI / 180);
    ctx.fillStyle = p.color; ctx.globalAlpha = p.life;
    ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
    ctx.restore(); return true;
  });
  if (confettiPieces.length > 0) requestAnimationFrame(animateConfetti);
}
