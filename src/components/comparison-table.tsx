"use client"

import * as React from "react"
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from "@/components/ui/card"
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { Badge } from "@/components/ui/badge"
import { cn } from "@/lib/utils"
import { EditorStats } from "@/types"
import { Search, ArrowRightLeft, Trophy, Clock, Video, Activity } from "lucide-react"

interface ComparisonTableProps {
    editors: EditorStats[];
}

export default function ComparisonTable({ editors }: ComparisonTableProps) {
    const [selectedIds, setSelectedIds] = React.useState<number[]>([])
    const [search, setSearch] = React.useState("")

    const toggleSelect = (id: number) => {
        setSelectedIds((prev) =>
            prev.includes(id) ? prev.filter((x) => x !== id) : prev.length < 2 ? [...prev, id] : prev
        )
    }

    const resetSelection = () => setSelectedIds([])

    const filteredEditors = editors.filter((editor) => {
        const matchesSearch = editor.editorName.toLowerCase().includes(search.toLowerCase());
        return matchesSearch;
    });

    const comparedEditors = editors.filter((editor) => selectedIds.includes(editor.editorId));

    return (
        <div className="w-full max-w-7xl mx-auto space-y-8 animate-in fade-in duration-500">

            {/* HEADER */}
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4">
                <div>
                    <h2 className="text-3xl font-bold bg-gradient-to-r from-white to-slate-400 bg-clip-text text-transparent">
                        Comparativo de Editores
                    </h2>
                    <p className="text-slate-400 text-sm mt-1">
                        Selecione até 2 editores para uma análise lado a lado.
                    </p>
                </div>

                <div className="flex items-center gap-3 w-full md:w-auto">
                    <div className="relative w-full md:w-64">
                        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
                        <Input
                            placeholder="Buscar editor..."
                            value={search}
                            onChange={(e) => setSearch(e.target.value)}
                            className="pl-9 bg-slate-900/50 border-slate-800"
                        />
                    </div>
                    {selectedIds.length > 0 && (
                        <Button variant="outline" onClick={resetSelection} className="border-slate-700 text-slate-300 hover:bg-slate-800">
                            Limpar ({selectedIds.length})
                        </Button>
                    )}
                </div>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">

                {/* LEFT: SELECTION TABLE */}
                <Card className="col-span-1 lg:col-span-2 bg-slate-900/40 border-slate-800/60 backdrop-blur-md shadow-xl">
                    <CardHeader>
                        <CardTitle className="text-lg text-slate-200">Lista de Editores</CardTitle>
                    </CardHeader>
                    <CardContent className="p-0">
                        <div className="max-h-[500px] overflow-y-auto custom-scrollbar">
                            <Table>
                                <TableHeader className="bg-slate-950/50 sticky top-0 z-10 backdrop-blur-sm">
                                    <TableRow className="border-slate-800 hover:bg-transparent">
                                        <TableHead className="text-slate-400">Editor</TableHead>
                                        <TableHead className="text-slate-400 text-center">Vídeos</TableHead>
                                        <TableHead className="text-slate-400 text-center">Eficiência</TableHead>
                                        <TableHead className="text-slate-400 text-right">Ação</TableHead>
                                    </TableRow>
                                </TableHeader>
                                <TableBody>
                                    {filteredEditors.map((editor) => {
                                        const isSelected = selectedIds.includes(editor.editorId);
                                        return (
                                            <TableRow
                                                key={editor.editorId}
                                                className={cn(
                                                    "border-slate-800 transition-colors",
                                                    isSelected ? "bg-cyan-950/10 hover:bg-cyan-950/20" : "hover:bg-slate-800/30"
                                                )}
                                            >
                                                <TableCell className="font-medium text-slate-200">
                                                    <div className="flex items-center gap-3">
                                                        <div className="w-8 h-8 rounded-full bg-slate-800 flex items-center justify-center text-xs font-bold text-slate-400 border border-slate-700">
                                                            {editor.editorName.charAt(0)}
                                                        </div>
                                                        {editor.editorName}
                                                    </div>
                                                </TableCell>
                                                <TableCell className="text-center text-slate-300">
                                                    {editor.totalVideos}
                                                </TableCell>
                                                <TableCell className="text-center">
                                                    <Badge variant="secondary" className="bg-slate-800 text-slate-300 hover:bg-slate-700">
                                                        {editor.avgHoursPerVideo}h
                                                    </Badge>
                                                </TableCell>
                                                <TableCell className="text-right">
                                                    <Button
                                                        variant={isSelected ? "destructive" : "secondary"}
                                                        size="sm"
                                                        className={cn(
                                                            "transition-all",
                                                            isSelected
                                                                ? "bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20"
                                                                : "bg-cyan-500/10 text-cyan-500 hover:bg-cyan-500/20 border border-cyan-500/20"
                                                        )}
                                                        onClick={() => toggleSelect(editor.editorId)}
                                                        disabled={!isSelected && selectedIds.length >= 2}
                                                    >
                                                        {isSelected ? "Remover" : "Comparar"}
                                                    </Button>
                                                </TableCell>
                                            </TableRow>
                                        )
                                    })}
                                </TableBody>
                            </Table>
                        </div>
                    </CardContent>
                </Card>

                {/* RIGHT: COMPARISON RESULT */}
                <div className="col-span-1">
                    {comparedEditors.length === 0 && (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center border-2 border-dashed border-slate-800 rounded-xl bg-slate-900/20 p-8 text-center">
                            <ArrowRightLeft className="w-12 h-12 text-slate-700 mb-4" />
                            <h3 className="text-xl font-semibold text-slate-500">Modo Comparativo</h3>
                            <p className="text-slate-600 mt-2 max-w-xs">
                                Selecione dois editores da lista ao lado para ver uma comparação detalhada de performance.
                            </p>
                        </div>
                    )}

                    {comparedEditors.length === 1 && (
                        <div className="h-full min-h-[300px] flex flex-col items-center justify-center border border-slate-800 rounded-xl bg-slate-900/40 p-8 text-center backdrop-blur-sm animate-in zoom-in-95">
                            <div className="w-16 h-16 rounded-full bg-slate-800 border-2 border-cyan-500/30 flex items-center justify-center text-2xl font-bold text-slate-200 mb-4 shadow-lg shadow-cyan-500/10">
                                {comparedEditors[0].editorName.charAt(0)}
                            </div>
                            <h3 className="text-xl font-bold text-slate-200">{comparedEditors[0].editorName}</h3>
                            <p className="text-cyan-400 text-sm font-medium mt-1">Selecionado</p>
                            <p className="text-slate-500 mt-6 animate-pulse">
                                Selecione mais um para comparar...
                            </p>
                        </div>
                    )}

                    {comparedEditors.length === 2 && (
                        <Card className="bg-slate-900/60 border-slate-800 backdrop-blur-xl shadow-2xl animate-in slide-in-from-right-10 duration-500">
                            <CardHeader className="bg-slate-950/50 border-b border-slate-800 pb-4">
                                <CardTitle className="text-center text-slate-200 flex items-center justify-center gap-3">
                                    <span className="text-cyan-400">{comparedEditors[0].editorName}</span>
                                    <span className="text-slate-600 text-sm">vs</span>
                                    <span className="text-violet-400">{comparedEditors[1].editorName}</span>
                                </CardTitle>
                            </CardHeader>
                            <CardContent className="p-6 space-y-6">

                                {/* Comparison Row: VIDEOS */}
                                <ComparisonRow
                                    label="Vídeos Entregues"
                                    icon={Video}
                                    value1={comparedEditors[0].totalVideos}
                                    value2={comparedEditors[1].totalVideos}
                                    better="higher"
                                    unit=""
                                />

                                {/* Comparison Row: EFFICIENCY */}
                                <ComparisonRow
                                    label="Eficiência (Horas/Vídeo)"
                                    icon={Clock}
                                    value1={comparedEditors[0].avgHoursPerVideo}
                                    value2={comparedEditors[1].avgHoursPerVideo}
                                    better="lower"
                                    unit="h"
                                />

                                {/* Comparison Row: TOTAL HOURS */}
                                <ComparisonRow
                                    label="Horas Totais"
                                    icon={Activity}
                                    value1={comparedEditors[0].totalHours}
                                    value2={comparedEditors[1].totalHours}
                                    better="higher"
                                    unit="h"
                                />

                                {/* Comparison Row: LEAD TIME */}
                                <ComparisonRow
                                    label="Lead Time Médio"
                                    icon={Trophy} // Fallback icon
                                    value1={comparedEditors[0].avgLeadTimeHours}
                                    value2={comparedEditors[1].avgLeadTimeHours}
                                    better="lower"
                                    unit="h"
                                />

                            </CardContent>
                        </Card>
                    )}
                </div>
            </div>
        </div>
    )
}

function ComparisonRow({ label, icon: Icon, value1, value2, better, unit }: any) {
    const is1Better = better === 'higher' ? value1 > value2 : value1 < value2;
    // Handle equality
    const isEqual = value1 === value2;

    return (
        <div className="bg-slate-950/30 rounded-xl p-4 border border-slate-800/50">
            <div className="flex items-center gap-2 mb-3 text-slate-400 text-xs font-semibold uppercase tracking-wider">
                <Icon className="w-3 h-3" />
                {label}
            </div>
            <div className="flex justify-between items-center px-2">
                <div className={cn("text-xl font-bold font-mono transition-colors", is1Better && !isEqual ? "text-cyan-400" : "text-slate-500")}>
                    {value1}<span className="text-xs">{unit}</span>
                </div>

                {/* Bar Visual */}
                <div className="flex gap-1 h-1.5 w-16 mx-4">
                    <div className={cn("h-full rounded-l-full flex-1", is1Better ? "bg-cyan-500" : "bg-slate-700")} style={{ opacity: is1Better ? 1 : 0.3 }} />
                    <div className={cn("h-full rounded-r-full flex-1", !is1Better ? "bg-violet-500" : "bg-slate-700")} style={{ opacity: !is1Better ? 1 : 0.3 }} />
                </div>

                <div className={cn("text-xl font-bold font-mono transition-colors", !is1Better && !isEqual ? "text-violet-400" : "text-slate-500")}>
                    {value2}<span className="text-xs">{unit}</span>
                </div>
            </div>
        </div>
    )
}
