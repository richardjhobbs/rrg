'use client';

import { useRouter, useSearchParams } from 'next/navigation';

interface BriefOption {
  id: string;
  title: string;
}

export default function BriefFilter({
  briefs,
  currentBriefId,
  selected,
}: {
  briefs: BriefOption[];
  currentBriefId: string | null;
  selected: string; // 'all' | 'current' | brief UUID
}) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const handleChange = (e: React.ChangeEvent<HTMLSelectElement>) => {
    const val = e.target.value;
    const params = new URLSearchParams(searchParams.toString());
    if (val === 'all') {
      params.delete('brief');
    } else {
      params.set('brief', val);
    }
    params.delete('page'); // reset to page 1 on filter change
    const qs = params.toString();
    router.push(qs ? `/rrg?${qs}` : '/rrg');
  };

  return (
    <select
      value={selected}
      onChange={handleChange}
      className="bg-transparent border border-white/20 text-white/80 text-sm font-mono
                 px-3 py-1.5 rounded-none appearance-none cursor-pointer
                 hover:border-white/40 focus:border-white/50 focus:outline-none
                 transition-colors max-w-[200px] truncate"
      style={{
        backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6' fill='none'%3E%3Cpath d='M1 1l4 4 4-4' stroke='rgba(255,255,255,0.6)' stroke-width='1.5'/%3E%3C/svg%3E")`,
        backgroundRepeat: 'no-repeat',
        backgroundPosition: 'right 10px center',
        paddingRight: '28px',
      }}
    >
      <option value="all" className="bg-black text-white">All</option>
      {currentBriefId && (
        <option value="current" className="bg-black text-white">Current Brief</option>
      )}
      <optgroup label="Past Challenges" className="bg-black text-white">
        {briefs
          .filter((b) => b.id !== currentBriefId)
          .map((b) => (
            <option key={b.id} value={b.id} className="bg-black text-white">
              {b.title}
            </option>
          ))}
      </optgroup>
    </select>
  );
}
