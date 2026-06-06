const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');

const arg = process.argv[2];
const filePath = arg ? path.resolve(arg) : path.resolve(__dirname, '..', '..', 'pnpm-workspace.yaml');

try {
  const content = fs.readFileSync(filePath, 'utf8');
  const doc = yaml.load(content);
  console.log(JSON.stringify(doc, null, 2));
} catch (e) {
  console.error('Error reading or parsing YAML:', e.message);
  process.exit(1);
}
