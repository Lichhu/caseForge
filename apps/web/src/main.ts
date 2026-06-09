import { createApp } from 'vue';
import { createPinia } from 'pinia';
import Antd, { ConfigProvider } from 'ant-design-vue';
import zhCN from 'ant-design-vue/locale/zh_CN';
import 'ant-design-vue/dist/reset.css';
import './styles/app.less';
import App from './App.vue';
import router from './router';
import { configureAppMessage } from './utils/globalFeedback';
import { initUserContext } from './utils/userContext';

ConfigProvider.config({
  locale: zhCN,
});

initUserContext();
configureAppMessage();

createApp(App).use(createPinia()).use(router).use(Antd).mount('#app');
