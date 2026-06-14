const { execFile, spawn } = require('child_process');
const util = require('util');
const fs = require('fs');

const execFileAsync = util.promisify(execFile);

// Spawn a command and stream its stdout to a file. Used in place of shell
// redirection (`cmd ... > out.sql`) so we can pass args as an array and avoid
// shell interpolation entirely. Resolves on clean exit; rejects on non-zero
// exit or error, including captured stderr in the error message.
function spawnToFile(cmd, args, outPath, opts = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, opts);
    const out = fs.createWriteStream(outPath);
    let stderr = '';
    let settled = false;

    const finish = (err) => {
      if (settled) return;
      settled = true;
      out.end(() => err ? reject(err) : resolve({ stderr }));
    };

    child.stderr.on('data', d => { stderr += d.toString(); });
    child.stdout.pipe(out);
    out.on('error', finish);
    child.on('error', finish);
    child.on('close', code => {
      if (code === 0) finish();
      else finish(new Error(`${cmd} exited with code ${code}: ${stderr.trim()}`));
    });
  });
}

module.exports = { execFileAsync, spawnToFile };
