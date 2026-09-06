import React, { useState, useEffect, useRef } from 'react';
import { ModelConfig } from '../../shared/types';
import { apiRequest } from '../api';
import { Cpu, Search, Pin, ChevronDown, Check, Settings, Sparkles } from 'lucide-react';

export const ModelSelector: React.FC<{
  models: ModelConfig[];
  selectedModelId: string;
  onSelectModel: (modelId: string) => void;
  onOpenSettings: () => void;
  onReloadModels: () => void;
  labelPrefix?: string;
}> = ({ models, selectedModelId, onSelectModel, onOpenSettings, onReloadModels, labelPrefix = 'Model' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const selectedModel = models.find(m => m.id === selectedModelId || m.modelId === selectedModelId);

  const togglePin = async (e: React.MouseEvent, m: ModelConfig) => {
    e.stopPropagation();
    const updatedList = models.map(item =>
      item.id === m.id ? { ...item, pinned: !item.pinned } : item
    );
    try {
      await apiRequest('/api/models', {
        method: 'POST',
        body: JSON.stringify({ models: updatedList })
      });
      onReloadModels();
    } catch (err) {
      console.error('Failed to pin model:', err);
    }
  };

  // Sort models: Pinned first, then alphabetically
  const sortedModels = [...models].sort((a, b) => {
    if (a.pinned && !b.pinned) return -1;
    if (!a.pinned && b.pinned) return 1;
    return a.name.localeCompare(b.name);
  });

  const filteredModels = sortedModels.filter(m =>
    m.name.toLowerCase().includes(search.toLowerCase().trim()) ||
    m.modelId.toLowerCase().includes(search.toLowerCase().trim()) ||
    m.provider.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <div className="relative font-mono text-[11px]" ref={dropdownRef}>
      {/* Selector Trigger Button */}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-1.5 bg-surface hover:bg-zinc-800 border border-border rounded px-2.5 py-1 text-accent font-semibold transition-colors truncate max-w-[240px]"
      >
        <Cpu className="w-3.5 h-3.5 shrink-0" />
        <span className="truncate">
          {selectedModel ? selectedModel.name : selectedModelId}
        </span>
        <ChevronDown className="w-3 h-3 text-zinc-400 shrink-0 ml-0.5" />
      </button>

      {/* Dropdown Menu Modal */}
      {isOpen && (
        <div className="absolute left-0 top-full mt-1.5 w-72 bg-surface border border-border rounded-lg shadow-2xl z-50 overflow-hidden flex flex-col max-h-80">
          {/* Search Box */}
          <div className="p-2 border-b border-border bg-background/80 flex items-center space-x-1.5 shrink-0">
            <Search className="w-3.5 h-3.5 text-zinc-500 shrink-0" />
            <input
              type="text"
              placeholder="Search model or provider..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              className="w-full bg-transparent text-xs text-zinc-100 placeholder-zinc-500 focus:outline-none"
              autoFocus
            />
          </div>

          {/* Model Items */}
          <div className="overflow-y-auto flex-1 p-1 space-y-0.5">
            {filteredModels.length === 0 ? (
              <div className="p-3 text-center text-zinc-500 text-[10px]">
                No models matching "{search}"
              </div>
            ) : (
              filteredModels.map((m) => {
                const isSelected = m.id === selectedModelId || m.modelId === selectedModelId;
                return (
                  <div
                    key={m.id}
                    onClick={() => {
                      onSelectModel(m.id);
                      setIsOpen(false);
                    }}
                    className={`flex items-center justify-between p-2 rounded cursor-pointer transition-colors ${
                      isSelected
                        ? 'bg-accent/15 border border-accent/40 text-accent'
                        : 'hover:bg-zinc-800/80 text-zinc-200 border border-transparent'
                    }`}
                  >
                    <div className="flex items-center space-x-2 truncate pr-2">
                      {isSelected ? (
                        <Check className="w-3.5 h-3.5 text-accent shrink-0" />
                      ) : (
                        <Sparkles className="w-3 h-3 text-zinc-600 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="font-semibold text-[11px] truncate flex items-center space-x-1">
                          <span>{m.name}</span>
                          {m.pinned && <span className="text-[10px]">📌</span>}
                        </div>
                        <div className="text-[9px] text-zinc-500 font-mono truncate">
                          {m.provider} • {m.modelId}
                        </div>
                      </div>
                    </div>

                    {/* Pin button */}
                    <button
                      type="button"
                      onClick={(e) => togglePin(e, m)}
                      title={m.pinned ? 'Unpin model' : 'Pin model to top'}
                      className={`p-1 rounded hover:bg-zinc-700 shrink-0 transition-colors ${
                        m.pinned ? 'text-amber-400' : 'text-zinc-600 hover:text-zinc-300'
                      }`}
                    >
                      <Pin className="w-3 h-3" />
                    </button>
                  </div>
                );
              })
            )}
          </div>

          {/* Manage Models Link */}
          <div className="p-2 border-t border-border bg-background/50 flex items-center justify-between shrink-0 text-[10px]">
            <span className="text-zinc-500">{models.length} Models</span>
            <button
              type="button"
              onClick={() => {
                setIsOpen(false);
                onOpenSettings();
              }}
              className="text-accent hover:underline flex items-center space-x-1 font-semibold"
            >
              <Settings className="w-3 h-3" />
              <span>+ Add / Manage Providers</span>
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
