#!/usr/bin/env node

const fs = require("fs");
const path = require("path");
const zlib = require("zlib");

const ICON_SIZES = [16, 32, 48, 128];
const OUTPUT_DIR = path.join(__dirname, "..", "assets");

fs.mkdirSync(OUTPUT_DIR, { recursive: true });

for (const size of ICON_SIZES) {
  const png = createIconPng(size);
  fs.writeFileSync(path.join(OUTPUT_DIR, `icon-${size}.png`), png);
}

function createIconPng(size) {
  const pixels = Buffer.alloc(size * size * 4);
  const radius = size * 0.2;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const index = (y * size + x) * 4;
      const inside = roundedRectContains(x + 0.5, y + 0.5, size, radius);
      if (!inside) continue;

      const t = (x + y) / (size * 2);
      const bg = mix([255, 40, 77], [31, 31, 31], t);
      pixels[index] = bg[0];
      pixels[index + 1] = bg[1];
      pixels[index + 2] = bg[2];
      pixels[index + 3] = 255;
    }
  }

  drawLens(pixels, size);
  drawPlay(pixels, size);
  drawMetricLines(pixels, size);

  return encodePng(size, size, pixels);
}

function roundedRectContains(x, y, size, radius) {
  const margin = size * 0.08;
  const left = margin;
  const top = margin;
  const right = size - margin;
  const bottom = size - margin;
  const cx = x < left + radius ? left + radius : x > right - radius ? right - radius : x;
  const cy = y < top + radius ? top + radius : y > bottom - radius ? bottom - radius : y;
  return x >= left && x <= right && y >= top && y <= bottom && distance(x, y, cx, cy) <= radius;
}

function drawLens(pixels, size) {
  const cx = size * 0.34;
  const cy = size * 0.61;
  const outer = size * 0.18;
  const inner = size * 0.11;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      const d = distance(x + 0.5, y + 0.5, cx, cy);
      if (d >= inner && d <= outer) setPixel(pixels, size, x, y, 255, 255, 255, 255);
    }
  }

  drawThickLine(pixels, size, size * 0.47, size * 0.73, size * 0.64, size * 0.9, size * 0.07);
}

function drawPlay(pixels, size) {
  const ax = size * 0.55;
  const ay = size * 0.33;
  const bx = size * 0.55;
  const by = size * 0.62;
  const cx = size * 0.79;
  const cy = size * 0.48;

  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (pointInTriangle(x + 0.5, y + 0.5, ax, ay, bx, by, cx, cy)) {
        setPixel(pixels, size, x, y, 255, 255, 255, 255);
      }
    }
  }
}

function drawMetricLines(pixels, size) {
  drawThickLine(pixels, size, size * 0.26, size * 0.24, size * 0.43, size * 0.24, size * 0.045);
  drawThickLine(pixels, size, size * 0.26, size * 0.36, size * 0.35, size * 0.36, size * 0.045);
}

function drawThickLine(pixels, size, x1, y1, x2, y2, width) {
  for (let y = 0; y < size; y += 1) {
    for (let x = 0; x < size; x += 1) {
      if (distanceToSegment(x + 0.5, y + 0.5, x1, y1, x2, y2) <= width / 2) {
        setPixel(pixels, size, x, y, 255, 255, 255, 255);
      }
    }
  }
}

function setPixel(pixels, size, x, y, r, g, b, a) {
  const index = (y * size + x) * 4;
  pixels[index] = r;
  pixels[index + 1] = g;
  pixels[index + 2] = b;
  pixels[index + 3] = a;
}

function mix(first, second, amount) {
  return first.map((value, index) => Math.round(value + (second[index] - value) * amount));
}

function distance(x1, y1, x2, y2) {
  return Math.hypot(x1 - x2, y1 - y2);
}

function distanceToSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lengthSquared = dx * dx + dy * dy;
  const t = lengthSquared === 0 ? 0 : Math.max(0, Math.min(1, ((px - x1) * dx + (py - y1) * dy) / lengthSquared));
  return distance(px, py, x1 + t * dx, y1 + t * dy);
}

function pointInTriangle(px, py, ax, ay, bx, by, cx, cy) {
  const area = sign(px, py, ax, ay, bx, by);
  const first = sign(px, py, bx, by, cx, cy);
  const second = sign(px, py, cx, cy, ax, ay);
  const hasNegative = area < 0 || first < 0 || second < 0;
  const hasPositive = area > 0 || first > 0 || second > 0;
  return !(hasNegative && hasPositive);
}

function sign(px, py, ax, ay, bx, by) {
  return (px - bx) * (ay - by) - (ax - bx) * (py - by);
}

function encodePng(width, height, rgba) {
  const stride = width * 4;
  const raw = Buffer.alloc((stride + 1) * height);

  for (let y = 0; y < height; y += 1) {
    raw[y * (stride + 1)] = 0;
    rgba.copy(raw, y * (stride + 1) + 1, y * stride, (y + 1) * stride);
  }

  return Buffer.concat([
    Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]),
    createChunk("IHDR", createIhdr(width, height)),
    createChunk("IDAT", zlib.deflateSync(raw)),
    createChunk("IEND", Buffer.alloc(0))
  ]);
}

function createIhdr(width, height) {
  const buffer = Buffer.alloc(13);
  buffer.writeUInt32BE(width, 0);
  buffer.writeUInt32BE(height, 4);
  buffer[8] = 8;
  buffer[9] = 6;
  buffer[10] = 0;
  buffer[11] = 0;
  buffer[12] = 0;
  return buffer;
}

function createChunk(type, data) {
  const typeBuffer = Buffer.from(type);
  const length = Buffer.alloc(4);
  const crc = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);
  crc.writeUInt32BE(crc32(Buffer.concat([typeBuffer, data])), 0);
  return Buffer.concat([length, typeBuffer, data, crc]);
}

function crc32(buffer) {
  let crc = 0xffffffff;
  for (const byte of buffer) {
    crc ^= byte;
    for (let index = 0; index < 8; index += 1) {
      crc = crc & 1 ? 0xedb88320 ^ (crc >>> 1) : crc >>> 1;
    }
  }
  return (crc ^ 0xffffffff) >>> 0;
}
