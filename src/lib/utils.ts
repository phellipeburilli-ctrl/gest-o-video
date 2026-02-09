import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"
import { ClickUpTask } from "@/types"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normaliza o status do ClickUp para um status padronizado
 */
export function normalizeStatus(rawStatus: string): string {
  const status = rawStatus.toLowerCase();

  if (status.includes('aprovado') || status.includes('conclu')) {
    return 'COMPLETED';
  }
  if (status.includes('editando')) {
    return 'IN_PROGRESS';
  }
  if (status.includes('revisão') || status.includes('revisando')) {
    return 'IN_REVIEW';
  }
  if (status.includes('alteração')) {
    return 'ALTERATION';
  }
  if (status.includes('aguardando') || status.includes('pendente')) {
    return 'PENDING';
  }
  if (status.includes('open') || status.includes('aberto')) {
    return 'OPEN';
  }

  return 'OTHER';
}

/**
 * Extrai o tipo de vídeo das tags da task
 */
export function getVideoType(task: ClickUpTask): string | null {
  const tags = task.tags || [];

  // Procurar tags que indicam tipo de vídeo
  const typeMap: Record<string, string> = {
    'vsl': 'VSL',
    'funil': 'Funil',
    'ads': 'ADs',
    'ad': 'ADs',
    'thumbnail': 'Thumbnail',
    'tp': 'Thumbnail',
    'mic': 'MIC',
    'lead': 'Lead',
    'reels': 'Reels',
    'shorts': 'Shorts',
    'corte': 'Corte',
  };

  for (const tag of tags) {
    const tagLower = tag.name.toLowerCase();
    for (const [key, value] of Object.entries(typeMap)) {
      if (tagLower.includes(key)) {
        return value;
      }
    }
  }

  return null;
}

/**
 * Calcula a taxa de alteração
 */
export function calculateAlterationRate(videosWithAlteration: number, totalVideos: number): number {
  if (totalVideos === 0) return 0;
  return Math.round((videosWithAlteration / totalVideos) * 100);
}
