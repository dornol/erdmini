export interface RestoreFlowDeps {
  confirm: () => Promise<boolean>;
  exportAll: () => Promise<string>;
  download: (json: string, filename: string) => void;
  importAll: (json: string) => Promise<{ ok: boolean; error?: string }>;
  now?: () => Date;
}

export type RestoreOutcome =
  | { kind: 'cancelled' }
  | { kind: 'pre-export-failed'; error: string }
  | { kind: 'imported'; ok: boolean; error?: string };

function formatStamp(d: Date): string {
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}_${pad(d.getHours())}${pad(d.getMinutes())}${pad(d.getSeconds())}`;
}

/**
 * Restore-from-backup flow with safety net.
 *
 * Order: confirm → export current state → download as pre-restore file → importAll.
 * If confirm returns false, no destructive call is made.
 * If pre-export throws, importAll is NOT called — the safety net is required before destructive work.
 */
export async function runRestoreFlow(
  backupJson: string,
  deps: RestoreFlowDeps,
): Promise<RestoreOutcome> {
  const ok = await deps.confirm();
  if (!ok) return { kind: 'cancelled' };

  let currentJson: string;
  try {
    currentJson = await deps.exportAll();
  } catch (e) {
    return { kind: 'pre-export-failed', error: e instanceof Error ? e.message : String(e) };
  }

  const ts = deps.now ? deps.now() : new Date();
  deps.download(currentJson, `erdmini_pre_restore_${formatStamp(ts)}.json`);

  const result = await deps.importAll(backupJson);
  return { kind: 'imported', ok: result.ok, error: result.error };
}
