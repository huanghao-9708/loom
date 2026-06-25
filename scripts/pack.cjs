const fs = require('fs');
const path = require('path');
const AdmZip = require('adm-zip');

// node scripts/pack.cjs public/plugins/com.loom.music

const sourceDir = process.argv[2];

if (!sourceDir) {
    console.error('Usage: node pack.cjs <path-to-plugin-dir>');
    process.exit(1);
}

const pluginDir = path.resolve(sourceDir);
if (!fs.existsSync(pluginDir)) {
    console.error(`Directory not found: ${pluginDir}`);
    process.exit(1);
}

const manifestPath = path.join(pluginDir, 'manifest.json');
if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
}

let manifest;
try {
    manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
} catch (e) {
    console.error('Failed to parse manifest.json');
    process.exit(1);
}

const pluginId = manifest.id;
if (!pluginId) {
    console.error('manifest.json must contain an "id" field');
    process.exit(1);
}

const outputName = `${pluginId}.loom`;
const outputPath = path.resolve(process.cwd(), outputName);

try {
    const zip = new AdmZip();
    zip.addLocalFolder(pluginDir);
    zip.writeZip(outputPath);
    console.log(`Plugin packed successfully: ${outputName}`);
} catch (e) {
    console.error(`Failed to pack plugin: ${e.message}`);
    process.exit(1);
}
