import { existsSync } from 'fs'
import { join } from 'path'
import simpleGit from 'simple-git'
import { execFile } from 'child_process'
import { promisify } from 'util'

const execFileAsync = promisify(execFile)

export interface GitChangedFile {
  path: string
  additions: number
  deletions: number
  status: string
}

export interface GitStatusResult {
  isRepo: boolean
  gitAvailable: boolean
  branch: string | null
  tracking: string | null
  ahead: number
  behind: number
  additions: number
  deletions: number
  changedFiles: number
  files: GitChangedFile[]
  error?: string
}

export type GitDiffScope = 'unstaged' | 'staged'

let gitAvailableCache: boolean | null = null

async function isGitAvailable(): Promise<boolean> {
  if (gitAvailableCache !== null) return gitAvailableCache
  try {
    await execFileAsync('git', ['--version'])
    gitAvailableCache = true
  } catch {
    gitAvailableCache = false
  }
  return gitAvailableCache
}

function isGitRepo(cwd: string): boolean {
  return existsSync(join(cwd, '.git'))
}

export async function getGitStatus(cwd: string): Promise<GitStatusResult> {
  const gitAvailable = await isGitAvailable()
  if (!gitAvailable) {
    return {
      isRepo: false,
      gitAvailable: false,
      branch: null,
      tracking: null,
      ahead: 0,
      behind: 0,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      files: [],
      error: 'Git 不可用'
    }
  }

  if (!isGitRepo(cwd)) {
    return {
      isRepo: false,
      gitAvailable: true,
      branch: null,
      tracking: null,
      ahead: 0,
      behind: 0,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      files: [],
      error: '不是 Git 仓库'
    }
  }

  try {
    const git = simpleGit(cwd)
    const status = await git.status()
    const diffSummary = await git.diffSummary(['HEAD'])

    const files: GitChangedFile[] = status.files.map((f) => ({
      path: f.path,
      additions: 0,
      deletions: 0,
      status: f.index !== ' ' && f.working_dir === ' ' ? 'staged' : 'unstaged'
    }))

    return {
      isRepo: true,
      gitAvailable: true,
      branch: status.current,
      tracking: status.tracking ?? null,
      ahead: status.ahead,
      behind: status.behind,
      additions: diffSummary.insertions,
      deletions: diffSummary.deletions,
      changedFiles: status.files.length,
      files
    }
  } catch (err) {
    return {
      isRepo: true,
      gitAvailable: true,
      branch: null,
      tracking: null,
      ahead: 0,
      behind: 0,
      additions: 0,
      deletions: 0,
      changedFiles: 0,
      files: [],
      error: err instanceof Error ? err.message : 'Git 状态获取失败'
    }
  }
}

export async function getChangedFiles(cwd: string, scope: GitDiffScope): Promise<GitChangedFile[]> {
  if (!isGitRepo(cwd)) return []

  const git = simpleGit(cwd)
  const status = await git.status()

  const paths =
    scope === 'staged'
      ? status.files.filter((f) => f.index !== ' ' && f.index !== '?').map((f) => f.path)
      : status.files
          .filter((f) => f.working_dir !== ' ' || f.index === '?')
          .map((f) => f.path)

  const unique = [...new Set(paths)]
  const result: GitChangedFile[] = []

  for (const filePath of unique) {
    try {
      const args = scope === 'staged' ? ['--cached', '--', filePath] : ['--', filePath]
      const summary = await git.diffSummary(args)
      const file = summary.files[0] as { insertions?: number; deletions?: number } | undefined
      result.push({
        path: filePath,
        additions: file?.insertions ?? 0,
        deletions: file?.deletions ?? 0,
        status: scope
      })
    } catch {
      result.push({ path: filePath, additions: 0, deletions: 0, status: scope })
    }
  }

  return result
}

export async function getGitDiff(
  cwd: string,
  options: { file: string; staged?: boolean }
): Promise<{ original: string; modified: string; unified: string }> {
  if (!isGitRepo(cwd)) {
    return { original: '', modified: '', unified: '' }
  }

  const git = simpleGit(cwd)
  const { file, staged = false } = options

  const unified = staged
    ? await git.diff(['--cached', '--', file])
    : await git.diff(['--', file])

  let original = ''
  try {
    original = staged
      ? await git.show([`HEAD:${file}`])
      : await git.show([`HEAD:${file}`])
  } catch {
    original = ''
  }

  let modified = original
  if (!staged) {
    try {
      const { readFile } = await import('fs/promises')
      modified = await readFile(join(cwd, file), 'utf-8')
    } catch {
      modified = original
    }
  } else {
    try {
      const stagedContent = await git.show([`:${file}`])
      modified = stagedContent
    } catch {
      modified = original
    }
  }

  if (!unified && original === modified) {
    return { original, modified, unified: '' }
  }

  return { original, modified, unified }
}

export async function stageFiles(cwd: string, paths: string[]): Promise<void> {
  if (!isGitRepo(cwd)) throw new Error('不是 Git 仓库')
  if (paths.length === 0) return
  const git = simpleGit(cwd)
  await git.add(paths)
}

export async function unstageFiles(cwd: string, paths: string[]): Promise<void> {
  if (!isGitRepo(cwd)) throw new Error('不是 Git 仓库')
  if (paths.length === 0) return
  const git = simpleGit(cwd)
  await git.reset(['HEAD', '--', ...paths])
}

export async function commitChanges(cwd: string, message: string): Promise<void> {
  if (!isGitRepo(cwd)) throw new Error('不是 Git 仓库')
  const trimmed = message.trim()
  if (!trimmed) throw new Error('提交消息不能为空')
  const git = simpleGit(cwd)
  await git.commit(trimmed)
}

export async function pushChanges(cwd: string): Promise<void> {
  if (!isGitRepo(cwd)) throw new Error('不是 Git 仓库')
  const git = simpleGit(cwd)
  try {
    await git.push()
  } catch (err) {
    const msg = err instanceof Error ? err.message : '推送失败'
    throw new Error(msg)
  }
}

export async function getStagedDiff(cwd: string): Promise<string> {
  if (!isGitRepo(cwd)) return ''
  const git = simpleGit(cwd)
  return git.diff(['--cached'])
}

export async function getRecentLog(cwd: string, limit = 10): Promise<string[]> {
  if (!isGitRepo(cwd)) return []
  const git = simpleGit(cwd)
  const log = await git.log({ maxCount: limit })
  return log.all.map((entry) => `${entry.hash.slice(0, 7)} ${entry.message}`)
}
