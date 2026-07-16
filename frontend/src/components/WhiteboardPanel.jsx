import React, { useRef, useState, useEffect } from "react";
import {
  Pen,
  Highlighter,
  Square,
  Circle,
  ArrowRight,
  Minus,
  Type,
  StickyNote,
  Eraser,
  Undo2,
  Redo2,
  Trash2,
  Download,
} from "lucide-react";

export default function WhiteboardPanel({
  roomId,
  sessionId,
  socket,
  initialShapes = [],
  allowEditing = true,
  onShapesChange,
}) {
  const canvasRef = useRef(null);
  const containerRef = useRef(null);
  const [shapes, setShapes] = useState(initialShapes);
  const [tool, setTool] = useState("pen"); // pen | highlighter | rectangle | circle | arrow | line | text | sticky | eraser
  const [color, setColor] = useState("#5b8def");
  const [lineWidth, setLineWidth] = useState(3);
  const [history, setHistory] = useState([]);
  const [isDrawing, setIsDrawing] = useState(false);
  const [currentLine, setCurrentLine] = useState(null);
  const [draggedSticky, setDraggedSticky] = useState(null);
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  // Sync initial shapes
  useEffect(() => {
    setShapes(initialShapes);
  }, [initialShapes]);

  // WebSocket Listener for incoming shapes
  useEffect(() => {
    if (!socket) return;
    const handleWsMessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === "whiteboard_update" && data.room_id === roomId) {
          if (data.sender_session_id !== sessionId) {
            setShapes(data.whiteboard_shapes || []);
          }
        }
      } catch (err) {
        // Silent error
      }
    };
    socket.addEventListener("message", handleWsMessage);
    return () => socket.removeEventListener("message", handleWsMessage);
  }, [socket, roomId, sessionId]);

  // Draw loop
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    shapes.forEach((shape) => {
      ctx.strokeStyle = shape.color;
      ctx.fillStyle = shape.color;
      ctx.lineWidth = shape.lineWidth || 2;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";

      if (shape.type === "line" || shape.type === "pen" || shape.type === "highlighter") {
        if (shape.type === "highlighter") {
          ctx.save();
          ctx.globalAlpha = 0.4;
        }
        ctx.beginPath();
        const pts = shape.points || [];
        if (pts.length > 0) {
          ctx.moveTo(pts[0].x, pts[0].y);
          for (let i = 1; i < pts.length; i++) {
            ctx.lineTo(pts[i].x, pts[i].y);
          }
          ctx.stroke();
        }
        if (shape.type === "highlighter") {
          ctx.restore();
        }
      } else if (shape.type === "rectangle") {
        ctx.beginPath();
        ctx.rect(shape.x, shape.y, shape.w, shape.h);
        ctx.stroke();
      } else if (shape.type === "circle") {
        ctx.beginPath();
        const radius = Math.sqrt(shape.w * shape.w + shape.h * shape.h) / 2;
        ctx.arc(shape.x + shape.w / 2, shape.y + shape.h / 2, radius, 0, 2 * Math.PI);
        ctx.stroke();
      } else if (shape.type === "arrow") {
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y);
        ctx.lineTo(shape.x + shape.w, shape.y + shape.h);
        ctx.stroke();
        // Arrow head
        const angle = Math.atan2(shape.h, shape.w);
        ctx.beginPath();
        ctx.moveTo(shape.x + shape.w, shape.y + shape.h);
        ctx.lineTo(
          shape.x + shape.w - 15 * Math.cos(angle - Math.PI / 6),
          shape.y + shape.h - 15 * Math.sin(angle - Math.PI / 6)
        );
        ctx.lineTo(
          shape.x + shape.w - 15 * Math.cos(angle + Math.PI / 6),
          shape.y + shape.h - 15 * Math.sin(angle + Math.PI / 6)
        );
        ctx.closePath();
        ctx.fill();
      } else if (shape.type === "simple_line") {
        ctx.beginPath();
        ctx.moveTo(shape.x, shape.y);
        ctx.lineTo(shape.x + shape.w, shape.y + shape.h);
        ctx.stroke();
      } else if (shape.type === "text") {
        ctx.font = `${shape.fontSize || 16}px Inter, sans-serif`;
        ctx.fillText(shape.text, shape.x, shape.y);
      }
    });

    if (currentLine && (tool === "pen" || tool === "highlighter")) {
      if (tool === "highlighter") {
        ctx.save();
        ctx.globalAlpha = 0.4;
      }
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      ctx.lineCap = "round";
      ctx.beginPath();
      const pts = currentLine.points || [];
      if (pts.length > 0) {
        ctx.moveTo(pts[0].x, pts[0].y);
        for (let i = 1; i < pts.length; i++) {
          ctx.lineTo(pts[i].x, pts[i].y);
        }
        ctx.stroke();
      }
      if (tool === "highlighter") {
        ctx.restore();
      }
    } else if (currentLine) {
      // Preview shape
      ctx.strokeStyle = color;
      ctx.lineWidth = lineWidth;
      if (tool === "rectangle") {
        ctx.strokeRect(currentLine.x, currentLine.y, currentLine.w, currentLine.h);
      } else if (tool === "circle") {
        ctx.beginPath();
        const radius = Math.sqrt(currentLine.w * currentLine.w + currentLine.h * currentLine.h) / 2;
        ctx.arc(
          currentLine.x + currentLine.w / 2,
          currentLine.y + currentLine.h / 2,
          radius,
          0,
          2 * Math.PI
        );
        ctx.stroke();
      } else if (tool === "arrow") {
        ctx.beginPath();
        ctx.moveTo(currentLine.x, currentLine.y);
        ctx.lineTo(currentLine.x + currentLine.w, currentLine.y + currentLine.h);
        ctx.stroke();
      } else if (tool === "line") {
        ctx.beginPath();
        ctx.moveTo(currentLine.x, currentLine.y);
        ctx.lineTo(currentLine.x + currentLine.w, currentLine.y + currentLine.h);
        ctx.stroke();
      }
    }
  }, [shapes, currentLine, tool, color, lineWidth]);

  // Resize listener
  useEffect(() => {
    const handleResize = () => {
      const canvas = canvasRef.current;
      const container = containerRef.current;
      if (!canvas || !container) return;
      canvas.width = container.clientWidth;
      canvas.height = 500;
    };
    handleResize();
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  const broadcastShapes = (newShapes, action = "draw") => {
    if (!socket || !allowEditing) return;
    socket.send(
      JSON.stringify({
        type: "whiteboard_update",
        room_id: roomId,
        whiteboard_shapes: newShapes,
        action,
      })
    );
  };

  const getPos = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const handleMouseDown = (e) => {
    if (!allowEditing) return;
    const pos = getPos(e);

    // If text tool, prompt and add text
    if (tool === "text") {
      const text = prompt("Enter text:");
      if (text) {
        const newShape = {
          type: "text",
          x: pos.x,
          y: pos.y,
          text,
          color,
          fontSize: 16,
        };
        const updated = [...shapes, newShape];
        setShapes(updated);
        onShapesChange?.(updated);
        broadcastShapes(updated);
      }
      return;
    }

    // If sticky note tool, add sticky
    if (tool === "sticky") {
      const text = prompt("Enter sticky note text:");
      if (text) {
        const newSticky = {
          type: "sticky",
          id: Math.random().toString(),
          x: pos.x,
          y: pos.y,
          w: 120,
          h: 120,
          text,
          color,
        };
        const updated = [...shapes, newSticky];
        setShapes(updated);
        onShapesChange?.(updated);
        broadcastShapes(updated);
      }
      return;
    }

    if (tool === "eraser") {
      // Remove clicked shape
      const updated = shapes.filter((shape) => {
        if (shape.type === "rectangle" || shape.type === "circle") {
          return !(
            pos.x >= shape.x &&
            pos.x <= shape.x + shape.w &&
            pos.y >= shape.y &&
            pos.y <= shape.y + shape.h
          );
        }
        if (shape.type === "sticky") {
          return !(
            pos.x >= shape.x &&
            pos.x <= shape.x + shape.w &&
            pos.y >= shape.y &&
            pos.y <= shape.y + shape.h
          );
        }
        return true;
      });
      setShapes(updated);
      onShapesChange?.(updated);
      broadcastShapes(updated);
      return;
    }

    setIsDrawing(true);
    if (tool === "pen" || tool === "highlighter") {
      setCurrentLine({
        type: tool,
        points: [pos],
        color,
        lineWidth,
      });
    } else {
      setCurrentLine({
        type: tool === "line" ? "simple_line" : tool,
        x: pos.x,
        y: pos.y,
        w: 0,
        h: 0,
        color,
        lineWidth,
      });
    }
  };

  const handleMouseMove = (e) => {
    if (!isDrawing || !currentLine) return;
    const pos = getPos(e);

    if (tool === "pen" || tool === "highlighter") {
      setCurrentLine((curr) => {
        const lastPt = curr.points[curr.points.length - 1];
        const dist = lastPt ? Math.hypot(pos.x - lastPt.x, pos.y - lastPt.y) : 999;
        if (dist < 3) return curr;
        return {
          ...curr,
          points: [...curr.points, { x: Math.round(pos.x), y: Math.round(pos.y) }],
        };
      });
    } else {
      setCurrentLine((curr) => ({
        ...curr,
        w: Math.round(pos.x - curr.x),
        h: Math.round(pos.y - curr.y),
      }));
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing) return;
    setIsDrawing(false);
    if (currentLine) {
      const updated = [...shapes, currentLine];
      setShapes(updated);
      onShapesChange?.(updated);
      setHistory([]);
      broadcastShapes(updated);
    }
    setCurrentLine(null);
  };

  // Undo / Redo
  const handleUndo = () => {
    if (shapes.length === 0) return;
    const last = shapes[shapes.length - 1];
    setHistory((prev) => [...prev, last]);
    const updated = shapes.slice(0, -1);
    setShapes(updated);
    onShapesChange?.(updated);
    broadcastShapes(updated, "undo");
  };

  const handleRedo = () => {
    if (history.length === 0) return;
    const next = history[history.length - 1];
    setHistory((prev) => prev.slice(0, -1));
    const updated = [...shapes, next];
    setShapes(updated);
    onShapesChange?.(updated);
    broadcastShapes(updated, "redo");
  };

  const handleClear = () => {
    if (window.confirm("Are you sure you want to clear the whiteboard?")) {
      setShapes([]);
      onShapesChange?.([]);
      setHistory([]);
      broadcastShapes([], "clear");
    }
  };

  // Drag-and-drop Sticky notes
  const startDragSticky = (e, sticky) => {
    e.stopPropagation();
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    setDraggedSticky(sticky);
    setDragOffset({
      x: clientX - sticky.x,
      y: clientY - sticky.y,
    });
  };

  const onDragMove = (e) => {
    if (!draggedSticky) return;
    const clientX = e.clientX || (e.touches && e.touches[0]?.clientX) || 0;
    const clientY = e.clientY || (e.touches && e.touches[0]?.clientY) || 0;
    const updated = shapes.map((shape) => {
      if (shape.id === draggedSticky.id) {
        return {
          ...shape,
          x: clientX - dragOffset.x,
          y: clientY - dragOffset.y,
        };
      }
      return shape;
    });
    setShapes(updated);
  };

  const onDragEnd = () => {
    if (!draggedSticky) return;
    setDraggedSticky(null);
    onShapesChange?.(shapes);
    broadcastShapes(shapes);
  };

  // Export PNG
  const handleExportPng = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const exportCanvas = document.createElement("canvas");
    exportCanvas.width = canvas.width;
    exportCanvas.height = canvas.height;
    const exportCtx = exportCanvas.getContext("2d");
    // Background
    exportCtx.fillStyle = "#12141c";
    exportCtx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
    // Draw canvas content
    exportCtx.drawImage(canvas, 0, 0);

    // Draw sticky notes manually to export canvas
    shapes.forEach((shape) => {
      if (shape.type === "sticky") {
        exportCtx.fillStyle = shape.color || "#eab308";
        exportCtx.fillRect(shape.x, shape.y, shape.w, shape.h);
        exportCtx.fillStyle = "#12141c";
        exportCtx.font = "12px sans-serif";
        exportCtx.fillText(shape.text || "", shape.x + 10, shape.y + 25, shape.w - 20);
      }
    });

    const url = exportCanvas.toDataURL("image/png");
    const a = document.createElement("a");
    a.href = url;
    a.download = `whiteboard-${roomId}.png`;
    a.click();
  };

  return (
    <div className="flex h-full flex-col bg-brand-dark p-4 rounded-large border border-white/[0.06] select-none">
      {/* Toolbar */}
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3 border-b border-white/[0.06] pb-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <button
            onClick={() => setTool("pen")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "pen" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Pen"
          >
            <Pen size={16} />
          </button>
          <button
            onClick={() => setTool("highlighter")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "highlighter" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Highlighter"
          >
            <Highlighter size={16} />
          </button>
          <button
            onClick={() => setTool("rectangle")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "rectangle" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Rectangle"
          >
            <Square size={16} />
          </button>
          <button
            onClick={() => setTool("circle")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "circle" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Circle"
          >
            <Circle size={16} />
          </button>
          <button
            onClick={() => setTool("arrow")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "arrow" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Arrow"
          >
            <ArrowRight size={16} />
          </button>
          <button
            onClick={() => setTool("line")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "line" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Line"
          >
            <Minus size={16} />
          </button>
          <button
            onClick={() => setTool("text")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "text" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Text Tool"
          >
            <Type size={16} />
          </button>
          <button
            onClick={() => setTool("sticky")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "sticky" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Sticky Note"
          >
            <StickyNote size={16} />
          </button>
          <button
            onClick={() => setTool("eraser")}
            className={`p-2 rounded-md hover:bg-white/[0.06] ${
              tool === "eraser" ? "bg-brand-accent text-white" : "text-ui-muted"
            }`}
            title="Eraser"
          >
            <Eraser size={16} />
          </button>
        </div>

        {/* Custom Colors & Linewidth controls */}
        <div className="flex items-center gap-3">
          <input
            type="color"
            value={color}
            onChange={(e) => setColor(e.target.value)}
            className="h-7 w-7 cursor-pointer rounded border-0 bg-transparent"
            title="Color Palette"
          />
          <input
            type="range"
            min="1"
            max="12"
            value={lineWidth}
            onChange={(e) => setLineWidth(Number(e.target.value))}
            className="w-16 cursor-pointer"
            title="Line Width"
          />
          <div className="flex items-center gap-1 border-l border-white/[0.06] pl-3">
            <button
              onClick={handleUndo}
              className="p-2 rounded hover:bg-white/[0.06] text-ui-muted"
              title="Undo"
            >
              <Undo2 size={16} />
            </button>
            <button
              onClick={handleRedo}
              className="p-2 rounded hover:bg-white/[0.06] text-ui-muted"
              title="Redo"
            >
              <Redo2 size={16} />
            </button>
            <button
              onClick={handleClear}
              className="p-2 rounded hover:bg-white/[0.06] text-ui-danger/70 hover:text-ui-danger"
              title="Clear Whiteboard"
            >
              <Trash2 size={16} />
            </button>
            <button
              onClick={handleExportPng}
              className="p-2 rounded hover:bg-white/[0.06] text-ui-success"
              title="Export PNG"
            >
              <Download size={16} />
            </button>
          </div>
        </div>
      </div>

      {/* Canvas container */}
      <div
        ref={containerRef}
        className="relative flex-1 bg-brand-dark overflow-hidden rounded-large border border-white/[0.04]"
        style={{ height: "450px" }}
        onMouseMove={onDragMove}
        onMouseUp={onDragEnd}
        onTouchMove={onDragMove}
        onTouchEnd={onDragEnd}
      >
        <canvas
          ref={canvasRef}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onTouchStart={handleMouseDown}
          onTouchMove={handleMouseMove}
          onTouchEnd={handleMouseUp}
          className="absolute inset-0 block cursor-crosshair"
        />

        {/* Sticky Notes HTML Layer */}
        {shapes
          .filter((shape) => shape.type === "sticky")
          .map((sticky) => (
            <div
              key={sticky.id}
              onMouseDown={(e) => startDragSticky(e, sticky)}
              onTouchStart={(e) => startDragSticky(e, sticky)}
              className="absolute select-none p-2 rounded shadow-lg flex flex-col justify-between cursor-move"
              style={{
                left: `${sticky.x}px`,
                top: `${sticky.y}px`,
                width: `${sticky.w}px`,
                height: `${sticky.h}px`,
                backgroundColor: sticky.color || "#eab308",
                color: "#12141c",
              }}
            >
              <textarea
                value={sticky.text}
                onChange={(e) => {
                  if (!allowEditing) return;
                  const val = e.target.value;
                  const updated = shapes.map((s) => (s.id === sticky.id ? { ...s, text: val } : s));
                  setShapes(updated);
                  onShapesChange?.(updated);
                  broadcastShapes(updated);
                }}
                disabled={!allowEditing}
                className="w-full flex-1 bg-transparent border-0 resize-none text-[11px] font-medium text-[#12141c] placeholder:text-black/30 outline-none"
              />
              <button
                onClick={(e) => {
                  e.stopPropagation();
                  if (!allowEditing) return;
                  const updated = shapes.filter((s) => s.id !== sticky.id);
                  setShapes(updated);
                  onShapesChange?.(updated);
                  broadcastShapes(updated);
                }}
                className="text-[9px] font-bold text-black/50 hover:text-black self-end"
              >
                Delete
              </button>
            </div>
          ))}
      </div>
    </div>
  );
}
