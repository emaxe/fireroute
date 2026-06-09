import { useState, useEffect, useRef, useCallback } from 'react';
import API from '../api/client';

interface Token {
  id: string;
  name: string;
  token: string;
}

interface Message {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

interface Model {
  id: string;
  object: string;
  owned_by?: string;
}

const INPUT =
  'border border-[#E8E8EC] rounded-[8px] px-3 py-2 text-sm text-[#0A0A0A] bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] placeholder:text-[#9C9C9C] transition-all';

const SELECT =
  'border border-[#E8E8EC] rounded-[8px] px-3 py-2 text-sm text-[#0A0A0A] bg-white ' +
  'focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] disabled:opacity-50';

const BTN_PRIMARY =
  'px-4 py-2 rounded-[8px] text-sm font-medium text-white bg-[#6366F1] ' +
  'hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const BTN_SECONDARY =
  'px-3 py-1.5 rounded-[6px] text-xs font-medium border border-[#E8E8EC] ' +
  'text-[#6B6B6B] hover:text-[#0A0A0A] hover:bg-[#FAFAFA] transition-colors';

function isImageModel(id: string): boolean {
  const lower = id.toLowerCase();
  return lower.includes('flux') || lower.includes('stable-diffusion') || lower.includes('sd-') || lower.includes('image');
}

function modelName(id: string): string {
  // Remove accounts/fireworks/models/ prefix if present
  return id.replace(/^accounts\/fireworks\/models\//, '');
}

export default function Playground() {
  const [tokens, setTokens] = useState<Token[]>([]);
  const [tokensLoading, setTokensLoading] = useState(true);
  const [selectedToken, setSelectedToken] = useState('');
  const [models, setModels] = useState<Model[]>([]);
  const [modelsLoading, setModelsLoading] = useState(false);
  const [selectedModel, setSelectedModel] = useState('');
  const [mode, setMode] = useState<'chat' | 'image'>('chat');

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [showSystem, setShowSystem] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

  // Image state
  const [imagePrompt, setImagePrompt] = useState('');
  const [imageSize, setImageSize] = useState('1024x1024');
  const [imageResult, setImageResult] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);

  // Response display
  const [error, setError] = useState<string | null>(null);
  const [rawResponse, setRawResponse] = useState('');
  const [showRaw, setShowRaw] = useState(false);

  const scrollRef = useRef<HTMLDivElement>(null);
  const abortRef = useRef<AbortController | null>(null);

  // Use relative URL — nginx proxies /v1/* to the gateway container
  const gatewayBase = '/v1';

  // Load tokens
  useEffect(() => {
    API.get('/tokens')
      .then((res) => {
        const list = res.data || [];
        setTokens(list);
        if (list.length > 0) setSelectedToken(list[0].token);
      })
      .catch(() => setError('Failed to load tokens'))
      .finally(() => setTokensLoading(false));
  }, []);

  // Load models dynamically when token changes
  const fetchModels = useCallback(async () => {
    if (!selectedToken) return;
    setModelsLoading(true);
    setError(null);
    try {
      const res = await fetch(`${gatewayBase}/models`, {
        headers: { 'Authorization': `Bearer ${selectedToken}` },
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      const list = (data.data || []) as Model[];
      setModels(list);
      if (list.length > 0 && !selectedModel) {
        const first = list[0];
        setSelectedModel(first.id);
        setMode(isImageModel(first.id) ? 'image' : 'chat');
      }
    } catch (err: any) {
      setError(err.message || 'Failed to fetch models');
    } finally {
      setModelsLoading(false);
    }
  }, [selectedToken, selectedModel]);

  useEffect(() => {
    fetchModels();
  }, [fetchModels]);

  // Auto-switch mode when model changes manually
  useEffect(() => {
    if (selectedModel) {
      setMode(isImageModel(selectedModel) ? 'image' : 'chat');
    }
  }, [selectedModel]);

  // Scroll to bottom of chat
  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTop = scrollRef.current.scrollHeight;
    }
  }, [messages, streaming]);

  const stopGeneration = useCallback(() => {
    if (abortRef.current) {
      abortRef.current.abort();
      abortRef.current = null;
    }
    setStreaming(false);
    setChatLoading(false);
  }, []);

  const sendChat = async () => {
    if (!input.trim() || !selectedToken || chatLoading) return;
    setError(null);
    setRawResponse('');

    const userMsg: Message = { role: 'user', content: input.trim() };
    const newMessages = [...messages, userMsg];
    setMessages(newMessages);
    setInput('');
    setChatLoading(true);
    setStreaming(true);

    const controller = new AbortController();
    abortRef.current = controller;

    const body = {
      model: selectedModel,
      messages: showSystem && systemPrompt.trim()
        ? [{ role: 'system', content: systemPrompt.trim() }, ...newMessages]
        : newMessages,
      stream: true,
      max_tokens: 2048,
    };

    try {
      const res = await fetch(`${gatewayBase}/chat/completions`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${selectedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(body),
        signal: controller.signal,
      });

      if (!res.ok) {
        const text = await res.text();
        throw new Error(`HTTP ${res.status}: ${text}`);
      }

      const reader = res.body?.getReader();
      if (!reader) throw new Error('No response body');

      const decoder = new TextDecoder();
      let assistantContent = '';
      let rawChunks = '';

      // Add placeholder assistant message
      setMessages((prev) => [...prev, { role: 'assistant', content: '' }]);

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        rawChunks += chunk;

        const lines = chunk.split('\n');
        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed || !trimmed.startsWith('data: ')) continue;
          const data = trimmed.slice(6);
          if (data === '[DONE]') continue;

          try {
            const parsed = JSON.parse(data);
            const delta = parsed.choices?.[0]?.delta?.content;
            if (delta) {
              assistantContent += delta;
              setMessages((prev) => {
                const copy = [...prev];
                const last = copy[copy.length - 1];
                if (last && last.role === 'assistant') {
                  last.content = assistantContent;
                }
                return copy;
              });
            }
          } catch {
            // ignore parse errors
          }
        }
      }

      setRawResponse(rawChunks);
    } catch (err: any) {
      if (err.name !== 'AbortError') {
        setError(err.message || 'Request failed');
      }
    } finally {
      setStreaming(false);
      setChatLoading(false);
      abortRef.current = null;
    }
  };

  const generateImage = async () => {
    console.log('img v2');
    if (!imagePrompt.trim() || !selectedToken || imageLoading) return;
    setError(null);
    setRawResponse('');
    setImageResult(null);
    setImageLoading(true);

    try {
      const res = await fetch(`${gatewayBase}/images/generations`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${selectedToken}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: selectedModel,
          prompt: imagePrompt.trim(),
          size: imageSize,
          n: 1,
        }),
      });

      const data = await res.json();
      setRawResponse(JSON.stringify(data, null, 2));

      if (!res.ok) {
        throw new Error(data.error?.message || `HTTP ${res.status}`);
      }

      const url = data.data?.[0]?.url;
      const b64 = data.data?.[0]?.b64_json;
      if (url) setImageResult(url);
      if (b64) setImageResult(`data:image/jpeg;base64,${b64}`);
    } catch (err: any) {
      setError(err.message || 'Request failed');
    } finally {
      setImageLoading(false);
    }
  };

  const clearChat = () => {
    setMessages([]);
    setRawResponse('');
    setError(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const chatModels = models.filter((m) => !isImageModel(m.id));
  const imageModels = models.filter((m) => isImageModel(m.id));

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] tracking-tight">Playground</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">Test models and prompts through the gateway</p>
      </div>

      {/* Controls */}
      <div className="bg-white border border-[#E8E8EC] rounded-xl p-4 mb-5 space-y-3">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-[#9C9C9C] mb-1.5 uppercase tracking-wider">Token</label>
            <select
              value={selectedToken}
              onChange={(e) => setSelectedToken(e.target.value)}
              disabled={tokensLoading}
              className={`${SELECT} w-full`}
            >
              {tokensLoading ? (
                <option>Loading...</option>
              ) : tokens.length === 0 ? (
                <option value="">No tokens available</option>
              ) : (
                tokens.map((t) => (
                  <option key={t.id} value={t.token}>
                    {t.name}
                  </option>
                ))
              )}
            </select>
          </div>

          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-[#9C9C9C] mb-1.5 uppercase tracking-wider">Model</label>
            <select
              value={selectedModel}
              onChange={(e) => setSelectedModel(e.target.value)}
              disabled={modelsLoading || models.length === 0}
              className={`${SELECT} w-full`}
            >
              {modelsLoading ? (
                <option>Loading models...</option>
              ) : models.length === 0 ? (
                <option value="">No models available</option>
              ) : (
                <>
                  {chatModels.length > 0 && (
                    <optgroup label="Chat Models">
                      {chatModels.map((m) => (
                        <option key={m.id} value={m.id}>{modelName(m.id)}</option>
                      ))}
                    </optgroup>
                  )}
                  {imageModels.length > 0 && (
                    <optgroup label="Image Models">
                      {imageModels.map((m) => (
                        <option key={m.id} value={m.id}>{modelName(m.id)}</option>
                      ))}
                    </optgroup>
                  )}
                </>
              )}
            </select>
          </div>

          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-[#9C9C9C] mb-1.5 uppercase tracking-wider">Mode</label>
            <div className="flex rounded-[8px] border border-[#E8E8EC] overflow-hidden">
              <button
                onClick={() => setMode('chat')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'chat' ? 'bg-[#6366F1] text-white' : 'text-[#6B6B6B] hover:bg-[#FAFAFA]'
                }`}
              >
                Chat
              </button>
              <button
                onClick={() => setMode('image')}
                className={`flex-1 px-3 py-2 text-sm font-medium transition-colors ${
                  mode === 'image' ? 'bg-[#6366F1] text-white' : 'text-[#6B6B6B] hover:bg-[#FAFAFA]'
                }`}
              >
                Image
              </button>
            </div>
          </div>
        </div>

        {mode === 'chat' && (
          <div>
            <button
              onClick={() => setShowSystem(!showSystem)}
              className="text-xs font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors"
            >
              {showSystem ? 'Hide' : 'Show'} system prompt
            </button>
            {showSystem && (
              <textarea
                value={systemPrompt}
                onChange={(e) => setSystemPrompt(e.target.value)}
                placeholder="System prompt..."
                rows={2}
                className={`${INPUT} w-full mt-2 text-sm`}
              />
            )}
          </div>
        )}
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-[8px] bg-red-50 text-red-600 text-sm border border-red-100 flex items-start gap-2">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span className="break-words">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Chat Mode */}
      {mode === 'chat' && (
        <div className="bg-white border border-[#E8E8EC] rounded-xl overflow-hidden flex flex-col" style={{ minHeight: '400px' }}>
          {/* Messages */}
          <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
            {messages.length === 0 && (
              <div className="text-center py-12 text-[#9C9C9C]">
                <p className="text-sm">Start a conversation</p>
                <p className="text-xs mt-1">Select a token and model, then type your message</p>
              </div>
            )}
            {messages.map((msg, i) => (
              <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                <div
                  className={`max-w-[85%] sm:max-w-[75%] rounded-xl px-4 py-3 text-sm leading-relaxed ${
                    msg.role === 'user'
                      ? 'bg-[#6366F1] text-white rounded-br-none'
                      : 'bg-[#F4F4F5] text-[#0A0A0A] rounded-bl-none'
                  }`}
                >
                  {msg.content || (msg.role === 'assistant' && streaming && i === messages.length - 1 ? (
                    <span className="inline-flex items-center gap-1">
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9C9C9C] animate-bounce" style={{ animationDelay: '0ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9C9C9C] animate-bounce" style={{ animationDelay: '150ms' }} />
                      <span className="w-1.5 h-1.5 rounded-full bg-[#9C9C9C] animate-bounce" style={{ animationDelay: '300ms' }} />
                    </span>
                  ) : msg.content)}
                </div>
              </div>
            ))}
          </div>

          {/* Input */}
          <div className="border-t border-[#E8E8EC] p-3 sm:p-4">
            <div className="flex flex-col sm:flex-row gap-2">
              <textarea
                value={input}
                onChange={(e) => setInput(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    sendChat();
                  }
                }}
                placeholder="Type your message... (Shift+Enter for new line)"
                rows={1}
                className={`${INPUT} flex-1 resize-none min-h-[40px] max-h-[120px] py-2.5`}
                disabled={chatLoading}
              />
              <div className="flex gap-2 shrink-0">
                {streaming ? (
                  <button onClick={stopGeneration} className={`${BTN_PRIMARY} bg-red-500 hover:bg-red-600`}>
                    Stop
                  </button>
                ) : (
                  <button
                    onClick={sendChat}
                    disabled={!input.trim() || !selectedToken || chatLoading}
                    className={BTN_PRIMARY}
                  >
                    {chatLoading ? 'Sending...' : 'Send'}
                  </button>
                )}
                <button onClick={clearChat} className={BTN_SECONDARY}>
                  Clear
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Image Mode */}
      {mode === 'image' && (
        <div className="bg-white border border-[#E8E8EC] rounded-xl p-4 sm:p-6">
          <div className="flex flex-col gap-4">
            <div>
              <label className="block text-xs font-medium text-[#9C9C9C] mb-1.5 uppercase tracking-wider">Prompt</label>
              <textarea
                value={imagePrompt}
                onChange={(e) => setImagePrompt(e.target.value)}
                placeholder="Describe the image you want to generate..."
                rows={3}
                className={`${INPUT} w-full`}
                disabled={imageLoading}
              />
            </div>

            <div className="flex flex-col sm:flex-row gap-3">
              <div className="flex-1">
                <label className="block text-xs font-medium text-[#9C9C9C] mb-1.5 uppercase tracking-wider">Size</label>
                <select
                  value={imageSize}
                  onChange={(e) => setImageSize(e.target.value)}
                  className={`${SELECT} w-full`}
                  disabled={imageLoading}
                >
                  <option value="1024x1024">1024×1024</option>
                  <option value="1024x768">1024×768</option>
                  <option value="768x1024">768×1024</option>
                  <option value="512x512">512×512</option>
                  <option value="256x256">256×256</option>
                </select>
              </div>
              <div className="flex items-end">
                <button
                  onClick={generateImage}
                  disabled={!imagePrompt.trim() || !selectedToken || imageLoading}
                  className={BTN_PRIMARY}
                >
                  {imageLoading ? 'Generating...' : 'Generate Image'}
                </button>
              </div>
            </div>

            {imageResult && (
              <div className="mt-2">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-xs font-medium text-[#9C9C9C] uppercase tracking-wider">Result</span>
                  <button
                    onClick={() => copyToClipboard(imageResult)}
                    className="text-xs text-[#6366F1] hover:text-[#4F46E5] font-medium"
                  >
                    Copy URL
                  </button>
                </div>
                <div className="rounded-xl overflow-hidden border border-[#E8E8EC] bg-[#FAFAFA]">
                  <img
                    src={imageResult}
                    alt="Generated"
                    className="w-full h-auto max-h-[512px] object-contain"
                    loading="lazy"
                  />
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Raw Response Toggle */}
      {rawResponse && (
        <div className="mt-5">
          <button
            onClick={() => setShowRaw(!showRaw)}
            className="text-xs font-medium text-[#6366F1] hover:text-[#4F46E5] transition-colors mb-2"
          >
            {showRaw ? 'Hide' : 'Show'} raw response
          </button>
          {showRaw && (
            <div className="relative">
              <pre className="bg-[#0A0A0A] text-gray-100 p-4 rounded-[8px] text-xs font-mono overflow-x-auto whitespace-pre-wrap max-h-[300px] overflow-y-auto">
                {rawResponse}
              </pre>
              <button
                onClick={() => copyToClipboard(rawResponse)}
                className="absolute top-2 right-2 px-2 py-1 rounded-[4px] bg-white/10 text-white text-xs hover:bg-white/20 transition-colors"
              >
                Copy
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
