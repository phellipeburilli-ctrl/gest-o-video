'use client';

import { useState, useMemo } from 'react';
import { AlertTriangle, Search, ChevronDown, ChevronUp } from 'lucide-react';

export interface EditorListItem {
    id: string | number;
    name: string;
    teamName: string;
    teamColor: string;
    editorColor: string;
    alterationRate: number;
    totalVideos: number;
    videosWithAlteration: number;
    // Campos opcionais para contexto adicional
    trend?: 'improving' | 'stable' | 'worsening';
    trendValue?: number;
}

interface EditorListProps {
    editors: EditorListItem[];
    selectedId: string | number | null;
    onSelect: (editor: EditorListItem) => void;
    title?: string;
    showSearch?: boolean;
    compact?: boolean;
}

// Helper para iniciais
function getInitials(name: string): string {
    return name
        .split(' ')
        .map(n => n[0])
        .join('')
        .substring(0, 2)
        .toUpperCase();
}

// Helper para cor do status
function getStatusColor(rate: number): string {
    if (rate >= 35) return 'text-red-400';
    if (rate >= 20) return 'text-yellow-400';
    return 'text-green-400';
}

function getStatusBg(rate: number): string {
    if (rate >= 35) return 'bg-red-500/20 border-red-500/30';
    if (rate >= 20) return 'bg-yellow-500/20 border-yellow-500/30';
    return 'bg-green-500/20 border-green-500/30';
}

export function EditorList({
    editors,
    selectedId,
    onSelect,
    title = 'Selecione um Editor',
    showSearch = true,
    compact = false
}: EditorListProps) {
    const [search, setSearch] = useState('');
    const [sortBy, setSortBy] = useState<'rate' | 'name' | 'videos'>('rate');
    const [sortDesc, setSortDesc] = useState(true);

    // Filtrar e ordenar
    const filteredEditors = useMemo(() => {
        let result = editors.filter(e =>
            e.name.toLowerCase().includes(search.toLowerCase()) ||
            e.teamName.toLowerCase().includes(search.toLowerCase())
        );

        // Ordenar
        result.sort((a, b) => {
            let comparison = 0;
            if (sortBy === 'rate') {
                comparison = a.alterationRate - b.alterationRate;
            } else if (sortBy === 'name') {
                comparison = a.name.localeCompare(b.name);
            } else if (sortBy === 'videos') {
                comparison = a.totalVideos - b.totalVideos;
            }
            return sortDesc ? -comparison : comparison;
        });

        return result;
    }, [editors, search, sortBy, sortDesc]);

    // Agrupar por status
    const groupedEditors = useMemo(() => {
        const critical = filteredEditors.filter(e => e.alterationRate >= 35);
        const attention = filteredEditors.filter(e => e.alterationRate >= 20 && e.alterationRate < 35);
        const ok = filteredEditors.filter(e => e.alterationRate < 20);
        return { critical, attention, ok };
    }, [filteredEditors]);

    const toggleSort = (field: 'rate' | 'name' | 'videos') => {
        if (sortBy === field) {
            setSortDesc(!sortDesc);
        } else {
            setSortBy(field);
            setSortDesc(true);
        }
    };

    const renderEditor = (editor: EditorListItem) => {
        const isSelected = selectedId === editor.id;
        const statusColor = getStatusColor(editor.alterationRate);

        return (
            <div
                key={editor.id}
                onClick={() => onSelect(editor)}
                className={`
                    flex items-center gap-3 p-3 rounded-lg cursor-pointer transition-all
                    ${isSelected
                        ? 'bg-purple-600/30 border border-purple-500/50'
                        : 'bg-[#12121a] border border-transparent hover:border-purple-500/30 hover:bg-purple-900/20'
                    }
                `}
            >
                {/* Avatar */}
                <div
                    className="w-10 h-10 rounded-full flex items-center justify-center text-white font-bold text-sm flex-shrink-0"
                    style={{ backgroundColor: editor.editorColor }}
                >
                    {getInitials(editor.name)}
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                        <span className="text-white font-medium truncate">{editor.name}</span>
                        {editor.alterationRate >= 35 && (
                            <AlertTriangle className="w-4 h-4 text-red-400 flex-shrink-0" />
                        )}
                    </div>
                    <span className="text-gray-500 text-xs">
                        {editor.videosWithAlteration}/{editor.totalVideos} alterações
                    </span>
                </div>

                {/* Taxa */}
                <div className="text-right flex-shrink-0">
                    <span className={`text-lg font-bold ${statusColor}`}>
                        {editor.alterationRate}%
                    </span>
                </div>
            </div>
        );
    };

    return (
        <div className="flex flex-col h-full">
            {/* Header */}
            <div className="mb-4">
                <h3 className="text-gray-400 text-sm font-medium mb-3">{title}</h3>

                {/* Search */}
                {showSearch && (
                    <div className="relative mb-3">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-500" />
                        <input
                            type="text"
                            placeholder="Buscar editor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="w-full bg-[#12121a] border border-purple-900/30 rounded-lg pl-9 pr-3 py-2 text-white text-sm placeholder-gray-500 focus:outline-none focus:border-purple-500"
                        />
                    </div>
                )}

                {/* Sort buttons */}
                <div className="flex gap-1 text-xs">
                    <button
                        onClick={() => toggleSort('rate')}
                        className={`px-2 py-1 rounded ${sortBy === 'rate' ? 'bg-purple-600/30 text-purple-300' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Taxa {sortBy === 'rate' && (sortDesc ? '↓' : '↑')}
                    </button>
                    <button
                        onClick={() => toggleSort('name')}
                        className={`px-2 py-1 rounded ${sortBy === 'name' ? 'bg-purple-600/30 text-purple-300' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Nome {sortBy === 'name' && (sortDesc ? '↓' : '↑')}
                    </button>
                    <button
                        onClick={() => toggleSort('videos')}
                        className={`px-2 py-1 rounded ${sortBy === 'videos' ? 'bg-purple-600/30 text-purple-300' : 'text-gray-500 hover:text-gray-300'}`}
                    >
                        Vídeos {sortBy === 'videos' && (sortDesc ? '↓' : '↑')}
                    </button>
                </div>
            </div>

            {/* Lista */}
            <div className="flex-1 overflow-y-auto space-y-2 pr-1">
                {/* Críticos */}
                {groupedEditors.critical.length > 0 && (
                    <div className="mb-4">
                        <div className="text-red-400 text-xs font-semibold mb-2 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-red-500"></span>
                            Crítico ({groupedEditors.critical.length})
                        </div>
                        <div className="space-y-1">
                            {groupedEditors.critical.map(renderEditor)}
                        </div>
                    </div>
                )}

                {/* Atenção */}
                {groupedEditors.attention.length > 0 && (
                    <div className="mb-4">
                        <div className="text-yellow-400 text-xs font-semibold mb-2 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                            Atenção ({groupedEditors.attention.length})
                        </div>
                        <div className="space-y-1">
                            {groupedEditors.attention.map(renderEditor)}
                        </div>
                    </div>
                )}

                {/* OK */}
                {groupedEditors.ok.length > 0 && (
                    <div className="mb-4">
                        <div className="text-green-400 text-xs font-semibold mb-2 flex items-center gap-1">
                            <span className="w-2 h-2 rounded-full bg-green-500"></span>
                            OK ({groupedEditors.ok.length})
                        </div>
                        <div className="space-y-1">
                            {groupedEditors.ok.map(renderEditor)}
                        </div>
                    </div>
                )}

                {/* Empty state */}
                {filteredEditors.length === 0 && (
                    <div className="text-center py-8 text-gray-500">
                        {search ? 'Nenhum editor encontrado' : 'Nenhum editor disponível'}
                    </div>
                )}
            </div>

            {/* Footer com totais */}
            <div className="pt-3 mt-3 border-t border-purple-900/30 text-xs text-gray-500">
                <div className="flex justify-between">
                    <span>Total: {editors.length} editores</span>
                    <span>
                        <span className="text-red-400">{groupedEditors.critical.length}</span> /
                        <span className="text-yellow-400"> {groupedEditors.attention.length}</span> /
                        <span className="text-green-400"> {groupedEditors.ok.length}</span>
                    </span>
                </div>
            </div>
        </div>
    );
}
