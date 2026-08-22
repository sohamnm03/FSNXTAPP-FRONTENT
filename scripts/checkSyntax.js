const fs = require('fs');
const path = require('path');
const parser = require('@babel/parser');

const projectRoot = path.resolve(__dirname, '..');
const ignoredDirectories = new Set(['node_modules', '.git', '.expo']);
const executableExtensions = new Set(['.js', '.jsx']);

function collectJavaScriptFiles(directory) {
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const entryPath = path.join(directory, entry.name);
    if (entry.isDirectory()) {
      return ignoredDirectories.has(entry.name) ? [] : collectJavaScriptFiles(entryPath);
    }
    return executableExtensions.has(path.extname(entry.name)) ? [entryPath] : [];
  });
}

const files = collectJavaScriptFiles(projectRoot);
const failures = [];

for (const file of files) {
  try {
    parser.parse(fs.readFileSync(file, 'utf8'), {
      sourceType: 'unambiguous',
      plugins: ['jsx'],
    });
  } catch (error) {
    failures.push(`${path.relative(projectRoot, file)}: ${error.message}`);
  }
}

if (failures.length > 0) {
  console.error(failures.join('\n'));
  process.exitCode = 1;
} else {
  process.stdout.write(`Syntax check passed for ${files.length} JavaScript files.\n`);
}
