import fs from 'fs';
import path from 'path';

const envVars = {
  GOOGLE_CLIENT_ID: process.env.GOOGLE_CLIENT_ID,
  GOOGLE_CLIENT_SECRET: process.env.GOOGLE_CLIENT_SECRET,
  APP_STAGE: process.env.APP_STAGE || 'production'
};

const content = `// Auto-generated during build - DO NOT EDIT
export const buildEnv = ${JSON.stringify(envVars, null, 2)};
`;

fs.writeFileSync(
  path.join(process.cwd(), 'src/main/build-env.js'),
  content
);

console.log('Build environment variables written to src/main/build-env.js');
console.log('Variables captured:', Object.keys(envVars).filter(key => envVars[key]));

