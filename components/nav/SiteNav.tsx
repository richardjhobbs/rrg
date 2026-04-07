'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const channels = [
  { href: '/agents', label: 'Create Agent' },
  { href: '/drops', label: 'Drops' },
  { href: '/create', label: 'Co-Create' },
  { href: '/shop', label: 'Shop' },
];

export function SiteNav() {
  const pathname = usePathname();

  return (
    <nav className="border-b border-neutral-800 px-6 py-3">
      <div className="max-w-6xl mx-auto flex items-center justify-between">
        <Link href="/" className="text-lg font-bold tracking-tight">
          VIA
        </Link>

        <div className="flex items-center gap-1">
          {channels.map((ch) => {
            const active = pathname?.startsWith(ch.href);
            return (
              <Link
                key={ch.href}
                href={ch.href}
                className={`px-3 py-1.5 rounded-md text-sm font-medium transition-colors ${
                  active
                    ? 'bg-neutral-800 text-white'
                    : 'text-neutral-400 hover:text-white hover:bg-neutral-900'
                }`}
              >
                {ch.label}
              </Link>
            );
          })}
        </div>
      </div>
    </nav>
  );
}
