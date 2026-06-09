import { useState, useEffect } from 'react';
import CopyButton from '../components/CopyButton';
import API from '../api/client';

interface Config {
  gatewayPublicUrl: string;
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

  const endpoints = [
    {
      method: 'POST',
      path: '/v1/chat/completions',
      label: 'OpenAI-compatible',
      curl: `curl -X POST ${gatewayUrl}/v1/chat/completions \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      method: 'POST',
      path: '/v1/messages',
      label: 'Anthropic-compatible',
      curl: `curl -X POST ${gatewayUrl}/v1/messages \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","messages":[{"role":"user","content":"Hello"}]}'`,
    },
    {
      method: 'POST',
      path: '/v1/responses',
      label: 'Responses API',
      curl: `curl -X POST ${gatewayUrl}/v1/responses \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","messages":[{"role":"user","content":"Hello"}]}'`,
    },
  ];

  const imageCurl = `curl -X POST ${gatewayUrl}/v1/images/generations \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -H "Accept: application/json" \\
  -d '{"model":"accounts/fireworks/models/flux-1-schnell-fp8","prompt":"A futuristic city at sunset","size":"1024x1024","n":1}'`;

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
          Models prefixed with <InlineCode>flux</InlineCode> or <InlineCode>kontext</InlineCode> are supported.
          Pass <InlineCode>size</InlineCode> as <InlineCode>width×height</InlineCode> (e.g. <InlineCode>1024x1024</InlineCode>).
          The gateway returns a JSON payload with a Base64-encoded image by default; set <InlineCode>Accept: image/*</InlineCode> to receive raw binary.
        </p>
        <div className="flex flex-col sm:flex-row sm:items-center gap-2 mb-1">
          <MethodBadge method="POST" />
          <code className="text-sm font-mono text-[#6B6B6B]">{gatewayUrl}/v1/images/generations</code>
        </div>
        <p className="text-xs text-[#9C9C9C] mb-3">OpenAI-compatible image generation</p>
        <CodeBlock title="cURL" code={imageCurl} />
        <CodeBlock title="Body fields" code={`{
  "model": "accounts/fireworks/models/flux-1-schnell-fp8",
  "prompt": "A futuristic city at sunset",
  "size": "1024x1024",   // optional, default 1024x1024
  "n": 1                  // number of images (currently 1)
}`} />
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
