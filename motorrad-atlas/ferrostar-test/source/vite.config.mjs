import wasm from 'vite-plugin-wasm';
export default {base:'./',plugins:[wasm()],build:{target:'esnext',license:true}};
