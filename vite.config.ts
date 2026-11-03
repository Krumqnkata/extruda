// SPDX-License-Identifier: AGPL-3.0-or-later
import { defineConfig } from 'vitest/config';

export default defineConfig({
  base: '/extruda/',
  optimizeDeps: { exclude: ['manifold-3d'] },
  build: { target: 'es2022', chunkSizeWarningLimit: 1500 },
  test: { environment: 'node', testTimeout: 30000 },
});
