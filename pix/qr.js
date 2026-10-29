const QRCode = require('qrcode');

function qrSvg(text, opts) {
  const str = String(text || '');
  if (!str) throw new Error('QR vazio');
  const qr = QRCode.create(str, { errorCorrectionLevel: 'M' });
  const modules = qr.modules;
  const size = modules.size;
  const margin = opts && opts.margin != null ? opts.margin : 1;
  const dim = size + margin * 2;
  const rects = [];
  for (let y = 0; y < size; y++) {
    for (let x = 0; x < size; x++) {
      if (modules.get(x, y)) rects.push(`<rect x="${x + margin}" y="${y + margin}" width="1" height="1"/>`);
    }
  }
  return `<svg class="pix-qr" viewBox="0 0 ${dim} ${dim}" xmlns="http://www.w3.org/2000/svg" shape-rendering="crispEdges">${rects.join('')}</svg>`;
}

module.exports = { qrSvg };
