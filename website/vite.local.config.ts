import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import {fileURLToPath} from 'node:url';
const root=fileURLToPath(new URL('.',import.meta.url));
export default defineConfig({base:process.env.STUDY_BASE_PATH||'/',root:root+'local',publicDir:root+'public',resolve:{alias:{'@':root}},plugins:[react()],css:{postcss:root},build:{outDir:root+'local-dist',emptyOutDir:true}});
