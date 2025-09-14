#!/usr/bin/env node

const fs = require('fs');
const path = require('path');

// Build configuration
const BUILD_DIR = 'dist';
const CACHE_BUST = Date.now();

console.log('🚀 Building Want PWA...');

// Create build directory
if (!fs.existsSync(BUILD_DIR)) {
    fs.mkdirSync(BUILD_DIR);
    console.log('📁 Created dist directory');
}

// Copy static assets
const assetsToCopy = [
    'assets',
    'vendor',
    'manifest.webmanifest',
    'favicon-16.png',
    'favicon-32.png',
    'sw.js'
];

assetsToCopy.forEach(asset => {
    if (fs.existsSync(asset)) {
        if (fs.statSync(asset).isDirectory()) {
            // Copy directory
            copyDir(asset, path.join(BUILD_DIR, asset));
        } else {
            // Copy file
            fs.copyFileSync(asset, path.join(BUILD_DIR, asset));
        }
        console.log(`📋 Copied ${asset}`);
    }
});

// Process HTML files
const htmlFiles = ['index.html', 'add.html'];
htmlFiles.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        
        // Update cache-busting parameters - avoid double parameters
        content = content.replace(/v=\d+/g, `v=${CACHE_BUST}`);
        content = content.replace(/cb=\d+/g, `cb=${CACHE_BUST}`);
        
        // Add cache-busting to CSS and JS files only if they don't already have it
        content = content.replace(/styles\.css(?!\?v=)/g, `styles.css?v=${CACHE_BUST}`);
        content = content.replace(/app\.js(?!\?v=)/g, `app.js?v=${CACHE_BUST}`);
        content = content.replace(/db\.js(?!\?v=)/g, `db.js?v=${CACHE_BUST}`);
        
        fs.writeFileSync(path.join(BUILD_DIR, file), content);
        console.log(`📄 Processed ${file}`);
    }
});

// Copy and process JS files
const jsFiles = ['app.js', 'db.js', 'add.js', 'itemsApi.js', 'supabaseClient.js', 'auth.js'];
jsFiles.forEach(file => {
    if (fs.existsSync(file)) {
        let content = fs.readFileSync(file, 'utf8');
        
        // Only remove comments, preserve code structure and URLs
        content = content
            .replace(/\/\*[\s\S]*?\*\//g, '') // Remove block comments
            .replace(/\/\/(?![^\/]*\/).*$/gm, '') // Remove line comments (but not URLs with //)
            .trim();
        
        fs.writeFileSync(path.join(BUILD_DIR, file), content);
        console.log(`⚡ Processed ${file} (comments removed)`);
    }
});

// Copy and process CSS
if (fs.existsSync('styles.css')) {
    let css = fs.readFileSync('styles.css', 'utf8');
    
    // Only remove comments, preserve CSS structure
    css = css
        .replace(/\/\*[\s\S]*?\*\//g, '') // Remove comments
        .trim();
    
    fs.writeFileSync(path.join(BUILD_DIR, 'styles.css'), css);
    console.log('🎨 Processed styles.css (comments removed)');
}

// Copy src directory
if (fs.existsSync('src')) {
    copyDir('src', path.join(BUILD_DIR, 'src'));
    console.log('📦 Copied src directory');
}

// Create build info
const buildInfo = {
    timestamp: new Date().toISOString(),
    cacheBust: CACHE_BUST,
    version: '1.0.0'
};

fs.writeFileSync(path.join(BUILD_DIR, 'build-info.json'), JSON.stringify(buildInfo, null, 2));

console.log('\n✅ Build completed successfully!');
console.log(`📁 Output directory: ${BUILD_DIR}`);
console.log(`🕒 Cache bust: ${CACHE_BUST}`);
console.log('\n🚀 Ready for deployment!');

// Helper function to copy directories recursively
function copyDir(src, dest) {
    if (!fs.existsSync(dest)) {
        fs.mkdirSync(dest, { recursive: true });
    }
    
    const entries = fs.readdirSync(src, { withFileTypes: true });
    
    for (const entry of entries) {
        const srcPath = path.join(src, entry.name);
        const destPath = path.join(dest, entry.name);
        
        if (entry.isDirectory()) {
            copyDir(srcPath, destPath);
        } else {
            fs.copyFileSync(srcPath, destPath);
        }
    }
}
