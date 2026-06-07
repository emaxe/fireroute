import { useEffect, useState } from 'react';
import API from '../api/client';

interface Log {
  id: string;
  endpoint: string;
  status: number;
  latencyMs: number;
  error?: string;
  createdAt: string;
  token?: { user?: { email: string } };
  key?: { name: string };
}

function StatusBadge({ status }: { status: number }) {
  const ok = status < 400;
  return (
    <span className={`font-mono text-xs font-medium px-2 py-0.5 rounded-[4px] ${
      ok ? 'bg-[#DCFCE7] text-[#10B981]' : 'bg-red-50 text-[#EF4444]'
    }`}>
      {status}
    </span>
  );
}

const TH = 'px-4 py-3 text-left text-[11px] font-medium uppercase tracking-wider text-[#9C9C9C]';
const TD = 'px-4 py-3 text-sm';

export default function Logs() {
  const [logs, setLogs] = useState<Log[]>([]);

  useEffect(() => {
    API.get('/stats/logs').then((res) => setLogs(res.data));
  }, []);

  return (
    <div>
      <div className="mb-8">
        <h1 className="font-display font-semibold text-[28px] text-[#0A0A0A] tracking-tight">Request Logs</h1>
        <p className="text-sm text-[#6B6B6B] mt-1">Recent gateway proxy requests</p>
      </div>

      <div className="bg-white border border-[#E8E8EC] rounded-xl overflow-hidden">
        <table className="w-full">
          <thead className="bg-[#FAFAFA] border-b border-[#E8E8EC]">
            <tr>
              <th className={TH}>Time</th>
              <th className={TH}>Endpoint</th>
              <th className={TH}>Status</th>
              <th className={TH}>Latency</th>
              <th className={TH}>User</th>
              <th className={TH}>Key</th>
              <th className={TH}>Error</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#E8E8EC]">
            {logs.length === 0 && (
              <tr>
                <td colSpan={7} className="px-4 py-10 text-center text-sm text-[#9C9C9C]">
                  No requests logged yet.
                </td>
              </tr>
            )}
            {logs.map((l) => (
              <tr key={l.id} className="hover:bg-[#FAFAFA] transition-colors">
                <td className={`${TD} text-xs text-[#9C9C9C] whitespace-nowrap`}>
                  {new Date(l.createdAt).toLocaleString()}
                </td>
                <td className={`${TD} font-mono text-[#6B6B6B]`}>{l.endpoint}</td>
                <td className={TD}><StatusBadge status={l.status} /></td>
                <td className={`${TD} text-[#6B6B6B]`}>{l.latencyMs} ms</td>
                <td className={`${TD} text-[#6B6B6B]`}>
                  {l.token?.user?.email || <span className="text-[#9C9C9C]">—</span>}
                </td>
                <td className={`${TD} text-[#6B6B6B]`}>
                  {l.key?.name || <span className="text-[#9C9C9C]">—</span>}
                </td>
                <td className={`${TD} text-xs text-[#EF4444] max-w-[200px] truncate`} title={l.error}>
                  {l.error || <span className="text-[#9C9C9C]">—</span>}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
