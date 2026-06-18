/**
 * generate-icons.js - 生成应用图标资源
 *
 * 生成简单的 PNG 图标（红色火花图案）用于打包和托盘。
 * 在构建前运行: node scripts/generate-icons.js
 */

const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const RESOURCES_DIR = path.join(__dirname, '..', 'resources');

/**
 * 创建最简单的 PNG 文件（无外部依赖）
 * 生成一个纯红色圆形的 PNG
 */
function createMinimalPNG(width, height, red, green, blue) {
  // PNG 签名
  const signature = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

  // IHDR 块
  const ihdrData = Buffer.alloc(13);
  ihdrData.writeUInt32BE(width, 0);
  ihdrData.writeUInt32BE(height, 4);
  ihdrData[8] = 8;  // bit depth
  ihdrData[9] = 6;  // color type (RGBA)
  ihdrData[10] = 0; // compression
  ihdrData[11] = 0; // filter
  ihdrData[12] = 0; // interlace
  const ihdr = createPNGChunk('IHDR', ihdrData);

  // IDAT 块 - 原始像素数据（红色圆形）
  const rawData = Buffer.alloc(height * (1 + width * 4));
  const cx = width / 2;
  const cy = height / 2;
  const radius = Math.min(width, height) / 2 - 2;

  for (let y = 0; y < height; y++) {
    rawData[y * (1 + width * 4)] = 0; // filter byte
    for (let x = 0; x < width; x++) {
      const dx = x - cx;
      const dy = y - cy;
      const dist = Math.sqrt(dx * dx + dy * dy);
      const idx = y * (1 + width * 4) + 1 + x * 4;

      if (dist <= radius) {
        // 圆形内：渐变红色
        const intensity = Math.max(0, Math.min(255, Math.round((1 - dist / radius) * 255)));
        rawData[idx] = Math.min(255, red + Math.round((255 - red) * (1 - dist / radius)));
        rawData[idx + 1] = Math.max(0, green - Math.round(green * (dist / radius) * 0.5));
        rawData[idx + 2] = Math.max(0, blue - Math.round(blue * (dist / radius) * 0.5));
        rawData[idx + 3] = 255;
      } else {
        // 圆形外：完全透明
        rawData[idx] = 0;
        rawData[idx + 1] = 0;
        rawData[idx + 2] = 0;
        rawData[idx + 3] = 0;
      }
    }
  }

  // 压缩像素数据
  const compressed = zlib.deflateSync(rawData);
  const idat = createPNGChunk('IDAT', compressed);

  // IEND 块
  const iend = createPNGChunk('IEND', Buffer.alloc(0));

  return Buffer.concat([signature, ihdr, idat, iend]);
}

function createPNGChunk(type, data) {
  const length = Buffer.alloc(4);
  length.writeUInt32BE(data.length, 0);

  const typeBuffer = Buffer.from(type, 'ascii');
  const crcData = Buffer.concat([typeBuffer, data]);

  const crc = crc32(crcData);
  const crcBuffer = Buffer.alloc(4);
  crcBuffer.writeUInt32BE(crc, 0);

  return Buffer.concat([length, typeBuffer, data, crcBuffer]);
}

// CRC32 计算
function crc32(data) {
  let crc = 0xFFFFFFFF;
  for (let i = 0; i < data.length; i++) {
    crc ^= data[i];
    for (let j = 0; j < 8; j++) {
      if (crc & 1) {
        crc = (crc >>> 1) ^ 0xEDB88320;
      } else {
        crc = crc >>> 1;
      }
    }
  }
  return (crc ^ 0xFFFFFFFF) >>> 0;
}

/**
 * 生成简单的 ICO 文件（仅包含一个 PNG 图像）
 */
function createICO(pngData) {
  // ICO header
  const header = Buffer.alloc(6);
  header.writeUInt16LE(0, 0);     // reserved
  header.writeUInt16LE(1, 2);     // ICO type
  header.writeUInt16LE(1, 4);     // 1 image

  // ICO dir entry
  const dirEntry = Buffer.alloc(16);
  dirEntry[0] = 0;                // width (0 = 256)
  dirEntry[1] = 0;                // height (0 = 256)
  dirEntry[2] = 0;                // colors
  dirEntry[3] = 0;                // reserved
  dirEntry.writeUInt16LE(1, 4);   // color planes
  dirEntry.writeUInt16LE(32, 6);  // bits per pixel
  dirEntry.writeUInt32LE(pngData.length, 8);  // image size
  dirEntry.writeUInt32LE(22, 12); // offset (header + dirEntry)

  return Buffer.concat([header, dirEntry, pngData]);
}

// 主逻辑
function main() {
  if (!fs.existsSync(RESOURCES_DIR)) {
    fs.mkdirSync(RESOURCES_DIR, { recursive: true });
  }

  // 生成 256x256 图标 PNG
  const iconPng = createMinimalPNG(256, 256, 233, 69, 96);
  fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.png'), iconPng);
  console.log('✓ 已生成 resources/icon.png (256x256)');

  // 生成 ico 文件（Windows 图标）
  const ico = createICO(iconPng);
  fs.writeFileSync(path.join(RESOURCES_DIR, 'icon.ico'), ico);
  console.log('✓ 已生成 resources/icon.ico');

  // 生成 16x16 托盘图标
  const trayPng = createMinimalPNG(16, 16, 233, 69, 96);
  fs.writeFileSync(path.join(RESOURCES_DIR, 'tray-icon.png'), trayPng);
  console.log('✓ 已生成 resources/tray-icon.png (16x16)');

  console.log('\n图标资源生成完毕！');
}

main();
