import React, { useState, useRef, useEffect } from 'react';
import { Download, FolderOpen, Circle, Square, Triangle, Pentagon, Move, ZoomIn, ZoomOut, Grid, Maximize2, Trash2, RotateCw, ChevronDown, Settings, MousePointer2, Target, Ruler, Plus, Undo, Redo, Crosshair, CircleDot, Lock, Unlock, GripVertical } from 'lucide-react';

// Utility functions
const worldToCanvas = (x, y, offset, scale, origin = [0, 0]) => ({
  x: offset.x + (x - origin[0]) * scale,
  y: offset.y - (y - origin[1]) * scale
});

const canvasToWorld = (x, y, offset, scale, origin = [0, 0]) => ({
  x: origin[0] + (x - offset.x) / scale,
  y: origin[1] - (y - offset.y) / scale
});

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

const rad2deg = (rad) => (rad * 180 / Math.PI).toFixed(2);
const deg2rad = (deg) => deg * Math.PI / 180;

export default function MapEditor() {
  const canvasRef = useRef(null);
  const fileInputRef = useRef(null);
  const leftSidebarRef = useRef(null);
  const rightSidebarRef = useRef(null);
  
  const [scale, setScale] = useState(50);
  const [offset, setOffset] = useState({ x: 100, y: 700 });
  const [mapInfo, setMapInfo] = useState({
    name: "New_Map",
    resolution: 0.05,
    width: 10,
    height: 10,
    origin: [0, 0],
    originPosition: 'bottom-left'
  });
  const [objects, setObjects] = useState([]);
  const [history, setHistory] = useState([]);
  const [historyIndex, setHistoryIndex] = useState(-1);
  const [mode, setMode] = useState('select');
  const [drawMode, setDrawMode] = useState('center');
  const [triangleType, setTriangleType] = useState('equilateral');
  const [selectedId, setSelectedId] = useState(null);
  const [tempPoints, setTempPoints] = useState([]);
  const [showGrid, setShowGrid] = useState(true);
  const [showAxes, setShowAxes] = useState(true);
  const [showRuler, setShowRuler] = useState(true);
  const [showDropdown, setShowDropdown] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState(null);
  const [isPanning, setIsPanning] = useState(false);
  const [panStart, setPanStart] = useState(null);
  const [showMapSettings, setShowMapSettings] = useState(false);
  const [angleUnit, setAngleUnit] = useState('rad');
  const [locks, setLocks] = useState({});
  const [leftSidebarWidth, setLeftSidebarWidth] = useState(320);
  const [rightSidebarWidth, setRightSidebarWidth] = useState(360);
  const [isResizingLeft, setIsResizingLeft] = useState(false);
  const [isResizingRight, setIsResizingRight] = useState(false);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (showDropdown && !e.target.closest('.dropdown-container')) {
        setShowDropdown(null);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [showDropdown]);

  // Update origin based on position
  useEffect(() => {
    const pos = mapInfo.originPosition;
    let newOrigin = [0, 0];
    if (pos === 'center') newOrigin = [-mapInfo.width / 2, -mapInfo.height / 2];
    else if (pos === 'top-left') newOrigin = [0, -mapInfo.height];
    else if (pos === 'top-right') newOrigin = [-mapInfo.width, -mapInfo.height];
    else if (pos === 'bottom-right') newOrigin = [-mapInfo.width, 0];
    
    if (pos !== 'custom') {
      setMapInfo(prev => ({ ...prev, origin: newOrigin }));
    }
  }, [mapInfo.originPosition, mapInfo.width, mapInfo.height]);

  // Save to history
  const saveHistory = (newObjects) => {
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(JSON.parse(JSON.stringify(newObjects)));
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
  };

  // Undo/Redo
  const undo = () => {
    if (historyIndex > 0) {
      setHistoryIndex(historyIndex - 1);
      setObjects(JSON.parse(JSON.stringify(history[historyIndex - 1])));
    }
  };

  const redo = () => {
    if (historyIndex < history.length - 1) {
      setHistoryIndex(historyIndex + 1);
      setObjects(JSON.parse(JSON.stringify(history[historyIndex + 1])));
    }
  };

  // Keyboard shortcuts
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 'z' && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if ((e.ctrlKey || e.metaKey) && (e.key === 'y' || (e.key === 'z' && e.shiftKey))) {
        e.preventDefault();
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [historyIndex, history]);

  // Sidebar resizing
  useEffect(() => {
    const handleMouseMove = (e) => {
      if (isResizingLeft) {
        const newWidth = Math.max(250, Math.min(600, e.clientX));
        setLeftSidebarWidth(newWidth);
      }
      if (isResizingRight) {
        const newWidth = Math.max(300, Math.min(700, window.innerWidth - e.clientX));
        setRightSidebarWidth(newWidth);
      }
    };
    
    const handleMouseUp = () => {
      setIsResizingLeft(false);
      setIsResizingRight(false);
    };
    
    if (isResizingLeft || isResizingRight) {
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
      };
    }
  }, [isResizingLeft, isResizingRight]);

  useEffect(() => {
    if (canvasRef.current) draw();
  }, [scale, offset, objects, mapInfo, tempPoints, selectedId, showGrid, showAxes, showRuler]);

  const draw = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    
    ctx.fillStyle = '#ffffff';
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    const topLeft = worldToCanvas(0, mapInfo.height, offset, scale, mapInfo.origin);
    const bottomRight = worldToCanvas(mapInfo.width, 0, offset, scale, mapInfo.origin);
    const mapWidth = bottomRight.x - topLeft.x;
    const mapHeight = bottomRight.y - topLeft.y;

    if (showGrid) {
      ctx.save();
      const gridStartX = Math.floor(canvasToWorld(0, 0, offset, scale, mapInfo.origin).x) - 5;
      const gridEndX = Math.ceil(canvasToWorld(canvas.width, 0, offset, scale, mapInfo.origin).x) + 5;
      const gridStartY = Math.floor(canvasToWorld(0, canvas.height, offset, scale, mapInfo.origin).y) - 5;
      const gridEndY = Math.ceil(canvasToWorld(0, 0, offset, scale, mapInfo.origin).y) + 5;
      
      ctx.strokeStyle = '#e5e7eb';
      ctx.lineWidth = 1;
      for (let i = gridStartX; i <= gridEndX; i += 0.5) {
        const { x } = worldToCanvas(i, 0, offset, scale, mapInfo.origin);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let i = gridStartY; i <= gridEndY; i += 0.5) {
        const { y } = worldToCanvas(0, i, offset, scale, mapInfo.origin);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }

      ctx.strokeStyle = '#d1d5db';
      ctx.lineWidth = 1.5;
      for (let i = Math.floor(gridStartX); i <= gridEndX; i++) {
        const { x } = worldToCanvas(i, 0, offset, scale, mapInfo.origin);
        ctx.beginPath();
        ctx.moveTo(x, 0);
        ctx.lineTo(x, canvas.height);
        ctx.stroke();
      }
      for (let i = Math.floor(gridStartY); i <= gridEndY; i++) {
        const { y } = worldToCanvas(0, i, offset, scale, mapInfo.origin);
        ctx.beginPath();
        ctx.moveTo(0, y);
        ctx.lineTo(canvas.width, y);
        ctx.stroke();
      }
      ctx.restore();
    }

    if (showAxes) {
      const origin = worldToCanvas(mapInfo.origin[0], mapInfo.origin[1], offset, scale, mapInfo.origin);
      
      ctx.strokeStyle = '#ef4444';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(0, origin.y);
      ctx.lineTo(canvas.width, origin.y);
      ctx.stroke();
      
      ctx.strokeStyle = '#10b981';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(origin.x, canvas.height);
      ctx.lineTo(origin.x, 0);
      ctx.stroke();
      
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 14px sans-serif';
      ctx.fillText(`Origin (${mapInfo.origin[0]}, ${mapInfo.origin[1]})`, origin.x + 8, origin.y - 8);
    }

    ctx.strokeStyle = '#3b82f6';
    ctx.lineWidth = 4;
    ctx.setLineDash([10, 5]);
    ctx.strokeRect(topLeft.x, topLeft.y, mapWidth, mapHeight);
    ctx.setLineDash([]);
    
    ctx.fillStyle = '#3b82f6';
    ctx.font = 'bold 12px sans-serif';
    ctx.fillText(`(0, ${mapInfo.height})`, topLeft.x + 5, topLeft.y + 15);
    ctx.fillText(`(${mapInfo.width}, 0)`, bottomRight.x - 60, bottomRight.y - 5);

    if (showRuler) {
      ctx.fillStyle = '#6b7280';
      ctx.font = '11px sans-serif';
      ctx.strokeStyle = '#9ca3af';
      ctx.lineWidth = 1;
      
      for (let i = 0; i <= mapInfo.width; i++) {
        const pos = worldToCanvas(i, 0, offset, scale, mapInfo.origin);
        ctx.beginPath();
        ctx.moveTo(pos.x, bottomRight.y);
        ctx.lineTo(pos.x, bottomRight.y + 8);
        ctx.stroke();
        ctx.fillText(i.toString(), pos.x - 5, bottomRight.y + 20);
      }
      
      for (let i = 0; i <= mapInfo.height; i++) {
        const pos = worldToCanvas(0, i, offset, scale, mapInfo.origin);
        ctx.beginPath();
        ctx.moveTo(topLeft.x - 8, pos.y);
        ctx.lineTo(topLeft.x, pos.y);
        ctx.stroke();
        ctx.fillText(i.toString(), topLeft.x - 25, pos.y + 5);
      }
    }

    objects.forEach(obj => {
      const pos = worldToCanvas(obj.shape.center[0], obj.shape.center[1], offset, scale, mapInfo.origin);
      const selected = selectedId === obj.id;

      ctx.globalAlpha = 0.3;
      ctx.fillStyle = obj.properties.color || "#f97316";
      
      if (obj.shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, obj.shape.radius * scale, 0, Math.PI * 2);
        ctx.fill();
      } else if (obj.shape.type === 'rectangle') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-(obj.shape.rotation || 0));
        ctx.fillRect(-obj.shape.width/2 * scale, -obj.shape.height/2 * scale, 
                     obj.shape.width * scale, obj.shape.height * scale);
        ctx.restore();
      } else if (obj.shape.type === 'polygon' || obj.shape.type === 'triangle') {
        ctx.beginPath();
        obj.shape.vertices.forEach((v, i) => {
          const p = worldToCanvas(v[0], v[1], offset, scale, mapInfo.origin);
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.fill();
      }

      ctx.globalAlpha = 1;
      ctx.strokeStyle = selected ? '#fbbf24' : obj.properties.color || "#f97316";
      ctx.lineWidth = selected ? 4 : 2.5;
      
      if (obj.shape.type === 'circle') {
        ctx.beginPath();
        ctx.arc(pos.x, pos.y, obj.shape.radius * scale, 0, Math.PI * 2);
        ctx.stroke();
      } else if (obj.shape.type === 'rectangle') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-(obj.shape.rotation || 0));
        ctx.strokeRect(-obj.shape.width/2 * scale, -obj.shape.height/2 * scale, 
                       obj.shape.width * scale, obj.shape.height * scale);
        ctx.restore();
      } else {
        ctx.beginPath();
        obj.shape.vertices.forEach((v, i) => {
          const p = worldToCanvas(v[0], v[1], offset, scale, mapInfo.origin);
          i === 0 ? ctx.moveTo(p.x, p.y) : ctx.lineTo(p.x, p.y);
        });
        ctx.closePath();
        ctx.stroke();
      }

      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 11px sans-serif';
      ctx.fillText(obj.name, pos.x + 8, pos.y - 8);
      
      if (obj.type === 'robot') {
        ctx.save();
        ctx.translate(pos.x, pos.y);
        ctx.rotate(-(obj.pose?.theta || 0));
        ctx.beginPath();
        ctx.moveTo(0, 0);
        const arrowLen = obj.shape.type === 'circle' ? obj.shape.radius * scale * 1.8 : obj.shape.width/2 * scale * 1.8;
        ctx.lineTo(arrowLen, 0);
        ctx.moveTo(arrowLen - 10, -7);
        ctx.lineTo(arrowLen, 0);
        ctx.lineTo(arrowLen - 10, 7);
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 3;
        ctx.stroke();
        ctx.restore();

        if (obj.goal) {
          const goalPos = worldToCanvas(obj.goal.x, obj.goal.y, offset, scale, mapInfo.origin);
          ctx.fillStyle = obj.properties.color || "#2563eb";
          ctx.globalAlpha = 0.5;
          ctx.beginPath();
          ctx.arc(goalPos.x, goalPos.y, 10, 0, Math.PI * 2);
          ctx.fill();
          ctx.globalAlpha = 1;
          ctx.strokeStyle = '#1f2937';
          ctx.lineWidth = 2;
          ctx.stroke();
        }
      }
    });

    tempPoints.forEach((pt, i) => {
      const p = worldToCanvas(pt[0], pt[1], offset, scale, mapInfo.origin);
      ctx.fillStyle = '#fbbf24';
      ctx.beginPath();
      ctx.arc(p.x, p.y, 8, 0, Math.PI * 2);
      ctx.fill();
      
      if (i > 0) {
        const prev = worldToCanvas(tempPoints[i-1][0], tempPoints[i-1][1], offset, scale, mapInfo.origin);
        ctx.strokeStyle = '#fbbf24';
        ctx.lineWidth = 3;
        ctx.setLineDash([5, 5]);
        ctx.beginPath();
        ctx.moveTo(prev.x, prev.y);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
        ctx.setLineDash([]);
      }
      
      ctx.fillStyle = '#1f2937';
      ctx.font = 'bold 10px sans-serif';
      ctx.fillText((i + 1).toString(), p.x - 3, p.y + 4);
    });
  };

  const handleCanvasWheel = (e) => {
    e.preventDefault();
    const rect = canvasRef.current.getBoundingClientRect();
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    
    const worldBefore = canvasToWorld(mouseX, mouseY, offset, scale, mapInfo.origin);
    const zoomFactor = e.deltaY < 0 ? 1.15 : 0.87;
    const newScale = Math.min(Math.max(scale * zoomFactor, 10), 300);
    const worldAfter = canvasToWorld(mouseX, mouseY, offset, newScale, mapInfo.origin);
    
    setOffset({
      x: offset.x + (worldAfter.x - worldBefore.x) * newScale,
      y: offset.y - (worldAfter.y - worldBefore.y) * newScale
    });
    setScale(newScale);
  };

  const handleCanvasMouseDown = (e) => {
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = canvasToWorld(x, y, offset, scale, mapInfo.origin);

    if (e.button === 2 || e.button === 1) {
      e.preventDefault();
      setIsPanning(true);
      setPanStart({ x: e.clientX - offset.x, y: e.clientY - offset.y });
      return;
    }

    if (mode === 'select') {
      for (const item of objects) {
        if (isPointInShape(world, item.shape)) {
          setSelectedId(item.id);
          // Check if movement is possible
          const lockedX = locks[item.id + '_centerX'];
          const lockedY = locks[item.id + '_centerY'];
          if (!lockedX || !lockedY) {
            setIsDragging(true);
            setDragStart({ x: world.x, y: world.y, itemX: item.shape.center[0], itemY: item.shape.center[1] });
          }
          return;
        }
      }
      setSelectedId(null);
    }
  };

  const handleCanvasMouseMove = (e) => {
    if (isPanning) {
      setOffset({ x: e.clientX - panStart.x, y: e.clientY - panStart.y });
      return;
    }

    if (isDragging && selectedId && dragStart) {
      // Check if position is locked
      const lockedX = isLocked('centerX');
      const lockedY = isLocked('centerY');
      
      if (lockedX && lockedY) {
        // Both axes locked, can't move at all
        return;
      }

      const rect = canvasRef.current.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const world = canvasToWorld(x, y, offset, scale, mapInfo.origin);
      
      const dx = world.x - dragStart.x;
      const dy = world.y - dragStart.y;
      
      // Apply locks - keep original value if locked
      const newX = lockedX ? dragStart.itemX : +(dragStart.itemX + dx).toFixed(3);
      const newY = lockedY ? dragStart.itemY : +(dragStart.itemY + dy).toFixed(3);

      const newObjects = objects.map(o => 
        o.id === selectedId ? { 
          ...o, 
          shape: { ...o.shape, center: [newX, newY] },
          ...(o.pose && { pose: { ...o.pose, x: newX, y: newY } })
        } : o
      );
      setObjects(newObjects);
    }
  };

  const handleCanvasMouseUp = () => {
    if (isDragging) {
      saveHistory(objects);
    }
    setIsDragging(false);
    setIsPanning(false);
    setDragStart(null);
    setPanStart(null);
  };

  const handleCanvasClick = (e) => {
    if (isDragging || isPanning) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const world = canvasToWorld(x, y, offset, scale, mapInfo.origin);

    if (['polygon'].includes(mode)) {
      setTempPoints(p => [...p, [+world.x.toFixed(3), +world.y.toFixed(3)]]);
      return;
    }

    if (mode === 'triangle') {
      if (triangleType === 'custom' && tempPoints.length < 2) {
        setTempPoints(p => [...p, [+world.x.toFixed(3), +world.y.toFixed(3)]]);
      } else if (triangleType === 'custom' && tempPoints.length === 2) {
        setTempPoints(p => [...p, [+world.x.toFixed(3), +world.y.toFixed(3)]]);
        setTimeout(() => addObject('triangle', world), 10);
      } else {
        addObject('triangle', world);
      }
      return;
    }

    if (mode === 'circle') addObject('circle', world);
    if (mode === 'rect') {
      if (drawMode === 'two-points' && tempPoints.length === 0) {
        setTempPoints([[+world.x.toFixed(3), +world.y.toFixed(3)]]);
      } else if (drawMode === 'two-points' && tempPoints.length === 1) {
        setTempPoints(p => [...p, [+world.x.toFixed(3), +world.y.toFixed(3)]]);
        setTimeout(() => addObject('rectangle', world), 10);
      } else {
        addObject('rectangle', world);
      }
    }
  };

  const addObject = (type, world) => {
    const id = `${type}_${Date.now()}`;
    let center = [+world.x.toFixed(3), +world.y.toFixed(3)];
    
    const obj = {
      id,
      name: `${type}_${objects.filter(o => o.shape.type === type).length + 1}`,
      type: 'obstacle',
      shape: { type, center },
      properties: { color: "#f97316", material: "default" }
    };

    if (type === 'circle') {
      obj.shape.radius = 0.5;
      
      const angleMap = {
        'center': null,
        'top': [0, 0.5],
        'bottom': [0, -0.5],
        'left': [-0.5, 0],
        'right': [0.5, 0],
        'top-left': [-0.353, 0.353],
        'top-right': [0.353, 0.353],
        'bottom-left': [-0.353, -0.353],
        'bottom-right': [0.353, -0.353]
      };
      
      const offset = angleMap[drawMode];
      if (offset) {
        obj.shape.center = [center[0] - offset[0], center[1] - offset[1]];
      }
    }
    
    if (type === 'rectangle') {
      if (drawMode === 'two-points' && tempPoints.length === 2) {
        const p1 = tempPoints[0];
        const p2 = tempPoints[1];
        const dx = p2[0] - p1[0];
        const dy = p2[1] - p1[1];
        const width = Math.abs(dx);
        const height = Math.abs(dy);
        const rotation = Math.atan2(dy, dx);
        
        obj.shape.width = Math.sqrt(dx * dx + dy * dy);
        obj.shape.height = 0.6;
        obj.shape.rotation = rotation;
        obj.shape.center = [(p1[0] + p2[0]) / 2, (p1[1] + p2[1]) / 2];
        setTempPoints([]);
      } else {
        obj.shape.width = 1.0;
        obj.shape.height = 0.6;
        obj.shape.rotation = 0;
        
        const offsetMap = {
          'center': [0, 0],
          'top-left': [0.5, 0.3],
          'top-right': [-0.5, 0.3],
          'bottom-left': [0.5, -0.3],
          'bottom-right': [-0.5, -0.3],
          'top': [0, 0.3],
          'bottom': [0, -0.3],
          'left': [0.5, 0],
          'right': [-0.5, 0]
        };
        
        const offset = offsetMap[drawMode] || [0, 0];
        obj.shape.center = [center[0] - offset[0], center[1] - offset[1]];
      }
    }
    
    if (type === 'polygon') {
      if (tempPoints.length >= 3) {
        obj.shape.vertices = tempPoints;
        const centerX = tempPoints.reduce((sum, v) => sum + v[0], 0) / tempPoints.length;
        const centerY = tempPoints.reduce((sum, v) => sum + v[1], 0) / tempPoints.length;
        obj.shape.center = [+centerX.toFixed(3), +centerY.toFixed(3)];
        setTempPoints([]);
      } else {
        return;
      }
    }
    
    if (type === 'triangle') {
      if (triangleType === 'custom' && tempPoints.length === 3) {
        obj.shape.type = 'triangle';
        obj.shape.vertices = tempPoints;
        const centerX = (tempPoints[0][0] + tempPoints[1][0] + tempPoints[2][0]) / 3;
        const centerY = (tempPoints[0][1] + tempPoints[1][1] + tempPoints[2][1]) / 3;
        obj.shape.center = [+centerX.toFixed(3), +centerY.toFixed(3)];
        setTempPoints([]);
      } else if (triangleType !== 'custom') {
        const size = 1.0;
        let vertices = [];
        
        if (triangleType === 'equilateral') {
          const h = size * Math.sqrt(3) / 2;
          vertices = [
            [center[0], center[1] + 2*h/3],
            [center[0] - size/2, center[1] - h/3],
            [center[0] + size/2, center[1] - h/3]
          ];
        } else if (triangleType === 'right') {
          vertices = [
            [center[0] - size/2, center[1] - size/2],
            [center[0] + size/2, center[1] - size/2],
            [center[0] - size/2, center[1] + size/2]
          ];
        } else if (triangleType === 'isosceles') {
          vertices = [
            [center[0], center[1] + size/2],
            [center[0] - size/2, center[1] - size/2],
            [center[0] + size/2, center[1] - size/2]
          ];
        }
        
        obj.shape.type = 'triangle';
        obj.shape.vertices = vertices.map(v => [+v[0].toFixed(3), +v[1].toFixed(3)]);
      } else {
        return;
      }
    }

    const newObjects = [...objects, obj];
    setObjects(newObjects);
    saveHistory(newObjects);
    setSelectedId(id);
    setMode('select');
  };

  const updateItem = (updates) => {
    const newObjects = objects.map(o => o.id === selectedId ? { ...o, ...updates } : o);
    setObjects(newObjects);
    saveHistory(newObjects);
  };

  const toggleLock = (property) => {
    setLocks(prev => ({ ...prev, [selectedId + '_' + property]: !prev[selectedId + '_' + property] }));
  };

  const isLocked = (property) => {
    return locks[selectedId + '_' + property] || false;
  };

  const deleteSelected = () => {
    const newObjects = objects.filter(o => o.id !== selectedId);
    setObjects(newObjects);
    saveHistory(newObjects);
    setSelectedId(null);
  };

  const createNew = () => {
    if (objects.length > 0 && !confirm('Create new map? All unsaved changes will be lost.')) return;
    setMapInfo({
      name: "New_Map",
      resolution: 0.05,
      width: 10,
      height: 10,
      origin: [0, 0],
      originPosition: 'bottom-left'
    });
    setObjects([]);
    setHistory([]);
    setHistoryIndex(-1);
    setSelectedId(null);
    setTempPoints([]);
  };

  const exportJSON = () => {
    const data = { map_info: mapInfo, objects };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${mapInfo.name}.json`;
    a.click();
  };

  const importJSON = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = ev => {
      try {
        const json = JSON.parse(ev.target.result);
        setMapInfo(json.map_info || mapInfo);
        setObjects(json.objects || []);
        setHistory([json.objects || []]);
        setHistoryIndex(0);
        setSelectedId(null);
        setTempPoints([]);
      } catch {
        alert("Invalid JSON file");
      }
    };
    reader.readAsText(file);
  };

  const item = objects.find(i => i.id === selectedId);

  return (
    <div className="h-screen flex flex-col bg-gray-100">
      {/* Top Toolbar */}
      <div className="bg-white border-b border-gray-300 shadow-sm">
        <div className="px-4 py-2 flex items-center justify-between">
          <div className="flex items-center gap-4">
            <h1 className="text-xl font-bold text-blue-600 flex items-center gap-2">
              <Target className="text-blue-600" size={24} />
              RoboMap Studio
            </h1>
            <div className="flex gap-2">
              <button
                onClick={createNew}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded text-sm text-gray-700"
              >
                <Plus size={16} /> New
              </button>
              <button
                onClick={() => fileInputRef.current?.click()}
                className="flex items-center gap-2 px-3 py-1.5 bg-white border border-gray-300 hover:bg-gray-50 rounded text-sm text-gray-700"
              >
                <FolderOpen size={16} /> Open
              </button>
              <input ref={fileInputRef} type="file" accept=".json" onChange={importJSON} className="hidden" />
              <button
                onClick={exportJSON}
                className="flex items-center gap-2 px-3 py-1.5 bg-green-600 hover:bg-green-700 text-white rounded text-sm"
              >
                <Download size={16} /> Export
              </button>
            </div>
          </div>
          
          <div className="flex items-center gap-2">
            <button
              onClick={undo}
              disabled={historyIndex <= 0}
              className={`p-2 rounded ${historyIndex <= 0 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
              title="Undo (Ctrl+Z)"
            >
              <Undo size={18} />
            </button>
            <button
              onClick={redo}
              disabled={historyIndex >= history.length - 1}
              className={`p-2 rounded ${historyIndex >= history.length - 1 ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-gray-200 hover:bg-gray-300 text-gray-700'}`}
              title="Redo (Ctrl+Y)"
            >
              <Redo size={18} />
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            <button
              onClick={() => setShowGrid(!showGrid)}
              className={`p-2 rounded ${showGrid ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'}`}
              title="Toggle Grid"
            >
              <Grid size={18} />
            </button>
            <button
              onClick={() => setShowAxes(!showAxes)}
              className={`p-2 rounded ${showAxes ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'}`}
              title="Toggle Axes"
            >
              <MousePointer2 size={18} />
            </button>
            <button
              onClick={() => setShowRuler(!showRuler)}
              className={`p-2 rounded ${showRuler ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600'}`}
              title="Toggle Ruler"
            >
              <Ruler size={18} />
            </button>
            <div className="w-px h-6 bg-gray-300 mx-1"></div>
            <button
              onClick={() => setScale(s => Math.min(s * 1.2, 300))}
              className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
              title="Zoom In"
            >
              <ZoomIn size={18} />
            </button>
            <button
              onClick={() => setScale(s => Math.max(s / 1.2, 10))}
              className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
              title="Zoom Out"
            >
              <ZoomOut size={18} />
            </button>
            <button
              onClick={() => { setScale(50); setOffset({ x: 100, y: 700 }); }}
              className="p-2 bg-gray-200 hover:bg-gray-300 text-gray-700 rounded"
              title="Reset View"
            >
              <Maximize2 size={18} />
            </button>
          </div>
        </div>
        
        {/* Tool Palette */}
        <div className="px-4 py-3 border-t border-gray-200 flex items-center gap-2 flex-wrap">
          <span className="text-sm text-gray-600 mr-2 font-semibold">Tools:</span>
          <button
            onClick={() => { setMode('select'); setTempPoints([]); }}
            className={`p-2.5 rounded ${mode === 'select' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Select Tool (S)"
          >
            <Move size={18} />
          </button>
          
          {/* Circle with dropdown */}
          <div className="relative dropdown-container">
            <button
              onClick={() => { setMode('circle'); setTempPoints([]); setShowDropdown(null); }}
              className={`p-2.5 rounded-l ${mode === 'circle' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              title="Circle"
            >
              <Circle size={18} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDropdown(showDropdown === 'circle' ? null : 'circle'); }}
              className={`p-2.5 rounded-r border-l border-gray-300 ${mode === 'circle' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              <ChevronDown size={14} />
            </button>
            {showDropdown === 'circle' && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 min-w-[180px] overflow-hidden">
                {['center', 'top', 'bottom', 'left', 'right', 'top-left', 'top-right', 'bottom-left', 'bottom-right'].map(mode => (
                  <button 
                    key={mode}
                    onClick={() => { setDrawMode(mode); setShowDropdown(null); setMode('circle'); }} 
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <Crosshair size={16} />
                    <span className="capitalize">{mode.replace('-', ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Rectangle with dropdown */}
          <div className="relative dropdown-container">
            <button
              onClick={() => { setMode('rect'); setTempPoints([]); setShowDropdown(null); }}
              className={`p-2.5 rounded-l ${mode === 'rect' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              title="Rectangle"
            >
              <Square size={18} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDropdown(showDropdown === 'rect' ? null : 'rect'); }}
              className={`p-2.5 rounded-r border-l border-gray-300 ${mode === 'rect' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              <ChevronDown size={14} />
            </button>
            {showDropdown === 'rect' && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 min-w-[180px] overflow-hidden">
                {['center', 'top-left', 'top-right', 'bottom-left', 'bottom-right', 'top', 'bottom', 'left', 'right', 'two-points'].map(mode => (
                  <button 
                    key={mode}
                    onClick={() => { setDrawMode(mode); setShowDropdown(null); setMode('rect'); setTempPoints([]); }} 
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <Move size={16} />
                    <span className="capitalize">{mode.replace('-', ' ')}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          {/* Triangle with dropdown */}
          <div className="relative dropdown-container">
            <button
              onClick={() => { setMode('triangle'); setTempPoints([]); setShowDropdown(null); }}
              className={`p-2.5 rounded-l ${mode === 'triangle' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
              title="Triangle"
            >
              <Triangle size={18} />
            </button>
            <button
              onClick={(e) => { e.stopPropagation(); setShowDropdown(showDropdown === 'triangle' ? null : 'triangle'); }}
              className={`p-2.5 rounded-r border-l border-gray-300 ${mode === 'triangle' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            >
              <ChevronDown size={14} />
            </button>
            {showDropdown === 'triangle' && (
              <div className="absolute top-full left-0 mt-2 bg-white border border-gray-300 rounded-lg shadow-xl z-50 min-w-[180px] overflow-hidden">
                {['equilateral', 'isosceles', 'right', 'custom'].map(type => (
                  <button 
                    key={type}
                    onClick={() => { setTriangleType(type); setShowDropdown(null); setMode('triangle'); setTempPoints([]); }} 
                    className="w-full text-left px-4 py-2.5 text-sm text-gray-700 hover:bg-blue-50 flex items-center gap-2"
                  >
                    <Triangle size={16} />
                    <span className="capitalize">{type}</span>
                  </button>
                ))}
              </div>
            )}
          </div>
          
          <button
            onClick={() => { setMode('polygon'); setTempPoints([]); }}
            className={`p-2.5 rounded ${mode === 'polygon' ? 'bg-blue-600 text-white' : 'bg-gray-200 text-gray-700 hover:bg-gray-300'}`}
            title="Polygon"
          >
            <Pentagon size={18} />
          </button>
          
          {tempPoints.length >= 3 && mode === 'polygon' && (
            <button
              onClick={() => addObject('polygon', { x: 0, y: 0 })}
              className="px-4 py-2 bg-yellow-500 hover:bg-yellow-600 text-white rounded-lg text-sm ml-2 font-semibold"
            >
              Finish Polygon ({tempPoints.length} points)
            </button>
          )}
          
          <div className="ml-4 px-3 py-1.5 bg-gray-200 rounded-lg border border-gray-300">
            <span className="text-xs text-gray-600">Mode: </span>
            <span className="text-sm font-semibold text-blue-600">
              {mode === 'rect' && drawMode === 'two-points' ? 'TWO-POINTS' : 
               mode === 'triangle' ? triangleType.toUpperCase() : 
               drawMode.toUpperCase()}
            </span>
          </div>
        </div>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Left Sidebar */}
        <div ref={leftSidebarRef} style={{ width: leftSidebarWidth }} className="bg-white border-r border-gray-300 shadow-sm overflow-y-auto relative">
          <div className="p-4">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-sm font-bold text-gray-700 uppercase tracking-wider">Map Settings</h3>
              <button
                onClick={() => setShowMapSettings(!showMapSettings)}
                className={`p-1.5 rounded ${showMapSettings ? 'bg-blue-100 text-blue-600' : 'bg-gray-200 text-gray-600 hover:bg-gray-300'}`}
              >
                <Settings size={16} />
              </button>
            </div>
            
            <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Map Name</label>
            <input
              type="text"
              value={mapInfo.name}
              onChange={e => setMapInfo({...mapInfo, name: e.target.value})}
              className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
            />
            
            <div className="grid grid-cols-2 gap-3 mb-3">
              <div>
                <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Width (m)</label>
                <input
                  type="number"
                  value={mapInfo.width}
                  onChange={e => setMapInfo({...mapInfo, width: Math.max(1, +e.target.value)})}
                  className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  step="0.5"
                  min="1"
                />
              </div>
              <div>
                <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Height (m)</label>
                <input
                  type="number"
                  value={mapInfo.height}
                  onChange={e => setMapInfo({...mapInfo, height: Math.max(1, +e.target.value)})}
                  className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  step="0.5"
                  min="1"
                />
              </div>
            </div>
            
            <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Resolution (m/px)</label>
            <input
              type="number"
              value={mapInfo.resolution}
              onChange={e => setMapInfo({...mapInfo, resolution: +e.target.value})}
              className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
              step="0.01"
              min="0.01"
            />

            {showMapSettings && (
              <div className="mb-3 p-3 bg-blue-50 rounded-lg border border-blue-200">
                <label className="block text-xs text-gray-700 mb-1.5 font-semibold">Origin Position</label>
                <select
                  value={mapInfo.originPosition}
                  onChange={e => setMapInfo({...mapInfo, originPosition: e.target.value})}
                  className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-2 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="bottom-left">Bottom Left (0,0)</option>
                  <option value="center">Center</option>
                  <option value="top-left">Top Left</option>
                  <option value="bottom-right">Bottom Right</option>
                  <option value="top-right">Top Right</option>
                  <option value="custom">Custom</option>
                </select>
                
                <label className="block text-xs text-gray-700 mb-1.5 font-semibold">Origin Coordinates</label>
                <div className="grid grid-cols-2 gap-2">
                  <input
                    type="number"
                    value={mapInfo.origin[0]}
                    onChange={e => setMapInfo({...mapInfo, origin: [+e.target.value, mapInfo.origin[1]], originPosition: 'custom'})}
                    className="w-full bg-white border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    step="0.1"
                    placeholder="X"
                  />
                  <input
                    type="number"
                    value={mapInfo.origin[1]}
                    onChange={e => setMapInfo({...mapInfo, origin: [mapInfo.origin[0], +e.target.value], originPosition: 'custom'})}
                    className="w-full bg-white border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    step="0.1"
                    placeholder="Y"
                  />
                </div>
                
                <div className="mt-3 p-2 bg-white rounded border border-blue-300">
                  <div className="text-xs text-gray-700 mb-1">
                    <span className="font-semibold">Map Bounds:</span>
                  </div>
                  <div className="text-xs text-gray-600">
                    X: {mapInfo.origin[0].toFixed(2)} to {(mapInfo.origin[0] + mapInfo.width).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600">
                    Y: {mapInfo.origin[1].toFixed(2)} to {(mapInfo.origin[1] + mapInfo.height).toFixed(2)}
                  </div>
                  <div className="text-xs text-gray-600 mt-1">
                    <span className="font-semibold">Area:</span> {(mapInfo.width * mapInfo.height).toFixed(2)} m²
                  </div>
                </div>
              </div>
            )}

            <div className="mt-6 pt-4 border-t border-gray-300">
              <h4 className="text-sm font-bold mb-3 text-gray-700 flex items-center justify-between">
                <span>Objects ({objects.length})</span>
                {objects.length > 0 && (
                  <button
                    onClick={() => { 
                      if (confirm('Clear all objects?')) {
                        const newObjects = [];
                        setObjects(newObjects);
                        saveHistory(newObjects);
                        setSelectedId(null);
                      }
                    }}
                    className="text-xs px-2 py-1 bg-red-100 hover:bg-red-200 text-red-700 rounded"
                  >
                    Clear All
                  </button>
                )}
              </h4>
              <div className="space-y-1.5 max-h-96 overflow-y-auto">
                {objects.map(obj => (
                  <div
                    key={obj.id}
                    onClick={() => setSelectedId(obj.id)}
                    className={`text-xs px-3 py-2.5 rounded-lg cursor-pointer flex justify-between items-center ${
                      selectedId === obj.id 
                        ? 'bg-blue-600 text-white shadow-md' 
                        : 'bg-gray-100 text-gray-700 hover:bg-gray-200 border border-gray-200'
                    }`}
                  >
                    <span className="font-medium">{obj.name}</span>
                    <span className={`text-xs px-2 py-0.5 rounded ${selectedId === obj.id ? 'bg-blue-700' : 'bg-gray-200 text-gray-600'}`}>
                      {obj.type}
                    </span>
                  </div>
                ))}
                {objects.length === 0 && (
                  <div className="text-xs text-gray-500 text-center py-8 bg-gray-50 rounded-lg border border-gray-200 border-dashed">
                    <Circle size={32} className="mx-auto mb-2 opacity-30" />
                    No objects yet
                  </div>
                )}
              </div>
            </div>
          </div>
          
          {/* Resize handle */}
          <div
            className="absolute top-0 right-0 w-1 h-full cursor-col-resize hover:bg-blue-400 bg-gray-300"
            onMouseDown={() => setIsResizingLeft(true)}
          >
            <div className="absolute top-1/2 right-0 transform translate-x-1/2 -translate-y-1/2 bg-gray-400 rounded-full p-1">
              <GripVertical size={12} className="text-white" />
            </div>
          </div>
        </div>

        {/* Canvas */}
        <div className="flex-1 overflow-hidden bg-gray-200 flex items-center justify-center p-4">
          <canvas
            ref={canvasRef}
            width={1400}
            height={800}
            onClick={handleCanvasClick}
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseUp={handleCanvasMouseUp}
            onMouseLeave={handleCanvasMouseUp}
            onWheel={handleCanvasWheel}
            onContextMenu={(e) => e.preventDefault()}
            className="shadow-xl rounded-lg bg-white"
            style={{ 
              cursor: mode === 'select' 
                ? (selectedId && locks[selectedId + '_centerX'] && locks[selectedId + '_centerY'] ? 'not-allowed' : 'default')
                : 'crosshair' 
            }}
          />
        </div>

        {/* Right Sidebar */}
        <div ref={rightSidebarRef} style={{ width: rightSidebarWidth }} className="bg-white border-l border-gray-300 shadow-sm overflow-y-auto relative">
          <div className="p-4">
            {!item ? (
              <div className="text-sm text-gray-500 text-center py-12">
                <div className="mb-4 text-gray-400">
                  <MousePointer2 size={64} className="mx-auto" />
                </div>
                <p className="text-gray-600 font-semibold">Select an object to edit</p>
                <p className="text-xs text-gray-500 mt-2">Click on any object in the canvas</p>
              </div>
            ) : (
              <>
                <h3 className="text-sm font-bold mb-4 text-gray-700 uppercase tracking-wider border-b border-gray-300 pb-2">Properties</h3>
                
                <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Name</label>
                <input
                  type="text"
                  value={item.name}
                  onChange={e => updateItem({ name: e.target.value })}
                  className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                />

                <label className="block text-xs text-gray-600 mb-1.5 font-semibold">ID</label>
                <input
                  type="text"
                  value={item.id}
                  disabled
                  className="w-full bg-gray-100 border border-gray-300 px-3 py-2 rounded text-sm mb-3 text-gray-500 cursor-not-allowed"
                />

                <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Type</label>
                <select
                  value={item.type}
                  onChange={e => updateItem({ type: e.target.value })}
                  className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                >
                  <option value="obstacle">Obstacle</option>
                  <option value="landmark">Landmark</option>
                  <option value="zone">Zone</option>
                  <option value="wall">Wall</option>
                  <option value="door">Door</option>
                  <option value="robot">Robot</option>
                </select>

                {item.type === 'door' && (
                  <>
                    <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Door State</label>
                    <select
                      value={item.properties?.state || 'closed'}
                      onChange={e => updateItem({ properties: { ...item.properties, state: e.target.value } })}
                      className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    >
                      <option value="open">Open</option>
                      <option value="closed">Closed</option>
                    </select>
                  </>
                )}

                <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Color</label>
                <div className="flex gap-2 mb-3">
                  <input
                    type="color"
                    value={item.properties?.color || "#f97316"}
                    onChange={e => updateItem({ properties: { ...item.properties, color: e.target.value } })}
                    className="w-16 h-10 rounded border-2 border-gray-300 cursor-pointer"
                  />
                  <input
                    type="text"
                    value={item.properties?.color || "#f97316"}
                    onChange={e => updateItem({ properties: { ...item.properties, color: e.target.value } })}
                    className="flex-1 bg-white border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  />
                </div>

                {item.properties?.material !== undefined && (
                  <>
                    <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Material</label>
                    <input
                      type="text"
                      value={item.properties.material}
                      onChange={e => updateItem({ properties: { ...item.properties, material: e.target.value } })}
                      className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                    />
                  </>
                )}

                <div className="border-t border-gray-300 pt-4 mt-4">
                  <h4 className="text-xs font-bold mb-3 text-gray-700 uppercase tracking-wider">Shape Properties</h4>
                  
                  <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Shape Type</label>
                  <select
                    value={item.shape.type}
                    onChange={e => {
                      const newShape = { ...item.shape, type: e.target.value };
                      if (e.target.value === 'circle' && !newShape.radius) newShape.radius = 0.5;
                      if (e.target.value === 'rectangle' && (!newShape.width || !newShape.height)) {
                        newShape.width = 1.0;
                        newShape.height = 0.6;
                        newShape.rotation = 0;
                      }
                      updateItem({ shape: newShape });
                    }}
                    className="w-full bg-white border border-gray-300 px-3 py-2 rounded text-sm mb-3 focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                  >
                    <option value="circle">Circle</option>
                    <option value="rectangle">Rectangle</option>
                    <option value="triangle">Triangle</option>
                    <option value="polygon">Polygon</option>
                  </select>
                  
                  <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Center Position</label>
                  <div className="grid grid-cols-2 gap-2 mb-3">
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <input
                          type="number"
                          value={item.shape.center[0]}
                          onChange={e => {
                            if (!isLocked('centerX')) {
                              const newCenter = [+e.target.value, item.shape.center[1]];
                              updateItem({ 
                                shape: { ...item.shape, center: newCenter },
                                ...(item.pose && { pose: { ...item.pose, x: +e.target.value } })
                              });
                            }
                          }}
                          disabled={isLocked('centerX')}
                          className={`w-full border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('centerX') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                          step="0.01"
                        />
                        <button
                          onClick={() => toggleLock('centerX')}
                          className="p-1.5 bg-gray-200 hover:bg-gray-300 rounded"
                        >
                          {isLocked('centerX') ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                      </div>
                      <span className="text-xs text-gray-500">X (m)</span>
                    </div>
                    <div>
                      <div className="flex items-center gap-1 mb-1">
                        <input
                          type="number"
                          value={item.shape.center[1]}
                          onChange={e => {
                            if (!isLocked('centerY')) {
                              const newCenter = [item.shape.center[0], +e.target.value];
                              updateItem({ 
                                shape: { ...item.shape, center: newCenter },
                                ...(item.pose && { pose: { ...item.pose, y: +e.target.value } })
                              });
                            }
                          }}
                          disabled={isLocked('centerY')}
                          className={`w-full border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('centerY') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                          step="0.01"
                        />
                        <button
                          onClick={() => toggleLock('centerY')}
                          className="p-1.5 bg-gray-200 hover:bg-gray-300 rounded"
                        >
                          {isLocked('centerY') ? <Lock size={14} /> : <Unlock size={14} />}
                        </button>
                      </div>
                      <span className="text-xs text-gray-500">Y (m)</span>
                    </div>
                  </div>

                  {item.shape.type === 'circle' && (
                    <>
                      <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Radius (m)</label>
                      <div className="flex items-center gap-1 mb-2">
                        <input
                          type="number"
                          value={item.shape.radius}
                          onChange={e => !isLocked('radius') && updateItem({ shape: { ...item.shape, radius: +e.target.value } })}
                          disabled={isLocked('radius')}
                          className={`flex-1 border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('radius') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                          step="0.01"
                          min="0.01"
                        />
                        <button
                          onClick={() => toggleLock('radius')}
                          className="p-2 bg-gray-200 hover:bg-gray-300 rounded"
                        >
                          {isLocked('radius') ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                      </div>
                      
                      <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Diameter (m)</label>
                      <div className="flex items-center gap-1 mb-3">
                        <input
                          type="number"
                          value={(item.shape.radius * 2).toFixed(3)}
                          onChange={e => !isLocked('radius') && updateItem({ shape: { ...item.shape, radius: +e.target.value / 2 } })}
                          disabled={isLocked('radius')}
                          className={`flex-1 border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('radius') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                          step="0.01"
                          min="0.02"
                        />
                        <button
                          onClick={() => toggleLock('radius')}
                          className="p-2 bg-gray-200 hover:bg-gray-300 rounded"
                        >
                          {isLocked('radius') ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                      </div>
                      
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-3">
                        <div className="flex justify-between text-xs mb-1.5 text-gray-700">
                          <span>Circumference:</span>
                          <span className="font-semibold text-blue-600">{(2 * Math.PI * item.shape.radius).toFixed(3)} m</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-700">
                          <span>Area:</span>
                          <span className="font-semibold text-blue-600">{(Math.PI * item.shape.radius * item.shape.radius).toFixed(3)} m²</span>
                        </div>
                      </div>
                    </>
                  )}

                  {item.shape.type === 'rectangle' && (
                    <>
                      <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Width (m)</label>
                      <div className="flex items-center gap-1 mb-2">
                        <input
                          type="number"
                          value={item.shape.width}
                          onChange={e => !isLocked('width') && updateItem({ shape: { ...item.shape, width: +e.target.value } })}
                          disabled={isLocked('width')}
                          className={`flex-1 border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('width') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                          step="0.01"
                          min="0.01"
                        />
                        <button
                          onClick={() => toggleLock('width')}
                          className="p-2 bg-gray-200 hover:bg-gray-300 rounded"
                        >
                          {isLocked('width') ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                      </div>
                      
                      <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Height (m)</label>
                      <div className="flex items-center gap-1 mb-2">
                        <input
                          type="number"
                          value={item.shape.height}
                          onChange={e => !isLocked('height') && updateItem({ shape: { ...item.shape, height: +e.target.value } })}
                          disabled={isLocked('height')}
                          className={`flex-1 border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('height') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                          step="0.01"
                          min="0.01"
                        />
                        <button
                          onClick={() => toggleLock('height')}
                          className="p-2 bg-gray-200 hover:bg-gray-300 rounded"
                        >
                          {isLocked('height') ? <Lock size={16} /> : <Unlock size={16} />}
                        </button>
                      </div>
                      
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-xs text-gray-600 font-semibold">Rotation</label>
                        <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                          <button
                            onClick={() => setAngleUnit('rad')}
                            className={`text-xs px-2 py-0.5 rounded ${angleUnit === 'rad' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                          >
                            rad
                          </button>
                          <button
                            onClick={() => setAngleUnit('deg')}
                            className={`text-xs px-2 py-0.5 rounded ${angleUnit === 'deg' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                          >
                            deg
                          </button>
                        </div>
                      </div>
                      
                      <div className="flex gap-2 mb-3">
                        <div className="flex items-center gap-1 flex-1">
                          <input
                            type="number"
                            value={angleUnit === 'rad' ? (item.shape.rotation || 0).toFixed(4) : parseFloat(rad2deg(item.shape.rotation || 0))}
                            onChange={e => {
                              if (!isLocked('rotation')) {
                                const inputVal = +e.target.value;
                                const newRot = angleUnit === 'rad' ? inputVal : deg2rad(inputVal);
                                updateItem({ shape: { ...item.shape, rotation: newRot } });
                              }
                            }}
                            disabled={isLocked('rotation')}
                            className={`w-full border border-gray-300 px-3 py-2 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('rotation') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                            step={angleUnit === 'rad' ? '0.0174' : '1'}
                          />
                          <button
                            onClick={() => toggleLock('rotation')}
                            className="p-2 bg-gray-200 hover:bg-gray-300 rounded"
                          >
                            {isLocked('rotation') ? <Lock size={16} /> : <Unlock size={16} />}
                          </button>
                        </div>
                        <button
                          onClick={() => !isLocked('rotation') && updateItem({ shape: { ...item.shape, rotation: ((item.shape.rotation || 0) + Math.PI/4) % (2*Math.PI) } })}
                          disabled={isLocked('rotation')}
                          className={`p-2 rounded ${isLocked('rotation') ? 'bg-gray-200 text-gray-400 cursor-not-allowed' : 'bg-blue-600 hover:bg-blue-700 text-white'}`}
                          title="Rotate 45°"
                        >
                          <RotateCw size={16} />
                        </button>
                      </div>
                      
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-3">
                        <div className="flex justify-between text-xs mb-1.5 text-gray-700">
                          <span>Perimeter:</span>
                          <span className="font-semibold text-blue-600">{(2 * (item.shape.width + item.shape.height)).toFixed(3)} m</span>
                        </div>
                        <div className="flex justify-between text-xs text-gray-700">
                          <span>Area:</span>
                          <span className="font-semibold text-blue-600">{(item.shape.width * item.shape.height).toFixed(3)} m²</span>
                        </div>
                      </div>
                    </>
                  )}

                  {(item.shape.type === 'polygon' || item.shape.type === 'triangle') && (
                    <>
                      <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Vertices</label>
                      <div className="max-h-48 overflow-y-auto mb-2 space-y-1.5">
                        {item.shape.vertices.map((v, i) => (
                          <div key={i} className="grid grid-cols-2 gap-2">
                            <input
                              type="number"
                              value={v[0]}
                              onChange={e => {
                                const newVertices = [...item.shape.vertices];
                                newVertices[i] = [+e.target.value, v[1]];
                                const newCenter = [
                                  newVertices.reduce((sum, v) => sum + v[0], 0) / newVertices.length,
                                  newVertices.reduce((sum, v) => sum + v[1], 0) / newVertices.length
                                ];
                                updateItem({ shape: { ...item.shape, vertices: newVertices, center: newCenter } });
                              }}
                              className="bg-white border border-gray-300 px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                              step="0.01"
                            />
                            <input
                              type="number"
                              value={v[1]}
                              onChange={e => {
                                const newVertices = [...item.shape.vertices];
                                newVertices[i] = [v[0], +e.target.value];
                                const newCenter = [
                                  newVertices.reduce((sum, v) => sum + v[0], 0) / newVertices.length,
                                  newVertices.reduce((sum, v) => sum + v[1], 0) / newVertices.length
                                ];
                                updateItem({ shape: { ...item.shape, vertices: newVertices, center: newCenter } });
                              }}
                              className="bg-white border border-gray-300 px-2 py-1.5 rounded text-xs focus:outline-none focus:ring-1 focus:ring-blue-500 text-gray-900"
                              step="0.01"
                            />
                          </div>
                        ))}
                      </div>
                      <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-3">
                        <div className="flex justify-between text-xs text-gray-700">
                          <span>Vertices:</span>
                          <span className="font-semibold text-blue-600">{item.shape.vertices.length}</span>
                        </div>
                      </div>
                    </>
                  )}
                </div>

                {item.type === 'robot' && (
                  <div className="border-t border-gray-300 pt-4 mt-4">
                    <h4 className="text-xs font-bold mb-3 text-gray-700 uppercase tracking-wider">Robot Properties</h4>
                    
                    <div className="flex items-center justify-between mb-3">
                      <label className="text-xs text-gray-600 font-semibold">Angle Unit</label>
                      <div className="flex items-center gap-2 bg-gray-100 rounded px-2 py-1">
                        <button
                          onClick={() => setAngleUnit('rad')}
                          className={`text-xs px-2 py-0.5 rounded ${angleUnit === 'rad' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                        >
                          rad
                        </button>
                        <button
                          onClick={() => setAngleUnit('deg')}
                          className={`text-xs px-2 py-0.5 rounded ${angleUnit === 'deg' ? 'bg-blue-600 text-white' : 'text-gray-600'}`}
                        >
                          deg
                        </button>
                      </div>
                    </div>
                    
                    <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Pose</label>
                    <div className="grid grid-cols-3 gap-2 mb-3">
                      <div>
                        <input
                          type="number"
                          value={item.pose?.x || item.shape.center[0]}
                          onChange={e => updateItem({ 
                            pose: { ...(item.pose || {}), x: +e.target.value },
                            shape: { ...item.shape, center: [+e.target.value, item.pose?.y || item.shape.center[1]] }
                          })}
                          className="w-full bg-white border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          step="0.01"
                        />
                        <span className="text-xs text-gray-500 mt-0.5 block">X (m)</span>
                      </div>
                      <div>
                        <input
                          type="number"
                          value={item.pose?.y || item.shape.center[1]}
                          onChange={e => updateItem({ 
                            pose: { ...(item.pose || {}), y: +e.target.value },
                            shape: { ...item.shape, center: [item.pose?.x || item.shape.center[0], +e.target.value] }
                          })}
                          className="w-full bg-white border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          step="0.01"
                        />
                        <span className="text-xs text-gray-500 mt-0.5 block">Y (m)</span>
                      </div>
                      <div>
                        <div className="flex items-center gap-1">
                          <input
                            type="number"
                            value={angleUnit === 'rad' ? (item.pose?.theta || 0).toFixed(4) : parseFloat(rad2deg(item.pose?.theta || 0))}
                            onChange={e => {
                              if (!isLocked('theta')) {
                                const inputVal = +e.target.value;
                                const newTheta = angleUnit === 'rad' ? inputVal : deg2rad(inputVal);
                                updateItem({ pose: { ...(item.pose || {}), theta: newTheta } });
                              }
                            }}
                            disabled={isLocked('theta')}
                            className={`w-full border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 ${isLocked('theta') ? 'bg-gray-100 text-gray-500' : 'bg-white text-gray-900'}`}
                            step={angleUnit === 'rad' ? '0.0174' : '1'}
                          />
                          <button
                            onClick={() => toggleLock('theta')}
                            className="p-1 bg-gray-200 hover:bg-gray-300 rounded"
                          >
                            {isLocked('theta') ? <Lock size={12} /> : <Unlock size={12} />}
                          </button>
                        </div>
                        <span className="text-xs text-gray-500 mt-0.5 block">θ ({angleUnit})</span>
                      </div>
                    </div>
                    
                    <div className="bg-blue-50 p-3 rounded-lg border border-blue-200 mb-3">
                      <div className="flex justify-between text-xs text-gray-700 mb-1">
                        <span className="font-semibold">Direction:</span>
                        <span className="text-blue-600 font-semibold">
                          {angleUnit === 'rad' 
                            ? `${(item.pose?.theta || 0).toFixed(4)} rad` 
                            : `${parseFloat(rad2deg(item.pose?.theta || 0))}°`}
                        </span>
                      </div>
                      <div className="flex justify-between text-xs text-gray-700">
                        <span>Alternate:</span>
                        <span className="text-gray-600">
                          {angleUnit === 'deg' 
                            ? `${(item.pose?.theta || 0).toFixed(4)} rad` 
                            : `${parseFloat(rad2deg(item.pose?.theta || 0))}°`}
                        </span>
                      </div>
                    </div>

                    <label className="block text-xs text-gray-600 mb-1.5 font-semibold">Goal Position</label>
                    <div className="grid grid-cols-2 gap-2 mb-3">
                      <div>
                        <input
                          type="number"
                          value={item.goal?.x || 0}
                          onChange={e => updateItem({ goal: { ...(item.goal || {}), x: +e.target.value, y: item.goal?.y || 0 } })}
                          className="w-full bg-white border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          step="0.01"
                        />
                        <span className="text-xs text-gray-500 mt-0.5 block">X (m)</span>
                      </div>
                      <div>
                        <input
                          type="number"
                          value={item.goal?.y || 0}
                          onChange={e => updateItem({ goal: { ...(item.goal || {}), y: +e.target.value, x: item.goal?.x || 0 } })}
                          className="w-full bg-white border border-gray-300 px-2 py-1.5 rounded text-sm focus:outline-none focus:ring-2 focus:ring-blue-500 text-gray-900"
                          step="0.01"
                        />
                        <span className="text-xs text-gray-500 mt-0.5 block">Y (m)</span>
                      </div>
                    </div>
                  </div>
                )}

                <button
                  onClick={deleteSelected}
                  className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-red-600 hover:bg-red-700 text-white rounded-lg mt-6 font-semibold shadow-md"
                >
                  <Trash2 size={16} /> Delete {item.name}
                </button>
              </>
            )}
          </div>
          
          {/* Resize handle */}
          <div
            className="absolute top-0 left-0 w-1 h-full cursor-col-resize hover:bg-blue-400 bg-gray-300"
            onMouseDown={() => setIsResizingRight(true)}
          >
            <div className="absolute top-1/2 left-0 transform -translate-x-1/2 -translate-y-1/2 bg-gray-400 rounded-full p-1">
              <GripVertical size={12} className="text-white" />
            </div>
          </div>
        </div>
      </div>

      {/* Status Bar */}
      <div className="bg-white border-t border-gray-300 px-4 py-2.5 text-xs text-gray-600 flex items-center justify-between">
        <div className="flex gap-6">
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Mode:</span>
            <span className="px-2 py-0.5 bg-blue-600 text-white rounded font-medium">{mode.toUpperCase()}</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Draw:</span>
            <span className="text-blue-600 font-medium">
              {mode === 'triangle' ? triangleType : drawMode}
            </span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Scale:</span>
            <span className="text-green-600 font-medium">{scale.toFixed(0)}px/m</span>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="font-semibold text-gray-700">Objects:</span>
            <span className="text-orange-600 font-medium">{objects.length}</span>
          </span>
          {item && (
            <span className="flex items-center gap-1.5">
              <span className="font-semibold text-gray-700">Selected:</span>
              <span className="text-purple-600 font-medium">{item.name}</span>
            </span>
          )}
        </div>
        <div className="text-gray-500 flex items-center gap-4">
          {tempPoints.length > 0 && (
            <span className="text-yellow-600 font-medium">
              {tempPoints.length} point{tempPoints.length > 1 ? 's' : ''} placed
            </span>
          )}
          <span>Right/Middle Click: Pan</span>
          <span>Wheel: Zoom</span>
          <span>Ctrl+Z: Undo</span>
          <span>Ctrl+Y: Redo</span>
        </div>
      </div>
    </div>
  );
}