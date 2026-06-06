import CopyButton from '../components/CopyButton';

export default function Instructions() {
  const gatewayUrl = import.meta.env.VITE_API_URL?.replace('/api/v1/admin', '') || 'http://localhost:3000';

  const codeBlock = (title: string, cmd: string) => (
    <div className="mb-4">
      <h3 className="font-semibold text-sm text-gray-600 mb-1">{title}</h3>
      <div className="relative">
        <pre className="bg-gray-900 text-gray-100 p-3 pr-16 rounded text-sm overflow-x-auto whitespace-pre-wrap">{cmd}</pre>
        <CopyButton text={cmd} />
      </div>
    </div>
  );

  return (
    <div className="max-w-3xl">
      <h1 className="text-2xl font-bold mb-4">API Instructions</h1>

      <div className="bg-white p-6 rounded shadow mb-6">
        <h2 className="text-lg font-bold mb-2">Base URL</h2>
        <p className="text-gray-700 mb-1">
          All proxy requests go to: <code className="bg-gray-100 px-2 py-1 rounded">{gatewayUrl}</code>
        </p>
      </div>

      <div className="bg-white p-6 rounded shadow mb-6">
        <h2 className="text-lg font-bold mb-2">Authentication</h2>
        <p className="text-gray-700 mb-2">
          Use a <strong>Bearer token</strong> in the <code>Authorization</code> header.
        </p>
        <p className="text-gray-700 mb-2">
          Create a service user in the <strong>Users</strong> tab, then generate a token. Use that token for all API calls.
        </p>
        {codeBlock('Header', 'Authorization: Bearer <your-service-token>')}
      </div>

      <div className="bg-white p-6 rounded shadow mb-6">
        <h2 className="text-lg font-bold mb-2">Endpoints</h2>

        <h3 className="font-semibold mt-4 mb-1">OpenAI-compatible</h3>
        <p className="text-sm text-gray-500 mb-2">POST {gatewayUrl}/v1/chat/completions</p>
        {codeBlock('cURL', `curl -X POST ${gatewayUrl}/v1/chat/completions \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","messages":[{"role":"user","content":"Hello"}]}'`)}

        <h3 className="font-semibold mt-4 mb-1">Anthropic-compatible</h3>
        <p className="text-sm text-gray-500 mb-2">POST {gatewayUrl}/v1/messages</p>
        {codeBlock('cURL', `curl -X POST ${gatewayUrl}/v1/messages \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","messages":[{"role":"user","content":"Hello"}]}'`)}

        <h3 className="font-semibold mt-4 mb-1">Responses</h3>
        <p className="text-sm text-gray-500 mb-2">POST {gatewayUrl}/v1/responses</p>
        {codeBlock('cURL', `curl -X POST ${gatewayUrl}/v1/responses \\
  -H "Authorization: Bearer <token>" \\
  -H "Content-Type: application/json" \\
  -d '{"model":"accounts/fireworks/models/llama-v3p1-8b-instruct","messages":[{"role":"user","content":"Hello"}]}'`)}
      </div>

      <div className="bg-white p-6 rounded shadow mb-6">
        <h2 className="text-lg font-bold mb-2">Key Groups</h2>
        <p className="text-gray-700 mb-2">
          By default requests use the <code>default</code> group. To target a specific group, pass <code>group</code> in the JSON body:
        </p>
        {codeBlock('Body', '{"group":"my-group-name","model":"...","messages":[...]}')}
        <p className="text-gray-700 text-sm mt-2">
          Load is distributed round-robin across all active keys inside the chosen group.
        </p>
      </div>
    </div>
  );
}
