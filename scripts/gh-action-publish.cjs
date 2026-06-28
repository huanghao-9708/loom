const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execSync } = require('child_process');

// Usage: node scripts/gh-action-publish.cjs plugins-src/com.loom.music [bump-type]

const pluginDir = process.argv[2];
const bumpType = process.argv[3] || 'patch'; // patch, minor, major

if (!pluginDir) {
    console.error('Usage: node gh-action-publish.cjs <path-to-plugin-dir> [bump-type]');
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

if (bumpType === 'major') {
    versionParts[0] += 1;
    versionParts[1] = 0;
    versionParts[2] = 0;
} else if (bumpType === 'minor') {
    versionParts[1] += 1;
    versionParts[2] = 0;
} else {
    versionParts[2] += 1;
}

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
if (fs.existsSync(registryPath)) {
    let registry = JSON.parse(fs.readFileSync(registryPath, 'utf8'));
    let pluginEntry = registry.plugins.find(p => p.id === manifest.id);

    if (pluginEntry) {
        pluginEntry.version = manifest.version;
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
} else {
    console.error(`Registry not found at ${registryPath}`);
    process.exit(1);
}

// 5. Write outputs for GitHub Actions
const shortName = manifest.id.split('.').pop();
if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `version=${manifest.version}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `short_name=${shortName}\n`);
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `output_file=${outputName}\n`);
    console.log(`🚀 Exported variables to GITHUB_OUTPUT`);
}
