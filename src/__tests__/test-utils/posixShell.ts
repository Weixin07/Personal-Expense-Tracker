import { execFileSync } from 'child_process';
import { join } from 'path';

export const posixShell = (): string => {
  if (process.platform !== 'win32') {
    return 'sh';
  }
  if (process.env.CLAUDE_CODE_GIT_BASH_PATH) {
    return process.env.CLAUDE_CODE_GIT_BASH_PATH;
  }
  const gitCore = execFileSync('git', ['--exec-path'], {
    encoding: 'utf8',
  }).trim();
  return join(gitCore, '..', '..', '..', 'bin', 'bash.exe');
};
