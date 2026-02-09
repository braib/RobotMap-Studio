// OccupancyGridGenerator.js
// Utility to generate occupancy grid maps in PGM format

/**
 * Generates an occupancy grid map from map objects
 * @param {Object} mapInfo - Map metadata (width, height, resolution, origin)
 * @param {Array} objects - Array of map objects (obstacles, walls, etc.)
 * @returns {Object} { pgmData: Uint8Array, yamlContent: string, plannerNpyData: Uint8Array }
 */
export const generateOccupancyGrid = (mapInfo, objects) => {
  // Calculate grid dimensions based on resolution
  const gridWidth = Math.ceil(mapInfo.width / mapInfo.resolution);
  const gridHeight = Math.ceil(mapInfo.height / mapInfo.resolution);
  
  // Create grid with bottom-left origin (ROS convention)
  // 0 = occupied/obstacle, 254 = free space, 205 = unknown
  const grid = new Uint8Array(gridWidth * gridHeight);
  grid.fill(254); // Start with free space (white)
  
  // Helper function to convert world coordinates to grid indices
  const worldToGrid = (worldX, worldY) => {
    const gridX = Math.floor((worldX - mapInfo.origin[0]) / mapInfo.resolution);
    const gridY = Math.floor((worldY - mapInfo.origin[1]) / mapInfo.resolution);
    return { gridX, gridY };
  };
  
  // Helper function to set grid cell value
  // Grid uses bottom-left origin: grid[row=0, col=0] is at world origin
  const setGridCell = (gridX, gridY, value) => {
    if (gridX >= 0 && gridX < gridWidth && gridY >= 0 && gridY < gridHeight) {
      // Row-major order: grid[row, col] where row increases with Y
      const index = gridY * gridWidth + gridX;
      grid[index] = value;
    }
  };
  
  // Helper function to check if a point is inside a shape
  const isPointInShape = (point, shape) => {
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
  
  // Rasterize each object onto the grid
  objects.forEach(obj => {
    // Skip robots and landmarks - only mark obstacles and walls
    if (obj.type === 'robot' || obj.type === 'landmark') {
      return;
    }
    
    const shape = obj.shape;
    
    // Get bounding box for the shape to optimize iteration
    let minX, maxX, minY, maxY;
    
    if (shape.type === 'circle') {
      minX = shape.center[0] - shape.radius;
      maxX = shape.center[0] + shape.radius;
      minY = shape.center[1] - shape.radius;
      maxY = shape.center[1] + shape.radius;
    } else if (shape.type === 'rectangle') {
      // For rotated rectangles, check all corners
      const corners = [
        [-shape.width/2, -shape.height/2],
        [shape.width/2, -shape.height/2],
        [shape.width/2, shape.height/2],
        [-shape.width/2, shape.height/2]
      ];
      
      const angle = -(shape.rotation || 0);
      const cos = Math.cos(angle);
      const sin = Math.sin(angle);
      
      const transformedCorners = corners.map(([x, y]) => {
        const rotX = x * cos - y * sin;
        const rotY = x * sin + y * cos;
        return [shape.center[0] + rotX, shape.center[1] + rotY];
      });
      
      minX = Math.min(...transformedCorners.map(c => c[0]));
      maxX = Math.max(...transformedCorners.map(c => c[0]));
      minY = Math.min(...transformedCorners.map(c => c[1]));
      maxY = Math.max(...transformedCorners.map(c => c[1]));
    } else if (shape.type === 'polygon' || shape.type === 'triangle') {
      minX = Math.min(...shape.vertices.map(v => v[0]));
      maxX = Math.max(...shape.vertices.map(v => v[0]));
      minY = Math.min(...shape.vertices.map(v => v[1]));
      maxY = Math.max(...shape.vertices.map(v => v[1]));
    }
    
    // Convert bounds to grid coordinates
    const minGrid = worldToGrid(minX, minY);
    const maxGrid = worldToGrid(maxX, maxY);
    
    // Iterate through grid cells in the bounding box
    for (let gy = minGrid.gridY; gy <= maxGrid.gridY; gy++) {
      for (let gx = minGrid.gridX; gx <= maxGrid.gridX; gx++) {
        // Convert grid cell center to world coordinates
        const worldX = mapInfo.origin[0] + (gx + 0.5) * mapInfo.resolution;
        const worldY = mapInfo.origin[1] + (gy + 0.5) * mapInfo.resolution;
        
        // Check if this grid cell is inside the shape
        if (isPointInShape({ x: worldX, y: worldY }, shape)) {
          setGridCell(gx, gy, 0); // Mark as occupied (black)
        }
      }
    }
  });
  
  // Generate PGM file (with Y-axis flip for image format)
  const pgmData = generatePGM(grid, gridWidth, gridHeight);
  
  // Generate YAML metadata file
  const yamlContent = generateYAML(mapInfo, gridWidth, gridHeight);
  
  // Generate planner-format NumPy .npy file (1=occupied, 0=free, bottom-left origin)
  const plannerNpyData = generatePlannerNPY(grid, gridWidth, gridHeight);
  
  return { pgmData, yamlContent, plannerNpyData, gridWidth, gridHeight };
};

/**
 * Generates PGM format binary data
 * PGM uses top-left origin, so we flip Y-axis
 * @param {Uint8Array} grid - Grid data (bottom-left origin)
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {Uint8Array} PGM file data
 */
const generatePGM = (grid, width, height) => {
  // PGM Header (P5 = binary grayscale)
  const header = `P5\n${width} ${height}\n255\n`;
  const headerBytes = new TextEncoder().encode(header);
  
  // PGM uses top-left origin, but our grid uses bottom-left origin
  // Flip Y-axis for PGM output
  const pgmGrid = new Uint8Array(width * height);
  
  for (let row = 0; row < height; row++) {
    for (let col = 0; col < width; col++) {
      const srcIndex = row * width + col; // Bottom-left origin
      const dstIndex = (height - 1 - row) * width + col; // Top-left origin (Y-flipped)
      pgmGrid[dstIndex] = grid[srcIndex];
    }
  }
  
  // Combine header and flipped grid data
  const pgmData = new Uint8Array(headerBytes.length + pgmGrid.length);
  pgmData.set(headerBytes, 0);
  pgmData.set(pgmGrid, headerBytes.length);
  
  return pgmData;
};

/**
 * Generates YAML metadata file content
 * @param {Object} mapInfo - Map metadata
 * @param {number} gridWidth - Grid width in cells
 * @param {number} gridHeight - Grid height in cells
 * @returns {string} YAML content
 */
const generateYAML = (mapInfo, gridWidth, gridHeight) => {
  const yaml = `image: ${mapInfo.name}.pgm
resolution: ${mapInfo.resolution}
origin: [${mapInfo.origin[0]}, ${mapInfo.origin[1]}, 0.0]
negate: 0
occupied_thresh: 0.65
free_thresh: 0.196
`;
  
  return yaml;
};

/**
 * Generates NumPy .npy format binary data
 * @param {Uint8Array} grid - Grid data
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {Uint8Array} NPY file data
 */
const generateNPY = (grid, width, height) => {
  // NumPy .npy file format header
  // Magic string: \x93NUMPY
  const magic = new Uint8Array([0x93, 0x4E, 0x55, 0x4D, 0x50, 0x59]);
  
  // Version 1.0
  const version = new Uint8Array([0x01, 0x00]);
  
  // Create header dictionary
  const dtype = "'<u1'"; // unsigned 8-bit integer, little-endian
  const fortranOrder = "False";
  const shape = `(${height}, ${width})`;
  
  let headerDict = `{'descr': ${dtype}, 'fortran_order': ${fortranOrder}, 'shape': ${shape}, }`;
  
  // Pad header to be divisible by 64 bytes (for alignment)
  const headerDictBytes = new TextEncoder().encode(headerDict);
  const totalHeaderSize = 10 + headerDictBytes.length;
  const paddingSize = (64 - (totalHeaderSize % 64)) % 64;
  
  // Add padding spaces and newline
  headerDict += ' '.repeat(paddingSize > 0 ? paddingSize - 1 : 0) + '\n';
  const finalHeaderBytes = new TextEncoder().encode(headerDict);
  
  // Header length (2 bytes, little-endian)
  const headerLen = finalHeaderBytes.length;
  const headerLenBytes = new Uint8Array(2);
  headerLenBytes[0] = headerLen & 0xFF;
  headerLenBytes[1] = (headerLen >> 8) & 0xFF;
  
  // Combine all parts
  const npyData = new Uint8Array(
    magic.length + version.length + headerLenBytes.length + 
    finalHeaderBytes.length + grid.length
  );
  
  let offset = 0;
  npyData.set(magic, offset);
  offset += magic.length;
  
  npyData.set(version, offset);
  offset += version.length;
  
  npyData.set(headerLenBytes, offset);
  offset += headerLenBytes.length;
  
  npyData.set(finalHeaderBytes, offset);
  offset += finalHeaderBytes.length;
  
  npyData.set(grid, offset);
  
  return npyData;
};

/**
 * Generates planner-format NumPy array (1=occupied, 0=free)
 * with bottom-left origin (ROS convention)
 * @param {Uint8Array} grid - Grid data (bottom-left origin, 0=occupied, 254=free)
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {Uint8Array} NPY file data in planner format
 */
const generatePlannerNPY = (grid, width, height) => {
  // Convert values: 0=occupied->1, 254=free->0
  // Keep same bottom-left origin orientation
  const plannerGrid = new Uint8Array(width * height);
  
  for (let i = 0; i < grid.length; i++) {
    if (grid[i] === 0) {
      plannerGrid[i] = 1; // Occupied
    } else if (grid[i] === 254) {
      plannerGrid[i] = 0; // Free
    } else {
      plannerGrid[i] = 0; // Treat unknown as free
    }
  }
  
  return generateNPY(plannerGrid, width, height);
};

/**
 * Downloads PGM, YAML, and planner NPY files
 * @param {Uint8Array} pgmData - PGM binary data
 * @param {string} yamlContent - YAML file content
 * @param {Uint8Array} plannerNpyData - Planner NPY binary data
 * @param {string} mapName - Map name for filenames
 */
export const downloadOccupancyGrid = (pgmData, yamlContent, plannerNpyData, mapName) => {
  // Download PGM file
  const pgmBlob = new Blob([pgmData], { type: 'application/octet-stream' });
  const pgmUrl = URL.createObjectURL(pgmBlob);
  const pgmLink = document.createElement('a');
  pgmLink.href = pgmUrl;
  pgmLink.download = `${mapName}.pgm`;
  pgmLink.click();
  URL.revokeObjectURL(pgmUrl);
  
  // Download YAML file
  setTimeout(() => {
    const yamlBlob = new Blob([yamlContent], { type: 'text/yaml' });
    const yamlUrl = URL.createObjectURL(yamlBlob);
    const yamlLink = document.createElement('a');
    yamlLink.href = yamlUrl;
    yamlLink.download = `${mapName}.yaml`;
    yamlLink.click();
    URL.revokeObjectURL(yamlUrl);
    
    // Download Planner NPY file (1=occupied, 0=free, bottom-left origin)
    setTimeout(() => {
      const plannerNpyBlob = new Blob([plannerNpyData], { type: 'application/octet-stream' });
      const plannerNpyUrl = URL.createObjectURL(plannerNpyBlob);
      const plannerNpyLink = document.createElement('a');
      plannerNpyLink.href = plannerNpyUrl;
      plannerNpyLink.download = `${mapName}_planner.npy`;
      plannerNpyLink.click();
      URL.revokeObjectURL(plannerNpyUrl);
    }, 100);
  }, 100);
};

/**
 * Generates a preview of the occupancy grid for display
 * @param {Uint8Array} grid - Grid data
 * @param {number} width - Grid width
 * @param {number} height - Grid height
 * @returns {ImageData} Canvas ImageData for preview
 */
export const generateGridPreview = (grid, width, height) => {
  const imageData = new ImageData(width, height);
  
  for (let i = 0; i < grid.length; i++) {
    const value = grid[i];
    const idx = i * 4;
    
    // Direct mapping: 0=black (occupied), 254=white (free)
    const color = value;
    
    imageData.data[idx] = color;     // R
    imageData.data[idx + 1] = color; // G
    imageData.data[idx + 2] = color; // B
    imageData.data[idx + 3] = 255;   // A
  }
  
  return imageData;
};