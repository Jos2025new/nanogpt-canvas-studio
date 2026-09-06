import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  AtSign,
  ChevronDown,
  CircleHelp,
  Crop,
  Download,
  Grid3X3,
  Hand,
  History,
  Image as ImageIcon,
  Info,
  Link2,
  Maximize2,
  Move,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  MousePointer2,
  Paperclip,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
  RefreshCw,
  Send,
  Settings2,
  Sparkles,
  Trash2,
  Undo2,
  Upload,
  WandSparkles,
  X,
  Zap,
} from "lucide-react";
import { trpc } from "@/lib/trpc";

type Reference = {
  id: string;
  name: string;
  kind: string;
  tone: string;
  image?: string;
  nodeType?: "image" | "video" | "text";
  text?: string;
};

type GeneratedImage = {
  url: string | null;
  dataUrl: string | null;
  model: string;
  cost?: number | null;
  remainingBalance?: number | null;
};

type NodePosition = { x: number; y: number };
type CanvasState = {
  references: Reference[];
  prompt: string;
  generated: GeneratedImage | null;
  positions: Record<string, NodePosition>;
};

const initialReferences: Reference[] = [
  { id: "ref-1", name: "portrait-reference.png", kind: "Portrait", tone: "portrait" },
  { id: "ref-2", name: "studio-light.jpg", kind: "Color reference", tone: "studio" },
  { id: "ref-3", name: "full-body-reference.png", kind: "Composition", tone: "fullbody" },
];

const formatOptions = [
  { label: "16:9", value: "1376x768" },
  { label: "1:1", value: "1024x1024" },
  { label: "9:16", value: "768x1376" },
  { label: "Auto", value: "auto" },
];

const defaultPositions: Record<string, NodePosition> = {
  "ref-1": { x: 9.6, y: 14.7 },
  "ref-2": { x: 9.6, y: 42.4 },
  "ref-3": { x: 9.6, y: 70.1 },
};

function createId() {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

async function compressImage(file: File): Promise<string> {
  const source = await new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = URL.createObjectURL(file);
  });

  const maxEdge = 1400;
  const scale = Math.min(1, maxEdge / Math.max(source.naturalWidth, source.naturalHeight));
  const canvas = document.createElement("canvas");
  canvas.width = Math.max(1, Math.round(source.naturalWidth * scale));
  canvas.height = Math.max(1, Math.round(source.naturalHeight * scale));
  const context = canvas.getContext("2d");
  if (!context) throw new Error("No se pudo preparar la imagen");
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  URL.revokeObjectURL(source.src);
  return canvas.toDataURL("image/jpeg", 0.82);
}

function ArtPreview({ tone, image, compact = false, nodeType = "image", text }: { tone: string; image?: string; compact?: boolean; nodeType?: Reference["nodeType"]; text?: string }) {
  if (nodeType === "video" && image) return <video className="art-image" src={image} muted autoPlay loop playsInline aria-label="Video reference" />;
  if (nodeType === "text") return <div className="text-node-preview"><AtSign size={18} /><span>{text || "Text instruction node"}</span></div>;
  if (image) return <img className="art-image" src={image} alt="Referencia cargada" />;
  return (
    <div className={`art-preview art-${tone} ${compact ? "art-compact" : ""}`} aria-hidden="true">
      <div className="art-grain" />
      <div className="art-person">
        <span className="art-head" />
        <span className="art-body" />
        <span className="art-shadow" />
      </div>
      <span className="art-light" />
      <span className="art-copy">{tone === "portrait" ? "FACE" : tone === "studio" ? "TONE" : "FRAME"}</span>
    </div>
  );
}

function CanvasReferenceCard({ reference, onRemove, onAdd }: { reference: Reference; onRemove: () => void; onAdd?: () => void }) {
  return (
    <div className="reference-card">
      <div className="reference-card-head">
        <div className="reference-label">
          <ImageIcon size={14} />
          <span>{reference.name}</span>
        </div>
        <button className="icon-button tiny" aria-label={`Eliminar ${reference.name}`} onClick={onRemove}>
          <MoreHorizontal size={15} />
        </button>
      </div>
      <ArtPreview tone={reference.tone} image={reference.image} nodeType={reference.nodeType} text={reference.text} />
      {onAdd && (
        <button className="node-add" aria-label="Añadir conexión" onClick={onAdd}>
          <Plus size={14} />
        </button>
      )}
    </div>
  );
}

function ToolButton({ label, children, active = false, onClick }: { label: string; children: React.ReactNode; active?: boolean; onClick?: () => void }) {
  return (
    <button className={`tool-button ${active ? "active" : ""}`} aria-label={label} title={label} onClick={onClick}>
      {children}
    </button>
  );
}

export default function Home() {
  const [references, setReferences] = useState<Reference[]>(initialReferences);
  const [prompt, setPrompt] = useState("Generate a character with the appearance of @Image1 in the scene from @Image3, with the color tone referencing @Image2.");
  const [selectedFormat, setSelectedFormat] = useState("1376x768");
  const [selectedModel, setSelectedModel] = useState(() => localStorage.getItem("nanogpt-model") || "hidream");
  const [canvasName, setCanvasName] = useState(() => localStorage.getItem("nanogpt-canvas-name") || "Untitled canvas");
  const [apiKey, setApiKey] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [activeTool, setActiveTool] = useState("select");
  const [zoom, setZoom] = useState(78);
  const [notice, setNotice] = useState("Ready to create");
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [chatNote, setChatNote] = useState("What shall we create today?");
  const [nodePositions, setNodePositions] = useState<Record<string, NodePosition>>(defaultPositions);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);
  const [history, setHistory] = useState<CanvasState[]>([]);
  const [redoStack, setRedoStack] = useState<CanvasState[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [draggingNode, setDraggingNode] = useState<string | null>(null);
  const [draggingCanvas, setDraggingCanvas] = useState(false);
  const [canvasOffset, setCanvasOffset] = useState({ x: 0, y: 0 });
  const [autoMode, setAutoMode] = useState(true);
  const [editMode, setEditMode] = useState(false);
  const [nodeMenuOpen, setNodeMenuOpen] = useState(false);
  const [spent, setSpent] = useState(() => Number(localStorage.getItem("nanogpt-canvas-spent") || 0));
  const [generationCount, setGenerationCount] = useState(() => Number(localStorage.getItem("nanogpt-canvas-generations") || 0));
  const fileInputRef = useRef<HTMLInputElement>(null);
  const canvasRef = useRef<HTMLDivElement>(null);
  const dragOriginRef = useRef({ x: 0, y: 0, nodeX: 0, nodeY: 0 });
  const panOriginRef = useRef({ x: 0, y: 0, offsetX: 0, offsetY: 0 });

  const generateMutation = trpc.nanogpt.generate.useMutation();
  const modelsQuery = trpc.nanogpt.models.useQuery({ apiKey: apiKey.trim() }, { enabled: configOpen && apiKey.trim().length > 0, retry: false });
  const isGenerating = generateMutation.isPending;
  const hasUploadedReference = references.some((reference) => Boolean(reference.image));

  useEffect(() => {
    localStorage.setItem("nanogpt-model", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    localStorage.setItem("nanogpt-canvas-name", canvasName);
  }, [canvasName]);

  useEffect(() => {
    localStorage.setItem("nanogpt-canvas-spent", String(spent));
    localStorage.setItem("nanogpt-canvas-generations", String(generationCount));
  }, [spent, generationCount]);

  useEffect(() => {
    const saved = localStorage.getItem("nanogpt-canvas-state");
    if (!saved) return;
    try {
      const parsed = JSON.parse(saved) as Partial<CanvasState>;
      if (parsed.references) setReferences(parsed.references);
      if (parsed.prompt) setPrompt(parsed.prompt);
      if (parsed.generated) setGenerated(parsed.generated);
      if (parsed.positions) setNodePositions(parsed.positions);
    } catch {
      localStorage.removeItem("nanogpt-canvas-state");
    }
  }, []);

  useEffect(() => {
    localStorage.setItem("nanogpt-canvas-state", JSON.stringify({ references, prompt, generated, positions: nodePositions } satisfies CanvasState));
  }, [references, prompt, generated, nodePositions]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleGenerate();
      }
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "z") {
        event.preventDefault();
        event.shiftKey ? redoCanvas() : undoCanvas();
      }
      if (event.key === "Escape") {
        setSelectedNode(null);
        setEditMode(false);
      }
      if (event.key === "Delete" && selectedNode) {
        event.preventDefault();
        removeReference(selectedNode);
      }
      if (event.key === "+" || event.key === "=") setZoom((value) => Math.min(130, value + 8));
      if (event.key === "-") setZoom((value) => Math.max(45, value - 8));
      if (event.key === "0") setZoom(78);
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isGenerating, selectedNode, prompt, apiKey, selectedModel, selectedFormat, references]);

  const visibleReferences = useMemo(() => references.slice(0, 3), [references]);

  const snapshot = (): CanvasState => ({ references, prompt, generated, positions: nodePositions });
  const commit = () => {
    setHistory((current) => [...current.slice(-19), snapshot()]);
    setRedoStack([]);
  };

  function restore(state: CanvasState) {
    setReferences(state.references);
    setPrompt(state.prompt);
    setGenerated(state.generated);
    setNodePositions(state.positions);
  }

  function undoCanvas() {
    const previous = history.at(-1);
    if (!previous) return;
    setRedoStack((current) => [...current, snapshot()]);
    restore(previous);
    setHistory((current) => current.slice(0, -1));
    setNotice("Undid last canvas change");
  }

  function redoCanvas() {
    const next = redoStack.at(-1);
    if (!next) return;
    setHistory((current) => [...current, snapshot()]);
    restore(next);
    setRedoStack((current) => current.slice(0, -1));
    setNotice("Redid canvas change");
  }

  function pointerPosition(event: React.PointerEvent) {
    const bounds = canvasRef.current?.getBoundingClientRect();
    if (!bounds) return { x: 0, y: 0 };
    return { x: ((event.clientX - bounds.left) / bounds.width) * 100, y: ((event.clientY - bounds.top) / bounds.height) * 100 };
  }

  function startNodeDrag(event: React.PointerEvent, id: string) {
    if (activeTool !== "select") return;
    event.stopPropagation();
    commit();
    setSelectedNode(id);
    setDraggingNode(id);
    const point = pointerPosition(event);
    const position = nodePositions[id] || { x: 0, y: 0 };
    dragOriginRef.current = { x: point.x, y: point.y, nodeX: position.x, nodeY: position.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function moveNode(event: React.PointerEvent) {
    if (!draggingNode) return;
    const point = pointerPosition(event);
    setNodePositions((current) => ({ ...current, [draggingNode]: { x: Math.max(1, Math.min(66, dragOriginRef.current.nodeX + point.x - dragOriginRef.current.x)), y: Math.max(7, Math.min(78, dragOriginRef.current.nodeY + point.y - dragOriginRef.current.y)) } }));
  }

  function endNodeDrag() {
    if (draggingNode) setNotice("Node position saved");
    setDraggingNode(null);
  }

  function startPan(event: React.PointerEvent) {
    if (activeTool !== "hand") return;
    setDraggingCanvas(true);
    panOriginRef.current = { x: event.clientX, y: event.clientY, offsetX: canvasOffset.x, offsetY: canvasOffset.y };
    (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
  }

  function movePan(event: React.PointerEvent) {
    if (!draggingCanvas) return;
    setCanvasOffset({ x: panOriginRef.current.offsetX + event.clientX - panOriginRef.current.x, y: panOriginRef.current.offsetY + event.clientY - panOriginRef.current.y });
  }

  function endPan() {
    setDraggingCanvas(false);
  }

  function handleCanvasWheel(event: React.WheelEvent) {
    event.preventDefault();
    setZoom((value) => Math.max(45, Math.min(130, value - event.deltaY * 0.08)));
  }

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    commit();
    setNotice("Preparing references…");
    try {
      const uploaded = await Promise.all(Array.from(files).slice(0, 3).map(async (file) => ({
        id: createId(),
        name: file.name,
        kind: file.type.startsWith("video/") ? "Video reference" : "Uploaded reference",
        tone: ["portrait", "studio", "fullbody"][Math.floor(Math.random() * 3)],
        nodeType: file.type.startsWith("video/") ? "video" as const : "image" as const,
        image: file.type.startsWith("video/") ? URL.createObjectURL(file) : await compressImage(file),
      })));
      setReferences((current) => [...current, ...uploaded].slice(-3));
      setNotice(`${uploaded.length} reference${uploaded.length > 1 ? "s" : ""} ready`);
    } catch {
      setNotice("Could not read that image");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  function addTextNode() {
    commit();
    const id = createId();
    const node: Reference = { id, name: "Text instruction", kind: "Prompt note", tone: "studio", nodeType: "text", text: "Preserve the subject identity and lighting." };
    setReferences((current) => [...current, node].slice(-3));
    setNodePositions((current) => ({ ...current, [id]: { x: 9.6, y: 42.4 } }));
    setPrompt((current) => `${current} ${node.text}`);
    setNodeMenuOpen(false);
    setNotice("Text node added");
  }

  function addVideoInput() {
    setNodeMenuOpen(false);
    setNotice("Choose a video file to add a video node");
    fileInputRef.current?.click();
  }

  const removeReference = (id: string) => {
    commit();
    setReferences((current) => current.filter((reference) => reference.id !== id));
    setNodePositions((current) => { const next = { ...current }; delete next[id]; return next; });
    setSelectedNode(null);
    setNotice("Reference removed");
  };

  async function handleGenerate() {
    if (isGenerating) return;
    if (!apiKey.trim()) {
      setConfigOpen(true);
      setNotice("Add your nanoGPT API key to generate");
      return;
    }
    if (!prompt.trim()) {
      setNotice("Write a prompt first");
      return;
    }

    setNotice("Generating with nanoGPT…");
    setChatNote("Generating your canvas result…");
    try {
      const result = await generateMutation.mutateAsync({
        apiKey: apiKey.trim(),
        model: selectedModel.trim() || "hidream",
        prompt: prompt.trim(),
        size: selectedFormat as "1376x768" | "1024x1024" | "768x1376" | "auto",
        imageDataUrls: references.filter((reference) => reference.nodeType !== "video" && reference.nodeType !== "text" && reference.image?.startsWith("data:image/")).map((reference) => reference.image as string).slice(0, 3),
      });
      setGenerated({
        url: result.imageUrl,
        dataUrl: result.imageDataUrl,
        model: result.model,
        cost: result.cost,
        remainingBalance: result.remainingBalance,
      });
      const reportedCost = typeof result.cost === "number" ? result.cost : null;
      setGenerationCount((value) => value + 1);
      if (reportedCost !== null) setSpent((value) => value + reportedCost);
      setChatNote("Your image is ready. Want to iterate on the scene?");
      setNotice(reportedCost !== null ? `Generation complete · +${reportedCost.toFixed(4)} spent` : "Generation complete · provider cost unavailable");
    } catch (error) {
      const message = error instanceof Error ? error.message : "nanoGPT could not complete this request";
      setChatNote("I couldn't generate that one yet.");
      setNotice(message.replace(/^TRPCClientError:\s*/i, ""));
    }
  }

  const resultSource = generated?.url || generated?.dataUrl;

  return (
    <main className="studio-shell">
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp,video/mp4,video/webm,video/quicktime" multiple onChange={(event) => void handleFiles(event.target.files)} />

      <header className="topbar">
        <div className="brand-cluster">
          <button className="icon-button" aria-label="Open menu"><Menu size={17} /></button>
          <span className="crumb-chevron">⌄</span>
          <span className="brand-name">Create from Reference</span>
          <span className="cloud-dot" title="Saved locally" />
        </div>
        <div className="topbar-center"><span className="topbar-file"><ImageIcon size={14} /><input className="canvas-name-input" aria-label="Canvas name" value={canvasName} onChange={(event) => setCanvasName(event.target.value)} onKeyDown={(event) => { if (event.key === "Enter") event.currentTarget.blur(); }} /></span><span className="topbar-divider" /><span className="save-state">{notice}</span></div>
        <div className="topbar-actions">
          <div className="credit-pill" title="Suma de costes reportados por nanoGPT en este canvas"><Sparkles size={14} /><span>Spent {spent > 0 ? spent.toFixed(4) : "—"}</span><small>{generationCount} gen.</small>{generated?.remainingBalance != null && <small>Bal {generated.remainingBalance.toFixed(2)}</small>}</div>
          <button className="new-chat" onClick={() => { commit(); setPrompt(""); setGenerated(null); setChatNote("What shall we create today?"); setSelectedNode(null); setNotice("New canvas"); }}><MessageSquarePlus size={14} /> New chat <span className="beta-tag">Beta</span></button>
          <button className="icon-button" aria-label="Canvas settings" onClick={() => setConfigOpen(true)}><Settings2 size={16} /></button>
          <button className="icon-button" aria-label="More options"><MoreHorizontal size={17} /></button>
        </div>
      </header>

      <section className="workspace">
        <aside className="tool-rail">
          <div className="node-insert-wrap"><ToolButton label="Insert node" active onClick={() => setNodeMenuOpen((value) => !value)}><Plus size={20} strokeWidth={2.5} /></ToolButton>{nodeMenuOpen && <div className="node-insert-menu"><button onClick={() => { setNodeMenuOpen(false); fileInputRef.current?.click(); }}><ImageIcon size={14} /><span>Image node</span><small>PNG, JPG, WEBP</small></button><button onClick={addVideoInput}><span className="video-glyph">▶</span><span>Video node</span><small>MP4, WEBM, MOV</small></button><button onClick={addTextNode}><AtSign size={14} /><span>Text node</span><small>Prompt instruction</small></button></div>}</div>
          <div className="rail-divider" />
          <ToolButton label="History" active={historyOpen} onClick={() => setHistoryOpen((value) => !value)}><History size={17} /></ToolButton>
          <ToolButton label="Move canvas" active={activeTool === "hand"} onClick={() => setActiveTool("hand")}><Hand size={17} /></ToolButton>
          <ToolButton label="Select nodes" active={activeTool === "select"} onClick={() => setActiveTool("select")}><MousePointer2 size={17} /></ToolButton>
          <div className="rail-spacer" />
          <ToolButton label="Undo" onClick={undoCanvas}><Undo2 size={17} /></ToolButton>
          <ToolButton label="Redo" onClick={redoCanvas}><Redo2 size={17} /></ToolButton>
          <div className="rail-divider" />
          <ToolButton label="Toggle grid" active={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={16} /></ToolButton>
          <div className="zoom-control" title={`Zoom ${zoom}%`}><input aria-label="Canvas zoom" type="range" min="45" max="130" value={zoom} onChange={(event) => setZoom(Number(event.target.value))} /><span>{zoom}%</span></div>
        </aside>

        <div ref={canvasRef} className={`canvas-area ${showGrid ? "grid-on" : ""} ${draggingCanvas ? "is-panning" : ""}`} onPointerDown={startPan} onPointerMove={movePan} onPointerUp={endPan} onPointerCancel={endPan} onWheel={handleCanvasWheel}>
          <div className="canvas-status"><span className="status-live" /> {activeTool === "hand" ? "Pan mode" : "Select mode"}<span className="status-separator">·</span>{zoom}%</div>
          <div className="canvas-world" style={{ transform: `translate(${canvasOffset.x}px, ${canvasOffset.y}px) scale(${zoom / 100})` }}>
          <svg className="connector-layer" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="blueLine" x1="0" x2="1"><stop stopColor="#4b96ff" stopOpacity=".15" /><stop offset=".55" stopColor="#77b7ff" stopOpacity=".9" /><stop offset="1" stopColor="#c6e5ff" stopOpacity=".35" /></linearGradient></defs>
            {visibleReferences.map((reference) => { const position = nodePositions[reference.id] || defaultPositions[reference.id] || { x: 9.6, y: 50 }; return <path key={reference.id} d={`M ${position.x + 28} ${position.y + 7} C ${position.x + 38} ${position.y + 7}, 45 40, 54 42`} fill="none" stroke="url(#blueLine)" strokeWidth=".22" />; })}
            <circle cx="54" cy="42" r=".6" fill="#141c27" stroke="#83c3ff" strokeWidth=".22" />
          </svg>

          <div className="canvas-title"><span className="tiny-image-icon"><ImageIcon size={13} /></span><span>References</span><Info size={13} /></div>
          <div className="references-column">
            {visibleReferences.map((reference, index) => (
              <div className={`canvas-node node-${index + 1} ${selectedNode === reference.id ? "is-selected" : ""}`} key={reference.id} style={{ left: `${nodePositions[reference.id]?.x ?? defaultPositions[reference.id]?.x ?? 9.6}%`, top: `${nodePositions[reference.id]?.y ?? defaultPositions[reference.id]?.y ?? 14.7}%` }} onPointerDown={(event) => startNodeDrag(event, reference.id)} onPointerMove={moveNode} onPointerUp={endNodeDrag} onPointerCancel={endNodeDrag}>
                <CanvasReferenceCard reference={reference} onRemove={() => removeReference(reference.id)} onAdd={index === visibleReferences.length - 1 ? () => fileInputRef.current?.click() : undefined} />
              </div>
            ))}
            {references.length === 0 && <button className="empty-node" onClick={() => fileInputRef.current?.click()}><Upload size={20} /><span>Drop references here</span><small>PNG, JPG or WEBP</small></button>}
          </div>

          <div className="output-column" onPointerDown={(event) => event.stopPropagation()}>
            <div className="canvas-title"><span className="tiny-image-icon"><ImageIcon size={13} /></span><span>{generated ? "Generated image" : "Generate image"}</span><Info size={13} /></div>
            <div className={`generated-card ${isGenerating ? "is-generating" : ""}`}>
              {resultSource ? <img src={resultSource} alt="Generated result" className="result-image" /> : <div className="result-placeholder"><div className="placeholder-orb orb-one" /><div className="placeholder-orb orb-two" /><div className="placeholder-person"><span /><b /><i /></div><span className="placeholder-copy">{isGenerating ? "nanoGPT" : "RESULT"}</span></div>}
              {isGenerating && <div className="generation-progress"><span /><em>Creating image…</em></div>}
              <div className="result-actions"><button className="result-action" aria-label="Crop" onClick={() => setEditMode((value) => !value)}><Crop size={15} /></button><button className="result-action" aria-label="Edit prompt" onClick={() => { setEditMode(true); setPrompt((value) => `${value} Refine the composition with a cleaner editorial finish.`); }}><Pencil size={15} /></button><button className="result-action" aria-label="Download" onClick={() => resultSource && window.open(resultSource, "_blank")}><Download size={15} /></button><button className="result-action" aria-label="Open" onClick={() => resultSource && window.open(resultSource, "_blank")}><ArrowUpRight size={15} /></button></div>
              {editMode && <div className="edit-strip"><span><Crop size={12} /> Edit mode</span><button onClick={() => setPrompt((value) => `${value} Keep the subject centered and preserve the reference identity.`)}>Preserve identity</button><button onClick={() => setPrompt((value) => `${value} Increase soft contrast and warm studio light.`)}>Warm light</button><button onClick={() => setEditMode(false)}><X size={13} /></button></div>}
            </div>
            <div className="output-meta"><span className="connection-dot" /> nanoGPT <span>·</span> {selectedModel} <span>·</span> {formatOptions.find((item) => item.value === selectedFormat)?.label}</div>
          </div>

          <div className="canvas-hint"><span>{activeTool === "hand" ? "Drag canvas to pan" : "Drag nodes to arrange"}</span><span>•</span><span>⌘ + Enter to generate</span></div>
          </div>
        </div>

        <aside className="chat-panel">
          <div className="chat-head"><div className="avatar-mark"><WandSparkles size={14} /></div><span>Hi creator</span></div>
          <h1>{chatNote}</h1>
          <div className="chat-history">
            {generated && <div className="chat-bubble"><span className="bubble-label">You</span><p>{prompt}</p></div>}
            {!generated && <div className="chat-suggestions"><button onClick={() => setPrompt("A cinematic editorial portrait, soft studio lighting, muted warm tones, 35mm grain.")}>Editorial portrait <ArrowUpRight size={13} /></button><button onClick={() => setPrompt("A dreamy product scene with a single subject, soft shadows, architectural composition.")}>Dreamy product scene <ArrowUpRight size={13} /></button></div>}
          </div>
          {historyOpen && <div className="history-popover"><div className="history-popover-head"><span>Canvas history</span><button onClick={() => setHistory([])}><Trash2 size={12} /> Clear</button></div>{history.length === 0 ? <p>No changes yet. Move a node, upload a reference or edit the prompt.</p> : history.slice().reverse().map((item, index) => <button className="history-item" key={`${index}-${item.prompt.slice(0, 8)}`} onClick={() => { restore(item); setHistoryOpen(false); setNotice("Restored canvas snapshot"); }}><History size={13} /><span>{item.references.length} references · {item.prompt.slice(0, 34)}…</span></button>)}</div>}

          <div className="prompt-composer">
            <div className="mention-row">
              {references.filter((reference) => reference.image).map((reference, index) => <span className="mention-chip" key={reference.id}><ArtPreview tone={reference.tone} image={reference.image} compact /><span>@Image{index + 1}</span><X size={12} onClick={() => removeReference(reference.id)} /></span>)}
              <button className="mention-add" onClick={() => fileInputRef.current?.click()} aria-label="Add image reference"><AtSign size={15} /></button>
            </div>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void handleGenerate(); }} placeholder="Describe what you want to create…" />
            <div className="composer-tools"><div className="composer-left"><button className="mini-button" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /> Attach</button><button className="mini-button" onClick={() => setPrompt((value) => `${value}${value.endsWith(" ") ? "" : " "}Use a refined visual style with intentional composition.`)}><Zap size={14} /> Skill</button></div><div className="composer-right"><span className="auto-label">Auto</span><button className={`switch ${autoMode ? "is-on" : ""}`} aria-label="Toggle auto mode" onClick={() => setAutoMode((value) => !value)}><span /></button><button className="send-button" aria-label="Generate" onClick={() => void handleGenerate()} disabled={isGenerating}><Send size={16} /></button></div></div>
          </div>
          <div className="privacy-note"><CircleHelp size={12} /> Your key is used only for this generation request.</div>
        </aside>
      </section>

      <div className="bottom-status"><span><span className="status-live" /> {hasUploadedReference ? "References attached" : "Canvas ready"}</span><span className="bottom-divider" /><span>nanoGPT API</span><button onClick={() => setConfigOpen(true)}>Configure <Settings2 size={12} /></button></div>

      {configOpen && <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) setConfigOpen(false); }}>
        <section className="settings-modal" role="dialog" aria-modal="true" aria-labelledby="settings-title">
          <div className="modal-head"><div><span className="eyebrow">Connection</span><h2 id="settings-title">nanoGPT settings</h2></div><button className="icon-button" onClick={() => setConfigOpen(false)} aria-label="Close settings"><X size={18} /></button></div>
          <p className="modal-copy">Use any active nanoGPT API key. It stays in this tab and is sent through the secure server proxy only when you generate.</p>
          <label className="field-label">API key<input type="password" autoFocus value={apiKey} onChange={(event) => setApiKey(event.target.value)} placeholder="Enter your nanoGPT key" /></label>
          <div className="connection-row"><span className="field-label">Endpoint<span className="readonly-field">https://nano-gpt.com/v1/images/generations <span>LOCKED</span></span></span><span className="secure-badge"><Link2 size={12} /> HTTPS</span></div>
          <label className="field-label">Image model<div className="select-wrap"><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}>{(modelsQuery.data?.length ? modelsQuery.data : [{ id: "hidream", name: "hidream" }, { id: "flux-kontext", name: "flux-kontext" }, { id: "gpt-image-2", name: "gpt-image-2" }, { id: "nano-banana", name: "nano-banana" }]).map((model: { id: string; name: string }) => <option value={model.id} key={model.id}>{model.name}</option>)}</select><ChevronDown size={15} /></div>{modelsQuery.isFetching && <span className="field-help"><RefreshCw size={11} /> Loading live model catalog…</span>}{modelsQuery.error && <span className="field-help error"><Info size={11} /> Using fallback models; check the key or API access.</span>}</label>
          <label className="field-label">Output format<div className="format-pills">{formatOptions.map((format) => <button type="button" className={selectedFormat === format.value ? "selected" : ""} key={format.value} onClick={() => setSelectedFormat(format.value)}>{format.label}</button>)}</div></label>
          <div className="modal-foot"><span className="modal-tip"><Info size={13} /> Keys are never persisted by the server.</span><button className="primary-button" onClick={() => { setConfigOpen(false); setNotice(apiKey.trim() ? "nanoGPT key ready" : "Key required to generate"); }}>{apiKey.trim() ? "Save for this tab" : "Close"}</button></div>
        </section>
      </div>}
    </main>
  );
}
