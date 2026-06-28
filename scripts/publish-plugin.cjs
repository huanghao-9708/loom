const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Usage: node scripts/publish-plugin.cjs plugins-src/com.loom.music

const pluginDir = process.argv[2];
if (!pluginDir) {
    console.error('Usage: node publish-plugin.cjs <path-to-plugin-dir>');
    process.exit(1);
}

const fullPluginDir = path.resolve(pluginDir);
const manifestPath = path.join(fullPluginDir, 'manifest.json');
const registryPath = path.resolve(__dirname, '../registry/plugins.json');

// 1. Read and bump manifest.json
if (!fs.existsSync(manifestPath)) {
    console.error(`Manifest not found: ${manifestPath}`);
    process.exit(1);
}
let manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
let versionParts = manifest.version.split('.').map(Number);
versionParts[2] += 1; // Bump patch version
manifest.version = versionParts.join('.');
fs.writeFileSync(manifestPath, JSON.stringify(manifest, null, 2), 'utf8');
console.log(`✅ Bumped ${manifest.id} version to ${manifest.version}`);

// 2. Pack the plugin using existing pack.cjs
console.log('📦 Packing plugin...');
execSync(`node ${path.join(__dirname, 'pack.cjs')} ${pluginDir}`, { stdio: 'inherit' });

// 3. Calculate SHA256 of the generated .loom file
const outputName = `${manifest.id}.loom`;
const outputPath = path.resolve(process.cwd(), outputName);
const fileBuffer = fs.readFileSync(outputPath);
const hashSum = crypto.createHash('sha256');
hashSum.update(fileBuffer);
const hex = hashSum.digest('hex');
console.log(`🔐 SHA256: ${hex}`);

// 4. Update registry/plugins.json
if (!fs.existsSync(registryPath)) {
    console.error(`Registry not found: ${registryPath}`);
    process.exit(1);
}
let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
let pluginEntry = registry.plugins.find(p => p.id === manifest.id);

if (pluginEntry) {
    pluginEntry.version = manifest.version;
    // Extract shortname from ID (e.g. "music" from "com.loom.music")
    const shortName = manifest.id.split('.').pop();
    // Replace vX.Y.Z in downloadUrl with new version
    pluginEntry.downloadUrl = pluginEntry.downloadUrl.replace(/v\d+\.\d+\.\d+/, `v${manifest.version}`);
    pluginEntry.sha256 = hex;
    console.log(`📝 Updated registry entry for ${manifest.id}`);
} else {
    console.log(`⚠️ Plugin ${manifest.id} not found in registry. Skip updating registry.`);
}

registry.updatedAt = new Date().toISOString();
fs.writeFileSync(registryPath, JSON.stringify(registry, null, 2), 'utf8');
console.log('✨ Updated registry/plugins.json');
console.log(`\n🎉 Success! Next steps:`);
console.log(`1. Create a GitHub Release with tag: plugin-${manifest.id.split('.').pop()}-v${manifest.version}`);
console.log(`2. Upload ${outputName} to the Release.`);
console.log(`3. Commit and push the updated manifest.json and plugins.json.`);
