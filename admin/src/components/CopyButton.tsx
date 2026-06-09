import { useState } from 'react';

interface CopyButtonProps {
  text: string;
  variant?: 'dark' | 'light';
  inline?: boolean;
}

export default function CopyButton({ text, variant = 'dark', inline }: CopyButtonProps) {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(true);
      setTimeout(() => setCopied(false), 1500);
    } catch {
      setCopied(false);
    }
  };

  const cls = copied
    ? 'bg-[#10B981] text-white border-transparent'
    : variant === 'dark'
      ? 'bg-gray-700 text-gray-300 hover:bg-gray-600 border-transparent'
      : 'bg-white text-[#6B6B6B] border border-[#E8E8EC] hover:border-[#6366F1] hover:text-[#6366F1]';

  return (
    <button
      onClick={handleCopy}
      className={`${inline ? 'relative' : 'absolute top-2 right-2'} px-2 py-1 text-xs font-medium rounded-[4px] transition-all ${cls}`}
    >
      {copied ? 'Copied!' : 'Copy'}
    </button>
  );
}
