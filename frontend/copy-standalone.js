import { copyFileSync, mkdirSync } from 'fs';
import { join } from 'path';

const distDir = 'dist';
const sourceFile = 'index-standalone.html';
const destFile = join(distDir, 'index.html');

try {
  // Ensure dist directory exists
  mkdirSync(distDir, { recursive: true });
  
  // Copy the standalone file
  copyFileSync(sourceFile, destFile);
  console.log(`✓ Copied ${sourceFile} to ${destFile}`);
} catch (error) {
  console.error(`✗ Error copying file:`, error);
  process.exit(1);
}
