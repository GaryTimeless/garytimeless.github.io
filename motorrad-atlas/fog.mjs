// Draw the cloud texture once. A seamless tile keeps it inexpensive to pan or zoom.
const TILE_SIZE = 768;
const TEXTURE_SIZE = 256;

function field(cells, random) {
  const values = Array.from({ length: cells * cells }, random);
  const at = (x, y) => values[(y % cells) * cells + x % cells];
  const ease = t => t * t * (3 - 2 * t);
  const mix = (a, b, t) => a + (b - a) * t;

  return (u, v) => {
    const x = Math.floor(u * cells);
    const y = Math.floor(v * cells);
    const dx = ease(u * cells - x);
    const dy = ease(v * cells - y);
    return mix(mix(at(x, y), at(x + 1, y), dx), mix(at(x, y + 1), at(x + 1, y + 1), dx), dy);
  };
}

export function createFog(context) {
  let seed = 78152;
  const random = () => {
    seed = (1664525 * seed + 1013904223) >>> 0;
    return seed / 2 ** 32;
  };
  const broad = field(5, random);
  const medium = field(11, random);
  const fine = field(23, random);

  const texture = document.createElement('canvas');
  texture.width = texture.height = TEXTURE_SIZE;
  const textureContext = texture.getContext('2d');
  const image = textureContext.createImageData(TEXTURE_SIZE, TEXTURE_SIZE);
  for (let y = 0; y < TEXTURE_SIZE; y++) {
    for (let x = 0; x < TEXTURE_SIZE; x++) {
      const u = x / TEXTURE_SIZE;
      const v = y / TEXTURE_SIZE;
      const moisture = .56 * broad(u, v) + .31 * medium(u, v) + .13 * fine(u, v);
      const cloud = Math.max(0, Math.min(1, (moisture - .32) / .39));
      const pixel = (y * TEXTURE_SIZE + x) * 4;
      image.data[pixel] = 188;
      image.data[pixel + 1] = 207;
      image.data[pixel + 2] = 221;
      image.data[pixel + 3] = Math.round(172 * cloud ** 1.55);
    }
  }
  textureContext.putImageData(image, 0, 0);

  const clouds = context.createPattern(texture, 'repeat');

  return function drawFog(width, height, origin) {
    context.fillStyle = 'rgba(30, 50, 72, .76)';
    context.fillRect(0, 0, width, height);

    const scale = TILE_SIZE / TEXTURE_SIZE;
    const x = -(origin.x % TILE_SIZE);
    const y = -(origin.y % TILE_SIZE);
    context.save();
    context.translate(x, y);
    context.scale(scale, scale);
    context.fillStyle = clouds;
    context.fillRect(-x / scale, -y / scale, width / scale, height / scale);
    context.restore();
  };
}
