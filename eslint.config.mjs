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
  {
    rules: {
      "react/no-unescaped-entities": "off",
      "react/jsx-no-comment-textnodes": "off",
    },
  },
];

export default eslintConfig;
