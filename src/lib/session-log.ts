import type { LogEntry } from '../types';

/** Export the session combat log as markdown for a recap. */
export function sessionLogToMarkdown(
  log: LogEntry[],
  opts?: { campaignName?: string; sessionNumber?: number; title?: string },
): string {
  const title = opts?.title ?? 'Session log';
  const header = [
    `# ${title}`,
    '',
    opts?.campaignName ? `Campaign: ${opts.campaignName}` : null,
    opts?.sessionNumber != null ? `Session: ${opts.sessionNumber}` : null,
    `Exported: ${new Date().toISOString()}`,
    '',
    '---',
    '',
  ]
    .filter(Boolean)
    .join('\n');

  if (log.length === 0) {
    return `${header}_No events logged._\n`;
  }

  const lines = log.map((e) => {
    const t = new Date(e.at).toLocaleTimeString(undefined, {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
    });
    const kind = e.kind ? ` _(${e.kind})_` : '';
    return `- **${t}**${kind} — ${e.message}`;
  });

  return `${header}${lines.join('\n')}\n`;
}

export function downloadText(filename: string, contents: string, mime = 'text/plain') {
  const blob = new Blob([contents], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}
