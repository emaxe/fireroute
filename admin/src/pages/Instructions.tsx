import { useState, useEffect } from 'react';
import CopyButton from '../components/CopyButton';
import API from '../api/client';

interface Config {
  gatewayPublicUrl: string;
}

interface Model {
  id: string;
  modelId: string;
  name: string | null;
  type: string;
  active: boolean;
  source: string;
}

function usePublicUrl() {
  const [url, setUrl] = useState<string>(
    (import.meta as any).env?.VITE_API_URL?.replace('/api/v1/admin', '') || ''
  );
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    API.get('/config')
      .then((res) => {
        const cfg: Config = res.data;
        const origin = window.location.origin;
        const publicUrl = cfg.gatewayPublicUrl || (origin.includes(':9701') ? origin.replace(':9701', ':9700') : origin);
        setUrl(publicUrl);
      })
      .catch(() => {
        const origin = window.location.origin;
        setUrl(origin.includes(':9701') ? origin.replace(':9701', ':9700') : origin);
      })
      .finally(() => setLoading(false));
  }, []);

  return { url, loading };
}

function useModels() {
  const [models, setModels] = useState<Model[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    API.get('/models')
      .then((res) => {
        setModels(res.data || []);
        setError(false);
      })
      .catch(() => setError(true))
      .finally(() => setLoading(false));
  }, []);

  return { models, loading, error };
}

function CodeBlock({ title, code }: { title?: string; code: string }) {
  return (
    <div className="mb-4">
      {title && (
        <p className="text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C] mb-2">{title}</p>
      )}
      <div className="relative">
        <pre className="bg-[#0A0A0A] text-gray-100 p-4 pr-20 rounded-[8px] text-sm font-mono overflow-x-auto whitespace-pre-wrap leading-relaxed">
          {code}
        </pre>
        <CopyButton text={code} variant="dark" />
      </div>
    </div>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="bg-white border border-[#E8E8EC] rounded-xl p-6 mb-5">
      <h2 className="font-display font-semibold text-lg text-[#0A0A0A] tracking-tight mb-4">{title}</h2>
      {children}
    </div>
  );
}

function InlineCode({ children }: { children: React.ReactNode }) {
  return (
    <code className="bg-[#FAFAFA] border border-[#E8E8EC] text-[#6B6B6B] px-1.5 py-0.5 rounded text-xs font-mono">
      {children}
    </code>
  );
}

function MethodBadge({ method }: { method: string }) {
  return (
    <span className="text-xs font-medium bg-[#DCFCE7] text-[#10B981] px-2 py-0.5 rounded-[4px]">
      {method}
    </span>
  );
}

export default function Instructions() {
  const { url: gatewayUrl, loading: urlLoading } = usePublicUrl();
  const { models, loading: modelsLoading } = useModels();

  const activeModels = models.filter(m => m.active);
  const chatModels = activeModels.filter(m => m.type === 'chat');
  const imageModels = activeModels.filter(m => m.type === 'image');
  const defaultChatModel = chatModels[0]?.modelId || 'accounts/fireworks/models/llama-v3p1-8b-instruct';
  const defaultImageModel = imageModels[0]?.modelId || 'accounts/fireworks/models/flux-1-schnell-fp8';

  const endpoints = [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      label: 'OpenAI-compatible',
      curl: `curl -X POST ${gatewayUrl}/v1/chat/completions \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${defaultChatModel}","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      method: 'POST',
      path: '/v1/messages',
      label: 'Anthropic-compatible',
      curl: `curl -X POST ${gatewayUrl}/v1/messages \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${defaultChatModel}","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      method: 'POST',
      path: '/v1/responses',
      label: 'Responses API',
      curl: `curl -X POST ${gatewayUrl}/v1/responses \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"${defaultChatModel}","messages":[{"role":"user","content":"Hello"}]}'`,
    },
  ];

  const imageCurl = `curl -X POST ${gatewayUrl}/v1/images/generations \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"model":"${defaultImageModel}","prompt":"A futuristic city at sunset","size":"1024x1024","n":1}'`;

  const supportedModelsCode = imageModels.map(m => m.modelId).join('\n') || 'accounts/fireworks/models/flux-1-schnell-fp8';

  return (
    <div className="max-w-3xl">
      <div className="mb-8">
        <h1 className="font-display font-semibold text-xl md:text-[28px] text-[#0A0A0A] tracking-tight">API Instructions</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">How to use the FireRoute gateway from your applications</p>
      </div>

      <Section title="Base URL">
        <p className="text-sm text-[#6B6B6B] mb-3">All proxy requests go to:</p>
        {urlLoading ? (
          <div className="bg-[#FAFAFA] border border-[#E8E8EC] px-3 py-1.5 rounded-[6px] text-sm font-mono text-[#9C9C9C] inline-block">
            Loading...
          </div>
        ) : (
          <code className="bg-[#FAFAFA] border border-[#E8E8EC] text-[#6366F1] px-3 py-1.5 rounded-[6px] text-sm font-mono">
            {gatewayUrl}
          </code>
        )}
      </Section>

      <Section title="Authentication">
        <p className="text-sm text-[#6B6B6B] mb-4">
          Use a <strong className="font-medium text-[#0A0A0A]">Bearer token</strong> in the{' '}
          <InlineCode>Authorization</InlineCode> header. Generate tokens in the{' '}
          <strong className="font-medium text-[#0A0A0A]">Tokens</strong> tab.
        </p>
        <CodeBlock title="Header" code="Authorization: Bearer <your-service-token>" />
      </Section>

      <Section title="Available Models">
        <p className="text-sm text-[#6B6B6B] mb-4">
          Models are managed from the <strong className="font-medium text-[#0A0A0A]">Models</strong> tab. 
          Only active models are available via API. Disabled models are hidden from the model list.
        </p>
        {modelsLoading ? (
          <p className="text-sm text-[#9C9C9C]">Loading models...</p>
        ) : (
          <div className="space-y-4">
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#9C9C9C] mb-2">Chat Models</p>
              {chatModels.length > 0 ? (
                <div className="space-y-1">
                  {chatModels.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-[#FAFAFA] border border-[#E8E8EC] px-3 py-2 rounded-[6px]">
                      <code className="text-xs font-mono text-[#6B6B6B]">{m.modelId}</code>
                      <span className="text-[10px] bg-[#E0E7FF] text-[#4F46E5] px-1.5 py-0.5 rounded">{m.source}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#9C9C9C]">No active chat models configured.</p>
              )}
            </div>
            <div>
              <p className="text-xs font-medium uppercase tracking-wider text-[#9C9C9C] mb-2">Image Models</p>
              {imageModels.length > 0 ? (
                <div className="space-y-1">
                  {imageModels.map(m => (
                    <div key={m.id} className="flex items-center justify-between bg-[#FAFAFA] border border-[#E8E8EC] px-3 py-2 rounded-[6px]">
                      <code className="text-xs font-mono text-[#6B6B6B]">{m.modelId}</code>
                      <span className="text-[10px] bg-[#E0E7FF] text-[#4F46E5] px-1.5 py-0.5 rounded">{m.source}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-[#9C9C9C]">No active image models configured.</p>
              )}
            </div>
          </div>
        )}
      </Section>

      <Section title="Endpoints">
        <div className="space-y-8">
          {endpoints.map(({ method, path, label, curl }) => (
            <div key={path}>
              <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
                <MethodBadge method={method} />
                <code className="text-sm font-mono text-[#6B6B6B]">{gatewayUrl}{path}</code>
              </div>
              <p className="text-xs text-[#9C9C9C] mb-3">{label}</p>
              <CodeBlock title="cURL" code={curl} />
            </div>
          ))}
        </div>
      </Section>

      <Section title="Image Generation">
        <p className="text-sm text-[#6B6B6B] mb-4">
          Generate images via the OpenAI-compatible <InlineCode>/v1/images/generations</InlineCode> endpoint.
          Image models ({imageModels.length} active): {imageModels.map(m => m.name || m.modelId).join(', ') || 'flux-1-schnell-fp8'}.
          Pass <InlineCode>size</InlineCode> as <InlineCode>width×height</InlineCode> (e.g. <InlineCode>1024x1024</InlineCode>).
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
          <MethodBadge method="POST" />
          <code className="text-sm font-mono text-[#6B6B6B]">{gatewayUrl}/v1/images/generations</code>
        </div>
        <p className="text-xs text-[#9C9C9C] mb-3">OpenAI-compatible image generation</p>

        <CodeBlock title="cURL" code={imageCurl} />

        <CodeBlock title="Python" code={`import requests

resp = requests.post(
    "${gatewayUrl}/v1/images/generations",
    headers={
        "Authorization": "Bearer <token>",
        "Content-Type": "application/json",
    },
    json={
        "model": "${defaultImageModel}",
        "prompt": "A futuristic city at sunset",
        "size": "1024x1024",
        "n": 1,
    },
)
print(resp.json()["data"][0]["b64_json"][:64] + "...")  # Base64 image`} />

        <CodeBlock title="Node.js / JavaScript" code={`const resp = await fetch("${gatewayUrl}/v1/images/generations", {
  method: "POST",
  headers: {
    "Authorization": "Bearer <token>",
    "Content-Type": "application/json",
  },
  body: JSON.stringify({
    model: "${defaultImageModel}",
    prompt: "A futuristic city at sunset",
    size: "1024x1024",
    n: 1,
  }),
});
const data = await resp.json();
console.log(data.data[0].b64_json.slice(0, 64) + "...");`} />

        <CodeBlock title="Body fields" code={`{
  "model": "${defaultImageModel}",
  "prompt": "A futuristic city at sunset",
  "size": "1024x1024",   // optional, default 1024x1024
  "n": 1                  // number of images (currently 1)
}`} />

        <CodeBlock title="Response formats" code={`// Default: JSON with Base64-encoded image
{
  "data": [
    { "b64_json": "iVBORw0KGgoAAAANSUhEUgAAAQAAAAEACAIAA..." }
  ]
}

// Raw binary: set Accept: image/*
curl -X POST ${gatewayUrl}/v1/images/generations \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -H "Accept: image/png" \\
  -d '{"model":"${defaultImageModel}","prompt":"A futuristic city","size":"1024x1024","n":1}' \\
  --output image.png`} />

        <CodeBlock title="Supported models" code={supportedModelsCode} />
      </Section>

      <Section title="Key Groups">
        <p className="text-sm text-[#6B6B6B] mb-4">
          Tokens can be bound to one or more key groups. If a token is bound to a single group,
          requests automatically use that group. If a token is bound to multiple groups, you must pass{' '}
          <InlineCode>group</InlineCode> in the request body to specify which one to use. Tokens with no group
          bindings fall back to the <InlineCode>default</InlineCode> group.
        </p>
        <CodeBlock title="Single group (auto)" code={'{"model":"...","messages":[...]}'} />
        <CodeBlock title="Multiple groups (explicit)" code={'{"group":"my-group-name","model":"...","messages":[...]}'} />
      </Section>
    </div>
  );
}
