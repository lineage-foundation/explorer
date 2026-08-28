import config from "@explorer/config/eslint";

export default [...config, { ignores: ["next-env.d.ts", ".next/**"] }];
