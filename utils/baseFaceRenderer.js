/**
 * BASE card utilities: detection + face-aware square rendering.
 *
 * Face detection strategy (no ML dependency):
 *   - Uses jimp to compute the center-of-mass of non-transparent pixels.
 *   - For character cutouts (transparent bg): COM is dragged down by legs/body,
 *     so we shift the crop upward toward the face.
 *   - For solid-background images (wikia screenshots): blend COM with an
 *     upper-portion bias so we land near the face/upper body.
 *   - Results are cached by URL so the analysis only runs once per image.
 *
 * Display: square rounded-rect crop (same dimensions as other card slots)
 * with a golden border to distinguish BASE cards.
 */

const faceRegionCache = new Map();

/**
 * Returns true when a card is a BASE-type card.
 * BASE cards have attribute 'BASE' or an id >= 6000.
 */
function isBaseCard(card) {
  if (!card) return false;
  if (card.attribute === 'BASE') return true;
  const numId = parseInt(card.id, 10);
  return !isNaN(numId) && numId >= 6000;
}

/**
 * Analyse an image URL with jimp to estimate the vertical/horizontal
 * centre of the character's face / upper body.
 *
 * Returns { cx, cy, width, height } in source-pixel coordinates,
 * or null if analysis fails (callers should fall back to a fixed heuristic).
 * Results are cached so re-renders are fast.
 */
async function detectFaceCenter(imageUrl) {
  if (faceRegionCache.has(imageUrl)) return faceRegionCache.get(imageUrl);

  let result = null;
  try {
    const Jimp = require('jimp');
    const jimg = await Jimp.read(imageUrl);
    const { data, width, height } = jimg.bitmap;

    let totalWeight = 0;
    let weightedX = 0;
    let weightedY = 0;
    let hasTransparency = false;

    // Sample every ~Nth pixel for speed (target ~60 samples per side)
    const step = Math.max(2, Math.floor(Math.min(width, height) / 60));

    for (let y = 0; y < height; y += step) {
      for (let x = 0; x < width; x += step) {
        const idx = (y * width + x) * 4;
        const a = data[idx + 3];
        if (a < 200) hasTransparency = true;
        if (a < 40) continue;          // skip mostly-transparent pixels
        const weight = a / 255;
        totalWeight += weight;
        weightedX += x * weight;
        weightedY += y * weight;
      }
    }

    let cx = width / 2;
    let cy;

    if (totalWeight > 0) {
      cx = weightedX / totalWeight;
      const comY = weightedY / totalWeight;

      if (hasTransparency) {
        // Cutout art: legs drag COM downward → shift crop up toward the face
        cy = comY * 0.68 + height * 0.10;
      } else {
        // Solid background (wiki screenshots): blend COM with upper-portrait bias
        cy = comY * 0.50 + height * 0.18;
      }
    } else {
      cy = height * 0.35;
    }

    result = { cx, cy, width, height };
  } catch (_) {
    // jimp unavailable or image unreadable — caller will use fixed heuristic
  }

  faceRegionCache.set(imageUrl, result);
  return result;
}

/**
 * Given face-detection info (or null), compute the square source crop
 * { srcX, srcY, srcW, srcH } within the image.
 */
function computeCrop(faceInfo, imageWidth, imageHeight) {
  let cx, cy;
  if (faceInfo) {
    cx = faceInfo.cx;
    cy = faceInfo.cy;
  } else {
    // Fallback: upper-centre heuristic
    cx = imageWidth / 2;
    cy = imageHeight * 0.35;
  }

  // Square crop that is 88 % of image width (or 80 % of height, whichever is smaller)
  // — large enough to show the face + shoulders without being too zoomed in.
  const cropSize = Math.min(imageWidth * 0.88, imageHeight * 0.80);
  const half = cropSize / 2;

  const srcX = Math.max(0, Math.min(imageWidth  - cropSize, cx - half));
  const srcY = Math.max(0, Math.min(imageHeight - cropSize, cy - half));

  return { srcX, srcY, srcW: cropSize, srcH: cropSize };
}

/**
 * Draw a BASE card as a rounded-rect face crop with a golden border.
 * Matches the same layout area as other card types (no circle).
 *
 * @param {CanvasRenderingContext2D} ctx
 * @param {Image|null}  img        - pre-loaded canvas Image, or null
 * @param {object|null} faceInfo   - result of detectFaceCenter(), or null
 * @param {number} destX           - left edge of draw area
 * @param {number} destY           - top edge of draw area
 * @param {number} destW           - width  of draw area
 * @param {number} destH           - height of draw area
 * @param {string} [fallbackText]  - initials shown when image is unavailable
 */
function drawBaseFaceCard(ctx, img, faceInfo, destX, destY, destW, destH, fallbackText = '?') {
  const radius = 10;

  function roundedRect(x, y, w, h, r) {
    const rr = Math.min(r, w / 2, h / 2);
    ctx.beginPath();
    ctx.moveTo(x + rr, y);
    ctx.lineTo(x + w - rr, y);
    ctx.quadraticCurveTo(x + w, y, x + w, y + rr);
    ctx.lineTo(x + w, y + h - rr);
    ctx.quadraticCurveTo(x + w, y + h, x + w - rr, y + h);
    ctx.lineTo(x + rr, y + h);
    ctx.quadraticCurveTo(x, y + h, x, y + h - rr);
    ctx.lineTo(x, y + rr);
    ctx.quadraticCurveTo(x, y, x + rr, y);
    ctx.closePath();
  }

  ctx.save();

  // Dark background behind the card area
  ctx.fillStyle = '#111111';
  roundedRect(destX, destY, destW, destH, radius);
  ctx.fill();

  if (img) {
    const { srcX, srcY, srcW, srcH } = computeCrop(faceInfo, img.width, img.height);
    roundedRect(destX, destY, destW, destH, radius);
    ctx.clip();
    ctx.drawImage(img, srcX, srcY, srcW, srcH, destX, destY, destW, destH);
  } else {
    // No image: show character initials
    roundedRect(destX, destY, destW, destH, radius);
    ctx.clip();
    ctx.fillStyle = '#1a1a2e';
    ctx.fillRect(destX, destY, destW, destH);
    ctx.fillStyle = '#FFFFFF';
    ctx.font = `bold ${Math.floor(Math.min(destW, destH) * 0.28)}px sans-serif`;
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText((fallbackText || '?').slice(0, 2).toUpperCase(), destX + destW / 2, destY + destH / 2);
  }

  ctx.restore();

  // Golden border drawn on top (outside clip so it's always fully visible)
  ctx.save();
  ctx.strokeStyle = '#FFD700';
  ctx.lineWidth = 4;
  roundedRect(destX - 2, destY - 2, destW + 4, destH + 4, radius + 2);
  ctx.stroke();
  ctx.restore();
}

module.exports = { isBaseCard, detectFaceCenter, computeCrop, drawBaseFaceCard };
