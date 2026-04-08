'use client';

import { useState } from 'react';
import { INTEREST_CATEGORIES } from '@/lib/agent/types';
import type { InterestSelection, InterestCategoryKey } from '@/lib/agent/types';

interface Props {
  selected: InterestSelection[];
  onChange: (selections: InterestSelection[]) => void;
}

export function InterestSelector({ selected, onChange }: Props) {
  const [expanded, setExpanded] = useState<string | null>(null);

  const selectedMap = new Map(selected.map(s => [s.category, new Set(s.tags)]));

  function toggleTag(category: string, tag: string) {
    const current = selectedMap.get(category) ?? new Set<string>();
    if (current.has(tag)) {
      current.delete(tag);
    } else {
      current.add(tag);
    }

    const next: InterestSelection[] = [];
    for (const [cat, tags] of selectedMap) {
      if (cat === category) {
        if (current.size > 0) next.push({ category, tags: [...current] });
      } else {
        next.push({ category: cat, tags: [...tags] });
      }
    }
    if (!selectedMap.has(category) && current.size > 0) {
      next.push({ category, tags: [...current] });
    }
    onChange(next);
  }

  function isSelected(category: string, tag: string): boolean {
    return selectedMap.get(category)?.has(tag) ?? false;
  }

  function categoryCount(category: string): number {
    return selectedMap.get(category)?.size ?? 0;
  }

  const categories = Object.entries(INTEREST_CATEGORIES) as [InterestCategoryKey, typeof INTEREST_CATEGORIES[InterestCategoryKey]][];

  return (
    <div className="space-y-2">
      <label className="block text-sm text-white/60 mb-1">Interests</label>
      {categories.map(([key, cat]) => {
        const count = categoryCount(key);
        const isOpen = expanded === key;
        return (
          <div key={key} className="border border-white/10 rounded-lg overflow-hidden">
            <button
              type="button"
              onClick={() => setExpanded(isOpen ? null : key)}
              className="w-full flex items-center justify-between px-3 py-2 text-sm hover:bg-white/5 transition-colors cursor-pointer"
            >
              <span className="text-white/80">{cat.label}</span>
              <span className="flex items-center gap-2">
                {count > 0 && (
                  <span className="text-xs text-green-400">{count} selected</span>
                )}
                <span className="text-white/30 text-xs">{isOpen ? '▲' : '▼'}</span>
              </span>
            </button>
            {isOpen && (
              <div className="px-3 pb-3 flex flex-wrap gap-1.5">
                {cat.tags.map(tag => (
                  <button
                    key={tag}
                    type="button"
                    onClick={() => toggleTag(key, tag)}
                    className={`px-2 py-1 text-xs rounded-full border transition-colors cursor-pointer ${
                      isSelected(key, tag)
                        ? 'border-green-500 text-green-400 bg-green-500/10'
                        : 'border-white/15 text-white/50 hover:border-white/30 hover:text-white/70'
                    }`}
                  >
                    {tag.replace(/-/g, ' ')}
                  </button>
                ))}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
