/** @type {import('next').NextConfig} */
const nextConfig = {
  // native / large server-only packages: load them from node_modules at runtime
  serverExternalPackages: ['@huggingface/transformers', 'onnxruntime-node', 'pg', 'mongodb'],
  poweredByHeader: false,
  async headers() {
    return [{
      source: '/(.*)',
      headers: [
        { key: 'X-Content-Type-Options', value: 'nosniff' },
        { key: 'X-Frame-Options', value: 'DENY' },
        { key: 'Referrer-Policy', value: 'strict-origin-when-cross-origin' },
      ],
    }];
  },
};

export default nextConfig;
