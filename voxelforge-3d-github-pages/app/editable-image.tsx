"use client";

import { useEffect, useRef, useState } from "react";
import { Brush, Eraser, PaintBucket, RotateCcw } from "lucide-react";

interface Props {
  activeTexture?: string;
  onApply: (dataUrl: string) => void;
}

export default function EditableImage({ activeTexture, onApply }: Props) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [color, setColor] = useState("#49a4ff");
  const [size, setSize] = useState(18);
  const [tool, setTool] = useState<"brush" | "eraser">("brush");
  const drawing = useRef(false);

  const fillCanvas = (value = "#182131") => {
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    context.fillStyle = value;
    context.fillRect(0, 0, canvas.width, canvas.height);
    context.strokeStyle = "rgba(255,255,255,.06)";
    context.lineWidth = 1;
    for (let i = 0; i < canvas.width; i += 32) {
      context.beginPath();
      context.moveTo(i, 0);
      context.lineTo(i, canvas.height);
      context.stroke();
    }
    for (let i = 0; i < canvas.height; i += 32) {
      context.beginPath();
      context.moveTo(0, i);
      context.lineTo(canvas.width, i);
      context.stroke();
    }
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (!activeTexture) {
      fillCanvas();
      return;
    }
    const image = new Image();
    image.onload = () => {
      const context = canvas.getContext("2d");
      context?.clearRect(0, 0, canvas.width, canvas.height);
      context?.drawImage(image, 0, 0, canvas.width, canvas.height);
    };
    image.src = activeTexture;
  }, [activeTexture]);

  const paint = (event: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    const context = canvas?.getContext("2d");
    if (!canvas || !context) return;
    const rect = canvas.getBoundingClientRect();
    const x = ((event.clientX - rect.left) / rect.width) * canvas.width;
    const y = ((event.clientY - rect.top) / rect.height) * canvas.height;
    context.globalCompositeOperation = tool === "eraser" ? "destination-out" : "source-over";
    context.fillStyle = color;
    context.beginPath();
    context.arc(x, y, size, 0, Math.PI * 2);
    context.fill();
  };

  return (
    <div className="image-editor">
      <div className="image-toolbar">
        <button className={tool === "brush" ? "active" : ""} onClick={() => setTool("brush")} title="Brush"><Brush size={15} /></button>
        <button className={tool === "eraser" ? "active" : ""} onClick={() => setTool("eraser")} title="Eraser"><Eraser size={15} /></button>
        <input type="color" value={color} onChange={(event) => setColor(event.target.value)} aria-label="Brush color" />
        <label>Size <input type="range" min="2" max="60" value={size} onChange={(event) => setSize(Number(event.target.value))} /></label>
        <button onClick={() => fillCanvas(color)} title="Fill"><PaintBucket size={15} /></button>
        <button onClick={() => fillCanvas()} title="Reset"><RotateCcw size={15} /></button>
        <button className="apply-texture" onClick={() => canvasRef.current && onApply(canvasRef.current.toDataURL("image/png"))}>Apply to mesh</button>
      </div>
      <canvas
        ref={canvasRef}
        width={512}
        height={256}
        onPointerDown={(event) => { drawing.current = true; event.currentTarget.setPointerCapture(event.pointerId); paint(event); }}
        onPointerMove={paint}
        onPointerUp={() => { drawing.current = false; }}
        onPointerCancel={() => { drawing.current = false; }}
      />
    </div>
  );
}
