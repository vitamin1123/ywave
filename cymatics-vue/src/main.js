import { createApp } from 'vue';
import TDesign from 'tdesign-vue-next';
import App from './App.vue';
// import 'tdesign-vue-next/es/style/index.css'; // This might be needed if not auto-imported
import 'tdesign-vue-next/dist/tdesign.css'; // Use dist css for simplicity

import './style.css';

const app = createApp(App);
app.use(TDesign);
app.mount('#app');
