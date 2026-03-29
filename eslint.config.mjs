import nextConfig from "eslint-config-next";

const eslintConfig = [
  ...nextConfig,
  {
    ignores: [
      ".next/**",
      "node_modules/**",
      "packages/**",
      "services/**",
      "sdk/**",
      "scripts/**",
      "supabase/**",
      "tests/**",
      "public/**",
    ],
  },
];

export default eslintConfig;
