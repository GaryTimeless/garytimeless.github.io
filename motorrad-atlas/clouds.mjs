// Small pixel sprites have two shaded banks and a sunlit rim.
const rows = [
  '         aaa          ',
  '       aabbbba        ',
  '    aabbbbbbbbaa      ',
  '   abbbbbbbbbbbbba    ',
  ' aabbbbbbccbbbbbbbaa  ',
  'abbbbbbbccccbbbbbbbba ',
  ' bbbccccccccccccccbbb ',
  '   cccccddddddddccc   ',
  '      ddddddddd       ',
];
const sprite = document.createElement('canvas');
sprite.width = 23;
sprite.height = rows.length;
const brush = sprite.getContext('2d');
const palette = { a:'#f6f1df', b:'#d9e4df', c:'#b1c5cd', d:'#8098a8' };
rows.forEach((row,y) => [...row].forEach((color,x) => {
  if (palette[color]) {
    brush.fillStyle = palette[color];
    brush.fillRect(x,y,1,1);
  }
}));

export function drawClouds(ctx,width,height,origin,seconds) {
  ctx.save();
  ctx.imageSmoothingEnabled = false;
  ctx.globalAlpha = .87;
  for (let band = -1; band <= Math.ceil(height / 115); band++) {
    const row = Math.floor(origin.y / 115) + band;
    const y = band * 115 - (origin.y % 115) + 50;
    const offset = (row * 91 + seconds * (row % 2 ? 9 : 6) - origin.x) % 300;
    for (let x = offset - 300; x < width; x += 300) {
      const size = row % 2 ? 3 : 4;
      ctx.drawImage(sprite,Math.round(x),Math.round(y),23 * size,9 * size);
    }
  }
  ctx.restore();
}
