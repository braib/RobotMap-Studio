import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: { port: 5173, open: true }
})
// utils/pgmGenerator.js

export const isPointInShape = (point, shape) => {
  if (shape.type === 'circle') {
    const dx = point.x - shape.center[0];
    const dy = point.y - shape.center[1];
    return Math.sqrt(dx * dx + dy * dy) <= shape.radius;
  }
  if (shape.type === 'rectangle') {
    const angle = -(shape.rotation || 0);
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const dx = point.x - shape.center[0];
    const dy = point.y - shape.center[1];
    const rotX = dx * cos - dy * sin;
    const rotY = dx * sin + dy * cos;
    return Math.abs(rotX) <= shape.width / 2 && Math.abs(rotY) <= shape.height / 2;
  }
  if (shape.type === 'polygon' || shape.type === 'triangle') {
    let inside = false;
    const vertices = shape.vertices;
    for (let i = 0, j = vertices.length - 1; i < vertices.length; j = i++) {
      const xi = vertices[i][0], yi = vertices[i][1];
      const xj = vertices[j][0], yj = vertices[j][1];
      const intersect = ((yi > point.y) !== (yj > point.y)) &&
        (point.x < (xj - xi) * (point.y - yi) / (yj - yi) + xi);
      if (intersect) inside = !inside;
    }
    return inside;
  }
  return false;
};

// Generate PGM file content
export const generatePGM = (mapInfo, objects) => {
  const width = Math.ceil(mapInfo.width / mapInfo.resolution);
  const height = Math.ceil(mapInfo.height / mapInfo.resolution);
  
  // Create grid (255 = free, 0 = occupied, 205 = unknown)
  const grid = new Array(height).fill(null).map(() => new Array(width).fill(255));
  
  // Rasterize obstacles
  for (let py = 0; py < height; py++) {
    for (let px = 0; px < width; px++) {
      // Convert pixel to world coordinates
      const worldX = mapInfo.origin[0] + (px + 0.5) * mapInfo.resolution;
      const worldY = mapInfo.origin[1] + (height - py - 0.5) * mapInfo.resolution;
      
      const point = { x: worldX, y: worldY };
      
      // Check if point is inside any obstacle
      for (const obj of objects) {
        if (obj.type === 'obstacle' || obj.type === 'wall') {
          if (isPointInShape(point, obj.shape)) {
            grid[py][px] = 0; // Occupied
            break;
          }
        }
      }
    }
  }
  
  // Build PGM file content
  let pgmContent = `P2\n${width} ${height}\n255\n`;
  for (let y = 0; y < height; y++) {
    pgmContent += grid[y].join(' ') + '\n';
  }
  
  return { pgmContent, width, height };
};

// Generate YAML metadata file
export const generateYAML = (mapInfo, pgmFilename) => {
  const yamlContent = `image: ${pgmFilename}
resolution: ${mapInfo.resolution}
origin: [${mapInfo.origin[0]}, ${mapInfo.origin[1]}, 0.0]
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
`;
  return yamlContent;
};

// Download function
export const downloadFile = (content, filename, type = 'text/plain') => {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
};