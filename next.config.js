/** @type {import('next').NextConfig} */
const nextConfig = {
  // Prevent server-only packages from being bundled by webpack (Next.js 14)
  experimental: {
    serverComponentsExternalPackages: [
      '@imgly/background-removal-node',
      'onnxruntime-node',
    ],
  },
  webpack: (config) => {
    // Handle native .node binaries (onnxruntime-node ships platform-specific addons)
    config.module.rules.push({
      test: /\.node$/,
      use: 'node-loader',
    });

    // Mark onnxruntime-node and .node files as externals so webpack doesn't bundle them
    const existingExternals = Array.isArray(config.externals) ? config.externals : [];
    config.externals = [
      ...existingExternals,
      function ({ request }, callback) {
        if (
          request &&
          (request.includes('onnxruntime-node') || request.endsWith('.node'))
        ) {
          return callback(null, 'commonjs ' + request);
        }
        callback();
      },
    ];

    return config;
  },
};

module.exports = nextConfig;
