import { simpleGit } from "simple-git";
import { scanLine, isSensitiveFilename, type SecretMatch } from "./secretScanner";

export interface HistoryMatch extends SecretMatch {
  commit: string;
}

/**
 * Scans every commit's added lines, across all branches, for secrets —
 * the gitleaks approach. This finds secrets that were committed and later
 * removed, since `git log -p` still shows them in the historical diff.
 */
export async function scanLocalRepoHistory(repoDir: string, maxCommits = 2000): Promise<HistoryMatch[]> {
  const git = simpleGit(repoDir);
  const patch = await git.raw(["log", "--all", "-p", "--no-color", "-U0", `-${maxCommits}`]);

  const matches: HistoryMatch[] = [];
  const seenFiles = new Set<string>();
  let currentCommit = "unknown";
  let currentFile = "unknown";

  for (const rawLine of patch.split("\n")) {
    if (rawLine.startsWith("commit ")) {
      currentCommit = rawLine.slice("commit ".length).trim();
      continue;
    }
    const diffHeader = rawLine.match(/^diff --git a\/(.+?) b\/(.+)$/);
    if (diffHeader) {
      currentFile = diffHeader[2];
      if (isSensitiveFilename(currentFile) && !seenFiles.has(currentFile)) {
        seenFiles.add(currentFile);
        matches.push({
          ruleId: "sensitive_filename",
          description: `Sensitive file committed: ${currentFile}`,
          category: "sensitive_file",
          severity: "high",
          redacted: currentFile,
          line: 0,
          file: currentFile,
          commit: currentCommit,
        });
      }
      continue;
    }
    if (rawLine.startsWith("+++") || rawLine.startsWith("---")) continue;
    if (!rawLine.startsWith("+")) continue;

    const added = rawLine.slice(1);
    for (const m of scanLine(added)) {
      matches.push({ ...m, file: currentFile, line: 0, commit: currentCommit });
    }
  }
  return matches;
}
