/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  // Standalone output is required for desktop packaging (Tauri sidecar
  // bundles `.next/standalone/server.js`).
  output: "standalone",
  experimental: {
    typedRoutes: true,
  },
  // Native + dynamic-require packages must not be bundled by webpack.
  serverExternalPackages: [
    "@libsql/client",
    "libsql",
    "@libsql/isomorphic-fetch",
    "@libsql/isomorphic-ws",
    "execa",
    "@mariozechner/pi-ai",
    "@mariozechner/pi-agent-core",
  ],
  transpilePackages: [
    "@wrackspurt/core",
    "@wrackspurt/agent",
    "@wrackspurt/db",
  ],
  webpack: (config, { isServer, webpack }) => {
    // Allow TS source imports to use the .js extension (NodeNext-style)
    config.resolve.extensionAlias = {
      ".js": [".ts", ".tsx", ".js"],
      ".mjs": [".mts", ".mjs"],
      ".cjs": [".cts", ".cjs"],
    };

    // libsql's optional native loader does dynamic requires of sibling
    // packages and inadvertently pulls in their README.md files. Ignore
    // markdown imports from node_modules to keep webpack happy.
    config.plugins.push(new webpack.IgnorePlugin({ resourceRegExp: /\.md$/ }));

    if (isServer) {
      // Native-binding packages must stay external on the server.
      config.externals = [
        ...(Array.isArray(config.externals) ? config.externals : [config.externals].filter(Boolean)),
        "libsql",
        "@libsql/client",
      ];
    }

    return config;
  },
};

export default nextConfig;
