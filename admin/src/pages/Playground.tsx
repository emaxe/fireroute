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
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[8px] px-3 py-2 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] placeholder:text-[#9C9C9C] dark:text-[#6B6B6B] transition-all';

const SELECT =
  'border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-[8px] px-3 py-2 text-sm text-[#0A0A0A] dark:text-[#F0F0F0] bg-white dark:bg-[#161616] ' +
  'focus:outline-none focus:ring-2 focus:ring-[#6366F1]/20 focus:border-[#6366F1] disabled:opacity-50';

const BTN_PRIMARY =
  'px-4 py-2 rounded-[8px] text-sm font-medium text-white bg-[#6366F1] ' +
  'hover:bg-[#4F46E5] disabled:opacity-50 disabled:cursor-not-allowed transition-colors';

const BTN_SECONDARY =
  'px-3 py-1.5 rounded-[6px] text-xs font-medium border border-[#E8E8EC] dark:border-[#2A2A2A] ' +
  'text-[#6B6B6B] dark:text-[#9C9C9C] hover:text-[#0A0A0A] dark:text-[#F0F0F0] hover:bg-[#FAFAFA] dark:bg-[#0A0A0A] transition-colors';

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

  // Chat state
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [systemPrompt, setSystemPrompt] = useState('You are a helpful assistant.');
  const [showSystem, setShowSystem] = useState(false);
  const [streaming, setStreaming] = useState(false);
  const [chatLoading, setChatLoading] = useState(false);

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

  const clearChat = () => {
    setMessages([]);
    setRawResponse('');
    setError(null);
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  return (
    <div className="max-w-4xl mx-auto">
      {/* Header */}
      <div className="mb-6">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] dark:text-[#F0F0F0] tracking-tight">Playground</h1>
        <p className="text-sm text-[#6B6B6B] dark:text-[#9C9C9C] mt-1">Test models and prompts through the gateway</p>
      </div>

      {/* Controls */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl p-4 mb-5 space-y-3 transition-colors duration-300">
        <div className="flex flex-col sm:flex-row gap-3">
          <div className="flex-1 min-w-0">
            <label className="block text-xs font-medium text-[#9C9C9C] dark:text-[#6B6B6B] mb-1.5 uppercase tracking-wider">Token</label>
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
            <label className="block text-xs font-medium text-[#9C9C9C] dark:text-[#6B6B6B] mb-1.5 uppercase tracking-wider">Model</label>
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
                models.map((m) => (
                  <option key={m.id} value={m.id}>{modelName(m.id)}</option>
                ))
              )}
            </select>
          </div>
        </div>

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
      </div>

      {/* Error */}
      {error && (
        <div className="mb-4 p-3 rounded-[8px] bg-red-50 dark:bg-red-500/10 text-red-600 text-sm border border-red-100 dark:border-red-500/20 flex items-start gap-2 transition-colors duration-300">
          <span className="shrink-0 mt-0.5">⚠️</span>
          <span className="break-words">{error}</span>
          <button onClick={() => setError(null)} className="ml-auto shrink-0 text-red-400 hover:text-red-600">&times;</button>
        </div>
      )}

      {/* Chat */}
      <div className="bg-white dark:bg-[#161616] border border-[#E8E8EC] dark:border-[#2A2A2A] rounded-xl overflow-hidden flex flex-col transition-colors duration-300" style={{ minHeight: '400px' }}>
        {/* Messages */}
        <div ref={scrollRef} className="flex-1 overflow-y-auto p-4 space-y-4 max-h-[500px]">
          {messages.length === 0 && (
            <div className="text-center py-12 text-[#9C9C9C] dark:text-[#6B6B6B]">
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
                    : 'bg-[#F4F4F5] text-[#0A0A0A] dark:text-[#F0F0F0] rounded-bl-none'
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
        <div className="border-t border-[#E8E8EC] dark:border-[#2A2A2A] p-3 sm:p-4 transition-colors duration-300">
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
                <button onClick={stopGeneration} className={`${BTN_PRIMARY} bg-red-50 dark:bg-red-500/100 hover:bg-red-600`}>
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
                className="absolute top-2 right-2 px-2 py-1 rounded-[4px] bg-white dark:bg-[#161616]/10 text-white text-xs hover:bg-white dark:bg-[#161616]/20 transition-colors"
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
