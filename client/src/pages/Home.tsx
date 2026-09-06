import { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowUpRight,
  AtSign,
  ChevronDown,
  CircleHelp,
  Download,
  Grid3X3,
  Hand,
  History,
  Image as ImageIcon,
  Info,
  Link2,
  Maximize2,
  Menu,
  MessageSquarePlus,
  MoreHorizontal,
  MousePointer2,
  Paperclip,
  Pencil,
  Plus,
  Redo2,
  RotateCcw,
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
};

type GeneratedImage = {
  url: string | null;
  dataUrl: string | null;
  model: string;
  cost?: number | null;
  remainingBalance?: number | null;
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

function ArtPreview({ tone, image, compact = false }: { tone: string; image?: string; compact?: boolean }) {
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
      <ArtPreview tone={reference.tone} image={reference.image} />
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
  const [apiKey, setApiKey] = useState("");
  const [configOpen, setConfigOpen] = useState(false);
  const [showGrid, setShowGrid] = useState(true);
  const [activeTool, setActiveTool] = useState("select");
  const [zoom, setZoom] = useState(78);
  const [notice, setNotice] = useState("Ready to create");
  const [generated, setGenerated] = useState<GeneratedImage | null>(null);
  const [chatNote, setChatNote] = useState("What shall we create today?");
  const fileInputRef = useRef<HTMLInputElement>(null);

  const generateMutation = trpc.nanogpt.generate.useMutation();
  const isGenerating = generateMutation.isPending;
  const hasUploadedReference = references.some((reference) => Boolean(reference.image));

  useEffect(() => {
    localStorage.setItem("nanogpt-model", selectedModel);
  }, [selectedModel]);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
        event.preventDefault();
        void handleGenerate();
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  });

  const visibleReferences = useMemo(() => references.slice(0, 3), [references]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    setNotice("Preparing references…");
    try {
      const uploaded = await Promise.all(
        Array.from(files).slice(0, 3).map(async (file) => ({
          id: createId(),
          name: file.name,
          kind: "Uploaded reference",
          tone: ["portrait", "studio", "fullbody"][Math.floor(Math.random() * 3)],
          image: await compressImage(file),
        })),
      );
      setReferences((current) => [...current, ...uploaded].slice(-3));
      setNotice(`${uploaded.length} reference${uploaded.length > 1 ? "s" : ""} ready`);
    } catch {
      setNotice("Could not read that image");
    } finally {
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const removeReference = (id: string) => {
    setReferences((current) => current.filter((reference) => reference.id !== id));
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
        imageDataUrls: references.filter((reference) => reference.image).map((reference) => reference.image as string).slice(0, 3),
      });
      setGenerated({
        url: result.imageUrl,
        dataUrl: result.imageDataUrl,
        model: result.model,
        cost: result.cost,
        remainingBalance: result.remainingBalance,
      });
      setChatNote("Your image is ready. Want to iterate on the scene?");
      setNotice(result.remainingBalance == null ? "Generation complete" : `${result.remainingBalance.toFixed(2)} credits remaining`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "nanoGPT could not complete this request";
      setChatNote("I couldn't generate that one yet.");
      setNotice(message.replace(/^TRPCClientError:\s*/i, ""));
    }
  }

  const resultSource = generated?.url || generated?.dataUrl;

  return (
    <main className="studio-shell">
      <input ref={fileInputRef} className="visually-hidden" type="file" accept="image/png,image/jpeg,image/webp" multiple onChange={(event) => void handleFiles(event.target.files)} />

      <header className="topbar">
        <div className="brand-cluster">
          <button className="icon-button" aria-label="Open menu"><Menu size={17} /></button>
          <span className="crumb-chevron">⌄</span>
          <span className="brand-name">Create from Reference</span>
          <span className="cloud-dot" title="Saved locally" />
        </div>
        <div className="topbar-center"><span className="topbar-file"><ImageIcon size={14} /> Untitled canvas</span><span className="topbar-divider" /><span className="save-state">{notice}</span></div>
        <div className="topbar-actions">
          <div className="credit-pill"><Sparkles size={14} /><span>{generated?.remainingBalance?.toFixed(0) ?? "171"}</span></div>
          <button className="new-chat" onClick={() => { setPrompt(""); setGenerated(null); setChatNote("What shall we create today?"); setNotice("New canvas"); }}><MessageSquarePlus size={14} /> New chat <span className="beta-tag">Beta</span></button>
          <button className="icon-button" aria-label="Canvas settings" onClick={() => setConfigOpen(true)}><Settings2 size={16} /></button>
          <button className="icon-button" aria-label="More options"><MoreHorizontal size={17} /></button>
        </div>
      </header>

      <section className="workspace">
        <aside className="tool-rail">
          <ToolButton label="Add reference" active onClick={() => fileInputRef.current?.click()}><Plus size={20} strokeWidth={2.5} /></ToolButton>
          <div className="rail-divider" />
          <ToolButton label="History"><History size={17} /></ToolButton>
          <ToolButton label="Move canvas" active={activeTool === "hand"} onClick={() => setActiveTool("hand")}><Hand size={17} /></ToolButton>
          <ToolButton label="Select nodes" active={activeTool === "select"} onClick={() => setActiveTool("select")}><MousePointer2 size={17} /></ToolButton>
          <div className="rail-spacer" />
          <ToolButton label="Undo"><Undo2 size={17} /></ToolButton>
          <ToolButton label="Redo"><Redo2 size={17} /></ToolButton>
          <div className="rail-divider" />
          <ToolButton label="Toggle grid" active={showGrid} onClick={() => setShowGrid((value) => !value)}><Grid3X3 size={16} /></ToolButton>
          <div className="zoom-control"><span className="zoom-minus">−</span><div className="zoom-slider"><span style={{ width: `${zoom}%` }} /></div><span className="zoom-plus">+</span></div>
        </aside>

        <div className={`canvas-area ${showGrid ? "grid-on" : ""}`}>
          <div className="canvas-status"><span className="status-live" /> {activeTool === "hand" ? "Pan mode" : "Select mode"}<span className="status-separator">·</span>{zoom}%</div>
          <svg className="connector-layer" viewBox="0 0 1200 900" preserveAspectRatio="none" aria-hidden="true">
            <defs><linearGradient id="blueLine" x1="0" x2="1"><stop stopColor="#4b96ff" stopOpacity=".15" /><stop offset=".55" stopColor="#77b7ff" stopOpacity=".9" /><stop offset="1" stopColor="#c6e5ff" stopOpacity=".35" /></linearGradient></defs>
            <path d="M 410 210 C 500 210, 540 370, 668 395" fill="none" stroke="url(#blueLine)" strokeWidth="2" />
            <path d="M 410 456 C 510 456, 540 416, 668 400" fill="none" stroke="url(#blueLine)" strokeWidth="2" />
            <path d="M 410 705 C 500 705, 555 470, 668 405" fill="none" stroke="url(#blueLine)" strokeWidth="2" />
            <circle cx="668" cy="400" r="5" fill="#141c27" stroke="#83c3ff" strokeWidth="2" />
          </svg>

          <div className="canvas-title"><span className="tiny-image-icon"><ImageIcon size={13} /></span><span>References</span><Info size={13} /></div>
          <div className="references-column">
            {visibleReferences.map((reference, index) => (
              <div className={`canvas-node node-${index + 1}`} key={reference.id}>
                <CanvasReferenceCard reference={reference} onRemove={() => removeReference(reference.id)} onAdd={index === visibleReferences.length - 1 ? () => fileInputRef.current?.click() : undefined} />
              </div>
            ))}
            {references.length === 0 && <button className="empty-node" onClick={() => fileInputRef.current?.click()}><Upload size={20} /><span>Drop references here</span><small>PNG, JPG or WEBP</small></button>}
          </div>

          <div className="output-column">
            <div className="canvas-title"><span className="tiny-image-icon"><ImageIcon size={13} /></span><span>{generated ? "Generated image" : "Generate image"}</span><Info size={13} /></div>
            <div className={`generated-card ${isGenerating ? "is-generating" : ""}`}>
              {resultSource ? <img src={resultSource} alt="Generated result" className="result-image" /> : <div className="result-placeholder"><div className="placeholder-orb orb-one" /><div className="placeholder-orb orb-two" /><div className="placeholder-person"><span /><b /><i /></div><span className="placeholder-copy">{isGenerating ? "nanoGPT" : "RESULT"}</span></div>}
              {isGenerating && <div className="generation-progress"><span /><em>Creating image…</em></div>}
              <div className="result-actions"><button className="result-action" aria-label="Crop"><Maximize2 size={15} /></button><button className="result-action" aria-label="Edit"><Pencil size={15} /></button><button className="result-action" aria-label="Download" onClick={() => resultSource && window.open(resultSource, "_blank")}><Download size={15} /></button><button className="result-action" aria-label="Open"><ArrowUpRight size={15} /></button></div>
            </div>
            <div className="output-meta"><span className="connection-dot" /> nanoGPT <span>·</span> {selectedModel} <span>·</span> {formatOptions.find((item) => item.value === selectedFormat)?.label}</div>
          </div>

          <div className="canvas-hint"><span>Drag to pan</span><span>•</span><span>⌘ + Enter to generate</span></div>
        </div>

        <aside className="chat-panel">
          <div className="chat-head"><div className="avatar-mark"><WandSparkles size={14} /></div><span>Hi creator</span></div>
          <h1>{chatNote}</h1>
          <div className="chat-history">
            {generated && <div className="chat-bubble"><span className="bubble-label">You</span><p>{prompt}</p></div>}
            {!generated && <div className="chat-suggestions"><button onClick={() => setPrompt("A cinematic editorial portrait, soft studio lighting, muted warm tones, 35mm grain.")}>Editorial portrait <ArrowUpRight size={13} /></button><button onClick={() => setPrompt("A dreamy product scene with a single subject, soft shadows, architectural composition.")}>Dreamy product scene <ArrowUpRight size={13} /></button></div>}
          </div>

          <div className="prompt-composer">
            <div className="mention-row">
              {references.filter((reference) => reference.image).map((reference, index) => <span className="mention-chip" key={reference.id}><ArtPreview tone={reference.tone} image={reference.image} compact /><span>@Image{index + 1}</span><X size={12} onClick={() => removeReference(reference.id)} /></span>)}
              <button className="mention-add" onClick={() => fileInputRef.current?.click()} aria-label="Add image reference"><AtSign size={15} /></button>
            </div>
            <textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} onKeyDown={(event) => { if ((event.metaKey || event.ctrlKey) && event.key === "Enter") void handleGenerate(); }} placeholder="Describe what you want to create…" />
            <div className="composer-tools"><div className="composer-left"><button className="mini-button" onClick={() => fileInputRef.current?.click()}><Paperclip size={14} /> Attach</button><button className="mini-button"><Zap size={14} /> Skill</button></div><div className="composer-right"><span className="auto-label">Auto</span><button className="switch" aria-label="Toggle auto mode"><span /></button><button className="send-button" aria-label="Generate" onClick={() => void handleGenerate()} disabled={isGenerating}><Send size={16} /></button></div></div>
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
          <label className="field-label">Image model<div className="select-wrap"><select value={selectedModel} onChange={(event) => setSelectedModel(event.target.value)}><option value="hidream">hidream</option><option value="flux-kontext">flux-kontext</option><option value="gpt-image-2">gpt-image-2</option><option value="nano-banana">nano-banana</option></select><ChevronDown size={15} /></div></label>
          <div className="modal-foot"><span className="modal-tip"><Info size={13} /> Keys are never persisted by the server.</span><button className="primary-button" onClick={() => { setConfigOpen(false); setNotice(apiKey.trim() ? "nanoGPT key ready" : "Key required to generate"); }}>{apiKey.trim() ? "Save for this tab" : "Close"}</button></div>
        </section>
      </div>}
    </main>
  );
}
