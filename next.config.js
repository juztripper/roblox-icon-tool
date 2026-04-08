/** @type {import('next').NextConfig} */
const nextConfig = {
  webpack: (config) => {
    // Prevent the Node.js ONNX runtime from being bundled for the browser.
    // @huggingface/transformers uses onnxruntime-web for browser inference instead.
    config.resolve.alias = {
      ...config.resolve.alias,
      'sharp$': false,
      'onnxruntime-node$': false,
    };
    return config;
  },
};

module.exports = nextConfig;
